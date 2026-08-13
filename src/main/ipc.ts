import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { BrowserWindow, app, dialog, ipcMain, nativeImage, net, shell } from 'electron'

import { getDefaultBaseUrl } from '../core/ai/capabilities.js'
import { availableEvidenceImageIds } from '../core/ai/image-summary.js'
import { getDefaultReasoningEffort } from '../core/ai/model-catalog.js'
import { mergeAnalysisTimings } from '../core/analyzer/analysis-timing.js'
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
import { applyColorRenames } from '../core/analyzer/token-renamer.js'
import type { DesignToken } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import {
  DESIGN_PROFILE_PROMPT_VERSION,
  buildAnalysisDigest,
  createEvidenceFingerprint,
  createInterpretationCacheKey,
  createValidationRecipe,
  generateAgentContextBundle,
  generateReconstructionBrief,
  prepareAnalysisDigestPackageForPrompt,
  restrictEvidencePackageImages,
  selectEvidencePackage,
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
  type RendererPerformanceSample,
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
const analysisProgramCompletedTimes = new Map<string, number>()
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

function createIntelligenceCacheKey(
  fingerprint: string,
  route: { provider: string; model: string },
  settings: ReturnType<typeof getSettings>,
  language: 'en' | 'zh-CN',
  accessMode: DesignEvidence['source']['accessMode'],
): string {
  return createInterpretationCacheKey({
    fingerprint,
    provider: route.provider,
    model: route.model,
    reasoningEffort: settings.reasoningEffort || getDefaultReasoningEffort(route.provider, route.model) || 'default',
    thinkingEnabled: settings.thinkingEnabled === true,
    language,
    promptVersion: DESIGN_PROFILE_PROMPT_VERSION,
    schemaVersion: '1',
    accessMode,
  })
}

function readPerformanceNumber(value: unknown, minimum: number, maximum: number, digits = 1): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(Math.min(maximum, Math.max(minimum, value)) * factor) / factor
}

function readPerformanceLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value.replace(/[\r\n\t]/g, ' ').slice(0, 120) || fallback
}

