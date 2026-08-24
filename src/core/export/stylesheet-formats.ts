import type { DesignToken } from '../analyzer/types.js'
import { type DarkModeExportData, normalizeDarkSelector } from './dark-mode.js'
import {
  DURATION_NAMES,
  FONT_SIZE_NAMES,
  LETTER_SPACING_NAMES,
  LINE_HEIGHT_NAMES,
  RADIUS_NAMES,
  SHADOW_NAMES,
  tailwindFontWeightName,
} from './token-names.js'

interface ThemeCustomPropertyOptions {
  fontFamily?: string
  includeFontSizes?: boolean
  includeFontWeights?: boolean
  includeLineHeights?: boolean
  includeShadows?: boolean
  includeBorders?: boolean
  includeLetterSpacings?: boolean
  includeZIndices?: boolean
  indent?: string
}

function appendColorCustomProperties(lines: string[], colors: Readonly<Record<string, string>>, indent = '  '): void {
  for (const [name, value] of Object.entries(colors)) {
    lines.push(`${indent}--color-${name}: ${value};`)
  }
}

function appendIndexedCustomProperties(
  lines: string[],
  values: readonly string[] | undefined,
  prefix: string,
  names: readonly string[] | ((index: number) => string) = [],
  indent = '  ',
): void {
  values?.forEach((value, index) => {
    const name = typeof names === 'function' ? names(index) : names[index] || `${index + 1}`
    lines.push(`${indent}--${prefix}-${name}: ${value};`)
  })
}

function appendThemeCustomProperties(lines: string[], tokens: DesignToken, options: ThemeCustomPropertyOptions): void {
  const indent = options.indent || '  '
  appendColorCustomProperties(lines, tokens.colors, indent)

  if (options.fontFamily !== undefined) {
    lines.push(`${indent}--font-sans: ${options.fontFamily};`)
  }

  if (options.includeFontSizes) {
    appendIndexedCustomProperties(lines, tokens.typography.fontSizes, 'font-size', FONT_SIZE_NAMES, indent)
  }

  if (options.includeFontWeights) {
    appendIndexedCustomProperties(lines, tokens.typography.fontWeights, 'font-weight', [], indent)
  }

  if (options.includeLineHeights) {
    appendIndexedCustomProperties(lines, tokens.typography.lineHeights, 'line-height', [], indent)
  }

  appendIndexedCustomProperties(lines, tokens.spacing, 'spacing', [], indent)
  appendIndexedCustomProperties(lines, tokens.radii, 'radius', RADIUS_NAMES, indent)

  if (options.includeShadows) {
    appendIndexedCustomProperties(lines, tokens.shadows, 'shadow', SHADOW_NAMES, indent)
  }

  if (options.includeBorders) {
    appendIndexedCustomProperties(lines, tokens.borders, 'border', [], indent)
  }

  if (options.includeLetterSpacings) {
    appendIndexedCustomProperties(
      lines,
      tokens.typography.letterSpacings,
      'letter-spacing',
      LETTER_SPACING_NAMES,
      indent,
    )
  }

  if (options.includeZIndices) {
    appendIndexedCustomProperties(lines, tokens.zIndices, 'z', (index) => `${(index + 1) * 10}`, indent)
  }

  appendIndexedCustomProperties(lines, tokens.transitions, 'duration', DURATION_NAMES, indent)
}

function appendTailwindThemeProperties(lines: string[], tokens: DesignToken, indent = '  '): void {
  appendColorCustomProperties(lines, tokens.colors, indent)

  const fontFamily = tokens.typography.fontStacks?.[0] || tokens.typography.fontFamilies[0]
  if (fontFamily) lines.push(`${indent}--font-sans: ${fontFamily};`)

  const lineHeights = tokens.typography.lineHeights || []
  const bodyLineHeight = lineHeights[Math.floor(lineHeights.length / 2)]
  const headingLineHeight = lineHeights[0]
  tokens.typography.fontSizes.forEach((value, index) => {
    const name = FONT_SIZE_NAMES[index] || `${index + 1}`
    lines.push(`${indent}--text-${name}: ${value};`)
    const lineHeight = index >= 3 ? headingLineHeight : bodyLineHeight
    if (lineHeight) lines.push(`${indent}--text-${name}--line-height: ${lineHeight};`)
  })

  tokens.typography.fontWeights.forEach((value, index) => {
    lines.push(`${indent}--font-weight-${tailwindFontWeightName(value, index)}: ${value};`)
  })
  appendIndexedCustomProperties(lines, lineHeights, 'leading', LINE_HEIGHT_NAMES, indent)
  appendIndexedCustomProperties(lines, tokens.typography.letterSpacings, 'tracking', LETTER_SPACING_NAMES, indent)
  appendIndexedCustomProperties(lines, tokens.spacing, 'spacing', [], indent)
  appendIndexedCustomProperties(lines, tokens.radii, 'radius', RADIUS_NAMES, indent)
  appendIndexedCustomProperties(lines, tokens.shadows, 'shadow', SHADOW_NAMES, indent)
}

