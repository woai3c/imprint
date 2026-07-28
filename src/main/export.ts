/**
 * Re-export all export functions from core.
 * Keeps backward compatibility for Electron main process imports.
 */
export {
  generateCssVariables,
  generateDesignDoc,
  generateDtcgJson,
  generateScssVariables,
  generateTailwindTheme,
} from '../core/export/index.js'

export type { DarkModeExportData } from '../core/export/index.js'
export type { DocLanguage } from '../core/analyzer/agent-guide.js'
export type { DesignToken } from '../core/analyzer/index.js'
