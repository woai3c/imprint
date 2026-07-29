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
