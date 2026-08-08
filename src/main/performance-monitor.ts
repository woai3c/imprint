import { performance } from 'node:perf_hooks'

import { BrowserWindow, app, screen } from 'electron'

import { log } from './logger.js'

const EVENT_LOOP_SAMPLE_MS = 1_000
const REPORT_INTERVAL_MS = 30_000

let activeWindow: BrowserWindow | null = null
let monitorStarted = false
let gpuDiagnosticsStarted = false

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function formatProcessMetrics(): string {
  const metrics = app.getAppMetrics()
  const totalCpu = metrics.reduce((sum, metric) => sum + metric.cpu.percentCPUUsage, 0)
  const totalWorkingSetMb = metrics.reduce((sum, metric) => sum + metric.memory.workingSetSize, 0) / 1024
  const processes = metrics
    .map((metric) => {
      const label = metric.name ? `${metric.type}/${metric.name.replace(/\s+/g, '-')}` : metric.type
      return `${label}:${round(metric.cpu.percentCPUUsage)}%/${round(metric.memory.workingSetSize / 1024)}MB`
    })
    .join(',')

  return `cpu=${round(totalCpu)}% workingSet=${round(totalWorkingSetMb)}MB processes=${processes}`
}

function logGpuDiagnostics() {
  if (gpuDiagnosticsStarted) return
  gpuDiagnosticsStarted = true

  const featureStatus = app.getGPUFeatureStatus()
  log.info('performance', `gpu features=${JSON.stringify(featureStatus)}`)
  void app
    .getGPUInfo('basic')
    .then((gpuInfo) => {
      const compactInfo = JSON.stringify(gpuInfo)
        .replace(/[\r\n\t]/g, ' ')
        .slice(0, 2_000)
      log.info('performance', `gpu info=${compactInfo}`)
    })
    .catch((error) => {
      log.warn('performance', `gpu info unavailable: ${error instanceof Error ? error.message : String(error)}`)
    })
}

function startMainProcessSampler() {
  if (monitorStarted) return
  monitorStarted = true

  // Warm Chromium's counters so subsequent CPU percentages cover one report window.
  app.getAppMetrics()
  let expectedTickAt = performance.now() + EVENT_LOOP_SAMPLE_MS
  let reportStartedAt = performance.now()
  let maxEventLoopLagMs = 0

  const timer = setInterval(() => {
    const now = performance.now()
    maxEventLoopLagMs = Math.max(maxEventLoopLagMs, Math.max(0, now - expectedTickAt))
    expectedTickAt = now + EVENT_LOOP_SAMPLE_MS

    if (now - reportStartedAt < REPORT_INTERVAL_MS) return

    const window = activeWindow
    if (window && !window.isDestroyed() && window.isVisible()) {
      log.info(
        'performance',
        `main windowMs=${Math.round(now - reportStartedAt)} maxEventLoopLagMs=${round(maxEventLoopLagMs)} ${formatProcessMetrics()}`,
      )
    } else {
      // Refresh CPU counters while hidden without growing the log in the tray.
      app.getAppMetrics()
    }

    reportStartedAt = now
    maxEventLoopLagMs = 0
  }, EVENT_LOOP_SAMPLE_MS)
  timer.unref()

  log.info(
    'performance',
    `monitor started rendererIntervalMs=15000 mainIntervalMs=${REPORT_INTERVAL_MS} eventLoopSampleMs=${EVENT_LOOP_SAMPLE_MS}`,
  )
}

export function monitorWindowPerformance(window: BrowserWindow, createdAt: number) {
  activeWindow = window
  startMainProcessSampler()

  window.webContents.on('did-finish-load', () => {
    const display = screen.getDisplayMatching(window.getBounds())
    log.info(
      'performance',
      `window loaded durationMs=${Math.round(performance.now() - createdAt)} displayHz=${display.displayFrequency} scaleFactor=${display.scaleFactor} size=${display.size.width}x${display.size.height}`,
    )
  })
  window.on('unresponsive', () => log.warn('performance', 'window unresponsive'))
  window.on('responsive', () => log.info('performance', 'window responsive'))
  window.webContents.on('render-process-gone', (_event, details) => {
    log.error('performance', `renderer gone reason=${details.reason} exitCode=${details.exitCode}`)
  })
  window.once('closed', () => {
    if (activeWindow === window) activeWindow = null
  })

  app.once('gpu-info-update', logGpuDiagnostics)
  const gpuFallbackTimer = setTimeout(logGpuDiagnostics, 5_000)
  gpuFallbackTimer.unref()
}
