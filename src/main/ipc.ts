import fs from 'node:fs'
import path from 'node:path'

import { BrowserWindow, app, dialog, ipcMain, net, shell } from 'electron'

import { getDefaultBaseUrl } from '../core/ai/capabilities.js'
import {
  listManagedSessions,
  migrateLegacyManagedSessions,
  removeAllManagedSessions,
  removeManagedSession,
} from '../core/analyzer/browser-session.js'
import { clusterColors } from '../core/analyzer/color-cluster.js'
import {
  type AuthMode,
  AuthenticationCancelledError,
  AuthenticationRequiredError,
  type LoginDecision,
} from '../core/analyzer/index.js'
import { buildDesignTokens } from '../core/analyzer/token-builder.js'
import type { DesignToken } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import {
  DESIGN_PROFILE_PROMPT_VERSION,
  createEvidenceFingerprint,
  createValidationRecipe,
  generateAgentContextBundle,
  generateReconstructionBrief,
  validateRecipe,
} from '../core/design-intelligence/index.js'
import type { DesignIntelligenceMeta, DesignProfile } from '../core/design-intelligence/types.js'
import {
  type DarkModeExportData,
  generateCssVariables,
  generateDesignDoc,
  generateDesignEvidenceJson,
  generateTailwindTheme,
} from '../core/export/index.js'
import { isRecord } from '../shared/type-guards.js'
import { detectAgentClis } from './agent-detect.js'
import { analyzeUrl } from './analyzer/index.js'
import { getDb } from './database.js'
import {
  chooseDesignIntelligenceRoute,
  createTaskContext,
  getInitialDesignIntelligenceMeta,
  runDesignIntelligence,
} from './design-intelligence.js'
import { getLogDir, log } from './logger.js'
import { submitLoginDecision, waitForLoginDecision } from './login-decision.js'
import { getSettings, saveSettings } from './settings.js'

interface SaveTextFileOptions {
  defaultName: string
  extension: string
  filterName: string
}

const designIntelligenceControllers = new Map<string, AbortController>()
const analysisStartTimes = new Map<string, number>()

function readFirstScreenshotPath(serialized: unknown): string | null {
  if (typeof serialized !== 'string') return null

  try {
    const screenshots = JSON.parse(serialized) as unknown
    if (!Array.isArray(screenshots) || screenshots.length === 0) return null
    const first = screenshots[0]
    return isRecord(first) && typeof first.path === 'string' ? first.path : null
  } catch {
    return null
  }
}

async function saveTextFile(content: string, options: SaveTextFileOptions) {
  const result = await dialog.showSaveDialog({
    defaultPath: options.defaultName,
    filters: [{ name: options.filterName, extensions: [options.extension] }],
  })
  if (result.canceled || !result.filePath) return { success: false as const, canceled: true as const }

  fs.writeFileSync(result.filePath, content, 'utf-8')
  return { success: true as const, filePath: result.filePath }
}

