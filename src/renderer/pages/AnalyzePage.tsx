import { Download, Loader2, Save } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '../components/PageHeader'
import { TokenPreview } from '../components/TokenPreview'
import { type AnalysisResultData, useAnalysisStore } from '../stores/analysis-store'
import { useFeedbackStore } from '../stores/feedback-store'

type ExportTab = 'preview' | 'markdown' | 'tailwind' | 'css' | 'json'

export function AnalyzePage() {
  const { t } = useTranslation()
  const store = useAnalysisStore()
  const notify = useFeedbackStore((state) => state.show)
  const [url, setUrl] = useState(store.lastUrl || '')
  const [activeTab, setActiveTab] = useState<ExportTab>('preview')
  const [saved, setSaved] = useState(false)

  const analyzing = store.analyzing
  const progress = store.progress
  const result = store.lastResult

  useEffect(() => {
    const unsubscribe = window.electronAPI.onAnalysisProgress((p: { step: string; percent: number }) => {
      store.setProgress(p)
    })
    return unsubscribe
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

  const handleAnalyze = async () => {
    if (!url.trim()) return
    store.setAnalyzing(true)
    store.setUrl(url)
    setSaved(false)
    store.setProgress({ step: t('analyze.preparing'), percent: 0 })

    try {
      const res = await window.electronAPI.analyzeUrl(url)
      if (res.error) {
        store.setProgress({ step: t('analyze.failed', { message: res.message }), percent: 0 })
        setTimeout(() => store.setProgress(null), 5000)
      } else {
        const data = res as AnalysisResultData
        store.setResult(data, url)
      }
    } catch (err) {
      console.error('Analysis failed:', err)
      store.setProgress({ step: t('analyze.error'), percent: 0 })
      setTimeout(() => store.setProgress(null), 5000)
    } finally {
      store.setAnalyzing(false)
    }
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
    let ext = 'md'
    if (activeTab === 'markdown' || activeTab === 'preview') {
      content = result.designDoc
      ext = 'md'
    } else if (activeTab === 'tailwind') {
      content = result.tailwindTheme
      ext = 'css'
    } else if (activeTab === 'css') {
      content = result.cssVariables
      ext = 'css'
    } else if (activeTab === 'json') {
      content = JSON.stringify(result.tokens, null, 2)
      ext = 'json'
    }
    try {
      const exportResult = await window.electronAPI.exportFile(content, `design-tokens.${ext}`, ext)
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

  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    hostname = url
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={t('analyze.title')} description={t('analyze.description')} />

      <div className="px-8">
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder={t('analyze.placeholder')}
              disabled={analyzing}
              className="w-full h-12 px-4 rounded-lg border border-input bg-background text-base
                         placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <button
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

        {progress && (
          <div className="mt-4" aria-live="polite">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">{translateStep(progress.step)}</span>
              <span className="text-muted-foreground">{progress.percent}%</span>
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
      </div>

      {/* Results */}
      {result ? (
        <div className="ui-enter mx-8 mb-8 mt-4 flex min-h-0 flex-1 gap-5">
          {/* Left: Overview Panel */}
          <div className="w-80 shrink-0 flex flex-col gap-4 overflow-auto">
            {/* Website identity */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <h3 className="text-base font-semibold">{hostname}</h3>

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

            {/* Screenshot */}
            {result.screenshots[0] && (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <img
                  src={`imprint-file:///${result.screenshots[0].replace(/\\/g, '/')}`}
                  alt={t('analyze.screenshot')}
                  className="w-full h-auto max-h-52 object-cover object-top"
                />
              </div>
            )}

            {/* Meta info */}
            <div className="text-xs text-muted-foreground space-y-1 px-1">
              <p>{t('history.duration', { seconds: (result.duration / 1000).toFixed(1) })}</p>
              <p className="truncate" title={url}>
                {url}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSaveToLibrary}
                disabled={saved}
                className="flex-1 text-xs py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Save size={12} />
                {saved ? t('analyze.saved') : t('analyze.saveToLibrary')}
              </button>
              <button
                onClick={handleExportFile}
                className="flex-1 text-xs py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1.5"
              >
                <Download size={12} />
                {t('analyze.exportFile')}
              </button>
            </div>
          </div>

          {/* Right: Tabbed content */}
          <div className="flex-1 flex flex-col min-w-0 border border-border/60 rounded-xl overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center border-b border-border/60 bg-muted/20 px-3">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
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
              <div className="ml-auto flex gap-2 pr-1 items-center">
                <button
                  onClick={handleCopy}
                  className="text-xs px-2.5 py-1 rounded bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                >
                  {t('analyze.copy')}
                </button>
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
              {activeTab !== 'preview' && (
                <pre className="text-xs font-mono whitespace-pre-wrap wrap-break-word leading-relaxed p-4">
                  {activeTab === 'markdown' && result.designDoc}
                  {activeTab === 'tailwind' && result.tailwindTheme}
                  {activeTab === 'css' && result.cssVariables}
                  {activeTab === 'json' && JSON.stringify(result.tokens, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      ) : (
        !analyzing && (
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="text-center max-w-md">
              <h3 className="text-lg font-semibold">{t('analyze.emptyTitle')}</h3>
              <p className="text-muted-foreground text-sm mt-2">{t('analyze.emptyDescription')}</p>
              <p className="text-muted-foreground/70 text-xs mt-3">{t('analyze.noAiHint')}</p>
            </div>
          </div>
        )
      )}
    </div>
  )
}
