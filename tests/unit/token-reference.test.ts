import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import {
  projectDesignEvidenceTokenReferences,
  validateEvidenceTokenReferences,
} from '../../src/core/design-evidence/token-reference.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'

function tokenCatalog(colors: DesignToken['colors'], spacing: string[]): DesignToken {
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
    spacing,
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
  }
}

describe('Design Evidence token reference projection', () => {
  it('drops rejected semantic colors and remaps retained positional values after promotion', () => {
    const previousTokens = tokenCatalog({ background: '#02090a', foreground: '#000000' }, ['2px', '8px'])
    const nextTokens = tokenCatalog({ background: '#02090a' }, ['8px'])
    const evidence = {
      tokens: previousTokens,
      sections: [
        {
          id: 'section-home',
          tokenRefs: ['color.background', 'color.foreground', 'spacing.1', 'spacing.2'],
        },
      ],
      components: [{ id: 'button-home', tokenRefs: ['color.foreground', 'spacing.2', 'spacing.2'] }],
      layoutNodes: [{ id: 'layout-home', tokenRefs: ['spacing.1', 'spacing.2'] }],
    } as unknown as DesignEvidence

    projectDesignEvidenceTokenReferences(evidence, previousTokens, nextTokens)

    expect(evidence.sections[0].tokenRefs).toEqual(['color.background', 'spacing.1'])
    expect(evidence.components[0].tokenRefs).toEqual(['spacing.1'])
    expect(evidence.layoutNodes[0].tokenRefs).toEqual(['spacing.1'])
    expect(validateEvidenceTokenReferences(evidence)).toEqual({ valid: true, errors: [] })
  })
})
