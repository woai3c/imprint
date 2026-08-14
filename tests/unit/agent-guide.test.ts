import { describe, expect, test } from 'vitest'

import {
  generateAgentGuide,
  generateDesignPrinciples,
  generateDosAndDonts,
} from '../../src/core/analyzer/agent-guide.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'

const tokens: DesignToken = {
  colors: { background: '#ffffff', foreground: '#111111', primary: '#155eef' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['16px'],
    fontWeights: ['400'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['8px', '16px', '24px', '32px'],
  radii: ['8px'],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

describe('deterministic agent guidance', () => {
  test('renders deterministic guidance through the selected locale catalog', () => {
    const guide = generateAgentGuide(tokens, 'https://example.com', 'zh-CN')
    const principles = generateDesignPrinciples(tokens, 'zh-CN')

    expect(guide).toContain('## 给 AI 的使用说明')
    expect(guide).toContain('使用这些设计令牌生成与 example.com 视觉风格一致的 UI。')
    expect(principles).toContain('## 设计原则')
    expect(guide).not.toContain('agentGuide.')
    expect(principles).not.toContain('agentGuide.')
  })

  test('reports missing shadow evidence without inferring flat-design intent', () => {
    const guide = generateDosAndDonts(tokens)

    expect(guide).toContain('Use `Inter, sans-serif` as the primary font stack')
    expect(guide).toContain('No stable shadow scale was observed')
    expect(guide).not.toContain('this design uses flat elevation')
    expect(guide).not.toContain("Don't add box-shadows")
  })

  test('does not claim observed responsive behavior from a single viewport', () => {
    const guide = generateDosAndDonts(tokens)

    expect(guide).not.toContain('responsive spacing')
    expect(guide).not.toContain('responsive behavior')
  })

  test('distinguishes declared breakpoints from observed responsive behavior', () => {
    const declaredOnly = generateDosAndDonts(tokens, 'en', [], {
      hasDeclaredBreakpoints: true,
      hasObservedResponsiveBehavior: false,
    })
    const observed = generateDosAndDonts(tokens, 'en', [], {
      hasDeclaredBreakpoints: true,
      hasObservedResponsiveBehavior: true,
    })

    expect(declaredOnly).toContain(
      'Breakpoints were declared, but responsive behavior was not observed in this capture',
    )
    expect(observed).toContain('Preserve the observed responsive behavior')
  })

  test('omits token-specific directives when the corresponding evidence is empty', () => {
    const emptyTokens: DesignToken = {
      colors: {},
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

    const guide = generateDosAndDonts(emptyTokens)

    expect(guide).not.toContain('defined color tokens')
    expect(guide).not.toContain('defined palette')
    expect(guide).not.toContain('spacing scale')
    expect(guide).not.toContain('font weights outside')
  })

  test('keeps rounded icon-button variants separate from compact ordinary surfaces', () => {
    const guide = generateDosAndDonts({ ...tokens, radii: ['2px', '2px', '4px'] }, 'en', [
      {
        type: 'button',
        name: 'button-icon-md',
        variant: 'icon',
        count: 4,
        selectors: [],
        styles: { borderRadius: '16px' },
        confidence: 0.9,
        evidence: [],
      },
    ])

    expect(guide).toContain('compact radii on ordinary surfaces')
    expect(guide).toContain('pill and circular button variants separately')
    expect(guide).toContain('keep observed component and structural exceptions exact')
    expect(guide).not.toContain('avoid arbitrary pixel values')
  })
})
