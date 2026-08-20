import type { AnalysisDepth, AnalysisViewport } from '../core/analyzer/analysis-request.js'
import type { AuthWallDetection } from '../core/analyzer/auth-wall.js'
import type { PageDiscoveryMode } from '../core/analyzer/page-discovery.js'
import type { ReferenceComparisonResult } from '../core/analyzer/reference-compare.js'
import type {
  AnalysisTiming,
  AuthMode,
  CaptureManifest,
  ExtractionIssue,
  LoginDecision,
  PageCoverage,
} from '../core/analyzer/types.js'
import type { AgentContextBundle, DesignProfile, ValidationReport } from '../core/design-context/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'

export type { AuthWallDetection } from '../core/analyzer/auth-wall.js'
export type { AnalysisDepth, AnalysisRequest, AnalysisViewport } from '../core/analyzer/analysis-request.js'
export type {
  AnalysisTiming,
  AuthMode,
  CaptureManifest,
  ExtractionIssue,
  LoginDecision,
  PageCoverage,
} from '../core/analyzer/types.js'
export type { PageDiscoveryMode } from '../core/analyzer/page-discovery.js'
export type { ReferenceComparisonResult } from '../core/analyzer/reference-compare.js'
export type { AgentContextBundle, DesignProfile, ValidationReport } from '../core/design-context/types.js'

export interface AppSettings {
  analysisDepth: 'standard' | 'deep'
  proxyServer: string
  language: string
  colorMode: string
  themePreference: string
  validationScenario: string
  analysisPageCount: number
}

export interface BrowserSession {
  id: string
  origin: string
  hostname: string
  createdAt: string
  updatedAt: string
}

export interface ThemeRecord {
  id: string
  name: string
  source_url: string | null
  screenshot_path: string | null
  tokens_json: string
  css_variables: string
  tailwind_theme: string
  design_doc: string
  dark_tokens_json: string | null
  dark_mode_method: string | null
  dark_mode_selector: string | null
  design_evidence_json: string | null
  design_profile_json: string | null
  tags: string
  is_builtin: number
  is_favorite: number
  created_at: string
  updated_at: string
}

export type ThemeSummaryRecord = Pick<
  ThemeRecord,
  | 'id'
  | 'name'
  | 'source_url'
  | 'screenshot_path'
  | 'tokens_json'
  | 'dark_tokens_json'
  | 'dark_mode_method'
  | 'dark_mode_selector'
  | 'tags'
  | 'is_favorite'
  | 'created_at'
  | 'updated_at'
>

export interface ThemeSaveConflict {
  themeId: string
  name: string
  sourceUrl: string | null
  duplicateCount: number
}

export type ThemeSaveResponse =
  { success: true; theme: ThemeRecord; replaced: boolean } | { success: false; conflict: ThemeSaveConflict }

export interface AnalysisRecord {
  id: string
  theme_id: string | null
  theme_name: string | null
  site_name: string
  url: string
  pages_analyzed: number
  viewports: string
  duration_ms: number | null
  created_at: string
  screenshot_path: string | null
  route_identity: string | null
}

export interface AnalysisSummaryPage {
  records: AnalysisRecord[]
  matchingIds: string[]
  page: number
  pageSize: number
  total: number
}

export interface AnalysisSummaryPageQuery {
  page?: number
  pageSize?: number
  search?: string
}

export interface PageScreenshotData {
  url: string
  path: string
  viewport: string
  thumbnailPath?: string
  width?: number
  height?: number
  valid?: boolean
}

export interface ComparisonVisualCapture {
  path: string
  width?: number
  height?: number
}

export interface ComparisonVisualPair {
  url: string
  viewport: string
  reference: ComparisonVisualCapture
  target: ComparisonVisualCapture
}

export interface AnalysisResultData {
  analysisId?: string
  savedThemeId?: string | null
  tokens: Record<string, unknown>
  cssVariables: string
  tailwindTheme: string
  designDoc: string
  screenshots: string[]
  pageScreenshots?: PageScreenshotData[]
  duration: number
  analysisTiming?: AnalysisTiming
  url: string
  hasDarkMode?: boolean
  darkModeMethod?: string
  darkModeSelector?: string
  featureTags?: string[]
  darkTokens?: Record<string, string> | null
  breakpoints?: Array<{ width: number; label: string }>
  accessMode?: 'anonymous' | 'managed'
  authWallDetected?: boolean
  finalUrl?: string
  extractionIssues?: ExtractionIssue[]
  pageCoverage?: PageCoverage
  captureManifest?: CaptureManifest
  designEvidence?: DesignEvidence
  designProfile?: DesignProfile | null
  reconstructionBrief?: string | null
  agentContext?: AgentContextBundle | null
  validationReport?: ValidationReport | null
}

