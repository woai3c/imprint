import type { CSSProperties } from 'react'

import type { ThemeSummaryRecord } from '../../shared/ipc-contract'

type PreviewStyle = CSSProperties & Record<`--${string}`, string>

interface ExtractedTokens {
  colors?: Record<string, unknown>
  typography?: {
    fontFamilies?: unknown
    fontStacks?: unknown
    fontSizes?: unknown
    fontWeights?: unknown
    lineHeights?: unknown
    letterSpacings?: unknown
  }
  spacing?: unknown
  radii?: unknown
  shadows?: unknown
  borders?: unknown
}

export interface ExtractedThemePreview {
  style: PreviewStyle
  palette: string[]
  colorMode: ExtractedThemeColorMode
  hasDarkMode: boolean
  observedRoleCount: number
  adaptedRoleCount: number
  contrastIssueCount: number
}

export type ExtractedThemeColorMode = 'base' | 'dark'

type ExtractedThemeSource = Pick<ThemeSummaryRecord, 'tokens_json'> &
  Partial<Pick<ThemeSummaryRecord, 'dark_tokens_json'>>

const semanticColorRoles = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'border-subtle',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-accent',
  'warning',
  'warning-foreground',
  'warning-strong',
  'success',
  'popover',
  'popover-foreground',
] as const

function readTokens(serialized: string): ExtractedTokens {
  try {
    const value = JSON.parse(serialized) as unknown
    return value && typeof value === 'object' ? (value as ExtractedTokens) : {}
  } catch {
    return {}
  }
}

