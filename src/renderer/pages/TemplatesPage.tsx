import { useEffect, useMemo, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import type { ThemeSummaryRecord } from '../../shared/ipc-contract'
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
import { ThemeCalibrationStrip } from '../components/templates/ThemeCalibrationStrip'
import { type ExtractedThemeColorMode, createExtractedThemePreview } from '../lib/extracted-theme-preview'
import { getValidationScenarioPreference, setValidationScenarioPreference } from '../lib/preferences'
import { VALIDATION_SCENARIO_IDS, type ValidationScenarioId } from '../lib/validation-scenarios'
import { builtinThemes, useSkinStore } from '../stores/skin-store'
import { useThemeStore } from '../stores/theme-store'

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
  const location = useLocation()
  const [activeTemplate, setActiveTemplate] = useState(getValidationScenarioPreference)
  const requestedThemeId = (location.state as { themeId?: string } | null)?.themeId || null
  const [selectedExtractedThemeId, setSelectedExtractedThemeId] = useState<string | null>(requestedThemeId)
  const [extractedColorMode, setExtractedColorMode] = useState<ExtractedThemeColorMode>('base')
  const { currentThemeId, setTheme } = useSkinStore()
  const { themes: extractedThemes, error: themeError, fetchThemes } = useThemeStore()

  useEffect(() => {
    void fetchThemes()
  }, [fetchThemes])

  const templates = VALIDATION_SCENARIO_IDS.map((id) => ({
    id,
    name: t(`templates.${id}`),
    ...templateDefinitions[id],
  }))

  const ActiveComponent = templates.find((tpl) => tpl.id === activeTemplate)?.component || DashboardTemplate
  const selectedExtractedTheme = extractedThemes.find((theme) => theme.id === selectedExtractedThemeId) || null
  const extractedPreview = useMemo(
    () => (selectedExtractedTheme ? createExtractedThemePreview(selectedExtractedTheme, extractedColorMode) : null),
    [extractedColorMode, selectedExtractedTheme],
  )

  const selectTemplate = (templateId: string) => {
    setActiveTemplate(templateId)
    setValidationScenarioPreference(templateId)
  }

  const handleApplyBuiltin = (themeId: string) => {
    setSelectedExtractedThemeId(null)
    setExtractedColorMode('base')
    setTheme(themeId)
  }

  const handleApplyExtracted = (themeId: string) => {
    setSelectedExtractedThemeId(themeId)
    setExtractedColorMode('base')
  }

  return (
    <div className="h-full overflow-auto">
      <div className="flex min-h-full flex-col">
        <PageHeader title={t('templates.title')} description={t('templates.description')} />

        <div className="px-8 pb-4 space-y-3">
          <div data-testid="validation-theme-groups" className="space-y-2">
            <ThemeOptionGroup
              label={t('templates.builtinThemeLabel')}
              description={t('templates.builtinThemeDescription')}
            >
              {builtinThemes.map((theme) => {
                const name = t(`themes.presets.${theme.id}.name`, { defaultValue: theme.name })
                return (
                  <ThemeOption
                    key={theme.id}
                    name={name}
                    colors={getBuiltinThemeColors(theme)}
                    selected={!selectedExtractedTheme && currentThemeId === theme.id}
                    testId={`validation-theme-${theme.id}`}
                    onSelect={() => handleApplyBuiltin(theme.id)}
                  />
                )
              })}
            </ThemeOptionGroup>

            <ThemeOptionGroup
              label={t('templates.extractedThemeLabel')}
              description={t('templates.extractedThemeDescription')}
            >
              {themeError ? (
                <span className="py-1 text-xs text-destructive">{t('themes.loadFailed')}</span>
              ) : extractedThemes.length > 0 ? (
                extractedThemes.map((theme) => (
                  <ThemeOption
                    key={theme.id}
                    name={theme.name}
                    colors={getExtractedThemeColors(theme)}
                    selected={selectedExtractedThemeId === theme.id}
                    testId={`validation-theme-extracted-${theme.id}`}
                    onSelect={() => handleApplyExtracted(theme.id)}
                  />
                ))
              ) : (
                <span className="py-1 text-xs text-muted-foreground">{t('templates.noExtractedThemes')}</span>
              )}
            </ThemeOptionGroup>
          </div>

          {/* Row 2: Directly visible validation scenarios */}
          <div
            data-testid="validation-scenario-grid"
            role="group"
            aria-label={t('templates.scenarioLabel')}
            className="grid grid-cols-1 gap-2.5 md:grid-cols-3"
          >
            {scenarioGroups.map((group) => {
              const groupTemplates = templates.filter((template) => template.group === group)
              return (
                <section key={group} className="rounded-lg bg-secondary/30 p-2.5">
                  <div className="mb-2 px-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(`templates.groups.${group}`)}
                    </h3>
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
                          className={`flex min-h-8 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                            active
                              ? 'border-primary/40 bg-primary text-primary-foreground'
                              : 'border-transparent bg-background/70 text-secondary-foreground hover:border-border hover:bg-accent'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              active ? 'bg-primary-foreground' : 'bg-muted-foreground/45'
                            }`}
                          />
                          <span className="min-w-0 leading-4">{template.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        {selectedExtractedTheme && extractedPreview && (
          <div
            data-testid="extracted-theme-preview-info"
            className="mx-8 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-secondary/45 px-3 py-2 text-xs text-muted-foreground"
          >
            <span>
              {t('templates.extractedPreviewSummary', {
                theme: selectedExtractedTheme.name,
                observed: extractedPreview.observedRoleCount,
                adapted: extractedPreview.adaptedRoleCount,
              })}
            </span>
            <div className="flex items-center gap-2">
              {extractedPreview.hasDarkMode && selectedExtractedTheme.dark_mode_method && (
                <span className="text-xs text-muted-foreground">
                  {t(
                    `templates.extractedDarkSource.${
                      selectedExtractedTheme.dark_mode_method === 'class-toggle' ? 'toggle' : 'media'
                    }`,
                    { selector: selectedExtractedTheme.dark_mode_selector || '.dark' },
                  )}
                </span>
              )}
              {extractedPreview.hasDarkMode && (
                <div
                  role="group"
                  aria-label={t('templates.extractedColorModeLabel')}
                  className="flex rounded-md border border-border bg-background p-0.5"
                >
                  {(['base', 'dark'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={extractedPreview.colorMode === mode}
                      onClick={() => setExtractedColorMode(mode)}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        extractedPreview.colorMode === mode
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      {t(`templates.extractedColorModes.${mode}`)}
                    </button>
                  ))}
                </div>
              )}
              {extractedPreview.contrastIssueCount > 0 && (
                <span className="font-medium text-warning-strong">
                  {t('templates.extractedContrastWarning', { count: extractedPreview.contrastIssueCount })}
                </span>
              )}
            </div>
          </div>
        )}

        <div
          key={activeTemplate}
          className="mx-8 mb-8 min-h-120 flex-1 overflow-auto rounded-xl border border-border shadow-sm"
        >
          <div
            data-theme-preview={selectedExtractedTheme ? 'extracted' : 'builtin'}
            data-theme-color-mode={extractedPreview?.colorMode}
            style={extractedPreview?.style}
            className="ui-enter min-h-full"
          >
            <ThemeCalibrationStrip />
            <ActiveComponent />
          </div>
        </div>
      </div>
    </div>
  )
}

function getExtractedThemeColors(theme: ThemeSummaryRecord): string[] {
  return createExtractedThemePreview(theme).palette
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
          className="size-[10px] shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  )
}

function ThemeOptionGroup({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="grid min-h-12 gap-2 rounded-lg border border-border/60 bg-card/45 px-3 py-2.5 md:grid-cols-[9rem_1fr] md:items-center">
      <div className="min-w-0 pt-0.5">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label={label}>
        {children}
      </div>
    </section>
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
