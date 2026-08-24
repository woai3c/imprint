import { ExternalLink, Loader2 } from 'lucide-react'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { DesignToken } from '../../../core/analyzer/types'
import { formatRecipeVariant } from '../../../core/design-context/component-recipe-label'
import type {
  DesignClaim,
  DesignProfile,
  DesignTransferGrammar,
  ValidationReport,
} from '../../../core/design-context/types'
import type { AnalysisResultData } from '../../stores/analysis-store'
import { useFeedbackStore } from '../../stores/feedback-store'
import { DesignEvidencePanel } from './DesignEvidencePanel'
import { ValidationReportPanel } from './ValidationReportPanel'

interface DesignDnaPanelProps {
  result: AnalysisResultData
  onResultUpdate?: (result: Partial<AnalysisResultData>) => void
  onOpenEvidence?: (evidenceId: string) => void
}

function EvidenceLink({ evidenceId, onOpen }: { evidenceId: string; onOpen?: (evidenceId: string) => void }) {
  const { t } = useTranslation()
  return (
    <button
      data-testid="design-evidence-link"
      type="button"
      onClick={() => onOpen?.(evidenceId)}
      disabled={!onOpen}
      className="inline-flex max-w-full items-center gap-1 rounded bg-secondary px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      <span>{t('analyze.designDna.transfer.viewEvidence')}</span>
      {onOpen && <ExternalLink size={12} className="shrink-0" />}
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
    <article className="design-claim-card rounded-lg border border-border/60 bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <p className="design-claim-title mb-1 text-xs font-semibold">{title}</p>}
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
      <p className="design-claim-implementation mt-2 text-xs leading-5 text-muted-foreground">{claim.implementation}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {claim.evidence.map((reference) => (
          <EvidenceLink key={reference.evidenceId} evidenceId={reference.evidenceId} onOpen={onOpenEvidence} />
        ))}
      </div>
    </article>
  )
}

