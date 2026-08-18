import { describe, expect, it } from 'vitest'

import type { ComponentEvidence, DesignEvidence, SectionEvidence } from '../../src/core/design-evidence/types.js'
import { matchCrossCaptureEntities } from '../../src/core/governance/entity-matcher.js'

function section(
  id: string,
  role: SectionEvidence['role'],
  order: number,
  overrides: Partial<SectionEvidence> = {},
): SectionEvidence {
  return {
    id,
    pageId: 'page',
    order,
    role,
    rect: { x: 0, y: order * 0.2, width: 1, height: 0.2 },
    layoutMode: 'flow',
    tokenRefs: [],
    componentRefs: [],
    interactionRefs: [],
    mediaLayerRefs: [],
    evidenceRefs: [],
    ...overrides,
  }
}

function component(
  id: string,
  sectionId: string,
  type: string,
  overrides: Partial<ComponentEvidence> = {},
): ComponentEvidence {
  return {
    id,
    pageId: 'page',
    sectionId,
    type,
    rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
    styles: {},
    tokenRefs: [],
    stateRefs: [],
    confidence: 0.9,
    evidenceRefs: [],
    ...overrides,
  }
}

function evidence(analysisId: string, sections: SectionEvidence[], components: ComponentEvidence[]): DesignEvidence {
  const pageId = `${analysisId}-page`
  const normalizedSections = sections.map((item) => ({ ...item, pageId }))
  const sectionIds = new Map(sections.map((item, index) => [item.id, normalizedSections[index].id]))
  return {
    schemaVersion: '1',
    analysisId,
    source: {
      requestedUrl: 'https://example.test/catalog',
      finalUrl: 'https://example.test/catalog',
      accessMode: 'anonymous',
    },
    pages: [
      {
        id: pageId,
        url: 'https://example.test/catalog',
        viewport: 'desktop',
        images: [],
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
      usageCount: {},
    },
    featureTags: [],
    topology: {
      schemaVersion: '1',
      pages: [{ pageId, role: 'content', sectionIds: normalizedSections.map(({ id }) => id) }],
      globalLayers: [],
      crossPagePatternIds: [],
    },
    sections: normalizedSections,
    components: components.map((item) => ({
      ...item,
      pageId,
      sectionId: sectionIds.get(item.sectionId) || item.sectionId,
    })),
    layoutNodes: [],
    interactionStyles: { hover: [], focus: [], active: [], disabled: [] },
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
  }
}

describe('cross-capture entity matcher calibration', () => {
  it('matches unique semantic sections and components without relying on evidence IDs', () => {
    const reference = evidence(
      'reference',
      [section('reference-hero', 'hero', 0)],
      [component('reference-action', 'reference-hero', 'button', { elementKind: 'button', role: 'primary-action' })],
    )
    const target = evidence(
      'target',
      [section('target-wrapper-changed', 'hero', 1)],
      [
        component('target-action-changed', 'target-wrapper-changed', 'button', {
          elementKind: 'button',
          role: 'primary-action',
          styles: { backgroundColor: '#445566' },
          tokenRefs: ['colors.primary'],
        }),
      ],
    )

    const result = matchCrossCaptureEntities(reference, target)

    expect(result.sections).toContainEqual({
      kind: 'section',
      pageKey: 'https://example.test/catalog::desktop',
      status: 'matched',
      confidence: 'high',
      reason: 'exact-semantic-signature',
      referenceIds: ['reference-hero'],
      targetIds: ['target-wrapper-changed'],
    })
    expect(result.components[0]).toMatchObject({
      status: 'matched',
      confidence: 'high',
      referenceIds: ['reference-action'],
      targetIds: ['target-action-changed'],
    })
  })

  it('uses a medium-confidence unique role only when semantic details differ', () => {
    const reference = evidence(
      'reference',
      [section('reference-content', 'content', 0)],
      [component('reference-list', 'reference-content', 'list')],
    )
    const target = evidence(
      'target',
      [section('target-content', 'content', 0)],
      [component('target-table', 'target-content', 'table')],
    )

    expect(matchCrossCaptureEntities(reference, target).sections[0]).toMatchObject({
      status: 'matched',
      confidence: 'medium',
      reason: 'unique-role',
    })
  })

  it('reports a missing counterpart without calling it drift', () => {
    const reference = evidence('reference', [section('reference-aside', 'aside', 0)], [])
    const target = evidence('target', [], [])
    const result = matchCrossCaptureEntities(reference, target)

    expect(result.sections[0]).toMatchObject({
      status: 'unmatched',
      confidence: 'none',
      reason: 'missing-counterpart',
    })
    expect(result.limitations).toContain('ambiguous-and-unmatched-are-not-drift')
  })
})

describe('cross-capture entity matcher holdout', () => {
  it('keeps repeated sections and their components ambiguous instead of pairing by order', () => {
    const reference = evidence(
      'reference',
      [section('reference-a', 'feature-group', 0), section('reference-b', 'feature-group', 1)],
      [
        component('reference-button-a', 'reference-a', 'button'),
        component('reference-button-b', 'reference-b', 'button'),
      ],
    )
    const target = evidence(
      'target',
      [section('target-b', 'feature-group', 0), section('target-a', 'feature-group', 1)],
      [component('target-button-b', 'target-b', 'button'), component('target-button-a', 'target-a', 'button')],
    )

    const result = matchCrossCaptureEntities(reference, target)

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0]).toMatchObject({
      status: 'ambiguous',
      reason: 'duplicate-semantic-candidates',
      referenceIds: ['reference-a', 'reference-b'],
      targetIds: ['target-a', 'target-b'],
    })
    expect(result.components).toHaveLength(1)
    expect(result.components[0]).toMatchObject({
      status: 'ambiguous',
      reason: 'parent-section-unresolved',
    })
    expect(result.summary.sections).toEqual({
      matchedPairs: 0,
      highConfidencePairs: 0,
      mediumConfidencePairs: 0,
      ambiguousGroups: 1,
      unmatchedEntities: 0,
    })
  })
})
