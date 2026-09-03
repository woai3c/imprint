import type { RenderedTextPaintEvidence, RenderedTextRectEvidence } from './types.js'

interface ClipMetrics {
  left: number
  top: number
  right: number
  bottom: number
  fillRatio: number
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizedCss(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : ''
}

function filterOpacity(value: string): number | undefined {
  const normalized = normalizedCss(value)
  if (!normalized || normalized === 'none') return 1
  const calls = [...normalized.matchAll(/([a-z-]+)\(([^()]*)\)/g)]
  if (calls.length === 0 || calls.map((match) => match[0]).join(' ') !== normalized) return undefined
  let product = 1
  for (const call of calls) {
    if (call[1] !== 'opacity') return undefined
    const token = call[2].trim()
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(token)) return undefined
    const parsed = Number.parseFloat(token)
    if (!Number.isFinite(parsed)) return undefined
    product *= Math.max(0, Math.min(1, token.endsWith('%') ? parsed / 100 : parsed))
  }
  return product
}

function clipPathMetrics(value: string, width: number, height: number): ClipMetrics | null {
  const normalized = normalizedCss(value)
  if (!normalized || normalized === 'none') return { left: 0, top: 0, right: width, bottom: height, fillRatio: 1 }
  const inset = /^inset\(([^)]*)\)/.exec(normalized)
  if (!inset) return null
  // Rounded inset geometry cannot be reconstructed from the persisted rectangular metrics.
  if (/\bround\b/.test(inset[1])) return null
  const values = inset[1].trim().split(/\s+/).filter(Boolean)
  if (values.length === 0 || values.length > 4) return null
  const expanded =
    values.length === 1
      ? [values[0], values[0], values[0], values[0]]
      : values.length === 2
        ? [values[0], values[1], values[0], values[1]]
        : values.length === 3
          ? [values[0], values[1], values[2], values[1]]
          : values
  const length = (token: string, axis: number): number | null => {
    if (token.endsWith('%')) return (Number.parseFloat(token) / 100) * axis
    if (token.endsWith('px') || /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return Number.parseFloat(token)
    return null
  }
  const [top, right, bottom, left] = [
    length(expanded[0], height),
    length(expanded[1], width),
    length(expanded[2], height),
    length(expanded[3], width),
  ]
  if (![top, right, bottom, left].every(finite)) return null
  return {
    left: Math.max(0, Math.min(width, left as number)),
    top: Math.max(0, Math.min(height, top as number)),
    right: Math.max(0, Math.min(width, width - (right as number))),
    bottom: Math.max(0, Math.min(height, height - (bottom as number))),
    fillRatio: 1,
  }
}

function validRect(rect: unknown): rect is RenderedTextRectEvidence {
  if (!rect || typeof rect !== 'object' || Array.isArray(rect)) return false
  const value = rect as Partial<RenderedTextRectEvidence>
  return finite(value.xPx) && finite(value.yPx) && finite(value.widthPx) && finite(value.heightPx)
}

function visibleColorAlpha(value: unknown): number | null {
  if (typeof value !== 'string') return null
  if (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value.trim())) return 1
  const match = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(value.trim())
  if (!match) return null
  const alpha = match[1] === undefined ? 1 : Number.parseFloat(match[1])
  return Number.isFinite(alpha) ? alpha : null
}

