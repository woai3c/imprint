import { ExternalLink, Trash2 } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnalysisDetailDialog } from '../components/AnalysisDetailDialog'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { useFeedbackStore } from '../stores/feedback-store'

interface AnalysisRecord {
  id: string
  theme_id: string | null
  url: string
  pages_analyzed: number
  viewports: string
  duration_ms: number | null
  token_usage: number
  created_at: string
  theme_name: string | null
  source_url: string | null
}

export function HistoryPage() {
  const { t, i18n } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = await window.electronAPI.getAnalyses()
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
      notify(t('feedback.historyDeleted'))
      setPendingDeleteId(null)
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = records.filter(
    (r) =>
      r.url.toLowerCase().includes(search.toLowerCase()) || r.theme_name?.toLowerCase().includes(search.toLowerCase()),
  )

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
                className="flex cursor-pointer items-center gap-4 rounded-lg border border-border p-4 transition-colors hover:border-primary/30 hover:bg-secondary/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm truncate">{record.url}</span>
                    {record.duration_ms && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t('history.duration', { seconds: (record.duration_ms / 1000).toFixed(1) })}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('history.pageCount', { count: record.pages_analyzed })}
                    {record.theme_name && ` · ${record.theme_name}`}
                  </p>
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
      {detailId && <AnalysisDetailDialog analysisId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
