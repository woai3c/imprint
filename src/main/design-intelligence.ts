import fs from 'node:fs'

import { getDefaultModel, resolveAiModelCapabilities } from '../core/ai/capabilities.js'
import { type AiImageInput, type AiResponse, callAiProvider } from '../core/ai/provider.js'
import { enhanceWithLlm } from '../core/analyzer/llm-enhancer.js'
import { validateColorRenames } from '../core/analyzer/token-renamer.js'
import type { GeneratedExampleComponent } from '../core/analyzer/types.js'
import type { DesignToken } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import {
  DESIGN_PROFILE_PROMPT_VERSION,
  buildDesignInterpretationPrompt,
  buildDesignProfileRepairPrompt,
  createEvidenceFingerprint,
  createValidationRecipe,
  extractProfileCandidate,
  generateAgentContextBundle,
  generateReconstructionBrief,
  listEvidencePackageIds,
  restrictEvidencePackageImages,
  selectEvidencePackage,
  validateDesignProfile,
  validateRecipe,
} from '../core/design-intelligence/index.js'
import type {
  DesignIntelligenceMeta,
  DesignProfile,
  IntelligenceInputMode,
  ValidationReport,
} from '../core/design-intelligence/types.js'
import type { AppSettings } from '../shared/ipc-contract.js'
import {
  type AgentCliImageInput,
  enhanceWithAgentCli,
  executeAgentPrompt,
  resolveAgentCliCapabilities,
} from './agent-enhancer.js'

export interface IntelligenceRunResult {
  tokens: DesignToken
  profile: DesignProfile | null
  meta: DesignIntelligenceMeta
  examples: GeneratedExampleComponent[]
  reconstructionBrief: string | null
  validationReport: ValidationReport | null
}

export function hasDesignIntelligenceConfiguration(settings: AppSettings): boolean {
  return settings.aiMode === 'apiKey' ? Boolean(settings.provider && settings.apiKey) : Boolean(settings.agentCli)
}

export function chooseDesignIntelligenceRoute(
  settings: AppSettings,
  evidence: DesignEvidence,
): {
  mode: IntelligenceInputMode
  provider: string
  model: string
} {
  if (settings.aiMode === 'agentCli') {
    const cliCapabilities = resolveAgentCliCapabilities(settings.agentCli)
    const mayAttachImages =
      cliCapabilities.vision &&
      settings.visionAnalysisConsent &&
      (evidence.source.accessMode === 'anonymous' || settings.managedVisionConsent)
    return {
      mode: mayAttachImages ? 'multimodal' : 'structural-only',
      provider: 'agent-cli',
      model: settings.agentCli,
    }
  }
  const model = settings.model || getDefaultModel(settings.provider)
  const capabilities = resolveAiModelCapabilities(
    settings.provider,
    model,
    settings.provider === 'custom' && settings.modelSupportsVision,
  )
  const maySendImages =
    capabilities.vision &&
    settings.visionAnalysisConsent &&
    (evidence.source.accessMode === 'anonymous' || settings.managedVisionConsent)
  return {
    mode: maySendImages ? 'multimodal' : 'structural-only',
    provider: settings.provider,
    model,
  }
}

export function getInitialDesignIntelligenceMeta(
  settings: AppSettings,
  evidence: DesignEvidence,
): DesignIntelligenceMeta {
  if (!hasDesignIntelligenceConfiguration(settings)) {
    return { status: 'not-configured', capabilityLevel: 'evidence-only' }
  }
  const route = chooseDesignIntelligenceRoute(settings, evidence)
  if (evidence.source.accessMode === 'managed') {
    return {
      status: 'not-requested',
      capabilityLevel: 'evidence-only',
      inputMode: route.mode,
      provider: route.provider,
      model: route.model,
      schemaVersion: '1',
      promptVersion: DESIGN_PROFILE_PROMPT_VERSION,
    }
  }
  const modelLacksVision =
    settings.aiMode === 'apiKey' &&
    !resolveAiModelCapabilities(
      settings.provider,
      settings.model || getDefaultModel(settings.provider),
      settings.provider === 'custom' && settings.modelSupportsVision,
    ).vision
  if (modelLacksVision) {
    return {
      status: 'not-requested',
      capabilityLevel: 'evidence-only',
      inputMode: 'structural-only',
      provider: route.provider,
      model: route.model,
      schemaVersion: '1',
      promptVersion: DESIGN_PROFILE_PROMPT_VERSION,
      pendingChoice: 'model-no-vision',
    }
  }
  return {
    status: 'pending',
    capabilityLevel: route.mode === 'multimodal' ? 'multimodal-ai' : 'structural-ai',
    inputMode: route.mode,
    provider: route.provider,
    model: route.model,
    schemaVersion: '1',
    promptVersion: DESIGN_PROFILE_PROMPT_VERSION,
  }
}

