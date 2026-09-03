export type Confidence = 'high' | 'medium' | 'low'
export const DESIGN_PROFILE_SCHEMA_VERSION = '3' as const
export type DesignProfileSchemaVersion = typeof DESIGN_PROFILE_SCHEMA_VERSION
export type DesignAssertionKind = 'evidence' | 'component' | 'section' | 'interaction' | 'responsive' | 'token'
export type DesignAssertionScope = 'instance' | 'page' | 'cross-page'

export interface EvidenceRef {
  evidenceId: string
  note: string
}

/**
 * Machine-readable claim semantics. Prose is presentation only in schema v3;
 * deterministic validation operates exclusively on these fields and evidence IDs.
 */
export interface DesignClaimAssertion {
  kind: DesignAssertionKind
  target: string
  predicate: string
  scope: DesignAssertionScope
  evidenceIds: string[]
  property?: string
  value?: string | number | boolean | string[]
}

export interface DesignClaim {
  statement: string
  implementation: string
  confidence: Confidence
  evidence: EvidenceRef[]
  tokenRefs?: string[]
  assertions?: DesignClaimAssertion[]
  source?: 'deterministic-catalog' | 'unavailable'
  catalogId?: string
}

export interface SignatureMove extends DesignClaim {
  id: string
  name: string
  distinctiveness: string
}

export interface PatternSpec {
  id: string
  name: string
  role: string
  structureRules: DesignClaim[]
  visualRules: DesignClaim[]
  interactionRules: DesignClaim[]
  responsiveRules: DesignClaim[]
  tokenRefs: string[]
  evidenceRefs: string[]
  sourceInstances: number
  confidence: Confidence
}

export type TransferPriority = 'P0' | 'P1' | 'P2'
export type TransferRuleCategory =
  'color' | 'typography' | 'shape' | 'surface' | 'density' | 'composition' | 'interaction' | 'responsive'

export type StyleCoordinateDimension = 'color' | 'typography' | 'shape' | 'surface' | 'density' | 'composition'

export interface PrioritizedDesignRule {
  priority: TransferPriority
  category: TransferRuleCategory
  claim: DesignClaim
}

export type ComponentRecipeUseWhen =
  | 'primary-action'
  | 'action'
  | 'text-entry'
  | 'search'
  | 'content-group'
  | 'navigation'
  | 'tab-navigation'
  | 'content-collection'
  | 'structured-data'
  | 'overlay-dialog'
  | 'status-feedback'
  | 'specialized'

export type ComponentRecipeRestriction =
  | 'keep-variant-scope'
  | 'do-not-globalize-special-shape'
  | 'do-not-promote-overlay-elevation'
  | 'do-not-invent-unobserved-state'
  | 'do-not-promote-local-layout'

export interface StyleCoordinate {
  dimension: StyleCoordinateDimension
  priority: 'P0' | 'P2'
  claim: DesignClaim
}

export interface ComponentRecipe {
  component: string
  variant: string
  priority: 'P1' | 'P2'
  useWhen: ComponentRecipeUseWhen
  observed: DesignClaim
  /** Bounded representative styles for component-scoped values that are not global tokens. */
  observedStyles?: Record<string, string>
  states: DesignClaim[]
  responsive: DesignClaim[]
  restrictions: ComponentRecipeRestriction[]
  /** Confidence that the observed elements have the stated component identity. */
  identityConfidence?: number
  /** Confidence that the representative complete style is reusable. */
  reuseConfidence?: number
  reuseScope?: 'isolated' | 'page-repeated' | 'cross-page'
  matchingStyleInstances?: number
  pageCount?: number
  /** Recipe confidence is based on reuse, not identity. */
  confidence: Confidence
  sourceInstances: number
}

/**
 * A bounded transfer grammar derived from the existing deterministic profile.
 * P0 contains reusable foundations, P1 contains conditional recipes, and P2
 * retains local facts without promoting them to global design rules.
 */
export interface DesignTransferGrammar {
  schemaVersion: '1'
  coreRules: PrioritizedDesignRule[]
  styleCoordinates: StyleCoordinate[]
  componentRecipes: ComponentRecipe[]
  localRules: PrioritizedDesignRule[]
}

