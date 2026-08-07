import { randomUUID } from 'node:crypto'
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
import {
  type AuthMode,
  AuthenticationCancelledError,
  AuthenticationRequiredError,
  type LoginDecision,
  type PageDiscoveryMode,
} from '../core/analyzer/index.js'
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
  buildDarkModeExportData,
  generateCssVariables,
  generateDesignDoc,
  generateDesignEvidenceJson,
  generateDtcgJson,
  generateTailwindTheme,
  restoreDarkModeExportData,
} from '../core/export/index.js'
import {
  type PageScreenshotData,
  type ThemeExportFormat,
  type ThemeRecord,
  type ThemeSaveResponse,
  type ThemeSummaryRecord,
} from '../shared/ipc-contract.js'
import { isRecord } from '../shared/type-guards.js'
import { detectAgentClis } from './agent-detect.js'
import { analyzeUrl } from './analyzer/index.js'
import { getDb } from './database.js'
import {
  chooseDesignIntelligenceRoute,
  createTaskContext,
  getInitialDesignIntelligenceMeta,
  runDesignIntelligence,
  runExampleGeneration,
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
const exampleGenerationControllers = new Map<string, AbortController>()
const analysisStartTimes = new Map<string, number>()
const THEME_SUMMARY_COLUMNS = `id, name, source_url, screenshot_path, tokens_json, dark_tokens_json,
  dark_mode_method, dark_mode_selector, tags, is_favorite, created_at, updated_at`

function compactTokenSnapshot(serialized: string | null): string | null {
  if (!serialized) return serialized
  try {
    const parsed = JSON.parse(serialized) as unknown
    if (!isRecord(parsed) || !('usageCount' in parsed)) return serialized
    const { usageCount: _usageCount, ...tokens } = parsed
    return JSON.stringify(tokens)
  } catch {
    return serialized
  }
}

function toThemeSummary(record: ThemeSummaryRecord): ThemeSummaryRecord {
  return {
    ...record,
    tokens_json: compactTokenSnapshot(record.tokens_json) || '{}',
    dark_tokens_json: compactTokenSnapshot(record.dark_tokens_json),
  }
}

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

function readPageScreenshots(serialized: unknown): PageScreenshotData[] {
  return JSON.parse((serialized as string) || '[]') as PageScreenshotData[]
}

function readDarkModeExportData(
  serialized: unknown,
  baseTokens: DesignToken,
  method: unknown,
  selector?: unknown,
): DarkModeExportData | undefined {
  if (typeof serialized !== 'string') return undefined
  try {
    return restoreDarkModeExportData(JSON.parse(serialized) as unknown, baseTokens, method, selector)
  } catch {
    return undefined
  }
}

function buildStoredAnalysisResult(
  record: Record<string, unknown>,
  tokens: DesignToken,
  designDoc = (record.design_doc as string) || '',
) {
  const pageScreenshots = readPageScreenshots(record.page_screenshots_json)
  return {
    analysisId: record.id,
    savedThemeId: (record.theme_id as string | null) || null,
    tokens,
    cssVariables: record.css_variables || '',
    tailwindTheme: record.tailwind_theme || '',
    designDoc,
    screenshots: pageScreenshots.map((screenshot) => screenshot.path),
    pageScreenshots,
    duration: Number(record.duration_ms) || 0,
    url: record.url,
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

  // --- Saved website themes ---
  ipcMain.handle('themes:list', () => {
    const records = getDb()
      .prepare(`SELECT ${THEME_SUMMARY_COLUMNS} FROM themes WHERE is_builtin = 0 ORDER BY updated_at DESC`)
      .all() as ThemeSummaryRecord[]
    return records.map(toThemeSummary)
  })

  ipcMain.handle('themes:archive', () => {
    return getDb().prepare('SELECT * FROM themes WHERE is_builtin = 0 ORDER BY updated_at DESC').all() as ThemeRecord[]
  })

  ipcMain.handle('themes:save', (_event, analysisId: string, overwriteThemeId?: string) => {
    const db = getDb()
    const saveSnapshot = db.transaction((id: string, confirmedThemeId?: string): ThemeSaveResponse => {
      const analysis = db.prepare('SELECT * FROM analyses WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!analysis) throw new Error('Analysis not found')

      const now = new Date().toISOString()
      const updateThemeSnapshot = (themeId: string): ThemeRecord => {
        db.prepare(
          `UPDATE themes
           SET source_url = ?, screenshot_path = ?, tokens_json = ?, css_variables = ?, tailwind_theme = ?,
               design_doc = ?, dark_tokens_json = ?, dark_mode_method = ?, dark_mode_selector = ?, design_evidence_json = ?, design_profile_json = ?,
               design_intelligence_meta_json = ?, updated_at = ?
           WHERE id = ?`,
        ).run(
          analysis.url,
          readFirstScreenshotPath(analysis.page_screenshots_json),
          analysis.tokens_json || '{}',
          analysis.css_variables || '',
          analysis.tailwind_theme || '',
          analysis.design_doc || '',
          analysis.dark_tokens_json || null,
          analysis.dark_mode_method || null,
          analysis.dark_mode_selector || null,
          analysis.design_evidence_json || null,
          analysis.design_profile_json || null,
          analysis.design_intelligence_meta_json || null,
          now,
          themeId,
        )
        return db.prepare('SELECT * FROM themes WHERE id = ?').get(themeId) as ThemeRecord
      }

      const existingThemeId = typeof analysis.theme_id === 'string' ? analysis.theme_id : null
      const existingTheme = existingThemeId
        ? (db.prepare('SELECT * FROM themes WHERE id = ?').get(existingThemeId) as ThemeRecord | undefined)
        : undefined
      if (existingTheme) {
        return { success: true, theme: updateThemeSnapshot(existingTheme.id), replaced: true }
      }

      let name = String(analysis.url)
      try {
        name = new URL(name).hostname
      } catch {
        name = name.slice(0, 80)
      }

      const matchingThemes = db
        .prepare(
          `SELECT * FROM themes
           WHERE is_builtin = 0 AND name = ? COLLATE NOCASE
           ORDER BY updated_at DESC, created_at DESC`,
        )
        .all(name) as ThemeRecord[]
      if (matchingThemes.length > 0) {
        const confirmedTheme = matchingThemes.find((theme) => theme.id === confirmedThemeId)
        if (!confirmedTheme) {
          const conflict = matchingThemes[0]
          return {
            success: false,
            conflict: {
              themeId: conflict.id,
              name: conflict.name,
              sourceUrl: conflict.source_url,
              duplicateCount: matchingThemes.length,
            },
          }
        }

        const theme = updateThemeSnapshot(confirmedTheme.id)
        db.prepare('UPDATE analyses SET theme_id = ? WHERE id = ?').run(confirmedTheme.id, id)
        for (const duplicate of matchingThemes) {
          if (duplicate.id === confirmedTheme.id) continue
          db.prepare('UPDATE analyses SET theme_id = ? WHERE theme_id = ?').run(confirmedTheme.id, duplicate.id)
          db.prepare('DELETE FROM themes WHERE id = ? AND is_builtin = 0').run(duplicate.id)
        }
        return { success: true, theme, replaced: true }
      }

      const themeId = randomUUID()
      db.prepare(
        `INSERT INTO themes (
           id, name, source_url, screenshot_path, tokens_json, css_variables, tailwind_theme, design_doc,
           dark_tokens_json, dark_mode_method, dark_mode_selector, design_evidence_json, design_profile_json,
           design_intelligence_meta_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        themeId,
        name,
        analysis.url,
        readFirstScreenshotPath(analysis.page_screenshots_json),
        analysis.tokens_json || '{}',
        analysis.css_variables || '',
        analysis.tailwind_theme || '',
        analysis.design_doc || '',
        analysis.dark_tokens_json || null,
        analysis.dark_mode_method || null,
        analysis.dark_mode_selector || null,
        analysis.design_evidence_json || null,
        analysis.design_profile_json || null,
        analysis.design_intelligence_meta_json || null,
        now,
        now,
      )
      db.prepare('UPDATE analyses SET theme_id = ? WHERE id = ?').run(themeId, id)
      return {
        success: true,
        theme: db.prepare('SELECT * FROM themes WHERE id = ?').get(themeId) as ThemeRecord,
        replaced: false,
      }
    })

    const result = saveSnapshot(analysisId, overwriteThemeId)
    if (result.success) {
      log.info(
        'theme',
        `${result.replaced ? 'replaced' : 'saved'} from analysis: analysisId=${analysisId} themeId=${result.theme.id}`,
      )
    } else {
      log.info(
        'theme',
        `save confirmation required: analysisId=${analysisId} themeId=${result.conflict.themeId} duplicates=${result.conflict.duplicateCount}`,
      )
    }
    return result
  })

  ipcMain.handle('themes:rename', (_event, id: string, requestedName: string) => {
    const name = requestedName.trim().slice(0, 80)
    if (!name) throw new Error('Theme name is required')
    const db = getDb()
    const duplicate = db
      .prepare('SELECT id FROM themes WHERE id != ? AND is_builtin = 0 AND name = ? COLLATE NOCASE')
      .get(id, name)
    if (duplicate) throw new Error('Theme name already exists')
    const result = db
      .prepare('UPDATE themes SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, new Date().toISOString(), id)
    if (result.changes === 0) throw new Error('Theme not found')
    return toThemeSummary(
      db.prepare(`SELECT ${THEME_SUMMARY_COLUMNS} FROM themes WHERE id = ?`).get(id) as ThemeSummaryRecord,
    )
  })

  ipcMain.handle('themes:delete', (_event, id: string) => {
    const result = getDb().prepare('DELETE FROM themes WHERE id = ? AND is_builtin = 0').run(id)
    return { success: result.changes > 0 }
  })

  ipcMain.handle('themes:export', async (_event, id: string, format: ThemeExportFormat) => {
    const db = getDb()
    const theme = db.prepare('SELECT * FROM themes WHERE id = ?').get(id) as ThemeRecord | undefined
    if (!theme) return { error: true, message: 'Theme not found' }

    const tokens = JSON.parse(theme.tokens_json) as DesignToken
    const darkMode = readDarkModeExportData(
      theme.dark_tokens_json,
      tokens,
      theme.dark_mode_method,
      theme.dark_mode_selector,
    )
    const artifacts: Record<ThemeExportFormat, { content: string; defaultName: string; extension: string }> = {
      markdown: { content: theme.design_doc, defaultName: 'DESIGN.md', extension: 'md' },
      css: { content: theme.css_variables, defaultName: 'theme-variables.css', extension: 'css' },
      tailwind: { content: theme.tailwind_theme, defaultName: 'tailwind-theme.css', extension: 'css' },
      json: {
        content: generateDtcgJson(tokens, darkMode),
        defaultName: 'design-tokens.json',
        extension: 'json',
      },
    }
    const artifact = artifacts[format]
    if (!artifact) return { error: true, message: `Unknown format: ${format}` }
    const result = await saveTextFile(artifact.content, {
      defaultName: artifact.defaultName,
      extension: artifact.extension,
      filterName: `${artifact.extension.toUpperCase()} Files`,
    })
    if (!result.success) return result

    db.prepare('INSERT INTO exports (id, theme_id, format, file_path, created_at) VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      id,
      format,
      result.filePath,
      new Date().toISOString(),
    )
    log.info('theme', `exported: themeId=${id} format=${format} path=${result.filePath}`)
    return result
  })

  // --- Analyses ---
  ipcMain.handle('analyses:list', () => {
    const db = getDb()
    return db
      .prepare(
        `SELECT a.*, t.name AS theme_name
         FROM analyses a
         LEFT JOIN themes t ON t.id = a.theme_id
         ORDER BY a.created_at DESC`,
      )
      .all()
  })

  ipcMain.handle('analyses:listSummaries', () => {
    const db = getDb()
    const records = db
      .prepare(
        `SELECT a.id, a.theme_id, t.name AS theme_name, a.url, a.pages_analyzed, a.viewports, a.duration_ms,
                a.token_usage, a.created_at, a.page_screenshots_json,
                a.design_intelligence_status, a.design_intelligence_meta_json
         FROM analyses a
         LEFT JOIN themes t ON t.id = a.theme_id
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
      savedThemeId: (record.theme_id as string | null) || null,
      url: record.url,
      finalUrl: record.final_url,
      pagesAnalyzed: record.pages_analyzed,
      durationMs: record.duration_ms,
      createdAt: record.created_at,
      tokens,
      cssVariables: record.css_variables || '',
      tailwindTheme: record.tailwind_theme || '',
      designDoc: record.design_doc || '',
      pageScreenshots: readPageScreenshots(record.page_screenshots_json),
      featureTags: JSON.parse((record.feature_tags_json as string) || '[]'),
      darkTokens:
        readDarkModeExportData(record.dark_tokens_json, tokens, record.dark_mode_method, record.dark_mode_selector)
          ?.darkTokens?.colors ?? null,
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
        pageDiscovery?: PageDiscoveryMode
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

        const darkModeExport = buildDarkModeExportData(result.darkMode)

        const cssVars = generateCssVariables(result.tokens, darkModeExport, result.breakpoints)
        const tailwind = generateTailwindTheme(result.tokens, darkModeExport, result.breakpoints)
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
            feature_tags_json, dark_tokens_json, dark_mode_method, dark_mode_selector, has_dark_mode, access_mode, auth_wall_detected, final_url,
            design_evidence_json, evidence_coverage_json, design_intelligence_status,
            design_intelligence_meta_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          darkModeExport?.darkTokens ? JSON.stringify(darkModeExport.darkTokens) : null,
          result.darkMode?.hasDarkMode ? result.darkMode.method : null,
          result.darkMode?.hasDarkMode ? result.darkMode.selector || null : null,
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
          `done: url=${url} id=${analysisId} pages=${pagesAnalyzed} durationMs=${result.duration} darkMode=${result.darkMode?.hasDarkMode ? 'yes' : 'no'} degraded=${result.extractionIssues.length}`,
        )

        return {
          analysisId,
          savedThemeId: null,
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
          darkModeSelector: result.darkMode?.selector,
          featureTags: result.featureTags,
          darkTokens: darkModeExport?.darkTokens?.colors ?? null,
          breakpoints: result.breakpoints,
          accessMode: result.accessMode,
          authWallDetected: result.authWallDetected,
          finalUrl: result.finalUrl,
          extractionIssues: result.extractionIssues,
          pageCoverage: result.pageCoverage,
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
      outputLanguage,
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
        ...buildStoredAnalysisResult(record, tokens),
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
      const darkModeExport = readDarkModeExportData(
        record.dark_tokens_json,
        tokens,
        record.dark_mode_method,
        record.dark_mode_selector,
      )
      designDoc = generateDesignDoc(
        tokens,
        record.url as string,
        designEvidence.featureTags,
        darkModeExport,
        designEvidence.breakpoints,
        undefined,
        outputLanguage,
        [],
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
    const currentThemeLink = db.prepare('SELECT theme_id FROM analyses WHERE id = ?').get(analysisId) as
      { theme_id: string | null } | undefined
    if (typeof currentThemeLink?.theme_id === 'string') {
      db.prepare(
        `UPDATE themes
         SET design_doc = ?, design_evidence_json = ?, design_profile_json = ?,
             design_intelligence_meta_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        designDoc,
        record.design_evidence_json,
        designProfile ? JSON.stringify(designProfile) : null,
        JSON.stringify(intelligence.meta),
        new Date().toISOString(),
        currentThemeLink.theme_id,
      )
    }
    win?.webContents.send('design-intelligence:progress', {
      step:
        intelligence.meta.status === 'failed' ? 'progress.designLanguageFallback' : 'progress.designLanguageComplete',
      percent: 100,
    })

    return {
      ...buildStoredAnalysisResult({ ...record, theme_id: currentThemeLink?.theme_id || null }, tokens, designDoc),
      featureTags: designEvidence.featureTags,
      darkTokens:
        readDarkModeExportData(record.dark_tokens_json, tokens, record.dark_mode_method, record.dark_mode_selector)
          ?.darkTokens?.colors ?? null,
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

  ipcMain.handle('design-examples:start', async (_event, analysisId: string, language?: string) => {
    const db = getDb()
    const record = db.prepare('SELECT * FROM analyses WHERE id = ?').get(analysisId) as
      Record<string, unknown> | undefined
    if (!record) return { error: true, message: 'Analysis not found' }
    if (!record.design_evidence_json || !record.design_profile_json) {
      return { error: true, message: 'A validated design interpretation is required' }
    }

    const designEvidence = JSON.parse(record.design_evidence_json as string) as DesignEvidence
    const designProfile = JSON.parse(record.design_profile_json as string) as DesignProfile
    const tokens = JSON.parse((record.tokens_json as string) || '{}') as DesignToken
    const outputLanguage = language?.startsWith('zh') ? ('zh-CN' as const) : ('en' as const)
    const existingMeta = record.design_intelligence_meta_json
      ? (JSON.parse(record.design_intelligence_meta_json as string) as DesignIntelligenceMeta)
      : ({ status: 'complete', capabilityLevel: 'structural-ai' } as DesignIntelligenceMeta)
    const pendingMeta: DesignIntelligenceMeta = {
      ...existingMeta,
      exampleGeneration: { status: 'pending' },
    }
    db.prepare('UPDATE analyses SET design_intelligence_meta_json = ? WHERE id = ?').run(
      JSON.stringify(pendingMeta),
      analysisId,
    )

    exampleGenerationControllers.get(analysisId)?.abort()
    const controller = new AbortController()
    exampleGenerationControllers.set(analysisId, controller)
    const generation = await runExampleGeneration(
      designEvidence,
      tokens,
      designProfile,
      getSettings(),
      outputLanguage,
      controller.signal,
    )
    if (exampleGenerationControllers.get(analysisId) === controller) {
      exampleGenerationControllers.delete(analysisId)
    }

    const updatedMeta: DesignIntelligenceMeta = {
      ...existingMeta,
      exampleGeneration: {
        status: generation.status,
        failureCode: generation.failureCode,
      },
    }
    const reconstructionBrief = generateReconstructionBrief(designProfile, designEvidence, tokens)
    const darkModeExport = readDarkModeExportData(
      record.dark_tokens_json,
      tokens,
      record.dark_mode_method,
      record.dark_mode_selector,
    )
    // Always rebuild the document. A failed retry must remove examples from a prior
    // successful run so stale generated HTML is never left in Markdown exports.
    const designDoc = generateDesignDoc(
      tokens,
      record.url as string,
      designEvidence.featureTags,
      darkModeExport,
      designEvidence.breakpoints,
      undefined,
      outputLanguage,
      generation.status === 'complete' ? generation.examples : [],
      designEvidence,
      designProfile,
      reconstructionBrief,
    )

    db.prepare(
      `UPDATE analyses
       SET design_doc = ?, design_intelligence_meta_json = ?
       WHERE id = ?`,
    ).run(designDoc, JSON.stringify(updatedMeta), analysisId)
    const currentThemeLink = db.prepare('SELECT theme_id FROM analyses WHERE id = ?').get(analysisId) as
      { theme_id: string | null } | undefined
    if (typeof currentThemeLink?.theme_id === 'string') {
      db.prepare(
        `UPDATE themes
         SET design_doc = ?, design_intelligence_meta_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(designDoc, JSON.stringify(updatedMeta), new Date().toISOString(), currentThemeLink.theme_id)
    }

    return {
      ...buildStoredAnalysisResult({ ...record, theme_id: currentThemeLink?.theme_id || null }, tokens, designDoc),
      designEvidence,
      designProfile,
      designIntelligence: updatedMeta,
      reconstructionBrief,
      agentContext: createTaskContext('Create a new page or component', designEvidence, designProfile, updatedMeta),
      validationReport: record.validation_report_json ? JSON.parse(record.validation_report_json as string) : null,
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
        ...buildStoredAnalysisResult(record, tokens),
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
