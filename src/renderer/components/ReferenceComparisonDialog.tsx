import { ArrowRight, Check, ExternalLink, EyeOff, ShieldCheck, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  ApprovedComparisonReview,
  ApprovedDesignContract,
  ComparisonReviewDecisionInput,
  ComparisonReviewDecisionValue,
  ReferenceComparisonResult,
} from '../../shared/ipc-contract'
import { Alert } from './ui/Alert'

interface ReferenceComparisonDialogProps {
  comparison: ReferenceComparisonResult
  review: ApprovedComparisonReview | null
  contractHistory: ApprovedDesignContract[]
  onApprove: (decisions: ComparisonReviewDecisionInput[]) => Promise<void>
  onClose: () => void
  onOpenEvidence: (analysisId: string, evidenceId: string) => void
}

const statusClasses = {
  changed: 'border-warning/30 bg-warning/10 text-warning-strong',
  unchanged: 'border-success/30 bg-success/10 text-success',
  inconclusive: 'border-border bg-muted/40 text-muted-foreground',
} as const

export function ReferenceComparisonDialog({
  comparison,
  review,
  contractHistory,
  onApprove,
  onClose,
  onOpenEvidence,
}: ReferenceComparisonDialogProps) {
  const { t } = useTranslation()
  const [decisions, setDecisions] = useState<Record<string, ComparisonReviewDecisionValue>>({})
  const [approving, setApproving] = useState(false)
  const [editingReview, setEditingReview] = useState(false)
  const changes = useMemo(() => comparison.categories.flatMap((category) => category.changes), [comparison.categories])
  const reviewableChanges = useMemo(() => changes.filter((change) => change.reviewable !== false), [changes])
  const storedDecisions = useMemo(
    () => new Map(review?.decisions.map(({ change, decision }) => [change.id, decision]) ?? []),
    [review],
  )
  const decisionFor = (changeId: string) =>
    editingReview ? decisions[changeId] : (storedDecisions.get(changeId) ?? decisions[changeId])
  const decidedCount = reviewableChanges.filter((change) => Boolean(decisionFor(change.id))).length
  const approvedCount = reviewableChanges.filter((change) => decisionFor(change.id) === 'approve-target').length
  const canApprove =
    (!review || editingReview) &&
    reviewableChanges.length > 0 &&
    decidedCount === reviewableChanges.length &&
    approvedCount > 0

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const reviseReview = () => {
    if (!review) return
    setDecisions(Object.fromEntries(review.decisions.map(({ change, decision }) => [change.id, decision])))
    setEditingReview(true)
  }

  const handleApprove = async () => {
    if (!canApprove) return
    setApproving(true)
    try {
      await onApprove(
        reviewableChanges.map((change) => ({
          changeId: change.id,
          decision: decisions[change.id],
          expectedFrom: change.from ?? null,
          expectedTo: change.to ?? null,
        })),
      )
    } finally {
      setApproving(false)
    }
  }

  return (
    <div
      data-testid="reference-comparison-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
    >
      <section
        data-testid="reference-comparison-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-comparison-title"
        className="ui-enter flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="reference-comparison-title" className="text-sm font-semibold">
              {t('history.referenceComparison.title')}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('history.referenceComparison.factOnly')}</p>
          </div>
          <span
            data-testid="reference-comparison-status"
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses[comparison.status]}`}
          >
            {t(`history.referenceComparison.status.${comparison.status}`)}
          </span>
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

          {comparison.comparability.status === 'limited' && (
            <Alert tone="info" title={t('history.referenceComparison.limitedTitle')}>
              <p>{t('history.referenceComparison.limitedDescription')}</p>
              <ul className="mt-1 list-disc pl-4">
                {comparison.comparability.limitations.map((limitation) => (
                  <li key={limitation}>{t(`history.referenceComparison.limitations.${limitation}`)}</li>
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

          {comparison.comparability.differences.length > 0 && (
            <div className="rounded-lg border border-border bg-card/30 p-3 text-xs">
              <p className="font-medium">{t('history.referenceComparison.differencesTitle')}</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {comparison.comparability.differences.map((difference) => (
                  <li key={difference.field} className="break-all font-mono">
                    {difference.field}: {difference.reference ?? '—'} → {difference.target ?? '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review && (
            <Alert tone="info" title={t('history.referenceComparison.review.approvedTitle')}>
              <p>
                {t('history.referenceComparison.review.approvedDescription', {
                  version: review.contract.version,
                  count: review.contract.rules.length,
                })}
              </p>
              <p>{t('history.referenceComparison.review.versionHistory', { count: contractHistory.length })}</p>
              {!editingReview && (
                <button
                  type="button"
                  onClick={reviseReview}
                  className="mt-1.5 min-h-7 rounded-md border border-primary/25 bg-background px-2.5 font-medium text-primary hover:bg-primary/5"
                >
                  {t('history.referenceComparison.review.revise')}
                </button>
              )}
            </Alert>
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
                      {category.changes.map((item) => (
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
                          {(item.referenceEvidenceIds.length > 0 || item.targetEvidenceIds.length > 0) && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <EvidenceLinks
                                label={t('history.referenceComparison.referenceEvidence')}
                                analysisId={comparison.reference.analysisId}
                                evidenceIds={item.referenceEvidenceIds}
                                onOpenEvidence={onOpenEvidence}
                              />
                              <EvidenceLinks
                                label={t('history.referenceComparison.targetEvidence')}
                                analysisId={comparison.target.analysisId}
                                evidenceIds={item.targetEvidenceIds}
                                onOpenEvidence={onOpenEvidence}
                              />
                            </div>
                          )}
                          {item.reviewable !== false ? (
                            <div className="mt-3 border-t border-border/60 pt-3">
                              <p className="text-xs font-medium">
                                {t('history.referenceComparison.review.decisionTitle')}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <ReviewDecisionButton
                                  selected={decisionFor(item.id) === 'approve-target'}
                                  disabled={Boolean(review) && !editingReview}
                                  icon={Check}
                                  label={t('history.referenceComparison.review.approveTarget')}
                                  onClick={() =>
                                    setDecisions((current) => ({ ...current, [item.id]: 'approve-target' }))
                                  }
                                />
                                <ReviewDecisionButton
                                  selected={decisionFor(item.id) === 'ignore'}
                                  disabled={Boolean(review) && !editingReview}
                                  icon={EyeOff}
                                  label={t('history.referenceComparison.review.ignore')}
                                  onClick={() => setDecisions((current) => ({ ...current, [item.id]: 'ignore' }))}
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                              {t('history.referenceComparison.observationOnly')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
            </div>
          )}
        </div>

        {comparison.status === 'changed' && reviewableChanges.length > 0 && (!review || editingReview) && (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-5 py-3">
            <div className="text-xs text-muted-foreground">
              <p>
                {t('history.referenceComparison.review.progress', {
                  decided: decidedCount,
                  total: reviewableChanges.length,
                })}
              </p>
              <p>{t('history.referenceComparison.review.contractScope')}</p>
            </div>
            <button
              type="button"
              data-testid="approve-comparison-review"
              disabled={!canApprove || approving}
              onClick={handleApprove}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck size={16} aria-hidden="true" />
              {t(
                approving
                  ? 'history.referenceComparison.review.approving'
                  : 'history.referenceComparison.review.approve',
                {
                  count: approvedCount,
                },
              )}
            </button>
          </footer>
        )}
      </section>
    </div>
  )
}

function ReviewDecisionButton({
  selected,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  selected: boolean
  disabled: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-default ${
        selected
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      <Icon size={13} aria-hidden="true" />
      {label}
    </button>
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

function EvidenceLinks({
  label,
  analysisId,
  evidenceIds,
  onOpenEvidence,
}: {
  label: string
  analysisId: string
  evidenceIds: string[]
  onOpenEvidence: (analysisId: string, evidenceId: string) => void
}) {
  if (evidenceIds.length === 0) return null
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {evidenceIds.map((evidenceId) => (
          <button
            key={evidenceId}
            type="button"
            title={evidenceId}
            onClick={() => onOpenEvidence(analysisId, evidenceId)}
            className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 font-mono text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <span className="truncate">{evidenceId}</span>
            <ExternalLink size={10} className="shrink-0" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}
