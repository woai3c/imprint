import { DtcgEmitterHandler, lint } from '@google/design.md/linter'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'

import type { ComponentPattern } from '../../src/core/analyzer/component-detect.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import { buildDesignMdColorTokens, generateDesignDoc } from '../../src/core/export/index.js'

const tokens: DesignToken = {
  colors: {
    background: 'rgb(255, 255, 255)',
    foreground: '#111827',
    primary: 'rgb(37, 99, 235)',
  },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['14px', '16px'],
    fontWeights: ['400', '600'],
    lineHeights: ['1.5'],
    letterSpacings: ['-0.01em'],
  },
  spacing: ['4px', '8px', '16px'],
  radii: ['4px', '8px'],
  shadows: ['0 1px 2px rgba(0, 0, 0, 0.1)'],
  borders: ['1px solid rgb(229, 231, 235)'],
  zIndices: ['10'],
  transitions: ['150ms'],
}

const components: ComponentPattern[] = [
  {
    type: 'button',
    count: 3,
    selectors: ['button', '[role="button"]'],
    styles: {
      backgroundColor: 'rgb(37, 99, 235)',
      color: 'rgb(255, 255, 255)',
      borderRadius: '8px',
      padding: '8px 8px 8px 8px',
      fontSize: '16px',
      fontWeight: '600',
    },
    confidence: 0.94,
    evidence: ['native:button'],
  },
]

const canonicalSections = [
  'Overview',
  'Colors',
  'Typography',
  'Layout',
  'Elevation & Depth',
  'Shapes',
  'Components',
  "Do's and Don'ts",
]

