export function normalizeComputedLength(value: string): string {
  const match = value.trim().match(/^(-?\d*\.?\d+)px$/i)
  if (!match) return value
  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount)) return value
  const nearestHalfPixel = Math.round(amount * 2) / 2
  const normalized = Math.abs(amount - nearestHalfPixel) <= 0.1 ? nearestHalfPixel : Number(amount.toFixed(3))
  return `${Object.is(normalized, -0) ? 0 : normalized}px`
}

export function normalizeLengthUsageKey(key: string): string {
  const match = /^(spacing|radius):(.*)$/.exec(key)
  return match ? `${match[1]}:${normalizeComputedLength(match[2])}` : key
}
