import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BlogTemplate } from '../components/templates/BlogTemplate'
import { DashboardTemplate } from '../components/templates/DashboardTemplate'
import { EcommerceTemplate } from '../components/templates/EcommerceTemplate'
import { LandingTemplate } from '../components/templates/LandingTemplate'
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
              <button
                key={theme.id}
                onClick={() => setTheme(theme.id)}
                title={theme.name}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  currentThemeId === theme.id
                    ? 'border-primary scale-110'
                    : 'border-transparent hover:border-muted-foreground/30'
                }`}
                style={{ backgroundColor: theme.colors.primary }}
              />
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
