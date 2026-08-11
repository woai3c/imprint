import type { AuthWallDetection } from '../core/analyzer/auth-wall.js'
import type { PageDiscoveryMode } from '../core/analyzer/page-discovery.js'
import type { AnalysisTiming, AuthMode, ExtractionIssue, LoginDecision, PageCoverage } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import type {
  AgentContextBundle,
  DesignIntelligenceMeta,
  DesignProfile,
  ValidationReport,
} from '../core/design-intelligence/types.js'

export type { AuthWallDetection } from '../core/analyzer/auth-wall.js'
export type { AnalysisTiming, AuthMode, ExtractionIssue, LoginDecision, PageCoverage } from '../core/analyzer/types.js'
export type { PageDiscoveryMode } from '../core/analyzer/page-discovery.js'
export type {
  AgentContextBundle,
  AnalysisCapabilityLevel,
  DesignIntelligenceMeta,
  DesignIntelligenceStatus,
  DesignProfile,
  ValidationReport,
} from '../core/design-intelligence/types.js'

export const THEME_EXPORT_FORMATS = ['markdown', 'css', 'tailwind', 'json'] as const
export type ThemeExportFormat = (typeof THEME_EXPORT_FORMATS)[number]
export interface AppSettings {
  aiEnabled: boolean
  aiMode: 'apiKey' | 'agentCli'
  provider: string
  apiKeys: Record<string, string>
  baseUrl: string
  model: string
  modelSupportsVision: boolean
  visionAnalysisConsent: boolean
  managedVisionConsent: boolean
  analysisDepth: 'standard' | 'deep'
  agentCli: string
  exportFormat: ThemeExportFormat
  proxyServer: string
  reasoningEffort: string
  thinkingEnabled: boolean
  language: string
  colorMode: string
  themePreference: string
  analysisPageCount: number
  noAiTipDismissed: boolean
}

export interface AgentCliInfo {
  name: string
  command: string
  version: string | null
  available: boolean
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
  design_intelligence_meta_json: string | null
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
  url: string
  pages_analyzed: number
  viewports: string
  duration_ms: number | null
  token_usage: number
  created_at: string
  screenshot_path: string | null
  design_intelligence_status: string | null
  ai_token_usage?: { input?: number; output?: number }
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
  designEvidence?: DesignEvidence
  designIntelligence?: DesignIntelligenceMeta
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
  designIntelligence: DesignIntelligenceMeta
  designProfile: DesignProfile | null
  reconstructionBrief: string | null
  agentContext: AgentContextBundle | null
  validationReport: ValidationReport | null
}

export interface AnalyzeOptions {
  viewports?: string[]
  maxPages?: number
  useSession?: boolean
  authMode?: AuthMode
  language?: string
  depth?: 'standard' | 'deep'
  pageDiscovery?: PageDiscoveryMode
}

export interface AnalyzeResponse extends Partial<AnalysisResultData> {
  error?: boolean
  message?: string
  stage?: string
  authRequired?: boolean
  detection?: AuthWallDetection
  cancelled?: boolean
}

export interface DesignIntelligenceResponse extends Partial<AnalysisResultData> {
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
  exportTheme: (id: string, format: ThemeExportFormat) => Promise<FileOperationResult>
  analyzeUrl: (url: string, options?: AnalyzeOptions) => Promise<AnalyzeResponse>
  startDesignIntelligence: (analysisId: string, language?: string) => Promise<DesignIntelligenceResponse>
  generateDesignExamples: (analysisId: string, language?: string) => Promise<DesignIntelligenceResponse>
  cancelDesignIntelligence: (analysisId: string) => Promise<{ success: boolean }>
  skipDesignIntelligence: (
    analysisId: string,
  ) => Promise<{ designIntelligence?: DesignIntelligenceMeta; error?: boolean }>
  generateValidation: (
    analysisId: string,
    scenario: 'workflow' | 'content' | 'states',
  ) => Promise<DesignIntelligenceResponse>
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
  detectAgentClis: (force?: boolean) => Promise<AgentCliInfo[]>
  testApiKey: (provider: string, apiKey: string, baseUrl?: string) => Promise<{ success: boolean; message: string }>
  getAnalyses: () => Promise<AnalysisRecord[]>
  getAnalysisSummaries: () => Promise<AnalysisRecord[]>
  getAnalysisSummariesPage: (query?: AnalysisSummaryPageQuery) => Promise<AnalysisSummaryPage>
  getAnalysis: (id: string) => Promise<AnalysisDetailData | null>
  deleteAnalysis: (id: string) => Promise<{ success: boolean }>
  deleteAnalyses: (ids: string[]) => Promise<{ success: boolean }>
  openExternal: (url: string) => Promise<void>
  onAnalysisProgress: (callback: (progress: { step: string; percent: number }) => void) => () => void
  onDesignIntelligenceProgress: (callback: (progress: { step: string; percent: number }) => void) => () => void
  onLoginRequired: (callback: (request: LoginRequiredEvent) => void) => () => void
}
