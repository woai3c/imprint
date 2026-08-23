import type { DesignToken } from '../analyzer/types.js'
import { resolveDesignTokenRef } from '../design-evidence/token-reference.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import type { DesignProfile } from './types.js'

export interface DesignProfileTokenReferenceIntegrity {
  valid: boolean
  errors: string[]
}

/** Validates every machine-readable tokenRefs field before a profile is persisted or exported. */
export function validateDesignProfileTokenReferences(
  profile: DesignProfile,
  tokens: DesignToken,
  evidence?: DesignEvidence,
): DesignProfileTokenReferenceIntegrity {
  const errors: string[] = []
  const tokenRefsByOwner = new Map(
    evidence
      ? [...evidence.sections, ...evidence.components, ...evidence.layoutNodes].map(
          (owner) => [owner.id, new Set(owner.tokenRefs)] as const,
        )
      : [],
  )
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`
      if (key === 'tokenRefs' && Array.isArray(child)) {
        const record = value as Record<string, unknown>
        const citedEvidenceIds = [
          ...(Array.isArray(record.evidence)
            ? record.evidence.flatMap((reference) => {
                if (!reference || typeof reference !== 'object') return []
                const evidenceId = (reference as Record<string, unknown>).evidenceId
                return typeof evidenceId === 'string' ? [evidenceId] : []
              })
            : []),
          ...(Array.isArray(record.evidenceRefs)
            ? record.evidenceRefs.filter((evidenceId): evidenceId is string => typeof evidenceId === 'string')
            : []),
        ]
        child.forEach((ref, index) => {
          if (typeof ref !== 'string' || resolveDesignTokenRef(tokens, ref) === null) {
            errors.push(`${childPath}.${index}:unresolved-token-ref(${String(ref)})`)
          } else if (evidence && !citedEvidenceIds.some((evidenceId) => tokenRefsByOwner.get(evidenceId)?.has(ref))) {
            errors.push(`${childPath}.${index}:token-ref-without-cited-owner(${ref})`)
          }
        })
        continue
      }
      visit(child, childPath)
    }
  }
  visit(profile, 'profile')
  return { valid: errors.length === 0, errors }
}
