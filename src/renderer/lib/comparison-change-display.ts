import type { TFunction } from 'i18next'

import type { ReferenceComparisonChange } from '../../core/analyzer/reference-compare.js'
import type { CrossCaptureEntityMatchingResult } from '../../core/governance/entity-matcher.js'

export type LayoutChangeProperty =
  'order' | 'layoutMode' | 'display' | 'position' | 'maxWidth' | 'gridTemplateColumns' | 'childGridTemplateColumns'

export interface LayoutChangeDisplayGroup {
  key: string
  changes: ReferenceComparisonChange[]
  role?: string
  property?: LayoutChangeProperty
  routeIdentity?: string
  viewports: string[]
}

export interface LayoutOrderChange {
  direction: 'fewerBefore' | 'moreBefore'
  from: number
  to: number
  delta: number
}

export interface LayoutChangeDescription {
  title: string
  summary: string
  explanation?: string
}

const LAYOUT_PATH_PATTERN = /^layout\.([^.]+)\.\d+\.([^.]+)$/
const LAYOUT_PROPERTIES = new Set<LayoutChangeProperty>([
  'order',
  'layoutMode',
  'display',
  'position',
  'maxWidth',
  'gridTemplateColumns',
  'childGridTemplateColumns',
])

export function describeLayoutOrderChange(from: string | undefined, to: string | undefined): LayoutOrderChange | null {
  if (from === undefined || to === undefined) return null
  const fromCount = Number(from)
  const toCount = Number(to)
  if (
    !Number.isInteger(fromCount) ||
    !Number.isInteger(toCount) ||
    fromCount < 0 ||
    toCount < 0 ||
    fromCount === toCount
  ) {
    return null
  }
  return {
    direction: toCount < fromCount ? 'fewerBefore' : 'moreBefore',
    from: fromCount,
    to: toCount,
    delta: Math.abs(toCount - fromCount),
  }
}

function parsePageKey(pageKey: string): { routeIdentity: string; viewport: string } | null {
  const separator = pageKey.lastIndexOf('::')
  if (separator <= 0 || separator >= pageKey.length - 2) return null
  return { routeIdentity: pageKey.slice(0, separator), viewport: pageKey.slice(separator + 2) }
}

function pageContext(
  change: ReferenceComparisonChange,
  matching: CrossCaptureEntityMatchingResult | null,
): { routeIdentity: string; viewport: string } | null {
  if (!matching || change.referenceEvidenceIds.length !== 1 || change.targetEvidenceIds.length !== 1) return null
  const match = matching.sections.find(
    (candidate) =>
      candidate.status === 'matched' &&
      candidate.referenceIds.length === 1 &&
      candidate.targetIds.length === 1 &&
      candidate.referenceIds[0] === change.referenceEvidenceIds[0] &&
      candidate.targetIds[0] === change.targetEvidenceIds[0],
  )
  return match ? parsePageKey(match.pageKey) : null
}

export function groupLayoutChangesForDisplay(
  changes: ReferenceComparisonChange[],
  matching: CrossCaptureEntityMatchingResult | null,
): LayoutChangeDisplayGroup[] {
  const groups = new Map<string, LayoutChangeDisplayGroup>()

  for (const change of changes) {
    const path = LAYOUT_PATH_PATTERN.exec(change.tokenPath)
    const property = path?.[2] as LayoutChangeProperty | undefined
    const context = pageContext(change, matching)
    if (!path || !property || !LAYOUT_PROPERTIES.has(property) || !context) {
      groups.set(change.id, { key: change.id, changes: [change], viewports: [] })
      continue
    }

    const role = path[1]
    const key = JSON.stringify([
      context.routeIdentity,
      role,
      property,
      change.kind,
      change.from ?? null,
      change.to ?? null,
    ])
    const current = groups.get(key)
    if (current) {
      current.changes.push(change)
      if (!current.viewports.includes(context.viewport)) current.viewports.push(context.viewport)
      continue
    }
    groups.set(key, {
      key,
      changes: [change],
      role,
      property,
      routeIdentity: context.routeIdentity,
      viewports: [context.viewport],
    })
  }

  return [...groups.values()]
}

export function describeLayoutChangeGroupForDisplay(
  group: LayoutChangeDisplayGroup,
  t: TFunction,
  language: string,
): LayoutChangeDescription | null {
  const first = group.changes[0]
  if (!first || !group.role || !group.property || !group.routeIdentity) return null

  const role =
    group.role === 'unknown'
      ? t('history.referenceComparison.layoutChange.section')
      : t(`analyze.overview.sectionRoles.${group.role}`, {
          defaultValue: t('history.referenceComparison.layoutChange.section'),
        })
  const viewportLabels = group.viewports.map((viewport) =>
    t(`analyze.viewports.${viewport}`, { defaultValue: viewport }),
  )
  const viewports = new Intl.ListFormat(language, { style: 'short', type: 'conjunction' }).format(viewportLabels)
  const context = t('history.referenceComparison.layoutChange.context', {
    route: routeLabel(group.routeIdentity),
    viewports,
  })
  const orderChange = group.property === 'order' ? describeLayoutOrderChange(first.from, first.to) : null
  const orderDirection = orderChange?.direction ?? null
  const property = t(`history.referenceComparison.layoutChange.properties.${group.property}`)
  const from = friendlyLayoutValue(group.property, first.from, t)
  const to = friendlyLayoutValue(group.property, first.to, t)
  const titleKey = orderDirection
    ? `history.referenceComparison.layoutChange.titles.order.${orderDirection}`
    : 'history.referenceComparison.layoutChange.titles.property'
  const summaryKey = orderDirection
    ? `history.referenceComparison.layoutChange.summaries.order.${orderDirection}`
    : 'history.referenceComparison.layoutChange.summaries.property'

  return {
    title: t(titleKey, { role, property }),
    summary: t(summaryKey, {
      count: group.changes.length,
      role,
      property,
      context,
      from: orderDirection ? first.from : from,
      to: orderDirection ? first.to : to,
      delta: orderChange?.delta,
    }),
    ...(orderDirection ? { explanation: t('history.referenceComparison.layoutChange.orderExplanation') } : {}),
  }
}

function routeLabel(routeIdentity: string): string {
  try {
    const route = new URL(routeIdentity)
    return `${route.host}${route.pathname === '/' ? '' : route.pathname}`
  } catch {
    return routeIdentity
  }
}

function friendlyLayoutValue(property: LayoutChangeProperty, value: string | undefined, t: TFunction): string {
  if (value === undefined) return t('history.referenceComparison.layoutChange.notRecorded')
  if (property === 'gridTemplateColumns' || property === 'childGridTemplateColumns') {
    const count = Number(value)
    if (Number.isInteger(count) && count >= 0) {
      return t('history.referenceComparison.layoutChange.columnCount', { count })
    }
  }
  if (property === 'layoutMode' || property === 'display' || property === 'position') {
    return t(`history.referenceComparison.layoutChange.values.${property}.${value}`, { defaultValue: value })
  }
  return value
}
