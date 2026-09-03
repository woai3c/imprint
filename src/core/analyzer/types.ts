import type { DesignEvidence } from '../design-evidence/types.js'
import type { AuthWallDetection } from './auth-wall.js'
import type { ComponentPattern } from './component-detect.js'
import type { PageDiscoveryMode, PageKind } from './page-discovery.js'
import type { MotionToken, ResponsiveBreakpoint } from './responsive-motion.js'

export type AuthMode = 'auto' | 'anonymous' | 'managed'
export type LoginDecision = 'continue' | 'anonymous' | 'cancel'

export interface LoginRequest {
  detection: AuthWallDetection
  retry: boolean
}

export interface AnalysisOptions {
  viewports?: string[]
  maxPages?: number
  useSession?: boolean
  authMode?: AuthMode
  extractDarkMode?: boolean
  depth?: 'standard' | 'deep'
  pageDiscovery?: PageDiscoveryMode
  dataDir: string
  browserResourcesDir?: string
  browserPath?: string
  proxyServer?: string
  toolVersion?: string
  signal?: AbortSignal
  finishSignal?: AbortSignal
  onLoginRequired?: (request: LoginRequest, signal: AbortSignal) => Promise<LoginDecision>
}

export interface CaptureViewportManifest {
  name: string
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
}

export interface CaptureViewportEnvironment extends CaptureViewportManifest {
  source: 'requested' | 'adaptive'
  emulationProfile: 'browser-default' | 'pixel-7-android-13'
  userAgent: string
}

export interface CaptureManifest {
  schemaVersion: '1'
  capturedAt: string
  tool: {
    name: 'imprint'
    version: string | null
  }
  request: {
    schemaVersion?: '1' | '2'
    viewports: CaptureViewportManifest[]
    pageMode?: 'auto' | 'bounded'
    maxPages: number | null
    pageDiscovery: PageDiscoveryMode
    depth: 'standard' | 'deep'
    accessMode: 'anonymous' | 'managed'
  }
  environment: {
    platform: string
    architecture: string
    browser: {
      engine: 'chromium'
      product: 'chrome' | 'edge' | 'chromium' | 'unknown'
      version: string | null
      userAgent: string
      headless: boolean
    }
    locale: string
    languages: string[]
    timezone: string
    colorScheme: 'light' | 'dark' | 'no-preference'
    reducedMotion: 'reduce' | 'no-preference'
    deviceScaleFactor: number
    viewports: CaptureViewportEnvironment[]
  }
  stabilization: {
    strategyVersion: '1'
    pageHealthRecorded: true
    animationFreeze: {
      eligibleCaptures: number
      attemptedCaptures: number
      succeededCaptures: number
      failedCaptures: number
      coverage: 'complete' | 'partial' | 'none'
    }
    fontsReady: boolean
  }
  capture: {
    pageKeys: string[]
    pages: {
      requested: number | null
      discovered: number
      selected: number
      analyzed: number
    }
    expected: number
    captured: number
    status: 'complete' | 'partial'
    coverageLimitations: string[]
  }
  limitations: string[]
}

export interface PageScreenshot {
  /** Opaque document identity retained when public URL sanitization removes query text. */
  routeId?: string
  url: string
  path: string
  viewport: string
  width?: number
  height?: number
  /** Wall-clock time after the encoded pixels were written. */
  capturedAt?: string
  /** False when the encoded image does not match the intended capture geometry; dimensions may still bound a crop. */
  valid?: boolean
}

export interface ExtractedStyles {
  colors: string[]
  fontFamilies: string[]
  fontSizes: string[]
  fontWeights: string[]
  lineHeights: string[]
  letterSpacings: string[]
  spacings: string[]
  radii: string[]
  shadows: string[]
  borders: string[]
  cssVariables: Record<string, string>
  backgroundColors: string[]
  textColors: string[]
  zIndices: string[]
  transitions: string[]
  usageCount: Record<string, number>
  /** Distinct rendered DOM owners per usage key. Unlike usageCount, aliases, box sides, and text length count once. */
  usageOwnerCounts?: Record<string, number>
  /** Stable page-local DOM identities used to de-duplicate one element across captures and related usage categories. */
  usageOwnerIds?: Record<string, string[]>
  /** Number of distinct normalized URL groups that observed each usage key during token selection. */
  usageGroupCounts?: Record<string, number>
  valueSources?: Record<string, string[]>
  /** Per-value source frequencies retained for scope-aware token promotion. */
  valueSourceCounts?: Record<string, Record<string, number>>
  /** Stable page-local owners for each exact value/source pair. Older stored analyses may omit this field. */
  valueSourceOwnerIds?: Record<string, Record<string, string[]>>
  colorRoleObservations?: ColorRoleObservation[]
  textColorPairObservations?: TextColorPairObservation[]
  /** Bounded provenance for text owners that contribute rendered typography or foreground usage. */
  renderedTextStyleObservations?: RenderedTextStyleObservation[]
}

