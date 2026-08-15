import { isRecord } from '../../shared/type-guards.js'
import { parseJsonObjects } from '../ai/json-payload.js'
import type { DesignClaimCatalog, DesignClaimSelection } from './types.js'

export interface ClaimSelectionResult {
  selection: DesignClaimSelection
  diagnostics: string[]
  invalidSelections: number
  valid: boolean
}

const ALLOWED_FIELDS = new Set(['schemaVersion', 'selectedClaimIds', 'summaries'])

function selectionPayload(value: unknown): Record<string, unknown> | null {
  if (isRecord(value) && Array.isArray(value.selectedClaimIds)) return value
  if (isRecord(value) && isRecord(value.selection)) return selectionPayload(value.selection)
  return null
}

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 160)
}

export function parseClaimSelection(response: string, catalog: DesignClaimCatalog): ClaimSelectionResult {
  const diagnostics: string[] = []
  const objects = parseJsonObjects(response)
  let payload: Record<string, unknown> | null = null
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    payload = selectionPayload(objects[index])
    if (payload) break
  }
  if (!payload) {
    return {
      selection: { schemaVersion: '1', selectedClaimIds: [] },
      diagnostics: ['selection:invalid-payload'],
      invalidSelections: 1,
      valid: false,
    }
  }

  if (payload.schemaVersion !== '1') diagnostics.push('selection:unsupported-schemaVersion')
  const extraFields = Object.keys(payload).filter((field) => !ALLOWED_FIELDS.has(field))
  if (extraFields.length > 0) diagnostics.push(`selection:ignored-authoring-fields(${extraFields.sort().join(',')})`)

  const knownIds = new Set(catalog.claims.map((claim) => claim.id))
  const selectedClaimIds: string[] = []
  const rawIds = Array.isArray(payload.selectedClaimIds) ? payload.selectedClaimIds : []
  rawIds.slice(0, 8).forEach((value, index) => {
    if (typeof value !== 'string' || !knownIds.has(value)) {
      diagnostics.push(`selection.selectedClaimIds.${index}:unknown-claim-id`)
      return
    }
    if (!selectedClaimIds.includes(value)) selectedClaimIds.push(value)
  })
  if (rawIds.length > 8) diagnostics.push('selection.selectedClaimIds:too-many-items')
  if (catalog.claims.length > 0 && selectedClaimIds.length === 0) diagnostics.push('selection:no-known-claim-selected')

  const summaries: NonNullable<DesignClaimSelection['summaries']> = []
  if (payload.summaries !== undefined && !Array.isArray(payload.summaries)) {
    diagnostics.push('selection.summaries:invalid')
  } else if (Array.isArray(payload.summaries)) {
    payload.summaries.slice(0, 12).forEach((value, index) => {
      if (!isRecord(value) || typeof value.claimId !== 'string' || typeof value.text !== 'string') {
        diagnostics.push(`selection.summaries.${index}:invalid`)
        return
      }
      if (!knownIds.has(value.claimId) || !selectedClaimIds.includes(value.claimId)) {
        diagnostics.push(`selection.summaries.${index}:unknown-or-unselected-claim-id`)
        return
      }
      const text = normalizeSummaryText(value.text)
      if (!text) {
        diagnostics.push(`selection.summaries.${index}:empty`)
        return
      }
      if (/(?:https?:\/\/|file:\/\/|<[^>]+>)/i.test(text)) {
        diagnostics.push(`selection.summaries.${index}:unsafe-text`)
        return
      }
      summaries.push({ claimId: value.claimId, text })
    })
  }

  const invalidSelections = diagnostics.length
  const valid = payload.schemaVersion === '1' && selectedClaimIds.length > 0 && diagnostics.length === 0
  return {
    selection: {
      schemaVersion: '1',
      selectedClaimIds,
      ...(summaries.length > 0 ? { summaries } : {}),
    },
    diagnostics,
    invalidSelections,
    valid,
  }
}