function appendTailwindSupplementalProperties(lines: string[], tokens: DesignToken, indent = '  '): void {
  appendIndexedCustomProperties(lines, tokens.borders, 'border', [], indent)
  appendIndexedCustomProperties(lines, tokens.zIndices, 'z', (index) => `${(index + 1) * 10}`, indent)
  appendIndexedCustomProperties(lines, tokens.transitions, 'duration', DURATION_NAMES, indent)
  const defaultDuration = tokens.transitions?.[Math.min(1, tokens.transitions.length - 1)]
  if (defaultDuration) lines.push(`${indent}--default-transition-duration: ${defaultDuration};`)
}

export function generateCssVariables(
  tokens: DesignToken,
  darkMode?: DarkModeExportData,
  breakpoints?: Array<{ width: number; label: string }>,
): string {
  const lines: string[] = [':root {']

  appendThemeCustomProperties(lines, tokens, {
    fontFamily:
      tokens.typography.fontFamilies.length > 0
        ? tokens.typography.fontStacks?.[0] || tokens.typography.fontFamilies[0]
        : undefined,
    includeFontSizes: true,
    includeFontWeights: true,
    includeLineHeights: true,
    includeShadows: true,
    includeBorders: true,
    includeLetterSpacings: true,
    includeZIndices: true,
  })

  if (breakpoints && breakpoints.length > 0) {
    breakpoints.forEach((bp) => {
      lines.push(`  --breakpoint-${bp.label}: ${bp.width}px;`)
    })
  }

  lines.push('}')

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    const selector =
      darkMode.method === 'media-query'
        ? '@media (prefers-color-scheme: dark)'
        : normalizeDarkSelector(darkMode.selector)
    lines.push('')
    lines.push(`${selector} {`)
    if (darkMode.method === 'media-query') lines.push('  :root {')
    const indent = darkMode.method === 'media-query' ? '    ' : '  '

    appendThemeCustomProperties(lines, darkMode.darkTokens, {
      fontFamily:
        darkMode.darkTokens.typography.fontFamilies.length > 0
          ? darkMode.darkTokens.typography.fontStacks?.[0] || darkMode.darkTokens.typography.fontFamilies[0]
          : undefined,
      includeFontSizes: true,
      includeFontWeights: true,
      includeLineHeights: true,
      includeShadows: true,
      includeBorders: true,
      includeLetterSpacings: true,
      includeZIndices: true,
      indent,
    })

    if (darkMode.method === 'media-query') lines.push('  }')
    lines.push('}')
  }

  return lines.join('\n')
}

export function generateTailwindTheme(
  tokens: DesignToken,
  darkMode?: DarkModeExportData,
  breakpoints?: Array<{ width: number; label: string }>,
): string {
  const lines: string[] = ['@theme {']

  appendTailwindThemeProperties(lines, tokens)
  breakpoints?.forEach((breakpoint) => {
    lines.push(`  --breakpoint-${breakpoint.label}: ${breakpoint.width / 16}rem;`)
  })

  lines.push('}')
  if (tokens.borders.length > 0 || tokens.zIndices?.length > 0 || tokens.transitions?.length > 0) {
    lines.push('', ':root {')
    appendTailwindSupplementalProperties(lines, tokens)
    lines.push('}')
  }

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    lines.push('')
    lines.push('/* Dark mode overrides */')
    const selector =
      darkMode.method === 'media-query'
        ? '@media (prefers-color-scheme: dark)'
        : normalizeDarkSelector(darkMode.selector)
    lines.push(`${selector} {`)
    if (darkMode.method === 'media-query') lines.push('  :root {')
    const indent = darkMode.method === 'media-query' ? '    ' : '  '
    appendTailwindThemeProperties(lines, darkMode.darkTokens, indent)
    appendTailwindSupplementalProperties(lines, darkMode.darkTokens, indent)
    if (darkMode.method === 'media-query') lines.push('  }')
    lines.push('}')
  }

  return lines.join('\n')
}

