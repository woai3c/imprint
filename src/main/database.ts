import path from 'node:path'

import { app } from 'electron'

import Database from 'better-sqlite3'

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'copy-design.db')
  db = new Database(dbPath)

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
  `)
}