function TransferGrammarOverview({
  grammar,
  uncertainties,
  onOpenEvidence,
}: {
  grammar: DesignTransferGrammar
  uncertainties: DesignProfile['uncertainties']
  onOpenEvidence?: (evidenceId: string) => void
}) {
  const { t } = useTranslation()
  const p1Recipes = grammar.componentRecipes.filter((recipe) => recipe.priority === 'P1')
  const p2Recipes = grammar.componentRecipes.filter((recipe) => recipe.priority === 'P2')
  const term = (kind: 'components' | 'variants' | 'categories', value: string) =>
    t(`analyze.designDna.transfer.${kind}.${value}`, { defaultValue: value })
  const recipeVariant = (recipe: DesignTransferGrammar['componentRecipes'][number]) =>
    formatRecipeVariant(recipe, {
      translateKnown: (variant) => t(`analyze.designDna.transfer.variants.${variant}`, { defaultValue: '' }) || null,
      translateFallback: (variant) => term('variants', variant),
      formatRadius: (value) => t('analyze.designDna.transfer.variants.radius', { value }),
      separator: ' · ',
    })

  return (
    <>
      <section>
        <h3 className="text-base font-semibold">{t('analyze.designDna.transfer.title')}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('analyze.designDna.transfer.description')}</p>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{t('analyze.designDna.transfer.p0')}</h3>
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            {t('analyze.designDna.transfer.p0Badge')}
          </span>
        </div>
        {grammar.coreRules.length > 0 ? (
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {grammar.coreRules.map((item) => (
              <article
                key={`${item.category}-${item.claim.catalogId || item.claim.statement}`}
                className="rounded-xl border border-border/60 bg-background p-4"
              >
                <p className="text-xs font-semibold text-muted-foreground">{term('categories', item.category)}</p>
                <p className="mt-2 text-sm leading-6">{item.claim.statement}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.claim.implementation}</p>
                {item.claim.evidence[0] && (
                  <div className="mt-3">
                    <EvidenceLink evidenceId={item.claim.evidence[0].evidenceId} onOpen={onOpenEvidence} />
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm leading-6 text-muted-foreground">
            {t('analyze.designDna.transfer.noP0')}
          </p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold">{t('analyze.designDna.transfer.coordinates')}</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {grammar.styleCoordinates.map((coordinate) => (
            <article key={coordinate.dimension} className="rounded-lg border border-border/60 bg-background p-3">
              <p className="text-xs text-muted-foreground">{term('categories', coordinate.dimension)}</p>
              <p className="mt-1 text-sm font-semibold">
                {t(`analyze.designDna.transfer.priorityLabels.${coordinate.priority}`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{t('analyze.designDna.transfer.p1')}</h3>
          <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">
            {t('analyze.designDna.transfer.p1Badge')}
          </span>
        </div>
        {p1Recipes.length > 0 ? (
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {p1Recipes.map((recipe) => (
              <article
                key={`${recipe.component}-${recipe.variant}`}
                className="rounded-xl border border-border/60 bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {term('components', recipe.component)} · {recipeVariant(recipe)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('analyze.designDna.transfer.instances', { count: recipe.sourceInstances })}
                    </p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">
                    {t(`analyze.designDna.confidence.${recipe.confidence}`)}
                  </span>
                </div>
                <dl className="mt-3 space-y-2 text-xs leading-5">
                  <div>
                    <dt className="font-medium text-foreground">{t('analyze.designDna.transfer.useWhen')}</dt>
                    <dd className="text-muted-foreground">
                      {t(`analyze.designDna.transfer.useWhenValues.${recipe.useWhen}`)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">{t('analyze.designDna.transfer.observed')}</dt>
                    <dd className="text-muted-foreground">{recipe.observed.statement}</dd>
                  </div>
                  {(recipe.states.length > 0 || recipe.responsive.length > 0) && (
                    <div>
                      <dt className="font-medium text-foreground">{t('analyze.designDna.transfer.coverage')}</dt>
                      <dd className="text-muted-foreground">
                        {t('analyze.designDna.transfer.coverageValue', {
                          states: recipe.states.length,
                          responsive: recipe.responsive.length,
                        })}
                      </dd>
                    </div>
                  )}
                </dl>
                {recipe.observed.evidence[0] && (
                  <div className="mt-3">
                    <EvidenceLink evidenceId={recipe.observed.evidence[0].evidenceId} onOpen={onOpenEvidence} />
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('analyze.designDna.transfer.noP1')}</p>
        )}
      </section>

      <details className="rounded-xl border border-border/60 bg-background p-4">
        <summary className="cursor-pointer text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring">
          {t('analyze.designDna.transfer.p2Summary', {
            rules: grammar.localRules.length,
            recipes: p2Recipes.length,
            unknowns: uncertainties.length,
          })}
        </summary>
        <div className="mt-4 space-y-3">
          {grammar.localRules.map((item) => (
            <article
              key={`${item.category}-${item.claim.catalogId || item.claim.statement}`}
              className="rounded-lg bg-secondary/30 p-3"
            >
              <p className="text-xs font-medium">{term('categories', item.category)}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.claim.statement}</p>
              {item.claim.evidence[0] && (
                <div className="mt-2">
                  <EvidenceLink evidenceId={item.claim.evidence[0].evidenceId} onOpen={onOpenEvidence} />
                </div>
              )}
            </article>
          ))}
          {p2Recipes.map((recipe) => (
            <article key={`${recipe.component}-${recipe.variant}`} className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs font-medium">
                {term('components', recipe.component)} · {recipeVariant(recipe)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{recipe.observed.statement}</p>
            </article>
          ))}
          {uncertainties.length > 0 && (
            <section className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <h4 className="text-xs font-semibold">{t('analyze.designDna.transfer.unknowns')}</h4>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                {uncertainties.map((item) => (
                  <li key={`${item.topic}-${item.reason}`}>
                    <span className="font-medium text-foreground">{item.topic}:</span> {item.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </details>
    </>
  )
}

export function DesignDnaPanel({ result, onResultUpdate, onOpenEvidence }: DesignDnaPanelProps) {
  const { t } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(result.validationReport || null)
  const [validating, setValidating] = useState(false)
  const profile = result.designProfile
  const evidence = result.designEvidence
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
      {!profile ? (
        <DesignEvidencePanel evidence={evidence} />
      ) : (
        <>
          {profile.transferGrammar ? (
            <TransferGrammarOverview
              grammar={profile.transferGrammar}
              uncertainties={profile.uncertainties}
              onOpenEvidence={onOpenEvidence}
            />
          ) : (
            <>
              <section>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('analyze.designDna.title')}
                </p>
                <div className="mt-3">
                  <ClaimCard
                    title={t('analyze.designDna.thesis')}
                    claim={profile.thesis}
                    onOpenEvidence={onOpenEvidence}
                  />
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
                      <article
                        key={`${component.component}-${index}`}
                        className="rounded-xl border border-border/60 p-3"
                      >
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
        </>
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
              {t('progress.validatingDesignRules')}
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
