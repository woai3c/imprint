import type { AiImageInput } from '../ai/provider.js'
import { callAiProvider } from '../ai/provider.js'
import { resolveScreenshotAssetCoverage } from '../design-evidence/asset-integrity.js'
import { hasSevereHorizontalOverflow } from '../design-evidence/reliability.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import {
  buildDeterministicClaimCatalog,
  materializeDesignProfile,
  validateDesignClaimCatalog,
} from './claim-catalog.js'
import { parseClaimSelection } from './claim-selection.js'
import { summarizeInterpretationDiagnostics } from './diagnostic-summary.js'
import { restrictEvidencePackageImages, selectEvidencePackage } from './evidence-selector.js'
import { createEvidenceFingerprint } from './input-fingerprint.js'
import { DESIGN_PROFILE_PROMPT_VERSION, buildClaimSelectionPrompt } from './prompt.js'
import { DESIGN_PROFILE_SCHEMA_VERSION } from './types.js'
import type {
  AnalysisCapabilityLevel,
  AnalysisTiming,
  DesignIntelligenceMeta,
  DesignProfile,
  EvidencePackage,
  IntelligenceInputMode,
  SectionObservation,
} from './types.js'

export const CLAIM_CURATION_TIMEOUT_MS = 120_000

function hasCompleteReusableEvidence(evidence: DesignEvidence): boolean {
  return (
    evidence.coverage.pageCoverage === 'complete' &&
    evidence.coverage.captureCoverage?.status !== 'partial' &&
    resolveScreenshotAssetCoverage(evidence).status === 'complete' &&
    evidence.pages.every((page) => page.health?.aiEligible !== false && !hasSevereHorizontalOverflow(page))
  )
}

export interface InterpretationProviderConfig {
  provider: string
  apiKey: string
  baseUrl?: string
  model?: string
  reasoningEffort?: string
  thinkingEnabled?: boolean
}

export interface InterpretEvidenceOptions {
  mode: IntelligenceInputMode
  language: 'en' | 'zh-CN'
  provider: InterpretationProviderConfig
  images?: AiImageInput[]
}

export interface InterpretEvidenceResult {
  profile: DesignProfile
  meta: DesignIntelligenceMeta
}

export interface InterpretationInvokeResult {
  text: string
  model?: string
  durationMs?: number
  retriedWithoutThinking?: boolean
  finishReason?: string
  transportAttempts?: number
  transportMs?: number
  usage?: {
    input?: number
    output?: number
    reasoning?: number
  }
}

export type InterpretationInvoke = (prompt: string, images: AiImageInput[]) => Promise<InterpretationInvokeResult>

export interface InterpretationPipelineOptions {
  mode: IntelligenceInputMode
  language: 'en' | 'zh-CN'
  invoke: InterpretationInvoke
  synthesisImages?: AiImageInput[]
  requireImageObservations?: string[]
  /** @deprecated Ignored. The default pipeline no longer runs an observation pass. */
  observationImages?: AiImageInput[]
  /** @deprecated Ignored. The default pipeline no longer runs an observation pass. */
  observationCache?: ObservationCache
  /** @deprecated Ignored. The default pipeline no longer runs an observation pass. */
  observationCacheKey?: string
}

export interface CallDetail {
  pass: string
  input?: number
  output?: number
  cached?: boolean
  durationMs?: number
  transportAttempts?: number
  transportMs?: number
}

/** @deprecated The default interpretation path no longer runs or caches an observation pass. */
export interface ObservationCache {
  get(key: string): SectionObservation[] | undefined
  set(key: string, observations: SectionObservation[]): void
}

export interface InterpretationPipelineResult {
  profile: DesignProfile
  status: 'complete' | 'partial'
  pipeline: 'single-pass'
  imageObservationsValid?: boolean
  rejected?: string[]
  repaired?: string[]
  dedupedClaims?: number
  model?: string
  usage?: {
    input?: number
    output?: number
  }
  callDetails: CallDetail[]
  timing: AnalysisTiming
  promptChars: number
  digestChars: number
  evidenceFallback?: boolean
  interpretationCoverage: NonNullable<DesignIntelligenceMeta['interpretationCoverage']>
  diagnosticCounts: NonNullable<DesignIntelligenceMeta['diagnosticCounts']>
  curation: NonNullable<DesignIntelligenceMeta['curation']>
}

