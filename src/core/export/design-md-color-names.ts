import { normalizeColorValue } from '../analyzer/color-cluster.js'
import type { ColorRenameProposal } from '../analyzer/token-renamer.js'
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

function stableDesignMdColorName(
  currentName: string,
  normalizedValue: string,
  aliasesByName: ReadonlyMap<string, string>,
  fallbackPrefix: string,
): string {
  const sourceName = aliasesByName.get(currentName) || currentName
  return /^(?:dark-)?palette-\d+$/.test(sourceName)
    ? `${fallbackPrefix}-${stableColorValueSlug(normalizedValue)}`
    : sourceName
}

export interface DesignMdColorEntry {
  sourceName: string
  publicName: string
  value: string
}

export function designMdColorEntries(
  tokens: Pick<DesignToken, 'colors'>,
  aliases: readonly ColorRenameProposal[] = [],
  fallbackPrefix = 'observed',
): DesignMdColorEntry[] {
  const aliasesByName = new Map(aliases.map((alias) => [alias.name, alias.tokenId]))
  return Object.entries(tokens.colors).flatMap(([sourceName, value]) => {
    const normalized = normalizeColorValue(value)
    if (!normalized) return []
    return [
      {
        sourceName,
        publicName: stableDesignMdColorName(sourceName, normalized, aliasesByName, fallbackPrefix),
        value: normalized,
      },
    ]
  })
}

export function designMdColorRefMap(
  tokens: Pick<DesignToken, 'colors'>,
  aliases: readonly ColorRenameProposal[] = [],
  fallbackPrefix = 'observed',
): Map<string, string> {
  const result = new Map<string, string>()
  const publicNameBySource = new Map(
    designMdColorEntries(tokens, aliases, fallbackPrefix).map((entry) => [entry.sourceName, entry.publicName]),
  )
  for (const [sourceName, publicName] of publicNameBySource) result.set(`color.${sourceName}`, `color.${publicName}`)
  for (const alias of aliases) {
    const publicName = publicNameBySource.get(alias.name) || publicNameBySource.get(alias.tokenId)
    if (!publicName) continue
    result.set(`color.${alias.name}`, `color.${publicName}`)
    result.set(`color.${alias.tokenId}`, `color.${publicName}`)
  }
  return result
}
