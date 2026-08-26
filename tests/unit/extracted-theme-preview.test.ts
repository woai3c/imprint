import { describe, expect, test } from 'vitest'

import { contrastRatio, createExtractedThemePreview } from '../../src/renderer/lib/extracted-theme-preview.js'

describe('extracted theme preview normalization', () => {
  test('creates a complete scoped semantic palette from partial observed tokens', () => {
    const preview = createExtractedThemePreview({
      tokens_json: JSON.stringify({
        colors: {
          background: '#ffffff',
          surface: '#f5f5f5',
          foreground: '#171717',
          primary: '#0057d9',
          secondary: '#7c3aed',
          border: '#d4d4d4',
          'border-subtle': '#eeeeee',
          ring: '#f97316',
          popover: '#fafafa',
          'popover-foreground': '#262626',
        },
        typography: {
          fontStacks: ['Inter, sans-serif'],
          fontSizes: ['12px', '14px', '16px', '20px'],
          fontWeights: ['400', '600'],
          lineHeights: ['1.4', '1.2'],
          letterSpacings: ['-0.02em', '0.01em'],
        },
        spacing: ['4px', '8px', '16px'],
        radii: ['4px', '8px', '12px'],
        shadows: ['0 2px 8px rgb(0 0 0 / 10%)'],
        borders: ['2px solid #d4d4d4'],
      }),
    })

    expect(preview.style['--color-card']).toBe('#f5f5f5')
    expect(preview.style['--color-secondary']).toBe('#7c3aed')
    expect(preview.style['--color-accent']).toBe('#7c3aed')
    expect(preview.style['--color-sidebar']).toBe('#f5f5f5')
    expect(preview.style['--color-input']).toBe('#d4d4d4')
    expect(preview.style['--color-border-subtle']).toBe('#eeeeee')
    expect(preview.style['--color-ring']).toBe('#f97316')
    expect(preview.style['--color-popover']).toBe('#fafafa')
    expect(preview.style['--color-popover-foreground']).toBe('#262626')
    expect(preview.style['--spacing']).toBe('0.25rem')
    expect(preview.style['--radius-md']).toBe('8px')
    expect(preview.style['--font-body']).toBe('Inter, sans-serif')
    expect(preview.style['--font-weight-bold']).toBe('600')
    expect(preview.style['--tracking-heading']).toBe('-0.02em')
    expect(preview.style['--border-width']).toBe('2px')
    expect(preview.style.lineHeight).toBe('var(--leading-body)')
    expect(contrastRatio('#0057d9', preview.style['--color-primary-foreground'])).toBeGreaterThanOrEqual(4.5)
    expect(preview.palette.slice(0, 3)).toEqual(['#ffffff', '#171717', '#0057d9'])
    expect(preview.observedRoleCount).toBe(10)
    expect(preview.adaptedRoleCount).toBeGreaterThan(0)
  })

  test('reports observed contrast failures while adapting unsafe or missing preview roles', () => {
    const preview = createExtractedThemePreview({
      tokens_json: JSON.stringify({
        colors: {
          background: '#ffffff',
          foreground: '#aaaaaa',
          primary: 'url(https://example.com/tracker)',
        },
      }),
    })

    expect(preview.contrastIssueCount).toBe(1)
    expect(contrastRatio('#ffffff', preview.style['--color-foreground'])).toBeGreaterThanOrEqual(4.5)
    expect(preview.style['--color-primary']).not.toContain('url(')
    expect(preview.style['--color-primary-foreground']).toBeTruthy()
  })

  test('keeps validation geometry stable and rejects rare control radii and unreadable text roles', () => {
    const preview = createExtractedThemePreview({
      tokens_json: JSON.stringify({
        colors: {
          background: '#ffffff',
          surface: '#f2f3f5',
          foreground: '#8a919f',
          'muted-foreground': '#c2c6cc',
          primary: '#1e80ff',
          'palette-4': '#333333',
          'palette-7': '#515767',
        },
        typography: {
          fontSizes: ['0.75rem', '0.8rem', '0.813rem', '0.875rem', '0.969rem', '1rem', '1.125rem'],
        },
        spacing: ['2px', '4px', '8px', '12px', '16px'],
        radii: ['2px', '4px', '8px', '10px', '32px'],
        usageCount: {
          'textColor:rgb(51, 51, 51)': 1715,
          'textColor:rgb(138, 145, 159)': 1088,
          'textColor:rgb(81, 87, 103)': 310,
          'radius:2px': 174,
          'radius:4px': 139,
          'radius:8px': 7,
          'radius:10px': 5,
          'radius:32px': 2,
        },
      }),
    })

    expect(preview.style['--spacing']).toBe('0.25rem')
    expect(preview.style['--radius-md']).toBe('4px')
    expect(preview.style['--radius-xl']).toBe('8px')
    expect(preview.style['--color-foreground']).toBe('rgb(51, 51, 51)')
    expect(preview.style['--color-muted-foreground']).toBe('rgb(81, 87, 103)')
    expect(contrastRatio('#ffffff', preview.style['--color-foreground'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#ffffff', preview.style['--color-muted-foreground'])).toBeGreaterThanOrEqual(4.5)
    expect(
      [
        preview.style['--text-xs'],
        preview.style['--text-sm'],
        preview.style['--text-base'],
        preview.style['--text-lg'],
        preview.style['--text-xl'],
        preview.style['--text-2xl'],
      ].every((value) => Number.parseFloat(value) % 2 === 0),
    ).toBe(true)
    expect(preview.contrastIssueCount).toBe(3)
  })

  test('falls back to a neutral complete preview when stored tokens are malformed', () => {
    const preview = createExtractedThemePreview({ tokens_json: '{invalid' })

    expect(preview.style['--color-background']).toBe('#ffffff')
    expect(preview.style['--color-foreground']).toBe('#111827')
    expect(preview.palette.length).toBeGreaterThan(0)
  })

  test('applies a persisted dark variant only when requested', () => {
    const theme = {
      tokens_json: JSON.stringify({
        colors: { background: '#ffffff', foreground: '#191b1f', primary: '#1772f6' },
      }),
      dark_tokens_json: JSON.stringify({
        background: '#16171d',
        foreground: '#f5f5f5',
        primary: '#b39aff',
      }),
    }

    const base = createExtractedThemePreview(theme)
    const dark = createExtractedThemePreview(theme, 'dark')

    expect(base.style['--color-background']).toBe('#ffffff')
    expect(dark.style['--color-background']).toBe('#16171d')
    expect(dark.style['--color-primary']).toBe('#b39aff')
    expect(dark.colorMode).toBe('dark')
    expect(dark.hasDarkMode).toBe(true)
  })

  test('treats dark semantic colors as authoritative instead of inheriting light surfaces', () => {
    const theme = {
      tokens_json: JSON.stringify({
        colors: {
          background: '#ffffff',
          surface: '#f5f5f5',
          foreground: '#191b1f',
          primary: '#1772f6',
          'palette-1': '#7c3aed',
        },
        radii: ['4px', '12px', '9999px'],
        shadows: ['0 1px 2px rgb(0 0 0 / 10%)'],
      }),
      dark_tokens_json: JSON.stringify({
        colors: {
          background: '#16171d',
          foreground: '#f5f5f5',
          primary: '#b39aff',
        },
        typography: {},
        spacing: [],
        radii: ['2px', '8px', '9999px'],
        shadows: ['0 2px 8px rgb(0 0 0 / 40%)'],
        borders: [],
        zIndices: [],
        transitions: [],
      }),
    }

    const dark = createExtractedThemePreview(theme, 'dark')

    expect(dark.style['--color-card']).not.toBe('#f5f5f5')
    expect(dark.style['--color-card']).toBe('#1f2026')
    expect(dark.style['--radius-xl']).toBe('8px')
    expect(dark.style['--shadow-sm']).toBe('0 2px 8px rgb(0 0 0 / 40%)')
  })

  test('ignores empty stored dark token objects', () => {
    const preview = createExtractedThemePreview(
      {
        tokens_json: JSON.stringify({ colors: { background: '#ffffff', foreground: '#111827' } }),
        dark_tokens_json: '{}',
      },
      'dark',
    )

    expect(preview.colorMode).toBe('base')
    expect(preview.hasDarkMode).toBe(false)
  })
})
