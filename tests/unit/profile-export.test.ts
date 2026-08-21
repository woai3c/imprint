import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import { generateDesignProfileMarkdown } from '../../src/core/design-context/profile-export.js'
import {
  generateReconstructionBrief,
  getReconstructionBriefEligibility,
} from '../../src/core/design-context/reconstruction-brief.js'
import type { DesignClaim, DesignProfile } from '../../src/core/design-context/types.js'
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

function claim(
  statement: string,
  confidence: DesignClaim['confidence'] = 'medium',
  evidenceId = 'section-main',
): DesignClaim {
  return {
    statement,
    implementation: `Implement ${statement.toLowerCase()}.`,
    confidence,
    evidence: [{ evidenceId, note: 'Observed evidence.' }],
    source: 'deterministic-catalog',
  }
}

function createProfile(): DesignProfile {
  const executedInteraction = claim(
    'Clicking the disclosure reveals its controlled content',
    'high',
    'interaction-main',
  )
  executedInteraction.assertions = [
    {
      kind: 'interaction',
      target: 'click',
      predicate: 'executed',
      scope: 'page',
      evidenceIds: ['interaction-main'],
    },
  ]
  return {
    schemaVersion: '2',
    language: 'en',
    claimSource: 'deterministic-catalog',
    catalogVersion: '1',
    thesis: claim('A compact left-aligned interface', 'high'),
    signatureMoves: [
      {
        ...claim('Outlined primary actions use compact rounded corners', 'high', 'component-main'),
        id: 'signature-primary-action',
        name: 'Primary action',
        distinctiveness: 'Repeated across the observed pages.',
      },
    ],
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
    sectionGrammar: [
      {
        role: 'content',
        composition: [claim('Content sections use flow layout', 'high')],
        contentRhythm: [],
        transitionToNext: [],
      },
    ],
    interactionLanguage: {
      primaryDrivers: [executedInteraction, claim('Hover changes the background color', 'medium', 'interaction-main')],
      feedbackStyle: claim('Immediate state feedback'),
      stateChangeAmplitude: claim('Small state changes'),
      continuityRules: [],
    },
    componentGrammar: [
      {
        component: 'button',
        role: 'primary-action',
        rules: [
          {
            ...claim('Primary buttons use a rounded outlined treatment', 'high', 'component-main'),
            tokenRefs: ['color.primary', 'radius.1'],
          },
        ],
      },
    ],
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
  components: [{ id: 'component-main', pageId: 'page-main' }],
  layoutNodes: [],
  interactionObservations: [{ id: 'interaction-main', pageId: 'page-main' }],
  mediaLayers: [],
  topology: { globalLayers: [] },
} as unknown as DesignEvidence

describe('deterministic profile export', () => {
  it('identifies the deterministic boundary and never exposes local screenshot paths', () => {
    const markdown = generateDesignProfileMarkdown(createProfile(), tokens, new Map(), evidence)

    expect(markdown).toContain('## Key Observations')
    expect(markdown).toContain('This document is self-contained for design reconstruction')
    expect(markdown).toContain(
      'A bounded content container _(high confidence · evidence refs: 1 · scope: example.com/ · desktop)_',
    )
    expect(markdown).toContain('Primary buttons use a rounded outlined treatment')
    expect(markdown).toContain('Related tokens: `color.primary` (#2563eb), `radius.1` (8px)')
    expect(markdown).toContain('Content sections use normal document flow layout')
    expect(markdown).toContain('Clicking the disclosure reveals its controlled content')
    expect(markdown).not.toContain('design-evidence.json')
    expect(markdown).not.toContain('section-main')
    expect(markdown).not.toContain('component-main')
    expect(markdown).not.toContain('interaction-main')
    expect(markdown).not.toContain('Cited Evidence Index')
    expect(markdown).not.toContain('Validated assertions')
    expect(markdown).not.toContain('Token refs')
    expect(markdown).not.toContain('C:\\private')
    expect(markdown).not.toMatch(/AI-authored|provider|model/i)
  })

  it('omits related token references that are absent from the exported token set', () => {
    const profile = createProfile()
    profile.componentGrammar[0].rules[0].tokenRefs?.push('color.palette-11')

    const markdown = generateDesignProfileMarkdown(profile, tokens, new Map(), evidence)

    expect(markdown).toContain('Related tokens: `color.primary` (#2563eb), `radius.1` (8px)')
    expect(markdown).not.toContain('color.palette-11')
  })

  it('keeps high-value facts without restoring the full claim catalog', () => {
    const markdown = generateDesignProfileMarkdown(createProfile())

    expect(markdown).toContain('Outlined primary actions use compact rounded corners')
    expect(markdown).toContain('A bounded content container')
    expect(markdown).toContain('Primary buttons use a rounded outlined treatment')
    expect(markdown).toContain('Clicking the disclosure reveals its controlled content')
    expect(markdown).toContain('Flat surfaces')
    expect(markdown).not.toContain('A restrained blue palette')
    expect(markdown).toContain('Primary actions use the primary color')
    expect(markdown).not.toContain('Hover changes the background color')
    expect(markdown).not.toContain('Immediate state feedback')
    expect(markdown).toContain('Preserve the compact rhythm')
  })

  it('deduplicates one catalog fact rendered through multiple profile placements', () => {
    const profile = createProfile()
    profile.signatureMoves[0].catalogId = 'shared-primary-action'
    profile.componentGrammar[0].rules[0].catalogId = 'shared-primary-action'

    const markdown = generateDesignProfileMarkdown(profile)

    expect(markdown).toContain('Outlined primary actions use compact rounded corners')
    expect(markdown).not.toContain('Primary buttons use a rounded outlined treatment')
  })

  it('merges equivalent visible claims in the same category and scope without dropping evidence', () => {
    const profile = createProfile()
    const statement = 'The feature group changes section order from desktop to mobile'
    profile.transferRules.adapt = [
      { ...claim(statement, 'medium', 'section-main'), catalogId: 'responsive-feature-first' },
      { ...claim(statement, 'medium', 'image-main'), catalogId: 'responsive-feature-second' },
    ]

    const markdown = generateDesignProfileMarkdown(profile, tokens, new Map(), evidence)

    expect(markdown.match(new RegExp(statement, 'g'))).toHaveLength(1)
    expect(markdown).toContain('evidence refs: 2 · scope: example.com/ · desktop')
  })

  it('summarizes identical section layouts only when their complete route and viewport scope matches', () => {
    const profile = createProfile()
    const scopedEvidence = structuredClone(evidence)
    scopedEvidence.pages.push({
      ...structuredClone(scopedEvidence.pages[0]),
      id: 'page-secondary',
      url: 'https://example.com/secondary',
      images: [{ id: 'image-secondary', kind: 'overview', path: 'secondary.png', width: 1440, height: 900 }],
    })
    scopedEvidence.sections.push(
      {
        ...structuredClone(scopedEvidence.sections[0]),
        id: 'section-header',
        role: 'header',
      },
      {
        ...structuredClone(scopedEvidence.sections[0]),
        id: 'section-aside',
        pageId: 'page-secondary',
        role: 'aside',
        evidenceRefs: ['image-secondary'],
      },
    )
    const layoutClaim = (role: string, evidenceId: string, statement: string): DesignClaim => ({
      ...claim(statement, 'high', evidenceId),
      assertions: [
        {
          kind: 'section',
          target: role,
          predicate: 'layout-mode',
          scope: 'page',
          evidenceIds: [evidenceId],
          value: 'flow',
        },
      ],
    })
    profile.sectionGrammar = [
      {
        role: 'content',
        composition: [layoutClaim('content', 'section-main', 'Content sections use flow layout')],
        contentRhythm: [],
        transitionToNext: [],
      },
      {
        role: 'header',
        composition: [layoutClaim('header', 'section-header', 'Header sections use flow layout')],
        contentRhythm: [],
        transitionToNext: [],
      },
      {
        role: 'aside',
        composition: [layoutClaim('aside', 'section-aside', 'Aside sections use flow layout')],
        contentRhythm: [],
        transitionToNext: [],
      },
    ]

    const markdown = generateDesignProfileMarkdown(profile, tokens, new Map(), scopedEvidence)

    expect(markdown).toContain('**Layout:** content, header sections share the same normal document flow layout.')
    expect(markdown).toContain('**aside:** Aside sections use normal document flow layout')
    expect(markdown).not.toContain('Content sections use normal document flow layout')
    expect(markdown).not.toContain('Header sections use normal document flow layout')
  })

  it('renders localized technical terms and privacy-safe human-readable scope', () => {
    const profile = createProfile()
    profile.language = 'zh-CN'
    profile.interactionLanguage.primaryDrivers[0].statement =
      '1 个已观察的 safe-active click 状态会改变这些属性：ariaExpanded。'
    profile.visualLanguage.surfaces = claim(
      'desktop -> mobile reflow：childGridTemplateColumns、sequenceIndex、node.heading.fontSize。',
      'high',
    )
    const localizedEvidence = {
      ...evidence,
      pages: evidence.pages.map((page) => ({
        ...page,
        url: 'https://user:private@example.com/private?token=secret#panel',
      })),
    } as DesignEvidence

    const markdown = generateDesignProfileMarkdown(profile, tokens, new Map(), localizedEvidence)

    expect(markdown).toContain('实际执行点击状态')
    expect(markdown).toContain('桌面端 → 移动端布局重排：子级网格列、区块顺序、标题字号。')
    expect(markdown).toContain('范围：example.com/private · 桌面端')
    expect(markdown).not.toContain('safe-active')
    expect(markdown).not.toContain('childGridTemplateColumns')
    expect(markdown).not.toContain('sequenceIndex')
    expect(markdown).not.toContain('node.heading.fontSize')
    expect(markdown).not.toContain('private@example.com')
    expect(markdown).not.toContain('token=secret')
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

    expect(getReconstructionBriefEligibility(profile)).toEqual({ eligible: true })
    expect(generateReconstructionBrief(profile, evidence, tokens)).toContain('# Reconstruction Brief')

    profile.thesis = claim('Uncertain thesis', 'low')
    expect(getReconstructionBriefEligibility(profile)).toEqual({
      eligible: false,
      reason: 'low-confidence-thesis',
    })
    expect(generateReconstructionBrief(profile, evidence, tokens)).toBeNull()
  })

  it('rejects profiles without reliable transfer directives', () => {
    const profile = createProfile()
    profile.transferRules.preserve = []
    expect(getReconstructionBriefEligibility(profile)).toEqual({
      eligible: false,
      reason: 'preserve-directive-missing',
    })

    profile.transferRules.preserve = [claim('Preserve rhythm', 'high')]
    profile.transferRules.avoid = []
    expect(getReconstructionBriefEligibility(profile)).toEqual({
      eligible: false,
      reason: 'avoid-directive-missing',
    })
  })
})
