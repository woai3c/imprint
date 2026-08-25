import { describe, expect, it } from 'vitest'

import { createComparisonVisualPairs } from '../../src/main/comparison-visuals.js'
import type { PageScreenshotData } from '../../src/shared/ipc-contract.js'

function screenshot(overrides: Partial<PageScreenshotData> = {}): PageScreenshotData {
  return {
    url: 'https://example.com/product',
    path: '/screenshots/capture.png',
    viewport: 'desktop',
    width: 1440,
    height: 1200,
    valid: true,
    ...overrides,
  }
}

describe('comparison visual pairing', () => {
  it('pairs a unique readable screenshot by normalized route and viewport', () => {
    const pairs = createComparisonVisualPairs(
      [screenshot({ path: '/reference.png', url: 'https://example.com/product?private=removed' })],
      [screenshot({ path: '/target.png', url: 'https://example.com/product#section', height: 900 })],
      { isReadable: () => true },
    )

    expect(pairs).toEqual([
      {
        url: 'https://example.com/product',
        viewport: 'desktop',
        reference: { path: '/reference.png', width: 1440, height: 1200 },
        target: { path: '/target.png', width: 1440, height: 900 },
      },
    ])
  })

  it('does not guess across routes, viewports, missing files, or invalid captures', () => {
    const reference = [
      screenshot({ path: '/desktop.png' }),
      screenshot({ path: '/mobile.png', viewport: 'mobile' }),
      screenshot({ path: '/invalid.png', viewport: 'tablet', valid: false }),
    ]
    const target = [
      screenshot({ path: '/other-route.png', url: 'https://example.com/other' }),
      screenshot({ path: '/missing-mobile.png', viewport: 'mobile' }),
      screenshot({ path: '/target-tablet.png', viewport: 'tablet' }),
    ]

    expect(
      createComparisonVisualPairs(reference, target, { isReadable: (path) => path !== '/missing-mobile.png' }),
    ).toEqual([])
  })

  it('excludes duplicate normalized page and viewport captures instead of pairing by order', () => {
    const reference = [screenshot({ path: '/reference-a.png' }), screenshot({ path: '/reference-b.png' })]
    const target = [screenshot({ path: '/target.png' })]

    expect(createComparisonVisualPairs(reference, target, { isReadable: () => true })).toEqual([])
  })

  it('hides byte-identical screenshots because they contain no visual change to inspect', () => {
    const reference = [screenshot({ path: '/reference.png' })]
    const target = [screenshot({ path: '/target.png' })]

    expect(
      createComparisonVisualPairs(reference, target, {
        isReadable: () => true,
        readContentHash: () => 'same-content',
      }),
    ).toEqual([])
  })

  it('limits visual pairs to the page keys that participated in a partial comparison', () => {
    const reference = [
      screenshot({ path: '/reference-product.png' }),
      screenshot({ path: '/reference-blocked.png', url: 'https://example.com/blocked' }),
    ]
    const target = [
      screenshot({ path: '/target-product.png' }),
      screenshot({ path: '/target-blocked.png', url: 'https://example.com/blocked' }),
    ]

    const pairs = createComparisonVisualPairs(reference, target, {
      allowedPageKeys: ['https://example.com/product::desktop'],
      isReadable: () => true,
      readContentHash: (path) => path,
    })

    expect(pairs.map((pair) => `${pair.url}::${pair.viewport}`)).toEqual(['https://example.com/product::desktop'])
  })
})
