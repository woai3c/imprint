import { compile } from 'tailwindcss'
import { describe, expect, test } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import {
  buildDarkModeExportData,
  generateCssVariables,
  generateDesignDoc,
  generateDtcgJson,
  generateScssVariables,
  generateTailwindTheme,
  restoreDarkModeExportData,
} from '../../src/core/export/index.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

const baseTokens: DesignToken = {
  colors: { background: '#ffffff', foreground: '#111827', primary: '#1772f6' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['1rem'],
    fontWeights: ['400'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['4px'],
  radii: ['8px'],
  shadows: ['0 1px 2px rgb(0 0 0 / 10%)'],
  borders: [],
  zIndices: [],
  transitions: [],
}

describe('dark mode export data', () => {
  test('builds deterministic dark tokens once for every export entry point', () => {
    const darkMode = buildDarkModeExportData({
      hasDarkMode: true,
      method: 'media-query',
      selector: undefined,
      darkStyles: createExtractedStyles({
        colors: ['rgb(22, 23, 29)', 'rgb(245, 245, 245)', 'rgb(179, 154, 255)'],
        backgroundColors: ['rgb(22, 23, 29)'],
        textColors: ['rgb(245, 245, 245)'],
        shadows: ['0 2px 8px rgb(0 0 0 / 40%)'],
        usageCount: {
          'bgArea:rgb(22, 23, 29)': 100,
          'bgColor:rgb(22, 23, 29)': 10,
          'textColor:rgb(245, 245, 245)': 20,
          'accentColor:rgb(179, 154, 255)': 8,
          'shadow:0 2px 8px rgb(0 0 0 / 40%)': 2,
        },
      }),
    })

    expect(darkMode?.darkTokens?.colors.background).toBe('#16171d')
    expect(darkMode?.darkTokens?.colors.foreground).toBe('#f5f5f5')
    expect(darkMode?.darkTokens?.colors.primary).toBe('#b39aff')
    expect(darkMode?.selector).toBeUndefined()
  })

  test('restores full dark tokens and remains compatible with legacy color-only records', () => {
    const fullDarkTokens = { ...baseTokens, colors: { background: '#16171d', foreground: '#f5f5f5' } }
    const restoredFull = restoreDarkModeExportData(fullDarkTokens, baseTokens, 'class-toggle', '[data-theme="dark"]')
    const restoredLegacy = restoreDarkModeExportData(fullDarkTokens.colors, baseTokens, 'media-query')

    expect(restoredFull?.darkTokens).toEqual(fullDarkTokens)
    expect(restoredFull?.method).toBe('class-toggle')
    expect(restoredFull?.selector).toBe('[data-theme="dark"]')
    expect(restoredLegacy?.darkTokens?.typography).toEqual(baseTokens.typography)
    expect(restoredLegacy?.darkTokens?.colors).toEqual(fullDarkTokens.colors)
  })

  test('does not treat independently clustered dark palette indexes as base token overrides', () => {
    const restored = restoreDarkModeExportData(
      {
        ...baseTokens,
        colors: { background: '#16171d', 'palette-3': '#0084ff' },
        evidence: {
          'colors.palette-3': {
            value: '#0084ff',
            confidence: 'high',
            observationCount: 8,
            pageCount: 1,
            captureCount: 1,
            pages: [],
            sources: ['usage:bgColor'],
            reasons: [],
          },
        },
      },
      baseTokens,
      'media-query',
    )

    expect(restored?.darkTokens?.colors['palette-3']).toBeUndefined()
    expect(restored?.darkTokens?.colors['dark-palette-3']).toBe('#0084ff')
    expect(restored?.darkTokens?.evidence?.['colors.palette-3']).toBeUndefined()
    expect(restored?.darkTokens?.evidence?.['colors.dark-palette-3']?.value).toBe('#0084ff')
  })

  test('includes the dark variant in DTCG JSON without changing the base token paths', () => {
    const darkTokens = { ...baseTokens, colors: { background: '#16171d', foreground: '#f5f5f5' } }
    const dtcg = JSON.parse(generateDtcgJson(baseTokens, { hasDarkMode: true, darkTokens, method: 'media-query' })) as {
      color: Record<string, { $value: string }>
      dark: {
        color: Record<string, { $value: string }>
        shadow: Record<string, { $value: string }>
        spacing: Record<string, { $value: string }>
      }
      $extensions: Record<string, { method: string }>
    }

    expect(dtcg.color.background.$value).toBe('#ffffff')
    expect(dtcg.dark.color.background.$value).toBe('#16171d')
    expect(dtcg.dark.shadow.sm.$value).toBe(darkTokens.shadows[0])
    expect(dtcg.dark.spacing['1'].$value).toBe(darkTokens.spacing[0])
    expect(dtcg.$extensions['com.imprint.darkMode'].method).toBe('media-query')
  })

  test('includes dark colors and shadows in Tailwind overrides', () => {
    const darkTokens = {
      ...baseTokens,
      colors: { background: '#16171d', foreground: '#f5f5f5' },
      shadows: ['0 2px 8px rgb(0 0 0 / 40%)'],
    }
    const tailwind = generateTailwindTheme(baseTokens, {
      hasDarkMode: true,
      darkTokens,
      method: 'media-query',
    })

    expect(tailwind).toContain('@media (prefers-color-scheme: dark)')
    expect(tailwind).toContain('--color-background: #16171d;')
    expect(tailwind).toContain('--shadow-sm: 0 2px 8px rgb(0 0 0 / 40%);')
  })

  test('uses Tailwind v4 namespaces that generate real utilities', async () => {
    const tailwind = generateTailwindTheme(
      {
        ...baseTokens,
        typography: { ...baseTokens.typography, letterSpacings: ['-0.01em'] },
        borders: ['1px solid #e5e7eb'],
        zIndices: ['10'],
        transitions: ['150ms', '200ms'],
      },
      undefined,
      [{ width: 640, label: 'tablet-sm' }],
    )

    expect(tailwind).toContain('--text-xs: 1rem;')
    expect(tailwind).toContain('--leading-tight: 1.5;')
    expect(tailwind).toContain('--font-weight-normal: 400;')
    expect(tailwind).toContain('--tracking-tight: -0.01em;')
    expect(tailwind).toContain('--breakpoint-tablet-sm: 40rem;')
    expect(tailwind).toContain(':root {')
    expect(tailwind).toContain('--border-1: 1px solid #e5e7eb;')
    expect(tailwind).not.toContain('--font-size-xs:')

    const compiler = await compile(`${tailwind}\n@tailwind utilities;`)
    const css = compiler.build([
      'text-xs',
      'leading-tight',
      'font-normal',
      'tracking-tight',
      'p-1',
      'rounded-sm',
      'shadow-sm',
      'tablet-sm:text-xs',
    ])
    expect(css).toContain('.text-xs')
    expect(css).toContain('.leading-tight')
    expect(css).toContain('.font-normal')
    expect(css).toContain('.tracking-tight')
    expect(css).toContain('.p-1')
    expect(css).toContain('.rounded-sm')
    expect(css).toContain('.shadow-sm')
    expect(css).toContain('@media (width >= 40rem)')
  })

  test('preserves an observed attribute selector in CSS, Tailwind, and SCSS', () => {
    const darkMode = {
      hasDarkMode: true,
      darkTokens: { ...baseTokens, colors: { background: '#16171d', foreground: '#f5f5f5' } },
      method: 'class-toggle' as const,
      selector: '[data-theme="dark"]',
    }

    expect(generateCssVariables(baseTokens, darkMode)).toContain('[data-theme="dark"] {')
    expect(generateTailwindTheme(baseTokens, darkMode)).toContain('[data-theme="dark"] {')
    expect(generateScssVariables(baseTokens, darkMode)).toContain('[data-theme="dark"] {')
    expect(generateScssVariables(baseTokens, darkMode)).toContain('@mixin imprint-dark-theme')
    expect(generateScssVariables(baseTokens, darkMode)).toContain('$font-weight-1: 400;')
    expect(generateScssVariables(baseTokens, darkMode)).toContain('$dark-line-height-1: 1.5;')
  })

  test('labels dark token provenance without implying a dark-by-default site', () => {
    const darkTokens = { ...baseTokens, colors: { background: '#16171d', foreground: '#f5f5f5' } }
    const mediaDoc = generateDesignDoc(baseTokens, undefined, undefined, {
      hasDarkMode: true,
      darkTokens,
      method: 'media-query',
    })
    expect(mediaDoc).toContain('observed by emulating prefers-color-scheme: dark')
    expect(mediaDoc).toContain('does not imply the site loads in dark by default')

    const toggleDoc = generateDesignDoc(
      baseTokens,
      undefined,
      undefined,
      { hasDarkMode: true, darkTokens, method: 'class-toggle', selector: '[data-theme="dark"]' },
      undefined,
      undefined,
      'zh-CN',
    )
    expect(toggleDoc).toContain('切换 [data-theme="dark"] 后读取计算样式')
    expect(toggleDoc).toContain('不代表该站点默认以深色加载')
  })

  test('rejects unsafe stored dark selectors', () => {
    const restored = restoreDarkModeExportData(baseTokens, baseTokens, 'class-toggle', 'body { color: red }')
    expect(restored?.selector).toBe('.dark')
  })

  test('ignores empty dark snapshots and safely defaults inconsistent methods', () => {
    expect(restoreDarkModeExportData({}, baseTokens, 'media-query')).toBeUndefined()
    expect(restoreDarkModeExportData({ background: '#16171d' }, baseTokens, 'none')?.method).toBe('media-query')
  })

  test('matches normalized token colors back to raw browser usage counts', () => {
    const designDoc = generateDesignDoc({
      ...baseTokens,
      usageCount: {
        'bgColor:rgb(255, 255, 255)': 3,
        'textColor:rgb(17, 24, 39)': 7,
      },
    })

    expect(designDoc).toContain('| `--color-background` | `#ffffff` | 3× (background) |')
    expect(designDoc).toContain('| `--color-foreground` | `#111827` | 7× (text) |')
  })

  test('reports structural color usage for default and subtle border tokens', () => {
    const tokens = {
      ...baseTokens,
      colors: {
        ...baseTokens.colors,
        border: 'rgb(235, 236, 237)',
        'border-subtle': 'rgb(248, 248, 250)',
      },
      usageCount: {
        'borderColor:rgb(235, 236, 237)': 34,
        'borderColor:rgb(248, 248, 250)': 40,
      },
    }
    const englishDoc = generateDesignDoc(tokens)
    const chineseDoc = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, undefined, 'zh-CN')

    expect(englishDoc).toContain('| `--color-border` | `rgb(235, 236, 237)` | 34× (border) |')
    expect(chineseDoc).toContain('| `--color-border-subtle` | `rgb(248, 248, 250)` | 40× (边框) |')
  })
})
