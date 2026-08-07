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
  return {
    url: 'https://example.com/',
    viewport,
    language: 'en',
    role: 'landing',
    width,
    height: 1600,
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

  it('keeps responsive media attributes and links region crops to sections', () => {
    const snapshot = createSnapshot('desktop', 1440)
    snapshot.mediaLayers = [
      {
        key: 'image:hero-img',
        sectionKey: 'hero:1',
        kind: 'image',
        role: 'narrative',
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
    expect(evidence.coverage.accessRestrictions).toEqual(['managed-access', 'auth-wall-detected'])
    const brief = generateDesignEvidenceBrief(evidence, 'zh-CN')
    expect(brief).toContain('被动状态规则：2 条（未执行用户操作）')
    expect(brief).toContain('安全主动观察：0 条')
    expect(brief).not.toContain('驱动类型: click')
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

    expect(json.schemaVersion).toBe('1')
    expect(json.analysisId).toBe('analysis-1')
    expect(brief).toContain('Capability level: `evidence-only`')
    expect(brief).toContain('no AI visual thesis')
    expect(brief).toContain('navigation → hero')
    expect(designDoc).toContain('## Design Evidence Overview')
    expect(designDoc).not.toContain('## Design Principles')
    expect(designDoc).not.toContain('matches the visual style')
    expect(chineseDoc).toContain('未生成 AI 视觉主张、标志性手法或迁移规则')
  })
})
