import { DEFAULT_ANALYSIS_PAGE_COUNT, MAX_ANALYSIS_PAGE_COUNT } from '../../core/analyzer/analysis-request.js'
import type { AppSettings } from '../../shared/ipc-contract'
import { VALIDATION_SCENARIO_IDS } from './validation-scenarios'

export type AppLanguage = 'en' | 'zh-CN'

export interface ThemePreference {
  kind: 'builtin'
  id: string
}

const settingsCache: Record<string, unknown> = {
  ...(window.electronAPI?.initialSettings as unknown as Record<string, unknown>),
}

function readCached(key: string): unknown {
  return settingsCache[key] ?? null
}

function writeSetting(update: Partial<AppSettings>): void {
  Object.assign(settingsCache, update)
  window.electronAPI?.saveSettings(update).catch(() => {})
}

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export function getLanguagePreference(fallbackLanguage: string): AppLanguage {
  const stored = readCached('language') as string | null
  if (stored === 'en' || stored === 'zh-CN') return stored
  const detected = normalizeLanguage(fallbackLanguage)
  writeSetting({ language: detected })
  return detected
}

export function setLanguagePreference(language: string): void {
  const normalized = normalizeLanguage(language)
  writeSetting({ language: normalized })
}

export function getAnalysisPageCountPreference(): number {
  const stored = Number(readCached('analysisPageCount'))
  if (!Number.isSafeInteger(stored) || stored < 1) return DEFAULT_ANALYSIS_PAGE_COUNT
  return Math.min(stored, MAX_ANALYSIS_PAGE_COUNT)
}

export function setAnalysisPageCountPreference(pageCount: number): number {
  const normalized =
    Number.isSafeInteger(pageCount) && pageCount >= 1
      ? Math.min(pageCount, MAX_ANALYSIS_PAGE_COUNT)
      : DEFAULT_ANALYSIS_PAGE_COUNT
  writeSetting({ analysisPageCount: normalized })
  return normalized
}

export function getThemePreference(): ThemePreference | null {
  const stored = readCached('themePreference') as string | null
  if (!stored) return null

  try {
    const preference = JSON.parse(stored) as Partial<ThemePreference>
    if (preference.kind === 'builtin' && typeof preference.id === 'string') {
      return { kind: 'builtin', id: preference.id }
    }
  } catch {
    // Invalid preferences fall back to the default theme.
  }

  writeSetting({ themePreference: '' })
  return null
}

export function setThemePreference(preference: ThemePreference): void {
  writeSetting({ themePreference: JSON.stringify(preference) })
}

const validationScenarios = new Set<string>(VALIDATION_SCENARIO_IDS)

export function getValidationScenarioPreference(): string {
  const stored = readCached('validationScenario') as string | null
  return stored && validationScenarios.has(stored) ? stored : 'dashboard'
}

export function setValidationScenarioPreference(scenario: string): void {
  if (validationScenarios.has(scenario)) writeSetting({ validationScenario: scenario })
}

export function getColorModePreference(): string {
  return (readCached('colorMode') as string) || ''
}

export function setColorModePreference(mode: string): void {
  writeSetting({ colorMode: mode })
}
