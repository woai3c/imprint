export type ExportTab = 'overview' | 'preview' | 'markdown' | 'tailwind' | 'css'

export function artifactTabIds(): ExportTab[] {
  return ['overview', 'preview', 'markdown', 'tailwind', 'css']
}
