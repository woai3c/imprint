import { useState } from 'react'
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

export function TemplatesPage() {
  const { t } = useTranslation()
  const [activeTemplate, setActiveTemplate] = useState('dashboard')
  const { currentThemeId, setTheme } = useSkinStore()

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

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-4 pb-4">
        <h2 className="text-2xl font-bold">{t('templates.title')}</h2>
        <p className="text-muted-foreground mt-1">{t('templates.description')}</p>
      </div>

      <div className="px-8 pb-4 flex gap-4 items-center">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('nav.templates')}</label>
          <div className="flex gap-1 p-1 bg-secondary rounded-lg">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => setActiveTemplate(tpl.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTemplate === tpl.id ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t('nav.themes')}</label>
          <div className="flex gap-1.5">
            {builtinThemes.map((theme) => (
              <div key={theme.id} className="relative group">
                <button
                  onClick={() => setTheme(theme.id)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    currentThemeId === theme.id
                      ? 'border-primary scale-110'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                  style={{ backgroundColor: theme.colors.primary }}
                />
                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] bg-foreground text-background whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {theme.name}
                </span>
              </div>
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
