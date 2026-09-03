import { describe, expect, test } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import { generateDesignDoc, generateDtcgJson } from '../../src/core/export/index.js'
import {
  generateCssVariables,
  generateScssVariables,
  generateTailwindTheme,
} from '../../src/core/export/stylesheet-formats.js'
import { portableFontEntries } from '../../src/core/export/token-names.js'

const tokens: DesignToken = {
  colors: { background: '#ffffff', foreground: '#172033' },
  typography: {
    fontFamilies: ['Arial'],
    fontStacks: ['Arial, sans-serif'],
    fontSizes: ['0.875rem', '1rem', '1.75rem'],
    fontWeights: ['400', '700'],
    lineHeights: ['1.25', '1.5'],
    letterSpacings: ['1.12px'],
  },
  spacing: [],
  radii: [],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

describe('value-derived typography implementation names', () => {
  test('names a font stack from its first actual generic fallback', () => {
    expect(portableFontEntries({ fontStacks: ['Georgia, serif, sans-serif'] })).toEqual([
      { name: 'serif', value: 'Georgia, serif, sans-serif' },
    ])
    expect(portableFontEntries({ fontStacks: ['"serif", sans-serif, monospace'] })).toEqual([
      { name: 'sans', value: '"serif", sans-serif, monospace' },
    ])
  })

  test('keeps sparse font sizes and positive tracking semantically honest in every export', () => {
    const css = generateCssVariables(tokens)
    const tailwind = generateTailwindTheme(tokens)
    const scss = generateScssVariables(tokens)
    const design = generateDesignDoc(tokens, 'https://example.com/')

    expect(css).toContain('--font-size-sm: 0.875rem;')
    expect(css).toContain('--font-size-base: 1rem;')
    expect(css).toContain('--font-size-28: 1.75rem;')
    expect(css).toContain('--letter-spacing-wide: 1.12px;')
    expect(css).toContain('--line-height-tight: 1.25;')
    expect(css).toContain('--line-height-normal: 1.5;')
    expect(css).toContain('--font-weight-normal: 400;')
    expect(css).toContain('--font-weight-bold: 700;')

    expect(tailwind).toContain('--text-sm: 0.875rem;')
    expect(tailwind).toContain('--text-base: 1rem;')
    expect(tailwind).toContain('--text-28: 1.75rem;')
    expect(tailwind).toContain('--tracking-wide: 1.12px;')
    expect(tailwind).toContain('--font-weight-normal: 400;')
    expect(tailwind).toContain('--font-weight-bold: 700;')
    expect(tailwind).not.toMatch(/--text-.+--line-height:/)

    expect(scss).toContain('$font-size-28: 1.75rem;')
    expect(scss).toContain('$letter-spacing-wide: 1.12px;')
    expect(scss).toContain('$font-weight-normal: 400;')
    expect(scss).toContain('$font-weight-bold: 700;')
    expect(design).toContain('  size-base:\n    fontSize: 1rem')
    expect(design).toContain('  size-28:\n    fontSize: 1.75rem')
    expect(design).toContain('  letter-spacing-wide:\n    letterSpacing: 1.12px')
    expect(design).toContain('  weight-normal:\n    fontWeight: 400')
    expect(design).toContain('  weight-bold:\n    fontWeight: 700')
    expect(JSON.parse(generateDtcgJson(tokens)).typography.fontWeights.$value).toEqual(['400', '700'])

    for (const output of [css, tailwind, scss, design]) {
      expect(output).not.toMatch(/(?:size|text)-base[^\n]*1\.75rem/)
      expect(output).not.toMatch(/(?:letter-spacing|tracking)-tight[^\n]*1\.12px/)
    }
  })

  test('anchors dark typography names to base identities even when values change', () => {
    const darkTokens: DesignToken = {
      ...structuredClone(tokens),
      typography: {
        ...structuredClone(tokens.typography),
        fontSizes: ['0.75rem', '1.125rem', '2rem'],
        fontWeights: ['500', '800'],
        lineHeights: ['1.375', '1.625'],
        letterSpacings: ['-0.02em'],
      },
    }
    const darkMode = { hasDarkMode: true as const, darkTokens, method: 'media-query' as const }
    const css = generateCssVariables(tokens, darkMode)
    const tailwind = generateTailwindTheme(tokens, darkMode)
    const scss = generateScssVariables(tokens, darkMode)
    const design = generateDesignDoc(tokens, undefined, undefined, darkMode)
    const dtcg = JSON.parse(generateDtcgJson(tokens, darkMode))

    expect(css).toContain('--font-size-sm: 0.75rem;')
    expect(css).toContain('--font-size-base: 1.125rem;')
    expect(css).toContain('--font-size-28: 2rem;')
    expect(css).toContain('--letter-spacing-wide: -0.02em;')
    expect(css).toMatch(/Dark mode overrides[\s\S]*--font-weight-normal: 500;/)
    expect(css).toMatch(/Dark mode overrides[\s\S]*--font-weight-bold: 800;/)
    expect(tailwind).toContain('--text-28: 2rem;')
    expect(tailwind).toContain('--tracking-wide: -0.02em;')
    expect(tailwind).toMatch(/Dark mode overrides[\s\S]*--font-weight-normal: 500;/)
    expect(tailwind).toMatch(/Dark mode overrides[\s\S]*--font-weight-bold: 800;/)
    expect(scss).toContain('$dark-font-size-28: 2rem;')
    expect(scss).toContain('$dark-letter-spacing-wide: -0.02em;')
    expect(scss).toContain('$dark-font-weight-normal: 500;')
    expect(scss).toContain('$dark-font-weight-bold: 800;')
    expect(design).toContain('  weight-normal:\n    fontWeight: 400')
    expect(design).toContain('  weight-bold:\n    fontWeight: 700')
    expect(dtcg.typography.fontWeights.$value).toEqual(['400', '700'])
    expect(dtcg.dark.typography.fontWeights.$value).toEqual(['500', '800'])

    for (const output of [css, tailwind, scss]) {
      expect(output).not.toMatch(/(?:font-weight|\$dark-font-weight)-(?:medium|extra-bold): (?:500|800);/)
    }
  })
})
