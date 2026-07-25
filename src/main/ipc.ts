import { v4 as uuidv4 } from 'uuid'

import fs from 'node:fs'

import { BrowserWindow, dialog, ipcMain } from 'electron'

import { detectAgentClis } from './agent-detect.js'
import { analyzeUrl } from './analyzer/index.js'
import { getDb } from './database.js'
import { generateCssVariables, generateDesignDoc, generateDtcgJson, generateTailwindTheme } from './export.js'
import { getSettings, saveSettings } from './settings.js'

export function registerIpcHandlers() {
  // --- Themes ---
  ipcMain.handle('themes:list', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM themes ORDER BY updated_at DESC').all()
  })

  ipcMain.handle('themes:get', (_event, id: string) => {
    const db = getDb()
    return db.prepare('SELECT * FROM themes WHERE id = ?').get(id)
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

  ipcMain.handle('analyses:delete', (_event, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM analyses WHERE id = ?').run(id)
    return { success: true }
  })

  // --- Analysis ---
  ipcMain.handle('analyze:url', async (event, url: string, options?: { viewports?: string[] }) => {
    const themeId = uuidv4()
    const now = new Date().toISOString()
    const db = getDb()
    const win = BrowserWindow.fromWebContents(event.sender)

    let hostname: string
    try {
      hostname = new URL(url).hostname
    } catch {
      hostname = url
    }

    try {
      const result = await analyzeUrl(url, options, (step, percent) => {
        win?.webContents.send('analysis:progress', { step, percent })
      })

      const cssVars = generateCssVariables(result.tokens)
      const tailwind = generateTailwindTheme(result.tokens)
      const designDoc = generateDesignDoc(result.tokens, url)
      const tokensJson = JSON.stringify(result.tokens)

      db.prepare(
        `INSERT INTO themes (id, name, source_url, screenshot_path, tokens_json, css_variables, tailwind_theme, design_doc, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        themeId,
        `Theme from ${hostname}`,
        url,
        result.screenshots[0] || null,
        tokensJson,
        cssVars,
        tailwind,
        designDoc,
        now,
        now,
      )

      const analysisId = uuidv4()
      db.prepare(
        `INSERT INTO analyses (id, theme_id, url, viewports, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(analysisId, themeId, url, JSON.stringify(options?.viewports || ['desktop']), result.duration, now)

      return {
        themeId,
        analysisId,
        tokens: result.tokens,
        cssVariables: cssVars,
        tailwindTheme: tailwind,
        designDoc,
        screenshots: result.screenshots,
        duration: result.duration,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: true, message }
    }
  })

  // --- Export ---
  ipcMain.handle('export:theme', async (_event, id: string, format: string) => {
    const db = getDb()
    const theme = db.prepare('SELECT * FROM themes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!theme) return { error: true, message: 'Theme not found' }

    let content: string
    let ext: string
    let filterName: string

    switch (format) {
      case 'css':
        content = theme.css_variables as string
        ext = 'css'
        filterName = 'CSS Files'
        break
      case 'tailwind':
        content = theme.tailwind_theme as string
        ext = 'css'
        filterName = 'CSS Files'
        break
      case 'json':
        content = generateDtcgJson(JSON.parse(theme.tokens_json as string))
        ext = 'json'
        filterName = 'JSON Files'
        break
      case 'markdown':
        content = theme.design_doc as string
        ext = 'md'
        filterName = 'Markdown Files'
        break
      default:
        return { error: true, message: `Unknown format: ${format}` }
    }

    const result = await dialog.showSaveDialog({
      defaultPath: `design-tokens.${ext}`,
      filters: [{ name: filterName, extensions: [ext] }],
    })

    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    fs.writeFileSync(result.filePath, content, 'utf-8')

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

  ipcMain.handle('import:theme', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Design Package', extensions: ['zip', 'json'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    // For now, handle JSON import
    const filePath = result.filePaths[0]
    if (filePath.endsWith('.json')) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const tokens = JSON.parse(content)
        const db = getDb()
        const themeId = uuidv4()
        const now = new Date().toISOString()
        const cssVars = generateCssVariables(tokens)
        const tailwind = generateTailwindTheme(tokens)
        const designDoc = generateDesignDoc(tokens)

        db.prepare(
          `INSERT INTO themes (id, name, tokens_json, css_variables, tailwind_theme, design_doc, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(themeId, `Imported theme`, JSON.stringify(tokens), cssVars, tailwind, designDoc, now, now)

        return { success: true, themeId }
      } catch (err: unknown) {
        return { error: true, message: err instanceof Error ? err.message : String(err) }
      }
    }

    return { success: false, message: 'ZIP import not yet implemented' }
  })

  // --- Settings ---
  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:save', (_event, settings: Record<string, unknown>) => {
    return saveSettings(settings as Parameters<typeof saveSettings>[0])
  })

  ipcMain.handle('settings:detectAgentClis', async () => {
    return detectAgentClis()
  })

  ipcMain.handle('settings:testApiKey', async (_event, _provider: string, _apiKey: string) => {
    // Phase 2: will use @x-code-cli/core to test
    return { success: false, message: 'API test not yet implemented' }
  })
}
