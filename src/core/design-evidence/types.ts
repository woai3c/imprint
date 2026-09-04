import type {
  ComponentSemanticIdentity,
  ComponentStatusBoundary,
  ComponentUsageContext,
  ComponentVisualTreatment,
} from '../analyzer/component-detect.js'
import type { PageHealthReport } from '../analyzer/page-health.js'
import type { MotionToken, ResponsiveBreakpoint } from '../analyzer/responsive-motion.js'
import type { DesignToken, InteractionStyles, RenderedTextPaintEvidence } from '../analyzer/types.js'

export type PageRole = 'landing' | 'content' | 'product' | 'pricing' | 'profile' | 'account' | 'workspace' | 'unknown'
export type SectionRole =
  'header' | 'navigation' | 'hero' | 'content' | 'feature-group' | 'media' | 'action' | 'aside' | 'footer' | 'unknown'
export type LayoutMode = 'flow' | 'sticky' | 'fixed' | 'overlay'

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export interface EvidenceImage {
  id: string
  kind: 'overview' | 'viewport-crop' | 'region-crop'
  path: string
  width: number
  height: number
  /** Wall-clock time after the encoded pixels were written. */
  capturedAt?: string
  contentHash?: string
  visualHash?: string
  sourceRect?: NormalizedRect
  sectionId?: string
}

export interface EvidencePage {
  id: string
  /** Internal capture transaction identity. Analyzer-built values are non-enumerable and never exported. */
  captureKey?: string
  /** Opaque document identity retained when public URL sanitization removes query text. */
  routeId?: string
  url: string
  viewport: string
  title?: string
  siteName?: string
  role?: PageRole
  viewportWidth?: number
  viewportHeight?: number
  contentWidth?: number
  contentHeight?: number
  horizontalOverflow?: boolean
  horizontalOverflowSources?: Array<{
    locator: string
    overflowPx: number
    width: number
    position: string
    sectionId?: string
    sectionRole?: SectionRole
  }>
  health?: PageHealthReport
  images: EvidenceImage[]
}

export interface ComponentTextStyleSource extends Omit<RenderedTextPaintEvidence, 'kind'> {
  kind: 'direct-text' | 'descendant-text' | 'native-value' | 'native-placeholder' | 'native-selection'
}

export interface TopologyPage {
  pageId: string
  role: PageRole
  sectionIds: string[]
}

export interface TopologyLayer {
  id: string
  pageId: string
  role: 'navigation' | 'overlay' | 'background' | 'progress' | 'other'
  layoutMode: LayoutMode
  evidenceRefs: string[]
}

export interface PageTopology {
  schemaVersion: '1'
  pages: TopologyPage[]
  globalLayers: TopologyLayer[]
  crossPagePatternIds: string[]
}

export interface SectionEvidence {
  id: string
  pageId: string
  order: number
  role: SectionRole
  rect: NormalizedRect
  layoutMode: LayoutMode
  parentSectionId?: string
  tokenRefs: string[]
  componentRefs: string[]
  interactionRefs: string[]
  mediaLayerRefs: string[]
  evidenceRefs: string[]
  observedStyles?: {
    backgroundColor?: string
    borderRadius?: string
    gradient?: SectionGradientEvidence
    layout?: Record<string, string>
    borders?: Record<string, string>
    boxShadow?: string
  }
}

export interface SectionGradientEvidence {
  type:
    | 'linear-gradient'
    | 'radial-gradient'
    | 'conic-gradient'
    | 'repeating-linear-gradient'
    | 'repeating-radial-gradient'
    | 'repeating-conic-gradient'
  direction?: string
  stops: string[]
  value: string
}

export interface ComponentEvidence {
  id: string
  pageId: string
  sectionId: string
  type: string
  elementKind?: 'button' | 'anchor' | 'input' | 'role-button' | 'status'
  role?: string
  semanticIdentity?: ComponentSemanticIdentity
  visualTreatment?: ComponentVisualTreatment
  usageContext?: ComponentUsageContext
  visualOwnerKey?: string
  semanticSourceKey?: string
  /** Where the rendered foreground and typography in `styles` were measured. */
  textStyleOwner?: 'root' | 'descendant'
  /** Observable facts proving that the typography source was visibly painted at capture time. */
  textStyleSource?: ComponentTextStyleSource
  statusBoundary?: ComponentStatusBoundary
  rect: NormalizedRect
  styles: Record<string, string>
  tokenRefs: string[]
  stateRefs: string[]
  confidence: number
  evidenceRefs: string[]
}

export interface LayoutEvidenceNode {
  id: string
  pageId: string
  sectionId: string
  role:
    | 'header'
    | 'navigation'
    | 'hero'
    | 'section'
    | 'heading'
    | 'body'
    | 'media'
    | 'action'
    | 'card-group'
    | 'footer'
    | 'unknown'
  rect: NormalizedRect
  parentId?: string
  textRole?: 'display' | 'heading' | 'body' | 'label' | 'metadata'
  /** Observable facts proving that `observedTypography` came from visibly painted text. */
  textStyleSource?: ComponentTextStyleSource
  tokenRefs: string[]
  observedTypography?: {
    color?: string
    fontFamily?: string
    fontSize?: string
    fontWeight?: string
    lineHeight?: string
  }
  observedStyles?: Record<string, string>
  traits: string[]
}

export interface PseudoElementEvidence {
  id: string
  pageId: string
  sectionId: string
  target: string
  kind: 'before' | 'after' | 'first-letter'
  styles: Record<string, string>
  paint?: PseudoElementPaintEvidence
  evidenceRefs: string[]
}

