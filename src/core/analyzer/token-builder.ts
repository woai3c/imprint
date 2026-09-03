import { type ClusteredColors, normalizeColorValue } from './color-cluster.js'
import { hasVisibleShadow } from './component-detect.js'
import { normalizeCssFontFamilyList, normalizeCssFontFamilyName, primaryCssFontFamily } from './font-family.js'
import type { ColorRoleObservation, ColorTokenCandidate, DesignToken, ExtractedStyles } from './types.js'
import { frequencyForCategory, sortByFrequency } from './usage-stats.js'
import { normalizeComputedLength, normalizeLengthUsageKey } from './value-normalization.js'

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

export function colorsAreRelated(first: string, second: string): boolean {
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

function colorRoleSelectionWeight(observation: ColorRoleObservation): number {
  const weight = observation.selectionWeight
  return weight !== undefined && Number.isFinite(weight) && weight > 0 ? weight : 1
}

function colorRoleSelectionGroup(observation: ColorRoleObservation): string {
  return observation.selectionGroup || observation.captureId
}

function colorRoleGroupSupport(observations: readonly ColorRoleObservation[]): number {
  return new Set(observations.map(colorRoleSelectionGroup)).size
}

function colorRoleGroupWeight(observations: readonly ColorRoleObservation[]): number {
  return observations.reduce((sum, observation) => sum + colorRoleSelectionWeight(observation), 0)
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
      observation.role === 'primary-action' &&
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
  const selected = [...pairs.entries()].sort(([firstKey, first], [secondKey, second]) => {
    const firstPrimary = first.some((observation) => observation.role === 'primary-action') ? 1 : 0
    const secondPrimary = second.some((observation) => observation.role === 'primary-action') ? 1 : 0
    const firstForeground = first[0].foreground ? normalizeColorValue(first[0].foreground) : null
    const secondForeground = second[0].foreground ? normalizeColorValue(second[0].foreground) : null
    const firstContrast = firstForeground ? colorContrast(firstForeground, normalizedPrimary) : null
    const secondContrast = secondForeground ? colorContrast(secondForeground, normalizedPrimary) : null
    return (
      secondPrimary - firstPrimary ||
      colorRoleGroupSupport(second) - colorRoleGroupSupport(first) ||
      colorRoleGroupWeight(second) - colorRoleGroupWeight(first) ||
      (secondContrast ?? -1) - (firstContrast ?? -1) ||
      firstKey.localeCompare(secondKey)
    )
  })[0][1]
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
      const selected = [...pairGroups.entries()].sort(
        ([firstKey, first], [secondKey, second]) =>
          colorRoleGroupSupport(second) - colorRoleGroupSupport(first) ||
          colorRoleGroupWeight(second) - colorRoleGroupWeight(first) ||
          firstKey.localeCompare(secondKey),
      )[0][1]
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

function hasObservedActionBackground(
  styles: Pick<ExtractedStyles, 'usageCount' | 'colorRoleObservations'>,
  role: 'action' | 'primary-action',
): boolean {
  if (styles.colorRoleObservations?.some((observation) => observation.role === role && observation.background)) {
    return true
  }
  const category = role === 'primary-action' ? 'primaryActionBackgroundColor:' : 'actionBackgroundColor:'
  return Object.entries(styles.usageCount).some(([key, count]) => key.startsWith(category) && count > 0)
}

function observedTextOnlyAccent(observations: readonly ColorRoleObservation[] | undefined): string | undefined {
  const candidates = new Map<string, { captures: Set<string>; weight: number }>()
  for (const observation of observations || []) {
    if (!['action', 'primary-action'].includes(observation.role) || observation.background || !observation.foreground)
      continue
    const foreground = normalizeColorValue(observation.foreground)
    if (!foreground || isNeutralColor(foreground)) continue
    const candidate = candidates.get(foreground) || { captures: new Set<string>(), weight: 0 }
    candidate.captures.add(colorRoleSelectionGroup(observation))
    candidate.weight += colorRoleSelectionWeight(observation)
    candidates.set(foreground, candidate)
  }
  return [...candidates.entries()].sort(
    ([firstColor, first], [secondColor, second]) =>
      second.captures.size - first.captures.size ||
      second.weight - first.weight ||
      firstColor.localeCompare(secondColor),
  )[0]?.[0]
}

function observedSecondaryActionBackground(
  observations: readonly ColorRoleObservation[] | undefined,
  primary: string,
): string | undefined {
  const normalizedPrimary = normalizeColorValue(primary)
  const candidates = new Map<
    string,
    { captures: Set<string>; elementsByCapture: Map<string, Set<string>>; weight: number }
  >()
  for (const observation of observations || []) {
    if (observation.role !== 'action' || !observation.background) continue
    const background = normalizeColorValue(observation.background)
    if (!background || background === normalizedPrimary || isNeutralColor(background)) continue
    const candidate = candidates.get(background) || {
      captures: new Set<string>(),
      elementsByCapture: new Map<string, Set<string>>(),
      weight: 0,
    }
    candidate.captures.add(colorRoleSelectionGroup(observation))
    const elements = candidate.elementsByCapture.get(observation.captureId) || new Set<string>()
    elements.add(observation.elementRef)
    candidate.elementsByCapture.set(observation.captureId, elements)
    candidate.weight += colorRoleSelectionWeight(observation)
    candidates.set(background, candidate)
  }
  return [...candidates.entries()]
    .filter(
      ([, candidate]) =>
        candidate.captures.size >= 2 ||
        [...candidate.elementsByCapture.values()].some((elements) => elements.size >= 2),
    )
    .sort(
      ([firstColor, first], [secondColor, second]) =>
        second.captures.size - first.captures.size ||
        second.weight - first.weight ||
        Math.max(...[...second.elementsByCapture.values()].map((elements) => elements.size)) -
          Math.max(...[...first.elementsByCapture.values()].map((elements) => elements.size)) ||
        firstColor.localeCompare(secondColor),
    )[0]?.[0]
}

function observedDestructiveActionColor(observations: readonly ColorRoleObservation[] | undefined): string | undefined {
  const candidates = new Map<string, { captures: Set<string>; score: number }>()
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
      const candidate = candidates.get(normalized) || { captures: new Set<string>(), score: 0 }
      candidate.captures.add(colorRoleSelectionGroup(observation))
      candidate.score += weight * colorRoleSelectionWeight(observation)
      candidates.set(normalized, candidate)
    }
  }
  return [...candidates.entries()].sort(
    ([firstValue, first], [secondValue, second]) =>
      second.captures.size - first.captures.size || second.score - first.score || firstValue.localeCompare(secondValue),
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

function hasObservedColorUsage(
  styles: Pick<ExtractedStyles, 'usageCount'>,
  value: string,
  categories: readonly string[],
): boolean {
  const normalized = normalizeColorValue(value)
  if (!normalized) return false
  const eligibleCategories = new Set(categories)
  return Object.entries(styles.usageCount).some(([key, count]) => {
    const separator = key.indexOf(':')
    if (separator <= 0 || !Number.isFinite(count) || count <= 0) return false
    if (!eligibleCategories.has(key.slice(0, separator))) return false
    return normalizeColorValue(key.slice(separator + 1)) === normalized
  })
}

const SPECIALIZED_COLOR_CATEGORIES = [
  'primaryActionBackgroundColor',
  'actionBackgroundColor',
  'destructiveActionBackgroundColor',
  'destructiveActionForegroundColor',
  'statusBackgroundColor',
  'statusForegroundColor',
  'statusColor',
  'selectedColor',
] as const

function isNeutralColor(value: string): boolean {
  const color = parseColor(value)
  if (!color) return false
  const maximum = Math.max(...color.channels)
  const minimum = Math.min(...color.channels)
  const colorChroma = maximum - minimum
  return colorChroma <= 24 || colorChroma / Math.max(1, maximum) <= 0.12
}

function observedForegroundsReadableOnFoundationSurfaces(
  surfaces: readonly (string | undefined)[],
  observations: ExtractedStyles['textColorPairObservations'],
): string[] {
  const normalizedSurfaces = new Set(surfaces.flatMap((surface) => (surface ? [normalizeColorValue(surface)] : [])))
  normalizedSurfaces.delete(null)
  if (normalizedSurfaces.size === 0 || !observations) return []
  const groups = new Map<
    string,
    {
      foreground: string
      count: number
      roles: Set<'body' | 'heading' | 'label' | 'other'>
      captures: Set<string>
      contrast: number | null
    }
  >()
  for (const observation of observations) {
    const observedBackground = normalizeColorValue(observation.background)
    if (!observedBackground || !normalizedSurfaces.has(observedBackground)) continue
    const foreground = normalizeColorValue(observation.foreground)
    if (!foreground) continue
    const count = Number.isFinite(observation.count) && observation.count > 0 ? observation.count : 1
    const observedContrast = colorContrast(foreground, observedBackground)
    const group = groups.get(foreground) || {
      foreground,
      count: 0,
      roles: new Set<'body' | 'heading' | 'label' | 'other'>(),
      captures: new Set<string>(),
      contrast: observedContrast,
    }
    group.count += count
    group.roles.add(observation.textRole)
    group.captures.add(observation.captureId)
    if (observedContrast !== null && (group.contrast === null || observedContrast > group.contrast)) {
      group.contrast = observedContrast
    }
    groups.set(foreground, group)
  }
  const candidates = [...groups.values()]
  const readableCandidates = candidates.filter((candidate) => candidate.contrast !== null && candidate.contrast >= 3)
  return (readableCandidates.length > 0 ? readableCandidates : candidates)
    .sort((first, second) => {
      const firstSemanticText = first.roles.has('body') || first.roles.has('heading') ? 1 : 0
      const secondSemanticText = second.roles.has('body') || second.roles.has('heading') ? 1 : 0
      return (
        second.captures.size - first.captures.size ||
        secondSemanticText - firstSemanticText ||
        (second.contrast || 0) - (first.contrast || 0) ||
        second.roles.size - first.roles.size ||
        second.count - first.count ||
        first.foreground.localeCompare(second.foreground)
      )
    })
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
const RENDERED_COLOR_CATEGORY_SET = new Set<string>(RENDERED_COLOR_CATEGORIES)

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

function observedColorCandidateCatalog(styles: ExtractedStyles): ColorTokenCandidate[] {
  const candidates = new Map<string, ColorTokenCandidate>()
  const record = (rawValue: string, observationCount: number): void => {
    const value = normalizeColorValue(rawValue)
    if (!value) return
    const existing = candidates.get(value)
    candidates.set(value, {
      value,
      kind: 'observed-unassigned',
      // Category aliases describe the same rendered owner, so the preliminary catalog uses a maximum. The final
      // evidence pass replaces this with capture- and owner-normalized support.
      observationCount: Math.max(existing?.observationCount || 0, observationCount),
      sources: colorSourcesForValue(styles, value, RENDERED_COLOR_CATEGORIES),
    })
  }
  for (const [key, count] of Object.entries(styles.usageCount)) {
    const separator = key.indexOf(':')
    if (separator <= 0 || !RENDERED_COLOR_CATEGORY_SET.has(key.slice(0, separator))) continue
    if (!Number.isFinite(count) || count <= 0) continue
    record(key.slice(separator + 1), count)
  }
  for (const rawValue of styles.colors) {
    const rendered = RENDERED_COLOR_CATEGORIES.reduce(
      (total, category) => total + colorUsageForCategory(styles, category, rawValue),
      0,
    )
    const declared = colorUsageForCategory(styles, 'declaredColor', rawValue)
    if (rendered > 0 || declared === 0) record(rawValue, Math.max(1, rendered))
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

function normalizeLengthFrequency(frequency: ReadonlyMap<string, number>): Map<string, number> {
  const normalized = new Map<string, number>()
  for (const [value, count] of frequency) {
    const key = normalizeComputedLength(value)
    normalized.set(key, (normalized.get(key) || 0) + count)
  }
  return normalized
}

function isScalarLength(value: string): boolean {
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)$/i.test(value.trim())
}

export function normalizeDesignTokenUsageCount(usageCount: Readonly<Record<string, number>>): Record<string, number> {
  const normalized: Record<string, number> = {}
  for (const [key, count] of Object.entries(usageCount)) {
    const normalizedKey = normalizeLengthUsageKey(key)
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
  // Candidate discovery is intentionally complete and exact. Clustering below selects semantic role proposals, but it
  // must never erase a rendered value before the evidence and promotion stages have evaluated it.
  const observedColorCatalog = observedColorCandidateCatalog(styles)
  for (const item of clusteredColors.palette) {
    const value = normalizeColorValue(item.hex)
    if (!value || observedColorCatalog.some((candidate) => candidate.value === value)) continue
    observedColorCatalog.push({
      value,
      kind: 'observed-unassigned',
      observationCount: item.count,
      sources: colorSourcesForValue(styles, value, RENDERED_COLOR_CATEGORIES),
    })
  }

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
    const observedForegrounds = observedForegroundsReadableOnFoundationSurfaces(
      [colors['background'], colors['surface']],
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
      // A hue used as a directly observed control, selection, or status treatment is a specialized semantic color.
      // It may also occur in text (for example an eyebrow or action link), but that does not make it the site's
      // ordinary muted-copy color. Generic accent/link observations remain eligible because inherited navigation
      // links can legitimately use the muted foreground and do not establish an action hierarchy by themselves.
      .filter((candidate) => !hasObservedColorUsage(roleStyles, candidate, SPECIALIZED_COLOR_CATEGORIES))
      .find((candidate) => isMutedTextCandidate(colors['background'], colors['foreground'], candidate))
    if (mutedForeground) colors['muted-foreground'] = mutedForeground
  }
  if (colors['background'] && colors['surface']) {
    const secondaryCandidate = clusteredColors.backgrounds
      .slice(2)
      .find(
        (candidate) =>
          colorsAreRelated(colors['background'], candidate) &&
          normalizeColorValue(candidate) !== normalizeColorValue(colors['surface']),
      )
    colors['secondary'] =
      secondaryCandidate || secondarySurface(colors['background'], colors['surface'], colors['foreground'])
  }

  // A primary action is optional. Generic palette, decorative, border, and text-only
  // accents must not be promoted to an action role merely because they are chromatic.
  if (clusteredColors.accents.length > 0) {
    if (hasObservedActionBackground(roleStyles, 'primary-action')) {
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
    } else if (hasObservedActionBackground(roleStyles, 'action')) {
      // A rendered generic button establishes an action accent, not the site's business-level primary action.
      colors['accent'] = clusteredColors.accents[0]
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
  const observedColorCandidates = observedColorCatalog.filter((candidate) => !takenColors.has(candidate.value))
  const colorCandidates = [...declaredOnlyColorCandidates(styles), ...observedColorCandidates]

  // These arrays are the complete normalized candidate catalog, not the final portable scales. Evidence evaluation
  // below this builder decides scope and promotion. Keeping selection caps here would silently delete valid local or
  // component observations before they could be represented in structured candidates.
  const fontSizeFreq = normalizeLengthFrequency(frequencyForCategory(styles, 'fontSize', styles.fontSizes))
  const sortedFontSizes = numericSort(
    [...fontSizeFreq.keys()]
      .filter((value) => Number.parseFloat(value) > 0)
      .map(pxToRem)
      .filter(uniqueFilter()),
  )

  const fontWeightFreq = frequencyForCategory(styles, 'fontWeight', styles.fontWeights)
  const sortedFontWeights = numericSort(
    [...fontWeightFreq.keys()].filter((value) => /^(?:[1-9]00|[1-9]\d{0,2})$/.test(value)).filter(uniqueFilter()),
  )

  const pairedLineHeights = pairedLineHeightFrequency(styles)
  const fallbackUnitlessLineHeights = frequencyForCategory(styles, 'lineHeight', styles.lineHeights)
  const lineHeightCandidates =
    pairedLineHeights.size > 0
      ? [...pairedLineHeights.keys()]
      : [...fallbackUnitlessLineHeights.keys()].filter(
          (value) => /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) && Number.parseFloat(value) > 0,
        )
  const sortedLineHeights = numericSort(lineHeightCandidates.filter(uniqueFilter()))

  // Spacing
  const spacingFreq = normalizeLengthFrequency(frequencyForCategory(styles, 'spacing', styles.spacings))
  const spacings = [...spacingFreq.keys()]
    .filter((v) => {
      if (!isScalarLength(v)) return false
      const num = parseFloat(v)
      return Number.isFinite(num) && num !== 0
    })
    .filter(uniqueFilter())
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Radii
  const radiusFreq = normalizeLengthFrequency(frequencyForCategory(styles, 'radius', styles.radii))
  const radii = [...radiusFreq.keys()]
    .filter((value) => isScalarLength(value) && parseFloat(value) > 0)
    .filter(uniqueFilter())
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Shadows
  const shadowFreq = frequencyForCategory(styles, 'shadow', styles.shadows)
  const shadows = [...shadowFreq.keys()]
    .filter(hasVisibleShadow)
    .sort((first, second) => shadowElevation(first) - shadowElevation(second))

  // Borders
  const borderFreq = frequencyForCategory(styles, 'border', styles.borders)
  const borders = sortByFrequency(borderFreq)
    .filter((value) => value.trim() !== '')
    .filter(uniqueFilter())

  // Font families - keep both primary names and full stacks
  const observedTextFamilies = frequencyForCategory(styles, 'fontTextFamily')
  const fontFamilyFrequency =
    observedTextFamilies.size > 0
      ? observedTextFamilies
      : frequencyForCategory(styles, 'fontFamily', styles.fontFamilies)
  const fontStacks = sortByFrequency(fontFamilyFrequency)
    .map((family) => family.trim())
    .filter((stack) => !/^(?:inherit|initial|unset|revert|revert-layer)$/i.test(stack))
    .filter((stack, index, values) => {
      const normalized = normalizeCssFontFamilyList(stack)
      return (
        normalized !== '' &&
        values.findIndex((candidate) => normalizeCssFontFamilyList(candidate) === normalized) === index
      )
    })

  const fontFamilies = fontStacks
    .map(primaryCssFontFamily)
    .filter((family) => family !== '')
    .filter((family, index, values) => {
      const normalized = normalizeCssFontFamilyName(family)
      return values.findIndex((candidate) => normalizeCssFontFamilyName(candidate) === normalized) === index
    })

  // Letter spacing
  const letterSpacingFreq = frequencyForCategory(styles, 'letterSpacing', styles.letterSpacings || [])
  const letterSpacings = sortByFrequency(letterSpacingFreq)
    .filter((value) => value !== '0' && value !== '0px' && value !== 'normal')
    .filter(uniqueFilter())
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Z-index layers
  const zIndexFreq = frequencyForCategory(styles, 'zIndex', styles.zIndices || [])
  const zIndices = sortByFrequency(zIndexFreq)
    .filter((value) => /^-?\d+$/.test(value) && value !== '0')
    .filter(uniqueFilter())
    .sort((a, b) => parseInt(a) - parseInt(b))

  // Transitions
  const transitionFreq = frequencyForCategory(styles, 'transition', styles.transitions || [])
  const transitions = sortByFrequency(transitionFreq)
    .filter((value) => Number.isFinite(durationInMilliseconds(value)) && durationInMilliseconds(value) > 0)
    .filter(uniqueFilter())
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
