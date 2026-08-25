import type { ComponentEvidence, DesignEvidence, SectionEvidence } from '../design-evidence/types.js'

export const ENTITY_MATCHING_SCHEMA_VERSION = '1' as const

export type CrossCaptureEntityKind = 'section' | 'component'
export type CrossCaptureEntityStatus = 'matched' | 'unmatched' | 'ambiguous'
export type CrossCaptureEntityMatchReason =
  | 'exact-semantic-signature'
  | 'unique-role'
  | 'duplicate-semantic-candidates'
  | 'missing-counterpart'
  | 'parent-section-unresolved'

export interface CrossCaptureEntityMatch {
  kind: CrossCaptureEntityKind
  pageKey: string
  status: CrossCaptureEntityStatus
  confidence: 'high' | 'medium' | 'none'
  reason: CrossCaptureEntityMatchReason
  referenceIds: string[]
  targetIds: string[]
}

export interface CrossCaptureEntityMatchingResult {
  schemaVersion: typeof ENTITY_MATCHING_SCHEMA_VERSION
  sections: CrossCaptureEntityMatch[]
  components: CrossCaptureEntityMatch[]
  summary: {
    sections: EntityMatchingSummary
    components: EntityMatchingSummary
  }
  limitations: ['identity-only', 'ambiguous-and-unmatched-are-not-drift']
}

export interface EntityMatchingSummary {
  matchedPairs: number
  highConfidencePairs: number
  mediumConfidencePairs: number
  ambiguousGroups: number
  unmatchedEntities: number
}

