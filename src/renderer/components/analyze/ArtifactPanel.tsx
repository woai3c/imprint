import { BookmarkCheck, BookmarkPlus, ChevronRight, Copy, Download, FlaskConical, Info } from 'lucide-react'
import remarkGfm from 'remark-gfm'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { type DesktopArtifactExport, type DesktopArtifactExportId, desktopArtifactExports } from './artifact-exports'
import { type ExportTab, artifactTabIds } from './artifact-tabs'
import { splitDesignMarkdown } from './design-markdown'

interface ArtifactPanelProps {
  result: AnalysisResultData
  onResultUpdate?: (result: Partial<AnalysisResultData>) => void
  onOpenEvidence?: (evidenceId: string) => void
}

interface ExportMenuPosition {
  left: number
  top: number
}

interface ArtifactExportMenuProps {
  artifacts: DesktopArtifactExport[]
  onExport: (artifactId: DesktopArtifactExportId) => Promise<void>
}

const EXPORT_MENU_WIDTH = 224
const EXPORT_MENU_GUTTER = 8

function getExportMenuPosition(trigger: DOMRect): ExportMenuPosition {
  return {
    left: Math.max(
      EXPORT_MENU_GUTTER,
      Math.min(trigger.right - EXPORT_MENU_WIDTH, window.innerWidth - EXPORT_MENU_WIDTH - EXPORT_MENU_GUTTER),
    ),
    top: trigger.bottom + EXPORT_MENU_GUTTER,
  }
}

function ArtifactExportMenu({ artifacts, onExport }: ArtifactExportMenuProps) {
  const { t } = useTranslation()
  const menuId = useId()
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<ExportMenuPosition | null>(null)
  const open = position !== null

  useEffect(() => {
    if (!open) return

    const reposition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      if (!trigger) return
      const next = getExportMenuPosition(trigger)
      setPosition((current) => {
        if (!current || (current.left === next.left && current.top === next.top)) return current
        return next
      })
    }
    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setPosition(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPosition(null)
    }

    document.addEventListener('mousedown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePointer)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  const toggleMenu = () => {
    if (open) {
      setPosition(null)
      return
    }
    const trigger = triggerRef.current?.getBoundingClientRect()
    if (trigger) setPosition(getExportMenuPosition(trigger))
  }

  return (
    <div ref={triggerRef} className="relative">
      <IconButton
        data-testid="artifact-export-menu"
        icon={Download}
        iconSize={16}
        label={t('analyze.exportMenu.open')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={toggleMenu}
        showTooltip={!open}
        className={open ? 'bg-secondary text-foreground' : ''}
      />
      {position &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={t('analyze.exportMenu.title')}
            style={position}
            className="fixed z-60 w-56 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl"
          >
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                role="menuitem"
                data-testid={`export-artifact-${artifact.id}`}
                onClick={() => {
                  setPosition(null)
                  void onExport(artifact.id)
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
              >
                <span className="text-xs font-medium text-foreground">{t(artifact.labelKey)}</span>
                <span className="text-[10px] text-muted-foreground">{artifact.defaultName}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function ArtifactPanel({ result, onResultUpdate, onOpenEvidence }: ArtifactPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const notify = useFeedbackStore((state) => state.show)
  const [selectedTab, setActiveTab] = useState<ExportTab>('overview')
  const [savingTheme, setSavingTheme] = useState(false)
  const [saveConflict, setSaveConflict] = useState<ThemeSaveConflict | null>(null)
  const activeTab = selectedTab
  const activeArtifact = activeTab === 'tailwind' ? 'tailwind' : activeTab === 'css' ? 'css' : 'markdown'
  const activeArtifactLabel = t(`analyze.artifacts.${activeArtifact}`)
  const showCopyDownload = activeTab !== 'preview'

  const tabs: { id: ExportTab; label: string }[] = artifactTabIds().map((id) => ({
    id,
    label: t(
      {
        overview: 'analyze.tabOverview',
        preview: 'analyze.tabPreview',
        markdown: 'analyze.tabMarkdown',
        tailwind: 'analyze.tabTailwind',
        css: 'analyze.tabCss',
      }[id],
    ),
  }))

  const tokens = result.tokens
  const designMarkdown = splitDesignMarkdown(result.designDoc || '')
  const exportArtifacts = desktopArtifactExports(result)

  const handleCopy = async () => {
    const content =
      activeTab === 'tailwind'
        ? result.tailwindTheme || ''
        : activeTab === 'css'
          ? result.cssVariables || ''
          : result.designDoc || ''
    try {
      await navigator.clipboard.writeText(content)
      notify(t('feedback.copied'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleExportFile = async (artifactId: DesktopArtifactExportId) => {
    const artifact = exportArtifacts.find((candidate) => candidate.id === artifactId)
    if (!artifact) return
    try {
      const exportResult = await window.electronAPI.exportFile(
        artifact.content,
        artifact.defaultName,
        artifact.extension,
      )
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
              <div
                role="group"
                aria-label={t('analyze.artifactActions')}
                data-testid="artifact-action-group"
                className="flex items-center gap-1"
              >
                <IconButton
                  data-testid="save-theme"
                  icon={result.savedThemeId ? BookmarkCheck : BookmarkPlus}
                  iconSize={16}
                  label={result.savedThemeId ? t('analyze.saved') : t('analyze.saveToLibrary')}
                  onClick={() => void saveTheme()}
                  disabled={!result.analysisId || !!result.savedThemeId || savingTheme}
                  showTooltip
                />
                {result.savedThemeId && (
                  <IconButton
                    data-testid="validate-theme"
                    icon={FlaskConical}
                    iconSize={16}
                    label={t('analyze.validateInScenarios')}
                    onClick={() => navigate('/templates', { state: { themeId: result.savedThemeId } })}
                    showTooltip
                  />
                )}
                <ArtifactExportMenu artifacts={exportArtifacts} onExport={handleExportFile} />
                {showCopyDownload && (
                  <IconButton
                    icon={Copy}
                    iconSize={16}
                    label={t('analyze.copyCurrent', { format: activeArtifactLabel })}
                    onClick={handleCopy}
                    showTooltip
                  />
                )}
              </div>
              <div aria-hidden="true" className="mx-1 h-5 w-px bg-border/70" />
              <div className="group relative z-50">
                <button
                  type="button"
                  data-testid="agent-export-info"
                  aria-label={t('analyze.agentExport.title')}
                  aria-describedby="agent-export-tooltip"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info size={16} />
                </button>
                <div
                  id="agent-export-tooltip"
                  role="tooltip"
                  className="pointer-events-none invisible absolute top-full right-0 z-60 mt-2 w-72 rounded-lg border border-border bg-card p-3 text-left opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                >
                  <p className="text-xs font-medium text-popover-foreground">{t('analyze.agentExport.title')}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('analyze.agentExport.summary')}</p>
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
            <DesignDnaPanel result={result} onResultUpdate={onResultUpdate} onOpenEvidence={onOpenEvidence} />
          )}
          {activeTab === 'preview' && (
            <TokenPreview tokens={tokens} darkTokens={result.darkTokens} hasDarkMode={result.hasDarkMode} />
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
          {(activeTab === 'tailwind' || activeTab === 'css') && (
            <pre
              data-testid={`artifact-content-${activeTab}`}
              className="p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap"
            >
              {activeTab === 'tailwind' ? result.tailwindTheme : result.cssVariables}
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
