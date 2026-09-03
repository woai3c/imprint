import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizeColorValue } from '../../src/core/analyzer/color-cluster.js'
import { analyze, findBrowser } from '../../src/core/analyzer/index.js'
import { compareReferenceCaptures } from '../../src/core/analyzer/reference-compare.js'
import { generateDesignDoc } from '../../src/core/export/index.js'
import type { FixtureAnnotation } from './annotation-types.js'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

const annotations: FixtureAnnotation[] = fs
  .readdirSync(fixturesDir)
  .filter((name) => name.endsWith('.annotations.json'))
  .sort()
  .map((name) => JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8')) as FixtureAnnotation)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

let server: http.Server | undefined
let baseUrl = ''
let healthRecoveryRequests = 0
const activeFixtureVariants = new Map<string, 'reference' | 'changed'>()
const browserAvailable = Boolean(findBrowser())

beforeAll(async () => {
  server = http.createServer((request, response) => {
    const name = decodeURIComponent((request.url || '/').replace(/^\//, '').split('?')[0])
    if (name === 'health-recovery.html') {
      healthRecoveryRequests += 1
      const body =
        healthRecoveryRequests === 1
          ? '<!doctype html><html><body><main><div></div></main></body></html>'
          : '<!doctype html><html><body><main><h1>Recovered neutral fixture</h1><p>Stable content is now available for evidence extraction.</p></main></body></html>'
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
        'content-type': MIME['.html'],
      })
      response.end(body)
      return
    }
    const filePath = path.join(fixturesDir, name)
    if (!filePath.startsWith(fixturesDir) || !fs.existsSync(filePath)) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    const source = fs.readFileSync(filePath)
    const variant = activeFixtureVariants.get(name)
    const body =
      variant === 'changed'
        ? Buffer.from(source.toString('utf8').replace('<html lang="en">', '<html lang="en" data-variant="changed">'))
        : source
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': body.length,
      'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
    })
    response.end(body)
  })
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (typeof address === 'object' && address) baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve))
})

async function analyzeFixture(fixture: string, dataDir: string) {
  return analyze(`${baseUrl}/${fixture}.html`, {
    viewports: ['desktop', 'mobile'],
    maxPages: 1,
    useSession: false,
    dataDir,
  })
}

async function analyzeKnownChangeFixture(
  fixture: string,
  variant: 'reference' | 'changed',
  dataDir: string,
  viewports: Array<'desktop' | 'mobile'> = ['desktop'],
  maxPages = 1,
) {
  const fixtureName = `${fixture}.html`
  activeFixtureVariants.set(fixtureName, variant)
  try {
    return await analyze(`${baseUrl}/${fixtureName}`, {
      viewports,
      maxPages,
      useSession: false,
      dataDir,
    })
  } finally {
    activeFixtureVariants.delete(fixtureName)
  }
}

