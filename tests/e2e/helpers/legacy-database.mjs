import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

const [operation, databasePath] = process.argv.slice(2)
if (!operation || !databasePath) throw new Error('Expected an operation and database path')

const database = new Database(path.resolve(databasePath))
database.pragma('foreign_keys = ON')

if (operation === 'create') {
  database.exec(`
    CREATE TABLE themes (
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
      updated_at TEXT NOT NULL,
      design_evidence_json TEXT,
      design_profile_json TEXT
    );

    CREATE TABLE analyses (
      id TEXT PRIMARY KEY,
      theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
      url TEXT NOT NULL,
      pages_analyzed INTEGER DEFAULT 1,
      viewports TEXT DEFAULT '["desktop"]',
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      tokens_json TEXT NOT NULL DEFAULT '{}',
      css_variables TEXT NOT NULL DEFAULT '',
      tailwind_theme TEXT NOT NULL DEFAULT '',
      design_doc TEXT NOT NULL DEFAULT '',
      page_screenshots_json TEXT NOT NULL DEFAULT '[]',
      feature_tags_json TEXT NOT NULL DEFAULT '[]',
      dark_tokens_json TEXT,
      dark_mode_method TEXT,
      dark_mode_selector TEXT,
      has_dark_mode INTEGER DEFAULT 0,
      access_mode TEXT,
      auth_wall_detected INTEGER DEFAULT 0,
      final_url TEXT,
      design_evidence_json TEXT,
      evidence_coverage_json TEXT,
      design_profile_json TEXT,
      validation_report_json TEXT,
      analysis_timing_json TEXT
    );

    CREATE TABLE exports (
      id TEXT PRIMARY KEY,
      theme_id TEXT REFERENCES themes(id) ON DELETE CASCADE,
      format TEXT NOT NULL,
      file_path TEXT,
      created_at TEXT NOT NULL
    );
  `)

  const privateUrl = 'https://user:password@example.com/products?access_token=private-value#panel'
  const tokens = { evidence: { 'colors.primary': { pages: [privateUrl] } } }
  const evidence = {
    source: { requestedUrl: privateUrl, finalUrl: privateUrl },
    pages: [
      {
        url: privateUrl,
        health: { issues: [{ detail: `Recovery failed at ${privateUrl}` }] },
      },
    ],
    tokens,
  }
  database
    .prepare(
      `INSERT INTO analyses
       (id, url, created_at, duration_ms, tokens_json, design_doc, page_screenshots_json, final_url,
        design_evidence_json, analysis_timing_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'analysis-valid',
      privateUrl,
      '2026-08-17T00:00:00.000Z',
      12,
      JSON.stringify(tokens),
      `Source: ${privateUrl}`,
      JSON.stringify([{ url: privateUrl, path: '/tmp/capture.png', viewport: 'desktop' }]),
      privateUrl,
      JSON.stringify(evidence),
      JSON.stringify({ totalMs: 987 }),
    )
  database
    .prepare(
      `INSERT INTO analyses
       (id, url, created_at, tokens_json, page_screenshots_json, final_url, design_evidence_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'analysis-malformed',
      privateUrl,
      '2026-08-17T00:00:01.000Z',
      `{broken:"${privateUrl}"`,
      `[broken:"${privateUrl}"`,
      privateUrl,
      `{broken:"${privateUrl}"`,
    )
  database
    .prepare(
      `INSERT INTO themes
       (id, name, source_url, tokens_json, design_doc, created_at, updated_at, design_evidence_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'theme-1',
      'Legacy theme',
      privateUrl,
      JSON.stringify(tokens),
      `Source: ${privateUrl}`,
      '2026-08-17T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
      JSON.stringify(evidence),
    )
} else if (operation === 'inspect') {
  const snapshot = {
    analyses: database.prepare('SELECT * FROM analyses ORDER BY id').all(),
    themes: database.prepare('SELECT * FROM themes ORDER BY id').all(),
    analysisColumns: database.prepare('PRAGMA table_info(analyses)').all(),
    indexes: database.prepare('PRAGMA index_list(analyses)').all(),
    obsoleteComparisonTables: database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN ('comparison_reviews', 'design_contract_versions', 'governance_events')
         ORDER BY name`,
      )
      .all(),
  }
  process.stdout.write(JSON.stringify(snapshot))
} else {
  throw new Error(`Unknown operation: ${operation}`)
}

database.close()
