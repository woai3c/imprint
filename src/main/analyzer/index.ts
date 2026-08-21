/**
 * Electron-specific wrapper around the core analyzer.
 * Only injects Electron's `app.getPath('userData')` as the dataDir.
 */
import { app } from 'electron'

import type { AnalysisDepth, AnalysisViewport } from '../../core/analyzer/analysis-request.js'
import {
  type AnalysisProgress,
  type AnalysisResult,
  type AuthMode,
  type LoginRequest,
  type PageDiscoveryMode,
  analyze,
} from '../../core/analyzer/index.js'

export interface ElectronAnalysisOptions {
  viewports?: AnalysisViewport[]
  maxPages?: number
  useSession?: boolean
  authMode?: AuthMode
  extractDarkMode?: boolean
  depth?: AnalysisDepth
  pageDiscovery?: PageDiscoveryMode
  browserPath?: string
  proxyServer?: string
  signal?: AbortSignal
  finishSignal?: AbortSignal
}

export async function analyzeUrl(
  url: string,
  options: ElectronAnalysisOptions = {},
  onProgress?: (progress: AnalysisProgress) => void,
  onLoginRequired?: (request: LoginRequest, signal: AbortSignal) => Promise<'continue' | 'anonymous' | 'cancel'>,
): Promise<AnalysisResult> {
  return analyze(
    url,
    {
      ...options,
      dataDir: app.getPath('userData'),
      browserResourcesDir: app.isPackaged ? process.resourcesPath : undefined,
      toolVersion: app.getVersion(),
      onLoginRequired,
    },
    onProgress,
  )
}
