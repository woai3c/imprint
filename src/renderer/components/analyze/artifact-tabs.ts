export type ExportTab = 'overview' | 'preview' | 'markdown'

export function artifactTabIds(): ExportTab[] {
  return ['overview', 'preview', 'markdown']
}
