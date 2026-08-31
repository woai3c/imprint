import type { DesignEvidence, DeterministicClaim } from '../design-evidence/types.js'
import type { DesignToken, ExtractedStyles } from './types.js'

function usageCount(styles: ExtractedStyles, category: string, value: string): number {
  const exact = styles.usageCount[`${category}:${value}`]
  if (exact) return exact
  if (category !== 'radius' && category !== 'spacing') return 0
  const target = cssLengthPx(value)
  if (target === null) return 0
  const prefix = `${category}:`
  return Object.entries(styles.usageCount).reduce((total, [key, count]) => {
    if (!key.startsWith(prefix)) return total
    const observed = cssLengthPx(key.slice(prefix.length))
    return observed !== null && Math.abs(observed - target) <= 0.1 ? total + count : total
  }, 0)
}

interface ColorChannels {
  r: number
  g: number
  b: number
}

const CHROMATIC_CHROMA_THRESHOLD = 24
const COLOR_MATCH_TOLERANCE = 20
const MIN_DECORATIVE_OCCURRENCES_PER_FAMILY = 2
// Area can substitute for repetition only within the same hue family; small one-offs never pool their area.
const MIN_DECORATIVE_AREA_SHARE_PER_FAMILY = 0.003
const UI_COLOR_CATEGORIES = new Set([
  'primaryActionBackgroundColor',
  'actionBackgroundColor',
  'primaryActionColor',
  'actionColor',
  'selectedColor',
  'accentColor',
  'linkColor',
  'brandTokenColor',
  'declaredColor',
  'bgColor',
  'bgArea',
  'textColor',
])
const STATUS_COLOR_CATEGORIES = new Set([
  'statusBackgroundColor',
  'statusForegroundColor',
  'statusColor',
  'destructiveActionBackgroundColor',
  'destructiveActionForegroundColor',
])

function parseColorChannels(value: string): ColorChannels | null {
  const hex = value.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i)
  if (hex) {
    let digits = hex[1]
    if (digits.length === 3) {
      digits = digits
        .split('')
        .map((char) => char + char)
        .join('')
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    }
  }
  const rgb = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
  return null
}

function colorChroma({ r, g, b }: ColorChannels): number {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

function colorHue({ r, g, b }: ColorChannels): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  let hue: number
  if (max === r) hue = 60 * (((g - b) / delta) % 6)
  else if (max === g) hue = 60 * ((b - r) / delta + 2)
  else hue = 60 * ((r - g) / delta + 4)
  return (hue + 360) % 360
}

function colorUsageWeight(styles: ExtractedStyles, channels: ColorChannels): { ui: number; status: number } {
  let ui = 0
  let status = 0
  for (const [key, count] of Object.entries(styles.usageCount)) {
    if (!Number.isFinite(count) || count <= 0) continue
    const separator = key.indexOf(':')
    if (separator <= 0) continue
    const category = key.slice(0, separator)
    const isStatus = STATUS_COLOR_CATEGORIES.has(category)
    if (!isStatus && !UI_COLOR_CATEGORIES.has(category)) continue
    const candidate = parseColorChannels(key.slice(separator + 1))
    if (!candidate) continue
    const distance = Math.sqrt(
      Math.pow(candidate.r - channels.r, 2) +
        Math.pow(candidate.g - channels.g, 2) +
        Math.pow(candidate.b - channels.b, 2),
    )
    if (distance > COLOR_MATCH_TOLERANCE) continue
    if (isStatus) status += count
    else ui += count
  }
  return { ui, status }
}

function cssLengthPx(value: string): number | null {
  const match = value.trim().match(/^(-?\d*\.?\d+)(px|rem|em)?$/i)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  return ['rem', 'em'].includes((match[2] || '').toLowerCase()) ? amount * 16 : amount
}

