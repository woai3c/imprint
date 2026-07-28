import { Download } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InfoTip } from '../components/InfoTip'
import { PageHeader } from '../components/PageHeader'
import { useFeedbackStore } from '../stores/feedback-store'
import {
  builtinThemes,
  generateThemeCss,
  generateThemeJson,
  generateThemeMarkdown,
  generateThemeTailwind,
  useSkinStore,
} from '../stores/skin-store'
import type { AppTheme, ThemeCategory, ThemeColors, ThemeExportFormat } from '../stores/skin-store'
import { useThemeStore } from '../stores/theme-store'

const themeCategoryOrder: ThemeCategory[] = ['foundation', 'narrative', 'experimental']
const themeExportFormats: ThemeExportFormat[] = ['markdown', 'css', 'tailwind', 'json']

export function ThemesPage() {
  const { t, i18n } = useTranslation()
  const { themes, fetchThemes, toggleFavorite } = useThemeStore()
  const { currentThemeId, setTheme, applyCustomCss } = useSkinStore()
  const notify = useFeedbackStore((state) => state.show)
  const [tab, setTab] = useState<'extracted' | 'builtin'>('builtin')
  const [exportFormat, setExportFormat] = useState<ThemeExportFormat>('markdown')
  const [appliedExtractedId, setAppliedExtractedId] = useState<string | null>(null)
  const activeBuiltinTheme = builtinThemes.find((theme) => theme.id === currentThemeId) || builtinThemes[0]

  useEffect(() => {
    fetchThemes()
  }, [fetchThemes])

  useEffect(() => {
    window.electronAPI.getSettings().then((settings: { exportFormat?: string }) => {
      const savedFormat = settings.exportFormat
      if (themeExportFormats.includes(savedFormat as ThemeExportFormat)) {
        setExportFormat(savedFormat as ThemeExportFormat)
      }
    })
  }, [])

  const handleApplyBuiltin = (theme: AppTheme) => {
    setTheme(theme.id)
    setAppliedExtractedId(null)
    notify(
      t('feedback.themeApplied', {
        theme: t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name }),
      }),
    )
  }

  const handleApplyExtracted = (theme: (typeof themes)[number]) => {
    applyCustomCss(theme.css_variables)
    setAppliedExtractedId(theme.id)
    notify(t('feedback.themeApplied', { theme: theme.name }))
  }

  const handleExportExtracted = async (themeId: string, themeName: string) => {
    try {
      const exportResult = await window.electronAPI.exportTheme(themeId, exportFormat)
      if (exportResult.success) notify(t('feedback.themeExported', { theme: themeName }))
      else if (exportResult.error) notify(t('feedback.actionFailed'), 'error')
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
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
          `imprint-${theme.id}`,
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

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={t('themes.title')} description={t('themes.description')} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-8">
        <div className="flex gap-1 p-1 bg-secondary rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setTab('builtin')}
            aria-pressed={tab === 'builtin'}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'builtin' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t('themes.builtin')}
          </button>
          <button
            type="button"
            onClick={() => setTab('extracted')}
            aria-pressed={tab === 'extracted'}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'extracted' ? 'bg-background shadow-sm' : 'text-muted-foreground'
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
            {themeExportFormats.map((format) => (
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
        ) : themes.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h3 className="text-lg font-semibold">{t('themes.noExtracted')}</h3>
              <p className="text-muted-foreground text-sm mt-1">{t('themes.noExtractedTip')}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {themes.map((theme) => (
              <div
                key={theme.id}
                data-selected={appliedExtractedId === theme.id}
                className={`rounded-xl border p-4 transition-colors ${
                  appliedExtractedId === theme.id ? 'border-primary' : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-sm">{theme.name}</h4>
                    {theme.source_url && (
                      <p className="text-xs text-muted-foreground truncate max-w-50">{theme.source_url}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(theme.id)}
                    className={`flex size-8 items-center justify-center rounded-md text-base ${theme.is_favorite ? 'text-yellow-500' : 'text-muted-foreground hover:bg-secondary hover:text-yellow-500'} transition-colors`}
                    aria-label={t(theme.is_favorite ? 'themes.removeFavorite' : 'themes.addFavorite', {
                      theme: theme.name,
                    })}
                    title={t(theme.is_favorite ? 'themes.removeFavorite' : 'themes.addFavorite', {
                      theme: theme.name,
                    })}
                  >
                    {theme.is_favorite ? '★' : '☆'}
                  </button>
                </div>

                <div className="flex gap-1.5 mb-3">
                  {Object.values(JSON.parse(theme.tokens_json)?.colors || {})
                    .slice(0, 6)
                    .map((color, i) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-full border border-border"
                        style={{ backgroundColor: color as string }}
                      />
                    ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyExtracted(theme)}
                    aria-pressed={appliedExtractedId === theme.id}
                    className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    {appliedExtractedId === theme.id ? t('themes.current') : t('themes.apply')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportExtracted(theme.id, theme.name)}
                    className="text-xs px-3 py-1.5 rounded bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                  >
                    {t('themes.export')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ThemeLanguagePanel({ theme }: { theme: AppTheme }) {
  const { t } = useTranslation()
  const themeKey = `themes.presets.${theme.id}`
  const fontName = theme.tokens.typography.fontHeading.split(',')[0].replaceAll('"', '')

  return (
    <section className="theme-language-panel ui-enter mt-5 rounded-xl border border-border bg-card/70 p-5">
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
        isActive ? 'border-primary' : 'border-border hover:border-primary/40'
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
