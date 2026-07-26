import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

export interface AppSettings {
  aiMode: 'apiKey' | 'agentCli'
  provider: string
  apiKey: string
  baseUrl: string
  agentCli: string
  exportFormat: 'markdown' | 'css' | 'tailwind' | 'json'
}

const defaults: AppSettings = {
  aiMode: 'apiKey',
  provider: '',
  apiKey: '',
  baseUrl: '',
  agentCli: '',
  exportFormat: 'markdown',
}

const exportFormats: AppSettings['exportFormat'][] = ['markdown', 'css', 'tailwind', 'json']

function isExportFormat(value: unknown): value is AppSettings['exportFormat'] {
  return exportFormats.includes(value as AppSettings['exportFormat'])
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
  writeToDisk(merged)
  return merged
}

export function clearSettings(): void {
  writeToDisk({ ...defaults })
}
