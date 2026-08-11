import path from 'node:path'

import { app } from 'electron'

import Database from 'better-sqlite3'

import { normalizedAnalysisDurationMs } from '../core/analyzer/analysis-timing.js'
import { log } from './logger.js'

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

  runMigrations()
}

function runMigrations() {
  db.exec(`
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
      token_usage INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY,
      theme_id TEXT REFERENCES themes(id) ON DELETE CASCADE,
      format TEXT NOT NULL,
      file_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS design_intelligence_cache (
      cache_key TEXT PRIMARY KEY,
      input_fingerprint TEXT NOT NULL,
      digest_json TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      validation_report_json TEXT,
      created_at TEXT NOT NULL,
      last_accessed_at TEXT NOT NULL
    );
  `)

  // Analysis results are stored as text so history records can be reopened
  // later. Screenshots stay on disk; only their paths are persisted here.
  const analysisColumns = (db.prepare(`PRAGMA table_info(analyses)`).all() as Array<{ name: string }>).map(
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
    ['design_intelligence_status', `TEXT NOT NULL DEFAULT 'not-requested'`],
    ['design_intelligence_meta_json', `TEXT`],
    ['validation_report_json', `TEXT`],
    ['analysis_timing_json', `TEXT`],
  ]
  for (const [name, definition] of analysisResultColumns) {
    if (!analysisColumns.includes(name)) {
      db.exec(`ALTER TABLE analyses ADD COLUMN ${name} ${definition}`)
    }
  }
  normalizeStoredAnalysisDurations()

  const themeColumns = (db.prepare(`PRAGMA table_info(themes)`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  )
  const themeSnapshotColumns: Array<[string, string]> = [
    ['design_evidence_json', `TEXT`],
    ['design_profile_json', `TEXT`],
    ['design_intelligence_meta_json', `TEXT`],
    ['dark_tokens_json', `TEXT`],
    ['dark_mode_method', `TEXT`],
    ['dark_mode_selector', `TEXT`],
  ]
  for (const [name, definition] of themeSnapshotColumns) {
    if (!themeColumns.includes(name)) db.exec(`ALTER TABLE themes ADD COLUMN ${name} ${definition}`)
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_analyses_theme_id ON analyses(theme_id)')
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_design_intelligence_cache_access ON design_intelligence_cache(last_accessed_at)',
  )
}

function normalizeStoredAnalysisDurations() {
  const records = db
    .prepare(`SELECT id, duration_ms, analysis_timing_json FROM analyses WHERE analysis_timing_json IS NOT NULL`)
    .all() as Array<{ id: string; duration_ms: number | null; analysis_timing_json: string }>
  const update = db.prepare('UPDATE analyses SET duration_ms = ? WHERE id = ?')
  let updated = 0
  db.transaction(() => {
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
  if (updated > 0) log.info('db', `normalized ${updated} stored analysis durations from net timing`)
}
