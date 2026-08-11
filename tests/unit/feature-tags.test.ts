import { describe, expect, test } from 'vitest'

import { generateFeatureTags } from '../../src/core/analyzer/feature-tags.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

function tokens(overrides: Partial<DesignToken> = {}): DesignToken {
  return {
    colors: { background: '#ffffff', foreground: '#111111', primary: '#1772f6' },
    typography: {
      fontFamilies: ['Inter'],
      fontStacks: ['Inter, sans-serif'],
      fontSizes: ['16px'],
      fontWeights: ['400'],
      lineHeights: ['1.5'],
      letterSpacings: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
    ...overrides,
  }
}

describe('design feature tags', () => {
  test('uses the dominant weighted spacing rhythm instead of a rounded GCD', () => {
    const designTokens = tokens({ spacing: ['1.5px', '4px', '6px', '8px', '12px', '16px', '24px', '32px'] })
    const styles = createExtractedStyles({
      usageCount: {
        'spacing:1.5px': 104,
        'spacing:4px': 731,
        'spacing:6px': 122,
        'spacing:8px': 1_451,
        'spacing:12px': 210,
        'spacing:16px': 1_962,
        'spacing:24px': 167,
        'spacing:32px': 202,
      },
    })

    const tags = generateFeatureTags(designTokens, styles)
    expect(tags).toContain('4px-base grid spacing')
    expect(tags).not.toContain('2px-base grid spacing')
  })

  test('does not claim a base grid when no spacing rhythm dominates', () => {
    const designTokens = tokens({ spacing: ['3px', '5px', '8px', '11px', '14px'] })

    expect(generateFeatureTags(designTokens, createExtractedStyles())).not.toEqual(
      expect.arrayContaining([expect.stringContaining('base grid spacing')]),
    )
  })

  test('does not label a proportional site as monospace because it also uses a code font', () => {
    const mixed = tokens({
      typography: {
        ...tokens().typography,
        fontFamilies: ['Mona Sans', 'Mona Sans Mono'],
        fontStacks: ['Mona Sans, sans-serif', 'Mona Sans Mono, monospace'],
      },
    })
    const monospace = tokens({
      typography: {
        ...tokens().typography,
        fontFamilies: ['Cascadia Code', 'Inter'],
        fontStacks: ['Cascadia Code, monospace', 'Inter, sans-serif'],
      },
    })

    expect(generateFeatureTags(mixed, createExtractedStyles())).not.toContain('monospace typography')
    expect(generateFeatureTags(monospace, createExtractedStyles())).toContain('monospace typography')
  })

  test('uses the observed radius distribution instead of pill and avatar sentinels', () => {
    const designTokens = tokens({ radii: ['2px', '3px', '4px', '100%', '9999px'] })
    const styles = createExtractedStyles({
      usageCount: {
        'radius:2px': 54,
        'radius:3px': 66,
        'radius:4px': 45,
        'radius:100%': 4,
        'radius:9999px': 16,
      },
    })

    const tags = generateFeatureTags(designTokens, styles)
    expect(tags).toContain('sharp-edge geometric style')
    expect(tags).not.toContain('large-radius rounded style')
  })

  test('does not call a neutral palette with one brand accent a rich color system', () => {
    // Zhihu-like: gray canvas, white surface, one blue accent, plus status and incidental colors.
    const designTokens = tokens({
      colors: {
        background: '#f4f6f9',
        surface: '#ffffff',
        foreground: '#191b1f',
        'muted-foreground': '#373a40',
        primary: '#1772f6',
        accent: '#09408e',
        border: '#e5e7eb',
        'border-subtle': '#eef0f2',
        'palette-1': '#f6d365',
        'palette-2': '#22c55e',
        'palette-3': '#ef4444',
        'palette-4': '#f97316',
      },
    })
    const styles = createExtractedStyles({
      usageCount: {
        // The blue accent family carries real UI usage.
        'primaryActionColor:rgb(23, 114, 246)': 40,
        'linkColor:rgb(23, 114, 246)': 25,
        'selectedColor:rgb(9, 64, 142)': 12,
        // Yellow badge is barely used; green/red are status-dominant.
        'bgColor:rgb(246, 211, 101)': 2,
        'statusColor:rgb(34, 197, 94)': 30,
        'statusColor:rgb(239, 68, 68)': 28,
        'actionColor:rgb(239, 68, 68)': 2,
        // Orange avatar/badge chrome with no stable role evidence.
        'declaredColor:rgb(249, 115, 22)': 1,
      },
    })

    const tags = generateFeatureTags(designTokens, styles)
    expect(tags).toContain('neutral palette with a single accent')
    expect(tags).not.toContain('rich color system')
  })

  test('keeps rich color system for genuinely multi-hue product palettes', () => {
    const designTokens = tokens({
      colors: {
        background: '#ffffff',
        foreground: '#111111',
        primary: '#4f46e5',
        accent: '#0ea5e9',
        'palette-1': '#22c55e',
        'palette-2': '#f97316',
        'palette-3': '#e11d48',
      },
    })
    const styles = createExtractedStyles({
      usageCount: {
        'primaryActionColor:rgb(79, 70, 229)': 30,
        'brandTokenColor:rgb(14, 165, 233)': 24,
        'bgColor:rgb(34, 197, 94)': 18,
        'actionColor:rgb(249, 115, 22)': 16,
        'bgColor:rgb(225, 29, 72)': 14,
      },
    })

    expect(generateFeatureTags(designTokens, styles)).toContain('rich color system')
  })

  test('requires materially different shadow elevations before calling the system layered', () => {
    const subtle = tokens({
      shadows: [
        'rgba(0, 0, 0, 0.1) 0px 1px 3px 0px',
        'oklch(0 0 0 / 0.1) 0px 1px 3px 0px',
        'rgba(26, 26, 26, 0.1) 0px 1px 3px 0px',
      ],
    })
    expect(generateFeatureTags(subtle, createExtractedStyles())).not.toContain('layered elevation system')

    const layered = tokens({
      shadows: ['0 1px 2px rgba(0, 0, 0, 0.08)', '0 4px 12px rgba(0, 0, 0, 0.12)', '0 12px 32px rgba(0, 0, 0, 0.18)'],
    })
    expect(generateFeatureTags(layered, createExtractedStyles())).toContain('layered elevation system')
  })
})
