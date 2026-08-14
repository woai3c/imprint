import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import {
  buildAnalysisDigest,
  buildDesignProfileRepairPrompt,
  checkProfileContradictions,
  compareDesignProfiles,
  createEvidenceFingerprint,
  createInterpretationCacheKey,
  createStructuralFingerprint,
  createValidationRecipe,
  generateAgentContextBundle,
  generateReconstructionBrief,
  repairProfileCoverage,
  restrictEvidencePackageImages,
  selectEvidencePackage,
  validateDesignProfile,
  validateRecipe,
} from '../../src/core/design-intelligence/index.js'
import type { DesignProfile } from '../../src/core/design-intelligence/types.js'
import {
  chooseDesignIntelligenceRoute,
  designIntelligenceTimeoutMs,
  getInitialDesignIntelligenceMeta,
} from '../../src/main/design-intelligence.js'
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
      tokenRefs: ['color.background', 'spacing.2', 'typography.font-size.1'],
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
      tokenRefs: ['color.background', 'spacing.2', 'typography.font-size.1'],
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
      visualSequence: [claim('First the opening establishes the topic, then the following section adds detail.')],
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
    componentGrammar: [
      {
        component: 'button',
        role: 'primary action',
        rules: [
          {
            ...claim(),
            evidence: [
              { evidenceId: 'component-a', note: 'Observed primary action component' },
              { evidenceId: 'section-a', note: 'Desktop hero context' },
            ],
          },
        ],
      },
    ],
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

function structuredProfile(): DesignProfile {
  const profile = rawProfile() as unknown as DesignProfile
  profile.schemaVersion = '2'
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (
      typeof record.statement === 'string' &&
      typeof record.implementation === 'string' &&
      Array.isArray(record.evidence)
    ) {
      const evidenceIds = record.evidence.flatMap((reference) =>
        reference &&
        typeof reference === 'object' &&
        typeof (reference as { evidenceId?: unknown }).evidenceId === 'string'
          ? [(reference as { evidenceId: string }).evidenceId]
          : [],
      )
      record.assertions = [
        {
          kind: 'evidence',
          target: 'design-thesis',
          predicate: 'supports',
          scope: 'instance',
          evidenceIds,
        },
      ]
    }
    Object.entries(record).forEach(([key, item]) => {
      if (key !== 'assertions') visit(item)
    })
  }
  visit(profile)
  profile.componentGrammar[0].rules[0].assertions = [
    {
      kind: 'component',
      target: 'button',
      predicate: 'present',
      scope: 'instance',
      evidenceIds: ['component-a'],
    },
  ]
  return profile
}

function multiUrlEvidence(): DesignEvidence {
  return {
    ...evidence,
    pages: evidence.pages.map((page) =>
      page.id === 'page-b' ? { ...page, url: 'https://example.com/pricing', viewport: 'desktop' } : page,
    ),
  }
}

