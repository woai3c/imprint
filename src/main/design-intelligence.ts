import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

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
import type { DesignToken } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import {
  type CallDetail,
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
import { type AgentCliImageInput, executeAgentPrompt, resolveAgentCliCapabilities } from './agent-enhancer.js'
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

const IMAGE_MAX_WIDTH = 1600
const IMAGE_MAX_HEIGHT = 1600
const IMAGE_TARGET_BYTES = 250 * 1024
const IMAGE_MIN_MAX_DIMENSION = 96

interface PreparedAiImage {
  buffer: Buffer
  mimeType: 'image/jpeg'
  width: number
  height: number
  sourcePath: string
}

function isUsefulVisualSummary(image: Electron.NativeImage): boolean {
  const bitmap = image.toBitmap()
  if (bitmap.length < 4) return false
  const pixelCount = Math.floor(bitmap.length / 4)
  const stride = Math.max(1, Math.floor(pixelCount / 4_096))
  let minimum = 255
  let maximum = 0
  let total = 0
  let samples = 0
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4
    const luminance = (bitmap[offset] + bitmap[offset + 1] + bitmap[offset + 2]) / 3
    minimum = Math.min(minimum, luminance)
    maximum = Math.max(maximum, luminance)
    total += luminance
    samples += 1
  }
  const average = total / Math.max(samples, 1)
  return !(maximum - minimum < 3 && (average < 5 || average > 250))
}

function prepareAiImage(filePath: string): PreparedAiImage | null {
  const raw = fs.readFileSync(filePath)
  const sourceHash = createHash('sha256').update(raw).digest('hex').slice(0, 16)
  const sourcePath = path.join(path.dirname(filePath), `${path.parse(filePath).name}.ai-${sourceHash}.jpeg`)
  if (fs.existsSync(sourcePath)) {
    const cached = fs.readFileSync(sourcePath)
    const cachedImage = nativeImage.createFromBuffer(cached)
    const size = cachedImage.getSize()
    if (
      !cachedImage.isEmpty() &&
      cached.length <= IMAGE_TARGET_BYTES &&
      size.width <= IMAGE_MAX_WIDTH &&
      size.height <= IMAGE_MAX_HEIGHT &&
      isUsefulVisualSummary(cachedImage)
    ) {
      log.info('design-intelligence', `AI image cache hit: ${sourcePath} ${size.width}x${size.height} ${cached.length}`)
      return { buffer: cached, mimeType: 'image/jpeg', width: size.width, height: size.height, sourcePath }
    }
  }
  const img = nativeImage.createFromBuffer(raw)
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  let summary = img
  let summaryWidth = width
  let summaryHeight = height

  // A whole 2000×8000 page becomes illegible when merely scaled down. Keep a readable
  // page-level top summary; the selector uses its second slot for responsive or region detail.
  if (height / Math.max(width, 1) > 2.5) {
    summaryHeight = Math.min(height, Math.round(width * 1.5))
    summary = img.crop({ x: 0, y: 0, width, height: summaryHeight })
    log.info('design-intelligence', `long image cropped for AI summary: ${width}x${height}→${width}x${summaryHeight}`)
  }
  if (summaryWidth > IMAGE_MAX_WIDTH || summaryHeight > IMAGE_MAX_HEIGHT) {
    const scale = Math.min(IMAGE_MAX_WIDTH / summaryWidth, IMAGE_MAX_HEIGHT / summaryHeight)
    summaryWidth = Math.max(1, Math.round(summaryWidth * scale))
    summaryHeight = Math.max(1, Math.round(summaryHeight * scale))
    summary = summary.resize({ width: summaryWidth, height: summaryHeight, quality: 'better' })
  }
  if (!isUsefulVisualSummary(summary)) {
    log.warn('design-intelligence', `AI image rejected as blank: ${filePath}`)
    return null
  }

  const persist = (buffer: Buffer): PreparedAiImage => {
    fs.writeFileSync(sourcePath, buffer)
    return { buffer, mimeType: 'image/jpeg', width: summaryWidth, height: summaryHeight, sourcePath }
  }

  for (const quality of [78, 64, 50, 36, 24]) {
    const jpeg = summary.toJPEG(quality)
    if (jpeg.length <= IMAGE_TARGET_BYTES) {
      log.info(
        'design-intelligence',
        `AI image prepared: ${filePath} ${width}x${height}→${summaryWidth}x${summaryHeight} ${raw.length}→${jpeg.length} q=${quality}`,
      )
      return persist(jpeg)
    }
  }

  // No selected image may exceed the outbound byte budget. Reduce dimensions
  // deterministically until even high-detail/noisy captures fit, otherwise omit it.
  while (Math.max(summaryWidth, summaryHeight) > IMAGE_MIN_MAX_DIMENSION) {
    const scale = Math.min(0.8, 1000 / Math.max(summaryWidth, summaryHeight))
    summaryWidth = Math.max(1, Math.round(summaryWidth * scale))
    summaryHeight = Math.max(1, Math.round(summaryHeight * scale))
    summary = summary.resize({ width: summaryWidth, height: summaryHeight, quality: 'better' })
    const jpeg = summary.toJPEG(20)
    if (jpeg.length <= IMAGE_TARGET_BYTES) {
      log.info(
        'design-intelligence',
        `AI image fallback: ${filePath} ${width}x${height}→${summaryWidth}x${summaryHeight} ${raw.length}→${jpeg.length}`,
      )
      return persist(jpeg)
    }
  }
  log.warn('design-intelligence', `AI image rejected after compression budget: ${filePath}`)
  return null
}

