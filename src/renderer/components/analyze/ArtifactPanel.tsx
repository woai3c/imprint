import { ChevronRight, Copy, Download, FlaskConical, Info, Save } from 'lucide-react'
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
import { type ExportTab, artifactTabIds } from './artifact-tabs'
import { splitDesignMarkdown } from './design-markdown'

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
  const [selectedTab, setActiveTab] = useState<ExportTab>('overview')
  const [savingTheme, setSavingTheme] = useState(false)
  const [saveConflict, setSaveConflict] = useState<ThemeSaveConflict | null>(null)
  const activeTab = selectedTab === 'reconstruction' && !result.reconstructionBrief ? 'overview' : selectedTab

  const exportArtifact = activeTab === 'overview' || activeTab === 'preview' ? 'markdown' : activeTab
  const activeArtifactLabel = t(`analyze.artifacts.${exportArtifact}`)
  const showCopyDownload = activeTab !== 'preview'

  const tabs: { id: ExportTab; label: string }[] = artifactTabIds(Boolean(result.reconstructionBrief)).map((id) => ({
    id,
    label: t(
      {
        overview: 'analyze.tabOverview',
        preview: 'analyze.tabPreview',
        markdown: 'analyze.tabMarkdown',
        reconstruction: 'analyze.tabReconstruction',
        tailwind: 'analyze.tabTailwind',
        css: 'analyze.tabCss',
      }[id],
    ),
  }))

  const tokens = result.tokens as Record<string, unknown> | undefined
  const designMarkdown = splitDesignMarkdown(result.designDoc || '')

  const handleCopy = async () => {
    let content = ''
    if (activeTab === 'tailwind') content = result.tailwindTheme || ''
    else if (activeTab === 'css') content = result.cssVariables || ''
    else if (activeTab === 'reconstruction') content = result.reconstructionBrief || ''
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
    } else if (activeTab === 'reconstruction') {
      content = result.reconstructionBrief || ''
      filename = 'RECONSTRUCTION.md'
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
      <div className="analysis-artifact-panel flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60">
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
                  label={
                    activeTab === 'reconstruction'
                      ? t('analyze.designDna.copyBrief')
                      : t('analyze.copyCurrent', { format: activeArtifactLabel })
                  }
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

        <div
          key={activeTab}
          data-testid="artifact-scroll-container"
          className="analysis-artifact-content ui-enter flex-1 overflow-auto bg-card"
        >
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
              {result.designIntelligence?.exampleGeneration?.status === 'complete' && (
                <div className="px-6 pb-6">
                  <ExampleComponents
                    designDoc={result.designDoc}
                    cssVariables={result.cssVariables}
                    generation={result.designIntelligence.exampleGeneration}
                  />
                </div>
              )}
            </>
          )}
          {activeTab === 'markdown' && (
            <div data-testid="artifact-content-markdown" className="p-6">
              {designMarkdown.frontmatter !== undefined && (
                <details
                  data-testid="artifact-design-frontmatter"
                  className="group overflow-hidden rounded-lg border border-border/60 bg-secondary/20"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                    />
                    <span className="text-xs font-medium text-foreground">
                      {t('analyze.designDoc.frontmatterTitle')}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {t('analyze.designDoc.frontmatterDescription')}
                    </span>
                  </summary>
                  <div className="border-t border-border/60 bg-background/70 p-3">
                    <pre className="max-h-96 overflow-auto text-xs leading-5 whitespace-pre text-foreground">
                      <code>{`---\n${designMarkdown.frontmatter}\n---`}</code>
                    </pre>
                  </div>
                </details>
              )}
              <div
                className={`prose prose-sm dark:prose-invert max-w-none prose-code:before:content-none prose-code:after:content-none ${designMarkdown.frontmatter !== undefined ? 'mt-5' : ''}`}
              >
                <Markdown remarkPlugins={[remarkGfm]}>{designMarkdown.body}</Markdown>
              </div>
            </div>
          )}
          {activeTab === 'reconstruction' && result.reconstructionBrief && (
            <div
              data-testid="artifact-content-reconstruction"
              className="prose prose-sm dark:prose-invert max-w-none p-6 prose-code:before:content-none prose-code:after:content-none"
            >
              <Markdown remarkPlugins={[remarkGfm]}>{result.reconstructionBrief}</Markdown>
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
