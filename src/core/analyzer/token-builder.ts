import { type ClusteredColors, normalizeColorValue } from './color-cluster.js'
import { hasVisibleShadow } from './component-detect.js'
import type { ColorRoleObservation, ColorTokenCandidate, DesignToken, ExtractedStyles } from './types.js'
import { frequencyForCategory, sortByFrequency } from './usage-stats.js'

interface ParsedColor {
  channels: [number, number, number]
  alpha: number
}

function parseColor(value: string | undefined): ParsedColor | null {
  if (!value) return null
  const hex = value.match(/^#([\da-f]{6})$/i)
  if (hex) {
    return {
      channels: [0, 2, 4].map((offset) => Number.parseInt(hex[1].slice(offset, offset + 2), 16)) as [
        number,
        number,
        number,
      ],
      alpha: 1,
    }
  }

  const rgb = value.match(
    /^rgba?\(\s*(\d*\.?\d+)\s*(?:,\s*|\s+)(\d*\.?\d+)\s*(?:,\s*|\s+)(\d*\.?\d+)(?:\s*(?:,|\/)\s*(\d*\.?\d+))?\s*\)$/i,
  )
  if (!rgb) return null
  return {
    channels: [Number.parseFloat(rgb[1]), Number.parseFloat(rgb[2]), Number.parseFloat(rgb[3])],
    alpha: rgb[4] === undefined ? 1 : Number.parseFloat(rgb[4]),
  }
}

function colorsAreRelated(first: string, second: string): boolean {
  const firstRgb = parseColor(first)?.channels
  const secondRgb = parseColor(second)?.channels
  if (!firstRgb || !secondRgb) return false
  const distance = Math.sqrt(firstRgb.reduce((sum, channel, index) => sum + (channel - secondRgb[index]) ** 2, 0))
  return distance <= 96
}

function colorLuminance(value: string | undefined, backdrop?: string): number | null {
  const color = parseColor(value)
  if (!color) return null
  const backdropColor = parseColor(backdrop)
  const compositedChannels = color.channels.map((channel, index) => {
    if (color.alpha >= 1 || !backdropColor) return channel
    return channel * color.alpha + backdropColor.channels[index] * (1 - color.alpha)
  })
  const channels = compositedChannels.map((channel) => channel / 255)
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

export function colorContrast(first: string, second: string): number | null {
  const firstLuminance = colorLuminance(first, second)
  const secondLuminance = colorLuminance(second)
  if (firstLuminance === null || secondLuminance === null) return null
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function buildPrimaryActionColorRole(
  primary: string | undefined,
  styles: Pick<ExtractedStyles, 'colorRoleObservations'>,
  foreground: string | undefined,
): NonNullable<DesignToken['colorRoles']>['primaryAction'] | undefined {
  const normalizedPrimary = primary ? normalizeColorValue(primary) : null
  if (!normalizedPrimary) return undefined
  const matching = (styles.colorRoleObservations || []).filter(
    (observation) =>
      (observation.role === 'action' || observation.role === 'primary-action') &&
      observation.background !== undefined &&
      normalizeColorValue(observation.background) === normalizedPrimary,
  )
  if (matching.length === 0) return undefined

  const pairs = new Map<string, typeof matching>()
  for (const observation of matching) {
    const observedForeground = observation.foreground ? normalizeColorValue(observation.foreground) : undefined
    const key = `${normalizedPrimary}|${observedForeground || ''}`
    const observations = pairs.get(key) || []
    observations.push(observation)
    pairs.set(key, observations)
  }
  const selected = [...pairs.values()].sort((first, second) => {
    const firstPrimary = first.some((observation) => observation.role === 'primary-action') ? 1 : 0
    const secondPrimary = second.some((observation) => observation.role === 'primary-action') ? 1 : 0
    return secondPrimary - firstPrimary || second.length - first.length
  })[0]
  const observedForeground = selected[0].foreground
    ? normalizeColorValue(selected[0].foreground) || selected[0].foreground
    : undefined
  const contrast = observedForeground ? colorContrast(observedForeground, normalizedPrimary) : null
  const targetContrastRatio = 4.5
  // Keep near-threshold observed pairs faithful and report the warning. Swapping their foreground
  // to black would be a disproportionate visual change; stronger failures still get a derived option.
  const shouldRecommendDifferentForeground = contrast !== null && contrast < targetContrastRatio - 0.15
  const recommendation = shouldRecommendDifferentForeground
    ? [foreground, '#1a1a1a', '#000000', '#ffffff']
        .flatMap((candidate) => {
          const value = candidate ? normalizeColorValue(candidate) : null
          const candidateContrast = value ? colorContrast(value, normalizedPrimary) : null
          return value && candidateContrast !== null && candidateContrast >= targetContrastRatio
            ? [{ value, contrastRatio: Number(candidateContrast.toFixed(2)) }]
            : []
        })
        .find((candidate) => candidate.value !== observedForeground)
    : undefined

  return {
    observedBackground: normalizedPrimary,
    ...(observedForeground ? { observedForeground } : {}),
    ...(contrast !== null ? { contrastRatio: Number(contrast.toFixed(2)) } : {}),
    ...(contrast !== null && contrast < targetContrastRatio
      ? {
          contrastWarning: {
            targetContrastRatio,
            message: `Observed primary action contrast is below ${targetContrastRatio}:1 for normal text.`,
          },
        }
      : {}),
    ...(recommendation
      ? {
          recommendedOnPrimary: {
            ...recommendation,
            targetContrastRatio,
            derived: true as const,
          },
        }
      : {}),
    provenance: selected.map(({ captureId, elementRef, elementKind, role }) => ({
      captureId,
      elementRef,
      elementKind,
      role,
    })),
  }
}

type SemanticPairName = keyof NonNullable<NonNullable<DesignToken['colorRoles']>['semanticPairs']>

function buildSemanticColorPairs(
  observations: readonly ColorRoleObservation[] | undefined,
): NonNullable<NonNullable<DesignToken['colorRoles']>['semanticPairs']> | undefined {
  const groups = new Map<SemanticPairName, ColorRoleObservation[]>()
  for (const observation of observations || []) {
    if (observation.role !== 'status' || !observation.statusIntent) continue
    const kind = observation.statusKind || 'status'
    if (kind === 'delta' && !['positive', 'negative'].includes(observation.statusIntent)) continue
    const name = `${kind}-${observation.statusIntent}` as SemanticPairName
    const group = groups.get(name) || []
    group.push(observation)
    groups.set(name, group)
  }
  if (groups.size === 0) return undefined
  return Object.fromEntries(
    [...groups.entries()].map(([name, group]) => {
      const pairGroups = new Map<string, ColorRoleObservation[]>()
      for (const observation of group) {
        const background = observation.background ? normalizeColorValue(observation.background) : undefined
        const foreground = observation.foreground ? normalizeColorValue(observation.foreground) : undefined
        const key = `${background || ''}|${foreground || ''}`
        const pairGroup = pairGroups.get(key) || []
        pairGroup.push(observation)
        pairGroups.set(key, pairGroup)
      }
      const selected = [...pairGroups.values()].sort((first, second) => second.length - first.length)[0]
      const background = selected[0]?.background ? normalizeColorValue(selected[0].background) : undefined
      const foreground = selected[0]?.foreground ? normalizeColorValue(selected[0].foreground) : undefined
      return [
        name,
        {
          ...(background ? { observedBackground: background } : {}),
          ...(foreground ? { observedForeground: foreground } : {}),
          provenance: selected.map(({ captureId, elementRef, elementKind, role, statusKind, statusIntent }) => ({
            captureId,
            elementRef,
            elementKind,
            role,
            statusKind,
            statusIntent,
          })),
        },
      ]
    }),
  )
}

function hasObservedActionBackground(observations: readonly ColorRoleObservation[] | undefined): boolean {
  if (observations === undefined) return true
  return observations.some(
    (observation) =>
      (observation.role === 'action' || observation.role === 'primary-action') && Boolean(observation.background),
  )
}

function observedTextOnlyAccent(observations: readonly ColorRoleObservation[] | undefined): string | undefined {
  const frequency = new Map<string, number>()
  for (const observation of observations || []) {
    if (!['action', 'primary-action'].includes(observation.role) || observation.background || !observation.foreground)
      continue
    const foreground = normalizeColorValue(observation.foreground)
    if (!foreground || isNeutralColor(foreground)) continue
    frequency.set(foreground, (frequency.get(foreground) || 0) + 1)
  }
  return [...frequency.entries()].sort((first, second) => second[1] - first[1])[0]?.[0]
}

function observedSecondaryActionBackground(
  observations: readonly ColorRoleObservation[] | undefined,
  primary: string,
): string | undefined {
  const normalizedPrimary = normalizeColorValue(primary)
  const elementsByBackground = new Map<string, Set<string>>()
  for (const observation of observations || []) {
    if (observation.role !== 'action' || !observation.background) continue
    const background = normalizeColorValue(observation.background)
    if (!background || background === normalizedPrimary || isNeutralColor(background)) continue
    const elements = elementsByBackground.get(background) || new Set<string>()
    elements.add(observation.elementRef)
    elementsByBackground.set(background, elements)
  }
  const repeated = [...elementsByBackground]
    .map(([background, elements]) => [background, elements.size] as const)
    .filter(([, count]) => count >= 2)
  return repeated.sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))[0]?.[0]
}

function observedDestructiveActionColor(observations: readonly ColorRoleObservation[] | undefined): string | undefined {
  const scores = new Map<string, number>()
  for (const observation of observations || []) {
    if (observation.role !== 'destructive-action') continue
    for (const [value, weight] of [
      [observation.background, 4],
      [observation.borderColor, 2],
      [observation.foreground, 1],
    ] as const) {
      const normalized = value ? normalizeColorValue(value) : null
      if (!normalized) continue
      // Native controls often inherit ordinary neutral foregrounds, fills, and borders from the page or user agent.
      // A destructive label alone is not enough evidence to reinterpret those defaults as the system's danger color.
      if (isNeutralColor(normalized)) continue
      scores.set(normalized, (scores.get(normalized) || 0) + weight)
    }
  }
  return [...scores.entries()].sort(
    ([firstValue, firstScore], [secondValue, secondScore]) =>
      secondScore - firstScore || firstValue.localeCompare(secondValue),
  )[0]?.[0]
}

function hasColorUsageInCategories(
  styles: Pick<ExtractedStyles, 'usageCount' | 'colorRoleObservations'>,
  value: string,
  categories: readonly string[],
): boolean {
  if (styles.colorRoleObservations === undefined) return true
  const normalized = normalizeColorValue(value)
  if (!normalized) return false
  const renderedCategories = new Set(categories)
  return Object.entries(styles.usageCount).some(([key, count]) => {
    const separator = key.indexOf(':')
    if (separator < 0 || count <= 0 || !renderedCategories.has(key.slice(0, separator))) return false
    return normalizeColorValue(key.slice(separator + 1)) === normalized
  })
}

function isNeutralColor(value: string): boolean {
  const color = parseColor(value)
  if (!color) return false
  const maximum = Math.max(...color.channels)
  const minimum = Math.min(...color.channels)
  const colorChroma = maximum - minimum
  return colorChroma <= 24 || colorChroma / Math.max(1, maximum) <= 0.12
}

function observedForegroundsForBackground(
  background: string | undefined,
  observations: ExtractedStyles['textColorPairObservations'],
): string[] {
  const normalizedBackground = background ? normalizeColorValue(background) : null
  if (!normalizedBackground || !observations) return []
  const groups = new Map<
    string,
    { foreground: string; count: number; roleWeight: number; captures: Set<string>; contrast: number | null }
  >()
  const roleWeights = { body: 4, heading: 3, label: 2, other: 1 } as const
  for (const observation of observations) {
    if (normalizeColorValue(observation.background) !== normalizedBackground) continue
    const foreground = normalizeColorValue(observation.foreground)
    if (!foreground) continue
    const count = Number.isFinite(observation.count) && observation.count > 0 ? observation.count : 1
    const group = groups.get(foreground) || {
      foreground,
      count: 0,
      roleWeight: 0,
      captures: new Set<string>(),
      contrast: colorContrast(foreground, normalizedBackground),
    }
    group.count += count
    group.roleWeight += count * roleWeights[observation.textRole]
    group.captures.add(observation.captureId)
    groups.set(foreground, group)
  }
  const candidates = [...groups.values()]
  const readableCandidates = candidates.filter((candidate) => candidate.contrast !== null && candidate.contrast >= 3)
  return (readableCandidates.length > 0 ? readableCandidates : candidates)
    .sort(
      (first, second) =>
        second.captures.size - first.captures.size ||
        second.roleWeight - first.roleWeight ||
        second.count - first.count ||
        (second.contrast || 0) - (first.contrast || 0) ||
        first.foreground.localeCompare(second.foreground),
    )
    .map((candidate) => candidate.foreground)
}

function secondarySurface(background: string, surface: string, foreground: string | undefined): string {
  const backgroundLuminance = colorLuminance(background)
  const surfaceLuminance = colorLuminance(surface)
  const foregroundLuminance = colorLuminance(foreground)
  if (backgroundLuminance === null || surfaceLuminance === null || foregroundLuminance === null) return surface
  return Math.abs(backgroundLuminance - foregroundLuminance) < Math.abs(surfaceLuminance - foregroundLuminance)
    ? background
    : surface
}

function colorValueFromUsageKey(key: string): string {
  return key.slice(key.indexOf(':') + 1)
}

const RENDERED_COLOR_CATEGORIES = [
  'textColor',
  'bgColor',
  'bgArea',
  'borderColor',
  'structuralBorderColor',
  'accentColor',
  'linkColor',
  'selectedColor',
  'primaryActionBackgroundColor',
  'primaryActionForegroundColor',
  'actionBackgroundColor',
  'actionForegroundColor',
  'destructiveActionBackgroundColor',
  'destructiveActionForegroundColor',
  'statusBackgroundColor',
  'statusForegroundColor',
  'statusColor',
] as const

function colorUsageForCategory(styles: Pick<ExtractedStyles, 'usageCount'>, category: string, value: string): number {
  const normalized = normalizeColorValue(value)
  if (!normalized) return 0
  const prefix = `${category}:`
  return Object.entries(styles.usageCount).reduce((total, [key, count]) => {
    if (!key.startsWith(prefix)) return total
    return normalizeColorValue(key.slice(prefix.length)) === normalized ? total + count : total
  }, 0)
}

function colorSourcesForValue(
  styles: Pick<ExtractedStyles, 'valueSources'>,
  value: string,
  categories: readonly string[],
): string[] {
  const normalized = normalizeColorValue(value)
  if (!normalized) return []
  const categorySet = new Set(categories)
  const sources = new Set<string>()
  for (const [key, keySources] of Object.entries(styles.valueSources || {})) {
    const separator = key.indexOf(':')
    if (separator <= 0 || !categorySet.has(key.slice(0, separator))) continue
    if (normalizeColorValue(key.slice(separator + 1)) !== normalized) continue
    keySources.forEach((source) => sources.add(source))
  }
  return [...sources].sort()
}

function declaredOnlyColorCandidates(styles: ExtractedStyles): ColorTokenCandidate[] {
  const candidates = new Map<string, ColorTokenCandidate>()
  for (const [key, count] of Object.entries(styles.usageCount)) {
    if (!key.startsWith('declaredColor:') || !Number.isFinite(count) || count <= 0) continue
    const value = normalizeColorValue(key.slice('declaredColor:'.length))
    if (!value) continue
    const rendered = RENDERED_COLOR_CATEGORIES.reduce(
      (total, category) => total + colorUsageForCategory(styles, category, value),
      0,
    )
    if (rendered > 0) continue
    const existing = candidates.get(value)
    const sources = colorSourcesForValue(styles, value, ['declaredColor', 'brandTokenColor'])
    candidates.set(value, {
      value,
      kind: 'declared-only',
      observationCount: (existing?.observationCount || 0) + count,
      sources: [...new Set([...(existing?.sources || []), ...sources])].sort(),
    })
  }
  return [...candidates.values()].sort(
    (first, second) => second.observationCount - first.observationCount || first.value.localeCompare(second.value),
  )
}

function isMutedTextCandidate(
  background: string | undefined,
  foreground: string | undefined,
  candidate: string,
): boolean {
  const backgroundLuminance = colorLuminance(background)
  const foregroundLuminance = colorLuminance(foreground)
  const candidateLuminance = colorLuminance(candidate)
  if (backgroundLuminance === null || foregroundLuminance === null || candidateLuminance === null) return false
  if (backgroundLuminance > foregroundLuminance) {
    return candidateLuminance > foregroundLuminance + 0.005 && candidateLuminance < backgroundLuminance - 0.05
  }
  return candidateLuminance < foregroundLuminance - 0.005 && candidateLuminance > backgroundLuminance + 0.03
}

function numericSort(values: string[]): string[] {
  return values.sort((first, second) => Number.parseFloat(first) - Number.parseFloat(second))
}

function normalizeComputedLength(value: string): string {
  const match = value.trim().match(/^(-?\d*\.?\d+)px$/i)
  if (!match) return value
  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount)) return value
  const nearestHalfPixel = Math.round(amount * 2) / 2
  const normalized = Math.abs(amount - nearestHalfPixel) <= 0.1 ? nearestHalfPixel : Number(amount.toFixed(3))
  return `${Object.is(normalized, -0) ? 0 : normalized}px`
}

