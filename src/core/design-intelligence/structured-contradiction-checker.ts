import {
  classifyComponentVariant,
  hasVisibleBorder,
  hasVisibleShadow,
  isPillRadius,
} from '../analyzer/component-detect.js'
import type { ComponentType } from '../analyzer/component-detect.js'
import { focusIndicatorVisibility } from '../design-evidence/interaction-visibility.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { coreT } from '../i18n/index.js'
import { DESIGN_ASSERTION_DIMENSIONS } from './assertion-schema.js'
import type { DesignClaim, DesignClaimAssertion, DesignProfile } from './types.js'

interface StructuredContradictionCheckResult {
  profile: DesignProfile
  rejected: string[]
  requiredFallbackUsed: boolean
}

function canonicalPageUrl(value: string): string {
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return value
  }
}

function assertionBoolean(value: DesignClaimAssertion['value']): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function assertionString(value: DesignClaimAssertion['value']): string | null {
  return typeof value === 'string' ? value : null
}

function changedToHidden(changes: NonNullable<DesignEvidence['responsiveObservations'][number]['changes']>): boolean {
  return Object.entries(changes).some(([property, change]) => {
    if (change.from === change.to) return false
    const normalizedProperty = property.split('.').at(-1)?.toLowerCase()
    const normalizedValue = String(change.to).toLowerCase()
    return (
      (normalizedProperty === 'display' && normalizedValue === 'none') ||
      (normalizedProperty === 'visibility' && ['hidden', 'collapse'].includes(normalizedValue))
    )
  })
}

