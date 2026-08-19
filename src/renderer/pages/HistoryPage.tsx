import { ChevronLeft, ChevronRight, ExternalLink, GitCompareArrows, ImageIcon, Trash2, X } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AnalysisRecord, ComparisonVisualPair, ReferenceComparisonResult } from '../../shared/ipc-contract'
import { AnalysisDetailDialog } from '../components/AnalysisDetailDialog'
import { CaptureComparisonPickerDialog } from '../components/CaptureComparisonPickerDialog'
import { PageHeader } from '../components/PageHeader'
import { ReferenceComparisonDialog } from '../components/ReferenceComparisonDialog'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { loadComparisonRecords, removeComparisonRecords } from '../lib/comparison-records-cache.js'
import { formatLocalDateTime } from '../lib/date-time'
import { getScreenshotUrl } from '../lib/page-screenshots'
import { useFeedbackStore } from '../stores/feedback-store'

const PAGE_SIZE = 10

export function HistoryPage() {
  const { t, i18n } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [detailTarget, setDetailTarget] = useState<{ analysisId: string; evidenceId?: string } | null>(null)
  const [comparison, setComparison] = useState<ReferenceComparisonResult | null>(null)
  const [comparisonVisualPairs, setComparisonVisualPairs] = useState<ComparisonVisualPair[]>([])
  const [comparisonPickerOpen, setComparisonPickerOpen] = useState(false)
  const [comparisonSelection, setComparisonSelection] = useState<{ earlierId: string; laterId: string } | null>(null)
  const [comparingId, setComparingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false)
  const [matchingIds, setMatchingIds] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    void loadComparisonRecords().catch(() => {
      // The comparison picker shows a retryable error if its own load fails.
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(
      async () => {
        setLoading(true)
        try {
          const data = await window.electronAPI.getAnalysisSummariesPage({ page, pageSize: PAGE_SIZE, search })
          if (cancelled) return
          setRecords(data.records)
          setMatchingIds(data.matchingIds)
          setPage(data.page)
          setTotal(data.total)
        } finally {
          if (!cancelled) setLoading(false)
        }
      },
      search ? 150 : 0,
    )

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [page, refreshKey, search])

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    setDeleting(true)
    try {
      await window.electronAPI.deleteAnalysis(pendingDeleteId)
      removeComparisonRecords([pendingDeleteId])
      setRecords((current) => current.filter((record) => record.id !== pendingDeleteId))
      setSelectedIds((current) => {
        if (!current.has(pendingDeleteId)) return current
        const next = new Set(current)
        next.delete(pendingDeleteId)
        return next
      })
      notify(t('feedback.historyDeleted'))
      setPendingDeleteId(null)
      setRefreshKey((current) => current + 1)
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    setDeleting(true)
    try {
      const ids = [...selectedIds]
      await window.electronAPI.deleteAnalyses(ids)
      removeComparisonRecords(ids)
      const removed = new Set(ids)
      setRecords((current) => current.filter((record) => !removed.has(record.id)))
      setSelectedIds(new Set())
      notify(t('feedback.historyDeleted'))
      setPendingBatchDelete(false)
      setRefreshKey((current) => current + 1)
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleCompare = async (earlier: AnalysisRecord, later: AnalysisRecord) => {
    setComparingId(later.id)
    try {
      const response = await window.electronAPI.compareAnalyses(earlier.id, later.id)
      if (!response.success) {
        notify(t(`history.referenceComparison.errors.${response.reason}`), 'error')
        return
      }
      setComparison(response.comparison)
      setComparisonVisualPairs(response.visualPairs)
      setComparisonSelection({ earlierId: earlier.id, laterId: later.id })
      setComparisonPickerOpen(false)
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      setComparingId(null)
    }
  }

  const selectedFilteredCount = matchingIds.filter((id) => selectedIds.has(id)).length
  const allFilteredSelected = matchingIds.length > 0 && selectedFilteredCount === matchingIds.length
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allFilteredSelected) {
        for (const id of matchingIds) next.delete(id)
      } else {
        for (const id of matchingIds) next.add(id)
      }
      return next
    })
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearComparison = () => {
    setComparison(null)
    setComparisonVisualPairs([])
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={t('history.title')}
        description={t('history.description')}
        actions={
          <Button
            data-testid="history-open-comparison-picker"
            disabled={loading}
            onClick={() => setComparisonPickerOpen(true)}
          >
            <GitCompareArrows size={16} aria-hidden="true" />
            {t('history.compareCaptures')}
          </Button>
        }
      />

      <div className="px-8 mb-4">
        <input
          type="text"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          placeholder={t('history.search')}
          className="w-80 h-9 px-3 rounded-md border border-input bg-background text-sm
                     placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {!loading && records.length > 0 && (
        <div className="mb-2 flex items-center gap-3 px-8">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              data-testid="history-select-all"
              checked={allFilteredSelected}
              ref={(element) => {
                if (element) element.indeterminate = someFilteredSelected
              }}
              onChange={toggleSelectAll}
              aria-label={t('history.selectAll')}
              className="app-checkbox size-4 cursor-pointer rounded"
            />
            {t('history.selectAll')}
          </label>
          {selectedIds.size > 0 && (
            <>
              <span data-testid="history-selected-count" className="text-xs text-muted-foreground">
                {t('history.selectedCount', { count: selectedIds.size })}
              </span>
              <button
                type="button"
                data-testid="history-delete-selected"
                onClick={() => setPendingBatchDelete(true)}
                className="min-h-7 rounded-md bg-destructive/10 px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                {t('history.deleteSelected')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                aria-label={t('history.clearSelection')}
                className="flex min-h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X size={12} aria-hidden="true" />
                {t('history.clearSelection')}
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-muted-foreground" role="status">
              {t('history.loading')}
            </p>
          </div>
        ) : records.length === 0 ? (
          <EmptyState title={t('history.noResults')} description={t('history.noResultsTip')} className="h-64" />
        ) : (
          <div className="ui-enter">
            <div className="space-y-2">
              {records.map((record) => (
                <div
                  key={record.id}
                  data-testid="history-record"
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailTarget({ analysisId: record.id })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setDetailTarget({ analysisId: record.id })
                    }
                  }}
                  aria-label={t('history.viewRecord', { url: record.url })}
                  className={`flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors hover:border-primary/30 hover:bg-secondary/30 ${
                    selectedIds.has(record.id) ? 'border-primary/50 bg-secondary/40' : 'border-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    data-testid="history-select-record"
                    checked={selectedIds.has(record.id)}
                    onChange={() => toggleSelected(record.id)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    aria-label={t('history.selectRecord', { url: record.url })}
                    className="app-checkbox size-4 shrink-0 cursor-pointer rounded"
                  />
                  <HistoryThumbnail path={record.screenshot_path} url={record.url} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="truncate text-sm font-medium">{record.site_name}</span>
                      {record.duration_ms != null && record.duration_ms > 0 && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {record.duration_ms >= 60000
                            ? t('history.durationMin', { minutes: (record.duration_ms / 60000).toFixed(1) })
                            : t('history.duration', { seconds: (record.duration_ms / 1000).toFixed(1) })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="max-w-full truncate" title={record.url}>
                        {record.url}
                      </span>
                      <span>·</span>
                      <span>{t('history.pageCount', { count: record.pages_analyzed })}</span>
                      {record.theme_name && <span>· {record.theme_name}</span>}
                    </div>
                  </div>

                  <span data-testid="history-created-at" className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatLocalDateTime(record.created_at, i18n.language)}
                  </span>

                  <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    <IconButton
                      icon={ExternalLink}
                      label={t('history.openSource')}
                      onClick={() => window.electronAPI.openExternal(record.url)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={t('history.deleteRecord')}
                      onClick={() => setPendingDeleteId(record.id)}
                      className="hover:bg-destructive/10 hover:text-destructive"
                    />
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <nav aria-label={t('history.paginationLabel')} className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">
                  {t('history.paginationSummary', { page, totalPages, total })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1 || loading}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                    {t('history.previousPage')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages || loading}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('history.nextPage')}
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </nav>
            )}
          </div>
        )}
      </div>

      {pendingDeleteId && (
        <ConfirmDialog
          title={t('history.confirmDeleteTitle')}
          description={t('history.confirmDelete')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleDelete}
          onCancel={() => setPendingDeleteId(null)}
          loading={deleting}
        />
      )}
      {pendingBatchDelete && (
        <ConfirmDialog
          title={t('history.confirmDeleteTitle')}
          description={t('history.confirmDeleteSelected', { count: selectedIds.size })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleBatchDelete}
          onCancel={() => setPendingBatchDelete(false)}
          loading={deleting}
        />
      )}
      {detailTarget && (
        <AnalysisDetailDialog
          analysisId={detailTarget.analysisId}
          initialEvidenceId={detailTarget.evidenceId}
          onClose={(changed) => {
            setDetailTarget(null)
            if (changed) setRefreshKey((current) => current + 1)
          }}
        />
      )}
      {comparisonPickerOpen && (
        <CaptureComparisonPickerDialog
          busy={comparingId !== null}
          initialEarlierId={comparisonSelection?.earlierId}
          initialLaterId={comparisonSelection?.laterId}
          onCompare={handleCompare}
          onClose={() => setComparisonPickerOpen(false)}
        />
      )}
      {comparison && (
        <ReferenceComparisonDialog
          comparison={comparison}
          visualPairs={comparisonVisualPairs}
          onCompareAnother={() => {
            clearComparison()
            setComparisonPickerOpen(true)
          }}
          onClose={() => {
            clearComparison()
          }}
        />
      )}
    </div>
  )
}

function HistoryThumbnail({ path, url }: { path?: string | null; url: string }) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)

  if (!path || failed) {
    return (
      <div
        title={t('history.noPreview')}
        className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground"
      >
        <ImageIcon size={18} aria-hidden="true" />
        <span className="sr-only">{t('history.noPreview')}</span>
      </div>
    )
  }

  return (
    <img
      data-testid="history-preview-image"
      src={getScreenshotUrl(path)}
      alt={t('history.previewAlt', { url })}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className="h-16 w-24 shrink-0 rounded-md border border-border/60 bg-muted/30 object-cover object-top"
    />
  )
}
