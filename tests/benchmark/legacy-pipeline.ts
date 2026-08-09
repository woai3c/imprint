import { callAiProvider } from '../../src/core/ai/provider.js'
import type { AiImageInput } from '../../src/core/ai/provider.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import {
  buildDesignInterpretationPrompt,
  buildDesignProfileRepairPrompt,
  buildSectionObservationPrompt,
  extractObservationCandidate,
  extractProfileCandidate,
  listEvidencePackageIds,
  selectEvidencePackage,
  validateDesignProfile,
  validateSectionObservations,
} from '../../src/core/design-intelligence/index.js'
import type {
  DesignProfile,
  IntelligenceInputMode,
  SectionObservation,
} from '../../src/core/design-intelligence/types.js'

interface LegacyProvider {
  provider: string
  apiKey: string
  baseUrl?: string
  model?: string
  reasoningEffort?: string
  thinkingEnabled?: boolean
}

export interface LegacyRunResult {
  profile: DesignProfile
  totalMs: number
  inputTokens: number
  outputTokens: number
  transportAttempts: number
  repairCount: number
}

function shouldRepair(candidate: unknown, rejected: string[]): boolean {
  return (
    candidate !== null &&
    typeof candidate === 'object' &&
    rejected.some((reason) => /:(?:missing-evidence|unsupported-evidence-kind)$/.test(reason))
  )
}

export async function runLegacyInterpretation(
  evidence: DesignEvidence,
  mode: IntelligenceInputMode,
  language: 'en' | 'zh-CN',
  provider: LegacyProvider,
  images: AiImageInput[],
): Promise<LegacyRunResult> {
  const startedAt = Date.now()
  const evidencePackage = selectEvidencePackage(evidence, mode)
  const kindById = new Map(evidence.pages.flatMap((page) => page.images).map((image) => [image.id, image.kind]))
  const imageId = (image: AiImageInput) => image.name.replace(/\.[^.]+$/, '')
  const observationImages = images.filter((image) => kindById.get(imageId(image)) === 'region-crop')
  const synthesisImages = images.filter((image) => kindById.get(imageId(image)) !== 'region-crop')
  let inputTokens = 0
  let outputTokens = 0
  let transportAttempts = 0
  let repairCount = 0
  const invoke = async (prompt: string, passImages: AiImageInput[]) => {
    const response = await callAiProvider(
      { ...provider, maxOutputTokens: 4096, allowThinkingFallback: false },
      prompt,
      passImages,
    )
    inputTokens += response.usage?.input || 0
    outputTokens += response.usage?.output || 0
    transportAttempts += response.transportAttempts || 1
    return response
  }

  let observations: SectionObservation[] | undefined
  try {
    const response = await invoke(buildSectionObservationPrompt(evidencePackage, language), observationImages)
    const validation = validateSectionObservations(extractObservationCandidate(response.text), evidencePackage)
    if (validation.observations.length > 0) observations = validation.observations
  } catch {
    observations = undefined
  }

  const response = await invoke(
    buildDesignInterpretationPrompt(evidencePackage, language, observations),
    synthesisImages,
  )
  let candidate = extractProfileCandidate(response.text)
  let validation = validateDesignProfile(
    candidate,
    evidence,
    mode,
    language,
    listEvidencePackageIds(evidencePackage),
    mode === 'multimodal' ? { requireImageObservations: synthesisImages.map(imageId) } : undefined,
  )
  if (!validation.profile && shouldRepair(candidate, validation.rejected)) {
    repairCount += 1
    const repaired = await invoke(
      buildDesignProfileRepairPrompt(evidencePackage, language, candidate, validation.rejected),
      [],
    )
    candidate = extractProfileCandidate(repaired.text)
    validation = validateDesignProfile(candidate, evidence, mode, language, listEvidencePackageIds(evidencePackage))
  }
  if (!validation.profile) throw new Error(`Legacy pipeline validation failed: ${validation.rejected.join('; ')}`)
  return {
    profile: validation.profile,
    totalMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    transportAttempts,
    repairCount,
  }
}
