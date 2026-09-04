import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hasCompleteTokenPromotionEvidence } from '../../src/core/analyzer/token-promotion.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import { restoreDeterministicStoredContext } from '../../src/main/analysis-records.js'
import {
  readDesignEvidence,
  readStoredDesignTokens,
  referenceCaptureFromRecord,
} from '../../src/main/persisted-records.js'

const database = vi.hoisted(() => ({
  run: vi.fn(),
  prepare: vi.fn(),
}))

vi.mock('../../src/main/database.js', () => ({
  getDb: () => ({ prepare: database.prepare }),
}))

const tokens: DesignToken = {
  colors: {},
  typography: {
    fontFamilies: [],
    fontStacks: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    letterSpacings: [],
  },
  spacing: ['8px'],
  radii: [],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
  evidence: {
    'spacing.0': {
      value: '8px',
      confidence: 'high',
      measurementConfidence: 'high',
      semanticConfidence: 'high',
      reuseScope: 'foundation',
      observationCount: 4,
      ownerCount: 4,
      semanticAgreement: 1,
      pageCount: 1,
      captureCount: 1,
      eligiblePageCount: 1,
      pageSupportRatio: 1,
      pages: ['https://example.com/'],
      sources: ['element:structural-spacing'],
      reasons: ['rendered-use'],
      foundationOwnerCount: 4,
      minimumPageFoundationOwnerCount: 4,
    },
  },
}

function evidence(): DesignEvidence {
  return {
    schemaVersion: '1',
    analysisId: 'analysis-stored',
    source: {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      language: 'en',
    },
    pages: [
      {
        id: 'page-home-desktop',
        url: 'https://example.com/',
        viewport: 'desktop',
        role: 'landing',
        images: [],
      },
    ],
    tokens,
    featureTags: [],
    topology: { schemaVersion: '1', pages: [], globalLayers: [], crossPagePatternIds: [] },
    sections: [],
    components: [],
    layoutNodes: [],
    interactionStyles: { hover: [], focus: [], active: [] },
    interactionObservations: [],
    breakpoints: [{ width: 768, label: 'tablet-sm', layoutChanges: [] }],
    responsiveObservations: [],
    motion: [],
    mediaLayers: [],
    coverage: {
      pageCoverage: 'complete',
      sectionCoverage: 0,
      viewportCoverage: ['desktop'],
      interactionCoverage: { candidates: 0, safelyObserved: 0, skipped: 0 },
      mediaCoverage: { majorRegions: 0, classifiedRegions: 0, iconRegions: 0 },
      accessRestrictions: [],
      limitations: [],
    },
    limitations: [],
  }
}

function currentEvidence(): DesignEvidence {
  return { ...evidence(), semanticOwnerVersion: '1' }
}

