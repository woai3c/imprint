import { cssGenericFontFamilies, normalizeCssFontFamilyList } from '../analyzer/font-family.js'

/** @deprecated Use portableFontSizeEntries(); sparse scales cannot be named by array position. */
export const FONT_SIZE_NAMES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']
export const RADIUS_NAMES = ['sm', 'md', 'lg', 'xl', '2xl']
export const SHADOW_NAMES = ['sm', 'md', 'lg', 'xl']
export const DURATION_NAMES = ['fast', 'normal', 'slow', 'slower', 'slowest']

export interface PortableFontEntry {
  name: string
  value: string
}

export interface PortableScaleEntry {
  name: string
  value: string
}

const STANDARD_FONT_SIZE_NAMES = new Map<number, string>([
  [12, 'xs'],
  [14, 'sm'],
  [16, 'base'],
  [18, 'lg'],
  [20, 'xl'],
  [24, '2xl'],
  [30, '3xl'],
  [36, '4xl'],
  [48, '5xl'],
  [60, '6xl'],
  [72, '7xl'],
  [96, '8xl'],
  [128, '9xl'],
])

function parsedDimension(value: string): { amount: number; unit: string } | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i.exec(value.trim())
  if (!match) return null
  const amount = Number(match[1])
  return Number.isFinite(amount) ? { amount, unit: match[2].toLowerCase() } : null
}

function decimalName(value: number): string {
  return Number(value.toFixed(4)).toString().replace('-', 'neg-').replace('.', 'p')
}

function fontSizeName(value: string, index: number): string {
  const parsed = parsedDimension(value)
  const pixels =
    parsed?.unit === 'px' || (parsed?.amount === 0 && parsed.unit === '')
      ? parsed.amount
      : parsed?.unit === 'rem'
        ? parsed.amount * 16
        : null
  if (pixels === null) return `custom-${index + 1}`
  const rounded = Number(pixels.toFixed(4))
  return STANDARD_FONT_SIZE_NAMES.get(rounded) || decimalName(rounded)
}

function lineHeightName(value: string, index: number): string {
  const parsed = parsedDimension(value)
  const ratio = parsed?.unit === '' ? parsed.amount : parsed?.unit === '%' ? parsed.amount / 100 : null
  if (ratio === null) return `custom-${index + 1}`
  const standards = [
    [1.25, 'tight'],
    [1.375, 'snug'],
    [1.5, 'normal'],
    [1.625, 'relaxed'],
    [2, 'loose'],
  ] as const
  const standard = standards.find(([amount]) => Math.abs(amount - ratio) < 0.0001)
  return standard?.[1] || decimalName(ratio)
}

function letterSpacingName(value: string, index: number): string {
  if (value.trim().toLowerCase() === 'normal') return 'normal'
  const parsed = parsedDimension(value)
  if (!parsed) return `custom-${index + 1}`
  if (Math.abs(parsed.amount) < 0.000001) return 'normal'
  return parsed.amount < 0 ? 'tight' : 'wide'
}

function portableScaleEntries(
  values: readonly string[] | undefined,
  identityValues: readonly string[] | undefined,
  nameFor: (value: string, index: number) => string,
): PortableScaleEntry[] {
  const identities = identityValues || values || []
  const counts = new Map<string, number>()
  const names = identities.map((value, index) => {
    const base = nameFor(value, index)
    const count = (counts.get(base) || 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
  return (values || []).flatMap((value, index) => (names[index] ? [{ name: names[index], value }] : []))
}

export function portableFontSizeEntries(
  values: readonly string[] | undefined,
  identityValues: readonly string[] | undefined = values,
): PortableScaleEntry[] {
  return portableScaleEntries(values, identityValues, fontSizeName)
}

export function portableLineHeightEntries(
  values: readonly string[] | undefined,
  identityValues: readonly string[] | undefined = values,
): PortableScaleEntry[] {
  return portableScaleEntries(values, identityValues, lineHeightName)
}

export function portableLetterSpacingEntries(
  values: readonly string[] | undefined,
  identityValues: readonly string[] | undefined = values,
): PortableScaleEntry[] {
  return portableScaleEntries(values, identityValues, letterSpacingName)
}

export function portableFontWeightEntries(
  values: readonly string[] | undefined,
  identityValues: readonly string[] | undefined = values,
): PortableScaleEntry[] {
  return portableScaleEntries(values, identityValues, tailwindFontWeightName)
}

function fontCategory(value: string): string {
  const primaryGeneric = cssGenericFontFamilies(value)[0]
  if (primaryGeneric && ['monospace', 'ui-monospace'].includes(primaryGeneric)) return 'mono'
  if (primaryGeneric && ['sans-serif', 'ui-sans-serif', 'system-ui'].includes(primaryGeneric)) return 'sans'
  if (primaryGeneric && ['serif', 'ui-serif'].includes(primaryGeneric)) return 'serif'
  if (primaryGeneric === 'ui-rounded') return 'rounded'
  if (primaryGeneric && ['cursive', 'fantasy', 'emoji', 'math', 'fangsong'].includes(primaryGeneric)) {
    return primaryGeneric
  }
  return 'family'
}

/**
 * Builds the shared implementation-facing font catalog. Full observed stacks are authoritative when available;
 * primary-family aliases remain in DTCG evidence but do not create duplicate or misleading stylesheet variables.
 */
export function portableFontEntries(
  typography: { fontStacks?: readonly string[]; fontFamilies?: readonly string[] },
  identityTypography: { fontStacks?: readonly string[]; fontFamilies?: readonly string[] } = typography,
): PortableFontEntry[] {
  const source = typography.fontStacks?.length ? typography.fontStacks : typography.fontFamilies || []
  const identitySource = identityTypography.fontStacks?.length
    ? identityTypography.fontStacks
    : identityTypography.fontFamilies || []
  const seen = new Set<string>()
  const counts = new Map<string, number>()
  const identityNames: string[] = []
  for (const rawValue of identitySource) {
    const value = rawValue.trim()
    const normalized = normalizeCssFontFamilyList(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    const category = fontCategory(value)
    const count = (counts.get(category) || 0) + 1
    counts.set(category, count)
    const name = category === 'family' ? `family-${count}` : count === 1 ? category : `${category}-${count}`
    identityNames.push(name)
  }
  return source.flatMap((rawValue, index) => {
    const value = rawValue.trim()
    const name = identityNames[index]
    return value && name ? [{ name, value }] : []
  })
}

export function proseDurationName(index: number): string {
  return DURATION_NAMES[index] || `duration-${index + 1}`
}

export function tailwindFontWeightName(value: string, index: number): string {
  const standardNames: Record<string, string> = {
    '100': 'thin',
    '200': 'extralight',
    '300': 'light',
    '400': 'normal',
    '500': 'medium',
    '600': 'semibold',
    '700': 'bold',
    '800': 'extrabold',
    '900': 'black',
  }
  return standardNames[value] || value.replace(/[^\w-]/g, '') || `${index + 1}`
}
