import type { ColorRenameProposal } from '../analyzer/token-renamer.js'
import type { DesignToken } from '../analyzer/types.js'
import type { DesignEvidence } from '../design-evidence/types.js'

export type Confidence = 'high' | 'medium' | 'low'
export type IntelligenceInputMode = 'multimodal' | 'structural-only'
export type AnalysisCapabilityLevel = 'evidence-only' | 'structural-ai' | 'multimodal-ai' | 'evidence-fallback'
export type DesignIntelligenceStatus =
  'not-configured' | 'not-requested' | 'pending' | 'complete' | 'partial' | 'failed' | 'skipped' | 'unsupported'

export interface AiModelCapabilities {
  text: boolean
  vision: boolean
  structuredOutput: boolean
  imageInputMethod?: 'inline-base64' | 'file-reference'
  maxImages?: number
}

export interface DesignIntelligenceMeta {
  status: DesignIntelligenceStatus
  capabilityLevel: AnalysisCapabilityLevel
  inputMode?: IntelligenceInputMode
  provider?: string
  model?: string
  generatedAt?: string
  schemaVersion?: string
  promptVersion?: string
  inputFingerprint?: string
  inputImageCount?: number
  tokenUsage?: {
    input?: number
    output?: number
  }
  callDetails?: Array<{
    pass: string
    input?: number
    output?: number
  }>
  failureCode?: string
  failureReason?: string
  rejected?: string[]
  pendingChoice?: 'model-no-vision'
  pipeline?: 'single-pass' | 'two-pass'
}

export interface SectionObservation {
  sectionId: string
  structure: string
  visualRelations: string
  states: string
  limitations: string
  evidenceIds: string[]
}

export interface EvidenceRef {
  evidenceId: string
  note: string
}

export interface DesignClaim {
  statement: string
  implementation: string
  confidence: Confidence
  evidence: EvidenceRef[]
  tokenRefs?: string[]
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

export interface DesignProfile {
  schemaVersion: '1'
  language: 'en' | 'zh-CN'
  inputMode: IntelligenceInputMode
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
  tokenAliases?: ColorRenameProposal[]
}

export type AiSafeDesignEvidence = Omit<
  DesignEvidence,
  | 'pages'
  | 'components'
  | 'layoutNodes'
  | 'sections'
  | 'interactionObservations'
  | 'interactionStyles'
  | 'responsiveObservations'
  | 'mediaLayers'
> & {
  pages: Array<{
    id: string
    url: string
    viewport: string
    role?: string
    imageIds: string[]
  }>
  sections: Array<Omit<DesignEvidence['sections'][number], 'evidenceRefs'> & { evidenceRefs?: string[] }>
  components: Array<{
    id: string
    sectionId: string
    type: string
    role?: string
    tokenRefs: string[]
  }>
  layoutNodes: Array<{
    id: string
    sectionId: string
    role: string
    textRole?: string
    tokenRefs: string[]
    traits: string[]
  }>
  interactionStyles: {
    hover: unknown[]
    focus: unknown[]
    active: unknown[]
    disabled?: unknown[]
  }
  interactionObservations: Array<{
    id: string
    sectionId: string
    driver: string
    safety: string
    trigger: { kind: string; threshold?: string }
    changedProperties: string[]
    transition?: { duration?: string; easing?: string; properties?: string[] }
  }>
  responsiveObservations: Array<Omit<DesignEvidence['responsiveObservations'][number], 'evidenceRefs'>>
  mediaLayers: Array<{
    id: string
    sectionId: string
    role: string
    layoutMode?: string
  }>
}

export interface EvidencePackage {
  schemaVersion: '1'
  analysisId: string
  inputMode: IntelligenceInputMode
  selectedPageIds: string[]
  selectedSectionIds: string[]
  imageIds: string[]
  evidence: AiSafeDesignEvidence
  omittedEvidence: Array<{
    kind: string
    reason: 'budget' | 'privacy' | 'unsupported' | 'unsafe'
  }>
}

export interface AgentContextBundle {
  task: string
  capabilityLevel: AnalysisCapabilityLevel
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

export type ValidationFailureLayer = 'evidence' | 'interpretation' | 'generation'
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
  generatedAt: string
  capabilityLevel: AnalysisCapabilityLevel
  recipe: ValidationRecipe
  checks: ValidationCheck[]
}

export interface DesignIntelligenceResult {
  profile: DesignProfile | null
  meta: DesignIntelligenceMeta
  reconstructionBrief?: string
  agentContext?: AgentContextBundle
  validationReport?: ValidationReport
  tokens?: DesignToken
}
