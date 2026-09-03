import type { DesignToken } from '../analyzer/types.js'
import { type DarkModeExportData, normalizeDarkSelector } from './dark-mode.js'
import {
  DURATION_NAMES,
  RADIUS_NAMES,
  SHADOW_NAMES,
  portableFontEntries,
  portableFontSizeEntries,
  portableFontWeightEntries,
  portableLetterSpacingEntries,
  portableLineHeightEntries,
} from './token-names.js'

interface ThemeCustomPropertyOptions {
  fontIdentity?: DesignToken['typography']
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

  for (const font of portableFontEntries(tokens.typography, options.fontIdentity)) {
    lines.push(`${indent}--font-${font.name}: ${font.value};`)
  }

  if (options.includeFontSizes) {
    for (const entry of portableFontSizeEntries(tokens.typography.fontSizes, options.fontIdentity?.fontSizes)) {
      lines.push(`${indent}--font-size-${entry.name}: ${entry.value};`)
    }
  }

  if (options.includeFontWeights) {
    for (const entry of portableFontWeightEntries(tokens.typography.fontWeights, options.fontIdentity?.fontWeights)) {
      lines.push(`${indent}--font-weight-${entry.name}: ${entry.value};`)
    }
  }

  if (options.includeLineHeights) {
    for (const entry of portableLineHeightEntries(tokens.typography.lineHeights, options.fontIdentity?.lineHeights)) {
      lines.push(`${indent}--line-height-${entry.name}: ${entry.value};`)
    }
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
    for (const entry of portableLetterSpacingEntries(
      tokens.typography.letterSpacings,
      options.fontIdentity?.letterSpacings,
    )) {
      lines.push(`${indent}--letter-spacing-${entry.name}: ${entry.value};`)
    }
  }

  if (options.includeZIndices) {
    appendIndexedCustomProperties(lines, tokens.zIndices, 'z', (index) => `${(index + 1) * 10}`, indent)
  }

  appendIndexedCustomProperties(lines, tokens.transitions, 'duration', DURATION_NAMES, indent)
}

function appendTailwindThemeProperties(
  lines: string[],
  tokens: DesignToken,
  indent = '  ',
  fontIdentity: DesignToken['typography'] = tokens.typography,
): void {
  appendColorCustomProperties(lines, tokens.colors, indent)

  for (const font of portableFontEntries(tokens.typography, fontIdentity)) {
    lines.push(`${indent}--font-${font.name}: ${font.value};`)
  }

  for (const entry of portableFontSizeEntries(tokens.typography.fontSizes, fontIdentity.fontSizes)) {
    lines.push(`${indent}--text-${entry.name}: ${entry.value};`)
  }

  portableFontWeightEntries(tokens.typography.fontWeights, fontIdentity.fontWeights).forEach(({ name, value }) => {
    lines.push(`${indent}--font-weight-${name}: ${value};`)
  })
  for (const entry of portableLineHeightEntries(tokens.typography.lineHeights, fontIdentity.lineHeights)) {
    lines.push(`${indent}--leading-${entry.name}: ${entry.value};`)
  }
  for (const entry of portableLetterSpacingEntries(tokens.typography.letterSpacings, fontIdentity.letterSpacings)) {
    lines.push(`${indent}--tracking-${entry.name}: ${entry.value};`)
  }
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
    lines.push('/* Dark mode overrides */')
    lines.push(`${selector} {`)
    if (darkMode.method === 'media-query') lines.push('  :root {')
    const indent = darkMode.method === 'media-query' ? '    ' : '  '

    appendThemeCustomProperties(lines, darkMode.darkTokens, {
      fontIdentity: tokens.typography,
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
    appendTailwindThemeProperties(lines, darkMode.darkTokens, indent, tokens.typography)
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

  for (const font of portableFontEntries(tokens.typography)) {
    lines.push(`$font-${font.name}: ${font.value};`)
  }
  lines.push('')

  portableFontSizeEntries(tokens.typography.fontSizes).forEach(({ name, value }) => {
    lines.push(`$font-size-${name}: ${value};`)
  })
  portableFontWeightEntries(tokens.typography.fontWeights).forEach(({ name, value }) => {
    lines.push(`$font-weight-${name}: ${value};`)
  })
  portableLineHeightEntries(tokens.typography.lineHeights).forEach(({ name, value }) => {
    lines.push(`$line-height-${name}: ${value};`)
  })
  portableLetterSpacingEntries(tokens.typography.letterSpacings).forEach(({ name, value }) => {
    lines.push(`$letter-spacing-${name}: ${value};`)
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
    for (const font of portableFontEntries(darkTokens.typography, tokens.typography)) {
      lines.push(`$dark-font-${font.name}: ${font.value};`)
    }
    portableFontSizeEntries(darkTokens.typography.fontSizes, tokens.typography.fontSizes).forEach(({ name, value }) => {
      lines.push(`$dark-font-size-${name}: ${value};`)
    })
    portableFontWeightEntries(darkTokens.typography.fontWeights, tokens.typography.fontWeights).forEach(
      ({ name, value }) => {
        lines.push(`$dark-font-weight-${name}: ${value};`)
      },
    )
    portableLineHeightEntries(darkTokens.typography.lineHeights, tokens.typography.lineHeights).forEach(
      ({ name, value }) => {
        lines.push(`$dark-line-height-${name}: ${value};`)
      },
    )
    portableLetterSpacingEntries(darkTokens.typography.letterSpacings, tokens.typography.letterSpacings).forEach(
      ({ name, value }) => {
        lines.push(`$dark-letter-spacing-${name}: ${value};`)
      },
    )
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
      fontIdentity: tokens.typography,
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