function normalizeLengthFrequency(frequency: ReadonlyMap<string, number>): Map<string, number> {
  const normalized = new Map<string, number>()
  for (const [value, count] of frequency) {
    const key = normalizeComputedLength(value)
    normalized.set(key, (normalized.get(key) || 0) + count)
  }
  return normalized
}

function selectFrequencyCoverage(
  frequency: ReadonlyMap<string, number>,
  candidates: readonly string[],
  minimum: number,
  limit: number,
  targetCoverage: number,
): string[] {
  const entries = candidates
    .map((value) => [value, frequency.get(value) || 0] as const)
    .filter(([, count]) => count > 0)
    .sort(
      ([firstValue, firstCount], [secondValue, secondCount]) =>
        secondCount - firstCount || firstValue.localeCompare(secondValue, 'en'),
    )
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  const selected: string[] = []
  let covered = 0
  for (const [value, count] of entries) {
    if (selected.length >= limit) break
    if (selected.length >= minimum && total > 0 && covered / total >= targetCoverage) break
    selected.push(value)
    covered += count
  }
  return selected
}

function prioritizedTypographyValues(
  styles: ExtractedStyles,
  general: ReadonlyMap<string, number>,
  displayCategory: 'displayFontSize' | 'displayFontWeight',
  headingCategory: 'headingFontSize' | 'headingFontWeight',
  limit: number,
  normalize: (frequency: ReadonlyMap<string, number>) => ReadonlyMap<string, number> = (frequency) => frequency,
  minimumGeneral = 2,
  targetCoverage = 0.94,
): string[] {
  const display = sortByFrequency(normalize(frequencyForCategory(styles, displayCategory))).slice(0, 1)
  const headings = sortByFrequency(normalize(frequencyForCategory(styles, headingCategory))).slice(0, 3)
  const frequent = selectFrequencyCoverage(general, sortByFrequency(general), minimumGeneral, limit, targetCoverage)
  return [...display, ...headings, ...frequent].filter(uniqueFilter()).slice(0, limit)
}

