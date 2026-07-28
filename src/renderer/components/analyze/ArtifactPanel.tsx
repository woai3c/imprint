import { Copy, Download, Info, Save } from 'lucide-react'
import remarkGfm from 'remark-gfm'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'

import type { AnalysisResultData } from '../../stores/analysis-store'
import { useFeedbackStore } from '../../stores/feedback-store'
import { TokenPreview } from '../TokenPreview'
import { IconButton } from '../ui/IconButton'
import { Tabs } from '../ui/Tabs'
import { ExampleComponents } from './ExampleComponents'

export type ExportTab = 'preview' | 'markdown' | 'tailwind' | 'css' | 'json'

interface ArtifactPanelProps {
  result: AnalysisResultData
  saved: boolean
  onSaved: () => void
}

export function ArtifactPanel({ result, saved, onSaved }: ArtifactPanelProps) {
  const { t } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [activeTab, setActiveTab] = useState<ExportTab>('preview')

  const activeArtifact = activeTab === 'preview' ? 'markdown' : activeTab
  const activeArtifactLabel = t(`analyze.artifacts.${activeArtifact}`)

  const tabs: { id: ExportTab; label: string }[] = [
    { id: 'preview', label: t('analyze.tabPreview') },
    { id: 'markdown', label: t('analyze.tabMarkdown') },
    { id: 'tailwind', label: t('analyze.tabTailwind') },
    { id: 'css', label: t('analyze.tabCss') },
    { id: 'json', label: t('analyze.tabJson') },
  ]

  const tokens = result.tokens as Record<string, unknown> | undefined

  const handleCopy = async () => {
    let content = ''
    if (activeTab === 'markdown') content = result.designDoc || ''
    else if (activeTab === 'tailwind') content = result.tailwindTheme || ''
    else if (activeTab === 'css') content = result.cssVariables || ''
    else if (activeTab === 'json') content = JSON.stringify(result.tokens, null, 2)
    else if (activeTab === 'preview') content = result.designDoc || ''
    try {
      await navigator.clipboard.writeText(content)
      notify(t('feedback.copied'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleSaveToLibrary = async () => {
    try {
      await window.electronAPI.saveTheme({
        url: result.url,
        tokens: result.tokens,
        cssVariables: result.cssVariables,
        tailwindTheme: result.tailwindTheme,
        designDoc: result.designDoc,
        screenshots: result.screenshots,
      })
      onSaved()
      notify(t('feedback.savedToLibrary'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleExportFile = async () => {
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

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60">
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as ExportTab)}
        testIdPrefix="artifact-tab"
        trailing={
          <>
            <IconButton
              data-testid="save-theme"
              icon={Save}
              label={saved ? t('analyze.saved') : t('analyze.saveToLibrary')}
              onClick={handleSaveToLibrary}
              disabled={saved}
            />
            <IconButton
              icon={Download}
              label={t('analyze.exportCurrent', { format: activeArtifactLabel })}
              onClick={handleExportFile}
            />
            <IconButton
              icon={Copy}
              label={t('analyze.copyCurrent', { format: activeArtifactLabel })}
              onClick={handleCopy}
            />
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
          </>
        }
      />

      <div key={activeTab} className="ui-enter flex-1 overflow-auto bg-card">
        {activeTab === 'preview' && tokens && (
          <>
            <TokenPreview tokens={tokens as never} darkTokens={result.darkTokens} hasDarkMode={result.hasDarkMode} />
            <div className="px-6 pb-6">
              <ExampleComponents designDoc={result.designDoc} cssVariables={result.cssVariables} />
            </div>
          </>
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
  )
}
