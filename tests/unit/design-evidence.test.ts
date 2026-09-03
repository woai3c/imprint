import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import type { DesignToken, TokenEvidence } from '../../src/core/analyzer/types.js'
import { opaqueRouteIdentity } from '../../src/core/analyzer/url-identity.js'
import {
  buildDesignEvidence,
  createEvidenceId,
  generateDesignEvidenceBrief,
  generateDesignEvidenceJson,
} from '../../src/core/design-evidence/index.js'
import type { PageEvidenceSnapshot } from '../../src/core/design-evidence/page-extractor.js'
import { generateDesignDoc, validateDesignDocSemantics } from '../../src/core/export/index.js'

const tokens: DesignToken = {
  colors: {
    background: '#ffffff',
    foreground: '#111827',
    primary: '#2563eb',
  },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['1rem', '2rem'],
    fontWeights: ['400', '700'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['8px', '24px'],
  radii: ['12px'],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: ['0.2s'],
}

function layoutTextSource(foreground = 'rgb(17, 24, 39)') {
  return {
    kind: 'direct-text' as const,
    widthPx: 720,
    heightPx: 64,
    visibleWidthPx: 720,
    visibleHeightPx: 64,
    visibleBounds: { xPx: 0, yPx: 0, widthPx: 720, heightPx: 64 },
    paintedAreaPx: 46_080,
    captureIntersectionRatio: 1,
    effectiveClipPathAreaRatio: 1,
    ancestorClipCount: 0,
    clientRectCount: 1,
    glyphRectCount: 1,
    visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 720, heightPx: 64 }],
    visibleGlyphAreaPx: 46_080,
    clipPathChain: [],
    nonRectangularClipPathCount: 0,
    clip: 'auto',
    clipPath: 'none',
    contentVisibility: 'visible',
    opacity: 1,
    filterOpacity: 1,
    filterChain: [],
    maskChain: [],
    blendChain: [],
    textIndentPx: 0,
    filter: 'none',
    glyphPaintKind: 'solid-color' as const,
    foreground,
  }
}

function createSnapshot(viewport: 'desktop' | 'tablet' | 'mobile', width: number): PageEvidenceSnapshot {
  const viewportWidth = { desktop: 1440, tablet: 768, mobile: 375 }[viewport]
  return {
    url: 'https://example.com/',
    viewport,
    language: 'en',
    role: 'landing',
    viewportWidth,
    viewportHeight: viewport === 'mobile' ? 812 : 900,
    width,
    height: 1600,
    contentWidth: width,
    horizontalOverflow: width > viewportWidth + 4,
    horizontalOverflowSources:
      width > viewportWidth + 4
        ? [
            {
              locator: 'body > main:nth-of-type(1)',
              overflowPx: width - viewportWidth,
              width,
              position: 'static',
              sectionKey: 'hero:1',
              sectionRole: 'hero',
            },
          ]
        : [],
    sections: [
      {
        key: 'navigation:0',
        identityKey: 'section:navigation:site-navigation',
        order: 0,
        role: 'navigation',
        rect: { x: 0, y: 0, width: 1, height: 0.08 },
        layoutMode: 'sticky',
        styles: {
          backgroundColor: 'rgb(255, 255, 255)',
          color: 'rgb(17, 24, 39)',
          display: viewport === 'mobile' ? 'block' : 'flex',
          gap: viewport === 'desktop' ? '24px' : viewport === 'tablet' ? '16px' : '8px',
        },
      },
      {
        key: 'hero:1',
        identityKey: 'section:hero:page-heading',
        order: 1,
        role: 'hero',
        rect: {
          x: viewport === 'desktop' ? 0.15 : viewport === 'tablet' ? 0.1 : 0.05,
          y: 0.12,
          width: viewport === 'desktop' ? 0.7 : viewport === 'tablet' ? 0.8 : 0.9,
          height: 0.3,
        },
        layoutMode: 'flow',
        styles: {
          backgroundColor: 'rgb(255, 255, 255)',
          color: 'rgb(17, 24, 39)',
          paddingTop: '24px',
        },
      },
    ],
    components: [
      {
        key: 'hero:1:button:0',
        sectionKey: 'hero:1',
        type: 'button',
        rect: { x: 0.2, y: 0.3, width: 0.2, height: 0.04 },
        styles: {
          backgroundColor: 'rgb(37, 99, 235)',
          color: 'rgb(255, 255, 255)',
          borderRadius: '12px',
          padding: '8px 24px',
        },
        confidence: 0.98,
      },
    ],
    layoutNodes: [
      {
        key: 'hero:1:heading:0',
        identityKey: 'node:heading:display:page-heading',
        sectionKey: 'hero:1',
        role: 'heading',
        textRole: 'display',
        textStyleSource: layoutTextSource(),
        rect: { x: 0.2, y: 0.18, width: 0.5, height: 0.08 },
        styles: {
          color: 'rgb(17, 24, 39)',
          fontFamily: 'Inter',
          fontSize: '32px',
          fontWeight: '700',
          lineHeight: '48px',
        },
        traits: ['text-length:short'],
      },
    ],
    mediaLayers: [],
    interactionCandidates: [],
    ariaStates: [],
  }
}

function buildFixtureEvidence() {
  return buildDesignEvidence({
    analysisId: 'analysis-1',
    requestedUrl: 'https://example.com',
    finalUrl: 'https://example.com/',
    accessMode: 'anonymous',
    expectedPageCount: 1,
    expectedViewports: ['desktop', 'mobile'],
    tokens,
    featureTags: ['responsive'],
    interactionStyles: {
      hover: [{ before: { color: '#111827' }, after: { color: '#2563eb' } }],
      focus: [],
      active: [],
    },
    breakpoints: [{ width: 768, label: 'tablet-sm', layoutChanges: [] }],
    motion: [{ property: 'transform', duration: '0.2s', easing: 'ease', count: 1 }],
    captures: [
      {
        screenshot: {
          url: 'https://example.com/',
          path: 'C:\\evidence\\desktop.png',
          viewport: 'desktop',
        },
        snapshot: createSnapshot('desktop', 1440),
        supplementalImages: [
          {
            kind: 'region-crop',
            path: 'C:\\evidence\\desktop-region.png',
            width: 960,
            height: 480,
            sourceRect: { x: 0.15, y: 0.12, width: 0.7, height: 0.3 },
          },
        ],
      },
      {
        screenshot: {
          url: 'https://example.com/',
          path: 'C:\\evidence\\mobile.png',
          viewport: 'mobile',
        },
        snapshot: createSnapshot('mobile', 375),
      },
    ],
  })
}

