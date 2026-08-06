import type { ExtractedStyles } from './types.js'

const MERGED_ARRAY_FIELDS = [
  'colors',
  'fontFamilies',
  'fontSizes',
  'fontWeights',
  'lineHeights',
  'letterSpacings',
  'spacings',
  'radii',
  'shadows',
  'borders',
  'backgroundColors',
  'textColors',
  'zIndices',
  'transitions',
] as const satisfies ReadonlyArray<keyof ExtractedStyles>

const DEDUPED_ARRAY_FIELDS = [
  'colors',
  'fontFamilies',
  'fontSizes',
  'fontWeights',
  'lineHeights',
  'spacings',
  'radii',
  'shadows',
  'borders',
  'backgroundColors',
  'textColors',
] as const satisfies ReadonlyArray<(typeof MERGED_ARRAY_FIELDS)[number]>

export function mergeStyles(stylesList: ExtractedStyles[]): ExtractedStyles {
  const merged: ExtractedStyles = {
    colors: [],
    fontFamilies: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    letterSpacings: [],
    spacings: [],
    radii: [],
    shadows: [],
    borders: [],
    cssVariables: {},
    backgroundColors: [],
    textColors: [],
    zIndices: [],
    transitions: [],
    usageCount: {},
  }

  for (const styles of stylesList) {
    for (const field of MERGED_ARRAY_FIELDS) {
      merged[field].push(...(styles[field] || []))
    }
    Object.assign(merged.cssVariables, styles.cssVariables)
    for (const [key, count] of Object.entries(styles.usageCount)) {
      merged.usageCount[key] = (merged.usageCount[key] || 0) + count
    }
  }

  for (const field of DEDUPED_ARRAY_FIELDS) {
    merged[field] = [...new Set(merged[field])]
  }

  return merged
}

/**
 * Merge style values while giving every capture one vote per usage category.
 * This prevents a DOM-heavy documentation page from overwhelming a lighter
 * marketing page merely because it contains more elements.
 */
export function mergeStylesWithNormalizedUsage(stylesList: ExtractedStyles[]): ExtractedStyles {
  const merged = mergeStyles(stylesList)
  const normalizedUsage: Record<string, number> = {}

  for (const styles of stylesList) {
    const categoryTotals = new Map<string, number>()
    for (const [key, count] of Object.entries(styles.usageCount)) {
      const separator = key.indexOf(':')
      if (separator <= 0 || !Number.isFinite(count) || count <= 0) continue
      const category = key.slice(0, separator)
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + count)
    }

    for (const [key, count] of Object.entries(styles.usageCount)) {
      const separator = key.indexOf(':')
      if (separator <= 0 || !Number.isFinite(count) || count <= 0) continue
      const total = categoryTotals.get(key.slice(0, separator)) || 0
      if (total > 0) normalizedUsage[key] = (normalizedUsage[key] || 0) + count / total
    }
  }

  return { ...merged, usageCount: normalizedUsage }
}
