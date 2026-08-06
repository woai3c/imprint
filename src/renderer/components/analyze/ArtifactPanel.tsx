import { Copy, Download, FlaskConical, Info, Save } from 'lucide-react'
import remarkGfm from 'remark-gfm'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'

import type { ThemeSaveConflict } from '../../../shared/ipc-contract'
import type { AnalysisResultData } from '../../stores/analysis-store'
import { useFeedbackStore } from '../../stores/feedback-store'
import { TokenPreview } from '../TokenPreview'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { IconButton } from '../ui/IconButton'
import { Tabs } from '../ui/Tabs'
import { DesignDnaPanel } from './DesignDnaPanel'
import { ExampleComponents } from './ExampleComponents'

export type ExportTab = 'overview' | 'preview' | 'markdown' | 'tailwind' | 'css'

interface ArtifactPanelProps {
  result: AnalysisResultData
  intelligenceRunning?: boolean
  intelligenceProgress?: { step: string; percent: number } | null
  onRetryIntelligence?: () => void
  onCancelIntelligence?: () => void
  onSkipIntelligence?: () => void
  onResultUpdate?: (result: Partial<AnalysisResultData>) => void
  onOpenEvidence?: (evidenceId: string) => void
}

export function ArtifactPanel({
  result,
  intelligenceRunning,
  intelligenceProgress,
  onRetryIntelligence,
  onCancelIntelligence,
  onSkipIntelligence,
  onResultUpdate,
  onOpenEvidence,
}: ArtifactPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const notify = useFeedbackStore((state) => state.show)
  const [activeTab, setActiveTab] = useState<ExportTab>('overview')
  const [savingTheme, setSavingTheme] = useState(false)
  const [saveConflict, setSaveConflict] = useState<ThemeSaveConflict | null>(null)

  const exportArtifact = activeTab === 'overview' || activeTab === 'preview' ? 'markdown' : activeTab
  const activeArtifactLabel = t(`analyze.artifacts.${exportArtifact}`)
  const showCopyDownload = activeTab !== 'preview'

  const tabs: { id: ExportTab; label: string }[] = [
    { id: 'overview', label: t('analyze.tabOverview') },
    { id: 'preview', label: t('analyze.tabPreview') },
    { id: 'markdown', label: t('analyze.tabMarkdown') },
    { id: 'tailwind', label: t('analyze.tabTailwind') },
    { id: 'css', label: t('analyze.tabCss') },
  ]

  const tokens = result.tokens as Record<string, unknown> | undefined

  const handleCopy = async () => {
    let content = ''
    if (activeTab === 'tailwind') content = result.tailwindTheme || ''
    else if (activeTab === 'css') content = result.cssVariables || ''
    else content = result.designDoc || ''
    try {
      await navigator.clipboard.writeText(content)
      notify(t('feedback.copied'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleExportFile = async () => {
    let content = ''
    let ext: 'md' | 'css' = 'md'
    let filename = 'DESIGN.md'
    if (activeTab === 'tailwind') {
      content = result.tailwindTheme
      ext = 'css'
      filename = 'tailwind-theme.css'
    } else if (activeTab === 'css') {
      content = result.cssVariables
      ext = 'css'
      filename = 'theme-variables.css'
    } else {
      content = result.designDoc
    }
    try {
      const exportResult = await window.electronAPI.exportFile(content, filename, ext)
      if (exportResult.success) notify(t('feedback.exported'))
      else if (exportResult.error) notify(t('feedback.actionFailed'), 'error')
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const saveTheme = async (overwriteThemeId?: string) => {
    if (!result.analysisId || result.savedThemeId) return
    setSavingTheme(true)
    try {
      const response = await window.electronAPI.saveTheme(result.analysisId, overwriteThemeId)
      if (!response.success) {
        setSaveConflict(response.conflict)
        return
      }
      setSaveConflict(null)
      onResultUpdate?.({ savedThemeId: response.theme.id })
      notify(
        response.replaced ? t('feedback.themeReplaced', { theme: response.theme.name }) : t('feedback.savedToLibrary'),
      )
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      setSavingTheme(false)
    }
  }

  return (
    <>
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
                label={result.savedThemeId ? t('analyze.saved') : t('analyze.saveToLibrary')}
                onClick={() => void saveTheme()}
                disabled={!result.analysisId || !!result.savedThemeId || savingTheme}
              />
              {result.savedThemeId && (
                <IconButton
                  data-testid="validate-theme"
                  icon={FlaskConical}
                  label={t('analyze.validateInScenarios')}
                  onClick={() => navigate('/templates', { state: { themeId: result.savedThemeId } })}
                />
              )}
              {showCopyDownload && (
                <IconButton
                  icon={Download}
                  label={t('analyze.exportCurrent', { format: activeArtifactLabel })}
                  onClick={handleExportFile}
                />
              )}
              {showCopyDownload && (
                <IconButton
                  icon={Copy}
                  label={t('analyze.copyCurrent', { format: activeArtifactLabel })}
                  onClick={handleCopy}
                />
              )}
              <div className="group relative z-50">
                <button
                  type="button"
                  data-testid="ai-export-info"
                  aria-label={t('analyze.aiExport.title')}
                  aria-describedby="ai-export-tooltip"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info size={14} />
                </button>
                <div
                  id="ai-export-tooltip"
                  role="tooltip"
                  className="pointer-events-none invisible absolute top-full right-0 z-60 mt-2 w-72 rounded-lg border border-border bg-card p-3 text-left opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                >
                  <p className="text-xs font-medium text-popover-foreground">{t('analyze.aiExport.title')}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('analyze.aiExport.summary')}</p>
                </div>
              </div>
            </>
          }
        />

        <div key={activeTab} data-testid="artifact-scroll-container" className="ui-enter flex-1 overflow-auto bg-card">
          {activeTab === 'overview' && (
            <DesignDnaPanel
              result={result}
              intelligenceRunning={intelligenceRunning}
              intelligenceProgress={intelligenceProgress}
              onRetry={onRetryIntelligence}
              onCancel={onCancelIntelligence}
              onSkip={onSkipIntelligence}
              onResultUpdate={onResultUpdate}
              onOpenEvidence={onOpenEvidence}
            />
          )}
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
          {(activeTab === 'tailwind' || activeTab === 'css') && (
            <pre
              data-testid={`artifact-content-${activeTab}`}
              className="text-xs font-mono whitespace-pre-wrap wrap-break-word leading-relaxed p-4"
            >
              {activeTab === 'tailwind' && result.tailwindTheme}
              {activeTab === 'css' && result.cssVariables}
            </pre>
          )}
        </div>
      </div>

      {saveConflict && (
        <ConfirmDialog
          title={t('analyze.replaceThemeTitle')}
          description={t('analyze.replaceThemeDescription', { theme: saveConflict.name })}
          confirmLabel={t('analyze.replaceThemeConfirm')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => void saveTheme(saveConflict.themeId)}
          onCancel={() => {
            if (!savingTheme) setSaveConflict(null)
          }}
          loading={savingTheme}
        />
      )}
    </>
  )
}