export interface RenderedTextClipPathEvidence {
  value: string
  widthPx: number
  heightPx: number
  owner: 'self' | 'ancestor'
}

export interface RenderedTextFilterEvidence {
  value: string
  owner: 'self' | 'ancestor' | 'paint'
}

export interface RenderedTextMaskEvidence {
  value: string
  owner: 'self' | 'ancestor' | 'paint'
}

export interface RenderedTextBlendEvidence {
  value: string
  owner: 'self' | 'ancestor' | 'paint'
}

export interface RenderedTextRectEvidence {
  xPx: number
  yPx: number
  widthPx: number
  heightPx: number
}

export interface RenderedTextPaintEvidence {
  kind: 'direct-text'
  widthPx: number
  heightPx: number
  visibleWidthPx: number
  visibleHeightPx: number
  paintedAreaPx: number
  captureIntersectionRatio: number
  effectiveClipPathAreaRatio: number
  ancestorClipCount: number
  clientRectCount: number
  glyphRectCount: number
  /** Final rectangular paint region after capture bounds, overflow, paint containment, and supported clip paths. */
  visibleBounds: RenderedTextRectEvidence
  /** Bounded intersections between actual glyph client rects and `visibleBounds`; empty only for native controls. */
  visibleGlyphRects: RenderedTextRectEvidence[]
  /** Area covered by the bounded visible-glyph intersections above. */
  visibleGlyphAreaPx: number
  /**
   * Conservative usable text box for native controls whose glyph client rects are unavailable. Native text is
   * accepted only when this complete box is inside `visibleBounds`; direct DOM text must omit it.
   */
  nativeTextBounds?: RenderedTextRectEvidence
  /** Traceable origin for native-control text whose glyph rectangles are not browser-exposed. */
  nativeTextOrigin?: 'explicit-value' | 'placeholder' | 'selection' | 'user-agent-default'
  /** Complete bounded chain of supported rectangular clip paths affecting this text owner. */
  clipPathChain: RenderedTextClipPathEvidence[]
  /** Current extraction omits text under non-rectangular clips because glyph intersection cannot be proven. */
  nonRectangularClipPathCount: number
  clip: string
  clipPath: string
  contentVisibility: string
  opacity: number
  /** Product of every CSS `filter: opacity(...)` contribution affecting the painted glyphs. */
  filterOpacity: number
  /** Bounded filter provenance used to independently reconstruct `filterOpacity`. */
  filterChain: RenderedTextFilterEvidence[]
  /** Always empty: text under any CSS mask is conservatively excluded because its painted alpha is not auditable. */
  maskChain: RenderedTextMaskEvidence[]
  /** Always empty: non-normal blend modes make the observed glyph color depend on the compositing backdrop. */
  blendChain: RenderedTextBlendEvidence[]
  textIndentPx: number
  filter: string
  glyphPaintKind: 'solid-color' | 'background-clip'
  foreground?: string
  backgroundClip?: string
  backgroundImage?: string
}

export interface RenderedTextStyleObservation {
  ownerId: string
  textRole: 'body' | 'heading' | 'label' | 'other'
  styles: {
    color?: string
    backgroundColor?: string
    fontFamily: string
    fontSize: string
    fontWeight: string
    lineHeight: string
    letterSpacing: string
  }
  source: RenderedTextPaintEvidence
}

export interface TextColorPairObservation {
  captureId: string
  background: string
  foreground: string
  textRole: 'body' | 'heading' | 'label' | 'other'
  count: number
  /** Stable page-local rendered text owners. Older stored observations may expose only count. */
  ownerIds?: string[]
}

export interface ColorRoleObservation {
  captureId: string
  /** Normalized URL identity used during token selection. Raw extractor observations omit it. */
  selectionGroup?: string
  /** Token-selection weight after repeated captures and elements of one URL are normalized. */
  selectionWeight?: number
  background?: string
  foreground?: string
  borderColor?: string
  elementRef: string
  elementKind: 'button' | 'anchor' | 'input' | 'role-button' | 'status'
  role: 'action' | 'primary-action' | 'destructive-action' | 'status'
  statusKind?: 'status' | 'delta'
  statusIntent?: 'positive' | 'warning' | 'negative' | 'neutral'
}

export interface InteractionStyleObservation {
  before: Record<string, string>
  after: Record<string, string>
  changedProperties?: string[]
  source?: 'computed-probed' | 'declared-applicable'
  selector?: string
}

