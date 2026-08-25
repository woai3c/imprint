import type { AnalysisResultData } from '../../stores/analysis-store'

export type DesktopArtifactExportId = 'design-md' | 'css-variables' | 'tailwind-theme'

export interface DesktopArtifactExport {
  id: DesktopArtifactExportId
  labelKey: string
  defaultName: string
  extension: string
  content: string
}

export function desktopArtifactExports(result: AnalysisResultData): DesktopArtifactExport[] {
  return [
    {
      id: 'design-md',
      labelKey: 'analyze.exportMenu.designMd',
      defaultName: 'DESIGN.md',
      extension: 'md',
      content: result.designDoc || '',
    },
    {
      id: 'css-variables',
      labelKey: 'analyze.exportMenu.cssVariables',
      defaultName: 'variables.css',
      extension: 'css',
      content: result.cssVariables || '',
    },
    {
      id: 'tailwind-theme',
      labelKey: 'analyze.exportMenu.tailwindTheme',
      defaultName: 'theme.css',
      extension: 'css',
      content: result.tailwindTheme || '',
    },
  ]
}