function routeIdentity(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}`
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/\/+$/, '') || value
  }
}

function pageKey(url: string, viewport: string): string {
  return `${routeIdentity(url)}::${viewport}`
}

function grouped<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFor(item)
    const values = result.get(key)
    if (values) values.push(item)
    else result.set(key, [item])
  }
  return result
}

function sortedIds(items: Array<{ id: string }>): string[] {
  return items.map(({ id }) => id).sort()
}

function unresolvedCandidateMatch(
  kind: CrossCaptureEntityKind,
  key: string,
  referenceCandidates: Array<{ id: string }>,
  targetCandidates: Array<{ id: string }>,
): CrossCaptureEntityMatch {
  const ambiguous = referenceCandidates.length > 0 && targetCandidates.length > 0
  return {
    kind,
    pageKey: key,
    status: ambiguous ? 'ambiguous' : 'unmatched',
    confidence: 'none',
    reason: ambiguous ? 'duplicate-semantic-candidates' : 'missing-counterpart',
    referenceIds: sortedIds(referenceCandidates),
    targetIds: sortedIds(targetCandidates),
  }
}

function sectionSignature(section: SectionEvidence, evidence: DesignEvidence): string {
  const sectionsById = new Map(evidence.sections.map((item) => [item.id, item]))
  const parentRole = section.parentSectionId ? sectionsById.get(section.parentSectionId)?.role || 'unknown' : 'root'
  const componentDescriptors = evidence.components
    .filter((component) => component.sectionId === section.id)
    .map((component) => `${component.type}:${component.elementKind || ''}:${component.role || ''}`)
    .sort()
  return [section.role, section.layoutMode, parentRole, componentDescriptors.join(',')].join('|')
}

function componentSignature(component: ComponentEvidence): string {
  return [component.type, component.elementKind || '', component.role || ''].join('|')
}

function matchSectionsForPage(
  key: string,
  referenceSections: SectionEvidence[],
  targetSections: SectionEvidence[],
  referenceEvidence: DesignEvidence,
  targetEvidence: DesignEvidence,
): CrossCaptureEntityMatch[] {
  const matches: CrossCaptureEntityMatch[] = []
  const remainingReference = new Map(referenceSections.map((section) => [section.id, section]))
  const remainingTarget = new Map(targetSections.map((section) => [section.id, section]))
  const referenceSignatures = grouped(referenceSections, (section) => sectionSignature(section, referenceEvidence))
  const targetSignatures = grouped(targetSections, (section) => sectionSignature(section, targetEvidence))

  for (const signature of [...new Set([...referenceSignatures.keys(), ...targetSignatures.keys()])].sort()) {
    const referenceCandidates = referenceSignatures.get(signature) || []
    const targetCandidates = targetSignatures.get(signature) || []
    if (referenceCandidates.length !== 1 || targetCandidates.length !== 1) continue
    const reference = referenceCandidates[0]
    const target = targetCandidates[0]
    matches.push({
      kind: 'section',
      pageKey: key,
      status: 'matched',
      confidence: 'high',
      reason: 'exact-semantic-signature',
      referenceIds: [reference.id],
      targetIds: [target.id],
    })
    remainingReference.delete(reference.id)
    remainingTarget.delete(target.id)
  }

  const referenceRoles = grouped([...remainingReference.values()], (section) => section.role)
  const targetRoles = grouped([...remainingTarget.values()], (section) => section.role)
  for (const role of [...new Set([...referenceRoles.keys(), ...targetRoles.keys()])].sort()) {
    const referenceCandidates = referenceRoles.get(role) || []
    const targetCandidates = targetRoles.get(role) || []
    if (referenceCandidates.length === 1 && targetCandidates.length === 1) {
      matches.push({
        kind: 'section',
        pageKey: key,
        status: 'matched',
        confidence: 'medium',
        reason: 'unique-role',
        referenceIds: [referenceCandidates[0].id],
        targetIds: [targetCandidates[0].id],
      })
    } else {
      matches.push(unresolvedCandidateMatch('section', key, referenceCandidates, targetCandidates))
    }
  }

  return matches
}

function matchComponentsWithinSections(
  key: string,
  sectionMatch: CrossCaptureEntityMatch,
  referenceEvidence: DesignEvidence,
  targetEvidence: DesignEvidence,
): CrossCaptureEntityMatch[] {
  const referenceComponents = referenceEvidence.components.filter((component) =>
    sectionMatch.referenceIds.includes(component.sectionId),
  )
  const targetComponents = targetEvidence.components.filter((component) =>
    sectionMatch.targetIds.includes(component.sectionId),
  )
  if (referenceComponents.length === 0 && targetComponents.length === 0) return []

  if (sectionMatch.status !== 'matched') {
    return [
      {
        kind: 'component',
        pageKey: key,
        status:
          referenceComponents.length > 0 && targetComponents.length > 0 && sectionMatch.status === 'ambiguous'
            ? 'ambiguous'
            : 'unmatched',
        confidence: 'none',
        reason:
          sectionMatch.status === 'ambiguous' && referenceComponents.length > 0 && targetComponents.length > 0
            ? 'parent-section-unresolved'
            : 'missing-counterpart',
        referenceIds: sortedIds(referenceComponents),
        targetIds: sortedIds(targetComponents),
      },
    ]
  }

  const referenceGroups = grouped(referenceComponents, componentSignature)
  const targetGroups = grouped(targetComponents, componentSignature)
  const matches: CrossCaptureEntityMatch[] = []
  for (const signature of [...new Set([...referenceGroups.keys(), ...targetGroups.keys()])].sort()) {
    const referenceCandidates = referenceGroups.get(signature) || []
    const targetCandidates = targetGroups.get(signature) || []
    if (referenceCandidates.length === 1 && targetCandidates.length === 1) {
      matches.push({
        kind: 'component',
        pageKey: key,
        status: 'matched',
        confidence: 'high',
        reason: 'exact-semantic-signature',
        referenceIds: [referenceCandidates[0].id],
        targetIds: [targetCandidates[0].id],
      })
    } else {
      matches.push(unresolvedCandidateMatch('component', key, referenceCandidates, targetCandidates))
    }
  }
  return matches
}

function summarize(matches: CrossCaptureEntityMatch[]): EntityMatchingSummary {
  return {
    matchedPairs: matches.filter(({ status }) => status === 'matched').length,
    highConfidencePairs: matches.filter(({ status, confidence }) => status === 'matched' && confidence === 'high')
      .length,
    mediumConfidencePairs: matches.filter(({ status, confidence }) => status === 'matched' && confidence === 'medium')
      .length,
    ambiguousGroups: matches.filter(({ status }) => status === 'ambiguous').length,
    unmatchedEntities: matches
      .filter(({ status }) => status === 'unmatched')
      .reduce((count, match) => count + match.referenceIds.length + match.targetIds.length, 0),
  }
}

export function matchCrossCaptureEntities(
  referenceEvidence: DesignEvidence,
  targetEvidence: DesignEvidence,
): CrossCaptureEntityMatchingResult {
  const referencePagesByKey = new Map(
    referenceEvidence.pages.map((page) => [pageKey(page.url, page.viewport), page.id]),
  )
  const targetPagesByKey = new Map(targetEvidence.pages.map((page) => [pageKey(page.url, page.viewport), page.id]))
  const sections: CrossCaptureEntityMatch[] = []

  for (const key of [...new Set([...referencePagesByKey.keys(), ...targetPagesByKey.keys()])].sort()) {
    const referencePageId = referencePagesByKey.get(key)
    const targetPageId = targetPagesByKey.get(key)
    sections.push(
      ...matchSectionsForPage(
        key,
        referenceEvidence.sections.filter((section) => section.pageId === referencePageId),
        targetEvidence.sections.filter((section) => section.pageId === targetPageId),
        referenceEvidence,
        targetEvidence,
      ),
    )
  }

  const components = sections.flatMap((sectionMatch) =>
    matchComponentsWithinSections(sectionMatch.pageKey, sectionMatch, referenceEvidence, targetEvidence),
  )
  return {
    schemaVersion: ENTITY_MATCHING_SCHEMA_VERSION,
    sections,
    components,
    summary: { sections: summarize(sections), components: summarize(components) },
    limitations: ['identity-only', 'ambiguous-and-unmatched-are-not-drift'],
  }
}
