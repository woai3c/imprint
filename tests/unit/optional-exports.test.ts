import { describe, expect, it } from 'vitest'

import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import { comparePixelBuffers, generateComponentSpecsJson, generateLocalVisualQa } from '../../src/core/export/index.js'

const evidence = {
  schemaVersion: '1',
  analysisId: 'optional-export-test',
  source: { requestedUrl: 'https://example.com', finalUrl: 'https://example.com', accessMode: 'anonymous' },
  pages: [
    {
      id: 'page-1',
      url: 'https://example.com',
      viewport: 'desktop',
      role: 'landing',
      viewportWidth: 1440,
      contentWidth: 1450,
      horizontalOverflow: true,
      health: {
        status: 'degraded',
        checkedAt: '2026-08-09T00:00:00.000Z',
        recovered: false,
        attempts: 1,
        viewport: { width: 1440, height: 900 },
        content: { width: 1450, height: 2000 },
        overlayAreaRatio: 0,
        mutationCount: 0,
        issues: [{ code: 'horizontal-overflow', severity: 'warning', recoverable: false }],
      },
      images: [{ id: 'image-1', kind: 'viewport-crop', path: 'unused.png', width: 1440, height: 900 }],
    },
  ],
  tokens: {
    colors: { primary: '#123456' },
    typography: {
      fontFamilies: [],
      fontStacks: [],
      fontSizes: [],
      fontWeights: [],
      lineHeights: [],
      letterSpacings: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
  },
  featureTags: [],
  topology: {
    schemaVersion: '1',
    pages: [{ pageId: 'page-1', role: 'landing', sectionIds: ['section-1'] }],
    globalLayers: [],
    crossPagePatternIds: [],
  },
  sections: [],
  components: [
    {
      id: 'component-1',
      pageId: 'page-1',
      sectionId: 'section-1',
      type: 'button',
      role: 'primary-action',
      rect: { x: 0, y: 0, width: 0.1, height: 0.05 },
      styles: { backgroundColor: '#123456', borderRadius: '8px' },
      tokenRefs: ['color.primary'],
      stateRefs: ['interaction-1'],
      confidence: 1,
      evidenceRefs: ['image-1'],
    },
  ],
  layoutNodes: [],
  interactionStyles: { hover: [], focus: [], active: [] },
  interactionObservations: [],
  breakpoints: [],
  responsiveObservations: [],
  motion: [],
  mediaLayers: [],
  coverage: {
    pageCoverage: 'complete',
    sectionCoverage: 1,
    viewportCoverage: ['desktop'],
    interactionCoverage: { candidates: 0, safelyObserved: 0, skipped: 0 },
    mediaCoverage: { majorRegions: 0, classifiedRegions: 0, iconRegions: 0 },
    accessRestrictions: [],
    limitations: [],
  },
  limitations: [],
} satisfies DesignEvidence

describe('optional deterministic exports', () => {
  it('exports aggregated component specifications only when requested', () => {
    const payload = JSON.parse(generateComponentSpecsJson(evidence))
    expect(payload.components[0]).toMatchObject({
      component: 'button',
      role: 'primary-action',
      sourceInstances: 1,
      styles: { backgroundColor: ['#123456'], borderRadius: ['8px'] },
    })
  })

  it('reports health, overflow, screenshot, and responsive checks without AI', () => {
    const report = generateLocalVisualQa(evidence)
    expect(report.summary.warning).toBeGreaterThanOrEqual(3)
    expect(report.checks.find((check) => check.id.startsWith('overflow'))?.status).toBe('warning')
  })

  it('offers bounded pixel comparison for explicit development validation', () => {
    const baseline = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255])
    const candidate = new Uint8Array([0, 0, 0, 255, 200, 200, 200, 255])
    const diff = comparePixelBuffers(baseline, candidate)
    expect(diff.sampledPixels).toBe(2)
    expect(diff.changedPixels).toBe(1)
    expect(diff.changedRatio).toBe(0.5)
  })
})