function readDarkTokens(serialized: string | null | undefined): ExtractedTokens | null {
  if (!serialized) return null
  try {
    const value = JSON.parse(serialized) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    return record.colors && typeof record.colors === 'object' && !Array.isArray(record.colors)
      ? (record as ExtractedTokens)
      : { colors: record }
  } catch {
    return null
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function safeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const color = value.trim()
  if (!color || color.length > 160 || /[;{}]|url\s*\(/i.test(color)) return undefined
  if (/^#[\da-f]{3,8}$/i.test(color)) return color
  if (/^(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([^{};]+\)$/i.test(color)) return color
  return undefined
}

function safeCssValue(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const normalized = value.trim()
  return normalized && normalized.length <= 240 && !/[;{}<>]|url\s*\(/i.test(normalized) ? normalized : fallback
}

function parseHex(value: string | undefined): [number, number, number] | null {
  if (!value) return null
  const match = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (!match) return null
  const hex = match[1].length === 3 ? match[1].replace(/(.)/g, '$1$1') : match[1]
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

function mix(first: string, second: string, secondWeight: number, fallback: string): string {
  const firstRgb = parseHex(first)
  const secondRgb = parseHex(second)
  if (!firstRgb || !secondRgb) return fallback
  return toHex(
    firstRgb.map((channel, index) => channel * (1 - secondWeight) + secondRgb[index] * secondWeight) as [
      number,
      number,
      number,
    ],
  )
}

function luminance(value: string | undefined): number | null {
  const rgb = parseHex(value)
  if (!rgb) return null
  const channels = rgb.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

export function contrastRatio(first: string | undefined, second: string | undefined): number | null {
  const firstLuminance = luminance(first)
  const secondLuminance = luminance(second)
  if (firstLuminance === null || secondLuminance === null) return null
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function readableText(background: string, candidates: Array<string | undefined>): string {
  const usableCandidates = [...candidates, '#ffffff', '#111827'].filter((value): value is string => !!safeColor(value))
  return usableCandidates.reduce(
    (best, candidate) => {
      const ratio = contrastRatio(background, candidate) ?? 0
      return ratio > best.ratio ? { color: candidate, ratio } : best
    },
    { color: '#111827', ratio: -1 },
  ).color
}

function numericCssValues(values: string[]): string[] {
  return values
    .filter((value) => /^\d*\.?\d+(?:px|rem|em)$/.test(value.trim()))
    .sort((first, second) => Number.parseFloat(first) - Number.parseFloat(second))
}

function numericValues(values: string[]): string[] {
  return values
    .filter((value) => Number.isFinite(Number.parseFloat(value)))
    .sort((first, second) => Number.parseFloat(first) - Number.parseFloat(second))
}

function closestFontWeight(values: string[], target: number, fallback: string): string {
  const weights = values
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 1000)
  if (weights.length === 0) return fallback
  return String(weights.reduce((best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best)))
}

function borderWidth(values: string[]): string {
  for (const value of values) {
    const match = value.trim().match(/^(\d*\.?\d+(?:px|rem|em))\b/)
    if (match) return match[1]
  }
  return '1px'
}

function isPillRadius(value: string): boolean {
  const match = value.trim().match(/^(\d*\.?\d+)(px|rem|em)$/)
  if (!match) return false
  const pixels = Number.parseFloat(match[1]) * (match[2] === 'px' ? 1 : 16)
  return pixels >= 999
}

function spacingUnit(values: string[]): string {
  const pixels = values
    .map((value) => {
      const match = value.trim().match(/^(\d*\.?\d+)(px|rem)$/)
      if (!match) return null
      const amount = Number.parseFloat(match[1]) * (match[2] === 'rem' ? 16 : 1)
      return Number.isFinite(amount) && amount > 0 ? amount : null
    })
    .filter((value): value is number => value !== null)
  if (pixels.length === 0) return '0.25rem'
  return `${Math.min(8, Math.max(2, Math.min(...pixels))) / 16}rem`
}

export function createExtractedThemePreview(
  theme: ExtractedThemeSource,
  requestedColorMode: ExtractedThemeColorMode = 'base',
): ExtractedThemePreview {
  const tokens = readTokens(theme.tokens_json)
  const darkTokens = readDarkTokens(theme.dark_tokens_json)
  const darkColors = darkTokens?.colors || null
  const hasDarkMode = Boolean(darkColors && Object.keys(darkColors).length > 0)
  const colorMode = requestedColorMode === 'dark' && hasDarkMode ? 'dark' : 'base'
  const basePaletteColors = Object.fromEntries(
    Object.entries(tokens.colors || {}).filter(([name]) => name.startsWith('palette-')),
  )
  const tokenColors = colorMode === 'dark' ? { ...basePaletteColors, ...darkColors } : tokens.colors || {}
  const activeTokens: ExtractedTokens =
    colorMode === 'dark' && darkTokens
      ? {
          ...tokens,
          ...darkTokens,
          colors: tokenColors,
          typography: { ...tokens.typography, ...darkTokens.typography },
        }
      : tokens
  const sourceColors = Object.fromEntries(
    Object.entries(tokenColors)
      .map(([name, value]) => [name, safeColor(value)])
      .filter((entry): entry is [string, string] => !!entry[1]),
  )
  const palette = [...new Set(Object.values(sourceColors))]
  const background = sourceColors.background || palette[0] || '#ffffff'
  const foreground = sourceColors.foreground || readableText(background, palette)
  const surface = sourceColors.card || sourceColors.surface || mix(background, foreground, 0.04, background)
  const primary =
    sourceColors.primary || palette.find((color) => color !== background && color !== foreground) || foreground
  const secondary = sourceColors.secondary || mix(background, foreground, 0.08, surface)
  const muted = sourceColors.muted || mix(background, foreground, 0.06, surface)
  const accent = sourceColors.accent || sourceColors.secondary || mix(background, primary, 0.12, secondary)
  const border = sourceColors.border || mix(background, foreground, 0.2, foreground)
  const borderSubtle = sourceColors['border-subtle'] || border
  const input = sourceColors.input || border
  const primaryForeground = sourceColors['primary-foreground'] || readableText(primary, [background, foreground])
  const secondaryForeground = sourceColors['secondary-foreground'] || readableText(secondary, [foreground, background])
  const mutedForeground = sourceColors['muted-foreground'] || readableText(muted, [foreground, background])
  const accentForeground = sourceColors['accent-foreground'] || readableText(accent, [foreground, background])
  const backgroundLuminance = luminance(background)
  const darkSurface = backgroundLuminance !== null && backgroundLuminance < 0.35
  const destructive = sourceColors.destructive || (darkSurface ? '#f97066' : '#b42318')
  const warning = sourceColors.warning || (darkSurface ? '#fdb022' : '#b54708')
  const success = sourceColors.success || (darkSurface ? '#47cd89' : '#067647')
  const sidebar = sourceColors.sidebar || surface
  const sidebarAccent = sourceColors['sidebar-accent'] || mix(sidebar, primary, darkSurface ? 0.28 : 0.18, accent)

  const mappedColors: Record<(typeof semanticColorRoles)[number], string> = {
    background,
    foreground,
    card: surface,
    'card-foreground': sourceColors['card-foreground'] || readableText(surface, [foreground, background]),
    primary,
    'primary-foreground': primaryForeground,
    secondary,
    'secondary-foreground': secondaryForeground,
    muted,
    'muted-foreground': mutedForeground,
    accent,
    'accent-foreground': accentForeground,
    destructive,
    'destructive-foreground':
      sourceColors['destructive-foreground'] || readableText(destructive, [background, foreground]),
    border,
    'border-subtle': borderSubtle,
    input,
    ring: sourceColors.ring || primary,
    sidebar,
    'sidebar-foreground': sourceColors['sidebar-foreground'] || readableText(sidebar, [foreground, background]),
    'sidebar-accent': sidebarAccent,
    warning,
    'warning-foreground': sourceColors['warning-foreground'] || readableText(warning, [background, foreground]),
    'warning-strong': sourceColors['warning-strong'] || warning,
    success,
    popover: sourceColors.popover || surface,
    'popover-foreground':
      sourceColors['popover-foreground'] || readableText(sourceColors.popover || surface, [foreground, background]),
  }

  const fontStacks = stringArray(activeTokens.typography?.fontStacks)
  const fontFamilies = stringArray(activeTokens.typography?.fontFamilies)
  const fontBody = safeCssValue(fontStacks[0] || fontFamilies[0], 'system-ui, sans-serif')
  const fontSizes = numericCssValues(stringArray(activeTokens.typography?.fontSizes))
  const fontWeights = numericValues(stringArray(activeTokens.typography?.fontWeights))
  const lineHeights = numericValues(
    stringArray(activeTokens.typography?.lineHeights).filter((value) => /^\d*\.?\d+$/.test(value.trim())),
  )
  const letterSpacings = numericValues(stringArray(activeTokens.typography?.letterSpacings))
  const radii = numericCssValues(stringArray(activeTokens.radii)).filter((value) => !isPillRadius(value))
  const shadows = stringArray(activeTokens.shadows)
    .map((value) => safeCssValue(value, ''))
    .filter(Boolean)
  const sourceSpacing = stringArray(activeTokens.spacing)
  const sourceBorders = stringArray(activeTokens.borders)
  const radius = radii[Math.floor(radii.length / 2)] || '0.5rem'
  const largeRadius = radii[Math.min(radii.length - 1, Math.ceil(radii.length * 0.75))] || radius

  const style = {
    color: foreground,
    backgroundColor: background,
    fontFamily: fontBody,
    lineHeight: 'var(--leading-body)',
    ...Object.fromEntries(Object.entries(mappedColors).map(([name, value]) => [`--color-${name}`, value])),
    '--font-body': fontBody,
    '--font-heading': fontBody,
    '--font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    '--font-weight-normal': closestFontWeight(fontWeights, 400, '400'),
    '--font-weight-medium': closestFontWeight(fontWeights, 500, '500'),
    '--font-weight-semibold': closestFontWeight(fontWeights, 600, '600'),
    '--font-weight-bold': closestFontWeight(fontWeights, 700, '700'),
    '--spacing': spacingUnit(sourceSpacing),
    '--text-xs': fontSizes[0] || '0.75rem',
    '--text-sm': fontSizes[1] || fontSizes[0] || '0.875rem',
    '--text-base': fontSizes[2] || fontSizes[1] || '1rem',
    '--text-lg': fontSizes[3] || fontSizes.at(-1) || '1.125rem',
    '--text-xl': fontSizes[4] || fontSizes.at(-1) || '1.25rem',
    '--text-2xl': fontSizes[5] || fontSizes.at(-1) || '1.5rem',
    '--leading-body': lineHeights[Math.floor(lineHeights.length / 2)] || '1.5',
    '--leading-heading': lineHeights[0] || '1.25',
    '--text-xs--line-height': 'var(--leading-body)',
    '--text-sm--line-height': 'var(--leading-body)',
    '--text-base--line-height': 'var(--leading-body)',
    '--text-lg--line-height': 'var(--leading-heading)',
    '--text-xl--line-height': 'var(--leading-heading)',
    '--text-2xl--line-height': 'var(--leading-heading)',
    '--tracking-body': letterSpacings.find((value) => Number.parseFloat(value) >= 0) || '0',
    '--tracking-heading': letterSpacings[0] || '-0.02em',
    '--tracking-label': letterSpacings.at(-1) || '0.01em',
    '--border-width': borderWidth(sourceBorders),
    '--radius-sm': radii[0] || radius,
    '--radius-md': radius,
    '--radius-lg': largeRadius,
    '--radius-xl': radii.at(-1) || radius,
    '--shadow-sm': shadows[0] || 'none',
    '--shadow-md': shadows[1] || shadows[0] || 'none',
    '--shadow-lg': shadows[2] || shadows.at(-1) || 'none',
    '--art-card-bg': 'var(--color-card)',
    '--art-card-border': 'var(--color-border)',
    '--art-card-shadow': 'none',
    '--art-secondary-bg': 'var(--color-secondary)',
    '--art-input-bg': 'var(--color-background)',
    '--art-input-border': 'var(--color-input)',
    '--art-input-shadow': 'none',
    '--art-primary-bg': 'var(--color-primary)',
    '--art-primary-shadow': 'none',
    '--art-border-color': 'var(--color-border)',
    '--art-heading-shadow': 'none',
    '--art-heading-transform': 'none',
  } as PreviewStyle

  const observedRoles = new Set(semanticColorRoles.filter((role) => !!sourceColors[role]))
  if (!sourceColors.card && sourceColors.surface) observedRoles.add('card')
  const observedRoleCount = observedRoles.size
  const contrastPairs: Array<[string | undefined, string | undefined]> = [
    [sourceColors.background, sourceColors.foreground],
    [sourceColors.card || sourceColors.surface, sourceColors['card-foreground'] || sourceColors.foreground],
    [sourceColors.primary, sourceColors['primary-foreground']],
  ]
  const contrastIssueCount = contrastPairs.filter(([first, second]) => {
    const ratio = contrastRatio(first, second)
    return ratio !== null && ratio < 4.5
  }).length

  return {
    style,
    palette: [...new Set([background, foreground, primary, sourceColors.secondary, accent, surface, ...palette])]
      .filter((value): value is string => !!value)
      .slice(0, 5),
    colorMode,
    hasDarkMode,
    observedRoleCount,
    adaptedRoleCount: semanticColorRoles.length - observedRoleCount,
    contrastIssueCount,
  }
}
