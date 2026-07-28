import { AlertTriangle, Copy, Download, Info, Loader2, Minus, Plus, Save, X } from 'lucide-react'
import remarkGfm from 'remark-gfm'

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'

import { AuthRequiredDialog } from '../components/AuthRequiredDialog'
import { BrowserSessionsDialog } from '../components/BrowserSessionsDialog'
import { PageHeader } from '../components/PageHeader'
import { TokenPreview } from '../components/TokenPreview'
import { getNoAiTipDismissedPreference, setNoAiTipDismissedPreference } from '../lib/preferences'
import { type AnalysisResultData, useAnalysisStore } from '../stores/analysis-store'
import { useFeedbackStore } from '../stores/feedback-store'

type ExportTab = 'preview' | 'markdown' | 'tailwind' | 'css' | 'json'
type AuthMode = 'auto' | 'anonymous' | 'managed'

interface AuthDetection {
  detected: boolean
  confidence: 'low' | 'medium' | 'high'
  reasons: string[]
  finalUrl: string
}

interface LoginRequiredEvent {
  requestId: string
  detection: AuthDetection
  retry: boolean
}

type AuthPrompt =
  | {
      kind: 'choice'
      detection: AuthDetection
      targetUrl: string
    }
  | {
      kind: 'login'
      requestId: string
      retry: boolean
      targetUrl: string
    }

interface AnalyzeResponse extends Partial<AnalysisResultData> {
  error?: boolean
  message?: string
  stage?: string
  authRequired?: boolean
  detection?: AuthDetection
  cancelled?: boolean
}

type AnalysisOutcome = 'complete' | 'auth-required' | 'cancelled' | 'error'

