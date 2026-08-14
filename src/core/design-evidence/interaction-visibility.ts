import { hasVisibleShadow, isTransparentColor } from '../analyzer/component-detect.js'
import type { InteractionObservation } from './types.js'

function positiveCssLength(value: string | undefined): boolean | null {
  if (!value || /^(?:initial|inherit|unset|revert(?:-layer)?)$/i.test(value.trim())) return null
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(?:px|rem|em|pt)?$/i)
  return match ? Number.parseFloat(match[1]) > 0 : null
}

function visibleOutline(state: Record<string, string>): boolean | null {
  const style = state['outline-style'] || state.outlineStyle
  const width = state['outline-width'] || state.outlineWidth
  const color = state['outline-color'] || state.outlineColor
  const hasOutlineEvidence = style !== undefined || width !== undefined || color !== undefined
  if (!hasOutlineEvidence) return null
  if (style && /^(?:none|hidden|initial|unset)$/i.test(style.trim())) return false
  const positiveWidth = positiveCssLength(width)
  if (positiveWidth === false) return false
  if (color && isTransparentColor(color)) return false
  if (
    style === undefined ||
    /^(?:inherit|revert(?:-layer)?)$/i.test(style.trim()) ||
    positiveWidth === null ||
    color === undefined ||
    /^(?:initial|inherit|unset|revert(?:-layer)?)$/i.test(color.trim())
  ) {
    return null
  }
  return true
}

/** Returns null when the recorded focus state lacks enough paint information. */
export function focusIndicatorVisibility(observation: InteractionObservation): boolean | null {
  if (observation.driver !== 'focus') return null
  const shadow = observation.after['box-shadow'] || observation.after.boxShadow
  const shadowVisibility = shadow === undefined ? null : hasVisibleShadow(shadow)
  if (shadowVisibility === true) return true
  const outline = visibleOutline(observation.after)
  if (outline === true) return true
  return outline === false && shadowVisibility === false ? false : null
}
