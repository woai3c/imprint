import type { TFunction } from 'i18next'

import type { ReferenceCategoryComparison, ReferenceComparisonResult } from '../../core/analyzer/reference-compare.js'
import { describeLayoutChangeGroupForDisplay, groupLayoutChangesForDisplay } from './comparison-change-display.js'
import { formatLocalDateTime } from './date-time.js'

export function buildComparisonMarkdown(comparison: ReferenceComparisonResult, t: TFunction, language: string): string {
  const lines: string[] = [
    `# ${t('history.referenceComparison.report.title')}`,
    '',
    t('history.referenceComparison.factOnly'),
    '',
    `## ${t('history.referenceComparison.report.recordsTitle')}`,
    '',
    ...captureLines(t('history.referenceComparison.reference'), comparison.reference, language, t),
    ...captureLines(t('history.referenceComparison.target'), comparison.target, language, t),
    '',
    `## ${t('history.referenceComparison.report.conclusionTitle')}`,
    '',
    `- **${t('history.referenceComparison.report.statusLabel')}** ${t(
      `history.referenceComparison.status.${comparison.status}`,
    )}`,
    `- **${t('history.referenceComparison.report.changedCategoriesLabel')}** ${comparison.summary.changedCategories}`,
    `- **${t('history.referenceComparison.report.changedItemsLabel')}** ${comparison.summary.changedItems}`,
  ]

  appendComparability(lines, comparison, t)

  lines.push('', `## ${t('history.referenceComparison.report.categoryOverviewTitle')}`, '')
  lines.push(
    `| ${t('history.referenceComparison.report.categoryColumn')} | ${t(
      'history.referenceComparison.report.resultColumn',
    )} | ${t('history.referenceComparison.report.coverageColumn')} |`,
    '| --- | --- | --- |',
  )
  for (const category of comparison.categories) {
    lines.push(
      `| ${tableCell(t(`history.referenceComparison.categories.${category.category}`))} | ${tableCell(
        categoryStatus(category, t),
      )} | ${tableCell(t(`history.referenceComparison.categoryCoverage.${category.coverage}`))} |`,
    )
  }

  const scopedCategories = comparison.categories.filter((category) => category.limitations.length > 0)
  if (scopedCategories.length > 0) {
    lines.push('', `## ${t('history.referenceComparison.report.scopeTitle')}`, '')
    for (const category of scopedCategories) {
      lines.push(`### ${t(`history.referenceComparison.categories.${category.category}`)}`, '')
      for (const limitation of category.limitations) {
        lines.push(`- ${t(`history.referenceComparison.categoryScope.limitations.${limitation}`)}`)
      }
      lines.push('')
    }
    trimTrailingBlank(lines)
  }

  lines.push('', `## ${t('history.referenceComparison.report.changesTitle')}`, '')
  const changedCategories = comparison.categories.filter((category) => category.changes.length > 0)
  if (changedCategories.length === 0) {
    lines.push(t('history.referenceComparison.report.noChanges'))
  } else {
    for (const category of changedCategories) {
      appendCategoryChanges(lines, category, comparison, t, language)
    }
    trimTrailingBlank(lines)
  }

  return `${lines.join('\n').trim()}\n`
}

export function comparisonReportFileName(comparison: ReferenceComparisonResult): string {
  let site = 'website'
  try {
    site = new URL(comparison.target.url).hostname || site
  } catch {
    // Keep the neutral fallback for malformed legacy URLs.
  }
  const date = comparison.target.createdAt?.slice(0, 10) || 'comparison'
  const safeSite =
    site
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'website'
  return `imprint-comparison-${safeSite}-${date}.md`
}

function captureLines(
  label: string,
  capture: ReferenceComparisonResult['reference'],
  language: string,
  t: TFunction,
): string[] {
  const lines = [
    `- **${label}**`,
    `  - ${t('history.referenceComparison.report.urlLabel')}: ${inlineCode(capture.url)}`,
  ]
  if (capture.createdAt) {
    lines.push(
      `  - ${t('history.referenceComparison.report.capturedAtLabel')}: ${formatLocalDateTime(capture.createdAt, language)}`,
    )
  }
  lines.push(`  - ${t('history.referenceComparison.report.analysisIdLabel')}: ${inlineCode(capture.analysisId)}`)
  return lines
}

