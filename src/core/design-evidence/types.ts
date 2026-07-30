import type { MotionToken, ResponsiveBreakpoint } from '../analyzer/responsive-motion.js'
import type { DesignToken, InteractionStyles } from '../analyzer/types.js'

export type PageRole = 'landing' | 'content' | 'product' | 'pricing' | 'account' | 'unknown'
export type SectionRole =
  'header' | 'navigation' | 'hero' | 'content' | 'feature-group' | 'media' | 'action' | 'footer' | 'unknown'
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
  sourceRect?: NormalizedRect
}

export interface EvidencePage {
  id: string
  url: string
  viewport: string
  role?: PageRole
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
}

export interface ComponentEvidence {
  id: string
  pageId: string
  sectionId: string
  type: string
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
  traits: string[]
}

export interface InteractionObservation {
  id: string
  pageId: string
  sectionId: string
  targetId: string
  driver: 'hover' | 'focus' | 'click' | 'scroll' | 'time'
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
  summary: string
  evidenceRefs: string[]
}

export interface MediaLayerEvidence {
  id: string
  pageId: string
  sectionId: string
  kind: 'image' | 'video' | 'svg' | 'canvas' | 'css-background'
  role: 'ambient' | 'narrative' | 'product' | 'decorative' | 'icon' | 'unknown'
  rect: NormalizedRect
  zIndex?: string
  objectFit?: string
  objectPosition?: string
  opacity?: string
  filter?: string
  blendMode?: string
}

export interface EvidenceCoverage {
  pageCoverage: 'complete' | 'partial'
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
  }
  pages: EvidencePage[]
  tokens: DesignToken
  featureTags: string[]
  topology: PageTopology
  sections: SectionEvidence[]
  components: ComponentEvidence[]
  layoutNodes: LayoutEvidenceNode[]
  interactionStyles: InteractionStyles
  interactionObservations: InteractionObservation[]
  breakpoints: ResponsiveBreakpoint[]
  responsiveObservations: ResponsiveSectionObservation[]
  motion: MotionToken[]
  mediaLayers: MediaLayerEvidence[]
  coverage: EvidenceCoverage
  limitations: string[]
}
