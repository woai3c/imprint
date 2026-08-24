import { normalizeColorValue } from '../analyzer/color-cluster.js'
import {
  hasCrispEdgeShadow,
  hasDepthShadow,
  hasVisibleBorder,
  hasVisibleShadow,
  isTransparentColor,
} from '../analyzer/component-detect.js'
import type { DesignToken } from '../analyzer/types.js'
import { resolveDesignTokenRef } from '../design-evidence/token-reference.js'
import type { ComponentEvidence, SectionEvidence } from '../design-evidence/types.js'

export type SurfaceEvidenceOwner = SectionEvidence | ComponentEvidence

function backgroundColor(owner: SurfaceEvidenceOwner): string | undefined {
  return 'styles' in owner ? owner.styles.backgroundColor : owner.observedStyles?.backgroundColor
}

function borderValues(owner: SurfaceEvidenceOwner): string[] {
  return 'styles' in owner
    ? owner.styles.border
      ? [owner.styles.border]
      : []
    : Object.values(owner.observedStyles?.borders || {})
}

function boxShadow(owner: SurfaceEvidenceOwner): string | undefined {
  return 'styles' in owner ? owner.styles.boxShadow : owner.observedStyles?.boxShadow
}

function hasVisibleBackground(owner: SurfaceEvidenceOwner): boolean {
  const color = backgroundColor(owner)
  return Boolean(color && !isTransparentColor(color)) || Boolean(!('styles' in owner) && owner.observedStyles?.gradient)
}

export function isSurfaceEvidenceOwner(owner: SurfaceEvidenceOwner): boolean {
  return hasVisibleBackground(owner) || borderValues(owner).some(hasVisibleBorder) || hasVisibleShadow(boxShadow(owner))
}

export function surfaceEvidenceStrategy(owner: SurfaceEvidenceOwner): 'border' | 'flat' | 'mixed' | 'shadow' {
  const edge = borderValues(owner).some(hasVisibleBorder) || hasCrispEdgeShadow(boxShadow(owner))
  const depth = hasDepthShadow(boxShadow(owner))
  return edge && depth ? 'mixed' : edge ? 'border' : depth ? 'shadow' : 'flat'
}

function isSurfaceFillRef(ref: string): boolean {
  if (!ref.startsWith('color.')) return false
  const name = ref.slice('color.'.length)
  return (
    ['background', 'surface', 'secondary'].includes(name) ||
    name.startsWith('observed-') ||
    name.startsWith('dark-observed-') ||
    name.startsWith('palette-')
  )
}

/** Token references that describe the owner's visible fill, border, or shadow. */
export function surfaceEvidenceTokenRefs(owner: SurfaceEvidenceOwner, tokens: DesignToken): string[] {
  const refs = new Set<string>()
  const color = backgroundColor(owner)
  const normalizedBackground = color && !isTransparentColor(color) ? normalizeColorValue(color) : null
  if (normalizedBackground) {
    owner.tokenRefs.filter(isSurfaceFillRef).forEach((ref) => {
      const value = resolveDesignTokenRef(tokens, ref)
      if (value && normalizeColorValue(value) === normalizedBackground) refs.add(ref)
    })
  }
  if (borderValues(owner).some(hasVisibleBorder)) {
    owner.tokenRefs.filter((ref) => ref.startsWith('border.')).forEach((ref) => refs.add(ref))
  }
  if (hasVisibleShadow(boxShadow(owner))) {
    owner.tokenRefs.filter((ref) => ref.startsWith('shadow.')).forEach((ref) => refs.add(ref))
  }
  return [...refs].sort()
}
