import { randomUUID } from 'node:crypto'

import { app, ipcMain } from 'electron'

import { createDeterministicDesignContext } from '../core/design-context/deterministic-context.js'
import { generateDesignDoc } from '../core/export/index.js'
import type { ThemeRecord, ThemeSaveResponse, ThemeSummaryRecord } from '../shared/ipc-contract.js'
import { collectStoredAnalysisAssets, removeGeneratedAssets } from './analysis-assets.js'
import { getDb } from './database.js'
import { saveTextFile } from './file-export.js'
import { log } from './logger.js'
import {
  readDarkModeExportData,
  readDesignEvidence,
  readDesignProfile,
  readDesignTokens,
  readFirstScreenshotPath,
  toThemeSummary,
} from './persisted-records.js'

const THEME_SUMMARY_COLUMNS = `id, name, source_url, screenshot_path, tokens_json, dark_tokens_json,
  dark_mode_method, dark_mode_selector, tags, is_favorite, created_at, updated_at`

export function registerThemeIpcHandlers(): void {
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
      const evidence = readDesignEvidence(theme.design_evidence_json)
      const tokens = readDesignTokens(theme.tokens_json) || evidence?.tokens
      if (!tokens) throw new Error('Invalid theme tokens')
      const storedProfile = readDesignProfile(theme.design_profile_json)
      if (evidence) {
        const profile =
          storedProfile ||
          createDeterministicDesignContext(
            evidence,
            evidence.source.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en',
          ).profile
        const darkMode = readDarkModeExportData(
          theme.dark_tokens_json,
          tokens,
          theme.dark_mode_method,
          theme.dark_mode_selector,
          evidence,
        )
        designDoc = generateDesignDoc({
          tokens,
          url: theme.source_url || evidence.source.requestedUrl,
          featureTags: evidence.featureTags,
          darkMode,
          language: profile.language,
          designEvidence: evidence,
          designProfile: profile,
        })
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
}
