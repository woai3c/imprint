import { normalizeColorValue } from '../analyzer/color-cluster.js'
import type { DesignToken } from '../analyzer/types.js'

function stableColorValueSlug(normalized: string): string {
  if (/^#[\da-f]{6}$/i.test(normalized)) return normalized.slice(1).toLowerCase()
  const rgba = normalized.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/i)
  if (rgba) {
    const rgb = rgba
      .slice(1, 4)
      .map((channel) => Number(channel).toString(16).padStart(2, '0'))
      .join('')
    const alpha = Math.round(Number(rgba[4]) * 255)
      .toString(16)
      .padStart(2, '0')
    return `${rgb}-${alpha}`
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function stableDesignMdColorName(currentName: string, normalizedValue: string, fallbackPrefix: string): string {
  return /^(?:dark-)?palette-\d+$/.test(currentName)
    ? `${fallbackPrefix}-${stableColorValueSlug(normalizedValue)}`
    : currentName
}

export interface DesignMdColorEntry {
  sourceName: string
  publicName: string
  value: string
}

export function designMdColorEntries(
  tokens: Pick<DesignToken, 'colors'>,
  fallbackPrefix = 'observed',
): DesignMdColorEntry[] {
  return Object.entries(tokens.colors).flatMap(([sourceName, value]) => {
    const normalized = normalizeColorValue(value)
    if (!normalized) return []
    return [
      {
        sourceName,
        publicName: stableDesignMdColorName(sourceName, normalized, fallbackPrefix),
        value: normalized,
      },
    ]
  })
}