describe('Design Evidence browser regression corpus', () => {
  it.skipIf(!browserAvailable)(
    'recovers one committed empty document before excluding the entry capture',
    { timeout: 60_000 },
    async () => {
      healthRecoveryRequests = 0
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-health-recovery-'))
      const result = await analyze(`${baseUrl}/health-recovery.html`, {
        viewports: ['desktop'],
        maxPages: 1,
        useSession: false,
        dataDir,
      })

      expect(healthRecoveryRequests).toBe(2)
      expect(result.designEvidence.pages).toHaveLength(1)
      expect(result.designEvidence.coverage.pageCoverage).toBe('complete')
      expect(result.designEvidence.pages[0].health?.status).toBe('healthy')
    },
  )

  it.skipIf(!browserAvailable)('serves every fixture and annotation pair', () => {
    expect(annotations).toHaveLength(15)
    for (const annotation of annotations) {
      expect(fs.existsSync(path.join(fixturesDir, `${annotation.fixture}.html`))).toBe(true)
    }
  })

  for (const annotation of annotations) {
    it.skipIf(!browserAvailable)(
      `extracts complete, stable, and harness-valid evidence: ${annotation.fixture}`,
      { timeout: 240_000 },
      async () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-design-evidence-regression-'))
        const result = await analyzeFixture(annotation.fixture, dataDir)
        const evidence = result.designEvidence

        const actualRoles = new Set(evidence.sections.map((section) => section.role))
        for (const role of annotation.expectedSectionRoles) {
          expect(actualRoles, `missing section role ${role}`).toContain(role)
        }
        expect(evidence.sections.length).toBeGreaterThanOrEqual(annotation.minSections)
        if (annotation.expectedPageRole) {
          expect(new Set(evidence.pages.map((page) => page.role))).toEqual(new Set([annotation.expectedPageRole]))
        }

        const actualComponentTypes = new Set(evidence.components.map((component) => component.type))
        for (const type of annotation.expectedComponentTypes) {
          expect(actualComponentTypes, `missing component type ${type}`).toContain(type)
        }
        if (annotation.expectedComponentRoles) {
          const componentRoles = new Set(evidence.components.flatMap((component) => component.role || []))
          for (const role of annotation.expectedComponentRoles) {
            expect(componentRoles, `missing component semantic role ${role}`).toContain(role)
          }
        }
        if (annotation.expectedElementKinds) {
          const elementKinds = new Set(evidence.components.flatMap((component) => component.elementKind || []))
          for (const kind of annotation.expectedElementKinds) {
            expect(elementKinds, `missing component element kind ${kind}`).toContain(kind)
          }
        }
        if (annotation.expectedDesktopComponentCounts) {
          const desktopPageIds = new Set(
            evidence.pages.filter((page) => page.viewport === 'desktop').map((page) => page.id),
          )
          for (const [type, expectedCount] of Object.entries(annotation.expectedDesktopComponentCounts)) {
            expect(
              evidence.components.filter(
                (component) => component.type === type && desktopPageIds.has(component.pageId),
              ),
              `unexpected desktop ${type} instance count`,
            ).toHaveLength(expectedCount)
          }
        }

        expect(evidence.coverage.viewportCoverage).toContain('desktop')
        expect(evidence.coverage.viewportCoverage).toContain('mobile')
        expect(evidence.coverage.sectionCoverage).toBeGreaterThanOrEqual(annotation.minSectionCoverage)

        if (annotation.minSafelyObservedInteractions > 0) {
          expect(evidence.coverage.interactionCoverage.safelyObserved).toBeGreaterThanOrEqual(
            annotation.minSafelyObservedInteractions,
          )
        }

        if (annotation.expectedResponsiveChangeTypesAny.length > 0) {
          const changeTypes = new Set(evidence.responsiveObservations.map((observation) => observation.changeType))
          const matched = annotation.expectedResponsiveChangeTypesAny.some((changeType) =>
            changeTypes.has(changeType as never),
          )
          expect(matched, `expected one of ${annotation.expectedResponsiveChangeTypesAny.join(', ')}`).toBe(true)
        }

        if (annotation.minMediaLayers > 0) {
          expect(evidence.mediaLayers.length).toBeGreaterThanOrEqual(annotation.minMediaLayers)
        }
        if (annotation.expectedMediaKinds.length > 0) {
          const kinds = new Set(evidence.mediaLayers.map((layer) => layer.kind))
          for (const kind of annotation.expectedMediaKinds) {
            expect(kinds, `missing media kind ${kind}`).toContain(kind)
          }
        }

        if (annotation.expectedSalienceTraits.length > 0) {
          const traits = new Set(evidence.layoutNodes.flatMap((node) => node.traits))
          for (const trait of annotation.expectedSalienceTraits) {
            expect(traits, `missing salience trait ${trait}`).toContain(trait)
          }
        }

        if (annotation.expectedFeatureTags) {
          for (const tag of annotation.expectedFeatureTags) {
            expect(evidence.featureTags, `missing feature tag ${tag}`).toContain(tag)
          }
        }
        if (annotation.forbiddenFeatureTags) {
          for (const tag of annotation.forbiddenFeatureTags) {
            expect(evidence.featureTags, `unexpected feature tag ${tag}`).not.toContain(tag)
          }
        }
        for (const claim of evidence.deterministicClaims || []) {
          expect(['high', 'medium', 'low']).toContain(claim.confidence)
          expect(claim.reasons.length).toBeGreaterThan(0)
          expect(claim.evidenceRefs.length).toBeGreaterThan(0)
          expect(claim.provenance.length).toBeGreaterThan(0)
        }
        if (annotation.expectedDeterministicClaims) {
          const claimLabels = new Set((evidence.deterministicClaims || []).map((claim) => claim.label))
          for (const label of annotation.expectedDeterministicClaims) {
            expect(claimLabels, `missing deterministic claim ${label}`).toContain(label)
          }
        }
        if (annotation.expectedPrimary) {
          expect(normalizeColorValue(result.tokens.colors.primary)).toBe(annotation.expectedPrimary)
        }
        if (annotation.forbiddenPrimary) expect(result.tokens.colors.primary).toBeUndefined()
        for (const [name, expected] of Object.entries(annotation.expectedColorTokens || {})) {
          const actual = result.tokens.colors[name]
          expect(actual, `missing color token ${name}`).toBeDefined()
          expect(actual ? normalizeColorValue(actual) : undefined, `unexpected color token ${name}`).toBe(expected)
        }
        for (const [role, expected] of Object.entries(annotation.expectedSemanticPairs || {})) {
          expect(
            result.tokens.colorRoles?.semanticPairs?.[
              role as keyof NonNullable<typeof result.tokens.colorRoles.semanticPairs>
            ],
          ).toMatchObject(expected)
        }
        if (annotation.forbiddenGenericAccents) {
          const genericAccents = [result.tokens.colors.primary, result.tokens.colors.accent]
            .flatMap((value) => (value ? [normalizeColorValue(value)] : []))
            .filter(Boolean)
          for (const color of annotation.forbiddenGenericAccents) {
            expect(genericAccents, `status color ${color} promoted to a generic accent`).not.toContain(color)
          }
        }
        if (annotation.expectedObservedPrimaryForeground) {
          expect(result.tokens.colorRoles?.primaryAction?.observedForeground).toBe(
            annotation.expectedObservedPrimaryForeground,
          )
        }
        if (annotation.expectedPrimaryContrastRatio !== undefined) {
          expect(result.tokens.colorRoles?.primaryAction?.contrastRatio).toBeCloseTo(
            annotation.expectedPrimaryContrastRatio,
            1,
          )
          expect(result.tokens.colorRoles?.primaryAction?.contrastWarning).toBeDefined()
        }
        if (annotation.expectedTitle) expect(evidence.source.title).toBe(annotation.expectedTitle)
        if (annotation.forbiddenScalarRadii) {
          for (const radius of annotation.forbiddenScalarRadii) expect(result.tokens.radii).not.toContain(radius)
        }
        if (annotation.expectedStructuralTreatments) {
          const observedStyles = evidence.sections.flatMap((section) => section.observedStyles || [])
          const gradients = observedStyles.flatMap((styles) => styles.gradient || [])
          const treatments = annotation.expectedStructuralTreatments
          if (treatments.gradientType) {
            expect(gradients.some((gradient) => gradient.type === treatments.gradientType)).toBe(true)
          }
          if (treatments.gradientDirection) {
            expect(gradients.some((gradient) => gradient.direction === treatments.gradientDirection)).toBe(true)
          }
          for (const stop of treatments.gradientStops || []) {
            expect(gradients.flatMap((gradient) => gradient.stops).join(' ')).toContain(stop)
          }
          for (const radius of treatments.borderRadii || []) {
            expect(observedStyles.flatMap((styles) => styles.borderRadius || [])).toContain(radius)
          }
        }
        if (annotation.maxMajorMediaRegions !== undefined) {
          expect(
            evidence.coverage.mediaCoverage.majorRegions,
            `too many major media regions (icons must stay out of the major count)`,
          ).toBeLessThanOrEqual(annotation.maxMajorMediaRegions)
        }

        const observedSectionLayouts = evidence.sections.flatMap((section) => section.observedStyles?.layout || [])
        for (const maxWidth of annotation.expectedMaxWidths || []) {
          expect(
            observedSectionLayouts.some((layout) => layout.maxWidth === maxWidth),
            `missing max-width ${maxWidth}`,
          ).toBe(true)
        }
        for (const expected of annotation.expectedStickySections || []) {
          expect(
            evidence.sections.some(
              (section) =>
                section.role === expected.role &&
                section.layoutMode === 'sticky' &&
                section.observedStyles?.layout?.height === expected.height,
            ),
            `missing sticky ${expected.role} at ${expected.height}`,
          ).toBe(true)
        }
        const columnCount = (value: string): number => value.trim().split(/\s+/).filter(Boolean).length
        for (const expected of annotation.expectedResponsiveColumns || []) {
          expect(
            evidence.responsiveObservations.some((observation) =>
              Object.entries(observation.changes || {}).some(
                ([property, values]) =>
                  property.toLowerCase().endsWith('gridtemplatecolumns') &&
                  typeof values.from === 'string' &&
                  typeof values.to === 'string' &&
                  columnCount(values.from) === expected.from &&
                  columnCount(values.to) === expected.to,
              ),
            ),
            `missing responsive columns ${expected.from} → ${expected.to}`,
          ).toBe(true)
        }
        for (const expected of annotation.expectedResponsiveValues || []) {
          expect(
            evidence.responsiveObservations.some((observation) => {
              const change = observation.changes?.[expected.property]
              return change?.from === expected.from && change.to === expected.to
            }),
            `missing responsive ${expected.property}: ${expected.from} → ${expected.to}`,
          ).toBe(true)
        }
        const pseudoKinds = new Set((evidence.pseudoElements || []).map((pseudo) => pseudo.kind))
        for (const kind of annotation.expectedPseudoKinds || []) expect(pseudoKinds).toContain(kind)
        const layoutBorders = evidence.layoutNodes.flatMap((node) => Object.values(node.observedStyles || {}))
        for (const border of annotation.expectedLayoutBorders || []) {
          expect(
            layoutBorders.some((value) => value.includes(border)),
            `missing layout border ${border}`,
          ).toBe(true)
        }
        for (const expected of annotation.expectedInteractionValues || []) {
          expect(
            evidence.interactionObservations.some(
              (observation) =>
                observation.driver === expected.driver &&
                observation.before[expected.property] === expected.from &&
                observation.after[expected.property] === expected.to,
            ),
            `missing ${expected.driver} ${expected.property}: ${expected.from} → ${expected.to}`,
          ).toBe(true)
        }
        const normalizedColors = new Set(
          Object.values(result.tokens.colors).flatMap((color) => normalizeColorValue(color) || []),
        )
        for (const color of annotation.forbiddenColors || []) expect(normalizedColors).not.toContain(color)
        for (const family of annotation.forbiddenFontFamilies || []) {
          expect(result.tokens.typography.fontFamilies).not.toContain(family)
        }

        const designDoc = generateDesignDoc(
          result.tokens,
          result.finalUrl,
          result.featureTags,
          undefined,
          result.breakpoints,
          result.components,
          'en',
          evidence,
        )
        expect(designDoc).toContain('### Reconstruction Summary')
        expect(designDoc.indexOf('### Reconstruction Summary')).toBeLessThan(designDoc.indexOf('## Colors'))
        expect(designDoc).not.toContain('base grid spacing')
        expect(designDoc).not.toContain('rich type scale')
        for (const text of annotation.expectedDesignDocStrings || []) expect(designDoc).toContain(text)
        for (const [name, expectedCount] of Object.entries(annotation.expectedDesignDocComponentCounts || {})) {
          const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          expect(designDoc, `unexpected DESIGN.md ${name} canonical instance count`).toMatch(
            new RegExp(`^- ${escapedName}: \\d+ observed patterns, ${expectedCount} canonical instances,`, 'm'),
          )
        }
        const reconstructionSummary = designDoc.slice(
          designDoc.indexOf('### Reconstruction Summary'),
          designDoc.indexOf('## Colors'),
        )
        for (const text of annotation.expectedReconstructionSummaryStrings || []) {
          expect(reconstructionSummary, `missing Reconstruction Summary fact: ${text}`).toContain(text)
        }
        for (const text of annotation.forbiddenReconstructionSummaryStrings || []) {
          expect(reconstructionSummary, `unexpected Reconstruction Summary fact: ${text}`).not.toContain(text)
        }

        const rerun = await analyzeFixture(annotation.fixture, dataDir)
        expect(rerun.designEvidence.sections.map((section) => section.id)).toEqual(
          evidence.sections.map((section) => section.id),
        )
        const stability = compareReferenceCaptures(
          {
            analysisId: result.analysisId,
            url: result.finalUrl,
            tokens: result.tokens,
            evidence: result.designEvidence,
            manifest: result.captureManifest,
          },
          {
            analysisId: rerun.analysisId,
            url: rerun.finalUrl,
            tokens: rerun.tokens,
            evidence: rerun.designEvidence,
            manifest: rerun.captureManifest,
          },
        )
        expect(stability.comparability.reasons, 'repeat capture must remain comparable').toEqual([])
        expect(stability.status, 'repeat capture must not report token drift').toBe('unchanged')
      },
    )
  }

  const knownChangeCases = [
    {
      role: 'calibration',
      fixture: 'known-change-calibration',
      expectedChangedCategories: ['colors', 'typography', 'spacing', 'radii'],
    },
    {
      role: 'holdout',
      fixture: 'known-change-holdout',
      expectedChangedCategories: ['colors', 'radii'],
    },
  ] as const

  for (const knownChange of knownChangeCases) {
    it.skipIf(!browserAvailable)(
      `detects frozen ${knownChange.role} changes without unsupported category drift`,
      { timeout: 240_000 },
      async () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `imprint-${knownChange.role}-`))
        const reference = await analyzeKnownChangeFixture(knownChange.fixture, 'reference', dataDir)
        const target = await analyzeKnownChangeFixture(knownChange.fixture, 'changed', dataDir)
        const comparison = compareReferenceCaptures(
          {
            analysisId: reference.analysisId,
            url: reference.finalUrl,
            tokens: reference.tokens,
            evidence: reference.designEvidence,
            manifest: reference.captureManifest,
          },
          {
            analysisId: target.analysisId,
            url: target.finalUrl,
            tokens: target.tokens,
            evidence: target.designEvidence,
            manifest: target.captureManifest,
          },
        )
        const expected = new Set<string>(knownChange.expectedChangedCategories)
        const actual = new Set(
          comparison.categories
            .filter((category) => category.status === 'changed')
            .map((category) => category.category),
        )
        const falseNegatives = [...expected].filter((category) => !actual.has(category))
        const falsePositives = [...actual].filter((category) => !expected.has(category))

        expect(comparison.comparability.reasons).toEqual([])
        expect(falseNegatives, 'known injected changes must be detected').toEqual([])
        expect(falsePositives, 'unchanged supported categories must remain stable').toEqual([])
        expect(comparison.categories.find((category) => category.category === 'responsive')).toMatchObject({
          status: 'inconclusive',
          coverage: 'none',
          limitations: ['matched-responsive-observations-only', 'single-viewport'],
          changes: [],
        })
      },
    )
  }

  it.skipIf(!browserAvailable)(
    'treats maxPages as an upper bound when a healthy site exposes only the entry page',
    { timeout: 240_000 },
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-page-limit-'))
      const reference = await analyzeKnownChangeFixture(
        'known-change-calibration',
        'reference',
        dataDir,
        ['desktop', 'mobile'],
        3,
      )
      const repeated = await analyzeKnownChangeFixture(
        'known-change-calibration',
        'reference',
        dataDir,
        ['desktop', 'mobile'],
        3,
      )
      const comparison = compareReferenceCaptures(
        {
          analysisId: reference.analysisId,
          url: reference.finalUrl,
          tokens: reference.tokens,
          evidence: reference.designEvidence,
          manifest: reference.captureManifest,
        },
        {
          analysisId: repeated.analysisId,
          url: repeated.finalUrl,
          tokens: repeated.tokens,
          evidence: repeated.designEvidence,
          manifest: repeated.captureManifest,
        },
      )

      expect(reference.designEvidence.coverage).toMatchObject({
        pageCoverage: 'complete',
        urlCoverage: { requested: 1, captured: 1 },
        captureCoverage: { expected: 2, captured: 2, status: 'complete' },
      })
      expect(reference.captureManifest).toMatchObject({
        request: { maxPages: 3 },
        capture: {
          pages: { requested: 3, discovered: 0, selected: 0, analyzed: 1 },
          expected: 2,
          captured: 2,
          status: 'complete',
        },
      })
      expect(comparison.comparability.reasons).toEqual([])
      expect(comparison.status).toBe('unchanged')
    },
  )

  const structuralChangeCases = [
    {
      role: 'calibration',
      fixture: 'known-structural-calibration',
      expectedChangedCategories: ['layout', 'interaction-states', 'responsive'],
    },
    {
      role: 'layout holdout',
      fixture: 'known-structural-layout-holdout',
      expectedChangedCategories: ['layout', 'responsive'],
    },
    {
      role: 'interaction holdout',
      fixture: 'known-structural-interaction-holdout',
      expectedChangedCategories: ['interaction-states'],
    },
  ] as const

  for (const knownChange of structuralChangeCases) {
    it.skipIf(!browserAvailable)(
      `detects frozen structural ${knownChange.role} changes without category drift`,
      { timeout: 300_000 },
      async () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `imprint-structural-${knownChange.role}-`))
        const reference = await analyzeKnownChangeFixture(knownChange.fixture, 'reference', dataDir, [
          'desktop',
          'mobile',
        ])
        const referenceRepeat = await analyzeKnownChangeFixture(knownChange.fixture, 'reference', dataDir, [
          'desktop',
          'mobile',
        ])
        const target = await analyzeKnownChangeFixture(knownChange.fixture, 'changed', dataDir, ['desktop', 'mobile'])
        const captureInput = (result: typeof reference) => ({
          analysisId: result.analysisId,
          url: result.finalUrl,
          tokens: result.tokens,
          evidence: result.designEvidence,
          manifest: result.captureManifest,
        })
        const repeated = compareReferenceCaptures(captureInput(reference), captureInput(referenceRepeat))
        const comparison = compareReferenceCaptures(captureInput(reference), captureInput(target))
        const expected = new Set<string>(knownChange.expectedChangedCategories)
        const actual = new Set(
          comparison.categories
            .filter((category) => category.status === 'changed')
            .map((category) => category.category),
        )
        const falseNegatives = [...expected].filter((category) => !actual.has(category))
        const falsePositives = [...actual].filter((category) => !expected.has(category))

        expect(repeated.comparability.reasons, 'unchanged structural rerun must remain comparable').toEqual([])
        expect(repeated.status, 'unchanged structural rerun must not report drift').toBe('unchanged')
        expect(repeated.categories.flatMap((category) => category.changes)).toEqual([])
        expect(comparison.comparability.reasons).toEqual([])
        expect(falseNegatives, 'known structural changes must be detected').toEqual([])
        expect(
          falsePositives,
          `unchanged categories must not be reported: ${JSON.stringify(
            comparison.categories.filter((category) => !expected.has(category.category)),
          )}`,
        ).toEqual([])
        for (const categoryName of expected) {
          const category = comparison.categories.find((candidate) => candidate.category === categoryName)
          expect(category?.coverage).toBe('partial')
          expect(category?.changes.length).toBeGreaterThan(0)
        }
      },
    )
  }

  it.skipIf(!browserAvailable)(
    'preserves the measured height of an adaptive mobile capture with horizontal overflow',
    { timeout: 240_000 },
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-adaptive-overflow-'))
      const result = await analyze(`${baseUrl}/adaptive-overflow-entry.html`, {
        viewports: ['desktop'],
        maxPages: 2,
        useSession: false,
        dataDir,
        pageDiscovery: 'links',
      })
      const mobile = result.pageScreenshots.find(
        (screenshot) => screenshot.viewport === 'mobile' && screenshot.url.includes('/resilience-long-page.html'),
      )

      expect(mobile).toBeDefined()
      expect(mobile?.valid).toBe(true)
      expect(mobile?.width).toBe(375)
      expect(mobile?.height).toBeGreaterThan(812)
      expect(result.extractionIssues.some((issue) => issue.stage.includes('mobile-adaptive:screenshot:overview'))).toBe(
        false,
      )
    },
  )

  it.skipIf(!browserAvailable)(
    'keeps reliable structural subsets comparable when repeated sections remain ambiguous',
    { timeout: 240_000 },
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-structural-partial-'))
      const reference = await analyzeFixture('known-structural-partial-coverage', dataDir)
      const target = await analyzeFixture('known-structural-partial-coverage', dataDir)
      const comparison = compareReferenceCaptures(
        {
          analysisId: reference.analysisId,
          url: reference.finalUrl,
          tokens: reference.tokens,
          evidence: reference.designEvidence,
          manifest: reference.captureManifest,
        },
        {
          analysisId: target.analysisId,
          url: target.finalUrl,
          tokens: target.tokens,
          evidence: target.designEvidence,
          manifest: target.captureManifest,
        },
      )
      const layout = comparison.categories.find((category) => category.category === 'layout')
      const responsive = comparison.categories.find((category) => category.category === 'responsive')

      expect(comparison.status).toBe('unchanged')
      expect(comparison.entityMatching?.summary.sections.ambiguousGroups).toBeGreaterThan(0)
      expect(layout).toMatchObject({ status: 'unchanged', coverage: 'partial', changes: [] })
      expect(layout?.limitations).toContain('unresolved-entities-excluded')
      expect(responsive).toMatchObject({ status: 'unchanged', coverage: 'partial', changes: [] })
      expect(responsive?.limitations).toContain('responsive-observations-unpaired')
    },
  )
})
