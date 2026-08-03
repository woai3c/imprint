import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'

import type { ThemeRecord } from '../../shared/ipc-contract'
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
import { getValidationScenarioPreference, setValidationScenarioPreference } from '../lib/preferences'
import { VALIDATION_SCENARIO_IDS, type ValidationScenarioId } from '../lib/validation-scenarios'
import { builtinThemes, useSkinStore } from '../stores/skin-store'

const scenarioGroups = ['workflow', 'content', 'interaction'] as const

const templateDefinitions: Record<
  ValidationScenarioId,
  { component: ComponentType; group: (typeof scenarioGroups)[number] }
> = {
  dashboard: { component: DashboardTemplate, group: 'workflow' },
  ecommerce: { component: EcommerceTemplate, group: 'workflow' },
  kanban: { component: KanbanTemplate, group: 'workflow' },
  analytics: { component: AnalyticsTemplate, group: 'workflow' },
  settings: { component: SettingsTemplate, group: 'workflow' },
  landing: { component: LandingTemplate, group: 'content' },
  blog: { component: BlogTemplate, group: 'content' },
  docs: { component: DocsTemplate, group: 'content' },
  pricing: { component: PricingTemplate, group: 'content' },
  login: { component: LoginTemplate, group: 'interaction' },
  profile: { component: ProfileTemplate, group: 'interaction' },
  chat: { component: ChatTemplate, group: 'interaction' },
}

export function TemplatesPage() {
  const { t } = useTranslation()
  const [activeTemplate, setActiveTemplate] = useState(getValidationScenarioPreference)
  const { currentThemeId, extractedThemeId, setTheme, applyCustomCss } = useSkinStore()
  const [extractedThemes, setExtractedThemes] = useState<ThemeRecord[]>([])

  useEffect(() => {
    window.electronAPI.getThemes().then((themes) => {
      setExtractedThemes(themes)
    })
  }, [])

  const templates = VALIDATION_SCENARIO_IDS.map((id) => ({
    id,
    name: t(`templates.${id}`),
    ...templateDefinitions[id],
  }))

  const ActiveComponent = templates.find((tpl) => tpl.id === activeTemplate)?.component || DashboardTemplate

  const selectTemplate = (templateId: string) => {
    setActiveTemplate(templateId)
    setValidationScenarioPreference(templateId)
  }

  const handleApplyExtracted = (theme: ThemeRecord) => {
    applyCustomCss(theme.css_variables, theme.id)
  }

  const getThemeLabel = (theme: ThemeRecord): string => {
    if (theme.source_url) {
      try {
        return new URL(theme.source_url).hostname
      } catch {
        return theme.name
      }
    }
    return theme.name
  }

  const getExtractedThemeColors = (theme: ThemeRecord): string[] => {
    try {
      const tokens = JSON.parse(theme.tokens_json)
      const colors = Object.values(tokens.colors || {}).filter((color): color is string => typeof color === 'string')
      return colors.length > 0 ? colors.slice(0, 5) : ['#888']
    } catch {
      return ['#888']
    }
  }

  const handleApplyBuiltin = (themeId: string) => {
    setTheme(themeId)
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={t('templates.title')} description={t('templates.description')} />

      <div className="px-8 pb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">
            {t('templates.switchThemeLabel')}
          </span>

          {builtinThemes.map((theme) => {
            const name = t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name })
            return (
              <ThemeOption
                key={theme.id}
                name={name}
                colors={getBuiltinThemeColors(theme)}
                selected={currentThemeId === theme.id && !extractedThemeId}
                testId={`validation-theme-${theme.id}`}
                onSelect={() => handleApplyBuiltin(theme.id)}
              />
            )
          })}

          {extractedThemes.map((theme) => (
            <ThemeOption
              key={theme.id}
              name={getThemeLabel(theme)}
              colors={getExtractedThemeColors(theme)}
              selected={extractedThemeId === theme.id}
              testId={`validation-theme-extracted-${theme.id}`}
              onSelect={() => handleApplyExtracted(theme)}
            />
          ))}
        </div>

        {/* Row 2: Directly visible validation scenarios */}
        <div
          data-testid="validation-scenario-grid"
          role="group"
          aria-label={t('templates.scenarioLabel')}
          className="grid grid-cols-3 gap-2.5"
        >
          {scenarioGroups.map((group) => {
            const groupTemplates = templates.filter((template) => template.group === group)
            return (
              <section key={group} className="rounded-xl border border-border/60 bg-card/50 p-2.5">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(`templates.groups.${group}`)}
                  </h3>
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {groupTemplates.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {groupTemplates.map((template) => {
                    const active = activeTemplate === template.id
                    return (
                      <button
                        key={template.id}
                        type="button"
                        data-testid={`validation-scenario-${template.id}`}
                        onClick={() => selectTemplate(template.id)}
                        aria-pressed={active}
                        className={`flex min-h-8 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-all ${
                          active
                            ? 'border-primary/40 bg-primary text-primary-foreground shadow-sm'
                            : 'border-transparent bg-secondary/50 text-secondary-foreground hover:border-border hover:bg-accent'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            active ? 'bg-primary-foreground' : 'bg-muted-foreground/45'
                          }`}
                        />
                        <span className="truncate">{template.name}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <div
        key={activeTemplate}
        className="ui-enter mx-8 mb-8 flex-1 overflow-auto rounded-xl border border-border shadow-sm"
      >
        <ActiveComponent />
      </div>
    </div>
  )
}

function getBuiltinThemeColors(theme: (typeof builtinThemes)[number]): string[] {
  return [
    theme.colors.primary,
    theme.colors.background,
    theme.colors.foreground,
    theme.colors.accent,
    theme.colors.secondary,
  ]
}

function ThemePaletteMark({ colors }: { colors: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
      {colors.slice(0, 3).map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="size-2.5 rounded-full border border-black/10"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  )
}

function ThemeOption({
  name,
  colors,
  selected,
  testId,
  onSelect,
}: {
  name: string
  colors: string[]
  selected: boolean
  testId?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onSelect}
      aria-pressed={selected}
      title={name}
      className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/70 bg-background/70 text-muted-foreground hover:border-primary/50 hover:bg-secondary hover:text-foreground'
      }`}
    >
      <ThemePaletteMark colors={colors} />
      <span>{name}</span>
    </button>
  )
}
