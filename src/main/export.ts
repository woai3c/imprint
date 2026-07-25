/**
 * Re-export all export functions from core.
 * Keeps backward compatibility for Electron main process imports.
 */
export {
  generateCssVariables,
  generateDesignDoc,
  generateDtcgJson,
  generatePdfHtml,
  generateScssVariables,
  generateTailwindTheme,
} from '../core/export/index.js'

export type { DesignToken } from '../core/analyzer/index.js'
