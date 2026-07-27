export type AppLanguage = 'en' | 'zh-CN'

export interface ThemePreference {
  kind: 'builtin' | 'custom'
  id?: string
  css?: string
}

const keys = {
  language: 'imprint.language',
  analysisPageCount: 'imprint.analysis.maxPages',
  theme: 'imprint.appearance.theme',
  validationScenario: 'imprint.validation.scenario',
  noAiTipDismissed: 'imprint.notice.noAiTipDismissed',
} as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Preferences should never block the primary workflow when storage is unavailable.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Preferences should never block the primary workflow when storage is unavailable.
  }
}

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export function getLanguagePreference(fallbackLanguage: string): AppLanguage {
  const stored = read(keys.language) || read('language')
  if (stored === 'en' || stored === 'zh-CN') {
    write(keys.language, stored)
    return stored
  }
  return normalizeLanguage(fallbackLanguage)
}

export function setLanguagePreference(language: string): void {
  const normalized = normalizeLanguage(language)
  write(keys.language, normalized)
  write('language', normalized)
}

export function getAnalysisPageCountPreference(): number {
  const raw = read(keys.analysisPageCount)
  if (raw === null) return 3
  const stored = Number(raw)
  if (!Number.isFinite(stored)) return 3
  return Math.min(5, Math.max(1, Math.floor(stored)))
}

export function setAnalysisPageCountPreference(pageCount: number): number {
  const normalized = Math.min(5, Math.max(1, Math.floor(pageCount)))
  write(keys.analysisPageCount, String(normalized))
  return normalized
}

export function getThemePreference(): ThemePreference | null {
  const stored = read(keys.theme)
  if (!stored) return null

  try {
    const preference = JSON.parse(stored) as Partial<ThemePreference>
    if (preference.kind === 'builtin' && typeof preference.id === 'string') {
      return { kind: 'builtin', id: preference.id }
    }
    if (preference.kind === 'custom' && typeof preference.css === 'string' && preference.css.length <= 1_000_000) {
      return { kind: 'custom', css: preference.css }
    }
  } catch {
    // Invalid preferences fall back to the default theme.
  }

  remove(keys.theme)
  return null
}

export function setThemePreference(preference: ThemePreference): void {
  write(keys.theme, JSON.stringify(preference))
}

const validationScenarios = new Set([
  'dashboard',
  'ecommerce',
  'kanban',
  'analytics',
  'settings',
  'landing',
  'blog',
  'docs',
  'pricing',
  'login',
  'profile',
  'chat',
])

export function getValidationScenarioPreference(): string {
  const stored = read(keys.validationScenario)
  return stored && validationScenarios.has(stored) ? stored : 'dashboard'
}

export function setValidationScenarioPreference(scenario: string): void {
  if (validationScenarios.has(scenario)) write(keys.validationScenario, scenario)
}

export function getNoAiTipDismissedPreference(): boolean {
  return read(keys.noAiTipDismissed) === 'true'
}

export function setNoAiTipDismissedPreference(dismissed: boolean): void {
  write(keys.noAiTipDismissed, String(dismissed))
}
