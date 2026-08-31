import type { InteractionStyleObservation, InteractionStyles } from './analyzer/types.js'

function stableRecord(record: Readonly<Record<string, string>>): Array<[string, string]> {
  return Object.entries(record).sort(([first], [second]) => first.localeCompare(second))
}

/** Identity of an observed style pattern; selector text is provenance, not part of the pattern. */
export function interactionStylePatternKey(observation: InteractionStyleObservation): string {
  return JSON.stringify({
    before: stableRecord(observation.before),
    after: stableRecord(observation.after),
    changedProperties: [...(observation.changedProperties || [])].sort(),
    source: observation.source || null,
  })
}

function mergedSelector(first: string | undefined, second: string | undefined): string | undefined {
  const selectors = [first, second].filter((selector): selector is string => Boolean(selector))
  return [...new Set(selectors)].join(', ') || undefined
}

/** Merge style patterns while retaining selector provenance on the canonical observation. */
export function mergeInteractionStylePatterns(target: InteractionStyles, source: InteractionStyles): void {
  for (const kind of ['hover', 'focus', 'active', 'disabled'] as const) {
    const merged: InteractionStyleObservation[] = []
    const byPattern = new Map<string, InteractionStyleObservation>()
    for (const observation of [...(target[kind] || []), ...(source[kind] || [])]) {
      const key = interactionStylePatternKey(observation)
      const existing = byPattern.get(key)
      if (existing) {
        existing.selector = mergedSelector(existing.selector, observation.selector)
        continue
      }
      const canonical = { ...observation }
      merged.push(canonical)
      byPattern.set(key, canonical)
    }
    target[kind] = merged
  }
}
