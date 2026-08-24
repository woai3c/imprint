import { clusterColors } from '../analyzer/color-cluster.js'
import { buildDesignTokens } from '../analyzer/token-builder.js'
import type { DarkModeResult, DesignToken } from '../analyzer/types.js'

export interface DarkModeExportData {
  hasDarkMode: boolean
  darkTokens?: DesignToken
  method?: 'media-query' | 'class-toggle' | 'none'
  selector?: string
}

function namespaceDarkPaletteTokens(tokens: DesignToken): DesignToken {
  const rename = (name: string): string => (/^palette-\d+$/.test(name) ? `dark-${name}` : name)
  const colors = Object.fromEntries(Object.entries(tokens.colors).map(([name, value]) => [rename(name), value]))
  const evidence = tokens.evidence
    ? Object.fromEntries(
        Object.entries(tokens.evidence).map(([key, value]) => {
          const match = /^colors\.(palette-\d+)$/.exec(key)
          return [match ? `colors.${rename(match[1])}` : key, value]
        }),
      )
    : undefined
  return { ...tokens, colors, ...(evidence ? { evidence } : {}) }
}

export function buildDarkModeExportData(darkMode: DarkModeResult | null | undefined): DarkModeExportData | undefined {
  if (!darkMode?.hasDarkMode || !darkMode.darkStyles) return undefined

  const clusteredColors = clusterColors(darkMode.darkStyles.colors, darkMode.darkStyles.usageCount)
  return {
    hasDarkMode: true,
    // Residual palette indexes are local to each independently clustered snapshot. Keeping
    // the same palette-N key would falsely imply a semantic light/dark override relationship.
    darkTokens: namespaceDarkPaletteTokens(buildDesignTokens(darkMode.darkStyles, clusteredColors)),
    method: darkMode.method,
    selector: darkMode.selector,
  }
}

export function normalizeDarkSelector(value: unknown): string {
  if (value === '.dark') return value
  if (typeof value === 'string' && /^\[data-[\w-]+="dark"\]$/.test(value)) return value
  return '.dark'
}

function isDesignToken(value: unknown): value is DesignToken {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<DesignToken>
  return (
    !!candidate.colors &&
    typeof candidate.colors === 'object' &&
    !!candidate.typography &&
    typeof candidate.typography === 'object' &&
    Array.isArray(candidate.spacing) &&
    Array.isArray(candidate.radii) &&
    Array.isArray(candidate.shadows)
  )
}

export function restoreDarkModeExportData(
  storedDarkTokens: unknown,
  baseTokens: DesignToken,
  method: unknown,
  selector?: unknown,
): DarkModeExportData | undefined {
  if (!storedDarkTokens || typeof storedDarkTokens !== 'object' || Array.isArray(storedDarkTokens)) return undefined

  const restoredDarkTokens = isDesignToken(storedDarkTokens)
    ? storedDarkTokens
    : { ...baseTokens, colors: storedDarkTokens as Record<string, string> }
  if (Object.keys(restoredDarkTokens.colors).length === 0) return undefined
  const darkTokens = namespaceDarkPaletteTokens(restoredDarkTokens)
  const normalizedMethod = method === 'media-query' || method === 'class-toggle' ? method : 'media-query'

  return {
    hasDarkMode: true,
    darkTokens,
    method: normalizedMethod,
    selector: normalizedMethod === 'class-toggle' ? normalizeDarkSelector(selector) : undefined,
  }
}
