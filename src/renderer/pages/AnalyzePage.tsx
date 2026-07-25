import { Loader2 } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function AnalyzePage() {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<{ step: string; percent: number } | null>(null)

  useEffect(() => {
    const unsubscribe = window.electronAPI.onAnalysisProgress((p) => {
      setProgress(p)
    })
    return unsubscribe
  }, [])

  const handleAnalyze = async () => {
    if (!url.trim()) return
    setAnalyzing(true)
    setProgress({ step: t('analyze.preparing'), percent: 0 })

    try {
      const result = await window.electronAPI.analyzeUrl(url)
      if (result.error) {
        setProgress({ step: t('analyze.failed', { message: result.message }), percent: 0 })
      } else {
        setProgress({ step: t('analyze.complete'), percent: 100 })
      }
    } catch (err) {
      console.error('Analysis failed:', err)
      setProgress({ step: t('analyze.error'), percent: 0 })
    } finally {
      setAnalyzing(false)
      setTimeout(() => setProgress(null), 3000)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-8 app-drag-region" />
      <div className="px-8 pt-4 pb-6">
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

      <div className="flex-1 flex items-center justify-center px-8">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-semibold">{t('analyze.emptyTitle')}</h3>
          <p className="text-muted-foreground text-sm mt-2">{t('analyze.emptyDescription')}</p>
        </div>
      </div>
    </div>
  )
}
