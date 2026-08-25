import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { finished } from 'node:stream/promises'

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'

import {
  listManagedSessions,
  migrateLegacyManagedSessions,
  removeAllManagedSessions,
  removeManagedSession,
} from '../core/analyzer/browser-session.js'
import {
  AuthenticationCancelledError,
  AuthenticationRequiredError,
  CORE_ANALYSIS_REQUEST_DEFAULTS,
  type LoginDecision,
  createAnalysisRequest,
} from '../core/analyzer/index.js'
import { compareReferenceCaptures, routeIdentityFromUrl } from '../core/analyzer/reference-compare.js'
import type { DesignToken } from '../core/analyzer/types.js'
import {
  sanitizeAuthWallDetectionForDisplay,
  sanitizeDesignEvidenceForPersistence,
  sanitizeDesignTokensForPersistence,
  sanitizeDiagnosticTextForDisplay,
  sanitizeExtractionIssuesForDisplay,
  sanitizePageCoverageForPersistence,
  sanitizePageScreenshotsForPersistence,
  sanitizeUrlForPersistence,
} from '../core/analyzer/url-privacy.js'
import { generateAgentContextBundle } from '../core/design-context/agent-context.js'
import { createDeterministicDesignContext } from '../core/design-context/deterministic-context.js'
import { generateReconstructionBrief } from '../core/design-context/reconstruction-brief.js'
import { isCurrentDesignProfile } from '../core/design-context/types.js'
import type { DesignProfile } from '../core/design-context/types.js'
import { createValidationRecipe, validateRecipe } from '../core/design-context/validation-recipe.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import {
  buildDarkModeExportData,
  generateCssVariables,
  generateDesignDoc,
  generateDesignEvidenceJson,
  generateTailwindTheme,
} from '../core/export/index.js'
import {
  type AnalysisRecoveryResponse,
  type AnalyzeOptions,
  type AnalyzeResponse,
  type AppSettings,
  type ThemeRecord,
  type ThemeSaveResponse,
  type ThemeSummaryRecord,
} from '../shared/ipc-contract.js'
import { isRecord } from '../shared/type-guards.js'
import {
  clearGeneratedAssetDirectories,
  collectAnalysisAssets,
  collectStoredAnalysisAssets,
  removeGeneratedAssets,
} from './analysis-assets.js'
import { AnalysisRecoveryRegistry } from './analysis-recovery.js'
import { analyzeUrl } from './analyzer/index.js'
import { createComparisonVisualPairs } from './comparison-visuals.js'
import { getDb } from './database.js'
import { addHistoryThumbnailPaths, toAnalysisSummaryWithThumbnail } from './history-thumbnails.js'
import { getLogDir, log } from './logger.js'
import { submitLoginDecision, waitForLoginDecision } from './login-decision.js'
import {
  analysisSiteName,
  readAnalysisCompletion,
  readAnalysisTiming,
  readCaptureManifest,
  readDarkModeExportData,
  readDesignEvidence,
  readFirstScreenshotPath,
  readPageScreenshots,
  referenceCaptureFromRecord,
  toAnalysisSummary,
  toThemeSummary,
} from './persisted-records.js'
import { formatRendererPerformanceSample } from './renderer-performance-sample.js'
import { getSettings, saveSettings } from './settings.js'

interface SaveTextFileOptions {
  defaultName: string
  extension: string
  filterName: string
}

const analysisControllers = new Map<number, AbortController>()
const analysisFinishControllers = new Map<number, AbortController>()
const analysisRecoveryRegistry = new AnalysisRecoveryRegistry()
const THEME_SUMMARY_COLUMNS = `id, name, source_url, screenshot_path, tokens_json, dark_tokens_json,
  dark_mode_method, dark_mode_selector, tags, is_favorite, created_at, updated_at`