export interface PseudoElementPaintEvidence {
  widthPx: number
  heightPx: number
  xPx: number
  yPx: number
  captureWidthPx: number
  captureHeightPx: number
  visibleWidthPx: number
  visibleHeightPx: number
  paintedAreaPx: number
  captureIntersectionRatio: number
  opacity: number
  filterOpacity: number
  filterChain: Array<{ value: string; owner: 'self' | 'ancestor' | 'paint' }>
  /** Always empty because masked pseudo paint is conservatively excluded. */
  maskChain: Array<{ value: string; owner: 'self' | 'ancestor' | 'paint' }>
  /** Always empty because non-normal blending makes pseudo paint backdrop-dependent. */
  blendChain: Array<{ value: string; owner: 'self' | 'ancestor' | 'paint' }>
}

export interface InteractionObservation {
  id: string
  pageId: string
  sectionId: string
  targetId: string
  targetKind?: 'component' | 'section' | 'page'
  driver: 'hover' | 'focus' | 'click' | 'disabled' | 'scroll' | 'time'
  safety: 'passive' | 'safe-active'
  trigger: {
    kind: string
    threshold?: string
  }
  before: Record<string, string>
  after: Record<string, string>
  changedProperties: string[]
  source?: 'computed-probed' | 'declared-applicable'
  selector?: string
  transition?: {
    duration?: string
    easing?: string
    properties?: string[]
  }
  evidenceRefs: string[]
}

export interface ResponsiveSectionObservation {
  id: string
  sectionId: string
  fromViewport: string
  toViewport: string
  changeType: 'scale' | 'reflow' | 'reorder' | 'visibility' | 'interaction' | 'mixed'
  changedProperties: string[]
  changes?: Record<string, { from?: string | number; to?: string | number }>
  summary: string
  evidenceRefs: string[]
}

export interface MediaLayerEvidence {
  id: string
  pageId: string
  sectionId: string
  kind: 'image' | 'video' | 'svg' | 'canvas' | 'css-background'
  role: 'ambient' | 'narrative' | 'product' | 'decorative' | 'icon' | 'unknown'
  roleEvidence?: MediaRoleEvidence
  importance: 'major' | 'supporting' | 'icon'
  rect: NormalizedRect
  zIndex?: string
  objectFit?: string
  objectPosition?: string
  opacity?: string
  filter?: string
  blendMode?: string
  naturalSize?: { width: number; height: number }
  hasResponsiveSources?: boolean
}

export type MediaRoleEvidence =
  | 'importance-icon'
  | 'css-background-area'
  | 'structured-product-semantics'
  | 'accessible-non-decorative'
  | 'media-element'
  | 'figure-semantics'
  | 'presentation-semantics'
  | 'large-visual'
  | 'positioned-visual'
  | 'unknown'

export interface EvidenceCoverage {
  pageCoverage: 'complete' | 'partial'
  urlCoverage?: {
    requested: number
    captured: number
  }
  captureCoverage?: {
    /** Adaptive capture plan completion, not the full URL × viewport matrix. */
    expected: number
    captured: number
    status: 'complete' | 'partial'
    requestedViewports: string[]
    fullMatrix?: {
      expected: number
      captured: number
      status: 'complete' | 'partial'
    }
    responsivePairs?: {
      expectedUrls: number
      capturedUrls: number
      status: 'complete' | 'partial'
    }
  }
  assetCoverage?: {
    expected: number
    valid: number
    status: 'complete' | 'partial'
    issueCount: number
  }
  sectionCoverage: number
  viewportCoverage: string[]
  interactionCoverage: {
    candidates: number
    safelyObserved: number
    skipped: number
  }
  mediaCoverage: {
    majorRegions: number
    classifiedRegions: number
    iconRegions: number
  }
  accessRestrictions: string[]
  limitations: string[]
}

export interface DesignEvidence {
  schemaVersion: '1'
  /** Version of the owner-first semantic evidence envelope used to build portable tokens and component contracts. */
  semanticOwnerVersion?: '1'
  analysisId: string
  source: {
    /** Opaque identity of the entry document, retained when public URL sanitization removes query text. */
    routeId?: string
    requestedUrl: string
    finalUrl: string
    accessMode: 'anonymous' | 'managed'
    language?: string
    title?: string
    siteName?: string
  }
  pages: EvidencePage[]
  tokens: DesignToken
  featureTags: string[]
  deterministicClaims?: DeterministicClaim[]
  topology: PageTopology
  sections: SectionEvidence[]
  components: ComponentEvidence[]
  layoutNodes: LayoutEvidenceNode[]
  pseudoElements?: PseudoElementEvidence[]
  interactionStyles: InteractionStyles
  interactionObservations: InteractionObservation[]
  breakpoints: ResponsiveBreakpoint[]
  responsiveObservations: ResponsiveSectionObservation[]
  motion: MotionToken[]
  mediaLayers: MediaLayerEvidence[]
  coverage: EvidenceCoverage
  limitations: string[]
  techStack?: TechStackInfo
}

export interface DeterministicClaim {
  label: string
  confidence: 'high' | 'medium' | 'low'
  reasons: string[]
  evidenceRefs: string[]
  provenance: Array<{
    source: 'color-role-observation' | 'section-observation' | 'component-observation' | 'token-usage'
    ref: string
  }>
}

export interface TechStackInfo {
  frameworks: string[]
  uiLibraries: string[]
  cssApproach: string[]
  bundler?: string
  icons?: string
}