function normalizedValueSources(styles: ExtractedStyles, category: 'spacing' | 'radius', value: string): Set<string> {
  const sources = new Set<string>()
  const prefix = `${category}:`
  for (const [key, keySources] of Object.entries(styles.valueSources || {})) {
    if (!key.startsWith(prefix) || normalizeComputedLength(key.slice(prefix.length)) !== value) continue
    keySources.forEach((source) => sources.add(source))
  }
  return sources
}

function normalizedValueSourceCounts(
  styles: ExtractedStyles,
  category: 'spacing' | 'radius',
  value: string,
): Map<string, number> {
  const counts = new Map<string, number>()
  const prefix = `${category}:`
  for (const [key, keySourceCounts] of Object.entries(styles.valueSourceCounts || {})) {
    if (!key.startsWith(prefix) || normalizeComputedLength(key.slice(prefix.length)) !== value) continue
    for (const [source, count] of Object.entries(keySourceCounts)) {
      if (!Number.isFinite(count) || count <= 0) continue
      counts.set(source, (counts.get(source) || 0) + count)
    }
  }
  return counts
}

function normalizedUsageGroupCount(styles: ExtractedStyles, category: string, value: string): number {
  const prefix = `${category}:`
  let groups = 0
  for (const [key, count] of Object.entries(styles.usageGroupCounts || {})) {
    if (!key.startsWith(prefix) || normalizeComputedLength(key.slice(prefix.length)) !== value) continue
    if (Number.isFinite(count) && count > 0) groups += count
  }
  return groups
}

