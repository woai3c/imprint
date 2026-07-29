import { describe, expect, test } from 'vitest'

import { applyColorRenames, validateColorRenames } from '../../src/core/analyzer/token-renamer.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'

function createTokens(colors: Record<string, string>): DesignToken {
  return {
    colors,
    typography: {
      fontFamilies: [],
      fontStacks: [],
      fontSizes: [],
      fontWeights: [],
      lineHeights: [],
      letterSpacings: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
  }
}

describe('AI color rename validation', () => {
  test('accepts one-to-one kebab-case names and rejects unsafe proposals', () => {
    const tokens = createTokens({
      background: '#ffffff',
      primary: '#2563eb',
      accent: '#f59e0b',
    })

    const validation = validateColorRenames(tokens, [
      { tokenId: 'primary', name: 'action-brand' },
      { tokenId: 'missing', name: 'unknown-token' },
      { tokenId: 'accent', name: 'action-brand' },
      { tokenId: 'background', name: 'Invalid Name' },
      { tokenId: 'background', name: 'surface-canvas' },
    ])

    expect(validation.accepted).toEqual([{ tokenId: 'primary', name: 'action-brand' }])
    expect(validation.rejected.map((item) => item.reason)).toEqual([
      'unknown-token',
      'duplicate-name',
      'invalid-name',
      'duplicate-token',
    ])
  })

  test('rejects names already owned by another deterministic token', () => {
    const tokens = createTokens({
      background: '#ffffff',
      primary: '#2563eb',
    })

    expect(validateColorRenames(tokens, [{ tokenId: 'primary', name: 'background' }]).rejected).toMatchObject([
      { reason: 'existing-name' },
    ])
  })

  test('applies the same validated token IDs to light and dark values without mutation', () => {
    const lightTokens = createTokens({
      background: '#ffffff',
      primary: '#2563eb',
    })
    const darkTokens = createTokens({
      background: '#0f172a',
      primary: '#60a5fa',
    })
    const renames = [{ tokenId: 'primary', name: 'action-brand' }]

    const renamedLight = applyColorRenames(lightTokens, renames)
    const renamedDark = applyColorRenames(darkTokens, renames)

    expect(renamedLight.colors).toEqual({
      background: '#ffffff',
      'action-brand': '#2563eb',
    })
    expect(renamedDark.colors).toEqual({
      background: '#0f172a',
      'action-brand': '#60a5fa',
    })
    expect(lightTokens.colors).toHaveProperty('primary', '#2563eb')
    expect(darkTokens.colors).toHaveProperty('primary', '#60a5fa')
  })
})
