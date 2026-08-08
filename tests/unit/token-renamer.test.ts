import { describe, expect, test } from 'vitest'

import { applyColorRenames, validateColorRenames } from '../../src/core/analyzer/token-renamer.js'
import type { DesignToken, TokenConfidence, TokenEvidence } from '../../src/core/analyzer/types.js'

function tokenEvidence(confidence: TokenConfidence, observationCount: number): TokenEvidence {
  return {
    value: '#000000',
    confidence,
    observationCount,
    pageCount: 1,
    captureCount: 1,
    pages: [],
    sources: [],
    reasons: [],
  }
}

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

  test('rejects names whose prefix contradicts the observed role', () => {
    const tokens: DesignToken = {
      ...createTokens({ 'palette-3': '#000000', 'palette-4': '#e2e2e3', 'palette-10': '#370a7f' }),
      evidence: {
        'colors.palette-3': { ...tokenEvidence('high', 588), sources: ['usage:textColor'] },
        'colors.palette-4': { ...tokenEvidence('high', 60), sources: ['usage:borderColor'] },
        'colors.palette-10': { ...tokenEvidence('medium', 6), sources: ['usage:bgColor'] },
      },
    }

    const validation = validateColorRenames(tokens, [
      { tokenId: 'palette-3', name: 'action-primary' },
      { tokenId: 'palette-4', name: 'border-subtle' },
      { tokenId: 'palette-10', name: 'surface-emphasis' },
    ])

    expect(validation.accepted).toEqual([
      { tokenId: 'palette-4', name: 'border-subtle' },
      { tokenId: 'palette-10', name: 'surface-emphasis' },
    ])
    expect(validation.rejected).toMatchObject([
      { proposal: { tokenId: 'palette-3', name: 'action-primary' }, reason: 'role-mismatch' },
    ])
  })

  test('skips the role check when the token has no usage evidence', () => {
    const tokens = createTokens({ 'palette-13': '#db2777' })

    const validation = validateColorRenames(tokens, [{ tokenId: 'palette-13', name: 'action-danger' }])

    expect(validation.accepted).toEqual([{ tokenId: 'palette-13', name: 'action-danger' }])
  })

  test('uses the dominant role from usage counts, not incidental category matches', () => {
    const tokens: DesignToken = {
      ...createTokens({ 'palette-3': '#000000', 'palette-7': '#2563eb' }),
      // Usage keys carry raw computed values while token values are normalized hex.
      // #000000 appears on a few buttons but is overwhelmingly body text; #2563eb is mostly action.
      usageCount: {
        'textColor:rgb(0, 0, 0)': 588,
        'actionColor:rgb(0, 0, 0)': 17,
        'textColor:rgb(37, 99, 235)': 3,
        'primaryActionColor:rgb(37, 99, 235)': 41,
      },
      evidence: {
        'colors.palette-3': { ...tokenEvidence('high', 590), sources: ['usage:textColor', 'usage:actionColor'] },
        'colors.palette-7': { ...tokenEvidence('high', 44), sources: ['usage:textColor', 'usage:primaryActionColor'] },
      },
    }

    const validation = validateColorRenames(tokens, [
      { tokenId: 'palette-3', name: 'action-emphasis' },
      { tokenId: 'palette-7', name: 'action-primary' },
    ])

    expect(validation.accepted).toEqual([{ tokenId: 'palette-7', name: 'action-primary' }])
    expect(validation.rejected).toMatchObject([
      { proposal: { tokenId: 'palette-3', name: 'action-emphasis' }, reason: 'role-mismatch' },
    ])
  })
})

describe('applyColorRenames', () => {
  test('renames color keys and evidence keys while preserving values', () => {
    const tokens: DesignToken = {
      ...createTokens({ background: '#16171d', 'palette-13': '#db2777', 'palette-20': '#005cc5' }),
      evidence: {
        'colors.palette-13': tokenEvidence('high', 3),
        'spacing.1': tokenEvidence('high', 10),
      },
    }

    const { tokens: renamed, applied } = applyColorRenames(tokens, [
      { tokenId: 'palette-13', name: 'action-danger' },
      { tokenId: 'palette-20', name: 'link' },
    ])

    expect(applied).toHaveLength(2)
    expect(renamed.colors).toEqual({ background: '#16171d', 'action-danger': '#db2777', link: '#005cc5' })
    expect(renamed.evidence?.['colors.action-danger']?.confidence).toBe('high')
    expect(renamed.evidence?.['spacing.1']?.observationCount).toBe(10)
    expect(tokens.colors['palette-13']).toBe('#db2777')
  })

  test('skips invalid proposals and returns the original tokens when nothing applies', () => {
    const tokens = createTokens({ primary: '#2563eb' })

    const unchanged = applyColorRenames(tokens, [{ tokenId: 'missing', name: 'nope' }])
    expect(unchanged.applied).toEqual([])
    expect(unchanged.tokens).toBe(tokens)

    const partial = applyColorRenames(tokens, [
      { tokenId: 'primary', name: 'Invalid Name' },
      { tokenId: 'primary', name: 'brand' },
    ])
    expect(partial.applied).toEqual([])
    expect(partial.tokens.colors).toEqual({ primary: '#2563eb' })
  })
})
