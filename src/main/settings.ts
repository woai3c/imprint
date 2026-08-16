import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import { type AppSettings, THEME_EXPORT_FORMATS } from '../shared/ipc-contract.js'

const defaults: AppSettings = {
  analysisDepth: 'standard',
  exportFormat: 'markdown',
  proxyServer: '',
  language: '',
  colorMode: '',
  themePreference: '',
  validationScenario: '',
  analysisPageCount: 3,
}

function isExportFormat(value: unknown): value is AppSettings['exportFormat'] {
  return THEME_EXPORT_FORMATS.includes(value as AppSettings['exportFormat'])
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function normalizeSettings(value: unknown): AppSettings {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<AppSettings>) : {}
  return {
    analysisDepth: saved.analysisDepth === 'deep' ? 'deep' : 'standard',
    exportFormat: isExportFormat(saved.exportFormat) ? saved.exportFormat : defaults.exportFormat,
    proxyServer: typeof saved.proxyServer === 'string' ? saved.proxyServer : '',
    language: typeof saved.language === 'string' ? saved.language : '',
    colorMode: typeof saved.colorMode === 'string' ? saved.colorMode : '',
    themePreference: typeof saved.themePreference === 'string' ? saved.themePreference : '',
    validationScenario: typeof saved.validationScenario === 'string' ? saved.validationScenario : '',
    analysisPageCount: Math.min(5, Math.max(1, Math.floor(Number(saved.analysisPageCount) || 3))),
  }
}

function readFromDisk(): AppSettings {
  try {
    const saved = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8')) as unknown
    const settings = normalizeSettings(saved)
    if (JSON.stringify(saved) !== JSON.stringify(settings)) {
      try {
        writeToDisk(settings)
      } catch {
        // Read-only settings still normalize in memory when the file cannot be updated.
      }
    }
    return settings
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
  const settings = normalizeSettings({ ...readFromDisk(), ...update })
  writeToDisk(settings)
  return settings
}
