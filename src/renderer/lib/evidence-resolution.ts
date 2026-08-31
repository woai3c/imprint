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
  cropPath?: string
}

export interface EvidenceDetailResolution {
  id: string
  kind: string
  fields: Array<{ key: string; value: string }>
}

export type EvidenceOpenResolution =
  { type: 'lightbox'; target: EvidenceLightboxTarget } | { type: 'detail'; detail: EvidenceDetailResolution }

function containsRect(outer: EvidenceHighlightRect, inner: EvidenceHighlightRect): boolean {
  const tolerance = 1e-9
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

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
  const interactionTarget = interaction
    ? evidence.components.find((candidate) => candidate.id === interaction.targetId)
    : undefined
  const directPage = evidence.pages.find((candidate) => candidate.id === evidenceId)
  const imagePage = evidence.pages.find((candidate) => candidate.images.some((image) => image.id === evidenceId))
  const image = imagePage?.images.find((candidate) => candidate.id === evidenceId)
  const target = item || interactionTarget || section
  const page = directPage || imagePage || evidence.pages.find((candidate) => candidate.id === target?.pageId)
  const referencedImageIds =
    (item && 'evidenceRefs' in item ? item.evidenceRefs : undefined) ||
    interaction?.evidenceRefs ||
    responsive?.evidenceRefs ||
    topologyLayer?.evidenceRefs
  const resolveVisual = (
    candidatePage: DesignEvidence['pages'][number],
    rect: EvidenceHighlightRect,
    targetSectionId?: string,
    directImageId?: string,
  ): EvidenceOpenResolution | undefined => {
    const directCrop = candidatePage.images.find(
      (candidate) => candidate.id === directImageId && candidate.kind !== 'overview' && candidate.sourceRect,
    )
    const crop =
      directCrop ||
      candidatePage.images
        .filter(
          (candidate) =>
            candidate.kind !== 'overview' &&
            candidate.sourceRect &&
            (!candidate.sectionId || candidate.sectionId === targetSectionId) &&
            containsRect(candidate.sourceRect, rect) &&
            (referencedImageIds === undefined || referencedImageIds.includes(candidate.id)),
        )
        .sort((first, second) => {
          const firstSectionSpecific = first.sectionId === targetSectionId ? 1 : 0
          const secondSectionSpecific = second.sectionId === targetSectionId ? 1 : 0
          const firstArea = first.sourceRect!.width * first.sourceRect!.height
          const secondArea = second.sourceRect!.width * second.sourceRect!.height
          return (
            secondSectionSpecific - firstSectionSpecific || firstArea - secondArea || first.id.localeCompare(second.id)
          )
        })[0]
    if (crop?.sourceRect) {
      const source = crop.sourceRect
      const existingImageIndex = screenshots.findIndex((screenshot) => screenshot.path === crop.path)
      return {
        type: 'lightbox',
        target: {
          imageIndex: existingImageIndex >= 0 ? existingImageIndex : 0,
          rect: {
            x: (rect.x - source.x) / source.width,
            y: (rect.y - source.y) / source.height,
            width: rect.width / source.width,
            height: rect.height / source.height,
          },
          label: evidenceId,
          ...(existingImageIndex < 0 ? { cropPath: crop.path } : {}),
        },
      }
    }
    const overviewImage = candidatePage.images.find((candidate) => candidate.kind === 'overview')
    const imageIndex = overviewImage
      ? screenshots.findIndex((screenshot) => screenshot.path === overviewImage.path)
      : -1
    if (imageIndex >= 0) return { type: 'lightbox', target: { imageIndex, rect, label: evidenceId } }
    return undefined
  }

  if (imagePage && image) {
    const resolution = resolveVisual(
      imagePage,
      image.sourceRect || { x: 0, y: 0, width: 1, height: 1 },
      image.sectionId,
      image.id,
    )
    if (resolution) return resolution
  } else if (directPage) {
    const resolution = resolveVisual(directPage, { x: 0, y: 0, width: 1, height: 1 })
    if (resolution) return resolution
  } else {
    const targetCandidates = [
      ...(target ? [target] : []),
      ...(responsive
        ? responsive.evidenceRefs.flatMap((reference) => {
            const candidate = evidence.sections.find((sectionCandidate) => sectionCandidate.id === reference)
            return candidate ? [candidate] : []
          })
        : []),
    ]
    const seenTargetIds = new Set<string>()
    for (const candidate of targetCandidates) {
      if (seenTargetIds.has(candidate.id)) continue
      seenTargetIds.add(candidate.id)
      const candidatePage = evidence.pages.find((pageCandidate) => pageCandidate.id === candidate.pageId)
      if (!candidatePage) continue
      const targetSectionId = 'sectionId' in candidate ? candidate.sectionId : candidate.id
      const resolution = resolveVisual(candidatePage, candidate.rect, targetSectionId)
      if (resolution) return resolution
    }
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
