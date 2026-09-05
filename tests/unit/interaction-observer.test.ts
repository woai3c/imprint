import { describe, expect, it, vi } from 'vitest'

import type { Page } from 'playwright-core'

import { observeSafeInteractions } from '../../src/core/design-evidence/interaction-observer.js'
import type { PageEvidenceSnapshot } from '../../src/core/design-evidence/page-extractor.js'

function interactionSnapshot(): PageEvidenceSnapshot {
  return {
    url: 'https://example.com/',
    viewport: 'desktop',
    role: 'unknown',
    viewportWidth: 1440,
    viewportHeight: 900,
    width: 1440,
    height: 900,
    contentWidth: 1440,
    horizontalOverflow: false,
    horizontalOverflowSources: [],
    sections: [],
    components: [],
    layoutNodes: [],
    mediaLayers: [],
    interactionCandidates: [
      {
        key: 'disclosure:#details',
        sectionKey: 'main',
        locator: '#details',
        kind: 'disclosure',
        driver: 'click',
      },
    ],
    ariaStates: [],
  }
}

describe('safe interaction observation', () => {
  it.each(['interrupted', 'wrong-document'])(
    'retries the exact observed URL when document recovery is %s',
    async (failure) => {
      const observedUrl = 'https://example.com/'
      let currentUrl = observedUrl
      const goto = vi
        .fn()
        .mockImplementationOnce(async () => {
          currentUrl = 'https://example.com/delayed-navigation'
          if (failure === 'interrupted') throw new Error('Navigation interrupted by another navigation')
          return null
        })
        .mockImplementationOnce(async () => {
          currentUrl = observedUrl
          return null
        })
      const page = {
        evaluate: vi
          .fn()
          .mockResolvedValueOnce({ ariaExpanded: 'false' })
          .mockResolvedValueOnce({ width: 1440, height: 900, url: observedUrl })
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(null),
        isClosed: () => false,
        url: () => currentUrl,
        locator: () => ({ count: async () => 1, click: async () => {} }),
        on: vi.fn(),
        off: vi.fn(),
        route: vi.fn().mockResolvedValue(undefined),
        unroute: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        mouse: { move: vi.fn().mockResolvedValue(undefined) },
        goto,
        reload: vi.fn(),
      } as unknown as Page

      expect(await observeSafeInteractions(page, interactionSnapshot(), 1, 3_000)).toEqual([])
      expect(goto).toHaveBeenCalledTimes(2)
      for (const [url, options] of goto.mock.calls) {
        expect(url).toBe(observedUrl)
        expect(options.timeout).toBeLessThanOrEqual(3_000)
      }
      expect(page.reload).not.toHaveBeenCalled()
      expect(page.url()).toBe(observedUrl)
    },
  )

  it('treats an execution-context replacement during state inspection as unavailable evidence', async () => {
    const page = {
      evaluate: vi.fn().mockRejectedValue(new Error('Execution context was destroyed')),
      isClosed: () => false,
      url: () => 'https://example.com/',
    } as unknown as Page

    await expect(observeSafeInteractions(page, interactionSnapshot(), 1, 2_000)).resolves.toEqual([])
  })

  it('treats a page closure between state and geometry inspection as unavailable evidence', async () => {
    const page = {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({ ariaExpanded: 'false' })
        .mockRejectedValueOnce(new Error('Target page, context or browser has been closed')),
      isClosed: () => false,
      url: () => 'https://example.com/',
    } as unknown as Page

    await expect(observeSafeInteractions(page, interactionSnapshot(), 1, 2_000)).resolves.toEqual([])
  })
})