/** Independently validates the bounded paint provenance carried by a rendered-text owner. */
export function hasValidRenderedTextPaintEvidence(source: RenderedTextPaintEvidence): boolean {
  const persistedSource = source as RenderedTextPaintEvidence & {
    nativeTextBounds?: unknown
    nativeTextOrigin?: unknown
  }
  if (
    !source ||
    typeof source !== 'object' ||
    source.kind !== 'direct-text' ||
    !finite(source.widthPx) ||
    source.widthPx <= 2 ||
    !finite(source.heightPx) ||
    source.heightPx <= 2 ||
    !finite(source.visibleWidthPx) ||
    source.visibleWidthPx <= 2 ||
    source.visibleWidthPx > source.widthPx + 1 ||
    !finite(source.visibleHeightPx) ||
    source.visibleHeightPx <= 2 ||
    source.visibleHeightPx > source.heightPx + 1 ||
    !finite(source.paintedAreaPx) ||
    source.paintedAreaPx <= 16 ||
    !finite(source.captureIntersectionRatio) ||
    source.captureIntersectionRatio <= 0 ||
    source.captureIntersectionRatio > 1 ||
    !finite(source.effectiveClipPathAreaRatio) ||
    source.effectiveClipPathAreaRatio <= 0 ||
    source.effectiveClipPathAreaRatio > 1 ||
    !Number.isInteger(source.ancestorClipCount) ||
    source.ancestorClipCount < 0 ||
    !finite(source.clientRectCount) ||
    source.clientRectCount < 1 ||
    !finite(source.glyphRectCount) ||
    source.glyphRectCount < 1 ||
    !validRect(source.visibleBounds) ||
    !Array.isArray(source.visibleGlyphRects) ||
    source.visibleGlyphRects.length === 0 ||
    source.visibleGlyphRects.length > 8 ||
    source.glyphRectCount < source.visibleGlyphRects.length ||
    !finite(source.visibleGlyphAreaPx) ||
    source.visibleGlyphAreaPx <= 4 ||
    !Array.isArray(source.clipPathChain) ||
    source.clipPathChain.length > 8 ||
    // Ancestor clip entries currently lack offsets relative to the text owner, so their effective glyph intersection
    // cannot be reconstructed from persisted evidence. Keep them observable, but do not promote them as foundations.
    source.clipPathChain.some((item) => item?.owner === 'ancestor') ||
    !Number.isInteger(source.nonRectangularClipPathCount) ||
    source.nonRectangularClipPathCount !== 0 ||
    !finite(source.opacity) ||
    source.opacity <= 0.02 ||
    source.opacity > 1 ||
    !finite(source.filterOpacity) ||
    source.filterOpacity <= 0.02 ||
    source.filterOpacity > 1 ||
    !Array.isArray(source.filterChain) ||
    source.filterChain.length > 8 ||
    !Array.isArray(source.maskChain) ||
    source.maskChain.length !== 0 ||
    !Array.isArray(source.blendChain) ||
    source.blendChain.length !== 0 ||
    !finite(source.textIndentPx) ||
    Math.abs(source.textIndentPx) > Math.max(128, source.widthPx * 2) ||
    typeof source.clip !== 'string' ||
    typeof source.clipPath !== 'string' ||
    typeof source.contentVisibility !== 'string' ||
    typeof source.filter !== 'string' ||
    persistedSource.nativeTextBounds !== undefined ||
    persistedSource.nativeTextOrigin !== undefined
  ) {
    return false
  }

  const bounds = source.visibleBounds
  if (
    bounds.xPx < -1 ||
    bounds.yPx < -1 ||
    bounds.widthPx <= 2 ||
    bounds.heightPx <= 2 ||
    bounds.xPx + bounds.widthPx > source.widthPx + 1 ||
    bounds.yPx + bounds.heightPx > source.heightPx + 1 ||
    Math.abs(bounds.widthPx - source.visibleWidthPx) > 0.01 ||
    Math.abs(bounds.heightPx - source.visibleHeightPx) > 0.01
  ) {
    return false
  }

  let glyphArea = 0
  for (const rect of source.visibleGlyphRects) {
    if (
      !validRect(rect) ||
      rect.widthPx <= 1 ||
      rect.heightPx <= 1 ||
      rect.widthPx * rect.heightPx <= 4 ||
      rect.xPx < bounds.xPx - 0.01 ||
      rect.yPx < bounds.yPx - 0.01 ||
      rect.xPx + rect.widthPx > bounds.xPx + bounds.widthPx + 0.01 ||
      rect.yPx + rect.heightPx > bounds.yPx + bounds.heightPx + 0.01
    ) {
      return false
    }
    glyphArea += rect.widthPx * rect.heightPx
  }
  if (Math.abs(glyphArea - source.visibleGlyphAreaPx) > Math.max(0.01, glyphArea * 0.001)) return false

  let reconstructedFilterOpacity = 1
  let paintFilterCount = 0
  const selfFilters: string[] = []
  for (const item of source.filterChain) {
    if (
      !item ||
      typeof item.value !== 'string' ||
      item.value.length > 512 ||
      !['self', 'ancestor', 'paint'].includes(item.owner)
    ) {
      return false
    }
    const normalized = normalizedCss(item.value)
    const opacity = filterOpacity(normalized)
    if (!normalized || normalized === 'none' || opacity === undefined) return false
    reconstructedFilterOpacity *= opacity
    if (item.owner === 'self') selfFilters.push(normalized)
    if (item.owner === 'paint') paintFilterCount += 1
  }
  const ownFilter = normalizedCss(source.filter)
  if (
    paintFilterCount > 1 ||
    (ownFilter && ownFilter !== 'none'
      ? selfFilters.length !== 1 || selfFilters[0] !== ownFilter
      : selfFilters.length !== 0) ||
    Math.abs(reconstructedFilterOpacity - source.filterOpacity) > Math.max(0.0001, reconstructedFilterOpacity * 0.001)
  ) {
    return false
  }

  if (source.glyphPaintKind === 'solid-color') {
    const alpha = visibleColorAlpha(source.foreground)
    if (alpha === null || alpha <= 0.001) return false
  } else if (
    source.glyphPaintKind !== 'background-clip' ||
    typeof source.backgroundClip !== 'string' ||
    !source.backgroundClip.split(/\s*,\s*/).includes('text') ||
    typeof source.backgroundImage !== 'string' ||
    !source.backgroundImage ||
    source.backgroundImage === 'none' ||
    source.backgroundImage.length > 512 ||
    source.foreground !== undefined
  ) {
    return false
  }

  const ownClip = normalizedCss(source.clipPath)
  if (!['', 'auto'].includes(normalizedCss(source.clip)) || normalizedCss(source.contentVisibility) === 'hidden') {
    return false
  }
  const ownClipMetrics = clipPathMetrics(ownClip, source.widthPx, source.heightPx)
  if (!ownClipMetrics) return false
  const selfClipPaths = []
  for (const item of source.clipPathChain) {
    if (
      !item ||
      typeof item.value !== 'string' ||
      !finite(item.widthPx) ||
      item.widthPx <= 2 ||
      !finite(item.heightPx) ||
      item.heightPx <= 2 ||
      !['self', 'ancestor'].includes(item.owner) ||
      !normalizedCss(item.value).startsWith('inset(') ||
      !clipPathMetrics(item.value, item.widthPx, item.heightPx)
    ) {
      return false
    }
    if (item.owner === 'self') selfClipPaths.push(item)
  }
  if (ownClip === '' || ownClip === 'none') {
    if (selfClipPaths.length !== 0) return false
  } else if (
    selfClipPaths.length !== 1 ||
    normalizedCss(selfClipPaths[0].value) !== ownClip ||
    Math.abs(selfClipPaths[0].widthPx - source.widthPx) > 1 ||
    Math.abs(selfClipPaths[0].heightPx - source.heightPx) > 1
  ) {
    return false
  }

  const clipWidth = Math.max(0, ownClipMetrics.right - ownClipMetrics.left)
  const clipHeight = Math.max(0, ownClipMetrics.bottom - ownClipMetrics.top)
  const effectiveScale = Math.sqrt(source.effectiveClipPathAreaRatio)
  const visibleBoundsRatio =
    (source.visibleWidthPx * source.visibleHeightPx) / Math.max(1, source.widthPx * source.heightPx)
  const expectedPaintedArea = source.visibleWidthPx * source.visibleHeightPx * source.effectiveClipPathAreaRatio
  return (
    source.visibleWidthPx * effectiveScale > 2 &&
    source.visibleHeightPx * effectiveScale > 2 &&
    source.visibleWidthPx <= clipWidth + 1 &&
    source.visibleHeightPx <= clipHeight + 1 &&
    bounds.xPx >= ownClipMetrics.left - 1 &&
    bounds.yPx >= ownClipMetrics.top - 1 &&
    bounds.xPx + bounds.widthPx <= ownClipMetrics.right + 1 &&
    bounds.yPx + bounds.heightPx <= ownClipMetrics.bottom + 1 &&
    source.captureIntersectionRatio + 0.001 >= visibleBoundsRatio &&
    source.effectiveClipPathAreaRatio <= ownClipMetrics.fillRatio + 0.001 &&
    Math.abs(source.paintedAreaPx - expectedPaintedArea) <= Math.max(1, expectedPaintedArea * 0.001)
  )
}
