import type { DesignEvidence } from '../../core/design-evidence/types'

export interface EvidenceHighlightRect {
  x: number
  y: number
  width: number
  height: number
}

export interface EvidenceLightboxTarget {
  imageIndex: number
  rect: EvidenceHighlightRect
  label: string
}

export interface EvidenceDetailResolution {
  id: string
  kind: string
  fields: Array<{ key: string; value: string }>
}

export type EvidenceOpenResolution =
  { type: 'lightbox'; target: EvidenceLightboxTarget } | { type: 'detail'; detail: EvidenceDetailResolution }

export function resolveEvidenceOpen(
  evidence: DesignEvidence,
  screenshots: Array<{ path: string }>,
  evidenceId: string,
): EvidenceOpenResolution {
  const item =
    evidence.sections.find((candidate) => candidate.id === evidenceId) ||
    evidence.components.find((candidate) => candidate.id === evidenceId) ||
    evidence.layoutNodes.find((candidate) => candidate.id === evidenceId) ||
    evidence.mediaLayers.find((candidate) => candidate.id === evidenceId)
  const interaction = evidence.interactionObservations.find((candidate) => candidate.id === evidenceId)
  const responsive = evidence.responsiveObservations.find((candidate) => candidate.id === evidenceId)
  const topologyLayer = evidence.topology.globalLayers.find((candidate) => candidate.id === evidenceId)
  const referencedSectionId =
    interaction?.sectionId ||
    responsive?.sectionId ||
    topologyLayer?.evidenceRefs.find((reference) => reference.startsWith('section-'))
  const section = referencedSectionId
    ? evidence.sections.find((candidate) => candidate.id === referencedSectionId)
    : undefined
  const directPage = evidence.pages.find((candidate) => candidate.id === evidenceId)
  const imagePage = evidence.pages.find((candidate) => candidate.images.some((image) => image.id === evidenceId))
  const image = imagePage?.images.find((candidate) => candidate.id === evidenceId)
  const target = item || section
  const page = directPage || imagePage || evidence.pages.find((candidate) => candidate.id === target?.pageId)
  const overviewImage = page?.images.find((candidate) => candidate.kind === 'overview')
  const imageIndex = overviewImage ? screenshots.findIndex((screenshot) => screenshot.path === overviewImage.path) : -1
  const rect = target?.rect || image?.sourceRect || (directPage ? { x: 0, y: 0, width: 1, height: 1 } : undefined)
  if (page && imageIndex >= 0 && rect) {
    return { type: 'lightbox', target: { imageIndex, rect, label: evidenceId } }
  }
  const field = (key: string, value?: string) => (value ? [{ key, value }] : [])
  return {
    type: 'detail',
    detail: {
      id: evidenceId,
      kind: evidenceId.split('-')[0] || 'unknown',
      fields: [
        ...field('role', item?.role || topologyLayer?.role),
        ...field(
          'layoutMode',
          (item && 'layoutMode' in item ? item.layoutMode : undefined) || topologyLayer?.layoutMode,
        ),
        ...field('driver', interaction?.driver),
        ...field('trigger', interaction?.trigger.kind),
        ...field(
          'changed',
          interaction?.changedProperties.length ? interaction.changedProperties.join(', ') : undefined,
        ),
        ...field('changeType', responsive?.changeType),
        ...field('summary', responsive?.summary),
        ...field('url', page?.url),
        ...field('viewport', page?.viewport),
        ...field('section', referencedSectionId),
      ],
    },
  }
}
