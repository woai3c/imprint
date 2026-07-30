import fs from 'node:fs'

import { resolveAiModelCapabilities, resolveEffectiveModel } from '../core/ai/capabilities.js'
import { type AiImageInput, callAiProvider, mimeTypeForPath } from '../core/ai/provider.js'
import { generateExamplesWithLlm } from '../core/analyzer/example-generator.js'
import { enhanceSemanticNaming } from '../core/analyzer/semantic-enhancer.js'
import { validateColorRenames } from '../core/analyzer/token-renamer.js'
import type { GeneratedExampleComponent } from '../core/analyzer/types.js'
import type { DesignToken } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import {
  DESIGN_PROFILE_PROMPT_VERSION,
  type InterpretationInvoke,
  createEvidenceFingerprint,
  createValidationRecipe,
  generateAgentContextBundle,
  generateReconstructionBrief,
  restrictEvidencePackageImages,
  runInterpretationPipeline,
  selectEvidencePackage,
  splitImagesByPass,
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
import { log } from './logger.js'

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
  const model = resolveEffectiveModel(settings.provider, settings.model)
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
      resolveEffectiveModel(settings.provider, settings.model),
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
    const providerConfig = {
      provider: settings.provider,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl || undefined,
      model: resolveEffectiveModel(settings.provider, settings.model),
      signal: runSignal,
    }
    const [renameProposals, generatedExamples] =
      settings.aiMode === 'apiKey'
        ? await Promise.all([
            enhanceSemanticNaming(tokens, evidence.source.requestedUrl, providerConfig, enhancementContext),
            generateExamplesWithLlm(tokens, evidence.source.requestedUrl, providerConfig, enhancementContext),
          ])
        : await enhanceWithAgentCli(
            tokens,
            evidence.source.requestedUrl,
            settings.agentCli,
            enhancementContext,
            runSignal,
          ).then((enhancement) => [enhancement.renames, enhancement.examples] as const)
    const renameValidation = validateColorRenames(tokens, renameProposals || [])
    const examples = generatedExamples || []
    const cliImageByName = new Map(cliImages.map((image) => [image.name, image]))
    const invoke: InterpretationInvoke = async (taskPrompt, passImages) => {
      if (settings.aiMode === 'apiKey') {
        return callAiProvider(
          {
            provider: settings.provider,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl || undefined,
            model: resolveEffectiveModel(settings.provider, settings.model),
            signal: runSignal,
          },
          taskPrompt,
          passImages,
        )
      }
      const passCliImages = passImages.flatMap((image) => {
        const cliImage = cliImageByName.get(image.name)
        return cliImage ? [cliImage] : []
      })
      return {
        text: (await executeAgentPrompt(settings.agentCli, taskPrompt, runSignal, passCliImages, language)) || '',
        model: settings.agentCli,
      }
    }
    const cliStubs: AiImageInput[] = cliImages.map((image) => ({ name: image.name, mimeType: 'image/png', base64: '' }))
    const { observationImages, synthesisImages } = splitImagesByPass(evidence, isAgentCli ? cliStubs : images)
    const synthesisImageIds = synthesisImages.map((image) => image.name.replace(/\.[^.]+$/, ''))
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: route.mode,
      language,
      invoke,
      observationImages,
      synthesisImages,
      requireImageObservations: isAgentCli && route.mode === 'multimodal' ? synthesisImageIds : undefined,
    })
    result.profile.tokenAliases = renameValidation.accepted
    const reconstructionBrief = generateReconstructionBrief(result.profile, evidence, tokens)
    const effectiveMode = result.profile.inputMode
    const capabilityLevel = effectiveMode === 'multimodal' ? 'multimodal-ai' : 'structural-ai'
    const recipe = createValidationRecipe('workflow', result.profile, tokens)
    const validationReport = validateRecipe(recipe, result.profile, tokens, capabilityLevel)
    return {
      tokens,
      profile: result.profile,
      examples,
      reconstructionBrief,
      validationReport,
      meta: {
        ...baseMeta,
        status: result.status,
        capabilityLevel,
        inputMode: effectiveMode,
        pipeline: result.pipeline,
        generatedAt: new Date().toISOString(),
        inputImageCount: isAgentCli ? cliImages.length : images.length,
        tokenUsage: result.usage,
      },
    }
  } catch (error: unknown) {
    const code = failureCode(error, timeoutSignal.aborted && !signal?.aborted)
    log.error(
      'design-intelligence',
      `run failed: provider=${baseMeta.provider} code=${code} reason=${error instanceof Error ? error.message.slice(0, 300) : 'unknown'}`,
    )
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
        failureCode: code,
        failureReason: error instanceof Error ? error.message.slice(0, 500) : undefined,
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
