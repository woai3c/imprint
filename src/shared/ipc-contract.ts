import type { AuthWallDetection } from '../core/analyzer/auth-wall.js'
import type { AuthMode, LoginDecision } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import type {
  AgentContextBundle,
  DesignIntelligenceMeta,
  DesignProfile,
  ValidationReport,
} from '../core/design-intelligence/types.js'

export type { AuthWallDetection } from '../core/analyzer/auth-wall.js'
export type { AuthMode, LoginDecision } from '../core/analyzer/types.js'
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
  aiMode: 'apiKey' | 'agentCli'
  provider: string
  apiKey: string
  baseUrl: string
  model: string
  modelSupportsVision: boolean
  visionAnalysisConsent: boolean
  managedVisionConsent: boolean
  analysisDepth: 'standard' | 'deep'
  agentCli: string
  exportFormat: ThemeExportFormat
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
  screenshot_path?: string | null
  tokens_json: string
  css_variables: string
  tailwind_theme: string
  design_doc: string
  design_evidence_json?: string | null
  design_profile_json?: string | null
  design_intelligence_meta_json?: string | null
  tags: string
  is_builtin: number
  is_favorite: number
  created_at: string
  updated_at: string
}

export interface AnalysisRecord {
  id: string
  theme_id: string | null
  url: string
  pages_analyzed: number
  viewports: string
  duration_ms: number | null
  token_usage: number
  created_at: string
  theme_name: string | null
  source_url: string | null
  screenshot_path: string | null
}

export interface PageScreenshotData {
  url: string
  path: string
  viewport: string
}

export interface AnalysisResultData {
  analysisId?: string
  tokens: Record<string, unknown>
  cssVariables: string
  tailwindTheme: string
  designDoc: string
  screenshots: string[]
  pageScreenshots?: PageScreenshotData[]
  duration: number
  url: string
  hasDarkMode?: boolean
  darkModeMethod?: string
  featureTags?: string[]
  darkTokens?: Record<string, string> | null
  breakpoints?: Array<{ width: number; label: string }>
  accessMode?: 'anonymous' | 'managed'
  authWallDetected?: boolean
  finalUrl?: string
  designEvidence?: DesignEvidence
  designIntelligence?: DesignIntelligenceMeta
  designProfile?: DesignProfile | null
  reconstructionBrief?: string | null
  agentContext?: AgentContextBundle | null
  validationReport?: ValidationReport | null
}

export interface AnalysisDetailData {
  id: string
  url: string
  finalUrl: string | null
  pagesAnalyzed: number
  durationMs: number | null
  createdAt: string
  themeId: string | null
  themeName: string | null
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

export interface SaveThemeData {
  url: string
  tokens: Record<string, unknown>
  cssVariables: string
  tailwindTheme: string
  designDoc: string
  screenshots: string[]
  designEvidence?: DesignEvidence
  designProfile?: DesignProfile | null
  designIntelligence?: DesignIntelligenceMeta
}

export interface ElectronAPI {
  platform: string
  getThemes: () => Promise<ThemeRecord[]>
  deleteTheme: (id: string) => Promise<{ success: boolean }>
  toggleFavorite: (id: string) => Promise<ThemeRecord>
  analyzeUrl: (url: string, options?: AnalyzeOptions) => Promise<AnalyzeResponse>
  startDesignIntelligence: (
    analysisId: string,
    language?: string,
    force?: boolean,
  ) => Promise<DesignIntelligenceResponse>
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
  exportTheme: (id: string, format: string) => Promise<FileOperationResult>
  exportFile: (content: string, defaultName: string, ext: string) => Promise<FileOperationResult>
  exportToDirectory: (
    files: Array<{ name: string; content: string }>,
    assets: string[],
    defaultDir: string,
  ) => Promise<FileOperationResult>
  importTheme: (language?: string) => Promise<FileOperationResult & { themeId?: string }>
  openLogsFolder: () => Promise<{ success: boolean; path: string }>
  logEvent: (level: 'info' | 'warn' | 'error', message: string) => void
  saveTheme: (data: SaveThemeData) => Promise<{ success: boolean; themeId: string }>
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  detectAgentClis: (force?: boolean) => Promise<AgentCliInfo[]>
  testApiKey: (provider: string, apiKey: string, baseUrl?: string) => Promise<{ success: boolean; message: string }>
  getAnalyses: () => Promise<AnalysisRecord[]>
  getAnalysisSummaries: () => Promise<AnalysisRecord[]>
  getAnalysis: (id: string) => Promise<AnalysisDetailData | null>
  deleteAnalysis: (id: string) => Promise<{ success: boolean }>
  deleteAnalyses: (ids: string[]) => Promise<{ success: boolean }>
  openExternal: (url: string) => Promise<void>
  onAnalysisProgress: (callback: (progress: { step: string; percent: number }) => void) => () => void
  onDesignIntelligenceProgress: (callback: (progress: { step: string; percent: number }) => void) => () => void
  onLoginRequired: (callback: (request: LoginRequiredEvent) => void) => () => void
}
