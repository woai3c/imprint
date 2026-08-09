import type { AiImageInput } from '../ai/provider.js'
import { callAiProvider } from '../ai/provider.js'
import { validateColorRenames } from '../analyzer/token-renamer.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { buildAnalysisDigest } from './analysis-digest.js'
import { dedupeProfileClaims } from './claim-dedupe.js'
import { expandCompactProfileCandidate, extractCompactProfileCandidate } from './compact-profile.js'
import { checkProfileContradictions } from './contradiction-checker.js'
import { buildEvidenceFallbackProfile } from './evidence-fallback.js'
import {
  createEvidenceFingerprint,
  listEvidencePackageIds,
  restrictEvidencePackageImages,
  selectEvidencePackage,
} from './evidence-selector.js'
import {
  DESIGN_PROFILE_PROMPT_VERSION,
  buildCompactDesignInterpretationPrompt,
  prepareAnalysisDigestPackageForPrompt,
} from './prompt.js'
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
    },
  ]
  if (!response.text) throw new Error('DesignProfile output is empty')

  const validationStartedAt = Date.now()
  const compactCandidate = extractCompactProfileCandidate(response.text)
  const expanded = compactCandidate
    ? expandCompactProfileCandidate(compactCandidate, digestPackage, options.language, options.mode)
    : { profile: extractProfileCandidate(response.text), aliases: [] }
  const validation = validateDesignProfile(
    expanded.profile,
    evidence,
    options.mode,
    options.language,
    listEvidencePackageIds(evidencePackage),
    options.requireImageObservations ? { requireImageObservations: options.requireImageObservations } : undefined,
  )
  const evidenceFallback = !validation.profile
  const fallbackReason = `DesignProfile output failed validation: ${validation.rejected.slice(0, 8).join('; ')}; repair-attempted=false`
  const validatedProfile =
    validation.profile || buildEvidenceFallbackProfile(evidence, options.language, 'structural-only', fallbackReason)
  validatedProfile.tokenAliases = validation.profile
    ? validateColorRenames(evidence.tokens, expanded.aliases).accepted
    : []
  const contradictionCheck = checkProfileContradictions(validatedProfile, evidence)
  const deduped = evidenceFallback
    ? { profile: contradictionCheck.profile, removed: 0 }
    : dedupeProfileClaims(contradictionCheck.profile)
  const validationMs = Date.now() - validationStartedAt
  const budgetExceeded: string[] = []
  if ((response.usage?.input || 0) > 16_000) budgetExceeded.push('ai-input-tokens')
  if ((response.usage?.output || 0) > 6_000) budgetExceeded.push('ai-output-tokens')

  return {
    profile: deduped.profile,
    status:
      !evidenceFallback && validation.status === 'complete' && contradictionCheck.rejected.length === 0
        ? 'complete'
        : 'partial',
    pipeline: 'single-pass',
    imageObservationsValid: validation.imageObservationsValid,
    rejected:
      validation.rejected.length + contradictionCheck.rejected.length > 0
        ? [...validation.rejected, ...contradictionCheck.rejected]
        : undefined,
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
      aiInvokeMs,
      validationMs,
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
  const timeoutSignal = AbortSignal.timeout(300_000)
  let evidencePackage = selectEvidencePackage(evidence, options.mode)
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
          maxOutputTokens: 4096,
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
      schemaVersion: '1',
      promptVersion: DESIGN_PROFILE_PROMPT_VERSION,
      pipeline: result.pipeline,
      inputFingerprint: createEvidenceFingerprint(
        evidence,
        options.mode,
        options.provider.provider,
        result.model || model,
        evidencePackage.imageIds,
        DESIGN_PROFILE_PROMPT_VERSION,
        '1',
        options.language,
      ),
      inputImageCount: images.length,
      tokenUsage: result.usage,
      callDetails: result.callDetails,
      timing: result.timing,
      rejected: result.rejected,
    },
  }
}