export interface InteractionStyles {
  hover: InteractionStyleObservation[]
  focus: InteractionStyleObservation[]
  active: InteractionStyleObservation[]
  disabled?: InteractionStyleObservation[]
}

export interface ExtractionIssue {
  stage: string
  reason: string
}

export interface AnalysisTiming {
  userWaitMs?: number
  browserMs?: number
  preparationMs?: number
  extractionMs?: number
  healthGateMs?: number
  screenshotCaptureMs?: number
  validationMs: number
  totalMs: number
  imageCount: number
  budgetExceeded?: string[]
}

export type TokenConfidence = 'high' | 'medium' | 'low'
export type TokenReuseScope = 'foundation' | 'component' | 'local' | 'declared-only' | 'unknown'

export interface PairedSurfaceRouteEvidence {
  page: string
  /** Stable route identity retained when persistence removes query text from `page`. */
  routeId: string
  supported: boolean
  ownerIds: string[]
  totalOwnerIds: string[]
  mainTextOwnerIds: string[]
  headingOwnerIds: string[]
  textRoles: TextColorPairObservation['textRole'][]
  normalizedShare: number
  normalizedMainTextShare: number
}

export interface PairedSurfaceEvidence {
  background: string
  pageCount: number
  eligiblePageCount: number
  pageSupportRatio: number
  /** Sum of each canonical route's matched share, divided by the eligible route count. */
  normalizedShare: number
  /** Route-balanced share contributed specifically by body and heading owners. */
  normalizedMainTextShare: number
  /** Independent rendered text owners contributing this exact foreground/surface pair across canonical routes. */
  ownerCount: number
  /** Smallest independent matched-owner count on any supporting canonical route. */
  minimumPageOwnerCount: number
  /** Canonical routes and owners that directly use the pair for body or heading text. */
  mainTextPageCount: number
  mainTextOwnerCount: number
  /** Canonical routes and owners that directly use the pair for heading text. */
  headingPageCount: number
  headingOwnerCount: number
  contrastRatio: number
  textRoles: TextColorPairObservation['textRole'][]
  /** Complete per-route owner sets used to independently audit all aggregate pair arithmetic. */
  routeSupport: PairedSurfaceRouteEvidence[]
}

export interface TokenEvidence {
  value: string
  /** Backward-compatible decision confidence; equivalent to semanticConfidence for new analyses. */
  confidence: TokenConfidence
  measurementConfidence?: TokenConfidence
  semanticConfidence?: TokenConfidence
  reuseScope?: TokenReuseScope
  /** Distinct rendered owners after category aliases and repeated viewports are collapsed. */
  ownerCount?: number
  /** Independent owners carrying foundation-compatible provenance across canonical routes. */
  foundationOwnerCount?: number
  /** Smallest foundation-owner count on any canonical route where the value was observed. */
  minimumPageFoundationOwnerCount?: number
  /** Agreement of observations with the assigned semantic role or reusable scope, in the range 0..1. */
  semanticAgreement?: number
  observationCount: number
  pageCount: number
  captureCount: number
  eligiblePageCount?: number
  pageSupportRatio?: number
  pages: string[]
  /** Auditable rendered owners supporting text-derived portable typography or foreground claims. */
  renderedTextOwners?: Array<RenderedTextStyleObservation & { page: string; routeId: string; viewport: string }>
  /** Stable opaque Evidence route IDs corresponding to pages after public URL redaction. */
  pageRefs?: string[]
  sources: string[]
  /** Owner-normalized provenance counts used to derive semanticAgreement. */
  sourceCounts?: Record<string, number>
  /** Owner-normalized usage-category counts used to derive role agreement. */
  roleCounts?: Record<string, number>
  /** Directly observed text/surface pairing used to justify a portable foreground. */
  pairedSurface?: PairedSurfaceEvidence
  reasons: Array<
    | 'cross-page'
    | 'declared-token'
    | 'declared-only'
    | 'interactive-use'
    | 'rendered-use'
    | 'computed-style'
    | 'paired-surface'
  >
}

export interface ColorTokenCandidate {
  /** Stable canonical candidate identity. Optional only when reading legacy stored records. */
  id?: string
  value: string
  /** Dominant observed semantic family. Full structured candidates split equal values by this role. */
  role?: string
  kind: 'declared-only' | 'observed-unassigned'
  observationCount: number
  sources: string[]
  pageCount?: number
  captureCount?: number
  measurementConfidence?: TokenConfidence
  semanticConfidence?: TokenConfidence
  semanticAgreement?: number
  roleCounts?: Record<string, number>
  reuseScope?: TokenReuseScope
  eligiblePageCount?: number
  pageSupportRatio?: number
  pages?: string[]
  /** Stable opaque Evidence route IDs corresponding to pages after public URL redaction. */
  pageRefs?: string[]
  reasons?: TokenEvidence['reasons']
}