function appendComparability(lines: string[], comparison: ReferenceComparisonResult, t: TFunction): void {
  const { reasons, limitations, differences, comparedPageKeys } = comparison.comparability
  const excludedPages = comparison.comparability.excludedPages || []
  if (reasons.length > 0) {
    lines.push('', `### ${t('history.referenceComparison.report.reasonsTitle')}`, '')
    for (const reason of reasons) lines.push(`- ${t(`history.referenceComparison.reasons.${reason}`)}`)
  }
  if (limitations.length > 0) {
    lines.push('', `### ${t('history.referenceComparison.report.limitationsTitle')}`, '')
    for (const limitation of limitations) lines.push(`- ${t(`history.referenceComparison.limitations.${limitation}`)}`)
  }
  if (excludedPages.length > 0) {
    lines.push('', `### ${t('history.referenceComparison.excludedPages.title')}`, '')
    lines.push(t('history.referenceComparison.excludedPages.description', { count: comparedPageKeys.length }), '')
    const groups = [...new Set(excludedPages.map((page) => page.issueCodes.join('|')))].map((key) => {
      const pages = excludedPages.filter((page) => page.issueCodes.join('|') === key)
      return { key, pages, issueCodes: pages[0]?.issueCodes || [] }
    })
    for (const group of groups) {
      const reasonsText = group.issueCodes
        .map((code) =>
          t(`history.referenceComparison.excludedPages.issues.${code}`, {
            defaultValue: t('history.referenceComparison.excludedPages.issues.unknown'),
          }),
        )
        .join(t('history.referenceComparison.excludedPages.issueSeparator'))
      lines.push(
        `- ${t('history.referenceComparison.excludedPages.group', {
          count: group.pages.length,
          reasons: reasonsText,
        })}`,
      )
    }
    for (const page of excludedPages) lines.push(`  - ${inlineCode(page.url)} · ${page.viewport}`)
  }
  const blockingDifferences = differences.filter((difference) => difference.effect === 'inconclusive')
  if (blockingDifferences.length > 0) {
    lines.push('', `### ${t('history.referenceComparison.blockingDifferencesTitle')}`, '')
    for (const difference of blockingDifferences) {
      lines.push(
        `- ${inlineCode(difference.field)}: ${inlineCode(difference.reference ?? '—')} → ${inlineCode(
          difference.target ?? '—',
        )}`,
      )
    }
  }
  const nonBlockingDifferences = differences.filter((difference) => difference.effect === 'limitation')
  if (nonBlockingDifferences.length > 0) {
    lines.push('', `### ${t('history.referenceComparison.nonBlockingDifferencesTitle')}`, '')
    lines.push(t('history.referenceComparison.nonBlockingDifferencesDescription'), '')
    for (const difference of nonBlockingDifferences) {
      lines.push(
        `- ${inlineCode(difference.field)}: ${inlineCode(difference.reference ?? '—')} → ${inlineCode(
          difference.target ?? '—',
        )}`,
      )
    }
  }
}

function appendCategoryChanges(
  lines: string[],
  category: ReferenceCategoryComparison,
  comparison: ReferenceComparisonResult,
  t: TFunction,
  language: string,
): void {
  lines.push(`### ${t(`history.referenceComparison.categories.${category.category}`)}`, '')
  if (category.category === 'layout') {
    for (const group of groupLayoutChangesForDisplay(category.changes, comparison.entityMatching)) {
      const description = describeLayoutChangeGroupForDisplay(group, t, language)
      if (!description) {
        appendTechnicalChange(lines, group.changes[0], t)
        continue
      }
      lines.push(`- **${changeKind(group.changes[0].kind, t)} — ${description.title}**`)
      lines.push(`  - ${description.summary}`)
      if (description.explanation) lines.push(`  - ${description.explanation}`)
      for (const change of group.changes) {
        lines.push(
          `  - ${inlineCode(change.tokenPath)}: ${inlineCode(change.from ?? '—')} → ${inlineCode(change.to ?? '—')}`,
        )
      }
    }
  } else {
    for (const change of category.changes) appendTechnicalChange(lines, change, t)
  }
  lines.push('')
}

function appendTechnicalChange(
  lines: string[],
  change: ReferenceCategoryComparison['changes'][number],
  t: TFunction,
): void {
  lines.push(
    `- **${changeKind(change.kind, t)}** ${inlineCode(change.tokenPath)}: ${inlineCode(
      change.from ?? '—',
    )} → ${inlineCode(change.to ?? '—')}`,
  )
}

function categoryStatus(category: ReferenceCategoryComparison, t: TFunction): string {
  const key = category.status === 'unchanged' && category.coverage === 'partial' ? 'unchangedPartial' : category.status
  return t(`history.referenceComparison.categoryStatus.${key}`, { count: category.changes.length })
}

function changeKind(kind: ReferenceCategoryComparison['changes'][number]['kind'], t: TFunction): string {
  return t(`history.referenceComparison.changeKind.${kind}`)
}

function inlineCode(value: string): string {
  const fence = value.includes('`') ? '``' : '`'
  return `${fence}${value}${fence}`
}

function tableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function trimTrailingBlank(lines: string[]): void {
  if (lines.at(-1) === '') lines.pop()
}
