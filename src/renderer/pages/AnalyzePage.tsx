import { Loader2 } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

interface AnalysisResultData {
  themeId: string
  tokens: Record<string, unknown>
  cssVariables: string
  tailwindTheme: string
  designDoc: string
  screenshots: string[]
  duration: number
}

type ExportTab = 'preview' | 'markdown' | 'tailwind' | 'css' | 'json'

export function AnalyzePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<{ step: string; percent: number } | null>(null)
  const [result, setResult] = useState<AnalysisResultData | null>(null)
  const [activeTab, setActiveTab] = useState<ExportTab>('markdown')

  useEffect(() => {
    const unsubscribe = window.electronAPI.onAnalysisProgress((p) => {
      setProgress(p)
    })
    return unsubscribe
  }, [])

  const handleAnalyze = async () => {
    if (!url.trim()) return
    setAnalyzing(true)
    setResult(null)
    setProgress({ step: t('analyze.preparing'), percent: 0 })

    try {
      const res = await window.electronAPI.analyzeUrl(url)
      if (res.error) {
        setProgress({ step: t('analyze.failed', { message: res.message }), percent: 0 })
        setTimeout(() => setProgress(null), 5000)
      } else {
        setResult(res as AnalysisResultData)
        setProgress(null)
      }
    } catch (err) {
      console.error('Analysis failed:', err)
      setProgress({ step: t('analyze.error'), percent: 0 })
      setTimeout(() => setProgress(null), 5000)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCopy = () => {
    let content = ''
    if (activeTab === 'markdown') content = result?.designDoc || ''
    else if (activeTab === 'tailwind') content = result?.tailwindTheme || ''
    else if (activeTab === 'css') content = result?.cssVariables || ''
    else if (activeTab === 'json') content = JSON.stringify(result?.tokens, null, 2)
    navigator.clipboard.writeText(content)
  }

  const handlePreviewClick = () => {
    if (result?.cssVariables) {
      window.electronAPI.exportTheme(result.themeId, 'css')
    }
    navigate('/templates')
  }

  const tabs: { id: ExportTab; label: string }[] = [
    { id: 'preview', label: 'Preview' },
    { id: 'markdown', label: 'DESIGN.md' },
    { id: 'tailwind', label: 'Tailwind v4' },
    { id: 'css', label: 'CSS Variables' },
    { id: 'json', label: 'Tokens JSON' },
  ]

  // Extract colors from tokens for display
  const colorsList = result?.tokens
    ? Object.values((result.tokens as Record<string, unknown>).colors || {}).slice(0, 12)
    : []

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-4 pb-4">
        <h2 className="text-2xl font-bold">{t('analyze.title')}</h2>
        <p className="text-muted-foreground mt-1">{t('analyze.description')}</p>
      </div>

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
                       flex items-center gap-2"
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
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">{progress.step}</span>
              <span className="text-muted-foreground">{progress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {result ? (
        <div className="flex-1 flex mt-4 mx-8 mb-8 gap-4 min-h-0">
          {/* Left panel: screenshot + colors */}
          <div className="w-72 shrink-0 flex flex-col gap-4 overflow-auto">
            {result.screenshots[0] && (
              <div className="rounded-lg border border-border overflow-hidden">
                <img
                  src={`file://${result.screenshots[0]}`}
                  alt="Page screenshot"
                  className="w-full h-auto max-h-48 object-cover object-top"
                />
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Extracted Colors</p>
              <div className="flex flex-wrap gap-1.5">
                {(colorsList as string[]).map((color, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded border border-border"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              <p>{t('history.duration', { seconds: (result.duration / 1000).toFixed(1) })}</p>
              <p className="truncate mt-0.5">{url}</p>
            </div>
          </div>

          {/* Right panel: tabs + code */}
          <div className="flex-1 flex flex-col min-w-0 border border-border rounded-lg overflow-hidden">
            <div className="flex items-center border-b border-border bg-card px-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === 'preview') {
                      handlePreviewClick()
                    } else {
                      setActiveTab(tab.id)
                    }
                  }}
                  className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <div className="ml-auto flex gap-2 pr-2">
                <button
                  onClick={handleCopy}
                  className="text-xs px-2.5 py-1 rounded bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-card">
              <pre className="text-xs font-mono whitespace-pre-wrap wrap-break-word leading-relaxed">
                {activeTab === 'markdown' && result.designDoc}
                {activeTab === 'tailwind' && result.tailwindTheme}
                {activeTab === 'css' && result.cssVariables}
                {activeTab === 'json' && JSON.stringify(result.tokens, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : (
        !analyzing && (
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="text-center max-w-md">
              <h3 className="text-lg font-semibold">{t('analyze.emptyTitle')}</h3>
              <p className="text-muted-foreground text-sm mt-2">{t('analyze.emptyDescription')}</p>
            </div>
          </div>
        )
      )}
    </div>
  )
}
