import { AlertTriangle, Info, Loader2, Square } from 'lucide-react'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MAX_ANALYSIS_PAGE_COUNT } from '../../core/analyzer/analysis-request.js'
import type {
  AnalysisProgress,
  AnalyzeResponse,
  AuthMode,
  AuthWallDetection,
  LoginDecision,
  LoginRequiredEvent,
} from '../../shared/ipc-contract'
import { AuthRequiredDialog } from '../components/AuthRequiredDialog'
import { BrowserSessionsDialog } from '../components/BrowserSessionsDialog'
import { PageHeader } from '../components/PageHeader'
import { ArtifactPanel } from '../components/analyze/ArtifactPanel'
import { EvidenceViewer, useEvidenceViewer } from '../components/analyze/EvidenceViewer'
import { ResultOverview } from '../components/analyze/ResultOverview'
import { EmptyState } from '../components/ui/EmptyState'
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
const ANALYSIS_RECOVERY_POLL_MS = 750

export function AnalyzePage() {
  const { t, i18n } = useTranslation()
  const store = useAnalysisStore()
  const notify = useFeedbackStore((state) => state.show)
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null)
  const [showBrowserSessions, setShowBrowserSessions] = useState(false)
  const [analysisDepth, setAnalysisDepth] = useState<'standard' | 'deep'>('standard')
  const [cancelling, setCancelling] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [pageCountInput, setPageCountInput] = useState(() => String(useAnalysisStore.getState().pageCount))

  useEffect(() => {
    const refresh = () => {
      window.electronAPI.getSettings().then((s) => {
        setAnalysisDepth(s.analysisDepth === 'deep' ? 'deep' : 'standard')
      })
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const analyzing = store.analyzing
  const progress = store.progress
  const result = store.lastResult
  const failure = store.failure
  const url = store.lastUrl
  const pageCount = store.pageCount
  const parsedPageCount = Number(pageCountInput)
  const pageCountInputValid =
    /^\d+$/.test(pageCountInput) &&
    Number.isSafeInteger(parsedPageCount) &&
    parsedPageCount >= 1 &&
    parsedPageCount <= MAX_ANALYSIS_PAGE_COUNT
  const evidenceViewer = useEvidenceViewer(result, (key) => t(`analyze.evidenceDetail.fields.${key}`))
  const notifyAnalysisReady = useCallback(
    (data: AnalysisResultData) => {
      if (data.completion?.reason && data.completion.reason !== 'complete') {
        notify(
          t('analyze.partialCompleteTip', {
            pages:
              data.pageCoverage?.analyzed || new Set(data.pageScreenshots?.map((screenshot) => screenshot.url)).size,
          }),
          'success',
        )
        return
      }
      notify(t('analyze.completeTip'), 'success')
    },
    [notify, t],
  )

  useEffect(() => {
    const unsubscribeProgress = window.electronAPI.onAnalysisProgress((p: AnalysisProgress) => {
      const current = useAnalysisStore.getState()
      if (current.analyzing) current.setProgress(p)
    })
    const unsubscribeLogin = window.electronAPI.onLoginRequired((request: LoginRequiredEvent) => {
      const current = useAnalysisStore.getState()
      current.setAnalyzing(true)
      setAuthPrompt({
        kind: 'login',
        requestId: request.requestId,
        retry: request.retry,
        targetUrl: current.lastUrl,
      })
    })
    return () => {
      unsubscribeProgress()
      unsubscribeLogin()
    }
  }, [])

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

  useEffect(() => {
    let disposed = false
    let pollTimer: number | undefined

    const applyRecoveredResponse = async (targetUrl: string, response: AnalyzeResponse) => {
      const current = useAnalysisStore.getState()
      setFinishing(false)
      if (response.authRequired && response.detection) {
        current.setProgress(null)
        current.setAnalyzing(true)
        setAuthPrompt({ kind: 'choice', detection: response.detection, targetUrl })
        return
      }
      if (response.cancelled) {
        current.setProgress(null)
        current.setAnalyzing(false)
        setAuthPrompt(null)
        notify(t('analyze.cancelledTip'))
        return
      }
      if (response.error) {
        current.setFailure({
          message: response.message?.trim() || t('analyze.error'),
          url: targetUrl,
          authMode: 'auto',
          stage: response.stage,
        })
        return
      }
      if (!response.tokens || typeof response.cssVariables !== 'string' || typeof response.designDoc !== 'string') {
        current.setFailure({ message: t('analyze.error'), url: targetUrl, authMode: 'auto' })
        return
      }

      const data = response as AnalysisResultData
      current.setResult(data, targetUrl)
      setAuthPrompt(null)
      notifyAnalysisReady(data)
    }

    const recover = async () => {
      try {
        const recovery = await window.electronAPI.recoverAnalysis()
        if (disposed) return
        const current = useAnalysisStore.getState()
        if (recovery.status === 'running') {
          if (!current.analyzing) current.clearResult()
          current.setUrl(recovery.url)
          current.setAnalyzing(true)
          current.setProgress(
            recovery.progress || {
              step: 'progress.launchingBrowser',
              percent: 0,
              analyzedPages: 0,
              discoveredPages: 1,
              resultReady: false,
              activeElapsedMs: 0,
            },
          )
          pollTimer = window.setTimeout(recover, ANALYSIS_RECOVERY_POLL_MS)
          return
        }
        if (recovery.status === 'complete') {
          await applyRecoveredResponse(recovery.url, recovery.response)
          await window.electronAPI.acknowledgeAnalysis()
          return
        }
        if (!current.analyzing && current.progress) current.setProgress(null)
      } catch {
        if (!disposed && useAnalysisStore.getState().analyzing) {
          pollTimer = window.setTimeout(recover, ANALYSIS_RECOVERY_POLL_MS)
        }
      }
    }

    void recover()
    return () => {
      disposed = true
      if (pollTimer !== undefined) window.clearTimeout(pollTimer)
    }
  }, [i18n.language, notify, notifyAnalysisReady, t])

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
        notify(t('analyze.cancelledTip'))
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
      notifyAnalysisReady(data)
      return 'complete'
    } catch (err) {
      console.error('Analysis failed:', err)
      store.setFailure({
        message: err instanceof Error ? err.message : t('analyze.error'),
        url: targetUrl,
        authMode,
      })
      return 'error'
    } finally {
      try {
        await window.electronAPI.acknowledgeAnalysis()
      } catch {
        // A renderer reload can dispose this IPC context; the next renderer will recover the completed result.
      }
    }
  }

  const startAnalysis = async (targetUrl: string, authMode: AuthMode) => {
    store.clearResult()
    store.setAnalyzing(true)
    setCancelling(false)
    setFinishing(false)
    store.setUrl(targetUrl)
    setAuthPrompt(null)
    store.setProgress({
      step: 'progress.launchingBrowser',
      percent: 0,
      analyzedPages: 0,
      discoveredPages: 1,
      resultReady: false,
      activeElapsedMs: 0,
    })

    const outcome = await runAnalysis(targetUrl, authMode)
    if (outcome !== 'auth-required') store.setAnalyzing(false)
    setCancelling(false)
    setFinishing(false)
  }

  const handleAnalyze = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    if (!pageCountInputValid) {
      notify(t('analyze.pageCount.invalid'), 'error')
      return
    }

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
    setCancelling(false)
    setFinishing(false)
  }

  const handleCancelAnalysis = async () => {
    if (!analyzing || cancelling) return
    setCancelling(true)
    try {
      const response = await window.electronAPI.cancelAnalysis()
      if (!response.success) setCancelling(false)
    } catch {
      setCancelling(false)
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleFinishAnalysis = async () => {
    if (!analyzing || !progress?.resultReady || finishing) return
    setFinishing(true)
    try {
      const response = await window.electronAPI.finishAnalysis()
      if (!response.success) setFinishing(false)
    } catch {
      setFinishing(false)
      notify(t('feedback.actionFailed'), 'error')
    }
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
            disabled={analyzing || !url.trim() || !pageCountInputValid}
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
          <input
            id="analysis-page-count"
            data-testid="analysis-page-count"
            type="number"
            min={1}
            max={MAX_ANALYSIS_PAGE_COUNT}
            step={1}
            inputMode="numeric"
            value={pageCountInput}
            onChange={(event) => {
              const value = event.target.value
              const parsed = Number(value)
              setPageCountInput(value)
              if (
                /^\d+$/.test(value) &&
                Number.isSafeInteger(parsed) &&
                parsed >= 1 &&
                parsed <= MAX_ANALYSIS_PAGE_COUNT
              ) {
                store.setPageCount(parsed)
              }
            }}
            onBlur={() => {
              if (!pageCountInputValid) setPageCountInput(String(pageCount))
              else setPageCountInput(String(parsedPageCount))
            }}
            disabled={analyzing}
            aria-describedby="analysis-page-count-help"
            aria-invalid={!pageCountInputValid}
            className={`h-7 w-20 shrink-0 rounded-md border bg-background px-2 font-medium text-foreground outline-none transition-colors focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 ${
              pageCountInputValid ? 'border-input focus:border-ring' : 'border-destructive focus:border-destructive'
            }`}
          />
          <span className="shrink-0 text-muted-foreground">{t('analyze.pageCount.unit')}</span>
          <span
            id="analysis-page-count-help"
            className={`min-w-64 flex-1 leading-5 ${pageCountInputValid ? 'text-muted-foreground' : 'text-destructive'}`}
          >
            {t(pageCountInputValid ? 'analyze.pageCount.help' : 'analyze.pageCount.invalid')}
          </span>
          <div className="group/depth relative ml-auto flex shrink-0 items-center gap-2">
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
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info size={14} aria-hidden="true" />
            </button>
            <div
              id="analysis-depth-help"
              role="tooltip"
              className="pointer-events-none invisible absolute right-0 top-full z-60 mt-1 w-64 rounded-lg border border-border bg-card p-2.5 text-xs leading-5 text-muted-foreground opacity-0 shadow-xl transition-opacity group-hover/depth:visible group-hover/depth:opacity-100 group-focus-within/depth:visible group-focus-within/depth:opacity-100"
            >
              {t(`analyze.depth.${analysisDepth}Help`)}
            </div>
          </div>
        </div>

        {analyzing && progress && (
          <div className="mt-4" aria-live="polite">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{translateStep(progress.step)}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{Math.round(progress.percent)}%</span>
                {analyzing && (
                  <button
                    type="button"
                    data-testid="analysis-cancel"
                    onClick={handleCancelAnalysis}
                    disabled={cancelling}
                    aria-label={cancelling ? t('analyze.cancelling') : t('analyze.cancel')}
                    title={cancelling ? t('analyze.cancelling') : t('analyze.cancel')}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                  >
                    {cancelling ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Square size={12} className="fill-current" aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
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
            {progress.resultReady && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {t('analyze.progressReady', {
                    analyzed: progress.analyzedPages,
                    discovered: progress.discoveredPages,
                  })}
                </span>
                <button
                  type="button"
                  data-testid="analysis-finish"
                  onClick={handleFinishAnalysis}
                  disabled={finishing || cancelling}
                  className="min-h-8 rounded-lg border border-primary/30 bg-primary/10 px-3 font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-wait disabled:opacity-60"
                >
                  {finishing ? t('analyze.finishing') : t('analyze.finishNow')}
                </button>
              </div>
            )}
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
            onOpenLightbox={evidenceViewer.openLightbox}
          />
          <ArtifactPanel
            result={result}
            onResultUpdate={store.mergeResult}
            onOpenEvidence={evidenceViewer.openEvidence}
          />
        </div>
      ) : (
        !analyzing &&
        !failure && (
          <EmptyState
            title={t('analyze.emptyTitle')}
            description={t('analyze.emptyDescription')}
            hint={t('analyze.analysisHint')}
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
      <EvidenceViewer result={result} controller={evidenceViewer} />
    </div>
  )
}