function representativeRadius(
  tokens: DesignToken,
  styles: ExtractedStyles,
): { value: number; smallShare: number } | null {
  const candidates = tokens.radii
    .filter((radius) => !radius.includes('%'))
    .map((radius) => ({
      radius: cssLengthPx(radius),
      count: Math.max(1, usageCount(styles, 'radius', radius)),
    }))
    // Very large values are pill/circle implementation sentinels, not a system-wide corner radius.
    .filter((entry): entry is { radius: number; count: number } => entry.radius !== null && entry.radius <= 64)
    .sort((first, second) => first.radius - second.radius)
  if (candidates.length === 0) return null

  const total = candidates.reduce((sum, entry) => sum + entry.count, 0)
  const midpoint = total / 2
  let cumulative = 0
  let representative = candidates[candidates.length - 1].radius
  for (const entry of candidates) {
    cumulative += entry.count
    if (cumulative >= midpoint) {
      representative = entry.radius
      break
    }
  }
  const smallCount = candidates.filter((entry) => entry.radius <= 4).reduce((sum, entry) => sum + entry.count, 0)
  return { value: representative, smallShare: smallCount / total }
}

function shadowElevation(value: string): number | null {
  const withoutColors = value.replace(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/gi, '')
  const firstLayer = withoutColors.split(',')[0]
  const lengths = firstLayer.match(/-?\d*\.?\d+(?:px|rem|em)|\b0\b/gi) || []
  if (lengths.length < 2) return null
  const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = lengths.map((length) => cssLengthPx(length) || 0)
  return Math.abs(offsetX) * 0.25 + Math.abs(offsetY) + Math.max(0, blur) + Math.abs(spread) * 0.5
}

function hasLayeredElevation(tokens: DesignToken): boolean {
  const levels = [
    ...new Set(
      tokens.shadows
        .map(shadowElevation)
        .filter((level): level is number => level !== null)
        .map((level) => Math.round(level * 10) / 10),
    ),
  ].sort((first, second) => first - second)
  if (levels.length < 3) return false
  return levels[levels.length - 1] - levels[0] >= 8 && levels[levels.length - 1] >= levels[0] * 2
}

/**
 * Generate design feature tags based on extracted style analysis.
 * Deterministic program implementation.
 */
export function generateFeatureTags(tokens: DesignToken, styles: ExtractedStyles): string[] {
  const tags: string[] = []

  const spacingRhythm = dominantSpacingRhythm(tokens, styles)
  if (spacingRhythm.length >= 2)
    tags.push(`spacing rhythm led by ${spacingRhythm.map((value) => `${value}px`).join(', ')}`)

  // Font detection
  const fonts = tokens.typography.fontFamilies
  const primaryFont = fonts[0]?.toLowerCase() || ''
  // Font families are ordered by rendered text coverage. A secondary code font must not
  // label an otherwise proportional site as a monospace typography system.
  if (primaryFont.includes('mono') || primaryFont.includes('code')) {
    tags.push('monospace typography')
  }
  if (primaryFont.includes('serif') && !primaryFont.includes('sans')) {
    tags.push('serif editorial style')
  }
  if (fonts.length === 1) {
    tags.push('single-font system')
  }

  // Check if monochrome
  const colorValues = Object.values(tokens.colors)
  const isMonochrome = colorValues.every((c) => {
    const match = c.match(/rgb[a]?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!match) return false
    const [, r, g, b] = match.map(Number)
    return Math.abs(r - g) < 20 && Math.abs(g - b) < 20
  })
  if (isMonochrome && colorValues.length > 2) {
    tags.push('monochrome palette')
  }

  // Border radius analysis
  const radius = representativeRadius(tokens, styles)
  if (radius) {
    if (radius.value >= 12) {
      tags.push('large-radius rounded style')
    } else if (radius.value <= 4 && radius.smallShare >= 0.5) {
      tags.push('compact-radius surfaces observed')
    }
  }

  // Shadow analysis
  if (tokens.shadows.length === 0) {
    tags.push('no stable shadow scale observed')
  } else if (hasLayeredElevation(tokens)) {
    tags.push('layered elevation system')
  }

  // Font weight analysis
  const weights = tokens.typography.fontWeights.map(Number).filter((w) => !isNaN(w))
  if (weights.length > 0) {
    const hasLight = weights.some((w) => w <= 300)
    const hasBold = weights.some((w) => w >= 700)
    if (hasLight && hasBold) {
      tags.push('weight contrast hierarchy')
    }
  }

  return tags
}

