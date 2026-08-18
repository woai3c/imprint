import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import { redactUrlsInText } from '../core/analyzer/url-privacy.js'

export type LogLevel = 'info' | 'warn' | 'error'

const MAX_LOG_BYTES = 5 * 1024 * 1024
const MAX_BUFFERED_BYTES = 512 * 1024
const FLUSH_DELAY_MS = 250

let logFilePath: string | null = null
let pendingLines: string[] = []
let queuedBytes = 0
let flushTimer: NodeJS.Timeout | null = null
let writing = false
let droppedLines = 0

// File logging must never crash the app — every write is best-effort.
export function initLogger(): string {
  const logsDir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  logFilePath = path.join(logsDir, 'imprint.log')
  const oldLogFilePath = path.join(logsDir, 'imprint.old.log')

  try {
    const stats = fs.statSync(logFilePath)
    if (stats.size > MAX_LOG_BYTES) {
      fs.renameSync(logFilePath, oldLogFilePath)
    }
  } catch {
    // No existing log to rotate
  }
  sanitizeExistingLogFile(logFilePath)
  sanitizeExistingLogFile(oldLogFilePath)

  process.on('uncaughtException', (error) => {
    write('error', 'process', `uncaughtException: ${formatError(error)}`)
  })
  process.on('unhandledRejection', (reason) => {
    write('error', 'process', `unhandledRejection: ${formatError(reason)}`)
  })

  log.info('app', `logger initialized at ${logFilePath}`)
  return logFilePath
}

function sanitizeExistingLogFile(filePath: string): void {
  try {
    const current = fs.readFileSync(filePath, 'utf8')
    const sanitized = redactUrlsInText(current)
    if (current !== sanitized) fs.writeFileSync(filePath, sanitized, { encoding: 'utf8', mode: 0o600 })
  } catch {
    // Missing or unreadable legacy logs do not prevent startup.
  }
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
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${redactUrlsInText(message)}\n`
  const lineBytes = Buffer.byteLength(line)
  if (queuedBytes + lineBytes > MAX_BUFFERED_BYTES) {
    droppedLines += 1
    return
  }

  pendingLines.push(line)
  queuedBytes += lineBytes
  scheduleFlush()
}

function scheduleFlush(delay = FLUSH_DELAY_MS) {
  if (flushTimer || writing) return
  flushTimer = setTimeout(flush, delay)
  flushTimer.unref()
}

function flush() {
  flushTimer = null
  if (!logFilePath || writing || pendingLines.length === 0) return

  if (droppedLines > 0) {
    const warning = `${new Date().toISOString()} [WARN] [logger] dropped ${droppedLines} lines due to backpressure\n`
    pendingLines.push(warning)
    queuedBytes += Buffer.byteLength(warning)
    droppedLines = 0
  }

  const output = pendingLines.join('')
  const outputBytes = Buffer.byteLength(output)
  pendingLines = []
  writing = true

  fs.appendFile(logFilePath, output, () => {
    queuedBytes = Math.max(0, queuedBytes - outputBytes)
    writing = false
    if (pendingLines.length > 0) scheduleFlush(0)
  })
}

export const log = {
  info: (scope: string, message: string) => write('info', scope, message),
  warn: (scope: string, message: string) => write('warn', scope, message),
  error: (scope: string, message: string) => write('error', scope, message),
}