describe('Google DESIGN.md alpha compatibility', () => {
  test.each(['en', 'zh-CN'] as const)('generates an officially parseable %s document', (language) => {
    const designDoc = generateDesignDoc(
      tokens,
      'https://example.com/product',
      ['high-contrast'],
      undefined,
      [{ width: 768, label: 'md' }],
      components,
      language,
    )
    const report = lint(designDoc)

    expect(report.summary.errors).toBe(0)
    expect(report.findings.some((finding) => finding.rule === 'token-like-ignored')).toBe(false)
    expect(report.sections.slice(0, canonicalSections.length)).toEqual(canonicalSections)
    expect(report.designSystem.name).toBe('example.com Design System')
    expect(report.designSystem.colors.get('primary')?.hex.toLowerCase()).toBe('#2563eb')
    expect(report.designSystem.typography.get('size-sm')?.fontSize).toMatchObject({ value: 16, unit: 'px' })
    expect(report.designSystem.spacing.get('space-2')).toMatchObject({ value: 8, unit: 'px' })
    expect(report.designSystem.rounded.get('md')).toMatchObject({ value: 8, unit: 'px' })
    expect(report.designSystem.components.get('button-primary')?.unresolvedRefs).toEqual([])

    const extension = report.designSystem.unknownKeyValues?.['x-imprint'] as Array<Record<string, unknown>>
    expect(extension).toHaveLength(1)
    expect(extension[0]).toMatchObject({
      schema: 'imprint.design-system/2',
      language,
      featureTags: ['high-contrast'],
      nonstandardTokens: {
        shadows: tokens.shadows,
        borders: tokens.borders,
        zIndices: tokens.zIndices,
        transitions: tokens.transitions,
      },
      componentSummary: {
        source: 'component-detector',
        patterns: 1,
        instances: 3,
      },
      responsive: { breakpoints: [{ width: 768, label: 'md' }] },
    })
    expect(extension[0]).not.toHaveProperty('rawTokens')
    expect(extension[0]).not.toHaveProperty('tokenEvidence')

    const dtcg = new DtcgEmitterHandler().execute(report.designSystem)
    expect(dtcg.success).toBe(true)
    if (dtcg.success) {
      expect(dtcg.data).toHaveProperty('color.primary')
      expect(dtcg.data).toHaveProperty('typography.size-sm')
      expect(dtcg.data).toHaveProperty('spacing.space-2')
      expect(dtcg.data).toHaveProperty('rounded.md')
    }
  })

  test('does not treat circular radii as the ordinary surface radius style', () => {
    const designDoc = generateDesignDoc(
      {
        ...tokens,
        radii: ['2px', '3px', '4px', '8px', '50%'],
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'zh-CN',
    )

    expect(designDoc).toContain('保持小圆角，维持锐利精确的气质')
    expect(designDoc).not.toContain('使用较大的圆角，保持柔和友好的观感')
    expect(designDoc).toContain('radii:\n        - 50%')
  })

  test('models an observed pill button with a semantic rounded token and variant-aware guidance', () => {
    const designDoc = generateDesignDoc(
      { ...tokens, radii: ['2px', '3px', '4px', '8px'] },
      'https://example.com/',
      [],
      undefined,
      [],
      [
        {
          ...components[0],
          styles: { ...components[0].styles, borderRadius: '100px' },
        },
      ],
      'zh-CN',
    )
    const frontMatter = designDoc.match(/^---\n([\s\S]*?)\n---/)?.[1] || ''
    const parsed = parse(frontMatter) as {
      rounded: Record<string, string>
      components: Record<string, Record<string, string>>
    }

    expect(parsed.rounded.pill).toBe('100px')
    expect(parsed.components['button-primary'].rounded).toBe('{rounded.pill}')
    expect(designDoc).toContain('普通表面使用小圆角；胶囊和圆形按钮按已观察变体单独复用')
    expect(designDoc).not.toContain('保持小圆角，维持锐利精确的气质')
  })

  test('omits transparent and context-dependent component backgrounds plus zero dimensions from machine tokens', () => {
    const designDoc = generateDesignDoc(
      tokens,
      'https://example.com/',
      [],
      undefined,
      [],
      [
        {
          type: 'button',
          count: 12,
          selectors: ['button'],
          styles: {
            backgroundColor: 'rgba(0, 0, 0, 0)',
            color: '#111827',
            borderRadius: '0px',
            padding: '0px',
            fontSize: '14px',
          },
          confidence: 0.98,
          evidence: ['native-element'],
        },
        {
          type: 'navigation',
          count: 2,
          selectors: ['nav'],
          styles: { backgroundColor: 'transparent', color: '#111827', padding: '0px' },
          confidence: 0.98,
          evidence: ['native-element'],
        },
        {
          type: 'button',
          count: 4,
          selectors: ['button'],
          styles: {
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            color: '#2563eb',
            borderRadius: '8px',
            padding: '8px',
          },
          confidence: 0.98,
          evidence: ['native-element'],
        },
      ],
    )
    const report = lint(designDoc)
    const frontMatter = designDoc.match(/^---\n([\s\S]*?)\n---/)?.[1] || ''
    const parsed = parse(frontMatter) as { components: Record<string, Record<string, string>> }

    expect(report.summary.errors).toBe(0)
    expect(report.findings.some((finding) => finding.rule === 'contrast-ratio')).toBe(false)
    expect(parsed.components['button-text']).not.toHaveProperty('backgroundColor')
    expect(parsed.components['button-text']).not.toHaveProperty('rounded')
    expect(parsed.components['button-text']).not.toHaveProperty('padding')
    expect(parsed.components['button-secondary']).not.toHaveProperty('backgroundColor')
    expect(parsed.components.navigation).not.toHaveProperty('backgroundColor')
  })

  test('uses stable value-based IDs for fallback colors while preserving AI aliases as suggestions', () => {
    const raw = { ...tokens, colors: { ...tokens.colors, 'palette-5': '#8491a5' } }
    const aliased = { ...tokens, colors: { ...tokens.colors, 'slate-action': '#8491a5' } }
    const aliases = [{ tokenId: 'palette-5', name: 'slate-action' }]

    expect(buildDesignMdColorTokens(raw)).toHaveProperty('observed-8491a5', '#8491a5')
    expect(buildDesignMdColorTokens(aliased, aliases)).toEqual(buildDesignMdColorTokens(raw))
  })

  test('keeps detailed token evidence out of the compact front matter', () => {
    const evidencedTokens: DesignToken = {
      ...tokens,
      evidence: Object.fromEntries(
        Array.from({ length: 200 }, (_, index) => [
          `spacing.${index}`,
          {
            value: `${index}px`,
            confidence: 'low' as const,
            observationCount: 1,
            pageCount: 1,
            captureCount: 1,
            pages: ['https://example.com/'],
            sources: [`computed-style:${index}`],
            reasons: ['computed-style' as const],
          },
        ]),
      ),
    }
    const designDoc = generateDesignDoc(evidencedTokens, 'https://example.com/')
    const frontMatter = designDoc.match(/^---\n([\s\S]*?)\n---/)?.[1] || ''

    expect(frontMatter.split('\n').length).toBeLessThan(140)
    expect(frontMatter).toContain('low: 200')
    expect(frontMatter).not.toContain('computed-style:199')
  })
})
