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
    valueSources: {},
    colorRoleObservations: [],
  }

  for (const styles of stylesList) {
    for (const field of MERGED_ARRAY_FIELDS) {
      merged[field].push(...(styles[field] || []))
    }
    Object.assign(merged.cssVariables, styles.cssVariables)
    for (const [key, count] of Object.entries(styles.usageCount)) {
      merged.usageCount[key] = (merged.usageCount[key] || 0) + count
    }
    for (const [key, sources] of Object.entries(styles.valueSources || {})) {
      merged.valueSources![key] = [...new Set([...(merged.valueSources![key] || []), ...sources])]
    }
    merged.colorRoleObservations!.push(...(styles.colorRoleObservations || []))
  }

  for (const field of DEDUPED_ARRAY_FIELDS) {
    merged[field] = [...new Set(merged[field])]
  }
  merged.colorRoleObservations = [
    ...new Map(
      (merged.colorRoleObservations || []).map((observation) => [
        `${observation.captureId}|${observation.elementRef}|${observation.role}`,
        observation,
      ]),
    ).values(),
  ]

  return merged
}

/**
 * Merge style values while giving every URL one vote per usage category.
 * Repeated viewport captures of the same URL are averaged first, preventing
 * adaptive captures from changing token rankings merely by adding a viewport.
 */
export function mergeStylesWithNormalizedUsage(
  stylesList: ExtractedStyles[],
  groupKeys: readonly string[] = stylesList.map((_styles, index) => String(index)),
): ExtractedStyles {
  const merged = mergeStyles(stylesList)
  const normalizedUsage: Record<string, number> = {}
  const groupedUsage = new Map<string, Map<string, number>>()
  const groupedCategoryCounts = new Map<string, number>()

  for (let index = 0; index < stylesList.length; index += 1) {
    const styles = stylesList[index]
    const groupKey = groupKeys[index] || String(index)
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
      const category = key.slice(0, separator)
      const total = categoryTotals.get(category) || 0
      if (total <= 0) continue
      const groupUsage = groupedUsage.get(groupKey) || new Map<string, number>()
      groupUsage.set(key, (groupUsage.get(key) || 0) + count / total)
      groupedUsage.set(groupKey, groupUsage)
    }
    for (const category of categoryTotals.keys()) {
      const categoryKey = `${groupKey}\u0000${category}`
      groupedCategoryCounts.set(categoryKey, (groupedCategoryCounts.get(categoryKey) || 0) + 1)
    }
  }

  for (const [groupKey, groupUsage] of groupedUsage) {
    for (const [key, count] of groupUsage) {
      const separator = key.indexOf(':')
      const category = key.slice(0, separator)
      const divisor = groupedCategoryCounts.get(`${groupKey}\u0000${category}`) || 1
      normalizedUsage[key] = (normalizedUsage[key] || 0) + count / divisor
    }
  }

  return {
    ...merged,
    usageCount: Object.fromEntries(
      Object.entries(normalizedUsage).sort(([first], [second]) => first.localeCompare(second)),
    ),
  }
}