describe('Design intelligence', () => {
  it('validates schema v2 facts without interpreting the prose language', () => {
    const profile = structuredProfile()
    const rule = profile.componentGrammar[0].rules[0]
    rule.statement = 'زر الإجراء ظاهر في القسم الرئيسي.'
    rule.implementation = 'ヘルプ文は任意の言語で表現できる。'

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.componentGrammar[0].rules[0].statement).toBe(rule.statement)
    expect(checked.rejected).not.toEqual(expect.arrayContaining([expect.stringContaining('component-fact-mismatch')]))
  })

  it('rejects a false schema v2 assertion regardless of localized prose', () => {
    const profile = structuredProfile()
    profile.transferRules.adapt[0] = {
      ...profile.transferRules.adapt[0],
      statement: 'モバイルでは要素が非表示になります。',
      implementation: 'تُخفى الكتلة في العرض الضيق.',
      evidence: [{ evidenceId: 'responsive-a', note: 'Viewport observation' }],
      assertions: [
        {
          kind: 'responsive',
          target: 'hero',
          predicate: 'visibility-hidden',
          scope: 'instance',
          evidenceIds: ['responsive-a'],
        },
      ],
    }

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.transferRules.adapt).toEqual([])
    expect(checked.rejected).toContain('transferRules.adapt.0.assertions.0:responsive-fact-mismatch')
  })

  it('rejects a false visible-focus assertion regardless of localized prose', () => {
    const focusEvidence = structuredClone(evidence)
    focusEvidence.interactionObservations = [
      {
        id: 'interaction-focus-hidden',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'target-focus',
        driver: 'focus',
        safety: 'passive',
        trigger: { kind: 'css-pseudo' },
        before: {
          'outline-style': 'none',
          'outline-width': '0px',
          'outline-color': 'rgba(0, 0, 0, 0)',
          'box-shadow': '0 0 0 2px rgba(0, 0, 0, 0)',
        },
        after: {
          'outline-style': 'none',
          'outline-width': '0px',
          'outline-color': '#2563eb',
          'box-shadow': '0 0 0 2px rgba(0, 0, 0, 0)',
        },
        changedProperties: ['outline-color'],
        evidenceRefs: ['section-a'],
      },
    ]
    const profile = structuredProfile()
    profile.interactionLanguage.primaryDrivers = [
      {
        ...profile.interactionLanguage.primaryDrivers[0],
        statement: 'يظهر مؤشر تركيز واضح عند استخدام لوحة المفاتيح.',
        implementation: 'フォーカス時に見えるリングを表示する。',
        evidence: [{ evidenceId: 'interaction-focus-hidden', note: 'Observed focus declaration' }],
        assertions: [
          {
            kind: 'interaction',
            target: 'focus',
            predicate: 'visible-indicator',
            value: true,
            scope: 'instance',
            evidenceIds: ['interaction-focus-hidden'],
          },
        ],
      },
    ]

    const checked = checkProfileContradictions(profile, focusEvidence)

    expect(checked.profile.interactionLanguage.primaryDrivers).toEqual([])
    expect(checked.rejected).toContain('interactionLanguage.primaryDrivers.0.assertions.0:interaction-fact-mismatch')
  })

  it('rejects an entire structured claim when any assertion is syntactically invalid', () => {
    const profile = structuredProfile()
    const rule = profile.componentGrammar[0].rules[0]
    rule.assertions = [
      {
        kind: 'component',
        target: 'button',
        predicate: 'present',
        scope: 'instance',
        evidenceIds: ['component-a'],
      },
      {
        kind: 'component',
        target: 'button',
        predicate: 'invented-predicate',
        scope: 'instance',
        evidenceIds: ['component-a'],
      } as unknown as NonNullable<typeof rule.assertions>[number],
    ]

    const validation = validateDesignProfile(profile, evidence, 'structural-only', 'en')

    expect(validation.profile?.componentGrammar).toEqual([])
    expect(validation.rejected).toEqual(
      expect.arrayContaining([
        'componentGrammar.0.rules.0.assertions.1:invalid-assertion',
        'componentGrammar.0.rules.0:invalid-structured-assertion',
      ]),
    )
  })

  it('rejects a focus claim that omits the deterministic visibility result', () => {
    const focusEvidence = structuredClone(evidence)
    focusEvidence.interactionObservations = [
      {
        id: 'interaction-focus-hidden',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'target-focus',
        driver: 'focus',
        safety: 'passive',
        trigger: { kind: 'css-pseudo' },
        before: {
          'outline-style': 'none',
          'outline-width': '0px',
          'outline-color': 'rgba(0, 0, 0, 0)',
          'box-shadow': 'none',
        },
        after: {
          'outline-style': 'none',
          'outline-width': '0px',
          'outline-color': '#2563eb',
          'box-shadow': 'none',
        },
        changedProperties: ['outline-color'],
        evidenceRefs: ['section-a'],
      },
    ]
    const profile = structuredProfile()
    profile.interactionLanguage.primaryDrivers = [
      {
        ...profile.interactionLanguage.primaryDrivers[0],
        statement: '焦点样式提供了键盘操作反馈。',
        implementation: 'Use the declared focus treatment as keyboard feedback.',
        evidence: [{ evidenceId: 'interaction-focus-hidden', note: 'Observed focus declaration' }],
        assertions: [
          {
            kind: 'interaction',
            target: 'focus',
            predicate: 'property-change',
            property: 'outline-color',
            scope: 'instance',
            evidenceIds: ['interaction-focus-hidden'],
          },
        ],
      },
    ]

    const checked = checkProfileContradictions(profile, focusEvidence)

    expect(checked.profile.interactionLanguage.primaryDrivers).toEqual([])
    expect(checked.rejected).toContain('interactionLanguage.primaryDrivers.0:missing-focus-visibility-assertion')
  })

  it('rejects a secondary-button claim that omits observed border visibility', () => {
    const borderlessEvidence = structuredClone(evidence)
    borderlessEvidence.components[0] = {
      ...borderlessEvidence.components[0],
      styles: {
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        color: '#2563eb',
        border: '0px none #2563eb',
        borderRadius: '9999px',
        padding: '8px 18px',
      },
    }
    const profile = structuredProfile()
    profile.signatureMoves = [
      {
        ...profile.signatureMoves[0],
        statement: '次要行动采用蓝色描边药丸按钮。',
        implementation: 'Apply a visible blue outline to the cited secondary button.',
        evidence: [{ evidenceId: 'component-a', note: 'Observed secondary control' }],
        assertions: [
          {
            kind: 'component',
            target: 'button',
            predicate: 'variant',
            value: 'secondary',
            scope: 'instance',
            evidenceIds: ['component-a'],
          },
          {
            kind: 'component',
            target: 'button',
            predicate: 'corner-shape',
            value: 'pill',
            scope: 'instance',
            evidenceIds: ['component-a'],
          },
        ],
      },
    ]

    const checked = checkProfileContradictions(profile, borderlessEvidence)

    expect(checked.profile.signatureMoves).toEqual([])
    expect(checked.rejected).toContain('signatureMoves.0:missing-secondary-border-assertion')
  })

  it('rejects structured token references that belong to a different design dimension', () => {
    const profile = structuredProfile()
    profile.composition.rhythm.tokenRefs = ['color.primary']

    const validation = validateDesignProfile(profile, evidence, 'structural-only', 'en')

    expect(validation.rejected).toContain('composition.rhythm:token-role-mismatch')
    expect(validation.profile?.composition.rhythm.tokenRefs || []).not.toContain('color.primary')
  })

  it('accepts direct schema v2 responsive facts and validates cross-page scope by URL', () => {
    const responsiveEvidence = structuredClone(evidence)
    responsiveEvidence.responsiveObservations[0] = {
      ...responsiveEvidence.responsiveObservations[0],
      changeType: 'visibility',
      changedProperties: ['display'],
      changes: { display: { from: 'block', to: 'none' } },
    }
    const profile = structuredProfile()
    profile.transferRules.adapt[0] = {
      ...profile.transferRules.adapt[0],
      evidence: [{ evidenceId: 'responsive-a', note: 'Direct visibility observation' }],
      assertions: [
        {
          kind: 'responsive',
          target: 'hero',
          predicate: 'visibility-hidden',
          scope: 'instance',
          evidenceIds: ['responsive-a'],
        },
      ],
    }
    profile.thesis.assertions = [
      {
        kind: 'evidence',
        target: 'design-thesis',
        predicate: 'supports',
        scope: 'cross-page',
        evidenceIds: ['section-a', 'section-b'],
      },
    ]

    const sameUrl = checkProfileContradictions(profile, responsiveEvidence)
    expect(sameUrl.rejected).toContain('thesis.assertions.0:unsupported-cross-page-scope')

    const crossUrlEvidence = multiUrlEvidence()
    crossUrlEvidence.responsiveObservations = responsiveEvidence.responsiveObservations
    const crossUrl = checkProfileContradictions(profile, crossUrlEvidence)
    expect(crossUrl.profile.thesis.statement).toBe(profile.thesis.statement)
    expect(crossUrl.profile.transferRules.adapt).toHaveLength(1)
    expect(crossUrl.rejected).not.toEqual(
      expect.arrayContaining([expect.stringContaining('unsupported-cross-page-scope')]),
    )
  })

  it('validates arbitrary-language schema v2 prose when its assertions are well formed', () => {
    const profile = structuredProfile()
    profile.thesis.statement = 'تتدرج الصفحة بصريًا من المقدمة إلى المحتوى.'
    profile.thesis.implementation = '構造化された証拠に従って階層を実装する。'
    profile.attention.visualSequence = []

    const validation = validateDesignProfile(profile, evidence, 'structural-only', 'en')

    expect(validation.profile?.schemaVersion).toBe('2')
    expect(validation.profile?.thesis.statement).toBe(profile.thesis.statement)
    expect(validation.rejected).not.toEqual(expect.arrayContaining([expect.stringContaining('invalid-statement')]))
  })

  it('keeps safe structural section treatments in synthesis and repair evidence', () => {
    const structuralEvidence = structuredClone(evidence)
    structuralEvidence.sections[0].observedStyles = {
      borderRadius: '0px 0px 48px 48px',
      gradient: {
        type: 'linear-gradient',
        direction: '160deg',
        stops: ['#ffedd5', '#fed7aa'],
        value: 'linear-gradient(160deg, #ffedd5, #fed7aa)',
      },
    }
    structuralEvidence.tokens.borders = ['1px solid #e5e7eb']
    const selected = selectEvidencePackage(structuralEvidence, 'structural-only')
    const digest = buildAnalysisDigest(structuralEvidence, selected).digest
    const hero = digest.sectionPatterns.find((section) => section.role === 'hero')
    const repairPrompt = buildDesignProfileRepairPrompt(selected, 'en', {}, ['thesis:evidence-required'])

    expect(hero?.observedStyles).toEqual(structuralEvidence.sections[0].observedStyles)
    expect(digest.tokenFacts.typography.stacks).toEqual([expect.objectContaining({ value: 'Inter, sans-serif' })])
    expect(digest.tokenFacts.borders).toEqual([expect.objectContaining({ value: '1px solid #e5e7eb' })])
    expect(repairPrompt).toContain('0px 0px 48px 48px')
    expect(repairPrompt).toContain('linear-gradient(160deg, #ffedd5, #fed7aa)')
  })

  it('exposes deterministic component shape, complete responsive properties, and declared-only color roles', () => {
    const structuralEvidence = structuredClone(evidence)
    structuralEvidence.tokens.colors['palette-9'] = '#3f45ff'
    structuralEvidence.tokens.evidence = {
      'colors.palette-9': {
        value: '#3f45ff',
        confidence: 'high',
        observationCount: 3,
        pageCount: 2,
        captureCount: 2,
        pages: ['https://example.com/'],
        sources: ['usage:declaredColor', 'usage:brandTokenColor', 'css-variable:--brand-color'],
        reasons: ['declared-token'],
      },
    }
    structuralEvidence.components[0] = {
      ...structuralEvidence.components[0],
      role: 'primary-action',
      styles: {
        backgroundColor: '#2563eb',
        color: '#ffffff',
        borderRadius: '9999px',
      },
    }
    structuralEvidence.sections[0].role = 'header'
    structuralEvidence.responsiveObservations[0] = {
      ...structuralEvidence.responsiveObservations[0],
      changedProperties: ['layoutMode', 'position', 'height', 'borderBottom', 'boxShadow'],
      changes: {
        layoutMode: { from: 'flow', to: 'fixed' },
        position: { from: 'relative', to: 'fixed' },
        height: { from: '62px', to: '53px' },
        borderBottom: { from: '0px none #111827', to: '1px solid #e5e7eb' },
        boxShadow: { from: 'none', to: '0 1px 3px rgba(0, 0, 0, 0.1)' },
      },
    }

    const digest = buildAnalysisDigest(
      structuralEvidence,
      selectEvidencePackage(structuralEvidence, 'structural-only'),
    ).digest

    expect(digest.componentPatterns.find((component) => component.variant === 'primary')?.cornerShape).toBe('pill')
    expect(digest.responsiveFacts[0].changedProperties).toEqual(
      expect.arrayContaining(['layoutMode', 'position', 'height', 'borderBottom', 'boxShadow']),
    )
    expect(digest.tokenFacts.colors.find((color) => color.name === 'palette-9')?.roles).toEqual(['declared'])
  })

  it('does not let the outer pipeline cut off a thinking request at five minutes', () => {
    expect(designIntelligenceTimeoutMs({ aiMode: 'apiKey', thinkingEnabled: false })).toBe(330_000)
    expect(designIntelligenceTimeoutMs({ aiMode: 'apiKey', thinkingEnabled: true })).toBe(630_000)
    expect(designIntelligenceTimeoutMs({ aiMode: 'agentCli', thinkingEnabled: false })).toBe(630_000)
  })

  it('routes screenshot input only with public-page consent and model capability', () => {
    const settings: AppSettings = {
      aiMode: 'apiKey',
      provider: 'openai',
      apiKeys: { openai: 'test-only' },
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

  it('falls back to structural interpretation when the configured model lacks vision', () => {
    const settings: AppSettings = {
      aiMode: 'apiKey',
      provider: 'deepseek',
      apiKeys: { deepseek: 'test-only' },
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
      status: 'pending',
      capabilityLevel: 'structural-ai',
      inputMode: 'structural-only',
    })

    const visionSettings = { ...settings, provider: 'openai', model: 'gpt-4o' }
    expect(getInitialDesignIntelligenceMeta(visionSettings, evidence)).toMatchObject({
      status: 'not-configured',
      capabilityLevel: 'evidence-only',
    })
    expect(
      getInitialDesignIntelligenceMeta(
        { ...visionSettings, apiKeys: { ...visionSettings.apiKeys, openai: 'openai-test-only' } },
        evidence,
      ),
    ).toMatchObject({
      status: 'pending',
      capabilityLevel: 'multimodal-ai',
    })
  })

  it('sends signed-in screenshots only with the dedicated consent', () => {
    const settings: AppSettings = {
      aiMode: 'apiKey',
      provider: 'openai',
      apiKeys: { openai: 'test-only' },
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
    const evidenceWithDimensions: DesignEvidence = {
      ...evidence,
      pages: evidence.pages.map((page) =>
        page.id === 'page-b'
          ? {
              ...page,
              viewportWidth: 375,
              viewportHeight: 812,
              contentWidth: 1032,
              contentHeight: 1600,
              horizontalOverflow: true,
            }
          : page,
      ),
    }
    const selected = selectEvidencePackage(evidenceWithDimensions, 'structural-only')
    expect(selected.imageIds).toEqual([])
    expect(selected.evidence.pages.every((page) => page.imageIds.length === 0)).toBe(true)
    expect(selected.evidence.pages.find((page) => page.id === 'page-b')).toMatchObject({
      viewportWidth: 375,
      contentWidth: 1032,
      horizontalOverflow: true,
    })
    expect(JSON.stringify(selected)).not.toContain('C:\\private')
  })

  it('budgets distinct URLs without losing the entry page responsive capture', () => {
    const thirdPage: DesignEvidence = {
      ...evidence,
      pages: [
        ...evidence.pages,
        {
          id: 'page-c',
          url: 'https://example.com/pricing',
          viewport: 'desktop',
          role: 'pricing',
          images: [],
        },
      ],
      topology: {
        ...evidence.topology,
        pages: [...evidence.topology.pages, { pageId: 'page-c', role: 'pricing', sectionIds: [] }],
      },
    }

    const selected = selectEvidencePackage(thirdPage, 'structural-only', { maxPages: 2 })
    expect(selected.selectedPageIds).toEqual(['page-a', 'page-b', 'page-c'])
    expect(new Set(selected.evidence.pages.map((page) => page.url)).size).toBe(2)
  })

  it('keeps an overflowing capture as a limitation but excludes its details from inference', () => {
    const overflowEvidence: DesignEvidence = {
      ...evidence,
      pages: [
        ...evidence.pages,
        {
          id: 'page-c',
          url: 'https://example.com/column-square',
          viewport: 'desktop',
          role: 'content',
          images: [],
        },
        {
          id: 'page-d',
          url: 'https://example.com/column-square',
          viewport: 'mobile',
          role: 'content',
          viewportWidth: 375,
          contentWidth: 1_032,
          horizontalOverflow: true,
          horizontalOverflowSources: [
            {
              locator: 'main > section',
              overflowPx: 657,
              width: 1_032,
              position: 'static',
              sectionId: 'section-d',
              sectionRole: 'content',
            },
          ],
          images: [],
        },
      ],
      sections: [
        ...evidence.sections,
        {
          ...evidence.sections[0],
          id: 'section-d',
          pageId: 'page-d',
          role: 'content',
          componentRefs: [],
          evidenceRefs: [],
        },
      ],
      topology: {
        ...evidence.topology,
        pages: [
          ...evidence.topology.pages,
          { pageId: 'page-c', role: 'content', sectionIds: [] },
          { pageId: 'page-d', role: 'content', sectionIds: ['section-d'] },
        ],
      },
    }

    const selected = selectEvidencePackage(overflowEvidence, 'structural-only', { maxPages: 2 })

    expect(selected.selectedPageIds).toEqual(['page-a', 'page-b', 'page-c', 'page-d'])
    expect(selected.selectedSectionIds).not.toContain('section-d')
    expect(selected.evidence.pages.find((page) => page.id === 'page-d')).toMatchObject({
      horizontalOverflow: true,
      viewportWidth: 375,
      contentWidth: 1_032,
    })
    expect(selected.omittedEvidence).toContainEqual({
      kind: 'capture-details',
      reason: 'severe-horizontal-overflow',
    })
    const digest = buildAnalysisDigest(overflowEvidence, selected).digest
    expect(digest.pages.find((page) => page.overflow?.contentWidth === 1_032)?.limitations).toContain(
      'inference-excluded:severe-horizontal-overflow',
    )
  })

  it('round-robins section evidence across selected URLs', () => {
    const crossPageEvidence: DesignEvidence = {
      ...evidence,
      pages: [
        ...evidence.pages,
        { id: 'page-c', url: 'https://example.com/pricing', viewport: 'desktop', role: 'pricing', images: [] },
      ],
      sections: [
        evidence.sections[0],
        { ...evidence.sections[0], id: 'section-a-2', order: 1, role: 'content' },
        { ...evidence.sections[0], id: 'section-a-3', order: 2, role: 'action' },
        { ...evidence.sections[0], id: 'section-c', pageId: 'page-c', order: 0, role: 'content' },
      ],
      topology: {
        ...evidence.topology,
        pages: [
          { pageId: 'page-a', role: 'landing', sectionIds: ['section-a', 'section-a-2', 'section-a-3'] },
          { pageId: 'page-c', role: 'pricing', sectionIds: ['section-c'] },
        ],
      },
    }

    const selected = selectEvidencePackage(crossPageEvidence, 'structural-only', {
      maxPages: 2,
      maxSections: 2,
    })
    expect(selected.selectedSectionIds).toEqual(['section-a', 'section-c'])
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
    expect(validation.profile?.attention.entryPoint.confidence).toBe('low')
    expect(validation.profile?.visualLanguage.imagery?.confidence).toBe('low')
    expect(validation.profile?.patterns?.[0].tokenRefs).toEqual(['color.primary'])
  })

  it('downgrades deterministic numeric and overflow contradictions without another AI call', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.visualLanguage.typography.statement = 'Typography uses font-weight 900 and a 19px body size.'
    profile.visualLanguage.typography.implementation = 'Set body text to 19px with font-weight 900.'
    profile.transferRules.adapt[0].statement = 'The overflowing layout stacks cleanly on mobile.'
    profile.transferRules.adapt[0].implementation = 'Hide the wide content at the mobile breakpoint.'
    const contradictionEvidence = structuredClone(evidence)
    contradictionEvidence.pages[1].horizontalOverflow = true

    const checked = checkProfileContradictions(profile, contradictionEvidence)
    expect(checked.profile.visualLanguage.typography.confidence).toBe('low')
    expect(checked.rejected.some((reason) => reason.includes('font-weight-not-in-token-set'))).toBe(true)
    expect(checked.rejected.some((reason) => reason.includes('numeric-value-sanitized'))).toBe(true)
    expect(checked.profile.uncertainties).toEqual([])
  })

  it('removes mobile reflow wording that is supported only by desktop evidence', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.composition.containerStrategy = {
      ...claim('The desktop layout uses a centered two-column container.'),
      implementation: 'Keep the main and aside columns centered; narrow screens collapse to a single column.',
      evidence: [
        { evidenceId: 'section-a', note: 'Desktop section' },
        { evidenceId: 'image-a', note: 'Desktop screenshot' },
      ],
    }
    const overflowEvidence = structuredClone(evidence)
    overflowEvidence.pages[1] = {
      ...overflowEvidence.pages[1],
      viewportWidth: 375,
      contentWidth: 1032,
      horizontalOverflow: true,
    }

    const checked = checkProfileContradictions(profile, overflowEvidence)

    expect(checked.profile.composition.containerStrategy.statement).toContain('desktop')
    expect(checked.profile.composition.containerStrategy.implementation).not.toContain('single column')
    expect(checked.profile.composition.containerStrategy.confidence).toBe('medium')
    expect(checked.rejected).toContain(
      'composition.containerStrategy:responsive-wording-without-mobile-evidence-sanitized',
    )
  })

  it('does not treat capture absence or order changes as direct hiding and reflow evidence', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.transferRules.adapt[0] = {
      ...claim('移动端隐藏顶部导航并把内容改单列。'),
      implementation: '窄屏使用 visibility 与 order 完成隐藏和单列化。',
      evidence: [{ evidenceId: 'responsive-a', note: '视口差异' }],
    }
    const responsiveEvidence = structuredClone(evidence)
    responsiveEvidence.responsiveObservations[0] = {
      ...responsiveEvidence.responsiveObservations[0],
      changedProperties: ['visibility', 'order'],
      changes: {
        visibility: { from: 'visible', to: 'absent' },
        order: { from: '0', to: '-1' },
      },
    }

    const checked = checkProfileContradictions(profile, responsiveEvidence)

    expect(checked.profile.transferRules.adapt).toEqual([])
    expect(checked.rejected).toEqual(
      expect.arrayContaining([
        'transferRules.adapt.0:responsive-hiding-without-direct-evidence',
        'transferRules.adapt.0:responsive-reflow-without-direct-evidence',
      ]),
    )
    expect(checked.profile.uncertainties).toEqual([])
  })

  it('removes unsupported claims that responsive adaptation preserves all content', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.transferRules.adapt[0] = {
      ...claim('窄屏适配应压缩头部高度并重排区块顺序，而非移除内容。'),
      implementation: '沿用观察到的高度与 order 变化，但不隐藏任何区块。',
      evidence: [{ evidenceId: 'responsive-a', note: '视口差异' }],
    }

    const responsiveEvidence = structuredClone(evidence)
    responsiveEvidence.responsiveObservations[0] = {
      ...responsiveEvidence.responsiveObservations[0],
      changedProperties: ['layoutMode', 'height', 'order'],
      changes: {
        layoutMode: { from: 'flow', to: 'fixed' },
        height: { from: '62px', to: '53px' },
        order: { from: '2', to: '0' },
      },
    }

    const checked = checkProfileContradictions(profile, responsiveEvidence)
    const adapted = checked.profile.transferRules.adapt[0]

    expect(adapted.statement).toBe('窄屏适配应压缩头部高度并重排区块顺序。')
    expect(adapted.implementation).not.toMatch(/不隐藏|不移除/)
    expect(checked.rejected).toContain('transferRules.adapt.0:responsive-content-preservation-wording-sanitized')
  })

  it('does not promote section-only evidence into repeated card component grammar', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.composition.rhythm = {
      ...claim('节奏由重复的白色卡片单元建立。'),
      implementation: '卡片之间以分隔线形成反复节拍。',
      evidence: [{ evidenceId: 'section-a', note: '内容区块' }],
    }

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.composition.rhythm.statement).toContain('内容单元')
    expect(checked.profile.composition.rhythm.statement).not.toContain('卡片')
    expect(checked.profile.composition.rhythm.confidence).toBe('medium')
    expect(checked.rejected).toContain('composition.rhythm:unbound-card-grammar-sanitized')
  })

  it('keeps responsive hiding and reflow claims when cited changes record them directly', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.composition.containerStrategy = {
      ...claim('On mobile, the navigation hides and the content reflows to a single column.'),
      implementation: 'Use the observed display and grid-column changes.',
      evidence: [{ evidenceId: 'responsive-a', note: 'Direct responsive changes' }],
    }
    const responsiveEvidence = structuredClone(evidence)
    responsiveEvidence.responsiveObservations[0] = {
      ...responsiveEvidence.responsiveObservations[0],
      changedProperties: ['display', 'gridTemplateColumns'],
      changes: {
        display: { from: 'block', to: 'none' },
        gridTemplateColumns: { from: '1fr 1fr', to: '1fr' },
      },
    }

    const checked = checkProfileContradictions(profile, responsiveEvidence)

    expect(checked.profile.composition.containerStrategy.statement).toContain('single column')
    expect(checked.rejected).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('responsive-hiding-without-direct-evidence'),
        expect.stringContaining('responsive-reflow-without-direct-evidence'),
      ]),
    )
  })

  it('rewrites unsupported font-weight tier counts to the observed token count', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.visualLanguage.typography = {
      ...claim('字体以系统字体栈为主，字重分三级。'),
      implementation: '按字重分三级建立文字层级。',
    }

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.visualLanguage.typography.statement).toContain('字重包含 2 个观察档位')
    expect(checked.profile.visualLanguage.typography.implementation).toContain('字重包含 2 个观察档位')
    expect(checked.profile.visualLanguage.typography.confidence).toBe('medium')
    expect(checked.rejected).toContain('visualLanguage.typography:font-weight-tier-count-sanitized(3->2)')
  })

  it('scopes universal component and module language to observed evidence', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.thesis = {
      ...claim('所有内容模块都是白色卡片。'),
      implementation: '模块一律放进白色卡片，每个按钮都使用蓝色填充。',
      confidence: 'high',
      evidence: [{ evidenceId: 'image-a', note: 'Visible module composition' }],
    }

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.thesis.statement).toBe('已观察到的内容模块都是白色卡片。')
    expect(checked.profile.thesis.implementation).not.toMatch(/一律|每个/)
    expect(checked.profile.thesis.confidence).toBe('medium')
    expect(checked.rejected).toContain('thesis:universal-visual-scope-sanitized')
  })

  it('rejects primary-button rules grounded only in icon-button evidence', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.attention.actionHierarchy = {
      ...claim('The primary button is a solid brand-colored text CTA.'),
      implementation: 'Use the solid control for the main text action.',
      evidence: [{ evidenceId: 'component-a', note: 'Observed solid control' }],
    }
    const iconEvidence = structuredClone(evidence)
    iconEvidence.pages[0] = {
      ...iconEvidence.pages[0],
      viewportWidth: 1440,
      contentWidth: 1440,
      contentHeight: 1000,
    }
    iconEvidence.components[0] = {
      ...iconEvidence.components[0],
      rect: { x: 0.2, y: 0.3, width: 32 / 1440, height: 32 / 1000 },
      styles: {
        backgroundColor: '#2563eb',
        color: '#ffffff',
        borderRadius: '9999px',
        padding: '0px',
      },
    }

    const checked = checkProfileContradictions(profile, iconEvidence)

    expect(checked.profile.attention.actionHierarchy.confidence).toBe('low')
    expect(checked.profile.attention.actionHierarchy.statement).toBe(
      'The exact boundary of this rule is not supported by deterministic evidence.',
    )
    expect(checked.rejected).toEqual(
      expect.arrayContaining([
        expect.stringContaining('attention.actionHierarchy:component-variant-contradiction(primary!=icon)'),
      ]),
    )
  })

  it('recognizes Chinese primary-action wording and rejects a tinted secondary button citation', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.attention.actionHierarchy = {
      ...claim('主要行动采用蓝色按钮。'),
      implementation: '一级 CTA 使用蓝色填充。',
      evidence: [{ evidenceId: 'component-a', note: '观察到的蓝色控件' }],
    }
    const secondaryEvidence = structuredClone(evidence)
    secondaryEvidence.components[0] = {
      ...secondaryEvidence.components[0],
      styles: {
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        color: '#2563eb',
        border: '0px none #2563eb',
        borderRadius: '999px',
        padding: '0px 18px',
      },
    }

    const checked = checkProfileContradictions(profile, secondaryEvidence)

    expect(checked.profile.attention.actionHierarchy.confidence).toBe('low')
    expect(checked.rejected).toEqual(
      expect.arrayContaining([
        expect.stringContaining('attention.actionHierarchy:component-variant-contradiction(primary!=secondary)'),
      ]),
    )
  })

  it('rejects an outlined-button rule when the cited control has no visible border', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.attention.actionHierarchy = {
      ...claim('Outlined buttons mark supporting actions.'),
      implementation: 'Use the observed outline for secondary controls.',
      evidence: [{ evidenceId: 'component-a', note: 'Observed secondary control' }],
    }
    const borderlessEvidence = structuredClone(evidence)
    borderlessEvidence.components[0] = {
      ...borderlessEvidence.components[0],
      styles: {
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        color: '#2563eb',
        border: '0px none #2563eb',
      },
    }

    const checked = checkProfileContradictions(profile, borderlessEvidence)

    expect(checked.profile.attention.actionHierarchy.confidence).toBe('low')
    expect(checked.rejected).toContain('attention.actionHierarchy:button-outline-contradiction')
  })

  it('recognizes an outlined pill phrase and rejects a borderless cited button', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.attention.actionHierarchy = {
      ...claim('蓝色实心或蓝色描边的 pill 按钮形成行动层级。'),
      implementation: '次要操作沿用蓝色描边的胶囊按钮。',
      evidence: [{ evidenceId: 'component-a', note: '观察到的按钮' }],
    }
    const borderlessEvidence = structuredClone(evidence)
    borderlessEvidence.components[0] = {
      ...borderlessEvidence.components[0],
      styles: {
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        color: '#2563eb',
        border: '0px none #2563eb',
        borderRadius: '999px',
      },
    }

    const checked = checkProfileContradictions(profile, borderlessEvidence)

    expect(checked.profile.attention.actionHierarchy.confidence).toBe('low')
    expect(checked.rejected).toContain('attention.actionHierarchy:button-outline-contradiction')
  })

  it('rejects component claims cited only by another component type while allowing image evidence', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.visualLanguage.surfaces = {
      ...claim('Cards use elevated rounded surfaces.'),
      implementation: 'Apply the observed card shadow and corner treatment.',
      evidence: [{ evidenceId: 'section-a', note: 'Section containing only an unrelated button' }],
    }

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.visualLanguage.surfaces.statement).toBe(
      'The exact boundary of this rule is not supported by deterministic evidence.',
    )
    expect(checked.rejected).toContain('visualLanguage.surfaces:component-type-not-cited(card)')

    const imageProfile = rawProfile() as unknown as DesignProfile
    imageProfile.visualLanguage.surfaces = {
      ...claim('Cards use elevated rounded surfaces.'),
      implementation: 'Apply the visible card shadow and corner treatment.',
      evidence: [{ evidenceId: 'image-a', note: 'Visible surface composition' }],
    }
    const imageChecked = checkProfileContradictions(imageProfile, evidence)

    expect(imageChecked.profile.visualLanguage.surfaces.statement).toContain('Cards use elevated')
    expect(imageChecked.rejected).not.toContain('visualLanguage.surfaces:component-type-not-cited(card)')
  })

  it('repairs universal button radius and shadow claims when observed variants contradict them', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.visualLanguage.shape = {
      ...claim('形状语言以紧凑表面为主。'),
      implementation: '按钮统一小圆角。',
    }
    profile.visualLanguage.surfaces = {
      ...claim('按钮默认无阴影。'),
      implementation: '按钮与导航一律 boxShadow:none。',
    }
    profile.transferRules.preserve[0] = {
      ...claim('保留小圆角与无阴影按钮的扁平表面语言。'),
      implementation: '按钮维持小圆角、boxShadow:none。',
    }
    const variantEvidence = structuredClone(evidence)
    variantEvidence.components = [
      {
        ...variantEvidence.components[0],
        styles: {
          backgroundColor: '#2563eb',
          borderRadius: '9999px',
          boxShadow: 'none',
          padding: '0px 16px',
        },
      },
      {
        ...variantEvidence.components[0],
        id: 'component-shadow',
        styles: {
          backgroundColor: '#ffffff',
          borderRadius: '4px',
          boxShadow: 'rgba(0, 0, 0, 0.1) 0px 1px 3px 0px',
        },
      },
    ]

    const checked = checkProfileContradictions(profile, variantEvidence)

    expect(checked.profile.visualLanguage.shape.implementation).toContain('胶囊形变体')
    expect(checked.profile.visualLanguage.surfaces.statement).toContain('少量浮动工具按钮使用浅阴影')
    expect(checked.profile.transferRules.preserve[0].statement).toContain('胶囊按钮及少量浅阴影按钮变体')
    expect(checked.rejected).toEqual(
      expect.arrayContaining([
        'visualLanguage.shape:button-radius-variants-sanitized',
        'visualLanguage.surfaces:button-shadow-universal-sanitized',
        'transferRules.preserve.0:button-radius-variants-sanitized',
        'transferRules.preserve.0:button-shadow-universal-sanitized',
      ]),
    )
    expect(checked.profile.uncertainties).toEqual([])
  })

  it('replaces unsupported generated lengths with grounded token refs instead of discarding the claim', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.composition.densityAndWhitespace = {
      ...claim('Spacing uses a -16px offset between content groups.'),
      implementation: 'Apply -16px as the repeated section gap.',
    }
    profile.visualLanguage.typography = {
      ...claim('Body typography uses a -1rem size.'),
      implementation: 'Set body text to -1rem.',
    }

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.composition.densityAndWhitespace.statement).toContain('24px')
    expect(checked.profile.composition.densityAndWhitespace.tokenRefs).toContain('spacing.2')
    expect(checked.profile.visualLanguage.typography.statement).toContain('16px')
    expect(checked.profile.visualLanguage.typography.tokenRefs).toContain('typography.font-size.1')
    expect(checked.profile.composition.densityAndWhitespace.statement).not.toContain('token spacing')
    expect(checked.profile.visualLanguage.typography.statement).not.toContain('token typography')
    expect(checked.profile.composition.densityAndWhitespace.confidence).toBe('medium')
    expect(checked.rejected).toEqual(
      expect.arrayContaining([
        'composition.densityAndWhitespace:numeric-value-sanitized(-16px->spacing.2)',
        'visualLanguage.typography:numeric-value-sanitized(-1rem->typography.font-size.1)',
      ]),
    )
    expect(checked.profile.uncertainties).toEqual([])
  })

  it('grounds font-size and line-height literals against their own nearby token refs', () => {
    const profile = rawProfile() as unknown as DesignProfile
    const typographyEvidence = structuredClone(evidence)
    typographyEvidence.sections[0].tokenRefs.push('typography.line-height.1')
    profile.visualLanguage.typography = {
      ...claim('Body typography uses 15px type with a 26px line-height.'),
      implementation: 'Set body text to 15px and its line-height to 26px.',
      tokenRefs: ['typography.font-size.1', 'typography.line-height.1'],
    }

    const checked = checkProfileContradictions(profile, typographyEvidence)
    const result = checked.profile.visualLanguage.typography

    expect(result.statement).toContain('16px type')
    expect(result.statement).toContain('1.5 line-height')
    expect(result.implementation).toContain('16px')
    expect(result.implementation).toContain('1.5')
    expect(result.statement).not.toContain('token typography')
  })

  it('narrows button accent prohibitions to the action palette', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.transferRules.avoid = [
      {
        ...claim('避免给按钮体系引入重投影或第二种强调色'),
        implementation: '按钮应避免第二种强调色，但状态与装饰色仍按各自证据保留。',
      },
    ]

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.transferRules.avoid[0].statement).toContain('第二种操作色相')
    expect(checked.profile.transferRules.avoid[0].implementation).toContain('状态、趋势和装饰色')
    expect(checked.profile.transferRules.avoid[0].implementation).not.toContain('仅用蓝灰两色')
    expect(checked.profile.transferRules.avoid[0].statement).not.toContain('第二种强调色')
    expect(checked.rejected).toContain('transferRules.avoid.0:button-accent-scope-sanitized')
  })

  it('keeps observed border widths in the border context instead of rewriting them as spacing', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.visualLanguage.surfaces = {
      ...claim('Cards use a 1px neutral border.'),
      implementation: 'Keep the observed 1px border instead of converting it to a spacing token.',
      tokenRefs: ['border.1'],
      evidence: [{ evidenceId: 'component-a', note: 'Observed component border' }],
    }
    const borderEvidence = structuredClone(evidence)
    borderEvidence.tokens.borders = ['1px solid #e5e7eb']
    borderEvidence.components[0].type = 'card'
    borderEvidence.components[0].tokenRefs.push('border.1')

    const checked = checkProfileContradictions(profile, borderEvidence)
    const result = checked.profile.visualLanguage.surfaces

    expect(result?.statement).toContain('1px neutral border')
    expect(result?.implementation).toContain('1px border')
    expect(result?.implementation).not.toContain('token spacing')
    expect(checked.rejected).not.toEqual(expect.arrayContaining([expect.stringContaining('numeric-value-sanitized')]))
  })

  it('does not rewrite component dimensions as typography token references', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.componentGrammar[0].rules[0] = {
      ...claim('The combobox is 289px wide and 24px high with compact typography.'),
      implementation: 'Set width to 289px, height to 24px, and type from typography.font-size.1.',
      tokenRefs: ['typography.font-size.1'],
      evidence: [{ evidenceId: 'component-a', note: 'Observed component geometry' }],
    }

    const checked = checkProfileContradictions(profile, evidence)
    const resultText = JSON.stringify(checked.profile.componentGrammar)

    expect(resultText).not.toContain('token typography.font-size.1 wide')
    expect(resultText).not.toContain('height to token typography.font-size.1')
    expect(checked.rejected).toEqual(
      expect.arrayContaining([expect.stringContaining('numeric-value-not-in-token-set(289px)')]),
    )
    expect(checked.rejected).not.toEqual(
      expect.arrayContaining([expect.stringContaining('numeric-value-sanitized(289px')]),
    )
  })

  it('repairs uncertainty text that denies an observed responsive layout-mode change', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.uncertainties = [
      {
        topic: '水平溢出范围',
        reason: '移动端没有布局模式变化证据，无法确认响应式行为。',
      },
    ]
    const contradictionEvidence = structuredClone(evidence)
    contradictionEvidence.pages[1].horizontalOverflow = true
    contradictionEvidence.responsiveObservations[0].changedProperties.push('layoutMode')

    const checked = checkProfileContradictions(profile, contradictionEvidence)

    expect(checked.rejected).toContain('uncertainties.0:contradicts-responsive-layout-facts')
    expect(checked.profile.uncertainties[0].reason).toBe(
      '已观察到局部布局模式变化，但横向溢出的具体来源和影响范围仍需确认。',
    )
    expect(checked.profile.uncertainties).toHaveLength(1)
  })

  it('repairs overflow claims and uncertainties to the programmatically located source section', () => {
    const overflowEvidence = structuredClone(evidence)
    overflowEvidence.pages[1] = {
      ...overflowEvidence.pages[1],
      viewportWidth: 375,
      contentWidth: 1_032,
      horizontalOverflow: true,
      horizontalOverflowSources: [
        {
          locator: 'main > section:nth-of-type(2)',
          overflowPx: 657,
          width: 1_032,
          position: 'static',
          sectionId: 'section-b',
          sectionRole: 'hero',
        },
      ],
    }
    const raw = rawProfile()
    raw.transferRules.avoid = [
      {
        ...claim('Avoid preserving the horizontal overflow observed on the narrow capture.'),
        evidence: [{ evidenceId: 'section-a', note: 'Unrelated desktop section' }],
      },
    ]

    const validation = validateDesignProfile(raw, overflowEvidence, 'structural-only', 'en')

    expect(validation.profile?.transferRules.avoid[0].evidence[0].evidenceId).toBe('section-b')
    expect(validation.rejected).toContain('transferRules.avoid.0:overflow-evidence-scope-repaired')

    const scopedRaw = rawProfile()
    scopedRaw.transferRules.avoid = [
      {
        ...claim('Avoid preserving the horizontal overflow observed on the narrow capture.'),
        evidence: [{ evidenceId: 'section-a', note: 'Unrelated selected section' }],
      },
    ]
    const scopedValidation = validateDesignProfile(
      scopedRaw,
      overflowEvidence,
      'structural-only',
      'en',
      new Set(['section-a']),
    )
    expect(scopedValidation.profile?.transferRules.avoid[0].evidence[0].evidenceId).toBe('section-b')
    expect(scopedValidation.rejected).toContain('transferRules.avoid.0:overflow-evidence-scope-repaired')

    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.uncertainties = [
      {
        topic: '横向溢出未定位',
        reason: 'digest 汇总提到 horizontal-overflow-observed，但没有给出具体 page 或 section 的溢出源。',
        neededEvidence: '带 source.section 的 overflow 事实',
      },
    ]
    const checked = checkProfileContradictions(profile, overflowEvidence)

    expect(checked.rejected).toContain('uncertainties.0:contradicts-overflow-source-facts')
    expect(checked.profile.uncertainties[0].topic).toBe('水平溢出细节')
    expect(checked.profile.uncertainties[0].reason).toBe(
      '已定位到发生横向溢出的页面及关联区块，但裁切范围和预期移动端行为仍需确认。',
    )
    expect(checked.profile.uncertainties[0].neededEvidence).toBe('裁切范围与预期移动端行为')
    expect(checked.profile.uncertainties).toHaveLength(1)

    const responsiveProfile = rawProfile() as unknown as DesignProfile
    responsiveProfile.language = 'zh-CN'
    responsiveProfile.uncertainties = [
      {
        topic: '响应式布局',
        reason: '移动端没有布局模式变化证据，无法确认响应式行为。',
      },
    ]
    overflowEvidence.responsiveObservations[0].changedProperties.push('layoutMode')

    const responsiveChecked = checkProfileContradictions(responsiveProfile, overflowEvidence)

    expect(responsiveChecked.profile.uncertainties[0].reason).toContain('定位了横向溢出的页面及关联区块')
    expect(responsiveChecked.profile.uncertainties[0].reason).not.toContain('具体来源和影响范围仍需确认')
  })

  it('repairs pill-button and viewport-scoping contradictions from cited evidence', () => {
    const contradictionEvidence = structuredClone(evidence)
    contradictionEvidence.sections[0].role = 'header'
    contradictionEvidence.components[0] = {
      ...contradictionEvidence.components[0],
      role: 'primary-action',
      styles: {
        backgroundColor: '#2563eb',
        color: '#ffffff',
        borderRadius: '9999px',
      },
    }
    contradictionEvidence.responsiveObservations[0] = {
      ...contradictionEvidence.responsiveObservations[0],
      changedProperties: [
        'layoutMode',
        'position',
        'height',
        'borderBottom',
        'boxShadow',
        'node.action.lineHeight',
        'node.media.lineHeight',
      ],
      changes: {
        layoutMode: { from: 'flow', to: 'fixed' },
        position: { from: 'relative', to: 'fixed' },
        height: { from: '62px', to: '53px' },
        borderBottom: { from: '0px none #111827', to: '1px solid #e5e7eb' },
        boxShadow: { from: 'none', to: '0 1px 3px rgba(0, 0, 0, 0.1)' },
        'node.action.lineHeight': { from: 'normal', to: '50px' },
        'node.media.lineHeight': { from: 'normal', to: '50px' },
      },
    }
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.componentGrammar[0].rules[0] = {
      ...claim('主按钮是小型实心强调方块。'),
      implementation: '主 CTA 保持紧凑，不加大圆角。',
      evidence: [{ evidenceId: 'component-a', note: '主按钮' }],
    }
    profile.signatureMoves[0] = {
      ...profile.signatureMoves[0],
      statement: '白色顶栏使用相对定位。',
      implementation: '顶栏用白底、相对定位和轻投影。',
      evidence: [{ evidenceId: 'section-a', note: '顶栏' }],
    }
    profile.composition.rhythm = {
      ...claim('跨页面共用同一套顶栏高度与纵向节奏。'),
      implementation: '顶栏在各页保持一致高度与贴顶位置。',
      evidence: [{ evidenceId: 'section-a', note: '顶栏' }],
    }
    profile.sectionGrammar[0].transitionToNext[0] = {
      ...claim('窄屏只记录到顶栏 layoutMode 与 height 的调整。'),
      evidence: [{ evidenceId: 'responsive-a', note: '响应式变化' }],
    }

    const checked = checkProfileContradictions(profile, contradictionEvidence)

    expect(checked.profile.componentGrammar[0].rules[0].statement).toContain('胶囊按钮')
    expect(checked.profile.componentGrammar[0].rules[0].implementation).not.toContain('不加大圆角')
    expect(checked.profile.signatureMoves[0].statement).toContain('relative 变为 fixed')
    expect(checked.profile.signatureMoves[0].implementation).toContain('定位切换')
    expect(checked.profile.composition.rhythm.statement).toContain('高度 62px → 53px')
    expect(checked.profile.composition.rhythm.statement).not.toContain('同一套顶栏高度')
    expect(checked.profile.signatureMoves[0].evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ evidenceId: 'responsive-a' })]),
    )
    expect(checked.profile.sectionGrammar[0].transitionToNext[0].statement).toMatch(/定位|下边框|阴影/)
    expect(checked.profile.sectionGrammar[0].transitionToNext[0].statement).toContain('行高 (action)')
    expect(checked.profile.sectionGrammar[0].transitionToNext[0].statement).toContain('行高 (media)')
    expect(checked.rejected).toEqual(
      expect.arrayContaining([
        'componentGrammar.0.rules.0:primary-pill-shape-sanitized',
        'signatureMoves.0:header-position-scope-sanitized',
        'composition.rhythm:header-position-scope-sanitized',
        'sectionGrammar.0.transitionToNext.0:responsive-property-list-sanitized',
      ]),
    )
  })

  it('does not promote a non-pill input into a pill component rule', () => {
    const contradictionEvidence = structuredClone(evidence)
    contradictionEvidence.components[0] = {
      ...contradictionEvidence.components[0],
      type: 'input',
      styles: { color: '#111827', borderRadius: '3px' },
    }
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.componentGrammar[0] = {
      component: 'input',
      role: '搜索',
      rules: [
        {
          ...claim('输入框宽而低。'),
          implementation: '输入框使用低矮胶囊样式。',
          evidence: [{ evidenceId: 'component-a', note: '输入框' }],
        },
      ],
    }

    const checked = checkProfileContradictions(profile, contradictionEvidence)
    const rule = checked.profile.componentGrammar[0].rules[0]

    expect(rule.implementation).toContain('已观察到的圆角')
    expect(rule.implementation).not.toContain('胶囊')
    expect(checked.rejected).toContain('componentGrammar.0.rules.0:unsupported-pill-shape-sanitized')
  })

  it('rewrites a pill claim when its cited components contain mixed corner shapes', () => {
    const contradictionEvidence = structuredClone(evidence)
    contradictionEvidence.components[0] = {
      ...contradictionEvidence.components[0],
      type: 'button',
      styles: { color: '#111827', borderRadius: '3px' },
    }
    contradictionEvidence.components.push({
      ...contradictionEvidence.components[0],
      id: 'component-b',
      role: 'primary-action',
      styles: { color: '#ffffff', backgroundColor: '#2563eb', borderRadius: '9999px' },
    })
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.componentGrammar[0].rules[0] = {
      ...claim('主、次级按钮都使用胶囊形状。'),
      implementation: '所有引用按钮都保持胶囊轮廓。',
      evidence: [
        { evidenceId: 'component-a', note: '小圆角按钮' },
        { evidenceId: 'component-b', note: '胶囊按钮' },
      ],
    }

    const checked = checkProfileContradictions(profile, contradictionEvidence)
    const rule = checked.profile.componentGrammar[0].rules[0]

    expect(rule.statement).toContain('文本按钮包含小圆角变体')
    expect(rule.statement).toContain('主按钮包含胶囊变体')
    expect(rule.statement).not.toContain('都使用胶囊形状')
    expect(checked.rejected).toContain('componentGrammar.0.rules.0:mixed-pill-shape-sanitized')
  })

  it('rejects an avoid rule that tells the same button variants to both avoid and preserve a shape', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.transferRules.avoid = [
      {
        ...claim('避免把图标与文本按钮改成直角。'),
        implementation: '小尺寸 icon/text 按钮保持 sharp 与 box-shadow:none。',
        evidence: [{ evidenceId: 'component-a', note: '按钮证据' }],
      },
    ]

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.transferRules.avoid).toHaveLength(0)
    expect(checked.rejected).toContain('transferRules.avoid.0:internally-contradictory-shape-directive')
  })

  it('repairs uncertainty text that understates observed mobile captures and section sequences', () => {
    const mobileEvidence = structuredClone(evidence)
    mobileEvidence.pages.push({
      id: 'page-c',
      url: 'https://example.com/column',
      viewport: 'mobile',
      role: 'content',
      images: [{ id: 'image-c', kind: 'overview', path: 'mobile-column.png', width: 375, height: 1_600 }],
    })
    mobileEvidence.sections.push({
      id: 'section-c',
      pageId: 'page-c',
      order: 0,
      role: 'content',
      rect: { x: 0, y: 0, width: 1, height: 1 },
      layoutMode: 'flow',
      tokenRefs: [],
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: ['image-c'],
    })
    mobileEvidence.topology.pages.push({ pageId: 'page-c', role: 'content', sectionIds: ['section-c'] })
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.uncertainties = [
      {
        topic: '移动端整页结构',
        reason: '移动捕获 page-c 未记录区块序列，移动端区块构成不完整。',
        neededEvidence: '移动端 section 序列',
      },
    ]

    const checked = checkProfileContradictions(profile, mobileEvidence)

    expect(checked.rejected).toContain('uncertainties.0:contradicts-mobile-capture-facts')
    expect(checked.profile.uncertainties[0].topic).toBe('移动端结构覆盖')
    expect(checked.profile.uncertainties[0].reason).toBe(
      '已采集 2 个移动端页面/视口且均有截图，其中 2 个包含区块序列；这些事实仅适用于已捕获页面，其他页面及跨页一致性仍需确认。',
    )
    expect(checked.profile.uncertainties[0].neededEvidence).toBe('其他页面的移动端结构及跨页一致性')
  })

  it('keeps a sequence uncertainty when the named mobile capture is actually empty', () => {
    const mobileEvidence = structuredClone(evidence)
    const mobilePage = mobileEvidence.pages.find((page) => page.viewport === 'mobile')!
    const topology = mobileEvidence.topology.pages.find((page) => page.pageId === mobilePage.id)!
    topology.sectionIds = []
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.uncertainties = [
      {
        topic: '移动端结构',
        reason: `移动捕获 ${mobilePage.id} 未记录区块序列。`,
      },
    ]

    const checked = checkProfileContradictions(profile, mobileEvidence)

    expect(checked.profile.uncertainties).toEqual(profile.uncertainties)
    expect(checked.rejected).not.toContain('uncertainties.0:contradicts-mobile-capture-facts')
  })

  it('removes an obsolete uncertainty claiming validated token refs are undefined', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.language = 'zh-CN'
    profile.uncertainties = [
      {
        topic: '部分令牌未定义',
        reason: '个别被引用的令牌未出现在令牌事实中，其数值边界无法核对。',
        neededEvidence: '完整令牌定义表',
      },
    ]

    const checked = checkProfileContradictions(profile, evidence)

    expect(checked.profile.uncertainties).toEqual([])
    expect(checked.rejected).toContain('uncertainties.0:contradicts-validated-token-refs')
  })

  it('normalizes a generalized interaction border color to the observed side-specific property', () => {
    const interactionEvidence = structuredClone(evidence)
    interactionEvidence.interactionObservations = [
      {
        id: 'interaction-border',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'component-a',
        driver: 'hover',
        safety: 'passive',
        trigger: { kind: ':hover' },
        before: { 'border-bottom-color': '#111827' },
        after: { 'border-bottom-color': '#2563eb' },
        changedProperties: ['border-bottom-color'],
        evidenceRefs: ['component-a', 'section-a'],
      },
    ]
    const raw = rawProfile()
    raw.interactionLanguage.feedbackStyle = {
      ...claim('Hover changes the border color of the active control.'),
      implementation: 'Change border-color on hover while keeping the rest of the control stable.',
      evidence: [{ evidenceId: 'interaction-border', note: 'Observed hover declaration' }],
    }

    const validation = validateDesignProfile(raw, interactionEvidence, 'structural-only', 'en')

    expect(validation.profile?.interactionLanguage.feedbackStyle.statement).toContain('border-bottom-color')
    expect(validation.profile?.interactionLanguage.feedbackStyle.implementation).toContain('border-bottom-color')
    expect(validation.profile?.interactionLanguage.feedbackStyle.confidence).toBe('medium')
    expect(validation.rejected).toContain(
      'interactionLanguage.feedbackStyle:interaction-property-normalized(border-bottom-color)',
    )
  })

  it('constrains an over-broad state amplitude claim to properties supported by its cited states', () => {
    const interactionEvidence = structuredClone(evidence)
    interactionEvidence.interactionObservations = [
      {
        id: 'interaction-opacity',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'component-a',
        driver: 'click',
        safety: 'passive',
        trigger: { kind: 'css-pseudo-class:active' },
        before: {},
        after: { opacity: '0.8' },
        changedProperties: ['opacity'],
        evidenceRefs: ['component-a', 'section-a'],
      },
      {
        id: 'interaction-background',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'component-a',
        driver: 'click',
        safety: 'passive',
        trigger: { kind: 'css-pseudo-class:active' },
        before: {},
        after: { 'background-color': '#111827' },
        changedProperties: ['background-color'],
        evidenceRefs: ['component-a', 'section-a'],
      },
      {
        id: 'interaction-shadow',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'component-a',
        driver: 'click',
        safety: 'passive',
        trigger: { kind: 'css-pseudo-class:active' },
        before: {},
        after: { 'box-shadow': 'none' },
        changedProperties: ['box-shadow'],
        evidenceRefs: ['component-a', 'section-a'],
      },
      {
        id: 'interaction-border',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'component-a',
        driver: 'hover',
        safety: 'passive',
        trigger: { kind: 'css-pseudo-class:hover' },
        before: {},
        after: { 'border-bottom-color': '#2563eb' },
        changedProperties: ['border-bottom-color'],
        evidenceRefs: ['component-a', 'section-a'],
      },
    ]
    const raw = rawProfile()
    raw.interactionLanguage.stateChangeAmplitude = {
      ...claim('Feedback stays light across background, border, shadow, color, and opacity changes.'),
      implementation:
        'Limit changes to background-color, border-color, box-shadow, color, and opacity without movement.',
      evidence: [
        { evidenceId: 'interaction-opacity', note: 'Declared active opacity' },
        { evidenceId: 'interaction-background', note: 'Declared active background' },
      ],
    }

    const validation = validateDesignProfile(raw, interactionEvidence, 'structural-only', 'en')
    const amplitude = validation.profile?.interactionLanguage.stateChangeAmplitude

    expect(amplitude?.statement).toContain('background-color, box-shadow, opacity')
    expect(amplitude?.statement).not.toContain('border')
    expect(amplitude?.confidence).toBe('low')
    expect(validation.rejected).toEqual(
      expect.arrayContaining([
        'interactionLanguage.stateChangeAmplitude:interaction-evidence-scope-repaired(box-shadow)',
        'interactionLanguage.stateChangeAmplitude:interaction-property-claim-sanitized(border-color)',
      ]),
    )
    expect(validation.rejected).not.toContain(
      'interactionLanguage.stateChangeAmplitude:interaction-property-not-observed(border-color)',
    )
  })

  it('rejects contrast prose placed in visualSequence', () => {
    const raw = rawProfile()
    raw.attention.visualSequence = [
      claim('Blue actions create stronger contrast than the surrounding neutral surfaces.'),
    ]

    const validation = validateDesignProfile(raw, evidence, 'structural-only', 'en')

    expect(validation.profile?.attention.visualSequence).toEqual([])
    expect(validation.rejected).toContain('attention.visualSequence.0:semantic-field-mismatch')
  })

  it('keeps unknown extraction buckets out of AI section grammar', () => {
    const unknownEvidence = structuredClone(evidence)
    unknownEvidence.sections.forEach((section) => {
      section.role = 'unknown'
    })
    const raw = rawProfile()
    raw.sectionGrammar = [
      {
        role: 'unknown',
        composition: [claim('An unclassified region uses a reusable structure.')],
        contentRhythm: [],
        transitionToNext: [],
      },
    ]

    const validation = validateDesignProfile(raw, unknownEvidence, 'structural-only', 'en')

    expect(validation.profile?.sectionGrammar).toEqual([])
    expect(validation.rejected).toContain('sectionGrammar.0:unobserved-role')
  })

  it('restores grounded low-confidence coverage after contradiction pruning empties profile arrays', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.signatureMoves = []
    profile.attention.visualSequence = []
    profile.sectionGrammar.push({ role: 'content', composition: [], contentRhythm: [], transitionToNext: [] })
    profile.interactionLanguage.primaryDrivers = []
    profile.componentGrammar = [
      { component: 'button', role: 'primary action', rules: [] },
      { component: 'button', role: 'duplicate empty shell', rules: [] },
    ]
    profile.transferRules = { preserve: [], adapt: [], avoid: [] }

    const repaired = repairProfileCoverage(profile, evidence)

    expect(repaired.repaired).toEqual(
      expect.arrayContaining([
        'signatureMoves',
        'attention.visualSequence',
        'interactionLanguage.primaryDrivers',
        'componentGrammar.button',
        'transferRules.preserve',
        'transferRules.adapt',
        'transferRules.avoid',
      ]),
    )
    expect(repaired.profile.signatureMoves).toHaveLength(1)
    expect(repaired.profile.attention.visualSequence).toHaveLength(1)
    expect(repaired.profile.componentGrammar[0].rules).toEqual([
      expect.objectContaining({
        confidence: 'low',
        evidence: [expect.objectContaining({ evidenceId: 'component-a' })],
      }),
    ])
    expect(repaired.profile.componentGrammar.filter((component) => component.component === 'button')).toHaveLength(1)
    expect(repaired.repaired.filter((path) => path === 'componentGrammar.button')).toHaveLength(1)
    expect(repaired.profile.transferRules.preserve.length).toBeGreaterThan(0)
    expect(repaired.profile.transferRules.adapt.length).toBeGreaterThan(0)
    expect(repaired.profile.transferRules.avoid.length).toBeGreaterThan(0)
    expect(
      new Set([
        repaired.profile.transferRules.preserve[0].statement,
        repaired.profile.transferRules.adapt[0].statement,
        repaired.profile.transferRules.avoid[0].statement,
      ]).size,
    ).toBe(3)
  })

  it('promotes repeated canonical component evidence to a visible deterministic fallback', () => {
    const repeatedEvidence = structuredClone(evidence)
    repeatedEvidence.components.push({
      ...repeatedEvidence.components[0],
      id: 'component-b',
      rect: { ...repeatedEvidence.components[0].rect, y: 0.42 },
      confidence: 0.9,
    })
    const profile = rawProfile() as unknown as DesignProfile
    profile.componentGrammar = []

    const repaired = repairProfileCoverage(profile, repeatedEvidence)
    const button = repaired.profile.componentGrammar.find((component) => component.component === 'button')

    expect(button?.rules[0]).toEqual(
      expect.objectContaining({
        confidence: 'medium',
        statement: expect.stringContaining('Observed button variants'),
      }),
    )
  })

  it('preserves distinct observed card families in deterministic coverage repair', () => {
    const cardEvidence = structuredClone(evidence)
    cardEvidence.components.push(
      {
        ...cardEvidence.components[0],
        id: 'card-flat',
        type: 'card',
        styles: {
          backgroundColor: '#ffffff',
          border: '0px none transparent',
          borderRadius: '2px',
          boxShadow: 'none',
        },
      },
      {
        ...cardEvidence.components[0],
        id: 'card-elevated',
        type: 'card',
        styles: {
          backgroundColor: '#ffffff',
          border: '0px none transparent',
          borderRadius: '20px',
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.12)',
        },
      },
    )
    const profile = rawProfile() as unknown as DesignProfile
    profile.componentGrammar = []

    const repaired = repairProfileCoverage(profile, cardEvidence)
    const cards = repaired.profile.componentGrammar.filter((component) => component.component === 'card')

    expect(cards).toHaveLength(2)
    expect(cards.map((component) => component.role).sort()).toEqual([
      'Observed card family (elevated-r20)',
      'Observed card family (flat-r2)',
    ])
    expect(cards.flatMap((component) => component.rules[0].evidence.map((reference) => reference.evidenceId))).toEqual(
      expect.arrayContaining(['card-flat', 'card-elevated']),
    )
    expect(repaired.repaired.filter((path) => path === 'componentGrammar.card')).toHaveLength(1)
  })

  it('removes false extrema and color-role claims instead of retaining them as low-confidence facts', () => {
    const profile = rawProfile() as unknown as DesignProfile
    profile.visualLanguage.typography.statement = 'The maximum font weight is 400.'
    profile.visualLanguage.typography.implementation = 'Cap every heading at font-weight 400.'
    profile.visualLanguage.color.statement = '#2563eb is the background color for neutral page surfaces.'
    profile.visualLanguage.color.implementation = 'Fill all page backgrounds with #2563eb.'
    const contradictionEvidence = structuredClone(evidence)
    contradictionEvidence.tokens.evidence = {
      'colors.primary': {
        value: '#2563eb',
        confidence: 'high',
        observationCount: 8,
        pageCount: 1,
        captureCount: 1,
        pages: ['https://example.com/'],
        sources: ['usage:primary-action-color'],
        reasons: ['rendered-use'],
      },
    }

    const checked = checkProfileContradictions(profile, contradictionEvidence)

    expect(checked.rejected).toEqual(
      expect.arrayContaining([
        expect.stringContaining('font-weight-boundary-contradiction'),
        expect.stringContaining('color-role-contradiction'),
      ]),
    )
    expect(checked.profile.visualLanguage.typography.statement).not.toContain('maximum font weight is 400')
    expect(checked.profile.visualLanguage.color.statement).not.toContain('background color')
    expect(checked.profile.visualLanguage.typography.confidence).toBe('low')
    expect(checked.profile.visualLanguage.color.confidence).toBe('low')
  })

  it('resolves misplaced token citations back to selected DOM evidence', () => {
    const raw = rawProfile()
    raw.composition.densityAndWhitespace = {
      ...claim('Repeated background spacing creates consistent breathing room'),
      evidence: [{ evidenceId: 'spacing.2', note: 'Spacing token observed on both sections' }],
    }
    raw.visualLanguage.color = {
      ...claim('A restrained primary accent separates actions from neutral surfaces'),
      evidence: [{ evidenceId: 'color.primary', note: 'Primary token observed on the action component' }],
    }

    const validation = validateDesignProfile(raw, evidence, 'structural-only', 'en')
    expect(validation.profile).not.toBeNull()
    expect(validation.profile?.composition.densityAndWhitespace.tokenRefs).toEqual(['spacing.2'])
    expect(validation.profile?.composition.densityAndWhitespace.evidence.map((item) => item.evidenceId)).toEqual([
      'section-a',
      'section-b',
    ])
    expect(validation.profile?.visualLanguage.color.tokenRefs).toEqual(['color.primary'])
    expect(validation.profile?.visualLanguage.color.evidence[0].evidenceId).toBe('component-a')
  })

  it('uses a low-confidence evidence fallback when token refs lack an observed citation', () => {
    const raw = rawProfile()
    raw.visualLanguage.color = {
      ...claim('A restrained primary accent separates actions from neutral surfaces'),
      evidence: [],
      tokenRefs: ['color.primary'],
    }

    const validation = validateDesignProfile(raw, evidence, 'structural-only', 'en')
    expect(validation.profile).not.toBeNull()
    expect(validation.status).toBe('partial')
    expect(validation.profile?.visualLanguage.color.confidence).toBe('low')
    expect(validation.profile?.visualLanguage.color.evidence.length).toBeGreaterThan(0)
    expect(validation.rejected).toContain('visualLanguage.color:missing-evidence')
  })

  it('marks profiles partial when observed sections have no section grammar', () => {
    const raw = rawProfile()
    raw.sectionGrammar = []

    const validation = validateDesignProfile(raw, evidence, 'structural-only', 'en')

    expect(validation.status).toBe('partial')
    expect(validation.rejected).toContain('sectionGrammar:empty')
  })

  it('drops unobserved section roles and demotes single-page preserve rules in multi-page profiles', () => {
    const raw = rawProfile()
    raw.sectionGrammar.push({
      role: 'main-feed',
      composition: [claim()],
      contentRhythm: [claim()],
      transitionToNext: [claim()],
    })
    raw.transferRules.preserve = [
      {
        ...claim('A local hero arrangement appears on the entry page'),
        evidence: [
          { evidenceId: 'section-a', note: 'Entry-page section' },
          { evidenceId: 'image-a', note: 'Entry-page overview' },
        ],
      },
    ]

    const validation = validateDesignProfile(raw, multiUrlEvidence(), 'structural-only', 'en')
    expect(validation.profile?.sectionGrammar.some((grammar) => grammar.role === 'main-feed')).toBe(false)
    // Single-page support caps confidence instead of dropping the rule (same as patterns).
    expect(validation.profile?.transferRules.preserve).toHaveLength(1)
    expect(validation.profile?.transferRules.preserve[0].confidence).toBe('medium')
    expect(validation.rejected).toContain('sectionGrammar.1:unobserved-role')
    expect(validation.rejected).not.toContain('transferRules.preserve.0:single-page-preserve-rule')
  })

  it('hides cross-page section claims that cite only one page', () => {
    const raw = rawProfile()
    raw.sectionGrammar[0].transitionToNext = [
      {
        ...claim('Content regions remain consistent across pages.'),
        evidence: [{ evidenceId: 'section-a', note: 'Entry page only' }],
      },
    ]

    const validation = validateDesignProfile(raw, multiUrlEvidence(), 'structural-only', 'en')

    expect(validation.profile?.sectionGrammar[0].transitionToNext[0].confidence).toBe('low')
    expect(validation.status).toBe('partial')
    expect(validation.rejected).toContain('sectionGrammar.0.transitionToNext.0:unsupported-cross-page-scope')
  })

  it('normalizes localized section role enums before validating evidence', () => {
    const raw = rawProfile()
    raw.language = 'zh-CN'
    raw.sectionGrammar[0].role = '主视觉'

    const validation = validateDesignProfile(raw, evidence, 'structural-only', 'zh-CN')

    expect(validation.profile?.sectionGrammar[0].role).toBe('hero')
    expect(validation.rejected).not.toContain('sectionGrammar.0:unobserved-role')
  })

  it('requires component grammar rules to cite the matching observed component type', () => {
    const localized = rawProfile()
    localized.componentGrammar[0].component = '按钮'
    const localizedResult = validateDesignProfile(localized, evidence, 'structural-only', 'en')
    expect(localizedResult.profile?.componentGrammar[0].component).toBe('button')

    const mismatched = rawProfile()
    mismatched.componentGrammar[0].rules[0].evidence = [
      { evidenceId: 'section-a', note: 'Section evidence does not identify a component type' },
    ]
    const mismatchedResult = validateDesignProfile(mismatched, evidence, 'structural-only', 'en')
    expect(mismatchedResult.status).toBe('partial')
    expect(mismatchedResult.profile?.componentGrammar).toHaveLength(0)
    expect(mismatchedResult.rejected).toContain('componentGrammar.0.rules.0:mismatched-component-type')
  })

  it('maps page screenshots to the roles present on their page', () => {
    const mixedEvidence: DesignEvidence = {
      ...evidence,
      sections: evidence.sections.map((section) =>
        section.id === 'section-b' ? { ...section, role: 'footer' as const } : section,
      ),
    }
    const raw = rawProfile()
    raw.sectionGrammar = [
      {
        role: 'hero',
        composition: [
          {
            ...claim('The hero centers a short promise above one action'),
            evidence: [{ evidenceId: 'image-a', note: 'Entry overview' }],
          },
        ],
        contentRhythm: [claim()],
        transitionToNext: [claim()],
      },
      {
        role: 'footer',
        composition: [
          {
            ...claim('The footer closes the page with quiet links'),
            evidence: [{ evidenceId: 'image-a', note: 'Entry overview' }],
          },
        ],
        contentRhythm: [claim()],
        transitionToNext: [claim()],
      },
    ]

    const validation = validateDesignProfile(raw, mixedEvidence, 'structural-only', 'en')
    // Page A contains a hero, so its screenshot supports the hero grammar claim...
    expect(validation.profile?.sectionGrammar.find((grammar) => grammar.role === 'hero')?.composition).toHaveLength(1)
    // ...but not a footer claim, since page A has no footer.
    expect(validation.profile?.sectionGrammar.find((grammar) => grammar.role === 'footer')?.composition).toHaveLength(0)
    expect(validation.rejected).toContain('sectionGrammar.1.composition:mismatched-section-role')
  })

  it('rejects global claims supported only by footer or utility regions', () => {
    const footerSection = (id: string, pageId: string) => ({
      id,
      pageId,
      order: 9,
      role: 'footer' as const,
      rect: { x: 0, y: 0.95, width: 1, height: 0.05 },
      layoutMode: 'flow' as const,
      tokenRefs: [],
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: [],
    })
    const utilityEvidence: DesignEvidence = {
      ...multiUrlEvidence(),
      sections: [
        ...multiUrlEvidence().sections,
        footerSection('section-footer-a', 'page-a'),
        footerSection('section-footer-b', 'page-b'),
      ],
    }

    // A signature move backed only by footer regions on both pages is still local chrome.
    const utilitySignature = rawProfile()
    utilitySignature.signatureMoves = [
      {
        ...claim('The filing footer anchors every page with dense legal links'),
        evidence: [
          { evidenceId: 'section-footer-a', note: 'Entry footer' },
          { evidenceId: 'section-footer-b', note: 'Pricing footer' },
        ],
        id: 'move-legal-footer',
        name: 'Legal footer anchor',
        distinctiveness: 'The same dense legal block repeats at the bottom of pages.',
      },
    ]
    const signatureResult = validateDesignProfile(utilitySignature, utilityEvidence, 'structural-only', 'en')
    expect(signatureResult.status).toBe('partial')
    expect(signatureResult.profile?.signatureMoves[0].id).toBe('evidence-coverage-repair')
    expect(signatureResult.rejected).toContain('signatureMoves.0:utility-only-evidence')

    // A signature move seen on only one of several pages is not site-wide.
    const singlePageSignature = rawProfile()
    singlePageSignature.signatureMoves = [
      {
        ...claim('The entry hero pairs oversized type with a compact action cluster'),
        evidence: [
          { evidenceId: 'section-a', note: 'Entry hero' },
          { evidenceId: 'image-a', note: 'Entry overview' },
        ],
        id: 'move-entry-hero',
        name: 'Entry hero',
        distinctiveness: 'The opening compresses all attention into one cluster.',
      },
    ]
    const singlePageResult = validateDesignProfile(singlePageSignature, utilityEvidence, 'structural-only', 'en')
    expect(singlePageResult.profile?.signatureMoves).toHaveLength(1)
    expect(singlePageResult.profile?.signatureMoves[0].confidence).toBe('medium')
    expect(singlePageResult.rejected).not.toContain('signatureMoves.0:single-page-signature')

    // Preserve rules and high-confidence global claims cannot rest on utility chrome alone.
    const utilityPreserve = rawProfile()
    utilityPreserve.transferRules.preserve = [
      {
        ...claim('Keep the legal filing block pinned to the bottom of every page'),
        evidence: [
          { evidenceId: 'section-footer-a', note: 'Entry footer' },
          { evidenceId: 'section-footer-b', note: 'Pricing footer' },
        ],
      },
    ]
    utilityPreserve.composition.alignmentStrategy = {
      ...claim('Footer links align to the page edges'),
      evidence: [{ evidenceId: 'section-footer-a', note: 'Entry footer alignment' }],
    }
    const preserveResult = validateDesignProfile(utilityPreserve, utilityEvidence, 'structural-only', 'en')
    expect(preserveResult.rejected).toContain('transferRules.preserve.0:utility-only-evidence')
    expect(preserveResult.profile?.composition.alignmentStrategy.confidence).toBe('medium')

    // Cross-page content evidence still supports global claims.
    const contentSignature = validateDesignProfile(rawProfile(), utilityEvidence, 'structural-only', 'en')
    expect(contentSignature.profile?.signatureMoves).toHaveLength(1)
  })

  it('filters invalid optional claims and safely fills invalid required claims', () => {
    const partial = rawProfile()
    partial.attention.visualSequence.push(claim('<script>alert(1)</script>'))
    const partialResult = validateDesignProfile(partial, evidence, 'structural-only', 'en')
    expect(partialResult.status).toBe('complete')
    expect(partialResult.profile?.attention.visualSequence).toHaveLength(1)

    const malicious = rawProfile()
    malicious.thesis = claim('Use javascript:https://evil.example to reproduce the original page')
    const maliciousResult = validateDesignProfile(malicious, evidence, 'structural-only', 'en')
    expect(maliciousResult.status).toBe('partial')
    expect(maliciousResult.profile?.thesis.statement).not.toContain('javascript:')
    expect(maliciousResult.profile?.thesis.confidence).toBe('low')
  })

  it('sanitizes unsupported token values without discarding the surrounding claim', () => {
    const withNewColor = rawProfile()
    withNewColor.attention.visualSequence.push({
      ...claim('First the main summary establishes context, then accent panels highlight secondary metrics.'),
      implementation: 'After the summary, apply #ff3366 panels behind secondary metrics to keep them grouped.',
    })
    const rejected = validateDesignProfile(withNewColor, evidence, 'structural-only', 'en')
    expect(rejected.status).toBe('complete')
    expect(rejected.profile?.attention.visualSequence).toHaveLength(2)
    expect(rejected.profile?.attention.visualSequence[1].implementation).not.toContain('#ff3366')
    expect(rejected.profile?.attention.visualSequence[1].confidence).toBe('low')
    expect(rejected.rejected).toEqual(expect.arrayContaining([expect.stringContaining('token-value-sanitized')]))

    const withKnownColor = rawProfile()
    withKnownColor.attention.visualSequence.push({
      ...claim('First the main summary establishes context, then accent panels highlight secondary metrics.'),
      implementation: 'After the summary, apply #2563eb sparingly to primary actions and keep other surfaces neutral.',
    })
    const accepted = validateDesignProfile(withKnownColor, evidence, 'structural-only', 'en')
    expect(accepted.profile?.attention.visualSequence).toHaveLength(2)
  })

  it('repairs unsupported color values in required claims instead of falling back the whole profile', () => {
    const requiredValues = rawProfile()
    requiredValues.attention.contrastStrategy = {
      ...claim('Contrast separates primary actions from surrounding surfaces'),
      implementation: 'Use #ff3366 on primary actions and keep secondary actions quiet.',
    }
    requiredValues.visualLanguage.surfaces = {
      ...claim('Layered surfaces separate navigation from content'),
      implementation: 'Use #00ffaa for raised surfaces and preserve the observed border treatment.',
    }

    const result = validateDesignProfile(requiredValues, evidence, 'structural-only', 'en')

    expect(result.profile).not.toBeNull()
    expect(result.status).toBe('complete')
    expect(result.profile?.attention.contrastStrategy.implementation).not.toContain('#ff3366')
    expect(result.profile?.visualLanguage.surfaces.implementation).not.toContain('#00ffaa')
  })

  it('demotes exact color claims when token observations belong to different pages', () => {
    const scopedEvidence = multiUrlEvidence()
    scopedEvidence.tokens.evidence = {
      'colors.primary': {
        value: '#2563eb',
        confidence: 'medium',
        observationCount: 8,
        pageCount: 1,
        captureCount: 1,
        pages: ['https://example.com/pricing'],
        sources: ['usage:primary-action-color'],
        reasons: ['rendered-use'],
      },
    }
    const raw = rawProfile()
    raw.attention.contrastStrategy = {
      ...claim('A blue CTA is the homepage action accent'),
      implementation: 'Use #2563eb for the homepage action and keep secondary actions neutral.',
      evidence: [
        { evidenceId: 'section-a', note: 'Homepage hero' },
        { evidenceId: 'image-a', note: 'Homepage capture' },
      ],
      tokenRefs: ['color.background'],
    }

    const validation = validateDesignProfile(raw, scopedEvidence, 'structural-only', 'en')

    expect(validation.status).toBe('partial')
    expect(validation.profile?.attention.contrastStrategy.confidence).toBe('low')
    expect(validation.profile?.attention.contrastStrategy.tokenRefs).toEqual(['color.primary'])
    expect(validation.rejected).toEqual(
      expect.arrayContaining([expect.stringContaining('attention.contrastStrategy:color-token-page-mismatch')]),
    )
  })

  it('flags model-returned token values without failing valid profiles', () => {
    const raw = { ...rawProfile(), tokens: { colors: { primary: '#ff0000' } } }
    const result = validateDesignProfile(raw, evidence, 'structural-only', 'en')
    expect(result.profile).not.toBeNull()
    expect(result.status).toBe('complete')
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

  it('downgrades unsupported only and unique claims to low confidence', () => {
    const raw = rawProfile()
    raw.visualLanguage.imagery = {
      ...claim('Badges are the only decorative color on every page'),
      evidence: [{ evidenceId: 'image-a', note: 'Entry-page screenshot only' }],
    }

    const result = validateDesignProfile(raw, multiUrlEvidence(), 'structural-only', 'en')

    expect(result.profile?.visualLanguage.imagery?.confidence).toBe('low')
  })

  it('downgrades responsive reflow claims when the captured mobile page actually overflows', () => {
    const overflowEvidence: DesignEvidence = {
      ...evidence,
      pages: evidence.pages.map((page) =>
        page.id === 'page-b' ? { ...page, viewportWidth: 375, contentWidth: 1032, horizontalOverflow: true } : page,
      ),
      limitations: ['horizontal-overflow-observed'],
    }
    const raw = rawProfile()
    raw.patterns[0].responsiveRules = [
      {
        ...claim('The mobile layout hides the sidebar and responsively reflows the main column'),
        evidence: [{ evidenceId: 'responsive-a', note: 'Desktop-to-mobile bounds differ' }],
      },
    ]

    const validation = validateDesignProfile(raw, overflowEvidence, 'structural-only', 'en')

    expect(validation.profile?.patterns?.[0].responsiveRules[0].confidence).toBe('low')
    expect(validation.profile?.uncertainties).toEqual(
      expect.arrayContaining([expect.objectContaining({ topic: 'Responsive behavior' })]),
    )
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
    expect(
      createEvidenceFingerprint(evidence, 'structural-only', 'openai', 'gpt-4o', undefined, '1', '1', 'zh-CN'),
    ).not.toBe(base)
    expect(createStructuralFingerprint(evidence, 'structural-only', 'openai', 'gpt-4o', [], '1', 'zh-CN')).not.toBe(
      createStructuralFingerprint(evidence, 'structural-only', 'openai', 'gpt-4o', [], '1', 'en'),
    )
  })

  it('invalidates the evidence fingerprint for every material digest and visual-summary change', () => {
    const structuralFingerprint = (candidate: DesignEvidence) =>
      createEvidenceFingerprint(candidate, 'structural-only', 'openai', 'gpt-4o')
    const base = structuralFingerprint(evidence)

    const componentChanged = structuredClone(evidence)
    componentChanged.components[0].styles.backgroundColor = '#2563eb'
    expect(structuralFingerprint(componentChanged)).not.toBe(base)

    const rawMeasurementChanged = structuredClone(evidence)
    rawMeasurementChanged.components[0].styles.borderRadius = '9999px'
    expect(structuralFingerprint(rawMeasurementChanged)).not.toBe(base)

    const layoutChanged = structuredClone(evidence)
    layoutChanged.layoutNodes = [
      {
        id: 'layout-a',
        pageId: 'page-a',
        sectionId: 'section-a',
        role: 'heading',
        rect: { x: 0.2, y: 0.2, width: 0.5, height: 0.1 },
        textRole: 'display',
        tokenRefs: ['typography.font-size.1'],
        traits: ['text-length:short'],
      },
    ]
    expect(structuralFingerprint(layoutChanged)).not.toBe(base)

    const mediaChanged = structuredClone(evidence)
    mediaChanged.mediaLayers = [
      {
        id: 'media-a',
        pageId: 'page-a',
        sectionId: 'section-a',
        kind: 'image',
        role: 'product',
        importance: 'major',
        rect: { x: 0.5, y: 0.2, width: 0.4, height: 0.3 },
      },
    ]
    expect(structuralFingerprint(mediaChanged)).not.toBe(base)

    const healthChanged = structuredClone(evidence)
    healthChanged.pages[0].health = {
      status: 'degraded',
      checkedAt: '2026-08-09T00:00:00.000Z',
      recovered: false,
      attempts: 1,
      viewport: { width: 1_440, height: 900 },
      content: { width: 1_444, height: 1_600 },
      overlayAreaRatio: 0,
      mutationCount: 0,
      aiEligible: true,
      issues: [{ code: 'horizontal-overflow', severity: 'warning', recoverable: false }],
    }
    expect(structuralFingerprint(healthChanged)).not.toBe(base)

    const visualChanged = structuredClone(evidence)
    visualChanged.pages[0].images[0].aiSummary = {
      version: '2',
      path: 'C:\\private\\capture.ai-v2.jpeg',
      width: 1_440,
      height: 1_500,
      bytes: 120_000,
      contentHash: 'summary-a',
    }
    const visualBase = createEvidenceFingerprint(visualChanged, 'multimodal', 'openai', 'gpt-4o', ['image-a'])
    visualChanged.pages[0].images[0].aiSummary!.contentHash = 'summary-b'
    expect(createEvidenceFingerprint(visualChanged, 'multimodal', 'openai', 'gpt-4o', ['image-a'])).not.toBe(visualBase)
  })

  it('invalidates the persistent interpretation cache for every material input', () => {
    const input = {
      fingerprint: 'evidence-and-visual-summary-hash',
      provider: 'openai',
      model: 'gpt-5',
      reasoningEffort: 'low',
      thinkingEnabled: false,
      language: 'en' as const,
      promptVersion: '1',
      schemaVersion: '1',
      accessMode: 'anonymous' as const,
    }
    const key = createInterpretationCacheKey(input)
    for (const change of [
      { fingerprint: 'changed-evidence' },
      { provider: 'anthropic' },
      { model: 'gpt-5.1' },
      { reasoningEffort: 'high' },
      { thinkingEnabled: true },
      { language: 'zh-CN' as const },
      { promptVersion: '2' },
      { schemaVersion: '2' },
      { accessMode: 'managed' as const },
    ]) {
      expect(createInterpretationCacheKey({ ...input, ...change })).not.toBe(key)
    }
    expect(createInterpretationCacheKey(input)).toBe(key)
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

  it('does not treat passive state declarations as executed click behavior', () => {
    const passiveEvidence: DesignEvidence = {
      ...evidence,
      interactionObservations: [
        {
          id: 'interaction-passive',
          pageId: 'page-a',
          sectionId: 'section-a',
          targetId: 'target-a',
          driver: 'click',
          safety: 'passive',
          trigger: { kind: 'aria-state:aria-expanded' },
          before: { ariaExpanded: 'false' },
          after: { ariaExpanded: 'false' },
          changedProperties: ['aria-expanded'],
          evidenceRefs: ['section-a'],
        },
      ],
    }
    const raw = rawProfile()
    const passiveClaim = {
      ...claim('Click expands the disclosure and changes its visible state'),
      evidence: [{ evidenceId: 'interaction-passive', note: 'Declared aria-expanded state' }],
    }
    raw.interactionLanguage.primaryDrivers = [passiveClaim]
    raw.interactionLanguage.feedbackStyle = passiveClaim
    raw.interactionLanguage.stateChangeAmplitude = passiveClaim
    raw.transferRules.avoid = [passiveClaim]

    const validation = validateDesignProfile(raw, passiveEvidence, 'structural-only', 'en')
    expect(validation.profile?.interactionLanguage.primaryDrivers[0].confidence).toBe('low')
    expect(validation.profile?.interactionLanguage.feedbackStyle.confidence).toBe('low')

    const checked = checkProfileContradictions(validation.profile!, passiveEvidence)
    expect(checked.profile.interactionLanguage.feedbackStyle.statement).toBe(
      'Passive state declarations record aria-expanded style differences, but no real press or click was executed.',
    )
    expect(checked.profile.interactionLanguage.feedbackStyle.implementation).toContain('declared-state styling')
    expect(checked.rejected).toContain('interactionLanguage.feedbackStyle:passive-interaction-wording-sanitized')
    expect(checked.rejected).not.toContain(
      'interactionLanguage.feedbackStyle:passive-evidence-cannot-prove-executed-interaction',
    )
    expect(checked.profile.transferRules.avoid).toEqual([])
    expect(checked.rejected).toContain('transferRules.avoid.0:passive-interaction-transfer-rule-sanitized')

    const repaired = repairProfileCoverage(checked.profile, passiveEvidence)
    expect(repaired.repaired).toContain('transferRules.avoid')
    expect(repaired.profile.transferRules.avoid[0].statement).toBe(
      'Unexecuted interaction states and untokenized raw DOM values are not design rules.',
    )
  })

  it('does not call a transparent focus style clearly visible', () => {
    const focusEvidence: DesignEvidence = {
      ...evidence,
      interactionObservations: [
        {
          id: 'interaction-focus-transparent',
          pageId: 'page-a',
          sectionId: 'section-a',
          targetId: 'target-a',
          driver: 'focus',
          safety: 'passive',
          trigger: { kind: 'css-pseudo' },
          before: { 'outline-color': 'rgba(0, 0, 0, 0)', 'box-shadow': 'none' },
          after: { 'outline-color': 'rgba(0, 0, 0, 0)', 'box-shadow': '0 0 0 2px rgba(0, 0, 0, 0)' },
          changedProperties: ['outline-width', 'box-shadow'],
          evidenceRefs: ['section-a'],
        },
      ],
    }
    const raw = rawProfile()
    raw.interactionLanguage.primaryDrivers = [
      {
        ...claim('Focus provides a clearly visible keyboard focus indicator'),
        implementation: 'Use the observed outline and box-shadow as the visible focus ring.',
        evidence: [{ evidenceId: 'interaction-focus-transparent', note: 'Passive focus declaration' }],
      },
    ]

    const validation = validateDesignProfile(raw, focusEvidence, 'structural-only', 'en')

    expect(validation.status).toBe('partial')
    expect(validation.profile?.interactionLanguage.primaryDrivers[0].confidence).toBe('low')
    expect(validation.rejected).toContain('interactionLanguage.primaryDrivers.0:focus-visibility-not-observed')
  })

  it('demotes interaction details absent from the cited state change', () => {
    const interactionEvidence: DesignEvidence = {
      ...evidence,
      interactionObservations: [
        {
          id: 'interaction-hover-color',
          pageId: 'page-a',
          sectionId: 'section-a',
          targetId: 'target-a',
          driver: 'hover',
          safety: 'passive',
          trigger: { kind: 'css-pseudo' },
          before: { color: '#111827' },
          after: { color: '#2563eb' },
          changedProperties: ['color'],
          evidenceRefs: ['section-a'],
        },
      ],
    }
    const raw = rawProfile()
    raw.interactionLanguage.primaryDrivers = [
      {
        ...claim('Hover adds a box-shadow and changes the accent to #ffffff'),
        implementation: 'Apply the observed shadow and color transition on hover.',
        evidence: [{ evidenceId: 'interaction-hover-color', note: 'Observed hover state' }],
      },
    ]

    const validation = validateDesignProfile(raw, interactionEvidence, 'structural-only', 'en')

    expect(validation.status).toBe('partial')
    expect(validation.profile?.interactionLanguage.primaryDrivers[0].confidence).toBe('low')
    expect(validation.rejected).toEqual(
      expect.arrayContaining([
        'interactionLanguage.primaryDrivers.0:interaction-property-not-observed(box-shadow)',
        'interactionLanguage.primaryDrivers.0:interaction-value-not-observed(#ffffff)',
      ]),
    )
  })

  it('rebinds a multi-driver interaction claim to property evidence for each named driver', () => {
    const interactionEvidence: DesignEvidence = {
      ...evidence,
      interactionObservations: [
        {
          id: 'interaction-focus-outline',
          pageId: 'page-a',
          sectionId: 'section-a',
          targetId: 'target-focus',
          driver: 'focus',
          safety: 'passive',
          trigger: { kind: 'css-pseudo' },
          before: { 'outline-color': '#111827' },
          after: { 'outline-color': '#2563eb' },
          changedProperties: ['outline-color'],
          evidenceRefs: ['section-a'],
        },
        {
          id: 'interaction-hover-background',
          pageId: 'page-a',
          sectionId: 'section-a',
          targetId: 'target-a',
          driver: 'hover',
          safety: 'passive',
          trigger: { kind: 'css-pseudo' },
          before: { 'background-color': '#ffffff' },
          after: { 'background-color': '#111827' },
          changedProperties: ['background-color'],
          evidenceRefs: ['section-a'],
        },
        {
          id: 'interaction-hover-outline',
          pageId: 'page-a',
          sectionId: 'section-a',
          targetId: 'target-b',
          driver: 'hover',
          safety: 'passive',
          trigger: { kind: 'css-pseudo' },
          before: { 'outline-color': '#111827' },
          after: { 'outline-color': '#2563eb' },
          changedProperties: ['outline-color'],
          evidenceRefs: ['section-a'],
        },
        {
          id: 'interaction-click-shadow',
          pageId: 'page-a',
          sectionId: 'section-a',
          targetId: 'target-click',
          driver: 'click',
          safety: 'safe-active',
          trigger: { kind: 'click' },
          before: { 'box-shadow': 'none' },
          after: { 'box-shadow': '0 0 0 2px' },
          changedProperties: ['box-shadow'],
          evidenceRefs: ['section-a'],
        },
      ],
    }
    const raw = rawProfile()
    raw.interactionLanguage.primaryDrivers = [
      {
        ...claim('Hover changes background-color, focus changes outline, and pressing changes box-shadow.'),
        implementation: 'Bind each property change to its named interaction driver.',
        evidence: [{ evidenceId: 'interaction-hover-background', note: 'Only the hover state was selected' }],
      },
    ]

    const validation = validateDesignProfile(raw, interactionEvidence, 'structural-only', 'en')

    expect(validation.profile?.interactionLanguage.primaryDrivers[0].evidence.map((item) => item.evidenceId)).toEqual(
      expect.arrayContaining(['interaction-hover-background', 'interaction-focus-outline', 'interaction-click-shadow']),
    )
    expect(validation.profile?.interactionLanguage.primaryDrivers[0].confidence).toBe('low')
    expect(validation.rejected).toEqual(
      expect.arrayContaining([
        'interactionLanguage.primaryDrivers.0:interaction-evidence-scope-repaired(box-shadow)',
        'interactionLanguage.primaryDrivers.0:interaction-evidence-scope-repaired(outline)',
      ]),
    )
    expect(validation.rejected).not.toContain(
      'interactionLanguage.primaryDrivers.0:interaction-property-not-observed(outline)',
    )
  })

  it('accepts an exact edge border-color property observed in the cited state change', () => {
    const interactionEvidence: DesignEvidence = {
      ...evidence,
      interactionObservations: [
        {
          id: 'interaction-hover-bottom-border',
          pageId: 'page-a',
          sectionId: 'section-a',
          targetId: 'target-a',
          driver: 'hover',
          safety: 'passive',
          trigger: { kind: 'css-pseudo' },
          before: { 'border-bottom-color': '#111827' },
          after: { 'border-bottom-color': '#2563eb' },
          changedProperties: ['border-bottom-color'],
          evidenceRefs: ['section-a'],
        },
      ],
    }
    const raw = rawProfile()
    raw.interactionLanguage.primaryDrivers = [
      {
        ...claim('Hover changes the observed border-bottom-color.'),
        implementation: 'Apply border-bottom-color only to the observed edge.',
        evidence: [{ evidenceId: 'interaction-hover-bottom-border', note: 'Observed hover state' }],
      },
    ]

    const validation = validateDesignProfile(raw, interactionEvidence, 'structural-only', 'en')

    expect(validation.rejected).not.toContain(
      'interactionLanguage.primaryDrivers.0:interaction-property-not-observed(border-color)',
    )
  })

  it('generates scoped context, reconstruction guidance, and layered validation checks', () => {
    const profile = validateDesignProfile(rawProfile(), evidence, 'structural-only', 'en').profile!
    const context = generateAgentContextBundle('Build a responsive article page', 'structural-ai', evidence, profile)
    const brief = generateReconstructionBrief(profile, evidence, tokens, {
      status: 'complete',
      capabilityLevel: 'structural-ai',
    })
    const report = validateRecipe(createValidationRecipe('states', profile, tokens), profile, tokens, 'structural-ai')

    expect(context.task).toContain('article')
    expect(context.tokenSubset['typography.font-size.1']).toBe('16px')
    expect(brief).toContain('do not copy source pages')
    expect(report.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining(['token-spacing', 'text-contrast', 'horizontal-overflow', 'reduced-motion']),
    )
    expect(report.checks.find((check) => check.id === 'text-contrast')?.status).toBe('passed')
  })

  it('uses a dominant practical spacing value for validation recipes', () => {
    const profile = validateDesignProfile(rawProfile(), evidence, 'structural-only', 'en').profile!
    const denseTokens: DesignToken = {
      ...tokens,
      spacing: ['1.5px', '8px', '16px'],
      usageCount: {
        'spacing:1.5px': 4_000,
        'spacing:8px': 100,
        'spacing:16px': 900,
      },
    }

    expect(createValidationRecipe('workflow', profile, denseTokens).root).toMatchObject({ gap: '16px' })
  })

  it('compares design language profiles', () => {
    const first = validateDesignProfile(rawProfile(), evidence, 'structural-only', 'en').profile!
    const secondRaw = rawProfile()
    secondRaw.thesis = claim('Compact repeated cards create a dense operational reading rhythm')
    const second = validateDesignProfile(secondRaw, evidence, 'structural-only', 'en').profile!
    const comparison = compareDesignProfiles(first, second)

    expect(comparison.thesisSimilarity).toBeLessThan(1)
    expect(comparison.evidenceGrounding.profileAReferences).toBeGreaterThan(0)
  })
})
