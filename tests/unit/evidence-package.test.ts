import { describe, expect, test } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import {
  buildAnalysisDigest,
  buildCompactDesignInterpretationPrompt,
  expandCompactProfileCandidate,
  prepareAnalysisDigestPackageForPrompt,
  selectEvidencePackage,
} from '../../src/core/design-intelligence/index.js'

const tokens: DesignToken = {
  colors: { primary: '#6b1eb9' },
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
}

function makeEvidence(): DesignEvidence {
  return {
    schemaVersion: '1',
    analysisId: 'analysis-test',
    source: {
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
    },
    pages: [{ id: 'page-a', url: 'https://example.com/', viewport: 'desktop', role: 'landing', images: [] }],
    tokens,
    featureTags: [],
    topology: {
      schemaVersion: '1',
      pages: [{ pageId: 'page-a', role: 'landing', sectionIds: ['section-a'] }],
      globalLayers: [],
      crossPagePatternIds: [],
    },
    sections: [
      {
        id: 'section-a',
        pageId: 'page-a',
        order: 0,
        role: 'header',
        rect: { x: 0, y: 0, width: 1, height: 0.03 },
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
    interactionObservations: [
      {
        id: 'interaction-a',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'target-1',
        driver: 'hover',
        safety: 'passive',
        trigger: { kind: 'css-pseudo' },
        before: {
          color: '#ffffff',
          'background-color': '#16171d',
          'box-shadow': `0 0 0 1px ${'rgba(0,0,0,0.123456) '.repeat(12)}`,
        },
        after: {
          color: '#b39aff',
          'background-color': '#16171d',
          'box-shadow': `0 0 0 2px ${'rgba(0,0,0,0.123456) '.repeat(12)}`,
        },
        changedProperties: ['color', 'background-color', 'box-shadow', 'outline-color'],
        evidenceRefs: [],
      },
    ],
    breakpoints: [],
    responsiveObservations: [],
    motion: [],
    mediaLayers: [],
    coverage: {
      pageCoverage: 'complete',
      sectionCoverage: 1,
      viewportCoverage: ['desktop'],
      interactionCoverage: { candidates: 1, safelyObserved: 0, skipped: 0 },
      mediaCoverage: { majorRegions: 0, classifiedRegions: 0 },
      accessRestrictions: [],
      limitations: [],
    },
    limitations: [],
  }
}

describe('selectEvidencePackage packaging', () => {
  test('replaces section rects with coarse approximate bounds', () => {
    const selected = selectEvidencePackage(makeEvidence(), 'structural-only')
    const section = selected.evidence.sections[0]

    expect('rect' in section).toBe(false)
    expect(section.approxBounds).toEqual({
      widthShare: 'full',
      heightShare: 'strip',
      anchor: 'full',
      vertical: 'top',
    })
  })

  test('distills interaction before/after into short from/to pairs', () => {
    const selected = selectEvidencePackage(makeEvidence(), 'structural-only')
    const observation = selected.evidence.interactionObservations[0]

    expect('before' in observation).toBe(false)
    expect('after' in observation).toBe(false)
    // color changed and is short; background-color identical and box-shadow values are too long;
    // outline-color has no recorded before/after values.
    expect(observation.changes).toEqual([{ property: 'color', from: '#ffffff', to: '#b39aff' }])
    expect(observation.changedProperties).toContain('box-shadow')
  })

  test('builds a path-free digest with reversible short IDs and exact component styles', () => {
    const evidence = makeEvidence()
    evidence.tokens.colors = { 'palette-1': '#6b1eb9' }
    evidence.tokens.evidence = {
      'colors.palette-1': {
        value: '#6b1eb9',
        confidence: 'high',
        observationCount: 12,
        pageCount: 1,
        captureCount: 1,
        pages: ['https://example.com/'],
        sources: ['usage:primaryActionColor'],
        reasons: ['rendered-use'],
      },
    }
    evidence.pages[0].images = [
      { id: 'image-a', kind: 'overview', path: 'C:\\private\\capture.png', width: 1440, height: 900 },
    ]
    evidence.sections[0].componentRefs = ['component-a']
    evidence.components = [
      {
        id: 'component-a',
        pageId: 'page-a',
        sectionId: 'section-a',
        type: 'button',
        role: 'primary-action',
        rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
        styles: {
          backgroundColor: '#6b1eb9',
          borderRadius: '12px',
          fontSize: '16px',
          background: 'url(https://private.example/asset.png)',
        },
        tokenRefs: ['color.palette-1'],
        stateRefs: [],
        confidence: 0.9,
        evidenceRefs: ['section-a', 'image-a'],
      },
    ]

    const selected = selectEvidencePackage(evidence, 'multimodal')
    const digestPackage = buildAnalysisDigest(evidence, selected)
    const digestJson = JSON.stringify(digestPackage.digest)
    const sectionShortId = digestPackage.evidenceShortIdMap.get('section-a')

    expect(sectionShortId).toBe('s1')
    expect(digestPackage.evidenceIdMap.get(sectionShortId!)).toBe('section-a')
    expect(digestPackage.digest.componentPatterns[0].exactStyles).toEqual({
      backgroundColor: '#6b1eb9',
      borderRadius: '12px',
      fontSize: '16px',
    })
    expect(digestPackage.digest.tokenFacts.colors[0]).toMatchObject({
      name: 'palette-1',
      roles: ['action'],
      count: 12,
      pages: 1,
    })
    expect(digestJson).not.toContain('C:\\private')
    expect(digestJson).not.toContain('private.example')
    expect(digestJson).not.toContain('https://example.com')

    const prompt = buildCompactDesignInterpretationPrompt(digestPackage, 'en')
    expect(prompt.length).toBeLessThanOrEqual(28_000)
    expect(prompt).not.toContain('section-a')
    expect(prompt).toContain('"sampleEvidenceIds":["s1"]')
    const prepared = prepareAnalysisDigestPackageForPrompt(digestPackage)
    expect([...prepared.evidenceIdMap].every(([shortId]) => JSON.stringify(prepared.digest).includes(shortId))).toBe(
      true,
    )
    const paletteShortId = prepared.tokenShortIdMap.get('color.palette-1')!
    const expanded = expandCompactProfileCandidate(
      {
        claims: [],
        thesis: 'q1',
        aliases: [{ token: paletteShortId, name: 'action-primary' }],
      },
      prepared,
      'en',
      'multimodal',
    )
    expect(expanded.aliases).toEqual([{ tokenId: 'palette-1', name: 'action-primary' }])
  })

  test('keeps the compact prompt under its hard character budget for dense component evidence', () => {
    const evidence = makeEvidence()
    const selected = selectEvidencePackage(evidence, 'structural-only')
    const digestPackage = buildAnalysisDigest(evidence, selected)
    digestPackage.digest.componentPatterns = Array.from({ length: 30 }, (_, index) => ({
      type: `component-${index}`,
      count: 1,
      pages: ['p1'],
      exactStyles: Object.fromEntries(
        Array.from({ length: 16 }, (_item, styleIndex) => [
          `property${styleIndex}`,
          `${index}-${styleIndex}-${'x'.repeat(100)}`,
        ]),
      ),
      tokenRefs: [],
      stateChanges: [],
      sampleEvidenceIds: ['s1'],
    }))

    expect(buildCompactDesignInterpretationPrompt(digestPackage, 'en').length).toBeLessThanOrEqual(28_000)
  })

  test('selects at most two images for the default AI path', () => {
    const evidence = makeEvidence()
    evidence.pages = Array.from({ length: 3 }, (_, index) => ({
      id: `page-${index}`,
      url: `https://example.com/page-${index}`,
      viewport: 'desktop',
      role: 'content' as const,
      images: [
        {
          id: `image-${index}`,
          kind: 'overview' as const,
          path: `capture-${index}.png`,
          width: 1440,
          height: 900,
        },
      ],
    }))
    evidence.topology.pages = evidence.pages.map((page) => ({ pageId: page.id, role: 'content', sectionIds: [] }))

    expect(selectEvidencePackage(evidence, 'multimodal').imageIds).toHaveLength(2)
  })
})
