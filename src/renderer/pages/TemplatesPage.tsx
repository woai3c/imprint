import { Download } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnalyticsTemplate } from '../components/templates/AnalyticsTemplate'
import { BlogTemplate } from '../components/templates/BlogTemplate'
import { ChatTemplate } from '../components/templates/ChatTemplate'
import { DashboardTemplate } from '../components/templates/DashboardTemplate'
import { DocsTemplate } from '../components/templates/DocsTemplate'
import { EcommerceTemplate } from '../components/templates/EcommerceTemplate'
import { KanbanTemplate } from '../components/templates/KanbanTemplate'
import { LandingTemplate } from '../components/templates/LandingTemplate'
import { LoginTemplate } from '../components/templates/LoginTemplate'
import { PricingTemplate } from '../components/templates/PricingTemplate'
import { ProfileTemplate } from '../components/templates/ProfileTemplate'
import { SettingsTemplate } from '../components/templates/SettingsTemplate'
import { builtinThemes, useSkinStore } from '../stores/skin-store'

interface ExtractedTheme {
  id: string
  name: string
  source_url: string | null
  tokens_json: string
  css_variables: string
}

export function TemplatesPage() {
  const { t } = useTranslation()
  const [activeTemplate, setActiveTemplate] = useState('dashboard')
  const { currentThemeId, setTheme, applyCustomCss } = useSkinStore()
  const [extractedThemes, setExtractedThemes] = useState<ExtractedTheme[]>([])
  const [selectedExtractedId, setSelectedExtractedId] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getThemes().then((themes: ExtractedTheme[]) => {
      setExtractedThemes(themes)
    })
  }, [])

  const templates = [
    { id: 'dashboard', name: t('templates.dashboard'), component: DashboardTemplate },
    { id: 'landing', name: t('templates.landing'), component: LandingTemplate },
    { id: 'ecommerce', name: t('templates.ecommerce'), component: EcommerceTemplate },
    { id: 'blog', name: t('templates.blog'), component: BlogTemplate },
    { id: 'login', name: t('templates.login'), component: LoginTemplate },
    { id: 'profile', name: t('templates.profile'), component: ProfileTemplate },
    { id: 'pricing', name: t('templates.pricing'), component: PricingTemplate },
    { id: 'settings', name: t('templates.settings'), component: SettingsTemplate },
    { id: 'chat', name: t('templates.chat'), component: ChatTemplate },
    { id: 'docs', name: t('templates.docs'), component: DocsTemplate },
    { id: 'kanban', name: t('templates.kanban'), component: KanbanTemplate },
    { id: 'analytics', name: t('templates.analytics'), component: AnalyticsTemplate },
  ]

  const ActiveComponent = templates.find((tpl) => tpl.id === activeTemplate)?.component || DashboardTemplate

  const handleApplyExtracted = (theme: ExtractedTheme) => {
    setSelectedExtractedId(theme.id)
    setTheme('')
    applyCustomCss(theme.css_variables)
  }

  const handleExportSelected = async () => {
    if (selectedExtractedId) {
      await window.electronAPI.exportTheme(selectedExtractedId, 'css')
    } else if (currentThemeId) {
      await window.electronAPI.exportTheme(currentThemeId, 'css')
    }
  }

  const getThemeLabel = (theme: ExtractedTheme): string => {
    if (theme.source_url) {
      try {
        return new URL(theme.source_url).hostname
      } catch {
        return theme.name
      }
    }
    return theme.name
  }

  const getPrimaryColor = (theme: ExtractedTheme): string => {
    try {
      const tokens = JSON.parse(theme.tokens_json)
      return tokens.colors?.primary || tokens.colors?.['color-1'] || '#888'
    } catch {
      return '#888'
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-4 pb-4">
        <h2 className="text-2xl font-bold">{t('templates.title')}</h2>
        <p className="text-muted-foreground mt-1">{t('templates.description')}</p>
      </div>

      <div className="px-8 pb-4 space-y-3">
        {/* Row 1: Themes */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground shrink-0">{t('nav.themes')}</label>
          <div className="flex flex-wrap gap-2 items-center">
            {builtinThemes.map((theme) => (
              <div key={theme.id} className="relative group">
                <button
                  onClick={() => {
                    setTheme(theme.id)
                    setSelectedExtractedId(null)
                  }}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    currentThemeId === theme.id && !selectedExtractedId
                      ? 'border-primary scale-110'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                  style={{ backgroundColor: theme.colors.primary }}
                />
                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] bg-foreground text-background whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {theme.name}
                </span>
              </div>
            ))}

            {extractedThemes.length > 0 && <div className="w-px h-5 bg-border mx-1" />}

            {extractedThemes.map((theme) => (
              <div key={theme.id} className="relative group">
                <button
                  onClick={() => handleApplyExtracted(theme)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    selectedExtractedId === theme.id
                      ? 'border-primary scale-110'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                  style={{ backgroundColor: getPrimaryColor(theme) }}
                />
                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] bg-foreground text-background whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {getThemeLabel(theme)}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={handleExportSelected}
            className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <Download size={12} />
            {t('analyze.exportFile')}
          </button>
        </div>

        {/* Row 2: Templates */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground shrink-0">{t('nav.templates')}</label>
          <div className="flex flex-wrap gap-1">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => setActiveTemplate(tpl.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTemplate === tpl.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto mx-8 mb-8 rounded-xl border border-border shadow-sm">
        <ActiveComponent />
      </div>
    </div>
  )
}
