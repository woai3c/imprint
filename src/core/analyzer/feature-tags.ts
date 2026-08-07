import type { DesignToken, ExtractedStyles } from './types.js'

function usageCount(styles: ExtractedStyles, category: string, value: string): number {
  return styles.usageCount[`${category}:${value}`] || 0
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
  const spacingValues = tokens.spacing.map((s) => parseFloat(s)).filter((v) => !isNaN(v) && v > 0)
  if (spacingValues.length >= 3) {
    const gcd = findGCD(spacingValues)
    if (gcd >= 2) {
      tags.push(`${gcd}px-base grid spacing`)
    }
  }

  // Font detection
  const fonts = tokens.typography.fontFamilies
  if (fonts.some((f) => f.toLowerCase().includes('mono') || f.toLowerCase().includes('code'))) {
    tags.push('monospace typography')
  }
  if (fonts.some((f) => f.toLowerCase().includes('serif') && !f.toLowerCase().includes('sans'))) {
    tags.push('serif editorial style')
  }
  if (fonts.length === 1) {
    tags.push('single-font system')
  }

  // Color palette analysis
  const colorCount = Object.keys(tokens.colors).length
  if (colorCount <= 4) {
    tags.push('minimal palette')
  } else if (colorCount >= 10) {
    tags.push('rich color system')
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
      tags.push('sharp-edge geometric style')
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

function findGCD(numbers: number[]): number {
  const rounded = numbers.map(Math.round).filter((n) => n > 0)
  if (rounded.length < 2) return rounded[0] || 4

  let result = rounded[0]
  for (let i = 1; i < rounded.length; i++) {
    result = gcd(result, rounded[i])
  }
  return result
}

function gcd(a: number, b: number): number {
  while (b) {
    ;[a, b] = [b, a % b]
  }
  return a
}