function formatRendererPerformanceSample(value: unknown): string | null {
  if (!isRecord(value)) return null

  const windowMs = readPerformanceNumber(value.windowMs, 1, 60_000, 0)
  const frames = readPerformanceNumber(value.frames, 1, 10_000, 0)
  const fps = readPerformanceNumber(value.fps, 0, 500)
  const p95FrameMs = readPerformanceNumber(value.p95FrameMs, 0, 60_000)
  const maxFrameMs = readPerformanceNumber(value.maxFrameMs, 0, 60_000)
  const framesOver50Ms = readPerformanceNumber(value.framesOver50Ms, 0, 10_000, 0)
  const longTasks = readPerformanceNumber(value.longTasks, 0, 10_000, 0)
  const longTaskMs = readPerformanceNumber(value.longTaskMs, 0, 60_000)
  const devicePixelRatio = readPerformanceNumber(value.devicePixelRatio, 0.1, 10, 2)
  const hardwareConcurrency = readPerformanceNumber(value.hardwareConcurrency, 0, 512, 0)

  if (
    windowMs === null ||
    frames === null ||
    fps === null ||
    p95FrameMs === null ||
    maxFrameMs === null ||
    framesOver50Ms === null ||
    longTasks === null ||
    longTaskMs === null ||
    devicePixelRatio === null ||
    hardwareConcurrency === null
  ) {
    return null
  }

  const sample = value as unknown as RendererPerformanceSample
  return [
    'renderer',
    `windowMs=${windowMs}`,
    `frames=${frames}`,
    `fps=${fps}`,
    `p95FrameMs=${p95FrameMs}`,
    `maxFrameMs=${maxFrameMs}`,
    `framesOver50Ms=${framesOver50Ms}`,
    `longTasks=${longTasks}`,
    `longTaskMs=${longTaskMs}`,
    `focused=${sample.focused === true}`,
    `theme=${readPerformanceLabel(sample.theme, 'unknown')}`,
    `route=${readPerformanceLabel(sample.route, 'unknown')}`,
    `dpr=${devicePixelRatio}`,
    `cores=${hardwareConcurrency}`,
  ].join(' ')
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

const HISTORY_THUMBNAIL_SIZE = { width: 192, height: 128 }
const historyThumbnailJobs = new Map<string, Promise<string>>()

function isValidHistoryThumbnail(filePath: string): boolean {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return false
  const image = nativeImage.createFromBuffer(fs.readFileSync(filePath))
  if (image.isEmpty()) return false
  const size = image.getSize()
  return size.width <= HISTORY_THUMBNAIL_SIZE.width && size.height <= HISTORY_THUMBNAIL_SIZE.height
}

function findHistoryThumbnailSource(evidence: DesignEvidence | null, screenshot: PageScreenshotData): string {
  if (!evidence) return screenshot.path
  const page =
    evidence.pages.find(
      (candidate) => candidate.url === screenshot.url && candidate.viewport === screenshot.viewport,
    ) ||
    evidence.pages.find((candidate) => candidate.url === screenshot.url) ||
    evidence.pages[0]
  const viewportCrop = page?.images.find((image) => image.kind === 'viewport-crop')
  return viewportCrop?.path || screenshot.path
}

function readDesignEvidence(serialized: unknown): DesignEvidence | null {
  if (typeof serialized !== 'string') return null
  try {
    return JSON.parse(serialized) as DesignEvidence
  } catch {
    return null
  }
}

async function createHistoryThumbnail(sourcePath: string): Promise<string> {
  if (!fs.existsSync(sourcePath)) return sourcePath

  const stats = fs.statSync(sourcePath)
  const cacheKey = createHash('sha256').update(`${sourcePath}:${stats.size}:${stats.mtimeMs}`).digest('hex')
  const thumbnailDir = path.join(app.getPath('userData'), 'history-thumbnails')
  const thumbnailPath = path.join(thumbnailDir, `${cacheKey}.jpg`)
  if (isValidHistoryThumbnail(thumbnailPath)) return thumbnailPath

  const existingJob = historyThumbnailJobs.get(cacheKey)
  if (existingJob) return existingJob

  const job = (async () => {
    try {
      fs.mkdirSync(thumbnailDir, { recursive: true })
      const image = nativeImage.createFromBuffer(fs.readFileSync(sourcePath))
      if (image.isEmpty()) return sourcePath
      const size = image.getSize()
      const scale = Math.min(1, HISTORY_THUMBNAIL_SIZE.width / size.width, HISTORY_THUMBNAIL_SIZE.height / size.height)
      const thumbnail =
        scale < 1
          ? image.resize({
              width: Math.max(1, Math.round(size.width * scale)),
              height: Math.max(1, Math.round(size.height * scale)),
              quality: 'better',
            })
          : image
      fs.writeFileSync(thumbnailPath, thumbnail.toJPEG(78))
      return thumbnailPath
    } catch {
      return sourcePath
    } finally {
      historyThumbnailJobs.delete(cacheKey)
    }
  })()
  historyThumbnailJobs.set(cacheKey, job)
  return job
}

async function addHistoryThumbnailPaths(
  pageScreenshots: PageScreenshotData[],
  evidence: DesignEvidence | null,
): Promise<PageScreenshotData[]> {
  const enriched: PageScreenshotData[] = []
  for (const screenshot of pageScreenshots) {
    enriched.push({
      ...screenshot,
      thumbnailPath: await createHistoryThumbnail(findHistoryThumbnailSource(evidence, screenshot)),
    })
  }
  return enriched
}

function toAnalysisSummary(
  {
    page_screenshots_json: screenshots,
    design_evidence_json: _designEvidenceJson,
    design_intelligence_meta_json: metaJson,
    ...record
  }: Record<string, unknown>,
  screenshotPath?: string | null,
) {
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
    screenshot_path: screenshotPath === undefined ? readFirstScreenshotPath(screenshots) : screenshotPath,
    ai_token_usage: aiTokenUsage,
  }
}

