import type { DesignToken, ExtractedStyles } from './types.js'

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
  const radii = tokens.radii.map((r) => parseFloat(r)).filter((v) => !isNaN(v))
  if (radii.length > 0) {
    const maxRadius = Math.max(...radii)
    if (maxRadius >= 16) {
      tags.push('large-radius rounded style')
    } else if (maxRadius <= 4) {
      tags.push('sharp-edge geometric style')
    }
  }

  // Shadow analysis
  if (tokens.shadows.length === 0) {
    tags.push('flat design (no shadows)')
  } else if (tokens.shadows.length >= 3) {
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
