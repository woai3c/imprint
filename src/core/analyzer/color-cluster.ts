import { colorFrequency } from './usage-stats.js'

/**
 * Color clustering algorithm.
 * Groups similar colors together and picks representative values.
 * Pure code implementation - no LLM needed.
 */

interface ColorRGB {
  r: number
  g: number
  b: number
  a: number
  original: string
  count: number
}

type ColorFrequency = ReadonlyMap<string, number>

export interface ClusteredColors {
  palette: Array<{ hex: string; count: number; role?: string }>
  backgrounds: string[]
  texts: string[]
  accents: string[]
}

function parseColor(colorStr: string): ColorRGB | null {
  const rgba = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (rgba) {
    return {
      r: parseInt(rgba[1]),
      g: parseInt(rgba[2]),
      b: parseInt(rgba[3]),
      a: rgba[4] ? parseFloat(rgba[4]) : 1,
      original: colorStr,
      count: 1,
    }
  }

  // Handle hex
  const hex = colorStr.match(/^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
      original: colorStr,
      count: 1,
    }
  }

  return null
}

function colorDistance(a: ColorRGB, b: ColorRGB): number {
  return Math.sqrt(Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2))
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

export function normalizeColorValue(value: string): string | null {
  const color = parseColor(value)
  if (!color) return null
  if (color.a < 0.999) {
    const alpha = Number(color.a.toFixed(3))
    return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`
  }
  return rgbToHex(color.r, color.g, color.b)
}

function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function chroma(color: ColorRGB): number {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
}

function relativeChroma(color: ColorRGB): number {
  return chroma(color) / Math.max(1, color.r, color.g, color.b)
}

function categoryFrequency(usageCount: Readonly<Record<string, number>>, category: string): Map<string, number> {
  const frequency = new Map<string, number>()
  const prefix = `${category}:`
  for (const [key, count] of Object.entries(usageCount)) {
    if (!key.startsWith(prefix) || !Number.isFinite(count) || count <= 0) continue
    frequency.set(key.slice(prefix.length), (frequency.get(key.slice(prefix.length)) || 0) + count)
  }
  return frequency
}

function addFrequency(target: Map<string, number>, source: ColorFrequency, weight = 1): void {
  for (const [color, count] of source) {
    target.set(color, (target.get(color) || 0) + count * weight)
  }
}

function roleFrequency(
  usageCount: Readonly<Record<string, number>>,
  category: string,
  legacyCategory?: string,
): Map<string, number> {
  const frequency = categoryFrequency(usageCount, category)
  return frequency.size > 0 || !legacyCategory ? frequency : categoryFrequency(usageCount, legacyCategory)
}

function combinedRoleFrequency(
  usageCount: Readonly<Record<string, number>>,
  categories: readonly string[],
): Map<string, number> {
  const frequency = new Map<string, number>()
  categories.forEach((category) => addFrequency(frequency, categoryFrequency(usageCount, category)))
  return frequency
}

function subtractFrequency(target: Map<string, number>, source: ColorFrequency, weight = 1): void {
  for (const [color, count] of source) {
    const remaining = (target.get(color) || 0) - count * weight
    if (remaining > 0) target.set(color, remaining)
    else target.delete(color)
  }
}

function clusterFrequency(
  frequency: ColorFrequency,
  limit = 20,
  threshold = 30,
): Array<{ hex: string; count: number }> {
  const parsed: ColorRGB[] = []
  for (const [colorStr, count] of frequency) {
    const color = parseColor(colorStr)
    if (!color) continue
    color.count = count
    parsed.push(color)
  }

  const clusters: ColorRGB[][] = []
  for (const color of parsed) {
    const cluster = clusters.find((candidate) => colorDistance(candidate[0], color) < threshold)
    if (cluster) cluster.push(color)
    else clusters.push([color])
  }

  return clusters
    .sort((a, b) => b.reduce((sum, color) => sum + color.count, 0) - a.reduce((sum, color) => sum + color.count, 0))
    .slice(0, limit)
    .map((cluster) => {
      const representative = [...cluster].sort((a, b) => b.count - a.count)[0]
      return {
        hex: normalizeColorValue(representative.original) || representative.original,
        count: cluster.reduce((sum, color) => sum + color.count, 0),
      }
    })
}

function roleColors(
  usageCount: Readonly<Record<string, number>>,
  primaryCategory: string,
  fallbackCategory?: string,
  threshold?: number,
): string[] {
  let frequency = categoryFrequency(usageCount, primaryCategory)
  if (frequency.size === 0 && fallbackCategory) frequency = categoryFrequency(usageCount, fallbackCategory)
  return clusterFrequency(frequency, 20, threshold).map((item) => item.hex)
}

function prioritizeRelatedRoleColors(colors: string[]): string[] {
  const [base, ...rest] = colors
  if (!base) return colors
  const parsedBase = parseColor(base)
  if (!parsedBase) return colors
  return [
    base,
    ...rest.sort((first, second) => {
      const firstColor = parseColor(first)
      const secondColor = parseColor(second)
      if (!firstColor || !secondColor) return 0
      return colorDistance(parsedBase, firstColor) - colorDistance(parsedBase, secondColor)
    }),
  ]
}

function prioritizeMutedTextColors(colors: string[]): string[] {
  const [foreground, ...rest] = colors
  if (!foreground) return colors
  const parsedForeground = parseColor(foreground)
  if (!parsedForeground) return colors
  return [
    foreground,
    ...rest.sort((first, second) => {
      const firstColor = parseColor(first)
      const secondColor = parseColor(second)
      if (!firstColor || !secondColor) return 0
      return (
        colorDistance(parsedForeground, firstColor) +
        relativeChroma(firstColor) * 250 -
        (colorDistance(parsedForeground, secondColor) + relativeChroma(secondColor) * 250)
      )
    }),
  ]
}

function usableAccentColors(frequency: ColorFrequency): string[] {
  return clusterFrequency(frequency)
    .filter((item) => {
      const color = parseColor(item.hex)
      if (!color) return false
      const lum = luminance(color.r, color.g, color.b)
      return color.a > 0.1 && chroma(color) >= 32 && relativeChroma(color) >= 0.3 && lum > 0.015 && lum < 0.97
    })
    .map((item) => item.hex)
}

function appendDistinctColors(target: string[], colors: string[]): void {
  for (const color of colors) {
    if (!target.includes(color)) target.push(color)
  }
}

export function clusterColors(
  rawColors: string[],
  usageCount: Readonly<Record<string, number>> = {},
  roleUsageCount: Readonly<Record<string, number>> = usageCount,
  accentUsageCount: Readonly<Record<string, number>> = roleUsageCount,
): ClusteredColors {
  const freq = colorFrequency(rawColors, usageCount)

  const palette = clusterFrequency(freq)
  if (palette.length === 0) return { palette: [], backgrounds: [], texts: [], accents: [] }

  // Preserve the browser-observed role instead of guessing it from luminance. A dark background is still a background,
  // and light text is still text. Area-weighted background observations win when the extractor provides them.
  // Keep subtle but intentional surface layers separate. The general palette threshold would merge common pairs such as
  // a #f4f6f9 page canvas and #ffffff cards, erasing the site's actual surface hierarchy.
  const backgrounds = prioritizeRelatedRoleColors(roleColors(roleUsageCount, 'bgArea', 'bgColor', 12))
  const texts = prioritizeMutedTextColors(roleColors(roleUsageCount, 'textColor'))

  // Explicit semantic evidence is ordered before raw DOM frequency. Otherwise a decorative color repeated across many
  // nodes can outrank a site's declared brand token even though the repetition is an implementation detail.
  const primaryActionBackgrounds = roleFrequency(accentUsageCount, 'primaryActionBackgroundColor', 'primaryActionColor')
  const actionBackgrounds = roleFrequency(accentUsageCount, 'actionBackgroundColor', 'actionColor')
  const actionForegrounds = combinedRoleFrequency(accentUsageCount, [
    'primaryActionForegroundColor',
    'actionForegroundColor',
  ])
  const statusColors = combinedRoleFrequency(accentUsageCount, [
    'statusBackgroundColor',
    'statusForegroundColor',
    'statusColor',
  ])
  const accentFrequency = new Map<string, number>()
  addFrequency(accentFrequency, primaryActionBackgrounds, 20)
  addFrequency(accentFrequency, actionBackgrounds, 16)
  addFrequency(accentFrequency, categoryFrequency(accentUsageCount, 'selectedColor'), 12)
  addFrequency(accentFrequency, categoryFrequency(accentUsageCount, 'accentColor'), 8)
  addFrequency(accentFrequency, categoryFrequency(accentUsageCount, 'linkColor'), 6)
  addFrequency(accentFrequency, colorFrequency(rawColors, accentUsageCount))
  subtractFrequency(accentFrequency, actionForegrounds, 50)
  subtractFrequency(accentFrequency, statusColors, 50)
  const accents: string[] = []
  appendDistinctColors(accents, usableAccentColors(primaryActionBackgrounds))
  appendDistinctColors(accents, usableAccentColors(actionBackgrounds))
  appendDistinctColors(accents, usableAccentColors(categoryFrequency(accentUsageCount, 'brandTokenColor')))
  appendDistinctColors(accents, usableAccentColors(categoryFrequency(accentUsageCount, 'selectedColor')))
  appendDistinctColors(accents, usableAccentColors(accentFrequency))

  const explicitlyAllowed = new Set(
    [
      ...primaryActionBackgrounds.keys(),
      ...actionBackgrounds.keys(),
      ...categoryFrequency(accentUsageCount, 'brandTokenColor').keys(),
      ...categoryFrequency(accentUsageCount, 'selectedColor').keys(),
    ].flatMap((color) => {
      const normalized = normalizeColorValue(color)
      return normalized ? [normalized] : []
    }),
  )
  const excludedRoles = new Set(
    [...actionForegrounds.keys(), ...statusColors.keys()].flatMap((color) => {
      const normalized = normalizeColorValue(color)
      return normalized ? [normalized] : []
    }),
  )
  const filteredAccents = accents.filter((color) => {
    const normalized = normalizeColorValue(color)
    return !normalized || explicitlyAllowed.has(normalized) || !excludedRoles.has(normalized)
  })
  accents.splice(0, accents.length, ...filteredAccents)

  return { palette, backgrounds, texts, accents }
}