function mimeTypeForPath(path: string): AiImageInput['mimeType'] {
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg'
  if (/\.webp$/i.test(path)) return 'image/webp'
  return 'image/png'
}

function selectAvailableImages(evidence: DesignEvidence, imageIds: string[]) {
  const selected: Array<{ id: string; name: string; path: string; size: number }> = []
  let totalBytes = 0
  for (const imageId of imageIds) {
    const image = evidence.pages.flatMap((page) => page.images).find((candidate) => candidate.id === imageId)
    if (!image) continue
    try {
      if (!fs.existsSync(image.path)) continue
      const stats = fs.statSync(image.path)
      if (stats.size > 8 * 1024 * 1024 || totalBytes + stats.size > 24 * 1024 * 1024) continue
      totalBytes += stats.size
      selected.push({
        id: image.id,
        name: `${image.id}.${mimeTypeForPath(image.path).split('/')[1]}`,
        path: image.path,
        size: stats.size,
      })
    } catch {
      // A missing or changing screenshot is omitted; routing falls back to structural evidence when none remain.
    }
  }
  return selected
}

function loadSelectedImages(evidence: DesignEvidence, imageIds: string[]): AiImageInput[] {
  return selectAvailableImages(evidence, imageIds).map((image) => ({
    name: image.name,
    mimeType: mimeTypeForPath(image.path),
    base64: fs.readFileSync(image.path).toString('base64'),
  }))
}

function collectSelectedImageFiles(evidence: DesignEvidence, imageIds: string[]): AgentCliImageInput[] {
  return selectAvailableImages(evidence, imageIds).map((image) => ({ name: image.name, sourcePath: image.path }))
}

function failureCode(error: unknown, timedOut = false): string {
  if (timedOut) return 'timeout'
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
  if (error instanceof Error && /abort/i.test(error.message)) return 'cancelled'
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout'
  if (error instanceof Error && /timeout/i.test(error.message)) return 'timeout'
  if (error instanceof Error && /invalid|schema|profile/i.test(error.message)) return 'invalid-output'
  return 'provider-error'
}