function hasReusableSpacingScope(styles: ExtractedStyles, value: string): boolean {
  const counts = normalizedValueSourceCounts(styles, 'spacing', value)
  if (counts.size === 0) {
    const sources = normalizedValueSources(styles, 'spacing', value)
    return (
      sources.size === 0 ||
      [...sources].some((source) => !['element:control-spacing', 'element:specialized-spacing'].includes(source))
    )
  }
  const control = counts.get('element:control-spacing') || 0
  const specialized = counts.get('element:specialized-spacing') || 0
  const structural = counts.get('element:structural-spacing') || 0
  const reusable = [...counts.entries()].reduce(
    (total, [source, count]) =>
      total + (['element:control-spacing', 'element:specialized-spacing'].includes(source) ? 0 : count),
    0,
  )
  const local = control + specialized
  if (styles.usageGroupCounts && Number.parseFloat(value) < 2) {
    const groupCount = normalizedUsageGroupCount(styles, 'spacing', value)
    return groupCount >= 2 && structural >= 2 && structural / Math.max(reusable + local, 1) >= 0.25
  }
  if (local === 0) return reusable > 0
  return reusable >= 2 && reusable / (local + reusable) >= 0.25
}

function hasStrongCrossPageStructuralSpacing(styles: ExtractedStyles, value: string): boolean {
  if (!styles.usageGroupCounts) return false
  const counts = normalizedValueSourceCounts(styles, 'spacing', value)
  const structural = counts.get('element:structural-spacing') || 0
  return structural >= 2 && normalizedUsageGroupCount(styles, 'spacing', value) >= 2
}

