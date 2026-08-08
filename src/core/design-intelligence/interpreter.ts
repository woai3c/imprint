import type { AiImageInput } from '../ai/provider.js'
import { callAiProvider } from '../ai/provider.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { dedupeProfileClaims } from './claim-dedupe.js'
import {
  createEvidenceFingerprint,
  listEvidencePackageIds,
  restrictEvidencePackageImages,
  selectEvidencePackage,
} from './evidence-selector.js'
import { extractObservationCandidate, validateSectionObservations } from './observation-pass.js'
import {
  DESIGN_PROFILE_PROMPT_VERSION,
  buildDesignInterpretationPrompt,
  buildDesignProfileRepairPrompt,
  buildSectionObservationPrompt,
} from './prompt.js'
import type {
  AnalysisCapabilityLevel,
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
  observationImages?: AiImageInput[]
  synthesisImages?: AiImageInput[]
  requireImageObservations?: string[]
  // Structural observation results are reusable while the page structure is unchanged
  // (for example when only extracted tokens differ between two runs of the same site).
  observationCache?: ObservationCache
  observationCacheKey?: string
}

export interface CallDetail {
  pass: string
  input?: number
  output?: number
  cached?: boolean
  durationMs?: number
}

export interface ObservationCache {
  get(key: string): SectionObservation[] | undefined
  set(key: string, observations: SectionObservation[]): void
}

export interface InterpretationPipelineResult {
  profile: DesignProfile
  status: 'complete' | 'partial'
  pipeline: 'single-pass' | 'two-pass'
  imageObservationsValid?: boolean
  rejected?: string[]
  dedupedClaims?: number
  model?: string
  usage?: {
    input?: number
    output?: number
  }
  callDetails: CallDetail[]
}

function shouldRepairProfile(candidate: unknown, rejected: string[]): boolean {
  return (
    candidate !== null &&
    typeof candidate === 'object' &&
    rejected.some((reason) => /:(?:missing-evidence|unsupported-evidence-kind)$/.test(reason))
  )
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, value)
}

function citationDiagnostics(candidate: unknown, rejected: string[], evidencePackage: EvidencePackage): string {
  const validEvidenceIds = listEvidencePackageIds(evidencePackage)
  return rejected
    .filter((reason) => /:(?:missing-evidence|unsupported-evidence-kind)$/.test(reason))
    .slice(0, 6)
    .map((reason) => {
      const path = reason.slice(0, reason.indexOf(':'))
      const claim = valueAtPath(candidate, path)
      if (!claim || typeof claim !== 'object') return `${path}[shape=missing]`
      const record = claim as Record<string, unknown>
      const citations = Array.isArray(record.evidence) ? record.evidence : []
      const citationIds = citations.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const evidenceId = (item as Record<string, unknown>).evidenceId
        return typeof evidenceId === 'string' ? [evidenceId] : []
      })
      const tokenRefs = Array.isArray(record.tokenRefs)
        ? record.tokenRefs.filter((item): item is string => typeof item === 'string')
        : []
      return `${path}[citations=${citations.length},ids=${citationIds.length},valid=${citationIds.filter((id) => validEvidenceIds.has(id)).length},tokenRefs=${tokenRefs.length}]`
    })
    .join(', ')
}

export function splitImagesByPass(
  evidence: DesignEvidence,
  images: AiImageInput[],
): { observationImages: AiImageInput[]; synthesisImages: AiImageInput[] } {
  const kindById = new Map(evidence.pages.flatMap((page) => page.images).map((image) => [image.id, image.kind]))
  const idOf = (image: AiImageInput) => image.name.replace(/\.[^.]+$/, '')
  return {
    observationImages: images.filter((image) => kindById.get(idOf(image)) === 'region-crop'),
    synthesisImages: images.filter((image) => kindById.get(idOf(image)) !== 'region-crop'),
  }
}

async function runObservationPass(
  evidencePackage: EvidencePackage,
  language: 'en' | 'zh-CN',
  invoke: InterpretationInvoke,
  images: AiImageInput[],
  callDetails: CallDetail[],
): Promise<SectionObservation[] | null> {
  try {
    const prompt = buildSectionObservationPrompt(evidencePackage, language)
    const response = await invoke(prompt, images)
    callDetails.push({
      pass: 'observation',
      input: response.usage?.input,
      output: response.usage?.output,
      durationMs: response.durationMs,
    })
    const validation = validateSectionObservations(extractObservationCandidate(response.text), evidencePackage)
    return validation.observations.length > 0 ? validation.observations : null
  } catch {
    return null
  }
}

