import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Page } from 'playwright-core'

import {
  UnexpectedFinalHealthInspectionError,
  ensurePageHealth,
  isPageInspectionRaceError,
  runFinalHealthInspection,
} from '../../src/core/analyzer/page-health.js'

const pagePreparer = vi.hoisted(() => ({
  inspectDocumentObstructionsInBrowser: vi.fn(),
  preparePageForExtraction: vi.fn(),
  resetPageScroll: vi.fn(),
}))

vi.mock('../../src/core/analyzer/page-preparer.js', () => pagePreparer)

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('page health recovery', () => {
  it.each([
    { finalUrl: 'https://example.test/other', strict: true, unexpected: true },
    { finalUrl: 'https://example.test/product?view=other', strict: true, unexpected: true },
    { finalUrl: 'https://example.test/product#details', strict: true, unexpected: false },
    { finalUrl: 'https://example.test/other', strict: false, unexpected: false },
  ])(
    'checks capture identity after inspection: $finalUrl, strict=$strict',
    async ({ finalUrl, strict, unexpected }) => {
      const originalUrl = 'https://example.test/product'
      let currentUrl = originalUrl
      const page = {
        url: () => currentUrl,
        evaluate: vi.fn().mockImplementation(async () => {
          currentUrl = finalUrl
          return {
            viewportWidth: 1440,
            viewportHeight: 900,
            contentWidth: 1440,
            contentHeight: 900,
            blockingOverlayAreaRatio: 0,
            partialOverlayAreaRatio: 0,
            overlayAreaRatio: 0,
            mutationCount: 0,
            mainContentEmpty: false,
            skeletonRatio: 0,
            fontsReady: true,
            captcha: false,
          }
        }),
      } as unknown as Page
      const result = await ensurePageHealth(page, { expectedUrl: originalUrl, requireSameDocument: strict })

      expect(result.issues.some((issue) => issue.code === 'unexpected-navigation')).toBe(unexpected)
      expect(result.evidenceEligible).toBe(!unexpected)
      expect(result.recovered).toBe(false)
      expect(pagePreparer.preparePageForExtraction).not.toHaveBeenCalled()
    },
  )

  it.each([401, 403, 429, 502])(
    'does not recover an empty HTTP %s error as a transient application shell',
    async (status) => {
      const page = {
        url: () => 'https://example.test/',
        evaluate: vi.fn().mockResolvedValue({
          viewportWidth: 1440,
          viewportHeight: 900,
          contentWidth: 1440,
          contentHeight: 900,
          overlayAreaRatio: 0,
          blockingOverlayAreaRatio: 0,
          partialOverlayAreaRatio: 0,
          mutationCount: 0,
          mainContentEmpty: true,
          skeletonRatio: 0,
          fontsReady: true,
          captcha: false,
        }),
        reload: vi.fn(),
      } as unknown as Page
      const result = await ensurePageHealth(page, { expectedUrl: page.url(), responseStatus: status })

      expect(result.status).toBe('unusable')
      expect(result.recovered).toBe(false)
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'error-page', detail: String(status) })]),
      )
      expect(pagePreparer.preparePageForExtraction).not.toHaveBeenCalled()
      expect(page.reload).not.toHaveBeenCalled()
    },
  )

  it('distinguishes browser lifecycle races from unexpected inspection defects', () => {
    expect(
      isPageInspectionRaceError(new Error('Execution context was destroyed, most likely because of a navigation')),
    ).toBe(true)
    expect(isPageInspectionRaceError(new Error('Target page, context or browser has been closed'))).toBe(true)
    expect(isPageInspectionRaceError(new Error('Frame was detached'))).toBe(true)
    expect(isPageInspectionRaceError(new Error('sentinel internal health inspection defect'))).toBe(false)
    expect(isPageInspectionRaceError(new TypeError('Cannot read properties of undefined'))).toBe(false)
    expect(isPageInspectionRaceError('Execution context was destroyed')).toBe(false)
  })

  it.each(['entry', 'subpage', 'adaptive'] as const)(
    'discards only lifecycle races at the %s final-health boundary',
    async (boundary) => {
      const race = new Error('Execution context was destroyed, most likely because of a navigation')
      await expect(runFinalHealthInspection(boundary, async () => Promise.reject(race))).resolves.toEqual({
        ok: false,
        raceError: race,
      })

      const sentinel = new Error(`${boundary} sentinel internal health defect`)
      await expect(runFinalHealthInspection(boundary, async () => Promise.reject(sentinel))).rejects.toMatchObject({
        name: 'UnexpectedFinalHealthInspectionError',
        boundary,
        originalError: sentinel,
      } satisfies Partial<UnexpectedFinalHealthInspectionError>)
    },
  )

  it('preserves an expected adaptive deadline instead of wrapping it as an implementation defect', async () => {
    const deadline = new Error('adaptive-mobile-budget-exceeded')
    await expect(
      runFinalHealthInspection(
        'adaptive',
        async () => Promise.reject(deadline),
        (error) => error instanceof Error && error.message === 'adaptive-mobile-budget-exceeded',
      ),
    ).rejects.toBe(deadline)
  })

  it('propagates an unexpected exception thrown by real recovery preparation', async () => {
    const sentinel = new Error('sentinel recovery implementation defect')
    pagePreparer.resetPageScroll.mockResolvedValue(undefined)
    pagePreparer.preparePageForExtraction.mockRejectedValue(sentinel)
    const page = {
      url: () => 'https://example.com/',
      evaluate: vi.fn().mockResolvedValue({
        viewportWidth: 1440,
        viewportHeight: 900,
        contentWidth: 1440,
        contentHeight: 900,
        overlayAreaRatio: 0,
        blockingOverlayAreaRatio: 0,
        partialOverlayAreaRatio: 0,
        mutationCount: 0,
        mainContentEmpty: false,
        skeletonRatio: 0,
        fontsReady: false,
        captcha: false,
      }),
      isClosed: () => false,
      close: vi.fn(),
    } as unknown as Page

    await expect(ensurePageHealth(page, { expectedUrl: 'https://example.com/' })).rejects.toBe(sentinel)
  })

  it('marks a completed remediation as recovered even when one warning replaces another', async () => {
    pagePreparer.resetPageScroll.mockResolvedValue(undefined)
    pagePreparer.preparePageForExtraction.mockResolvedValue({ issues: [] })
    const healthFacts = (fontsReady: boolean) => ({
      viewportWidth: 1440,
      viewportHeight: 900,
      contentWidth: 1440,
      contentHeight: 900,
      mutationCount: 0,
      mainContentEmpty: false,
      skeletonRatio: 0,
      fontsReady,
      captcha: false,
    })
    const obstructionFacts = (partialOverlayAreaRatio: number) => ({
      dismissedObstructions: 0,
      overlayAreaRatio: partialOverlayAreaRatio,
      blockingOverlayAreaRatio: 0,
      partialOverlayAreaRatio,
    })
    const page = {
      url: () => 'https://example.com/',
      evaluate: vi
        .fn()
        .mockResolvedValueOnce(obstructionFacts(0))
        .mockResolvedValueOnce(healthFacts(false))
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(obstructionFacts(0.1))
        .mockResolvedValueOnce(healthFacts(true))
        .mockResolvedValueOnce({}),
      isClosed: () => false,
      close: vi.fn(),
    } as unknown as Page

    const result = await ensurePageHealth(page, { expectedUrl: 'https://example.com/' })

    expect(result.recovered).toBe(true)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].code).toBe('partial-overlay')
  })

  it('closes and fully settles a timed-out recovery before returning control', async () => {
    vi.useFakeTimers()
    pagePreparer.resetPageScroll.mockResolvedValue(undefined)
    pagePreparer.preparePageForExtraction.mockImplementation(
      (_page: Page, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
        }),
    )

    let closed = false
    let finishClose: (() => void) | undefined
    const closePromise = new Promise<void>((resolve) => {
      finishClose = () => {
        closed = true
        resolve()
      }
    })
    const page = {
      url: () => 'https://example.com/',
      evaluate: vi.fn().mockResolvedValue({
        viewportWidth: 1440,
        viewportHeight: 900,
        contentWidth: 1440,
        contentHeight: 900,
        overlayAreaRatio: 0,
        mutationCount: 0,
        mainContentEmpty: true,
        skeletonRatio: 0,
        fontsReady: true,
        authWall: false,
        captcha: false,
      }),
      isClosed: () => closed,
      close: vi.fn(() => closePromise),
    } as unknown as Page

    let returned = false
    const resultPromise = ensurePageHealth(page, { expectedUrl: 'https://example.com/' }).then((result) => {
      returned = true
      return result
    })

    await vi.advanceTimersByTimeAsync(14_000)
    expect(page.close).toHaveBeenCalledOnce()
    expect(returned).toBe(false)

    finishClose?.()
    const result = await resultPromise
    expect(result.status).toBe('unusable')
    expect(result.evidenceEligible).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('health-recovery-timeout')
  })
})
