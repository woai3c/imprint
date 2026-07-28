import type { AnalysisResultData } from '../stores/analysis-store'

export interface PageScreenshot {
  url: string
  path: string
  viewport: string
}

export function getPageScreenshots(result: AnalysisResultData): PageScreenshot[] {
  if (result.pageScreenshots && result.pageScreenshots.length > 0) return result.pageScreenshots
  return (result.screenshots || []).map((screenshotPath) => ({
    url: result.finalUrl || result.url,
    path: screenshotPath,
    viewport: 'desktop',
  }))
}

export function getScreenshotUrl(path: string): string {
  return `imprint-file:///${path.replace(/\\/g, '/')}`
}
