import type { AiImageInput } from '../ai/provider.js'
import { callAiProvider } from '../ai/provider.js'
import type { DesignEvidence } from '../design-evidence/types.js'
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
  usage?: {
    input?: number
    output?: number
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
}

export interface CallDetail {
  pass: string
  input?: number
  output?: number
}

export interface InterpretationPipelineResult {
  profile: DesignProfile
  status: 'complete' | 'partial'
  pipeline: 'single-pass' | 'two-pass'
  imageObservationsValid?: boolean
  rejected?: string[]
  model?: string
  usage?: {
    input?: number
    output?: number
  }
  callDetails: CallDetail[]
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
    callDetails.push({ pass: 'observation', input: response.usage?.input, output: response.usage?.output })
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
  const observations = await runObservationPass(
    evidencePackage,
    options.language,
    options.invoke,
    options.observationImages || [],
    callDetails,
  )
  const prompt = buildDesignInterpretationPrompt(evidencePackage, options.language, observations || undefined)
  const synthesisImages = options.synthesisImages || []
  const validateCandidate = (text: string) =>
    validateDesignProfile(
      extractProfileCandidate(text),
      evidence,
      options.mode,
      options.language,
      listEvidencePackageIds(evidencePackage),
      options.requireImageObservations ? { requireImageObservations: options.requireImageObservations } : undefined,
    )
  const response = await options.invoke(prompt, synthesisImages)
  callDetails.push({ pass: 'synthesis', input: response.usage?.input, output: response.usage?.output })
  if (!response.text) throw new Error('DesignProfile output is empty')
  const validation = validateCandidate(response.text)
  if (!validation.profile) {
    throw new Error(`DesignProfile output failed validation: ${validation.rejected.slice(0, 4).join('; ')}`)
  }
  const totalUsage = callDetails.reduce(
    (acc, d) => ({
      input: (acc.input || 0) + (d.input || 0),
      output: (acc.output || 0) + (d.output || 0),
    }),
    {} as { input?: number; output?: number },
  )
  return {
    profile: validation.profile,
    status: validation.status === 'complete' ? 'complete' : 'partial',
    pipeline: observations ? 'two-pass' : 'single-pass',
    imageObservationsValid: validation.imageObservationsValid,
    rejected: validation.rejected.length > 0 ? validation.rejected : undefined,
    model: response.model,
    usage: totalUsage.input || totalUsage.output ? totalUsage : response.usage,
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
  const timeoutSignal = AbortSignal.timeout(60_000)
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
