import { v4 as uuidv4 } from 'uuid'

import fs from 'node:fs'

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
  type LoginRequest,
} from '../core/analyzer/index.js'
import { enhanceWithLlm } from '../core/analyzer/llm-enhancer.js'
import { buildDesignTokens } from '../core/analyzer/token-builder.js'
import type { DarkModeExportData } from '../core/export/index.js'
import { detectAgentClis } from './agent-detect.js'
import { analyzeUrl } from './analyzer/index.js'
import { getDb } from './database.js'
import type { DesignToken } from './export.js'
import {
  generateCssVariables,
  generateDesignDoc,
  generateDtcgJson,
  generateScssVariables,
  generateTailwindTheme,
} from './export.js'
import { getSettings, saveSettings } from './settings.js'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readDtcgValues(value: unknown): string[] {
  if (!isRecord(value)) return []

  return Object.values(value)
    .map((item) => (isRecord(item) ? item.$value : undefined))
    .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
    .map(String)
}

interface PendingLoginDecision {
  requestId: string
  senderId: number
  settle: (decision: LoginDecision) => void
}

let pendingLoginDecision: PendingLoginDecision | null = null

function waitForLoginDecision(
  win: BrowserWindow | null,
  request: LoginRequest,
  signal: AbortSignal,
): Promise<LoginDecision> {
  if (!win || win.isDestroyed()) return Promise.resolve('cancel')

  pendingLoginDecision?.settle('cancel')

  return new Promise((resolve) => {
    const requestId = uuidv4()
    let settled = false

    const settle = (decision: LoginDecision) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', handleAbort)
      win.webContents.removeListener('destroyed', handleDestroyed)
      if (pendingLoginDecision?.requestId === requestId) pendingLoginDecision = null
      resolve(decision)
    }
    const handleAbort = () => settle('cancel')
    const handleDestroyed = () => settle('cancel')

    pendingLoginDecision = {
      requestId,
      senderId: win.webContents.id,
      settle,
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    win.webContents.once('destroyed', handleDestroyed)
    win.webContents.send('analysis:loginRequired', {
      requestId,
      detection: request.detection,
      retry: request.retry,
    })
  })
}

function normalizeImportedTokens(value: unknown): DesignToken {
  if (!isRecord(value)) throw new Error('The selected file is not a theme token JSON object')

  if (isRecord(value.colors) && isRecord(value.typography)) {
    const colors = Object.fromEntries(
      Object.entries(value.colors).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
    const typography = value.typography
    if (Object.keys(colors).length === 0) throw new Error('The theme does not contain usable color tokens')

    return {
      colors,
      typography: {
        fontFamilies: asStringArray(typography.fontFamilies),
        fontStacks: asStringArray(typography.fontStacks),
        fontSizes: asStringArray(typography.fontSizes),
        fontWeights: asStringArray(typography.fontWeights),
        lineHeights: asStringArray(typography.lineHeights),
        letterSpacings: asStringArray(typography.letterSpacings),
      },
      spacing: asStringArray(value.spacing),
      radii: asStringArray(value.radii),
      shadows: asStringArray(value.shadows),
      borders: asStringArray(value.borders),
      zIndices: asStringArray(value.zIndices),
      transitions: asStringArray(value.transitions),
      usageCount: isRecord(value.usageCount)
        ? Object.fromEntries(
            Object.entries(value.usageCount).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
          )
        : {},
    }
  }

  if (isRecord(value.color) && isRecord(value.typography)) {
    const colors = Object.fromEntries(
      Object.entries(value.color)
        .map(([name, token]) => [name, isRecord(token) ? token.$value : undefined])
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
    if (Object.keys(colors).length === 0) throw new Error('The theme does not contain usable color tokens')

    return {
      colors,
      typography: {
        fontFamilies: asStringArray(
          isRecord(value.typography.fontFamilies) ? value.typography.fontFamilies.$value : [],
        ),
        fontStacks: asStringArray(isRecord(value.typography.fontStacks) ? value.typography.fontStacks.$value : []),
        fontSizes: asStringArray(isRecord(value.typography.fontSizes) ? value.typography.fontSizes.$value : []),
        fontWeights: [],
        lineHeights: [],
        letterSpacings: asStringArray(
          isRecord(value.typography.letterSpacing) ? value.typography.letterSpacing.$value : [],
        ),
      },
      spacing: readDtcgValues(value.spacing),
      radii: readDtcgValues(value.borderRadius),
      shadows: readDtcgValues(value.shadow),
      borders: [],
      zIndices: readDtcgValues(value.zIndex),
      transitions: readDtcgValues(value.transition),
      usageCount: {},
    }
  }

  throw new Error('The selected JSON does not contain Imprint or DTCG theme tokens')
}

export function registerIpcHandlers() {
  migrateLegacyManagedSessions(app.getPath('userData'))

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
      const pending = pendingLoginDecision
      if (
        !pending ||
        pending.requestId !== requestId ||
        pending.senderId !== event.sender.id ||
        (decision !== 'continue' && decision !== 'anonymous' && decision !== 'cancel')
      ) {
        return { success: false }
      }

      pending.settle(decision)
      return { success: true }
    },
  )

  ipcMain.handle(
    'analyze:url',
    async (
      event,
      url: string,
      options?: { viewports?: string[]; maxPages?: number; useSession?: boolean; authMode?: AuthMode },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      let analysisStage = 'progress.launchingBrowser'

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
        if (settings.aiMode === 'apiKey' && settings.provider && settings.apiKey) {
          analysisStage = 'progress.enhancingWithAi'
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

        const cssVars = generateCssVariables(enhancedTokens, darkModeExport, result.breakpoints)
        const tailwind = generateTailwindTheme(enhancedTokens, darkModeExport)
        const designDoc = generateDesignDoc(enhancedTokens, url, result.featureTags, darkModeExport, result.breakpoints)

        const db = getDb()
        const analysisId = uuidv4()
        const viewports = options?.viewports || ['desktop']
        const pagesAnalyzed = Math.max(1, new Set(result.pageScreenshots.map((screenshot) => screenshot.url)).size)
        db.prepare(
          `INSERT INTO analyses
           (id, theme_id, url, pages_analyzed, viewports, duration_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          analysisId,
          null,
          url,
          pagesAnalyzed,
          JSON.stringify(viewports),
          result.duration,
          new Date().toISOString(),
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
          return {
            authRequired: true,
            detection: err.detection,
          }
        }
        if (err instanceof AuthenticationCancelledError) {
          return { cancelled: true }
        }
        const message = err instanceof Error ? err.message : String(err)
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
        const designDoc = generateDesignDoc(tokens)
        const meta = isRecord(importedData) && isRecord(importedData.meta) ? importedData.meta : undefined
        const themeName = typeof meta?.name === 'string' && meta.name.trim() ? meta.name : 'Imported theme'

        db.prepare(
          `INSERT INTO themes (id, name, tokens_json, css_variables, tailwind_theme, design_doc, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(themeId, themeName, JSON.stringify(tokens), cssVars, tailwind, designDoc, now, now)

        return { success: true, themeId }
      } catch (err: unknown) {
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
