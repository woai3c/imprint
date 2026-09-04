import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import {
  buildDeterministicClaimCatalog,
  validateDesignClaimCatalog,
} from '../../src/core/design-context/claim-catalog.js'
import { formatRecipeVariant } from '../../src/core/design-context/component-recipe-label.js'
import { createDeterministicDesignContext } from '../../src/core/design-context/deterministic-context.js'
import {
  generateDesignProfileMarkdown,
  generateTransferBoundariesMarkdown,
  generateTransferComponentsMarkdown,
  generateTransferOverviewMarkdown,
} from '../../src/core/design-context/profile-export.js'
import { isCurrentDesignProfile } from '../../src/core/design-context/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import { buildComponentSpecs } from '../../src/core/export/component-specs.js'
import { generateDesignDoc, validateDesignDocSemantics } from '../../src/core/export/index.js'

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

function createEvidence(): DesignEvidence {
  return {
    schemaVersion: '1',
    analysisId: 'analysis-test',
    source: {
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
    },
    pages: [
      {
        id: 'page-desktop',
        url: 'https://example.com/',
        viewport: 'desktop',
        role: 'landing',
        images: [{ id: 'image-desktop', kind: 'overview', path: 'capture.png', width: 1440, height: 1600 }],
      },
      {
        id: 'page-mobile',
        url: 'https://example.com/',
        viewport: 'mobile',
        role: 'landing',
        images: [{ id: 'image-mobile', kind: 'overview', path: 'mobile.png', width: 375, height: 1200 }],
      },
    ],
    tokens,
    featureTags: ['responsive'],
    topology: {
      schemaVersion: '1',
      pages: [
        { pageId: 'page-desktop', role: 'landing', sectionIds: ['section-desktop'] },
        { pageId: 'page-mobile', role: 'landing', sectionIds: ['section-mobile'] },
      ],
      globalLayers: [],
      crossPagePatternIds: [],
    },
    sections: [
      {
        id: 'section-desktop',
        pageId: 'page-desktop',
        order: 0,
        role: 'hero',
        rect: { x: 0, y: 0, width: 1, height: 0.6 },
        layoutMode: 'flow',
        tokenRefs: ['color.background', 'spacing.2'],
        componentRefs: ['component-primary'],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: ['image-desktop'],
      },
      {
        id: 'section-mobile',
        pageId: 'page-mobile',
        order: 0,
        role: 'hero',
        rect: { x: 0, y: 0, width: 1, height: 0.8 },
        layoutMode: 'flow',
        tokenRefs: ['color.background', 'spacing.1'],
        componentRefs: [],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: ['image-mobile'],
      },
    ],
    components: [
      {
        id: 'component-primary',
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        type: 'button',
        rect: { x: 0.1, y: 0.3, width: 0.2, height: 0.05 },
        styles: { backgroundColor: '#2563eb', borderRadius: '12px' },
        tokenRefs: ['color.primary', 'radius.1'],
        stateRefs: [],
        confidence: 0.95,
        evidenceRefs: ['section-desktop', 'image-desktop'],
      },
    ],
    layoutNodes: [],
    interactionStyles: { hover: [], focus: [], active: [] },
    interactionObservations: [],
    breakpoints: [],
    responsiveObservations: [
      {
        id: 'responsive-hero',
        sectionId: 'section-desktop',
        fromViewport: 'desktop',
        toViewport: 'mobile',
        changeType: 'reflow',
        changedProperties: ['width'],
        summary: 'Hero narrows on mobile.',
        evidenceRefs: ['section-desktop', 'section-mobile'],
      },
    ],
    motion: [],
    mediaLayers: [],
    coverage: {
      pageCoverage: 'complete',
      sectionCoverage: 1,
      viewportCoverage: ['desktop', 'mobile'],
      interactionCoverage: { candidates: 0, safelyObserved: 0, skipped: 0 },
      mediaCoverage: { majorRegions: 0, classifiedRegions: 0, iconRegions: 0 },
      accessRestrictions: [],
      limitations: [],
    },
    limitations: [],
  }
}