export async function runDesignIntelligence(
  evidence: DesignEvidence,
  tokens: DesignToken,
  settings: AppSettings,
  language: 'en' | 'zh-CN',
  signal?: AbortSignal,
): Promise<IntelligenceRunResult> {
  if (!hasDesignIntelligenceConfiguration(settings)) {
    return {
      tokens,
      profile: null,
      examples: [],
      reconstructionBrief: null,
      validationReport: null,
      meta: { status: 'not-configured', capabilityLevel: 'evidence-only' },
    }
  }

  const isAgentCli = settings.aiMode === 'agentCli'
  let route = chooseDesignIntelligenceRoute(settings, evidence)
  let evidencePackage = selectEvidencePackage(evidence, route.mode)
  let images = route.mode === 'multimodal' && !isAgentCli ? loadSelectedImages(evidence, evidencePackage.imageIds) : []
  let cliImages =
    route.mode === 'multimodal' && isAgentCli
      ? collectSelectedImageFiles(evidence, evidencePackage.imageIds)
      : ([] as AgentCliImageInput[])
  if (route.mode === 'multimodal') {
    const availableIds = (isAgentCli ? cliImages : images).map((image) => image.name.replace(/\.[^.]+$/, ''))
    evidencePackage = restrictEvidencePackageImages(evidencePackage, availableIds)
    if (evidencePackage.imageIds.length === 0) {
      route = { ...route, mode: 'structural-only' }
      evidencePackage = selectEvidencePackage(evidence, route.mode)
      images = []
      cliImages = []
    }
  }
  const requireImageObservations = isAgentCli && route.mode === 'multimodal' ? evidencePackage.imageIds : undefined
  const fingerprint = createEvidenceFingerprint(
    evidence,
    route.mode,
    route.provider,
    route.model,
    evidencePackage.imageIds,
    DESIGN_PROFILE_PROMPT_VERSION,
    '1',
  )
  const baseMeta: DesignIntelligenceMeta = {
    status: 'pending',
    capabilityLevel: route.mode === 'multimodal' ? 'multimodal-ai' : 'structural-ai',
    inputMode: route.mode,
    provider: route.provider,
    model: route.model,
    schemaVersion: '1',
    promptVersion: DESIGN_PROFILE_PROMPT_VERSION,
    inputFingerprint: fingerprint,
    inputImageCount: evidencePackage.imageIds.length,
  }
  const timeoutSignal = AbortSignal.timeout(60_000)
  const runSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  try {
    const enhancementContext = {
      featureTags: evidence.featureTags,
      components: [],
      language,
    }
    const enhancement =
      settings.aiMode === 'apiKey'
        ? await enhanceWithLlm(
            tokens,
            evidence.source.requestedUrl,
            {
              provider: settings.provider,
              apiKey: settings.apiKey,
              baseUrl: settings.baseUrl || undefined,
              model: settings.model || undefined,
              signal: runSignal,
            },
            enhancementContext,
          )
        : await enhanceWithAgentCli(
            tokens,
            evidence.source.requestedUrl,
            settings.agentCli,
            enhancementContext,
            runSignal,
          )
    const renameValidation = validateColorRenames(tokens, enhancement?.renames || [])
    const examples = enhancement?.examples || []
    const prompt = buildDesignInterpretationPrompt(evidencePackage, language)
    const invoke = async (taskPrompt: string, taskImages: AiImageInput[] = []): Promise<AiResponse> =>
      settings.aiMode === 'apiKey'
        ? callAiProvider(
            {
              provider: settings.provider,
              apiKey: settings.apiKey,
              baseUrl: settings.baseUrl || undefined,
              model: settings.model || undefined,
              signal: runSignal,
            },
            taskPrompt,
            taskImages,
          )
        : {
            text: (await executeAgentPrompt(settings.agentCli, taskPrompt, runSignal, cliImages, language)) || '',
            model: settings.agentCli,
          }
    const validateCandidate = (text: string) =>
      validateDesignProfile(
        extractProfileCandidate(text),
        evidence,
        route.mode,
        language,
        listEvidencePackageIds(evidencePackage),
        requireImageObservations ? { requireImageObservations } : undefined,
      )
    let response = await invoke(prompt, images)
    if (!response.text) throw new Error('DesignProfile output is empty')
    let validation = validateCandidate(response.text)
    if (!validation.profile || validation.imageObservationsValid === false) {
      response = await invoke(buildDesignProfileRepairPrompt(prompt, response.text, validation.rejected))
      validation = validateCandidate(response.text)
    }
    if (!validation.profile) throw new Error('DesignProfile output failed schema validation')
    validation.profile.tokenAliases = renameValidation.accepted
    const reconstructionBrief = generateReconstructionBrief(validation.profile, evidence, tokens)
    const effectiveMode = validation.profile.inputMode
    const capabilityLevel = effectiveMode === 'multimodal' ? 'multimodal-ai' : 'structural-ai'
    const recipe = createValidationRecipe('workflow', validation.profile, tokens)
    const validationReport = validateRecipe(recipe, validation.profile, tokens, capabilityLevel)
    return {
      tokens,
      profile: validation.profile,
      examples,
      reconstructionBrief,
      validationReport,
      meta: {
        ...baseMeta,
        status: validation.status,
        capabilityLevel,
        inputMode: effectiveMode,
        generatedAt: new Date().toISOString(),
        inputImageCount: isAgentCli ? cliImages.length : images.length,
        tokenUsage: 'usage' in response ? response.usage : undefined,
      },
    }
  } catch (error: unknown) {
    return {
      tokens,
      profile: null,
      examples: [],
      reconstructionBrief: null,
      validationReport: null,
      meta: {
        ...baseMeta,
        status: 'failed',
        capabilityLevel: 'evidence-fallback',
        generatedAt: new Date().toISOString(),
        failureCode: failureCode(error, timeoutSignal.aborted && !signal?.aborted),
      },
    }
  }
}

export function createTaskContext(
  task: string,
  evidence: DesignEvidence,
  profile: DesignProfile | null,
  meta: DesignIntelligenceMeta,
) {
  return generateAgentContextBundle(task, meta.capabilityLevel, evidence, profile)
}
