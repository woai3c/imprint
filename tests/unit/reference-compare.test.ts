import { describe, expect, it } from 'vitest'

import {
  type ReferenceCaptureInput,
  compareReferenceCaptures,
  routeIdentityFromUrl,
} from '../../src/core/analyzer/reference-compare.js'
import type { CaptureManifest, DesignToken } from '../../src/core/analyzer/types.js'
import { opaqueRouteIdentity } from '../../src/core/analyzer/url-identity.js'
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
        tokenRefs: ['color.primary'],
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

function addHoverTransformEvidence(
  input: ReferenceCaptureInput,
  observations: Array<{ before?: string; after: string }>,
): void {
  input.evidence!.interactionObservations = observations.map((observation, index) => ({
    id: `${input.analysisId}-hover-transform-${index + 1}`,
    pageId: `${input.analysisId}-page`,
    sectionId: `${input.analysisId}-hero`,
    targetId: `${input.analysisId}-action-${index + 1}`,
    driver: 'hover',
    safety: 'passive',
    trigger: { kind: 'css-pseudo-class:hover' },
    before: observation.before === undefined ? {} : { transform: observation.before },
    after: { transform: observation.after },
    changedProperties: ['transform'],
    evidenceRefs: [`${input.analysisId}-hero`],
  }))
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

function addPage(
  input: ReferenceCaptureInput,
  pathname: string,
  options: { eligible?: boolean; issue?: 'large-overlay' } = {},
): void {
  const captureEvidence = input.evidence!
  const basePage = captureEvidence.pages[0]
  const baseSection = captureEvidence.sections[0]
  const suffix = pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  const pageId = `${input.analysisId}-page-${suffix}`
  const pageUrl = new URL(pathname, input.url).toString()
  const eligible = options.eligible !== false
  captureEvidence.pages.push({
    ...structuredClone(basePage),
    id: pageId,
    url: pageUrl,
    health: eligible
      ? structuredClone(basePage.health)
      : {
          ...structuredClone(basePage.health!),
          status: 'degraded',
          overlayAreaRatio: 0.4,
          evidenceEligible: false,
          issues: [{ code: options.issue || 'large-overlay', severity: 'warning', recoverable: true }],
        },
  })
  captureEvidence.sections.push({
    ...structuredClone(baseSection),
    id: `${input.analysisId}-hero-${suffix}`,
    pageId,
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

  it('keeps persisted entry identities distinct without exposing query text', () => {
    const alpha = opaqueRouteIdentity('https://example.com/products?doc=alpha#panel')
    const beta = opaqueRouteIdentity('https://example.com/products?doc=beta')

    expect(alpha).toMatch(/^route-[a-f0-9]{12}$/)
    expect(beta).toMatch(/^route-[a-f0-9]{12}$/)
    expect(alpha).not.toBe(beta)
    expect(`${alpha}${beta}`).not.toContain('doc')
    expect(`${alpha}${beta}`).not.toContain('alpha')

    const reference = capture('reference-entry')
    const target = capture('target-entry')
    reference.routeIdentity = alpha
    target.routeIdentity = beta
    const result = compareReferenceCaptures(reference, target)
    expect(result.status).toBe('inconclusive')
    expect(result.comparability.reasons).toContain('route-mismatch')
  })

  it('infers one query entry route across multiple viewport captures', () => {
    const addEntryRoute = (input: ReferenceCaptureInput, url: string) => {
      const routeId = opaqueRouteIdentity(url)
      input.evidence!.pages[0].routeId = routeId
      addMobileEvidence(input, 2)
      input.evidence!.pages.forEach((page) => {
        page.url = url
        page.routeId = routeId
      })
    }
    const alphaReference = capture('alpha-reference', 'https://example.com/app?doc=alpha')
    const alphaTarget = capture('alpha-target', 'https://example.com/app?doc=alpha')
    addEntryRoute(alphaReference, 'https://example.com/app?doc=alpha')
    addEntryRoute(alphaTarget, 'https://example.com/app?doc=alpha')
    expect(compareReferenceCaptures(alphaReference, alphaTarget).status).toBe('unchanged')

    const betaTarget = capture('beta-target', 'https://example.com/app?doc=beta')
    addEntryRoute(betaTarget, 'https://example.com/app?doc=beta')
    const mismatched = compareReferenceCaptures(alphaReference, betaTarget)
    expect(mismatched.status).toBe('inconclusive')
    expect(mismatched.comparability.reasons).toContain('route-mismatch')
    expect(mismatched.reference.routeIdentity).not.toBe(mismatched.target.routeIdentity)
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
      ?.changes.find((item) => item.tokenPath === 'color.primary')

    expect(result.status).toBe('changed')
    expect(primaryChange).toMatchObject({ kind: 'changed', from: '#2255ff', to: '#dd3322' })
    expect(primaryChange?.referenceEvidenceIds).toEqual(['reference-hero'])
    expect(primaryChange?.targetEvidenceIds).toEqual(['target-hero'])
  })

  it('compares rendered local typography candidates without promoting them to portable tokens', () => {
    const localFontSize = (value: string): DesignToken => ({
      ...tokens(),
      candidates: {
        values: [
          {
            group: 'typography.fontSizes',
            value,
            sourcePath: 'typography.fontSizes.1',
            rejectionReason: 'local-scope',
            evidence: {
              value,
              confidence: 'low',
              measurementConfidence: 'low',
              semanticConfidence: 'low',
              reuseScope: 'local',
              observationCount: 1,
              pageCount: 1,
              captureCount: 1,
              eligiblePageCount: 1,
              pageSupportRatio: 1,
              pages: ['https://example.com/products'],
              sources: ['rendered:text'],
              reasons: ['rendered-use'],
            },
          },
        ],
      },
    })
    const result = compareReferenceCaptures(
      capture('reference', undefined, localFontSize('32px')),
      capture('target', undefined, localFontSize('40px')),
    )
    const typography = result.categories.find((category) => category.category === 'typography')!

    expect(typography.status).toBe('changed')
    expect(typography.changes).toMatchObject([
      { kind: 'removed', from: '32px' },
      { kind: 'added', to: '40px' },
    ])
    expect(typography.changes.every((item) => item.tokenPath.startsWith('candidate.typography-fontsizes.'))).toBe(true)
  })

  it('ignores declaration-only typography candidates in reference comparison', () => {
    const targetTokens = tokens({
      candidates: {
        values: [
          {
            group: 'typography.fontSizes',
            value: '40px',
            sourcePath: 'typography.fontSizes.1',
            rejectionReason: 'declared-only',
            evidence: {
              value: '40px',
              confidence: 'low',
              semanticConfidence: 'low',
              reuseScope: 'declared-only',
              observationCount: 0,
              pageCount: 0,
              captureCount: 0,
              eligiblePageCount: 1,
              pageSupportRatio: 0,
              pages: [],
              sources: ['css-variable:--unused-heading'],
              reasons: ['declared-token', 'declared-only'],
            },
          },
        ],
      },
    })

    const typography = compareReferenceCaptures(
      capture('reference'),
      capture('target', undefined, targetTokens),
    ).categories.find((category) => category.category === 'typography')!

    expect(typography.status).toBe('unchanged')
    expect(typography.changes).toEqual([])
  })

  it('compares rendered local spacing and radius candidates without promoting them', () => {
    const localScales = (spacing: string, radius: string): DesignToken => ({
      ...tokens(),
      candidates: {
        values: [
          { group: 'spacing', value: spacing, sourcePath: 'spacing.2' },
          { group: 'radii', value: radius, sourcePath: 'radii.1' },
        ].map((candidate) => ({
          ...candidate,
          rejectionReason: 'local-scope' as const,
          evidence: {
            value: candidate.value,
            confidence: 'low' as const,
            semanticConfidence: 'low' as const,
            reuseScope: 'local' as const,
            observationCount: 1,
            pageCount: 1,
            captureCount: 1,
            eligiblePageCount: 1,
            pageSupportRatio: 1,
            pages: ['https://example.com/products'],
            sources: [`usage:${candidate.group === 'spacing' ? 'spacing' : 'radius'}`],
            reasons: ['computed-style' as const],
          },
        })),
      },
    })
    const result = compareReferenceCaptures(
      capture('reference', undefined, localScales('2px', '12px')),
      capture('target', undefined, localScales('4px', '14px')),
    )

    for (const categoryName of ['spacing', 'radii'] as const) {
      const category = result.categories.find((item) => item.category === categoryName)!
      expect(category.status).toBe('changed')
      expect(category.changes).toHaveLength(2)
      expect(
        category.changes.every(
          (change) => change.referenceEvidenceIds.length > 0 || change.targetEvidenceIds.length > 0,
        ),
      ).toBe(true)
    }
  })

  it('uses public one-based token references for portable scale changes', () => {
    const targetTokens = tokens({ spacing: ['8px'] })
    const spacing = compareReferenceCaptures(
      capture('reference'),
      capture('target', undefined, targetTokens),
    ).categories.find((category) => category.category === 'spacing')!

    expect(spacing.changes).toContainEqual(
      expect.objectContaining({ kind: 'removed', tokenPath: 'spacing.2', from: '16px' }),
    )
    expect(spacing.changes.some((item) => item.tokenPath === 'spacing.1')).toBe(false)
  })

  it('compares a rendered local semantic color candidate by role', () => {
    const localAccent = (value: string): DesignToken => ({
      ...tokens(),
      candidates: {
        values: [
          {
            group: 'colors',
            role: 'accent',
            value,
            sourcePath: 'colors.accent',
            rejectionReason: 'local-scope',
            evidence: {
              value,
              confidence: 'low',
              semanticConfidence: 'low',
              reuseScope: 'local',
              observationCount: 1,
              pageCount: 1,
              captureCount: 1,
              eligiblePageCount: 1,
              pageSupportRatio: 1,
              pages: ['https://example.com/products'],
              sources: ['usage:accentColor'],
              reasons: ['computed-style'],
            },
          },
        ],
      },
    })
    const colors = compareReferenceCaptures(
      capture('reference', undefined, localAccent('#7c3aed')),
      capture('target', undefined, localAccent('#d946ef')),
    ).categories.find((category) => category.category === 'colors')!

    expect(colors.status).toBe('changed')
    expect(colors.changes).toContainEqual(
      expect.objectContaining({
        tokenPath: 'color.accent',
        kind: 'changed',
        from: '#7c3aed',
        to: '#d946ef',
        referenceEvidenceIds: ['reference-page'],
        targetEvidenceIds: ['target-page'],
      }),
    )
  })

  it('compares roleless observed colors and preserves equal-value semantic ownership', () => {
    const observedColor = (value: string, role?: string): DesignToken => ({
      ...tokens(),
      candidates: {
        values: [
          {
            group: 'colors',
            ...(role ? { role } : {}),
            value,
            provenance: 'observed-color',
            rejectionReason: 'unassigned-role',
            evidence: {
              value,
              confidence: 'low',
              semanticConfidence: 'low',
              reuseScope: 'local',
              observationCount: 2,
              ownerCount: 2,
              semanticAgreement: role ? 1 : 0,
              pageCount: 1,
              captureCount: 1,
              eligiblePageCount: 1,
              pageSupportRatio: 1,
              pages: ['https://example.com/products'],
              sources: ['usage:bgColor'],
              reasons: ['rendered-use'],
            },
          },
        ],
      },
    })
    const removed = compareReferenceCaptures(
      capture('reference', undefined, observedColor('#7c3aed')),
      capture('target'),
    ).categories.find((category) => category.category === 'colors')!
    const reassigned = compareReferenceCaptures(
      capture('reference-role', undefined, observedColor('#7c3aed', 'background')),
      capture('target-role', undefined, observedColor('#7c3aed', 'foreground')),
    ).categories.find((category) => category.category === 'colors')!

    expect(removed.changes).toContainEqual(expect.objectContaining({ kind: 'removed', from: '#7c3aed' }))
    expect(reassigned.changes).toHaveLength(2)
    expect(reassigned.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'removed', from: '#7c3aed' }),
        expect.objectContaining({ kind: 'added', to: '#7c3aed' }),
      ]),
    )
  })

  it('reports provenance drift when an observed color keeps the same role and value', () => {
    const observedColor = (pageCount: number, sources: string[]): DesignToken => ({
      ...tokens(),
      candidates: {
        values: [
          {
            group: 'colors',
            role: 'background',
            value: '#7c3aed',
            provenance: 'observed-color',
            rejectionReason: 'unassigned-role',
            evidence: {
              value: '#7c3aed',
              confidence: pageCount > 1 ? 'medium' : 'low',
              measurementConfidence: pageCount > 1 ? 'medium' : 'low',
              semanticConfidence: 'medium',
              reuseScope: pageCount > 1 ? 'foundation' : 'local',
              observationCount: pageCount * 2,
              ownerCount: pageCount * 2,
              semanticAgreement: 1,
              pageCount,
              captureCount: pageCount,
              eligiblePageCount: 2,
              pageSupportRatio: pageCount / 2,
              pages: Array.from({ length: pageCount }, (_, index) => `https://example.com/page-${index + 1}`),
              sources,
              sourceCounts: Object.fromEntries(sources.map((source) => [source, pageCount * 2])),
              roleCounts: { background: pageCount * 2 },
              reasons: ['rendered-use', 'computed-style'],
            },
          },
        ],
      },
    })
    const colors = compareReferenceCaptures(
      capture('reference', undefined, observedColor(1, ['computed:background'])),
      capture('target', undefined, observedColor(2, ['computed:background', 'computed:pseudo-before'])),
    ).categories.find((category) => category.category === 'colors')!

    expect(colors.status).toBe('changed')
    expect(colors.changes).toHaveLength(1)
    expect(colors.changes[0]).toMatchObject({
      kind: 'changed',
      tokenPath: expect.stringMatching(/^candidate\.colors\..+\.provenance$/),
    })
    expect(colors.changes[0]?.from).toContain('computed:background')
    expect(colors.changes[0]?.to).toContain('computed:pseudo-before')
  })

  it('uses persisted opaque page references when query routes share one sanitized URL', () => {
    const observedColor = (pageRef: string): DesignToken => ({
      ...tokens(),
      candidates: {
        values: [
          {
            group: 'colors',
            role: 'background',
            value: '#7c3aed',
            provenance: 'observed-color',
            rejectionReason: 'unassigned-role',
            evidence: {
              value: '#7c3aed',
              confidence: 'low',
              measurementConfidence: 'low',
              semanticConfidence: 'medium',
              reuseScope: 'local',
              observationCount: 1,
              ownerCount: 1,
              semanticAgreement: 1,
              pageCount: 1,
              captureCount: 1,
              eligiblePageCount: 1,
              pageSupportRatio: 1,
              pages: ['https://example.com/products'],
              pageRefs: [pageRef],
              sources: ['computed:background'],
              sourceCounts: { 'computed:background': 1 },
              roleCounts: { background: 1 },
              reasons: ['rendered-use', 'computed-style'],
            },
          },
        ],
      },
    })
    const addSanitizedQueryRoutes = (input: ReferenceCaptureInput, order: string[]) => {
      const captureEvidence = input.evidence!
      const basePage = captureEvidence.pages[0]
      const pages = new Map(
        ['route-alpha', 'route-beta'].map((routeId) => [
          routeId,
          {
            ...structuredClone(basePage),
            id: `${input.analysisId}-${routeId}`,
            url: 'https://example.com/products',
            routeId,
          },
        ]),
      )
      captureEvidence.pages = order.map((routeId) => pages.get(routeId)!)
      captureEvidence.sections[0].pageId = `${input.analysisId}-route-alpha`
    }
    const reference = capture('reference-query', 'https://example.com/products', observedColor('route-alpha'))
    const target = capture('target-query', 'https://example.com/products', observedColor('route-alpha'))
    addSanitizedQueryRoutes(reference, ['route-alpha', 'route-beta'])
    addSanitizedQueryRoutes(target, ['route-beta', 'route-alpha'])
    const persistedTarget = JSON.parse(JSON.stringify(target)) as ReferenceCaptureInput

    const colors = compareReferenceCaptures(reference, persistedTarget).categories.find(
      (category) => category.category === 'colors',
    )!

    expect(colors.status).toBe('unchanged')
    expect(colors.changes).toEqual([])

    const legacyTarget = structuredClone(persistedTarget)
    delete legacyTarget.tokens.candidates?.values?.[0]?.evidence.pageRefs
    delete legacyTarget.evidence?.tokens.candidates?.values?.[0]?.evidence.pageRefs
    const legacyResult = compareReferenceCaptures(reference, legacyTarget)
    expect(legacyResult.status).toBe('inconclusive')
    expect(legacyResult.comparability.reasons).toContain('ambiguous-page-provenance')

    const movedTarget = capture('moved-query', 'https://example.com/products', observedColor('route-beta'))
    addSanitizedQueryRoutes(movedTarget, ['route-beta', 'route-alpha'])
    const movedColors = compareReferenceCaptures(reference, movedTarget).categories.find(
      (category) => category.category === 'colors',
    )!
    expect(movedColors.status).toBe('changed')
    expect(movedColors.changes).toHaveLength(1)
  })

  it('rejects duplicate legacy public capture keys before page maps can overwrite them', () => {
    const addAmbiguousLegacyPage = (input: ReferenceCaptureInput) => {
      const first = input.evidence!.pages[0]
      input.evidence!.pages.push({ ...structuredClone(first), id: `${input.analysisId}-second-page` })
    }
    const reference = capture('legacy-reference')
    const target = capture('legacy-target')
    addAmbiguousLegacyPage(reference)
    addAmbiguousLegacyPage(target)

    const result = compareReferenceCaptures(reference, target)

    expect(result.status).toBe('inconclusive')
    expect(result.comparability.reasons).toContain('ambiguous-page-provenance')
    expect(result.comparability.comparedPageKeys).toEqual([])
    expect(result.categories.every((category) => category.changes.length === 0)).toBe(true)
    expect(result.entityMatching).toBeNull()
  })

  it('compares candidate semantics even when their literal is also a portable color', () => {
    const withOverlappingBorderCandidate = (source: string): DesignToken => ({
      ...tokens(),
      candidates: {
        values: [
          {
            group: 'colors',
            role: 'border',
            value: '#2255ff',
            provenance: 'observed-color',
            rejectionReason: 'unassigned-role',
            evidence: {
              value: '#2255ff',
              confidence: 'low',
              measurementConfidence: 'medium',
              semanticConfidence: 'low',
              reuseScope: 'local',
              observationCount: 2,
              ownerCount: 2,
              semanticAgreement: 1,
              pageCount: 1,
              captureCount: 1,
              eligiblePageCount: 1,
              pageSupportRatio: 1,
              pages: ['https://example.com/products'],
              sources: [source],
              sourceCounts: { [source]: 2 },
              roleCounts: { border: 2 },
              reasons: ['rendered-use', 'computed-style'],
            },
          },
        ],
      },
    })
    const colors = compareReferenceCaptures(
      capture('reference', undefined, withOverlappingBorderCandidate('computed:border')),
      capture('target', undefined, withOverlappingBorderCandidate('computed:pseudo-before')),
    ).categories.find((category) => category.category === 'colors')!

    expect(colors.status).toBe('changed')
    expect(colors.changes).toHaveLength(1)
    expect(colors.changes[0]).toMatchObject({
      kind: 'changed',
      tokenPath: expect.stringMatching(/^candidate\.colors\..+\.provenance$/),
    })
    expect(colors.changes[0]?.from).toContain('computed:border')
    expect(colors.changes[0]?.to).toContain('computed:pseudo-before')
  })

  it('does not report a palette change when only generated palette indexes move', () => {
    const referenceTokens = tokens({
      colors: { background: '#ffffff', primary: '#2255ff', 'palette-1': '#f8fafc' },
    })
    const targetTokens = tokens({
      colors: { background: '#ffffff', primary: '#2255ff', 'palette-2': '#f8fafc' },
    })
    const colors = compareReferenceCaptures(
      capture('reference', undefined, referenceTokens),
      capture('target', undefined, targetTokens),
    ).categories.find((category) => category.category === 'colors')!

    expect(colors.status).toBe('unchanged')
    expect(colors.changes).toEqual([])
  })

  it('continues to report a real palette value change at a stable index', () => {
    const referenceTokens = tokens({
      colors: { background: '#ffffff', primary: '#2255ff', 'palette-1': '#f8fafc' },
    })
    const targetTokens = tokens({
      colors: { background: '#ffffff', primary: '#2255ff', 'palette-1': '#111827' },
    })
    const colors = compareReferenceCaptures(
      capture('reference', undefined, referenceTokens),
      capture('target', undefined, targetTokens),
    ).categories.find((category) => category.category === 'colors')!

    expect(colors.status).toBe('changed')
    expect(colors.changes).toHaveLength(1)
    expect(colors.changes[0]).toMatchObject({
      kind: 'changed',
      tokenPath: 'color.palette-1',
      from: '#f8fafc',
      to: '#111827',
    })
  })

  it('reports conservative section-level layout changes from paired evidence', () => {
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
    })
  })

  it('does not report equivalent authored and computed transform representations as interaction changes', () => {
    const reference = capture('reference')
    const target = capture('target')
    addHoverTransformEvidence(reference, [
      { before: 'none', after: 'matrix(1, 0, 0, 1, 0, -2)' },
      { after: 'translateY(-2px)' },
    ])
    addHoverTransformEvidence(target, [{ after: 'translateY(-2px)' }])

    const interaction = compareReferenceCaptures(reference, target).categories.find(
      (category) => category.category === 'interaction-states',
    )!

    expect(interaction.status).toBe('unchanged')
    expect(interaction.changes).toEqual([])
  })

  it('continues to report transforms with different rendered effects', () => {
    const reference = capture('reference')
    const target = capture('target')
    addHoverTransformEvidence(reference, [{ before: 'none', after: 'matrix(1, 0, 0, 1, 0, -2)' }])
    addHoverTransformEvidence(target, [{ before: 'none', after: 'translateY(-8px)' }])

    const interaction = compareReferenceCaptures(reference, target).categories.find(
      (category) => category.category === 'interaction-states',
    )!

    expect(interaction.status).toBe('changed')
    expect(interaction.changes).toHaveLength(1)
  })

  it('prioritizes directly observed transforms over inactive stylesheet candidates', () => {
    const reference = capture('reference')
    const target = capture('target')
    addHoverTransformEvidence(reference, [
      { before: 'none', after: 'matrix(1, 0, 0, 1, 0, -2)' },
      { after: 'translateY(-2px)' },
      { after: 'translateY(-6px)' },
    ])
    addHoverTransformEvidence(target, [
      { before: 'none', after: 'matrix(1, 0, 0, 1, 0, -6)' },
      { after: 'translateY(-2px)' },
      { after: 'translateY(-6px)' },
    ])

    const interaction = compareReferenceCaptures(reference, target).categories.find(
      (category) => category.category === 'interaction-states',
    )!

    expect(interaction.status).toBe('changed')
    expect(interaction.changes).toHaveLength(1)
    expect(interaction.changes[0]).toMatchObject({
      from: 'transform: matrix(1, 0, 0, 1, 0, 0) → matrix(1, 0, 0, 1, 0, -2)',
      to: 'transform: matrix(1, 0, 0, 1, 0, 0) → matrix(1, 0, 0, 1, 0, -6)',
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
    })
  })

  it('does not report responsive drift when computed grid widths change but column counts stay the same', () => {
    const reference = capture('reference')
    const target = capture('target')
    addMobileEvidence(reference, 2)
    addMobileEvidence(target, 2)
    reference.evidence!.responsiveObservations[0].changes.gridTemplateColumns = {
      from: '565.188px 376.797px',
      to: '277px',
    }
    target.evidence!.responsiveObservations[0].changes.gridTemplateColumns = {
      from: '550.797px 367.203px',
      to: '261px',
    }

    const responsive = compareReferenceCaptures(reference, target).categories.find(
      (category) => category.category === 'responsive',
    )!

    expect(responsive.status).toBe('unchanged')
    expect(responsive.changes).toEqual([])
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

  it('excludes matching unhealthy pages and compares the remaining eligible subset', () => {
    const reference = capture('reference')
    const target = capture('target')
    for (const pathname of ['/blocked-one', '/blocked-two']) {
      addPage(reference, pathname, { eligible: false, issue: 'large-overlay' })
      addPage(target, pathname, { eligible: false, issue: 'large-overlay' })
    }

    target.tokens = tokens({ colors: { background: '#ffffff', primary: '#dd3322' } })
    target.evidence!.sections.find((section) => section.pageId === 'target-page-blocked-one')!.order = 5

    const result = compareReferenceCaptures(reference, target)

    expect(result.status).toBe('unchanged')
    expect(result.comparability.reasons).toEqual([])
    expect(result.comparability.comparedPageKeys).toEqual(['https://example.com/products::desktop'])
    expect(result.comparability.excludedPages).toEqual([
      {
        pageKey: 'https://example.com/blocked-one::desktop',
        url: 'https://example.com/blocked-one',
        viewport: 'desktop',
        issueCodes: ['large-overlay'],
      },
      {
        pageKey: 'https://example.com/blocked-two::desktop',
        url: 'https://example.com/blocked-two',
        viewport: 'desktop',
        issueCodes: ['large-overlay'],
      },
    ])
    expect(result.comparability.limitations).toContain('unhealthy-pages-excluded')
    expect(result.categories.find((category) => category.category === 'colors')).toMatchObject({
      status: 'unchanged',
      coverage: 'partial',
      changes: [],
    })
    expect(result.categories.find((category) => category.category === 'layout')?.changes).toEqual([])
    expect(
      result.entityMatching?.sections.every((match) => match.pageKey === 'https://example.com/products::desktop'),
    ).toBe(true)
  })

  it('allows an unmatched page only when it is ineligible and the eligible page sets still align', () => {
    const reference = capture('reference')
    const target = capture('target')
    addPage(target, '/blocked-only-later', { eligible: false })

    const result = compareReferenceCaptures(reference, target)

    expect(result.status).toBe('unchanged')
    expect(result.comparability.reasons).toEqual([])
    expect(result.comparability.excludedPages.map((page) => page.pageKey)).toEqual([
      'https://example.com/blocked-only-later::desktop',
    ])
  })

  it('returns inconclusive when no common page is eligible', () => {
    const reference = capture('reference')
    const target = capture('target')
    reference.evidence!.pages[0].health = {
      ...reference.evidence!.pages[0].health!,
      status: 'degraded',
      evidenceEligible: false,
      issues: [{ code: 'large-overlay', severity: 'warning', recoverable: true }],
    }
    target.evidence!.pages[0].health = structuredClone(reference.evidence!.pages[0].health)

    const result = compareReferenceCaptures(reference, target)

    expect(result.status).toBe('inconclusive')
    expect(result.comparability.reasons).toContain('no-common-eligible-pages')
    expect(result.comparability.comparedPageKeys).toEqual([])
  })

  it('returns inconclusive when the eligible page sets cannot be aligned', () => {
    const reference = capture('reference')
    const target = capture('target')
    addPage(reference, '/eligible-only-earlier')

    const result = compareReferenceCaptures(reference, target)

    expect(result.status).toBe('inconclusive')
    expect(result.comparability.reasons).toContain('page-set-mismatch')
    expect(result.comparability.comparedPageKeys).toEqual([])
  })

  it('compares aligned eligible pages with partial coverage instead of rejecting the whole capture', () => {
    const reference = capture('reference')
    const target = capture('target')
    target.evidence!.coverage.pageCoverage = 'partial'
    target.evidence!.coverage.captureCoverage!.status = 'partial'

    const result = compareReferenceCaptures(reference, target)

    expect(result.status).toBe('unchanged')
    expect(result.comparability.reasons).toEqual([])
    expect(result.comparability.limitations).toContain('incomplete-coverage')
    expect(result.categories.find((category) => category.category === 'colors')?.coverage).toBe('partial')
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

  it('records a tool version change as non-blocking', () => {
    const target = capture('target')
    target.manifest!.tool.version = '0.0.4'
    const result = compareReferenceCaptures(capture('reference'), target)

    expect(result.status).toBe('unchanged')
    expect(result.comparability.reasons).toEqual([])
    expect(result.comparability.limitations).toContain('tool-version-differs')
    expect(result.comparability.differences).toContainEqual({
      field: 'tool.version',
      reference: '"0.0.3"',
      target: '"0.0.4"',
      effect: 'limitation',
    })
  })
})
