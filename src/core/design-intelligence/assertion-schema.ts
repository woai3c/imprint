import type { DesignAssertionKind } from './types.js'

export const DESIGN_ASSERTION_PREDICATES: Readonly<Record<DesignAssertionKind, readonly string[]>> = {
  evidence: ['supports'],
  component: ['present', 'variant', 'corner-shape', 'border-visible', 'shadow-visible'],
  section: ['present', 'layout-mode', 'ordered-before'],
  interaction: ['observed', 'executed', 'property-change', 'visible-indicator'],
  responsive: ['property-change', 'reflow', 'visibility-hidden', 'horizontal-overflow'],
  token: ['observed'],
}

export const DESIGN_ASSERTION_DIMENSIONS = [
  'design-thesis',
  'composition',
  'attention',
  'color',
  'typography',
  'shape',
  'surfaces',
  'imagery',
  'motion',
  'interaction',
  'responsive',
  'transfer',
] as const

export function isDesignAssertionKind(value: string): value is DesignAssertionKind {
  return Object.hasOwn(DESIGN_ASSERTION_PREDICATES, value)
}

export function isDesignAssertionPredicate(kind: DesignAssertionKind, predicate: string): boolean {
  return DESIGN_ASSERTION_PREDICATES[kind].includes(predicate)
}
