import { describe, expect, it } from 'vitest'

import { classifyAnalyzeResponse } from '../../src/renderer/lib/analysis-response.js'
import type { AnalyzeResponse } from '../../src/shared/ipc-contract.js'

const successResponse: AnalyzeResponse = {
  analysisId: 'analysis-a',
  tokens: {
    colors: { primary: '#2563eb' },
    typography: {
      fontFamilies: ['Inter'],
      fontStacks: ['Inter, sans-serif'],
      fontSizes: ['16px'],
      fontWeights: ['400'],
      lineHeights: ['1.5'],
      letterSpacings: [],
    },
    spacing: ['8px'],
    radii: ['4px'],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
  },
  cssVariables: ':root {}',
  tailwindTheme: '@theme {}',
  designDoc: '# Design',
  screenshots: [],
  duration: 100,
  url: 'https://example.com/',
}

describe('classifyAnalyzeResponse', () => {
  it('classifies a successful result without casting it in the renderer', () => {
    expect(classifyAnalyzeResponse(successResponse)).toEqual({ kind: 'success', result: successResponse })
  })

  it('classifies authentication, cancellation, and failure responses', () => {
    const detection = {
      detected: true,
      confidence: 'high' as const,
      reasons: ['password-form' as const],
      finalUrl: 'https://example.com/login',
    }

    expect(classifyAnalyzeResponse({ authRequired: true, detection })).toEqual({
      kind: 'auth-required',
      detection,
    })
    expect(classifyAnalyzeResponse({ cancelled: true })).toEqual({ kind: 'cancelled' })
    expect(classifyAnalyzeResponse({ error: true, message: 'Failed', stage: 'extracting' })).toEqual({
      kind: 'error',
      message: 'Failed',
      stage: 'extracting',
    })
  })
})
