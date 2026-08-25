import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import Database from 'better-sqlite3'

import { normalizedAnalysisDurationMs } from '../core/analyzer/analysis-timing.js'
import { routeIdentityFromUrl } from '../core/analyzer/reference-compare.js'
import type { DesignToken, PageScreenshot } from '../core/analyzer/types.js'
import {
  redactUrlsInText,
  sanitizeDesignEvidenceForPersistence,
  sanitizeDesignTokensForPersistence,
  sanitizePageScreenshotsForPersistence,
  sanitizeUrlForPersistence,
} from '../core/analyzer/url-privacy.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import { log } from './logger.js'
import { analysisPreviewPath, analysisSiteName, readDesignEvidence, readPageScreenshots } from './persisted-records.js'

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'copy-design.db')
  db = new Database(dbPath)
  log.info('db', `database opened at ${dbPath}`)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runDatabaseMigrations(db)
}

export function runDatabaseMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_url TEXT,
      screenshot_path TEXT,
      tokens_json TEXT NOT NULL DEFAULT '{}',
      css_variables TEXT NOT NULL DEFAULT '',
      tailwind_theme TEXT DEFAULT '',
      design_doc TEXT DEFAULT '',
      dark_tokens_json TEXT,
      dark_mode_method TEXT,
      dark_mode_selector TEXT,
      tags TEXT DEFAULT '[]',
      is_builtin INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
      url TEXT NOT NULL,
      pages_analyzed INTEGER DEFAULT 1,
      viewports TEXT DEFAULT '["desktop"]',
      duration_ms INTEGER,
      route_identity TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY,
      theme_id TEXT REFERENCES themes(id) ON DELETE CASCADE,
      format TEXT NOT NULL,
      file_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

  `)

  // Analysis results are stored as text so history records can be reopened
  // later. Screenshots stay on disk; only their paths are persisted here.
  const analysisColumns = (database.prepare(`PRAGMA table_info(analyses)`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  )
  const analysisResultColumns: Array<[string, string]> = [
    ['tokens_json', `TEXT NOT NULL DEFAULT '{}'`],
    ['css_variables', `TEXT NOT NULL DEFAULT ''`],
    ['tailwind_theme', `TEXT NOT NULL DEFAULT ''`],
    ['design_doc', `TEXT NOT NULL DEFAULT ''`],
    ['page_screenshots_json', `TEXT NOT NULL DEFAULT '[]'`],
    ['feature_tags_json', `TEXT NOT NULL DEFAULT '[]'`],
    ['dark_tokens_json', `TEXT`],
    ['dark_mode_method', `TEXT`],
    ['dark_mode_selector', `TEXT`],
    ['has_dark_mode', `INTEGER DEFAULT 0`],
    ['access_mode', `TEXT`],
    ['auth_wall_detected', `INTEGER DEFAULT 0`],
    ['final_url', `TEXT`],
    ['design_evidence_json', `TEXT`],
    ['evidence_coverage_json', `TEXT`],
    ['design_profile_json', `TEXT`],
    ['validation_report_json', `TEXT`],
    ['analysis_timing_json', `TEXT`],
    ['capture_manifest_json', `TEXT`],
    ['completion_json', `TEXT`],
    ['route_identity', `TEXT`],
    ['site_name', `TEXT`],
    ['preview_path', `TEXT`],
  ]
  for (const [name, definition] of analysisResultColumns) {
    if (!analysisColumns.includes(name)) {
      database.exec(`ALTER TABLE analyses ADD COLUMN ${name} ${definition}`)
    }
  }
  const themeColumns = (database.prepare(`PRAGMA table_info(themes)`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  )
  const themeSnapshotColumns: Array<[string, string]> = [
    ['design_evidence_json', `TEXT`],
    ['design_profile_json', `TEXT`],
    ['dark_tokens_json', `TEXT`],
    ['dark_mode_method', `TEXT`],
    ['dark_mode_selector', `TEXT`],
  ]
  for (const [name, definition] of themeSnapshotColumns) {
    if (!themeColumns.includes(name)) database.exec(`ALTER TABLE themes ADD COLUMN ${name} ${definition}`)
  }
  runMigrationOnce(database, 'persisted-url-and-summary-v1', () => sanitizeStoredUrls(database))
  backfillAnalysisRouteIdentities(database)
  runMigrationOnce(database, 'normalized-analysis-duration-v1', () => normalizeStoredAnalysisDurations(database))
  database.exec('CREATE INDEX IF NOT EXISTS idx_analyses_theme_id ON analyses(theme_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_analyses_route_identity ON analyses(route_identity)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_analyses_created_at_id ON analyses(created_at DESC, id)')
  database.exec('DROP INDEX IF EXISTS idx_analyses_reference_route')
  removeUncommittedAnalysisAssets(database)
}

function runMigrationOnce(database: Database.Database, id: string, migrate: () => void): void {
  const applied = database.prepare('SELECT 1 FROM app_migrations WHERE id = ?').get(id)
  if (applied) return
  migrate()
  database
    .prepare('INSERT OR IGNORE INTO app_migrations (id, applied_at) VALUES (?, ?)')
    .run(id, new Date().toISOString())
}

function sanitizeSerializedTokens(value: string): string {
  try {
    const parsed = JSON.parse(value) as DesignToken
    const sanitized = sanitizeDesignTokensForPersistence(parsed)
    return JSON.stringify(parsed) === JSON.stringify(sanitized) ? value : JSON.stringify(sanitized)
  } catch {
    return redactUrlsInText(value)
  }
}

function sanitizeSerializedEvidence(value: string | null): string | null {
  if (!value) return value
  try {
    const parsed = JSON.parse(value) as DesignEvidence
    const sanitized = sanitizeDesignEvidenceForPersistence(parsed)
    return JSON.stringify(parsed) === JSON.stringify(sanitized) ? value : JSON.stringify(sanitized)
  } catch {
    return redactUrlsInText(value)
  }
}

function sanitizeSerializedScreenshots(value: string): string {
  try {
    const parsed = JSON.parse(value) as PageScreenshot[]
    const sanitized = sanitizePageScreenshotsForPersistence(parsed)
    return JSON.stringify(parsed) === JSON.stringify(sanitized) ? value : JSON.stringify(sanitized)
  } catch {
    return redactUrlsInText(value)
  }
}

function sanitizeStoredUrls(database: Database.Database) {
  const referencedAssets = new Set<string>()
  const analyses = database
    .prepare(
      `SELECT id, url, final_url, tokens_json, dark_tokens_json, design_doc, page_screenshots_json, design_evidence_json,
              site_name, preview_path
       FROM analyses`,
    )
    .all() as Array<{
    id: string
    url: string
    final_url: string | null
    tokens_json: string
    dark_tokens_json: string | null
    design_doc: string
    page_screenshots_json: string
    design_evidence_json: string | null
    site_name: string | null
    preview_path: string | null
  }>
  const updateAnalysis = database.prepare(
    `UPDATE analyses
     SET url = ?, final_url = ?, tokens_json = ?, dark_tokens_json = ?, design_doc = ?, page_screenshots_json = ?,
         design_evidence_json = ?, site_name = ?, preview_path = ?
     WHERE id = ?`,
  )
  const themes = database
    .prepare(
      `SELECT id, source_url, screenshot_path, tokens_json, dark_tokens_json, design_doc, design_evidence_json FROM themes`,
    )
    .all() as Array<{
    id: string
    source_url: string | null
    screenshot_path: string | null
    tokens_json: string
    dark_tokens_json: string | null
    design_doc: string
    design_evidence_json: string | null
  }>
  const updateTheme = database.prepare(
    `UPDATE themes SET source_url = ?, tokens_json = ?, dark_tokens_json = ?, design_doc = ?, design_evidence_json = ? WHERE id = ?`,
  )
  let changed = 0

  database.transaction(() => {
    for (const record of analyses) {
      const sanitizedUrl = sanitizeUrlForPersistence(record.url)
      const sanitizedScreenshots = sanitizeSerializedScreenshots(record.page_screenshots_json)
      const sanitizedEvidence = sanitizeSerializedEvidence(record.design_evidence_json)
      const evidence = readDesignEvidence(sanitizedEvidence)
      const screenshots = readPageScreenshots(sanitizedScreenshots)
      for (const screenshot of screenshots) {
        if (typeof screenshot.path === 'string' && screenshot.path) referencedAssets.add(path.resolve(screenshot.path))
        if (typeof screenshot.thumbnailPath === 'string' && screenshot.thumbnailPath) {
          referencedAssets.add(path.resolve(screenshot.thumbnailPath))
        }
      }
      for (const page of evidence?.pages || []) {
        for (const image of page.images || []) {
          if (typeof image.path === 'string' && image.path) referencedAssets.add(path.resolve(image.path))
        }
      }
      const values = [
        sanitizedUrl,
        record.final_url ? sanitizeUrlForPersistence(record.final_url) : null,
        sanitizeSerializedTokens(record.tokens_json),
        record.dark_tokens_json ? sanitizeSerializedTokens(record.dark_tokens_json) : null,
        redactUrlsInText(record.design_doc),
        sanitizedScreenshots,
        sanitizedEvidence,
        analysisSiteName(sanitizedUrl, evidence),
        analysisPreviewPath(screenshots, evidence),
      ] as const
      if (
        values[0] === record.url &&
        values[1] === record.final_url &&
        values[2] === record.tokens_json &&
        values[3] === record.dark_tokens_json &&
        values[4] === record.design_doc &&
        values[5] === record.page_screenshots_json &&
        values[6] === record.design_evidence_json &&
        values[7] === record.site_name &&
        values[8] === record.preview_path
      ) {
        continue
      }
      updateAnalysis.run(...values, record.id)
      changed += 1
    }
    for (const record of themes) {
      const sanitizedEvidence = sanitizeSerializedEvidence(record.design_evidence_json)
      if (typeof record.screenshot_path === 'string' && record.screenshot_path) {
        referencedAssets.add(path.resolve(record.screenshot_path))
      }
      for (const page of readDesignEvidence(sanitizedEvidence)?.pages || []) {
        for (const image of page.images || []) {
          if (typeof image.path === 'string' && image.path) referencedAssets.add(path.resolve(image.path))
        }
      }
      const values = [
        record.source_url ? sanitizeUrlForPersistence(record.source_url) : null,
        sanitizeSerializedTokens(record.tokens_json),
        record.dark_tokens_json ? sanitizeSerializedTokens(record.dark_tokens_json) : null,
        redactUrlsInText(record.design_doc),
        sanitizedEvidence,
      ] as const
      if (
        values[0] === record.source_url &&
        values[1] === record.tokens_json &&
        values[2] === record.dark_tokens_json &&
        values[3] === record.design_doc &&
        values[4] === record.design_evidence_json
      ) {
        continue
      }
      updateTheme.run(...values, record.id)
      changed += 1
    }
  })()
  if (changed > 0) log.info('db', `migrated URL privacy and history metadata in ${changed} persisted records`)
  removeOrphanedGeneratedAssets(referencedAssets)
}

function removeOrphanedGeneratedAssets(referencedAssets: Set<string>): void {
  let removed = 0
  let removedBytes = 0
  for (const directoryName of ['screenshots', 'history-thumbnails']) {
    const directory = path.join(app.getPath('userData'), directoryName)
    if (!fs.existsSync(directory)) continue
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const filePath = path.resolve(directory, entry.name)
      if (referencedAssets.has(filePath)) continue
      try {
        removedBytes += fs.statSync(filePath).size
        fs.rmSync(filePath, { force: true })
        removed += 1
      } catch {
        // Leave temporarily locked files for a later explicit deletion or clear-data action.
      }
    }
  }
  if (removed > 0) {
    log.info('db', `removed ${removed} unreferenced generated assets (${Math.round(removedBytes / 1024)} KiB)`)
  }
}

function removeUncommittedAnalysisAssets(database: Database.Database): void {
  const screenshotDirectory = path.join(app.getPath('userData'), 'screenshots')
  if (!fs.existsSync(screenshotDirectory)) return
  const persistedIds = new Set(
    (database.prepare('SELECT id FROM analyses').all() as Array<{ id: string }>).map((record) => record.id),
  )
  const analysisAssetPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-/i
  let removed = 0
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(screenshotDirectory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const analysisId = entry.name.match(analysisAssetPattern)?.[1]
    if (!analysisId || persistedIds.has(analysisId)) continue
    try {
      fs.rmSync(path.join(screenshotDirectory, entry.name), { force: true })
      removed += 1
    } catch {
      // Leave temporarily locked files for the next startup.
    }
  }
  if (removed > 0) log.info('db', `removed ${removed} assets from interrupted analyses`)
}

function backfillAnalysisRouteIdentities(database: Database.Database) {
  const records = database
    .prepare(`SELECT id, url, final_url FROM analyses WHERE route_identity IS NULL OR route_identity = ''`)
    .all() as Array<{ id: string; url: string; final_url: string | null }>
  if (records.length === 0) return

  const update = database.prepare('UPDATE analyses SET route_identity = ? WHERE id = ?')
  database.transaction(() => {
    for (const record of records) update.run(routeIdentityFromUrl(record.final_url || record.url), record.id)
  })()
  log.info('db', `backfilled route identity for ${records.length} analysis records`)
}

function normalizeStoredAnalysisDurations(database: Database.Database) {
  const records = database
    .prepare(`SELECT id, duration_ms, analysis_timing_json FROM analyses WHERE analysis_timing_json IS NOT NULL`)
    .all() as Array<{ id: string; duration_ms: number | null; analysis_timing_json: string }>
  const update = database.prepare('UPDATE analyses SET duration_ms = ? WHERE id = ?')
  let updated = 0
  database.transaction(() => {
    for (const record of records) {
      try {
        const duration = normalizedAnalysisDurationMs(JSON.parse(record.analysis_timing_json) as { totalMs: number })
        if (duration === null || duration === record.duration_ms) continue
        update.run(duration, record.id)
        updated += 1
      } catch {
        // Leave legacy or malformed timing records unchanged.
      }
    }
  })()
  if (updated > 0) log.info('db', `normalized ${updated} stored analysis durations from analysis timing`)
}
