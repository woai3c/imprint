const BASE_ALL_FORMATS = ['design.md', 'tailwind', 'css', 'scss', 'json', 'evidence'] as const

export interface CliExportAvailability {
  hasProfile: boolean
  hasReconstructionBrief: boolean
}

export function resolveCliExportFormats(format: string, availability: CliExportAvailability): string[] {
  if (format === 'brief') return ['reconstruction']
  if (format !== 'all') return [format]
  return [
    ...BASE_ALL_FORMATS,
    ...(availability.hasProfile ? ['profile'] : []),
    ...(availability.hasReconstructionBrief ? ['reconstruction'] : []),
    'pdf',
  ]
}