function loadSelectedImages(evidence: DesignEvidence, imageIds: string[]): AiImageInput[] {
  return selectAvailableImages(evidence, imageIds).flatMap((image) => {
    const prepared = prepareAiImage(image.path)
    return prepared
      ? [
          {
            name: image.name.replace(/\.[^.]+$/, '.jpeg'),
            mimeType: prepared.mimeType,
            base64: prepared.buffer.toString('base64'),
          },
        ]
      : []
  })
}

function collectSelectedImageFiles(evidence: DesignEvidence, imageIds: string[]): AgentCliImageInput[] {
  return selectAvailableImages(evidence, imageIds).flatMap((image) => {
    const prepared = prepareAiImage(image.path)
    if (!prepared) return []
    return [{ name: image.name.replace(/\.[^.]+$/, '.jpeg'), sourcePath: prepared.sourcePath }]
  })
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
  const runStartedAt = Date.now()
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
  onProgress?.('progress.preparingDigest', 10)
  const imageStartedAt = Date.now()
  let route = chooseDesignIntelligenceRoute(settings, evidence)
  let evidencePackage = selectEvidencePackage(evidence, route.mode)
  evidencePackage.imageSelection.forEach((selection, index) => {
    log.info(
      'design-intelligence',
      `visual summary #${index + 1}: id=${selection.id} score=${selection.score} reason=${selection.reason}`,
    )
  })
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
  const imageSummaryMs = Date.now() - imageStartedAt
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
  const timeoutSignal = AbortSignal.timeout(300_000)
  const runSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const accumulatedUsage = { input: 0, output: 0, calls: 0 }
  const accumulatedCallDetails: CallDetail[] = []

  try {
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
      allowThinkingFallback: false,
    }
    // A single compact synthesis replaces the former semantic naming, observation,
    // synthesis, and automatic repair calls.
    onProgress?.('progress.synthesisPass', 20)
    const cliImageByName = new Map(cliImages.map((image) => [image.name, image]))
    const cliImageByStableId = new Map(cliImages.map((image) => [image.name.replace(/\.[^.]+$/, ''), image]))
    const cliImageByShortId = new Map<string, AgentCliImageInput>(
      evidencePackage.imageIds.flatMap((imageId, index) => {
        const image = cliImageByStableId.get(imageId)
        return image ? [[`i${index + 1}`, image] as const] : []
      }),
    )
    let invokeCount = 0
    const invoke: InterpretationInvoke = async (taskPrompt, passImages) => {
      invokeCount++
      const pass = 'synthesis'
      onProgress?.('progress.synthesisPass', 40)
      log.info(
        'design-intelligence',
        `invoke #${invokeCount}: images=${passImages.length} promptLen=${taskPrompt.length}`,
      )
      let result: Awaited<ReturnType<InterpretationInvoke>>
      const invokeStart = Date.now()
      if (settings.aiMode === 'apiKey') {
        const thinking = settings.thinkingEnabled === true
        result = await callAiProvider(
          {
            ...providerConfig,
            maxOutputTokens: thinking ? 8192 : 4096,
          },
          taskPrompt,
          passImages,
        )
      } else {
        const passCliImages = passImages.flatMap((image) => {
          const imageId = image.name.replace(/\.[^.]+$/, '')
          const cliImage =
            cliImageByName.get(image.name) || cliImageByStableId.get(imageId) || cliImageByShortId.get(imageId)
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
    const cliStubs: AiImageInput[] = cliImages.map((image) => ({
      name: image.name,
      mimeType: 'image/jpeg',
      base64: '',
    }))
    const { synthesisImages } = splitImagesByPass(evidence, isAgentCli ? cliStubs : images)
    const synthesisImageIds = synthesisImages.map((image) => image.name.replace(/\.[^.]+$/, ''))

    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: route.mode,
      language,
      invoke,
      synthesisImages,
      requireImageObservations: route.mode === 'multimodal' ? synthesisImageIds : undefined,
    })

    log.info(
      'design-intelligence',
      `compact synthesis: digestChars=${result.digestChars} promptChars=${result.promptChars} calls=${result.callDetails.length}`,
    )
    log.info(
      'design-intelligence',
      `timing: images=${imageSummaryMs}ms digest=${result.timing.digestMs}ms ai=${result.timing.aiInvokeMs}ms ` +
        `validation=${result.timing.validationMs}ms total=${Date.now() - runStartedAt}ms ` +
        `tokens=${result.usage?.input || 0}+${result.usage?.output || 0} imageCount=${result.timing.imageCount}`,
    )

    onProgress?.('progress.validatingProfile', 85)
    const effectiveMode = result.profile.inputMode
    const capabilityLevel = result.evidenceFallback
      ? 'evidence-fallback'
      : effectiveMode === 'multimodal'
        ? 'multimodal-ai'
        : 'structural-ai'

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
        timing: {
          ...result.timing,
          imageSummaryMs,
          totalMs: Date.now() - runStartedAt,
        },
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
        timing: {
          digestMs: 0,
          imageSummaryMs,
          aiInvokeMs: accumulatedCallDetails.reduce((sum, detail) => sum + (detail.durationMs || 0), 0),
          validationMs: 0,
          totalMs: Date.now() - runStartedAt,
          aiInputTokens: accumulatedUsage.input || undefined,
          aiOutputTokens: accumulatedUsage.output || undefined,
          imageCount: isAgentCli ? cliImages.length : images.length,
          cacheHit: false,
        },
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