export type TokenCandidateGroup =
  | 'colors'
  | 'typography.fontFamilies'
  | 'typography.fontStacks'
  | 'typography.fontSizes'
  | 'typography.fontWeights'
  | 'typography.lineHeights'
  | 'typography.letterSpacings'
  | 'spacing'
  | 'radii'
  | 'shadows'
  | 'borders'
  | 'zIndices'
  | 'transitions'

export interface TokenValueCandidate {
  /** Stable identity that cannot collide with a portable positional token reference. */
  id?: string
  group: TokenCandidateGroup
  /** Semantic name for keyed groups such as colors. */
  role?: string
  value: string
  /** Original pre-promotion path, retained only for compatibility and diagnostics. Never use it as candidate identity. */
  sourcePath?: string
  provenance?: 'built-token' | 'declared-color' | 'observed-color' | 'dark-mode'
  rejectionReason:
    | 'low-semantic-confidence'
    | 'component-scope'
    | 'local-scope'
    | 'declared-only'
    | 'unknown-scope'
    | 'unassigned-role'
    | 'not-in-base-catalog'
    | 'ungrounded-dark-override'
  evidence: TokenEvidence
}

export interface PageCoverage {
  requested: number | null
  discovered: number
  selected: number
  analyzed: number
  pages: Array<{
    /** Opaque document identity retained when public URL sanitization removes query text. */
    routeId?: string
    url: string
    source: 'requested' | 'dom' | 'sitemap'
    kind: PageKind | 'entry'
  }>
}

export type AnalysisCompletionReason = 'complete' | 'time-limit' | 'user-finished'

export interface AnalysisCompletion {
  reason: AnalysisCompletionReason
  /** Present only on legacy records that ended at the former global time limit. */
  activeLimitMs?: number
}

export interface AnalysisProgress {
  step: string
  percent: number
  analyzedPages: number
  discoveredPages: number
  resultReady: boolean
  activeElapsedMs: number
}

export interface DarkModeResult {
  hasDarkMode: boolean
  darkStyles: ExtractedStyles | null
  method: 'media-query' | 'class-toggle' | 'none'
  selector?: string
  /** Exact page capture from which dark styles were observed. Absent only on legacy records and direct callers. */
  source?: {
    url: string
    viewport: string
  }
}

export interface DesignToken {
  colors: Record<string, string>
  typography: {
    fontFamilies: string[]
    fontStacks: string[]
    fontSizes: string[]
    fontWeights: string[]
    lineHeights: string[]
    letterSpacings: string[]
  }
  spacing: string[]
  radii: string[]
  shadows: string[]
  borders: string[]
  zIndices: string[]
  transitions: string[]
  usageCount?: Record<string, number>
  evidence?: Record<string, TokenEvidence>
  candidates?: {
    colors?: ColorTokenCandidate[]
    /** Complete evidence for values rejected from the portable token catalog. */
    values?: TokenValueCandidate[]
  }
  colorRoles?: {
    primaryAction?: {
      observedBackground: string
      observedForeground?: string
      contrastRatio?: number
      contrastWarning?: {
        targetContrastRatio: number
        message: string
      }
      recommendedOnPrimary?: {
        value: string
        contrastRatio: number
        targetContrastRatio: number
        derived: true
      }
      provenance: Array<Pick<ColorRoleObservation, 'captureId' | 'elementRef' | 'elementKind' | 'role'>>
    }
    semanticPairs?: Partial<
      Record<
        | 'status-positive'
        | 'status-warning'
        | 'status-negative'
        | 'status-neutral'
        | 'delta-positive'
        | 'delta-negative',
        {
          observedBackground?: string
          observedForeground?: string
          provenance: Array<
            Pick<
              ColorRoleObservation,
              'captureId' | 'elementRef' | 'elementKind' | 'role' | 'statusKind' | 'statusIntent'
            >
          >
        }
      >
    >
  }
}

export interface AnalysisResult {
  analysisId: string
  tokens: DesignToken
  designEvidence: DesignEvidence
  screenshots: string[]
  pageScreenshots: PageScreenshot[]
  rawStyles: ExtractedStyles
  interactions: InteractionStyles
  darkMode: DarkModeResult | null
  featureTags: string[]
  components: ComponentPattern[]
  breakpoints: ResponsiveBreakpoint[]
  motion: MotionToken[]
  duration: number
  timing: AnalysisTiming
  accessMode: 'anonymous' | 'managed'
  authWallDetected: boolean
  finalUrl: string
  extractionIssues: ExtractionIssue[]
  pageCoverage: PageCoverage
  captureManifest: CaptureManifest
  completion: AnalysisCompletion
}
