import { Loader2, X } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AnalysisResultData } from '../stores/analysis-store'
import { ArtifactPanel } from './analyze/ArtifactPanel'

interface AnalysisDetailDialogProps {
  analysisId: string
  onClose: () => void
}

export function AnalysisDetailDialog({ analysisId, onClose }: AnalysisDetailDialogProps) {
  const { t } = useTranslation()
  const [result, setResult] = useState<AnalysisResultData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    window.electronAPI
      .getAnalysis(analysisId)
      .then((data) => {
        if (!data) {
          setError(true)
          return
        }
        setResult({
          tokens: data.tokens,
          cssVariables: data.cssVariables,
          tailwindTheme: data.tailwindTheme,
          designDoc: data.designDoc,
          screenshots: data.pageScreenshots.map((screenshot) => screenshot.path),
          pageScreenshots: data.pageScreenshots,
          duration: data.durationMs ?? 0,
          url: data.url,
          finalUrl: data.finalUrl ?? undefined,
          featureTags: data.featureTags,
          darkTokens: data.darkTokens,
          hasDarkMode: data.hasDarkMode,
          accessMode: data.accessMode ?? undefined,
          authWallDetected: data.authWallDetected,
        })
        setSaved(!!data.themeId)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [analysisId, onClose])

  return (
    <div
      data-testid="analysis-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]"
    >
      <div
        data-testid="analysis-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-detail-title"
        className="ui-enter flex h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <h2 id="analysis-detail-title" className="min-w-0 flex-1 truncate text-sm font-semibold">
            {result?.url || t('history.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={16} />
          </button>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 size={16} className="animate-spin" />
            {t('history.loading')}
          </div>
        ) : error || !result ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground" role="alert">
            {t('feedback.actionFailed')}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 p-4">
            <ArtifactPanel result={result} saved={saved} onSaved={() => setSaved(true)} />
          </div>
        )}
      </div>
    </div>
  )
}
