import { describe, expect, test } from 'vitest'

import { resolveCliExportFormats } from '../../src/cli/export-formats.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import type { DesignClaim, DesignIntelligenceMeta, DesignProfile } from '../../src/core/design-intelligence/types.js'
import { buildInterpretResponse } from '../../src/mcp/interpret-response.js'
import { artifactTabIds } from '../../src/renderer/components/analyze/artifact-tabs.js'

const claim = (statement: string, confidence: DesignClaim['confidence'] = 'medium'): DesignClaim => ({
  statement,
  implementation: `${statement} implementation`,
  confidence,
  evidence: [{ evidenceId: 'section-a', note: 'observed' }],
})

const profile: DesignProfile = {
  schemaVersion: '1',
  language: 'en',
  inputMode: 'structural-only',
  thesis: claim('A restrained product surface', 'high'),
  signatureMoves: [],
  composition: {
    containerStrategy: claim('Bounded container'),
    alignmentStrategy: claim('Left alignment'),
    densityAndWhitespace: claim('Moderate density'),
    rhythm: claim('Regular rhythm'),
  },
  attention: {
    entryPoint: claim('Heading first'),
    visualSequence: [],
    actionHierarchy: claim('One primary action'),
    contrastStrategy: claim('Neutral contrast'),
  },
  visualLanguage: {
    color: claim('Neutral palette'),
    typography: claim('Sans typography'),
    shape: claim('Soft corners'),
    surfaces: claim('Flat surfaces'),
  },
  sectionGrammar: [],
  interactionLanguage: {
    primaryDrivers: [],
    feedbackStyle: claim('Direct feedback'),
    stateChangeAmplitude: claim('Small changes'),
    continuityRules: [],
  },
  componentGrammar: [],
  transferRules: {
    preserve: [claim('Preserve the primary hierarchy')],
    adapt: [],
    avoid: [claim('Avoid unsupported decoration')],
  },
  uncertainties: [],
}

const tokens = {
  colors: { primary: '#155eef' },
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
} satisfies DesignToken

const evidence = {
  schemaVersion: '1',
  analysisId: 'analysis-a',
  source: { requestedUrl: 'https://example.com', finalUrl: 'https://example.com', accessMode: 'anonymous' },
  tokens,
  responsiveObservations: [],
  limitations: [],
  coverage: {
    pageCoverage: 'complete',
    sectionCoverage: 1,
    viewportCoverage: ['desktop'],
    interactionCoverage: { candidates: 0, safelyObserved: 0, skipped: 0 },
    mediaCoverage: { majorRegions: 0, classifiedRegions: 0, iconRegions: 0 },
    accessRestrictions: [],
    limitations: [],
  },
} as unknown as DesignEvidence

const meta: DesignIntelligenceMeta = { status: 'complete', capabilityLevel: 'structural-ai' }

describe('CLI reconstruction formats', () => {
  test('uses reconstruction as canonical and accepts brief as an alias', () => {
    const available = { hasProfile: true, hasReconstructionBrief: true }
    expect(resolveCliExportFormats('reconstruction', available)).toEqual(['reconstruction'])
    expect(resolveCliExportFormats('brief', available)).toEqual(['reconstruction'])
  })

  test('resolves profile and reconstruction availability independently for all', () => {
    expect(resolveCliExportFormats('all', { hasProfile: true, hasReconstructionBrief: true })).toEqual(
      expect.arrayContaining(['profile', 'reconstruction']),
    )
    const profileWithoutBrief = resolveCliExportFormats('all', {
      hasProfile: true,
      hasReconstructionBrief: false,
    })
    expect(profileWithoutBrief).toContain('profile')
    expect(profileWithoutBrief).not.toContain('reconstruction')
    expect(resolveCliExportFormats('all', { hasProfile: false, hasReconstructionBrief: false })).not.toContain(
      'profile',
    )
  })
})

describe('MCP reconstruction response', () => {
  test('omits the brief by default and returns the complete artifact only when requested', () => {
    const defaultResponse = buildInterpretResponse(profile, meta, evidence, false)
    const requestedResponse = buildInterpretResponse(profile, meta, evidence, true)

    expect(defaultResponse).not.toHaveProperty('reconstructionBrief')
    expect(requestedResponse.reconstructionBrief).toContain('# AI Reconstruction Brief')
    expect(requestedResponse).not.toHaveProperty('reconstructionBriefUnavailable')
  })

  test('explains why an explicitly requested ineligible brief was omitted', () => {
    const lowProfile = { ...profile, thesis: claim('Unreliable thesis', 'low') }
    const response = buildInterpretResponse(lowProfile, meta, evidence, true)

    expect(response).not.toHaveProperty('reconstructionBrief')
    expect(response.reconstructionBriefUnavailable).toContain('low confidence')
  })
})

describe('Desktop reconstruction artifact', () => {
  test('shows the Brief tab only when IPC returned an eligible artifact', () => {
    expect(artifactTabIds(false)).not.toContain('reconstruction')
    expect(artifactTabIds(true)).toContain('reconstruction')
  })
})