export function splitImagesByPass(
  evidence: DesignEvidence,
  images: AiImageInput[],
): { observationImages: AiImageInput[]; synthesisImages: AiImageInput[] } {
  const kindById = new Map(evidence.pages.flatMap((page) => page.images).map((image) => [image.id, image.kind]))
  const idOf = (image: AiImageInput) => image.name.replace(/\.[^.]+$/, '')
  return {
    observationImages: images.filter((image) => kindById.get(idOf(image)) === 'region-crop'),
    // The observation pass no longer runs. Region crops selected for information gain
    // must therefore stay attached to the single synthesis call.
    synthesisImages: images,
  }
}

export async function runInterpretationPipeline(
  evidence: DesignEvidence,
  _evidencePackage: EvidencePackage,
  options: InterpretationPipelineOptions,
): Promise<InterpretationPipelineResult> {
  const startedAt = Date.now()
  const digestStartedAt = Date.now()
  const catalog = buildDeterministicClaimCatalog(evidence, options.language, options.mode)
  const catalogIntegrity = validateDesignClaimCatalog(catalog, evidence)
  if (!catalogIntegrity.valid) {
    throw new Error(`Deterministic claim catalog integrity failed: ${catalogIntegrity.errors.slice(0, 8).join('; ')}`)
  }
  const digestChars = JSON.stringify(catalog).length
  const synthesisImages = options.synthesisImages || []
  const imageIds = synthesisImages.map((image) => image.name.replace(/\.[^.]+$/, ''))
  const prompt = buildClaimSelectionPrompt(catalog, options.language, imageIds)
  const digestMs = Date.now() - digestStartedAt

  const invokeStartedAt = Date.now()
  const response = await options.invoke(prompt, synthesisImages)
  const aiInvokeMs = response.durationMs ?? Date.now() - invokeStartedAt
  const callDetails: CallDetail[] = [
    {
      pass: 'curation',
      input: response.usage?.input,
      output: response.usage?.output,
      durationMs: aiInvokeMs,
      transportAttempts: response.transportAttempts,
      transportMs: response.transportMs,
    },
  ]

  const validationStartedAt = Date.now()
  const selectionResult = parseClaimSelection(response.text || '', catalog)
  const profile = materializeDesignProfile(catalog)
  const validationMs = Date.now() - validationStartedAt
  const rejected = selectionResult.diagnostics
  const evidenceFallback = !selectionResult.valid
  const complete = selectionResult.valid && hasCompleteReusableEvidence(evidence)
  const budgetExceeded: string[] = []
  if ((response.usage?.input || 0) > 16_000) budgetExceeded.push('ai-input-tokens')
  if ((response.usage?.output || 0) > 2_400) budgetExceeded.push('ai-output-tokens')
  const interpretationCoverage: NonNullable<DesignIntelligenceMeta['interpretationCoverage']> = {
    status: selectionResult.valid ? 'complete' : catalog.claims.length > 0 ? 'partial' : 'failed',
    catalogClaims: catalog.claims.length,
    selectedClaims: selectionResult.selection.selectedClaimIds.length,
    invalidSelections: selectionResult.invalidSelections,
  }
  const diagnosticCounts = summarizeInterpretationDiagnostics(rejected)
  const curation: NonNullable<DesignIntelligenceMeta['curation']> = {
    selectedClaimIds: selectionResult.selection.selectedClaimIds,
    ...(selectionResult.selection.summaries ? { summaries: selectionResult.selection.summaries } : {}),
  }

  return {
    profile,
    status: complete ? 'complete' : 'partial',
    pipeline: 'single-pass',
    rejected: rejected.length > 0 ? rejected : undefined,
    model: response.model,
    usage: response.usage,
    callDetails,
    promptChars: prompt.length,
    digestChars,
    evidenceFallback: evidenceFallback || undefined,
    interpretationCoverage,
    diagnosticCounts,
    curation,
    timing: {
      digestMs,
      imageSummaryMs: 0,
      aiQueueMs: 0,
      aiInvokeMs,
      aiNetworkMs: response.transportMs,
      aiTransportAttempts: response.transportAttempts,
      validationMs,
      aiTotalMs: Date.now() - startedAt,
      totalMs: Date.now() - startedAt,
      aiInputTokens: response.usage?.input,
      aiOutputTokens: response.usage?.output,
      imageCount: synthesisImages.length,
      cacheHit: false,
      digestChars,
      promptChars: prompt.length,
      ...(budgetExceeded.length > 0 ? { budgetExceeded } : {}),
    },
  }
}