function restoreDeterministicStoredContext(
  record: Record<string, unknown>,
  tokens: DesignToken,
  evidence: DesignEvidence | null,
): {
  profile: DesignProfile | null
  validationReport: ReturnType<typeof createDeterministicDesignContext>['validationReport'] | null
  designDoc: string
} {
  const storedProfile = record.design_profile_json
    ? (JSON.parse(record.design_profile_json as string) as DesignProfile)
    : null
  const storedValidationReport = record.validation_report_json
    ? (JSON.parse(record.validation_report_json as string) as ReturnType<
        typeof createDeterministicDesignContext
      >['validationReport'])
    : null
  const currentProfile = isCurrentDesignProfile(storedProfile) ? storedProfile : null
  const currentValidationReport = isRecord(storedValidationReport)
    ? (storedValidationReport as ReturnType<typeof createDeterministicDesignContext>['validationReport'])
    : null

  if (!evidence) {
    return {
      profile: currentProfile,
      validationReport: currentProfile ? currentValidationReport : null,
      designDoc: (record.design_doc as string) || '',
    }
  }
  const language =
    currentProfile?.language || (evidence.source.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en')
  const context =
    currentProfile && currentValidationReport
      ? { profile: currentProfile, validationReport: currentValidationReport }
      : createDeterministicDesignContext(evidence, language)
  const darkMode = readDarkModeExportData(
    record.dark_tokens_json,
    tokens,
    record.dark_mode_method,
    record.dark_mode_selector,
  )
  const featureTags = JSON.parse((record.feature_tags_json as string) || '[]') as string[]
  const designDoc = generateDesignDoc(
    tokens,
    String(record.url || evidence.source.requestedUrl),
    featureTags,
    darkMode,
    undefined,
    [],
    language,
    evidence,
    context.profile,
  )

  if (!currentProfile || !currentValidationReport || designDoc !== record.design_doc) {
    getDb()
      .prepare(
        `UPDATE analyses
         SET design_profile_json = ?, validation_report_json = ?, design_doc = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(context.profile), JSON.stringify(context.validationReport), designDoc, record.id)
  }

  return {
    profile: context.profile,
    validationReport: context.validationReport,
    designDoc,
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
    analysisTiming: readAnalysisTiming(record.analysis_timing_json),
    url: record.url,
    completion: readAnalysisCompletion(record.completion_json),
  }
}

type AnalysisComparisonLookup =
  | {
      success: true
      target: Record<string, unknown>
      reference: Record<string, unknown>
      comparison: ReturnType<typeof compareReferenceCaptures>
    }
  | {
      success: false
      reason: 'analysis-not-found' | 'same-analysis' | 'analysis-order-invalid' | 'invalid-analysis-data'
    }

function resolveAnalysisComparison(earlierAnalysisId: string, laterAnalysisId: string): AnalysisComparisonLookup {
  const db = getDb()
  const reference = db.prepare('SELECT * FROM analyses WHERE id = ?').get(earlierAnalysisId) as
    Record<string, unknown> | undefined
  const target = db.prepare('SELECT * FROM analyses WHERE id = ?').get(laterAnalysisId) as
    Record<string, unknown> | undefined
  if (!reference || !target) return { success: false, reason: 'analysis-not-found' }
  if (earlierAnalysisId === laterAnalysisId) return { success: false, reason: 'same-analysis' }
  const referenceTime = Date.parse(String(reference.created_at || ''))
  const targetTime = Date.parse(String(target.created_at || ''))
  if (Number.isNaN(referenceTime) || Number.isNaN(targetTime) || referenceTime >= targetTime) {
    return { success: false, reason: 'analysis-order-invalid' }
  }

  const referenceCapture = referenceCaptureFromRecord(reference)
  const targetCapture = referenceCaptureFromRecord(target)
  if (!referenceCapture || !targetCapture) return { success: false, reason: 'invalid-analysis-data' }
  return {
    success: true,
    target,
    reference,
    comparison: compareReferenceCaptures(referenceCapture, targetCapture),
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

async function writeStreamChunk(stream: fs.WriteStream, chunk: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolve()))
  })
}

async function writeLocalDataArchive(filePath: string): Promise<void> {
  const database = getDb()
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' })
  const streamCompletion = finished(stream).then(
    () => null,
    (error: unknown) => error,
  )
  const readTheme = database.prepare('SELECT * FROM themes WHERE id = ?')
  const readAnalysis = database.prepare('SELECT * FROM analyses WHERE id = ?')
  const writeRows = async (
    ids: Array<{ id: string }>,
    read: (id: string) => Record<string, unknown> | undefined,
  ): Promise<void> => {
    let first = true
    for (const { id } of ids) {
      const row = read(id)
      if (!row) continue
      await writeStreamChunk(stream, `${first ? '' : ','}${JSON.stringify(row)}`)
      first = false
    }
  }

  try {
    await writeStreamChunk(stream, '{"themes":[')
    await writeRows(
      database.prepare('SELECT id FROM themes WHERE is_builtin = 0 ORDER BY updated_at DESC').all() as Array<{
        id: string
      }>,
      (id) => readTheme.get(id) as Record<string, unknown> | undefined,
    )
    await writeStreamChunk(stream, '],"analyses":[')
    await writeRows(
      database.prepare('SELECT id FROM analyses ORDER BY created_at DESC').all() as Array<{ id: string }>,
      (id) => readAnalysis.get(id) as Record<string, unknown> | undefined,
    )
    await writeStreamChunk(stream, `],"settings":${JSON.stringify(getSettings())}}`)
    stream.end()
    const streamError = await streamCompletion
    if (streamError) throw streamError
  } catch (error) {
    stream.destroy()
    await streamCompletion
    await fs.promises.rm(filePath, { force: true }).catch(() => {})
    throw error
  }
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
                updated_at = ?
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
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  ipcMain.handle('themes:delete', async (_event, id: string) => {
    const db = getDb()
    const theme = db.prepare('SELECT * FROM themes WHERE id = ? AND is_builtin = 0').get(id) as
      Record<string, unknown> | undefined
    const linkedAnalyses = theme
      ? (db.prepare('SELECT COUNT(*) AS count FROM analyses WHERE theme_id = ?').get(id) as { count: number }).count
      : 0
    const result = db.prepare('DELETE FROM themes WHERE id = ? AND is_builtin = 0').run(id)
    if (result.changes > 0 && theme && linkedAnalyses === 0) {
      await removeGeneratedAssets(app.getPath('userData'), collectStoredAnalysisAssets(theme))
    }
    return { success: result.changes > 0 }
  })

  ipcMain.handle('themes:export', async (_event, id: string) => {
    const db = getDb()
    const theme = db.prepare('SELECT * FROM themes WHERE id = ?').get(id) as ThemeRecord | undefined
    if (!theme) return { error: true, message: 'Theme not found' }

    let designDoc = theme.design_doc
    try {
      const tokens = JSON.parse(theme.tokens_json) as DesignToken
      const evidence = theme.design_evidence_json ? (JSON.parse(theme.design_evidence_json) as DesignEvidence) : null
      const storedProfile = theme.design_profile_json ? (JSON.parse(theme.design_profile_json) as DesignProfile) : null
      if (evidence) {
        const profile = isCurrentDesignProfile(storedProfile)
          ? storedProfile
          : createDeterministicDesignContext(
              evidence,
              evidence.source.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en',
            ).profile
        const darkMode = readDarkModeExportData(
          theme.dark_tokens_json,
          tokens,
          theme.dark_mode_method,
          theme.dark_mode_selector,
        )
        designDoc = generateDesignDoc(
          tokens,
          theme.source_url || evidence.source.requestedUrl,
          evidence.featureTags,
          darkMode,
          undefined,
          [],
          profile.language,
          evidence,
          profile,
        )
      }
    } catch {
      // Legacy snapshots without complete structured data retain their original document.
    }

    const result = await saveTextFile(designDoc, {
      defaultName: 'DESIGN.md',
      extension: 'md',
      filterName: 'MD Files',
    })
    if (!result.success) return result

    db.prepare('INSERT INTO exports (id, theme_id, format, file_path, created_at) VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      id,
      'markdown',
      result.filePath,
      new Date().toISOString(),
    )
    log.info('theme', `exported: themeId=${id} format=markdown path=${result.filePath}`)
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
        `SELECT a.id, a.theme_id, t.name AS theme_name, a.site_name, a.url, a.pages_analyzed, a.viewports,
                 a.duration_ms, a.created_at, a.preview_path, a.route_identity
         FROM analyses a
         LEFT JOIN themes t ON t.id = a.theme_id
         ORDER BY a.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>

    return records.map((record) => toAnalysisSummary(record, (record.preview_path as string | null) || null))
  })

  ipcMain.handle(
    'analyses:listSummariesPage',
    async (_event, query?: { page?: number; pageSize?: number; search?: string }) => {
      const db = getDb()
      const requestedPage = Number.isFinite(query?.page) ? Math.max(1, Math.floor(query?.page || 1)) : 1
      const pageSize = Number.isFinite(query?.pageSize)
        ? Math.min(100, Math.max(1, Math.floor(query?.pageSize || 10)))
        : 10
      const search = typeof query?.search === 'string' ? query.search.trim().slice(0, 500) : ''
      const where = search
        ? `WHERE a.url LIKE @search OR COALESCE(t.name, '') LIKE @search
             OR COALESCE(a.site_name, '') LIKE @search`
        : ''
      const searchParams = search ? { search: `%${search}%` } : {}
      const matchingIds = (
        db
          .prepare(
            `SELECT a.id
             FROM analyses a
             LEFT JOIN themes t ON t.id = a.theme_id
             ${where}
             ORDER BY a.created_at DESC`,
          )
          .all(searchParams) as Array<{ id: string }>
      ).map((record) => record.id)
      const total = matchingIds.length
      const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)))
      const records = db
        .prepare(
          `SELECT a.id, a.theme_id, t.name AS theme_name, a.site_name, a.url, a.pages_analyzed, a.viewports,
                   a.duration_ms, a.created_at, a.preview_path, a.route_identity
           FROM analyses a
           LEFT JOIN themes t ON t.id = a.theme_id
           ${where}
           ORDER BY a.created_at DESC
           LIMIT @limit OFFSET @offset`,
        )
        .all({ ...searchParams, limit: pageSize, offset: (page - 1) * pageSize }) as Array<Record<string, unknown>>

      const summaries: Awaited<ReturnType<typeof toAnalysisSummaryWithThumbnail>>[] = []
      for (const record of records) summaries.push(await toAnalysisSummaryWithThumbnail(record))

      return {
        records: summaries,
        matchingIds,
        page,
        pageSize,
        total,
      }
    },
  )

  ipcMain.handle('analyses:delete', async (_event, id: string) => {
    const db = getDb()
    const record = db.prepare('SELECT * FROM analyses WHERE id = ?').get(id) as Record<string, unknown> | undefined
    db.prepare('DELETE FROM analyses WHERE id = ?').run(id)
    if (record && !record.theme_id) {
      await removeGeneratedAssets(app.getPath('userData'), collectStoredAnalysisAssets(record))
    }
    return { success: true }
  })

  ipcMain.handle('analyses:deleteMany', async (_event, ids: string[]) => {
    const db = getDb()
    const lookup = db.prepare('SELECT * FROM analyses WHERE id = ?')
    const stmt = db.prepare('DELETE FROM analyses WHERE id = ?')
    const assets: string[] = []
    db.transaction((list: string[]) => {
      for (const id of list) {
        const record = lookup.get(id) as Record<string, unknown> | undefined
        if (record && !record.theme_id) assets.push(...collectStoredAnalysisAssets(record))
        stmt.run(id)
      }
    })(ids)
    await removeGeneratedAssets(app.getPath('userData'), assets)
    return { success: true }
  })

  ipcMain.handle('analyses:get', async (_event, id: string) => {
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
    const designEvidence = readDesignEvidence(record.design_evidence_json)
    const storedContext = restoreDeterministicStoredContext(record, tokens, designEvidence)
    const designProfile = storedContext.profile
    const reconstructionBrief = designEvidence
      ? generateReconstructionBrief(designProfile, designEvidence, designEvidence.tokens)
      : null
    const agentContext =
      designEvidence && designProfile
        ? generateAgentContextBundle('Create a new page or component', designEvidence, designProfile)
        : designEvidence
          ? generateAgentContextBundle('Use the observed design evidence', designEvidence)
          : null
    const pageScreenshots = await addHistoryThumbnailPaths(
      readPageScreenshots(record.page_screenshots_json),
      designEvidence,
    )
    const darkMode = readDarkModeExportData(
      record.dark_tokens_json,
      tokens,
      record.dark_mode_method,
      record.dark_mode_selector,
    )

    return {
      id: record.id,
      savedThemeId: (record.theme_id as string | null) || null,
      url: record.url,
      finalUrl: record.final_url,
      pagesAnalyzed: record.pages_analyzed,
      durationMs: record.duration_ms,
      analysisTiming: readAnalysisTiming(record.analysis_timing_json),
      createdAt: record.created_at,
      routeIdentity: record.route_identity || null,
      tokens,
      cssVariables: record.css_variables || '',
      tailwindTheme: record.tailwind_theme || '',
      designDoc: storedContext.designDoc,
      pageScreenshots,
      featureTags: JSON.parse((record.feature_tags_json as string) || '[]'),
      darkTokens: darkMode?.darkTokens?.colors ?? null,
      hasDarkMode: record.has_dark_mode === 1,
      accessMode: record.access_mode,
      authWallDetected: record.auth_wall_detected === 1,
      designEvidence,
      designProfile,
      reconstructionBrief,
      agentContext,
      validationReport: storedContext.validationReport,
      captureManifest: readCaptureManifest(record.capture_manifest_json),
      completion: readAnalysisCompletion(record.completion_json),
    }
  })

  ipcMain.handle('analyses:compare', (_event, earlierAnalysisId: string, laterAnalysisId: string) => {
    const lookup = resolveAnalysisComparison(earlierAnalysisId, laterAnalysisId)
    if (!lookup.success) return lookup
    return {
      success: true,
      comparison: lookup.comparison,
      visualPairs: createComparisonVisualPairs(
        readPageScreenshots(lookup.reference.page_screenshots_json),
        readPageScreenshots(lookup.target.page_screenshots_json),
        {
          referenceEvidence: readDesignEvidence(lookup.reference.design_evidence_json),
          targetEvidence: readDesignEvidence(lookup.target.design_evidence_json),
          ...(lookup.comparison.status === 'inconclusive'
            ? {}
            : { allowedPageKeys: lookup.comparison.comparability.comparedPageKeys }),
        },
      ),
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

        const persistedTokens = sanitizeDesignTokensForPersistence(result.tokens)
        const persistedEvidence = sanitizeDesignEvidenceForPersistence(result.designEvidence)
        const persistedScreenshots = sanitizePageScreenshotsForPersistence(result.pageScreenshots)
        const displayedScreenshots = await addHistoryThumbnailPaths(persistedScreenshots, persistedEvidence)
        unpersistedAssets.push(
          ...displayedScreenshots.flatMap((screenshot) => (screenshot.thumbnailPath ? [screenshot.thumbnailPath] : [])),
        )
        const persistedPageCoverage = sanitizePageCoverageForPersistence(result.pageCoverage)
        const persistedFinalUrl = sanitizeUrlForPersistence(result.finalUrl)
        const displayedIssues = sanitizeExtractionIssuesForDisplay(result.extractionIssues)
        const outputLanguage = options?.language?.startsWith('zh') ? ('zh-CN' as const) : ('en' as const)
        const deterministicContext = createDeterministicDesignContext(persistedEvidence, outputLanguage)
        const rawDarkModeExport = buildDarkModeExportData(result.darkMode)
        const darkModeExport = rawDarkModeExport?.darkTokens
          ? {
              ...rawDarkModeExport,
              darkTokens: sanitizeDesignTokensForPersistence(rawDarkModeExport.darkTokens),
            }
          : rawDarkModeExport
        const cssVars = generateCssVariables(persistedTokens, darkModeExport, result.breakpoints)
        const tailwind = generateTailwindTheme(persistedTokens, darkModeExport, result.breakpoints)
        const designDoc = generateDesignDoc(
          persistedTokens,
          displayUrl,
          result.featureTags,
          darkModeExport,
          result.breakpoints,
          result.components,
          outputLanguage,
          persistedEvidence,
          deterministicContext.profile,
        )

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
          generateDesignEvidenceJson(persistedEvidence),
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
          tokens: persistedTokens as unknown as Record<string, unknown>,
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
      const tokens = JSON.parse((record.tokens_json as string) || '{}') as DesignToken
      const evidenceTokens = evidence.tokens
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

  ipcMain.handle('settings:save', (_event, settings: Partial<AppSettings>) => {
    // Never log values from user-specific configuration.
    log.info('settings', `saved: ${Object.keys(settings).join(', ')}`)
    return saveSettings(settings)
  })

  ipcMain.handle('data:exportAll', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: `imprint-local-data-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    await writeLocalDataArchive(result.filePath)
    log.info('data', `local archive written: ${result.filePath}`)
    return { success: true, filePath: result.filePath }
  })

  ipcMain.handle('data:clearAll', async () => {
    const database = getDb()
    database.transaction(() => {
      database.prepare('DELETE FROM analyses').run()
      database.prepare('DELETE FROM themes WHERE is_builtin = 0').run()
    })()
    database.pragma('wal_checkpoint(TRUNCATE)')
    database.exec('VACUUM')
    await clearGeneratedAssetDirectories(app.getPath('userData'))
    log.info('data', 'cleared local analyses, saved website themes, and generated screenshot assets')
    return { success: true }
  })

  ipcMain.on('log:event', (_event, level: string, message: string) => {
    const safeLevel = level === 'warn' || level === 'error' ? level : 'info'
    const safeMessage = typeof message === 'string' ? message.slice(0, 2000) : String(message)
    log[safeLevel]('renderer', safeMessage)
  })

  ipcMain.on('performance:renderer-sample', (_event, sample: unknown) => {
    const formattedSample = formatRendererPerformanceSample(sample)
    if (formattedSample) log.info('performance', formattedSample)
  })

  ipcMain.handle('app:openLogsFolder', async () => {
    const logDir = getLogDir()
    await shell.openPath(logDir)
    return { success: true, path: logDir }
  })
}
