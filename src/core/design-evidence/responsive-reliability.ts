import { hasVisibleBorder } from '../analyzer/component-detect.js'
import type { DesignEvidence, ResponsiveSectionObservation } from './types.js'

type ResponsiveChange = NonNullable<ResponsiveSectionObservation['changes']>[string]

function boundedPixelValue(value: string | number | undefined, maximum = 240): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i)
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  return amount > 0 && amount <= maximum ? value : null
}

export function topLevelGridColumnCount(value: string | number | undefined): number | null {
  if (typeof value !== 'string') return null
  const repeat = value.match(/^repeat\(\s*(\d+)\s*,/i)
  if (repeat) return Number.parseInt(repeat[1], 10)
  let depth = 0
  let count = 0
  let insideTrack = false
  for (const character of value.trim()) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (/\s/.test(character) && depth === 0) {
      if (insideTrack) count += 1
      insideTrack = false
    } else {
      insideTrack = true
    }
  }
  if (insideTrack) count += 1
  return count > 0 ? count : null
}

export function isUsefulResponsiveChange(
  property: string,
  values: ResponsiveChange,
  sectionRole: string | undefined,
): boolean {
  if (property.startsWith('rect.') || property === 'visibility' || values.from === values.to) return false
  if (property === 'gridTemplateColumns' || property === 'childGridTemplateColumns') {
    const fromColumns = topLevelGridColumnCount(values.from)
    const toColumns = topLevelGridColumnCount(values.to)
    return fromColumns === null || toColumns === null || fromColumns !== toColumns
  }
  if (['node.heading.fontSize', 'layoutMode', 'position', 'order', 'sequenceIndex'].includes(property)) return true
  if (property === 'height' || property.endsWith('.height')) {
    return (
      ['header', 'navigation', 'action'].includes(sectionRole || '') &&
      Boolean(boundedPixelValue(values.from) && boundedPixelValue(values.to))
    )
  }
  if (/^border(?:Top|Right|Bottom|Left)$/.test(property)) {
    return [values.from, values.to].some((value) => typeof value === 'string' && hasVisibleBorder(value))
  }
  return property === 'boxShadow'
}

export function usefulResponsiveChanges(
  observation: Pick<ResponsiveSectionObservation, 'changes'>,
  sectionRole: string | undefined,
): Array<[string, ResponsiveChange]> {
  return Object.entries(observation.changes || {}).filter(([property, values]) =>
    isUsefulResponsiveChange(property, values, sectionRole),
  )
}

export function displayedResponsiveChangeType(
  original: ResponsiveSectionObservation['changeType'],
  properties: readonly string[],
): ResponsiveSectionObservation['changeType'] {
  return properties.length > 0 && properties.every((property) => ['order', 'sequenceIndex'].includes(property))
    ? 'reorder'
    : original
}

export function hasConsistentResponsiveSectionIdentity(
  observation: Pick<ResponsiveSectionObservation, 'sectionId' | 'evidenceRefs'>,
  evidence: Pick<DesignEvidence, 'sections'>,
): boolean {
  const sectionById = new Map(evidence.sections.map((section) => [section.id, section]))
  const roles = new Set(
    [observation.sectionId, ...observation.evidenceRefs].flatMap((id) => {
      const section = sectionById.get(id)
      return section ? [section.role] : []
    }),
  )
  return roles.size <= 1
}
