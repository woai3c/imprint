import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import { createDeterministicDesignContext } from '../../src/core/design-context/deterministic-context.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'

const tokens: DesignToken = {
  colors: { background: '#ffffff', foreground: '#111827', primary: '#2563eb' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['16px', '32px'],
    fontWeights: ['400', '700'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['8px', '24px'],
  radii: ['12px'],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: ['0.2s ease'],
}

function createEvidence(): DesignEvidence {
  return {
    schemaVersion: '1',
    analysisId: 'analysis-test',
    source: {
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
    },
    pages: [
      {
        id: 'page-desktop',
        url: 'https://example.com/',
        viewport: 'desktop',
        role: 'landing',
        images: [{ id: 'image-desktop', kind: 'overview', path: 'capture.png', width: 1440, height: 1600 }],
      },
      {
        id: 'page-mobile',
        url: 'https://example.com/',
        viewport: 'mobile',
        role: 'landing',
        images: [{ id: 'image-mobile', kind: 'overview', path: 'mobile.png', width: 375, height: 1200 }],
      },
    ],
    tokens,
    featureTags: ['responsive'],
    topology: {
      schemaVersion: '1',
      pages: [
        { pageId: 'page-desktop', role: 'landing', sectionIds: ['section-desktop'] },
        { pageId: 'page-mobile', role: 'landing', sectionIds: ['section-mobile'] },
      ],
      globalLayers: [],
      crossPagePatternIds: [],
    },
    sections: [
      {
        id: 'section-desktop',
        pageId: 'page-desktop',
        order: 0,
        role: 'hero',
        rect: { x: 0, y: 0, width: 1, height: 0.6 },
        layoutMode: 'flow',
        tokenRefs: ['color.background', 'spacing.2'],
        componentRefs: ['component-primary'],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: ['image-desktop'],
      },
      {
        id: 'section-mobile',
        pageId: 'page-mobile',
        order: 0,
        role: 'hero',
        rect: { x: 0, y: 0, width: 1, height: 0.8 },
        layoutMode: 'flow',
        tokenRefs: ['color.background', 'spacing.1'],
        componentRefs: [],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: ['image-mobile'],
      },
    ],
    components: [
      {
        id: 'component-primary',
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        type: 'button',
        rect: { x: 0.1, y: 0.3, width: 0.2, height: 0.05 },
        styles: { backgroundColor: '#2563eb', borderRadius: '12px' },
        tokenRefs: ['color.primary', 'radius.1'],
        stateRefs: [],
        confidence: 0.95,
        evidenceRefs: ['section-desktop', 'image-desktop'],
      },
    ],
    layoutNodes: [],
    interactionStyles: { hover: [], focus: [], active: [] },
    interactionObservations: [],
    breakpoints: [],
    responsiveObservations: [
      {
        id: 'responsive-hero',
        sectionId: 'section-desktop',
        fromViewport: 'desktop',
        toViewport: 'mobile',
        changeType: 'reflow',
        changedProperties: ['width'],
        summary: 'Hero narrows on mobile.',
        evidenceRefs: ['section-desktop', 'section-mobile'],
      },
    ],
    motion: [],
    mediaLayers: [],
    coverage: {
      pageCoverage: 'complete',
      sectionCoverage: 1,
      viewportCoverage: ['desktop', 'mobile'],
      interactionCoverage: { candidates: 0, safelyObserved: 0, skipped: 0 },
      mediaCoverage: { majorRegions: 0, classifiedRegions: 0, iconRegions: 0 },
      accessRestrictions: [],
      limitations: [],
    },
    limitations: [],
  }
}

describe('deterministic design context', () => {
  it('returns identical program-owned output for identical evidence', () => {
    const first = createDeterministicDesignContext(createEvidence(), structuredClone(tokens), 'en')
    const second = createDeterministicDesignContext(createEvidence(), structuredClone(tokens), 'en')

    expect(second).toEqual(first)
    expect(first.profile.claimSource).toBe('deterministic-catalog')
    expect(first.profile.schemaVersion).toBe('2')
    expect(JSON.stringify(first)).not.toMatch(/provider|apiKey|prompt|modelId|capabilityLevel|inputMode/i)
  })

  it('uses only evidence IDs that exist in the captured evidence graph', () => {
    const evidence = createEvidence()
    const context = createDeterministicDesignContext(evidence, tokens, 'en')
    const knownIds = new Set([
      ...evidence.pages.map((page) => page.id),
      ...evidence.pages.flatMap((page) => page.images.map((image) => image.id)),
      ...evidence.sections.map((section) => section.id),
      ...evidence.components.map((component) => component.id),
      ...evidence.responsiveObservations.map((observation) => observation.id),
    ])
    const serialized = JSON.stringify(context.profile)

    for (const claim of context.profile.transferRules.preserve) {
      for (const reference of claim.evidence) expect(knownIds.has(reference.evidenceId)).toBe(true)
    }
    expect(serialized).not.toContain('C:\\\\')
  })
})