describe('deterministic design context', () => {
  it('returns identical program-owned output for identical evidence', () => {
    const first = createDeterministicDesignContext(createEvidence(), 'en')
    const second = createDeterministicDesignContext(createEvidence(), 'en')

    expect(second).toEqual(first)
    expect(first.profile.claimSource).toBe('deterministic-catalog')
    expect(first.profile.schemaVersion).toBe('3')
    expect(first.profile.transferGrammar).toMatchObject({ schemaVersion: '1' })
    expect(JSON.stringify(first)).not.toMatch(/provider|apiKey|prompt|modelId|capabilityLevel|inputMode/i)
  })

  it('requires both the current profile schema and transfer grammar when restoring a profile', () => {
    const profile = createDeterministicDesignContext(createEvidence(), 'en').profile

    expect(isCurrentDesignProfile(profile)).toBe(true)
    expect(isCurrentDesignProfile({ ...profile, schemaVersion: '2' })).toBe(false)
    expect(isCurrentDesignProfile({ ...profile, transferGrammar: undefined })).toBe(false)
  })

  it('rejects positional API misuse from untyped JavaScript callers with a clear error', () => {
    expect(() => createDeterministicDesignContext(createEvidence(), tokens as unknown as 'en')).toThrow(
      'Unsupported deterministic design context language',
    )
  })

  it('keeps one-page foundations and a singleton button local', () => {
    const evidence = createEvidence()
    evidence.layoutNodes = [
      {
        id: 'text-body',
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        role: 'body',
        rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
        textRole: 'body',
        tokenRefs: ['typography.font-size.1', 'typography.font-weight.1'],
        observedTypography: { fontSize: '16px', fontWeight: '400' },
        traits: [],
      },
    ]
    const context = createDeterministicDesignContext(evidence, 'en')
    const grammar = context.profile.transferGrammar!

    expect(grammar.coreRules).toEqual([])
    expect(grammar.styleCoordinates.every((coordinate) => coordinate.priority === 'P2')).toBe(true)
    expect(grammar.styleCoordinates.map((coordinate) => coordinate.dimension)).toEqual([
      'color',
      'typography',
      'shape',
      'surface',
      'density',
      'composition',
    ])
    expect(grammar.componentRecipes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component: 'button',
          variant: 'action',
          priority: 'P2',
          useWhen: 'action',
          confidence: 'low',
          matchingStyleInstances: 1,
          responsive: [],
        }),
      ]),
    )
    expect(grammar.localRules.length).toBeGreaterThan(0)
  })

  it('describes pill geometry from component evidence even when its radius is part of the ordinary scale', () => {
    const evidence = createEvidence()
    evidence.pages[0].viewportHeight = 1_000
    evidence.components[0] = {
      ...evidence.components[0],
      rect: { ...evidence.components[0].rect, height: 0.032 },
      styles: { ...evidence.components[0].styles, borderRadius: '16px' },
    }

    const shape = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.styleCoordinates.find(
      (coordinate) => coordinate.dimension === 'shape',
    )

    expect(shape?.claim.statement).toContain('Component evidence also contains pill or circular treatments')
    expect(shape?.claim.statement).not.toContain('No pill or circular treatment was observed')
  })

  it('labels a semantically primary low-emphasis button without calling its purpose secondary', () => {
    const evidence = createEvidence()
    const component = {
      ...structuredClone(evidence.components[0]),
      role: 'primary-action',
      styles: {
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderRadius: '12px',
        padding: '8px',
      },
      tokenRefs: ['color.primary', 'radius.1', 'spacing.1', 'typography.font-weight.1'],
    }
    evidence.components = [
      { ...structuredClone(component), id: 'component-low-emphasis-first' },
      { ...structuredClone(component), id: 'component-low-emphasis-second' },
    ]

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const recipe = profile.transferGrammar!.componentRecipes.find((candidate) => candidate.component === 'button')
    const markdown = generateTransferComponentsMarkdown(profile, tokens, new Map(), evidence)

    expect(recipe).toMatchObject({ variant: 'action', useWhen: 'primary-action', priority: 'P1' })
    expect(markdown).toContain('#### button · action')
    expect(markdown).toContain('the target needs its principal action')
    expect(markdown).not.toContain('#### button · secondary')
  })

  it('keeps link semantics separate from a button-like visual treatment in component recipes', () => {
    const evidence = createEvidence()
    const anchor = {
      ...structuredClone(evidence.components[0]),
      elementKind: 'anchor' as const,
      role: 'navigation',
      semanticIdentity: 'link' as const,
      visualTreatment: 'button-like' as const,
      usageContext: 'navigation' as const,
      textStyleOwner: 'root' as const,
      styles: {
        backgroundColor: '#2563eb',
        color: '#ffffff',
        borderRadius: '12px',
        height: '40px',
        padding: '8px 16px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        fontWeight: '700',
        lineHeight: '24px',
      },
      tokenRefs: [
        'color.primary',
        'radius.1',
        'spacing.1',
        'typography.font-stack.1',
        'typography.font-size.1',
        'typography.font-weight.2',
      ],
    }
    evidence.components = [
      { ...structuredClone(anchor), id: 'component-link-first' },
      { ...structuredClone(anchor), id: 'component-link-second' },
    ]

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const recipe = profile.transferGrammar!.componentRecipes.find((candidate) => candidate.component === 'button')!
    const componentSpec = buildComponentSpecs(evidence).find((candidate) => candidate.variant === recipe.variant)
    const markdown = generateTransferComponentsMarkdown(profile, tokens, new Map(), evidence)
    const zhProfile = createDeterministicDesignContext(evidence, 'zh-CN').profile
    const zhMarkdown = generateTransferComponentsMarkdown(zhProfile, tokens, new Map(), evidence)

    expect(recipe).toMatchObject({
      component: 'button',
      priority: 'P1',
      useWhen: 'navigation',
      semanticIdentity: 'link',
      visualTreatment: 'button-like',
      usageContext: 'navigation',
    })
    expect(componentSpec).toMatchObject({
      semanticIdentity: 'link',
      visualTreatment: 'button-like',
      usageContext: 'navigation',
    })
    expect(markdown).toContain('#### button-like link ·')
    expect(markdown).toContain('the target needs navigation or scope switching')
    expect(markdown).toContain('identity: link, visual treatment: button-like, context: navigation')
    expect(markdown).toContain('Preserve link/anchor semantics and URL behavior')
    expect(zhMarkdown).toContain('#### 按钮式链接 ·')
    expect(zhMarkdown).toContain('身份：链接、视觉处理：按钮式、场景：导航')
    expect(zhMarkdown).toContain('保留链接/锚点语义和 URL 行为')
  })

  it('keeps compound semantic variants intact when visual suffixes are present', () => {
    const translated = new Map([
      ['primary-action-low-emphasis', 'Primary action · low emphasis'],
      ['rounded', 'Rounded'],
      ['tinted', 'Tinted'],
    ])

    expect(
      formatRecipeVariant(
        { component: 'button', useWhen: 'primary-action', variant: 'secondary-rounded-tinted' },
        {
          translateKnown: (term) => translated.get(term) || null,
          translateFallback: (term) => term,
          formatRadius: (value) => `${value}px radius`,
          separator: ' · ',
        },
      ),
    ).toBe('Primary action · low emphasis · Rounded · Tinted')
  })

  it('renders recipe token names without duplicating values already defined in token sections', () => {
    const evidence = createEvidence()
    evidence.tokens = {
      ...structuredClone(tokens),
      borders: ['1px solid #2563eb', '1px solid #d1d5db'],
    }
    evidence.components[0].styles.border = '1px solid #2563eb'
    evidence.components[0].tokenRefs = [...evidence.components[0].tokenRefs, 'border.1']
    evidence.components.push({
      ...structuredClone(evidence.components[0]),
      id: 'component-primary-repeat',
    })
    const allCaptureTokens = {
      ...structuredClone(tokens),
      borders: ['1px solid #d1d5db', '1px solid #2563eb'],
    }

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const markdown = generateTransferComponentsMarkdown(profile, allCaptureTokens, new Map(), evidence)

    expect(markdown).toContain('`border.1`')
    expect(markdown).not.toContain('`border.1` (')
    expect(markdown).not.toContain('1px solid #d1d5db')
  })

  it('fails before profile generation or export when token references are dangling', () => {
    const evidence = createEvidence()
    evidence.components[0].tokenRefs = ['border.99']

    expect(() => createDeterministicDesignContext(evidence, 'en')).toThrow(
      'Design Evidence token reference integrity failed',
    )
  })

  it('blocks DESIGN.md export when a persisted profile contains a dangling token reference', () => {
    const evidence = createEvidence()
    const profile = createDeterministicDesignContext(evidence, 'en').profile
    profile.transferGrammar!.componentRecipes[0].observed.tokenRefs = ['border.99']

    expect(() =>
      generateDesignDoc(tokens, evidence.source.requestedUrl, [], undefined, [], [], 'en', evidence, profile),
    ).toThrow('Design Profile token reference integrity failed')
  })

  it('blocks a resolvable profile token when the cited evidence does not own that token', () => {
    const evidence = createEvidence()
    const profile = createDeterministicDesignContext(evidence, 'en').profile
    profile.transferGrammar!.componentRecipes[0].observed.tokenRefs = ['color.foreground']

    expect(() =>
      generateDesignDoc(tokens, evidence.source.requestedUrl, [], undefined, [], [], 'en', evidence, profile),
    ).toThrow('token-ref-without-cited-owner(color.foreground)')
  })

  it('prints common P1 boundaries once instead of repeating them in every recipe', () => {
    const evidence = createEvidence()
    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const markdown = generateTransferComponentsMarkdown(profile, tokens, new Map(), evidence)

    expect(markdown.match(/Keep each treatment scoped to that component and variant/g)).toHaveLength(1)
    expect(markdown.match(/do not present an invented state as a source rule/g)).toHaveLength(1)
    expect(markdown).not.toContain('Keep the observed treatment scoped to this component and variant.')
    expect(markdown).not.toContain('No reliable state recipe was observed')
  })

  it('retains observed interaction and motion claims alongside responsive and composition facts', () => {
    const evidence = createEvidence()
    evidence.interactionObservations = [
      {
        id: 'interaction-active-click',
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        targetId: 'component-primary',
        driver: 'click',
        safety: 'safe-active',
        trigger: { kind: 'click' },
        before: { opacity: '1' },
        after: { opacity: '0.8' },
        changedProperties: ['opacity'],
        transition: { duration: '0.2s', properties: ['opacity'] },
        evidenceRefs: ['component-primary', 'image-desktop'],
      },
    ]
    evidence.components[0].stateRefs = ['interaction-active-click']
    evidence.sections[0].interactionRefs = ['interaction-active-click']
    evidence.responsiveObservations[0] = {
      ...evidence.responsiveObservations[0],
      changedProperties: ['layoutMode'],
      changes: { layoutMode: { from: 'grid', to: 'flow' } },
    }

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const statements = profile.transferGrammar!.localRules.map((item) => item.claim.statement)

    expect(statements).toEqual(expect.arrayContaining([expect.stringContaining('Executing click')]))
    expect(statements).toEqual(expect.arrayContaining([expect.stringContaining('Visible transitions were observed')]))
    expect(profile.transferGrammar!.localRules.map((item) => item.category)).toContain('responsive')
    const boundaries = generateTransferBoundariesMarkdown(profile, tokens, new Map(), evidence)
    expect(boundaries).toContain('Visible transitions were observed in 1 interaction states')
    expect(boundaries).not.toContain('interaction change states')
    expect(generateTransferOverviewMarkdown(profile, tokens, new Map(), evidence)).toContain(
      'These six lines show whether each dimension has enough cross-page support',
    )
  })

  it('retains motion when numerous interaction patterns compete for the local-rule limit', () => {
    const evidence = createEvidence()
    const drivers = ['hover', 'focus', 'click', 'disabled', 'scroll', 'time'] as const
    evidence.interactionObservations = Array.from({ length: 10 }, (_value, index) => ({
      id: `interaction-${index}`,
      pageId: 'page-desktop',
      sectionId: 'section-desktop',
      targetId: 'component-primary',
      driver: drivers[index % drivers.length],
      safety: index % 2 === 0 ? ('passive' as const) : ('safe-active' as const),
      trigger: { kind: drivers[index % drivers.length] },
      before: { [`property-${index}`]: 'before' },
      after: { [`property-${index}`]: 'after' },
      changedProperties: [`property-${index}`],
      transition: { duration: '0.2s', properties: [`property-${index}`] },
      evidenceRefs: ['component-primary', 'image-desktop'],
    }))

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const localRules = profile.transferGrammar!.localRules

    expect(profile.interactionLanguage.primaryDrivers.length).toBeGreaterThanOrEqual(4)
    expect(localRules.some((item) => item.claim.assertions?.some((assertion) => assertion.target === 'motion'))).toBe(
      true,
    )
  })

  it('requires repeated exact-style evidence even when a component has explicit semantics', () => {
    const evidence = createEvidence()
    const base = evidence.components[0]
    const add = (id: string, type: string, role?: string) => {
      evidence.components.push({
        ...structuredClone(base),
        id,
        type,
        role,
        ...(type === 'status'
          ? {
              statusBoundary: {
                strongVisualBoundary: true,
                paintedFill: true,
                paintedBorder: false,
                paintedShadow: false,
                directlyOwnedText: true,
                widthPx: 320,
                heightPx: 48,
                viewportWidth: 1440,
                viewportHeight: 900,
              },
            }
          : {}),
        tokenRefs: ['color.foreground', 'spacing.1'],
      })
    }
    add('tab-single', 'tab', 'tab')
    add('modal-single', 'modal', 'dialog')
    add('list-first', 'list')
    add('list-second', 'list')
    add('table-first', 'table')
    add('table-second', 'table')
    add('status-first', 'status', 'status-warning')
    add('status-second', 'status', 'status-warning')

    const recipes = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.componentRecipes

    expect(recipes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'tab', priority: 'P2', useWhen: 'tab-navigation' }),
        expect.objectContaining({ component: 'modal', priority: 'P2', useWhen: 'overlay-dialog' }),
        expect.objectContaining({ component: 'list', priority: 'P1', useWhen: 'content-collection' }),
        expect.objectContaining({ component: 'table', priority: 'P1', useWhen: 'structured-data' }),
        expect.objectContaining({ component: 'status', priority: 'P1', useWhen: 'status-feedback' }),
      ]),
    )
  })

  it('keeps a single list, table, or status treatment local when it has no independent repetition', () => {
    const evidence = createEvidence()
    const base = evidence.components[0]
    for (const [type, role] of [
      ['list', undefined],
      ['table', undefined],
      ['status', 'status-warning'],
    ] as const) {
      evidence.components.push({
        ...structuredClone(base),
        id: `${type}-single`,
        type,
        role,
        tokenRefs: ['color.foreground', 'spacing.1'],
      })
    }

    const recipes = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.componentRecipes

    for (const component of ['list', 'table', 'status']) {
      expect(recipes.find((recipe) => recipe.component === component)?.priority).toBe('P2')
    }
  })

  it('splits visually distinct component families before building conditional recipes', () => {
    const evidence = createEvidence()
    const base = evidence.components[0]
    evidence.components = [
      ...evidence.components,
      ...[
        ['text-sharp-first', '0px'],
        ['text-sharp-second', '0px'],
        ['text-rounded-first', '8px'],
        ['text-rounded-second', '8px'],
      ].map(([id, borderRadius]) => ({
        ...structuredClone(base),
        id,
        role: 'action',
        textStyleOwner: 'root' as const,
        styles: {
          backgroundColor: 'transparent',
          borderRadius,
          padding: '8px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
        },
        tokenRefs: ['color.foreground', 'spacing.1', 'typography.font-weight.1'],
      })),
    ]

    const recipes = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.componentRecipes
    const textRecipes = recipes.filter((recipe) => recipe.component === 'button' && recipe.variant.startsWith('text'))

    expect(textRecipes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variant: 'text-sharp-flat', sourceInstances: 2, priority: 'P1' }),
        expect.objectContaining({ variant: 'text-rounded-flat', sourceInstances: 2, priority: 'P1' }),
      ]),
    )
    expect(textRecipes).not.toEqual(expect.arrayContaining([expect.objectContaining({ variant: 'text' })]))
  })

  it('retains browser-clamped radii only as raw evidence, not reusable implementation guidance', () => {
    const evidence = createEvidence()
    const component = {
      ...structuredClone(evidence.components[0]),
      type: 'card' as const,
      styles: { backgroundColor: '#2563eb', borderRadius: '3.35544e+07px', padding: '8px' },
      tokenRefs: ['color.primary', 'radius.1', 'spacing.1'],
    }
    evidence.components = [
      { ...structuredClone(component), id: 'component-clamped-radius-first' },
      { ...structuredClone(component), id: 'component-clamped-radius-second' },
    ]

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const recipe = profile.transferGrammar!.componentRecipes.find((candidate) => candidate.priority === 'P1')!
    const spec = buildComponentSpecs(evidence)[0]
    const designDoc = generateDesignDoc(
      tokens,
      evidence.source.requestedUrl,
      [],
      undefined,
      [],
      [],
      'en',
      evidence,
      profile,
    )

    expect(recipe.variant).not.toContain('33554400')
    expect(recipe.observedStyles).not.toHaveProperty('borderRadius')
    expect(recipe.observed.tokenRefs).not.toContain('radius.1')
    expect(spec.styles).not.toHaveProperty('borderRadius')
    expect(designDoc).not.toContain('3.35544e+07px')
    expect(evidence.components[0].styles.borderRadius).toBe('3.35544e+07px')
  })

  it('keeps ordinary links with transparent borders out of reusable button contracts', () => {
    const evidence = createEvidence()
    const link = {
      ...structuredClone(evidence.components[0]),
      elementKind: 'anchor' as const,
      semanticIdentity: 'link' as const,
      visualTreatment: 'button-like' as const,
      usageContext: 'article' as const,
      textStyleOwner: 'root' as const,
      styles: {
        backgroundColor: 'rgba(0, 0, 0, 0)',
        border: '1px solid rgba(0, 0, 0, 0)',
        borderRadius: '4px',
        color: '#2563eb',
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        fontWeight: '400',
        height: '31px',
        lineHeight: '24px',
        padding: '0px 0px 0px 0px',
      },
      tokenRefs: ['color.primary', 'radius.1', 'typography.font-size.1'],
    }
    evidence.components = [
      { ...structuredClone(link), id: 'ordinary-link-first' },
      { ...structuredClone(link), id: 'ordinary-link-second' },
    ]

    const recipes = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.componentRecipes

    expect(recipes.find((recipe) => recipe.component === 'button')?.priority).toBe('P2')
    expect(buildComponentSpecs(evidence)).toEqual([])
  })

  it('keeps content-sized and compound-control geometry in raw evidence instead of portable recipes', () => {
    const evidence = createEvidence()
    const repeated = (
      id: string,
      type: 'navigation' | 'input',
      styles: Record<string, string>,
      semanticIdentity: 'navigation' | 'input' | 'search',
      usageContext: 'navigation' | 'form' | 'search',
    ) =>
      Array.from({ length: 2 }, (_value, index) => ({
        id: `${id}-${index}`,
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        type,
        ...(type === 'input' ? { role: semanticIdentity === 'search' ? 'searchbox' : 'textbox' } : {}),
        elementKind: type === 'input' ? ('input' as const) : ('nav' as const),
        semanticIdentity,
        visualTreatment: type === 'input' ? ('filled' as const) : ('structural' as const),
        usageContext,
        textStyleOwner: type === 'input' ? ('root' as const) : undefined,
        rect: { x: 0.1, y: 0.1 + index * 0.1, width: 0.5, height: type === 'input' ? 0.02 : 0.2 },
        styles,
        tokenRefs: ['color.background', 'spacing.1', 'radius.1', 'typography.font-size.1'],
        stateRefs: [],
        confidence: 0.96,
        evidenceRefs: ['section-desktop', 'image-desktop'],
      }))
    const inputStyles = {
      backgroundColor: '#ffffff',
      color: '#111827',
      borderRadius: '12px',
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      fontWeight: '400',
      height: '32px',
    }
    evidence.components = [
      ...repeated(
        'navigation',
        'navigation',
        { backgroundColor: '#ffffff', boxShadow: 'rgb(0, 0, 0) 0px 1px 2px', height: '339px' },
        'navigation',
        'navigation',
      ),
      ...repeated('compound-input', 'input', { ...inputStyles, padding: '0px 85px 0px 12px' }, 'input', 'form'),
      ...repeated('ordinary-input', 'input', { ...inputStyles, padding: '8px 12px' }, 'input', 'form'),
      ...repeated('search-input', 'input', { ...inputStyles, padding: '6px 142px 6px 40px' }, 'search', 'search'),
    ]

    const specs = buildComponentSpecs(evidence)
    const navigation = specs.find((spec) => spec.component === 'navigation')!
    const compound = specs.find(
      (spec) => spec.component === 'input' && spec.semanticIdentity === 'input' && !spec.styles.padding,
    )!
    const ordinary = specs.find((spec) => spec.component === 'input' && spec.styles.padding?.includes('8px 12px'))!
    const search = specs.find((spec) => spec.semanticIdentity === 'search')!

    expect(navigation.styles).not.toHaveProperty('height')
    expect(compound.styles).not.toHaveProperty('padding')
    expect(ordinary.styles.padding).toEqual(['8px 12px'])
    expect(search.styles.padding).toEqual(['6px 142px 6px 40px'])
    expect(evidence.components.find((component) => component.id === 'navigation-0')?.styles.height).toBe('339px')
    expect(evidence.components.find((component) => component.id === 'compound-input-0')?.styles.padding).toBe(
      '0px 85px 0px 12px',
    )
  })

  it('requires every P1 recipe to satisfy the shared reuse gate and exact-style support', () => {
    const evidence = createEvidence()
    const repeated = structuredClone(evidence.components[0])
    evidence.components = Array.from({ length: 3 }, (_value, index) => ({
      ...structuredClone(repeated),
      id: `button-repeated-${index}`,
      role: index === 2 ? 'action' : 'primary-action',
      tokenRefs: ['color.primary', 'radius.1'],
    }))

    const recipes = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.componentRecipes
    const promoted = recipes.filter((recipe) => recipe.priority === 'P1')

    expect(promoted.length).toBeGreaterThan(0)
    for (const recipe of promoted) {
      expect(recipe.reuseConfidence).toBeGreaterThanOrEqual(0.55)
      expect(recipe.matchingStyleInstances).toBeGreaterThanOrEqual(2)
      expect(recipe.sourceInstances).toBeLessThanOrEqual(recipe.matchingStyleInstances || 0)
      expect(recipe.responsive).toEqual([])
    }
    expect(promoted.find((recipe) => recipe.component === 'button')?.useWhen).toBe('action')
  })

  it('uses one semantic component partition for profile recipes and component specs', () => {
    const evidence = createEvidence()
    const groups = [
      ['input', 'textbox', 'input-text'],
      ['input', 'searchbox', 'input-search'],
      ['input', 'combobox', 'input-combobox'],
      ['modal', 'dialog', 'modal-default'],
      ['modal', 'alertdialog', 'modal-alert'],
    ] as const
    evidence.components = groups.flatMap(([type, role, name], groupIndex) =>
      Array.from({ length: 2 }, (_value, index) => ({
        id: `${name}-${index + 1}`,
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        type,
        role,
        elementKind: type === 'input' ? ('input' as const) : undefined,
        rect: { x: 0.1, y: 0.1 + groupIndex * 0.08, width: 0.3, height: 0.05 },
        styles:
          type === 'input'
            ? {
                backgroundColor: '#ffffff',
                color: '#111827',
                border: '1px solid #d1d5db',
                borderRadius: '12px',
                padding: '8px 12px',
              }
            : {
                backgroundColor: '#ffffff',
                color: '#111827',
                borderRadius: '12px',
                padding: '24px',
              },
        tokenRefs: ['color.background', 'color.foreground', 'radius.1', 'spacing.1'],
        stateRefs: [],
        confidence: 0.96,
        evidenceRefs: ['section-desktop', 'image-desktop'],
      })),
    )
    evidence.sections[0].componentRefs = evidence.components.map((component) => component.id)

    const recipes = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.componentRecipes.filter(
      (recipe) => recipe.priority === 'P1' && ['input', 'modal'].includes(recipe.component),
    )
    const specs = buildComponentSpecs(evidence).filter((spec) => ['input', 'modal'].includes(spec.component))
    const recipeKeys = recipes.map((recipe) => `${recipe.component}-${recipe.variant}`).sort()
    const specKeys = specs.map((spec) => `${spec.component}-${spec.variant}`).sort()

    expect(recipeKeys).toEqual(['input-combobox', 'input-search', 'input-text', 'modal-alert', 'modal-default'])
    expect(specKeys).toEqual(recipeKeys)
    for (const recipe of recipes) {
      const spec = specs.find(
        (candidate) => candidate.component === recipe.component && candidate.variant === recipe.variant,
      )!
      expect(spec).toMatchObject({
        sourceInstances: recipe.matchingStyleInstances,
        pageCount: recipe.pageCount,
        identityConfidence: recipe.identityConfidence,
        reuseConfidence: recipe.reuseConfidence,
        reuseScope: recipe.reuseScope,
      })
      expect(
        Object.fromEntries(Object.entries(spec.styles).map(([property, values]) => [property, values[0]])),
      ).toEqual(recipe.observedStyles)
    }
  })

  it('shares a deterministic route-balanced evidence sample when a component has more than 24 matches', () => {
    const evidence = createEvidence()
    evidence.pages = Array.from({ length: 5 }, (_value, routeIndex) => ({
      id: `page-route-${routeIndex}`,
      url: `https://example.com/route-${routeIndex}`,
      viewport: 'desktop',
      role: 'content',
      images: [
        {
          id: `image-route-${routeIndex}`,
          kind: 'overview' as const,
          path: `route-${routeIndex}.png`,
          width: 1440,
          height: 1600,
        },
      ],
    }))
    evidence.sections = evidence.pages.map((page, routeIndex) => ({
      id: `section-route-${routeIndex}`,
      pageId: page.id,
      order: 0,
      role: 'content',
      rect: { x: 0, y: 0, width: 1, height: 1 },
      layoutMode: 'flow' as const,
      tokenRefs: [],
      componentRefs: Array.from({ length: 6 }, (_value, itemIndex) => `component-${routeIndex}-${itemIndex}`),
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: [page.images[0].id],
    }))
    evidence.components = evidence.pages.flatMap((page, routeIndex) =>
      Array.from({ length: 6 }, (_value, itemIndex) => ({
        id: `component-${routeIndex}-${itemIndex}`,
        pageId: page.id,
        sectionId: `section-route-${routeIndex}`,
        type: 'button' as const,
        role: 'action',
        rect: { x: 0.1, y: 0.1 + itemIndex * 0.05, width: 0.2, height: 0.04 },
        styles: { backgroundColor: '#2563eb', borderRadius: '12px', padding: '8px' },
        tokenRefs: ['color.primary', 'radius.1', 'spacing.1'],
        stateRefs: [],
        confidence: 0.96,
        evidenceRefs: [`section-route-${routeIndex}`, page.images[0].id],
      })),
    )
    evidence.topology.pages = evidence.pages.map((page, routeIndex) => ({
      pageId: page.id,
      role: 'content',
      sectionIds: [`section-route-${routeIndex}`],
    }))

    const projection = (source: DesignEvidence) => {
      const profile = createDeterministicDesignContext(source, 'en').profile
      const recipe = profile.transferGrammar!.componentRecipes.find((candidate) => candidate.priority === 'P1')!
      const spec = buildComponentSpecs(source)[0]
      return {
        recipe,
        spec,
        recipeRefs: recipe.observed.evidence.map((item) => item.evidenceId),
        specRefs: spec.evidenceRefs,
      }
    }
    const first = projection(evidence)
    const reordered = structuredClone(evidence)
    reordered.components.reverse()
    const second = projection(reordered)

    expect(first.recipe).toMatchObject({ sourceInstances: 30, pageCount: 5 })
    expect(first.spec).toMatchObject({ sourceInstances: 30, pageCount: 5 })
    expect(first.recipeRefs).toEqual(first.specRefs)
    expect(first.recipeRefs).toHaveLength(24)
    expect(new Set(first.specRefs.map((id) => id.split('-').slice(1, 2).join()))).toEqual(
      new Set(['0', '1', '2', '3', '4']),
    )
    expect(second.recipeRefs).toEqual(first.recipeRefs)
    expect(second.specRefs).toEqual(first.specRefs)
  })

  it('keeps the complete P1/P2 catalog while bounding and balancing DESIGN.md component details', () => {
    const evidence = createEvidence()
    const patternCounts = { button: 8, navigation: 4, list: 4, input: 3, card: 3 } as const
    evidence.components = Object.entries(patternCounts).flatMap(([type, count], typeIndex) =>
      Array.from({ length: count }, (_value, patternIndex) =>
        Array.from({ length: 2 }, (_match, matchIndex) => ({
          id: `${type}-${patternIndex}-${matchIndex}`,
          pageId: 'page-desktop',
          sectionId: 'section-desktop',
          type: type as 'button' | 'navigation' | 'list' | 'input' | 'card',
          role: type === 'navigation' ? 'navigation' : type === 'input' ? 'textbox' : 'action',
          rect: {
            x: 0.05 + typeIndex * 0.02,
            y: 0.05 + patternIndex * 0.025,
            width: 0.2,
            height: 0.03,
          },
          styles: {
            backgroundColor: patternIndex % 2 === 0 ? '#2563eb' : '#ffffff',
            color: '#8491a5',
            borderRadius: `${patternIndex + typeIndex + 1}px`,
            padding: `${patternIndex + typeIndex + 4}px`,
          },
          ...(type === 'button' || type === 'input' ? { textStyleOwner: 'root' as const } : {}),
          tokenRefs: ['color.primary', 'color.foreground', 'radius.1', 'spacing.1'],
          stateRefs: [],
          confidence: 0.96,
          evidenceRefs: ['section-desktop', 'image-desktop'],
        })),
      ).flat(),
    )
    evidence.components.push({
      ...structuredClone(evidence.components[0]),
      id: 'table-singleton',
      type: 'table',
      role: 'table',
      styles: { backgroundColor: '#ffffff' },
      tokenRefs: ['color.background'],
    })
    evidence.sections[0].componentRefs = evidence.components.map((component) => component.id)

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const recipes = profile.transferGrammar!.componentRecipes
    const p1Recipes = recipes.filter((recipe) => recipe.priority === 'P1')
    const p2Recipes = recipes.filter((recipe) => recipe.priority === 'P2')
    const specs = buildComponentSpecs(evidence)
    const markdown = generateTransferComponentsMarkdown(profile, tokens, new Map(), evidence)
    const boundaries = generateTransferBoundariesMarkdown(profile, tokens, new Map(), evidence)
    const designDoc = generateDesignDoc(
      tokens,
      evidence.source.requestedUrl,
      [],
      undefined,
      [],
      [],
      'en',
      evidence,
      profile,
    )
    const frontMatter = parse(designDoc.match(/^---\n([\s\S]*?)\n---/)?.[1] || '') as {
      components?: Record<string, unknown>
      'x-imprint': Array<{ componentSummary: Record<string, number>; candidates?: unknown }>
    }
    const renderedHeadings = [...markdown.matchAll(/^#### /gm)].length

    expect(p1Recipes).toHaveLength(22)
    expect(specs.map((spec) => `${spec.component}\u0000${spec.variant}`).sort()).toEqual(
      p1Recipes.map((recipe) => `${recipe.component}\u0000${recipe.variant}`).sort(),
    )
    expect(p2Recipes.some((recipe) => recipe.component === 'table')).toBe(true)
    expect(renderedHeadings).toBe(14)
    for (const component of Object.keys(patternCounts)) expect(markdown).toContain(`#### ${component} ·`)
    expect(markdown).toContain('8 additional reusable contract(s)')
    expect(boundaries).toContain('**table:** 1 local pattern(s)')
    expect(boundaries).not.toContain('None recorded.')
    expect(frontMatter['x-imprint'][0].componentSummary).toMatchObject({
      patterns: 23,
      reusablePatterns: 22,
      actionablePatterns: 22,
      renderedP1Patterns: 14,
      omittedP1Patterns: 8,
    })
    expect(frontMatter['x-imprint'][0].componentSummary).not.toHaveProperty('details')
    expect(Object.keys(frontMatter.components || {})).toHaveLength(14)
    const renderedComponentNames = new Set(Object.keys(frontMatter.components || {}))
    const contrastNames = [...designDoc.matchAll(/^- `([^`]+)`[:：] foreground/gm)].map((match) => match[1])
    expect(contrastNames.length).toBeGreaterThan(0)
    expect(contrastNames.every((name) => renderedComponentNames.has(name))).toBe(true)
  })

  it('preserves every exact-style distinction in both reusable component projections', () => {
    const evidence = createEvidence()
    const base = evidence.components[0]
    evidence.components = ['grid', 'inline-flex'].flatMap((display) =>
      Array.from({ length: 2 }, (_value, index) => ({
        ...structuredClone(base),
        id: `button-${display}-${index + 1}`,
        role: 'action',
        styles: {
          ...structuredClone(base.styles),
          display,
          alignItems: display === 'grid' ? 'stretch' : 'center',
        },
        tokenRefs: ['color.primary', 'radius.1', 'spacing.1'],
      })),
    )
    evidence.sections[0].componentRefs = evidence.components.map((component) => component.id)

    const recipes = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.componentRecipes.filter(
      (recipe) => recipe.component === 'button' && recipe.priority === 'P1',
    )
    const specs = buildComponentSpecs(evidence).filter((spec) => spec.component === 'button')

    expect(recipes).toHaveLength(2)
    expect(specs).toHaveLength(2)
    expect(new Set(recipes.map((recipe) => recipe.variant)).size).toBe(2)
    expect(recipes.map((recipe) => recipe.observedStyles.display).sort()).toEqual(['grid', 'inline-flex'])
    expect(recipes.map((recipe) => recipe.observedStyles.alignItems).sort()).toEqual(['center', 'stretch'])
    expect(specs.map((spec) => spec.styles.display?.[0]).sort()).toEqual(['grid', 'inline-flex'])
    expect(specs.map((spec) => spec.styles.alignItems?.[0]).sort()).toEqual(['center', 'stretch'])
    for (const recipe of recipes) {
      const spec = specs.find(
        (candidate) => candidate.component === recipe.component && candidate.variant === recipe.variant,
      )
      expect(spec).toBeDefined()
      expect(
        Object.fromEntries(Object.entries(spec!.styles).map(([property, values]) => [property, values[0]])),
      ).toEqual(recipe.observedStyles)
    }
  })

  it('keeps a repeated component group in P2 when its shared tokens do not describe structure', () => {
    const evidence = createEvidence()
    const base = evidence.components[0]
    evidence.components = Array.from({ length: 3 }, (_value, index) => ({
      ...structuredClone(base),
      id: `navigation-${index}`,
      type: 'navigation',
      role: 'navigation',
      styles: { backgroundColor: '#2563eb' },
      tokenRefs: ['color.foreground', 'typography.font-stack.1'],
    }))

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const recipe = profile.transferGrammar!.componentRecipes.find((candidate) => candidate.component === 'navigation')

    expect(recipe).toMatchObject({ priority: 'P2', sourceInstances: 3 })
    expect(generateTransferComponentsMarkdown(profile, tokens, new Map(), evidence)).not.toContain(
      'navigation · default',
    )
  })

  it('keeps useful responsive evidence at section scope instead of attaching it to a component', () => {
    const evidence = createEvidence()
    evidence.responsiveObservations = [
      {
        ...evidence.responsiveObservations[0],
        changedProperties: ['layoutMode', 'node.heading.fontSize'],
        changes: {
          layoutMode: { from: 'grid', to: 'flow' },
          'node.heading.fontSize': { from: '48px', to: '32px' },
        },
      },
    ]

    const profile = createDeterministicDesignContext(evidence, 'zh-CN').profile
    const recipe = profile.transferGrammar!.componentRecipes.find((candidate) => candidate.component === 'button')
    const markdown = generateTransferComponentsMarkdown(profile, tokens, new Map(), evidence)
    const boundaries = generateTransferBoundariesMarkdown(profile, tokens, new Map(), evidence)

    expect(recipe?.responsive).toEqual([])
    expect(markdown).not.toContain('标题字号')
    expect(boundaries).toContain('布局模式')
    expect(boundaries).toContain('标题字号')
    expect(boundaries).not.toContain('node.')
    expect(boundaries).not.toContain('变化变化')
  })

  it('localizes supported section-responsive properties in both exported languages', () => {
    const evidence = createEvidence()
    evidence.responsiveObservations[0] = {
      ...evidence.responsiveObservations[0],
      changedProperties: [
        'borderBottom',
        'boxShadow',
        'layoutMode',
        'node.heading.lineHeight',
        'node.heading.fontSize',
        'order',
        'position',
      ],
      changes: {
        borderBottom: { from: 'none', to: '1px solid #d1d5db' },
        boxShadow: { from: 'none', to: '0 4px 12px rgba(0, 0, 0, 0.16)' },
        layoutMode: { from: 'grid', to: 'flow' },
        'node.heading.fontSize': { from: '48px', to: '32px' },
        order: { from: '1', to: '2' },
        position: { from: 'static', to: 'sticky' },
      },
    }

    const chineseProfile = createDeterministicDesignContext(evidence, 'zh-CN').profile
    const chineseMarkdown = generateTransferBoundariesMarkdown(chineseProfile, tokens, new Map(), evidence)
    const englishProfile = createDeterministicDesignContext(evidence, 'en').profile
    const englishMarkdown = generateTransferBoundariesMarkdown(englishProfile, tokens, new Map(), evidence)

    for (const term of ['下边框', '阴影', '布局模式', '标题字号', '顺序', '定位']) {
      expect(chineseMarkdown).toContain(term)
    }
    expect(chineseMarkdown).not.toMatch(/borderBottom|boxShadow|layoutMode|node\.|fontSize/)
    for (const term of ['bottom border', 'shadow', 'layout mode', 'heading font size', 'order', 'position']) {
      expect(englishMarkdown).toContain(term)
    }
    expect(englishMarkdown).not.toMatch(/borderBottom|boxShadow|layoutMode|node\.|fontSize/)
  })

  it('does not reinterpret localized English surface prose as a responsive change type', () => {
    const evidence = createEvidence()
    evidence.tokens = {
      ...structuredClone(tokens),
      borders: ['1px solid #d1d5db'],
      shadows: ['0px 4px 12px rgba(0, 0, 0, 0.16)'],
    }
    evidence.pages[1] = {
      ...evidence.pages[1],
      id: 'page-secondary',
      url: 'https://example.com/secondary',
      images: [{ ...evidence.pages[1].images[0], id: 'image-secondary' }],
    }
    evidence.sections[1] = {
      ...evidence.sections[1],
      id: 'section-secondary',
      pageId: 'page-secondary',
      tokenRefs: ['color.background', 'shadow.1'],
      evidenceRefs: ['image-secondary'],
      observedStyles: {
        backgroundColor: '#ffffff',
        boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.16)',
      },
    }
    evidence.sections[0].tokenRefs = ['color.background', 'border.1']
    evidence.sections[0].observedStyles = {
      backgroundColor: '#ffffff',
      borders: { borderTop: '1px solid #d1d5db' },
    }

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const boundaries = generateTransferBoundariesMarkdown(profile, evidence.tokens, new Map(), evidence)

    expect(boundaries).toContain('mixed edge and depth')
    expect(boundaries).not.toContain('mixed layout change edge and depth')
  })

  it('keeps sampled surface guidance bounded and prints repeated P2 scope guidance once', () => {
    const evidence = createEvidence()
    evidence.sections.forEach((section) => {
      section.observedStyles = { backgroundColor: '#ffffff' }
    })
    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const surface = profile.transferGrammar!.styleCoordinates.find((coordinate) => coordinate.dimension === 'surface')
    const markdown = generateTransferBoundariesMarkdown(profile, tokens, new Map(), evidence)

    expect(surface?.claim.statement).toContain('does not describe every component or content group')
    expect(surface?.claim.implementation).not.toContain('keep flat content groups free of invented borders')
    expect(markdown.match(/Each fact below applies only to its cited capture scope/g)).toHaveLength(1)
    expect(markdown).not.toContain('Implementation: Apply this fact only within the cited capture scope')
  })

  it('requires visible base-surface evidence and a matching surface token before promotion to P0', () => {
    const evidence = createEvidence()
    evidence.pages[1].url = 'https://example.com/secondary'
    evidence.pages[1].id = 'page-secondary'
    evidence.pages[1].images[0].id = 'image-secondary'
    evidence.sections[1].pageId = 'page-secondary'
    evidence.sections[1].id = 'section-secondary'
    evidence.sections[1].evidenceRefs = ['image-secondary']
    evidence.components.push({
      ...structuredClone(evidence.components[0]),
      id: 'component-secondary',
      pageId: 'page-secondary',
      sectionId: 'section-secondary',
      evidenceRefs: ['section-secondary', 'image-secondary'],
    })
    evidence.sections.forEach((section) => {
      section.tokenRefs = ['color.background', 'spacing.1']
      section.observedStyles = { backgroundColor: 'rgba(0, 0, 0, 0)' }
    })

    const transparentSurface = createDeterministicDesignContext(
      evidence,
      'en',
    ).profile.transferGrammar!.styleCoordinates.find((coordinate) => coordinate.dimension === 'surface')

    expect(transparentSurface?.priority).toBe('P2')

    evidence.sections.forEach((section) => {
      section.tokenRefs = ['color.foreground', 'spacing.1']
      section.observedStyles = { backgroundColor: '#ffffff' }
    })
    const unrelatedColorSurface = createDeterministicDesignContext(
      evidence,
      'en',
    ).profile.transferGrammar!.styleCoordinates.find((coordinate) => coordinate.dimension === 'surface')

    expect(unrelatedColorSurface).toMatchObject({ priority: 'P2', claim: { tokenRefs: [] } })

    evidence.sections.forEach((section) => {
      section.tokenRefs = ['color.background', 'spacing.1']
    })
    const supportedSurface = createDeterministicDesignContext(
      evidence,
      'en',
    ).profile.transferGrammar!.styleCoordinates.find((coordinate) => coordinate.dimension === 'surface')

    expect(supportedSurface).toMatchObject({ priority: 'P0', claim: { tokenRefs: ['color.background'] } })
  })

  it('describes crisp inset separators as edge treatment instead of elevation shadows', () => {
    const evidence = createEvidence()
    evidence.tokens = {
      ...structuredClone(tokens),
      shadows: ['rgba(209, 217, 224, 0.7) 0px -1px 0px 0px inset'],
    }
    evidence.pages[1] = {
      ...evidence.pages[1],
      id: 'page-secondary',
      url: 'https://example.com/secondary',
      images: [{ ...evidence.pages[1].images[0], id: 'image-secondary' }],
    }
    evidence.sections[1] = {
      ...evidence.sections[1],
      id: 'section-secondary',
      pageId: 'page-secondary',
      evidenceRefs: ['image-secondary'],
    }
    evidence.sections.forEach((section) => {
      section.tokenRefs = ['color.background', 'shadow.1']
      section.observedStyles = {
        backgroundColor: '#ffffff',
        boxShadow: 'rgba(209, 217, 224, 0.7) 0px -1px 0px 0px inset',
      }
    })

    const surface = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.styleCoordinates.find(
      (coordinate) => coordinate.dimension === 'surface',
    )

    expect(surface).toMatchObject({ priority: 'P0', claim: { tokenRefs: ['color.background', 'shadow.1'] } })
    expect(surface?.claim.statement).toContain('2 use visible edge treatments and 0 use depth shadows')
    expect(surface?.claim.statement).toContain('edge-led')
    expect(surface?.claim.statement).not.toContain('shadow-led')
  })

  it('keeps a minority depth shadow out of the global surface guidance', () => {
    const evidence = createEvidence()
    const depthShadow = 'rgba(0, 0, 0, 0.18) 0px 8px 24px 0px'
    evidence.tokens = { ...structuredClone(tokens), shadows: [depthShadow] }
    evidence.pages[1] = {
      ...evidence.pages[1],
      id: 'page-secondary',
      url: 'https://example.com/secondary',
      viewport: 'desktop',
      images: [{ ...evidence.pages[1].images[0], id: 'image-secondary' }],
    }
    evidence.topology.pages[1] = {
      ...evidence.topology.pages[1],
      pageId: 'page-secondary',
      sectionIds: ['section-secondary'],
    }
    evidence.sections[0].tokenRefs = ['color.background', 'shadow.1']
    evidence.sections[0].observedStyles = { backgroundColor: '#ffffff', boxShadow: depthShadow }
    evidence.sections[1] = {
      ...evidence.sections[1],
      id: 'section-secondary',
      pageId: 'page-secondary',
      tokenRefs: ['color.background'],
      observedStyles: { backgroundColor: '#ffffff' },
      evidenceRefs: ['image-secondary'],
    }

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const surface = profile.transferGrammar!.styleCoordinates.find((coordinate) => coordinate.dimension === 'surface')
    const document = generateDesignDoc({
      tokens: evidence.tokens,
      url: evidence.source.requestedUrl,
      designEvidence: evidence,
      designProfile: profile,
    })

    expect(surface?.priority).toBe('P2')
    expect(document).toContain('depth shadows only on directly observed component variants')
    expect(document).not.toContain('Use elevation (shadows) to create visual hierarchy')
  })

  it('does not globalize a minority shadow merely because the mixed surface dimension is P0', () => {
    const evidence = createEvidence()
    const depthShadow = 'rgba(0, 0, 0, 0.18) 0px 8px 24px 0px'
    evidence.tokens = { ...structuredClone(tokens), shadows: [depthShadow] }
    evidence.pages[1] = {
      ...evidence.pages[1],
      id: 'page-secondary',
      url: 'https://example.com/secondary',
      viewport: 'desktop',
      images: [{ ...evidence.pages[1].images[0], id: 'image-secondary' }],
    }
    evidence.sections[0].tokenRefs = ['color.background', 'shadow.1']
    evidence.sections[0].observedStyles = { backgroundColor: '#ffffff', boxShadow: depthShadow }
    evidence.sections[1] = {
      ...evidence.sections[1],
      id: 'section-secondary',
      pageId: 'page-secondary',
      tokenRefs: ['color.background'],
      observedStyles: { backgroundColor: '#ffffff' },
      evidenceRefs: ['image-secondary'],
    }

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const surface = profile.transferGrammar!.styleCoordinates.find((coordinate) => coordinate.dimension === 'surface')!
    surface.priority = 'P0'
    surface.claim.tokenRefs = [...new Set([...(surface.claim.tokenRefs || []), 'shadow.1'])]

    const integrity = validateDesignDocSemantics(evidence.tokens, evidence, profile)
    const document = generateDesignDoc({
      tokens: evidence.tokens,
      url: evidence.source.requestedUrl,
      designEvidence: evidence,
      designProfile: profile,
    })

    expect(surface.claim.assertions).toContainEqual(
      expect.objectContaining({ property: 'observed-surface-counts', value: ['owners:2', 'bordered:0', 'shadowed:1'] }),
    )
    expect(integrity.surfaceShadowScope).toBe('component-only')
    expect(document).toContain('depth shadows only on directly observed component variants')
    expect(document).not.toContain('Use elevation (shadows) to create visual hierarchy')
  })

  it('rejects declared-only colors referenced by a P0 foundation claim', () => {
    const evidence = createEvidence()
    evidence.tokens = {
      ...structuredClone(tokens),
      colors: { ...tokens.colors, 'palette-1': '#7c3aed' },
      usageCount: {
        'declaredColor:rgb(124, 58, 237)': 2,
        'brandTokenColor:rgb(124, 58, 237)': 2,
      },
    }
    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const color = profile.transferGrammar!.styleCoordinates.find((coordinate) => coordinate.dimension === 'color')!
    color.priority = 'P0'
    color.claim.tokenRefs = ['color.palette-1']

    const integrity = validateDesignDocSemantics(evidence.tokens, evidence, profile)

    expect(integrity.valid).toBe(false)
    expect(integrity.errors).toContain(
      `foundation-claim:${color.claim.catalogId || 'uncataloged'}:declared-only-color(color.palette-1)`,
    )
  })

  it('prioritizes shared semantic color roles over earlier low-level observed colors', () => {
    const evidence = createEvidence()
    evidence.tokens = {
      ...structuredClone(tokens),
      colors: {
        background: '#ffffff',
        surface: '#f6f8fa',
        foreground: '#1f2328',
        'muted-foreground': '#59636e',
        primary: '#1f883d',
        accent: '#0969da',
        border: '#d1d9e0',
        'observed-1': '#111111',
        'observed-2': '#222222',
        'observed-3': '#333333',
        'observed-4': '#444444',
        'observed-5': '#555555',
        'observed-6': '#666666',
      },
    }
    evidence.pages[1] = {
      ...evidence.pages[1],
      id: 'page-secondary',
      url: 'https://example.com/secondary',
      images: [{ ...evidence.pages[1].images[0], id: 'image-secondary' }],
    }
    evidence.sections[1] = {
      ...evidence.sections[1],
      id: 'section-secondary',
      pageId: 'page-secondary',
      evidenceRefs: ['image-secondary'],
    }
    const sectionRefs = [
      'color.observed-1',
      'color.observed-2',
      'color.observed-3',
      'color.observed-4',
      'color.observed-5',
      'color.observed-6',
      'color.background',
      'color.surface',
      'color.foreground',
      'color.muted-foreground',
      'color.border',
    ]
    evidence.sections.forEach((section) => {
      section.tokenRefs = sectionRefs
    })
    evidence.components = evidence.sections.map((section, index) => ({
      ...structuredClone(evidence.components[0]),
      id: `component-color-${index}`,
      pageId: section.pageId,
      sectionId: section.id,
      tokenRefs: ['color.primary', 'color.accent'],
      evidenceRefs: [section.id, section.evidenceRefs[0]],
    }))

    const catalog = buildDeterministicClaimCatalog(evidence, 'en')
    const context = createDeterministicDesignContext(evidence, 'en')
    const color = context.profile.transferGrammar!.styleCoordinates.find(
      (coordinate) => coordinate.dimension === 'color',
    )
    const integrity = validateDesignClaimCatalog(catalog, evidence)

    expect(color).toMatchObject({
      priority: 'P0',
      claim: {
        tokenRefs: [
          'color.background',
          'color.surface',
          'color.foreground',
          'color.muted-foreground',
          'color.primary',
          'color.accent',
          'color.border',
        ],
      },
    })
    expect(color?.claim.statement).toContain(
      'page canvas, content surface, primary text, muted text, primary action, accent, border',
    )
    expect(integrity.errors.filter((error) => error.includes('token-ref-without-cited-owner'))).toEqual([])
  })

  it('orders the selected spacing rhythm by size after ranking values by observed frequency', () => {
    const evidence = createEvidence()
    evidence.tokens = {
      ...structuredClone(tokens),
      spacing: ['16px', '32px', '8px'],
      usageCount: {
        'spacing:16px': 90,
        'spacing:32px': 70,
        'spacing:8px': 50,
      },
    }
    evidence.pages[1].url = 'https://example.com/secondary'
    evidence.pages[1].id = 'page-secondary'
    evidence.pages[1].images[0].id = 'image-secondary'
    evidence.sections[1].pageId = 'page-secondary'
    evidence.sections[1].id = 'section-secondary'
    evidence.sections[1].evidenceRefs = ['image-secondary']
    evidence.sections.forEach((section) => {
      section.tokenRefs = ['spacing.1', 'spacing.2', 'spacing.3']
    })

    const density = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.styleCoordinates.find(
      (coordinate) => coordinate.dimension === 'density',
    )

    expect(density?.claim.statement).toContain('8px, 16px, 32px')
    expect(density?.claim.tokenRefs).toEqual(['spacing.3', 'spacing.1', 'spacing.2'])
  })

  it('localizes media kinds and unclassified roles before claims reach the UI or export', () => {
    const evidence = createEvidence()
    evidence.mediaLayers = [
      {
        id: 'media-background',
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        kind: 'css-background',
        role: 'decorative',
        importance: 'major',
        rect: { x: 0, y: 0, width: 1, height: 0.4 },
      },
      {
        id: 'media-video',
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        kind: 'video',
        role: 'unknown',
        importance: 'major',
        rect: { x: 0.1, y: 0.4, width: 0.8, height: 0.4 },
      },
    ]

    const catalog = buildDeterministicClaimCatalog(evidence, 'zh-CN')
    const imagery = catalog.claims.find((entry) =>
      entry.placements.some((placement) => placement.kind === 'visual' && placement.slot === 'imagery'),
    )

    expect(imagery?.claim.statement).toContain('类型包括 CSS 背景、视频，用途包括 装饰性、未分类')
    expect(imagery?.claim.statement).not.toContain('unknown')
  })

  it('promotes foundations only after evidence spans independent URLs and exports all priority layers', () => {
    const evidence = createEvidence()
    evidence.pages[1].url = 'https://example.com/secondary'
    evidence.pages[1].id = 'page-secondary'
    evidence.pages[1].images[0].id = 'image-secondary'
    evidence.sections[1].pageId = 'page-secondary'
    evidence.sections[1].id = 'section-secondary'
    evidence.sections[1].evidenceRefs = ['image-secondary']
    evidence.sections[0].tokenRefs = ['color.background', 'spacing.1', 'spacing.2']
    evidence.sections[1].tokenRefs = ['color.background', 'spacing.1', 'spacing.2']
    evidence.sections[0].observedStyles = { backgroundColor: '#ffffff' }
    evidence.sections[1].observedStyles = { backgroundColor: '#ffffff' }
    evidence.components.push({
      ...structuredClone(evidence.components[0]),
      id: 'component-secondary',
      pageId: 'page-secondary',
      sectionId: 'section-secondary',
      evidenceRefs: ['section-secondary', 'image-secondary'],
    })
    evidence.layoutNodes = [
      {
        id: 'text-primary',
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        role: 'body',
        rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
        textRole: 'body',
        tokenRefs: ['typography.font-stack.1', 'typography.font-size.1', 'typography.font-weight.1'],
        observedTypography: { fontSize: '16px', fontWeight: '400' },
        traits: [],
      },
      {
        id: 'text-secondary',
        pageId: 'page-secondary',
        sectionId: 'section-secondary',
        role: 'body',
        rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
        textRole: 'body',
        tokenRefs: ['typography.font-stack.1', 'typography.font-size.1', 'typography.font-weight.1'],
        observedTypography: { fontSize: '16px', fontWeight: '400' },
        traits: [],
      },
    ]
    const context = createDeterministicDesignContext(evidence, 'en')
    const grammar = context.profile.transferGrammar!
    const designDoc = generateDesignDoc(
      tokens,
      evidence.source.requestedUrl,
      [],
      undefined,
      [],
      [],
      'en',
      evidence,
      context.profile,
    )

    expect(grammar.coreRules.map((item) => item.category)).toEqual(
      expect.arrayContaining(['color', 'typography', 'shape', 'surface', 'density', 'composition']),
    )
    expect(grammar.styleCoordinates.every((coordinate) => coordinate.priority === 'P0')).toBe(true)
    const color = grammar.styleCoordinates.find((coordinate) => coordinate.dimension === 'color')
    expect(color?.claim.tokenRefs).toEqual(['color.background', 'color.primary'])
    expect(color?.claim.statement).toContain('page canvas, primary action')
    expect(color?.claim.statement).not.toMatch(/content surface|muted text|border roles/)
    expect(grammar.componentRecipes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'button', variant: 'action', priority: 'P1', sourceInstances: 2 }),
      ]),
    )
    expect(designDoc).toContain('### Design Transfer Guide')
    expect(designDoc).toContain('#### Core Design Rules')
    expect(designDoc).toContain('### Contextual Component Patterns')
    expect(designDoc).toContain('### Local Design Observations')
    expect(designDoc).toContain('### Unknowns and Coverage Gaps')
    expect(designDoc).toContain('- **Color:** Reusable core rule')
    expect(designDoc).not.toMatch(/^#{3,4} P[012]\b/m)
    expect(designDoc).not.toContain('## Key Observations')
  })

  it('keeps conflicting cross-page container widths out of P0 instead of inventing their median as a rule', () => {
    const evidence = createEvidence()
    evidence.pages[1].url = 'https://example.com/secondary'
    evidence.pages[1].id = 'page-secondary'
    evidence.pages[1].images[0].id = 'image-secondary'
    evidence.sections[0].rect.width = 0.2
    evidence.sections[1].pageId = 'page-secondary'
    evidence.sections[1].id = 'section-secondary'
    evidence.sections[1].rect.width = 1
    evidence.sections[1].evidenceRefs = ['image-secondary']

    const profile = createDeterministicDesignContext(evidence, 'en').profile
    const composition = profile.transferGrammar!.styleCoordinates.find(
      (coordinate) => coordinate.dimension === 'composition',
    )

    expect(composition?.priority).toBe('P2')
    expect(composition?.claim.statement).toContain('20% to 100%')
    expect(composition?.claim.statement).not.toContain('60%')
    expect(profile.transferGrammar!.coreRules).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'composition', claim: composition?.claim })]),
    )
  })

  it('keeps conflicting cross-page evidence local across every bounded style coordinate', () => {
    const evidence = createEvidence()
    evidence.tokens = {
      ...structuredClone(tokens),
      typography: {
        ...structuredClone(tokens.typography),
        fontStacks: ['Inter, sans-serif', 'Georgia, serif'],
      },
      radii: ['12px', '24px'],
      borders: ['1px solid #111827'],
    }
    evidence.pages[1].url = 'https://example.com/secondary'
    evidence.pages[1].id = 'page-secondary'
    evidence.pages[1].images[0].id = 'image-secondary'
    evidence.sections[0].rect.width = 0.2
    evidence.sections[0].tokenRefs = ['color.background', 'spacing.1']
    evidence.sections[1].pageId = 'page-secondary'
    evidence.sections[1].id = 'section-secondary'
    evidence.sections[1].rect.width = 1
    evidence.sections[1].tokenRefs = ['color.foreground', 'spacing.2']
    evidence.sections[1].evidenceRefs = ['image-secondary']
    evidence.components.push({
      ...structuredClone(evidence.components[0]),
      id: 'component-secondary',
      pageId: 'page-secondary',
      sectionId: 'section-secondary',
      styles: { backgroundColor: '#111827', border: '1px solid #111827', borderRadius: '24px' },
      tokenRefs: ['color.foreground', 'radius.2', 'border.1'],
      evidenceRefs: ['section-secondary', 'image-secondary'],
    })
    evidence.layoutNodes = [
      {
        id: 'text-primary',
        pageId: 'page-desktop',
        sectionId: 'section-desktop',
        role: 'body',
        rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
        textRole: 'body',
        tokenRefs: ['typography.font-stack.1', 'typography.font-size.1'],
        observedTypography: { fontFamily: 'Inter, sans-serif', fontSize: '16px' },
        traits: [],
      },
      {
        id: 'text-secondary',
        pageId: 'page-secondary',
        sectionId: 'section-secondary',
        role: 'body',
        rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
        textRole: 'body',
        tokenRefs: ['typography.font-stack.2', 'typography.font-size.2'],
        observedTypography: { fontFamily: 'Georgia, serif', fontSize: '32px' },
        traits: [],
      },
    ]

    const grammar = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!

    expect(grammar.styleCoordinates.map((coordinate) => [coordinate.dimension, coordinate.priority])).toEqual([
      ['color', 'P2'],
      ['typography', 'P2'],
      ['shape', 'P2'],
      ['surface', 'P2'],
      ['density', 'P2'],
      ['composition', 'P2'],
    ])
    for (const coordinate of grammar.styleCoordinates) {
      expect(grammar.coreRules.map((item) => item.claim.catalogId)).not.toContain(coordinate.claim.catalogId)
    }
  })

  it('samples typography, shape, and surface evidence across canonical URLs before applying the global limit', () => {
    const evidence = createEvidence()
    evidence.pages[1] = {
      ...evidence.pages[1],
      id: 'page-secondary',
      url: 'https://example.com/secondary',
      images: [{ ...evidence.pages[1].images[0], id: 'image-secondary' }],
    }
    evidence.sections[1] = {
      ...evidence.sections[1],
      id: 'section-secondary',
      pageId: 'page-secondary',
      tokenRefs: ['color.background', 'spacing.2'],
      evidenceRefs: ['image-secondary'],
      observedStyles: { backgroundColor: '#ffffff' },
    }
    evidence.sections[0].observedStyles = { backgroundColor: '#ffffff' }
    const componentFor = (pageId: string, sectionId: string, index: number) => ({
      ...structuredClone(evidence.components[0]),
      id: `component-${pageId}-${index}`,
      pageId,
      sectionId,
      styles: { backgroundColor: '#2563eb', borderRadius: '12px' },
      tokenRefs: ['color.primary', 'radius.1'],
      evidenceRefs: [sectionId],
    })
    evidence.components = [
      ...Array.from({ length: 8 }, (_value, index) => componentFor('page-desktop', 'section-desktop', index)),
      ...Array.from({ length: 8 }, (_value, index) => componentFor('page-secondary', 'section-secondary', index)),
    ]
    const typographyFor = (pageId: string, sectionId: string, index: number) => ({
      id: `text-${pageId}-${index}`,
      pageId,
      sectionId,
      role: 'body',
      rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
      textRole: 'body' as const,
      tokenRefs: ['typography.font-stack.1', 'typography.font-size.1', 'typography.font-weight.1'],
      observedTypography: { fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' },
      traits: [],
    })
    evidence.layoutNodes = [
      ...Array.from({ length: 8 }, (_value, index) => typographyFor('page-desktop', 'section-desktop', index)),
      ...Array.from({ length: 8 }, (_value, index) => typographyFor('page-secondary', 'section-secondary', index)),
    ]

    const coordinates = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.styleCoordinates

    expect(coordinates.find((coordinate) => coordinate.dimension === 'typography')?.priority).toBe('P0')
    expect(coordinates.find((coordinate) => coordinate.dimension === 'shape')?.priority).toBe('P0')
    expect(coordinates.find((coordinate) => coordinate.dimension === 'surface')?.priority).toBe('P0')
  })

  it('keeps shared heading typography alongside more frequent body typography', () => {
    const evidence = createEvidence()
    evidence.pages[1] = {
      ...evidence.pages[1],
      id: 'page-secondary',
      url: 'https://example.com/secondary',
      images: [{ ...evidence.pages[1].images[0], id: 'image-secondary' }],
    }
    evidence.topology.pages[1].pageId = 'page-secondary'
    evidence.sections[1] = {
      ...evidence.sections[1],
      id: 'section-secondary',
      pageId: 'page-secondary',
      evidenceRefs: ['image-secondary'],
    }
    evidence.topology.pages[1].sectionIds = ['section-secondary']
    const nodesFor = (pageId: string, sectionId: string) => [
      ...Array.from({ length: 8 }, (_value, index) => ({
        id: `body-${pageId}-${index}`,
        pageId,
        sectionId,
        role: 'body' as const,
        rect: { x: 0.1, y: 0.1, width: 0.7, height: 0.05 },
        textRole: 'body' as const,
        tokenRefs: ['typography.font-stack.1', 'typography.font-size.1', 'typography.font-weight.1'],
        observedTypography: { fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400' },
        traits: [],
      })),
      {
        id: `heading-${pageId}`,
        pageId,
        sectionId,
        role: 'heading' as const,
        rect: { x: 0.1, y: 0.02, width: 0.7, height: 0.08 },
        textRole: 'heading' as const,
        tokenRefs: ['typography.font-stack.1', 'typography.font-size.2', 'typography.font-weight.2'],
        observedTypography: { fontFamily: 'Inter, sans-serif', fontSize: '32px', fontWeight: '700' },
        traits: [],
      },
    ]
    evidence.layoutNodes = [
      ...nodesFor('page-desktop', 'section-desktop'),
      ...nodesFor('page-secondary', 'section-secondary'),
    ]

    const catalog = buildDeterministicClaimCatalog(evidence, 'en')
    const typography = catalog.claims.find((entry) =>
      entry.placements.some((placement) => placement.kind === 'singleton' && placement.slot === 'visual.typography'),
    )?.claim
    const coordinate = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.styleCoordinates.find(
      (item) => item.dimension === 'typography',
    )

    expect(typography?.tokenRefs).toEqual(
      expect.arrayContaining(['typography.font-size.2', 'typography.font-weight.2']),
    )
    expect(coordinate?.claim.tokenRefs).toEqual(
      expect.arrayContaining(['typography.font-size.2', 'typography.font-weight.2']),
    )
    expect(coordinate?.claim.statement).toContain('32px')
    expect(coordinate?.claim.statement).toContain('700')
  })

  it('does not turn nested sections into sibling sequence claims', () => {
    const evidence = createEvidence()
    const root = evidence.sections[0]
    root.role = 'content'
    const child = {
      ...structuredClone(root),
      id: 'section-child-hero',
      role: 'hero' as const,
      order: 1,
      parentSectionId: root.id,
    }
    const footer = {
      ...structuredClone(root),
      id: 'section-footer',
      role: 'footer' as const,
      order: 2,
    }
    evidence.sections.push(child, footer)
    evidence.topology.pages[0].sectionIds = [root.id, child.id, footer.id]

    const catalog = buildDeterministicClaimCatalog(evidence, 'en')
    const sequence = catalog.claims.find((entry) =>
      entry.placements.some((placement) => placement.kind === 'attention-sequence'),
    )?.claim
    const orderedAssertions = sequence?.assertions?.filter((assertion) => assertion.predicate === 'ordered-before')

    expect(orderedAssertions).toEqual([expect.objectContaining({ target: 'content', value: 'footer' })])
    expect(sequence?.statement).not.toContain('content -> hero')
    expect(catalog.claims.flatMap((entry) => entry.claim.assertions || [])).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ target: 'content', value: 'hero' })]),
    )
  })

  it('uses every captured canonical URL as the P0 denominator instead of the eight displayed references', () => {
    const evidence = createEvidence()
    evidence.tokens = {
      ...structuredClone(tokens),
      typography: {
        ...structuredClone(tokens.typography),
        fontStacks: ['Inter, sans-serif', 'Georgia, serif'],
        fontSizes: ['16px', '18px'],
      },
      radii: ['12px', '24px'],
    }
    evidence.pages = []
    evidence.topology.pages = []
    evidence.sections = []
    evidence.components = []
    evidence.layoutNodes = []
    for (let index = 0; index < 12; index += 1) {
      const pageId = `page-${String(index).padStart(2, '0')}`
      const sectionId = `section-${String(index).padStart(2, '0')}`
      const imageId = `image-${String(index).padStart(2, '0')}`
      const common = index < 8
      evidence.pages.push({
        id: pageId,
        url: `https://example.com/page-${index}`,
        viewport: 'desktop',
        role: 'content',
        images: [{ id: imageId, kind: 'overview', path: `${imageId}.png`, width: 1440, height: 1200 }],
      })
      evidence.topology.pages.push({ pageId, role: 'content', sectionIds: [sectionId] })
      evidence.sections.push({
        id: sectionId,
        pageId,
        order: 0,
        role: 'content',
        rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        layoutMode: 'flow',
        tokenRefs: ['color.background', 'spacing.1'],
        componentRefs: [],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: [imageId],
      })
      evidence.components.push({
        id: `component-${String(index).padStart(2, '0')}`,
        pageId,
        sectionId,
        type: 'button',
        rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.05 },
        styles: { backgroundColor: '#2563eb', borderRadius: common ? '12px' : '24px' },
        tokenRefs: ['color.primary', common ? 'radius.1' : 'radius.2'],
        stateRefs: [],
        confidence: 0.95,
        evidenceRefs: [sectionId, imageId],
      })
      evidence.layoutNodes.push({
        id: `text-${String(index).padStart(2, '0')}`,
        pageId,
        sectionId,
        role: 'body',
        rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
        textRole: 'body',
        tokenRefs: common
          ? ['typography.font-stack.1', 'typography.font-size.1']
          : ['typography.font-stack.2', 'typography.font-size.2'],
        observedTypography: {
          fontFamily: common ? 'Inter, sans-serif' : 'Georgia, serif',
          fontSize: common ? '16px' : '18px',
        },
        traits: [],
      })
    }

    const first = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.styleCoordinates
    const renamedEvidence = structuredClone(evidence)
    renamedEvidence.components.forEach((component, index) => {
      component.id = `renamed-component-${String(99 - index).padStart(2, '0')}`
    })
    renamedEvidence.layoutNodes.forEach((node, index) => {
      node.id = `renamed-text-${String(99 - index).padStart(2, '0')}`
    })
    const renamed = createDeterministicDesignContext(renamedEvidence, 'en').profile.transferGrammar!.styleCoordinates
    const priority = (coordinates: typeof first, dimension: 'shape' | 'typography') =>
      coordinates.find((coordinate) => coordinate.dimension === dimension)?.priority

    expect(priority(first, 'typography')).toBe('P2')
    expect(priority(first, 'shape')).toBe('P2')
    expect(priority(renamed, 'typography')).toBe(priority(first, 'typography'))
    expect(priority(renamed, 'shape')).toBe(priority(first, 'shape'))
  })

  it('uses all canonical URLs for composition confidence and its dominant width regardless of page IDs', () => {
    const evidence = createEvidence()
    evidence.pages = []
    evidence.topology.pages = []
    evidence.sections = []
    evidence.components = []
    evidence.layoutNodes = []
    for (let index = 0; index < 12; index += 1) {
      const common = index < 9
      const pageId = `${common ? 'a' : 'z'}-page-${index}`
      const sectionId = `section-${index}`
      const imageId = `image-${index}`
      evidence.pages.push({
        id: pageId,
        url: `https://example.com/composition-${index}`,
        viewport: 'desktop',
        role: 'content',
        images: [{ id: imageId, kind: 'overview', path: `${imageId}.png`, width: 1440, height: 1200 }],
      })
      evidence.topology.pages.push({ pageId, role: 'content', sectionIds: [sectionId] })
      evidence.sections.push({
        id: sectionId,
        pageId,
        order: 0,
        role: 'content',
        rect: { x: 0.1, y: 0.1, width: common ? 0.8 : 0.2, height: 0.8 },
        layoutMode: 'flow',
        tokenRefs: ['color.background', 'spacing.1', 'spacing.2'],
        componentRefs: [],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: [imageId],
      })
    }

    const first = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.styleCoordinates.find(
      (coordinate) => coordinate.dimension === 'composition',
    )
    const renamedEvidence = structuredClone(evidence)
    const renamedPageIds = new Map<string, string>()
    renamedEvidence.pages.forEach((page, index) => {
      const replacement = `${index < 9 ? 'z' : 'a'}-renamed-page-${index}`
      renamedPageIds.set(page.id, replacement)
      page.id = replacement
    })
    renamedEvidence.sections.forEach((section) => {
      section.pageId = renamedPageIds.get(section.pageId)!
    })
    renamedEvidence.topology.pages.forEach((page) => {
      page.pageId = renamedPageIds.get(page.pageId)!
    })
    const renamed = createDeterministicDesignContext(
      renamedEvidence,
      'en',
    ).profile.transferGrammar!.styleCoordinates.find((coordinate) => coordinate.dimension === 'composition')

    expect(first).toMatchObject({ priority: 'P0', claim: { confidence: 'high' } })
    expect(first?.claim.statement).toContain('80%')
    expect(first?.claim.statement).toContain('9/12')
    expect(first?.claim.statement).toContain('75%')
    expect(
      first?.claim.assertions?.find((assertion) => assertion.property === 'rect.width.page-representatives-percent')
        ?.value,
    ).toContain('20')
    expect(first?.claim.evidence).toHaveLength(12)
    expect(
      first?.claim.assertions?.find((assertion) => assertion.property === 'rect.width.page-representatives-percent')
        ?.evidenceIds,
    ).toHaveLength(12)
    expect(renamed).toMatchObject({ priority: 'P0', claim: { confidence: 'high' } })
    expect(renamed?.claim.statement).toBe(first?.claim.statement)
  })

  it('fills composition citations when representative widths form separate clusters', () => {
    const evidence = createEvidence()
    evidence.pages = []
    evidence.topology.pages = []
    evidence.sections = []
    evidence.components = []
    evidence.layoutNodes = []
    evidence.responsiveObservations = []
    for (let index = 0; index < 8; index += 1) {
      const pageId = `cluster-page-${index}`
      const sectionId = `cluster-section-${index}`
      const imageId = `cluster-image-${index}`
      evidence.pages.push({
        id: pageId,
        url: `https://example.com/cluster-${index}`,
        viewport: 'desktop',
        role: 'content',
        images: [{ id: imageId, kind: 'overview', path: `${imageId}.png`, width: 1440, height: 1200 }],
      })
      evidence.topology.pages.push({ pageId, role: 'content', sectionIds: [sectionId] })
      evidence.sections.push({
        id: sectionId,
        pageId,
        order: 0,
        role: 'content',
        rect: { x: 0, y: 0, width: index % 2 === 0 ? 0.45 : 1, height: 0.8 },
        layoutMode: 'flow',
        tokenRefs: ['color.background'],
        componentRefs: [],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: [imageId],
      })
    }

    const catalog = buildDeterministicClaimCatalog(evidence, 'en')
    const compositionClaim = catalog.claims.find((entry) =>
      entry.placements.some(
        (placement) => placement.kind === 'singleton' && placement.slot === 'composition.container',
      ),
    )?.claim
    const widthAssertion = compositionClaim?.assertions?.find(
      (assertion) => assertion.property === 'rect.width.page-representatives-percent',
    )

    expect(compositionClaim?.statement).toContain('Across 8 representative pages')
    expect(compositionClaim?.evidence).toHaveLength(8)
    expect(widthAssertion).toMatchObject({ scope: 'cross-page' })
    expect(widthAssertion?.evidenceIds).toHaveLength(8)
    expect(widthAssertion?.value).toEqual(expect.arrayContaining(['45', '100']))
  })

  it('keeps shared semantic colors citable when unrelated palette evidence appears first', () => {
    const evidence = createEvidence()
    evidence.tokens = {
      ...structuredClone(tokens),
      colors: {
        ...tokens.colors,
        'palette-1': '#111111',
        'palette-2': '#222222',
        'palette-3': '#333333',
        'palette-4': '#444444',
        'palette-5': '#555555',
        'palette-6': '#666666',
      },
    }
    evidence.pages = []
    evidence.topology.pages = []
    evidence.sections = []
    evidence.components = []
    evidence.layoutNodes = []
    const refsByPage = [
      ['color.palette-1', 'color.palette-2', 'color.palette-3'],
      ['color.palette-4', 'color.palette-5', 'color.palette-6', 'color.background', 'color.primary'],
      ['color.background', 'color.primary'],
      ['color.background', 'color.primary'],
    ]
    refsByPage.forEach((tokenRefs, index) => {
      const pageId = `color-page-${index}`
      const sectionId = `color-section-${index}`
      const imageId = `color-image-${index}`
      evidence.pages.push({
        id: pageId,
        url: `https://example.com/color-${index}`,
        viewport: 'desktop',
        role: 'content',
        images: [{ id: imageId, kind: 'overview', path: `${imageId}.png`, width: 1440, height: 1200 }],
      })
      evidence.topology.pages.push({ pageId, role: 'content', sectionIds: [sectionId] })
      evidence.sections.push({
        id: sectionId,
        pageId,
        order: 0,
        role: 'content',
        rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        layoutMode: 'flow',
        tokenRefs,
        componentRefs: [],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: [imageId],
      })
    })

    const color = createDeterministicDesignContext(evidence, 'en').profile.transferGrammar!.styleCoordinates.find(
      (coordinate) => coordinate.dimension === 'color',
    )

    expect(color).toMatchObject({
      priority: 'P0',
      claim: { tokenRefs: ['color.background', 'color.primary'] },
    })
  })

  it('cites an actual owner for every selected color token before filling page-diverse evidence', () => {
    const evidence = createEvidence()
    const enrichedTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {
        ...tokens.colors,
        'muted-foreground': '#6b7280',
        'palette-5': '#8b5cf6',
        'palette-11': '#ec4899',
      },
    }
    const componentColorRefs = [
      'color.primary',
      'color.primary',
      'color.primary',
      'color.primary',
      'color.muted-foreground',
      'color.palette-5',
      'color.palette-11',
      'color.foreground',
    ]
    evidence.tokens = enrichedTokens
    evidence.pages = componentColorRefs.map((_ref, index) => ({
      ...structuredClone(evidence.pages[0]),
      id: `page-${index}`,
      url: `https://example.com/page-${index}`,
      images: [
        {
          ...structuredClone(evidence.pages[0].images[0]),
          id: `image-${index}`,
          path: `page-${index}.png`,
        },
      ],
    }))
    evidence.sections = componentColorRefs.map((_ref, index) => ({
      ...structuredClone(evidence.sections[0]),
      id: `section-${index}`,
      pageId: `page-${index}`,
      tokenRefs: ['color.background'],
      componentRefs: [`component-${index}`],
      evidenceRefs: [`image-${index}`],
    }))
    evidence.components = componentColorRefs.map((ref, index) => ({
      ...structuredClone(evidence.components[0]),
      id: `component-${index}`,
      pageId: `page-${index}`,
      sectionId: `section-${index}`,
      tokenRefs: [ref],
      evidenceRefs: [`section-${index}`, `image-${index}`],
    }))
    evidence.topology.pages = componentColorRefs.map((_ref, index) => ({
      pageId: `page-${index}`,
      role: 'content',
      sectionIds: [`section-${index}`],
    }))
    evidence.responsiveObservations = []

    const catalog = buildDeterministicClaimCatalog(evidence, 'en')
    const integrity = validateDesignClaimCatalog(catalog, evidence)
    const colorClaim = catalog.claims.find((entry) =>
      entry.placements.some((placement) => placement.kind === 'singleton' && placement.slot === 'visual.color'),
    )?.claim

    expect(integrity.errors.filter((error) => error.includes('token-ref-without-cited-owner'))).toEqual([])
    expect(colorClaim?.tokenRefs).toEqual(
      expect.arrayContaining([
        'color.background',
        'color.primary',
        'color.muted-foreground',
        'color.palette-5',
        'color.palette-11',
        'color.foreground',
      ]),
    )
    expect(() => createDeterministicDesignContext(evidence, 'en')).not.toThrow()
  })

  it('uses only evidence IDs that exist in the captured evidence graph', () => {
    const evidence = createEvidence()
    const context = createDeterministicDesignContext(evidence, 'en')
    const knownIds = new Set([
      ...evidence.pages.map((page) => page.id),
      ...evidence.pages.flatMap((page) => page.images.map((image) => image.id)),
      ...evidence.sections.map((section) => section.id),
      ...evidence.components.map((component) => component.id),
      ...evidence.responsiveObservations.map((observation) => observation.id),
    ])
    const serialized = JSON.stringify(context.profile)

    for (const claim of context.profile.transferRules.preserve) {
      for (const reference of claim.evidence) expect(knownIds.has(reference.evidenceId)).toBe(true)
    }
    expect(serialized).not.toContain('C:\\\\')
  })

  it('does not combine different page-local section positions into one claim', () => {
    const evidence = createEvidence()
    evidence.pages = [
      evidence.pages[0],
      {
        ...structuredClone(evidence.pages[0]),
        id: 'page-secondary',
        url: 'https://example.com/secondary',
        images: [
          {
            ...structuredClone(evidence.pages[0].images[0]),
            id: 'image-secondary',
            path: 'secondary.png',
          },
        ],
      },
    ]
    evidence.sections = [
      { ...structuredClone(evidence.sections[0]), id: 'section-primary', order: 0 },
      {
        ...structuredClone(evidence.sections[0]),
        id: 'section-secondary',
        pageId: 'page-secondary',
        order: 3,
        evidenceRefs: ['image-secondary'],
      },
    ]

    const catalog = buildDeterministicClaimCatalog(evidence, 'en')

    expect(catalog.claims.some((entry) => entry.id === 'section-hero-rhythm')).toBe(false)
  })

  it('renders component observations as natural prose without internal classification wording', () => {
    const cardEvidence = createEvidence()
    cardEvidence.components[0] = {
      ...cardEvidence.components[0],
      type: 'card',
      role: 'card',
    }
    const cardProfile = createDeterministicDesignContext(cardEvidence, 'zh-CN').profile
    const cardMarkdown = generateDesignProfileMarkdown(cardProfile, tokens, new Map(), cardEvidence)

    expect(cardMarkdown).toContain('观察到 1 个卡片组件，外形为常规圆角。')
    expect(cardMarkdown).not.toMatch(/角色为|圆角分类|变体未分类/)

    const actionEvidence = createEvidence()
    actionEvidence.components[0] = {
      ...actionEvidence.components[0],
      role: 'primary-action',
    }
    const actionProfile = createDeterministicDesignContext(actionEvidence, 'zh-CN').profile
    const actionMarkdown = generateDesignProfileMarkdown(actionProfile, tokens, new Map(), actionEvidence)
    const englishProfile = createDeterministicDesignContext(cardEvidence, 'en').profile
    const englishMarkdown = generateDesignProfileMarkdown(englishProfile, tokens, new Map(), cardEvidence)

    expect(actionMarkdown).toContain('观察到 1 个用于主要操作的按钮组件，外形为常规圆角')
    expect(actionMarkdown).toContain('包含以下变体：主按钮')
    expect(actionMarkdown).not.toContain('包含以下变体：主要')
    expect(englishMarkdown).toContain('Observed 1 card component with rounded corners.')
  })
})
