import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

export type LogLevel = 'info' | 'warn' | 'error'

const MAX_LOG_BYTES = 5 * 1024 * 1024

let logFilePath: string | null = null

// File logging must never crash the app — every write is best-effort.
export function initLogger(): string {
  const logsDir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  logFilePath = path.join(logsDir, 'imprint.log')

  try {
    const stats = fs.statSync(logFilePath)
    if (stats.size > MAX_LOG_BYTES) {
      fs.renameSync(logFilePath, path.join(logsDir, 'imprint.old.log'))
    }
  } catch {
    // No existing log to rotate
  }

  process.on('uncaughtException', (error) => {
    write('error', 'process', `uncaughtException: ${formatError(error)}`)
  })
  process.on('unhandledRejection', (reason) => {
    write('error', 'process', `unhandledRejection: ${formatError(reason)}`)
  })

  log.info('app', `logger initialized at ${logFilePath}`)
  return logFilePath
}

export function getLogDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.message}\n${error.stack ?? ''}`.trim()
  return String(error)
}

function write(level: LogLevel, scope: string, message: string) {
  if (!logFilePath) return
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${message}\n`
  try {
    fs.appendFileSync(logFilePath, line)
  } catch {
    // Disk full or locked file — swallow
  }
}

export const log = {
  info: (scope: string, message: string) => write('info', scope, message),
  warn: (scope: string, message: string) => write('warn', scope, message),
  error: (scope: string, message: string) => write('error', scope, message),
}