describe('stored analysis restoration', () => {
  beforeEach(() => {
    database.run.mockReset()
    database.prepare.mockReset().mockReturnValue({ run: database.run })
  })

  it('preserves observed breakpoints in regenerated and persisted implementation artifacts', () => {
    const storedEvidence = readDesignEvidence(JSON.stringify(currentEvidence()))
    if (!storedEvidence) throw new Error('Expected stored evidence')
    const storedTokens = readStoredDesignTokens(JSON.stringify(tokens), storedEvidence)
    if (!storedTokens) throw new Error('Expected stored tokens')
    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-stored',
        url: 'https://example.com/',
        feature_tags_json: '[]',
        tokens_json: JSON.stringify(tokens),
        css_variables: ':root {}',
        tailwind_theme: '@theme {}',
        design_doc: '',
      },
      storedTokens,
      storedEvidence,
    )

    expect(result.cssVariables).toContain('--breakpoint-tablet-sm: 768px;')
    expect(result.tailwindTheme).toContain('--breakpoint-tablet-sm: 48rem;')
    expect(database.run).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('--breakpoint-tablet-sm: 768px;'),
      expect.stringContaining('--breakpoint-tablet-sm: 48rem;'),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'analysis-stored',
    )
    expect(
      referenceCaptureFromRecord({
        id: 'analysis-stored',
        url: 'https://example.com/',
        tokens_json: JSON.stringify(tokens),
        design_evidence_json: JSON.stringify(currentEvidence()),
      }),
    ).toMatchObject({
      analysisId: 'analysis-stored',
      tokens: { spacing: ['8px'] },
      evidence: { analysisId: 'analysis-stored' },
    })
    expect(
      referenceCaptureFromRecord({
        id: 'analysis-corrupted-evidence',
        url: 'https://example.com/',
        tokens_json: JSON.stringify(tokens),
        design_evidence_json: '{invalid',
      }),
    ).toBeNull()
  })

  it('retains original artifacts when legacy evidence cannot support safe regeneration', () => {
    const legacyTokens: DesignToken = {
      ...tokens,
      colors: { background: '#ffffff', foreground: '#ffffff' },
      spacing: [],
      evidence: undefined,
    }
    const legacyEvidence = evidence()
    legacyEvidence.tokens = legacyTokens

    const storedEvidence = readDesignEvidence(JSON.stringify(legacyEvidence))
    if (!storedEvidence) throw new Error('Expected legacy evidence')
    const storedTokens = readStoredDesignTokens(JSON.stringify(legacyTokens), storedEvidence)
    if (!storedTokens) throw new Error('Expected legacy tokens')
    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-legacy',
        url: 'https://example.com/',
        feature_tags_json: '[]',
        tokens_json: JSON.stringify(legacyTokens),
        css_variables: 'legacy-css',
        tailwind_theme: 'legacy-tailwind',
        design_doc: 'legacy-doc',
      },
      storedTokens,
      storedEvidence,
    )

    expect(result).toMatchObject({
      designDoc: 'legacy-doc',
      cssVariables: 'legacy-css',
      tailwindTheme: 'legacy-tailwind',
    })
    expect(database.run).not.toHaveBeenCalled()
  })

  it('rejects a current semantic record whose foundation surface lacks exact owner references', () => {
    const currentTokens = structuredClone(tokens)
    currentTokens.colors.background = '#ffffff'
    currentTokens.evidence!['colors.background'] = {
      ...currentTokens.evidence!['spacing.0'],
      value: '#ffffff',
      roleRenderedPageCount: 1,
      roleOwnerCount: 1,
      sources: ['element:page-background'],
    }
    const claimedCurrentEvidence = currentEvidence()
    claimedCurrentEvidence.tokens = currentTokens

    expect(readDesignEvidence(JSON.stringify(claimedCurrentEvidence))).toBeNull()
  })

  it('accepts a current semantic record with exact foundation owner references', () => {
    const currentTokens = structuredClone(tokens)
    currentTokens.colors.background = '#ffffff'
    currentTokens.evidence!['colors.background'] = {
      ...currentTokens.evidence!['spacing.0'],
      value: '#ffffff',
      roleRenderedPageCount: 1,
      roleOwnerCount: 1,
      sources: ['element:page-background'],
      semanticOwnerRefs: [
        {
          page: 'https://example.com/',
          routeId: 'route-example',
          viewport: 'desktop',
          ownerId: 'html',
          domain: 'foundation',
          role: 'page-canvas',
        },
      ],
    }
    const claimedCurrentEvidence = currentEvidence()
    claimedCurrentEvidence.tokens = currentTokens

    expect(readDesignEvidence(JSON.stringify(claimedCurrentEvidence))).not.toBeNull()
  })

  it('retains original artifacts when non-throwing token evidence is incomplete', () => {
    const incompleteTokens = structuredClone(tokens)
    delete incompleteTokens.evidence!['spacing.0'].ownerCount
    const incompleteEvidence = evidence()
    incompleteEvidence.tokens = incompleteTokens
    const storedEvidence = readDesignEvidence(JSON.stringify(incompleteEvidence))
    if (!storedEvidence) throw new Error('Expected structurally readable incomplete evidence')
    const storedTokens = readStoredDesignTokens(JSON.stringify(incompleteTokens), storedEvidence)
    if (!storedTokens) throw new Error('Expected incomplete tokens')

    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-incomplete-token-evidence',
        tokens_json: JSON.stringify(incompleteTokens),
        css_variables: '--spacing-1: 8px;',
        tailwind_theme: '--spacing-1: 8px;',
        design_doc: 'legacy 8px token',
      },
      storedTokens,
      storedEvidence,
    )

    expect(storedTokens.spacing).toEqual(['8px'])
    expect(result).toMatchObject({
      designDoc: 'legacy 8px token',
      cssVariables: '--spacing-1: 8px;',
      tailwindTheme: '--spacing-1: 8px;',
    })
    expect(database.run).not.toHaveBeenCalled()
    expect(
      referenceCaptureFromRecord({
        id: 'analysis-incomplete-token-evidence',
        tokens_json: JSON.stringify(incompleteTokens),
        design_evidence_json: JSON.stringify(incompleteEvidence),
      }),
    ).toBeNull()
  })

  it('rejects a foundation scope that contradicts its owner counts', () => {
    const contradictoryTokens = structuredClone(tokens)
    contradictoryTokens.evidence!['spacing.0'].foundationOwnerCount = 0
    contradictoryTokens.evidence!['spacing.0'].minimumPageFoundationOwnerCount = 0
    const contradictoryEvidence = evidence()
    contradictoryEvidence.tokens = contradictoryTokens
    const storedEvidence = readDesignEvidence(JSON.stringify(contradictoryEvidence))
    if (!storedEvidence) throw new Error('Expected structurally readable contradictory evidence')
    const storedTokens = readStoredDesignTokens(JSON.stringify(contradictoryTokens), storedEvidence)
    if (!storedTokens) throw new Error('Expected contradictory tokens')

    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-contradictory-foundation',
        tokens_json: JSON.stringify(contradictoryTokens),
        css_variables: '--spacing-1: 8px;',
        tailwind_theme: '--spacing-1: 8px;',
        design_doc: 'legacy 8px token',
      },
      storedTokens,
      storedEvidence,
    )

    expect(result.designDoc).toBe('legacy 8px token')
    expect(database.run).not.toHaveBeenCalled()
    expect(
      referenceCaptureFromRecord({
        id: 'analysis-contradictory-foundation',
        tokens_json: JSON.stringify(contradictoryTokens),
        design_evidence_json: JSON.stringify(contradictoryEvidence),
      }),
    ).toBeNull()
  })

  it('accepts complete evidence shapes produced by generic and mixed-scope observations', () => {
    const compatibleTokens = structuredClone(tokens)
    compatibleTokens.colors.surface = '#d4d4d8'
    compatibleTokens.zIndices = ['10']
    compatibleTokens.evidence!['colors.surface'] = {
      ...compatibleTokens.evidence!['spacing.0'],
      value: '#d4d4d8',
      sources: ['computed:background', 'rendered:text'],
      sourceCounts: { 'computed:background': 4, 'rendered:text': 2 },
      roleCounts: { bgColor: 4, textColor: 2 },
    }
    delete compatibleTokens.evidence!['colors.surface'].foundationOwnerCount
    delete compatibleTokens.evidence!['colors.surface'].minimumPageFoundationOwnerCount
    compatibleTokens.evidence!['spacing.0'] = {
      ...compatibleTokens.evidence!['spacing.0'],
      observationCount: 3,
      ownerCount: 3,
      foundationOwnerCount: 2,
      minimumPageFoundationOwnerCount: 0,
      pageCount: 2,
      captureCount: 2,
      eligiblePageCount: 2,
      pages: ['https://example.com/', 'https://example.com/docs'],
      sources: ['element:content-spacing', 'element:control-spacing'],
      sourceCounts: { 'element:content-spacing': 2, 'element:control-spacing': 1 },
    }
    compatibleTokens.evidence!['zIndices.0'] = {
      ...compatibleTokens.evidence!['spacing.0'],
      value: '10',
      observationCount: 8,
      ownerCount: 8,
      foundationOwnerCount: 0,
      minimumPageFoundationOwnerCount: 0,
      sources: ['computed:stacking'],
      sourceCounts: { 'computed:stacking': 8 },
    }

    expect(hasCompleteTokenPromotionEvidence(compatibleTokens)).toBe(true)
  })

  it('reapplies large-spacing owner thresholds before stored regeneration', () => {
    const largeSpacingTokens = structuredClone(tokens)
    largeSpacingTokens.spacing = ['216px']
    largeSpacingTokens.evidence!['spacing.0'] = {
      ...largeSpacingTokens.evidence!['spacing.0'],
      value: '216px',
      observationCount: 4,
      ownerCount: 4,
      foundationOwnerCount: 4,
      minimumPageFoundationOwnerCount: 1,
      pageCount: 2,
      captureCount: 2,
      eligiblePageCount: 2,
      pageSupportRatio: 1,
      pages: ['https://example.com/', 'https://example.com/docs'],
      reasons: ['cross-page', 'computed-style'],
    }
    const largeSpacingEvidence = evidence()
    largeSpacingEvidence.pages.push({
      id: 'page-docs-desktop',
      url: 'https://example.com/docs',
      viewport: 'desktop',
      role: 'content',
      images: [],
    })
    largeSpacingEvidence.tokens = largeSpacingTokens
    const storedEvidence = readDesignEvidence(JSON.stringify(largeSpacingEvidence))
    if (!storedEvidence) throw new Error('Expected structurally readable large-spacing evidence')
    const storedTokens = readStoredDesignTokens(JSON.stringify(largeSpacingTokens), storedEvidence)
    if (!storedTokens) throw new Error('Expected large-spacing tokens')

    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-large-spacing',
        tokens_json: JSON.stringify(largeSpacingTokens),
        css_variables: '--spacing-1: 216px;',
        tailwind_theme: '--spacing-1: 216px;',
        design_doc: 'legacy 216px token',
      },
      storedTokens,
      storedEvidence,
    )

    expect(result.designDoc).toBe('legacy 216px token')
    expect(database.run).not.toHaveBeenCalled()
    expect(
      referenceCaptureFromRecord({
        id: 'analysis-large-spacing',
        tokens_json: JSON.stringify(largeSpacingTokens),
        design_evidence_json: JSON.stringify(largeSpacingEvidence),
      }),
    ).toBeNull()
  })

  it('keeps no-Evidence legacy tokens aligned with their original artifacts', () => {
    const legacyTokens: DesignToken = {
      ...tokens,
      spacing: ['2px'],
      evidence: {
        'spacing.0': {
          ...tokens.evidence!['spacing.0'],
          value: '2px',
          confidence: 'low',
          semanticConfidence: 'low',
          reuseScope: 'local',
        },
      },
    }
    const storedTokens = readStoredDesignTokens(JSON.stringify(legacyTokens), null)
    if (!storedTokens) throw new Error('Expected no-Evidence legacy tokens')

    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-no-evidence',
        tokens_json: JSON.stringify(legacyTokens),
        css_variables: '--spacing-1: 2px;',
        tailwind_theme: '--spacing-1: 2px;',
        design_doc: 'legacy 2px token',
      },
      storedTokens,
      null,
    )

    expect(storedTokens.spacing).toEqual(['2px'])
    expect(result).toMatchObject({
      designDoc: 'legacy 2px token',
      cssVariables: '--spacing-1: 2px;',
      tailwindTheme: '--spacing-1: 2px;',
    })
    expect(database.run).not.toHaveBeenCalled()
  })

  it('retains original artifacts and rejects comparisons when stored breakpoints are malformed', () => {
    const malformedEvidence = evidence()
    malformedEvidence.breakpoints = [{}] as never
    const serializedEvidence = JSON.stringify(malformedEvidence)
    const storedEvidence = readDesignEvidence(serializedEvidence)
    const storedTokens = readStoredDesignTokens(JSON.stringify(tokens), storedEvidence)
    if (!storedTokens) throw new Error('Expected fallback tokens')

    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-malformed-breakpoint',
        tokens_json: JSON.stringify(tokens),
        css_variables: 'legacy-css',
        tailwind_theme: 'legacy-tailwind',
        design_doc: 'legacy-doc',
      },
      storedTokens,
      storedEvidence,
    )

    expect(storedEvidence).toBeNull()
    expect(result).toMatchObject({
      designDoc: 'legacy-doc',
      cssVariables: 'legacy-css',
      tailwindTheme: 'legacy-tailwind',
    })
    expect(database.run).not.toHaveBeenCalled()
    expect(
      referenceCaptureFromRecord({
        id: 'analysis-malformed-breakpoint',
        tokens_json: JSON.stringify(tokens),
        design_evidence_json: serializedEvidence,
      }),
    ).toBeNull()

    for (const breakpoint of [
      { width: '768', label: 'tablet', layoutChanges: [] },
      { width: -1, label: 'tablet', layoutChanges: [] },
      { width: 768, label: '', layoutChanges: [] },
      { width: 768, label: 'tablet sm', layoutChanges: [] },
      { width: 768, label: 'tablet', layoutChanges: [1] },
    ]) {
      const invalid = evidence()
      invalid.breakpoints = [breakpoint] as never
      expect(readDesignEvidence(JSON.stringify(invalid))).toBeNull()
    }
    const duplicated = evidence()
    duplicated.breakpoints = [
      { width: 768, label: 'tablet', layoutChanges: [] },
      { width: 1024, label: 'tablet', layoutChanges: [] },
    ]
    expect(readDesignEvidence(JSON.stringify(duplicated))).toBeNull()
  })

  it('regenerates artifacts after successful promotion demotes every portable token', () => {
    const rejectedTokens: DesignToken = {
      ...tokens,
      spacing: ['2px'],
      evidence: {
        'spacing.0': {
          ...tokens.evidence!['spacing.0'],
          value: '2px',
          confidence: 'low',
          semanticConfidence: 'low',
          reuseScope: 'local',
          observationCount: 1,
          ownerCount: 1,
          semanticAgreement: 0.25,
          sources: ['usage:gap'],
          reasons: ['computed-style'],
          foundationOwnerCount: 0,
          minimumPageFoundationOwnerCount: 0,
        },
      },
    }
    const rawEvidence = currentEvidence()
    rawEvidence.tokens = rejectedTokens
    const storedEvidence = readDesignEvidence(JSON.stringify(rawEvidence))
    if (!storedEvidence) throw new Error('Expected promoted evidence')
    const storedTokens = readStoredDesignTokens(JSON.stringify(rejectedTokens), storedEvidence)
    if (!storedTokens) throw new Error('Expected promoted tokens')

    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-all-demoted',
        url: 'https://example.com/',
        feature_tags_json: '[]',
        tokens_json: JSON.stringify(rejectedTokens),
        css_variables: '--spacing-1: 2px;',
        tailwind_theme: '--spacing-1: 2px;',
        design_doc: 'legacy 2px token',
      },
      storedTokens,
      storedEvidence,
    )

    expect(storedTokens.spacing).toEqual([])
    expect(storedTokens.candidates?.values).toContainEqual(expect.objectContaining({ value: '2px' }))
    expect(result.cssVariables).not.toContain('--spacing-1')
    expect(result.tailwindTheme).not.toContain('--spacing-1')
    expect(result.designDoc).not.toBe('legacy 2px token')
    expect(database.run).toHaveBeenCalled()
  })

  it('retains original artifacts when malformed nested evidence makes promotion fail', () => {
    const malformedTokens = {
      ...tokens,
      spacing: [],
      typography: { ...tokens.typography, fontFamilies: ['Legacy Serif'] },
      evidence: {
        'typography.fontFamilies.0': {
          ...tokens.evidence!['spacing.0'],
          value: 'Legacy Serif',
          sources: ['rendered:text'],
          renderedTextOwners: [
            {
              ownerId: 'owner-1',
              routeId: 'route-1',
              page: 'https://example.com/',
              viewport: 'desktop',
              styles: { fontFamily: 'Legacy Serif' },
              source: { glyphPaintKind: 'solid-color' },
            },
          ],
        },
      },
    } as unknown as DesignToken
    const rawEvidence = evidence()
    rawEvidence.tokens = malformedTokens
    const storedEvidence = readDesignEvidence(JSON.stringify(rawEvidence))
    if (!storedEvidence) throw new Error('Expected structurally readable legacy evidence')
    const storedTokens = readStoredDesignTokens(JSON.stringify(malformedTokens), storedEvidence)
    if (!storedTokens) throw new Error('Expected legacy tokens')

    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-malformed-evidence',
        url: 'https://example.com/',
        feature_tags_json: '[]',
        tokens_json: JSON.stringify(malformedTokens),
        css_variables: 'legacy-css',
        tailwind_theme: 'legacy-tailwind',
        design_doc: 'legacy-doc',
      },
      storedTokens,
      storedEvidence,
    )

    expect(storedTokens.typography.fontFamilies).toEqual(['Legacy Serif'])
    expect(result).toMatchObject({
      designDoc: 'legacy-doc',
      cssVariables: 'legacy-css',
      tailwindTheme: 'legacy-tailwind',
    })
    expect(database.run).not.toHaveBeenCalled()
  })

  it('retains original artifacts when an existing candidate has malformed nested evidence', () => {
    const malformedCandidateTokens = {
      ...tokens,
      candidates: {
        values: [
          {
            group: 'colors',
            role: 'accent',
            value: '#2563eb',
            rejectionReason: 'local-scope',
            evidence: {
              value: '#2563eb',
              semanticConfidence: 'low',
              reuseScope: 'local',
            },
          },
        ],
      },
    } as unknown as DesignToken
    const rawEvidence = evidence()
    rawEvidence.tokens = malformedCandidateTokens
    const storedEvidence = readDesignEvidence(JSON.stringify(rawEvidence))
    if (!storedEvidence) throw new Error('Expected structurally readable candidate evidence')
    const storedTokens = readStoredDesignTokens(JSON.stringify(malformedCandidateTokens), storedEvidence)
    if (!storedTokens) throw new Error('Expected candidate tokens')

    const result = restoreDeterministicStoredContext(
      {
        id: 'analysis-malformed-candidate',
        url: 'https://example.com/',
        feature_tags_json: '[]',
        tokens_json: JSON.stringify(malformedCandidateTokens),
        css_variables: 'legacy-css',
        tailwind_theme: 'legacy-tailwind',
        design_doc: 'legacy-doc',
      },
      storedTokens,
      storedEvidence,
    )

    expect(result).toMatchObject({
      designDoc: 'legacy-doc',
      cssVariables: 'legacy-css',
      tailwindTheme: 'legacy-tailwind',
    })
    expect(database.run).not.toHaveBeenCalled()
    expect(
      referenceCaptureFromRecord({
        id: 'analysis-malformed-candidate',
        url: 'https://example.com/',
        tokens_json: JSON.stringify(malformedCandidateTokens),
        design_evidence_json: JSON.stringify(rawEvidence),
      }),
    ).toBeNull()
  })
})
