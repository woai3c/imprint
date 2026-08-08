import { Check, Download, FlaskConical, Pencil, Trash2, X } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { THEME_EXPORT_FORMATS, type ThemeExportFormat, type ThemeSummaryRecord } from '../../shared/ipc-contract'
import { InfoTip } from '../components/InfoTip'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { createExtractedThemePreview } from '../lib/extracted-theme-preview'
import { useFeedbackStore } from '../stores/feedback-store'
import {
  builtinThemes,
  generateThemeCss,
  generateThemeJson,
  generateThemeMarkdown,
  generateThemeTailwind,
  useSkinStore,
} from '../stores/skin-store'
import type { AppTheme, ThemeCategory, ThemeColors } from '../stores/skin-store'
import { useThemeStore } from '../stores/theme-store'

const themeCategoryOrder: ThemeCategory[] = ['foundation', 'narrative', 'experimental']
export function ThemesPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { currentThemeId, setTheme } = useSkinStore()
  const { themes, loading, error, fetchThemes, renameTheme, deleteTheme } = useThemeStore()
  const notify = useFeedbackStore((state) => state.show)
  const [tab, setTab] = useState<'builtin' | 'extracted'>('builtin')
  const [exportFormat, setExportFormat] = useState<ThemeExportFormat>('markdown')
  const [pendingDeleteTheme, setPendingDeleteTheme] = useState<ThemeSummaryRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const activeBuiltinTheme = builtinThemes.find((theme) => theme.id === currentThemeId) || builtinThemes[0]

  useEffect(() => {
    window.electronAPI.getSettings().then((settings: { exportFormat?: string }) => {
      const savedFormat = settings.exportFormat
      if (THEME_EXPORT_FORMATS.includes(savedFormat as ThemeExportFormat)) {
        setExportFormat(savedFormat as ThemeExportFormat)
      }
    })
  }, [])

  useEffect(() => {
    void fetchThemes()
  }, [fetchThemes])

  const handleApplyBuiltin = (theme: AppTheme) => {
    setTheme(theme.id)
    notify(
      t('feedback.themeApplied', {
        theme: t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name }),
      }),
    )
  }

  const localizeBuiltinTheme = (theme: AppTheme): AppTheme => {
    const themeKey = `themes.presets.${theme.id}`

    return {
      ...theme,
      name: t(`${themeKey}.name`, { defaultValue: theme.name }),
      description: t(`${themeKey}.description`, { defaultValue: theme.description }),
      identity: {
        values: theme.identity.values.map((value, index) =>
          t(`${themeKey}.values.${index}`, { defaultValue: value }),
        ) as AppTheme['identity']['values'],
        patterns: theme.identity.patterns.map((pattern, index) =>
          t(`${themeKey}.patterns.${index}`, { defaultValue: pattern }),
        ) as AppTheme['identity']['patterns'],
        evidence: theme.identity.evidence.map((evidence, index) =>
          t(`${themeKey}.evidence.${index}`, { defaultValue: evidence }),
        ) as AppTheme['identity']['evidence'],
      },
    }
  }

  const handleExportBuiltin = async (theme: AppTheme) => {
    const localizedTheme = localizeBuiltinTheme(theme)
    const language = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en'
    const exports: Record<ThemeExportFormat, { content: string; filename: string; ext: string }> = {
      markdown: {
        content: generateThemeMarkdown(localizedTheme, language),
        filename: `imprint-${theme.id}-DESIGN.md`,
        ext: 'md',
      },
      css: {
        content: generateThemeCss(localizedTheme),
        filename: `imprint-${theme.id}-variables.css`,
        ext: 'css',
      },
      tailwind: {
        content: generateThemeTailwind(localizedTheme),
        filename: `imprint-${theme.id}-tailwind.css`,
        ext: 'css',
      },
      json: {
        content: generateThemeJson(localizedTheme),
        filename: `imprint-${theme.id}-tokens.json`,
        ext: 'json',
      },
    }
    const selectedExport = exports[exportFormat]
    const hasAssets = !!theme.backgroundImage

    try {
      let exportResult: { success?: boolean; canceled?: boolean; error?: boolean }
      if (hasAssets) {
        exportResult = await window.electronAPI.exportToDirectory(
          [{ name: selectedExport.filename, content: selectedExport.content }],
          [theme.backgroundImage!],
          '',
        )
      } else {
        exportResult = await window.electronAPI.exportFile(
          selectedExport.content,
          selectedExport.filename,
          selectedExport.ext,
        )
      }
      if (exportResult.success) notify(t('feedback.themeExported', { theme: localizedTheme.name }))
      else if (exportResult.error) notify(t('feedback.actionFailed'), 'error')
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleExportFormatChange = (format: ThemeExportFormat) => {
    setExportFormat(format)
    window.electronAPI.saveSettings({ exportFormat: format })
  }

  const handleExportExtracted = async (theme: ThemeSummaryRecord) => {
    try {
      const result = await window.electronAPI.exportTheme(theme.id, exportFormat)
      if (result.success) notify(t('feedback.themeExported', { theme: theme.name }))
      else if (result.error) notify(t('feedback.actionFailed'), 'error')
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleRenameExtracted = async (theme: ThemeSummaryRecord, name: string) => {
    try {
      await renameTheme(theme.id, name)
      notify(t('feedback.themeRenamed', { theme: name }))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
      throw new Error('Rename failed')
    }
  }

  const handleDeleteExtracted = async () => {
    if (!pendingDeleteTheme) return
    setDeleting(true)
    try {
      await deleteTheme(pendingDeleteTheme.id)
      notify(t('feedback.themeDeleted', { theme: pendingDeleteTheme.name }))
      setPendingDeleteTheme(null)
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={t('themes.title')} description={t('themes.description')} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-8">
        <div className="flex w-fit gap-1 rounded-lg bg-secondary p-1">
          <button
            type="button"
            onClick={() => setTab('builtin')}
            aria-pressed={tab === 'builtin'}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'builtin' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t('themes.builtin')}
          </button>
          <button
            type="button"
            onClick={() => setTab('extracted')}
            aria-pressed={tab === 'extracted'}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'extracted' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t('themes.extracted')} ({themes.length})
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <label htmlFor="theme-export-format" className="text-xs font-medium text-muted-foreground">
            {t('themes.exportFormatLabel')}
          </label>
          <InfoTip text={t('themes.exportHelp')} align="right" />
          <select
            id="theme-export-format"
            value={exportFormat}
            onChange={(event) => handleExportFormatChange(event.target.value as ThemeExportFormat)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {THEME_EXPORT_FORMATS.map((format) => (
              <option key={format} value={format}>
                {t(`themes.exportFormats.${format}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 pt-1 pb-8">
        {tab === 'builtin' ? (
          <>
            <div className="space-y-7">
              {themeCategoryOrder.map((category) => (
                <section key={category} aria-labelledby={`theme-category-${category}`}>
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 id={`theme-category-${category}`} className="text-sm font-semibold">
                      {t(`themes.categories.${category}.title`)}
                    </h3>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t(`themes.categories.${category}.description`)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                    {builtinThemes
                      .filter((theme) => theme.category === category)
                      .map((theme) => (
                        <ThemeCard
                          key={theme.id}
                          id={theme.id}
                          name={t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name })}
                          description={t(`themes.presets.${theme.id}.description`, {
                            defaultValue: theme.description,
                          })}
                          colors={theme.colors}
                          isActive={currentThemeId === theme.id}
                          onApply={() => handleApplyBuiltin(theme)}
                          onExport={() => handleExportBuiltin(theme)}
                          currentLabel={t('themes.current')}
                          exportLabel={t('themes.export')}
                          exportAriaLabel={t('themes.exportTheme', {
                            theme: t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name }),
                          })}
                        />
                      ))}
                  </div>
                </section>
              ))}
            </div>
            <ThemeLanguagePanel key={activeBuiltinTheme.id} theme={activeBuiltinTheme} />
          </>
        ) : loading ? (
          <p className="py-20 text-center text-sm text-muted-foreground" role="status">
            {t('themes.loading')}
          </p>
        ) : error ? (
          <EmptyState
            title={t('themes.loadFailed')}
            description={t('feedback.actionFailed')}
            hint={error}
            className="h-64"
          />
        ) : themes.length === 0 ? (
          <EmptyState title={t('themes.noExtracted')} description={t('themes.noExtractedTip')} className="h-64" />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {themes.map((theme) => (
              <ExtractedThemeCard
                key={theme.id}
                theme={theme}
                onValidate={() => navigate('/templates', { state: { themeId: theme.id } })}
                onExport={() => handleExportExtracted(theme)}
                onRename={(name) => handleRenameExtracted(theme, name)}
                onDelete={() => setPendingDeleteTheme(theme)}
              />
            ))}
          </div>
        )}
      </div>

      {pendingDeleteTheme && (
        <ConfirmDialog
          title={t('themes.deleteTitle')}
          description={t('themes.deleteDescription', { theme: pendingDeleteTheme.name })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleDeleteExtracted}
          onCancel={() => setPendingDeleteTheme(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}

function ExtractedThemeCard({
  theme,
  onValidate,
  onExport,
  onRename,
  onDelete,
}: {
  theme: ThemeSummaryRecord
  onValidate: () => void
  onExport: () => void
  onRename: (name: string) => Promise<void>
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const preview = createExtractedThemePreview(theme)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(theme.name)
  const [saving, setSaving] = useState(false)

  const saveName = async () => {
    const name = draftName.trim()
    if (!name || name === theme.name) {
      setDraftName(theme.name)
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onRename(name)
      setEditing(false)
    } catch {
      // Keep the input open so the user can retry or cancel.
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="theme-card flex min-h-48 flex-col rounded-xl border border-border p-4 transition-colors hover:border-primary/70">
      <div
        className="theme-card-preview mb-3 flex shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-border/60 p-2.5"
        style={{ backgroundColor: preview.style['--color-background'] }}
      >
        {preview.palette.map((color, index) => (
          <span
            key={`${color}-${index}`}
            className="theme-swatch h-6 w-6 rounded-full border border-black/10"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            void saveName()
          }}
        >
          <input
            autoFocus
            value={draftName}
            maxLength={80}
            onChange={(event) => setDraftName(event.target.value)}
            aria-label={t('themes.renameInput', { theme: theme.name })}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={saving || !draftName.trim()}
            aria-label={t('themes.saveName')}
            className="flex size-8 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            <Check size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftName(theme.name)
              setEditing(false)
            }}
            aria-label={t('common.cancel')}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium">{theme.name}</h3>
            {theme.source_url && (
              <p className="mt-1 truncate text-xs text-muted-foreground" title={theme.source_url}>
                {theme.source_url}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t('themes.renameTheme', { theme: theme.name })}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Pencil size={12} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={t('themes.deleteTheme', { theme: theme.name })}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {t('themes.extractedRoleSummary', {
          observed: preview.observedRoleCount,
          adapted: preview.adaptedRoleCount,
        })}
      </p>
      <div className="mt-auto flex items-center justify-end gap-1 pt-3">
        <button
          type="button"
          onClick={onValidate}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <FlaskConical size={12} aria-hidden="true" />
          {t('themes.validate')}
        </button>
        <button
          type="button"
          onClick={onExport}
          aria-label={t('themes.exportTheme', { theme: theme.name })}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Download size={12} aria-hidden="true" />
          {t('themes.export')}
        </button>
      </div>
    </article>
  )
}

function ThemeLanguagePanel({ theme }: { theme: AppTheme }) {
  const { t } = useTranslation()
  const themeKey = `themes.presets.${theme.id}`
  const fontName = theme.tokens.typography.fontHeading.split(',')[0].replaceAll('"', '')

  return (
    <section className="theme-language-panel ui-enter mt-5 rounded-xl border border-border bg-card/50 p-5">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium leading-5 text-muted-foreground">{t('themes.language.eyebrow')}</p>
          <h3 className="mt-1 text-lg font-semibold">
            {t(`${themeKey}.name`, { defaultValue: theme.name })} · {t('themes.language.title')}
          </h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {t(`${themeKey}.description`, { defaultValue: theme.description })}
          </p>
        </div>
        <div className="text-right text-xs leading-5 text-muted-foreground">
          <p>{fontName}</p>
          <p className="mt-1">
            {t(`themes.language.density.${theme.tokens.spacing.density}`)} · {theme.tokens.shape.radiusBase}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-[0.75fr_1.4fr_1fr]">
        <div>
          <h4 className="text-sm font-semibold">{t('themes.language.values')}</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {theme.identity.values.map((value, index) => (
              <span
                key={value}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs leading-4 text-secondary-foreground"
              >
                {t(`${themeKey}.values.${index}`, { defaultValue: value })}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold">{t('themes.language.patterns')}</h4>
          <ul className="mt-2 space-y-2.5 text-sm leading-5">
            {theme.identity.patterns.map((pattern, index) => (
              <li key={pattern}>
                <p className="font-medium text-foreground">
                  {t(`${themeKey}.patterns.${index}`, { defaultValue: pattern })}
                </p>
                <p className="text-muted-foreground">
                  {t(`${themeKey}.evidence.${index}`, { defaultValue: theme.identity.evidence[index] })}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold">{t('themes.language.foundation')}</h4>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm leading-5 text-muted-foreground">
            <dt>{t('themes.language.spacing')}</dt>
            <dd className="text-right text-foreground">{theme.tokens.spacing.unit}</dd>
            <dt>{t('themes.language.layout')}</dt>
            <dd className="text-right text-foreground">{theme.tokens.layout.sidebarWidth}</dd>
            <dt>{t('themes.language.border')}</dt>
            <dd className="text-right text-foreground">{theme.tokens.shape.borderWidth}</dd>
            <dt>{t('themes.language.icon')}</dt>
            <dd className="text-right text-foreground">{theme.tokens.shape.iconStrokeWidth}px</dd>
            <dt>{t('themes.language.motion')}</dt>
            <dd className="text-right text-foreground">{theme.tokens.motion.normal}</dd>
          </dl>
        </div>
      </div>

      <div className="mt-5 border-t border-border/60 pt-3 text-sm leading-5 text-muted-foreground">
        <span className="mr-2 font-medium text-foreground">{t('themes.language.imprintValues')}</span>
        {t('themes.language.imprintValueList')}
      </div>
    </section>
  )
}

function ThemeCard({
  id,
  name,
  description,
  colors,
  isActive,
  onApply,
  onExport,
  currentLabel,
  exportLabel,
  exportAriaLabel,
}: {
  id: string
  name: string
  description: string
  colors: ThemeColors
  isActive: boolean
  onApply: () => void
  onExport: () => void
  currentLabel: string
  exportLabel: string
  exportAriaLabel: string
}) {
  return (
    <article
      data-selected={isActive}
      className={`theme-card flex h-full min-h-44 flex-col rounded-xl border p-4 text-left transition-colors ${
        isActive ? 'border-primary' : 'border-border hover:border-primary/70'
      }`}
    >
      <button
        type="button"
        onClick={onApply}
        aria-pressed={isActive}
        className="flex flex-1 flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          className={`theme-card-preview theme-card-preview-${id} mb-3 flex shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-border/60 p-2.5`}
          style={{ backgroundColor: colors.background }}
        >
          {[colors.primary, colors.background, colors.foreground, colors.accent, colors.secondary].map(
            (color, index) => (
              <div
                key={`${color}-${index}`}
                className="theme-swatch h-6 w-6 rounded-full border border-black/5"
                style={{ backgroundColor: color }}
              />
            ),
          )}
        </div>

        <h4 className="text-sm font-medium">{name}</h4>
        <p className="mt-1 min-h-8 text-xs leading-4 text-muted-foreground">{description}</p>
      </button>

      <div className="mt-auto flex min-h-7 items-end justify-between gap-2 pt-1">
        <span className={`text-xs font-medium text-primary ${isActive ? '' : 'invisible'}`}>{currentLabel}</span>
        <button
          type="button"
          onClick={onExport}
          aria-label={exportAriaLabel}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download size={12} aria-hidden="true" />
          {exportLabel}
        </button>
      </div>
    </article>
  )
}
