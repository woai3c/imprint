import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

export interface AppSettings {
  aiMode: 'apiKey' | 'agentCli'
  provider: string
  apiKey: string
  agentCli: string
  exportFormat: 'css' | 'tailwind' | 'both' | 'json' | 'markdown' | 'all'
}

const defaults: AppSettings = {
  aiMode: 'apiKey',
  provider: '',
  apiKey: '',
  agentCli: '',
  exportFormat: 'css',
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readFromDisk(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8')
    return { ...defaults, ...JSON.parse(raw) }
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
  writeToDisk(merged)
  return merged
}

export function clearSettings(): void {
  writeToDisk({ ...defaults })
}
