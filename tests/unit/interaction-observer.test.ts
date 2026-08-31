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
  it('treats an execution-context replacement during state inspection as unavailable evidence', async () => {
    const page = {
      evaluate: vi.fn().mockRejectedValue(new Error('Execution context was destroyed')),
      isClosed: () => false,
      url: () => 'https://example.com/',
    } as unknown as Page

    await expect(observeSafeInteractions(page, interactionSnapshot(), 1, 2_000)).resolves.toEqual([])
  })
})
