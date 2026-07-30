import type { ExtractedStyles } from './types.js'

export type UsageCategory =
  | 'textColor'
  | 'bgColor'
  | 'borderColor'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'spacing'
  | 'radius'
  | 'shadow'
  | 'border'
  | 'zIndex'
  | 'transition'

function addCount(frequency: Map<string, number>, value: string, count: number): void {
  if (!value || !Number.isFinite(count) || count <= 0) return
  frequency.set(value, (frequency.get(value) || 0) + count)
}

function countFrequency(items: readonly string[]): Map<string, number> {
  const frequency = new Map<string, number>()
  for (const item of items) addCount(frequency, item, 1)
  return frequency
}

export function frequencyForCategory(
  styles: Pick<ExtractedStyles, 'usageCount'>,
  category: UsageCategory,
  fallbackItems: readonly string[] = [],
): Map<string, number> {
  const prefix = `${category}:`
  const frequency = new Map<string, number>()

  for (const [key, count] of Object.entries(styles.usageCount)) {
    if (key.startsWith(prefix)) addCount(frequency, key.slice(prefix.length), count)
  }

  if (frequency.size === 0) return countFrequency(fallbackItems)

  for (const item of fallbackItems) {
    if (!frequency.has(item)) addCount(frequency, item, 1)
  }
  return frequency
}

export function colorFrequency(
  rawColors: readonly string[],
  usageCount: Readonly<Record<string, number>> = {},
): Map<string, number> {
  const frequency = new Map<string, number>()
  const colorCategories: UsageCategory[] = ['textColor', 'bgColor', 'borderColor']

  for (const category of colorCategories) {
    const prefix = `${category}:`
    for (const [key, count] of Object.entries(usageCount)) {
      if (key.startsWith(prefix)) addCount(frequency, key.slice(prefix.length), count)
    }
  }

  if (frequency.size === 0) return countFrequency(rawColors)

  for (const color of rawColors) {
    if (!frequency.has(color)) addCount(frequency, color, 1)
  }
  return frequency
}

export function sortByFrequency(frequency: ReadonlyMap<string, number>): string[] {
  return [...frequency.entries()]
    .sort(([valueA, countA], [valueB, countB]) => countB - countA || valueA.localeCompare(valueB, 'en'))
    .map(([value]) => value)
}
