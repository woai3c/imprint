import type { ExtractedStyles } from '../../src/core/analyzer/types.js'

export function createExtractedStyles(overrides: Partial<ExtractedStyles> = {}): ExtractedStyles {
  return {
    colors: [],
    fontFamilies: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    letterSpacings: [],
    spacings: [],
    radii: [],
    shadows: [],
    borders: [],
    cssVariables: {},
    backgroundColors: [],
    textColors: [],
    zIndices: [],
    transitions: [],
    usageCount: {},
    valueSources: {},
    ...overrides,
  }
}
