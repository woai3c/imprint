import i18n from 'i18next'
import { Loader2, X } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AnalysisResultData } from '../stores/analysis-store'
import { ArtifactPanel } from './analyze/ArtifactPanel'
import { EvidenceViewer, useEvidenceViewer } from './analyze/EvidenceViewer'
import { ResultOverview } from './analyze/ResultOverview'

interface AnalysisDetailDialogProps {
  analysisId: string
  onClose: () => void
}

export function AnalysisDetailDialog({ analysisId, onClose }: AnalysisDetailDialogProps) {
  const { t } = useTranslation()
  const [result, setResult] = useState<AnalysisResultData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [intelligenceRunning, setIntelligenceRunning] = useState(false)
  const [intelligenceProgress, setIntelligenceProgress] = useState<{ step: string; percent: number } | null>(null)
  const evidenceViewer = useEvidenceViewer(result, (key) => t(`analyze.evidenceDetail.fields.${key}`))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && evidenceViewer.lightboxIndex === null) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [evidenceViewer.lightboxIndex, onClose])

  useEffect(() => {
    const unsubscribeIntelligenceProgress = window.electronAPI.onDesignIntelligenceProgress(setIntelligenceProgress)

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
          designIntelligence: data.designIntelligence,
          designProfile: data.designProfile,
          reconstructionBrief: data.reconstructionBrief,
          agentContext: data.agentContext,
          validationReport: data.validationReport,
        })
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))

    return () => {
      unsubscribeIntelligenceProgress()
    }
  }, [analysisId])

  const retryIntelligence = async () => {
    if (!result?.analysisId) return
    setIntelligenceRunning(true)
    try {
      const response = await window.electronAPI.startDesignIntelligence(result.analysisId, i18n.language, true)
      setResult((current) => (current ? { ...current, ...response } : current))
    } finally {
      setIntelligenceRunning(false)
      setIntelligenceProgress(null)
    }
  }

  const skipIntelligence = async () => {
    if (!result?.analysisId) return
    try {
      const response = await window.electronAPI.skipDesignIntelligence(result.analysisId)
      if (response.error || !response.designIntelligence) throw new Error('Skip failed')
      setResult((current) => (current ? { ...current, designIntelligence: response.designIntelligence } : current))
    } catch {
      /* keep the current record state when skipping fails */
    }
  }

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
          <div className="flex min-h-0 flex-1 gap-4 p-4">
            <div className="w-[340px] shrink-0 overflow-auto scrollbar-hidden">
              <ResultOverview
                result={result}
                analyzing={false}
                onRetryWithLogin={() => {}}
                onOpenLightbox={evidenceViewer.openLightbox}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <ArtifactPanel
                result={result}
                intelligenceRunning={intelligenceRunning}
                intelligenceProgress={intelligenceProgress}
                onRetryIntelligence={retryIntelligence}
                onCancelIntelligence={async () => {
                  if (!result.analysisId) return
                  await window.electronAPI.cancelDesignIntelligence(result.analysisId)
                  setIntelligenceRunning(false)
                  setIntelligenceProgress(null)
                }}
                onSkipIntelligence={skipIntelligence}
                onResultUpdate={(update) => setResult((current) => (current ? { ...current, ...update } : current))}
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
