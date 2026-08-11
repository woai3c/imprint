import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import { buildDesignEvidence } from '../../src/core/design-evidence/evidence-builder.js'
import { computeInteractionStateMetrics } from '../../src/core/design-evidence/interaction-metrics.js'
import type { PageEvidenceSnapshot } from '../../src/core/design-evidence/page-extractor.js'

const tokens: DesignToken = {
  colors: { background: '#ffffff', foreground: '#111827' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['1rem'],
    fontWeights: ['400'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: [],
  radii: [],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

function createSnapshot(url: string): PageEvidenceSnapshot {
  return {
    url,
    viewport: 'desktop',
    role: 'landing',
    viewportWidth: 1440,
    viewportHeight: 900,
    width: 1440,
    height: 1600,
    contentWidth: 1440,
    horizontalOverflow: false,
    horizontalOverflowSources: [],
    sections: [
      {
        key: 'main:0',
        order: 0,
        role: 'content',
        rect: { x: 0, y: 0, width: 1, height: 1 },
        layoutMode: 'flow',
        styles: {},
      },
    ],
    components: [],
    layoutNodes: [],
    mediaLayers: [],
    interactionCandidates: [],
    ariaStates: [],
  }
}

describe('Interaction state metrics', () => {
  it('keeps deduped patterns and passive observations as separate metrics', () => {
    const interactionStyles = {
      hover: [{ color: '#2563eb' }, { 'background-color': '#eff6ff' }],
      focus: [{ 'outline-color': '#2563eb' }],
      active: [],
      disabled: [{ opacity: '0.5' }],
    }
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-metrics',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 2,
      tokens,
      featureTags: [],
      interactionStyles,
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\a.png', viewport: 'desktop' },
          snapshot: createSnapshot('https://example.com/'),
          interactionStyles,
        },
        {
          screenshot: { url: 'https://example.com/about', path: 'C:\\evidence\\b.png', viewport: 'desktop' },
          snapshot: createSnapshot('https://example.com/about'),
          interactionStyles,
        },
      ],
    })

    const metrics = computeInteractionStateMetrics(evidence)
    // The deduped patterns are counted once from stylesheet extraction ...
    expect(metrics.dedupedStatePatterns).toBe(4)
    // ... while each page records its own passive observations for the same patterns.
    expect(metrics.passiveObservations).toBe(8)
    expect(metrics.safeActiveObservations).toBe(0)
    expect(metrics.skippedCandidates).toBe(0)
  })

  it('counts safe-active observations and skipped candidates from coverage', () => {
    const snapshot = createSnapshot('https://example.com/')
    snapshot.interactionCandidates = [
      { key: 'tab:0', sectionKey: 'main:0', locator: '[role="tab"]', kind: 'tab', driver: 'click' },
    ]
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-metrics-active',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\c.png', viewport: 'desktop' },
          snapshot,
          interactionObservations: [
            {
              key: 'tab:0',
              sectionKey: 'main:0',
              targetKey: 'tab:0',
              driver: 'click',
              triggerKind: 'tab',
              before: { color: 'rgb(0, 0, 0)' },
              after: { color: 'rgb(37, 99, 235)' },
              changedProperties: ['color'],
            },
          ],
        },
      ],
    })

    const metrics = computeInteractionStateMetrics(evidence)
    expect(metrics.safeActiveObservations).toBe(1)
    expect(metrics.skippedCandidates).toBe(0)
    expect(metrics.dedupedStatePatterns).toBe(0)
    expect(metrics.passiveObservations).toBe(0)
  })
})