export function AnalyzePage() {
  const { t } = useTranslation()
  const store = useAnalysisStore()
  const notify = useFeedbackStore((state) => state.show)
  const [activeTab, setActiveTab] = useState<ExportTab>('preview')
  const [saved, setSaved] = useState(false)
  const [hasAiConfig, setHasAiConfig] = useState(true)
  const [aiTipDismissed, setAiTipDismissed] = useState(getNoAiTipDismissedPreference)
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null)
  const [showBrowserSessions, setShowBrowserSessions] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [lightboxScale, setLightboxScale] = useState(1)
  const [lightboxOffset, setLightboxOffset] = useState({ x: 0, y: 0 })
  const [lightboxDragging, setLightboxDragging] = useState(false)
  const lightboxDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  useEffect(() => {
    window.electronAPI.getSettings().then((s: Record<string, string>) => {
      const configured = !!(s.apiKey || s.agentCli)
      setHasAiConfig(configured)
    })
  }, [])

  const analyzing = store.analyzing
  const progress = store.progress
  const result = store.lastResult
  const failure = store.failure
  const url = store.lastUrl
  const pageCount = store.pageCount
  const activeArtifact = activeTab === 'preview' ? 'markdown' : activeTab
  const activeArtifactLabel = t(`analyze.artifacts.${activeArtifact}`)

  useEffect(() => {
    const unsubscribeProgress = window.electronAPI.onAnalysisProgress((p: { step: string; percent: number }) => {
      store.setProgress(p)
    })
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

  const runAnalysis = async (targetUrl: string, authMode: AuthMode): Promise<AnalysisOutcome> => {
    try {
      const res = (await window.electronAPI.analyzeUrl(targetUrl, {
        authMode,
        maxPages: pageCount,
      })) as AnalyzeResponse
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

    store.setAnalyzing(true)
    store.setUrl(targetUrl)
    store.setFailure(null)
    setSaved(false)
    setAuthPrompt(null)
    store.setProgress({ step: t('analyze.preparing'), percent: 0 })

    const outcome = await runAnalysis(targetUrl, 'auto')
    if (outcome !== 'auth-required') store.setAnalyzing(false)
  }

  const handleAuthChoice = async (authMode: 'anonymous' | 'managed') => {
    if (!authPrompt || authPrompt.kind !== 'choice') return
    const targetUrl = authPrompt.targetUrl
    store.setAnalyzing(true)
    setAuthPrompt(null)
    store.setFailure(null)
    store.setProgress({ step: t('analyze.preparing'), percent: 0 })

    const outcome = await runAnalysis(targetUrl, authMode)
    if (outcome !== 'auth-required') store.setAnalyzing(false)
  }

  const handleCancelAuthChoice = () => {
    setAuthPrompt(null)
    store.setProgress(null)
    store.setAnalyzing(false)
  }

  const handleLoginDecision = async (decision: 'continue' | 'anonymous' | 'cancel') => {
    if (!authPrompt || authPrompt.kind !== 'login') return
    const currentPrompt = authPrompt
    if (decision === 'continue') store.setAnalyzing(true)
    setAuthPrompt(null)
    const response = (await window.electronAPI.submitLoginDecision(currentPrompt.requestId, decision)) as {
      success: boolean
    }
    if (!response.success) {
      setAuthPrompt(currentPrompt)
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleRetryWithLogin = async () => {
    if (!result) return
    store.setAnalyzing(true)
    store.setUrl(result.url)
    store.setFailure(null)
    setSaved(false)
    store.setProgress({ step: t('analyze.preparing'), percent: 0 })
    const outcome = await runAnalysis(result.url, 'managed')
    if (outcome !== 'auth-required') store.setAnalyzing(false)
  }

  const handleRetryFailure = async () => {
    if (!failure) return
    const retry = failure
    store.setAnalyzing(true)
    store.setUrl(retry.url)
    store.setFailure(null)
    setSaved(false)
    store.setProgress({ step: t('analyze.preparing'), percent: 0 })
    const outcome = await runAnalysis(retry.url, retry.authMode)
    if (outcome !== 'auth-required') store.setAnalyzing(false)
  }

  const openLightbox = (src: string) => {
    setLightboxSrc(src)
    setLightboxScale(1)
    setLightboxOffset({ x: 0, y: 0 })
  }

  const closeLightbox = () => {
    lightboxDragRef.current = null
    setLightboxDragging(false)
    setLightboxSrc(null)
    setLightboxScale(1)
    setLightboxOffset({ x: 0, y: 0 })
  }

  const zoomLightbox = (delta: number) => {
    const nextScale = Math.min(5, Math.max(0.25, lightboxScale + delta))
    setLightboxScale(nextScale)
    if (nextScale <= 1) {
      lightboxDragRef.current = null
      setLightboxDragging(false)
      setLightboxOffset({ x: 0, y: 0 })
    }
  }

  const handleLightboxPointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (lightboxScale <= 1) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    lightboxDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: lightboxOffset.x,
      originY: lightboxOffset.y,
    }
    setLightboxDragging(true)
  }

  const handleLightboxPointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    const drag = lightboxDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    setLightboxOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    })
  }

  const handleLightboxPointerEnd = (event: ReactPointerEvent<HTMLImageElement>) => {
    const drag = lightboxDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    lightboxDragRef.current = null
    setLightboxDragging(false)
  }

  const handleCopy = async () => {
    let content = ''
    if (activeTab === 'markdown') content = result?.designDoc || ''
    else if (activeTab === 'tailwind') content = result?.tailwindTheme || ''
    else if (activeTab === 'css') content = result?.cssVariables || ''
    else if (activeTab === 'json') content = JSON.stringify(result?.tokens, null, 2)
    else if (activeTab === 'preview') content = result?.designDoc || ''
    try {
      await navigator.clipboard.writeText(content)
      notify(t('feedback.copied'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleSaveToLibrary = async () => {
    if (!result) return
    try {
      await window.electronAPI.saveTheme({
        url: result.url,
        tokens: result.tokens,
        cssVariables: result.cssVariables,
        tailwindTheme: result.tailwindTheme,
        designDoc: result.designDoc,
        screenshots: result.screenshots,
      })
      setSaved(true)
      notify(t('feedback.savedToLibrary'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleExportFile = async () => {
    if (!result) return
    let content = ''
    let ext: 'md' | 'css' | 'json' = 'md'
    let filename = 'DESIGN.md'
    if (activeTab === 'markdown' || activeTab === 'preview') {
      content = result.designDoc
      ext = 'md'
    } else if (activeTab === 'tailwind') {
      content = result.tailwindTheme
      ext = 'css'
      filename = 'tailwind-theme.css'
    } else if (activeTab === 'css') {
      content = result.cssVariables
      ext = 'css'
      filename = 'theme-variables.css'
    } else if (activeTab === 'json') {
      content = JSON.stringify(result.tokens, null, 2)
      ext = 'json'
      filename = 'design-tokens.json'
    }
    try {
      const exportResult = await window.electronAPI.exportFile(content, filename, ext)
      if (exportResult.success) notify(t('feedback.exported'))
      else if (exportResult.error) notify(t('feedback.actionFailed'), 'error')
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const tabs: { id: ExportTab; label: string }[] = [
    { id: 'preview', label: t('analyze.tabPreview') },
    { id: 'markdown', label: t('analyze.tabMarkdown') },
    { id: 'tailwind', label: t('analyze.tabTailwind') },
    { id: 'css', label: t('analyze.tabCss') },
    { id: 'json', label: t('analyze.tabJson') },
  ]

  const tokens = result?.tokens as Record<string, unknown> | undefined
  const colorCount = tokens?.colors ? Object.keys(tokens.colors as Record<string, string>).length : 0
  const typographyData = tokens?.typography as { fontSizes?: string[]; fontWeights?: string[] } | undefined
  const typeStyleCount = typographyData?.fontSizes?.length || 0
  const spacingCount = (tokens?.spacing as string[] | undefined)?.length || 0
  const radiiCount = (tokens?.radii as string[] | undefined)?.length || 0
  const pageScreenshots =
    result?.pageScreenshots && result.pageScreenshots.length > 0
      ? result.pageScreenshots
      : (result?.screenshots || []).map((screenshotPath) => ({
          url: result?.finalUrl || result?.url || url,
          path: screenshotPath,
          viewport: 'desktop',
        }))
  const analyzedPageCount = new Set(pageScreenshots.map((screenshot) => screenshot.url)).size

  let hostname = ''
  try {
    hostname = new URL(result?.url || url).hostname
  } catch {
    hostname = result?.url || url
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
        </div>

        {!hasAiConfig && !aiTipDismissed && !result && !failure && (
          <div
            data-testid="no-ai-tip"
            className="mt-3 flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <p className="flex-1 text-xs leading-5 text-yellow-800 dark:text-yellow-300">{t('analyze.noAiTip')}</p>
            <button
              type="button"
              data-testid="dismiss-no-ai-tip"
              onClick={() => {
                setAiTipDismissed(true)
                setNoAiTipDismissedPreference(true)
              }}
              className="shrink-0 rounded p-0.5 text-yellow-600 hover:bg-yellow-500/20 dark:text-yellow-400 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
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
          {/* Left: Overview Panel */}
          <div className="w-80 shrink-0 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none space-y-4 pb-4">
              {result.authWallDetected && result.accessMode === 'anonymous' && (
                <div
                  data-testid="anonymous-auth-warning"
                  className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-yellow-700 dark:text-yellow-300" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                        {t('analyze.auth.anonymousWarningTitle')}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-yellow-800 dark:text-yellow-200">
                        {t('analyze.auth.anonymousWarningDescription')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetryWithLogin}
                    disabled={analyzing}
                    className="mt-3 min-h-9 w-full rounded-lg bg-yellow-700 px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-yellow-300 dark:text-yellow-950"
                  >
                    {t('analyze.auth.retryWithLogin')}
                  </button>
                </div>
              )}

              {/* Website identity */}
              <div className="rounded-xl border border-border/60 bg-card/50 p-5">
                <h3 data-testid="analysis-source" className="text-base font-semibold">
                  {hostname}
                </h3>

                {/* Feature tags */}
                {result.featureTags && result.featureTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {result.featureTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats summary */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs text-muted-foreground">
                  <span>
                    <strong className="text-foreground">{colorCount}</strong> {t('preview.statColors')}
                  </span>
                  <span>
                    <strong className="text-foreground">{typeStyleCount}</strong> {t('preview.statTypes')}
                  </span>
                  <span>
                    <strong className="text-foreground">{spacingCount}</strong> {t('preview.statSpacing')}
                  </span>
                  <span>
                    <strong className="text-foreground">{radiiCount}</strong> {t('preview.statRadii')}
                  </span>
                </div>

                {/* Dark mode indicator */}
                <div className="mt-3 text-xs">
                  {result.hasDarkMode ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      ● {t('analyze.darkModeSupported')}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">○ {t('analyze.darkModeNotDetected')}</span>
                  )}
                </div>
              </div>

              {/* Source-page evidence */}
              {pageScreenshots.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h4 className="text-xs font-medium text-foreground">{t('analyze.evidence.title')}</h4>
                    <span className="text-xs text-muted-foreground">
                      {t('analyze.evidence.summary', {
                        pages: analyzedPageCount,
                        screenshots: pageScreenshots.length,
                      })}
                    </span>
                  </div>
                  <div data-testid="analysis-page-screenshots" className="space-y-3">
                    {pageScreenshots.map((screenshot, index) => (
                      <figure
                        key={`${screenshot.path}-${index}`}
                        data-testid="analysis-page-screenshot"
                        className="overflow-hidden rounded-xl border border-border/60 bg-card/50"
                      >
                        <figcaption className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-xs">
                          <span className="shrink-0 font-medium text-foreground">{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={screenshot.url}>
                            {screenshot.url}
                          </span>
                          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {t(`analyze.viewports.${screenshot.viewport}`, {
                              defaultValue: screenshot.viewport,
                            })}
                          </span>
                        </figcaption>
                        <img
                          src={`imprint-file:///${screenshot.path.replace(/\\/g, '/')}`}
                          alt={t('analyze.evidence.screenshotAlt', { url: screenshot.url })}
                          className="max-h-44 w-full cursor-zoom-in object-cover object-top"
                          onClick={() => openLightbox(`imprint-file:///${screenshot.path.replace(/\\/g, '/')}`)}
                        />
                      </figure>
                    ))}
                  </div>
                </section>
              )}

              {/* Meta info */}
              <div className="text-xs text-muted-foreground space-y-1 px-1">
                <p>{t('history.duration', { seconds: (result.duration / 1000).toFixed(1) })}</p>
                <p className="truncate" title={result.url}>
                  {result.url}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Tabbed content */}
          <div className="flex-1 flex flex-col min-w-0 border border-border/60 rounded-xl overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center border-b border-border/60 bg-muted/20 px-3">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  data-testid={`artifact-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  aria-pressed={activeTab === tab.id}
                  className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <div className="ml-auto flex gap-1 pr-1 items-center">
                <button
                  data-testid="save-theme"
                  onClick={handleSaveToLibrary}
                  disabled={saved}
                  title={saved ? t('analyze.saved') : t('analyze.saveToLibrary')}
                  aria-label={saved ? t('analyze.saved') : t('analyze.saveToLibrary')}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  <Save size={14} />
                </button>
                <button
                  onClick={handleExportFile}
                  title={t('analyze.exportCurrent', { format: activeArtifactLabel })}
                  aria-label={t('analyze.exportCurrent', { format: activeArtifactLabel })}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={handleCopy}
                  title={t('analyze.copyCurrent', { format: activeArtifactLabel })}
                  aria-label={t('analyze.copyCurrent', { format: activeArtifactLabel })}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Copy size={14} />
                </button>
                <div className="group relative z-50">
                  <button
                    type="button"
                    data-testid="ai-export-info"
                    aria-label={t('analyze.aiExport.title')}
                    aria-describedby="ai-export-tooltip"
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Info size={14} />
                  </button>
                  <div
                    id="ai-export-tooltip"
                    role="tooltip"
                    className="pointer-events-none invisible absolute top-full right-0 mt-2 w-72 rounded-lg border border-border bg-popover p-3 text-left opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  >
                    <p className="text-xs font-medium text-popover-foreground">{t('analyze.aiExport.title')}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('analyze.aiExport.summary')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tab content */}
            <div key={activeTab} className="ui-enter flex-1 overflow-auto bg-card">
              {activeTab === 'preview' && tokens && (
                <TokenPreview
                  tokens={tokens as never}
                  darkTokens={result.darkTokens}
                  hasDarkMode={result.hasDarkMode}
                />
              )}
              {activeTab === 'markdown' && (
                <div
                  data-testid="artifact-content-markdown"
                  className="prose prose-sm dark:prose-invert max-w-none p-6 prose-code:before:content-none prose-code:after:content-none"
                >
                  <Markdown remarkPlugins={[remarkGfm]}>{result.designDoc}</Markdown>
                </div>
              )}
              {activeTab !== 'preview' && activeTab !== 'markdown' && (
                <pre
                  data-testid={`artifact-content-${activeTab}`}
                  className="text-xs font-mono whitespace-pre-wrap wrap-break-word leading-relaxed p-4"
                >
                  {activeTab === 'tailwind' && result.tailwindTheme}
                  {activeTab === 'css' && result.cssVariables}
                  {activeTab === 'json' && JSON.stringify(result.tokens, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      ) : (
        !analyzing &&
        !failure && (
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="text-center max-w-md">
              <h3 className="text-lg font-semibold">{t('analyze.emptyTitle')}</h3>
              <p className="text-muted-foreground text-sm mt-2">{t('analyze.emptyDescription')}</p>
              <p className="text-muted-foreground/70 text-xs mt-3">{t('analyze.noAiHint')}</p>
            </div>
          </div>
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
      {lightboxSrc && (
        <div
          data-testid="analysis-screenshot-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t('analyze.evidence.lightboxTitle')}
          className="fixed inset-0 z-200 flex items-center justify-center overflow-hidden bg-black/80 backdrop-blur-sm"
          onClick={closeLightbox}
          onWheel={(e) => {
            e.preventDefault()
            zoomLightbox(e.deltaY < 0 ? 0.25 : -0.25)
          }}
        >
          <button
            className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            onClick={closeLightbox}
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={20} />
          </button>
          <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">
            <button
              data-testid="analysis-screenshot-zoom-out"
              aria-label={t('analyze.evidence.zoomOut')}
              className="rounded-full p-1 text-white transition-colors hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation()
                zoomLightbox(-0.25)
              }}
            >
              <Minus size={16} />
            </button>
            <span className="min-w-12 text-center text-xs text-white">{Math.round(lightboxScale * 100)}%</span>
            <button
              data-testid="analysis-screenshot-zoom-in"
              aria-label={t('analyze.evidence.zoomIn')}
              className="rounded-full p-1 text-white transition-colors hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation()
                zoomLightbox(0.25)
              }}
            >
              <Plus size={16} />
            </button>
            {lightboxScale > 1 && (
              <span className="border-l border-white/20 pl-2 text-xs text-white/80">
                {t('analyze.evidence.dragHint')}
              </span>
            )}
          </div>
          <img
            data-testid="analysis-screenshot-lightbox-image"
            src={lightboxSrc}
            alt={t('analyze.evidence.lightboxAlt')}
            draggable={false}
            className={`max-h-[90vh] max-w-[90vw] touch-none select-none rounded-lg object-contain shadow-2xl ${
              lightboxScale > 1 ? (lightboxDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
            } ${lightboxDragging ? '' : 'transition-transform duration-150'}`}
            style={{
              transform: `translate3d(${lightboxOffset.x}px, ${lightboxOffset.y}px, 0) scale(${lightboxScale})`,
            }}
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={handleLightboxPointerDown}
            onPointerMove={handleLightboxPointerMove}
            onPointerUp={handleLightboxPointerEnd}
            onPointerCancel={handleLightboxPointerEnd}
          />
        </div>
      )}
    </div>
  )
}