function hueFamiliesForCategories(styles: ExtractedStyles, categories: ReadonlySet<string>): Map<number, number> {
  const families = new Map<number, number>()
  for (const [key, count] of Object.entries(styles.usageCount)) {
    const separator = key.indexOf(':')
    if (separator <= 0 || !categories.has(key.slice(0, separator)) || !Number.isFinite(count) || count <= 0) continue
    const channels = parseColorChannels(key.slice(separator + 1))
    if (!channels || colorChroma(channels) < CHROMATIC_CHROMA_THRESHOLD) continue
    const family = Math.floor(colorHue(channels) / 30)
    families.set(family, (families.get(family) || 0) + count)
  }
  return families
}

interface DecorativeHueFamilyUsage {
  occurrences: number
  areaShare: number
}

function decorativeHueFamilies(styles: ExtractedStyles): Map<number, DecorativeHueFamilyUsage> {
  const families = new Map<number, DecorativeHueFamilyUsage>()
  for (const [key, count] of Object.entries(styles.usageCount)) {
    const separator = key.indexOf(':')
    if (separator <= 0 || !Number.isFinite(count) || count <= 0) continue
    const category = key.slice(0, separator)
    if (category !== 'bgColor' && category !== 'bgArea') continue
    const channels = parseColorChannels(key.slice(separator + 1))
    if (!channels || colorChroma(channels) < CHROMATIC_CHROMA_THRESHOLD) continue
    const family = Math.floor(colorHue(channels) / 30)
    const usage = families.get(family) || { occurrences: 0, areaShare: 0 }
    if (category === 'bgColor') usage.occurrences += count
    else usage.areaShare += count
    families.set(family, usage)
  }
  return families
}

function neutralCoverage(styles: ExtractedStyles): number {
  const coverageCategories = new Set(['bgColor', 'bgArea', 'textColor'])
  let neutral = 0
  let total = 0
  for (const [key, count] of Object.entries(styles.usageCount)) {
    const separator = key.indexOf(':')
    if (separator <= 0 || !coverageCategories.has(key.slice(0, separator)) || count <= 0) continue
    const channels = parseColorChannels(key.slice(separator + 1))
    if (!channels) continue
    total += count
    if (colorChroma(channels) < CHROMATIC_CHROMA_THRESHOLD) neutral += count
  }
  return total > 0 ? neutral / total : 0
}

function isCompoundSectionRadius(value: string | undefined): boolean {
  if (!value) return false
  const parts = value.trim().split(/\s+/)
  return (
    /[%/]/.test(value) ||
    parts.length !== 4 ||
    !parts.every((part) => part === parts[0] && /^(?:0|\d*\.?\d+(?:px|rem|em))$/i.test(part))
  )
}

