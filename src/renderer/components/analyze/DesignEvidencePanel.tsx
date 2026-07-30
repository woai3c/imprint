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
  'no-interaction-states-observed': 'noInteractionStates',
  'no-major-media-detected': 'noMedia',
  'no-classified-media-regions': 'noMediaClassification',
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
  const activeObservationCount = evidence.interactionObservations.filter(
    (observation) => observation.safety === 'safe-active',
  ).length
  const responsiveCount = evidence.responsiveObservations.length
  const stateFacts = [
    passiveStateCount > 0 ? t('analyze.overview.statesPassive', { count: passiveStateCount }) : null,
    activeObservationCount > 0 ? t('analyze.overview.statesActive', { count: activeObservationCount }) : null,
    responsiveCount > 0 ? t('analyze.overview.statesResponsive', { count: responsiveCount }) : null,
  ].filter((fact): fact is string => Boolean(fact))
  const visibleLimitations = evidence.limitations.filter((limitation) => !limitation.startsWith('skipped-interaction:'))

  return (
    <div data-testid="design-evidence-overview" className="space-y-5 p-6">
      <section className="rounded-xl border border-border/60 bg-background p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('analyze.overview.capability')}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{t('analyze.overview.title')}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {t('analyze.overview.evidenceOnlyDescription')}
        </p>
      </section>

      <section
        aria-label={t('analyze.overview.coverageTitle')}
        className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6"
      >
        {[
          { value: pageCount, label: t('analyze.overview.pages') },
          { value: evidence.sections.length, label: t('analyze.overview.sections') },
          { value: evidence.components.length, label: t('analyze.overview.components') },
          { value: evidence.coverage.viewportCoverage.length, label: t('analyze.overview.viewports') },
          {
            value: `${evidence.coverage.interactionCoverage.safelyObserved}/${evidence.coverage.interactionCoverage.candidates}`,
            label: t('analyze.overview.interactions'),
          },
          {
            value: `${evidence.coverage.mediaCoverage.classifiedRegions}/${evidence.coverage.mediaCoverage.majorRegions}`,
            label: t('analyze.overview.media'),
          },
        ].map(({ value, label }) => (
          <div key={label} className="rounded-xl border border-border/60 bg-background p-4">
            <p className="text-xl font-semibold">{value}</p>
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
              .filter((role): role is NonNullable<typeof role> => Boolean(role) && role !== 'unknown')
            return (
              <article key={topologyPage.pageId} className="rounded-lg bg-secondary/45 p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="shrink-0 rounded bg-background px-2 py-1 font-medium text-foreground">
                    {t(`analyze.viewports.${page.viewport}`, { defaultValue: page.viewport })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={page.url}>
                    {page.url}
                  </span>
                  {topologyPage.role !== 'unknown' && (
                    <span className="shrink-0 text-muted-foreground">
                      {t(`analyze.overview.pageRoles.${topologyPage.role}`, {
                        defaultValue: topologyPage.role,
                      })}
                    </span>
                  )}
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
          {stateFacts.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
              {stateFacts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('analyze.overview.statesEmpty')}</p>
          )}
        </section>

        <section className="rounded-xl border border-border/60 bg-background p-5">
          <h3 className="text-sm font-semibold">{t('analyze.overview.limitationsTitle')}</h3>
          {visibleLimitations.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm leading-5 text-muted-foreground">
              {visibleLimitations.map((limitation) => (
                <li key={limitation}>
                  {t(`analyze.overview.limitations.${LIMITATION_KEYS[limitation] || 'unknown'}`, {
                    limitation,
                  })}
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
