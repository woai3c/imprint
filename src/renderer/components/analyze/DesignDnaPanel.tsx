import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import type { DesignToken } from '../../../core/analyzer/types'
import type { DesignClaim, DesignIntelligenceMeta, ValidationReport } from '../../../core/design-intelligence/types'
import type { AnalysisResultData } from '../../stores/analysis-store'
import { useFeedbackStore } from '../../stores/feedback-store'
import { DesignEvidencePanel } from './DesignEvidencePanel'
import { ValidationReportPanel } from './ValidationReportPanel'

interface DesignDnaPanelProps {
  result: AnalysisResultData
  intelligenceRunning?: boolean
  intelligenceProgress?: { step: string; percent: number } | null
  onRetry?: () => void
  onCancel?: () => void
  onSkip?: () => void
  onResultUpdate?: (result: Partial<AnalysisResultData>) => void
  onOpenEvidence?: (evidenceId: string) => void
}

function EvidenceLink({ evidenceId, onOpen }: { evidenceId: string; onOpen?: (evidenceId: string) => void }) {
  return (
    <button
      data-testid="design-evidence-link"
      type="button"
      onClick={() => onOpen?.(evidenceId)}
      disabled={!onOpen}
      className="inline-flex max-w-full items-center gap-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      <span className="truncate">{evidenceId}</span>
      {onOpen && <ExternalLink size={9} className="shrink-0" />}
    </button>
  )
}

