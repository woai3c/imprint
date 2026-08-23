import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Page } from 'playwright-core'

import { ensurePageHealth } from '../../src/core/analyzer/page-health.js'

const pagePreparer = vi.hoisted(() => ({
  preparePageForExtraction: vi.fn(),
  resetPageScroll: vi.fn(),
}))

vi.mock('../../src/core/analyzer/page-preparer.js', () => pagePreparer)

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('page health recovery', () => {
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