export interface AnalysisDetailData {
  id: string
  savedThemeId: string | null
  url: string
  finalUrl: string | null
  pagesAnalyzed: number
  durationMs: number | null
  analysisTiming?: AnalysisTiming
  createdAt: string
  routeIdentity: string | null
  tokens: Record<string, unknown>
  cssVariables: string
  tailwindTheme: string
  designDoc: string
  pageScreenshots: PageScreenshotData[]
  featureTags: string[]
  darkTokens: Record<string, string> | null
  hasDarkMode: boolean
  accessMode: 'anonymous' | 'managed' | null
  authWallDetected: boolean
  designEvidence: DesignEvidence | null
  designProfile: DesignProfile | null
  reconstructionBrief: string | null
  agentContext: AgentContextBundle | null
  validationReport: ValidationReport | null
  captureManifest: CaptureManifest | null
}

export interface AnalyzeOptions {
  viewports?: AnalysisViewport[]
  maxPages?: number
  useSession?: boolean
  authMode?: AuthMode
  language?: string
  depth?: AnalysisDepth
  pageDiscovery?: PageDiscoveryMode
}

export type AnalysisComparisonResponse =
  | {
      success: true
      comparison: ReferenceComparisonResult
      visualPairs: ComparisonVisualPair[]
    }
  | {
      success: false
      reason: 'analysis-not-found' | 'same-analysis' | 'analysis-order-invalid' | 'invalid-analysis-data'
    }

export interface AnalyzeResponse extends Partial<AnalysisResultData> {
  error?: boolean
  errorCode?: 'ANALYSIS_ACTIVE_TIMEOUT'
  message?: string
  stage?: string
  authRequired?: boolean
  detection?: AuthWallDetection
  cancelled?: boolean
}

export type AnalysisRecoveryResponse =
  | { status: 'idle' }
  | { status: 'running'; url: string; progress?: { step: string; percent: number } }
  | { status: 'complete'; url: string; response: AnalyzeResponse }

export interface DesignContextResponse extends Partial<AnalysisResultData> {
  error?: boolean
  message?: string
}

export interface LoginRequiredEvent {
  requestId: string
  detection: AuthWallDetection
  retry: boolean
}

export interface FileOperationResult {
  success?: boolean
  canceled?: boolean
  error?: boolean
  message?: string
  filePath?: string
}

export interface RendererPerformanceSample {
  windowMs: number
  frames: number
  fps: number
  p95FrameMs: number
  maxFrameMs: number
  framesOver50Ms: number
  longTasks: number
  longTaskMs: number
  focused: boolean
  theme: string
  route: string
  devicePixelRatio: number
  hardwareConcurrency: number
}

export interface ElectronAPI {
  platform: string
  initialSettings: AppSettings
  getThemes: () => Promise<ThemeSummaryRecord[]>
  getThemeArchive: () => Promise<ThemeRecord[]>
  saveTheme: (analysisId: string, overwriteThemeId?: string) => Promise<ThemeSaveResponse>
  renameTheme: (id: string, name: string) => Promise<ThemeSummaryRecord>
  deleteTheme: (id: string) => Promise<{ success: boolean }>
  exportTheme: (id: string) => Promise<FileOperationResult>
  analyzeUrl: (url: string, options?: AnalyzeOptions) => Promise<AnalyzeResponse>
  recoverAnalysis: () => Promise<AnalysisRecoveryResponse>
  acknowledgeAnalysis: () => Promise<{ success: boolean }>
  cancelAnalysis: () => Promise<{ success: boolean }>
  generateValidation: (
    analysisId: string,
    scenario: 'workflow' | 'content' | 'states',
  ) => Promise<DesignContextResponse>
  submitLoginDecision: (requestId: string, decision: LoginDecision) => Promise<{ success: boolean }>
  listBrowserSessions: () => Promise<BrowserSession[]>
  deleteBrowserSession: (id: string) => Promise<{ success: boolean; message?: string }>
  clearBrowserSessions: () => Promise<{ success: boolean; count: number; message?: string }>
  exportFile: (content: string, defaultName: string, ext: string) => Promise<FileOperationResult>
  exportToDirectory: (
    files: Array<{ name: string; content: string }>,
    assets: string[],
    defaultDir: string,
  ) => Promise<FileOperationResult>
  openLogsFolder: () => Promise<{ success: boolean; path: string }>
  logEvent: (level: 'info' | 'warn' | 'error', message: string) => void
  reportPerformance: (sample: RendererPerformanceSample) => void
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  getAnalyses: () => Promise<AnalysisRecord[]>
  getAnalysisSummaries: () => Promise<AnalysisRecord[]>
  getAnalysisSummariesPage: (query?: AnalysisSummaryPageQuery) => Promise<AnalysisSummaryPage>
  getAnalysis: (id: string) => Promise<AnalysisDetailData | null>
  compareAnalyses: (earlierAnalysisId: string, laterAnalysisId: string) => Promise<AnalysisComparisonResponse>
  deleteAnalysis: (id: string) => Promise<{ success: boolean }>
  deleteAnalyses: (ids: string[]) => Promise<{ success: boolean }>
  openExternal: (url: string) => Promise<void>
  onAnalysisProgress: (callback: (progress: { step: string; percent: number }) => void) => () => void
  onLoginRequired: (callback: (request: LoginRequiredEvent) => void) => () => void
}
