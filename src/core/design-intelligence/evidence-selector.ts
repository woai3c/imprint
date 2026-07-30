import { createHash } from 'node:crypto'

import type { DesignEvidence } from '../design-evidence/types.js'
import type { EvidencePackage, IntelligenceInputMode } from './types.js'

export interface EvidenceSelectionBudget {
  maxPages: number
  maxSections: number
  maxComponents: number
  maxLayoutNodes: number
  maxImages: number
}

const DEFAULT_BUDGET: EvidenceSelectionBudget = {
  maxPages: 3,
  maxSections: 24,
  maxComponents: 80,
  maxLayoutNodes: 120,
  maxImages: 6,
}

export function createEvidenceFingerprint(
  evidence: DesignEvidence,
  inputMode: IntelligenceInputMode,
  provider: string,
  model: string,
  selectedImageIds?: Iterable<string>,
  promptVersion = '1',
  profileSchemaVersion = '1',
): string {
  const selectedImages =
    inputMode === 'multimodal'
      ? new Set(selectedImageIds || selectEvidencePackage(evidence, inputMode).imageIds)
      : new Set<string>()
  const source = JSON.stringify({
    schemaVersion: evidence.schemaVersion,
    profileSchemaVersion,
    promptVersion,
    tokens: evidence.tokens,
    topology: evidence.topology,
    sections: evidence.sections,
    interactions: evidence.interactionObservations,
    responsive: evidence.responsiveObservations,
    images:
      inputMode === 'multimodal'
        ? evidence.pages.flatMap((page) =>
            page.images
              .filter((image) => selectedImages.has(image.id))
              .map((image) => ({ id: image.id, contentHash: image.contentHash })),
          )
        : [],
    provider,
    model,
  })
  return createHash('sha256').update(source).digest('hex')
}

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

export function listEvidencePackageIds(evidencePackage: EvidencePackage): Set<string> {
  const evidence = evidencePackage.evidence
  return new Set([
    ...evidence.pages.map((page) => page.id),
    ...evidence.pages.flatMap((page) => page.imageIds),
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

export function restrictEvidencePackageImages(
  evidencePackage: EvidencePackage,
  availableImageIds: Iterable<string>,
): EvidencePackage {
  if (evidencePackage.inputMode === 'structural-only') return evidencePackage
  const available = new Set(availableImageIds)
  const imageIds = evidencePackage.imageIds.filter((imageId) => available.has(imageId))
  if (imageIds.length === evidencePackage.imageIds.length) return evidencePackage
  return {
    ...evidencePackage,
    imageIds,
    evidence: {
      ...evidencePackage.evidence,
      pages: evidencePackage.evidence.pages.map((page) => ({
        ...page,
        imageIds: page.imageIds.filter((imageId) => available.has(imageId)),
      })),
    },
    omittedEvidence: [...evidencePackage.omittedEvidence, { kind: 'images', reason: 'budget' }],
  }
}

export function selectEvidencePackage(
  evidence: DesignEvidence,
  inputMode: IntelligenceInputMode,
  budget: Partial<EvidenceSelectionBudget> = {},
): EvidencePackage {
  const limits = { ...DEFAULT_BUDGET, ...budget }
  const pages = evidence.pages.slice(0, limits.maxPages)
  const selectedPageIds = pages.map((page) => page.id)
  const sections = evidence.sections
    .filter((section) => selectedPageIds.includes(section.pageId))
    .slice(0, limits.maxSections)
  const selectedSectionIds = sections.map((section) => section.id)
  const components = evidence.components
    .filter((component) => selectedSectionIds.includes(component.sectionId))
    .slice(0, limits.maxComponents)
  const layoutNodes = evidence.layoutNodes
    .filter((node) => selectedSectionIds.includes(node.sectionId))
    .slice(0, limits.maxLayoutNodes)
  const interactionObservations = evidence.interactionObservations
    .filter((observation) => selectedSectionIds.includes(observation.sectionId))
    .slice(0, 120)
  const responsiveObservations = evidence.responsiveObservations
    .filter(
      (observation) =>
        selectedSectionIds.includes(observation.sectionId) ||
        observation.evidenceRefs.some((reference) => selectedSectionIds.includes(reference)),
    )
    .slice(0, 120)
  const mediaLayers = evidence.mediaLayers.filter((media) => selectedSectionIds.includes(media.sectionId)).slice(0, 120)
  const imageIds =
    inputMode === 'multimodal'
      ? pages
          .flatMap((page) => page.images.filter((image) => image.kind === 'overview'))
          .concat(pages.flatMap((page) => page.images.filter((image) => image.kind === 'viewport-crop')))
          .concat(pages.flatMap((page) => page.images.filter((image) => image.kind === 'region-crop')))
          .slice(0, limits.maxImages)
          .map((image) => image.id)
      : []

  const omittedEvidence: EvidencePackage['omittedEvidence'] = []
  if (evidence.pages.length > pages.length) omittedEvidence.push({ kind: 'pages', reason: 'budget' })
  if (evidence.sections.length > sections.length) omittedEvidence.push({ kind: 'sections', reason: 'budget' })
  if (evidence.components.length > components.length) omittedEvidence.push({ kind: 'components', reason: 'budget' })
  if (evidence.interactionObservations.length > interactionObservations.length) {
    omittedEvidence.push({ kind: 'interactions', reason: 'budget' })
  }
  if (evidence.responsiveObservations.length > responsiveObservations.length) {
    omittedEvidence.push({ kind: 'responsive-observations', reason: 'budget' })
  }
  if (evidence.mediaLayers.length > mediaLayers.length) {
    omittedEvidence.push({ kind: 'media-layers', reason: 'budget' })
  }
  if (inputMode === 'structural-only' && evidence.pages.some((page) => page.images.length > 0)) {
    omittedEvidence.push({ kind: 'images', reason: 'privacy' })
  }

  const topology = {
    ...evidence.topology,
    pages: evidence.topology.pages
      .filter((page) => selectedPageIds.includes(page.pageId))
      .map((page) => ({
        ...page,
        sectionIds: page.sectionIds.filter((sectionId) => selectedSectionIds.includes(sectionId)),
      })),
    globalLayers: evidence.topology.globalLayers.filter((layer) => selectedPageIds.includes(layer.pageId)),
  }
  const usageCount = Object.fromEntries(
    Object.entries(evidence.tokens.usageCount || {})
      .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
      .slice(0, 500),
  )

  return {
    schemaVersion: '1',
    analysisId: evidence.analysisId,
    inputMode,
    selectedPageIds,
    selectedSectionIds,
    imageIds,
    evidence: {
      ...evidence,
      tokens: {
        ...evidence.tokens,
        ...(Object.keys(usageCount).length > 0 ? { usageCount } : {}),
      },
      pages: pages.map((page) => ({
        id: page.id,
        url: page.url,
        viewport: page.viewport,
        role: page.role,
        imageIds: page.images.map((image) => image.id).filter((imageId) => imageIds.includes(imageId)),
      })),
      topology,
      sections,
      components,
      layoutNodes,
      interactionStyles: {
        hover: evidence.interactionStyles.hover.slice(0, 40),
        focus: evidence.interactionStyles.focus.slice(0, 40),
        active: evidence.interactionStyles.active.slice(0, 40),
      },
      interactionObservations,
      responsiveObservations,
      mediaLayers,
      breakpoints: evidence.breakpoints.slice(0, 24),
      motion: evidence.motion.slice(0, 60),
      limitations: evidence.limitations.slice(0, 60),
    },
    omittedEvidence,
  }
}
