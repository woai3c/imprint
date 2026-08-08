import fs from 'node:fs'

import { nativeImage, net } from 'electron'

import { resolveAiModelCapabilities, resolveEffectiveModel } from '../core/ai/capabilities.js'
import { getDefaultReasoningEffort } from '../core/ai/model-catalog.js'
import { type AiImageInput, callAiProvider, mimeTypeForPath } from '../core/ai/provider.js'
import {
  buildExamplePrompt,
  completeExampleGeneration,
  createExampleValidationContext,
  generateExamplesWithLlm,
} from '../core/analyzer/example-generator.js'
import type { ExampleGenerationResult } from '../core/analyzer/example-generator.js'
import { enhanceSemanticNaming } from '../core/analyzer/semantic-enhancer.js'
import { validateColorRenames } from '../core/analyzer/token-renamer.js'
import type { DesignToken } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import {
  type CallDetail,
  DESIGN_PROFILE_PROMPT_VERSION,
  type InterpretationInvoke,
  type ObservationCache,
  createEvidenceFingerprint,
  createStructuralFingerprint,
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
  SectionObservation,
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
  reconstructionBrief: string | null
  validationReport: ValidationReport | null
}

export function hasDesignIntelligenceConfiguration(settings: AppSettings): boolean {
  if (settings.aiEnabled === false) return false
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

const IMAGE_MAX_DIMENSION = 2048
const IMAGE_TARGET_BYTES = 3.75 * 1024 * 1024

function compressImage(filePath: string): { base64: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' } {
  const raw = fs.readFileSync(filePath)
  const img = nativeImage.createFromBuffer(raw)
  if (img.isEmpty()) {
    return { base64: raw.toString('base64'), mimeType: mimeTypeForPath(filePath) }
  }
  const { width, height } = img.getSize()
  let resized = img
  if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
    const scale = Math.min(IMAGE_MAX_DIMENSION / width, IMAGE_MAX_DIMENSION / height)
    resized = img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'better' })
  }
  for (const quality of [80, 60, 40, 20]) {
    const jpeg = resized.toJPEG(quality)
    if (jpeg.length <= IMAGE_TARGET_BYTES || quality === 20) {
      log.info(
        'design-intelligence',
        `image compressed: ${filePath} ${width}x${height} ${raw.length}→${jpeg.length} q=${quality}`,
      )
      return { base64: jpeg.toString('base64'), mimeType: 'image/jpeg' }
    }
  }
  const smallScale = Math.min(1000 / width, 1000 / height, 1)
  const small = img.resize({
    width: Math.round(width * smallScale),
    height: Math.round(height * smallScale),
    quality: 'better',
  })
  const jpeg = small.toJPEG(20)
  log.info(
    'design-intelligence',
    `image ultra-compressed: ${filePath} ${width}x${height} ${raw.length}→${jpeg.length} q=20@1000`,
  )
  return { base64: jpeg.toString('base64'), mimeType: 'image/jpeg' }
}

function loadSelectedImages(evidence: DesignEvidence, imageIds: string[]): AiImageInput[] {
  return selectAvailableImages(evidence, imageIds).map((image) => {
    const compressed = compressImage(image.path)
    return {
      name: image.name.replace(/\.[^.]+$/, '.jpeg'),
      mimeType: compressed.mimeType,
      base64: compressed.base64,
    }
  })
}

function collectSelectedImageFiles(evidence: DesignEvidence, imageIds: string[]): AgentCliImageInput[] {
  return selectAvailableImages(evidence, imageIds).map((image) => ({ name: image.name, sourcePath: image.path }))
}

function failureCode(error: unknown, timedOut = false): string {
  if (timedOut) return 'timeout'
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout'
  if (error instanceof Error && /timeout/i.test(error.message)) return 'timeout'
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
  if (error instanceof Error && /abort/i.test(error.message)) return 'cancelled'
  if (error instanceof Error && /invalid|schema|profile/i.test(error.message)) return 'invalid-output'
  return 'provider-error'
}

export type ProgressCallback = (step: string, percent: number) => void