export function buildEvidenceBackedClaims(
  tokens: DesignToken,
  styles: ExtractedStyles,
  evidence: Pick<DesignEvidence, 'sections'> & Partial<Pick<DesignEvidence, 'components'>>,
): DeterministicClaim[] {
  const claims: DeterministicClaim[] = []
  const primaryRole = tokens.colorRoles?.primaryAction
  const roleEvidenceRefs = (primaryRole?.provenance || []).map(
    (item) => `color-role:${item.captureId}|${item.elementRef}`,
  )
  const roleProvenance: DeterministicClaim['provenance'] = roleEvidenceRefs.map((ref) => ({
    source: 'color-role-observation',
    ref,
  }))
  const actionFamilies = hueFamiliesForCategories(
    styles,
    new Set(['primaryActionBackgroundColor', 'actionBackgroundColor', 'primaryActionColor', 'actionColor']),
  )
  const statusFamilies = hueFamiliesForCategories(styles, STATUS_COLOR_CATEGORIES)
  const decorativeFamilies = decorativeHueFamilies(styles)
  for (const family of statusFamilies.keys()) decorativeFamilies.delete(family)
  const primaryChannels = primaryRole ? parseColorChannels(primaryRole.observedBackground) : null
  if (primaryChannels) decorativeFamilies.delete(Math.floor(colorHue(primaryChannels) / 30))
  const gradientSections = evidence.sections.filter((section) => section.observedStyles?.gradient)
  const compoundRadiusSections = evidence.sections.filter((section) =>
    isCompoundSectionRadius(section.observedStyles?.borderRadius),
  )

  const actionFamilyTotal = [...actionFamilies.values()].reduce((sum, weight) => sum + weight, 0)
  const dominantActionShare = actionFamilyTotal > 0 ? Math.max(...actionFamilies.values()) / actionFamilyTotal : 1
  const stableDecorativeFamilies = [...decorativeFamilies.values()].filter(
    (usage) =>
      usage.occurrences >= MIN_DECORATIVE_OCCURRENCES_PER_FAMILY ||
      usage.areaShare >= MIN_DECORATIVE_AREA_SHARE_PER_FAMILY,
  )
  const stableDecorativeOccurrences = stableDecorativeFamilies.reduce((sum, usage) => sum + usage.occurrences, 0)
  const stableDecorativeAreaShare = stableDecorativeFamilies.reduce((sum, usage) => sum + usage.areaShare, 0)
  const repeatedDecorativeFamilies = stableDecorativeFamilies.filter(
    (usage) => usage.occurrences >= MIN_DECORATIVE_OCCURRENCES_PER_FAMILY,
  ).length
  const areaSignificantDecorativeFamilies = stableDecorativeFamilies.filter(
    (usage) => usage.areaShare >= MIN_DECORATIVE_AREA_SHARE_PER_FAMILY,
  ).length
  const stableDecorativePalette = stableDecorativeFamilies.length >= 2
  if (primaryRole && roleEvidenceRefs.length > 0) {
    if (dominantActionShare >= 0.6 && gradientSections.length > 0 && stableDecorativePalette) {
      const sectionRefs = gradientSections.map((section) => section.id)
      claims.push({
        label: 'single dominant action family with multicolor decorative accents',
        confidence: roleEvidenceRefs.length >= 2 ? 'high' : 'medium',
        reasons: [
          `The dominant action hue family accounts for ${Math.round(dominantActionShare * 100)}% of observed action background use.`,
          `${stableDecorativeFamilies.length} non-status decorative hue families independently meet the stability threshold: ${repeatedDecorativeFamilies} repeated family/families, ${areaSignificantDecorativeFamilies} area-significant family/families, ${Math.round(stableDecorativeOccurrences)} rendered occurrence(s), and ${(stableDecorativeAreaShare * 100).toFixed(1)}% viewport-area contribution.`,
        ],
        evidenceRefs: [...roleEvidenceRefs, ...sectionRefs],
        provenance: [
          ...roleProvenance,
          ...sectionRefs.map((ref) => ({ source: 'section-observation' as const, ref })),
          { source: 'token-usage', ref: 'usage:bgColor|bgArea' },
        ],
      })
    } else if (actionFamilies.size <= 1 && neutralCoverage(styles) >= 0.75 && decorativeFamilies.size === 0) {
      claims.push({
        label: 'neutral palette with a single accent',
        confidence: roleEvidenceRefs.length >= 2 ? 'high' : 'medium',
        reasons: [
          `Neutral background/text coverage is ${Math.round(neutralCoverage(styles) * 100)}%.`,
          'Observed non-status action backgrounds remain within one hue family.',
        ],
        evidenceRefs: roleEvidenceRefs,
        provenance: [...roleProvenance, { source: 'token-usage', ref: 'usage:bgColor|bgArea|textColor' }],
      })
    }
  }

  if (!claims.some((claim) => claim.label.includes('multicolor decorative'))) {
    const stableFamilies = new Map<number, number>()
    for (const value of Object.values(tokens.colors)) {
      const channels = parseColorChannels(value)
      if (!channels || colorChroma(channels) < CHROMATIC_CHROMA_THRESHOLD) continue
      const weight = colorUsageWeight(styles, channels)
      if (weight.ui === 0 || weight.status * 2 >= weight.ui) continue
      const family = Math.floor(colorHue(channels) / 30)
      stableFamilies.set(family, (stableFamilies.get(family) || 0) + weight.ui)
    }
    const maximum = Math.max(0, ...stableFamilies.values())
    const significant = [...stableFamilies.values()].filter((weight) => weight >= Math.max(3, maximum * 0.15)).length
    const componentEvidenceRefs = (evidence.components || [])
      .filter((component) => {
        const color = parseColorChannels(component.styles.backgroundColor || component.styles.color || '')
        return color && colorChroma(color) >= CHROMATIC_CHROMA_THRESHOLD
      })
      .map((component) => component.id)
      .slice(0, 8)
    const sectionEvidenceRefs = evidence.sections
      .filter((section) => {
        const color = parseColorChannels(section.observedStyles?.backgroundColor || '')
        return color && colorChroma(color) >= CHROMATIC_CHROMA_THRESHOLD
      })
      .map((section) => section.id)
      .slice(0, 4)
    const evidenceRefs = [...new Set([...roleEvidenceRefs, ...componentEvidenceRefs, ...sectionEvidenceRefs])]
    if (significant >= 3 && evidenceRefs.length > 0) {
      claims.push({
        label: 'rich color system',
        confidence: evidenceRefs.length >= 3 ? 'high' : 'medium',
        reasons: [`${significant} non-status chromatic hue families have stable rendered or semantic usage.`],
        evidenceRefs,
        provenance: [
          ...roleProvenance,
          ...componentEvidenceRefs.map((ref) => ({ source: 'component-observation' as const, ref })),
          ...sectionEvidenceRefs.map((ref) => ({ source: 'section-observation' as const, ref })),
          { source: 'token-usage', ref: 'usage:semantic-color-roles' },
        ],
      })
    }
  }

  const structuralSections = [...new Set([...gradientSections, ...compoundRadiusSections])]
  if (structuralSections.length > 0) {
    const evidenceRefs = structuralSections.map((section) => section.id)
    const label =
      gradientSections.length > 0 && compoundRadiusSections.length > 0
        ? 'section-level gradient and compound-radius treatments observed'
        : gradientSections.length > 0
          ? 'section-level gradient treatments observed'
          : 'section-level compound-radius treatments observed'
    claims.push({
      label,
      confidence: evidenceRefs.length >= 2 ? 'high' : 'medium',
      reasons: [
        `${gradientSections.length} section gradient treatment(s) observed.`,
        `${compoundRadiusSections.length} compound section radius treatment(s) observed.`,
      ],
      evidenceRefs,
      provenance: evidenceRefs.map((ref) => ({ source: 'section-observation', ref })),
    })
  }

  return claims
}

function dominantSpacingRhythm(tokens: DesignToken, styles: ExtractedStyles): number[] {
  const observations = tokens.spacing
    .map((value) => ({ value: cssLengthPx(value), count: Math.max(1, usageCount(styles, 'spacing', value)) }))
    .filter(
      (entry): entry is { value: number; count: number } =>
        entry.value !== null && entry.value >= 4 && entry.value <= 96,
    )
    .sort((first, second) => second.count - first.count || first.value - second.value)
  return [...new Set(observations.slice(0, 3).map((observation) => observation.value))].sort((a, b) => a - b)
}