function hasReusableRadiusScope(styles: ExtractedStyles, value: string): boolean {
  const counts = normalizedValueSourceCounts(styles, 'radius', value)
  if (counts.size === 0) {
    const sources = normalizedValueSources(styles, 'radius', value)
    return !sources.has('geometry:circle-or-pill') || sources.has('computed:ordinary-radius')
  }
  const geometry = counts.get('geometry:circle-or-pill') || 0
  const ordinary = counts.get('computed:ordinary-radius') || 0
  if (geometry === 0) return ordinary > 0
  return ordinary >= 2 && ordinary / (geometry + ordinary) >= 0.25
}

function isScalarLength(value: string): boolean {
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)$/i.test(value.trim())
}

function isStableFoundationSpacing(value: string): boolean {
  const match = value.trim().match(/^(\d*\.?\d+)(px|rem|em)$/i)
  if (!match) return false
  if (match[2].toLowerCase() !== 'px') return true
  const amount = Number.parseFloat(match[1])
  return Number.isFinite(amount) && Math.abs(amount * 2 - Math.round(amount * 2)) <= 0.01
}

function inferredSpacingRhythm(values: readonly string[]): string[] {
  const numeric = values.flatMap((value) => {
    const match = value.match(/^(\d*\.?\d+)px$/i)
    return match ? [[value, Number.parseFloat(match[1])] as const] : []
  })
  let best: { step: number; values: string[] } | undefined
  for (const step of [8, 6, 5, 4, 3, 2]) {
    const aligned = numeric.filter(([, amount]) => Math.abs(amount / step - Math.round(amount / step)) <= 0.01)
    if (aligned.length >= 4 && aligned.length / Math.max(numeric.length, 1) >= 0.45) {
      const alignedValues = aligned.map(([value]) => value)
      if (!best || alignedValues.length > best.values.length) best = { step, values: alignedValues }
    }
  }
  return best?.values || []
}

