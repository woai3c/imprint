import { Boxes, Eye, Image, Layers3, MonitorSmartphone, MousePointerClick } from 'lucide-react'

import { useTranslation } from 'react-i18next'

import type { DesignEvidence } from '../../../core/design-evidence/types'

interface DesignEvidencePanelProps {
  evidence?: DesignEvidence
}

const LIMITATION_KEYS: Record<string, string> = {
  'fewer-pages-than-requested': 'fewerPages',
  'single-viewport': 'singleViewport',
  'no-sections-detected': 'noSections',
  'safe-active-interactions-not-observed': 'noActiveInteractions',
  'some-safe-interactions-skipped': 'noActiveInteractions',
  'no-major-media-detected': 'noMedia',
}

export function DesignEvidencePanel({ evidence }: DesignEvidencePanelProps) {
  const { t } = useTranslation()

  if (!evidence) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border/60 bg-background p-5">
          <h3 className="text-sm font-semibold">{t('analyze.overview.legacyTitle')}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('analyze.overview.legacyDescription')}</p>
        </div>
      </div>
    )
  }

  const pageCount = new Set(evidence.pages.map((page) => page.url)).size
  const passiveStateCount =
    evidence.interactionStyles.hover.length +
    evidence.interactionStyles.focus.length +
    evidence.interactionStyles.active.length

  return (
    <div data-testid="design-evidence-overview" className="space-y-5 p-6">
      <section className="rounded-xl border border-border/60 bg-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('analyze.overview.capability')}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{t('analyze.overview.title')}</h2>
          </div>
          <span className="rounded-full border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-foreground">
            evidence-only
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {t('analyze.overview.evidenceOnlyDescription')}
        </p>
      </section>

      <section
        aria-label={t('analyze.overview.coverageTitle')}
        className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6"
      >
        {[
          { icon: Eye, value: pageCount, label: t('analyze.overview.pages') },
          { icon: Layers3, value: evidence.sections.length, label: t('analyze.overview.sections') },
          { icon: Boxes, value: evidence.components.length, label: t('analyze.overview.components') },
          {
            icon: MonitorSmartphone,
            value: evidence.coverage.viewportCoverage.length,
            label: t('analyze.overview.viewports'),
          },
          {
            icon: MousePointerClick,
            value: `${evidence.coverage.interactionCoverage.safelyObserved}/${evidence.coverage.interactionCoverage.candidates}`,
            label: t('analyze.overview.interactions'),
          },
          {
            icon: Image,
            value: `${evidence.coverage.mediaCoverage.classifiedRegions}/${evidence.coverage.mediaCoverage.majorRegions}`,
            label: t('analyze.overview.media'),
          },
        ].map(({ icon: Icon, value, label }) => (
          <div key={label} className="rounded-xl border border-border/60 bg-background p-4">
            <Icon size={16} className="text-primary" aria-hidden="true" />
            <p className="mt-3 text-xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border/60 bg-background p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('analyze.overview.topologyTitle')}</h3>
          <span className="text-xs text-muted-foreground">
            {t('analyze.overview.sectionCoverage', {
              percent: Math.round(evidence.coverage.sectionCoverage * 100),
            })}
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {evidence.topology.pages.map((topologyPage) => {
            const page = evidence.pages.find((candidate) => candidate.id === topologyPage.pageId)
            if (!page) return null
            const roles = topologyPage.sectionIds
              .map((sectionId) => evidence.sections.find((section) => section.id === sectionId)?.role)
              .filter((role): role is NonNullable<typeof role> => Boolean(role))
            return (
              <article key={topologyPage.pageId} className="rounded-lg bg-secondary/45 p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="shrink-0 rounded bg-background px-2 py-1 font-medium text-foreground">
                    {t(`analyze.viewports.${page.viewport}`, { defaultValue: page.viewport })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={page.url}>
                    {page.url}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {t(`analyze.overview.pageRoles.${topologyPage.role}`, {
                      defaultValue: topologyPage.role,
                    })}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {roles.length > 0 ? (
                    roles.map((role, index) => (
                      <span key={`${role}-${index}`} className="contents">
                        {index > 0 && <span className="text-xs text-muted-foreground">→</span>}
                        <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
                          {t(`analyze.overview.sectionRoles.${role}`, { defaultValue: role })}
                        </span>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('analyze.overview.noSections')}</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-border/60 bg-background p-5">
          <h3 className="text-sm font-semibold">{t('analyze.overview.statesTitle')}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('analyze.overview.statesSummary', {
              passive: passiveStateCount,
              active: evidence.interactionObservations.filter((observation) => observation.safety === 'safe-active')
                .length,
              responsive: evidence.responsiveObservations.length,
            })}
          </p>
        </section>

        <section className="rounded-xl border border-border/60 bg-background p-5">
          <h3 className="text-sm font-semibold">{t('analyze.overview.limitationsTitle')}</h3>
          {evidence.limitations.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm leading-5 text-muted-foreground">
              {evidence.limitations.map((limitation) => (
                <li key={limitation} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>
                    {t(`analyze.overview.limitations.${LIMITATION_KEYS[limitation] || 'unknown'}`, {
                      limitation,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t('analyze.overview.noLimitations')}</p>
          )}
        </section>
      </div>
    </div>
  )
}