async function toAnalysisSummaryWithThumbnail(record: Record<string, unknown>) {
  const screenshot = readPageScreenshots(record.page_screenshots_json)[0]
  if (!screenshot) return toAnalysisSummary(record, null)
  const evidence = readDesignEvidence(record.design_evidence_json)
  const thumbnailPath = await createHistoryThumbnail(findHistoryThumbnailSource(evidence, screenshot))
  return toAnalysisSummary(record, thumbnailPath)
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
    analysisTiming: record.analysis_timing_json ? JSON.parse(record.analysis_timing_json as string) : undefined,
    url: record.url,
  }
}

function readStoredAnalysisTiming(record: Record<string, unknown>) {
  return record.analysis_timing_json
    ? (JSON.parse(record.analysis_timing_json as string) as import('../core/analyzer/types.js').AnalysisTiming)
    : undefined
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

    return records.map((record) => toAnalysisSummary(record))
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
      const where = search ? "WHERE a.url LIKE @search OR COALESCE(t.name, '') LIKE @search" : ''
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
          `SELECT a.id, a.theme_id, t.name AS theme_name, a.url, a.pages_analyzed, a.viewports, a.duration_ms,
                  a.token_usage, a.created_at, a.page_screenshots_json,
                  a.design_evidence_json, a.design_intelligence_status, a.design_intelligence_meta_json
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
    const reconstructionBrief = designEvidence
      ? generateReconstructionBrief(designProfile, designEvidence, tokens, designIntelligence)
      : null
    const agentContext =
      designEvidence && designProfile
        ? createTaskContext('Create a new page or component', designEvidence, designProfile, designIntelligence)
        : designEvidence
          ? createTaskContext('Use the observed design evidence', designEvidence, null, designIntelligence)
          : null
    const pageScreenshots = await addHistoryThumbnailPaths(
      readPageScreenshots(record.page_screenshots_json),
      designEvidence,
    )

    return {
      id: record.id,
      savedThemeId: (record.theme_id as string | null) || null,
      url: record.url,
      finalUrl: record.final_url,
      pagesAnalyzed: record.pages_analyzed,
      durationMs: record.duration_ms,
      analysisTiming: record.analysis_timing_json ? JSON.parse(record.analysis_timing_json as string) : undefined,
      createdAt: record.created_at,
      tokens,
      cssVariables: record.css_variables || '',
      tailwindTheme: record.tailwind_theme || '',
      designDoc: record.design_doc || '',
      pageScreenshots,
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
    analysisProgramCompletedTimes.delete(analysisId)
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
          undefined,
          designIntelligenceStatus,
          { ...designIntelligenceMeta, timing: result.timing },
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
            design_intelligence_meta_json, analysis_timing_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          analysisId,
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
          JSON.stringify(result.timing),
        )

        analysisProgramCompletedTimes.set(analysisId, Date.now())

        log.info(
          'analysis',
          `done: url=${url} id=${analysisId} pages=${pagesAnalyzed} durationMs=${result.duration} darkMode=${result.darkMode?.hasDarkMode ? 'yes' : 'no'} degraded=${result.extractionIssues.length}`,
        )
        log.info(
          'analysis',
          `timing: total=${result.timing.totalMs}ms screenshots=${result.timing.screenshotCaptureMs || 0}ms ` +
            `fingerprints=${result.timing.imageFingerprintMs || 0}ms summaries=${result.timing.imageSummaryMs}ms ` +
            `images=${result.timing.imageCount} userWaitExcluded=${result.timing.userWaitMs || 0}ms`,
        )
        result.extractionIssues.slice(0, 8).forEach((issue, index) => {
          const reason = issue.reason.replace(/\s+/g, ' ').slice(0, 360)
          log.warn('analysis', `degraded #${index + 1}: stage=${issue.stage} reason=${reason}`)
        })
        if (result.extractionIssues.length > 8) {
          log.warn('analysis', `degraded: ${result.extractionIssues.length - 8} additional issues omitted`)
        }

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
          analysisTiming: result.timing,
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

  ipcMain.handle('design-intelligence:start', async (event, analysisId: string, language?: string) => {
    const db = getDb()
    const record = db.prepare('SELECT * FROM analyses WHERE id = ?').get(analysisId) as
      Record<string, unknown> | undefined
    if (!record) return { error: true, message: 'Analysis not found' }
    if (!record.design_evidence_json) return { error: true, message: 'Design Evidence is unavailable for this record' }

    const programCompletedAt = analysisProgramCompletedTimes.get(analysisId)
    const interstageUserWaitMs = programCompletedAt ? Math.max(0, Date.now() - programCompletedAt) : 0
    analysisProgramCompletedTimes.delete(analysisId)

    const win = BrowserWindow.fromWebContents(event.sender)
    const designEvidence = JSON.parse(record.design_evidence_json as string) as DesignEvidence
    const tokens = JSON.parse((record.tokens_json as string) || '{}') as DesignToken
    const settings = getSettings()
    const outputLanguage = language?.startsWith('zh') ? ('zh-CN' as const) : ('en' as const)
    const existingMeta = record.design_intelligence_meta_json
      ? (JSON.parse(record.design_intelligence_meta_json as string) as DesignIntelligenceMeta)
      : null
    const route = chooseDesignIntelligenceRoute(settings, designEvidence)
    const expectedPackage = selectEvidencePackage(designEvidence, route.mode)
    const expectedImageIds =
      route.mode === 'multimodal'
        ? availableEvidenceImageIds(designEvidence, expectedPackage.imageIds)
        : expectedPackage.imageIds
    const expectedMode = route.mode === 'multimodal' && expectedImageIds.length === 0 ? 'structural-only' : route.mode
    const expectedFingerprint = createEvidenceFingerprint(
      designEvidence,
      expectedMode,
      route.provider,
      route.model,
      expectedImageIds,
      DESIGN_PROFILE_PROMPT_VERSION,
      '1',
      outputLanguage,
    )
    const cacheKey = createIntelligenceCacheKey(
      expectedFingerprint,
      route,
      settings,
      outputLanguage,
      designEvidence.source.accessMode,
    )
    if (
      record.design_profile_json &&
      existingMeta &&
      (existingMeta.status === 'complete' || existingMeta.status === 'partial') &&
      existingMeta.cacheKey === cacheKey &&
      existingMeta.inputFingerprint === expectedFingerprint &&
      existingMeta.schemaVersion === '1' &&
      existingMeta.promptVersion === DESIGN_PROFILE_PROMPT_VERSION
    ) {
      const designProfile = JSON.parse(record.design_profile_json as string) as DesignProfile
      const cachedMeta = {
        ...existingMeta,
        timing: existingMeta.timing
          ? {
              ...existingMeta.timing,
              cacheHit: true,
              aiTotalMs: 0,
              aiQueueMs: 0,
              aiNetworkMs: 0,
              aiTransportAttempts: 0,
              totalMs: 0,
              aiInvokeMs: 0,
            }
          : existingMeta.timing,
      }
      const reconstructionBrief = generateReconstructionBrief(designProfile, designEvidence, tokens, cachedMeta)
      const programTiming = readStoredAnalysisTiming(record)
      const combinedTiming = programTiming
        ? mergeAnalysisTimings(programTiming, cachedMeta.timing, interstageUserWaitMs)
        : cachedMeta.timing
      return {
        ...buildStoredAnalysisResult(record, tokens),
        duration: (combinedTiming?.totalMs ?? Number(record.duration_ms)) || 0,
        analysisTiming: combinedTiming,
        designEvidence,
        designProfile,
        designIntelligence: cachedMeta,
        reconstructionBrief,
        agentContext: createTaskContext('Create a new page or component', designEvidence, designProfile, cachedMeta),
        validationReport: record.validation_report_json ? JSON.parse(record.validation_report_json as string) : null,
      }
    }
    {
      const persistentCache = db
        .prepare('SELECT * FROM design_intelligence_cache WHERE cache_key = ?')
        .get(cacheKey) as Record<string, unknown> | undefined
      if (persistentCache) {
        const cachedProfile = JSON.parse(persistentCache.profile_json as string) as DesignProfile
        const storedMeta = JSON.parse(persistentCache.meta_json as string) as DesignIntelligenceMeta
        const cachedMeta: DesignIntelligenceMeta = {
          ...storedMeta,
          cacheKey,
          inputFingerprint: expectedFingerprint,
          timing: storedMeta.timing
            ? {
                ...storedMeta.timing,
                cacheHit: true,
                aiTotalMs: 0,
                aiQueueMs: 0,
                aiNetworkMs: 0,
                aiTransportAttempts: 0,
                totalMs: 0,
                aiInvokeMs: 0,
              }
            : storedMeta.timing,
        }
        const cachedValidation = persistentCache.validation_report_json
          ? JSON.parse(persistentCache.validation_report_json as string)
          : null
        const programTiming = readStoredAnalysisTiming(record)
        const combinedTiming = programTiming
          ? mergeAnalysisTimings(programTiming, cachedMeta.timing, interstageUserWaitMs)
          : cachedMeta.timing
        db.prepare(
          `UPDATE analyses
           SET design_profile_json = ?, design_intelligence_status = ?, design_intelligence_meta_json = ?,
               validation_report_json = ?, analysis_timing_json = ?, duration_ms = ?
           WHERE id = ?`,
        ).run(
          JSON.stringify(cachedProfile),
          cachedMeta.status,
          JSON.stringify(cachedMeta),
          persistentCache.validation_report_json || null,
          combinedTiming ? JSON.stringify(combinedTiming) : record.analysis_timing_json,
          (combinedTiming?.totalMs ?? Number(record.duration_ms)) || 0,
          analysisId,
        )
        db.prepare('UPDATE design_intelligence_cache SET last_accessed_at = ? WHERE cache_key = ?').run(
          new Date().toISOString(),
          cacheKey,
        )
        const reconstructionBrief = generateReconstructionBrief(cachedProfile, designEvidence, tokens, cachedMeta)
        log.info('design-intelligence', `persistent cache hit: key=${cacheKey.slice(0, 12)}`)
        return {
          ...buildStoredAnalysisResult(record, tokens),
          duration: (combinedTiming?.totalMs ?? Number(record.duration_ms)) || 0,
          analysisTiming: combinedTiming,
          designEvidence,
          designProfile: cachedProfile,
          designIntelligence: cachedMeta,
          reconstructionBrief,
          agentContext: createTaskContext('Create a new page or component', designEvidence, cachedProfile, cachedMeta),
          validationReport: cachedValidation,
        }
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
      step: 'progress.programAnalysisComplete',
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
    const completedCacheKey = createIntelligenceCacheKey(
      intelligence.meta.inputFingerprint || expectedFingerprint,
      route,
      settings,
      outputLanguage,
      designEvidence.source.accessMode,
    )
    intelligence.meta.cacheKey = completedCacheKey
    const programTiming = readStoredAnalysisTiming(record)
    const combinedTiming = programTiming
      ? mergeAnalysisTimings(programTiming, intelligence.meta.timing, interstageUserWaitMs)
      : intelligence.meta.timing
    if (combinedTiming) {
      log.info(
        'design-intelligence',
        `combined timing: program=${combinedTiming.programTotalMs || 0}ms ai=${combinedTiming.aiTotalMs || 0}ms ` +
          `total=${combinedTiming.totalMs}ms userWaitExcluded=${combinedTiming.userWaitMs || 0}ms`,
      )
    }
    if (designIntelligenceControllers.get(analysisId) === intelligenceController) {
      designIntelligenceControllers.delete(analysisId)
    }
    let designDoc = (record.design_doc as string) || ''
    const previousProfile = record.design_profile_json
      ? (JSON.parse(record.design_profile_json as string) as DesignProfile)
      : null
    const designProfile = intelligence.profile || previousProfile
    let reconstructionBrief: string | null = generateReconstructionBrief(
      designProfile,
      designEvidence,
      tokens,
      intelligence.meta,
    )
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

    let aliasedCss: string | null = null
    let aliasedTailwind: string | null = null
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
      const aliasResult =
        intelligence.profile.tokenAliases && intelligence.profile.tokenAliases.length > 0
          ? applyColorRenames(tokens, intelligence.profile.tokenAliases)
          : null
      const exportTokens = aliasResult?.tokens ?? tokens
      const exportDarkMode =
        aliasResult && darkModeExport?.darkTokens
          ? { ...darkModeExport, darkTokens: applyColorRenames(darkModeExport.darkTokens, aliasResult.applied).tokens }
          : darkModeExport
      designDoc = generateDesignDoc(
        exportTokens,
        record.url as string,
        designEvidence.featureTags,
        exportDarkMode,
        designEvidence.breakpoints,
        undefined,
        outputLanguage,
        [],
        designEvidence,
        intelligence.profile,
        intelligence.meta.status,
        { ...intelligence.meta, timing: combinedTiming },
      )
      if (aliasResult) {
        const aliasComment = `/* AI token aliases: ${aliasResult.applied.map((item) => `${item.tokenId} -> ${item.name}`).join(', ')} */\n`
        aliasedCss = aliasComment + generateCssVariables(exportTokens, exportDarkMode, designEvidence.breakpoints)
        aliasedTailwind = aliasComment + generateTailwindTheme(exportTokens, exportDarkMode, designEvidence.breakpoints)
      }
    } else {
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
        undefined,
        intelligence.meta.status,
        { ...intelligence.meta, timing: combinedTiming },
      )
    }

    const totalDuration = combinedTiming?.totalMs ?? null

    db.prepare(
      `UPDATE analyses
       SET design_doc = ?, design_profile_json = ?, design_intelligence_status = ?,
           design_intelligence_meta_json = ?, validation_report_json = ?,
           css_variables = ?, tailwind_theme = ?, analysis_timing_json = ?${totalDuration != null ? ', duration_ms = ?' : ''}
       WHERE id = ?`,
    ).run(
      ...[
        designDoc,
        designProfile ? JSON.stringify(designProfile) : null,
        intelligence.meta.status,
        JSON.stringify(intelligence.meta),
        validationReport ? JSON.stringify(validationReport) : null,
        aliasedCss ?? record.css_variables,
        aliasedTailwind ?? record.tailwind_theme,
        combinedTiming ? JSON.stringify(combinedTiming) : record.analysis_timing_json,
        ...(totalDuration != null ? [totalDuration] : []),
        analysisId,
      ],
    )
    if (intelligence.profile && ['complete', 'partial'].includes(intelligence.meta.status)) {
      const storedFingerprint = intelligence.meta.inputFingerprint || expectedFingerprint
      const storedMode = intelligence.meta.inputMode || route.mode
      let storedPackage = selectEvidencePackage(designEvidence, storedMode)
      if (storedMode === 'multimodal') {
        storedPackage = restrictEvidencePackageImages(
          storedPackage,
          availableEvidenceImageIds(designEvidence, storedPackage.imageIds),
        )
      }
      const digestJson = JSON.stringify(
        prepareAnalysisDigestPackageForPrompt(buildAnalysisDigest(designEvidence, storedPackage)).digest,
      )
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO design_intelligence_cache
         (cache_key, input_fingerprint, digest_json, profile_json, meta_json, validation_report_json, created_at, last_accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           digest_json = excluded.digest_json,
           profile_json = excluded.profile_json,
           meta_json = excluded.meta_json,
           validation_report_json = excluded.validation_report_json,
           last_accessed_at = excluded.last_accessed_at`,
      ).run(
        completedCacheKey,
        storedFingerprint,
        digestJson,
        JSON.stringify(intelligence.profile),
        JSON.stringify(intelligence.meta),
        validationReport ? JSON.stringify(validationReport) : null,
        now,
        now,
      )
      db.prepare(
        `DELETE FROM design_intelligence_cache
         WHERE cache_key NOT IN (
           SELECT cache_key FROM design_intelligence_cache ORDER BY last_accessed_at DESC LIMIT 100
         )`,
      ).run()
    }
    const currentThemeLink = db.prepare('SELECT theme_id FROM analyses WHERE id = ?').get(analysisId) as
      { theme_id: string | null } | undefined
    if (typeof currentThemeLink?.theme_id === 'string') {
      db.prepare(
        `UPDATE themes
         SET design_doc = ?, design_evidence_json = ?, design_profile_json = ?,
             design_intelligence_meta_json = ?, updated_at = ?${aliasedCss ? ', css_variables = ?, tailwind_theme = ?' : ''}
         WHERE id = ?`,
      ).run(
        ...[
          designDoc,
          record.design_evidence_json,
          designProfile ? JSON.stringify(designProfile) : null,
          JSON.stringify(intelligence.meta),
          new Date().toISOString(),
          ...(aliasedCss ? [aliasedCss, aliasedTailwind] : []),
          currentThemeLink.theme_id,
        ],
      )
    }
    win?.webContents.send('design-intelligence:progress', {
      step:
        intelligence.meta.status === 'failed' ? 'progress.designLanguageFallback' : 'progress.designLanguageComplete',
      percent: 100,
    })

    return {
      ...buildStoredAnalysisResult({ ...record, theme_id: currentThemeLink?.theme_id || null }, tokens, designDoc),
      duration: (totalDuration ?? Number(record.duration_ms)) || 0,
      analysisTiming: combinedTiming,
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
    const reconstructionBrief = generateReconstructionBrief(designProfile, designEvidence, tokens, existingMeta)
    const darkModeExport = readDarkModeExportData(
      record.dark_tokens_json,
      tokens,
      record.dark_mode_method,
      record.dark_mode_selector,
    )
    const aliasResult =
      designProfile.tokenAliases && designProfile.tokenAliases.length > 0
        ? applyColorRenames(tokens, designProfile.tokenAliases)
        : null
    const exportTokens = aliasResult?.tokens ?? tokens
    const exportDarkMode =
      aliasResult && darkModeExport?.darkTokens
        ? { ...darkModeExport, darkTokens: applyColorRenames(darkModeExport.darkTokens, aliasResult.applied).tokens }
        : darkModeExport
    // Always rebuild the document. A failed retry must remove examples from a prior
    // successful run so stale generated HTML is never left in Markdown exports.
    const designDoc = generateDesignDoc(
      exportTokens,
      record.url as string,
      designEvidence.featureTags,
      exportDarkMode,
      designEvidence.breakpoints,
      undefined,
      outputLanguage,
      generation.status === 'complete' ? generation.examples : [],
      designEvidence,
      designProfile,
      updatedMeta.status,
      { ...updatedMeta, timing: readStoredAnalysisTiming(record) || updatedMeta.timing },
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
        reconstructionBrief: generateReconstructionBrief(profile, evidence, tokens, meta),
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

  ipcMain.on('performance:renderer-sample', (_event, sample: unknown) => {
    const formattedSample = formatRendererPerformanceSample(sample)
    if (formattedSample) log.info('performance', formattedSample)
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