export function normalizeDesignTokenUsageCount(usageCount: Readonly<Record<string, number>>): Record<string, number> {
  const normalized: Record<string, number> = {}
  for (const [key, count] of Object.entries(usageCount)) {
    const match = /^(spacing|radius):(.*)$/.exec(key)
    const normalizedKey = match ? `${match[1]}:${normalizeComputedLength(match[2])}` : key
    normalized[normalizedKey] = (normalized[normalizedKey] || 0) + count
  }
  return normalized
}

function durationInMilliseconds(value: string): number {
  const match = value.trim().match(/^(\d*\.?\d+)(ms|s)$/)
  if (!match) return Number.POSITIVE_INFINITY
  const amount = Number.parseFloat(match[1])
  return match[2] === 's' ? amount * 1000 : amount
}

function shadowElevation(value: string): number {
  const lengths = [...value.matchAll(/(-?\d*\.?\d+)px/g)].map((match) => Math.abs(Number.parseFloat(match[1])))
  if (lengths.length === 0) return Number.POSITIVE_INFINITY
  let score = 0
  for (let index = 0; index < lengths.length; index += 4) {
    const x = lengths[index] || 0
    const y = lengths[index + 1] || 0
    const blur = lengths[index + 2] || 0
    const spread = lengths[index + 3] || 0
    score += x * 0.25 + y + blur * 2 + spread
  }
  return score
}

function pairedLineHeightFrequency(styles: ExtractedStyles): Map<string, number> {
  const frequency = new Map<string, number>()
  for (const [key, count] of Object.entries(styles.usageCount)) {
    if (!key.startsWith('typeMetric:') || !Number.isFinite(count) || count <= 0) continue
    const [fontSize, lineHeight] = key.slice('typeMetric:'.length).split('|')
    const fontSizePx = fontSize?.match(/^(\d*\.?\d+)px$/)
    const lineHeightPx = lineHeight?.match(/^(\d*\.?\d+)px$/)
    if (!fontSizePx || !lineHeightPx) continue
    const ratio = Number.parseFloat(lineHeightPx[1]) / Number.parseFloat(fontSizePx[1])
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 4) continue
    const normalized = ratio.toFixed(3).replace(/\.?0+$/, '')
    frequency.set(normalized, (frequency.get(normalized) || 0) + count)
  }
  return frequency
}

/**
 * Build structured design tokens from raw extracted styles.
 * Deterministic program implementation.
 */
