const BASE_ALL_FORMATS = [
  'design.md',
  'tailwind',
  'css',
  'scss',
  'json',
  'evidence',
  'components',
  'visual-qa',
] as const

export interface CliExportAvailability {
  hasProfile: boolean
}

export function resolveCliExportFormats(format: string, availability: CliExportAvailability): string[] {
  if (format !== 'all') return [format]
  return [...BASE_ALL_FORMATS, ...(availability.hasProfile ? ['profile'] : []), 'pdf']
}
