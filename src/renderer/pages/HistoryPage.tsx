import { ExternalLink, Trash2 } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '../components/PageHeader'
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

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('history.confirmDelete'))) return

    try {
      await window.electronAPI.deleteAnalysis(id)
      setRecords((current) => current.filter((record) => record.id !== id))
      notify(t('feedback.historyDeleted'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
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
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h3 className="text-lg font-semibold">{t('history.noResults')}</h3>
              <p className="text-muted-foreground text-sm mt-1">{t('history.noResultsTip')}</p>
            </div>
          </div>
        ) : (
          <div className="ui-enter space-y-2">
            {filtered.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-4 p-4 rounded-lg border border-border hover:border-primary/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-medium">{record.theme_name || t('history.untitled')}</h4>
                    {record.token_usage > 0 && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                        {t('history.tokenCount', { count: record.token_usage })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground truncate max-w-75">{record.url}</span>
                    {record.duration_ms && (
                      <span className="text-xs text-muted-foreground">
                        {t('history.duration', { seconds: (record.duration_ms / 1000).toFixed(1) })}
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(record.created_at).toLocaleDateString(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US')}
                </span>

                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => window.open(record.url, '_blank')}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label={t('history.openSource')}
                    title={t('history.openSource')}
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(record.id)}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t('history.deleteRecord')}
                    title={t('history.deleteRecord')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
