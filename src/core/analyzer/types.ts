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
  url: string
  path: string
  viewport: string
  width?: number
  height?: number
  /** False when the encoded image does not match the intended capture geometry. */
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
  /** Number of distinct normalized URL groups that observed each usage key during token selection. */
  usageGroupCounts?: Record<string, number>
  valueSources?: Record<string, string[]>
  /** Per-value source frequencies retained for scope-aware token promotion. */
  valueSourceCounts?: Record<string, Record<string, number>>
  colorRoleObservations?: ColorRoleObservation[]
  textColorPairObservations?: TextColorPairObservation[]
}

export interface TextColorPairObservation {
  captureId: string
  background: string
  foreground: string
  textRole: 'body' | 'heading' | 'label' | 'other'
  count: number
}

export interface ColorRoleObservation {
  captureId: string
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

export interface TokenEvidence {
  value: string
  /** Backward-compatible decision confidence; equivalent to semanticConfidence for new analyses. */
  confidence: TokenConfidence
  measurementConfidence?: TokenConfidence
  semanticConfidence?: TokenConfidence
  reuseScope?: TokenReuseScope
  observationCount: number
  pageCount: number
  captureCount: number
  eligiblePageCount?: number
  pageSupportRatio?: number
  pages: string[]
  sources: string[]
  reasons: Array<
    'cross-page' | 'declared-token' | 'declared-only' | 'interactive-use' | 'rendered-use' | 'computed-style'
  >
}

export interface ColorTokenCandidate {
  value: string
  kind: 'declared-only' | 'observed-unassigned'
  observationCount: number
  sources: string[]
  pageCount?: number
  captureCount?: number
  measurementConfidence?: TokenConfidence
}

export interface PageCoverage {
  requested: number | null
  discovered: number
  selected: number
  analyzed: number
  pages: Array<{
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
