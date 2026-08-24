import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import type { AppSettings } from '../shared/ipc-contract.js'

const defaults: AppSettings = {
  analysisDepth: 'standard',
  proxyServer: '',
  language: '',
  colorMode: '',
  themePreference: '',
  validationScenario: '',
  analysisPageCount: 8,
}

function normalizeAnalysisPageCount(value: unknown): number {
  const pageCount = Number(value)
  return Number.isSafeInteger(pageCount) && pageCount >= 1 ? pageCount : 8
}

function normalizeLanguage(value: unknown): AppSettings['language'] {
  return value === 'en' || value === 'zh-CN' ? value : ''
}

function detectSystemLanguage(): AppSettings['language'] {
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function normalizeSettings(value: unknown): AppSettings {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<AppSettings>) : {}
  return {
    analysisDepth: saved.analysisDepth === 'deep' ? 'deep' : 'standard',
    proxyServer: typeof saved.proxyServer === 'string' ? saved.proxyServer : '',
    language: normalizeLanguage(saved.language),
    colorMode: typeof saved.colorMode === 'string' ? saved.colorMode : '',
    themePreference: typeof saved.themePreference === 'string' ? saved.themePreference : '',
    validationScenario: typeof saved.validationScenario === 'string' ? saved.validationScenario : '',
    analysisPageCount: normalizeAnalysisPageCount(saved.analysisPageCount),
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
  const settings = readFromDisk()
  if (settings.language) return settings

  const initialized = { ...settings, language: detectSystemLanguage() }
  try {
    writeToDisk(initialized)
  } catch {
    // A read-only profile can still use the detected language for this session.
  }
  return initialized
}

export function saveSettings(update: Partial<AppSettings>): AppSettings {
  const settings = normalizeSettings({ ...getSettings(), ...update })
  writeToDisk(settings)
  return settings
}
