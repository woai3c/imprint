import { ArrowLeft, ArrowRight, Copy, Download, Images, X } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ComparisonVisualPair, ReferenceComparisonResult } from '../../shared/ipc-contract'
import {
  type LayoutChangeDisplayGroup,
  describeLayoutChangeGroupForDisplay,
  groupLayoutChangesForDisplay,
} from '../lib/comparison-change-display.js'
import { buildComparisonMarkdown, comparisonReportFileName } from '../lib/comparison-report.js'
import { useFeedbackStore } from '../stores/feedback-store'
import { VisualDiffDialog } from './VisualDiffDialog'
import { Alert } from './ui/Alert'
import { IconButton } from './ui/IconButton'

interface ReferenceComparisonDialogProps {
  comparison: ReferenceComparisonResult
  visualPairs: ComparisonVisualPair[]
  onCompareAnother: () => void
  onClose: () => void
}

const statusClasses = {
  changed: 'border-warning/30 bg-warning/10 text-warning-strong',
  unchanged: 'border-success/30 bg-success/10 text-success',
  inconclusive: 'border-border bg-muted/40 text-muted-foreground',
} as const

export function ReferenceComparisonDialog({
  comparison,
  visualPairs,
  onCompareAnother,
  onClose,
}: ReferenceComparisonDialogProps) {
  const { t, i18n } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [visualDiffOpen, setVisualDiffOpen] = useState(false)
  const captureConditionLimitations = comparison.comparability.limitations.filter(
    (limitation) =>
      limitation !== 'exact-observed-values-only' &&
      limitation !== 'entry-and-captured-page-set-only' &&
      limitation !== 'unhealthy-pages-excluded' &&
      limitation !== 'tool-version-differs',
  )
  const excludedPages = comparison.comparability.excludedPages || []
  const blockingDifferences = comparison.comparability.differences.filter(
    (difference) => difference.effect === 'inconclusive',
  )
  const nonBlockingDifferences = comparison.comparability.differences.filter(
    (difference) => difference.effect === 'limitation',
  )
  const excludedPageGroups = [...new Set(excludedPages.map((page) => page.issueCodes.join('|')))].map((key) => {
    const pages = excludedPages.filter((page) => page.issueCodes.join('|') === key)
    return { key, pages, issueCodes: pages[0]?.issueCodes || [] }
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !visualDiffOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, visualDiffOpen])

  const reportMarkdown = () => buildComparisonMarkdown(comparison, t, i18n.resolvedLanguage || i18n.language)

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportMarkdown())
      notify(t('feedback.copied'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleExportReport = async () => {
    try {
      const result = await window.electronAPI.exportFile(reportMarkdown(), comparisonReportFileName(comparison), 'md')
      if (result.success) notify(t('feedback.exported'))
      else if (result.error) notify(t('feedback.actionFailed'), 'error')
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  return (
    <div
      data-testid="reference-comparison-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-6 ${
        visualDiffOpen ? 'bg-transparent' : 'bg-black/55'
      }`}
    >
      <section
        data-testid="reference-comparison-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-comparison-title"
        className="ui-enter flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <button
              type="button"
              data-testid="comparison-choose-another"
              onClick={onCompareAnother}
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {t('history.referenceComparison.chooseAnother')}
            </button>
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            <h2 id="reference-comparison-title" className="truncate text-sm font-semibold">
              {t('history.referenceComparison.title')}
            </h2>
          </div>
          <span
            data-testid="reference-comparison-status"
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses[comparison.status]}`}
          >
            {t(`history.referenceComparison.status.${comparison.status}`)}
          </span>
          {visualPairs.length > 0 && (
            <button
              type="button"
              data-testid="open-visual-diff"
              onClick={() => setVisualDiffOpen(true)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Images size={14} aria-hidden="true" />
              {t('history.referenceComparison.visualDiff.open')}
            </button>
          )}
          <div
            role="toolbar"
            aria-label={t('history.referenceComparison.report.actionsLabel')}
            className="flex shrink-0 items-center rounded-lg border border-border bg-card/40 p-0.5"
          >
            <IconButton
              data-testid="copy-comparison-report"
              icon={Copy}
              iconSize={16}
              label={t('history.referenceComparison.report.copyAction')}
              showTooltip
              onClick={() => void handleCopyReport()}
              className="size-8"
            />
            <IconButton
              data-testid="export-comparison-report"
              icon={Download}
              iconSize={16}
              label={t('history.referenceComparison.report.exportAction')}
              showTooltip
              onClick={() => void handleExportReport()}
              className="size-8"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <CaptureCard label={t('history.referenceComparison.reference')} url={comparison.reference.url} />
            <ArrowRight className="hidden text-muted-foreground md:block" size={18} aria-hidden="true" />
            <CaptureCard label={t('history.referenceComparison.target')} url={comparison.target.url} />
          </div>

          {comparison.comparability.status === 'limited' && captureConditionLimitations.length > 0 && (
            <Alert tone="info" title={t('history.referenceComparison.captureConditionTitle')}>
              <p>{t('history.referenceComparison.captureConditionDescription')}</p>
              <ul className="mt-1 list-disc pl-4">
                {captureConditionLimitations.map((limitation) => (
                  <li key={limitation}>{t(`history.referenceComparison.limitations.${limitation}`)}</li>
                ))}
              </ul>
            </Alert>
          )}

          {excludedPages.length > 0 && (
            <Alert tone="info" title={t('history.referenceComparison.excludedPages.title')}>
              <p>
                {t('history.referenceComparison.excludedPages.description', {
                  count: comparison.comparability.comparedPageKeys.length,
                })}
              </p>
              <ul className="mt-1 list-disc pl-4">
                {excludedPageGroups.map((group) => (
                  <li key={group.key}>
                    {t('history.referenceComparison.excludedPages.group', {
                      count: group.pages.length,
                      reasons: group.issueCodes
                        .map((code) =>
                          t(`history.referenceComparison.excludedPages.issues.${code}`, {
                            defaultValue: t('history.referenceComparison.excludedPages.issues.unknown'),
                          }),
                        )
                        .join(t('history.referenceComparison.excludedPages.issueSeparator')),
                    })}
                  </li>
                ))}
              </ul>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {excludedPages.map((page) => (
                  <li key={page.pageKey}>
                    {page.url} · {page.viewport}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {comparison.comparability.reasons.length > 0 && (
            <Alert tone="warning" title={t('history.referenceComparison.inconclusiveTitle')}>
              <ul className="list-disc pl-4">
                {comparison.comparability.reasons.map((reason) => (
                  <li key={reason}>{t(`history.referenceComparison.reasons.${reason}`)}</li>
                ))}
              </ul>
            </Alert>
          )}

          {blockingDifferences.length > 0 && (
            <div className="rounded-lg border border-border bg-card/30 p-3 text-xs">
              <p className="font-medium">{t('history.referenceComparison.blockingDifferencesTitle')}</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {blockingDifferences.map((difference) => (
                  <li key={difference.field} className="break-all font-mono">
                    {difference.field}: {difference.reference ?? '—'} → {difference.target ?? '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {nonBlockingDifferences.length > 0 && (
            <div className="rounded-lg border border-border bg-card/30 p-3 text-xs">
              <p className="font-medium">{t('history.referenceComparison.nonBlockingDifferencesTitle')}</p>
              <p className="mt-1 text-muted-foreground">
                {t('history.referenceComparison.nonBlockingDifferencesDescription')}
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {nonBlockingDifferences.map((difference) => (
                  <li key={difference.field} className="break-all font-mono">
                    {difference.field}: {difference.reference ?? '—'} → {difference.target ?? '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {comparison.categories.map((category) => (
              <div key={category.category} className="rounded-lg border border-border bg-card/40 p-3">
                <p className="text-xs text-muted-foreground">
                  {t(`history.referenceComparison.categories.${category.category}`)}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {t(
                    `history.referenceComparison.categoryStatus.${
                      category.status === 'unchanged' && category.coverage === 'partial'
                        ? 'unchangedPartial'
                        : category.status
                    }`,
                    {
                      count: category.changes.length,
                    },
                  )}
                </p>
                {category.coverage && category.coverage !== 'complete' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`history.referenceComparison.categoryCoverage.${category.coverage}`)}
                  </p>
                )}
              </div>
            ))}
          </div>

          {comparison.categories.some((category) => category.limitations?.length > 0) && (
            <div className="rounded-lg border border-border bg-card/30 p-3 text-xs">
              <p className="font-medium">{t('history.referenceComparison.categoryScope.title')}</p>
              <ul className="mt-2 space-y-2 text-muted-foreground">
                {comparison.categories
                  .filter((category) => category.limitations?.length > 0)
                  .map((category) => (
                    <li key={category.category}>
                      <span className="font-medium text-foreground">
                        {t('history.referenceComparison.categoryScope.categoryLabel', {
                          category: t(`history.referenceComparison.categories.${category.category}`),
                        })}
                      </span>
                      {category.limitations
                        .map((limitation) => t(`history.referenceComparison.categoryScope.limitations.${limitation}`))
                        .join(t('history.referenceComparison.categoryScope.separator'))}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {comparison.categories.some((category) => category.changes.length > 0) && (
            <div className="space-y-4">
              {comparison.categories
                .filter((category) => category.changes.length > 0)
                .map((category) => (
                  <section key={category.category} aria-labelledby={`comparison-${category.category}`}>
                    <h3 id={`comparison-${category.category}`} className="text-sm font-semibold">
                      {t(`history.referenceComparison.categories.${category.category}`)}
                    </h3>
                    <div className="mt-2 space-y-2">
                      {category.category === 'layout'
                        ? groupLayoutChangesForDisplay(category.changes, comparison.entityMatching).map((group) => (
                            <LayoutChangeCard key={group.key} group={group} />
                          ))
                        : category.changes.map((item) => (
                            <div key={item.id} className="rounded-lg border border-border/70 bg-card/30 p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                                  {t(`history.referenceComparison.changeKind.${item.kind}`)}
                                </span>
                                <code className="text-xs text-foreground">{item.tokenPath}</code>
                              </div>
                              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                                <ValueCell label={t('history.referenceComparison.from')} value={item.from} />
                                <ValueCell label={t('history.referenceComparison.to')} value={item.to} />
                              </div>
                            </div>
                          ))}
                    </div>
                  </section>
                ))}
            </div>
          )}
        </div>
      </section>
      {visualDiffOpen && <VisualDiffDialog pairs={visualPairs} onClose={() => setVisualDiffOpen(false)} />}
    </div>
  )
}

function LayoutChangeCard({ group }: { group: LayoutChangeDisplayGroup }) {
  const { t, i18n } = useTranslation()
  const first = group.changes[0]
  const description = describeLayoutChangeGroupForDisplay(group, t, i18n.resolvedLanguage || i18n.language)
  if (!description) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
            {t(`history.referenceComparison.changeKind.${first.kind}`)}
          </span>
          <code className="text-xs text-foreground">{first.tokenPath}</code>
        </div>
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <ValueCell label={t('history.referenceComparison.from')} value={first.from} />
          <ValueCell label={t('history.referenceComparison.to')} value={first.to} />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/70 bg-card/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
          {t(`history.referenceComparison.changeKind.${first.kind}`)}
        </span>
        <p className="text-sm font-semibold">{description.title}</p>
      </div>
      <p data-testid="layout-change-summary" className="mt-2 text-sm text-foreground">
        {description.summary}
      </p>
      {description.explanation && <p className="mt-1.5 text-xs text-muted-foreground">{description.explanation}</p>}
      <details className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer select-none font-medium text-foreground">
          {t('history.referenceComparison.layoutChange.technicalDetails')}
        </summary>
        <ul className="mt-2 space-y-1.5">
          {group.changes.map((change) => (
            <li key={change.id} className="flex flex-wrap gap-x-2">
              <code className="break-all">{change.tokenPath}</code>
              <span>
                {change.from ?? '—'} → {change.to ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function CaptureCard({ label, url }: { label: string; url: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm" title={url}>
        {url}
      </p>
    </div>
  )
}

function ValueCell({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-secondary/50 px-2.5 py-2">
      <p className="text-muted-foreground">{label}</p>
      <code className="mt-0.5 block break-all text-foreground">{value ?? '—'}</code>
    </div>
  )
}
