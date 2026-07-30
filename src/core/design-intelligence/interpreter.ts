import type { AiImageInput } from '../ai/provider.js'
import { callAiProvider } from '../ai/provider.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import {
  createEvidenceFingerprint,
  listEvidencePackageIds,
  restrictEvidencePackageImages,
  selectEvidencePackage,
} from './evidence-selector.js'
import {
  DESIGN_PROFILE_PROMPT_VERSION,
  buildDesignInterpretationPrompt,
  buildDesignProfileRepairPrompt,
} from './prompt.js'
import type { AnalysisCapabilityLevel, DesignIntelligenceMeta, DesignProfile, IntelligenceInputMode } from './types.js'
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
  const originalPrompt = buildDesignInterpretationPrompt(evidencePackage, options.language)
  let response = await callAiProvider(
    {
      provider: options.provider.provider,
      apiKey: options.provider.apiKey,
      baseUrl: options.provider.baseUrl,
      model: options.provider.model,
      signal: timeoutSignal,
    },
    originalPrompt,
    images,
  )
  let validation = validateDesignProfile(
    extractProfileCandidate(response.text),
    evidence,
    options.mode,
    options.language,
    listEvidencePackageIds(evidencePackage),
  )
  if (!validation.profile) {
    response = await callAiProvider(
      {
        provider: options.provider.provider,
        apiKey: options.provider.apiKey,
        baseUrl: options.provider.baseUrl,
        model: options.provider.model,
        signal: timeoutSignal,
      },
      buildDesignProfileRepairPrompt(originalPrompt, response.text, validation.rejected),
    )
    validation = validateDesignProfile(
      extractProfileCandidate(response.text),
      evidence,
      options.mode,
      options.language,
      listEvidencePackageIds(evidencePackage),
    )
  }
  if (!validation.profile) {
    throw new Error(`DesignProfile output failed validation: ${validation.rejected.slice(0, 4).join('; ')}`)
  }
  const capabilityLevel: AnalysisCapabilityLevel = options.mode === 'multimodal' ? 'multimodal-ai' : 'structural-ai'
  return {
    profile: validation.profile,
    meta: {
      status: validation.status,
      capabilityLevel,
      inputMode: options.mode,
      provider: options.provider.provider,
      model: response.model || model,
      generatedAt: new Date().toISOString(),
      schemaVersion: '1',
      promptVersion: DESIGN_PROFILE_PROMPT_VERSION,
      inputFingerprint: createEvidenceFingerprint(
        evidence,
        options.mode,
        options.provider.provider,
        response.model || model,
        evidencePackage.imageIds,
      ),
      inputImageCount: images.length,
      tokenUsage: response.usage,
    },
  }
}
