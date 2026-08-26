import { Loader2, X } from 'lucide-react'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AnalysisResultData } from '../stores/analysis-store'
import { ArtifactPanel } from './analyze/ArtifactPanel'
import { EvidenceViewer, useEvidenceViewer } from './analyze/EvidenceViewer'
import { ResultOverview } from './analyze/ResultOverview'

interface AnalysisDetailDialogProps {
  analysisId: string
  initialEvidenceId?: string
  onClose: (changed: boolean) => void
}

export function AnalysisDetailDialog({ analysisId, initialEvidenceId, onClose }: AnalysisDetailDialogProps) {
  const { t } = useTranslation()
  const [result, setResult] = useState<AnalysisResultData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const summaryChanged = useRef(false)
  const initialEvidenceOpened = useRef(false)
  const evidenceViewer = useEvidenceViewer(result, (key) => t(`analyze.evidenceDetail.fields.${key}`))
  const closeDialog = useCallback(() => onClose(summaryChanged.current), [onClose])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && evidenceViewer.lightboxIndex === null) closeDialog()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeDialog, evidenceViewer.lightboxIndex])

  useEffect(() => {
    window.electronAPI
      .getAnalysis(analysisId)
      .then((data) => {
        if (!data) {
          setError(true)
          return
        }
        setResult({
          analysisId: data.id,
          savedThemeId: data.savedThemeId,
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
          designEvidence: data.designEvidence ?? undefined,
          designProfile: data.designProfile,
          reconstructionBrief: data.reconstructionBrief,
          agentContext: data.agentContext,
          validationReport: data.validationReport,
          completion: data.completion,
        })
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [analysisId])

  useEffect(() => {
    if (!result || !initialEvidenceId || initialEvidenceOpened.current) return
    initialEvidenceOpened.current = true
    evidenceViewer.openEvidence(initialEvidenceId)
  }, [evidenceViewer, initialEvidenceId, result])

  return (
    <div
      data-testid="analysis-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
    >
      <div
        data-testid="analysis-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-detail-title"
        className="ui-enter flex h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="analysis-detail-header flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <h2 id="analysis-detail-title" className="min-w-0 flex-1 truncate text-sm font-semibold">
            {result?.url || t('history.title')}
          </h2>
          <button
            type="button"
            onClick={closeDialog}
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
          <div className="analysis-detail-body flex min-h-0 flex-1 flex-col gap-3 p-4 lg:flex-row lg:gap-4">
            <div className="analysis-detail-sidebar max-h-40 w-full shrink-0 overflow-auto scrollbar-hidden lg:max-h-none lg:w-[340px]">
              <ResultOverview
                result={result}
                analyzing={false}
                onRetryWithLogin={() => {}}
                onOpenLightbox={evidenceViewer.openLightbox}
              />
            </div>
            <div className="analysis-detail-main flex min-h-0 min-w-0 flex-1 flex-col">
              <ArtifactPanel
                result={result}
                onResultUpdate={(update) => {
                  summaryChanged.current = true
                  setResult((current) => (current ? { ...current, ...update } : current))
                }}
                onOpenEvidence={evidenceViewer.openEvidence}
              />
            </div>
          </div>
        )}
      </div>
      <EvidenceViewer result={result} controller={evidenceViewer} />
    </div>
  )
}