export function checkStructuredProfileAssertions(
  inputProfile: DesignProfile,
  evidence: DesignEvidence,
): StructuredContradictionCheckResult {
  const profile = structuredClone(inputProfile)
  const rejected: string[] = []
  const hardRejectedClaims = new WeakSet<object>()
  let requiredFallbackUsed = false
  const pagesById = new Map(evidence.pages.map((page) => [page.id, page]))
  const sectionsById = new Map(evidence.sections.map((section) => [section.id, section]))
  const componentsById = new Map(evidence.components.map((component) => [component.id, component]))
  const interactionsById = new Map(evidence.interactionObservations.map((observation) => [observation.id, observation]))
  const responsiveById = new Map(evidence.responsiveObservations.map((observation) => [observation.id, observation]))
  const pageByEvidenceId = new Map<string, DesignEvidence['pages'][number]>()
  const knownEvidenceIds = new Set<string>()
  const registerPage = (evidenceId: string, pageId: string) => {
    knownEvidenceIds.add(evidenceId)
    const page = pagesById.get(pageId)
    if (page) pageByEvidenceId.set(evidenceId, page)
  }
  const registerSectionOwner = (evidenceId: string, sectionId: string) => {
    const section = sectionsById.get(sectionId)
    if (section) registerPage(evidenceId, section.pageId)
  }

  for (const page of evidence.pages) {
    registerPage(page.id, page.id)
    page.images.forEach((image) => registerPage(image.id, page.id))
  }
  evidence.sections.forEach((section) => registerSectionOwner(section.id, section.id))
  evidence.components.forEach((component) => registerSectionOwner(component.id, component.sectionId))
  evidence.layoutNodes.forEach((node) => registerSectionOwner(node.id, node.sectionId))
  evidence.interactionObservations.forEach((observation) => registerSectionOwner(observation.id, observation.sectionId))
  evidence.responsiveObservations.forEach((observation) => registerSectionOwner(observation.id, observation.sectionId))
  evidence.mediaLayers.forEach((media) => registerSectionOwner(media.id, media.sectionId))
  evidence.pseudoElements?.forEach((pseudo) => registerSectionOwner(pseudo.id, pseudo.sectionId))
  evidence.topology.globalLayers.forEach((layer) => registerPage(layer.id, layer.pageId))

  const knownTokenRefs = new Set([
    ...evidence.sections.flatMap((section) => section.tokenRefs),
    ...evidence.components.flatMap((component) => component.tokenRefs),
    ...evidence.layoutNodes.flatMap((node) => node.tokenRefs),
  ])
  const tokenOwners = new Map<string, Set<string>>()
  const registerTokens = (evidenceId: string, tokenRefs: string[]) => {
    for (const tokenRef of tokenRefs) {
      const owners = tokenOwners.get(tokenRef) || new Set<string>()
      owners.add(evidenceId)
      tokenOwners.set(tokenRef, owners)
    }
  }
  evidence.sections.forEach((section) => registerTokens(section.id, section.tokenRefs))
  evidence.components.forEach((component) => registerTokens(component.id, component.tokenRefs))
  evidence.layoutNodes.forEach((node) => registerTokens(node.id, node.tokenRefs))

  const componentContext = (component: DesignEvidence['components'][number]) => {
    const page = pagesById.get(component.pageId)
    const pageWidth = page?.contentWidth || page?.viewportWidth
    const pageHeight = page?.contentHeight || page?.viewportHeight
    return {
      tokenRefs: component.tokenRefs,
      primaryColor: evidence.tokens.colors.primary,
      role: component.role,
      elementKind: component.elementKind,
      ...(pageWidth ? { widthPx: component.rect.width * pageWidth } : {}),
      ...(pageHeight ? { heightPx: component.rect.height * pageHeight } : {}),
    }
  }

  const validateScope = (assertion: DesignClaimAssertion): boolean => {
    if (assertion.scope !== 'cross-page') return true
    const pageUrls = new Set(
      assertion.evidenceIds
        .map((evidenceId) => pageByEvidenceId.get(evidenceId))
        .filter((page): page is DesignEvidence['pages'][number] => Boolean(page))
        .map((page) => canonicalPageUrl(page.url)),
    )
    return pageUrls.size >= 2
  }

  const validateComponentAssertion = (assertion: DesignClaimAssertion): boolean => {
    const components = assertion.evidenceIds.flatMap((evidenceId) => {
      const component = componentsById.get(evidenceId)
      return component ? [component] : []
    })
    const matching = components.filter((component) => component.type === assertion.target)
    if (matching.length === 0) return false
    if (assertion.predicate === 'present') return assertion.value === undefined
    if (assertion.predicate === 'variant') {
      const expected = assertionString(assertion.value)
      return Boolean(
        expected &&
        matching.some(
          (component) =>
            classifyComponentVariant(component.type as ComponentType, component.styles, componentContext(component)) ===
            expected,
        ),
      )
    }
    if (assertion.predicate === 'corner-shape') {
      const expected = assertionString(assertion.value)
      return Boolean(
        expected &&
        matching.some((component) => {
          const shape = isPillRadius(component.styles, componentContext(component))
            ? 'pill'
            : component.styles.borderRadius && /[1-9]/.test(component.styles.borderRadius)
              ? 'rounded'
              : 'sharp'
          return shape === expected
        }),
      )
    }
    if (assertion.predicate === 'border-visible') {
      const expected = assertionBoolean(assertion.value)
      return expected !== null && matching.some((component) => hasVisibleBorder(component.styles.border) === expected)
    }
    if (assertion.predicate === 'shadow-visible') {
      const expected = assertionBoolean(assertion.value)
      return (
        expected !== null && matching.some((component) => hasVisibleShadow(component.styles.boxShadow) === expected)
      )
    }
    return false
  }

  const validateSectionAssertion = (assertion: DesignClaimAssertion): boolean => {
    const sections = assertion.evidenceIds.flatMap((evidenceId) => {
      const section = sectionsById.get(evidenceId)
      return section ? [section] : []
    })
    const matching = sections.filter((section) => section.role === assertion.target)
    if (matching.length === 0) return false
    if (assertion.predicate === 'present') return assertion.value === undefined
    if (assertion.predicate === 'layout-mode') {
      const expected = assertionString(assertion.value)
      return Boolean(expected && matching.some((section) => section.layoutMode === expected))
    }
    if (assertion.predicate === 'ordered-before') {
      const nextRole = assertionString(assertion.value)
      if (!nextRole) return false
      return matching.some((first) =>
        sections.some(
          (second) => second.pageId === first.pageId && second.role === nextRole && second.order > first.order,
        ),
      )
    }
    return false
  }

  const validateInteractionAssertion = (assertion: DesignClaimAssertion): boolean => {
    const observations = assertion.evidenceIds.flatMap((evidenceId) => {
      const observation = interactionsById.get(evidenceId)
      return observation ? [observation] : []
    })
    const matching = observations.filter((observation) => observation.driver === assertion.target)
    if (matching.length === 0) return false
    if (assertion.predicate === 'observed') return assertion.value === undefined
    if (assertion.predicate === 'executed') return matching.some((observation) => observation.safety === 'safe-active')
    if (assertion.predicate === 'property-change') {
      return Boolean(
        assertion.property &&
        matching.some((observation) => observation.changedProperties.includes(assertion.property!)),
      )
    }
    if (assertion.predicate === 'visible-indicator') {
      const expected = assertionBoolean(assertion.value)
      return (
        assertion.target === 'focus' &&
        expected !== null &&
        matching.some((observation) => focusIndicatorVisibility(observation) === expected)
      )
    }
    return false
  }

  const validateResponsiveAssertion = (assertion: DesignClaimAssertion): boolean => {
    if (assertion.predicate === 'horizontal-overflow') {
      return assertion.evidenceIds.some((evidenceId) => pageByEvidenceId.get(evidenceId)?.horizontalOverflow === true)
    }
    const observations = assertion.evidenceIds.flatMap((evidenceId) => {
      const observation = responsiveById.get(evidenceId)
      return observation ? [observation] : []
    })
    const matching = observations.filter((observation) => {
      const section = sectionsById.get(observation.sectionId)
      return (
        assertion.target === 'viewport' ||
        assertion.target === observation.sectionId ||
        assertion.target === section?.role
      )
    })
    if (matching.length === 0) return false
    if (assertion.predicate === 'property-change') {
      return Boolean(
        assertion.property &&
        matching.some((observation) => observation.changedProperties.includes(assertion.property!)),
      )
    }
    if (assertion.predicate === 'visibility-hidden') {
      return matching.some((observation) => changedToHidden(observation.changes || {}))
    }
    if (assertion.predicate === 'reflow') {
      return matching.some((observation) => {
        if (!['reflow', 'mixed'].includes(observation.changeType)) return false
        return Object.entries(observation.changes || {}).some(
          ([property, change]) =>
            change.from !== change.to &&
            ['gridTemplateColumns', 'childGridTemplateColumns', 'layoutMode'].includes(property),
        )
      })
    }
    return false
  }

  const validateAssertion = (assertion: DesignClaimAssertion, claim: DesignClaim): string | null => {
    if (assertion.evidenceIds.length === 0) return 'missing-bound-evidence'
    if (assertion.evidenceIds.some((evidenceId) => !knownEvidenceIds.has(evidenceId))) return 'unknown-evidence'
    const claimEvidenceIds = new Set(claim.evidence.map((reference) => reference.evidenceId))
    if (assertion.evidenceIds.some((evidenceId) => !claimEvidenceIds.has(evidenceId))) return 'unbound-evidence'
    if (!validateScope(assertion)) return 'unsupported-cross-page-scope'
    if (assertion.kind === 'evidence') {
      return assertion.predicate === 'supports' &&
        (DESIGN_ASSERTION_DIMENSIONS as readonly string[]).includes(assertion.target)
        ? null
        : 'unsupported-evidence-assertion'
    }
    if (assertion.kind === 'component') {
      return validateComponentAssertion(assertion) ? null : 'component-fact-mismatch'
    }
    if (assertion.kind === 'section') return validateSectionAssertion(assertion) ? null : 'section-fact-mismatch'
    if (assertion.kind === 'interaction') {
      return validateInteractionAssertion(assertion) ? null : 'interaction-fact-mismatch'
    }
    if (assertion.kind === 'responsive') {
      return validateResponsiveAssertion(assertion) ? null : 'responsive-fact-mismatch'
    }
    if (assertion.kind === 'token') {
      const owners = tokenOwners.get(assertion.target)
      const observed =
        assertion.predicate === 'observed' &&
        knownTokenRefs.has(assertion.target) &&
        assertion.evidenceIds.some((evidenceId) => owners?.has(evidenceId))
      return observed ? null : 'token-fact-mismatch'
    }
    return 'unsupported-assertion-kind'
  }

  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`))
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const isClaim =
      typeof record.statement === 'string' &&
      typeof record.implementation === 'string' &&
      typeof record.confidence === 'string' &&
      Array.isArray(record.evidence)
    if (isClaim) {
      const claim = record as unknown as DesignClaim
      const assertions = claim.assertions || []
      if (assertions.length === 0) {
        hardRejectedClaims.add(record)
        rejected.push(`${path}:missing-structured-assertion`)
      }
      for (const [index, assertion] of assertions.entries()) {
        const mismatch = validateAssertion(assertion, claim)
        if (!mismatch) continue
        hardRejectedClaims.add(record)
        rejected.push(`${path}.assertions.${index}:${mismatch}`)
      }
      const secondaryButtonEvidenceIds = assertions
        .filter(
          (assertion) =>
            assertion.kind === 'component' &&
            assertion.target === 'button' &&
            assertion.predicate === 'variant' &&
            assertion.value === 'secondary',
        )
        .flatMap((assertion) => assertion.evidenceIds)
        .filter((evidenceId) => Object.hasOwn(componentsById.get(evidenceId)?.styles || {}, 'border'))
      const borderVisibilityEvidenceIds = new Set(
        assertions
          .filter(
            (assertion) =>
              assertion.kind === 'component' &&
              assertion.target === 'button' &&
              assertion.predicate === 'border-visible' &&
              typeof assertion.value === 'boolean',
          )
          .flatMap((assertion) => assertion.evidenceIds),
      )
      if (secondaryButtonEvidenceIds.some((evidenceId) => !borderVisibilityEvidenceIds.has(evidenceId))) {
        hardRejectedClaims.add(record)
        rejected.push(`${path}:missing-secondary-border-assertion`)
      }

      const focusEvidenceIds = assertions
        .filter((assertion) => assertion.kind === 'interaction' && assertion.target === 'focus')
        .flatMap((assertion) => assertion.evidenceIds)
        .filter((evidenceId) => {
          const observation = interactionsById.get(evidenceId)
          return observation ? focusIndicatorVisibility(observation) !== null : false
        })
      const focusVisibilityEvidenceIds = new Set(
        assertions
          .filter(
            (assertion) =>
              assertion.kind === 'interaction' &&
              assertion.target === 'focus' &&
              assertion.predicate === 'visible-indicator' &&
              typeof assertion.value === 'boolean',
          )
          .flatMap((assertion) => assertion.evidenceIds),
      )
      if (focusEvidenceIds.some((evidenceId) => !focusVisibilityEvidenceIds.has(evidenceId))) {
        hardRejectedClaims.add(record)
        rejected.push(`${path}:missing-focus-visibility-assertion`)
      }
      if (claim.tokenRefs) {
        const citedEvidenceIds = new Set([
          ...claim.evidence.map((reference) => reference.evidenceId),
          ...assertions.flatMap((assertion) => assertion.evidenceIds),
        ])
        const known = claim.tokenRefs.filter((tokenRef) => knownTokenRefs.has(tokenRef))
        if (known.length !== claim.tokenRefs.length) rejected.push(`${path}:unknown-token-ref`)
        const cited = known.filter((tokenRef) =>
          [...(tokenOwners.get(tokenRef) || [])].some((evidenceId) => citedEvidenceIds.has(evidenceId)),
        )
        if (cited.length !== known.length) {
          rejected.push(`${path}:token-citation-mismatch-sanitized`)
          if (claim.confidence === 'high') claim.confidence = 'medium'
        }
        if (cited.length > 0) claim.tokenRefs = cited
        else delete claim.tokenRefs
      }
      const interactionEvidence = assertions
        .filter((assertion) => assertion.kind === 'interaction')
        .flatMap((assertion) => assertion.evidenceIds)
        .flatMap((evidenceId) => {
          const observation = interactionsById.get(evidenceId)
          return observation ? [observation] : []
        })
      if (
        claim.confidence === 'high' &&
        interactionEvidence.length > 0 &&
        interactionEvidence.every((observation) => observation.safety === 'passive')
      ) {
        claim.confidence = 'medium'
        rejected.push(`${path}:passive-interaction-confidence-sanitized`)
      }
    }
    Object.entries(record).forEach(([key, item]) => {
      if (
        !isClaim ||
        !['statement', 'implementation', 'confidence', 'evidence', 'tokenRefs', 'assertions'].includes(key)
      ) {
        visit(item, path ? `${path}.${key}` : key)
      }
    })
  }

  visit(profile, '')

  const replacementClaim = (claim: DesignClaim): DesignClaim => {
    const evidenceIds = claim.evidence
      .map((reference) => reference.evidenceId)
      .filter((evidenceId) => knownEvidenceIds.has(evidenceId))
      .slice(0, 2)
    return {
      statement: coreT(profile.language, 'intelligence.assertions.unsupportedStatement'),
      implementation: coreT(profile.language, 'intelligence.assertions.unsupportedImplementation'),
      confidence: 'low',
      evidence: claim.evidence.filter((reference) => evidenceIds.includes(reference.evidenceId)).slice(0, 2),
      assertions: [
        {
          kind: 'evidence',
          target: 'design-thesis',
          predicate: 'supports',
          scope: 'instance',
          evidenceIds,
        },
      ],
      ...(claim.tokenRefs && claim.tokenRefs.length > 0 ? { tokenRefs: claim.tokenRefs } : {}),
    }
  }

  const prune = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const item = value[index]
        if (item && typeof item === 'object' && hardRejectedClaims.has(item)) value.splice(index, 1)
        else prune(item)
      }
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    for (const [key, item] of Object.entries(record)) {
      if (item && typeof item === 'object' && hardRejectedClaims.has(item)) {
        if (['imagery', 'motion', 'scrollNarrative'].includes(key)) delete record[key]
        else {
          requiredFallbackUsed = true
          record[key] = replacementClaim(item as DesignClaim)
        }
      } else {
        prune(item)
      }
    }
  }
  prune(profile)

  return { profile, rejected, requiredFallbackUsed }
}
