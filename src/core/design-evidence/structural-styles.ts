import type { SectionEvidence, SectionGradientEvidence } from './types.js'

export type CornerRadii = readonly [string, string, string, string]

function normalizeRadiusValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function scalarRadiusFromCorners(corners: CornerRadii): string | null {
  const normalized = corners.map(normalizeRadiusValue)
  if (!normalized.every((value) => value === normalized[0])) return null
  return /^(?:0|[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em))$/i.test(normalized[0]) ? normalized[0] : null
}

export function structuralBorderRadius(corners: CornerRadii): string | null {
  const normalized = corners.map(normalizeRadiusValue)
  if (normalized.every((value) => /^(?:0|0px|0rem|0em)$/i.test(value))) return null
  if (normalized.some((value) => !value || value.length > 80 || /[\r\n]|url\s*\(/i.test(value))) return null
  return normalized.join(' ')
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

const GRADIENT_TYPES = [
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
  'repeating-conic-gradient',
] as const

function isGradientDirection(type: SectionGradientEvidence['type'], value: string): boolean {
  if (type.includes('linear')) return /^(?:to\s+|[-+]?\d*\.?\d+(?:deg|grad|rad|turn)$)/i.test(value)
  if (type.includes('radial')) return /^(?:(?:circle|ellipse)\b|at\s+)/i.test(value)
  return /^(?:from\s+|at\s+|from\s+.+\s+at\s+)/i.test(value)
}

export function parseSectionGradient(value: string | undefined): SectionGradientEvidence | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized || normalized.length > 600 || /[\r\n\p{Cc}]|url\s*\(/iu.test(normalized)) return null
  const type = GRADIENT_TYPES.find((candidate) => normalized.toLowerCase().startsWith(`${candidate}(`))
  if (!type || !normalized.endsWith(')')) return null
  const inner = normalized.slice(type.length + 1, -1)
  const parts = splitTopLevel(inner)
  if (parts.length < 2) return null
  const direction = isGradientDirection(type, parts[0]) ? parts.shift() : undefined
  const stops = parts
  if (stops.length < 2 || stops.some((stop) => stop.length > 160 || /url\s*\(/i.test(stop))) return null
  return { type, ...(direction ? { direction } : {}), stops, value: normalized }
}

export function safeSectionObservedStyles(
  styles: Readonly<Record<string, string>>,
): SectionEvidence['observedStyles'] | undefined {
  const corners: CornerRadii = [
    styles.borderTopLeftRadius || '0px',
    styles.borderTopRightRadius || '0px',
    styles.borderBottomRightRadius || '0px',
    styles.borderBottomLeftRadius || '0px',
  ]
  const borderRadius = scalarRadiusFromCorners(corners) ? null : structuralBorderRadius(corners)
  const gradient = parseSectionGradient(styles.backgroundImage)
  const backgroundColor =
    styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent'
      ? styles.backgroundColor.slice(0, 120)
      : undefined
  const layout = Object.fromEntries(
    [
      'display',
      'position',
      'top',
      'height',
      'maxWidth',
      'gridTemplateColumns',
      'childGridTemplateColumns',
      'gap',
    ].flatMap((name) => {
      const value = styles[name]
      if (!value || ['none', 'normal', 'auto', '0px'].includes(value)) return []
      return [[name, value.slice(0, 240)]]
    }),
  )
  const borders = Object.fromEntries(
    ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'].flatMap((name) => {
      const value = styles[name]
      if (!value || /^(?:0px none|0px solid rgba\(0, 0, 0, 0\))/.test(value)) return []
      return [[name, value.slice(0, 160)]]
    }),
  )
  const boxShadow = styles.boxShadow && styles.boxShadow !== 'none' ? styles.boxShadow.slice(0, 240) : undefined
  if (
    !borderRadius &&
    !gradient &&
    !backgroundColor &&
    Object.keys(layout).length === 0 &&
    Object.keys(borders).length === 0 &&
    !boxShadow
  ) {
    return undefined
  }
  return {
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(borderRadius ? { borderRadius } : {}),
    ...(gradient ? { gradient } : {}),
    ...(Object.keys(layout).length > 0 ? { layout } : {}),
    ...(Object.keys(borders).length > 0 ? { borders } : {}),
    ...(boxShadow ? { boxShadow } : {}),
  }
}
