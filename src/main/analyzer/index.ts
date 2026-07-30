/**
 * Electron-specific wrapper around the core analyzer.
 * Only injects Electron's `app.getPath('userData')` as the dataDir.
 */
import { app } from 'electron'

import { type AnalysisResult, type AuthMode, type LoginRequest, analyze } from '../../core/analyzer/index.js'

export interface ElectronAnalysisOptions {
  viewports?: string[]
  maxPages?: number
  useSession?: boolean
  authMode?: AuthMode
  extractDarkMode?: boolean
  depth?: 'standard' | 'deep'
}

export async function analyzeUrl(
  url: string,
  options: ElectronAnalysisOptions = {},
  onProgress?: (step: string, percent: number) => void,
  onLoginRequired?: (request: LoginRequest, signal: AbortSignal) => Promise<'continue' | 'anonymous' | 'cancel'>,
): Promise<AnalysisResult> {
  return analyze(
    url,
    {
      ...options,
      dataDir: app.getPath('userData'),
      onLoginRequired,
    },
    onProgress,
  )
}
