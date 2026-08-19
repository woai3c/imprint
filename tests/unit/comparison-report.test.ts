import i18next from 'i18next'
import { describe, expect, it } from 'vitest'

import type { ReferenceComparisonResult } from '../../src/core/analyzer/reference-compare.js'
import en from '../../src/renderer/i18n/locales/en.json' with { type: 'json' }
import zhCN from '../../src/renderer/i18n/locales/zh-CN.json' with { type: 'json' }
import { buildComparisonMarkdown, comparisonReportFileName } from '../../src/renderer/lib/comparison-report.js'

function comparison(): ReferenceComparisonResult {
  return {
    schemaVersion: '1',
    reference: {
      analysisId: 'analysis-earlier',
      url: 'http://127.0.0.1:4173/',
      routeIdentity: 'http://127.0.0.1:4173/',
      createdAt: '2026-08-19T07:00:00.000Z',
    },
    target: {
      analysisId: 'analysis-later',
      url: 'http://127.0.0.1:4173/',
      routeIdentity: 'http://127.0.0.1:4173/',
      createdAt: '2026-08-19T07:05:00.000Z',
    },
    status: 'changed',
    comparability: {
      status: 'limited',
      reasons: [],
      limitations: ['exact-observed-values-only', 'entry-and-captured-page-set-only'],
      comparedPageKeys: ['http://127.0.0.1:4173/::desktop'],
      differences: [],
    },
    categories: [
      {
        category: 'colors',
        status: 'changed',
        coverage: 'complete',
        limitations: [],
        changes: [
          {
            id: 'colors:changed:colors.background',
            category: 'colors',
            kind: 'changed',
            tokenPath: 'colors.background',
            from: '#2457d6',
            to: '#f3f6fb',
            referenceEvidenceIds: ['earlier-color'],
            targetEvidenceIds: ['later-color'],
          },
        ],
      },
      { category: 'typography', status: 'unchanged', coverage: 'complete', limitations: [], changes: [] },
      { category: 'spacing', status: 'unchanged', coverage: 'complete', limitations: [], changes: [] },
      { category: 'radii', status: 'unchanged', coverage: 'complete', limitations: [], changes: [] },
      {
        category: 'layout',
        status: 'changed',
        coverage: 'partial',
        limitations: ['section-level-properties-only'],
        changes: [
          {
            id: 'layout:changed:layout.footer.1.order',
            category: 'layout',
            kind: 'changed',
            tokenPath: 'layout.footer.1.order',
            from: '6',
            to: '5',
            referenceEvidenceIds: ['earlier-footer'],
            targetEvidenceIds: ['later-footer'],
          },
        ],
      },
      {
        category: 'interaction-states',
        status: 'unchanged',
        coverage: 'partial',
        limitations: ['observed-interaction-styles-only'],
        changes: [],
      },
      {
        category: 'responsive',
        status: 'inconclusive',
        coverage: 'none',
        limitations: ['single-viewport'],
        changes: [],
      },
    ],
    entityMatching: {
      schemaVersion: '1',
      sections: [
        {
          kind: 'section',
          pageKey: 'http://127.0.0.1:4173/::desktop',
          status: 'matched',
          confidence: 'high',
          reason: 'exact-semantic-signature',
          referenceIds: ['earlier-footer'],
          targetIds: ['later-footer'],
        },
      ],
      components: [],
      summary: {
        sections: {
          matchedPairs: 1,
          highConfidencePairs: 1,
          mediumConfidencePairs: 0,
          ambiguousGroups: 0,
          unmatchedEntities: 0,
        },
        components: {
          matchedPairs: 0,
          highConfidencePairs: 0,
          mediumConfidencePairs: 0,
          ambiguousGroups: 0,
          unmatchedEntities: 0,
        },
      },
      limitations: ['identity-only', 'ambiguous-and-unmatched-are-not-drift'],
    },
    summary: { changedCategories: 2, changedItems: 2 },
  }
}

async function markdown(language: 'en' | 'zh-CN') {
  const instance = i18next.createInstance()
  await instance.init({
    lng: language,
    fallbackLng: 'en',
    resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } },
    interpolation: { escapeValue: false },
  })
  return buildComparisonMarkdown(comparison(), instance.t, language)
}

describe('comparison report', () => {
  it('exports the factual result, provenance, limitations, and readable changes in Chinese', async () => {
    const report = await markdown('zh-CN')

    expect(report).toContain('# Imprint 分析比较报告')
    expect(report).toContain('`colors.background`: `#2457d6` → `#f3f6fb`')
    expect(report).toContain('页脚前面的区块减少')
    expect(report).toContain('页脚前面识别到的页面区块从 6 个变为 5 个')
    expect(report).toContain('当前精确比较受支持的 token 值和结构化观察')
    expect(report).toContain('`analysis-earlier`')
    expect(report).not.toContain('Design Contract')
    expect(report).not.toContain('批准后续值')
  })

  it('uses the active locale and a safe site-specific Markdown filename', async () => {
    const report = await markdown('en')

    expect(report).toContain('# Imprint Analysis Comparison Report')
    expect(report).toContain('Fewer sections appear before the Footer')
    expect(comparisonReportFileName(comparison())).toBe('imprint-comparison-127.0.0.1-2026-08-19.md')
  })
})
