import { createHash } from 'node:crypto'

import type {
  ComponentEvidence,
  DesignEvidence,
  InteractionObservation,
  LayoutEvidenceNode,
} from '../design-evidence/types.js'
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
  maxSections: 16,
  maxComponents: 40,
  maxLayoutNodes: 60,
  maxImages: 4,
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

function componentSignature(c: ComponentEvidence): string {
  const styleKeys = Object.keys(c.styles).sort()
  const styleVals = styleKeys.map((k) => `${k}:${c.styles[k]}`).join('|')
  return `${c.type}||${styleVals}`
}

function deduplicateComponents(components: ComponentEvidence[], limit: number): ComponentEvidence[] {
  const seen = new Map<string, ComponentEvidence>()
  for (const c of components) {
    const sig = componentSignature(c)
    if (!seen.has(sig)) seen.set(sig, c)
  }
  return [...seen.values()].slice(0, limit)
}

function layoutNodeSignature(n: LayoutEvidenceNode): string {
  return `${n.role}|${n.textRole || ''}|${n.traits.sort().join(',')}`
}

function deduplicateLayoutNodes(nodes: LayoutEvidenceNode[], limit: number): LayoutEvidenceNode[] {
  const seen = new Map<string, LayoutEvidenceNode>()
  for (const n of nodes) {
    const sig = layoutNodeSignature(n)
    if (!seen.has(sig)) seen.set(sig, n)
  }
  return [...seen.values()].slice(0, limit)
}

function interactionSignature(obs: InteractionObservation): string {
  return `${obs.driver}|${obs.trigger.kind}|${obs.changedProperties.sort().join(',')}`
}

function deduplicateInteractions(observations: InteractionObservation[], limit: number): InteractionObservation[] {
  const seen = new Map<string, InteractionObservation>()
  for (const obs of observations) {
    const sig = interactionSignature(obs)
    if (!seen.has(sig)) seen.set(sig, obs)
  }
  return [...seen.values()].slice(0, limit)
}

function selectRepresentativePages<T extends { url: string; viewport: string }>(pages: T[], maxPages: number): T[] {
  const byUrl = new Map<string, T[]>()
  for (const page of pages) {
    const existing = byUrl.get(page.url) || []
    existing.push(page)
    byUrl.set(page.url, existing)
  }
  const result: T[] = []
  for (const group of byUrl.values()) {
    const desktop = group.find((p) => p.viewport === 'desktop')
    const mobile = group.find((p) => p.viewport === 'mobile')
    if (desktop) result.push(desktop)
    if (mobile) result.push(mobile)
    if (!desktop && !mobile && group.length > 0) result.push(group[0])
    if (result.length >= maxPages) break
  }
  return result.slice(0, maxPages)
}

function selectRepresentativeImages(
  pages: { viewport: string; url: string; images: { id: string; kind: string; width: number }[] }[],
  maxImages: number,
): string[] {
  const ids: string[] = []
  const seenUrlViewport = new Set<string>()
  for (const page of pages) {
    const key = `${page.url}|${page.viewport}`
    if (seenUrlViewport.has(key)) continue
    seenUrlViewport.add(key)
    const overview = page.images.find((img) => img.kind === 'overview')
    if (overview) ids.push(overview.id)
    if (ids.length >= maxImages) break
  }
  return ids
}

function deduplicateInteractionStyles(
  styles: { hover: unknown[]; focus: unknown[]; active: unknown[] },
  limit: number,
): typeof styles {
  const dedup = (arr: unknown[]) => {
    const seen = new Set<string>()
    return arr
      .filter((item) => {
        const key = JSON.stringify(item)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, limit)
  }
  return { hover: dedup(styles.hover), focus: dedup(styles.focus), active: dedup(styles.active) }
}

export function selectEvidencePackage(
  evidence: DesignEvidence,
  inputMode: IntelligenceInputMode,
  budget: Partial<EvidenceSelectionBudget> = {},
): EvidencePackage {
  const limits = { ...DEFAULT_BUDGET, ...budget }
  const pages = selectRepresentativePages(evidence.pages, limits.maxPages)
  const selectedPageIds = pages.map((page) => page.id)
  const pageUrlMap = new Map(pages.map((page) => [page.id, page.url]))
  const sectionDedup = new Set<string>()
  const sections = evidence.sections
    .filter((section) => selectedPageIds.includes(section.pageId))
    .filter((section) => {
      const url = pageUrlMap.get(section.pageId) || ''
      const key = `${url}|${section.role}|${section.order}`
      if (sectionDedup.has(key)) return false
      sectionDedup.add(key)
      return true
    })
    .slice(0, limits.maxSections)
  const selectedSectionIds = sections.map((section) => section.id)
  const components = deduplicateComponents(
    evidence.components.filter((component) => selectedSectionIds.includes(component.sectionId)),
    limits.maxComponents,
  )
  const layoutNodes = deduplicateLayoutNodes(
    evidence.layoutNodes.filter((node) => selectedSectionIds.includes(node.sectionId)),
    limits.maxLayoutNodes,
  )
  const interactionObservations = deduplicateInteractions(
    evidence.interactionObservations.filter((observation) => selectedSectionIds.includes(observation.sectionId)),
    60,
  )
  const responsiveObservations = evidence.responsiveObservations
    .filter(
      (observation) =>
        selectedSectionIds.includes(observation.sectionId) ||
        observation.evidenceRefs.some((reference) => selectedSectionIds.includes(reference)),
    )
    .slice(0, 60)
  const mediaLayers = evidence.mediaLayers.filter((media) => selectedSectionIds.includes(media.sectionId)).slice(0, 60)
  const imageIds = inputMode === 'multimodal' ? selectRepresentativeImages(pages, limits.maxImages) : []

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
      .slice(0, 50),
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
      sections: sections.map(({ evidenceRefs: _e, ...s }) => s),
      components: components.map(
        ({ styles: _s, evidenceRefs: _e, rect: _r, pageId: _p, stateRefs: _st, confidence: _cf, ...c }) => c,
      ),
      layoutNodes: layoutNodes.map(({ rect: _r, pageId: _p, ...n }) => n),
      interactionStyles: deduplicateInteractionStyles(evidence.interactionStyles, 20),
      interactionObservations: interactionObservations.map(
        ({ before: _b, after: _a, evidenceRefs: _e, pageId: _p, targetId: _t, ...obs }) => obs,
      ),
      responsiveObservations: responsiveObservations.map(({ evidenceRefs: _e, ...obs }) => obs),
      mediaLayers: mediaLayers.map(({ rect: _r, pageId: _p, ...m }) => m),
      breakpoints: evidence.breakpoints.slice(0, 8),
      motion: evidence.motion.slice(0, 16),
      limitations: evidence.limitations.slice(0, 30),
    },
    omittedEvidence,
  }
}
