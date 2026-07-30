import { describe, expect, it } from 'vitest'

import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import { resolveEvidenceOpen } from '../../src/renderer/lib/evidence-resolution.js'

const evidence: DesignEvidence = {
  schemaVersion: '1',
  analysisId: 'analysis-resolution',
  source: { requestedUrl: 'https://example.com', finalUrl: 'https://example.com/', accessMode: 'anonymous' },
  pages: [
    {
      id: 'page-a',
      url: 'https://example.com/',
      viewport: 'desktop',
      images: [
        { id: 'image-overview', kind: 'overview', path: 'C:\\evidence\\overview.png', width: 1440, height: 1600 },
        {
          id: 'image-crop',
          kind: 'region-crop',
          path: 'C:\\evidence\\crop.png',
          width: 960,
          height: 480,
          sourceRect: { x: 0.15, y: 0.12, width: 0.7, height: 0.3 },
          sectionId: 'section-hero',
        },
      ],
    },
  ],
  tokens: {
    colors: {},
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
  topology: { schemaVersion: '1', pages: [], globalLayers: [], crossPagePatternIds: [] },
  sections: [
    {
      id: 'section-hero',
      pageId: 'page-a',
      order: 0,
      role: 'hero',
      rect: { x: 0.2, y: 0.15, width: 0.5, height: 0.2 },
      layoutMode: 'flow',
      tokenRefs: [],
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: [],
    },
    {
      id: 'section-footer',
      pageId: 'page-a',
      order: 1,
      role: 'footer',
      rect: { x: 0, y: 0.9, width: 1, height: 0.1 },
      layoutMode: 'flow',
      tokenRefs: [],
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: [],
    },
  ],
  components: [],
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
    mediaCoverage: { majorRegions: 0, classifiedRegions: 0 },
    accessRestrictions: [],
    limitations: [],
  },
  limitations: [],
}

const screenshots = [{ path: 'C:\\evidence\\overview.png' }]

describe('Evidence open resolution', () => {
  it('opens the region crop with a remapped highlight when the evidence lies inside it', () => {
    const resolution = resolveEvidenceOpen(evidence, screenshots, 'section-hero')
    expect(resolution.type).toBe('lightbox')
    if (resolution.type !== 'lightbox') return
    expect(resolution.target.cropPath).toBe('C:\\evidence\\crop.png')
    expect(resolution.target.imageIndex).toBe(0)
    expect(resolution.target.rect.x).toBeCloseTo((0.2 - 0.15) / 0.7, 5)
    expect(resolution.target.rect.y).toBeCloseTo((0.15 - 0.12) / 0.3, 5)
    expect(resolution.target.rect.width).toBeCloseTo(0.5 / 0.7, 5)
    expect(resolution.target.rect.height).toBeCloseTo(0.2 / 0.3, 5)
  })

  it('falls back to the overview image when no crop contains the evidence', () => {
    const resolution = resolveEvidenceOpen(evidence, screenshots, 'section-footer')
    expect(resolution.type).toBe('lightbox')
    if (resolution.type !== 'lightbox') return
    expect(resolution.target.cropPath).toBeUndefined()
    expect(resolution.target.imageIndex).toBe(0)
    expect(resolution.target.rect).toEqual({ x: 0, y: 0.9, width: 1, height: 0.1 })
  })
})