// Session-level observation cache: rerunning interpretation for the same structural
// evidence (for example after token-only changes or a failed synthesis) reuses the
// structural observation pass instead of paying for it again.
const observationCacheStore = new Map<string, SectionObservation[]>()
const OBSERVATION_CACHE_LIMIT = 8
const observationCache: ObservationCache = {
  get: (key) => observationCacheStore.get(key),
  set: (key, observations) => {
    if (observationCacheStore.size >= OBSERVATION_CACHE_LIMIT) {
      const oldest = observationCacheStore.keys().next().value
      if (oldest !== undefined) observationCacheStore.delete(oldest)
    }
    observationCacheStore.set(key, observations)
  },
}

export async function runExampleGeneration(
  evidence: DesignEvidence,
  tokens: DesignToken,
  profile: DesignProfile,
  settings: AppSettings,
  language: 'en' | 'zh-CN',
  signal?: AbortSignal,
): Promise<ExampleGenerationResult> {
  if (!hasDesignIntelligenceConfiguration(settings)) {
    return {
      examples: [],
      status: 'failed',
      failureCode: 'not-configured',
      failureReason: 'AI example generation is not configured',
      rejections: [],
    }
  }

  const startedAt = Date.now()
  const timeoutSignal = AbortSignal.timeout(300_000)
  const runSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const route = chooseDesignIntelligenceRoute(settings, evidence)
  const evidencePackage = selectEvidencePackage(evidence, route.mode)
  const context = {
    featureTags: evidence.featureTags,
    components: [] as never[],
    language,
    techStack: evidence.techStack,
    designProfile: profile,
  }
  const validationContext = createExampleValidationContext(tokens, evidence.source.requestedUrl, language)

  try {
    let result: ExampleGenerationResult
    if (settings.aiMode === 'apiKey') {
      const allImages = route.mode === 'multimodal' ? loadSelectedImages(evidence, evidencePackage.imageIds) : []
      const { synthesisImages } = splitImagesByPass(evidence, allImages)
      result = await generateExamplesWithLlm(
        tokens,
        evidence.source.requestedUrl,
        {
          provider: settings.provider,
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl || undefined,
          model: resolveEffectiveModel(settings.provider, settings.model),
          signal: runSignal,
          fetchFn: net.fetch as unknown as typeof fetch,
          reasoningEffort:
            settings.reasoningEffort ||
            getDefaultReasoningEffort(settings.provider, resolveEffectiveModel(settings.provider, settings.model)),
          thinkingEnabled: settings.thinkingEnabled === true,
          maxOutputTokens: settings.thinkingEnabled === true ? 8192 : 4096,
        },
        context,
        synthesisImages,
      )
    } else {
      const allImages = route.mode === 'multimodal' ? collectSelectedImageFiles(evidence, evidencePackage.imageIds) : []
      const regionCropIds = new Set(
        evidence.pages
          .flatMap((page) => page.images)
          .filter((image) => image.kind === 'region-crop')
          .map((image) => image.id),
      )
      const synthesisImages = allImages.filter((image) => !regionCropIds.has(image.name.replace(/\.[^.]+$/, '')))
      const prompt = buildExamplePrompt(tokens, evidence.source.requestedUrl, context)
      const response = await executeAgentPrompt(settings.agentCli, prompt, runSignal, synthesisImages, language)
      result = await completeExampleGeneration(response || '', validationContext, language, async (repairPrompt) => {
        return (await executeAgentPrompt(settings.agentCli, repairPrompt, runSignal, [], language)) || ''
      })
    }
    log.info(
      'design-examples',
      `done: status=${result.status} examples=${result.examples.length} durationMs=${Date.now() - startedAt} violations=${[
        ...new Set(result.rejections.flatMap((rejection) => rejection.violations)),
      ].join(',')}`,
    )
    return result
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    log.error(
      'design-examples',
      `failed: durationMs=${Date.now() - startedAt} reason=${error instanceof Error ? error.message.slice(0, 300) : 'unknown'}`,
    )
    return {
      examples: [],
      status: 'failed',
      failureCode: 'provider-error',
      failureReason: error instanceof Error ? error.message : 'AI example generation failed',
      rejections: [],
    }
  }
}

