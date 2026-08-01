import { Loader2, X } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveEvidenceOpen } from '../lib/evidence-resolution'
import { getPageScreenshots, getScreenshotUrl } from '../lib/page-screenshots'
import type { AnalysisResultData } from '../stores/analysis-store'
import { ArtifactPanel } from './analyze/ArtifactPanel'
import { EvidenceDetailCard, type EvidenceDetailData } from './analyze/EvidenceDetailCard'
import { ResultOverview } from './analyze/ResultOverview'
import { ScreenshotLightbox } from './analyze/ScreenshotLightbox'

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
  const [intelligenceRunning, setIntelligenceRunning] = useState(false)
  const [intelligenceProgress, setIntelligenceProgress] = useState<{ step: string; percent: number } | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [lightboxCrop, setLightboxCrop] = useState<string | null>(null)
  const [lightboxHighlight, setLightboxHighlight] = useState<{
    imageIndex: number
    rect: { x: number; y: number; width: number; height: number }
    label: string
  } | null>(null)
  const [evidenceDetail, setEvidenceDetail] = useState<EvidenceDetailData | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && lightboxIndex === null) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, onClose])

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
        setSaved(!!data.themeId)
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
      const response = await window.electronAPI.startDesignIntelligence(result.analysisId, undefined, true)
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

  const openEvidence = (evidenceId: string) => {
    if (!result?.designEvidence) return
    const resolution = resolveEvidenceOpen(result.designEvidence, getPageScreenshots(result), evidenceId)
    if (resolution.type === 'lightbox') {
      setEvidenceDetail(null)
      setLightboxCrop(resolution.target.cropPath ? getScreenshotUrl(resolution.target.cropPath) : null)
      setLightboxHighlight(resolution.target)
      setLightboxIndex(resolution.target.imageIndex)
      return
    }
    setEvidenceDetail({
      ...resolution.detail,
      fields: resolution.detail.fields.map((field) => ({
        label: t(`analyze.evidenceDetail.fields.${field.key}`),
        value: field.value,
      })),
    })
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
                onOpenLightbox={(index) => setLightboxIndex(index)}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <ArtifactPanel
                result={result}
                saved={saved}
                intelligenceRunning={intelligenceRunning}
                intelligenceProgress={intelligenceProgress}
                onSaved={() => setSaved(true)}
                onRetryIntelligence={retryIntelligence}
                onCancelIntelligence={async () => {
                  if (!result.analysisId) return
                  await window.electronAPI.cancelDesignIntelligence(result.analysisId)
                  setIntelligenceRunning(false)
                  setIntelligenceProgress(null)
                }}
                onSkipIntelligence={skipIntelligence}
                onResultUpdate={(update) => setResult((current) => (current ? { ...current, ...update } : current))}
                onOpenEvidence={openEvidence}
              />
            </div>
          </div>
        )}
      </div>
      {lightboxIndex !== null && result && (
        <ScreenshotLightbox
          images={[
            ...(lightboxCrop ? [lightboxCrop] : []),
            ...getPageScreenshots(result).map((screenshot) => getScreenshotUrl(screenshot.path)),
          ]}
          index={lightboxIndex}
          highlight={
            lightboxHighlight?.imageIndex === lightboxIndex
              ? { rect: lightboxHighlight.rect, label: lightboxHighlight.label }
              : undefined
          }
          onIndexChange={(index) => {
            setLightboxIndex(index)
            setLightboxHighlight(null)
          }}
          onClose={() => {
            setLightboxIndex(null)
            setLightboxHighlight(null)
            setLightboxCrop(null)
          }}
        />
      )}
      {evidenceDetail && lightboxIndex === null && (
        <EvidenceDetailCard detail={evidenceDetail} onClose={() => setEvidenceDetail(null)} />
      )}
    </div>
  )
}
