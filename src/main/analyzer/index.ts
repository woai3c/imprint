/**
 * Electron-specific wrapper around the core analyzer.
 * Only injects Electron's `app.getPath('userData')` as the dataDir.
 */
import { app } from 'electron'

import { type AnalysisResult, analyze } from '../../core/analyzer/index.js'

export interface ElectronAnalysisOptions {
  viewports?: string[]
  maxPages?: number
  useSession?: boolean
  extractDarkMode?: boolean
}

export async function analyzeUrl(
  url: string,
  options: ElectronAnalysisOptions = {},
  onProgress?: (step: string, percent: number) => void,
): Promise<AnalysisResult> {
  return analyze(
    url,
    {
      ...options,
      dataDir: app.getPath('userData'),
    },
    onProgress,
  )
}