export async function runDesignIntelligence(
  evidence: DesignEvidence,
  tokens: DesignToken,
  settings: AppSettings,
  language: 'en' | 'zh-CN',
  signal?: AbortSignal,
  onProgress?: ProgressCallback,
): Promise<IntelligenceRunResult> {
  if (!hasDesignIntelligenceConfiguration(settings)) {
    return {
      tokens,
      profile: null,
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
  {
    const ep = evidencePackage.evidence
    const epJson = JSON.stringify(evidencePackage)
    log.info(
      'design-intelligence',
      `evidence package: ${epJson.length} chars, pages=${ep.pages.length} sections=${ep.sections.length} ` +
        `components=${ep.components.length} layoutNodes=${ep.layoutNodes.length} ` +
        `interactions=${ep.interactionObservations.length} responsive=${ep.responsiveObservations.length} ` +
        `images=${evidencePackage.imageIds.length} mode=${evidencePackage.inputMode}`,
    )
  }
  const fingerprint = createEvidenceFingerprint(
    evidence,
    route.mode,
    route.provider,
    route.model,
    evidencePackage.imageIds,
    DESIGN_PROFILE_PROMPT_VERSION,
    '1',
    language,
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
  const timeoutSignal = AbortSignal.timeout(900_000)
  const runSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const accumulatedUsage = { input: 0, output: 0, calls: 0 }
  const accumulatedCallDetails: CallDetail[] = []

  try {
    const enhancementContext = {
      featureTags: evidence.featureTags,
      components: [] as never[],
      language,
      techStack: evidence.techStack,
    }
    const providerConfig = {
      provider: settings.provider,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl || undefined,
      model: resolveEffectiveModel(settings.provider, settings.model),
      signal: runSignal,
      fetchFn: net.fetch as unknown as typeof fetch,
      reasoningEffort:
        settings.reasoningEffort ||
        getDefaultReasoningEffort(settings.provider, resolveEffectiveModel(settings.provider, settings.model)),
      thinkingEnabled: settings.thinkingEnabled === true,
    }
    // Phase 1: semantic naming + design interpretation (parallel)
    onProgress?.('progress.semanticNaming', 10)
    const cliImageByName = new Map(cliImages.map((image) => [image.name, image]))
    let invokeCount = 0
    const invoke: InterpretationInvoke = async (taskPrompt, passImages) => {
      invokeCount++
      const pass = taskPrompt.includes('section observer')
        ? 'observation'
        : taskPrompt.includes('repairing the citation fields')
          ? 'synthesis-repair'
          : 'synthesis'
      const passLabel = pass === 'observation' ? 'progress.observationPass' : 'progress.synthesisPass'
      onProgress?.(passLabel, Math.min(25 + invokeCount * 15, 80))
      log.info(
        'design-intelligence',
        `invoke #${invokeCount}: images=${passImages.length} promptLen=${taskPrompt.length}`,
      )
      let result: Awaited<ReturnType<InterpretationInvoke>>
      const invokeStart = Date.now()
      if (settings.aiMode === 'apiKey') {
        // Thinking models share the completion budget between reasoning tokens and
        // the visible answer, so passes need extra headroom when thinking is on.
        const thinking = settings.thinkingEnabled === true
        result = await callAiProvider(
          {
            ...providerConfig,
            maxOutputTokens: pass === 'observation' ? (thinking ? 12288 : 4096) : thinking ? 24576 : 8192,
          },
          taskPrompt,
          passImages,
        )
      } else {
        const passCliImages = passImages.flatMap((image) => {
          const cliImage = cliImageByName.get(image.name)
          return cliImage ? [cliImage] : []
        })
        const cliText = await executeAgentPrompt(settings.agentCli, taskPrompt, runSignal, passCliImages, language)
        result = {
          text: cliText || '',
          model: settings.agentCli,
        }
      }
      const invokeMs = Date.now() - invokeStart
      result.durationMs = invokeMs
      log.info(
        'design-intelligence',
        `invoke #${invokeCount} done: ${invokeMs}ms tokens=${result.usage?.input || 0}+${result.usage?.output || 0}${result.usage?.reasoning ? ` reasoning=${result.usage.reasoning}` : ''} textLen=${result.text.length}${result.retriedWithoutThinking ? ' fallback=no-thinking' : ''}${result.finishReason && !/^(?:stop|end_turn)$/i.test(result.finishReason) ? ` finish=${result.finishReason}` : ''}`,
      )
      accumulatedUsage.calls++
      accumulatedUsage.input += result.usage?.input || 0
      accumulatedUsage.output += result.usage?.output || 0
      accumulatedCallDetails.push({
        pass,
        input: result.usage?.input,
        output: result.usage?.output,
        durationMs: invokeMs,
      })
      return result
    }
    const cliStubs: AiImageInput[] = cliImages.map((image) => ({ name: image.name, mimeType: 'image/png', base64: '' }))
    const { observationImages, synthesisImages } = splitImagesByPass(evidence, isAgentCli ? cliStubs : images)
    const synthesisImageIds = synthesisImages.map((image) => image.name.replace(/\.[^.]+$/, ''))

    const renamePromise =
      settings.aiMode === 'apiKey'
        ? enhanceSemanticNaming(tokens, evidence.source.requestedUrl, providerConfig, enhancementContext)
        : enhanceWithAgentCli(
            tokens,
            evidence.source.requestedUrl,
            settings.agentCli,
            enhancementContext,
            runSignal,
          ).then((enhancement) => enhancement.renames)

    const interpretationPromise = runInterpretationPipeline(evidence, evidencePackage, {
      mode: route.mode,
      language,
      invoke,
      observationImages,
      synthesisImages,
      requireImageObservations: isAgentCli && route.mode === 'multimodal' ? synthesisImageIds : undefined,
      observationCache,
      observationCacheKey: createStructuralFingerprint(
        evidence,
        route.mode,
        route.provider,
        route.model,
        evidencePackage.imageIds,
        DESIGN_PROFILE_PROMPT_VERSION,
        language,
      ),
    })

    const [renameProposals, result] = await Promise.all([renamePromise, interpretationPromise])

    onProgress?.('progress.validatingProfile', 85)
    const renameValidation = validateColorRenames(tokens, renameProposals || [])
    result.profile.tokenAliases = renameValidation.accepted
    const effectiveMode = result.profile.inputMode
    const capabilityLevel = effectiveMode === 'multimodal' ? 'multimodal-ai' : 'structural-ai'

    onProgress?.('progress.validatingProfile', 90)
    const reconstructionBrief = generateReconstructionBrief(result.profile, evidence, tokens)
    const recipe = createValidationRecipe('workflow', result.profile, tokens)
    const validationReport = validateRecipe(recipe, result.profile, tokens, capabilityLevel)
    return {
      tokens,
      profile: result.profile,
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
        callDetails: result.callDetails,
        rejected: result.rejected,
        exampleGeneration: { status: 'not-requested' },
      },
    }
  } catch (error: unknown) {
    const code = failureCode(error, timeoutSignal.aborted && !signal?.aborted)
    let reason: string | undefined
    if (code === 'timeout') {
      reason =
        'AI interpretation timed out. Thinking models can be slow on large pages — try again, disable thinking, or switch to a faster model.'
    } else if (code === 'cancelled') {
      reason = undefined
    } else {
      reason = error instanceof Error ? error.message.slice(0, 500) : undefined
    }
    log.error(
      'design-intelligence',
      `run failed: provider=${baseMeta.provider} code=${code} reason=${error instanceof Error ? error.message.slice(0, 300) : 'unknown'}`,
    )
    return {
      tokens,
      profile: null,
      reconstructionBrief: null,
      validationReport: null,
      meta: {
        ...baseMeta,
        status: 'failed',
        capabilityLevel: 'evidence-fallback',
        generatedAt: new Date().toISOString(),
        failureCode: code,
        failureReason: reason,
        tokenUsage:
          accumulatedUsage.calls > 0 ? { input: accumulatedUsage.input, output: accumulatedUsage.output } : undefined,
        callDetails: accumulatedCallDetails.length > 0 ? accumulatedCallDetails : undefined,
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