function ClaimCard({
  title,
  claim,
  onOpenEvidence,
}: {
  title?: string
  claim: DesignClaim
  onOpenEvidence?: (evidenceId: string) => void
}) {
  const { t } = useTranslation()
  return (
    <article className="rounded-lg border border-border/60 bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <p className="mb-1 text-xs font-semibold">{title}</p>}
          <p className="text-sm leading-5 text-foreground">{claim.statement}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            claim.confidence === 'high'
              ? 'bg-success/10 text-success'
              : claim.confidence === 'medium'
                ? 'bg-warning/10 text-warning'
                : 'bg-secondary text-muted-foreground'
          }`}
        >
          {t(`analyze.designDna.confidence.${claim.confidence}`)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{claim.implementation}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {claim.evidence.map((reference) => (
          <EvidenceLink key={reference.evidenceId} evidenceId={reference.evidenceId} onOpen={onOpenEvidence} />
        ))}
      </div>
    </article>
  )
}

function VisionChoiceCard({ onStructural, onSkip }: { onStructural?: () => void; onSkip?: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <section
      data-testid="design-intelligence-vision-choice"
      className="rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <p className="text-sm font-semibold">{t('analyze.designDna.visionChoice.title')}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('analyze.designDna.visionChoice.description')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onStructural && (
          <button
            type="button"
            data-testid="design-intelligence-choice-structural"
            onClick={onStructural}
            className="min-h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('analyze.designDna.visionChoice.structural')}
          </button>
        )}
        <button
          type="button"
          data-testid="design-intelligence-choice-switch-model"
          onClick={() => navigate('/settings')}
          className="min-h-8 rounded-md bg-secondary px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('analyze.designDna.visionChoice.switchModel')}
        </button>
        {onSkip && (
          <button
            type="button"
            data-testid="design-intelligence-choice-skip"
            onClick={onSkip}
            className="min-h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('analyze.designDna.visionChoice.skip')}
          </button>
        )}
      </div>
    </section>
  )
}

function StatusCard({
  meta,
  running,
  progress,
  onRetry,
  onCancel,
  managedEvidence,
}: {
  meta?: DesignIntelligenceMeta
  running?: boolean
  progress?: { step: string; percent: number } | null
  onRetry?: () => void
  onCancel?: () => void
  managedEvidence?: boolean
}) {
  const { t } = useTranslation()
  const status = running
    ? 'pending'
    : meta?.failureCode === 'cancelled'
      ? 'cancelled'
      : meta?.status || 'not-configured'
  const successful = status === 'complete' || status === 'partial'
  const failed = status === 'failed' || status === 'cancelled'
  return (
    <section
      data-testid={`design-intelligence-status-${status}`}
      className={`rounded-xl border p-4 ${
        successful
          ? 'border-success/30 bg-success/5'
          : failed
            ? 'border-destructive/30 bg-destructive/5'
            : 'border-border bg-secondary/30'
      }`}
    >
      <div className="flex items-start gap-3">
        {running ? (
          <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
        ) : successful ? (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
        ) : failed ? (
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t(`analyze.designDna.status.${status}`)}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {managedEvidence && status === 'not-requested'
              ? t('analyze.designDna.managedNotice')
              : t(`analyze.designDna.statusDescription.${status}`)}
          </p>
          {failed && meta?.failureReason && (
            <p className="mt-1 break-all text-[10px] leading-4 text-destructive/80">{meta.failureReason}</p>
          )}
          {meta?.provider && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {meta.provider}
              {meta.model ? ` · ${meta.model}` : ''}
              {meta.inputMode ? ` · ${t(`analyze.designDna.inputMode.${meta.inputMode}`)}` : ''}
            </p>
          )}
          {running && progress && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all motion-reduce:transition-none"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
        {failed && onRetry && (
          <button
            type="button"
            data-testid="design-intelligence-retry"
            onClick={onRetry}
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw size={12} />
            {t('analyze.designDna.retry')}
          </button>
        )}
        {successful && onRetry && (
          <button
            type="button"
            data-testid="design-intelligence-reinterpret"
            onClick={onRetry}
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw size={12} />
            {t('analyze.designDna.reinterpret')}
          </button>
        )}
        {status === 'skipped' && onRetry && (
          <button
            type="button"
            data-testid="design-intelligence-start-anyway"
            onClick={onRetry}
            className="min-h-8 shrink-0 rounded-md bg-secondary px-2.5 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('analyze.designDna.startAnyway')}
          </button>
        )}
        {status === 'not-requested' && managedEvidence && onRetry && (
          <button
            type="button"
            data-testid="design-intelligence-managed-start"
            onClick={onRetry}
            className="min-h-8 shrink-0 rounded-md bg-secondary px-2.5 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('analyze.designDna.interpretManaged')}
          </button>
        )}
        {running && onCancel && (
          <button
            type="button"
            data-testid="design-intelligence-cancel"
            onClick={onCancel}
            className="min-h-8 shrink-0 rounded-md bg-secondary px-2.5 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('analyze.designDna.cancel')}
          </button>
        )}
      </div>
    </section>
  )
}

export function DesignDnaPanel({
  result,
  intelligenceRunning,
  intelligenceProgress,
  onRetry,
  onCancel,
  onSkip,
  onResultUpdate,
  onOpenEvidence,
}: DesignDnaPanelProps) {
  const { t } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(result.validationReport || null)
  const [validating, setValidating] = useState(false)
  const profile = result.designProfile
  const evidence = result.designEvidence
  const meta = result.designIntelligence
  const claimGroups: Array<{ title: string; claims: Array<[string, DesignClaim]> }> = profile
    ? [
        {
          title: t('analyze.designDna.composition'),
          claims: Object.entries(profile.composition),
        },
        {
          title: t('analyze.designDna.attention'),
          claims: [
            ['entryPoint', profile.attention.entryPoint],
            ...profile.attention.visualSequence.map((claim, index): [string, DesignClaim] => [
              `visualSequence${index + 1}`,
              claim,
            ]),
            ['actionHierarchy', profile.attention.actionHierarchy],
            ['contrastStrategy', profile.attention.contrastStrategy],
          ],
        },
        {
          title: t('analyze.designDna.visualLanguage'),
          claims: Object.entries(profile.visualLanguage).filter((entry): entry is [string, DesignClaim] =>
            Boolean(entry[1]),
          ),
        },
        {
          title: t('analyze.designDna.interactionLanguage'),
          claims: [
            ...profile.interactionLanguage.primaryDrivers.map((claim, index): [string, DesignClaim] => [
              `primaryDriver${index + 1}`,
              claim,
            ]),
            ['feedbackStyle', profile.interactionLanguage.feedbackStyle],
            ['stateChangeAmplitude', profile.interactionLanguage.stateChangeAmplitude],
            ...(profile.interactionLanguage.scrollNarrative
              ? ([['scrollNarrative', profile.interactionLanguage.scrollNarrative]] as Array<[string, DesignClaim]>)
              : []),
            ...profile.interactionLanguage.continuityRules.map((claim, index): [string, DesignClaim] => [
              `continuity${index + 1}`,
              claim,
            ]),
          ],
        },
      ]
    : []

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify(t('feedback.copied'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const generateValidation = async (scenario: 'workflow' | 'content' | 'states') => {
    if (!result.analysisId) return
    setValidating(true)
    try {
      const response = await window.electronAPI.generateValidation(result.analysisId, scenario)
      if (!response.validationReport) throw new Error('Validation report unavailable')
      setValidationReport(response.validationReport)
      onResultUpdate?.(response)
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      setValidating(false)
    }
  }

  return (
    <div data-testid="design-dna-overview" className="space-y-5 p-6">
      <StatusCard
        meta={meta}
        running={intelligenceRunning}
        progress={intelligenceProgress}
        onRetry={onRetry}
        onCancel={onCancel}
        managedEvidence={evidence?.source.accessMode === 'managed'}
      />

      {!intelligenceRunning && meta?.pendingChoice === 'model-no-vision' && meta.status === 'not-requested' && (
        <VisionChoiceCard onStructural={onRetry} onSkip={onSkip} />
      )}

      {!profile ? (
        <DesignEvidencePanel evidence={evidence} />
      ) : (
        <>
          <section>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('analyze.designDna.title')}
            </p>
            <div className="mt-3">
              <ClaimCard title={t('analyze.designDna.thesis')} claim={profile.thesis} onOpenEvidence={onOpenEvidence} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">{t('analyze.designDna.signatureMoves')}</h3>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {profile.signatureMoves.map((move) => (
                <ClaimCard key={move.id} title={move.name} claim={move} onOpenEvidence={onOpenEvidence} />
              ))}
            </div>
          </section>

          {claimGroups.map((group) => (
            <section key={group.title}>
              <h3 className="text-sm font-semibold">{group.title}</h3>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {group.claims.map(([key, claim]) => (
                  <ClaimCard key={key} claim={claim} onOpenEvidence={onOpenEvidence} />
                ))}
              </div>
            </section>
          ))}

          {profile.sectionGrammar.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">{t('analyze.designDna.sectionGrammar')}</h3>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {profile.sectionGrammar.map((section, index) => (
                  <article key={`${section.role}-${index}`} className="rounded-xl border border-border/60 p-3">
                    <p className="mb-3 text-xs font-semibold">{section.role}</p>
                    <div className="space-y-2">
                      {[...section.composition, ...section.contentRhythm, ...section.transitionToNext].map(
                        (claim, claimIndex) => (
                          <ClaimCard key={claimIndex} claim={claim} onOpenEvidence={onOpenEvidence} />
                        ),
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {profile.componentGrammar.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">{t('analyze.designDna.componentGrammar')}</h3>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {profile.componentGrammar.map((component, index) => (
                  <article key={`${component.component}-${index}`} className="rounded-xl border border-border/60 p-3">
                    <p className="text-xs font-semibold">{component.component}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{component.role}</p>
                    <div className="mt-3 space-y-2">
                      {component.rules.map((claim, claimIndex) => (
                        <ClaimCard key={claimIndex} claim={claim} onOpenEvidence={onOpenEvidence} />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {profile.patterns && profile.patterns.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">{t('analyze.designDna.patterns')}</h3>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {profile.patterns.map((pattern) => (
                  <article key={pattern.id} className="rounded-xl border border-border/60 bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{pattern.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{pattern.role}</p>
                      </div>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        {t('analyze.designDna.sourceInstances', { count: pattern.sourceInstances })}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {[
                        ...pattern.structureRules,
                        ...pattern.visualRules,
                        ...pattern.interactionRules,
                        ...pattern.responsiveRules,
                      ].map((claim, index) => (
                        <ClaimCard key={index} claim={claim} onOpenEvidence={onOpenEvidence} />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-4 xl:grid-cols-3">
            {(['preserve', 'adapt', 'avoid'] as const).map((kind) => (
              <div key={kind} className="rounded-xl border border-border/60 bg-background p-4">
                <h3 className="text-sm font-semibold">{t(`analyze.designDna.${kind}`)}</h3>
                <div className="mt-3 space-y-3">
                  {profile.transferRules[kind].map((claim, index) => (
                    <ClaimCard key={index} claim={claim} onOpenEvidence={onOpenEvidence} />
                  ))}
                </div>
              </div>
            ))}
          </section>

          {profile.uncertainties.length > 0 && (
            <section className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <h3 className="text-sm font-semibold">{t('analyze.designDna.uncertainties')}</h3>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                {profile.uncertainties.map((item) => (
                  <li key={`${item.topic}-${item.reason}`}>
                    <span className="font-medium text-foreground">{item.topic}:</span> {item.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {result.reconstructionBrief && (
        <button
          type="button"
          onClick={() => copyText(result.reconstructionBrief || '')}
          className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Copy size={12} />
          {t('analyze.designDna.copyBrief')}
        </button>
      )}

      {profile && result.analysisId && (
        <section className="rounded-xl border border-border/60 bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{t('analyze.designDna.validation')}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t('analyze.designDna.validationHelp')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['workflow', 'content', 'states'] as const).map((scenario) => (
                <button
                  key={scenario}
                  type="button"
                  disabled={validating}
                  onClick={() => generateValidation(scenario)}
                  className="rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {t(`analyze.designDna.scenarios.${scenario}`)}
                </button>
              ))}
            </div>
          </div>
          {validating && (
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />
              {t('progress.validatingDesignLanguage')}
            </p>
          )}
          {validationReport && (
            <div className="mt-4">
              <ValidationReportPanel report={validationReport} tokens={result.tokens as unknown as DesignToken} />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
