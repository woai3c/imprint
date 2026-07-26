import { Download } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '../components/PageHeader'
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
import { useFeedbackStore } from '../stores/feedback-store'
import { builtinThemes, generateThemeCss, useSkinStore } from '../stores/skin-store'

interface ExtractedTheme {
  id: string
  name: string
  source_url: string | null
  tokens_json: string
  css_variables: string
}

const scenarioGroups = ['workflow', 'content', 'interaction'] as const

export function TemplatesPage() {
  const { t } = useTranslation()
  const [activeTemplate, setActiveTemplate] = useState('dashboard')
  const { currentThemeId, setTheme, applyCustomCss } = useSkinStore()
  const notify = useFeedbackStore((state) => state.show)
  const [extractedThemes, setExtractedThemes] = useState<ExtractedTheme[]>([])
  const [selectedExtractedId, setSelectedExtractedId] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getThemes().then((themes: ExtractedTheme[]) => {
      setExtractedThemes(themes)
    })
  }, [])

  const templates = [
    { id: 'dashboard', name: t('templates.dashboard'), component: DashboardTemplate, group: 'workflow' },
    { id: 'ecommerce', name: t('templates.ecommerce'), component: EcommerceTemplate, group: 'workflow' },
    { id: 'kanban', name: t('templates.kanban'), component: KanbanTemplate, group: 'workflow' },
    { id: 'analytics', name: t('templates.analytics'), component: AnalyticsTemplate, group: 'workflow' },
    { id: 'settings', name: t('templates.settings'), component: SettingsTemplate, group: 'workflow' },
    { id: 'landing', name: t('templates.landing'), component: LandingTemplate, group: 'content' },
    { id: 'blog', name: t('templates.blog'), component: BlogTemplate, group: 'content' },
    { id: 'docs', name: t('templates.docs'), component: DocsTemplate, group: 'content' },
    { id: 'pricing', name: t('templates.pricing'), component: PricingTemplate, group: 'content' },
    { id: 'login', name: t('templates.login'), component: LoginTemplate, group: 'interaction' },
    { id: 'profile', name: t('templates.profile'), component: ProfileTemplate, group: 'interaction' },
    { id: 'chat', name: t('templates.chat'), component: ChatTemplate, group: 'interaction' },
  ]

  const ActiveComponent = templates.find((tpl) => tpl.id === activeTemplate)?.component || DashboardTemplate

  const handleApplyExtracted = (theme: ExtractedTheme) => {
    setSelectedExtractedId(theme.id)
    setTheme('')
    applyCustomCss(theme.css_variables)
  }

  const handleExportSelected = async () => {
    try {
      let result: { success?: boolean; canceled?: boolean; error?: boolean }
      if (selectedExtractedId) {
        result = await window.electronAPI.exportTheme(selectedExtractedId, 'css')
      } else {
        const theme = builtinThemes.find((item) => item.id === currentThemeId) || builtinThemes[0]
        result = await window.electronAPI.exportFile(generateThemeCss(theme), `imprint-${theme.id}.css`, 'css')
      }

      if (result.success) {
        notify(t('feedback.exported'))
      } else if (result.error) {
        notify(t('feedback.actionFailed'), 'error')
      }
    } catch {
      notify(t('feedback.actionFailed'), 'error')
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

  const selectedExtractedTheme = extractedThemes.find((theme) => theme.id === selectedExtractedId)
  const selectedBuiltinTheme = builtinThemes.find((theme) => theme.id === currentThemeId)
  const currentThemeName = selectedExtractedTheme
    ? getThemeLabel(selectedExtractedTheme)
    : t(`themes.presets.${selectedBuiltinTheme?.id || 'default'}.name`, {
        defaultValue: selectedBuiltinTheme?.name || builtinThemes[0].name,
      })

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={t('templates.title')} description={t('templates.description')} />

      <div className="px-8 pb-4 space-y-3">
        {/* Row 1: Themes */}
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">{t('nav.themes')}</span>
          <div className="flex flex-wrap gap-2 items-center">
            {builtinThemes.map((theme) => (
              <div key={theme.id} className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setTheme(theme.id)
                    setSelectedExtractedId(null)
                  }}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    currentThemeId === theme.id && !selectedExtractedId
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                  style={{ backgroundColor: theme.colors.primary }}
                  aria-label={t('templates.applyTheme', {
                    theme: t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name }),
                  })}
                  aria-pressed={currentThemeId === theme.id && !selectedExtractedId}
                  title={t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name })}
                />
                <span className="pointer-events-none absolute -bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100">
                  {t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name })}
                </span>
              </div>
            ))}

            {extractedThemes.length > 0 && <div className="w-px h-5 bg-border mx-1" />}

            {extractedThemes.map((theme) => (
              <div key={theme.id} className="relative group">
                <button
                  type="button"
                  onClick={() => handleApplyExtracted(theme)}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    selectedExtractedId === theme.id
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                  style={{ backgroundColor: getPrimaryColor(theme) }}
                  aria-label={t('templates.applyTheme', { theme: getThemeLabel(theme) })}
                  aria-pressed={selectedExtractedId === theme.id}
                  title={getThemeLabel(theme)}
                />
                <span className="pointer-events-none absolute -bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100">
                  {getThemeLabel(theme)}
                </span>
              </div>
            ))}
          </div>

          <span className="max-w-44 truncate text-xs font-medium" title={currentThemeName}>
            {t('templates.currentTheme', { theme: currentThemeName })}
          </span>

          <button
            type="button"
            onClick={handleExportSelected}
            className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            <Download size={12} />
            {t('analyze.exportFile')}
          </button>
        </div>

        {/* Row 2: Validation scenario */}
        <div className="flex items-center gap-3">
          <label htmlFor="validation-scenario" className="shrink-0 text-xs font-medium text-muted-foreground">
            {t('templates.scenarioLabel')}
          </label>
          <select
            id="validation-scenario"
            value={activeTemplate}
            onChange={(event) => setActiveTemplate(event.target.value)}
            className="min-w-52 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-ring"
          >
            {scenarioGroups.map((group) => (
              <optgroup key={group} label={t(`templates.groups.${group}`)}>
                {templates
                  .filter((template) => template.group === group)
                  .map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div
        key={`${activeTemplate}-${currentThemeId}-${selectedExtractedId || ''}`}
        className="ui-enter mx-8 mb-8 flex-1 overflow-auto rounded-xl border border-border shadow-sm"
      >
        <ActiveComponent />
      </div>
    </div>
  )
}
