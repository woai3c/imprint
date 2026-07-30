import { AlertTriangle, Info, Loader2 } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  AnalyzeResponse,
  AuthMode,
  AuthWallDetection,
  DesignIntelligenceResponse,
  LoginDecision,
  LoginRequiredEvent,
} from '../../shared/ipc-contract'
import { AuthRequiredDialog } from '../components/AuthRequiredDialog'
import { BrowserSessionsDialog } from '../components/BrowserSessionsDialog'
import { PageHeader } from '../components/PageHeader'
import { ArtifactPanel } from '../components/analyze/ArtifactPanel'
import { EvidenceDetailCard, type EvidenceDetailData } from '../components/analyze/EvidenceDetailCard'
import { ResultOverview } from '../components/analyze/ResultOverview'
import { ScreenshotLightbox } from '../components/analyze/ScreenshotLightbox'
import { Alert } from '../components/ui/Alert'
import { EmptyState } from '../components/ui/EmptyState'
import { resolveEvidenceOpen } from '../lib/evidence-resolution'
import { getPageScreenshots, getScreenshotUrl } from '../lib/page-screenshots'
import { getNoAiTipDismissedPreference, setNoAiTipDismissedPreference } from '../lib/preferences'
import { type AnalysisResultData, useAnalysisStore } from '../stores/analysis-store'
import { useFeedbackStore } from '../stores/feedback-store'

type AuthPrompt =
  | {
      kind: 'choice'
      detection: AuthWallDetection
      targetUrl: string
    }
  | {
      kind: 'login'
      requestId: string
      retry: boolean
      targetUrl: string
    }

type AnalysisOutcome = 'complete' | 'auth-required' | 'cancelled' | 'error'

