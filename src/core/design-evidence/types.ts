import type { PageHealthReport } from '../analyzer/page-health.js'
import type { MotionToken, ResponsiveBreakpoint } from '../analyzer/responsive-motion.js'
import type { DesignToken, InteractionStyles } from '../analyzer/types.js'

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
  contentHash?: string
  visualHash?: string
  sourceRect?: NormalizedRect
  sectionId?: string
}

export interface EvidencePage {
  id: string
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
  tokenRefs: string[]
  observedTypography?: {
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
  evidenceRefs: string[]
}

export interface InteractionObservation {
  id: string
  pageId: string
  sectionId: string
  targetId: string
  driver: 'hover' | 'focus' | 'click' | 'disabled' | 'scroll' | 'time'
  safety: 'passive' | 'safe-active'
  trigger: {
    kind: string
    threshold?: string
  }
  before: Record<string, string>
  after: Record<string, string>
  changedProperties: string[]
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

export interface EvidenceCoverage {
  pageCoverage: 'complete' | 'partial'
  urlCoverage?: {
    requested: number
    captured: number
  }
  captureCoverage?: {
    expected: number
    captured: number
    status: 'complete' | 'partial'
    requestedViewports: string[]
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
  analysisId: string
  source: {
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
