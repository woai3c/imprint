import { v4 as uuidv4 } from 'uuid'

import fs from 'node:fs'

import { BrowserWindow, dialog, ipcMain } from 'electron'

import { clusterColors } from '../core/analyzer/color-cluster.js'
import { enhanceWithLlm } from '../core/analyzer/llm-enhancer.js'
import { buildDesignTokens } from '../core/analyzer/token-builder.js'
import type { DarkModeExportData } from '../core/export/index.js'
import { detectAgentClis } from './agent-detect.js'
import { analyzeUrl } from './analyzer/index.js'
import { getDb } from './database.js'
import {
  generateCssVariables,
  generateDesignDoc,
  generateDtcgJson,
  generateScssVariables,
  generateTailwindTheme,
} from './export.js'
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
  ipcMain.handle(
    'analyze:url',
    async (event, url: string, options?: { viewports?: string[]; useSession?: boolean }) => {
      const win = BrowserWindow.fromWebContents(event.sender)

      try {
        const result = await analyzeUrl(url, options, (step, percent) => {
          win?.webContents.send('analysis:progress', { step, percent })
        })

        // LLM semantic enhancement (optional, only if AI is configured)
        const settings = getSettings()
        const enhancedTokens = result.tokens
        if (settings.aiMode === 'apiKey' && settings.provider && settings.apiKey) {
          win?.webContents.send('analysis:progress', { step: 'progress.enhancingWithAi', percent: 97 })
          const enhancement = await enhanceWithLlm(result.tokens, url, {
            provider: settings.provider,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl || undefined,
          })
          if (enhancement) {
            for (const [oldName, newName] of Object.entries(enhancement.colorNames)) {
              if (enhancedTokens.colors[oldName]) {
                const value = enhancedTokens.colors[oldName]
                delete enhancedTokens.colors[oldName]
                enhancedTokens.colors[newName] = value
              }
            }
          }
        }

        let darkModeExport: DarkModeExportData | undefined
        if (result.darkMode?.hasDarkMode && result.darkMode.darkStyles) {
          const darkClustered = clusterColors(result.darkMode.darkStyles.colors)
          const darkTokens = buildDesignTokens(result.darkMode.darkStyles, darkClustered)
          darkModeExport = {
            hasDarkMode: true,
            darkTokens,
            method: result.darkMode.method,
          }
        }

        const cssVars = generateCssVariables(enhancedTokens, darkModeExport)
        const tailwind = generateTailwindTheme(enhancedTokens, darkModeExport)
        const designDoc = generateDesignDoc(enhancedTokens, url, result.featureTags, darkModeExport)

        return {
          tokens: enhancedTokens,
          cssVariables: cssVars,
          tailwindTheme: tailwind,
          designDoc,
          screenshots: result.screenshots,
          duration: result.duration,
          url,
          hasDarkMode: result.darkMode?.hasDarkMode ?? false,
          darkModeMethod: result.darkMode?.method ?? 'none',
          featureTags: result.featureTags,
          darkTokens: darkModeExport?.darkTokens?.colors ?? null,
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return { error: true, message }
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
        `INSERT INTO themes (id, name, source_url, screenshot_path, tokens_json, css_variables, tailwind_theme, design_doc, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        themeId,
        `Theme from ${hostname}`,
        data.url,
        data.screenshots[0] || null,
        JSON.stringify(data.tokens),
        data.cssVariables,
        data.tailwindTheme,
        data.designDoc,
        now,
        now,
      )

      const analysisId = uuidv4()
      db.prepare(
        `INSERT INTO analyses (id, theme_id, url, viewports, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(analysisId, themeId, data.url, '["desktop"]', 0, now)

      return { success: true, themeId, analysisId }
    },
  )

  // --- Export file directly (from analysis result, not saved theme) ---
  ipcMain.handle('export:file', async (_event, content: string, defaultName: string, ext: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: `${ext.toUpperCase()} Files`, extensions: [ext] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    fs.writeFileSync(result.filePath, content, 'utf-8')
    return { success: true, filePath: result.filePath }
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
      case 'scss':
        content = generateScssVariables(JSON.parse(theme.tokens_json as string))
        ext = 'scss'
        filterName = 'SCSS Files'
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

    return { success: false, message: 'Only JSON format is currently supported' }
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

  ipcMain.handle('settings:testApiKey', async (_event, provider: string, apiKey: string) => {
    const baseUrls: Record<string, string> = {
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com/v1',
      deepseek: 'https://api.deepseek.com/v1',
      moonshotai: 'https://api.moonshot.cn/v1',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4',
      alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      google: 'https://generativelanguage.googleapis.com/v1beta',
      xai: 'https://api.x.ai/v1',
      custom: '',
    }

    const baseUrl = baseUrls[provider] || baseUrls['openai']
    if (!baseUrl) {
      return { success: false, message: 'Custom provider requires a base URL' }
    }

    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
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