describe('Design Evidence', () => {
  it('refuses to manufacture a route reference for an unmatched token evidence page', () => {
    const snapshot = createSnapshot('desktop', 1440)
    const unmatchedTokens: DesignToken = {
      ...tokens,
      evidence: {
        'colors.background': {
          value: '#ffffff',
          confidence: 'high',
          observationCount: 4,
          pageCount: 1,
          captureCount: 1,
          pages: ['https://orphan.example/'],
          sources: ['computed:background'],
          reasons: ['rendered-use'],
        },
      },
    }

    expect(() =>
      buildDesignEvidence({
        analysisId: 'unmatched-token-route',
        requestedUrl: snapshot.url,
        finalUrl: snapshot.url,
        accessMode: 'anonymous',
        expectedPageCount: 1,
        tokens: unmatchedTokens,
        featureTags: [],
        interactionStyles: { hover: [], focus: [], active: [] },
        breakpoints: [],
        motion: [],
        captures: [
          {
            screenshot: { url: snapshot.url, path: 'unmatched-route.png', viewport: 'desktop' },
            snapshot,
          },
        ],
      }),
    ).toThrow('Token evidence page has no matching Evidence capture: https://orphan.example/')
  })

  it('matches component tokens by CSS property as well as value', () => {
    const snapshot = createSnapshot('desktop', 1440)
    const source = snapshot.components[0]
    snapshot.components = [
      { ...source, key: 'hero:1:card:radius', styles: { borderRadius: '16px' } },
      { ...source, key: 'hero:1:card:padding', styles: { padding: '16px' } },
      { ...source, key: 'hero:1:card:type', styles: { fontSize: '16px' } },
    ]
    const collisionTokens: DesignToken = {
      ...tokens,
      typography: { ...tokens.typography, fontSizes: ['16px'] },
      spacing: ['16px'],
      radii: ['16px'],
    }

    const evidence = buildDesignEvidence({
      analysisId: 'token-property-matching',
      requestedUrl: snapshot.url,
      finalUrl: snapshot.url,
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens: collisionTokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: snapshot.url, path: 'property-matching.png', viewport: 'desktop' },
          snapshot,
        },
      ],
    })

    expect(evidence.components.map((component) => component.tokenRefs)).toEqual([
      ['radius.1'],
      ['spacing.1'],
      ['typography.font-size.1'],
    ])
  })

  it('keeps equal color literals separated by CSS channel and semantic token role', () => {
    const snapshot = createSnapshot('desktop', 1440)
    const source = snapshot.components[0]
    snapshot.components = [
      { ...source, key: 'hero:1:text:wrong-role', styles: { color: '#ffffff' } },
      { ...source, key: 'hero:1:surface:wrong-role', styles: { backgroundColor: '#111827' } },
      { ...source, key: 'hero:1:border:wrong-role', styles: { borderTopColor: '#ffffff' } },
      { ...source, key: 'hero:1:text:correct-role', styles: { color: '#111827' } },
      { ...source, key: 'hero:1:surface:correct-role', styles: { backgroundColor: '#ffffff' } },
      { ...source, key: 'hero:1:border:correct-role', styles: { borderTopColor: '#d1d5db' } },
    ]
    const collisionTokens: DesignToken = {
      ...tokens,
      colors: { background: '#ffffff', foreground: '#111827', border: '#d1d5db' },
    }

    const evidence = buildDesignEvidence({
      analysisId: 'semantic-color-token-matching',
      requestedUrl: snapshot.url,
      finalUrl: snapshot.url,
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens: collisionTokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: snapshot.url, path: 'semantic-color-matching.png', viewport: 'desktop' },
          snapshot,
        },
      ],
    })

    expect(evidence.components.map((component) => component.tokenRefs)).toEqual([
      [],
      [],
      [],
      ['color.foreground'],
      ['color.background'],
      ['color.border'],
    ])
  })

  it('preserves anchor provenance as elementKind without changing the visual button type', () => {
    const snapshot = createSnapshot('desktop', 1440)
    snapshot.components[0].elementKind = 'anchor'
    const evidence = buildDesignEvidence({
      analysisId: 'anchor-component',
      requestedUrl: snapshot.url,
      finalUrl: snapshot.url,
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [{ screenshot: { url: snapshot.url, path: 'anchor.png', viewport: 'desktop' }, snapshot }],
    })

    expect(evidence.components[0]).toMatchObject({ type: 'button', elementKind: 'anchor' })
  })

  it('uses the instance-backed Evidence catalog exclusively when evidence is available', () => {
    const evidence = buildFixtureEvidence()
    const detected = [
      {
        type: 'button' as const,
        count: 99,
        selectors: ['button'],
        styles: { backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '12px' },
        confidence: 1,
        evidence: ['native-element'],
      },
      {
        type: 'card' as const,
        count: 5,
        selectors: [],
        styles: { backgroundColor: '#ffffff', borderRadius: '12px' },
        confidence: 0.8,
        evidence: ['visual-boundary'],
      },
    ]
    const document = generateDesignDoc(
      tokens,
      evidence.source.requestedUrl,
      [],
      undefined,
      [],
      detected,
      'en',
      evidence,
    )

    expect(document).toContain('- button: 1 observed patterns, 1 canonical instances, 0 reusable exact-style patterns')
    expect(document).not.toContain('99 canonical instances')
    expect(document).not.toContain('- card:')
    expect(document).not.toContain('| Type | Instances |')
    expect(document).toContain('Instance counts use one canonical capture per page, preferring desktop')
    expect(document).not.toContain('Detector supplement; aggregated pattern without instance-level provenance')
  })

  it('keeps primary-action color evidence without inventing a component variant', () => {
    const evidence = buildFixtureEvidence()
    const primaryTokens = structuredClone(tokens)
    const desktop = evidence.pages.find((page) => page.viewport === 'desktop')!
    primaryTokens.colorRoles = {
      primaryAction: {
        observedBackground: '#2563eb',
        observedForeground: '#ffffff',
        provenance: [
          {
            captureId: `${desktop.url}|${desktop.viewportWidth}x${desktop.viewportHeight}`,
            elementRef: 'body > main > button:nth-of-type(1)',
            elementKind: 'button',
            role: 'primary-action',
          },
        ],
      },
    }
    evidence.tokens = primaryTokens
    evidence.components = evidence.components.map((component) => ({
      ...component,
      role: 'action',
      styles: { ...component.styles, backgroundColor: 'rgba(37, 99, 235, 0.08)' },
      tokenRefs: [],
    }))

    const document = generateDesignDoc(
      primaryTokens,
      evidence.source.requestedUrl,
      [],
      undefined,
      [],
      [],
      'en',
      evidence,
    )

    expect(document).toContain('**Component variants:** action button ×1')
    expect(document).not.toContain('**Component variants:** primary button')
    expect(document).toContain('- button: 1 observed patterns, 1 canonical instances, 0 reusable exact-style patterns')
    expect(document).toContain('primaryAction:')
    expect(document).toContain('observationCount: 1')
    expect(document).not.toContain('provenanceArtifact: design-evidence.json')
    expect(document).not.toContain('body > main > button:nth-of-type(1)')
  })

  it('keeps volatile geometry and transparent decoration out of human-facing reconstruction facts', () => {
    const evidence = buildFixtureEvidence()
    const desktop = evidence.pages.find((page) => page.viewport === 'desktop')!
    const mobile = evidence.pages.find((page) => page.viewport === 'mobile')!
    const section = evidence.sections.find((candidate) => candidate.pageId === desktop.id)!
    const mobileSection = evidence.sections.find((candidate) => candidate.pageId === mobile.id)!
    section.layoutMode = 'sticky'
    section.observedStyles = {
      layout: { top: '72px', height: '2211.31px' },
      borders: { borderTop: '1px solid #e5e7eb' },
    }
    evidence.pseudoElements = [
      {
        id: 'pseudo-unmapped',
        pageId: desktop.id,
        sectionId: 'missing-section',
        target: 'body > div:nth-of-type(12)',
        kind: 'after',
        styles: { content: '"·"', color: 'rgb(55, 58, 64)' },
        evidenceRefs: [desktop.images[0].id],
      },
      {
        id: 'pseudo-drop-cap',
        pageId: desktop.id,
        sectionId: section.id,
        target: 'main > article > p:first-of-type',
        kind: 'first-letter',
        styles: { fontSize: '48px', float: 'left', color: 'rgb(153, 27, 27)' },
        evidenceRefs: [desktop.images[0].id],
      },
      {
        id: 'pseudo-blank-geometry',
        pageId: desktop.id,
        sectionId: section.id,
        target: 'main > article::after',
        kind: 'after',
        styles: {
          content: '" "',
          width: '366px',
          height: '99px',
          borderRadius: '4px',
          transform: 'matrix(0.5, 0, 0, 0.5, 0, 0)',
        },
        evidenceRefs: [desktop.images[0].id],
      },
      {
        id: 'pseudo-bordered-decoration',
        pageId: desktop.id,
        sectionId: section.id,
        target: 'main > article::before',
        kind: 'before',
        styles: {
          content: '" "',
          width: '134.75px',
          height: '32px',
          borderRadius: '4px',
          borderTop: '1px solid rgba(247, 122, 49, 0.3)',
          borderRight: '1px solid rgba(247, 122, 49, 0.3)',
          borderBottom: '1px solid rgba(247, 122, 49, 0.3)',
          borderLeft: '1px solid rgba(247, 122, 49, 0.3)',
          transform: 'matrix(0.5, 0, 0, 0.5, 0, 0)',
        },
        evidenceRefs: [desktop.images[0].id],
      },
      {
        id: 'pseudo-mobile-only',
        pageId: mobile.id,
        sectionId: mobileSection.id,
        target: 'main > article::before',
        kind: 'before',
        styles: { content: '"MOBILE-ONLY"', color: 'rgb(55, 58, 64)' },
        evidenceRefs: [mobile.images[0].id],
      },
    ]
    const repeatedSection = { ...section, id: `${section.id}-repeated`, order: section.order + 1 }
    evidence.sections.push(repeatedSection)
    const topology = evidence.topology.pages.find((page) => page.pageId === desktop.id)
    const sectionIndex = topology?.sectionIds.indexOf(section.id) ?? -1
    topology?.sectionIds.splice(sectionIndex + 1, 0, repeatedSection.id)
    evidence.responsiveObservations = [
      {
        id: 'responsive-volatile',
        sectionId: section.id,
        fromViewport: 'desktop',
        toViewport: 'mobile',
        changeType: 'scale',
        changedProperties: ['height', 'rect.width'],
        changes: {
          height: { from: '3736.83px', to: '1385.69px' },
          'rect.width': { from: 1, to: 0.1017 },
        },
        summary: 'Volatile page geometry differs.',
        evidenceRefs: [section.id],
      },
    ]

    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'en', evidence)
    const summary = document.slice(document.indexOf('### Reconstruction Summary'), document.indexOf('## Colors'))

    expect(summary).toContain('sticky, top 72px')
    expect(summary).not.toContain('content ::after')
    expect(summary).toContain('::first-letter')
    expect(summary).toContain(`${section.role} ×2`)
    expect(summary).not.toContain('2211.31px')
    expect(summary).not.toContain('1px solid #e5e7eb')
    expect(summary).not.toContain('unknown after')
    expect(summary).not.toContain('rect.width')
    expect(document).toContain('content: "·"')
    expect(document).not.toContain('width: 366px')
    expect(document).toContain('border: 1px solid rgba(247, 122, 49, 0.3)')
    expect(document).not.toContain('width: 134.75px')
    expect(document).not.toContain('matrix(0.5, 0, 0, 0.5, 0, 0)')
    expect(document).not.toContain('borderRight: 1px solid rgba(247, 122, 49, 0.3)')
    expect(document).not.toContain('MOBILE-ONLY')

    evidence.pseudoElements = [
      {
        id: 'pseudo-tooltip',
        pageId: desktop.id,
        sectionId: section.id,
        target: 'main > button::after',
        kind: 'after',
        styles: {
          content: '"Tooltip"',
          color: 'rgb(255, 255, 255)',
          backgroundColor: 'rgb(37, 41, 46)',
          borderTop: '0px none rgb(255, 255, 255)',
        },
        evidenceRefs: [desktop.images[0].id],
      },
    ]
    const zhDocument = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'zh-CN', evidence)
    expect(zhDocument).not.toContain('border-顶部偏移')
    expect(zhDocument).not.toContain('0px none rgb(255, 255, 255)')
  })

  it('shows representative passive state values instead of only aggregate property counts', () => {
    const evidence = buildFixtureEvidence()
    const page = evidence.pages[0]
    const section = evidence.sections.find((candidate) => candidate.pageId === page.id)!
    evidence.interactionObservations = [
      {
        id: 'interaction-hover-values',
        pageId: page.id,
        sectionId: section.id,
        targetId: 'synthetic-target-id',
        driver: 'hover',
        safety: 'passive',
        source: 'computed-probed',
        trigger: { kind: 'css-pseudo-class:hover' },
        before: { color: 'rgb(17, 24, 39)', 'background-color': 'rgb(255, 255, 255)' },
        after: { color: 'rgb(37, 99, 235)', 'background-color': 'rgb(248, 250, 252)' },
        changedProperties: ['color', 'background-color'],
        evidenceRefs: [section.id],
      },
    ]

    const brief = generateDesignEvidenceBrief(evidence, 'zh-CN')
    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'zh-CN', evidence)
    const summary = document.slice(document.indexOf('### 重建摘要'), document.indexOf('## Colors'))

    expect(brief).toContain('代表性状态值')
    expect(brief).toContain('color: rgb(17, 24, 39) → rgb(37, 99, 235)')
    expect(brief).toContain('浏览器计算样式探测（已执行状态，未点击）')
    expect(brief).not.toContain('synthetic-target-id')
    expect(summary).not.toContain('color rgb(17, 24, 39) → rgb(37, 99, 235)')
  })

  it('prioritizes computed interaction observations over stylesheet declarations at the evidence cap', () => {
    const snapshot = createSnapshot('desktop', 1_440)
    const declaredFocusStyles = Array.from({ length: 12 }, (_, index) => ({
      before: {},
      after: { 'outline-color': `var(--focus-${index})` },
      source: 'declared-applicable' as const,
    }))
    const computedFocusStyle = {
      before: {
        'outline-style': 'none',
        'outline-width': '0px',
        'outline-color': 'rgba(0, 0, 0, 0)',
      },
      after: {
        'outline-style': 'none',
        'outline-width': '0px',
        'outline-color': 'rgb(37, 99, 235)',
      },
      changedProperties: ['outline-color'],
      source: 'computed-probed' as const,
    }
    const evidence = buildDesignEvidence({
      analysisId: 'computed-interaction-priority',
      requestedUrl: snapshot.url,
      finalUrl: snapshot.url,
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: snapshot.url, path: 'desktop.png', viewport: 'desktop' },
          snapshot,
          interactionStyles: {
            hover: [],
            focus: [...declaredFocusStyles, computedFocusStyle],
            active: [],
          },
        },
      ],
    })
    const focusObservations = evidence.interactionObservations.filter((observation) => observation.driver === 'focus')

    expect(focusObservations).toHaveLength(12)
    expect(focusObservations[0]).toMatchObject({
      changedProperties: ['outline-color'],
      after: { 'outline-style': 'none', 'outline-width': '0px', 'outline-color': 'rgb(37, 99, 235)' },
    })
  })

  it('shows declared passive values when a stylesheet observation has no computed before value', () => {
    const evidence = buildFixtureEvidence()
    const page = evidence.pages[0]
    const section = evidence.sections.find((candidate) => candidate.pageId === page.id)!
    evidence.interactionObservations = [
      {
        id: 'interaction-declared-hover-value',
        pageId: page.id,
        sectionId: section.id,
        targetId: 'synthetic-target-id',
        driver: 'hover',
        safety: 'passive',
        source: 'declared-applicable',
        trigger: { kind: 'css-pseudo-class:hover' },
        before: {},
        after: { 'background-color': 'rgb(248, 250, 252)' },
        changedProperties: ['background-color'],
        evidenceRefs: [section.id],
      },
    ]

    const brief = generateDesignEvidenceBrief(evidence, 'zh-CN')

    expect(brief).toContain('background-color: rgb(248, 250, 252)')
    expect(brief).not.toContain('undefined')
    expect(brief).toContain('适用于当前 DOM 的样式声明（未执行状态）')
  })

  it('localizes deterministic reconstruction prose in a Chinese document', () => {
    const evidence = buildFixtureEvidence()
    evidence.source.siteName = '示例站点'
    evidence.featureTags = [
      'spacing rhythm led by 4px, 8px, 16px',
      'compact-radius surfaces observed',
      'extensive CSS variable usage',
    ]

    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'zh-CN', evidence)
    const summary = document.slice(document.indexOf('### 重建摘要'), document.indexOf('## Colors'))

    expect(summary).toContain('本次分析覆盖 示例站点 的当前捕获页面')
    expect(summary).not.toContain('is an observed')
    expect(summary).not.toContain('Implement the')
    expect(document).toContain('`高频间距：4px、8px、16px`')
    expect(document).toContain('`观察到以紧凑圆角为主的表面`')
    expect(document).not.toContain('`大量使用 CSS 变量`')
  })

  it('uses readable component names in the Chinese reconstruction summary', () => {
    const evidence = buildFixtureEvidence()
    const desktopButton = evidence.components.find(
      (component) => component.type === 'button' && component.pageId === evidence.pages[0].id,
    )!
    desktopButton.rect.height = 0.02
    desktopButton.styles = {
      ...desktopButton.styles,
      border: '1px solid rgb(37, 99, 235)',
      borderRadius: '6px',
    }
    evidence.components.push({
      ...structuredClone(desktopButton),
      id: 'component-primary-large',
      rect: { ...desktopButton.rect, height: 0.04 },
      styles: {
        ...desktopButton.styles,
        border: 'none',
        borderRadius: '6px',
      },
    })
    evidence.components.push(
      {
        ...structuredClone(desktopButton),
        id: 'component-delta-positive',
        type: 'status',
        role: 'delta-positive',
      },
      {
        ...structuredClone(desktopButton),
        id: 'component-status-warning',
        type: 'status',
        role: 'status-warning',
      },
    )

    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'zh-CN', evidence)
    const summary = document.slice(document.indexOf('### 重建摘要'), document.indexOf('## Colors'))

    expect(summary).toContain('操作按钮（小尺寸） ×1')
    expect(summary).toContain('操作按钮（大尺寸） ×1')
    expect(summary).not.toContain('操作按钮（小尺寸、圆角、描边）')
    expect(summary).toContain('正向变化值 ×1')
    expect(summary).toContain('状态提示（警告） ×1')
    expect(summary).not.toContain('button-primary-')
  })

  it('uses human-readable interaction and structure terms throughout the Chinese report', () => {
    const evidence = buildFixtureEvidence()
    const page = evidence.pages.find((candidate) => candidate.viewport === 'desktop')!
    const section = evidence.sections.find((candidate) => candidate.pageId === page.id)!
    const component = evidence.components.find((candidate) => candidate.pageId === page.id)!
    const mediaSection: typeof section = {
      ...structuredClone(section),
      id: 'section-media-summary',
      role: 'media',
      order: 99,
      layoutMode: 'flow',
      observedStyles: {},
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
    }
    evidence.sections.push(mediaSection)
    evidence.topology.pages.find((candidate) => candidate.pageId === page.id)!.sectionIds.push(mediaSection.id)
    section.layoutMode = 'fixed'
    section.observedStyles = { layout: { height: '56px' } }
    evidence.layoutNodes.push({
      id: 'layout-body-border',
      pageId: page.id,
      sectionId: section.id,
      role: 'body',
      rect: { x: 0, y: 0, width: 1, height: 1 },
      tokenRefs: [],
      observedStyles: { borderLeft: '4px solid rgb(209, 217, 224)' },
      traits: [],
    })
    evidence.interactionObservations = [
      {
        id: 'interaction-disclosure',
        pageId: page.id,
        sectionId: section.id,
        targetId: component.id,
        driver: 'click',
        safety: 'safe-active',
        trigger: { kind: 'button' },
        before: { ariaExpanded: 'false', controlledVisibility: 'hidden', controlledOpacity: '0' },
        after: { ariaExpanded: 'true', controlledVisibility: 'visible', controlledOpacity: '1' },
        changedProperties: ['ariaExpanded', 'controlledVisibility', 'controlledOpacity'],
        evidenceRefs: [page.images[0].id],
      },
    ]

    const brief = generateDesignEvidenceBrief(evidence, 'zh-CN')
    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'zh-CN', evidence)
    const summary = document.slice(document.indexOf('### 重建摘要'), document.indexOf('## Colors'))

    expect(summary).toContain('页面主体 左边框: 4px solid rgb(209, 217, 224)')
    expect(summary).toContain('按钮 点击: 展开状态 否 → 是, 受控内容可见性 隐藏 → 可见')
    expect(summary).toContain('媒体')
    expect(summary).toContain('导航: 固定定位, 高度 56px')
    expect(summary).not.toMatch(
      /ariaExpanded|controlledVisibility|body border-left|\bmedia\b|\bfixed\b|\d+(?:\.\d+)?px high\b/,
    )
    expect(brief).toContain('已执行变化属性: 展开状态 ×1, 受控内容可见性 ×1, 受控内容透明度 ×1')
    expect(brief).toContain('展开状态: 否 → 是; 受控内容可见性: 隐藏 → 可见; 受控内容透明度: 0 → 1')
    expect(brief).not.toMatch(/ariaExpanded|controlledVisibility|controlledOpacity/)
  })

  it('keeps one-page geometry out of a multi-page reconstruction summary', () => {
    const evidence = buildFixtureEvidence()
    evidence.sections.forEach((section) => {
      section.layoutMode = 'flow'
      section.observedStyles = {}
    })
    const secondPage = evidence.pages.find((page) => page.viewport === 'mobile')!
    secondPage.url = 'https://example.com/creator'
    secondPage.routeId = 'route-creator'
    const secondSection = evidence.sections.find((section) => section.pageId === secondPage.id)!
    secondSection.observedStyles = { layout: { maxWidth: '413px' } }

    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'en', evidence)
    const summary = document.slice(document.indexOf('### Reconstruction Summary'), document.indexOf('## Colors'))

    expect(summary).toContain('**Site scope:**')
    expect(summary).toContain('This analysis covers 2 observed pages from')
    expect(summary).toContain('**Entry-page section hierarchy:**')
    expect(summary).not.toContain('[/creator] navigation max-width: 413px')
    expect(document).toContain('### Structural Facts')
    expect(document).toContain('`max-width: 413px`')
  })

  it('uses recurring structure instead of one-page geometry when a multi-page pattern exists', () => {
    const evidence = buildFixtureEvidence()
    const basePage = evidence.pages.find((page) => page.viewport === 'desktop')!
    const baseSection = evidence.sections.find((section) => section.pageId === basePage.id)!
    baseSection.layoutMode = 'sticky'
    baseSection.observedStyles = { layout: { top: '72px', height: '80px' } }

    for (let index = 1; index <= 3; index += 1) {
      const pageId = `page-recurring-${index}`
      evidence.pages.push({
        ...structuredClone(basePage),
        id: pageId,
        routeId: `route-recurring-${index}`,
        url: `https://example.com/area-${index}`,
        images: [],
      })
      evidence.sections.push({
        ...structuredClone(baseSection),
        id: `section-recurring-${index}`,
        pageId,
        layoutMode: 'flow',
        observedStyles: { borderRadius: '12px' },
        evidenceRefs: [],
      })
    }

    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'en', evidence)
    const summary = document.slice(document.indexOf('### Reconstruction Summary'), document.indexOf('## Colors'))
    const recurring = 'Observed across 3 pages: navigation radius: 12px'
    const onePage = '[entry] navigation: sticky, top 72px, 80px high'

    expect(summary).toContain(recurring)
    expect(summary).not.toContain(onePage)
  })

  it('labels human-facing order-only responsive evidence as reorder', () => {
    const evidence = buildFixtureEvidence()
    const section = evidence.sections[0]
    evidence.responsiveObservations = [
      {
        id: 'responsive-order',
        sectionId: section.id,
        fromViewport: 'desktop',
        toViewport: 'mobile',
        changeType: 'reflow',
        changedProperties: ['order', 'rect.width'],
        changes: {
          order: { from: 2, to: 1 },
          'rect.width': { from: 0.5, to: 0.9 },
        },
        summary: 'Order and volatile geometry changed.',
        evidenceRefs: [section.id],
      },
    ]

    const brief = generateDesignEvidenceBrief(evidence)
    const chineseBrief = generateDesignEvidenceBrief(evidence, 'zh-CN')

    expect(brief).toContain('order change (order)')
    expect(brief).not.toContain('layout reflow (order)')
    expect(chineseBrief).toContain('桌面端 → 移动端 · 导航 · 顺序调整（顺序） · 支持：1 个路由 · 1 个观察实例')
    expect(chineseBrief).not.toContain('reorder')
    expect(chineseBrief).not.toContain('order')
  })

  it('groups identical responsive facts across sections and routes without merging different values', () => {
    const evidence = buildFixtureEvidence()
    const homeDesktop = evidence.pages.find((page) => page.viewport === 'desktop')!
    const homeMobile = evidence.pages.find((page) => page.viewport === 'mobile')!
    const aboutDesktop = { ...structuredClone(homeDesktop), id: 'page-about-desktop', url: 'https://example.com/about' }
    const aboutMobile = { ...structuredClone(homeMobile), id: 'page-about-mobile', url: 'https://example.com/about' }
    homeDesktop.routeId = 'route-home'
    homeMobile.routeId = 'route-home'
    aboutDesktop.routeId = 'route-about'
    aboutMobile.routeId = 'route-about'
    evidence.pages.push(aboutDesktop, aboutMobile)

    const sectionTemplate = evidence.sections.find(
      (section) => section.pageId === homeDesktop.id && section.role === 'navigation',
    )!
    const section = (id: string, pageId: string) => ({
      ...structuredClone(sectionTemplate),
      id,
      pageId,
      role: 'content' as const,
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: [],
    })
    const sections = {
      homeDesktopA: section('responsive-home-desktop-a', homeDesktop.id),
      homeDesktopB: section('responsive-home-desktop-b', homeDesktop.id),
      homeMobileA: section('responsive-home-mobile-a', homeMobile.id),
      homeMobileB: section('responsive-home-mobile-b', homeMobile.id),
      aboutDesktopA: section('responsive-about-desktop-a', aboutDesktop.id),
      aboutDesktopB: section('responsive-about-desktop-b', aboutDesktop.id),
      aboutMobileA: section('responsive-about-mobile-a', aboutMobile.id),
      aboutMobileB: section('responsive-about-mobile-b', aboutMobile.id),
    }
    evidence.sections.push(...Object.values(sections))

    const observation = (
      id: string,
      desktopSection: (typeof sections)['homeDesktopA'],
      mobileSection: (typeof sections)['homeMobileA'],
      from: string,
      to: string,
    ) => ({
      id,
      sectionId: desktopSection.id,
      fromViewport: 'desktop',
      toViewport: 'mobile',
      changeType: 'reflow' as const,
      changedProperties: ['gridTemplateColumns'],
      changes: { gridTemplateColumns: { from, to } },
      summary: 'Observed grid change.',
      evidenceRefs: [desktopSection.id, mobileSection.id],
    })
    evidence.responsiveObservations = [
      observation('responsive-home-a', sections.homeDesktopA, sections.homeMobileA, 'repeat(3, 1fr)', '1fr'),
      observation('responsive-home-b', sections.homeDesktopB, sections.homeMobileB, 'repeat(3, 1fr)', '1fr'),
      observation('responsive-about-a', sections.aboutDesktopA, sections.aboutMobileA, 'repeat(3, 1fr)', '1fr'),
      observation(
        'responsive-about-b',
        sections.aboutDesktopB,
        sections.aboutMobileB,
        'repeat(4, 1fr)',
        'repeat(2, 1fr)',
      ),
    ]

    const english = generateDesignEvidenceBrief(evidence, 'en')
    const chinese = generateDesignEvidenceBrief(evidence, 'zh-CN')
    const englishResponsive = english.match(/### Responsive Structure Observations\n([\s\S]*?)(?=\n### |$)/)?.[1] || ''
    const chineseResponsive = chinese.match(/### 响应式结构观察\n([\s\S]*?)(?=\n### |$)/)?.[1] || ''

    expect(englishResponsive.match(/^- .*support:/gm)).toHaveLength(2)
    expect(englishResponsive).toContain('support: 2 routes · 3 observed instances')
    expect(englishResponsive).toContain('examples: https://example.com/about; https://example.com/')
    expect(englishResponsive.match(/repeat\(3, 1fr\) → 1fr/g)).toHaveLength(1)
    expect(englishResponsive).toContain('repeat(4, 1fr) → repeat(2, 1fr)')
    expect(chineseResponsive).toContain('支持：2 个路由 · 3 个观察实例')
    expect(chineseResponsive.match(/repeat\(3, 1fr\) → 1fr/g)).toHaveLength(1)
  })

  it('uses human-readable role and duration labels in DESIGN.md', () => {
    const evidence = buildFixtureEvidence()
    evidence.sections[0].role = 'unknown'
    evidence.sections[0].observedStyles = { layout: { maxWidth: '960px' } }
    const durationTokens = { ...tokens, transitions: ['0.1s', '0.15s', '0.2s', '0.25s', '0.3s', '0.5s'] }

    const document = generateDesignDoc(
      durationTokens,
      evidence.source.requestedUrl,
      [],
      undefined,
      [],
      [],
      'en',
      evidence,
    )

    expect(document).toContain(
      '- content · 1 independent owner · scope: `desktop` https://example.com/ — `max-width: 960px` · `position: sticky`',
    )
    expect(document).not.toContain('section-')
    expect(document).toContain('- duration-6: `0.5s`')
    expect(document).not.toContain('- 5: `0.5s`')
    expect(document).toContain('**Key structure:**')
  })

  it('orders typography role values by observed frequency', () => {
    const evidence = buildFixtureEvidence()
    const exemplar = evidence.layoutNodes[0]
    evidence.layoutNodes.push(
      {
        ...exemplar,
        id: 'body-rare',
        textRole: 'body',
        tokenRefs: [],
        observedTypography: { fontFamily: 'Rare Face', fontSize: '19px', fontWeight: '500', lineHeight: '47px' },
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        ...exemplar,
        id: `body-common-${index}`,
        textRole: 'body' as const,
        tokenRefs: [],
        observedTypography: { fontFamily: 'Common Face', fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
      })),
    )

    const brief = generateDesignEvidenceBrief(evidence)
    const bodyRow = brief.split('\n').find((line) => line.startsWith('| `body`')) || ''

    expect(bodyRow.indexOf('Common Face')).toBeLessThan(bodyRow.indexOf('Rare Face'))
    expect(bodyRow.indexOf('16px')).toBeLessThan(bodyRow.indexOf('19px'))
    expect(bodyRow.indexOf('1.5')).toBeLessThan(bodyRow.indexOf('2.474'))
  })

  it('renders free-form tab and status Evidence without adding them to standard frontmatter component types', () => {
    const evidence = buildFixtureEvidence()
    const exemplar = evidence.components[0]
    evidence.components.push(
      { ...exemplar, id: 'tab-evidence', type: 'tab', elementKind: 'button', role: 'tab' },
      { ...exemplar, id: 'status-evidence', type: 'status', elementKind: 'status', role: 'status' },
      {
        ...exemplar,
        id: 'tab-mobile-evidence',
        pageId: evidence.pages.find((page) => page.viewport === 'mobile')!.id,
        type: 'tab',
        elementKind: 'button',
        role: 'tab',
      },
      {
        ...exemplar,
        id: 'status-mobile-evidence',
        pageId: evidence.pages.find((page) => page.viewport === 'mobile')!.id,
        type: 'status',
        elementKind: 'status',
        role: 'status',
      },
    )
    const document = generateDesignDoc(tokens, evidence.source.requestedUrl, [], undefined, [], [], 'en', evidence)
    const frontMatter = parse(document.match(/^---\n([\s\S]*?)\n---/)?.[1] || '')

    expect(document).toContain('- tab: 1 observed patterns, 1 canonical instances, 0 reusable exact-style patterns')
    expect(document).toContain(
      '- status indicator: 1 observed patterns, 1 canonical instances, 0 reusable exact-style patterns',
    )
    expect(frontMatter.components || {}).not.toHaveProperty('tab')
    expect(frontMatter.components || {}).not.toHaveProperty('status')
  })

  it('exports structural section radii and gradient evidence without adding compound radii to the scalar scale', () => {
    const evidence = buildFixtureEvidence()
    evidence.sections[0].observedStyles = {
      borderRadius: '0px 0px 48px 48px',
      gradient: {
        type: 'linear-gradient',
        direction: '160deg',
        stops: ['rgb(255, 237, 213)', 'rgb(254, 215, 170)'],
        value: 'linear-gradient(160deg, rgb(255, 237, 213), rgb(254, 215, 170))',
      },
    }
    evidence.sections[1].observedStyles = { borderRadius: '48px 48px 0px 0px' }
    const document = generateDesignDoc(tokens, evidence.source.requestedUrl, [], undefined, [], [], 'en', evidence)
    const frontMatter = parse(document.match(/^---\n([\s\S]*?)\n---/)?.[1] || '')

    expect(document).toContain('linear-gradient(160deg, rgb(255, 237, 213), rgb(254, 215, 170))')
    expect(document).toContain('0px 0px 48px 48px')
    expect(document).toContain('48px 48px 0px 0px')
    expect(Object.values(frontMatter.rounded)).not.toContain('48px 48px 0px 0px')
  })

  it('keeps the healthy entry-page identity and ignores sub-page titles', () => {
    const entry = createSnapshot('desktop', 1440)
    entry.applicationName = 'Home'
    entry.openGraphSiteName = 'Bubblebox'
    entry.title = 'Bubblebox — Snacks that pop'
    const subPage = { ...createSnapshot('mobile', 375), url: 'https://example.com/account', title: 'Account Settings' }
    const evidence = buildDesignEvidence({
      analysisId: 'identity-analysis',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 2,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: entry.url, path: 'entry.png', viewport: 'desktop' }, snapshot: entry },
        { screenshot: { url: subPage.url, path: 'sub.png', viewport: 'mobile' }, snapshot: subPage },
      ],
    })

    expect(evidence.source).toMatchObject({ siteName: 'Bubblebox', title: 'Bubblebox — Snacks that pop' })
    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'en', evidence)
    const frontMatter = parse(document.match(/^---\n([\s\S]*?)\n---/)?.[1] || '')
    expect(frontMatter.name).toBe('Bubblebox')
  })

  it('uses a generic title segment only to recover a concise site name', () => {
    const evidence = buildFixtureEvidence()
    evidence.source.title = '首页 - 知乎'
    delete evidence.source.siteName

    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'zh-CN', evidence)
    const frontMatter = parse(document.match(/^---\n([\s\S]*?)\n---/)?.[1] || '')
    const summary = document.slice(document.indexOf('### 重建摘要'), document.indexOf('## Colors'))

    expect(frontMatter.name).toBe('知乎')
    expect(summary).toContain('本次分析覆盖 知乎 的当前捕获页面')
    expect(summary).not.toContain('本次分析覆盖 首页 - 知乎')
  })

  it('keeps old schema v1 JSON without optional identity fields compatible', () => {
    const legacyEvidence = JSON.parse(generateDesignEvidenceJson(buildFixtureEvidence()))
    delete legacyEvidence.source.title
    delete legacyEvidence.source.siteName
    legacyEvidence.pages.forEach((page: Record<string, unknown>) => {
      delete page.title
      delete page.siteName
    })

    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'en', legacyEvidence)
    const frontMatter = parse(document.match(/^---\n([\s\S]*?)\n---/)?.[1] || '')
    expect(legacyEvidence.schemaVersion).toBe('1')
    expect(frontMatter.name).toBe('example.com Design System')
  })

  it('creates stable traceable IDs and preserves deterministic tokens', () => {
    expect(createEvidenceId('section', 'page', 'hero:1')).toBe(createEvidenceId('section', 'page', 'hero:1'))

    const first = buildFixtureEvidence()
    const second = buildFixtureEvidence()

    expect(first.pages.map((page) => page.id)).toEqual(second.pages.map((page) => page.id))
    expect(first.sections.map((section) => section.id)).toEqual(second.sections.map((section) => section.id))
    expect(first.tokens).toEqual(tokens)
    expect(first.pages[0].images.map((image) => image.kind)).toEqual(['overview', 'region-crop'])
    expect(first.components).toHaveLength(2)
    expect(first.components[0].evidenceRefs).toContain(first.components[0].sectionId)
    const desktopRegion = first.pages[0].images.find((image) => image.kind === 'region-crop')!
    expect(first.components[0].evidenceRefs).toContain(desktopRegion.id)
    expect(first.sections.find((section) => section.role === 'hero')?.evidenceRefs).toContain(desktopRegion.id)
    expect(
      first.responsiveObservations.some((observation) => observation.evidenceRefs.includes(desktopRegion.id)),
    ).toBe(true)
    expect(first.components[0].tokenRefs).toEqual(
      expect.arrayContaining(['color.primary', 'radius.1', 'spacing.1', 'spacing.2']),
    )
    expect(first.layoutNodes[0].observedTypography).toMatchObject({
      fontFamily: 'Inter',
      fontSize: '32px',
      fontWeight: '700',
      lineHeight: '48px',
    })
  })

  it('assigns unique stable IDs when a snapshot defensively contains repeated keys', () => {
    const snapshot = createSnapshot('desktop', 1440)
    snapshot.components.push({
      ...structuredClone(snapshot.components[0]),
      rect: { x: 0.5, y: 0.3, width: 0.2, height: 0.04 },
      styles: { ...snapshot.components[0].styles, backgroundColor: 'rgba(0, 0, 0, 0)' },
    })
    snapshot.layoutNodes.push({
      ...structuredClone(snapshot.layoutNodes[0]),
      rect: { x: 0.2, y: 0.5, width: 0.5, height: 0.08 },
    })
    snapshot.mediaLayers = [
      {
        key: 'image:repeated',
        sectionKey: 'hero:1',
        kind: 'image',
        role: 'decorative',
        importance: 'major',
        rect: { x: 0.1, y: 0.6, width: 0.2, height: 0.1 },
      },
      {
        key: 'image:repeated',
        sectionKey: 'hero:1',
        kind: 'image',
        role: 'product',
        importance: 'major',
        rect: { x: 0.4, y: 0.6, width: 0.2, height: 0.1 },
      },
    ]
    snapshot.ariaStates = [
      { key: 'aria:repeated', sectionKey: 'hero:1', attribute: 'aria-expanded', value: 'false' },
      { key: 'aria:repeated', sectionKey: 'hero:1', attribute: 'aria-expanded', value: 'true' },
    ]
    const build = () =>
      buildDesignEvidence({
        analysisId: 'analysis-duplicate-keys',
        requestedUrl: snapshot.url,
        finalUrl: snapshot.url,
        accessMode: 'anonymous',
        expectedPageCount: 1,
        tokens,
        featureTags: [],
        interactionStyles: { hover: [], focus: [], active: [] },
        breakpoints: [],
        motion: [],
        captures: [{ screenshot: { url: snapshot.url, path: '', viewport: 'desktop' }, snapshot }],
      })

    const first = build()
    const second = build()
    for (const collection of [first.components, first.layoutNodes, first.mediaLayers, first.interactionObservations]) {
      expect(new Set(collection.map((item) => item.id)).size).toBe(collection.length)
    }
    expect(first.components.map((item) => item.id)).toEqual(second.components.map((item) => item.id))
    expect(first.sections.find((section) => section.role === 'hero')?.componentRefs).toEqual(
      first.components.map((component) => component.id),
    )
    expect(first.sections.find((section) => section.role === 'hero')?.mediaLayerRefs).toEqual(
      first.mediaLayers.map((media) => media.id),
    )
  })

  it('records topology, viewport differences, coverage, and explicit limitations', () => {
    const evidence = buildFixtureEvidence()

    expect(evidence.topology.pages).toHaveLength(2)
    expect(evidence.topology.pages[0].sectionIds).toHaveLength(2)
    expect(evidence.topology.globalLayers).toHaveLength(2)
    expect(evidence.responsiveObservations.length).toBeGreaterThan(0)
    expect(evidence.coverage).toMatchObject({
      pageCoverage: 'complete',
      urlCoverage: { requested: 1, captured: 1 },
      captureCoverage: {
        expected: 2,
        captured: 2,
        status: 'complete',
        requestedViewports: ['desktop', 'mobile'],
      },
      sectionCoverage: 1,
      viewportCoverage: ['desktop', 'mobile'],
    })
    expect(evidence.limitations).not.toContain('single-viewport')
    expect(evidence.limitations).not.toContain('some-safe-interactions-skipped')
    expect(evidence.interactionObservations).toEqual(
      expect.arrayContaining([expect.objectContaining({ driver: 'hover', safety: 'passive' })]),
    )
    const brief = generateDesignEvidenceBrief(evidence)
    expect(brief).toContain('Non-click states: hover ×1')
    expect(brief).toContain('Non-click evidence properties: color ×1')
    expect(brief).not.toContain('`target-')
    expect(brief).not.toContain('unknown →')
    expect(brief).not.toContain('rect.width')
    expect(brief).toContain('Coverage: 1/1 selected URLs observed; adaptive capture plan 2/2 (complete)')
    expect(brief).toContain('Full selected URL × requested viewport matrix: 2/2 captured (complete)')
    expect(brief).toContain('Responsive comparison pairs: 1/1 selected URLs')
  })

  it('uses one page identity when responsive captures differ only by fragment', () => {
    const desktop = createSnapshot('desktop', 1440)
    const mobile = createSnapshot('mobile', 375)
    desktop.url = 'https://example.com/?theme=light#top'
    mobile.url = 'https://example.com/?theme=light#menu'

    const evidence = buildDesignEvidence({
      analysisId: 'analysis-url-identity',
      requestedUrl: desktop.url,
      finalUrl: desktop.url,
      accessMode: 'anonymous',
      expectedPageCount: 1,
      expectedViewports: ['desktop', 'mobile'],
      expectedCaptureCount: 2,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: desktop.url, path: 'desktop.png', viewport: 'desktop' }, snapshot: desktop },
        { screenshot: { url: mobile.url, path: 'mobile.png', viewport: 'mobile' }, snapshot: mobile },
      ],
    })

    expect(evidence.responsiveObservations.length).toBeGreaterThan(0)
    expect(evidence.coverage).toMatchObject({
      pageCoverage: 'complete',
      urlCoverage: { requested: 1, captured: 1 },
      captureCoverage: {
        expected: 2,
        captured: 2,
        status: 'complete',
        responsivePairs: { expectedUrls: 1, capturedUrls: 1, status: 'complete' },
      },
    })
    expect(evidence.topology.crossPagePatternIds).toEqual([])
    expect(evidence.limitations).not.toContain('fewer-page-viewports-than-requested')
    expect(evidence.limitations).toContain('query-route-redacted')
    expect(new Set(evidence.pages.map((page) => page.routeId)).size).toBe(1)
  })

  it('keeps query-routed documents distinct while public artifacts redact their query text', () => {
    const queryUrls = [
      'https://example.com/app?doc=route_alpha_secret',
      'https://example.com/app?doc=route_beta_secret',
    ]
    const queryTokenEvidence: TokenEvidence = {
      value: '#ffffff',
      confidence: 'high',
      measurementConfidence: 'high',
      semanticConfidence: 'high',
      reuseScope: 'foundation',
      observationCount: 4,
      ownerCount: 2,
      semanticAgreement: 1,
      pageCount: 2,
      captureCount: 4,
      eligiblePageCount: 2,
      pageSupportRatio: 1,
      pages: queryUrls,
      sources: ['computed:background'],
      roleCounts: { background: 2 },
      reasons: ['cross-page', 'rendered-use', 'computed-style'],
    }
    const queryForegroundEvidence: TokenEvidence = {
      ...queryTokenEvidence,
      value: '#111827',
      observationCount: 2,
      ownerCount: 2,
      captureCount: 2,
      sources: ['rendered:text', 'observed:text-background-pair'],
      reasons: ['cross-page', 'rendered-use', 'computed-style', 'paired-surface'],
      renderedTextOwners: queryUrls.map((page, index) => ({
        page,
        routeId: opaqueRouteIdentity(page),
        viewport: 'desktop',
        ownerId: `query-text-owner-${index}`,
        textRole: 'body',
        styles: {
          color: '#111827',
          backgroundColor: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '24px',
          letterSpacing: 'normal',
        },
        source: layoutTextSource('#111827'),
      })),
      pairedSurface: {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        normalizedMainTextShare: 1,
        ownerCount: 2,
        minimumPageOwnerCount: 1,
        mainTextPageCount: 2,
        mainTextOwnerCount: 2,
        headingPageCount: 0,
        headingOwnerCount: 0,
        contrastRatio: 17.74,
        textRoles: ['body'],
        routeSupport: queryUrls.map((page, index) => ({
          page,
          routeId: opaqueRouteIdentity(page),
          supported: true,
          ownerIds: [`query-text-owner-${index}`],
          totalOwnerIds: [`query-text-owner-${index}`],
          mainTextOwnerIds: [`query-text-owner-${index}`],
          headingOwnerIds: [],
          textRoles: ['body'],
          normalizedShare: 1,
          normalizedMainTextShare: 1,
        })),
      },
    }
    const queryTokens: DesignToken = {
      ...structuredClone(tokens),
      evidence: { 'colors.background': queryTokenEvidence, 'colors.foreground': queryForegroundEvidence },
      candidates: {
        values: [
          {
            id: 'candidate.colors.query-background',
            group: 'colors',
            role: 'background',
            value: '#f8fafc',
            provenance: 'observed-color',
            rejectionReason: 'unassigned-role',
            evidence: { ...queryTokenEvidence, value: '#f8fafc' },
          },
        ],
      },
    }
    const captures = [
      ['desktop', 1440, 'route_alpha_secret'],
      ['mobile', 375, 'route_alpha_secret'],
      ['desktop', 1440, 'route_beta_secret'],
      ['mobile', 375, 'route_beta_secret'],
    ].map(([viewport, width, document]) => {
      const snapshot = createSnapshot(viewport as 'desktop' | 'mobile', Number(width))
      snapshot.url = `https://example.com/app?doc=${document}`
      return {
        screenshot: { url: snapshot.url, path: `query-route-${viewport}.png`, viewport: String(viewport) },
        snapshot,
      }
    })

    const buildQueryEvidence = (orderedCaptures: typeof captures) =>
      buildDesignEvidence({
        analysisId: 'analysis-query-routes',
        requestedUrl: captures[0].snapshot.url,
        finalUrl: captures[0].snapshot.url,
        accessMode: 'anonymous',
        expectedPageCount: 2,
        expectedViewports: ['desktop', 'mobile'],
        expectedCaptureCount: 4,
        tokens: queryTokens,
        featureTags: [],
        interactionStyles: { hover: [], focus: [], active: [] },
        breakpoints: [],
        motion: [],
        captures: orderedCaptures,
      })

    const evidence = buildQueryEvidence(captures)
    const reorderedEvidence = buildQueryEvidence([...captures].reverse())

    const routeIds = [...new Set(evidence.pages.map((page) => page.routeId))]
    const entryRouteId = evidence.pages.find((page) => page.url === captures[0].snapshot.url)?.routeId
    expect(routeIds).toHaveLength(2)
    expect(routeIds.every((routeId) => /^route-[a-f\d]{12}$/.test(routeId || ''))).toBe(true)
    expect(evidence.pages).toHaveLength(4)
    expect(evidence.coverage).toMatchObject({
      urlCoverage: { requested: 2, captured: 2 },
      captureCoverage: {
        expected: 4,
        captured: 4,
        responsivePairs: { expectedUrls: 2, capturedUrls: 2, status: 'complete' },
      },
    })
    expect(evidence.responsiveObservations.length).toBeGreaterThan(0)
    expect(Object.fromEntries(evidence.pages.map((page) => [page.url, page.routeId]))).toEqual(
      Object.fromEntries(reorderedEvidence.pages.map((page) => [page.url, page.routeId])),
    )
    expect(evidence.source.routeId).toBe(entryRouteId)
    expect(reorderedEvidence.source.routeId).toBe(entryRouteId)
    expect(new Set(evidence.tokens.evidence?.['colors.background']?.pageRefs)).toEqual(new Set(routeIds))
    expect(
      new Set(evidence.tokens.evidence?.['colors.foreground']?.renderedTextOwners?.map((owner) => owner.routeId)),
    ).toEqual(new Set(routeIds))
    expect(
      new Set(
        evidence.tokens.evidence?.['colors.foreground']?.pairedSurface?.routeSupport.map((route) => route.routeId),
      ),
    ).toEqual(new Set(routeIds))
    expect(new Set(evidence.tokens.candidates?.values?.[0]?.evidence.pageRefs)).toEqual(new Set(routeIds))

    const persisted = generateDesignEvidenceJson(evidence)
    expect(persisted).not.toContain('doc=')
    expect(persisted).not.toContain('route_alpha_secret')
    expect(persisted).not.toContain('route_beta_secret')
    const persistedEvidence = JSON.parse(persisted) as typeof evidence
    expect(new Set(persistedEvidence.pages.map((page) => page.url))).toEqual(new Set(['https://example.com/app']))
    expect(new Set(persistedEvidence.pages.map((page) => page.routeId))).toEqual(new Set(routeIds))
    expect(persistedEvidence.source.routeId).toBe(entryRouteId)
    expect(new Set(persistedEvidence.tokens.evidence?.['colors.background']?.pageRefs)).toEqual(new Set(routeIds))
    expect(
      new Set(
        persistedEvidence.tokens.evidence?.['colors.foreground']?.renderedTextOwners?.map((owner) => owner.routeId),
      ),
    ).toEqual(new Set(routeIds))
    expect(
      new Set(
        persistedEvidence.tokens.evidence?.['colors.foreground']?.pairedSurface?.routeSupport.map(
          (route) => route.routeId,
        ),
      ),
    ).toEqual(new Set(routeIds))
    expect(
      new Set(persistedEvidence.tokens.evidence?.['colors.foreground']?.renderedTextOwners?.map((owner) => owner.page)),
    ).toEqual(new Set(['https://example.com/app']))
    expect(new Set(persistedEvidence.tokens.candidates?.values?.[0]?.evidence.pageRefs)).toEqual(new Set(routeIds))
  })

  it('accounts for observed role sizes outside the reusable typography scale', () => {
    const evidence = buildFixtureEvidence()
    evidence.layoutNodes.forEach((node) => {
      const page = evidence.pages.find((candidate) => candidate.id === node.pageId)
      node.tokenRefs = node.tokenRefs.filter((ref) => !ref.startsWith('typography.font-size.'))
      node.observedTypography = {
        ...node.observedTypography,
        fontSize: page?.viewport === 'mobile' ? '36px' : '48px',
      }
    })

    const document = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'en', evidence)

    expect(document).toContain('**Reusable font-size scale:** 1rem, 2rem')
    expect(document).toContain('**Observed role-specific size exceptions:**')
    expect(document).toContain('- `display`: `36px`, `48px`')
    expect(document).toContain('do not generalize them as new global steps')
  })

  it('reports URL coverage separately from missing page×viewport captures', () => {
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-partial-captures',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      expectedViewports: ['desktop', 'mobile'],
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\desktop.png', viewport: 'desktop' },
          snapshot: createSnapshot('desktop', 1440),
        },
      ],
    })

    expect(evidence.coverage.pageCoverage).toBe('complete')
    expect(evidence.coverage.captureCoverage).toMatchObject({ expected: 2, captured: 1, status: 'partial' })
    expect(evidence.limitations).toContain('fewer-page-viewports-than-requested')
    expect(generateDesignEvidenceBrief(evidence)).toContain('adaptive capture plan 1/2 (partial)')
    expect(generateDesignEvidenceBrief(evidence)).toContain('Responsive comparison pairs: 0/1 selected URLs')
  })

  it('rejects contradictory structured coverage before exporting DESIGN.md', () => {
    const evidence = buildFixtureEvidence()
    evidence.coverage.captureCoverage!.fullMatrix!.status = 'partial'

    const integrity = validateDesignDocSemantics(tokens, evidence)

    expect(integrity.valid).toBe(false)
    expect(integrity.errors).toContain('capture-matrix:status-partial-but-2-of-2')
    expect(() => generateDesignDoc(tokens, undefined, undefined, undefined, undefined, [], 'en', evidence)).toThrow(
      'DESIGN.md semantic integrity failed',
    )
  })

  it('uses the analyzer adaptive capture plan instead of a page×viewport Cartesian product', () => {
    const captures = [
      ['https://example.com/', 'desktop', 1440],
      ['https://example.com/', 'mobile', 375],
      ['https://example.com/article', 'desktop', 1440],
      ['https://example.com/article', 'mobile', 375],
      ['https://example.com/profile', 'desktop', 1440],
    ] as const
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-adaptive-capture-plan',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 3,
      expectedViewports: ['desktop', 'mobile'],
      expectedCaptureCount: 5,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: captures.map(([url, viewport, width], index) => {
        const snapshot = createSnapshot(viewport, width)
        snapshot.url = url
        return { screenshot: { url, path: `capture-${index}.png`, viewport }, snapshot }
      }),
    })

    expect(evidence.coverage.captureCoverage).toMatchObject({ expected: 5, captured: 5, status: 'complete' })
    expect(evidence.limitations).not.toContain('fewer-page-viewports-than-requested')
  })

  it('does not let a supplemental capture fill a missing requested viewport slot', () => {
    const captures = [
      ['https://example.com/', 'desktop', 1440],
      ['https://example.com/article', 'desktop', 1440],
      ['https://example.com/article', 'mobile', 375],
    ] as const
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-missing-requested-mobile',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 2,
      expectedViewports: ['desktop', 'mobile'],
      expectedCaptureCount: 3,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: captures.map(([url, viewport, width], index) => {
        const snapshot = createSnapshot(viewport, width)
        snapshot.url = url
        return {
          screenshot: { url, path: `capture-${index}.png`, viewport },
          snapshot,
          ...(index === 2 ? { captureScope: 'supplemental' as const } : {}),
        }
      }),
    })

    expect(evidence.coverage.viewportCoverage).toEqual(['desktop', 'mobile'])
    expect(evidence.coverage.captureCoverage).toMatchObject({
      expected: 3,
      captured: 2,
      status: 'partial',
      requestedViewports: ['desktop', 'mobile'],
      fullMatrix: { expected: 4, captured: 2, status: 'partial' },
      responsivePairs: { expectedUrls: 2, capturedUrls: 0, status: 'partial' },
    })
    expect(evidence.limitations).toContain('fewer-page-viewports-than-requested')
  })

  it('does not count a supplemental viewport as part of the requested capture matrix', () => {
    const captures = [
      ['https://example.com/', 'desktop', 1440],
      ['https://example.com/article', 'desktop', 1440],
      ['https://example.com/article', 'mobile', 375],
    ] as const
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-supplemental-mobile',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 2,
      expectedViewports: ['desktop'],
      expectedCaptureCount: 2,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: captures.map(([url, viewport, width], index) => {
        const snapshot = createSnapshot(viewport, width)
        snapshot.url = url
        return {
          screenshot: { url, path: `capture-${index}.png`, viewport },
          snapshot,
          ...(index === 2 ? { captureScope: 'supplemental' as const } : {}),
        }
      }),
    })

    expect(evidence.pages).toHaveLength(3)
    expect(evidence.coverage.captureCoverage).toMatchObject({
      expected: 2,
      captured: 2,
      status: 'complete',
      requestedViewports: ['desktop'],
      fullMatrix: { expected: 2, captured: 2, status: 'complete' },
    })
    expect(evidence.coverage.captureCoverage?.responsivePairs).toBeUndefined()
    expect(evidence.limitations).not.toContain('fewer-page-viewports-than-requested')
  })

  it('counts unique requested URL and viewport combinations for capture coverage', () => {
    const desktop = createSnapshot('desktop', 1440)
    const duplicateDesktop = createSnapshot('desktop', 1440)
    const unrequestedTablet = createSnapshot('tablet', 768)
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-duplicate-captures',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      expectedViewports: ['desktop', 'mobile'],
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [desktop, duplicateDesktop, unrequestedTablet].map((snapshot, index) => ({
        screenshot: {
          url: 'https://example.com/',
          path: `capture-${index}.png`,
          viewport: snapshot.viewport,
        },
        snapshot,
      })),
    })

    expect(evidence.coverage.captureCoverage).toMatchObject({ expected: 2, captured: 1, status: 'partial' })
    expect(evidence.limitations).toContain('fewer-page-viewports-than-requested')
  })

  it('diffs adjacent viewport pairs for three-viewport analyses', () => {
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-3vp',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: ['responsive'],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\desktop.png', viewport: 'desktop' },
          snapshot: createSnapshot('desktop', 1440),
        },
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\tablet.png', viewport: 'tablet' },
          snapshot: createSnapshot('tablet', 768),
        },
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\mobile.png', viewport: 'mobile' },
          snapshot: createSnapshot('mobile', 375),
        },
      ],
    })

    const pairs = evidence.responsiveObservations.map(
      (observation) => `${observation.fromViewport}->${observation.toViewport}`,
    )
    expect(pairs).toContain('desktop->tablet')
    expect(pairs).toContain('tablet->mobile')
    expect(pairs).not.toContain('desktop->mobile')
    expect(evidence.coverage.viewportCoverage).toEqual(['desktop', 'tablet', 'mobile'])
  })

  it('rejects cross-viewport pairs when the semantic section identity changes', () => {
    const desktop = createSnapshot('desktop', 1440)
    const mobile = createSnapshot('mobile', 375)
    const mobileHero = mobile.sections.find((section) => section.key === 'hero:1')!
    mobileHero.role = 'feature-group'
    mobileHero.order = 0
    mobileHero.rect.height = 0.8

    const evidence = buildDesignEvidence({
      analysisId: 'analysis-responsive-identity',
      requestedUrl: desktop.url,
      finalUrl: desktop.url,
      accessMode: 'anonymous',
      expectedPageCount: 1,
      expectedViewports: ['desktop', 'mobile'],
      tokens,
      featureTags: ['responsive'],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: desktop.url, path: 'desktop.png', viewport: 'desktop' }, snapshot: desktop },
        { screenshot: { url: mobile.url, path: 'mobile.png', viewport: 'mobile' }, snapshot: mobile },
      ],
    })
    const desktopPage = evidence.pages.find((page) => page.viewport === 'desktop')!
    const desktopHero = evidence.sections.find(
      (section) => section.pageId === desktopPage.id && section.role === 'hero',
    )!

    expect(evidence.responsiveObservations.some((observation) => observation.sectionId === desktopHero.id)).toBe(false)
    expect(evidence.limitations).toContain('responsive-section-identity-mismatch')
    expect(generateDesignEvidenceBrief(evidence, 'en')).toContain('lacked a unique semantic identity across viewports')
  })

  it('does not reinterpret a viewport-specific section label as hide and show behavior', () => {
    const desktop = createSnapshot('desktop', 1440)
    const mobile = createSnapshot('mobile', 375)
    const desktopHero = desktop.sections.find((section) => section.key === 'hero:1')!
    const mobileHero = mobile.sections.find((section) => section.key === 'hero:1')!
    desktopHero.identityKey = 'section:hero:desktop-heading'
    mobileHero.identityKey = 'section:hero:mobile-heading'
    mobileHero.styles.paddingTop = '16px'

    const evidence = buildDesignEvidence({
      analysisId: 'analysis-responsive-label-change',
      requestedUrl: desktop.url,
      finalUrl: desktop.url,
      accessMode: 'anonymous',
      expectedPageCount: 1,
      expectedViewports: ['desktop', 'mobile'],
      tokens,
      featureTags: ['responsive'],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: desktop.url, path: 'desktop.png', viewport: 'desktop' }, snapshot: desktop },
        { screenshot: { url: mobile.url, path: 'mobile.png', viewport: 'mobile' }, snapshot: mobile },
      ],
    })

    expect(
      evidence.responsiveObservations.some(
        (observation) =>
          observation.changeType === 'visibility' || observation.changedProperties.includes('visibility'),
      ),
    ).toBe(false)
    expect(
      evidence.responsiveObservations.some((observation) => observation.changedProperties.includes('paddingTop')),
    ).toBe(false)
    expect(evidence.limitations).toContain('responsive-section-identity-mismatch')
  })

  it('does not pair an unlabeled responsive section by its capture-local path', () => {
    const desktop = createSnapshot('desktop', 1_440)
    const mobile = createSnapshot('mobile', 375)
    const desktopHero = desktop.sections.find((section) => section.key === 'hero:1')!
    const mobileHero = mobile.sections.find((section) => section.key === 'hero:1')!
    delete desktopHero.identityKey
    delete mobileHero.identityKey
    desktopHero.styles.gridTemplateColumns = 'repeat(4, 1fr)'
    mobileHero.styles.gridTemplateColumns = 'repeat(2, 1fr)'

    const evidence = buildDesignEvidence({
      analysisId: 'analysis-unlabeled-responsive-section',
      requestedUrl: desktop.url,
      finalUrl: desktop.url,
      accessMode: 'anonymous',
      expectedPageCount: 1,
      expectedViewports: ['desktop', 'mobile'],
      tokens,
      featureTags: ['responsive'],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: desktop.url, path: 'desktop.png', viewport: 'desktop' }, snapshot: desktop },
        { screenshot: { url: mobile.url, path: 'mobile.png', viewport: 'mobile' }, snapshot: mobile },
      ],
    })

    expect(
      evidence.responsiveObservations.some((observation) =>
        observation.changedProperties.includes('gridTemplateColumns'),
      ),
    ).toBe(false)
    expect(evidence.limitations).toContain('responsive-section-identity-mismatch')
  })

  it('pairs reordered sections by semantic identity instead of capture-local nth-of-type paths', () => {
    const desktop = createSnapshot('desktop', 1440)
    const mobile = createSnapshot('mobile', 375)
    const desktopHero = desktop.sections.find((section) => section.role === 'hero')!
    const mobileHero = mobile.sections.find((section) => section.role === 'hero')!
    desktopHero.key = 'body > main:nth-of-type(1) > section:nth-of-type(1)'
    desktop.components[0].sectionKey = desktopHero.key
    desktop.layoutNodes[0].sectionKey = desktopHero.key
    mobileHero.key = 'body > main:nth-of-type(1) > section:nth-of-type(2)'
    mobileHero.order = 2
    mobile.components[0].sectionKey = mobileHero.key
    mobile.layoutNodes[0].sectionKey = mobileHero.key
    mobile.sections.push({
      key: 'body > main:nth-of-type(1) > section:nth-of-type(1)',
      identityKey: 'section:content:mobile-promotion',
      order: 1,
      role: 'content',
      rect: { x: 0.05, y: 0.1, width: 0.9, height: 0.08 },
      layoutMode: 'flow',
      styles: { display: 'block' },
    })

    const evidence = buildDesignEvidence({
      analysisId: 'analysis-responsive-semantic-identity',
      requestedUrl: desktop.url,
      finalUrl: desktop.url,
      accessMode: 'anonymous',
      expectedPageCount: 1,
      expectedViewports: ['desktop', 'mobile'],
      tokens,
      featureTags: ['responsive'],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: desktop.url, path: 'desktop.png', viewport: 'desktop' }, snapshot: desktop },
        { screenshot: { url: mobile.url, path: 'mobile.png', viewport: 'mobile' }, snapshot: mobile },
      ],
    })
    const desktopPage = evidence.pages.find((page) => page.viewport === 'desktop')!
    const mobilePage = evidence.pages.find((page) => page.viewport === 'mobile')!
    const desktopHeroEvidence = evidence.sections.find(
      (section) => section.pageId === desktopPage.id && section.role === 'hero',
    )!
    const mobileHeroEvidence = evidence.sections.find(
      (section) => section.pageId === mobilePage.id && section.role === 'hero',
    )!
    const insertedMobileSection = evidence.sections.find(
      (section) => section.pageId === mobilePage.id && section.role === 'content',
    )!
    const observation = evidence.responsiveObservations.find(
      (candidate) => candidate.sectionId === desktopHeroEvidence.id,
    )!

    expect(observation).toBeDefined()
    expect(observation.evidenceRefs).toContain(mobileHeroEvidence.id)
    expect(observation.evidenceRefs).not.toContain(insertedMobileSection.id)
    expect(observation.changes.sequenceIndex).toEqual({ from: 1, to: 2 })
  })

  it('labels breakpoint discovery as partial when stylesheet rules were unreadable', () => {
    const evidence = buildFixtureEvidence()
    evidence.limitations.push('breakpoint-stylesheets-unreadable')

    const brief = generateDesignEvidenceBrief(evidence, 'en')
    const document = generateDesignDoc(
      tokens,
      undefined,
      undefined,
      undefined,
      evidence.breakpoints,
      [],
      'en',
      evidence,
    )

    expect(brief).toContain('declared breakpoint list is partial')
    expect(document).toContain('Breakpoint discovery is partial')
    expect(document).toContain('Do not treat this table as the complete declared breakpoint set')
  })

  it('records horizontal overflow instead of treating off-screen mobile content as responsive hiding', () => {
    const snapshot = createSnapshot('mobile', 1032)
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-overflow',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\mobile.png', viewport: 'mobile' },
          snapshot,
        },
      ],
    })

    expect(evidence.pages[0]).toMatchObject({
      viewportWidth: 375,
      contentWidth: 1032,
      horizontalOverflow: true,
    })
    expect(evidence.pages[0].horizontalOverflowSources?.[0]).toMatchObject({
      sectionRole: 'hero',
      sectionId: evidence.sections.find((section) => section.role === 'hero')?.id,
    })
    expect(evidence.limitations).toContain('horizontal-overflow-observed')
    const brief = generateDesignEvidenceBrief(evidence)
    expect(brief).toContain('horizontal overflow observed (content 1032px > viewport 375px)')
    expect(brief).not.toContain('section hero')
    expect(brief).not.toContain('section-')
  })

  it('uses the encoded screenshot dimensions instead of document geometry for image evidence', () => {
    const snapshot = createSnapshot('mobile', 3_568)
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-screenshot-size',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: {
            url: 'https://example.com/',
            path: 'mobile.png',
            viewport: 'mobile',
            width: 3_686,
            height: 2_294,
          },
          snapshot,
        },
      ],
    })

    expect(evidence.pages[0].images[0]).toMatchObject({ width: 3_686, height: 2_294 })
    expect(evidence.pages[0].contentWidth).toBe(3_568)
  })

  it('reports screenshot asset integrity separately from completed capture records', () => {
    const snapshot = createSnapshot('mobile', 375)
    const stage = encodeURIComponent('page-2:mobile-adaptive:screenshot:overview')
    const reason = encodeURIComponent('screenshot-dimensions-mismatch expected=375x2292 actual=375x812')
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-asset-integrity',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      expectedViewports: ['mobile'],
      expectedCaptureCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      limitations: [`extraction-issue:${stage}:${reason}`],
      captures: [
        {
          screenshot: {
            url: snapshot.url,
            path: 'mobile.png',
            viewport: 'mobile',
            width: 375,
            height: 812,
            valid: false,
          },
          snapshot,
          supplementalImages: [
            {
              kind: 'viewport-crop',
              path: 'mobile-viewport.png',
              width: 375,
              height: 812,
              valid: true,
              sourceRect: { x: 0, y: 0, width: 1, height: 0.1 },
            },
          ],
        },
      ],
    })

    expect(evidence.coverage.captureCoverage).toMatchObject({ expected: 1, captured: 1, status: 'complete' })
    expect(evidence.coverage.assetCoverage).toEqual({ expected: 1, valid: 0, status: 'partial', issueCount: 1 })
    expect(evidence.pages[0].images).toHaveLength(2)
    const partialOverview = evidence.pages[0].images.find((image) => image.path === 'mobile.png')!
    const viewportCrop = evidence.pages[0].images.find((image) => image.path === 'mobile-viewport.png')!
    expect(partialOverview.kind).toBe('region-crop')
    expect(partialOverview.sourceRect?.height).toBeCloseTo(812 / 1600)
    expect(viewportCrop.kind).toBe('viewport-crop')
    const evidenceIds = new Set([
      ...evidence.pages.flatMap((page) => [page.id, ...page.images.map((image) => image.id)]),
      ...evidence.sections.map((section) => section.id),
      ...evidence.components.map((component) => component.id),
      ...evidence.layoutNodes.map((node) => node.id),
      ...evidence.mediaLayers.map((media) => media.id),
      ...evidence.pseudoElements.map((pseudo) => pseudo.id),
      ...evidence.interactionObservations.map((observation) => observation.id),
      ...evidence.responsiveObservations.map((observation) => observation.id),
    ])
    const danglingEvidenceRefs = [
      ...evidence.sections.flatMap((section) => section.evidenceRefs),
      ...evidence.components.flatMap((component) => component.evidenceRefs),
      ...evidence.pseudoElements.flatMap((pseudo) => pseudo.evidenceRefs),
      ...evidence.interactionObservations.flatMap((observation) => observation.evidenceRefs),
      ...evidence.responsiveObservations.flatMap((observation) => observation.evidenceRefs),
      ...evidence.topology.globalLayers.flatMap((layer) => layer.evidenceRefs),
    ].filter((id) => !evidenceIds.has(id))
    expect(danglingEvidenceRefs).toEqual([])
    const navigation = evidence.sections.find((section) => section.role === 'navigation')!
    const hero = evidence.sections.find((section) => section.role === 'hero')!
    expect(navigation.evidenceRefs).toEqual(expect.arrayContaining([partialOverview.id, viewportCrop.id]))
    expect(hero.evidenceRefs).toContain(partialOverview.id)
    expect(hero.evidenceRefs).not.toContain(viewportCrop.id)
    expect(evidence.components[0].evidenceRefs).toContain(partialOverview.id)
    expect(evidence.components[0].evidenceRefs).not.toContain(viewportCrop.id)
    expect(generateDesignEvidenceBrief(evidence)).toContain(
      'Screenshot assets: 0/1 dimension-valid (partial; 1 issues)',
    )
    const legacyEvidence = structuredClone(evidence)
    delete legacyEvidence.coverage.assetCoverage
    expect(generateDesignEvidenceBrief(legacyEvidence)).toContain(
      'Screenshot assets: 0/1 dimension-valid (partial; 1 issues)',
    )
  })

  it('derives partial overview coverage from the images actually retained on each page', () => {
    const complete = createSnapshot('desktop', 1440)
    const clipped = createSnapshot('mobile', 10_374)
    clipped.url = 'https://example.com/clipped'
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-observed-asset-coverage',
      requestedUrl: complete.url,
      finalUrl: complete.url,
      accessMode: 'anonymous',
      expectedPageCount: 2,
      expectedViewports: ['desktop', 'mobile'],
      expectedCaptureCount: 2,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: {
            url: complete.url,
            path: 'complete.png',
            viewport: 'desktop',
            width: 1440,
            height: 1600,
            valid: true,
          },
          snapshot: complete,
        },
        {
          screenshot: {
            url: clipped.url,
            path: 'clipped.png',
            viewport: 'mobile',
            width: 375,
            height: 1600,
            valid: true,
          },
          snapshot: clipped,
        },
      ],
    })

    expect(evidence.coverage.captureCoverage).toMatchObject({ expected: 2, captured: 2, status: 'complete' })
    expect(evidence.coverage.assetCoverage).toEqual({ expected: 2, valid: 1, status: 'partial', issueCount: 1 })
    expect(evidence.limitations).toContain('partial-screenshot-asset-coverage')
    expect(evidence.pages.find((page) => page.url.endsWith('/clipped'))?.images[0]?.kind).toBe('region-crop')
    expect(generateDesignEvidenceBrief(evidence)).toContain(
      'Screenshot assets: 1/2 dimension-valid (partial; 1 issues)',
    )
  })

  it('cites a section crop only for entities fully contained by its source rectangle', () => {
    const snapshot = createSnapshot('desktop', 1440)
    snapshot.components.push({
      ...snapshot.components[0],
      key: 'hero:1:button:inside-crop',
      rect: { x: 0.2, y: 0.15, width: 0.2, height: 0.04 },
    })
    snapshot.components.push({
      ...snapshot.components[0],
      key: 'hero:1:button:barely-outside-crop',
      rect: { x: 0.84, y: 0.15, width: 0.011, height: 0.04 },
    })
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-partial-section-crop',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: {
            url: snapshot.url,
            path: 'overview.png',
            viewport: 'desktop',
            valid: false,
          },
          snapshot,
          supplementalImages: [
            {
              kind: 'region-crop',
              path: 'hero-partial.png',
              width: 1008,
              height: 160,
              valid: true,
              sourceRect: { x: 0.15, y: 0.12, width: 0.7, height: 0.1 },
              sectionKey: 'hero:1',
            },
          ],
        },
      ],
    })

    const cropId = evidence.pages[0].images[0].id
    const hero = evidence.sections.find((section) => section.role === 'hero')!
    const outside = evidence.components.find((component) => component.rect.y === 0.3)!
    const inside = evidence.components.find((component) => component.rect.y === 0.15)!
    const barelyOutside = evidence.components.find((component) => component.rect.x === 0.84)!
    expect(evidence.pages[0].images[0].sectionId).toBe(hero.id)
    expect(hero.evidenceRefs).not.toContain(cropId)
    expect(outside.evidenceRefs).not.toContain(cropId)
    expect(inside.evidenceRefs).toContain(cropId)
    expect(barelyOutside.evidenceRefs).not.toContain(cropId)
  })

  it('retains a readable horizontal mismatch as bounded image evidence', () => {
    const snapshot = createSnapshot('mobile', 1032)
    snapshot.components = [
      {
        ...snapshot.components[0],
        key: 'hero:1:button:inside-horizontal-crop',
        rect: { x: 0.05, y: 0.3, width: 0.1, height: 0.04 },
      },
      {
        ...snapshot.components[0],
        key: 'hero:1:button:outside-horizontal-crop',
        rect: { x: 0.7, y: 0.3, width: 0.1, height: 0.04 },
      },
    ]
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-horizontal-overview-crop',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: {
            url: snapshot.url,
            path: 'mobile-clipped.png',
            viewport: 'mobile',
            width: 375,
            height: snapshot.height,
            valid: false,
          },
          snapshot,
        },
      ],
    })

    const image = evidence.pages[0].images[0]
    const inside = evidence.components.find((component) => component.rect.x === 0.05)!
    const outside = evidence.components.find((component) => component.rect.x === 0.7)!
    expect(image).toMatchObject({
      kind: 'region-crop',
      sourceRect: { x: 0, y: 0, height: 1 },
    })
    expect(image.sourceRect?.width).toBeCloseTo(375 / 1032)
    expect(inside.evidenceRefs).toContain(image.id)
    expect(outside.evidenceRefs).not.toContain(image.id)
    expect(evidence.sections.every((section) => !section.evidenceRefs.includes(image.id))).toBe(true)
  })

  it('retains a readable vertical mismatch as bounded image evidence', () => {
    const snapshot = createSnapshot('desktop', 1440)
    snapshot.components = [
      {
        ...snapshot.components[0],
        key: 'hero:1:button:inside-vertical-crop',
        rect: { x: 0.2, y: 0.3, width: 0.2, height: 0.04 },
      },
      {
        ...snapshot.components[0],
        key: 'hero:1:button:outside-vertical-crop',
        rect: { x: 0.2, y: 0.8, width: 0.2, height: 0.04 },
      },
    ]
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-vertical-overview-crop',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: {
            url: snapshot.url,
            path: 'desktop-clipped.png',
            viewport: 'desktop',
            width: snapshot.width,
            height: 900,
            valid: false,
          },
          snapshot,
        },
      ],
    })

    const image = evidence.pages[0].images[0]
    const inside = evidence.components.find((component) => component.rect.y === 0.3)!
    const outside = evidence.components.find((component) => component.rect.y === 0.8)!
    expect(image).toMatchObject({
      kind: 'region-crop',
      sourceRect: { x: 0, y: 0, width: 1 },
    })
    expect(image.sourceRect?.height).toBeCloseTo(900 / 1600)
    expect(inside.evidenceRefs).toContain(image.id)
    expect(outside.evidenceRefs).not.toContain(image.id)
  })

  it.each([
    { name: 'horizontal', width: 2880, height: 1600, widthRatio: 2, heightRatio: 1 },
    { name: 'vertical', width: 1440, height: 3000, widthRatio: 1, heightRatio: 1.875 },
  ])(
    'retains a readable $name oversize mismatch with its bitmap scale',
    ({ name, width, height, widthRatio, heightRatio }) => {
      const snapshot = createSnapshot('desktop', 1440)
      const evidence = buildDesignEvidence({
        analysisId: `analysis-${name}-oversize-overview`,
        requestedUrl: 'https://example.com',
        finalUrl: 'https://example.com/',
        accessMode: 'anonymous',
        expectedPageCount: 1,
        tokens,
        featureTags: [],
        interactionStyles: { hover: [], focus: [], active: [] },
        breakpoints: [],
        motion: [],
        captures: [
          {
            screenshot: {
              url: snapshot.url,
              path: `${name}-oversize.png`,
              viewport: 'desktop',
              width,
              height,
              valid: false,
            },
            snapshot,
          },
        ],
      })

      const image = evidence.pages[0].images[0]
      expect(image).toMatchObject({
        kind: 'region-crop',
        sourceRect: { x: 0, y: 0 },
      })
      expect(image.sourceRect?.width).toBeCloseTo(widthRatio)
      expect(image.sourceRect?.height).toBeCloseTo(heightRatio)
      expect(evidence.sections[0].evidenceRefs).toContain(image.id)
      expect(evidence.components[0].evidenceRefs).toContain(image.id)
    },
  )

  it('does not infer responsive visibility from a horizontally clipped capture', () => {
    const desktop = createSnapshot('desktop', 1440)
    const mobile = createSnapshot('mobile', 1032)
    mobile.sections = mobile.sections.filter((section) => section.key !== 'hero:1')
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-overflow-responsive',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: 'https://example.com/', path: 'desktop.png', viewport: 'desktop' },
          snapshot: desktop,
        },
        {
          screenshot: { url: 'https://example.com/', path: 'mobile.png', viewport: 'mobile' },
          snapshot: mobile,
        },
      ],
    })

    expect(
      evidence.responsiveObservations.some(
        (observation) =>
          observation.changeType === 'visibility' && observation.changedProperties.includes('visibility'),
      ),
    ).toBe(false)
    expect(evidence.responsiveObservations).toEqual([])
  })

  it('keeps structural reflow facts while dropping geometry from moderate local overflow', () => {
    const desktop = createSnapshot('desktop', 1_440)
    const mobile = createSnapshot('mobile', 739)
    desktop.sections.find((section) => section.key === 'hero:1')!.styles.gridTemplateColumns = '190px 1fr'
    mobile.sections.find((section) => section.key === 'hero:1')!.styles.gridTemplateColumns = '1fr'
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-local-overflow-responsive',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: desktop.url, path: 'desktop.png', viewport: 'desktop' }, snapshot: desktop },
        { screenshot: { url: mobile.url, path: 'mobile.png', viewport: 'mobile' }, snapshot: mobile },
      ],
    })
    const heroReflow = evidence.responsiveObservations.find((observation) =>
      observation.changedProperties.includes('gridTemplateColumns'),
    )

    expect(heroReflow).toMatchObject({ changeType: 'reflow' })
    expect(heroReflow?.changedProperties.some((property) => property.startsWith('rect.'))).toBe(false)
  })

  it('does not report a child-grid change when one viewport has no comparable child grid', () => {
    const desktop = createSnapshot('desktop', 1_440)
    const mobile = createSnapshot('mobile', 375)
    const desktopHero = desktop.sections.find((section) => section.key === 'hero:1')!
    const mobileHero = mobile.sections.find((section) => section.key === 'hero:1')!
    desktopHero.styles.childGridTemplateColumns = 'repeat(3, 1fr)'
    mobileHero.styles.childGridTemplateColumns = ''
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-missing-child-grid',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: desktop.url, path: 'desktop.png', viewport: 'desktop' }, snapshot: desktop },
        { screenshot: { url: mobile.url, path: 'mobile.png', viewport: 'mobile' }, snapshot: mobile },
      ],
    })

    expect(
      evidence.responsiveObservations.some((observation) =>
        observation.changedProperties.includes('childGridTemplateColumns'),
      ),
    ).toBe(false)
    expect(generateDesignEvidenceBrief(evidence)).not.toContain('childGridTemplateColumns')
  })

  it('classifies a section height-only viewport difference as scale', () => {
    const desktop = createSnapshot('desktop', 1_440)
    const mobile = createSnapshot('mobile', 375)
    mobile.sections = structuredClone(desktop.sections)
    desktop.sections.find((section) => section.key === 'hero:1')!.styles.height = '480px'
    mobile.sections.find((section) => section.key === 'hero:1')!.styles.height = '620px'
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-height-scale',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: desktop.url, path: 'desktop.png', viewport: 'desktop' }, snapshot: desktop },
        { screenshot: { url: mobile.url, path: 'mobile.png', viewport: 'mobile' }, snapshot: mobile },
      ],
    })
    const heightChange = evidence.responsiveObservations.find((observation) =>
      observation.changedProperties.includes('height'),
    )

    expect(heightChange).toMatchObject({ changeType: 'scale', changedProperties: ['height'] })
  })

  it('reports a semantically paired media dimension change when its extracted owner changes', () => {
    const desktop = createSnapshot('desktop', 1_440)
    const mobile = createSnapshot('mobile', 375)
    mobile.sections = structuredClone(desktop.sections)
    mobile.sections.push({
      key: 'mobile-media-wrapper',
      identityKey: 'section:hero:mobile-media-wrapper',
      order: 2,
      role: 'hero',
      rect: { x: 0.05, y: 0.16, width: 0.9, height: 0.12 },
      layoutMode: 'flow',
      styles: { display: 'block' },
    })
    desktop.layoutNodes = [
      {
        key: 'media:desktop-cover',
        identityKey: 'node:media:none:cover',
        sectionKey: 'hero:1',
        role: 'media',
        rect: { x: 0.2, y: 0.18, width: 0.5, height: 0.08 },
        styles: { width: '640px', height: '180px' },
        traits: [],
      },
    ]
    mobile.layoutNodes = [
      {
        key: 'media:mobile-cover',
        identityKey: 'node:media:none:cover',
        sectionKey: 'mobile-media-wrapper',
        role: 'media',
        rect: { x: 0.05, y: 0.18, width: 0.9, height: 0.08 },
        styles: { width: '343px', height: '120px' },
        traits: [],
      },
    ]
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-media-scale',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      expectedViewports: ['desktop', 'mobile'],
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        { screenshot: { url: desktop.url, path: 'desktop.png', viewport: 'desktop' }, snapshot: desktop },
        { screenshot: { url: mobile.url, path: 'mobile.png', viewport: 'mobile' }, snapshot: mobile },
      ],
    })
    const mediaChange = evidence.responsiveObservations.find((observation) =>
      observation.changedProperties.includes('node.media.height'),
    )

    expect(mediaChange).toMatchObject({
      changeType: 'scale',
      changedProperties: ['node.media.width', 'node.media.height'],
    })
    expect(mediaChange?.changes).toMatchObject({
      'node.media.width': { from: '640px', to: '343px' },
      'node.media.height': { from: '180px', to: '120px' },
    })
  })

  it('humanizes detailed extraction issues without exposing raw page-health IDs', () => {
    const evidence = buildFixtureEvidence()
    evidence.limitations.push(
      'extraction-issue:page-1%3Adesktop%3Astyles:Timeout%20after%2015000ms',
      `page-health:horizontal-overflow@${evidence.pages[0].id}`,
    )

    const brief = generateDesignEvidenceBrief(evidence, 'zh-CN')

    expect(brief).toContain('提取阶段 page-1:desktop:styles：Timeout after 15000ms')
    expect(brief).not.toContain('page-health:horizontal-overflow')
  })

  it('discloses a non-blocking partial overlay without invalidating the remaining evidence', () => {
    const evidence = buildFixtureEvidence()
    evidence.limitations.push(
      `page-health:partial-overlay@${evidence.pages[0].id}`,
      `page-health:partial-overlay@${evidence.pages[1].id}`,
    )

    const english = generateDesignEvidenceBrief(evidence, 'en')
    const chinese = generateDesignEvidenceBrief(evidence, 'zh-CN')

    expect(english).toContain('non-blocking edge overlay')
    expect(chinese).toContain('非阻断式边缘遮挡')
    expect(english.match(/non-blocking edge overlay/g)).toHaveLength(1)
    expect(chinese.match(/非阻断式边缘遮挡/g)).toHaveLength(1)
    expect(english).not.toContain('page-health:partial-overlay')
    expect(chinese).not.toContain('page-health:partial-overlay')
  })

  it('explains adaptive mobile capture limits and overflow without exposing internal codes', () => {
    const evidence = buildFixtureEvidence()
    evidence.limitations.push(
      'extraction-issue:page-2%3Amobile-adaptive%3Ahealth%3Ahorizontal-overflow:375%2F3686',
      'adaptive-mobile-budget-exceeded',
      'adaptive-mobile-skipped-budget',
    )

    const chinese = generateDesignEvidenceBrief(evidence, 'zh-CN')
    const english = generateDesignEvidenceBrief(evidence, 'en')

    expect(chinese).toContain('第 2 个页面的移动端补充捕获出现横向溢出（视口 375px，内容宽度 3686px）')
    expect(chinese).toContain('移动端补充捕获超出预留时间预算')
    expect(chinese).toContain('后续移动端补充捕获被跳过')
    expect(english).toContain('Page 2 supplemental mobile capture overflowed horizontally')
    expect(chinese).not.toContain('adaptive-mobile-budget-exceeded')
    expect(chinese).not.toContain('adaptive-mobile-skipped-budget')
  })

  it('keeps responsive media attributes and links region crops to sections', () => {
    const snapshot = createSnapshot('desktop', 1440)
    snapshot.mediaLayers = [
      {
        key: 'image:hero-img',
        sectionKey: 'hero:1',
        kind: 'image',
        role: 'narrative',
        importance: 'major',
        rect: { x: 0.2, y: 0.15, width: 0.5, height: 0.25 },
        naturalSize: { width: 2400, height: 1200 },
        hasResponsiveSources: true,
      },
    ]
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-media',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\media.png', viewport: 'desktop' },
          snapshot,
          supplementalImages: [
            {
              kind: 'region-crop',
              path: 'C:\\evidence\\media-region.png',
              width: 960,
              height: 480,
              sourceRect: { x: 0.15, y: 0.12, width: 0.7, height: 0.3 },
              sectionKey: 'hero:1',
            },
          ],
        },
      ],
    })

    expect(evidence.mediaLayers[0]).toMatchObject({
      naturalSize: { width: 2400, height: 1200 },
      hasResponsiveSources: true,
    })
    const heroSection = evidence.sections.find((section) => section.role === 'hero')!
    const crop = evidence.pages[0].images.find((image) => image.kind === 'region-crop')!
    expect(crop.sectionId).toBe(heroSection.id)
  })

  it('records passive ARIA and scroll-snap observations and itemizes skipped candidates', () => {
    const snapshot = createSnapshot('desktop', 1440)
    snapshot.sections[0].styles.scrollSnapType = 'x mandatory'
    snapshot.sections[0].styles.scrollSnapAlign = 'start'
    snapshot.ariaStates = [
      { key: 'aria-expanded:button:0', sectionKey: 'hero:1', attribute: 'aria-expanded', value: 'false' },
    ]
    snapshot.interactionCandidates = [
      {
        key: 'tab:0',
        sectionKey: 'hero:1',
        locator: '[role="tab"]',
        kind: 'tab',
        driver: 'click',
      },
    ]
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-2',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'managed',
      authWallDetected: true,
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\managed.png', viewport: 'desktop' },
          snapshot,
        },
      ],
    })

    expect(evidence.interactionObservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ safety: 'passive', trigger: { kind: 'aria-state:aria-expanded' } }),
        expect.objectContaining({ safety: 'passive', driver: 'scroll', trigger: { kind: 'css-scroll-snap' } }),
      ]),
    )
    expect(evidence.limitations).toEqual(
      expect.arrayContaining([expect.stringContaining('skipped-interaction:tab@tab:0')]),
    )
    expect(evidence.coverage.accessRestrictions).toEqual(['managed-access', 'auth-wall-resolved-by-managed-access'])
    const brief = generateDesignEvidenceBrief(evidence, 'zh-CN')
    expect(brief).toContain('非点击状态证据：2 条')
    expect(brief).toContain('2 条其他被动观察')
    expect(brief).toContain('安全主动观察：0 条')
    expect(brief).not.toContain('驱动类型: click')
  })

  it('counts major media regions separately from supporting media and icons', () => {
    const snapshot = createSnapshot('desktop', 1440)
    snapshot.mediaLayers = [
      {
        key: 'image:hero',
        sectionKey: 'hero:1',
        kind: 'image',
        role: 'narrative',
        importance: 'major',
        rect: { x: 0.2, y: 0.15, width: 0.5, height: 0.25 },
      },
      {
        key: 'image:wide-unknown',
        sectionKey: 'hero:1',
        kind: 'image',
        role: 'unknown',
        importance: 'major',
        rect: { x: 0.1, y: 0.5, width: 0.8, height: 0.2 },
      },
      {
        key: 'image:thumb',
        sectionKey: 'hero:1',
        kind: 'image',
        role: 'unknown',
        importance: 'supporting',
        rect: { x: 0.2, y: 0.7, width: 0.1, height: 0.05 },
      },
      {
        key: 'svg:icon-1',
        sectionKey: 'navigation:0',
        kind: 'svg',
        role: 'icon',
        importance: 'icon',
        rect: { x: 0.05, y: 0.02, width: 0.02, height: 0.02 },
      },
      {
        key: 'image:avatar',
        sectionKey: 'hero:1',
        kind: 'image',
        role: 'icon',
        importance: 'icon',
        rect: { x: 0.22, y: 0.2, width: 0.03, height: 0.03 },
      },
    ]
    const evidence = buildDesignEvidence({
      analysisId: 'analysis-media-coverage',
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 1,
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures: [
        {
          screenshot: { url: 'https://example.com/', path: 'C:\\evidence\\media.png', viewport: 'desktop' },
          snapshot,
        },
      ],
    })

    expect(evidence.coverage.mediaCoverage).toEqual({
      majorRegions: 2,
      classifiedRegions: 1,
      iconRegions: 2,
    })
    expect(evidence.limitations).not.toContain('no-major-media-detected')
    const brief = generateDesignEvidenceBrief(evidence)
    expect(brief).toContain('2 major regions (1 classified)')
    expect(brief).toContain('2 icon instances')
  })

  it('exports deterministic facts with compatible metadata', () => {
    const evidence = buildFixtureEvidence()
    evidence.components.push({
      ...structuredClone(evidence.components[0]),
      id: 'component-tab-1',
      type: 'tab',
      role: 'tab',
    })
    const json = JSON.parse(generateDesignEvidenceJson(evidence))
    const brief = generateDesignEvidenceBrief(evidence)
    const designDoc = generateDesignDoc(tokens, evidence.source.requestedUrl, [], undefined, [], [], 'en', evidence)
    const chineseDoc = generateDesignDoc(
      tokens,
      evidence.source.requestedUrl,
      ['section-level compound-radius treatments observed'],
      undefined,
      [],
      [],
      'zh-CN',
      evidence,
    )
    const evidenceWithoutLineHeightRefs = structuredClone(evidence)
    evidenceWithoutLineHeightRefs.layoutNodes.forEach((node) => {
      node.tokenRefs = node.tokenRefs.filter((ref) => !ref.startsWith('typography.line-height.'))
    })
    const observedLineHeightBrief = generateDesignEvidenceBrief(evidenceWithoutLineHeightRefs)
    const designFrontMatter = parse(designDoc.match(/^---\n([\s\S]*?)\n---/)?.[1] || '') as {
      version: string
      components?: Record<string, Record<string, string>>
      'x-imprint': Array<{
        schema: string
        evidence: { pageCount: number; captureCount: number }
        componentSummary: { source: string; patterns: number; instances: number; reusablePatterns: number }
      }>
    }
    expect(json.schemaVersion).toBe('1')
    expect(json.analysisId).toBe('analysis-1')
    expect(brief).toContain('deterministic code analysis')
    expect(brief).not.toContain('AI')
    expect(brief).toContain('navigation → hero')
    expect(designDoc).toContain('## Design Evidence Overview')
    expect(designFrontMatter).toMatchObject({
      version: 'alpha',
      'x-imprint': [
        {
          schema: 'imprint.design-system/2',
          evidence: { pageCount: 1, captureCount: 2 },
          componentSummary: { source: 'design-evidence', patterns: 2, instances: 2, reusablePatterns: 0 },
        },
      ],
    })
    expect(designFrontMatter.components).toBeUndefined()
    expect(designDoc).toContain('- button: 1 observed patterns, 1 canonical instances, 0 reusable exact-style patterns')
    expect(designDoc).toContain('- tab: 1 observed patterns, 1 canonical instances, 0 reusable exact-style patterns')
    expect(designDoc).not.toContain('No component pattern was observed with enough confidence')
    expect(designDoc).toContain('### Typography Role Evidence')
    expect(designDoc).toContain('one evidence-eligible canonical capture per route without severe horizontal overflow')
    expect(designDoc).toContain('| Observed role | Independent owners | Font | Size | Weight | Line height |')
    expect(designDoc).toContain('| `display` | 1 | `Inter`')
    expect(designDoc).toContain('`2rem`')
    expect(designDoc).toContain('`1.5`')
    expect(observedLineHeightBrief).toContain('`1.5`')
    expect(designDoc).not.toContain('## Design Principles')
    expect(designDoc).not.toContain('matches the visual style')
    expect(designDoc).not.toContain('Evidence-backed Deterministic Claims')
    expect(designDoc).toContain('representative structural dimensions and responsive changes remain in this document')
    expect(designDoc).not.toContain('remain available in Design Evidence')
    expect(designDoc).not.toContain('AI')
    expect(chineseDoc).not.toContain('AI')
    expect(chineseDoc).not.toContain('基于证据的确定性主张')
    expect(chineseDoc).not.toContain('跨页面 canonical')
    expect(chineseDoc).toContain('每个路由只使用一次证据有效且无严重溢出的代表性捕获')
    expect(chineseDoc).not.toContain('一次 canonical 捕获')
    expect(chineseDoc).toContain('实例数按每个页面的一次代表性捕获统计；优先使用桌面端')
    expect(chineseDoc).toContain('观察到区块级复合圆角处理')
    expect(chineseDoc).not.toContain('section-level compound-radius treatments observed')
    expect(designFrontMatter['x-imprint'][0]).toMatchObject({ analysis: { mode: 'deterministic' } })
  })

  it('counts typography owners once per route and groups matching topology signatures by viewport', () => {
    const captures = ['https://example.com/', 'https://example.com/about'].flatMap((url) =>
      (['desktop', 'mobile'] as const).map((viewport) => {
        const snapshot = createSnapshot(viewport, viewport === 'desktop' ? 1440 : 375)
        snapshot.url = url
        return {
          screenshot: { url, path: `${url.endsWith('about') ? 'about' : 'home'}-${viewport}.png`, viewport },
          snapshot,
        }
      }),
    )
    const evidence = buildDesignEvidence({
      analysisId: 'canonical-owner-counts',
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      expectedPageCount: 2,
      expectedViewports: ['desktop', 'mobile'],
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures,
    })

    const brief = generateDesignEvidenceBrief(evidence)
    const topology = brief.match(/### Page Topology\n([\s\S]*?)(?=\n### |$)/)?.[1] || ''

    expect(brief).toContain('| `display` | 2 | `Inter`')
    expect(brief).not.toContain('| `display` | 4 |')
    expect(topology).toContain('`desktop` · 2 routes')
    expect(topology).toContain('`mobile` · 2 routes')
    expect(topology.match(/^- /gm)).toHaveLength(2)
  })

  it('groups identical horizontal-overflow geometry across routes but keeps distinct geometry separate', () => {
    const captures = [
      ['https://example.com/first', 2000],
      ['https://example.com/second', 2000],
      ['https://example.com/third', 2100],
    ].map(([url, width]) => {
      const snapshot = createSnapshot('desktop', Number(width))
      snapshot.url = String(url)
      return {
        screenshot: { url: String(url), path: `${String(url).split('/').pop()}.png`, viewport: 'desktop' as const },
        snapshot,
      }
    })
    const evidence = buildDesignEvidence({
      analysisId: 'grouped-overflow-geometry',
      requestedUrl: 'https://example.com/first',
      finalUrl: 'https://example.com/first',
      accessMode: 'anonymous',
      expectedPageCount: 3,
      expectedViewports: ['desktop'],
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures,
    })
    const topology = generateDesignEvidenceBrief(evidence).match(/### Page Topology\n([\s\S]*?)(?=\n### |$)/)?.[1] || ''

    expect(topology.match(/horizontal overflow observed/g)).toHaveLength(2)
    expect(topology.match(/content 2000px > viewport 1440px/g)).toHaveLength(1)
    expect(topology).toContain('`desktop` · 2 routes')
    expect(topology).toContain('content 2100px > viewport 1440px')
  })

  it('keeps page-owned overflow evidence when section topology has no entry for that page', () => {
    const captures = ['https://example.com/first', 'https://example.com/second'].map((url) => {
      const snapshot = createSnapshot('desktop', 2000)
      snapshot.url = url
      return {
        screenshot: { url, path: `${url.split('/').pop()}.png`, viewport: 'desktop' as const },
        snapshot,
      }
    })
    const evidence = buildDesignEvidence({
      analysisId: 'overflow-without-topology-index',
      requestedUrl: captures[0].snapshot.url,
      finalUrl: captures[0].snapshot.url,
      accessMode: 'anonymous',
      expectedPageCount: 2,
      expectedViewports: ['desktop'],
      tokens,
      featureTags: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      breakpoints: [],
      motion: [],
      captures,
    })
    evidence.topology.pages = evidence.topology.pages.filter((entry) => entry.pageId !== evidence.pages[1].id)

    const topology = generateDesignEvidenceBrief(evidence).match(/### Page Topology\n([\s\S]*?)(?=\n### |$)/)?.[1] || ''

    expect(topology.match(/horizontal overflow observed/g)).toHaveLength(1)
    expect(topology).toContain('`desktop` · 2 routes')
    expect(topology).toContain('content 2000px > viewport 1440px')
  })

  it('selects the same healthy canonical capture regardless of responsive capture order', () => {
    const buildResponsiveEvidence = (order: Array<'desktop' | 'tablet' | 'mobile'>) => {
      const values = {
        desktop: { width: 1440, fontSize: '41px', grid: '3fr 1fr' },
        tablet: { width: 768, fontSize: '29px', grid: '2fr 1fr' },
        mobile: { width: 375, fontSize: '21px', grid: '1fr' },
      } as const
      const captures = order.map((viewport) => {
        const snapshot = createSnapshot(viewport, values[viewport].width)
        snapshot.layoutNodes[0].styles.fontSize = values[viewport].fontSize
        snapshot.sections[1].styles.gridTemplateColumns = values[viewport].grid
        return {
          screenshot: { url: snapshot.url, path: `${viewport}.png`, viewport },
          snapshot,
        }
      })
      const evidence = buildDesignEvidence({
        analysisId: `canonical-fallback-${order.join('-')}`,
        requestedUrl: 'https://example.com/',
        finalUrl: 'https://example.com/',
        accessMode: 'anonymous',
        expectedPageCount: 1,
        expectedViewports: ['desktop', 'tablet', 'mobile'],
        tokens,
        featureTags: [],
        interactionStyles: { hover: [], focus: [], active: [] },
        breakpoints: [],
        motion: [],
        captures,
      })
      const desktop = evidence.pages.find((page) => page.viewport === 'desktop')!
      desktop.health = {
        status: 'unusable',
        checkedAt: '2026-09-02T00:00:00.000Z',
        recovered: false,
        attempts: 1,
        viewport: { width: 1440, height: 900 },
        content: { width: 1440, height: 1600 },
        overlayAreaRatio: 0,
        mutationCount: 0,
        evidenceEligible: false,
        issues: [],
      }
      return evidence
    }
    const section = (document: string, heading: string) =>
      document.match(new RegExp(`### ${heading}\\n([\\s\\S]*?)(?=\\n### |$)`))?.[1] || ''

    const first = generateDesignEvidenceBrief(buildResponsiveEvidence(['mobile', 'desktop', 'tablet']))
    const secondEvidence = buildResponsiveEvidence(['tablet', 'mobile', 'desktop'])
    const second = generateDesignEvidenceBrief(secondEvidence)

    expect(section(first, 'Typography Role Evidence')).toBe(section(second, 'Typography Role Evidence'))
    expect(section(first, 'Structural Facts')).toBe(section(second, 'Structural Facts'))
    expect(section(first, 'Typography Role Evidence')).toContain('`29px`')
    expect(section(first, 'Typography Role Evidence')).not.toContain('`41px`')
    expect(section(first, 'Typography Role Evidence')).not.toContain('`21px`')
    expect(section(first, 'Structural Facts')).toContain('`grid: 2fr 1fr`')

    const tablet = secondEvidence.pages.find((page) => page.viewport === 'tablet')!
    tablet.horizontalOverflow = true
    tablet.viewportWidth = 768
    tablet.contentWidth = 2000
    const overflowFallback = generateDesignEvidenceBrief(secondEvidence)
    expect(section(overflowFallback, 'Typography Role Evidence')).toContain('`21px`')
    expect(section(overflowFallback, 'Structural Facts')).toContain('`grid: 1fr`')
  })

  it('uses the entry route canonical capture for reconstruction hierarchy and omits unhealthy fallbacks', () => {
    const buildResponsiveHierarchy = (order: Array<'desktop' | 'tablet' | 'mobile'>) => {
      const roles = { desktop: 'action', tablet: 'media', mobile: 'footer' } as const
      const widths = { desktop: 1440, tablet: 768, mobile: 375 } as const
      const evidence = buildDesignEvidence({
        analysisId: `summary-canonical-${order.join('-')}`,
        requestedUrl: 'https://example.com/',
        finalUrl: 'https://example.com/',
        accessMode: 'anonymous',
        expectedPageCount: 1,
        expectedViewports: ['desktop', 'tablet', 'mobile'],
        tokens,
        featureTags: [],
        interactionStyles: { hover: [], focus: [], active: [] },
        breakpoints: [],
        motion: [],
        captures: order.map((viewport) => {
          const snapshot = createSnapshot(viewport, widths[viewport])
          snapshot.sections[1].role = roles[viewport]
          return { screenshot: { url: snapshot.url, path: `${viewport}.png`, viewport }, snapshot }
        }),
      })
      const desktop = evidence.pages.find((page) => page.viewport === 'desktop')!
      desktop.health = {
        status: 'unusable',
        checkedAt: '2026-09-02T00:00:00.000Z',
        recovered: false,
        attempts: 1,
        viewport: { width: 1440, height: 900 },
        content: { width: 1440, height: 1600 },
        overlayAreaRatio: 0,
        mutationCount: 0,
        evidenceEligible: false,
        issues: [],
      }
      return evidence
    }
    const hierarchy = (evidence: ReturnType<typeof buildResponsiveHierarchy>) =>
      generateDesignDoc(tokens, evidence.source.finalUrl, [], undefined, [], [], 'en', evidence).match(
        /^- \*\*Section hierarchy:\*\* (.+)$/m,
      )?.[1]

    const first = buildResponsiveHierarchy(['mobile', 'desktop', 'tablet'])
    const second = buildResponsiveHierarchy(['tablet', 'mobile', 'desktop'])
    expect(hierarchy(first)).toBe('navigation → media')
    expect(hierarchy(second)).toBe('navigation → media')

    const tablet = second.pages.find((page) => page.viewport === 'tablet')!
    tablet.horizontalOverflow = true
    tablet.viewportWidth = 768
    tablet.contentWidth = 2000
    expect(hierarchy(second)).toBe('navigation → footer')

    const mobile = second.pages.find((page) => page.viewport === 'mobile')!
    mobile.health = {
      ...second.pages.find((page) => page.viewport === 'desktop')!.health!,
      viewport: { width: 375, height: 812 },
    }
    expect(hierarchy(second)).toBeUndefined()
  })

  it('keeps general structural facts canonical and explicitly scoped', () => {
    const evidence = buildFixtureEvidence()
    for (const page of evidence.pages) {
      const hero = evidence.sections.find((section) => section.pageId === page.id && section.role === 'hero')!
      hero.observedStyles = {
        ...hero.observedStyles,
        layout: {
          ...hero.observedStyles?.layout,
          gridTemplateColumns: page.viewport === 'desktop' ? '2fr 1fr' : '1fr',
        },
      }
    }

    const brief = generateDesignEvidenceBrief(evidence)
    const structural = brief.match(/### Structural Facts\n([\s\S]*?)(?=\n### |$)/)?.[1] || ''

    expect(structural).toContain('1 independent owner · scope: `desktop` https://example.com/')
    expect(structural).toContain('`grid: 2fr 1fr`')
    expect(structural).not.toContain('`grid: 1fr`')
  })

  it('uses a sanitized public projection for shared DESIGN.md and Evidence JSON exports', () => {
    const evidence = buildFixtureEvidence()
    const privateUrl =
      'https://private-user:private-password@example.com/private?access_token=private-value#private-panel'
    evidence.source.requestedUrl = privateUrl
    evidence.source.finalUrl = privateUrl
    evidence.pages.forEach((page) => {
      page.url = privateUrl
    })

    const designDoc = generateDesignDoc(tokens, privateUrl, [], undefined, [], [], 'en', evidence)
    const evidenceJson = generateDesignEvidenceJson(evidence)

    for (const output of [designDoc, evidenceJson]) {
      expect(output).toContain('https://example.com/private')
      expect(output).not.toContain('private-user')
      expect(output).not.toContain('private-password')
      expect(output).not.toContain('access_token')
      expect(output).not.toContain('private-value')
      expect(output).not.toContain('private-panel')
    }
    expect(designDoc).not.toContain(evidence.analysisId)
    expect(designDoc).not.toContain(evidence.sections[0].id)
    expect(designDoc).not.toContain('body > main:nth-of-type(1)')
    expect(designDoc).not.toContain('### Tech Stack')
  })
})
