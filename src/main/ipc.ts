import { v4 as uuidv4 } from 'uuid'

import fs from 'node:fs'
import path from 'node:path'

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'

import {
  listManagedSessions,
  migrateLegacyManagedSessions,
  removeAllManagedSessions,
  removeManagedSession,
} from '../core/analyzer/browser-session.js'
import { clusterColors } from '../core/analyzer/color-cluster.js'
import {
  type AuthMode,
  AuthenticationCancelledError,
  AuthenticationRequiredError,
  type LoginDecision,
} from '../core/analyzer/index.js'
import { enhanceWithLlm } from '../core/analyzer/llm-enhancer.js'
import { buildDesignTokens } from '../core/analyzer/token-builder.js'
import {
  type DarkModeExportData,
  generateCssVariables,
  generateDesignDoc,
  generateDtcgJson,
  generateScssVariables,
  generateTailwindTheme,
} from '../core/export/index.js'
import { detectAgentClis } from './agent-detect.js'
import { enhanceWithAgentCli } from './agent-enhancer.js'
import { analyzeUrl } from './analyzer/index.js'
import { getDb } from './database.js'
import { getLogDir, log } from './logger.js'
import { submitLoginDecision, waitForLoginDecision } from './login-decision.js'
import { getSettings, saveSettings } from './settings.js'
import { normalizeImportedTokens, readImportedThemeMeta } from './theme-import.js'

