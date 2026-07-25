import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { builtinThemes, useSkinStore } from '../stores/skin-store'
import type { AppTheme } from '../stores/skin-store'
import { useThemeStore } from '../stores/theme-store'

export function ThemesPage() {
  const { t } = useTranslation()
  const { themes, fetchThemes, toggleFavorite } = useThemeStore()
  const { currentThemeId, setTheme, applyCustomCss } = useSkinStore()
  const [tab, setTab] = useState<'extracted' | 'builtin'>('builtin')

  useEffect(() => {
    fetchThemes()
  }, [fetchThemes])

  const handleApplyBuiltin = (theme: AppTheme) => {
    setTheme(theme.id)
  }

  const handleApplyExtracted = (cssVars: string) => {
    applyCustomCss(cssVars)
  }

  const handleExport = async (themeId: string, format: string) => {
    await window.electronAPI.exportTheme(themeId, format)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-4 pb-4">
        <h2 className="text-2xl font-bold">{t('themes.title')}</h2>
        <p className="text-muted-foreground mt-1">{t('themes.description')}</p>
      </div>

      <div className="px-8 mb-4">
        <div className="flex gap-1 p-1 bg-secondary rounded-lg w-fit">
          <button
            onClick={() => setTab('builtin')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'builtin' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t('themes.builtin')}
          </button>
          <button
            onClick={() => setTab('extracted')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'extracted' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t('themes.extracted')} ({themes.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 pb-8">
        {tab === 'builtin' ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {builtinThemes.map((theme) => (
              <ThemeCard
                key={theme.id}
                name={theme.name}
                description={theme.description}
                colors={theme.colors}
                isActive={currentThemeId === theme.id}
                onApply={() => handleApplyBuiltin(theme)}
                currentLabel={t('themes.current')}
              />
            ))}
          </div>
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
                className="rounded-xl border border-border p-4 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-sm">{theme.name}</h4>
                    {theme.source_url && (
                      <p className="text-xs text-muted-foreground truncate max-w-50">{theme.source_url}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleFavorite(theme.id)}
                    className={`text-xs ${theme.is_favorite ? 'text-yellow-500' : 'text-muted-foreground hover:text-yellow-500'} transition-colors`}
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
                    onClick={() => handleApplyExtracted(theme.css_variables)}
                    className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    {t('themes.apply')}
                  </button>
                  <button
                    onClick={() => handleExport(theme.id, 'css')}
                    className="text-xs px-3 py-1.5 rounded bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                  >
                    Export
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

function ThemeCard({
  name,
  description,
  colors,
  isActive,
  onApply,
  currentLabel,
}: {
  name: string
  description: string
  colors: Record<string, string>
  isActive: boolean
  onApply: () => void
  currentLabel: string
}) {
  return (
    <button
      onClick={onApply}
      className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${
        isActive ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/30'
      }`}
    >
      <div className="flex gap-1.5 mb-3">
        <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: colors.primary }} />
        <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: colors.background }} />
        <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: colors.foreground }} />
        <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: colors.accent }} />
        <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: colors.secondary }} />
      </div>

      <h4 className="font-medium text-sm">{name}</h4>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      {isActive && <span className="inline-block mt-2 text-xs text-primary font-medium">{currentLabel}</span>}
    </button>
  )
}
