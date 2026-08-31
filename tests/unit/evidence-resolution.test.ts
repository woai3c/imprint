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
      evidenceRefs: ['image-crop'],
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

  it('prefers a cited section crop over a broader cited viewport image', () => {
    const multiCropEvidence = structuredClone(evidence)
    multiCropEvidence.pages[0].images.splice(1, 0, {
      id: 'image-viewport',
      kind: 'viewport-crop',
      path: 'C:\\evidence\\viewport.png',
      width: 1440,
      height: 800,
      sourceRect: { x: 0, y: 0, width: 1, height: 0.5 },
    })
    multiCropEvidence.sections[0].evidenceRefs = ['image-overview', 'image-viewport', 'image-crop']

    const resolution = resolveEvidenceOpen(multiCropEvidence, screenshots, 'section-hero')

    expect(resolution.type).toBe('lightbox')
    if (resolution.type !== 'lightbox') return
    expect(resolution.target.cropPath).toBe('C:\\evidence\\crop.png')
  })

  it('uses an active interaction component rectangle when resolving its cited crop', () => {
    const interactionEvidence = structuredClone(evidence)
    interactionEvidence.sections[0].rect = { x: 0, y: 0.05, width: 1, height: 0.5 }
    interactionEvidence.components = [
      {
        id: 'component-button',
        pageId: 'page-a',
        sectionId: 'section-hero',
        type: 'button',
        rect: { x: 0.2, y: 0.2, width: 0.2, height: 0.04 },
        styles: {},
        tokenRefs: [],
        stateRefs: ['interaction-active'],
        confidence: 1,
        evidenceRefs: ['section-hero', 'image-crop'],
      },
    ]
    interactionEvidence.interactionObservations = [
      {
        id: 'interaction-active',
        pageId: 'page-a',
        sectionId: 'section-hero',
        targetId: 'component-button',
        driver: 'click',
        safety: 'safe-active',
        trigger: { kind: 'click' },
        before: {},
        after: { transform: 'scale(0.98)' },
        changedProperties: ['transform'],
        evidenceRefs: ['section-hero', 'image-crop', 'component-button'],
      },
    ]

    const resolution = resolveEvidenceOpen(interactionEvidence, screenshots, 'interaction-active')

    expect(resolution.type).toBe('lightbox')
    if (resolution.type !== 'lightbox') return
    expect(resolution.target.cropPath).toBe('C:\\evidence\\crop.png')
    expect(resolution.target.rect).toMatchObject({
      x: (0.2 - 0.15) / 0.7,
      y: (0.2 - 0.12) / 0.3,
      width: 0.2 / 0.7,
      height: 0.04 / 0.3,
    })
  })

  it('uses a cited crop from the other viewport when the primary responsive page has no image', () => {
    const responsiveEvidence = structuredClone(evidence)
    responsiveEvidence.pages[0].images = []
    responsiveEvidence.pages.push({
      id: 'page-mobile',
      url: 'https://example.com/',
      viewport: 'mobile',
      images: [
        {
          id: 'image-mobile-crop',
          kind: 'viewport-crop',
          path: 'C:\\evidence\\mobile.png',
          width: 375,
          height: 812,
          sourceRect: { x: 0, y: 0, width: 1, height: 0.5 },
        },
      ],
    })
    responsiveEvidence.sections.push({
      ...structuredClone(responsiveEvidence.sections[0]),
      id: 'section-mobile-hero',
      pageId: 'page-mobile',
      rect: { x: 0.05, y: 0.12, width: 0.9, height: 0.3 },
      evidenceRefs: ['image-mobile-crop'],
    })
    responsiveEvidence.responsiveObservations = [
      {
        id: 'responsive-hero',
        sectionId: 'section-hero',
        fromViewport: 'desktop',
        toViewport: 'mobile',
        changeType: 'reflow',
        changedProperties: ['layoutMode'],
        summary: 'Hero reflows on mobile.',
        evidenceRefs: ['section-hero', 'section-mobile-hero', 'image-mobile-crop'],
      },
    ]

    const resolution = resolveEvidenceOpen(responsiveEvidence, [], 'responsive-hero')

    expect(resolution.type).toBe('lightbox')
    if (resolution.type !== 'lightbox') return
    expect(resolution.target.cropPath).toBe('C:\\evidence\\mobile.png')
    expect(resolution.target.rect).toMatchObject({ x: 0.05, y: 0.24, width: 0.9, height: 0.6 })
  })

  it('falls back to the overview image when no crop contains the evidence', () => {
    const resolution = resolveEvidenceOpen(evidence, screenshots, 'section-footer')
    expect(resolution.type).toBe('lightbox')
    if (resolution.type !== 'lightbox') return
    expect(resolution.target.cropPath).toBeUndefined()
    expect(resolution.target.imageIndex).toBe(0)
    expect(resolution.target.rect).toEqual({ x: 0, y: 0.9, width: 1, height: 0.1 })
  })

  it('opens a referenced crop when the page has no overview image', () => {
    const cropOnlyEvidence = structuredClone(evidence)
    cropOnlyEvidence.pages[0].images = cropOnlyEvidence.pages[0].images.filter(
      (candidate) => candidate.kind === 'region-crop',
    )

    const resolution = resolveEvidenceOpen(cropOnlyEvidence, [], 'section-hero')

    expect(resolution.type).toBe('lightbox')
    if (resolution.type !== 'lightbox') return
    expect(resolution.target.cropPath).toBe('C:\\evidence\\crop.png')
    expect(resolution.target.imageIndex).toBe(0)
  })

  it('opens a referenced viewport crop without duplicating its page screenshot', () => {
    const viewportEvidence = structuredClone(evidence)
    viewportEvidence.pages[0].images = [
      {
        id: 'image-viewport',
        kind: 'viewport-crop',
        path: 'C:\\evidence\\viewport.png',
        width: 1440,
        height: 800,
        sourceRect: { x: 0, y: 0, width: 1, height: 0.5 },
      },
    ]
    viewportEvidence.sections[0].evidenceRefs = ['image-viewport']
    const viewportScreenshots = [{ path: 'C:\\evidence\\viewport.png' }]

    const sectionResolution = resolveEvidenceOpen(viewportEvidence, viewportScreenshots, 'section-hero')
    expect(sectionResolution.type).toBe('lightbox')
    if (sectionResolution.type !== 'lightbox') return
    expect(sectionResolution.target.cropPath).toBeUndefined()
    expect(sectionResolution.target.imageIndex).toBe(0)
    expect(sectionResolution.target.rect.y).toBeCloseTo(0.15 / 0.5)
    expect(sectionResolution.target.rect.height).toBeCloseTo(0.2 / 0.5)

    const imageResolution = resolveEvidenceOpen(viewportEvidence, viewportScreenshots, 'image-viewport')
    expect(imageResolution).toMatchObject({
      type: 'lightbox',
      target: { imageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 } },
    })
  })

  it('maps highlights through an oversized bitmap without stretching coordinates', () => {
    const oversizedEvidence = structuredClone(evidence)
    oversizedEvidence.pages[0].images = [
      {
        id: 'image-oversized',
        kind: 'region-crop',
        path: 'C:\\evidence\\oversized.png',
        width: 1440,
        height: 3000,
        sourceRect: { x: 0, y: 0, width: 1, height: 1.875 },
      },
    ]
    oversizedEvidence.sections[0].rect = { x: 0.2, y: 0.5, width: 0.5, height: 0.2 }
    oversizedEvidence.sections[0].evidenceRefs = ['image-oversized']

    const resolution = resolveEvidenceOpen(oversizedEvidence, [], 'section-hero')

    expect(resolution.type).toBe('lightbox')
    if (resolution.type !== 'lightbox') return
    expect(resolution.target.cropPath).toBe('C:\\evidence\\oversized.png')
    expect(resolution.target.rect.y).toBeCloseTo(0.5 / 1.875)
    expect(resolution.target.rect.height).toBeCloseTo(0.2 / 1.875)
  })

  it('does not use a section crop that does not contain the referenced section', () => {
    const partialEvidence = structuredClone(evidence)
    const hero = partialEvidence.sections.find((candidate) => candidate.id === 'section-hero')!
    hero.rect = { x: 0.8, y: 0.15, width: 0.15, height: 0.2 }
    hero.evidenceRefs = []

    const resolution = resolveEvidenceOpen(partialEvidence, screenshots, 'section-hero')

    expect(resolution.type).toBe('lightbox')
    if (resolution.type !== 'lightbox') return
    expect(resolution.target.cropPath).toBeUndefined()
    expect(resolution.target.imageIndex).toBe(0)
    expect(resolution.target.rect).toEqual(hero.rect)
  })
})