export function registerIpcHandlers() {
  migrateLegacyManagedSessions(app.getPath('userData'))

  // --- Analyses ---
  ipcMain.handle('analyses:list', () => {
    const db = getDb()
    return db
      .prepare(
        `SELECT *
         FROM analyses
         ORDER BY created_at DESC`,
      )
      .all()
  })

  ipcMain.handle('analyses:listSummaries', () => {
    const db = getDb()
    const records = db
      .prepare(
        `SELECT a.id, a.url, a.pages_analyzed, a.viewports, a.duration_ms,
                a.token_usage, a.created_at, a.page_screenshots_json,
                a.design_intelligence_status, a.design_intelligence_meta_json
         FROM analyses a
         ORDER BY a.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>

    return records.map(({ page_screenshots_json: screenshots, design_intelligence_meta_json: metaJson, ...record }) => {
      let aiTokenUsage: { input?: number; output?: number } | undefined
      if (typeof metaJson === 'string') {
        try {
          const meta = JSON.parse(metaJson) as Record<string, unknown>
          if (meta.tokenUsage && typeof meta.tokenUsage === 'object') {
            aiTokenUsage = meta.tokenUsage as { input?: number; output?: number }
          }
        } catch {
          /* ignore */
        }
      }
      return {
        ...record,
        screenshot_path: readFirstScreenshotPath(screenshots),
        ai_token_usage: aiTokenUsage,
      }
    })
  })

  ipcMain.handle('analyses:delete', (_event, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM analyses WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('analyses:deleteMany', (_event, ids: string[]) => {
    const db = getDb()
    const stmt = db.prepare('DELETE FROM analyses WHERE id = ?')
    db.transaction((list: string[]) => {
      for (const id of list) stmt.run(id)
    })(ids)
    return { success: true }
  })

  ipcMain.handle('analyses:get', (_event, id: string) => {
    const db = getDb()
    const record = db
      .prepare(
        `SELECT *
         FROM analyses
         WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined
    if (!record) return null

    const tokens = JSON.parse((record.tokens_json as string) || '{}') as DesignToken
    const designEvidence = record.design_evidence_json
      ? (JSON.parse(record.design_evidence_json as string) as DesignEvidence)
      : null
    const designProfile = record.design_profile_json
      ? (JSON.parse(record.design_profile_json as string) as DesignProfile)
      : null
    const designIntelligence = record.design_intelligence_meta_json
      ? (JSON.parse(record.design_intelligence_meta_json as string) as DesignIntelligenceMeta)
      : ({
          status: record.design_intelligence_status || 'not-requested',
          capabilityLevel: 'evidence-only',
        } as DesignIntelligenceMeta)
    const reconstructionBrief =
      designProfile && designEvidence ? generateReconstructionBrief(designProfile, designEvidence, tokens) : null
    const agentContext =
      designEvidence && designProfile
        ? createTaskContext('Create a new page or component', designEvidence, designProfile, designIntelligence)
        : designEvidence
          ? createTaskContext('Use the observed design evidence', designEvidence, null, designIntelligence)
          : null

    return {
      id: record.id,
      url: record.url,
      finalUrl: record.final_url,
      pagesAnalyzed: record.pages_analyzed,
      durationMs: record.duration_ms,
      createdAt: record.created_at,
      tokens,
      cssVariables: record.css_variables || '',
      tailwindTheme: record.tailwind_theme || '',
      designDoc: record.design_doc || '',
      pageScreenshots: JSON.parse((record.page_screenshots_json as string) || '[]'),
      featureTags: JSON.parse((record.feature_tags_json as string) || '[]'),
      darkTokens: record.dark_tokens_json ? JSON.parse(record.dark_tokens_json as string) : null,
      hasDarkMode: record.has_dark_mode === 1,
      accessMode: record.access_mode,
      authWallDetected: record.auth_wall_detected === 1,
      designEvidence,
      designIntelligence,
      designProfile,
      reconstructionBrief,
      agentContext,
      validationReport: record.validation_report_json ? JSON.parse(record.validation_report_json as string) : null,
    }
  })

  // --- Isolated browser sessions ---
  ipcMain.handle('browserSessions:list', () => {
    return listManagedSessions(app.getPath('userData'))
  })

  ipcMain.handle('browserSessions:delete', (_event, id: string) => {
    try {
      return { success: removeManagedSession(app.getPath('userData'), id) }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('browserSessions:clearAll', () => {
    try {
      return { success: true, count: removeAllManagedSessions(app.getPath('userData')) }
    } catch (error) {
      return { success: false, count: 0, message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  // --- Analysis ---
  ipcMain.handle(
    'analysis:loginDecision',
    (event, requestId: string, decision: LoginDecision): { success: boolean } => {
      return { success: submitLoginDecision(event.sender.id, requestId, decision) }
    },
  )

  ipcMain.handle('design-intelligence:cancel', (_event, analysisId: string) => {
    const controller = designIntelligenceControllers.get(analysisId)
    if (!controller) return { success: false }
    controller.abort()
    designIntelligenceControllers.delete(analysisId)
    return { success: true }
  })

  ipcMain.handle('design-intelligence:skip', (_event, analysisId: string) => {
    const db = getDb()
    const record = db.prepare('SELECT id FROM analyses WHERE id = ?').get(analysisId)
    if (!record) return { error: true }
    designIntelligenceControllers.get(analysisId)?.abort()
    designIntelligenceControllers.delete(analysisId)
    const meta: DesignIntelligenceMeta = { status: 'skipped', capabilityLevel: 'evidence-only' }
    db.prepare(
      `UPDATE analyses
       SET design_intelligence_status = ?, design_intelligence_meta_json = ?
       WHERE id = ?`,
    ).run(meta.status, JSON.stringify(meta), analysisId)
    return { designIntelligence: meta }
  })

  ipcMain.handle(
    'analyze:url',
    async (
      event,
      url: string,
      options?: {
        viewports?: string[]
        maxPages?: number
        useSession?: boolean
        authMode?: AuthMode
        language?: string
        depth?: 'standard' | 'deep'
      },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      let analysisStage = 'progress.launchingBrowser'

      log.info(
        'analysis',
        `start: url=${url} viewports=${options?.viewports?.join(',') ?? 'default'} maxPages=${options?.maxPages ?? 'default'} authMode=${options?.authMode ?? 'auto'}`,
      )

      const analysisStartTime = Date.now()
      try {
        const currentSettings = getSettings()
        const effectiveOptions = {
          ...options,
          viewports:
            options?.viewports || (options?.depth === 'deep' ? ['desktop', 'tablet', 'mobile'] : ['desktop', 'mobile']),
          proxyServer: currentSettings.proxyServer || undefined,
        }
        const result = await analyzeUrl(
          url,
          effectiveOptions,
          (step, percent) => {
            analysisStage = step
            win?.webContents.send('analysis:progress', { step, percent })
          },
          (request, signal) => waitForLoginDecision(win, request, signal),
        )

        const settings = getSettings()
        const designIntelligenceMeta = getInitialDesignIntelligenceMeta(settings, result.designEvidence)
        const designIntelligenceStatus = designIntelligenceMeta.status

        let darkModeExport: DarkModeExportData | undefined
        if (result.darkMode?.hasDarkMode && result.darkMode.darkStyles) {
          const darkClustered = clusterColors(result.darkMode.darkStyles.colors, result.darkMode.darkStyles.usageCount)
          const darkTokens = buildDesignTokens(result.darkMode.darkStyles, darkClustered)
          darkModeExport = {
            hasDarkMode: true,
            darkTokens,
            method: result.darkMode.method,
          }
        }

        const cssVars = generateCssVariables(result.tokens, darkModeExport, result.breakpoints)
        const tailwind = generateTailwindTheme(result.tokens, darkModeExport)
        const designDoc = generateDesignDoc(
          result.tokens,
          url,
          result.featureTags,
          darkModeExport,
          result.breakpoints,
          result.components,
          options?.language?.startsWith('zh') ? 'zh-CN' : 'en',
          [],
          result.designEvidence,
        )

        const db = getDb()
        const analysisId = result.analysisId
        const viewports = effectiveOptions.viewports
        const pagesAnalyzed = Math.max(1, new Set(result.pageScreenshots.map((screenshot) => screenshot.url)).size)
        db.prepare(
          `INSERT INTO analyses
           (id, url, pages_analyzed, viewports, duration_ms, created_at,
            tokens_json, css_variables, tailwind_theme, design_doc, page_screenshots_json,
            feature_tags_json, dark_tokens_json, has_dark_mode, access_mode, auth_wall_detected, final_url,
            design_evidence_json, evidence_coverage_json, design_intelligence_status,
            design_intelligence_meta_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          analysisId,
          url,
          pagesAnalyzed,
          JSON.stringify(viewports),
          Date.now() - analysisStartTime,
          new Date().toISOString(),
          JSON.stringify(result.tokens),
          cssVars,
          tailwind,
          designDoc,
          JSON.stringify(result.pageScreenshots || []),
          JSON.stringify(result.featureTags || []),
          darkModeExport?.darkTokens?.colors ? JSON.stringify(darkModeExport.darkTokens.colors) : null,
          result.darkMode?.hasDarkMode ? 1 : 0,
          result.accessMode ?? null,
          result.authWallDetected ? 1 : 0,
          result.finalUrl ?? null,
          generateDesignEvidenceJson(result.designEvidence),
          JSON.stringify(result.designEvidence.coverage),
          designIntelligenceStatus,
          JSON.stringify(designIntelligenceMeta),
        )

        analysisStartTimes.set(analysisId, analysisStartTime)

        log.info(
          'analysis',
          `done: url=${url} id=${analysisId} pages=${pagesAnalyzed} durationMs=${result.duration} darkMode=${result.darkMode?.hasDarkMode ? 'yes' : 'no'}`,
        )

        return {
          analysisId,
          tokens: result.tokens,
          cssVariables: cssVars,
          tailwindTheme: tailwind,
          designDoc,
          screenshots: result.screenshots,
          pageScreenshots: result.pageScreenshots,
          duration: result.duration,
          url,
          hasDarkMode: result.darkMode?.hasDarkMode ?? false,
          darkModeMethod: result.darkMode?.method ?? 'none',
          featureTags: result.featureTags,
          darkTokens: darkModeExport?.darkTokens?.colors ?? null,
          breakpoints: result.breakpoints,
          accessMode: result.accessMode,
          authWallDetected: result.authWallDetected,
          finalUrl: result.finalUrl,
          designEvidence: result.designEvidence,
          designIntelligence: designIntelligenceMeta,
        }
      } catch (err: unknown) {
        if (err instanceof AuthenticationRequiredError) {
          log.info('analysis', `auth required: url=${url}`)
          return {
            authRequired: true,
            detection: err.detection,
          }
        }
        if (err instanceof AuthenticationCancelledError) {
          log.info('analysis', `cancelled at login decision: url=${url}`)
          return { cancelled: true }
        }
        const message = err instanceof Error ? err.message : String(err)
        log.error('analysis', `failed during ${analysisStage}: url=${url} error=${message}`)
        console.error(`[imprint] analysis failed during ${analysisStage}:`, err)
        return { error: true, message, stage: analysisStage }
      }
    },
  )

  ipcMain.handle('design-intelligence:start', async (event, analysisId: string, language?: string, force = false) => {
    const db = getDb()
    const record = db.prepare('SELECT * FROM analyses WHERE id = ?').get(analysisId) as
      Record<string, unknown> | undefined
    if (!record) return { error: true, message: 'Analysis not found' }
    if (!record.design_evidence_json) return { error: true, message: 'Design Evidence is unavailable for this record' }

    const win = BrowserWindow.fromWebContents(event.sender)
    const designEvidence = JSON.parse(record.design_evidence_json as string) as DesignEvidence
    const tokens = JSON.parse((record.tokens_json as string) || '{}') as DesignToken
    const settings = getSettings()
    const outputLanguage = language?.startsWith('zh') ? ('zh-CN' as const) : ('en' as const)
    const existingMeta = record.design_intelligence_meta_json
      ? (JSON.parse(record.design_intelligence_meta_json as string) as DesignIntelligenceMeta)
      : null
    const route = chooseDesignIntelligenceRoute(settings, designEvidence)
    const expectedFingerprint = createEvidenceFingerprint(
      designEvidence,
      route.mode,
      route.provider,
      route.model,
      undefined,
      DESIGN_PROFILE_PROMPT_VERSION,
      '1',
    )
    if (
      !force &&
      record.design_profile_json &&
      existingMeta &&
      (existingMeta.status === 'complete' || existingMeta.status === 'partial') &&
      existingMeta.inputFingerprint === expectedFingerprint &&
      existingMeta.schemaVersion === '1' &&
      existingMeta.promptVersion === DESIGN_PROFILE_PROMPT_VERSION
    ) {
      const designProfile = JSON.parse(record.design_profile_json as string) as DesignProfile
      const reconstructionBrief = generateReconstructionBrief(designProfile, designEvidence, tokens)
      return {
        analysisId,
        tokens,
        cssVariables: record.css_variables || '',
        tailwindTheme: record.tailwind_theme || '',
        designDoc: record.design_doc || '',
        screenshots: (JSON.parse((record.page_screenshots_json as string) || '[]') as Array<{ path: string }>).map(
          (screenshot) => screenshot.path,
        ),
        pageScreenshots: JSON.parse((record.page_screenshots_json as string) || '[]'),
        duration: Number(record.duration_ms) || 0,
        url: record.url,
        designEvidence,
        designProfile,
        designIntelligence: existingMeta,
        reconstructionBrief,
        agentContext: createTaskContext('Create a new page or component', designEvidence, designProfile, existingMeta),
        validationReport: record.validation_report_json ? JSON.parse(record.validation_report_json as string) : null,
      }
    }
    const pendingMeta = getInitialDesignIntelligenceMeta(settings, designEvidence)
    designIntelligenceControllers.get(analysisId)?.abort()
    const intelligenceController = new AbortController()
    designIntelligenceControllers.set(analysisId, intelligenceController)

    db.prepare(
      `UPDATE analyses
       SET design_intelligence_status = ?, design_intelligence_meta_json = ?
       WHERE id = ?`,
    ).run(pendingMeta.status, JSON.stringify(pendingMeta), analysisId)
    win?.webContents.send('design-intelligence:progress', {
      step: 'progress.interpretingDesignLanguage',
      percent: 5,
    })

    const intelligence = await runDesignIntelligence(
      designEvidence,
      tokens,
      settings,
      outputLanguage,
      intelligenceController.signal,
      (step, percent) => {
        win?.webContents.send('design-intelligence:progress', { step, percent })
      },
    )
    if (designIntelligenceControllers.get(analysisId) === intelligenceController) {
      designIntelligenceControllers.delete(analysisId)
    }
    let designDoc = (record.design_doc as string) || ''
    const previousProfile = record.design_profile_json
      ? (JSON.parse(record.design_profile_json as string) as DesignProfile)
      : null
    const designProfile = intelligence.profile || previousProfile
    let reconstructionBrief: string | null = designProfile
      ? generateReconstructionBrief(designProfile, designEvidence, tokens)
      : null
    const validationReport =
      intelligence.validationReport ||
      (record.validation_report_json
        ? (JSON.parse(record.validation_report_json as string) as ReturnType<typeof validateRecipe>)
        : null)
    let agentContext = createTaskContext(
      'Use the observed design evidence',
      designEvidence,
      designProfile,
      intelligence.meta,
    )

    if (intelligence.profile) {
      win?.webContents.send('design-intelligence:progress', {
        step: 'progress.validatingDesignLanguage',
        percent: 75,
      })
      reconstructionBrief = intelligence.reconstructionBrief
      agentContext = createTaskContext(
        'Create a new page or component',
        designEvidence,
        intelligence.profile,
        intelligence.meta,
      )
      const darkColors = record.dark_tokens_json
        ? (JSON.parse(record.dark_tokens_json as string) as Record<string, string>)
        : null
      const darkModeExport: DarkModeExportData | undefined = darkColors
        ? {
            hasDarkMode: true,
            darkTokens: { ...tokens, colors: darkColors },
            method: 'media-query',
          }
        : undefined
      designDoc = generateDesignDoc(
        tokens,
        record.url as string,
        designEvidence.featureTags,
        darkModeExport,
        designEvidence.breakpoints,
        undefined,
        outputLanguage,
        intelligence.examples,
        designEvidence,
        intelligence.profile,
        reconstructionBrief || undefined,
      )
    }

    const startTime = analysisStartTimes.get(analysisId)
    const totalDuration = startTime ? Date.now() - startTime : null
    analysisStartTimes.delete(analysisId)

    db.prepare(
      `UPDATE analyses
       SET design_doc = ?, design_profile_json = ?, design_intelligence_status = ?,
           design_intelligence_meta_json = ?, validation_report_json = ?${totalDuration != null ? ', duration_ms = ?' : ''}
       WHERE id = ?`,
    ).run(
      ...[
        designDoc,
        designProfile ? JSON.stringify(designProfile) : null,
        intelligence.meta.status,
        JSON.stringify(intelligence.meta),
        validationReport ? JSON.stringify(validationReport) : null,
        ...(totalDuration != null ? [totalDuration] : []),
        analysisId,
      ],
    )
    win?.webContents.send('design-intelligence:progress', {
      step:
        intelligence.meta.status === 'failed' ? 'progress.designLanguageFallback' : 'progress.designLanguageComplete',
      percent: 100,
    })

    return {
      analysisId,
      tokens,
      cssVariables: record.css_variables || '',
      tailwindTheme: record.tailwind_theme || '',
      designDoc,
      screenshots: (JSON.parse((record.page_screenshots_json as string) || '[]') as Array<{ path: string }>).map(
        (screenshot) => screenshot.path,
      ),
      pageScreenshots: JSON.parse((record.page_screenshots_json as string) || '[]'),
      duration: Number(record.duration_ms) || 0,
      url: record.url,
      featureTags: designEvidence.featureTags,
      darkTokens: record.dark_tokens_json ? JSON.parse(record.dark_tokens_json as string) : null,
      hasDarkMode: record.has_dark_mode === 1,
      accessMode: record.access_mode,
      authWallDetected: record.auth_wall_detected === 1,
      finalUrl: record.final_url,
      designEvidence,
      designProfile,
      designIntelligence: intelligence.meta,
      reconstructionBrief,
      agentContext,
      validationReport,
    }
  })

  ipcMain.handle(
    'validation:start',
    async (_event, analysisId: string, scenario: 'workflow' | 'content' | 'states') => {
      const db = getDb()
      const record = db.prepare('SELECT * FROM analyses WHERE id = ?').get(analysisId) as
        Record<string, unknown> | undefined
      if (!record?.design_evidence_json || !record.design_profile_json) {
        return { error: true, message: 'A validated DesignProfile is required' }
      }
      const evidence = JSON.parse(record.design_evidence_json as string) as DesignEvidence
      const profile = JSON.parse(record.design_profile_json as string) as DesignProfile
      const tokens = JSON.parse((record.tokens_json as string) || '{}') as DesignToken
      const meta = JSON.parse((record.design_intelligence_meta_json as string) || '{}') as DesignIntelligenceMeta
      const recipe = createValidationRecipe(scenario, profile, tokens)
      const validationReport = validateRecipe(recipe, profile, tokens, meta.capabilityLevel)
      db.prepare('UPDATE analyses SET validation_report_json = ? WHERE id = ?').run(
        JSON.stringify(validationReport),
        analysisId,
      )
      return {
        analysisId,
        tokens,
        cssVariables: record.css_variables || '',
        tailwindTheme: record.tailwind_theme || '',
        designDoc: record.design_doc || '',
        screenshots: (JSON.parse((record.page_screenshots_json as string) || '[]') as Array<{ path: string }>).map(
          (screenshot) => screenshot.path,
        ),
        pageScreenshots: JSON.parse((record.page_screenshots_json as string) || '[]'),
        duration: Number(record.duration_ms) || 0,
        url: record.url,
        designEvidence: evidence,
        designProfile: profile,
        designIntelligence: meta,
        reconstructionBrief: generateReconstructionBrief(profile, evidence, tokens),
        agentContext: generateAgentContextBundle(
          'Validate a new design scenario',
          meta.capabilityLevel,
          evidence,
          profile,
        ),
        validationReport,
      }
    },
  )

  // --- Export file directly from an analysis result ---
  ipcMain.handle('export:file', async (_event, content: string, defaultName: string, ext: string) => {
    const result = await saveTextFile(content, {
      defaultName,
      extension: ext,
      filterName: `${ext.toUpperCase()} Files`,
    })
    if (!result.success) return result
    log.info('export', `file written: ${result.filePath}`)
    return result
  })

  // --- Export built-in theme with assets to a directory ---
  ipcMain.handle(
    'export:toDirectory',
    async (_event, files: Array<{ name: string; content: string }>, assets: string[], defaultDir: string) => {
      const result = await dialog.showOpenDialog({
        ...(defaultDir ? { defaultPath: defaultDir } : {}),
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select export directory',
      })
      if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true }

      const targetDir = result.filePaths[0]

      for (const file of files) {
        fs.writeFileSync(path.join(targetDir, file.name), file.content, 'utf-8')
      }

      if (assets.length > 0) {
        const assetsDir = app.isPackaged
          ? path.join(process.resourcesPath, 'assets', 'theme-backgrounds')
          : path.join(app.getAppPath(), 'assets', 'theme-backgrounds')
        for (const asset of assets) {
          const src = path.join(assetsDir, asset)
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(targetDir, asset))
          }
        }
      }

      log.info('export', `directory export: ${targetDir} files=${files.length} assets=${assets.length}`)
      return { success: true, filePath: targetDir }
    },
  )

  // --- Settings ---
  ipcMain.on('settings:getSync', (event) => {
    event.returnValue = getSettings()
  })

  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:save', (_event, settings: Record<string, unknown>) => {
    // Never log the payload — it can contain API keys.
    log.info('settings', `saved: ${Object.keys(settings).join(', ')}`)
    return saveSettings(settings as Parameters<typeof saveSettings>[0])
  })

  ipcMain.on('log:event', (_event, level: string, message: string) => {
    const safeLevel = level === 'warn' || level === 'error' ? level : 'info'
    const safeMessage = typeof message === 'string' ? message.slice(0, 2000) : String(message)
    log[safeLevel]('renderer', safeMessage)
  })

  ipcMain.handle('app:openLogsFolder', async () => {
    const logDir = getLogDir()
    await shell.openPath(logDir)
    return { success: true, path: logDir }
  })

  ipcMain.handle('settings:detectAgentClis', async (_event, force: unknown) => {
    return detectAgentClis(force === true)
  })

  ipcMain.handle('settings:testApiKey', async (_event, provider: string, apiKey: string, customBaseUrl?: string) => {
    const baseUrl = (customBaseUrl || getDefaultBaseUrl(provider)).replace(/\/$/, '')
    if (!baseUrl) {
      return { success: false, message: 'Custom provider requires a base URL' }
    }

    try {
      const authHeaders: Record<string, string> =
        provider === 'anthropic'
          ? { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey }
          : provider === 'google'
            ? {}
            : { Authorization: `Bearer ${apiKey}` }
      const timeout = AbortSignal.timeout(10_000)

      const modelsEndpoint =
        provider === 'google' ? `${baseUrl}/models?key=${encodeURIComponent(apiKey)}` : `${baseUrl}/models`
      const modelsRes = await net.fetch(modelsEndpoint, { headers: authHeaders, signal: timeout })
      if (modelsRes.ok) {
        return { success: true, message: 'Connection successful' }
      }

      if (modelsRes.status === 404) {
        const chatRes = await net.fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { ...authHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'auto',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          signal: timeout,
        })
        if (chatRes.ok) {
          return { success: true, message: 'Connection successful' }
        }
        const chatText = await chatRes.text().catch(() => '')
        let detail = ''
        try {
          const body = JSON.parse(chatText) as { error?: { message?: string }; message?: string }
          detail = body?.error?.message || body?.message || chatText.slice(0, 200)
        } catch {
          detail = chatText.slice(0, 200)
        }
        return { success: false, message: `HTTP ${chatRes.status}${detail ? ': ' + detail : ''}` }
      }

      const text = await modelsRes.text().catch(() => '')
      let detail = ''
      try {
        const body = JSON.parse(text) as { error?: { message?: string }; message?: string }
        detail = body?.error?.message || body?.message || text.slice(0, 200)
      } catch {
        detail = text.slice(0, 200)
      }
      return { success: false, message: `HTTP ${modelsRes.status}${detail ? ': ' + detail : ''}` }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    }
  })
}
