import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import {
  buildDesignEvidence,
  createEvidenceId,
  generateDesignEvidenceBrief,
  generateDesignEvidenceJson,
} from '../../src/core/design-evidence/index.js'
import type { PageEvidenceSnapshot } from '../../src/core/design-evidence/page-extractor.js'
import { generateDesignDoc } from '../../src/core/export/index.js'

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
        sectionKey: 'hero:1',
        role: 'heading',
        textRole: 'display',
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
    tokens,
    featureTags: ['responsive'],
    interactionStyles: {
      hover: [{ color: '#2563eb' }],
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

  it('records topology, viewport differences, coverage, and explicit limitations', () => {
    const evidence = buildFixtureEvidence()

    expect(evidence.topology.pages).toHaveLength(2)
    expect(evidence.topology.pages[0].sectionIds).toHaveLength(2)
    expect(evidence.topology.globalLayers).toHaveLength(2)
    expect(evidence.responsiveObservations.length).toBeGreaterThan(0)
    expect(evidence.coverage).toMatchObject({
      pageCoverage: 'complete',
      sectionCoverage: 1,
      viewportCoverage: ['desktop', 'mobile'],
    })
    expect(evidence.limitations).not.toContain('single-viewport')
    expect(evidence.limitations).not.toContain('some-safe-interactions-skipped')
    expect(evidence.interactionObservations).toEqual(
      expect.arrayContaining([expect.objectContaining({ driver: 'hover', safety: 'passive' })]),
    )
    const responsive = evidence.responsiveObservations[0]
    const responsiveSection = evidence.sections.find((section) => section.id === responsive.sectionId)!
    const responsivePage = evidence.pages.find((page) => page.id === responsiveSection.pageId)!
    expect(generateDesignEvidenceBrief(evidence)).toContain(
      `${responsivePage.url} · ${responsiveSection.role} · \`${responsive.sectionId}\``,
    )
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
    expect(brief).toContain('section hero')
  })

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
    expect(brief).toContain('被动状态观察：2 条（未执行用户操作，与概览口径一致）')
    expect(brief).toContain('2 条被动状态观察（未执行用户操作）')
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

  it('exports facts separately from inferred Design DNA', () => {
    const evidence = buildFixtureEvidence()
    const json = JSON.parse(generateDesignEvidenceJson(evidence))
    const brief = generateDesignEvidenceBrief(evidence)
    const designDoc = generateDesignDoc(tokens, evidence.source.requestedUrl, [], undefined, [], [], 'en', [], evidence)
    const chineseDoc = generateDesignDoc(
      tokens,
      evidence.source.requestedUrl,
      [],
      undefined,
      [],
      [],
      'zh-CN',
      [],
      evidence,
    )
    const failedDoc = generateDesignDoc(
      tokens,
      evidence.source.requestedUrl,
      [],
      undefined,
      [],
      [],
      'en',
      [],
      evidence,
      undefined,
      undefined,
      'failed',
    )
    const diagnosticDoc = generateDesignDoc(
      tokens,
      evidence.source.requestedUrl,
      [],
      undefined,
      [],
      [],
      'en',
      [],
      evidence,
      undefined,
      undefined,
      'partial',
      {
        status: 'partial',
        capabilityLevel: 'structural-ai',
        inputMode: 'structural-only',
        provider: 'openai',
        model: 'test-model',
        promptVersion: '19',
        generatedAt: '2026-08-11T00:00:00.000Z',
        rejected: ['one', 'two'],
        repaired: ['one'],
        timing: {
          programTotalMs: 65_000,
          aiTotalMs: 95_000,
          userWaitMs: 135_000,
          digestMs: 10,
          imageSummaryMs: 0,
          aiInvokeMs: 94_000,
          validationMs: 990,
          totalMs: 160_000,
          imageCount: 0,
          cacheHit: false,
        },
      },
    )
    const evidenceWithoutLineHeightRefs = structuredClone(evidence)
    evidenceWithoutLineHeightRefs.layoutNodes.forEach((node) => {
      node.tokenRefs = node.tokenRefs.filter((ref) => !ref.startsWith('typography.line-height.'))
    })
    const observedLineHeightBrief = generateDesignEvidenceBrief(evidenceWithoutLineHeightRefs)

    expect(json.schemaVersion).toBe('1')
    expect(json.analysisId).toBe('analysis-1')
    expect(brief).toContain('Capability level: `evidence-only`')
    expect(brief).toContain('no AI visual thesis')
    expect(brief).toContain('navigation → hero')
    expect(designDoc).toContain('## Design Evidence Overview')
    expect(designDoc).toMatch(/^---\nschema: "imprint\.design-system\/1"/)
    expect(designDoc).toContain('analysis_id: "analysis-1"')
    expect(designDoc).toContain('### Typography Role Evidence')
    expect(designDoc).toContain('| `display` | 2 | `Inter`')
    expect(designDoc).toContain('`2rem`')
    expect(designDoc).toContain('`1.5`')
    expect(observedLineHeightBrief).toContain('`1.5`')
    expect(designDoc).not.toContain('## Design Principles')
    expect(designDoc).not.toContain('matches the visual style')
    expect(designDoc).toContain('no AI interpretation was generated')
    expect(designDoc).not.toContain('validated interpretation')
    expect(chineseDoc).toContain('未生成 AI 视觉主张、标志性手法或迁移规则')
    expect(chineseDoc).toContain('本次未生成 AI 设计解读')
    expect(chineseDoc).not.toContain('经校验的设计解读')
    expect(failedDoc).toContain('**Status:** `failed`')
    expect(failedDoc).toContain('No AI design interpretation is available')
    expect(diagnosticDoc).toContain('prompt_version: "19"')
    expect(diagnosticDoc).toContain('rejected_count: 2')
    expect(diagnosticDoc).toContain('repaired_count: 1')
    expect(diagnosticDoc).toContain('  rejected:\n    - "one"\n    - "two"')
    expect(diagnosticDoc).toContain('  repaired:\n    - "one"')
    expect(diagnosticDoc).toContain('program_ms: 65000')
    expect(diagnosticDoc).toContain('ai_ms: 95000')
    expect(diagnosticDoc).toContain('user_wait_excluded_ms: 135000')
    expect(diagnosticDoc).toContain('active_total_ms: 160000')
  })
})
