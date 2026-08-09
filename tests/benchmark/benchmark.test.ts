import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { mimeTypeForPath } from '../../src/core/ai/provider.js'
import { analyze, findBrowser } from '../../src/core/analyzer/index.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import {
  evaluateProfileQuality,
  interpretDesignEvidence,
  listEvidencePackageIds,
  selectEvidencePackage,
  validateDesignProfile,
} from '../../src/core/design-intelligence/index.js'
import type { AnalysisTiming, DesignProfile, ProfileQualityMetrics } from '../../src/core/design-intelligence/index.js'
import type { FixtureAnnotation } from './annotation-types.js'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const baseline = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'baseline.json'), 'utf8'),
) as {
  fixtureCount: number
  programAnalysis: { p50Ms: number; p95Ms: number; allowedRegressionRatio: number }
}
const deterministicTimings: number[] = []

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((first, second) => first - second)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
}

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
const browserAvailable = Boolean(findBrowser())

beforeAll(async () => {
  server = http.createServer((request, response) => {
    const name = decodeURIComponent((request.url || '/').replace(/^\//, '').split('?')[0])
    const filePath = path.join(fixturesDir, name)
    if (!filePath.startsWith(fixturesDir) || !fs.existsSync(filePath)) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    const body = fs.readFileSync(filePath)
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
  if (deterministicTimings.length > 0) {
    const p50Ms = percentile(deterministicTimings, 0.5)
    const p95Ms = percentile(deterministicTimings, 0.95)
    console.log(`PROGRAM timing fixtures=${deterministicTimings.length} p50=${p50Ms}ms p95=${p95Ms}ms`)
    expect(p50Ms).toBeLessThanOrEqual(baseline.programAnalysis.p50Ms * baseline.programAnalysis.allowedRegressionRatio)
    expect(p95Ms).toBeLessThanOrEqual(baseline.programAnalysis.p95Ms * baseline.programAnalysis.allowedRegressionRatio)
  }
})

function referenceClaim(statement: string, evidenceIds: string[]) {
  return {
    statement,
    implementation: 'Use the observed structure and keep the documented rhythm when creating new pages.',
    confidence: 'medium',
    evidence: evidenceIds.map((evidenceId) => ({ evidenceId, note: 'Benchmark reference evidence' })),
  }
}

function buildReferenceProfile(annotation: FixtureAnnotation, evidence: DesignEvidence) {
  const sectionIds = evidence.sections.map((section) => section.id)
  const layoutOrSectionIds = sectionIds.slice(0, 2)
  const interactionId = evidence.interactionObservations[0]?.id
  const responsiveId = evidence.responsiveObservations[0]?.id
  const structuralClaim = (statement: string) => referenceClaim(statement, layoutOrSectionIds)
  const interactionClaim = (statement: string) =>
    referenceClaim(statement, interactionId ? [interactionId] : layoutOrSectionIds)
  return {
    schemaVersion: '1',
    language: 'en',
    inputMode: 'structural-only',
    thesis: structuralClaim(annotation.referenceProfile.thesis),
    signatureMoves: annotation.referenceProfile.signatureMoves.slice(0, 3).map((statement, index) => ({
      ...structuralClaim(statement),
      id: `move-reference-${index + 1}`,
      name: `Reference move ${index + 1}`,
      distinctiveness: statement,
    })),
    composition: {
      containerStrategy: structuralClaim('Containers follow the annotated layout strategy'),
      alignmentStrategy: structuralClaim('Alignment follows the annotated grid strategy'),
      densityAndWhitespace: structuralClaim('Density and whitespace follow the annotated rhythm'),
      rhythm: structuralClaim('Section rhythm follows the annotated sequence'),
    },
    attention: {
      entryPoint: structuralClaim('The hero area forms the primary entry point'),
      visualSequence: [structuralClaim('Attention flows from hero to supporting sections')],
      actionHierarchy: structuralClaim('Primary actions keep the annotated emphasis'),
      contrastStrategy: structuralClaim('Contrast follows the annotated accent strategy'),
    },
    visualLanguage: {
      color: structuralClaim('Color use follows the annotated palette strategy'),
      typography: structuralClaim('Typography follows the annotated type strategy'),
      shape: structuralClaim('Shape language follows the annotated radius strategy'),
      surfaces: structuralClaim('Surfaces follow the annotated surface strategy'),
    },
    sectionGrammar: [
      {
        role: 'hero',
        composition: [structuralClaim('Hero composition follows the annotation')],
        contentRhythm: [structuralClaim('Hero rhythm follows the annotation')],
        transitionToNext: [structuralClaim('Hero transition follows the annotation')],
      },
    ],
    interactionLanguage: {
      primaryDrivers: [interactionClaim('Interactions are driven by the annotated controls')],
      feedbackStyle: interactionClaim('Feedback stays within the annotated motion budget'),
      stateChangeAmplitude: interactionClaim('State changes keep the annotated amplitude'),
      continuityRules: [
        referenceClaim(
          'Responsive behavior keeps the annotated hierarchy across viewports',
          responsiveId ? [responsiveId] : layoutOrSectionIds,
        ),
      ],
    },
    componentGrammar: [
      { component: 'button', role: 'primary action', rules: [structuralClaim('Buttons follow the annotated rules')] },
    ],
    transferRules: {
      preserve: annotation.referenceProfile.transferPreserve.map((statement) => structuralClaim(statement)),
      adapt: [structuralClaim('Content length may change while the structure is preserved')],
      avoid: annotation.referenceProfile.transferAvoid.map((statement) => structuralClaim(statement)),
    },
    uncertainties: [],
  }
}

async function analyzeFixture(fixture: string, dataDir: string) {
  return analyze(`${baseUrl}/${fixture}.html`, {
    viewports: ['desktop', 'mobile'],
    maxPages: 1,
    useSession: false,
    dataDir,
  })
}

describe('Design benchmark corpus', () => {
  it.skipIf(!browserAvailable)('serves every fixture and annotation pair', () => {
    expect(annotations.length).toBeGreaterThanOrEqual(10)
    expect(annotations.length).toBe(baseline.fixtureCount)
    for (const annotation of annotations) {
      expect(fs.existsSync(path.join(fixturesDir, `${annotation.fixture}.html`))).toBe(true)
    }
  })

  for (const annotation of annotations) {
    it.skipIf(!browserAvailable)(
      `extracts complete, stable, and harness-valid evidence: ${annotation.fixture}`,
      { timeout: 240_000 },
      async () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-benchmark-'))
        const result = await analyzeFixture(annotation.fixture, dataDir)
        deterministicTimings.push(result.timing.totalMs)
        const evidence = result.designEvidence

        const actualRoles = new Set(evidence.sections.map((section) => section.role))
        for (const role of annotation.expectedSectionRoles) {
          expect(actualRoles, `missing section role ${role}`).toContain(role)
        }
        expect(evidence.sections.length).toBeGreaterThanOrEqual(annotation.minSections)

        const actualComponentTypes = new Set(evidence.components.map((component) => component.type))
        for (const type of annotation.expectedComponentTypes) {
          expect(actualComponentTypes, `missing component type ${type}`).toContain(type)
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
        if (annotation.maxMajorMediaRegions !== undefined) {
          expect(
            evidence.coverage.mediaCoverage.majorRegions,
            `too many major media regions (icons must stay out of the major count)`,
          ).toBeLessThanOrEqual(annotation.maxMajorMediaRegions)
        }

        const rerun = await analyzeFixture(annotation.fixture, dataDir)
        expect(rerun.designEvidence.sections.map((section) => section.id)).toEqual(
          evidence.sections.map((section) => section.id),
        )

        const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
        const referenceProfile = buildReferenceProfile(annotation, evidence)
        const validation = validateDesignProfile(
          referenceProfile as unknown as DesignProfile,
          evidence,
          'structural-only',
          'en',
          listEvidencePackageIds(evidencePackage),
        )
        expect(validation.profile, `reference profile rejected: ${validation.rejected.join('; ')}`).not.toBeNull()
        const metrics = evaluateProfileQuality(validation.profile!, evidence)
        expect(metrics.groundedness).toBe(1)
        expect(metrics.safety).toBe(1)
      },
    )
  }
})

const onlineProvider = process.env.IMPRINT_BENCHMARK_PROVIDER || ''
const onlineApiKey = process.env.IMPRINT_BENCHMARK_API_KEY || ''
const onlineMode = process.env.IMPRINT_BENCHMARK_VISION === '1' ? 'multimodal' : 'structural-only'

describe.skipIf(!browserAvailable || !onlineProvider || !onlineApiKey)('Design benchmark live interpretation', () => {
  const liveResults: Array<{
    fixture: string
    pipeline?: string
    metrics: ProfileQualityMetrics
    timing?: AnalysisTiming
  }> = []

  afterAll(() => {
    if (liveResults.length === 0) return
    const resultsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results')
    fs.mkdirSync(resultsDir, { recursive: true })
    const timingSummary = {
      aiTotalP50Ms: percentile(
        liveResults.flatMap((result) => (result.timing ? [result.timing.totalMs] : [])),
        0.5,
      ),
      aiTotalP95Ms: percentile(
        liveResults.flatMap((result) => (result.timing ? [result.timing.totalMs] : [])),
        0.95,
      ),
      promptCharsP50: percentile(
        liveResults.flatMap((result) => (result.timing?.promptChars ? [result.timing.promptChars] : [])),
        0.5,
      ),
      inputTokensP50: percentile(
        liveResults.flatMap((result) => (result.timing?.aiInputTokens ? [result.timing.aiInputTokens] : [])),
        0.5,
      ),
      outputTokensP50: percentile(
        liveResults.flatMap((result) => (result.timing?.aiOutputTokens ? [result.timing.aiOutputTokens] : [])),
        0.5,
      ),
      imageCountP50: percentile(
        liveResults.flatMap((result) => (result.timing ? [result.timing.imageCount] : [])),
        0.5,
      ),
    }
    fs.writeFileSync(
      path.join(resultsDir, 'latest.json'),
      JSON.stringify(
        { generatedAt: new Date().toISOString(), mode: onlineMode, timingSummary, results: liveResults },
        null,
        2,
      ),
    )
  })

  for (const annotation of annotations) {
    it(`interprets and scores a live profile: ${annotation.fixture}`, { timeout: 240_000 }, async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-benchmark-live-'))
      const result = await analyzeFixture(annotation.fixture, dataDir)
      const selectedPackage = selectEvidencePackage(result.designEvidence, onlineMode)
      const images =
        onlineMode === 'multimodal'
          ? result.designEvidence.pages
              .flatMap((page) => page.images)
              .filter((image) => selectedPackage.imageIds.includes(image.id) && fs.existsSync(image.path))
              .map((image) => ({
                name: `${image.id}.${mimeTypeForPath(image.path).split('/')[1]}`,
                mimeType: mimeTypeForPath(image.path),
                base64: fs.readFileSync(image.path).toString('base64'),
              }))
          : undefined
      const { profile, meta } = await interpretDesignEvidence(result.designEvidence, {
        mode: onlineMode,
        language: 'en',
        images,
        provider: {
          provider: onlineProvider,
          apiKey: onlineApiKey,
          baseUrl: process.env.IMPRINT_BENCHMARK_BASE_URL || undefined,
          model: process.env.IMPRINT_BENCHMARK_MODEL || undefined,
        },
      })
      const metrics = evaluateProfileQuality(profile, result.designEvidence)
      liveResults.push({ fixture: annotation.fixture, pipeline: meta.pipeline, metrics, timing: meta.timing })
      console.log(
        `LIVE ${annotation.fixture} [${meta.pipeline ?? 'unknown'}] grounded=${metrics.groundedness.toFixed(2)} specific=${metrics.specificity.toFixed(2)} executable=${metrics.executability.toFixed(2)} transferable=${metrics.transferability.toFixed(2)} distinctive=${metrics.distinctiveness.toFixed(2)} restraint=${metrics.restraint.toFixed(2)} safety=${metrics.safety.toFixed(2)}`,
      )
      expect(meta.pipeline).toBe('single-pass')
      expect(metrics.groundedness).toBe(1)
    })
  }
})