export async function interpretDesignEvidence(
  evidence: DesignEvidence,
  options: InterpretEvidenceOptions,
): Promise<InterpretEvidenceResult> {
  if (options.mode === 'multimodal' && evidence.source.accessMode !== 'anonymous') {
    throw new Error('Screenshot interpretation is unavailable for signed-in evidence')
  }
  const timeoutSignal = AbortSignal.timeout(CLAIM_CURATION_TIMEOUT_MS)
  let evidencePackage = selectEvidencePackage(evidence, options.mode)
  if (evidencePackage.evidence.pages.length === 0) {
    throw new Error('No page passed the AI evidence health gate')
  }
  const selectedImageIds = new Set(evidencePackage.imageIds)
  const images =
    options.mode === 'multimodal'
      ? (options.images || []).filter((image) => selectedImageIds.has(image.name.replace(/\.[^.]+$/, '')))
      : []
  if (options.mode === 'multimodal') {
    evidencePackage = restrictEvidencePackageImages(
      evidencePackage,
      images.map((image) => image.name.replace(/\.[^.]+$/, '')),
    )
    if (evidencePackage.imageIds.length === 0) {
      throw new Error('Multimodal interpretation requires at least one available evidence image')
    }
  }
  const model = options.provider.model || ''
  const { synthesisImages } = splitImagesByPass(evidence, images)
  const result = await runInterpretationPipeline(evidence, evidencePackage, {
    mode: options.mode,
    language: options.language,
    invoke: (prompt, passImages) =>
      callAiProvider(
        {
          provider: options.provider.provider,
          apiKey: options.provider.apiKey,
          baseUrl: options.provider.baseUrl,
          model: options.provider.model,
          signal: timeoutSignal,
          reasoningEffort: 'low',
          thinkingEnabled: false,
          maxOutputTokens: 2400,
          allowThinkingFallback: false,
        },
        prompt,
        passImages,
      ),
    synthesisImages,
    requireImageObservations:
      options.mode === 'multimodal' ? synthesisImages.map((image) => image.name.replace(/\.[^.]+$/, '')) : undefined,
  })
  const effectiveMode = result.profile.inputMode
  const capabilityLevel: AnalysisCapabilityLevel = result.evidenceFallback
    ? 'evidence-fallback'
    : effectiveMode === 'multimodal'
      ? 'multimodal-ai'
      : 'structural-ai'
  return {
    profile: result.profile,
    meta: {
      status: result.status,
      capabilityLevel,
      inputMode: effectiveMode,
      provider: options.provider.provider,
      model: result.model || model,
      generatedAt: new Date().toISOString(),
      schemaVersion: result.profile.schemaVersion,
      promptVersion: DESIGN_PROFILE_PROMPT_VERSION,
      pipeline: result.pipeline,
      inputFingerprint: createEvidenceFingerprint(
        evidence,
        options.mode,
        options.provider.provider,
        result.model || model,
        evidencePackage.imageIds,
        DESIGN_PROFILE_PROMPT_VERSION,
        DESIGN_PROFILE_SCHEMA_VERSION,
        options.language,
      ),
      inputImageCount: images.length,
      tokenUsage: result.usage,
      callDetails: result.callDetails,
      timing: result.timing,
      rejected: result.rejected,
      repaired: result.repaired,
      interpretationCoverage: result.interpretationCoverage,
      diagnosticCounts: result.diagnosticCounts,
      curation: result.curation,
    },
  }
}
