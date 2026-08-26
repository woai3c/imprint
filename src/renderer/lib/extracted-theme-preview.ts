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
  usageCount?: Record<string, unknown>
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

function parseColor(value: string | undefined): [number, number, number] | null {
  if (!value) return null
  const normalized = value.trim()
  const hexMatch = normalized.match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i)
  if (hexMatch) {
    const hex = hexMatch[1].length === 3 ? hexMatch[1].replace(/(.)/g, '$1$1') : hexMatch[1]
    if (hex.length === 8 && Number.parseInt(hex.slice(6, 8), 16) < 255) return null
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ]
  }

  const rgbMatch = normalized.match(/^rgba?\((.+)\)$/i)
  if (!rgbMatch) return null
  const parts = rgbMatch[1]
    .replace(/\s*\/\s*/, ',')
    .split(/\s*,\s*|\s+/)
    .filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return null
  const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3])
  if (!Number.isFinite(alpha) || alpha < 0.999) return null
  const channels = parts.slice(0, 3).map((part) => {
    const amount = Number.parseFloat(part)
    return part.endsWith('%') ? (amount / 100) * 255 : amount
  })
  return channels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)
    ? (channels as [number, number, number])
    : null
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

function mix(first: string, second: string, secondWeight: number, fallback: string): string {
  const firstRgb = parseColor(first)
  const secondRgb = parseColor(second)
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
  const rgb = parseColor(value)
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

function colorKey(value: string): string {
  const parsed = parseColor(value)
  return parsed ? parsed.map((channel) => Math.round(channel)).join(',') : value.trim().toLowerCase()
}

function uniqueColors(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  return values.filter((value): value is string => {
    if (typeof value !== 'string' || !safeColor(value)) return false
    const key = colorKey(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function minimumContrast(backgrounds: string[], candidate: string): number | null {
  const ratios = backgrounds.map((background) => contrastRatio(background, candidate))
  return ratios.some((ratio) => ratio === null) ? null : Math.min(...(ratios as number[]))
}

function readableText(
  backgrounds: string | string[],
  preferred: string | undefined,
  candidates: Array<string | undefined>,
): string {
  const comparedBackgrounds = Array.isArray(backgrounds) ? backgrounds : [backgrounds]
  const observedCandidates = uniqueColors([preferred, ...candidates])
  if (preferred && (minimumContrast(comparedBackgrounds, preferred) ?? 0) >= 4.5) return preferred

  const observedMatch = observedCandidates.find(
    (candidate) => (minimumContrast(comparedBackgrounds, candidate) ?? 0) >= 4.5,
  )
  if (observedMatch) return observedMatch

  return uniqueColors([...observedCandidates, '#ffffff', '#111827']).reduce(
    (best, candidate) => {
      const ratio = minimumContrast(comparedBackgrounds, candidate) ?? 0
      return ratio > best.ratio ? { color: candidate, ratio } : best
    },
    { color: '#111827', ratio: -1 },
  ).color
}

function usageColors(usageCount: Record<string, unknown> | undefined, category: string): string[] {
  const prefix = `${category}:`
  return Object.entries(usageCount || {})
    .filter(
      (entry): entry is [string, number] =>
        entry[0].startsWith(prefix) && typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
    )
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .map(([key]) => safeColor(key.slice(prefix.length)))
    .filter((value): value is string => !!value)
}

function isBetweenForegroundAndBackground(candidate: string, foreground: string, background: string): boolean {
  const candidateLuminance = luminance(candidate)
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  if (candidateLuminance === null || foregroundLuminance === null || backgroundLuminance === null) return false
  const minimum = Math.min(foregroundLuminance, backgroundLuminance)
  const maximum = Math.max(foregroundLuminance, backgroundLuminance)
  return candidateLuminance > minimum && candidateLuminance < maximum
}

function readableMutedText(
  backgrounds: string[],
  preferred: string | undefined,
  foreground: string,
  candidates: string[],
): string {
  if (preferred && (minimumContrast(backgrounds, preferred) ?? 0) >= 4.5) return preferred
  const background = backgrounds[0]
  const observedMatch = uniqueColors(candidates).find(
    (candidate) =>
      colorKey(candidate) !== colorKey(foreground) &&
      isBetweenForegroundAndBackground(candidate, foreground, background) &&
      (minimumContrast(backgrounds, candidate) ?? 0) >= 4.5,
  )
  return observedMatch || foreground
}

function numericCssValues(values: string[]): string[] {
  return values
    .filter((value) => /^\d*\.?\d+(?:px|rem|em)$/.test(value.trim()))
    .sort((first, second) => Number.parseFloat(first) - Number.parseFloat(second))
}

function lengthInPixels(value: string): number | null {
  const match = value.trim().match(/^(\d*\.?\d+)(px|rem|em)$/)
  if (!match) return null
  const amount = Number.parseFloat(match[1]) * (match[2] === 'px' ? 1 : 16)
  return Number.isFinite(amount) ? amount : null
}

function evenTypeScale(values: string[]): string[] {
  const defaults = [12, 14, 16, 18, 20, 24]
  const observed = [
    ...new Set(
      values
        .map(lengthInPixels)
        .filter((value): value is number => value !== null && value >= 10 && value <= 40)
        .map((value) => Math.min(32, Math.max(12, Math.round(value / 2) * 2))),
    ),
  ].sort((first, second) => first - second)

  if (observed.length < 3 || observed[0] > 14) return defaults.map((value) => `${value}px`)

  const regularScale = observed.filter((value) => value <= 24)
  const scale = defaults.map((fallback, index) => regularScale[index] ?? fallback)
  const displaySize = observed.findLast((value) => value > 24)
  if (displaySize) scale[scale.length - 1] = displaySize
  for (let index = 1; index < scale.length; index += 1) scale[index] = Math.max(scale[index], scale[index - 1])
  return scale.map((value) => `${value}px`)
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
  const pixels = lengthInPixels(value)
  return pixels !== null && pixels >= 999
}

function usageForLength(usageCount: Record<string, unknown> | undefined, category: string, pixels: number): number {
  let count = 0
  const prefix = `${category}:`
  for (const [key, value] of Object.entries(usageCount || {})) {
    if (!key.startsWith(prefix) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue
    const observedPixels = lengthInPixels(key.slice(prefix.length))
    if (observedPixels !== null && Math.abs(observedPixels - pixels) <= 0.1) count += value
  }
  return count
}

function previewRadiusScale(values: string[], usageCount: Record<string, unknown> | undefined): string[] {
  const candidates = numericCssValues(values)
    .filter((value) => !isPillRadius(value))
    .map((value) => ({ value, pixels: lengthInPixels(value) }))
    .filter((entry): entry is { value: string; pixels: number } => entry.pixels !== null)
    .map((entry) => ({ ...entry, count: usageForLength(usageCount, 'radius', entry.pixels) }))
    .sort((first, second) => first.pixels - second.pixels)

  if (candidates.length <= 1) return candidates.map((candidate) => candidate.value)

  const ranked = [...candidates].sort((first, second) => second.count - first.count || first.pixels - second.pixels)
  const maxCount = ranked[0].count
  let supported = candidates
  if (maxCount > 0) {
    const commonRadiusCeiling = Math.max(...ranked.slice(0, 2).map((candidate) => candidate.pixels)) * 2
    supported = candidates.filter(
      (candidate) => candidate.pixels <= commonRadiusCeiling || candidate.count >= maxCount * 0.2,
    )
  } else if (candidates.length >= 3) {
    const previous = candidates.at(-2)!
    const last = candidates.at(-1)!
    if (last.pixels > previous.pixels * 2.5) supported = candidates.slice(0, -1)
  }

  return (supported.length > 0 ? supported : candidates)
    .sort((first, second) => first.pixels - second.pixels)
    .map((candidate) => candidate.value)
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
  const textCandidates = usageColors(tokens.usageCount, 'textColor')
  const background = sourceColors.background || palette[0] || '#ffffff'
  const initialForeground =
    sourceColors.foreground || readableText(background, undefined, [...textCandidates, ...palette])
  const surface = sourceColors.card || sourceColors.surface || mix(background, initialForeground, 0.04, background)
  const foreground = readableText([background, surface], sourceColors.foreground, [...textCandidates, ...palette])
  const primary =
    sourceColors.primary || palette.find((color) => color !== background && color !== foreground) || foreground
  const secondary = sourceColors.secondary || mix(background, foreground, 0.08, surface)
  const muted = sourceColors.muted || mix(background, foreground, 0.06, surface)
  const accent = sourceColors.accent || sourceColors.secondary || mix(background, primary, 0.12, secondary)
  const border = sourceColors.border || mix(background, foreground, 0.2, foreground)
  const borderSubtle = sourceColors['border-subtle'] || border
  const input = sourceColors.input || border
  const primaryForeground = readableText(primary, sourceColors['primary-foreground'], [foreground, ...textCandidates])
  const secondaryForeground = readableText(secondary, sourceColors['secondary-foreground'], [
    foreground,
    ...textCandidates,
  ])
  const mutedForeground = readableMutedText(
    [background, surface, muted],
    sourceColors['muted-foreground'],
    foreground,
    textCandidates,
  )
  const accentForeground = readableText(accent, sourceColors['accent-foreground'], [foreground, ...textCandidates])
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
    'card-foreground': readableText(surface, sourceColors['card-foreground'], [foreground, ...textCandidates]),
    primary,
    'primary-foreground': primaryForeground,
    secondary,
    'secondary-foreground': secondaryForeground,
    muted,
    'muted-foreground': mutedForeground,
    accent,
    'accent-foreground': accentForeground,
    destructive,
    'destructive-foreground': readableText(destructive, sourceColors['destructive-foreground'], [
      foreground,
      ...textCandidates,
    ]),
    border,
    'border-subtle': borderSubtle,
    input,
    ring: sourceColors.ring || primary,
    sidebar,
    'sidebar-foreground': readableText(sidebar, sourceColors['sidebar-foreground'], [foreground, ...textCandidates]),
    'sidebar-accent': sidebarAccent,
    warning,
    'warning-foreground': readableText(warning, sourceColors['warning-foreground'], [foreground, ...textCandidates]),
    'warning-strong': sourceColors['warning-strong'] || warning,
    success,
    popover: sourceColors.popover || surface,
    'popover-foreground': readableText(sourceColors.popover || surface, sourceColors['popover-foreground'], [
      foreground,
      ...textCandidates,
    ]),
  }

  const fontStacks = stringArray(activeTokens.typography?.fontStacks)
  const fontFamilies = stringArray(activeTokens.typography?.fontFamilies)
  const fontBody = safeCssValue(fontStacks[0] || fontFamilies[0], 'system-ui, sans-serif')
  const fontSizes = evenTypeScale(stringArray(activeTokens.typography?.fontSizes))
  const fontWeights = numericValues(stringArray(activeTokens.typography?.fontWeights))
  const lineHeights = numericValues(
    stringArray(activeTokens.typography?.lineHeights).filter((value) => /^\d*\.?\d+$/.test(value.trim())),
  )
  const letterSpacings = numericValues(stringArray(activeTokens.typography?.letterSpacings))
  const radii = previewRadiusScale(stringArray(activeTokens.radii), activeTokens.usageCount || tokens.usageCount)
  const shadows = stringArray(activeTokens.shadows)
    .map((value) => safeCssValue(value, ''))
    .filter(Boolean)
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
    // Tailwind derives structural widths and heights from --spacing. Keep the
    // validation geometry fixed instead of treating the smallest observed gap
    // as a global base unit and shrinking the entire scenario.
    '--spacing': '0.25rem',
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
  for (const role of [...observedRoles]) {
    const sourceValue = role === 'card' && !sourceColors.card ? sourceColors.surface : sourceColors[role]
    if (!sourceValue || colorKey(sourceValue) !== colorKey(mappedColors[role])) observedRoles.delete(role)
  }
  const observedRoleCount = observedRoles.size
  const contrastPairs: Array<[string | undefined, string | undefined]> = [
    [sourceColors.background, sourceColors.foreground],
    [sourceColors.background, sourceColors['muted-foreground']],
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
