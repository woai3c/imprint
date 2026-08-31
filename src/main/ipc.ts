import { BrowserWindow, app, ipcMain } from 'electron'

import { buildAnalysisArtifacts } from '../core/analysis-artifacts.js'
import {
  AuthenticationCancelledError,
  AuthenticationRequiredError,
  CORE_ANALYSIS_REQUEST_DEFAULTS,
  type LoginDecision,
  NoUsableCapturesError,
  createAnalysisRequest,
} from '../core/analyzer/index.js'
import { routeIdentityFromUrl } from '../core/analyzer/reference-compare.js'
import {
  sanitizeAuthWallDetectionForDisplay,
  sanitizeDesignEvidenceForPersistence,
  sanitizeDiagnosticTextForDisplay,
  sanitizePageScreenshotsForPersistence,
  sanitizeUrlForPersistence,
} from '../core/analyzer/url-privacy.js'
import { generateAgentContextBundle } from '../core/design-context/agent-context.js'
import { generateReconstructionBrief } from '../core/design-context/reconstruction-brief.js'
import { createValidationRecipe, validateRecipe } from '../core/design-context/validation-recipe.js'
import { coreT } from '../core/i18n/index.js'
import { type AnalysisRecoveryResponse, type AnalyzeOptions, type AnalyzeResponse } from '../shared/ipc-contract.js'
import { collectAnalysisAssets, removeGeneratedAssets } from './analysis-assets.js'
import { registerAnalysisHistoryIpcHandlers } from './analysis-history-ipc.js'
import { buildStoredAnalysisResult, restoreDeterministicStoredContext } from './analysis-records.js'
import { AnalysisRecoveryRegistry } from './analysis-recovery.js'
import { analyzeUrl } from './analyzer/index.js'
import { getDb } from './database.js'
import { addHistoryThumbnailPaths } from './history-thumbnails.js'
import { log } from './logger.js'
import { submitLoginDecision, waitForLoginDecision } from './login-decision.js'
import { analysisSiteName, readDesignEvidence, readDesignTokens } from './persisted-records.js'
import { getSettings } from './settings.js'
import { registerSystemIpcHandlers } from './system-ipc.js'
import { registerThemeIpcHandlers } from './theme-ipc.js'

const analysisControllers = new Map<number, AbortController>()
const analysisFinishControllers = new Map<number, AbortController>()
const analysisRecoveryRegistry = new AnalysisRecoveryRegistry()