export function AnalyzePage() {
  const { t, i18n } = useTranslation()
  const store = useAnalysisStore()
  const notify = useFeedbackStore((state) => state.show)
  const [saved, setSaved] = useState(false)
  const [hasAiConfig, setHasAiConfig] = useState(true)
  const [aiTipDismissed, setAiTipDismissed] = useState(getNoAiTipDismissedPreference)
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null)
  const [showBrowserSessions, setShowBrowserSessions] = useState(false)
  const [analysisDepth, setAnalysisDepth] = useState<'standard' | 'deep'>('standard')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [lightboxCrop, setLightboxCrop] = useState<string | null>(null)
  const [lightboxHighlight, setLightboxHighlight] = useState<{
    imageIndex: number
    rect: { x: number; y: number; width: number; height: number }
    label: string
  } | null>(null)
  const [evidenceDetail, setEvidenceDetail] = useState<EvidenceDetailData | null>(null)

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      const configured = s.aiMode === 'apiKey' ? Boolean(s.provider && s.apiKey) : Boolean(s.agentCli)
      setHasAiConfig(configured)
      setAnalysisDepth(s.analysisDepth === 'deep' ? 'deep' : 'standard')
    })
  }, [])

  const analyzing = store.analyzing
  const progress = store.progress
  const result = store.lastResult
  const failure = store.failure
  const url = store.lastUrl
  const pageCount = store.pageCount

  useEffect(() => {
    const unsubscribeProgress = window.electronAPI.onAnalysisProgress((p: { step: string; percent: number }) => {
      store.setProgress(p)
    })
    const unsubscribeIntelligenceProgress = window.electronAPI.onDesignIntelligenceProgress(
      (p: { step: string; percent: number }) => {
        store.setIntelligenceProgress(p)
      },
    )
    const unsubscribeLogin = window.electronAPI.onLoginRequired((request: LoginRequiredEvent) => {
      store.setAnalyzing(true)
      setAuthPrompt({
        kind: 'login',
        requestId: request.requestId,
        retry: request.retry,
        targetUrl: store.lastUrl,
      })
    })
    return () => {
      unsubscribeProgress()
      unsubscribeIntelligenceProgress()
      unsubscribeLogin()
    }
  }, [store])

  const translateStep = (step: string): string => {
    if (step.includes('::')) {
      const parts = step.split('::')
      if (parts.length === 3) {
        return t(parts[0], { current: parts[1], total: parts[2] })
      }
      return t(parts[0], { viewport: parts[1] })
    }
    return t(step, { defaultValue: step })
  }

  const runDesignIntelligence = async (analysisId: string, force = false) => {
    store.setIntelligenceRunning(true)
    store.setIntelligenceProgress({ step: 'progress.interpretingDesignLanguage', percent: 8 })
    try {
      const response: DesignIntelligenceResponse = await window.electronAPI.startDesignIntelligence(
        analysisId,
        i18n.language,
        force,
      )
      if (response.error) {
        notify(t('analyze.designDna.fallbackNotice'), 'error')
        return
      }
      store.mergeResult(response)
      const status = response.designIntelligence?.status
      if (response.designIntelligence?.failureCode === 'cancelled') {
        notify(t('analyze.designDna.cancelledNotice'))
        return
      }
      notify(
        status === 'complete' || status === 'partial'
          ? t('analyze.designDna.completeNotice')
          : t('analyze.designDna.fallbackNotice'),
        status === 'complete' || status === 'partial' ? 'success' : 'error',
      )
    } catch {
      notify(t('analyze.designDna.fallbackNotice'), 'error')
    } finally {
      store.setIntelligenceRunning(false)
      store.setIntelligenceProgress(null)
    }
  }

  const skipDesignIntelligence = async (analysisId: string) => {
    try {
      const response = await window.electronAPI.skipDesignIntelligence(analysisId)
      if (response.error || !response.designIntelligence) throw new Error('Skip failed')
      store.mergeResult({ analysisId, designIntelligence: response.designIntelligence })
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const runAnalysis = async (targetUrl: string, authMode: AuthMode): Promise<AnalysisOutcome> => {
    try {
      const res: AnalyzeResponse = await window.electronAPI.analyzeUrl(targetUrl, {
        authMode,
        maxPages: pageCount,
        language: i18n.language,
        depth: analysisDepth,
      })
      if (res.authRequired && res.detection) {
        store.setProgress(null)
        setAuthPrompt({
          kind: 'choice',
          detection: res.detection,
          targetUrl,
        })
        return 'auth-required'
      }
      if (res.cancelled) {
        store.setProgress(null)
        setAuthPrompt(null)
        return 'cancelled'
      }
      if (res.error) {
        store.setFailure({
          message: res.message?.trim() || t('analyze.error'),
          url: targetUrl,
          authMode,
          stage: res.stage,
        })
        return 'error'
      }

      const data = res as AnalysisResultData
      store.setResult(data, targetUrl)
      setAuthPrompt(null)
      notify(t('analyze.completeTip'), 'success')
      if (data.analysisId && data.designIntelligence?.status === 'pending') {
        void runDesignIntelligence(data.analysisId)
      }
      return 'complete'
    } catch (err) {
      console.error('Analysis failed:', err)
      store.setFailure({
        message: err instanceof Error ? err.message : t('analyze.error'),
        url: targetUrl,
        authMode,
      })
      return 'error'
    }
  }

  const startAnalysis = async (targetUrl: string, authMode: AuthMode) => {
    store.setAnalyzing(true)
    store.setUrl(targetUrl)
    store.setFailure(null)
    setSaved(false)
    setAuthPrompt(null)
    store.setProgress({ step: t('analyze.preparing'), percent: 0 })

    const outcome = await runAnalysis(targetUrl, authMode)
    if (outcome !== 'auth-required') store.setAnalyzing(false)
  }

  const handleAnalyze = async () => {
    const trimmed = url.trim()
    if (!trimmed) return

    let targetUrl: string
    try {
      const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
      if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        throw new Error('invalid')
      }
      targetUrl = parsed.href
    } catch {
      notify(t('analyze.invalidUrl'), 'error')
      return
    }

    await startAnalysis(targetUrl, 'auto')
  }

  const handleAuthChoice = async (authMode: 'anonymous' | 'managed') => {
    if (!authPrompt || authPrompt.kind !== 'choice') return
    await startAnalysis(authPrompt.targetUrl, authMode)
  }

  const handleCancelAuthChoice = () => {
    setAuthPrompt(null)
    store.setProgress(null)
    store.setAnalyzing(false)
  }

  const handleLoginDecision = async (decision: LoginDecision) => {
    if (!authPrompt || authPrompt.kind !== 'login') return
    const currentPrompt = authPrompt
    if (decision === 'continue') store.setAnalyzing(true)
    setAuthPrompt(null)
    const response = await window.electronAPI.submitLoginDecision(currentPrompt.requestId, decision)
    if (!response.success) {
      setAuthPrompt(currentPrompt)
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleRetryWithLogin = async () => {
    if (!result) return
    await startAnalysis(result.url, 'managed')
  }

  const handleRetryFailure = async () => {
    if (!failure) return
    await startAnalysis(failure.url, failure.authMode)
  }

  const handleOpenEvidence = (evidenceId: string) => {
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

  const handleCancelIntelligence = async () => {
    if (!result?.analysisId) return
    await window.electronAPI.cancelDesignIntelligence(result.analysisId)
    store.setIntelligenceRunning(false)
    store.setIntelligenceProgress(null)
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={t('analyze.title')}
        description={t('analyze.description')}
        actions={
          <button
            type="button"
            data-testid="browser-sessions-open"
            onClick={() => setShowBrowserSessions(true)}
            disabled={analyzing}
            className="min-h-9 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('analyze.sessions.open')}
          </button>
        }
      />

      <div className="px-8">
        <div className="flex gap-3">
          <input
            data-testid="analyze-url"
            type="url"
            value={url}
            onChange={(e) => store.setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder={t('analyze.placeholder')}
            disabled={analyzing}
            className="h-12 min-w-0 flex-1 rounded-lg border border-input bg-background px-4 text-base
                       placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring
                       disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            data-testid="analyze-submit"
            onClick={handleAnalyze}
            disabled={analyzing || !url.trim()}
            className="h-12 px-6 rounded-lg bg-primary text-primary-foreground font-medium
                       hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center gap-2 cursor-pointer"
          >
            {analyzing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('analyze.analyzing')}
              </>
            ) : (
              t('analyze.button')
            )}
          </button>
        </div>
        <div
          data-testid="analysis-page-scope"
          className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs"
        >
          <label htmlFor="analysis-page-count" className="shrink-0 font-medium text-foreground">
            {t('analyze.pageCount.label')}
          </label>
          <select
            id="analysis-page-count"
            data-testid="analysis-page-count"
            value={pageCount}
            onChange={(event) => store.setPageCount(Number(event.target.value))}
            disabled={analyzing}
            aria-describedby="analysis-page-count-help"
            className="h-7 shrink-0 cursor-pointer rounded-md border border-input bg-background px-2 font-medium text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {t('analyze.pageCount.option', { count })}
              </option>
            ))}
          </select>
          <span id="analysis-page-count-help" className="min-w-64 flex-1 leading-5 text-muted-foreground">
            {t('analyze.pageCount.help')}
          </span>
          <div className="group relative z-50 ml-auto flex shrink-0 items-center gap-2">
            <label htmlFor="analysis-depth" className="shrink-0 font-medium text-foreground">
              {t('analyze.depth.label')}
            </label>
            <select
              id="analysis-depth"
              data-testid="analysis-depth"
              value={analysisDepth}
              onChange={(event) => {
                const depth = event.target.value as 'standard' | 'deep'
                setAnalysisDepth(depth)
                void window.electronAPI.saveSettings({ analysisDepth: depth })
              }}
              disabled={analyzing}
              aria-describedby="analysis-depth-help"
              className="h-7 shrink-0 cursor-pointer rounded-md border border-input bg-background px-2 font-medium text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="standard">{t('analyze.depth.standard')}</option>
              <option value="deep">{t('analyze.depth.deep')}</option>
            </select>
            <button
              type="button"
              aria-label={t(`analyze.depth.${analysisDepth}Help`)}
              className="flex h-5 w-5 cursor-help items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info size={13} aria-hidden="true" />
            </button>
            <div
              id="analysis-depth-help"
              role="tooltip"
              className="pointer-events-none invisible absolute right-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover p-2.5 text-xs leading-5 text-muted-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
            >
              {t(`analyze.depth.${analysisDepth}Help`)}
            </div>
          </div>
        </div>

        {!hasAiConfig && !aiTipDismissed && !result && !failure && (
          <Alert
            tone="warning"
            testId="no-ai-tip"
            dismissTestId="dismiss-no-ai-tip"
            className="mt-3"
            dismissLabel={t('feedback.dismiss')}
            onDismiss={() => {
              setAiTipDismissed(true)
              setNoAiTipDismissedPreference(true)
            }}
          >
            {t('analyze.noAiTip')}
          </Alert>
        )}

        {progress && (
          <div className="mt-4" aria-live="polite">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">{translateStep(progress.step)}</span>
              <span className="text-muted-foreground">{Math.round(progress.percent)}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label={translateStep(progress.step)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {failure && (
          <div
            data-testid="analysis-error"
            role="alert"
            className="ui-enter mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{t('analyze.failure.title')}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('analyze.failure.description')}</p>
                <p className="mt-2 truncate text-xs text-muted-foreground" title={failure.url}>
                  {failure.url}
                </p>
                {failure.stage && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('analyze.failure.stage', { stage: translateStep(failure.stage) })}
                  </p>
                )}
                <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg bg-background/70 p-3 text-xs leading-5 text-foreground">
                  {failure.message}
                </pre>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    data-testid="analysis-error-retry"
                    onClick={handleRetryFailure}
                    className="min-h-9 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    {t('analyze.failure.retry')}
                  </button>
                  <button
                    type="button"
                    onClick={() => store.setFailure(null)}
                    className="min-h-9 rounded-lg bg-secondary px-4 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent"
                  >
                    {t('analyze.failure.dismiss')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {result ? (
        <div
          data-testid="analysis-result"
          data-source-url={result.url}
          data-access-mode={result.accessMode}
          className="ui-enter mx-8 mb-8 mt-4 flex min-h-0 flex-1 gap-5"
        >
          <ResultOverview
            result={result}
            analyzing={analyzing}
            onRetryWithLogin={handleRetryWithLogin}
            onOpenLightbox={(index) => {
              setLightboxCrop(null)
              setLightboxIndex(index)
            }}
          />
          <ArtifactPanel
            result={result}
            saved={saved}
            intelligenceRunning={store.intelligenceRunning}
            intelligenceProgress={store.intelligenceProgress}
            onSaved={() => setSaved(true)}
            onRetryIntelligence={() => result.analysisId && runDesignIntelligence(result.analysisId, true)}
            onCancelIntelligence={handleCancelIntelligence}
            onSkipIntelligence={() => result.analysisId && skipDesignIntelligence(result.analysisId)}
            onResultUpdate={store.mergeResult}
            onOpenEvidence={handleOpenEvidence}
          />
        </div>
      ) : (
        !analyzing &&
        !failure && (
          <EmptyState
            title={t('analyze.emptyTitle')}
            description={t('analyze.emptyDescription')}
            hint={t('analyze.noAiHint')}
            className="flex-1 px-8"
          />
        )
      )}

      {authPrompt?.kind === 'choice' && (
        <AuthRequiredDialog
          kind="choice"
          onLogin={() => handleAuthChoice('managed')}
          onContinueAnonymous={() => handleAuthChoice('anonymous')}
          onCancel={handleCancelAuthChoice}
        />
      )}
      {authPrompt?.kind === 'login' && (
        <AuthRequiredDialog
          kind="login"
          retry={authPrompt.retry}
          onContinue={() => handleLoginDecision('continue')}
          onContinueAnonymous={() => handleLoginDecision('anonymous')}
          onCancel={() => handleLoginDecision('cancel')}
        />
      )}
      {showBrowserSessions && <BrowserSessionsDialog onClose={() => setShowBrowserSessions(false)} />}
      {evidenceDetail && lightboxIndex === null && (
        <EvidenceDetailCard detail={evidenceDetail} onClose={() => setEvidenceDetail(null)} />
      )}
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
            if (lightboxHighlight?.imageIndex !== index) setLightboxHighlight(null)
          }}
          onClose={() => {
            setLightboxIndex(null)
            setLightboxHighlight(null)
            setLightboxCrop(null)
          }}
        />
      )}
    </div>
  )
}