export function buildDesignTokens(
  styles: ExtractedStyles,
  clusteredColors: ClusteredColors,
  roleStyles: Pick<ExtractedStyles, 'usageCount' | 'colorRoleObservations' | 'textColorPairObservations'> = styles,
): DesignToken {
  // Build color map
  const colors: Record<string, string> = {}

  // Assign backgrounds
  if (clusteredColors.backgrounds.length > 0) {
    colors['background'] = clusteredColors.backgrounds[0]
    if (
      clusteredColors.backgrounds.length > 1 &&
      colorsAreRelated(clusteredColors.backgrounds[0], clusteredColors.backgrounds[1])
    ) {
      colors['surface'] = clusteredColors.backgrounds[1]
    }
  }

  // Assign text colors
  if (clusteredColors.texts.length > 0) {
    const observedForegrounds = observedForegroundsForBackground(
      colors['background'],
      roleStyles.textColorPairObservations,
    )
    const foreground =
      observedForegrounds[0] ||
      (roleStyles.textColorPairObservations === undefined ? clusteredColors.texts[0] : undefined)
    if (foreground) colors['foreground'] = foreground
    const mutedCandidates =
      roleStyles.textColorPairObservations === undefined ? clusteredColors.texts : observedForegrounds.slice(1)
    const mutedForeground = mutedCandidates
      .filter((candidate) => normalizeColorValue(candidate) !== normalizeColorValue(foreground || ''))
      .find((candidate) => isMutedTextCandidate(colors['background'], colors['foreground'], candidate))
    if (mutedForeground) colors['muted-foreground'] = mutedForeground
  }
  if (colors['background'] && colors['surface']) {
    colors['secondary'] = secondarySurface(colors['background'], colors['surface'], colors['foreground'])
  }

  // A primary action is optional. Generic palette, decorative, border, and text-only
  // accents must not be promoted to an action role merely because they are chromatic.
  if (clusteredColors.accents.length > 0) {
    if (hasObservedActionBackground(roleStyles.colorRoleObservations)) {
      colors['primary'] = clusteredColors.accents[0]
      const secondaryAccent =
        observedSecondaryActionBackground(roleStyles.colorRoleObservations, colors['primary']) ||
        clusteredColors.accents
          .slice(1)
          .find((candidate) =>
            hasColorUsageInCategories(roleStyles, candidate, [
              'primaryActionBackgroundColor',
              'actionBackgroundColor',
              'selectedColor',
            ]),
          )
      if (secondaryAccent) colors['accent'] = secondaryAccent
    } else {
      colors['editorial-accent'] = clusteredColors.accents[0]
      const decorativeAccent = clusteredColors.accents
        .slice(1)
        .find((candidate) => hasColorUsageInCategories(roleStyles, candidate, ['accentColor', 'bgColor', 'bgArea']))
      if (decorativeAccent) colors['decorative-accent'] = decorativeAccent
    }
  }
  if (!colors.primary && !colors['editorial-accent']) {
    const editorialAccent = observedTextOnlyAccent(roleStyles.colorRoleObservations)
    if (editorialAccent) colors['editorial-accent'] = editorialAccent
  }
  const destructiveActionColor = observedDestructiveActionColor(roleStyles.colorRoleObservations)
  if (destructiveActionColor) colors['danger'] = destructiveActionColor

  // Prefer borders observed outside controls. Action/focus borders belong to the primary or ring role and should not
  // become the default boundary for every card, table row, and navigation region in a validation scenario.
  const borderColorStats = new Map<string, { observed: number; structural: number }>()
  for (const [key, count] of Object.entries(roleStyles.usageCount)) {
    const structural = key.startsWith('structuralBorderColor:')
    if (!structural && !key.startsWith('borderColor:')) continue
    const value = colorValueFromUsageKey(key)
    const stats = borderColorStats.get(value) || { observed: 0, structural: 0 }
    if (structural) stats.structural += count
    else stats.observed += count
    borderColorStats.set(value, stats)
  }
  const observedBorderColorEntries = [...borderColorStats.entries()]
    .map(([value, stats]) => [`borderColor:${value}`, stats.observed + stats.structural * 2] as const)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
  const neutralBorderColorEntries = observedBorderColorEntries.filter(([key]) =>
    isNeutralColor(colorValueFromUsageKey(key)),
  )
  const borderColorEntries =
    neutralBorderColorEntries.length > 0 ? neutralBorderColorEntries : observedBorderColorEntries
  if (borderColorEntries.length > 0) {
    const subtleBorder = colorValueFromUsageKey(borderColorEntries[0][0])
    const borderReference = colors['surface'] || colors['background']
    const defaultBorderEntry = borderColorEntries.find(([key]) => {
      if (!borderReference) return true
      const contrast = colorContrast(colorValueFromUsageKey(key), borderReference)
      return contrast === null || contrast >= 1.1
    })
    const defaultBorder = colorValueFromUsageKey((defaultBorderEntry || borderColorEntries[0])[0])
    colors['border'] = defaultBorder
    if (subtleBorder !== defaultBorder) colors['border-subtle'] = subtleBorder
  }

  // Keep unassigned rendered colors as candidates instead of promoting every observed hue
  // into the portable design system. This retains evidence such as editorial or code colors
  // without presenting it as a reusable semantic token.
  const takenColors = new Set(Object.values(colors).map((value) => normalizeColorValue(value) || value))
  const observedColorCandidates = clusteredColors.palette.flatMap<ColorTokenCandidate>((item) => {
    const normalized = normalizeColorValue(item.hex) || item.hex
    if (takenColors.has(normalized)) return []
    return [
      {
        value: normalized,
        kind: 'observed-unassigned',
        observationCount: item.count,
        sources: colorSourcesForValue(styles, normalized, RENDERED_COLOR_CATEGORIES),
      },
    ]
  })
  const colorCandidates = [...declaredOnlyColorCandidates(styles), ...observedColorCandidates]

  // Typography - sort by frequency and pick unique values
  // Computed font sizes frequently contain sub-pixel layout noise (for example
  // 11.9062px beside an authored 12px). Normalize that noise before creating a
  // reusable scale so one intended size cannot become two tokens.
  const fontSizeFreq = normalizeLengthFrequency(frequencyForCategory(styles, 'fontSize', styles.fontSizes))
  const sortedFontSizes = numericSort(
    prioritizedTypographyValues(
      styles,
      fontSizeFreq,
      'displayFontSize',
      'headingFontSize',
      8,
      normalizeLengthFrequency,
      3,
      0.92,
    )
      .map(pxToRem)
      .filter(uniqueFilter()),
  )

  const fontWeightFreq = frequencyForCategory(styles, 'fontWeight', styles.fontWeights)
  const sortedFontWeights = numericSort(
    prioritizedTypographyValues(styles, fontWeightFreq, 'displayFontWeight', 'headingFontWeight', 5),
  )

  const pairedLineHeights = pairedLineHeightFrequency(styles)
  const lineHeightFreq =
    pairedLineHeights.size > 0 ? pairedLineHeights : frequencyForCategory(styles, 'lineHeight', styles.lineHeights)
  const sortedLineHeights = numericSort(
    selectFrequencyCoverage(lineHeightFreq, sortByFrequency(lineHeightFreq), 2, 5, 0.94).filter(uniqueFilter()),
  )

  // Spacing - extract unique values, sort numerically
  const spacingFreq = normalizeLengthFrequency(frequencyForCategory(styles, 'spacing', styles.spacings))
  const reusableSpacingCandidates = sortByFrequency(spacingFreq)
    .filter((v) => {
      if (!isScalarLength(v)) return false
      const num = parseFloat(v)
      return !isNaN(num) && num > 0 && num <= 96
    })
    .filter((value) => hasReusableSpacingScope(styles, value))
    .filter((value) => isStableFoundationSpacing(value) || hasStrongCrossPageStructuralSpacing(styles, value))
    .filter(uniqueFilter())
  const coveredSpacings = selectFrequencyCoverage(spacingFreq, reusableSpacingCandidates, 4, 12, 0.9)
  const spacings = [
    ...coveredSpacings,
    ...inferredSpacingRhythm(reusableSpacingCandidates),
    ...reusableSpacingCandidates.filter((value) => hasStrongCrossPageStructuralSpacing(styles, value)),
  ]
    .filter(uniqueFilter())
    .sort((first, second) => (spacingFreq.get(second) || 0) - (spacingFreq.get(first) || 0))
    .slice(0, 12)
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Radii
  const radiusFreq = normalizeLengthFrequency(frequencyForCategory(styles, 'radius', styles.radii))
  const radii = sortByFrequency(radiusFreq)
    .filter((v) => parseFloat(v) > 0)
    .filter((value) => hasReusableRadiusScope(styles, value))
    .filter(uniqueFilter())
    .slice(0, 5)
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Shadows - deduplicate
  const shadowFreq = frequencyForCategory(styles, 'shadow', styles.shadows)
  const shadows = sortByFrequency(shadowFreq)
    .filter(hasVisibleShadow)
    .slice(0, 4)
    .sort((first, second) => shadowElevation(first) - shadowElevation(second))

  // Borders
  const borderFreq = frequencyForCategory(styles, 'border', styles.borders)
  const borders = sortByFrequency(borderFreq).slice(0, 4)

  // Font families - keep both primary names and full stacks
  const observedTextFamilies = frequencyForCategory(styles, 'fontTextFamily')
  const fontFamilyFrequency =
    observedTextFamilies.size > 0
      ? observedTextFamilies
      : frequencyForCategory(styles, 'fontFamily', styles.fontFamilies)
  const fontStacks = sortByFrequency(fontFamilyFrequency)
    .map((f) => f.replace(/"/g, '').trim())
    .filter((stack) => !/^(?:inherit|initial|unset|revert|revert-layer)$/i.test(stack))
    .filter(uniqueFilter())
    .slice(0, 5)

  const fontFamilies = fontStacks
    .map((stack) => stack.split(',')[0].trim())
    .filter(uniqueFilter())
    .slice(0, 5)

  // Letter spacing
  const letterSpacingFreq = frequencyForCategory(styles, 'letterSpacing', styles.letterSpacings || [])
  const letterSpacings = sortByFrequency(letterSpacingFreq)
    .filter(uniqueFilter())
    .slice(0, 6)
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Z-index layers
  const zIndexFreq = frequencyForCategory(styles, 'zIndex', styles.zIndices || [])
  const zIndices = sortByFrequency(zIndexFreq)
    .filter(uniqueFilter())
    .slice(0, 8)
    .sort((a, b) => parseInt(a) - parseInt(b))

  // Transitions
  const transitionFreq = frequencyForCategory(styles, 'transition', styles.transitions || [])
  const transitions = sortByFrequency(transitionFreq)
    .filter(uniqueFilter())
    .slice(0, 6)
    .sort((first, second) => durationInMilliseconds(first) - durationInMilliseconds(second))
  const primaryAction = buildPrimaryActionColorRole(colors.primary, roleStyles, colors.foreground)
  const semanticPairs = buildSemanticColorPairs(roleStyles.colorRoleObservations)

  return {
    colors,
    typography: {
      fontFamilies,
      fontStacks,
      fontSizes: sortedFontSizes,
      fontWeights: sortedFontWeights,
      lineHeights: sortedLineHeights,
      letterSpacings,
    },
    spacing: spacings,
    radii,
    shadows,
    borders,
    zIndices,
    transitions,
    ...(colorCandidates.length > 0 ? { candidates: { colors: colorCandidates } } : {}),
    ...(primaryAction || semanticPairs
      ? { colorRoles: { ...(primaryAction ? { primaryAction } : {}), ...(semanticPairs ? { semanticPairs } : {}) } }
      : {}),
    usageCount: normalizeDesignTokenUsageCount(styles.usageCount),
  }
}

function pxToRem(value: string): string {
  const px = parseFloat(value)
  if (isNaN(px)) return value
  return `${(px / 16).toFixed(3).replace(/\.?0+$/, '')}rem`
}

function uniqueFilter() {
  const seen = new Set<string>()
  return (val: string) => {
    if (seen.has(val)) return false
    seen.add(val)
    return true
  }
}
