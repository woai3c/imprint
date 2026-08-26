import fs from 'node:fs'
import path from 'node:path'
import { finished } from 'node:stream/promises'

import { app, dialog, ipcMain, shell } from 'electron'

import {
  listManagedSessions,
  migrateLegacyManagedSessions,
  removeAllManagedSessions,
  removeManagedSession,
} from '../core/analyzer/browser-session.js'
import type { AppSettings } from '../shared/ipc-contract.js'
import { clearGeneratedAssetDirectories } from './analysis-assets.js'
import { getDb } from './database.js'
import { saveTextFile } from './file-export.js'
import { getLogDir, log } from './logger.js'
import { formatRendererPerformanceSample } from './renderer-performance-sample.js'
import { getSettings, saveSettings } from './settings.js'

async function writeStreamChunk(stream: fs.WriteStream, chunk: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolve()))
  })
}

async function writeLocalDataArchive(filePath: string): Promise<void> {
  const database = getDb()
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' })
  const streamCompletion = finished(stream).then(
    () => null,
    (error: unknown) => error,
  )
  const readTheme = database.prepare('SELECT * FROM themes WHERE id = ?')
  const readAnalysis = database.prepare('SELECT * FROM analyses WHERE id = ?')
  const writeRows = async (
    ids: Array<{ id: string }>,
    read: (id: string) => Record<string, unknown> | undefined,
  ): Promise<void> => {
    let first = true
    for (const { id } of ids) {
      const row = read(id)
      if (!row) continue
      await writeStreamChunk(stream, `${first ? '' : ','}${JSON.stringify(row)}`)
      first = false
    }
  }

  try {
    await writeStreamChunk(stream, '{"themes":[')
    await writeRows(
      database.prepare('SELECT id FROM themes WHERE is_builtin = 0 ORDER BY updated_at DESC').all() as Array<{
        id: string
      }>,
      (id) => readTheme.get(id) as Record<string, unknown> | undefined,
    )
    await writeStreamChunk(stream, '],"analyses":[')
    await writeRows(
      database.prepare('SELECT id FROM analyses ORDER BY created_at DESC').all() as Array<{ id: string }>,
      (id) => readAnalysis.get(id) as Record<string, unknown> | undefined,
    )
    await writeStreamChunk(stream, `],"settings":${JSON.stringify(getSettings())}}`)
    stream.end()
    const streamError = await streamCompletion
    if (streamError) throw streamError
  } catch (error) {
    stream.destroy()
    await streamCompletion
    await fs.promises.rm(filePath, { force: true }).catch(() => {})
    throw error
  }
}

export function registerSystemIpcHandlers(): void {
  migrateLegacyManagedSessions(app.getPath('userData'))

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

  ipcMain.on('settings:getSync', (event) => {
    event.returnValue = getSettings()
  })

  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:save', (_event, settings: Partial<AppSettings>) => {
    // Never log values from user-specific configuration.
    log.info('settings', `saved: ${Object.keys(settings).join(', ')}`)
    return saveSettings(settings)
  })

  ipcMain.handle('data:exportAll', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: `imprint-local-data-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    await writeLocalDataArchive(result.filePath)
    log.info('data', `local archive written: ${result.filePath}`)
    return { success: true, filePath: result.filePath }
  })

  ipcMain.handle('data:clearAll', async () => {
    const database = getDb()
    database.transaction(() => {
      database.prepare('DELETE FROM analyses').run()
      database.prepare('DELETE FROM themes WHERE is_builtin = 0').run()
    })()
    database.pragma('wal_checkpoint(TRUNCATE)')
    database.exec('VACUUM')
    await clearGeneratedAssetDirectories(app.getPath('userData'))
    log.info('data', 'cleared local analyses, saved website themes, and generated screenshot assets')
    return { success: true }
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
}
