import type { ColorRoleObservation, ExtractedStyles } from './types.js'
import { normalizeLengthUsageKey } from './value-normalization.js'

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

function colorRoleSelectionFamily(observation: ColorRoleObservation): string {
  if (observation.role === 'status') {
    return `status:${observation.statusKind || 'status'}:${observation.statusIntent || ''}`
  }
  if (observation.role === 'destructive-action') return 'destructive-action'
  return 'action'
}

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
    usageGroupCounts: {},
    valueSources: {},
    valueSourceCounts: {},
    colorRoleObservations: [],
    textColorPairObservations: [],
  }

  for (const styles of stylesList) {
    for (const field of MERGED_ARRAY_FIELDS) {
      merged[field].push(...(styles[field] || []))
    }
    Object.assign(merged.cssVariables, styles.cssVariables)
    for (const [key, count] of Object.entries(styles.usageCount)) {
      merged.usageCount[key] = (merged.usageCount[key] || 0) + count
    }
    for (const [key, count] of Object.entries(styles.usageGroupCounts || {})) {
      merged.usageGroupCounts![key] = (merged.usageGroupCounts![key] || 0) + count
    }
    for (const [key, sources] of Object.entries(styles.valueSources || {})) {
      merged.valueSources![key] = [...new Set([...(merged.valueSources![key] || []), ...sources])]
    }
    for (const [key, sourceCounts] of Object.entries(styles.valueSourceCounts || {})) {
      const mergedSourceCounts = merged.valueSourceCounts![key] || {}
      for (const [source, count] of Object.entries(sourceCounts)) {
        if (!Number.isFinite(count) || count <= 0) continue
        mergedSourceCounts[source] = (mergedSourceCounts[source] || 0) + count
      }
      merged.valueSourceCounts![key] = mergedSourceCounts
    }
    merged.colorRoleObservations!.push(...(styles.colorRoleObservations || []))
    merged.textColorPairObservations!.push(...(styles.textColorPairObservations || []))
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
  const textColorPairs = new Map<string, NonNullable<ExtractedStyles['textColorPairObservations']>[number]>()
  for (const observation of merged.textColorPairObservations || []) {
    const key = JSON.stringify([
      observation.captureId,
      observation.background,
      observation.foreground,
      observation.textRole,
    ])
    const existing = textColorPairs.get(key)
    textColorPairs.set(key, {
      ...observation,
      count: (existing?.count || 0) + observation.count,
    })
  }
  merged.textColorPairObservations = [...textColorPairs.values()]

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
  const usageGroupCounts: Record<string, number> = {}
  const groupedUsage = new Map<string, Map<string, number>>()
  const groupedCategoryCounts = new Map<string, number>()
  const groupedValueSourceCategoryCounts = new Map<string, number>()
  const groupedValueSourceCounts = new Map<
    string,
    { groupKey: string; key: string; category: string; source: string; count: number }
  >()
  const groupedTextPairCaptureCounts = new Map<string, number>()
  const groupedTextPairs = new Map<string, NonNullable<ExtractedStyles['textColorPairObservations']>[number]>()
  const groupedColorRoleCaptureCounts = new Map<string, number>()
  const groupedColorRoles: Array<{
    observation: ColorRoleObservation
    groupKey: string
    family: string
    captureFamilyCount: number
  }> = []

  for (let index = 0; index < stylesList.length; index += 1) {
    const styles = stylesList[index]
    const groupKey = groupKeys[index] || String(index)
    const captureColorRoles = new Map<string, ColorRoleObservation>()
    for (const observation of styles.colorRoleObservations || []) {
      const key = JSON.stringify([
        observation.elementRef,
        observation.elementKind,
        observation.role,
        observation.statusKind,
        observation.statusIntent,
        observation.background,
        observation.foreground,
        observation.borderColor,
      ])
      if (!captureColorRoles.has(key)) captureColorRoles.set(key, observation)
    }
    const captureColorRoleFamilies = new Map<string, number>()
    for (const observation of captureColorRoles.values()) {
      const family = colorRoleSelectionFamily(observation)
      captureColorRoleFamilies.set(family, (captureColorRoleFamilies.get(family) || 0) + 1)
    }
    for (const observation of captureColorRoles.values()) {
      const family = colorRoleSelectionFamily(observation)
      groupedColorRoles.push({
        observation,
        groupKey,
        family,
        captureFamilyCount: captureColorRoleFamilies.get(family) || 1,
      })
    }
    for (const family of captureColorRoleFamilies.keys()) {
      const key = JSON.stringify([groupKey, family])
      groupedColorRoleCaptureCounts.set(key, (groupedColorRoleCaptureCounts.get(key) || 0) + 1)
    }
    const textColorPairs = (styles.textColorPairObservations || []).filter(
      (observation) => Number.isFinite(observation.count) && observation.count > 0,
    )
    const textColorPairTotal = textColorPairs.reduce((sum, observation) => sum + observation.count, 0)
    if (textColorPairTotal > 0) {
      groupedTextPairCaptureCounts.set(groupKey, (groupedTextPairCaptureCounts.get(groupKey) || 0) + 1)
      for (const observation of textColorPairs) {
        const key = JSON.stringify([groupKey, observation.background, observation.foreground, observation.textRole])
        const existing = groupedTextPairs.get(key)
        groupedTextPairs.set(key, {
          ...observation,
          captureId: groupKey,
          count: (existing?.count || 0) + observation.count / textColorPairTotal,
        })
      }
    }
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
      const normalizedKey = normalizeLengthUsageKey(key)
      const groupUsage = groupedUsage.get(groupKey) || new Map<string, number>()
      groupUsage.set(normalizedKey, (groupUsage.get(normalizedKey) || 0) + count / total)
      groupedUsage.set(groupKey, groupUsage)
    }
    for (const category of categoryTotals.keys()) {
      const categoryKey = `${groupKey}\u0000${category}`
      groupedCategoryCounts.set(categoryKey, (groupedCategoryCounts.get(categoryKey) || 0) + 1)
    }

    const sourceCategories = new Set<string>()
    for (const [key, sourceCounts] of Object.entries(styles.valueSourceCounts || {})) {
      const separator = key.indexOf(':')
      if (separator <= 0) continue
      const category = key.slice(0, separator)
      const normalizedKey = normalizeLengthUsageKey(key)
      for (const [source, count] of Object.entries(sourceCounts)) {
        if (!Number.isFinite(count) || count <= 0) continue
        const compositeKey = JSON.stringify([groupKey, normalizedKey, source])
        const existing = groupedValueSourceCounts.get(compositeKey)
        groupedValueSourceCounts.set(compositeKey, {
          groupKey,
          key: normalizedKey,
          category,
          source,
          count: (existing?.count || 0) + count,
        })
        sourceCategories.add(category)
      }
    }
    for (const category of sourceCategories) {
      const categoryKey = `${groupKey}\u0000${category}`
      groupedValueSourceCategoryCounts.set(categoryKey, (groupedValueSourceCategoryCounts.get(categoryKey) || 0) + 1)
    }
  }

  for (const [groupKey, groupUsage] of groupedUsage) {
    for (const [key, count] of groupUsage) {
      const separator = key.indexOf(':')
      const category = key.slice(0, separator)
      const divisor = groupedCategoryCounts.get(`${groupKey}\u0000${category}`) || 1
      normalizedUsage[key] = (normalizedUsage[key] || 0) + count / divisor
      usageGroupCounts[key] = (usageGroupCounts[key] || 0) + 1
    }
  }

  const normalizedValueSourceCounts: Record<string, Record<string, number>> = {}
  for (const { groupKey, key, category, source, count } of groupedValueSourceCounts.values()) {
    const divisor = groupedValueSourceCategoryCounts.get(`${groupKey}\u0000${category}`) || 1
    const sourceCounts = normalizedValueSourceCounts[key] || {}
    sourceCounts[source] = (sourceCounts[source] || 0) + count / divisor
    normalizedValueSourceCounts[key] = sourceCounts
  }

  return {
    ...merged,
    colorRoleObservations: groupedColorRoles.map(({ observation, groupKey, family, captureFamilyCount }) => ({
      ...observation,
      selectionGroup: groupKey,
      selectionWeight:
        1 / ((groupedColorRoleCaptureCounts.get(JSON.stringify([groupKey, family])) || 1) * captureFamilyCount),
    })),
    textColorPairObservations: [...groupedTextPairs.values()].map((observation) => ({
      ...observation,
      count: observation.count / (groupedTextPairCaptureCounts.get(observation.captureId) || 1),
    })),
    usageCount: Object.fromEntries(
      Object.entries(normalizedUsage).sort(([first], [second]) => first.localeCompare(second)),
    ),
    usageGroupCounts: Object.fromEntries(
      Object.entries(usageGroupCounts).sort(([first], [second]) => first.localeCompare(second)),
    ),
    valueSourceCounts: Object.fromEntries(
      Object.entries(normalizedValueSourceCounts)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, sourceCounts]) => [
          key,
          Object.fromEntries(Object.entries(sourceCounts).sort(([first], [second]) => first.localeCompare(second))),
        ]),
    ),
  }
}
