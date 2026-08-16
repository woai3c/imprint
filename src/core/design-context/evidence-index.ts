import type { DesignEvidence } from '../design-evidence/types.js'

export function listEvidenceIds(evidence: DesignEvidence): Set<string> {
  return new Set([
    ...evidence.pages.map((page) => page.id),
    ...evidence.pages.flatMap((page) => page.images.map((image) => image.id)),
    ...evidence.sections.map((section) => section.id),
    ...evidence.components.map((component) => component.id),
    ...evidence.layoutNodes.map((node) => node.id),
    ...evidence.interactionObservations.map((observation) => observation.id),
    ...evidence.responsiveObservations.map((observation) => observation.id),
    ...evidence.mediaLayers.map((media) => media.id),
    ...evidence.topology.globalLayers.map((layer) => layer.id),
    ...evidence.topology.crossPagePatternIds,
  ])
}

export function listEvidenceTokenRefs(evidence: DesignEvidence): Set<string> {
  return new Set([
    ...evidence.sections.flatMap((section) => section.tokenRefs),
    ...evidence.components.flatMap((component) => component.tokenRefs),
    ...evidence.layoutNodes.flatMap((node) => node.tokenRefs),
  ])
}
