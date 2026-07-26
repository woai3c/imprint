import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '../components/PageHeader'
import { useFeedbackStore } from '../stores/feedback-store'
import { builtinThemes, useSkinStore } from '../stores/skin-store'
import type { AppTheme, ThemeColors } from '../stores/skin-store'
import { useThemeStore } from '../stores/theme-store'

export function ThemesPage() {
  const { t } = useTranslation()
  const { themes, fetchThemes, toggleFavorite } = useThemeStore()
  const { currentThemeId, setTheme, applyCustomCss } = useSkinStore()
  const notify = useFeedbackStore((state) => state.show)
  const [tab, setTab] = useState<'extracted' | 'builtin'>('builtin')
  const [appliedExtractedId, setAppliedExtractedId] = useState<string | null>(null)
  const activeBuiltinTheme = builtinThemes.find((theme) => theme.id === currentThemeId) || builtinThemes[0]

  useEffect(() => {
    fetchThemes()
  }, [fetchThemes])

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

  const handleExport = async (themeId: string, themeName: string, format: string) => {
    try {
      const exportResult = await window.electronAPI.exportTheme(themeId, format)
      if (exportResult.success) notify(t('feedback.themeExported', { theme: themeName }))
      else if (exportResult.error) notify(t('feedback.actionFailed'), 'error')
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={t('themes.title')} description={t('themes.description')} />

      <div className="px-8 mb-4">
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
      </div>

      <div className="flex-1 overflow-auto px-8 pt-1 pb-8">
        {tab === 'builtin' ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {builtinThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  id={theme.id}
                  name={t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name })}
                  description={t(`themes.presets.${theme.id}.description`, { defaultValue: theme.description })}
                  colors={theme.colors}
                  isActive={currentThemeId === theme.id}
                  onApply={() => handleApplyBuiltin(theme)}
                  currentLabel={t('themes.current')}
                />
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
                className={`rounded-xl border p-4 transition-colors ${
                  appliedExtractedId === theme.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/50'
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
                    onClick={() => handleExport(theme.id, theme.name, 'css')}
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
          <p className="text-[11px] font-medium uppercase leading-4 tracking-wider text-muted-foreground">
            {t('themes.language.eyebrow')}
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            {t(`${themeKey}.name`, { defaultValue: theme.name })} · {t('themes.language.title')}
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
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

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div>
          <h4 className="text-xs font-semibold">{t('themes.language.values')}</h4>
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
          <h4 className="text-xs font-semibold">{t('themes.language.patterns')}</h4>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
            {theme.identity.patterns.map((pattern, index) => (
              <li key={pattern}>— {t(`${themeKey}.patterns.${index}`, { defaultValue: pattern })}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold">{t('themes.language.foundation')}</h4>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
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

      <div className="mt-5 border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground">
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
  currentLabel,
}: {
  id: string
  name: string
  description: string
  colors: ThemeColors
  isActive: boolean
  onApply: () => void
  currentLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onApply}
      aria-pressed={isActive}
      className={`theme-card rounded-xl border p-4 text-left transition-all hover:shadow-md ${
        isActive ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/30'
      }`}
    >
      <div
        className={`theme-card-preview theme-card-preview-${id} mb-3 flex items-end gap-1.5 overflow-hidden rounded-lg border border-border/60 p-2`}
        style={{ backgroundColor: colors.background }}
      >
        {[colors.primary, colors.background, colors.foreground, colors.accent, colors.secondary].map((color, index) => (
          <div
            key={`${color}-${index}`}
            className="theme-swatch h-6 w-6 rounded-md border border-black/5"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <h4 className="font-medium text-sm">{name}</h4>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      {isActive && <span className="inline-block mt-2 text-xs text-primary font-medium">{currentLabel}</span>}
    </button>
  )
}
