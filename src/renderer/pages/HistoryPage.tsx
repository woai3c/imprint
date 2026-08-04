import { ExternalLink, ImageIcon, Trash2, X } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AnalysisRecord } from '../../shared/ipc-contract'
import { AnalysisDetailDialog } from '../components/AnalysisDetailDialog'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { getScreenshotUrl } from '../lib/page-screenshots'
import { useFeedbackStore } from '../stores/feedback-store'

export function HistoryPage() {
  const { t, i18n } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = await window.electronAPI.getAnalysisSummaries()
        setRecords(data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    setDeleting(true)
    try {
      await window.electronAPI.deleteAnalysis(pendingDeleteId)
      setRecords((current) => current.filter((record) => record.id !== pendingDeleteId))
      setSelectedIds((current) => {
        if (!current.has(pendingDeleteId)) return current
        const next = new Set(current)
        next.delete(pendingDeleteId)
        return next
      })
      notify(t('feedback.historyDeleted'))
      setPendingDeleteId(null)
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
      const removed = new Set(ids)
      setRecords((current) => current.filter((record) => !removed.has(record.id)))
      setSelectedIds(new Set())
      notify(t('feedback.historyDeleted'))
      setPendingBatchDelete(false)
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = records.filter((r) => r.url.toLowerCase().includes(search.toLowerCase()))

  const filteredIds = filtered.map((record) => record.id)
  const selectedFilteredCount = filteredIds.filter((id) => selectedIds.has(id)).length
  const allFilteredSelected = filtered.length > 0 && selectedFilteredCount === filtered.length
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allFilteredSelected) {
        for (const id of filteredIds) next.delete(id)
      } else {
        for (const id of filteredIds) next.add(id)
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

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={t('history.title')} description={t('history.description')} />

      <div className="px-8 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('history.search')}
          className="w-80 h-9 px-3 rounded-md border border-input bg-background text-sm
                     placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {!loading && filtered.length > 0 && (
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
              className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
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
        ) : filtered.length === 0 ? (
          <EmptyState title={t('history.noResults')} description={t('history.noResultsTip')} className="h-64" />
        ) : (
          <div className="ui-enter space-y-2">
            {filtered.map((record) => (
              <div
                key={record.id}
                data-testid="history-record"
                role="button"
                tabIndex={0}
                onClick={() => setDetailId(record.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setDetailId(record.id)
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
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-primary"
                />
                <HistoryThumbnail path={record.screenshot_path} url={record.url} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm truncate">{record.url}</span>
                    {record.duration_ms != null && record.duration_ms > 0 && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {record.duration_ms >= 60000
                          ? t('history.durationMin', { minutes: (record.duration_ms / 60000).toFixed(1) })
                          : t('history.duration', { seconds: (record.duration_ms / 1000).toFixed(1) })}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{t('history.pageCount', { count: record.pages_analyzed })}</span>
                    <AiStatusBadge status={record.design_intelligence_status} />
                    {record.ai_token_usage && (record.ai_token_usage.input || record.ai_token_usage.output) && (
                      <span className="text-[10px]">
                        {formatTokenCount(record.ai_token_usage.input)} /{' '}
                        {formatTokenCount(record.ai_token_usage.output)}
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(record.created_at).toLocaleDateString(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US')}
                </span>

                <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
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
      {detailId && <AnalysisDetailDialog analysisId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

function formatTokenCount(n?: number): string {
  if (!n) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function AiStatusBadge({ status }: { status: string | null }) {
  const { t } = useTranslation()
  if (!status || status === 'not-configured' || status === 'not-requested') return null
  const isSuccess = status === 'complete' || status === 'partial'
  const isFailed = status === 'failed'
  const label = isSuccess ? t('history.aiSuccess') : isFailed ? t('history.aiFailed') : t('history.aiPending')
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-px text-[10px] font-medium ${
        isSuccess
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : isFailed
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-muted-foreground'
      }`}
    >
      {label}
    </span>
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
