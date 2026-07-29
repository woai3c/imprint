import type { ClusteredColors } from './color-cluster.js'
import type { DesignToken, ExtractedStyles } from './types.js'
import { frequencyForCategory, sortByFrequency } from './usage-stats.js'

/**
 * Build structured design tokens from raw extracted styles.
 * Pure code - no LLM tokens consumed.
 */
export function buildDesignTokens(styles: ExtractedStyles, clusteredColors: ClusteredColors): DesignToken {
  // Build color map
  const colors: Record<string, string> = {}

  // Assign backgrounds
  if (clusteredColors.backgrounds.length > 0) {
    colors['background'] = clusteredColors.backgrounds[0]
    if (clusteredColors.backgrounds.length > 1) {
      colors['surface'] = clusteredColors.backgrounds[1]
    }
  }

  // Assign text colors
  if (clusteredColors.texts.length > 0) {
    colors['foreground'] = clusteredColors.texts[0]
    if (clusteredColors.texts.length > 1) {
      colors['muted-foreground'] = clusteredColors.texts[1]
    }
  }

  // Assign accent/primary colors
  if (clusteredColors.accents.length > 0) {
    colors['primary'] = clusteredColors.accents[0]
    if (clusteredColors.accents.length > 1) {
      colors['secondary'] = clusteredColors.accents[1]
    }
    if (clusteredColors.accents.length > 2) {
      colors['accent'] = clusteredColors.accents[2]
    }
  }

  // Assign border color from most-used border color
  const borderColorEntries = Object.entries(styles.usageCount)
    .filter(([k]) => k.startsWith('borderColor:'))
    .sort((a, b) => b[1] - a[1])
  if (borderColorEntries.length > 0) {
    colors['border'] = borderColorEntries[0][0].replace('borderColor:', '')
  }

  // Add remaining palette colors
  clusteredColors.palette.forEach((item, i) => {
    if (!Object.values(colors).includes(item.hex)) {
      colors[`palette-${i + 1}`] = item.hex
    }
  })

  // Typography - sort by frequency and pick unique values
  const fontSizeFreq = frequencyForCategory(styles, 'fontSize', styles.fontSizes)
  const sortedFontSizes = sortByFrequency(fontSizeFreq).map(pxToRem).filter(uniqueFilter()).slice(0, 8)

  const fontWeightFreq = frequencyForCategory(styles, 'fontWeight', styles.fontWeights)
  const sortedFontWeights = sortByFrequency(fontWeightFreq).filter(uniqueFilter()).slice(0, 5)

  const lineHeightFreq = frequencyForCategory(styles, 'lineHeight', styles.lineHeights)
  const sortedLineHeights = sortByFrequency(lineHeightFreq).map(pxToUnitless).filter(uniqueFilter()).slice(0, 5)

  // Spacing - extract unique values, sort numerically
  const spacingFreq = frequencyForCategory(styles, 'spacing', styles.spacings)
  const spacings = sortByFrequency(spacingFreq)
    .filter((v) => {
      const num = parseFloat(v)
      return !isNaN(num) && num > 0 && num <= 200
    })
    .filter(uniqueFilter())
    .slice(0, 12)
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Radii
  const radiusFreq = frequencyForCategory(styles, 'radius', styles.radii)
  const radii = sortByFrequency(radiusFreq)
    .filter((v) => parseFloat(v) > 0)
    .filter(uniqueFilter())
    .slice(0, 5)
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  // Shadows - deduplicate
  const shadowFreq = frequencyForCategory(styles, 'shadow', styles.shadows)
  const shadows = sortByFrequency(shadowFreq).slice(0, 4)

  // Borders
  const borderFreq = frequencyForCategory(styles, 'border', styles.borders)
  const borders = sortByFrequency(borderFreq).slice(0, 4)

  // Font families - keep both primary names and full stacks
  const fontStacks = sortByFrequency(frequencyForCategory(styles, 'fontFamily', styles.fontFamilies))
    .map((f) => f.replace(/"/g, '').trim())
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
  const transitions = sortByFrequency(transitionFreq).filter(uniqueFilter()).slice(0, 6)

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
    usageCount: styles.usageCount,
  }
}

function pxToRem(value: string): string {
  const px = parseFloat(value)
  if (isNaN(px)) return value
  return `${(px / 16).toFixed(3).replace(/\.?0+$/, '')}rem`
}

function pxToUnitless(value: string): string {
  const px = parseFloat(value)
  if (isNaN(px)) return value
  // If it looks like a px line-height, convert to ratio (assuming 16px base)
  if (value.endsWith('px')) {
    return (px / 16).toFixed(2).replace(/\.?0+$/, '')
  }
  return value
}

function uniqueFilter() {
  const seen = new Set<string>()
  return (val: string) => {
    if (seen.has(val)) return false
    seen.add(val)
    return true
  }
}