export function registerIpcHandlers() {
  registerSystemIpcHandlers()
  registerThemeIpcHandlers()
  registerAnalysisHistoryIpcHandlers()

  // --- Analysis ---
  ipcMain.handle(
    'analysis:loginDecision',
    (event, requestId: string, decision: LoginDecision): { success: boolean } => {
      return { success: submitLoginDecision(event.sender.id, requestId, decision) }
    },
  )

  ipcMain.handle('analysis:cancel', (event) => {
    const controller = analysisControllers.get(event.sender.id)
    if (!controller) return { success: false }
    controller.abort()
    return { success: true }
  })

  ipcMain.handle('analysis:finish', (event) => {
    const controller = analysisFinishControllers.get(event.sender.id)
    if (!controller || controller.signal.aborted) return { success: false }
    controller.abort('user-finished')
    return { success: true }
  })

  ipcMain.handle('analysis:recover', (event): AnalysisRecoveryResponse => {
    return analysisRecoveryRegistry.recover(event.sender.id)
  })

  ipcMain.handle('analysis:acknowledge', (event) => {
    return { success: analysisRecoveryRegistry.acknowledge(event.sender.id) }
  })

  ipcMain.handle(
    'analyze:url',
    async (
      event,
      url: string,
      // Keep the renderer, preload, and main process on the same request input contract.
      options?: AnalyzeOptions,
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const senderId = event.sender.id
      const analysisController = new AbortController()
      const finishController = new AbortController()
      const displayUrl = sanitizeUrlForPersistence(url)
      const analysisStartedAt = Date.now()
      const recoverableRun = analysisRecoveryRegistry.start(senderId, displayUrl)
      let unpersistedAssets: string[] = []
      const completeRun = (response: AnalyzeResponse): AnalyzeResponse => {
        return analysisRecoveryRegistry.complete(senderId, recoverableRun, response)
      }
      const abortWhenRendererCloses = () => {
        analysisController.abort()
        analysisRecoveryRegistry.remove(senderId, recoverableRun)
      }
      analysisControllers.get(senderId)?.abort()
      analysisFinishControllers.get(senderId)?.abort('superseded')
      analysisControllers.set(senderId, analysisController)
      analysisFinishControllers.set(senderId, finishController)
      event.sender.once('destroyed', abortWhenRendererCloses)
      let analysisStage = 'progress.launchingBrowser'

      try {
        const currentSettings = getSettings()
        const request = createAnalysisRequest(
          { url, ...options },
          {
            ...CORE_ANALYSIS_REQUEST_DEFAULTS,
            viewports: options?.depth === 'deep' ? ['desktop', 'tablet', 'mobile'] : ['desktop', 'mobile'],
          },
        )
        log.info(
          'analysis',
          `start: url=${displayUrl} viewports=${request.viewports.join(',')} pageMode=${request.pageMode} maxPages=${request.maxPages ?? 'auto'} authMode=${request.authMode} requestSchema=${request.schemaVersion}`,
        )
        const effectiveOptions = {
          viewports: request.viewports,
          maxPages: request.maxPages,
          authMode: request.authMode,
          extractDarkMode: request.extractDarkMode,
          depth: request.depth,
          pageDiscovery: request.pageDiscovery,
          proxyServer: currentSettings.proxyServer || undefined,
          signal: analysisController.signal,
          finishSignal: finishController.signal,
        }
        const result = await analyzeUrl(
          request.url,
          effectiveOptions,
          (progress) => {
            if (analysisStage !== progress.step) {
              log.info(
                'analysis',
                `stage: url=${displayUrl} step=${progress.step} percent=${progress.percent} analyzedPages=${progress.analyzedPages} discoveredPages=${progress.discoveredPages} elapsedMs=${Date.now() - analysisStartedAt}`,
              )
            }
            analysisStage = progress.step
            analysisRecoveryRegistry.updateProgress(senderId, recoverableRun, progress)
            win?.webContents.send('analysis:progress', progress)
          },
          (request, signal) => waitForLoginDecision(win, request, signal),
        )
        unpersistedAssets = collectAnalysisAssets(result.pageScreenshots, result.designEvidence)

        const outputLanguage = options?.language?.startsWith('zh') ? ('zh-CN' as const) : ('en' as const)
        const artifacts = buildAnalysisArtifacts(result, {
          sourceUrl: displayUrl,
          language: outputLanguage,
          contextEvidence: sanitizeDesignEvidenceForPersistence(result.designEvidence),
        })
        const persistedTokens = artifacts.tokens
        const persistedEvidence = artifacts.evidence
        const persistedScreenshots = sanitizePageScreenshotsForPersistence(result.pageScreenshots)
        const displayedScreenshots = await addHistoryThumbnailPaths(persistedScreenshots, persistedEvidence)
        unpersistedAssets.push(
          ...displayedScreenshots.flatMap((screenshot) => (screenshot.thumbnailPath ? [screenshot.thumbnailPath] : [])),
        )
        const persistedPageCoverage = artifacts.pageCoverage
        const persistedFinalUrl = artifacts.finalUrl
        const displayedIssues = artifacts.extractionIssues
        const deterministicContext = artifacts.designContext
        const darkModeExport = artifacts.darkMode
        const cssVars = artifacts.cssVariables
        const tailwind = artifacts.tailwindTheme
        const designDoc = artifacts.designDoc

        const db = getDb()
        const analysisId = result.analysisId
        const viewports = effectiveOptions.viewports
        const pagesAnalyzed = Math.max(1, new Set(displayedScreenshots.map((screenshot) => screenshot.url)).size)
        const siteName = analysisSiteName(displayUrl, persistedEvidence)
        const previewPath = displayedScreenshots[0]?.thumbnailPath || null
        db.prepare(
          `INSERT INTO analyses
           (id, url, pages_analyzed, viewports, duration_ms, created_at, site_name, preview_path,
            tokens_json, css_variables, tailwind_theme, design_doc, page_screenshots_json,
             feature_tags_json, dark_tokens_json, dark_mode_method, dark_mode_selector, has_dark_mode, access_mode, auth_wall_detected, final_url, route_identity,
             design_evidence_json, design_profile_json, evidence_coverage_json,
             validation_report_json, analysis_timing_json, capture_manifest_json, completion_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          analysisId,
          displayUrl,
          pagesAnalyzed,
          JSON.stringify(viewports),
          result.duration,
          new Date().toISOString(),
          siteName,
          previewPath,
          JSON.stringify(persistedTokens),
          cssVars,
          tailwind,
          designDoc,
          JSON.stringify(displayedScreenshots),
          JSON.stringify(result.featureTags || []),
          darkModeExport?.darkTokens ? JSON.stringify(darkModeExport.darkTokens) : null,
          result.darkMode?.hasDarkMode ? result.darkMode.method : null,
          result.darkMode?.hasDarkMode ? result.darkMode.selector || null : null,
          result.darkMode?.hasDarkMode ? 1 : 0,
          result.accessMode ?? null,
          result.authWallDetected ? 1 : 0,
          persistedFinalUrl,
          routeIdentityFromUrl(persistedFinalUrl || displayUrl),
          artifacts.evidenceJson,
          JSON.stringify(deterministicContext.profile),
          JSON.stringify(persistedEvidence.coverage),
          JSON.stringify(deterministicContext.validationReport),
          JSON.stringify(result.timing),
          JSON.stringify(result.captureManifest),
          JSON.stringify(result.completion),
        )
        unpersistedAssets = []

        log.info(
          'analysis',
          `done: url=${displayUrl} id=${analysisId} pages=${pagesAnalyzed} durationMs=${result.duration} completion=${result.completion.reason} darkMode=${result.darkMode?.hasDarkMode ? 'yes' : 'no'} degraded=${displayedIssues.length}`,
        )
        log.info(
          'analysis',
          `timing: total=${result.timing.totalMs}ms screenshots=${result.timing.screenshotCaptureMs || 0}ms ` +
            `images=${result.timing.imageCount} userWaitExcluded=${result.timing.userWaitMs || 0}ms`,
        )
        displayedIssues.slice(0, 8).forEach((issue, index) => {
          const reason = issue.reason.replace(/\\s+/g, ' ').slice(0, 360)
          log.warn('analysis', `degraded #${index + 1}: stage=${issue.stage} reason=${reason}`)
        })
        if (displayedIssues.length > 8) {
          log.warn('analysis', `degraded: ${displayedIssues.length - 8} additional issues omitted`)
        }

        return completeRun({
          analysisId,
          savedThemeId: null,
          tokens: persistedTokens,
          cssVariables: cssVars,
          tailwindTheme: tailwind,
          designDoc,
          screenshots: result.screenshots,
          pageScreenshots: displayedScreenshots,
          duration: result.duration,
          analysisTiming: result.timing,
          url: displayUrl,
          hasDarkMode: result.darkMode?.hasDarkMode ?? false,
          darkModeMethod: result.darkMode?.method ?? 'none',
          darkModeSelector: result.darkMode?.selector,
          featureTags: result.featureTags,
          darkTokens: darkModeExport?.darkTokens?.colors ?? null,
          breakpoints: result.breakpoints,
          accessMode: result.accessMode,
          authWallDetected: result.authWallDetected,
          finalUrl: persistedFinalUrl,
          extractionIssues: displayedIssues,
          pageCoverage: persistedPageCoverage,
          captureManifest: result.captureManifest,
          designEvidence: persistedEvidence,
          designProfile: deterministicContext.profile,
          reconstructionBrief: deterministicContext.reconstructionBrief,
          agentContext: deterministicContext.agentContext,
          validationReport: deterministicContext.validationReport,
          completion: result.completion,
        })
      } catch (err: unknown) {
        await removeGeneratedAssets(app.getPath('userData'), unpersistedAssets)
        if (analysisController.signal.aborted) {
          log.info('analysis', `cancelled: url=${displayUrl}`)
          return completeRun({ cancelled: true })
        }
        if (err instanceof AuthenticationRequiredError) {
          log.info('analysis', `auth required: url=${displayUrl}`)
          return completeRun({
            authRequired: true,
            detection: sanitizeAuthWallDetectionForDisplay(err.detection),
          })
        }
        if (err instanceof AuthenticationCancelledError) {
          log.info('analysis', `cancelled at login decision: url=${displayUrl}`)
          return completeRun({ cancelled: true })
        }
        if (err instanceof NoUsableCapturesError) {
          const language = (options?.language || getSettings().language).startsWith('zh') ? 'zh-CN' : 'en'
          const message = coreT(language, 'analyzer.errors.noUsableCaptures')
          log.info('analysis', `no usable captures: url=${displayUrl}`)
          return completeRun({ error: true, message, stage: analysisStage })
        }
        const message = sanitizeDiagnosticTextForDisplay(err instanceof Error ? err.message : String(err))
        log.error('analysis', `failed during ${analysisStage}: url=${displayUrl} error=${message}`)
        console.error(`[imprint] analysis failed during ${analysisStage}: ${message}`)
        return completeRun({ error: true, message, stage: analysisStage })
      } finally {
        event.sender.removeListener('destroyed', abortWhenRendererCloses)
        if (analysisControllers.get(senderId) === analysisController) analysisControllers.delete(senderId)
        if (analysisFinishControllers.get(senderId) === finishController) analysisFinishControllers.delete(senderId)
      }
    },
  )

  ipcMain.handle(
    'validation:start',
    async (_event, analysisId: string, scenario: 'workflow' | 'content' | 'states') => {
      const db = getDb()
      const record = db.prepare('SELECT * FROM analyses WHERE id = ?').get(analysisId) as
        Record<string, unknown> | undefined
      if (!record?.design_evidence_json) return { error: true, message: 'Design evidence is required' }
      const evidence = readDesignEvidence(record.design_evidence_json)
      if (!evidence) return { error: true, message: 'Design evidence is required' }
      const evidenceTokens = evidence.tokens
      const tokens = readDesignTokens(record.tokens_json) || evidenceTokens
      const storedContext = restoreDeterministicStoredContext(record, tokens, evidence)
      if (!storedContext.profile) return { error: true, message: 'A deterministic DesignProfile is required' }
      const profile = storedContext.profile
      const recipe = createValidationRecipe(scenario, profile, evidenceTokens)
      const validationReport = validateRecipe(recipe, profile, evidenceTokens)
      db.prepare('UPDATE analyses SET validation_report_json = ? WHERE id = ?').run(
        JSON.stringify(validationReport),
        analysisId,
      )
      return {
        ...buildStoredAnalysisResult(record, tokens),
        designEvidence: evidence,
        designProfile: profile,
        reconstructionBrief: generateReconstructionBrief(profile, evidence, evidenceTokens),
        agentContext: generateAgentContextBundle('Validate a new design scenario', evidence, profile),
        validationReport,
      }
    },
  )
}