export function registerIpcHandlers() {
  migrateLegacyManagedSessions(app.getPath('userData'))

  // --- Themes ---
  ipcMain.handle('themes:list', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM themes ORDER BY updated_at DESC').all()
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
        `SELECT a.*, t.name as theme_name, t.source_url
         FROM analyses a
         LEFT JOIN themes t ON a.theme_id = t.id
         WHERE a.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined
    if (!record) return null

    return {
      id: record.id,
      url: record.url,
      finalUrl: record.final_url,
      pagesAnalyzed: record.pages_analyzed,
      durationMs: record.duration_ms,
      createdAt: record.created_at,
      themeId: record.theme_id,
      themeName: record.theme_name,
      tokens: JSON.parse((record.tokens_json as string) || '{}'),
      cssVariables: record.css_variables || '',
      tailwindTheme: record.tailwind_theme || '',
      designDoc: record.design_doc || '',
      pageScreenshots: JSON.parse((record.page_screenshots_json as string) || '[]'),
      featureTags: JSON.parse((record.feature_tags_json as string) || '[]'),
      darkTokens: record.dark_tokens_json ? JSON.parse(record.dark_tokens_json as string) : null,
      hasDarkMode: record.has_dark_mode === 1,
      accessMode: record.access_mode,
      authWallDetected: record.auth_wall_detected === 1,
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
      },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      let analysisStage = 'progress.launchingBrowser'

      log.info(
        'analysis',
        `start: url=${url} viewports=${options?.viewports?.join(',') ?? 'default'} maxPages=${options?.maxPages ?? 'default'} authMode=${options?.authMode ?? 'auto'}`,
      )

      try {
        const result = await analyzeUrl(
          url,
          options,
          (step, percent) => {
            analysisStage = step
            win?.webContents.send('analysis:progress', { step, percent })
          },
          (request, signal) => waitForLoginDecision(win, request, signal),
        )

        // LLM semantic enhancement (optional, only if AI is configured)
        const settings = getSettings()
        const enhancedTokens = result.tokens
        let enhancement = null
        if (settings.aiMode === 'apiKey' && settings.provider && settings.apiKey) {
          analysisStage = 'progress.enhancingWithAi'
          win?.webContents.send('analysis:progress', { step: 'progress.enhancingWithAi', percent: 97 })
          enhancement = await enhanceWithLlm(result.tokens, url, {
            provider: settings.provider,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl || undefined,
          })
        } else if (settings.aiMode === 'agentCli' && settings.agentCli) {
          analysisStage = 'progress.enhancingWithAi'
          win?.webContents.send('analysis:progress', { step: 'progress.enhancingWithAi', percent: 97 })
          enhancement = await enhanceWithAgentCli(result.tokens, url, settings.agentCli)
        }

        if (enhancement) {
          for (const [oldName, newName] of Object.entries(enhancement.colorNames)) {
            if (enhancedTokens.colors[oldName]) {
              const value = enhancedTokens.colors[oldName]
              delete enhancedTokens.colors[oldName]
              enhancedTokens.colors[newName] = value
            }
          }
        }

        let darkModeExport: DarkModeExportData | undefined
        if (result.darkMode?.hasDarkMode && result.darkMode.darkStyles) {
          const darkClustered = clusterColors(result.darkMode.darkStyles.colors, result.darkMode.darkStyles.usageCount)
          const darkTokens = buildDesignTokens(result.darkMode.darkStyles, darkClustered)
          darkModeExport = {
            hasDarkMode: true,
            darkTokens,
            method: result.darkMode.method,
          }
        }

        const cssVars = generateCssVariables(enhancedTokens, darkModeExport, result.breakpoints)
        const tailwind = generateTailwindTheme(enhancedTokens, darkModeExport)
        const designDoc = generateDesignDoc(
          enhancedTokens,
          url,
          result.featureTags,
          darkModeExport,
          result.breakpoints,
          result.components,
          options?.language?.startsWith('zh') ? 'zh-CN' : 'en',
        )

        const db = getDb()
        const analysisId = uuidv4()
        const viewports = options?.viewports || ['desktop']
        const pagesAnalyzed = Math.max(1, new Set(result.pageScreenshots.map((screenshot) => screenshot.url)).size)
        db.prepare(
          `INSERT INTO analyses
           (id, theme_id, url, pages_analyzed, viewports, duration_ms, created_at,
            tokens_json, css_variables, tailwind_theme, design_doc, page_screenshots_json,
            feature_tags_json, dark_tokens_json, has_dark_mode, access_mode, auth_wall_detected, final_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          analysisId,
          null,
          url,
          pagesAnalyzed,
          JSON.stringify(viewports),
          result.duration,
          new Date().toISOString(),
          JSON.stringify(enhancedTokens),
          cssVars,
          tailwind,
          designDoc,
          JSON.stringify(result.pageScreenshots || []),
          JSON.stringify(result.featureTags || []),
          darkModeExport?.darkTokens?.colors ? JSON.stringify(darkModeExport.darkTokens.colors) : null,
          result.darkMode?.hasDarkMode ? 1 : 0,
          result.accessMode ?? null,
          result.authWallDetected ? 1 : 0,
          result.finalUrl ?? null,
        )

        log.info(
          'analysis',
          `done: url=${url} id=${analysisId} pages=${pagesAnalyzed} durationMs=${result.duration} darkMode=${result.darkMode?.hasDarkMode ? 'yes' : 'no'}`,
        )

        return {
          tokens: enhancedTokens,
          cssVariables: cssVars,
          tailwindTheme: tailwind,
          designDoc,
          screenshots: result.screenshots,
          pageScreenshots: result.pageScreenshots,
          duration: result.duration,
          url,
          hasDarkMode: result.darkMode?.hasDarkMode ?? false,
          darkModeMethod: result.darkMode?.method ?? 'none',
          featureTags: result.featureTags,
          darkTokens: darkModeExport?.darkTokens?.colors ?? null,
          breakpoints: result.breakpoints,
          accessMode: result.accessMode,
          authWallDetected: result.authWallDetected,
          finalUrl: result.finalUrl,
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

      db.prepare(`UPDATE analyses SET theme_id = ? WHERE url = ? AND theme_id IS NULL`).run(themeId, data.url)

      return { success: true, themeId }
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
    log.info('export', `file written: ${result.filePath}`)
    return { success: true, filePath: result.filePath }
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

  // --- Export ---
  ipcMain.handle('export:theme', async (_event, id: string, format: string) => {
    const db = getDb()
    const theme = db.prepare('SELECT * FROM themes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!theme) return { error: true, message: 'Theme not found' }

    let content: string
    let ext: string
    let filterName: string
    let defaultName: string

    switch (format) {
      case 'css':
        content = theme.css_variables as string
        ext = 'css'
        filterName = 'CSS Files'
        defaultName = 'theme-variables.css'
        break
      case 'tailwind':
        content = theme.tailwind_theme as string
        ext = 'css'
        filterName = 'CSS Files'
        defaultName = 'tailwind-theme.css'
        break
      case 'json':
        content = generateDtcgJson(JSON.parse(theme.tokens_json as string))
        ext = 'json'
        filterName = 'JSON Files'
        defaultName = 'design-tokens.json'
        break
      case 'scss':
        content = generateScssVariables(JSON.parse(theme.tokens_json as string))
        ext = 'scss'
        filterName = 'SCSS Files'
        defaultName = 'theme-variables.scss'
        break
      case 'markdown':
        content = theme.design_doc as string
        ext = 'md'
        filterName = 'Markdown Files'
        defaultName = 'DESIGN.md'
        break
      default:
        return { error: true, message: `Unknown format: ${format}` }
    }

    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [ext] }],
    })

    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    fs.writeFileSync(result.filePath, content, 'utf-8')
    log.info('export', `theme exported: id=${id} format=${format} path=${result.filePath}`)

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

  ipcMain.handle('import:theme', async (_event, language?: string) => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Theme Tokens JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const filePath = result.filePaths[0]
    if (filePath.endsWith('.json')) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const importedData = JSON.parse(content) as unknown
        const tokens = normalizeImportedTokens(importedData)
        const db = getDb()
        const themeId = uuidv4()
        const now = new Date().toISOString()
        const cssVars = generateCssVariables(tokens)
        const tailwind = generateTailwindTheme(tokens)
        const designDoc = generateDesignDoc(
          tokens,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          language?.startsWith('zh') ? 'zh-CN' : 'en',
        )
        const meta = readImportedThemeMeta(importedData)
        const themeName = typeof meta?.name === 'string' && meta.name.trim() ? meta.name : 'Imported theme'

        db.prepare(
          `INSERT INTO themes (id, name, tokens_json, css_variables, tailwind_theme, design_doc, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(themeId, themeName, JSON.stringify(tokens), cssVars, tailwind, designDoc, now, now)

        log.info('import', `theme imported: file=${filePath} name=${themeName} id=${themeId}`)
        return { success: true, themeId }
      } catch (err: unknown) {
        log.error(
          'import',
          `theme import failed: file=${filePath} error=${err instanceof Error ? err.message : String(err)}`,
        )
        return { error: true, message: err instanceof Error ? err.message : String(err) }
      }
    }

    return { success: false, message: 'Only theme token JSON is supported' }
  })

  // --- Settings ---
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
