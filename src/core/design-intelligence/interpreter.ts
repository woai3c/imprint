import type { AiImageInput } from '../ai/provider.js'
import { aiPipelineTimeoutMs, callAiProvider } from '../ai/provider.js'
import { validateColorRenames } from '../analyzer/token-renamer.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { buildAnalysisDigest } from './analysis-digest.js'
import { dedupeProfileClaims } from './claim-dedupe.js'
import { expandCompactProfileCandidate, extractCompactProfileCandidate } from './compact-profile.js'
import { checkProfileContradictions } from './contradiction-checker.js'
import { buildEvidenceFallbackProfile, repairProfileCoverage } from './evidence-fallback.js'
import { listEvidencePackageIds, restrictEvidencePackageImages, selectEvidencePackage } from './evidence-selector.js'
import { createEvidenceFingerprint } from './input-fingerprint.js'
import {
  DESIGN_PROFILE_PROMPT_VERSION,
  buildCompactDesignInterpretationPrompt,
  prepareAnalysisDigestPackageForPrompt,
} from './prompt.js'
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
import { extractProfileCandidate, validateDesignProfile } from './validator.js'

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
}

function isRepairDiagnostic(reason: string): boolean {
  return /(?:scope-repaired|property-normalized|sanitized|contradicts-(?:responsive-layout|overflow-source|mobile-capture)-facts|contradicts-validated-token-refs)/.test(
    reason,
  )
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
  evidencePackage: EvidencePackage,
  options: InterpretationPipelineOptions,
): Promise<InterpretationPipelineResult> {
  const startedAt = Date.now()
  const digestStartedAt = Date.now()
  const digestPackage = prepareAnalysisDigestPackageForPrompt(buildAnalysisDigest(evidence, evidencePackage))
  const prompt = buildCompactDesignInterpretationPrompt(digestPackage, options.language)
  const digestMs = Date.now() - digestStartedAt
  const digestChars = JSON.stringify(digestPackage.digest).length
  const synthesisImages = (options.synthesisImages || []).map((image) => {
    const stableId = image.name.replace(/\.[^.]+$/, '')
    const shortId = digestPackage.evidenceShortIdMap.get(stableId)
    if (!shortId) return image
    const extension = image.name.match(/\.[^.]+$/)?.[0] || ''
    return { ...image, name: `${shortId}${extension}` }
  })

  const invokeStartedAt = Date.now()
  const response = await options.invoke(prompt, synthesisImages)
  const aiInvokeMs = response.durationMs ?? Date.now() - invokeStartedAt
  const callDetails: CallDetail[] = [
    {
      pass: 'synthesis',
      input: response.usage?.input,
      output: response.usage?.output,
      durationMs: aiInvokeMs,
      transportAttempts: response.transportAttempts,
      transportMs: response.transportMs,
    },
  ]
  if (!response.text) throw new Error('DesignProfile output is empty')

  const validationStartedAt = Date.now()
  const compactCandidate = extractCompactProfileCandidate(response.text)
  const expanded = compactCandidate
    ? expandCompactProfileCandidate(compactCandidate, digestPackage, options.language, options.mode)
    : { profile: extractProfileCandidate(response.text), aliases: [] }
  const candidateSchemaVersion =
    expanded.profile && typeof expanded.profile === 'object' && 'schemaVersion' in expanded.profile
      ? String(expanded.profile.schemaVersion)
      : null
  const validation =
    candidateSchemaVersion === DESIGN_PROFILE_SCHEMA_VERSION
      ? validateDesignProfile(
          expanded.profile,
          evidence,
          options.mode,
          options.language,
          listEvidencePackageIds(evidencePackage),
          options.requireImageObservations ? { requireImageObservations: options.requireImageObservations } : undefined,
        )
      : {
          profile: null,
          status: 'failed' as const,
          rejected: [
            `root:stale-schemaVersion(${JSON.stringify(candidateSchemaVersion)},expected=${JSON.stringify(DESIGN_PROFILE_SCHEMA_VERSION)})`,
          ],
        }
  const evidenceFallback = !validation.profile
  const fallbackReason = `DesignProfile output failed validation: ${validation.rejected.slice(0, 8).join('; ')}; repair-attempted=false`
  const validatedProfile =
    validation.profile || buildEvidenceFallbackProfile(evidence, options.language, options.mode, fallbackReason)
  const unsupportedAliases = expanded.aliases.filter((alias) => !/^palette-\d+$/.test(alias.tokenId))
  const paletteAliases = expanded.aliases.filter((alias) => /^palette-\d+$/.test(alias.tokenId))
  const aliasValidation = validateColorRenames(evidence.tokens, paletteAliases)
  validatedProfile.tokenAliases = validation.profile ? aliasValidation.accepted : []
  const contradictionCheck = checkProfileContradictions(validatedProfile, evidence)
  const deduped = evidenceFallback
    ? { profile: contradictionCheck.profile, removed: 0 }
    : dedupeProfileClaims(
        contradictionCheck.profile,
        buildEvidenceFallbackProfile(
          evidence,
          options.language,
          options.mode,
          'A required AI claim duplicated an earlier design claim',
        ),
      )
  const coverageRepair = repairProfileCoverage(deduped.profile, evidence)
  const validationMs = Date.now() - validationStartedAt
  const validationDiagnostics = [
    ...validation.rejected,
    ...unsupportedAliases.map((_, index) => `tokenAliases.${index}:non-palette-token-sanitized`),
    ...aliasValidation.rejected.map((item, index) => `tokenAliases.${index}:${item.reason}-sanitized`),
    ...contradictionCheck.rejected,
  ]
  const rejected = validationDiagnostics.filter((reason) => !isRepairDiagnostic(reason))
  const repaired = [
    ...validationDiagnostics.filter(isRepairDiagnostic),
    ...(deduped.removed > 0 ? [`claims:deduplicated(${deduped.removed})`] : []),
    ...coverageRepair.repaired,
  ]
  const postValidationRepair =
    validationDiagnostics.length > 0 || deduped.removed > 0 || coverageRepair.repaired.length > 0
  const budgetExceeded: string[] = []
  if ((response.usage?.input || 0) > 16_000) budgetExceeded.push('ai-input-tokens')
  if ((response.usage?.output || 0) > 6_000) budgetExceeded.push('ai-output-tokens')

  return {
    profile: coverageRepair.profile,
    status: !evidenceFallback && validation.status === 'complete' && !postValidationRepair ? 'complete' : 'partial',
    pipeline: 'single-pass',
    imageObservationsValid: validation.imageObservationsValid,
    rejected: rejected.length > 0 ? rejected : undefined,
    repaired: repaired.length > 0 ? repaired : undefined,
    dedupedClaims: deduped.removed > 0 ? deduped.removed : undefined,
    model: response.model,
    usage: response.usage,
    callDetails,
    promptChars: prompt.length,
    digestChars,
    evidenceFallback: evidenceFallback || undefined,
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
  const timeoutSignal = AbortSignal.timeout(aiPipelineTimeoutMs(options.provider.thinkingEnabled === true))
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
          reasoningEffort: options.provider.reasoningEffort,
          thinkingEnabled: options.provider.thinkingEnabled,
          maxOutputTokens: 4096,
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
    },
  }
}
