import type { AuthWallDetection } from './auth-wall.js'
import type { ComponentPattern } from './component-detect.js'
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
  dataDir: string
  onLoginRequired?: (request: LoginRequest, signal: AbortSignal) => Promise<LoginDecision>
}

export interface PageScreenshot {
  url: string
  path: string
  viewport: string
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
}

export interface InteractionStyles {
  hover: Record<string, string>[]
  focus: Record<string, string>[]
  active: Record<string, string>[]
}

export interface DarkModeResult {
  hasDarkMode: boolean
  darkStyles: ExtractedStyles | null
  method: 'media-query' | 'class-toggle' | 'none'
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
}

export interface AnalysisResult {
  tokens: DesignToken
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
  accessMode: 'anonymous' | 'managed'
  authWallDetected: boolean
  finalUrl: string
}
