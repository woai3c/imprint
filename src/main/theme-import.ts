import type { DesignToken } from '../core/analyzer/types.js'
import { type UnknownRecord, isRecord } from '../shared/type-guards.js'

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readDtcgValues(value: unknown): string[] {
  if (!isRecord(value)) return []

  return Object.values(value)
    .map((item) => (isRecord(item) ? item.$value : undefined))
    .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
    .map(String)
}

export function readImportedThemeMeta(value: unknown): UnknownRecord | undefined {
  return isRecord(value) && isRecord(value.meta) ? value.meta : undefined
}

export function normalizeImportedTokens(value: unknown): DesignToken {
  if (!isRecord(value)) throw new Error('The selected file is not a theme token JSON object')

  if (isRecord(value.colors) && isRecord(value.typography)) {
    const colors = Object.fromEntries(
      Object.entries(value.colors).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
    const typography = value.typography
    if (Object.keys(colors).length === 0) throw new Error('The theme does not contain usable color tokens')

    return {
      colors,
      typography: {
        fontFamilies: asStringArray(typography.fontFamilies),
        fontStacks: asStringArray(typography.fontStacks),
        fontSizes: asStringArray(typography.fontSizes),
        fontWeights: asStringArray(typography.fontWeights),
        lineHeights: asStringArray(typography.lineHeights),
        letterSpacings: asStringArray(typography.letterSpacings),
      },
      spacing: asStringArray(value.spacing),
      radii: asStringArray(value.radii),
      shadows: asStringArray(value.shadows),
      borders: asStringArray(value.borders),
      zIndices: asStringArray(value.zIndices),
      transitions: asStringArray(value.transitions),
      usageCount: isRecord(value.usageCount)
        ? Object.fromEntries(
            Object.entries(value.usageCount).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
          )
        : {},
    }
  }

  if (isRecord(value.color) && isRecord(value.typography)) {
    const colors = Object.fromEntries(
      Object.entries(value.color)
        .map(([name, token]) => [name, isRecord(token) ? token.$value : undefined])
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
    if (Object.keys(colors).length === 0) throw new Error('The theme does not contain usable color tokens')

    return {
      colors,
      typography: {
        fontFamilies: asStringArray(
          isRecord(value.typography.fontFamilies) ? value.typography.fontFamilies.$value : [],
        ),
        fontStacks: asStringArray(isRecord(value.typography.fontStacks) ? value.typography.fontStacks.$value : []),
        fontSizes: asStringArray(isRecord(value.typography.fontSizes) ? value.typography.fontSizes.$value : []),
        fontWeights: [],
        lineHeights: [],
        letterSpacings: asStringArray(
          isRecord(value.typography.letterSpacing) ? value.typography.letterSpacing.$value : [],
        ),
      },
      spacing: readDtcgValues(value.spacing),
      radii: readDtcgValues(value.borderRadius),
      shadows: readDtcgValues(value.shadow),
      borders: [],
      zIndices: readDtcgValues(value.zIndex),
      transitions: readDtcgValues(value.transition),
      usageCount: {},
    }
  }

  throw new Error('The selected JSON does not contain Imprint or DTCG theme tokens')
}
