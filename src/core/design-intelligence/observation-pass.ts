import { findJsonPayload } from '../ai/json-payload.js'
import { listEvidencePackageIds } from './evidence-selector.js'
import type { EvidencePackage, SectionObservation } from './types.js'

const HTML_OR_URL = /<[^>]+>|https?:\/\/|javascript:|```/i

function isSafeText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= maxLength && !HTML_OR_URL.test(value)
}

export function extractObservationCandidate(response: string): unknown {
  return findJsonPayload(response, (candidate) => Array.isArray(candidate.observations))
}

export interface ObservationValidationResult {
  observations: SectionObservation[]
  rejected: string[]
}

export function validateSectionObservations(
  value: unknown,
  evidencePackage: EvidencePackage,
): ObservationValidationResult {
  const rejected: string[] = []
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { observations?: unknown }).observations)
  ) {
    return { observations: [], rejected: ['root:missing-observations'] }
  }
  const validSectionIds = new Set(evidencePackage.selectedSectionIds)
  const validEvidenceIds = listEvidencePackageIds(evidencePackage)
  const candidates = (value as { observations: unknown[] }).observations.slice(0, 48)
  const observations: SectionObservation[] = []
  const seen = new Set<string>()
  candidates.forEach((candidate, index) => {
    if (typeof candidate !== 'object' || candidate === null) {
      rejected.push(`observations.${index}:not-an-object`)
      return
    }
    const entry = candidate as Record<string, unknown>
    if (typeof entry.sectionId !== 'string' || !validSectionIds.has(entry.sectionId) || seen.has(entry.sectionId)) {
      rejected.push(`observations.${index}:invalid-section-id`)
      return
    }
    if (!isSafeText(entry.structure, 360) || !isSafeText(entry.visualRelations, 360)) {
      rejected.push(`observations.${index}:invalid-structure`)
      return
    }
    const evidenceIds = Array.isArray(entry.evidenceIds)
      ? entry.evidenceIds.filter(
          (evidenceId): evidenceId is string => typeof evidenceId === 'string' && validEvidenceIds.has(evidenceId),
        )
      : []
    if (evidenceIds.length === 0) {
      rejected.push(`observations.${index}:missing-evidence`)
      return
    }
    seen.add(entry.sectionId)
    observations.push({
      sectionId: entry.sectionId,
      structure: entry.structure.trim(),
      visualRelations: entry.visualRelations.trim(),
      states: isSafeText(entry.states, 360) ? entry.states.trim() : '',
      limitations: isSafeText(entry.limitations, 240) ? entry.limitations.trim() : '',
      evidenceIds: [...new Set(evidenceIds)].slice(0, 12),
    })
  })
  return { observations, rejected }
}
