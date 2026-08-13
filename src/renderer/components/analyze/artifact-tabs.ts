export type ExportTab = 'overview' | 'preview' | 'markdown' | 'reconstruction' | 'tailwind' | 'css'

export function artifactTabIds(hasReconstructionBrief: boolean): ExportTab[] {
  return [
    'overview',
    'preview',
    'markdown',
    ...(hasReconstructionBrief ? (['reconstruction'] as const) : []),
    'tailwind',
    'css',
  ]
}
