const LIMITATION_KEYS: Record<string, string> = {
  'fewer-pages-than-requested': 'fewerPages',
  'single-viewport': 'singleViewport',
  'horizontal-overflow-observed': 'horizontalOverflow',
  'no-sections-detected': 'noSections',
  'safe-active-interactions-not-observed': 'noActiveInteractions',
  'some-safe-interactions-skipped': 'noActiveInteractions',
  'no-interaction-states-observed': 'noInteractionStates',
  'no-major-media-detected': 'noMedia',
  'no-classified-media-regions': 'noMediaClassification',
  'extraction-stage-degraded': 'extractionDegraded',
  'breakpoint-stylesheets-unreadable': 'partialBreakpoints',
}

const DIAGNOSTIC_LIMITATION_PREFIXES = ['page-health:', 'skipped:', 'skipped-interaction:', 'extraction-issue:']

export interface DisplayedEvidenceLimitation {
  limitation: string
  translationKey: string
}

export function summarizeEvidenceLimitations(limitations: readonly string[]): DisplayedEvidenceLimitation[] {
  const seenTranslationKeys = new Set<string>()
  const result: DisplayedEvidenceLimitation[] = []

  for (const limitation of limitations) {
    if (DIAGNOSTIC_LIMITATION_PREFIXES.some((prefix) => limitation.startsWith(prefix))) continue
    const translationKey = LIMITATION_KEYS[limitation] || 'unknown'
    if (seenTranslationKeys.has(translationKey)) continue
    seenTranslationKeys.add(translationKey)
    result.push({ limitation, translationKey })
  }

  return result
}
