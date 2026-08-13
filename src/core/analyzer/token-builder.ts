import { type ClusteredColors, normalizeColorValue } from './color-cluster.js'
import type { ColorRoleObservation, DesignToken, ExtractedStyles } from './types.js'
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
 * Pure code - no LLM tokens consumed.
 */
export function buildDesignTokens(
  styles: ExtractedStyles,
  clusteredColors: ClusteredColors,
  roleStyles: Pick<ExtractedStyles, 'usageCount' | 'colorRoleObservations'> = styles,
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
      colors['secondary'] = secondarySurface(
        clusteredColors.backgrounds[0],
        clusteredColors.backgrounds[1],
        clusteredColors.texts[0],
      )
    }
  }

  // Assign text colors
  if (clusteredColors.texts.length > 0) {
    colors['foreground'] = clusteredColors.texts[0]
    const mutedForeground = clusteredColors.texts
      .slice(1)
      .find((candidate) => isMutedTextCandidate(colors['background'], colors['foreground'], candidate))
    if (mutedForeground) colors['muted-foreground'] = mutedForeground
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

  // Prefer borders observed outside controls. Action/focus borders belong to the primary or ring role and should not
  // become the default boundary for every card, table row, and navigation region in a validation scenario.
  const structuralBorderColorEntries = Object.entries(roleStyles.usageCount)
    .filter(([key]) => key.startsWith('structuralBorderColor:'))
    .sort((first, second) => second[1] - first[1])
  const observedBorderColorEntries = (
    structuralBorderColorEntries.length > 0
      ? structuralBorderColorEntries
      : Object.entries(roleStyles.usageCount).filter(([key]) => key.startsWith('borderColor:'))
  ).sort((first, second) => second[1] - first[1])
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

  // Add remaining palette colors. Compare normalized values so the same color observed in
  // different notations (e.g. rgb(59, 52, 64) vs #3b3440) is not emitted as two tokens.
  const takenColors = new Set(Object.values(colors).map((value) => normalizeColorValue(value) || value))
  clusteredColors.palette.forEach((item, i) => {
    const normalized = normalizeColorValue(item.hex) || item.hex
    if (!takenColors.has(normalized)) {
      takenColors.add(normalized)
      colors[`palette-${i + 1}`] = item.hex
    }
  })

  // Typography - sort by frequency and pick unique values
  const fontSizeFreq = frequencyForCategory(styles, 'fontSize', styles.fontSizes)
  const sortedFontSizes = numericSort(sortByFrequency(fontSizeFreq).map(pxToRem).filter(uniqueFilter()).slice(0, 8))

  const fontWeightFreq = frequencyForCategory(styles, 'fontWeight', styles.fontWeights)
  const sortedFontWeights = numericSort(sortByFrequency(fontWeightFreq).filter(uniqueFilter()).slice(0, 5))

  const pairedLineHeights = pairedLineHeightFrequency(styles)
  const lineHeightFreq =
    pairedLineHeights.size > 0 ? pairedLineHeights : frequencyForCategory(styles, 'lineHeight', styles.lineHeights)
  const sortedLineHeights = numericSort(sortByFrequency(lineHeightFreq).filter(uniqueFilter()).slice(0, 5))

  // Spacing - extract unique values, sort numerically
  const spacingFreq = normalizeLengthFrequency(frequencyForCategory(styles, 'spacing', styles.spacings))
  const spacings = sortByFrequency(spacingFreq)
    .filter((v) => {
      const num = parseFloat(v)
      return !isNaN(num) && num > 0 && num <= 96
    })
    .filter(uniqueFilter())
    .slice(0, 12)
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Radii
  const radiusFreq = normalizeLengthFrequency(frequencyForCategory(styles, 'radius', styles.radii))
  const radii = sortByFrequency(radiusFreq)
    .filter((v) => parseFloat(v) > 0)
    .filter(uniqueFilter())
    .slice(0, 5)
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Shadows - deduplicate
  const shadowFreq = frequencyForCategory(styles, 'shadow', styles.shadows)
  const shadows = sortByFrequency(shadowFreq)
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
