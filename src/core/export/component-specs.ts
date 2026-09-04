import { resolveComponentReuseEvidence } from '../analyzer/component-detect.js'
import type { ComponentPattern } from '../analyzer/component-detect.js'
import {
  buildCanonicalComponentCatalog,
  canonicalComponentEvidenceSample,
  canonicalComponentRecipeStyles,
  canonicalComponentSharedTokenRefs,
  canonicalComponentVariant,
  canonicalRepresentativeComponents,
  consensusComponentRole,
  isActionableComponentPattern,
} from '../design-context/component-catalog.js'
import type { DesignEvidence } from '../design-evidence/types.js'

export interface ComponentSpec {
  component: string
  variant?: string
  role?: string
  semanticIdentity?: string
  visualTreatment?: string
  usageContext?: string
  sourceInstances: number
  pageCount: number
  identityConfidence: number
  reuseConfidence: number
  reuseScope: NonNullable<ComponentPattern['reuseScope']>
  styles: Record<string, string[]>
  tokenRefs: string[]
  stateRefs: string[]
  evidenceRefs: string[]
}

export function buildComponentSpecs(evidence: DesignEvidence): ComponentSpec[] {
  return buildCanonicalComponentCatalog(evidence)
    .map((pattern) => {
      const representativeComponents = canonicalRepresentativeComponents(pattern, evidence)
      const sharedTokenRefs = canonicalComponentSharedTokenRefs(representativeComponents)
      return { pattern, representativeComponents, sharedTokenRefs }
    })
    .filter(({ pattern, sharedTokenRefs }) => isActionableComponentPattern(pattern, sharedTokenRefs))
    .map(({ pattern, representativeComponents, sharedTokenRefs }) => {
      const reuse = resolveComponentReuseEvidence(pattern)
      const role = consensusComponentRole(pattern)
      const variant = canonicalComponentVariant(pattern)
      return {
        component: pattern.type,
        variant,
        ...(role ? { role } : {}),
        ...(pattern.semanticIdentities?.length === 1 ? { semanticIdentity: pattern.semanticIdentities[0] } : {}),
        ...(pattern.visualTreatments?.length === 1 ? { visualTreatment: pattern.visualTreatments[0] } : {}),
        ...(pattern.usageContexts?.length === 1 ? { usageContext: pattern.usageContexts[0] } : {}),
        sourceInstances: reuse.styleObservationCount,
        pageCount: reuse.pageCount,
        identityConfidence: pattern.confidence,
        reuseConfidence: reuse.reuseConfidence,
        reuseScope: reuse.reuseScope,
        styles: Object.fromEntries(
          Object.entries(canonicalComponentRecipeStyles(pattern.styles)).map(([property, value]) => [
            property,
            [value],
          ]),
        ),
        tokenRefs: sharedTokenRefs.slice(0, 10),
        stateRefs: [...new Set(representativeComponents.flatMap((component) => component.stateRefs))].sort(),
        evidenceRefs: canonicalComponentEvidenceSample(pattern, evidence).map((component) => component.id),
      }
    })
}

export function generateComponentSpecsJson(evidence: DesignEvidence): string {
  return JSON.stringify({ schemaVersion: '2', components: buildComponentSpecs(evidence) }, null, 2)
}
