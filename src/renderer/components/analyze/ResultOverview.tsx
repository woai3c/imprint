import { AlertTriangle, Moon } from 'lucide-react'

import { useTranslation } from 'react-i18next'

import { getPageScreenshots, getScreenshotUrl } from '../../lib/page-screenshots'
import type { AnalysisResultData } from '../../stores/analysis-store'

interface ResultOverviewProps {
  result: AnalysisResultData
  analyzing: boolean
  onRetryWithLogin: () => void
  onOpenLightbox: (index: number) => void
}

export function ResultOverview({ result, analyzing, onRetryWithLogin, onOpenLightbox }: ResultOverviewProps) {
  const { t } = useTranslation()

  const tokens = result.tokens as Record<string, unknown> | undefined
  const colorCount = tokens?.colors ? Object.keys(tokens.colors as Record<string, string>).length : 0
  const typographyData = tokens?.typography as { fontSizes?: string[] } | undefined
  const typeStyleCount = typographyData?.fontSizes?.length || 0
  const spacingCount = (tokens?.spacing as string[] | undefined)?.length || 0
  const radiiCount = (tokens?.radii as string[] | undefined)?.length || 0

  const pageScreenshots = getPageScreenshots(result)
  const analyzedPageCount = new Set(pageScreenshots.map((screenshot) => screenshot.url)).size
  const coverage = result.designEvidence?.coverage

  let hostname = ''
  try {
    hostname = new URL(result.url).hostname
  } catch {
    hostname = result.url
  }

  return (
    <div className="flex min-h-0 w-80 shrink-0 flex-col">
      <div className="scrollbar-hidden flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-4">
        {result.completion?.reason && result.completion.reason !== 'complete' && (
          <div
            data-testid="analysis-completion-reason"
            className={`rounded-xl border p-4 ${
              result.completion.reason === 'time-limit'
                ? 'border-warning/30 bg-warning/10 text-warning-strong'
                : 'border-primary/25 bg-primary/10 text-foreground'
            }`}
          >
            <p className="text-sm font-semibold">{t(`analyze.completion.${result.completion.reason}.title`)}</p>
            <p className="mt-1 text-xs leading-5">
              {t(`analyze.completion.${result.completion.reason}.description`, {
                pages: analyzedPageCount,
                minutes: result.completion.activeLimitMs
                  ? Math.round(result.completion.activeLimitMs / 60_000)
                  : undefined,
              })}
            </p>
          </div>
        )}

        {result.authWallDetected && result.accessMode === 'anonymous' && (
          <div data-testid="anonymous-auth-warning" className="rounded-xl border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning-strong" />
              <div>
                <p className="text-sm font-medium text-warning-strong">{t('analyze.auth.anonymousWarningTitle')}</p>
                <p className="mt-1 text-xs leading-5 text-warning-strong">
                  {t('analyze.auth.anonymousWarningDescription')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRetryWithLogin}
              disabled={analyzing}
              className="mt-3 min-h-9 w-full rounded-lg bg-warning px-3 text-xs font-medium text-warning-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t('analyze.auth.retryWithLogin')}
            </button>
          </div>
        )}

        {/* Website identity */}
        <div className="analysis-source-card rounded-xl border border-border/60 bg-card/50 p-5">
          <h3 data-testid="analysis-source" className="text-base font-semibold">
            {hostname}
          </h3>

          {result.featureTags && result.featureTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.featureTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {result.designEvidence?.techStack &&
            (() => {
              const ts = result.designEvidence.techStack
              const tags = [...ts.frameworks, ...ts.uiLibraries, ...ts.cssApproach]
              if (ts.bundler) tags.push(ts.bundler)
              return tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null
            })()}

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{colorCount}</strong> {t('preview.statColors')}
            </span>
            <span>
              <strong className="text-foreground">{typeStyleCount}</strong> {t('preview.statTypes')}
            </span>
            <span>
              <strong className="text-foreground">{spacingCount}</strong> {t('preview.statSpacing')}
            </span>
            <span>
              <strong className="text-foreground">{radiiCount}</strong> {t('preview.statRadii')}
            </span>
          </div>

          {result.designEvidence && (
            <div
              data-testid="analysis-evidence-coverage"
              className="mt-4 border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground"
            >
              {t('analyze.overview.sourceCoverage', {
                sections: result.designEvidence.sections.length,
                components: result.designEvidence.components.length,
                viewports: coverage?.viewportCoverage.length || 0,
              })}
            </div>
          )}

          <div className="mt-3 text-xs">
            {result.hasDarkMode ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <Moon size={12} aria-hidden="true" />
                {t('analyze.darkModeSupported')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground/60">
                <Moon size={12} aria-hidden="true" />
                {t('analyze.darkModeNotDetected')}
              </span>
            )}
          </div>
        </div>

        {/* Source-page evidence */}
        {pageScreenshots.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h4 className="text-xs font-medium text-foreground">{t('analyze.evidence.title')}</h4>
              <span className="text-xs text-muted-foreground">
                {t('analyze.evidence.summary', {
                  pages: analyzedPageCount,
                  screenshots: pageScreenshots.length,
                })}
              </span>
            </div>
            <div data-testid="analysis-page-screenshots" className="space-y-3">
              {pageScreenshots.map((screenshot, index) => (
                <figure
                  key={`${screenshot.path}-${index}`}
                  data-testid="analysis-page-screenshot"
                  className="analysis-evidence-card overflow-hidden rounded-xl border border-border/60 bg-card/50"
                >
                  <figcaption className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs">
                    <span className="shrink-0 font-medium text-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={screenshot.url}>
                      {screenshot.url}
                    </span>
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t(`analyze.viewports.${screenshot.viewport}`, {
                        defaultValue: screenshot.viewport,
                      })}
                    </span>
                  </figcaption>
                  <img
                    data-testid="analysis-page-screenshot-image"
                    src={getScreenshotUrl(screenshot.thumbnailPath || screenshot.path)}
                    alt={t('analyze.evidence.screenshotAlt', { url: screenshot.url })}
                    loading="lazy"
                    decoding="async"
                    className="max-h-44 w-full cursor-zoom-in object-cover object-top"
                    onClick={() => onOpenLightbox(index)}
                  />
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* Meta info */}
        <div className="space-y-1 px-1 text-xs text-muted-foreground">
          <p>{t('history.duration', { seconds: (result.duration / 1000).toFixed(1) })}</p>
          <p className="truncate" title={result.url}>
            {result.url}
          </p>
        </div>
      </div>
    </div>
  )
}