export async function runInterpretationPipeline(
  evidence: DesignEvidence,
  evidencePackage: EvidencePackage,
  options: InterpretationPipelineOptions,
): Promise<InterpretationPipelineResult> {
  const callDetails: CallDetail[] = []
  const cachedObservations =
    options.observationCache && options.observationCacheKey
      ? options.observationCache.get(options.observationCacheKey)
      : undefined
  let observations: SectionObservation[] | null
  if (cachedObservations && cachedObservations.length > 0) {
    observations = cachedObservations
    callDetails.push({ pass: 'observation', input: 0, output: 0, cached: true })
  } else {
    observations = await runObservationPass(
      evidencePackage,
      options.language,
      options.invoke,
      options.observationImages || [],
      callDetails,
    )
    if (observations && options.observationCache && options.observationCacheKey) {
      options.observationCache.set(options.observationCacheKey, observations)
    }
  }
  const prompt = buildDesignInterpretationPrompt(evidencePackage, options.language, observations || undefined)
  const synthesisImages = options.synthesisImages || []
  const validateCandidate = (candidate: unknown) =>
    validateDesignProfile(
      candidate,
      evidence,
      options.mode,
      options.language,
      listEvidencePackageIds(evidencePackage),
      options.requireImageObservations ? { requireImageObservations: options.requireImageObservations } : undefined,
    )
  const response = await options.invoke(prompt, synthesisImages)
  callDetails.push({
    pass: 'synthesis',
    input: response.usage?.input,
    output: response.usage?.output,
    durationMs: response.durationMs,
  })
  if (!response.text) throw new Error('DesignProfile output is empty')
  let candidate = extractProfileCandidate(response.text)
  let validation = validateCandidate(candidate)
  let finalResponse = response
  let repairAttempted = false
  if (!validation.profile && shouldRepairProfile(candidate, validation.rejected)) {
    repairAttempted = true
    const repairPrompt = buildDesignProfileRepairPrompt(
      evidencePackage,
      options.language,
      candidate,
      validation.rejected,
    )
    const repairResponse = await options.invoke(repairPrompt, [])
    callDetails.push({
      pass: 'synthesis-repair',
      input: repairResponse.usage?.input,
      output: repairResponse.usage?.output,
      durationMs: repairResponse.durationMs,
    })
    if (repairResponse.text) {
      candidate = extractProfileCandidate(repairResponse.text)
      validation = validateCandidate(candidate)
      finalResponse = repairResponse
    }
  }
  if (!validation.profile) {
    const diagnostics = citationDiagnostics(candidate, validation.rejected, evidencePackage)
    throw new Error(
      `DesignProfile output failed validation: ${validation.rejected.slice(0, 4).join('; ')}; repair-attempted=${repairAttempted}${diagnostics ? `; citation-shapes=${diagnostics}` : ''}`,
    )
  }
  const deduped = dedupeProfileClaims(validation.profile)
  const totalUsage = callDetails.reduce(
    (acc, d) => ({
      input: (acc.input || 0) + (d.input || 0),
      output: (acc.output || 0) + (d.output || 0),
    }),
    {} as { input?: number; output?: number },
  )
  return {
    profile: deduped.profile,
    status: validation.status === 'complete' ? 'complete' : 'partial',
    pipeline: observations ? 'two-pass' : 'single-pass',
    imageObservationsValid: validation.imageObservationsValid,
    rejected: validation.rejected.length > 0 ? validation.rejected : undefined,
    dedupedClaims: deduped.removed > 0 ? deduped.removed : undefined,
    model: finalResponse.model || response.model,
    usage: totalUsage.input || totalUsage.output ? totalUsage : finalResponse.usage || response.usage,
    callDetails,
  }
}

export async function interpretDesignEvidence(
  evidence: DesignEvidence,
  options: InterpretEvidenceOptions,
): Promise<InterpretEvidenceResult> {
  if (options.mode === 'multimodal' && evidence.source.accessMode !== 'anonymous') {
    throw new Error('Screenshot interpretation is unavailable for signed-in evidence')
  }
  const timeoutSignal = AbortSignal.timeout(120_000)
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
  const { observationImages, synthesisImages } = splitImagesByPass(evidence, images)
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
        },
        prompt,
        passImages,
      ),
    observationImages,
    synthesisImages,
    requireImageObservations:
      options.mode === 'multimodal' ? synthesisImages.map((image) => image.name.replace(/\.[^.]+$/, '')) : undefined,
  })
  const capabilityLevel: AnalysisCapabilityLevel = options.mode === 'multimodal' ? 'multimodal-ai' : 'structural-ai'
  return {
    profile: result.profile,
    meta: {
      status: result.status,
      capabilityLevel,
      inputMode: options.mode,
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
      ),
      inputImageCount: images.length,
      tokenUsage: result.usage,
      callDetails: result.callDetails,
    },
  }
}
