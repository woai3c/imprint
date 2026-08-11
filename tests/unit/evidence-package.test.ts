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
    const evidence = makeEvidence()
    evidence.layoutNodes = [
      {
        id: 'layout-a',
        pageId: 'page-a',
        sectionId: 'section-a',
        role: 'heading',
        textRole: 'heading',
        rect: { x: 0, y: 0, width: 0.5, height: 0.1 },
        tokenRefs: [],
        observedTypography: { fontSize: '17px', lineHeight: '25px' },
        traits: [],
      },
    ]
    const selected = selectEvidencePackage(evidence, 'structural-only')
    const section = selected.evidence.sections[0]

    expect('rect' in section).toBe(false)
    expect(section.approxBounds).toEqual({
      widthShare: 'full',
      heightShare: 'strip',
      anchor: 'full',
      vertical: 'top',
    })
    expect(selected.evidence.layoutNodes[0]).not.toHaveProperty('observedTypography')
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
    evidence.tokens.typography.fontSizes = ['1rem']
    evidence.tokens.radii = ['12px']
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
          margin: '-16px',
          background: 'url(https://private.example/asset.png)',
        },
        tokenRefs: ['color.palette-1', 'typography.font-size.1', 'radius.1'],
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
      backgroundColor: digestPackage.tokenShortIdMap.get('color.palette-1'),
      borderRadius: digestPackage.tokenShortIdMap.get('radius.1'),
      fontSize: digestPackage.tokenShortIdMap.get('typography.font-size.1'),
    })
    expect(digestPackage.digest.componentPatterns[0].variant).toBe('primary')
    expect(digestPackage.digest.tokenFacts.colors[0]).toMatchObject({
      name: 'palette-1',
      roles: ['action'],
      count: 12,
      pages: 1,
    })
    expect(digestJson).not.toContain('C:\\private')
    expect(digestJson).not.toContain('private.example')
    expect(digestJson).not.toContain('https://example.com')
    expect(digestJson).not.toContain('-16px')

    const prompt = buildCompactDesignInterpretationPrompt(digestPackage, 'en')
    expect(prompt.length).toBeLessThanOrEqual(28_000)
    expect(prompt).not.toContain('section-a')
    expect(prompt).toContain('"sampleEvidenceIds":["s1"]')
    expect(prompt).toContain('literal English enum values even when writing Chinese: header')
    expect(prompt).toContain('literal observed type values; never invent a role-specific variant: button')
    expect(prompt).toContain('Section evidence binding (role -> allowed s* IDs): {"header":["s1"]}')
    expect(prompt).toContain('Component evidence binding (type -> allowed c* IDs): {"button":["c1"]}')
    expect(prompt).toContain('These 12 required singleton fields must each use a different valid q ID')
    expect(prompt).toContain('Section and component rules use scoped claim objects without an id')
    expect(prompt).toContain('interaction: {"drivers":[SCOPED_CLAIM]')
    expect(prompt).toContain('transfer: {"preserve":[SCOPED_CLAIM]')
    expect(prompt).toContain('border-bottom-color must not be generalized to border-color')
    expect(prompt).toContain('never as confirmation after a real press')
    expect(prompt).toContain('recount the supplied pageFacts and topologyFacts')
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

    const componentShortId = prepared.evidenceShortIdMap.get('component-a')!
    const interactionShortId = prepared.evidenceShortIdMap.get('interaction-a')!
    const scoped = expandCompactProfileCandidate(
      {
        claims: [],
        thesis: 'q1',
        sections: [
          {
            role: 'header',
            composition: [
              {
                s: 'The header keeps its controls in one compact row',
                i: 'Keep the observed header grouping and spacing.',
                c: 'medium',
                e: [sectionShortId],
              },
            ],
          },
        ],
        components: [
          {
            component: 'button',
            role: 'action',
            rules: [
              {
                s: 'Buttons use the observed action treatment',
                i: 'Apply the captured button tokens to new actions.',
                c: 'medium',
                e: [componentShortId],
              },
            ],
          },
        ],
        interaction: {
          drivers: [
            {
              s: 'Hover changes the observed outline',
              i: 'Apply only the captured outline change.',
              c: 'medium',
              e: [interactionShortId],
            },
          ],
          feedback: {
            s: 'The outline provides state feedback',
            i: 'Bind the feedback to the observed hover state.',
            c: 'medium',
            e: [interactionShortId],
          },
          amplitude: {
            s: 'The state change remains local',
            i: 'Keep unchanged properties stable.',
            c: 'medium',
            e: [interactionShortId],
          },
          continuity: [],
        },
        transfer: {
          preserve: [
            {
              s: 'Preserve the compact header structure',
              i: 'Keep the observed section relationship.',
              c: 'medium',
              e: [sectionShortId],
            },
          ],
          adapt: [],
          avoid: [],
        },
      },
      prepared,
      'en',
      'structural-only',
    )
    expect(scoped.profile).toMatchObject({
      sectionGrammar: [{ role: 'header', composition: [expect.objectContaining({ evidence: expect.any(Array) })] }],
      componentGrammar: [{ component: 'button', rules: [expect.objectContaining({ evidence: expect.any(Array) })] }],
      interactionLanguage: {
        primaryDrivers: [
          expect.objectContaining({ evidence: [expect.objectContaining({ evidenceId: 'interaction-a' })] }),
        ],
        feedbackStyle: expect.objectContaining({
          evidence: [expect.objectContaining({ evidenceId: 'interaction-a' })],
        }),
        stateChangeAmplitude: expect.objectContaining({
          evidence: [expect.objectContaining({ evidenceId: 'interaction-a' })],
        }),
      },
      transferRules: {
        preserve: [expect.objectContaining({ evidence: [expect.objectContaining({ evidenceId: 'section-a' })] })],
      },
    })
  })

  test('keeps digest color counts when detailed token evidence falls outside the package cap', () => {
    const evidence = makeEvidence()
    evidence.tokens.colors = { primary: '#6b1eb9' }
    evidence.tokens.evidence = {
      ...Object.fromEntries(
        Array.from({ length: 41 }, (_item, index) => [
          `spacing.dense-${index}`,
          {
            value: `${index + 1}px`,
            confidence: 'high' as const,
            observationCount: 1_000 - index,
            pageCount: 1,
            captureCount: 1,
            pages: ['https://example.com/'],
            sources: ['rendered-use'],
            reasons: ['rendered-use'],
          },
        ]),
      ),
      'colors.primary': {
        value: '#6b1eb9',
        confidence: 'medium',
        observationCount: 17,
        pageCount: 1,
        captureCount: 1,
        pages: ['https://example.com/'],
        sources: ['usage:primaryActionColor'],
        reasons: ['rendered-use'],
      },
    }

    const selected = selectEvidencePackage(evidence, 'structural-only')
    expect(selected.evidence.tokens.evidence?.['colors.primary']).toBeUndefined()

    const digest = buildAnalysisDigest(evidence, selected).digest
    expect(digest.tokenFacts.colors[0]).toMatchObject({ name: 'primary', count: 17, pages: 1, roles: ['action'] })
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

  test('does not reuse one compact claim across required semantic fields', () => {
    const evidence = makeEvidence()
    const selected = selectEvidencePackage(evidence, 'structural-only')
    const digestPackage = prepareAnalysisDigestPackageForPrompt(buildAnalysisDigest(evidence, selected))
    const sectionId = digestPackage.evidenceShortIdMap.get('section-a')!
    const expanded = expandCompactProfileCandidate(
      {
        claims: [
          {
            id: 'q1',
            s: 'One claim must have one semantic purpose',
            i: 'Keep each required field specific to its own design concern.',
            c: 'high',
            e: [sectionId],
          },
        ],
        thesis: 'q1',
        composition: { container: 'q1' },
      },
      digestPackage,
      'en',
      'structural-only',
    )

    expect(expanded.profile).toMatchObject({
      thesis: expect.objectContaining({ statement: 'One claim must have one semantic purpose' }),
      composition: { containerStrategy: null },
    })
  })

  test('expands compact token and evidence IDs that leak into model prose', () => {
    const evidence = makeEvidence()
    const selected = selectEvidencePackage(evidence, 'structural-only')
    const digestPackage = prepareAnalysisDigestPackageForPrompt(buildAnalysisDigest(evidence, selected))
    const sectionId = digestPackage.evidenceShortIdMap.get('section-a')!
    const tokenId = digestPackage.tokenShortIdMap.get('color.primary')!
    const expanded = expandCompactProfileCandidate(
      {
        claims: [
          {
            id: 'q1',
            s: `Use ${tokenId.toUpperCase()} as the action color`,
            i: `Apply ${tokenId} where ${sectionId} establishes the main action`,
            c: 'medium',
            e: [sectionId],
            t: [tokenId],
          },
        ],
        thesis: 'q1',
      },
      digestPackage,
      'en',
      'structural-only',
    )

    expect(expanded.profile).toMatchObject({
      thesis: {
        statement: 'Use color.primary as the action color',
        implementation: 'Apply color.primary where section-a establishes the main action',
        tokenRefs: ['color.primary'],
      },
    })
  })

  test('covers up to three distinct page URLs for the default AI path', () => {
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

    const selected = selectEvidencePackage(evidence, 'multimodal')
    expect(selected.imageIds).toHaveLength(3)
    expect(selected.imageSelection.slice(1).every((item) => item.reason.includes('distinct page URL'))).toBe(true)

    const digestPackage = prepareAnalysisDigestPackageForPrompt(buildAnalysisDigest(evidence, selected))
    const imageObservations = selected.imageIds.map((imageId, index) => ({
      image: digestPackage.evidenceShortIdMap.get(imageId),
      description: `Specific visual observation ${index + 1}`,
    }))
    const expanded = expandCompactProfileCandidate(
      { claims: [], thesis: 'q1', imageObservations },
      digestPackage,
      'en',
      'multimodal',
    )
    expect(expanded.profile).toMatchObject({
      imageObservations: selected.imageIds.map((imageId, index) => ({
        imageId,
        description: `Specific visual observation ${index + 1}`,
      })),
    })
  })

  test('keeps one image when the second view adds too little information', () => {
    const evidence = makeEvidence()
    evidence.pages[0].images = [
      { id: 'viewport-a', kind: 'viewport-crop', path: 'a.png', width: 1_440, height: 900 },
      { id: 'viewport-b', kind: 'viewport-crop', path: 'b.png', width: 1_440, height: 900 },
    ]

    expect(selectEvidencePackage(evidence, 'multimodal').imageIds).toEqual(['viewport-a'])
  })

  test('drops a useful second image when it would exceed the visual token budget', () => {
    const evidence = makeEvidence()
    evidence.pages = [
      {
        id: 'page-a',
        url: 'https://example.com/',
        viewport: 'desktop',
        role: 'landing',
        images: [{ id: 'large-a', kind: 'viewport-crop', path: 'a.png', width: 1_600, height: 1_600 }],
      },
      {
        id: 'page-b',
        url: 'https://example.com/pricing',
        viewport: 'desktop',
        role: 'pricing',
        images: [{ id: 'large-b', kind: 'viewport-crop', path: 'b.png', width: 1_600, height: 1_600 }],
      },
    ]
    evidence.topology.pages = evidence.pages.map((page) => ({ pageId: page.id, role: page.role, sectionIds: [] }))
    evidence.sections = []

    expect(selectEvidencePackage(evidence, 'multimodal').imageIds).toEqual(['large-a'])
  })

  test('selects a readable viewport overview and a salient region instead of a very long full-page image', () => {
    const evidence = makeEvidence()
    evidence.pages[0].images = [
      { id: 'long-overview', kind: 'overview', path: 'long.png', width: 2_000, height: 8_000 },
      { id: 'desktop-viewport', kind: 'viewport-crop', path: 'viewport.png', width: 1_440, height: 900 },
      {
        id: 'hero-region',
        kind: 'region-crop',
        path: 'hero.png',
        width: 1_200,
        height: 700,
        sectionId: 'section-a',
      },
    ]
    evidence.sections[0].role = 'hero'

    const selected = selectEvidencePackage(evidence, 'multimodal')
    expect(selected.imageIds).toEqual(['desktop-viewport', 'hero-region'])
    expect(selected.imageSelection[1].reason).toContain('information gain')
    expect(selected.imageIds).not.toContain('long-overview')
  })

  test('prioritizes an overflowing mobile viewport as the second visual summary', () => {
    const evidence = makeEvidence()
    evidence.pages[0].images = [
      { id: 'desktop-viewport', kind: 'viewport-crop', path: 'desktop.png', width: 1_440, height: 900 },
      {
        id: 'hero-region',
        kind: 'region-crop',
        path: 'hero.png',
        width: 1_200,
        height: 700,
        sectionId: 'section-a',
      },
    ]
    evidence.pages.push({
      id: 'page-mobile',
      url: evidence.pages[0].url,
      viewport: 'mobile',
      role: 'landing',
      viewportWidth: 375,
      contentWidth: 720,
      horizontalOverflow: true,
      images: [{ id: 'mobile-overflow', kind: 'viewport-crop', path: 'mobile.png', width: 375, height: 812 }],
    })
    evidence.topology.pages.push({ pageId: 'page-mobile', role: 'landing', sectionIds: [] })

    const selected = selectEvidencePackage(evidence, 'multimodal')
    expect(selected.imageIds).toEqual(['mobile-overflow', 'hero-region'])
    expect(selected.imageSelection[0].reason).toContain('horizontal overflow')
  })

  test('rejects an exact visual duplicate even when it belongs to a distinct page URL', () => {
    const evidence = makeEvidence()
    evidence.pages[0].images = [
      {
        id: 'viewport-a',
        kind: 'viewport-crop',
        path: 'a.png',
        width: 1_440,
        height: 900,
        visualHash: `v1:${'f'.repeat(576)}`,
      },
      {
        id: 'distinct-region',
        kind: 'region-crop',
        path: 'distinct.png',
        width: 1_200,
        height: 700,
        sectionId: 'section-a',
        visualHash: `v1:${'0'.repeat(576)}`,
      },
    ]
    evidence.pages.push({
      id: 'page-similar',
      url: 'https://example.com/pricing',
      viewport: 'desktop',
      role: 'pricing',
      images: [
        {
          id: 'similar-viewport',
          kind: 'viewport-crop',
          path: 'similar.png',
          width: 1_440,
          height: 900,
          visualHash: `v1:${'f'.repeat(576)}`,
        },
      ],
    })
    evidence.sections[0].role = 'hero'
    evidence.topology.pages.push({ pageId: 'page-similar', role: 'pricing', sectionIds: [] })

    const selected = selectEvidencePackage(evidence, 'multimodal')
    expect(selected.imageIds).toEqual(['viewport-a', 'distinct-region'])
    expect(selected.imageSelection[1].reason).toContain('visual difference')
  })

  test('rejects a highly similar cross-page screenshot when the page structures are equivalent', () => {
    const evidence = makeEvidence()
    evidence.pages[0].images = [
      {
        id: 'viewport-a',
        kind: 'viewport-crop',
        path: 'a.png',
        width: 1_440,
        height: 900,
        visualHash: `v1:${'f'.repeat(576)}`,
      },
    ]
    evidence.pages.push({
      id: 'page-similar',
      url: 'https://example.com/similar',
      viewport: 'desktop',
      role: 'landing',
      images: [
        {
          id: 'similar-viewport',
          kind: 'viewport-crop',
          path: 'similar.png',
          width: 1_440,
          height: 900,
          visualHash: `v1:${'e'.repeat(576)}`,
        },
      ],
    })
    evidence.sections.push({ ...evidence.sections[0], id: 'section-similar', pageId: 'page-similar' })
    evidence.topology.pages.push({ pageId: 'page-similar', role: 'landing', sectionIds: ['section-similar'] })

    expect(selectEvidencePackage(evidence, 'multimodal').imageIds).toEqual(['viewport-a'])
  })

  test('sends one image instead of spending the second slot on a perceptually similar view', () => {
    const evidence = makeEvidence()
    evidence.pages[0].images = [
      {
        id: 'viewport-a',
        kind: 'viewport-crop',
        path: 'a.png',
        width: 1_440,
        height: 900,
        visualHash: `v1:${'f'.repeat(576)}`,
      },
      {
        id: 'similar-region',
        kind: 'region-crop',
        path: 'similar.png',
        width: 1_440,
        height: 900,
        sectionId: 'section-a',
        visualHash: `v1:${'e'.repeat(576)}`,
      },
    ]
    evidence.sections[0].role = 'hero'

    expect(selectEvidencePackage(evidence, 'multimodal').imageIds).toEqual(['viewport-a'])
  })

  test('never selects images from a page that failed the health gate', () => {
    const evidence = makeEvidence()
    evidence.pages[0].health = {
      status: 'unusable',
      checkedAt: '2026-08-09T00:00:00.000Z',
      recovered: false,
      attempts: 2,
      viewport: { width: 1_440, height: 900 },
      content: { width: 1_440, height: 900 },
      overlayAreaRatio: 0.8,
      mutationCount: 0,
      aiEligible: false,
      issues: [{ code: 'captcha', severity: 'error', recoverable: false }],
    }
    evidence.pages.push({
      id: 'healthy-page',
      url: 'https://example.com/pricing',
      viewport: 'desktop',
      role: 'pricing',
      health: {
        status: 'healthy',
        checkedAt: '2026-08-09T00:00:00.000Z',
        recovered: false,
        attempts: 1,
        viewport: { width: 1_440, height: 900 },
        content: { width: 1_440, height: 900 },
        overlayAreaRatio: 0,
        mutationCount: 0,
        aiEligible: true,
        issues: [],
      },
      images: [{ id: 'healthy-viewport', kind: 'viewport-crop', path: 'healthy.png', width: 1_440, height: 900 }],
    })
    evidence.topology.pages.push({ pageId: 'healthy-page', role: 'pricing', sectionIds: [] })

    const selected = selectEvidencePackage(evidence, 'multimodal')
    expect(selected.imageIds).toEqual(['healthy-viewport'])
    expect(selected.imageIds).not.toContain('image-a')
  })

  test('removes every dependent fact from a degraded page that is not AI-eligible', () => {
    const evidence = makeEvidence()
    evidence.pages[0].health = {
      status: 'degraded',
      checkedAt: '2026-08-09T00:00:00.000Z',
      recovered: false,
      attempts: 2,
      viewport: { width: 1_440, height: 900 },
      content: { width: 1_440, height: 1_800 },
      overlayAreaRatio: 0.2,
      mutationCount: 0,
      aiEligible: false,
      issues: [{ code: 'large-overlay', severity: 'warning', recoverable: true }],
    }

    const selected = selectEvidencePackage(evidence, 'structural-only')

    expect(selected.selectedPageIds).toEqual([])
    expect(selected.selectedSectionIds).toEqual([])
    expect(selected.evidence.components).toEqual([])
    expect(selected.evidence.layoutNodes).toEqual([])
    expect(selected.omittedEvidence).toContainEqual({ kind: 'pages', reason: 'unsafe' })
  })

  test('keeps eligible health warnings attached to the matching short page ID', () => {
    const evidence = makeEvidence()
    evidence.pages[0].health = {
      status: 'degraded',
      checkedAt: '2026-08-09T00:00:00.000Z',
      recovered: false,
      attempts: 1,
      viewport: { width: 1_440, height: 900 },
      content: { width: 1_444, height: 1_800 },
      overlayAreaRatio: 0,
      mutationCount: 0,
      aiEligible: true,
      issues: [{ code: 'horizontal-overflow', severity: 'warning', recoverable: false }],
    }

    const selected = selectEvidencePackage(evidence, 'structural-only')
    const digest = buildAnalysisDigest(evidence, selected).digest

    expect(digest.pages[0].limitations).toContain('page-health:horizontal-overflow')
  })
})