export function generateScssVariables(tokens: DesignToken, darkMode?: DarkModeExportData): string {
  const lines: string[] = ['// Design System SCSS Variables', '// Generated by Imprint', '']

  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`$color-${name}: ${value};`)
  }
  lines.push('')

  if (tokens.typography.fontFamilies.length > 0) {
    lines.push(`$font-sans: ${tokens.typography.fontStacks?.[0] || tokens.typography.fontFamilies[0]};`)
  }
  lines.push('')

  tokens.typography.fontSizes.forEach((val, i) => {
    lines.push(`$font-size-${FONT_SIZE_NAMES[i] || i + 1}: ${val};`)
  })
  tokens.typography.fontWeights.forEach((val, i) => lines.push(`$font-weight-${i + 1}: ${val};`))
  tokens.typography.lineHeights.forEach((val, i) => lines.push(`$line-height-${i + 1}: ${val};`))
  tokens.typography.letterSpacings?.forEach((val, i) => {
    lines.push(`$letter-spacing-${LETTER_SPACING_NAMES[i] || i + 1}: ${val};`)
  })
  lines.push('')

  tokens.spacing.forEach((val, i) => {
    lines.push(`$spacing-${i + 1}: ${val};`)
  })
  lines.push('')

  tokens.radii.forEach((val, i) => {
    lines.push(`$radius-${RADIUS_NAMES[i] || i + 1}: ${val};`)
  })
  lines.push('')

  tokens.shadows.forEach((val, i) => {
    lines.push(`$shadow-${SHADOW_NAMES[i] || i + 1}: ${val};`)
  })

  tokens.borders.forEach((val, i) => lines.push(`$border-${i + 1}: ${val};`))

  if (tokens.zIndices?.length > 0) {
    lines.push('')
    tokens.zIndices.forEach((val, i) => {
      lines.push(`$z-${(i + 1) * 10}: ${val};`)
    })
  }

  if (tokens.transitions?.length > 0) {
    lines.push('')
    tokens.transitions.forEach((val, i) => {
      lines.push(`$duration-${DURATION_NAMES[i] || i + 1}: ${val};`)
    })
  }

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    const darkTokens = darkMode.darkTokens
    lines.push('', '// Captured dark mode values')
    for (const [name, value] of Object.entries(darkTokens.colors)) {
      lines.push(`$dark-color-${name}: ${value};`)
    }
    darkTokens.typography.fontSizes.forEach((value, index) => {
      lines.push(`$dark-font-size-${FONT_SIZE_NAMES[index] || index + 1}: ${value};`)
    })
    darkTokens.typography.fontWeights.forEach((value, index) => {
      lines.push(`$dark-font-weight-${index + 1}: ${value};`)
    })
    darkTokens.typography.lineHeights.forEach((value, index) => {
      lines.push(`$dark-line-height-${index + 1}: ${value};`)
    })
    darkTokens.typography.letterSpacings?.forEach((value, index) => {
      lines.push(`$dark-letter-spacing-${LETTER_SPACING_NAMES[index] || index + 1}: ${value};`)
    })
    darkTokens.spacing.forEach((value, index) => lines.push(`$dark-spacing-${index + 1}: ${value};`))
    darkTokens.radii.forEach((value, index) => {
      lines.push(`$dark-radius-${RADIUS_NAMES[index] || index + 1}: ${value};`)
    })
    darkTokens.shadows.forEach((value, index) => {
      lines.push(`$dark-shadow-${SHADOW_NAMES[index] || index + 1}: ${value};`)
    })
    darkTokens.borders.forEach((value, index) => lines.push(`$dark-border-${index + 1}: ${value};`))
    darkTokens.zIndices?.forEach((value, index) => lines.push(`$dark-z-${(index + 1) * 10}: ${value};`))
    darkTokens.transitions?.forEach((value, index) => {
      lines.push(`$dark-duration-${DURATION_NAMES[index] || index + 1}: ${value};`)
    })

    lines.push('', '@mixin imprint-dark-theme {')
    appendThemeCustomProperties(lines, darkTokens, {
      fontFamily:
        darkTokens.typography.fontFamilies.length > 0
          ? darkTokens.typography.fontStacks?.[0] || darkTokens.typography.fontFamilies[0]
          : undefined,
      includeFontSizes: true,
      includeFontWeights: true,
      includeLineHeights: true,
      includeShadows: true,
      includeBorders: true,
      includeLetterSpacings: true,
      includeZIndices: true,
      indent: '  ',
    })
    lines.push('}', '')
    if (darkMode.method === 'media-query') {
      lines.push('@media (prefers-color-scheme: dark) {', '  :root {', '    @include imprint-dark-theme;', '  }', '}')
    } else {
      lines.push(`${normalizeDarkSelector(darkMode.selector)} {`, '  @include imprint-dark-theme;', '}')
    }
  }

  return lines.join('\n')
}
