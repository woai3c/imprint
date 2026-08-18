import { describe, expect, it } from 'vitest'

import {
  type ReferenceCaptureInput,
  compareReferenceCaptures,
  routeIdentityFromUrl,
} from '../../src/core/analyzer/reference-compare.js'
import type { CaptureManifest, DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'

function tokens(overrides: Partial<DesignToken> = {}): DesignToken {
  return {
    colors: { background: '#ffffff', primary: '#2255ff' },
    typography: {
      fontFamilies: ['Inter'],
      fontStacks: ['Inter, sans-serif'],
      fontSizes: ['16px'],
      fontWeights: ['400'],
      lineHeights: ['1.5'],
      letterSpacings: ['0px'],
    },
    spacing: ['8px', '16px'],
    radii: ['8px'],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
    ...overrides,
  }
}

function evidence(analysisId: string, url = 'https://example.com/products', tokenValues = tokens()): DesignEvidence {
  return {
    schemaVersion: '1',
    analysisId,
    source: { requestedUrl: url, finalUrl: url, accessMode: 'anonymous', language: 'en' },
    pages: [
      {
        id: `${analysisId}-page`,
        url,
        viewport: 'desktop',
        health: {
          status: 'healthy',
          checkedAt: '2026-08-17T00:00:00.000Z',
          recovered: false,
          attempts: 1,
          viewport: { width: 1440, height: 900 },
          content: { width: 1440, height: 1800 },
          overlayAreaRatio: 0,
          mutationCount: 0,
          evidenceEligible: true,
          issues: [],
        },
        images: [],
      },
    ],
    tokens: tokenValues,
    featureTags: [],
    topology: { schemaVersion: '1', pages: [], globalLayers: [], crossPagePatternIds: [] },
    sections: [
      {
        id: `${analysisId}-hero`,
        pageId: `${analysisId}-page`,
        order: 0,
        role: 'hero',
        rect: { x: 0, y: 0, width: 1, height: 0.5 },
        layoutMode: 'flow',
        tokenRefs: ['colors.primary'],
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
      captureCoverage: { expected: 1, captured: 1, status: 'complete', requestedViewports: ['desktop'] },
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

function capture(
  analysisId: string,
  url = 'https://example.com/products',
  tokenValues = tokens(),
): ReferenceCaptureInput {
  return {
    analysisId,
    url,
    tokens: tokenValues,
    evidence: evidence(analysisId, url, tokenValues),
    manifest: manifest(url),
  }
}

function addMobileEvidence(input: ReferenceCaptureInput, desktopColumns: number): void {
  const captureEvidence = input.evidence!
  const desktopPage = captureEvidence.pages[0]
  const desktopSection = captureEvidence.sections[0]
  const mobilePageId = `${input.analysisId}-page-mobile`
  const mobileSectionId = `${input.analysisId}-hero-mobile`
  captureEvidence.pages.push({
    ...structuredClone(desktopPage),
    id: mobilePageId,
    viewport: 'mobile',
    health: {
      ...structuredClone(desktopPage.health!),
      viewport: { width: 412, height: 915 },
      content: { width: 412, height: 1800 },
    },
  })
  captureEvidence.sections.push({
    ...structuredClone(desktopSection),
    id: mobileSectionId,
    pageId: mobilePageId,
  })
  captureEvidence.coverage.viewportCoverage = ['desktop', 'mobile']
  captureEvidence.coverage.captureCoverage = {
    expected: 2,
    captured: 2,
    status: 'complete',
    requestedViewports: ['desktop', 'mobile'],
  }
  captureEvidence.responsiveObservations = [
    {
      id: `${input.analysisId}-responsive-hero`,
      sectionId: desktopSection.id,
      fromViewport: 'desktop',
      toViewport: 'mobile',
      changeType: 'reflow',
      changedProperties: ['gridTemplateColumns'],
      changes: {
        gridTemplateColumns: { from: `repeat(${desktopColumns}, 1fr)`, to: '1fr' },
      },
      summary: 'Observed a grid reflow.',
      evidenceRefs: [desktopSection.id, mobileSectionId],
    },
  ]

  const captureManifest = input.manifest!
  const mobileViewport = {
    name: 'mobile',
    width: 412,
    height: 915,
    deviceScaleFactor: 1,
    mobile: true,
  }
  captureManifest.request.viewports.push(mobileViewport)
  captureManifest.environment.viewports.push({
    ...mobileViewport,
    source: 'requested',
    emulationProfile: 'pixel-7-android-13',
    userAgent: 'Mobile Chrome/128.0.0.0',
  })
  captureManifest.capture.pageKeys.push(`${input.url}::mobile`)
  captureManifest.capture.expected = 2
  captureManifest.capture.captured = 2
}

function addHoverEvidence(input: ReferenceCaptureInput, afterColor: string): void {
  input.evidence!.interactionObservations = [
    {
      id: `${input.analysisId}-hover`,
      pageId: `${input.analysisId}-page`,
      sectionId: `${input.analysisId}-hero`,
      targetId: `${input.analysisId}-action`,
      driver: 'hover',
      safety: 'passive',
      trigger: { kind: 'css-pseudo-class:hover' },
      before: { color: 'rgb(0, 0, 0)' },
      after: { color: afterColor },
      changedProperties: ['color'],
      evidenceRefs: [`${input.analysisId}-hero`],
    },
  ]
}

function addAmbiguousSections(input: ReferenceCaptureInput): void {
  const base = input.evidence!.sections[0]
  for (let index = 1; index <= 2; index += 1) {
    input.evidence!.sections.push({
      ...structuredClone(base),
      id: `${input.analysisId}-repeated-content-${index}`,
      role: 'content',
      tokenRefs: [],
    })
  }
}

function addUnpairedFocusEvidence(input: ReferenceCaptureInput): void {
  input.evidence!.interactionObservations.push({
    id: `${input.analysisId}-focus-only`,
    pageId: `${input.analysisId}-page`,
    sectionId: `${input.analysisId}-hero`,
    targetId: `${input.analysisId}-focus-target`,
    driver: 'focus',
    safety: 'passive',
    trigger: { kind: 'css-pseudo-class:focus' },
    before: { outlineColor: 'rgba(0, 0, 0, 0)' },
    after: { outlineColor: 'rgb(34, 85, 255)' },
    changedProperties: ['outlineColor'],
    evidenceRefs: [`${input.analysisId}-hero`],
  })
}

function manifest(url = 'https://example.com/products'): CaptureManifest {
  return {
    schemaVersion: '1',
    capturedAt: '2026-08-17T00:00:00.000Z',
    tool: { name: 'imprint', version: '0.0.3' },
    request: {
      schemaVersion: '1',
      viewports: [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }],
      maxPages: 1,
      pageDiscovery: 'auto',
      depth: 'standard',
      accessMode: 'anonymous',
    },
    environment: {
      platform: 'darwin',
      architecture: 'arm64',
      browser: {
        engine: 'chromium',
        product: 'chrome',
        version: '128.0.0.0',
        userAgent: 'Chrome/128.0.0.0',
        headless: true,
      },
      locale: 'en-US',
      languages: ['en-US', 'en'],
      timezone: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'no-preference',
      deviceScaleFactor: 1,
      viewports: [
        {
          name: 'desktop',
          width: 1440,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
          source: 'requested',
          emulationProfile: 'browser-default',
          userAgent: 'Chrome/128.0.0.0',
        },
      ],
    },
    stabilization: {
      strategyVersion: '1',
      pageHealthRecorded: true,
      animationFreeze: {
        eligibleCaptures: 1,
        attemptedCaptures: 1,
        succeededCaptures: 1,
        failedCaptures: 0,
        coverage: 'complete',
      },
      fontsReady: true,
    },
    capture: {
      pageKeys: [`${url}::desktop`],
      pages: { requested: 1, discovered: 0, selected: 0, analyzed: 1 },
      expected: 1,
      captured: 1,
      status: 'complete',
      coverageLimitations: [],
    },
    limitations: [],
  }
}

describe('reference capture comparison', () => {
  it('builds a stable route identity without credentials, query, fragment, or trailing slash', () => {
    expect(routeIdentityFromUrl('https://user:secret@EXAMPLE.com/products/?token=secret#section')).toBe(
      'https://example.com/products',
    )
  })

  it('does not report drift for equivalent, healthy captures', () => {
    const result = compareReferenceCaptures(capture('reference'), capture('target'))

    expect(result.status).toBe('unchanged')
    expect(result.comparability.status).toBe('limited')
    expect(result.comparability.reasons).toEqual([])
    expect(result.summary).toEqual({ changedCategories: 0, changedItems: 0 })
    expect(result.categories.filter((category) => category.status === 'unchanged')).toHaveLength(5)
    expect(result.categories.filter((category) => category.status === 'inconclusive')).toHaveLength(2)
    expect(result.categories.filter((category) => category.status === 'not-supported')).toHaveLength(0)
    expect(result.comparability.limitations).toEqual(['exact-observed-values-only', 'entry-and-captured-page-set-only'])
    expect(result.comparability.differences).toEqual([])
    expect(result.entityMatching?.summary.sections).toEqual({
      matchedPairs: 1,
      highConfidencePairs: 1,
      mediumConfidencePairs: 0,
      ambiguousGroups: 0,
      unmatchedEntities: 0,
    })
  })

  it('reports named token changes with evidence from both captures', () => {
    const targetTokens = tokens({ colors: { background: '#ffffff', primary: '#dd3322' } })
    const result = compareReferenceCaptures(capture('reference'), capture('target', undefined, targetTokens))
    const primaryChange = result.categories
      .find((category) => category.category === 'colors')
      ?.changes.find((item) => item.tokenPath === 'colors.primary')

    expect(result.status).toBe('changed')
    expect(primaryChange).toMatchObject({ kind: 'changed', from: '#2255ff', to: '#dd3322' })
    expect(primaryChange?.referenceEvidenceIds).toEqual(['reference-hero'])
    expect(primaryChange?.targetEvidenceIds).toEqual(['target-hero'])
    expect(primaryChange?.reviewable).toBe(true)
  })

  it('reports conservative section-level layout changes as observation-only evidence', () => {
    const target = capture('target')
    target.evidence!.sections[0].order = 1
    target.evidence!.sections[0].layoutMode = 'sticky'
    target.evidence!.sections[0].observedStyles = {
      layout: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '24px' },
    }
    const result = compareReferenceCaptures(capture('reference'), target)
    const layout = result.categories.find((category) => category.category === 'layout')!

    expect(layout.status).toBe('changed')
    expect(layout.coverage).toBe('partial')
    expect(layout.limitations).toContain('section-level-properties-only')
    expect(layout.limitations).toContain('medium-confidence-entity-matches')
    expect(layout.changes.map((item) => item.tokenPath)).toEqual([
      'layout.hero.1.order',
      'layout.hero.1.layoutMode',
      'layout.hero.1.display',
      'layout.hero.1.gridTemplateColumns',
    ])
    expect(layout.changes.every((item) => item.reviewable === false)).toBe(true)
    expect(layout.changes[0].referenceEvidenceIds).toEqual(['reference-hero'])
    expect(layout.changes[0].targetEvidenceIds).toEqual(['target-hero'])
  })

  it('compares aligned observed interaction style groups without claiming unobserved controls', () => {
    const reference = capture('reference')
    const target = capture('target')
    addHoverEvidence(reference, 'rgb(34, 85, 255)')
    addHoverEvidence(target, 'rgb(221, 51, 34)')

    const interaction = compareReferenceCaptures(reference, target).categories.find(
      (category) => category.category === 'interaction-states',
    )!
    expect(interaction.status).toBe('changed')
    expect(interaction.coverage).toBe('partial')
    expect(interaction.changes).toHaveLength(1)
    expect(interaction.changes[0]).toMatchObject({
      tokenPath: 'interaction.hover.css-pseudo-class:hover.color',
      referenceEvidenceIds: ['reference-hover'],
      targetEvidenceIds: ['target-hover'],
      reviewable: false,
    })
  })

  it('compares responsive behavior only for matched sections and identical viewport pairs', () => {
    const reference = capture('reference')
    const target = capture('target')
    addMobileEvidence(reference, 3)
    addMobileEvidence(target, 2)

    const responsive = compareReferenceCaptures(reference, target).categories.find(
      (category) => category.category === 'responsive',
    )!
    expect(responsive.status).toBe('changed')
    expect(responsive.coverage).toBe('partial')
    expect(responsive.changes).toHaveLength(1)
    expect(responsive.changes[0]).toMatchObject({
      tokenPath: 'responsive.hero.desktop-mobile',
      referenceEvidenceIds: ['reference-responsive-hero', 'reference-hero', 'reference-hero-mobile'],
      targetEvidenceIds: ['target-responsive-hero', 'target-hero', 'target-hero-mobile'],
      reviewable: false,
    })
  })

  it('does not invent layout, interaction, or responsive changes for equal observed evidence', () => {
    const reference = capture('reference')
    const target = capture('target')
    reference.evidence!.sections[0].observedStyles = {
      layout: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' },
    }
    target.evidence!.sections[0].observedStyles = structuredClone(reference.evidence!.sections[0].observedStyles)
    addHoverEvidence(reference, 'rgb(34, 85, 255)')
    addHoverEvidence(target, 'rgb(34, 85, 255)')
    addMobileEvidence(reference, 3)
    addMobileEvidence(target, 3)

    const observedCategories = compareReferenceCaptures(reference, target).categories.filter((category) =>
      ['layout', 'interaction-states', 'responsive'].includes(category.category),
    )
    expect(observedCategories.map(({ category, status }) => [category, status])).toEqual([
      ['layout', 'unchanged'],
      ['interaction-states', 'unchanged'],
      ['responsive', 'unchanged'],
    ])
    expect(observedCategories.flatMap(({ changes }) => changes)).toEqual([])
  })

  it('reports no change in the comparable subset while disclosing excluded observations', () => {
    const reference = capture('reference')
    const target = capture('target')
    addHoverEvidence(reference, 'rgb(34, 85, 255)')
    addHoverEvidence(target, 'rgb(34, 85, 255)')
    addUnpairedFocusEvidence(reference)
    addMobileEvidence(reference, 3)
    addMobileEvidence(target, 3)
    addAmbiguousSections(reference)
    addAmbiguousSections(target)

    const result = compareReferenceCaptures(reference, target)
    const categories = new Map(result.categories.map((category) => [category.category, category]))

    expect(result.entityMatching?.summary.sections.ambiguousGroups).toBe(1)
    expect(categories.get('layout')).toMatchObject({
      status: 'unchanged',
      coverage: 'partial',
      limitations: ['section-level-properties-only', 'unresolved-entities-excluded'],
      changes: [],
    })
    expect(categories.get('interaction-states')).toMatchObject({
      status: 'unchanged',
      coverage: 'partial',
      limitations: ['observed-interaction-styles-only', 'interaction-observations-unpaired'],
      changes: [],
    })
    expect(categories.get('responsive')).toMatchObject({
      status: 'unchanged',
      coverage: 'partial',
      limitations: ['matched-responsive-observations-only', 'responsive-observations-unpaired'],
      changes: [],
    })
  })

  it('keeps responsive comparison inconclusive when no behavior observation can be paired', () => {
    const reference = capture('reference')
    const target = capture('target')
    addMobileEvidence(reference, 3)
    addMobileEvidence(target, 3)
    target.evidence!.responsiveObservations = []

    const responsive = compareReferenceCaptures(reference, target).categories.find(
      (category) => category.category === 'responsive',
    )!
    expect(responsive).toMatchObject({
      status: 'inconclusive',
      coverage: 'none',
      limitations: ['matched-responsive-observations-only', 'responsive-observations-unpaired'],
      changes: [],
    })
  })

  it('returns inconclusive instead of a verdict when routes differ', () => {
    const result = compareReferenceCaptures(
      capture('reference', 'https://example.com/products'),
      capture('target', 'https://example.com/pricing'),
    )

    expect(result.status).toBe('inconclusive')
    expect(result.comparability.reasons).toContain('route-mismatch')
    expect(result.comparability.reasons).toContain('page-set-mismatch')
    expect(result.entityMatching).toBeNull()
    expect(result.categories.filter((category) => category.status === 'inconclusive')).toHaveLength(7)
    expect(result.categories.filter((category) => category.status === 'not-supported')).toHaveLength(0)
  })

  it('returns inconclusive when page health evidence is missing', () => {
    const target = capture('target')
    delete target.evidence!.pages[0].health
    const result = compareReferenceCaptures(capture('reference'), target)

    expect(result.status).toBe('inconclusive')
    expect(result.comparability.reasons).toContain('missing-page-health')
  })

  it('returns inconclusive when a capture setting differs', () => {
    const target = capture('target')
    target.manifest!.request.maxPages = 2
    const result = compareReferenceCaptures(capture('reference'), target)

    expect(result.status).toBe('inconclusive')
    expect(result.comparability.reasons).toContain('capture-settings-mismatch')
    expect(result.comparability.differences).toContainEqual({
      field: 'request.maxPages',
      reference: '1',
      target: '2',
      effect: 'inconclusive',
    })
  })

  it('returns inconclusive when the normalized request schema is missing', () => {
    const target = capture('target')
    delete target.manifest!.request.schemaVersion
    const result = compareReferenceCaptures(capture('reference'), target)

    expect(result.status).toBe('inconclusive')
    expect(result.comparability.reasons).toContain('capture-settings-mismatch')
    expect(result.comparability.differences).toContainEqual({
      field: 'request.schemaVersion',
      reference: '"1"',
      target: null,
      effect: 'inconclusive',
    })
  })

  it('reports browser version changes as a limitation without inventing token drift', () => {
    const target = capture('target')
    target.manifest!.environment.browser.version = '129.0.0.0'
    const result = compareReferenceCaptures(capture('reference'), target)

    expect(result.status).toBe('unchanged')
    expect(result.comparability.limitations).toContain('browser-environment-differs')
  })
})
