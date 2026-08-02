import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import {
  compareDesignProfiles,
  createEvidenceFingerprint,
  createValidationRecipe,
  evaluateProfileQuality,
  generateAgentContextBundle,
  generateReconstructionBrief,
  restrictEvidencePackageImages,
  selectEvidencePackage,
  validateDesignProfile,
  validateRecipe,
} from '../../src/core/design-intelligence/index.js'
import { chooseDesignIntelligenceRoute, getInitialDesignIntelligenceMeta } from '../../src/main/design-intelligence.js'
import type { AppSettings } from '../../src/shared/ipc-contract.js'

const tokens: DesignToken = {
  colors: { background: '#ffffff', foreground: '#111827', primary: '#2563eb' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['16px', '32px'],
    fontWeights: ['400', '700'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['8px', '24px'],
  radii: ['12px'],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: ['0.2s ease'],
}

const evidence: DesignEvidence = {
  schemaVersion: '1',
  analysisId: 'analysis-test',
  source: {
    requestedUrl: 'https://example.com',
    finalUrl: 'https://example.com/',
    accessMode: 'anonymous',
  },
  pages: [
    {
      id: 'page-a',
      url: 'https://example.com/',
      viewport: 'desktop',
      role: 'landing',
      images: [{ id: 'image-a', kind: 'overview', path: 'C:\\private\\capture.png', width: 1440, height: 1600 }],
    },
    {
      id: 'page-b',
      url: 'https://example.com/',
      viewport: 'mobile',
      role: 'landing',
      images: [{ id: 'image-b', kind: 'overview', path: 'C:\\private\\mobile.png', width: 375, height: 1600 }],
    },
  ],
  tokens,
  featureTags: ['responsive'],
  topology: {
    schemaVersion: '1',
    pages: [
      { pageId: 'page-a', role: 'landing', sectionIds: ['section-a'] },
      { pageId: 'page-b', role: 'landing', sectionIds: ['section-b'] },
    ],
    globalLayers: [],
    crossPagePatternIds: [],
  },
  sections: [
    {
      id: 'section-a',
      pageId: 'page-a',
      order: 0,
      role: 'hero',
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.4 },
      layoutMode: 'flow',
      tokenRefs: ['color.background'],
      componentRefs: ['component-a'],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: ['image-a'],
    },
    {
      id: 'section-b',
      pageId: 'page-b',
      order: 0,
      role: 'hero',
      rect: { x: 0.05, y: 0.1, width: 0.9, height: 0.5 },
      layoutMode: 'flow',
      tokenRefs: ['color.background'],
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: ['image-b'],
    },
  ],
  components: [
    {
      id: 'component-a',
      pageId: 'page-a',
      sectionId: 'section-a',
      type: 'button',
      rect: { x: 0.2, y: 0.3, width: 0.2, height: 0.05 },
      styles: {},
      tokenRefs: ['color.primary'],
      stateRefs: [],
      confidence: 0.9,
      evidenceRefs: ['section-a', 'image-a'],
    },
  ],
  layoutNodes: [],
  interactionStyles: { hover: [], focus: [], active: [] },
  interactionObservations: [],
  breakpoints: [],
  responsiveObservations: [
    {
      id: 'responsive-a',
      sectionId: 'section-a',
      fromViewport: 'desktop',
      toViewport: 'mobile',
      changeType: 'reflow',
      changedProperties: ['width'],
      summary: 'Hero narrows at mobile width.',
      evidenceRefs: ['section-a', 'section-b'],
    },
  ],
  motion: [],
  mediaLayers: [],
  coverage: {
    pageCoverage: 'complete',
    sectionCoverage: 1,
    viewportCoverage: ['desktop', 'mobile'],
    interactionCoverage: { candidates: 0, safelyObserved: 0, skipped: 0 },
    mediaCoverage: { majorRegions: 0, classifiedRegions: 0 },
    accessRestrictions: [],
    limitations: [],
  },
  limitations: [],
}

function claim(statement = 'The layout uses a centered hero with deliberate breathing room') {
  return {
    statement,
    implementation: 'Use a centered container and keep wide outer gutters across primary sections.',
    confidence: 'high',
    evidence: [
      { evidenceId: 'section-a', note: 'Desktop hero bounds' },
      { evidenceId: 'section-b', note: 'Mobile hero bounds' },
    ],
  }
}

function rawProfile(mode: 'structural-only' | 'multimodal' = 'structural-only') {
  return {
    schemaVersion: '1',
    language: 'en',
    inputMode: mode,
    thesis: claim(),
    signatureMoves: [
      {
        ...claim('Large focused openings establish hierarchy before supporting detail'),
        id: 'move-focused-opening',
        name: 'Focused opening',
        distinctiveness: 'The spacious opening and compact action cluster recur together.',
      },
    ],
    composition: {
      containerStrategy: claim(),
      alignmentStrategy: claim(),
      densityAndWhitespace: claim(),
      rhythm: claim(),
    },
    attention: {
      entryPoint: claim(),
      visualSequence: [claim()],
      actionHierarchy: claim(),
      contrastStrategy: claim(),
    },
    visualLanguage: {
      color: claim(),
      typography: claim(),
      shape: claim(),
      surfaces: claim(),
      imagery: claim(),
    },
    sectionGrammar: [
      {
        role: 'hero',
        composition: [claim()],
        contentRhythm: [claim()],
        transitionToNext: [claim()],
      },
    ],
    interactionLanguage: {
      primaryDrivers: [claim()],
      feedbackStyle: claim(),
      stateChangeAmplitude: claim(),
      continuityRules: [
        {
          ...claim(),
          evidence: [{ evidenceId: 'responsive-a', note: 'Observed desktop-to-mobile reflow' }],
          confidence: 'medium',
        },
      ],
    },
    componentGrammar: [{ component: 'button', role: 'primary action', rules: [claim()] }],
    patterns: [
      {
        id: 'pattern-action-cluster',
        name: 'Action cluster',
        role: 'Keep primary and secondary actions visually related',
        structureRules: [claim()],
        visualRules: [claim()],
        interactionRules: [claim()],
        responsiveRules: [claim()],
        tokenRefs: ['color.primary'],
        evidenceRefs: ['section-a', 'component-a'],
        sourceInstances: 2,
        confidence: 'medium',
      },
    ],
    transferRules: {
      preserve: [claim()],
      adapt: [claim()],
      avoid: [claim()],
    },
    uncertainties: [],
  }
}

describe('Design intelligence', () => {
  it('routes screenshot input only with public-page consent and model capability', () => {
    const settings: AppSettings = {
      aiMode: 'apiKey',
      provider: 'openai',
      apiKey: 'test-only',
      baseUrl: '',
      model: 'gpt-4o',
      modelSupportsVision: false,
      visionAnalysisConsent: false,
      managedVisionConsent: false,
      analysisDepth: 'standard',
      agentCli: '',
      exportFormat: 'markdown',
    }
    expect(chooseDesignIntelligenceRoute(settings, evidence).mode).toBe('structural-only')
    expect(chooseDesignIntelligenceRoute({ ...settings, visionAnalysisConsent: true }, evidence).mode).toBe(
      'multimodal',
    )
    expect(
      chooseDesignIntelligenceRoute(
        { ...settings, visionAnalysisConsent: true },
        { ...evidence, source: { ...evidence.source, accessMode: 'managed' } },
      ).mode,
    ).toBe('structural-only')
    expect(
      getInitialDesignIntelligenceMeta(settings, {
        ...evidence,
        source: { ...evidence.source, accessMode: 'managed' },
      }),
    ).toMatchObject({ status: 'not-requested', capabilityLevel: 'evidence-only' })
  })

  it('defers to an explicit choice when the configured model lacks vision', () => {
    const settings: AppSettings = {
      aiMode: 'apiKey',
      provider: 'deepseek',
      apiKey: 'test-only',
      baseUrl: '',
      model: 'deepseek-chat',
      modelSupportsVision: false,
      visionAnalysisConsent: true,
      managedVisionConsent: false,
      analysisDepth: 'standard',
      agentCli: '',
      exportFormat: 'markdown',
    }
    const meta = getInitialDesignIntelligenceMeta(settings, evidence)
    expect(meta).toMatchObject({
      status: 'not-requested',
      capabilityLevel: 'evidence-only',
      inputMode: 'structural-only',
      pendingChoice: 'model-no-vision',
    })

    const visionSettings = { ...settings, provider: 'openai', model: 'gpt-4o' }
    expect(getInitialDesignIntelligenceMeta(visionSettings, evidence)).toMatchObject({
      status: 'pending',
      capabilityLevel: 'multimodal-ai',
    })
  })

  it('sends signed-in screenshots only with the dedicated consent', () => {
    const settings: AppSettings = {
      aiMode: 'apiKey',
      provider: 'openai',
      apiKey: 'test-only',
      baseUrl: '',
      model: 'gpt-4o',
      modelSupportsVision: false,
      visionAnalysisConsent: true,
      managedVisionConsent: false,
      analysisDepth: 'standard',
      agentCli: '',
      exportFormat: 'markdown',
    }
    const managedEvidence: DesignEvidence = {
      ...evidence,
      source: { ...evidence.source, accessMode: 'managed' },
    }
    expect(chooseDesignIntelligenceRoute(settings, managedEvidence).mode).toBe('structural-only')
    expect(chooseDesignIntelligenceRoute({ ...settings, managedVisionConsent: true }, managedEvidence).mode).toBe(
      'multimodal',
    )
    expect(
      chooseDesignIntelligenceRoute(
        { ...settings, aiMode: 'agentCli', agentCli: 'codex', managedVisionConsent: true },
        managedEvidence,
      ).mode,
    ).toBe('multimodal')
    expect(
      chooseDesignIntelligenceRoute({ ...settings, aiMode: 'agentCli', agentCli: 'codex' }, managedEvidence).mode,
    ).toBe('structural-only')
  })

  it('degrades multimodal profiles that fail the image-observation self-check', () => {
    const withoutObservations = validateDesignProfile(
      rawProfile('multimodal'),
      evidence,
      'multimodal',
      'en',
      undefined,
      { requireImageObservations: ['image-a'] },
    )
    expect(withoutObservations.profile).not.toBeNull()
    expect(withoutObservations.imageObservationsValid).toBe(false)
    expect(withoutObservations.rejected).toContain('root:image-observations-self-check-failed')
    expect(withoutObservations.profile?.inputMode).toBe('structural-only')

    const withObservations = validateDesignProfile(
      {
        ...rawProfile('multimodal'),
        imageObservations: [{ imageId: 'image-a', description: 'A spacious hero with a single primary action.' }],
      },
      evidence,
      'multimodal',
      'en',
      undefined,
      { requireImageObservations: ['image-a'] },
    )
    expect(withObservations.imageObservationsValid).toBe(true)
    expect(withObservations.profile?.inputMode).toBe('multimodal')

    const genericObservations = validateDesignProfile(
      { ...rawProfile('multimodal'), imageObservations: [{ imageId: 'image-a', description: 'screenshot' }] },
      evidence,
      'multimodal',
      'en',
      undefined,
      { requireImageObservations: ['image-a'] },
    )
    expect(genericObservations.imageObservationsValid).toBe(false)
  })

  it('keeps structural evidence packages path-free and image-free', () => {
    const selected = selectEvidencePackage(evidence, 'structural-only')
    expect(selected.imageIds).toEqual([])
    expect(selected.evidence.pages.every((page) => page.imageIds.length === 0)).toBe(true)
    expect(JSON.stringify(selected)).not.toContain('C:\\private')
  })

  it('removes unavailable images from the multimodal evidence package', () => {
    const selected = selectEvidencePackage(evidence, 'multimodal')
    expect(selected.imageIds).toContain('image-a')

    const restricted = restrictEvidencePackageImages(selected, ['image-a'])
    expect(restricted.imageIds).toEqual(['image-a'])
    expect(restricted.evidence.pages.find((page) => page.id === 'page-a')?.imageIds).toEqual(['image-a'])
  })

  it('validates grounded profiles and downgrades structural visual certainty', () => {
    const validation = validateDesignProfile(rawProfile(), evidence, 'structural-only', 'en')
    expect(validation.profile).not.toBeNull()
    expect(validation.profile?.attention.entryPoint.confidence).toBe('medium')
    expect(validation.profile?.visualLanguage.imagery?.confidence).toBe('medium')
    expect(validation.profile?.patterns?.[0].tokenRefs).toEqual(['color.primary'])
  })

  it('partially accepts optional claims but rejects malicious required claims', () => {
    const partial = rawProfile()
    partial.attention.visualSequence.push(claim('<script>alert(1)</script>'))
    const partialResult = validateDesignProfile(partial, evidence, 'structural-only', 'en')
    expect(partialResult.status).toBe('partial')
    expect(partialResult.profile?.attention.visualSequence).toHaveLength(1)

    const malicious = rawProfile()
    malicious.thesis = claim('Use javascript:https://evil.example to reproduce the original page')
    expect(validateDesignProfile(malicious, evidence, 'structural-only', 'en').profile).toBeNull()
  })

  it('rejects claims that introduce token values not present in evidence', () => {
    const withNewColor = rawProfile()
    withNewColor.attention.visualSequence.push({
      ...claim('Accent panels highlight secondary metrics'),
      implementation: 'Apply #ff3366 panels behind secondary metrics to keep them grouped.',
    })
    const rejected = validateDesignProfile(withNewColor, evidence, 'structural-only', 'en')
    expect(rejected.status).toBe('partial')
    expect(rejected.profile?.attention.visualSequence).toHaveLength(1)
    expect(rejected.rejected).toEqual(expect.arrayContaining([expect.stringContaining('token-value-not-in-evidence')]))

    const withKnownColor = rawProfile()
    withKnownColor.attention.visualSequence.push({
      ...claim('Accent panels highlight secondary metrics'),
      implementation: 'Apply #2563eb sparingly to primary actions and keep other surfaces neutral.',
    })
    const accepted = validateDesignProfile(withKnownColor, evidence, 'structural-only', 'en')
    expect(accepted.profile?.attention.visualSequence).toHaveLength(2)
  })

  it('flags model-returned token values without failing valid profiles', () => {
    const raw = { ...rawProfile(), tokens: { colors: { primary: '#ff0000' } } }
    const result = validateDesignProfile(raw, evidence, 'structural-only', 'en')
    expect(result.profile).not.toBeNull()
    expect(result.status).toBe('partial')
    expect(result.rejected).toContain('root:unexpected-token-values')
  })

  it('caps claim confidence when evidence coverage is insufficient', () => {
    const multimodal = validateDesignProfile(rawProfile('multimodal'), evidence, 'multimodal', 'en')
    expect(multimodal.profile?.visualLanguage.imagery?.confidence).toBe('medium')

    const singleViewportEvidence: DesignEvidence = {
      ...evidence,
      coverage: { ...evidence.coverage, viewportCoverage: ['desktop'] },
    }
    const single = validateDesignProfile(rawProfile(), singleViewportEvidence, 'structural-only', 'en')
    expect(single.profile?.patterns?.[0].responsiveRules[0].confidence).toBe('medium')

    const continuity = validateDesignProfile(rawProfile(), evidence, 'structural-only', 'en')
    expect(continuity.profile?.interactionLanguage.continuityRules[0].confidence).toBe('low')
  })

  it('records coverage gaps as uncertainties instead of silent conclusions', () => {
    const limited: DesignEvidence = {
      ...evidence,
      limitations: ['no-interaction-states-observed', 'no-classified-media-regions'],
    }
    const result = validateDesignProfile(rawProfile(), limited, 'structural-only', 'en')
    expect(result.profile?.uncertainties.map((item) => item.topic)).toEqual(
      expect.arrayContaining(['Interaction states', 'Media language']),
    )
  })

  it('versions the evidence fingerprint with prompt and profile schema', () => {
    const base = createEvidenceFingerprint(evidence, 'structural-only', 'openai', 'gpt-4o', undefined, '1', '1')
    expect(createEvidenceFingerprint(evidence, 'structural-only', 'openai', 'gpt-4o', undefined, '2', '1')).not.toBe(
      base,
    )
    expect(createEvidenceFingerprint(evidence, 'structural-only', 'openai', 'gpt-4o', undefined, '1', '2')).not.toBe(
      base,
    )
    expect(createEvidenceFingerprint(evidence, 'structural-only', 'openai', 'gpt-4o', undefined, '1', '1')).toBe(base)
  })

  it('requires observed target state differences when interaction evidence exists', () => {
    const interactionEvidence: DesignEvidence = {
      ...evidence,
      interactionObservations: [
        {
          id: 'interaction-a',
          pageId: 'page-a',
          sectionId: 'section-a',
          targetId: 'target-a',
          driver: 'click',
          safety: 'safe-active',
          trigger: { kind: 'disclosure' },
          before: { ariaExpanded: 'false' },
          after: { ariaExpanded: 'true' },
          changedProperties: ['ariaExpanded'],
          evidenceRefs: ['section-a', 'image-a'],
        },
      ],
    }
    const downgraded = validateDesignProfile(rawProfile(), interactionEvidence, 'structural-only', 'en')
    expect(downgraded.profile).not.toBeNull()
    expect(downgraded.profile!.interactionLanguage.feedbackStyle!.confidence).toBe('low')
    expect(downgraded.profile!.interactionLanguage.primaryDrivers[0]?.confidence).toBe('low')

    const supported = rawProfile()
    const interactionClaim = {
      ...claim('Small reversible state changes provide restrained interaction feedback'),
      confidence: 'medium',
      evidence: [{ evidenceId: 'interaction-a', note: 'Observed disclosure state difference' }],
    }
    supported.interactionLanguage.primaryDrivers = [interactionClaim]
    supported.interactionLanguage.feedbackStyle = interactionClaim
    supported.interactionLanguage.stateChangeAmplitude = interactionClaim
    supported.patterns[0].interactionRules = [interactionClaim]
    const withInteraction = validateDesignProfile(supported, interactionEvidence, 'structural-only', 'en')
    expect(withInteraction.profile).not.toBeNull()
    expect(withInteraction.profile!.interactionLanguage.feedbackStyle!.confidence).toBe('medium')
  })

  it('generates scoped context, reconstruction guidance, and layered validation checks', () => {
    const profile = validateDesignProfile(rawProfile(), evidence, 'structural-only', 'en').profile!
    const context = generateAgentContextBundle('Build a responsive article page', 'structural-ai', evidence, profile)
    const brief = generateReconstructionBrief(profile, evidence, tokens)
    const report = validateRecipe(createValidationRecipe('states', profile, tokens), profile, tokens, 'structural-ai')

    expect(context.task).toContain('article')
    expect(context.tokenSubset['typography.font-size.1']).toBe('16px')
    expect(brief).toContain('do not copy source pages')
    expect(report.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining(['token-spacing', 'text-contrast', 'horizontal-overflow', 'reduced-motion']),
    )
    expect(report.checks.find((check) => check.id === 'text-contrast')?.status).toBe('passed')
  })

  it('reports independent quality dimensions and compares design language profiles', () => {
    const first = validateDesignProfile(rawProfile(), evidence, 'structural-only', 'en').profile!
    const secondRaw = rawProfile()
    secondRaw.thesis = claim('Compact repeated cards create a dense operational reading rhythm')
    const second = validateDesignProfile(secondRaw, evidence, 'structural-only', 'en').profile!
    const metrics = evaluateProfileQuality(first, evidence)
    const comparison = compareDesignProfiles(first, second)

    expect(metrics.groundedness).toBe(1)
    expect(metrics.coverage).toBe(1)
    expect(metrics.transferability).toBe(1)
    expect(metrics.restraint).toBe(1)
    expect(metrics.safety).toBe(1)
    expect(metrics.distinctiveness).toBeGreaterThan(0)
    expect(comparison.thesisSimilarity).toBeLessThan(1)
    expect(comparison.evidenceGrounding.profileAReferences).toBeGreaterThan(0)
  })
})
