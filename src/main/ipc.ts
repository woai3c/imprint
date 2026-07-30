import { v4 as uuidv4 } from 'uuid'

import fs from 'node:fs'
import path from 'node:path'

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'

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
  generateDtcgJson,
  generateScssVariables,
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
import { normalizeImportedTokens, readImportedThemeMeta } from './theme-import.js'

interface SaveTextFileOptions {
  defaultName: string
  extension: string
  filterName: string
}

const designIntelligenceControllers = new Map<string, AbortController>()

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

  // --- Themes ---
  ipcMain.handle('themes:list', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM themes ORDER BY updated_at DESC').all()
  })

  ipcMain.handle('themes:delete', (_event, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM themes WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('themes:toggleFavorite', (_event, id: string) => {
    const db = getDb()
    db.prepare(
      'UPDATE themes SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?',
    ).run(new Date().toISOString(), id)
    return db.prepare('SELECT * FROM themes WHERE id = ?').get(id)
  })

  // --- Analyses ---
  ipcMain.handle('analyses:list', () => {
    const db = getDb()
    return db
      .prepare(
        `SELECT a.*, t.name as theme_name, t.source_url
         FROM analyses a
         LEFT JOIN themes t ON a.theme_id = t.id
         ORDER BY a.created_at DESC`,
      )
      .all()
  })

  ipcMain.handle('analyses:listSummaries', () => {
    const db = getDb()
    const records = db
      .prepare(
        `SELECT a.id, a.theme_id, a.url, a.pages_analyzed, a.viewports, a.duration_ms,
                a.token_usage, a.created_at, a.page_screenshots_json,
                t.name as theme_name, t.source_url
         FROM analyses a
         LEFT JOIN themes t ON a.theme_id = t.id
         ORDER BY a.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>

    return records.map(({ page_screenshots_json: screenshots, ...record }) => ({
      ...record,
      screenshot_path: readFirstScreenshotPath(screenshots),
    }))
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
        `SELECT a.*, t.name as theme_name, t.source_url
         FROM analyses a
         LEFT JOIN themes t ON a.theme_id = t.id
         WHERE a.id = ?`,
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
      themeId: record.theme_id,
      themeName: record.theme_name,
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

      try {
        const effectiveOptions = {
          ...options,
          viewports:
            options?.viewports || (options?.depth === 'deep' ? ['desktop', 'tablet', 'mobile'] : ['desktop', 'mobile']),
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
           (id, theme_id, url, pages_analyzed, viewports, duration_ms, created_at,
            tokens_json, css_variables, tailwind_theme, design_doc, page_screenshots_json,
            feature_tags_json, dark_tokens_json, has_dark_mode, access_mode, auth_wall_detected, final_url,
            design_evidence_json, evidence_coverage_json, design_intelligence_status,
            design_intelligence_meta_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          analysisId,
          null,
          url,
          pagesAnalyzed,
          JSON.stringify(viewports),
          result.duration,
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
      percent: 20,
    })

    const intelligence = await runDesignIntelligence(
      designEvidence,
      tokens,
      settings,
      outputLanguage,
      intelligenceController.signal,
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

    db.prepare(
      `UPDATE analyses
       SET design_doc = ?, design_profile_json = ?, design_intelligence_status = ?,
           design_intelligence_meta_json = ?, validation_report_json = ?
       WHERE id = ?`,
    ).run(
      designDoc,
      designProfile ? JSON.stringify(designProfile) : null,
      intelligence.meta.status,
      JSON.stringify(intelligence.meta),
      validationReport ? JSON.stringify(validationReport) : null,
      analysisId,
    )
    if (record.theme_id) {
      db.prepare(
        `UPDATE themes
         SET design_doc = ?, design_evidence_json = ?, design_profile_json = ?,
             design_intelligence_meta_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        designDoc,
        JSON.stringify(designEvidence),
        designProfile ? JSON.stringify(designProfile) : null,
        JSON.stringify(intelligence.meta),
        new Date().toISOString(),
        record.theme_id,
      )
    }
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

  // --- Save theme to library (user-initiated) ---
  ipcMain.handle(
    'themes:save',
    async (
      _event,
      data: {
        url: string
        tokens: Record<string, unknown>
        cssVariables: string
        tailwindTheme: string
        designDoc: string
        screenshots: string[]
        designEvidence?: DesignEvidence
        designProfile?: DesignProfile | null
        designIntelligence?: DesignIntelligenceMeta
      },
    ) => {
      const db = getDb()
      const themeId = uuidv4()
      const now = new Date().toISOString()

      let hostname: string
      try {
        hostname = new URL(data.url).hostname
      } catch {
        hostname = data.url
      }

      db.prepare(
        `INSERT INTO themes (
           id, name, source_url, screenshot_path, tokens_json, css_variables, tailwind_theme, design_doc,
           design_evidence_json, design_profile_json, design_intelligence_meta_json, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        themeId,
        `Theme from ${hostname}`,
        data.url,
        data.screenshots[0] || null,
        JSON.stringify(data.tokens),
        data.cssVariables,
        data.tailwindTheme,
        data.designDoc,
        data.designEvidence ? JSON.stringify(data.designEvidence) : null,
        data.designProfile ? JSON.stringify(data.designProfile) : null,
        data.designIntelligence ? JSON.stringify(data.designIntelligence) : null,
        now,
        now,
      )

      db.prepare(`UPDATE analyses SET theme_id = ? WHERE url = ? AND theme_id IS NULL`).run(themeId, data.url)

      return { success: true, themeId }
    },
  )

  // --- Export file directly (from analysis result, not saved theme) ---
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

  // --- Export ---
  ipcMain.handle('export:theme', async (_event, id: string, format: string) => {
    const db = getDb()
    const theme = db.prepare('SELECT * FROM themes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!theme) return { error: true, message: 'Theme not found' }

    let content: string
    let ext: string
    let filterName: string
    let defaultName: string

    switch (format) {
      case 'css':
        content = theme.css_variables as string
        ext = 'css'
        filterName = 'CSS Files'
        defaultName = 'theme-variables.css'
        break
      case 'tailwind':
        content = theme.tailwind_theme as string
        ext = 'css'
        filterName = 'CSS Files'
        defaultName = 'tailwind-theme.css'
        break
      case 'json':
        content = generateDtcgJson(JSON.parse(theme.tokens_json as string))
        ext = 'json'
        filterName = 'JSON Files'
        defaultName = 'design-tokens.json'
        break
      case 'scss':
        content = generateScssVariables(JSON.parse(theme.tokens_json as string))
        ext = 'scss'
        filterName = 'SCSS Files'
        defaultName = 'theme-variables.scss'
        break
      case 'markdown':
        content = theme.design_doc as string
        ext = 'md'
        filterName = 'Markdown Files'
        defaultName = 'DESIGN.md'
        break
      default:
        return { error: true, message: `Unknown format: ${format}` }
    }

    const result = await saveTextFile(content, {
      defaultName,
      extension: ext,
      filterName,
    })

    if (!result.success) return result
    log.info('export', `theme exported: id=${id} format=${format} path=${result.filePath}`)

    const exportId = uuidv4()
    db.prepare('INSERT INTO exports (id, theme_id, format, file_path, created_at) VALUES (?, ?, ?, ?, ?)').run(
      exportId,
      id,
      format,
      result.filePath,
      new Date().toISOString(),
    )

    return { success: true, filePath: result.filePath }
  })

  ipcMain.handle('import:theme', async (_event, language?: string) => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Theme Tokens JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const filePath = result.filePaths[0]
    if (filePath.endsWith('.json')) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const importedData = JSON.parse(content) as unknown
        const tokens = normalizeImportedTokens(importedData)
        const db = getDb()
        const themeId = uuidv4()
        const now = new Date().toISOString()
        const cssVars = generateCssVariables(tokens)
        const tailwind = generateTailwindTheme(tokens)
        const designDoc = generateDesignDoc(
          tokens,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          language?.startsWith('zh') ? 'zh-CN' : 'en',
        )
        const meta = readImportedThemeMeta(importedData)
        const themeName = typeof meta?.name === 'string' && meta.name.trim() ? meta.name : 'Imported theme'

        db.prepare(
          `INSERT INTO themes (id, name, tokens_json, css_variables, tailwind_theme, design_doc, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(themeId, themeName, JSON.stringify(tokens), cssVars, tailwind, designDoc, now, now)

        log.info('import', `theme imported: file=${filePath} name=${themeName} id=${themeId}`)
        return { success: true, themeId }
      } catch (err: unknown) {
        log.error(
          'import',
          `theme import failed: file=${filePath} error=${err instanceof Error ? err.message : String(err)}`,
        )
        return { error: true, message: err instanceof Error ? err.message : String(err) }
      }
    }

    return { success: false, message: 'Only theme token JSON is supported' }
  })

  // --- Settings ---
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
      const endpoint =
        provider === 'google' ? `${baseUrl}/models?key=${encodeURIComponent(apiKey)}` : `${baseUrl}/models`
      const headers: Record<string, string> =
        provider === 'anthropic'
          ? { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey }
          : provider === 'google'
            ? {}
            : { Authorization: `Bearer ${apiKey}` }
      const res = await fetch(endpoint, {
        headers,
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        return { success: true, message: 'Connection successful' }
      }
      const text = await res.text().catch(() => '')
      return { success: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    }
  })
}
