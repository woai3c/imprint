import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import { generateDesignProfileMarkdown } from '../../src/core/design-context/profile-export.js'
import {
  generateReconstructionBrief,
  getReconstructionBriefEligibility,
} from '../../src/core/design-context/reconstruction-brief.js'
import type { DesignClaim, DesignContextMeta, DesignProfile } from '../../src/core/design-context/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'

const tokens: DesignToken = {
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
  radii: ['8px'],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

function claim(statement: string, confidence: DesignClaim['confidence'] = 'medium'): DesignClaim {
  return {
    statement,
    implementation: `Implement ${statement.toLowerCase()}.`,
    confidence,
    evidence: [{ evidenceId: 'section-main', note: 'Observed section evidence.' }],
    source: 'deterministic-catalog',
  }
}

function createProfile(): DesignProfile {
  return {
    schemaVersion: '2',
    language: 'en',
    inputMode: 'structural-only',
    claimSource: 'deterministic-catalog',
    catalogVersion: '1',
    thesis: claim('A compact left-aligned interface', 'high'),
    signatureMoves: [],
    composition: {
      containerStrategy: claim('A bounded content container', 'high'),
      alignmentStrategy: claim('Left-aligned content'),
      densityAndWhitespace: claim('Compact vertical spacing'),
      rhythm: claim('Repeated section rhythm'),
    },
    attention: {
      entryPoint: claim('The heading appears first'),
      visualSequence: [],
      actionHierarchy: claim('Primary actions use the primary color'),
      contrastStrategy: claim('Text has strong background contrast'),
    },
    visualLanguage: {
      color: claim('A restrained blue palette', 'high'),
      typography: claim('One sans-serif stack'),
      shape: claim('Small corner radii'),
      surfaces: claim('Flat surfaces'),
    },
    sectionGrammar: [],
    interactionLanguage: {
      primaryDrivers: [],
      feedbackStyle: claim('Immediate state feedback'),
      stateChangeAmplitude: claim('Small state changes'),
      continuityRules: [],
    },
    componentGrammar: [],
    transferRules: {
      preserve: [claim('Preserve the compact rhythm', 'high')],
      adapt: [],
      avoid: [claim('Avoid unsupported decorative effects', 'high')],
    },
    uncertainties: [],
  }
}

const evidence = {
  responsiveObservations: [],
  limitations: [],
  pages: [
    {
      id: 'page-main',
      url: 'https://example.com',
      viewport: 'desktop',
      images: [{ id: 'image-main', kind: 'overview', path: 'C:\\private\\capture.png', width: 1440, height: 900 }],
    },
  ],
  sections: [
    {
      id: 'section-main',
      pageId: 'page-main',
      order: 0,
      role: 'content',
      rect: { x: 0, y: 0, width: 1, height: 1 },
      layoutMode: 'flow',
      tokenRefs: [],
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: ['image-main'],
    },
  ],
  components: [],
  layoutNodes: [],
  interactionObservations: [],
  mediaLayers: [],
  topology: { globalLayers: [] },
} as unknown as DesignEvidence

const meta: DesignContextMeta = {
  status: 'complete',
  capabilityLevel: 'evidence-only',
  inputMode: 'structural-only',
}

describe('deterministic profile export', () => {
  it('identifies the deterministic boundary and never exposes local screenshot paths', () => {
    const markdown = generateDesignProfileMarkdown(createProfile(), tokens, new Map(), evidence)

    expect(markdown).toContain('## Deterministic Design Claims')
    expect(markdown).toContain('Program rules generate and rank every exported statement')
    expect(markdown).toContain('section-main')
    expect(markdown).not.toContain('C:\\private')
    expect(markdown).not.toMatch(/AI-authored|provider|model/i)
  })

  it('omits low-confidence claims from the visible report', () => {
    const profile = createProfile()
    profile.visualLanguage.motion = claim('Uncertain motion behavior', 'low')

    expect(generateDesignProfileMarkdown(profile)).not.toContain('Uncertain motion behavior')
  })
})

describe('reconstruction brief eligibility', () => {
  it('generates a brief only when thesis, preserve, and avoid directives are reliable', () => {
    const profile = createProfile()

    expect(getReconstructionBriefEligibility(profile, meta)).toEqual({ eligible: true, status: 'complete' })
    expect(generateReconstructionBrief(profile, evidence, tokens, meta)).toContain('# Reconstruction Brief')

    profile.thesis = claim('Uncertain thesis', 'low')
    expect(getReconstructionBriefEligibility(profile, meta)).toEqual({
      eligible: false,
      reason: 'low-confidence-thesis',
    })
    expect(generateReconstructionBrief(profile, evidence, tokens, meta)).toBeNull()
  })

  it('rejects profiles without reliable transfer directives', () => {
    const profile = createProfile()
    profile.transferRules.preserve = []
    expect(getReconstructionBriefEligibility(profile, meta)).toEqual({
      eligible: false,
      reason: 'preserve-directive-missing',
    })

    profile.transferRules.preserve = [claim('Preserve rhythm', 'high')]
    profile.transferRules.avoid = []
    expect(getReconstructionBriefEligibility(profile, meta)).toEqual({
      eligible: false,
      reason: 'avoid-directive-missing',
    })
  })
})