export interface DesignProfile {
  schemaVersion: DesignProfileSchemaVersion
  language: 'en' | 'zh-CN'
  claimSource: 'deterministic-catalog'
  catalogVersion?: string
  thesis: DesignClaim
  signatureMoves: SignatureMove[]
  composition: {
    containerStrategy: DesignClaim
    alignmentStrategy: DesignClaim
    densityAndWhitespace: DesignClaim
    rhythm: DesignClaim
  }
  attention: {
    entryPoint: DesignClaim
    visualSequence: DesignClaim[]
    actionHierarchy: DesignClaim
    contrastStrategy: DesignClaim
  }
  visualLanguage: {
    color: DesignClaim
    typography: DesignClaim
    shape: DesignClaim
    surfaces: DesignClaim
    imagery?: DesignClaim
    motion?: DesignClaim
  }
  sectionGrammar: Array<{
    role: string
    composition: DesignClaim[]
    contentRhythm: DesignClaim[]
    transitionToNext: DesignClaim[]
  }>
  interactionLanguage: {
    primaryDrivers: DesignClaim[]
    feedbackStyle: DesignClaim
    stateChangeAmplitude: DesignClaim
    scrollNarrative?: DesignClaim
    continuityRules: DesignClaim[]
  }
  componentGrammar: Array<{
    component: string
    role: string
    rules: DesignClaim[]
  }>
  transferRules: {
    preserve: DesignClaim[]
    adapt: DesignClaim[]
    avoid: DesignClaim[]
  }
  uncertainties: Array<{
    topic: string
    reason: string
    neededEvidence?: string
  }>
  patterns?: PatternSpec[]
  transferGrammar?: DesignTransferGrammar
}

export function isCurrentDesignProfile(value: unknown): value is DesignProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<DesignProfile>
  return (
    profile.schemaVersion === DESIGN_PROFILE_SCHEMA_VERSION &&
    profile.claimSource === 'deterministic-catalog' &&
    profile.transferGrammar?.schemaVersion === '1'
  )
}

export type DesignClaimSingletonSlot =
  | 'thesis'
  | 'composition.container'
  | 'composition.alignment'
  | 'composition.density'
  | 'composition.rhythm'
  | 'attention.entry'
  | 'attention.action'
  | 'attention.contrast'
  | 'visual.color'
  | 'visual.typography'
  | 'visual.shape'
  | 'visual.surfaces'
  | 'interaction.feedback'
  | 'interaction.amplitude'

export type DesignClaimCatalogPlacement =
  | { kind: 'singleton'; slot: DesignClaimSingletonSlot }
  | { kind: 'signature' }
  | { kind: 'attention-sequence' }
  | { kind: 'visual'; slot: 'imagery' | 'motion' }
  | { kind: 'section'; role: string; bucket: 'composition' | 'contentRhythm' | 'transitionToNext' }
  | { kind: 'interaction'; bucket: 'driver' | 'scrollNarrative' | 'continuity' }
  | { kind: 'component'; component: string; role: string }
  | { kind: 'transfer'; bucket: 'preserve' | 'adapt' | 'avoid' }

export interface DesignClaimCatalogEntry {
  id: string
  placements: DesignClaimCatalogPlacement[]
  claim: DesignClaim
  title?: string
  distinctiveness?: string
}

export interface DesignClaimCatalog {
  schemaVersion: '1'
  catalogVersion: string
  language: 'en' | 'zh-CN'
  claims: DesignClaimCatalogEntry[]
  uncertainties: DesignProfile['uncertainties']
}

export interface AgentContextBundle {
  task: string
  designThesis?: string
  applicableRules: string[]
  tokenSubset: Record<string, string>
  relevantPatternIds: string[]
  responsiveRules: string[]
  interactionRules: string[]
  avoid: string[]
  evidenceSummary: string[]
  limitations: string[]
}

export interface ValidationRecipe {
  title: string
  scenario: 'workflow' | 'content' | 'states'
  ruleRefs: string[]
  root: ValidationNode
}

export type ValidationNode =
  | { type: 'stack'; gap: string; children: ValidationNode[] }
  | { type: 'grid'; columns: number; gap: string; children: ValidationNode[] }
  | { type: 'surface'; variant: string; children: ValidationNode[] }
  | { type: 'text'; role: 'display' | 'heading' | 'body' | 'label'; contentKey: string }
  | { type: 'button'; variant: 'primary' | 'secondary'; labelKey: string }
  | { type: 'field'; state?: 'default' | 'focus' | 'error' }

export type ValidationFailureLayer = 'evidence' | 'rule' | 'rendering'
export type ValidationCheckStatus = 'passed' | 'partial' | 'failed' | 'unknown'

export interface ValidationCheck {
  id: string
  rule: string
  status: ValidationCheckStatus
  deterministicResult: string
  previewRef?: string
  suggestion?: string
  failureLayer?: ValidationFailureLayer
}

export interface ValidationReport {
  schemaVersion: '1'
  recipe: ValidationRecipe
  checks: ValidationCheck[]
}
