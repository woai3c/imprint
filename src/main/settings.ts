import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import { type AppSettings, THEME_EXPORT_FORMATS } from '../shared/ipc-contract.js'

const defaults: AppSettings = {
  aiEnabled: true,
  aiMode: 'apiKey',
  provider: '',
  apiKey: '',
  baseUrl: '',
  model: '',
  modelSupportsVision: false,
  visionAnalysisConsent: true,
  managedVisionConsent: true,
  analysisDepth: 'standard',
  agentCli: '',
  exportFormat: 'markdown',
  proxyServer: '',
  reasoningEffort: '',
  thinkingEnabled: false,
  language: '',
  colorMode: '',
  themePreference: '',
  analysisPageCount: 3,
  noAiTipDismissed: false,
}

function isExportFormat(value: unknown): value is AppSettings['exportFormat'] {
  return THEME_EXPORT_FORMATS.includes(value as AppSettings['exportFormat'])
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readFromDisk(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8')
    const saved = JSON.parse(raw) as Partial<AppSettings> & { exportFormat?: unknown }
    return {
      ...defaults,
      ...saved,
      aiEnabled: saved.aiEnabled !== false,
      modelSupportsVision: saved.modelSupportsVision === true,
      visionAnalysisConsent: true,
      managedVisionConsent: saved.managedVisionConsent !== false,
      thinkingEnabled: saved.thinkingEnabled === true,
      noAiTipDismissed: saved.noAiTipDismissed === true,
      analysisDepth: saved.analysisDepth === 'deep' ? 'deep' : 'standard',
      analysisPageCount: Math.min(5, Math.max(1, Math.floor(Number(saved.analysisPageCount) || 3))),
      exportFormat: isExportFormat(saved.exportFormat) ? saved.exportFormat : defaults.exportFormat,
    }
  } catch {
    return { ...defaults }
  }
}

function writeToDisk(settings: AppSettings): void {
  const dir = path.dirname(getSettingsPath())
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export function getSettings(): AppSettings {
  return readFromDisk()
}

export function saveSettings(update: Partial<AppSettings>): AppSettings {
  const current = readFromDisk()
  const merged = { ...current, ...update }
  if (!isExportFormat(merged.exportFormat)) merged.exportFormat = defaults.exportFormat
  merged.aiEnabled = merged.aiEnabled !== false
  merged.modelSupportsVision = merged.modelSupportsVision === true
  merged.visionAnalysisConsent = true
  merged.managedVisionConsent = merged.managedVisionConsent !== false
  merged.thinkingEnabled = merged.thinkingEnabled === true
  merged.noAiTipDismissed = merged.noAiTipDismissed === true
  merged.analysisPageCount = Math.min(5, Math.max(1, Math.floor(Number(merged.analysisPageCount) || 3)))
  merged.analysisDepth = merged.analysisDepth === 'deep' ? 'deep' : 'standard'
  writeToDisk(merged)
  return merged
}
