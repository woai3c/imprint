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
const MIN_DOMINANT_SPACING_GRID_SHARE = 0.8
const MAX_SPACING_GRID_BASE_PX = 16
const SPACING_GRID_TOLERANCE_PX = 0.15
const UI_COLOR_CATEGORIES = new Set([
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
    const isStatus = category === 'statusColor'
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
 * Pure code-based — no LLM needed.
 */
export function generateFeatureTags(tokens: DesignToken, styles: ExtractedStyles): string[] {
  const tags: string[] = []

  // Spacing system detection
  const spacingGrid = dominantSpacingGrid(tokens, styles)
  if (spacingGrid !== null) tags.push(`${spacingGrid}px-base grid spacing`)

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

  // Color palette analysis. Richness is judged by stable, independently used chromatic
  // UI roles — not by the raw number of extracted colors. Content sites pick up avatar,
  // badge, and status colors that inflate the count without being part of the design system.
  const colorEntries = Object.entries(tokens.colors)
  if (colorEntries.length <= 4) {
    tags.push('minimal palette')
  } else {
    const familyWeights = new Map<number, number>()
    for (const [, value] of colorEntries) {
      const channels = parseColorChannels(value)
      if (!channels || colorChroma(channels) < CHROMATIC_CHROMA_THRESHOLD) continue
      const weight = colorUsageWeight(styles, channels)
      // Status-dominant colors (success/warning/error) and colors with no stable UI
      // evidence (image/incidental sampling) never qualify as brand palette roles.
      if (weight.ui === 0 || weight.status * 2 >= weight.ui) continue
      const family = Math.floor(colorHue(channels) / 30)
      familyWeights.set(family, (familyWeights.get(family) || 0) + weight.ui)
    }
    const maxFamilyWeight = Math.max(0, ...familyWeights.values())
    const significantFamilies = [...familyWeights.values()].filter(
      (weight) => weight >= Math.max(3, maxFamilyWeight * 0.15),
    ).length
    if (significantFamilies >= 3) {
      tags.push('rich color system')
    } else if (significantFamilies === 1) {
      tags.push('neutral palette with a single accent')
    }
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
      tags.push('small-radius geometric style')
    }
  }

  // Shadow analysis
  if (tokens.shadows.length === 0) {
    tags.push('flat design (no shadows)')
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

  // Font size scale
  const sizes = tokens.typography.fontSizes.map((s) => parseFloat(s)).filter((v) => !isNaN(v))
  if (sizes.length >= 5) {
    tags.push('rich type scale')
  }

  // CSS variable usage
  if (Object.keys(styles.cssVariables).length > 20) {
    tags.push('design-token-driven')
  }

  return tags.slice(0, 5)
}

function dominantSpacingGrid(tokens: DesignToken, styles: ExtractedStyles): number | null {
  const observations = tokens.spacing
    .map((value) => ({ value: cssLengthPx(value), count: Math.max(1, usageCount(styles, 'spacing', value)) }))
    .filter((entry): entry is { value: number; count: number } => entry.value !== null && entry.value > 0)
  if (observations.length < 3) return null

  const totalWeight = observations.reduce((total, observation) => total + observation.count, 0)
  for (let base = MAX_SPACING_GRID_BASE_PX; base >= 2; base -= 1) {
    const matching = observations.filter((observation) => {
      const closestMultiple = Math.round(observation.value / base) * base
      return Math.abs(observation.value - closestMultiple) <= SPACING_GRID_TOLERANCE_PX
    })
    if (new Set(matching.map((observation) => observation.value)).size < 3) continue
    const matchingWeight = matching.reduce((total, observation) => total + observation.count, 0)
    if (matchingWeight / totalWeight >= MIN_DOMINANT_SPACING_GRID_SHARE) return base
  }
  return null
}
