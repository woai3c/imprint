import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import { type AppSettings, THEME_EXPORT_FORMATS } from '../shared/ipc-contract.js'

const defaults: AppSettings = {
  aiEnabled: true,
  aiMode: 'apiKey',
  provider: '',
  apiKeys: {},
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

function normalizeApiKeys(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1]),
    ),
  )
}

function readFromDisk(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8')
    const saved = JSON.parse(raw) as Partial<AppSettings> & {
      apiKey?: unknown
      apiKeys?: unknown
      exportFormat?: unknown
    }
    const { apiKey: legacyApiKey, apiKeys: savedApiKeys, ...savedSettings } = saved
    const apiKeys = normalizeApiKeys(savedApiKeys)
    if (saved.provider && typeof legacyApiKey === 'string' && legacyApiKey && !apiKeys[saved.provider]) {
      apiKeys[saved.provider] = legacyApiKey
    }
    return {
      ...defaults,
      ...savedSettings,
      apiKeys,
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
    return { ...defaults, apiKeys: {} }
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
  const apiKeys = { ...current.apiKeys }
  for (const [provider, apiKey] of Object.entries(normalizeApiKeys(update.apiKeys))) apiKeys[provider] = apiKey
  if (update.apiKeys) {
    for (const [provider, apiKey] of Object.entries(update.apiKeys)) {
      if (apiKey === '') delete apiKeys[provider]
    }
  }
  const merged = { ...current, ...update, apiKeys }
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
