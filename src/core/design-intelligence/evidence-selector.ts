import { createHash } from 'node:crypto'

import {
  AI_IMAGE_MAX_COUNT,
  AI_IMAGE_MAX_HEIGHT,
  AI_IMAGE_MAX_WIDTH,
  AI_VISUAL_TOKEN_BUDGET,
  estimateVisualTokens,
} from '../ai/image-summary.js'
import { hasSevereHorizontalOverflow } from '../design-evidence/reliability.js'
import { createEvidenceId } from '../design-evidence/stable-id.js'
import type {
  ComponentEvidence,
  DesignEvidence,
  InteractionObservation,
  LayoutEvidenceNode,
  NormalizedRect,
} from '../design-evidence/types.js'
import type { ApproximateBounds, EvidencePackage, IntelligenceInputMode, InteractionChange } from './types.js'

export interface EvidenceSelectionBudget {
  maxPages: number
  maxSections: number
  maxComponents: number
  maxLayoutNodes: number
  maxInteractions: number
  maxResponsiveObservations: number
  maxMediaLayers: number
  maxImages: number
  maxVisualTokens: number
}

const DEFAULT_BUDGET: EvidenceSelectionBudget = {
  maxPages: 3,
  maxSections: 12,
  maxComponents: 24,
  maxLayoutNodes: 36,
  maxInteractions: 24,
  maxResponsiveObservations: 24,
  maxMediaLayers: 24,
  maxImages: AI_IMAGE_MAX_COUNT,
  maxVisualTokens: AI_VISUAL_TOKEN_BUDGET,
}

/**
 * Fingerprint of the structural evidence only (no tokens). Observation-pass results are
 * cached under this key, so rerunning interpretation after token-only changes (for example
 * semantic renames) reuses the structural observations instead of paying for a new pass.
 */
export function createStructuralFingerprint(
  evidence: DesignEvidence,
  inputMode: IntelligenceInputMode,
  provider: string,
  model: string,
  selectedImageIds: Iterable<string> = [],
  promptVersion = '1',
  language: 'en' | 'zh-CN' = 'en',
): string {
  const selectedImages = new Set(selectedImageIds)
  const source = JSON.stringify({
    schemaVersion: evidence.schemaVersion,
    promptVersion,
    language,
    topology: evidence.topology,
    sections: evidence.sections,
    components: evidence.components,
    layoutNodes: evidence.layoutNodes,
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

export function listEvidenceTokenRefs(evidence: DesignEvidence): Set<string> {
  return new Set([
    ...evidence.sections.flatMap((section) => section.tokenRefs),
    ...evidence.components.flatMap((component) => component.tokenRefs),
    ...evidence.layoutNodes.flatMap((node) => node.tokenRefs),
  ])
}

export function listEvidencePackageTokenRefs(evidencePackage: EvidencePackage): Set<string> {
  const evidence = evidencePackage.evidence
  return new Set([
    ...evidence.sections.flatMap((section) => section.tokenRefs),
    ...evidence.components.flatMap((component) => component.tokenRefs),
    ...evidence.layoutNodes.flatMap((node) => node.tokenRefs),
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
    imageSelection: evidencePackage.imageSelection.filter((selection) => available.has(selection.id)),
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

// Section rects are normalized to the whole page, which produces misleading precision
// ("offset 10.96%, width 29.2%"). The model only needs coarse proportions, so we quantize
// to friendly fractions and drop the value when nothing fits.
const WIDTH_FRACTIONS: Array<[number, string]> = [
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [1 / 2, '1/2'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
]

const HEIGHT_FRACTIONS: Array<[number, string]> = [
  [1 / 12, '1/12'],
  [1 / 8, '1/8'],
  [1 / 6, '1/6'],
  [1 / 5, '1/5'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [1 / 2, '1/2'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
]

function friendlyFraction(value: number, fractions: Array<[number, string]>, tolerance: number): string | undefined {
  for (const [fraction, label] of fractions) {
    if (Math.abs(value - fraction) <= tolerance) return label
  }
  return undefined
}

export function approximateBounds(rect: NormalizedRect): ApproximateBounds {
  const horizontalCenter = rect.x + rect.width / 2
  const anchor: ApproximateBounds['anchor'] =
    rect.width >= 0.92 ? 'full' : horizontalCenter < 0.4 ? 'left' : horizontalCenter > 0.6 ? 'right' : 'center'
  const vertical: ApproximateBounds['vertical'] = rect.y <= 0.05 ? 'top' : rect.y >= 0.85 ? 'bottom' : 'middle'
  const heightShare =
    rect.height >= 0.92
      ? 'full'
      : rect.height < 0.05 && rect.height > 0
        ? 'strip'
        : friendlyFraction(rect.height, HEIGHT_FRACTIONS, 0.02)
  const widthShare = rect.width >= 0.92 ? 'full' : friendlyFraction(rect.width, WIDTH_FRACTIONS, 0.04)
  return {
    ...(widthShare ? { widthShare } : {}),
    ...(heightShare ? { heightShare } : {}),
    anchor,
    vertical,
  }
}

const MAX_DISTILLED_CHANGES = 6
const MAX_CHANGE_VALUE_CHARS = 80

// before/after hold full computed styles; only the properties that actually changed carry
// signal for the model, so we distill to short from -> to pairs.
export function distillInteractionChanges(observation: InteractionObservation): InteractionChange[] {
  const changes: InteractionChange[] = []
  for (const property of observation.changedProperties) {
    if (changes.length >= MAX_DISTILLED_CHANGES) break
    const from = observation.before?.[property]
    const to = observation.after?.[property]
    if (typeof from !== 'string' || typeof to !== 'string' || from === to) continue
    if (from.length > MAX_CHANGE_VALUE_CHARS || to.length > MAX_CHANGE_VALUE_CHARS) continue
    changes.push({ property, from, to })
  }
  return changes
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
  return `${n.role}|${n.textRole || ''}|${[...n.traits].sort().join(',')}`
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
  return `${obs.driver}|${obs.trigger.kind}|${[...obs.changedProperties].sort().join(',')}`
}

function deduplicateInteractions(observations: InteractionObservation[], limit: number): InteractionObservation[] {
  const seen = new Map<string, InteractionObservation>()
  for (const obs of observations) {
    const sig = interactionSignature(obs)
    if (!seen.has(sig)) seen.set(sig, obs)
  }
  return [...seen.values()].slice(0, limit)
}

function selectRepresentativeSections<T extends { id: string; pageId: string }>(
  sections: T[],
  pageUrlMap: Map<string, string>,
  limit: number,
  preferredIds: ReadonlySet<string> = new Set(),
): T[] {
  const byUrl = new Map<string, T[]>()
  for (const section of sections) {
    const url = pageUrlMap.get(section.pageId)
    if (!url) continue
    const group = byUrl.get(url) || []
    group.push(section)
    byUrl.set(url, group)
  }
  const groups = [...byUrl.values()].map((group) =>
    [...group].sort((first, second) => Number(preferredIds.has(second.id)) - Number(preferredIds.has(first.id))),
  )
  const selected: T[] = []
  while (selected.length < limit && groups.some((group) => group.length > 0)) {
    for (const group of groups) {
      const section = group.shift()
      if (section) selected.push(section)
      if (selected.length >= limit) break
    }
  }
  return selected
}

function selectRepresentativePages<
  T extends {
    url: string
    viewport: string
    horizontalOverflow?: boolean
    viewportWidth?: number
    contentWidth?: number
    health?: { status: string }
  },
>(pages: T[], maxPages: number): T[] {
  const byUrl = new Map<string, T[]>()
  for (const page of pages) {
    const existing = byUrl.get(page.url) || []
    existing.push(page)
    byUrl.set(page.url, existing)
  }
  const result: T[] = []
  const groups = [...byUrl.values()].slice(0, maxPages)
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    const desktop = group.find((p) => p.viewport === 'desktop')
    const mobile = group.find((p) => p.viewport === 'mobile')
    const representative = desktop || mobile || group[0]
    if (representative) result.push(representative)
    // Preserve the entry page's responsive comparison without letting it consume the distinct-page budget.
    if (index === 0 && desktop && mobile && desktop !== mobile) result.push(mobile)

    // A degraded or overflowing capture is evidence about a failure mode, not a redundant
    // viewport. Keep one such capture for every selected URL so the model cannot attribute
    // a global limitation to a healthy representative from another page.
    const criticalCapture = group.find(
      (page) =>
        page !== representative &&
        !result.includes(page) &&
        (page.horizontalOverflow === true || page.health?.status === 'degraded'),
    )
    if (criticalCapture) result.push(criticalCapture)
  }
  return result
}

function expectedSummarySize(width: number, height: number): { width: number; height: number } {
  const croppedHeight = height / Math.max(width, 1) > 2.5 ? Math.min(height, Math.round(width * 1.5)) : height
  const scale = Math.min(AI_IMAGE_MAX_WIDTH / width, AI_IMAGE_MAX_HEIGHT / croppedHeight, 1)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(croppedHeight * scale)) }
}

interface ImageSelection {
  id: string
  score: number
  reason: string
}

interface ComparableImage {
  kind: string
  contentHash?: string
  visualHash?: string
  sourceRect?: NormalizedRect
  page: { url: string; viewport: string }
}

const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
const MAX_REPRESENTATIVE_IMAGE_SIMILARITY = 0.8
const MAX_STRUCTURALLY_REDUNDANT_IMAGE_SIMILARITY = 0.92

function perceptualSimilarity(first: string, second: string): number | null {
  if (/^v1:[0-9a-f]{576}$/i.test(first) && /^v1:[0-9a-f]{576}$/i.test(second)) {
    let distance = 0
    for (let index = 3; index < first.length; index += 1) {
      distance += Math.abs(Number.parseInt(first[index], 16) - Number.parseInt(second[index], 16))
    }
    return 1 - distance / ((first.length - 3) * 15)
  }
  if (!/^[0-9a-f]{22}$/i.test(first) || !/^[0-9a-f]{22}$/i.test(second)) return null
  let differentBits = 0
  for (let index = 0; index < 16; index += 1) {
    differentBits += NIBBLE_BITS[Number.parseInt(first[index], 16) ^ Number.parseInt(second[index], 16)]
  }
  const firstColor = [16, 18, 20].map((offset) => Number.parseInt(first.slice(offset, offset + 2), 16))
  const secondColor = [16, 18, 20].map((offset) => Number.parseInt(second.slice(offset, offset + 2), 16))
  const colorDistance = Math.sqrt(
    firstColor.reduce((total, channel, index) => total + (channel - secondColor[index]) ** 2, 0),
  )
  const structureSimilarity = 1 - differentBits / 64
  const colorSimilarity = 1 - colorDistance / Math.sqrt(3 * 255 ** 2)
  return structureSimilarity * 0.8 + colorSimilarity * 0.2
}

function rectOverlap(first?: NormalizedRect, second?: NormalizedRect): number {
  if (!first || !second) return 0
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x))
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y))
  const smallerArea = Math.min(first.width * first.height, second.width * second.height)
  return smallerArea > 0 ? (width * height) / smallerArea : 0
}

function imageSimilarity(first: ComparableImage, second: ComparableImage): number {
  if (first.contentHash && first.contentHash === second.contentHash) return 1
  const perceptual = perceptualSimilarity(first.visualHash || '', second.visualHash || '')
  let similarity =
    first.page.url !== second.page.url
      ? 0.08
      : first.page.viewport !== second.page.viewport
        ? 0.32
        : first.kind === second.kind
          ? 0.82
          : 0.42
  if (perceptual !== null) similarity = Math.max(similarity, perceptual)
  if (first.page.url === second.page.url && first.page.viewport === second.page.viewport) {
    similarity = Math.max(similarity, rectOverlap(first.sourceRect, second.sourceRect) * 0.96)
  }
  return Math.min(1, Math.max(0, similarity))
}

function isExactImageDuplicate(first: ComparableImage, second: ComparableImage): boolean {
  if (first.contentHash && first.contentHash === second.contentHash) return true
  return !!first.visualHash && first.visualHash === second.visualHash
}

function selectRepresentativeImages(
  pages: {
    id: string
    viewport: string
    url: string
    role?: string
    horizontalOverflow?: boolean
    health?: { status: string; aiEligible?: boolean }
    images: Array<{
      id: string
      kind: string
      width: number
      height: number
      sectionId?: string
      contentHash?: string
      visualHash?: string
      sourceRect?: NormalizedRect
      aiSummary?: { width: number; height: number }
    }>
  }[],
  evidence: DesignEvidence,
  maxImages: number,
  maxVisualTokens: number,
): ImageSelection[] {
  if (maxImages <= 0 || pages.length === 0) return []

  const entryUrl = pages[0].url
  const responsiveUrls = new Set(
    evidence.responsiveObservations.flatMap((observation) => {
      const section = evidence.sections.find((candidate) => candidate.id === observation.sectionId)
      const page = section ? evidence.pages.find((candidate) => candidate.id === section.pageId) : undefined
      return page ? [page.url] : []
    }),
  )
  const sectionRoles = new Map(evidence.sections.map((section) => [section.id, section.role]))
  const pageStructureSignatures = new Map(
    pages.map((page) => {
      const topologyPage = evidence.topology.pages.find((candidate) => candidate.pageId === page.id)
      const roles = (
        topologyPage?.sectionIds ||
        evidence.sections.filter((section) => section.pageId === page.id).map((section) => section.id)
      )
        .map((sectionId) => sectionRoles.get(sectionId) || 'unknown')
        .join(',')
      return [page.id, `${page.role || topologyPage?.role || 'unknown'}|${roles}`]
    }),
  )
  const majorMediaSections = new Set(
    evidence.mediaLayers.filter((media) => media.importance === 'major').map((media) => media.sectionId),
  )
  const candidates = pages
    .filter((page) => page.health?.status !== 'unusable')
    .flatMap((page, pageIndex) =>
      page.images.map((image) => {
        const isEntry = page.url === entryUrl
        const isDesktop = page.viewport === 'desktop'
        const isMobile = page.viewport === 'mobile'
        const isLongOverview = image.kind === 'overview' && image.height / Math.max(image.width, 1) > 2.5
        const sectionRole = image.sectionId ? sectionRoles.get(image.sectionId) : undefined
        const isSalientRegion =
          image.kind === 'region-crop' &&
          !!image.sectionId &&
          (majorMediaSections.has(image.sectionId) ||
            ['hero', 'media', 'action', 'feature-group'].includes(sectionRole || ''))

        let score = 0
        let reason = 'representative page view'
        if (image.kind === 'viewport-crop') {
          score = isEntry && isDesktop ? 120 : isEntry && isMobile ? 104 : 82 - pageIndex
          reason = isEntry
            ? `${page.viewport} entry viewport overview`
            : `${page.role || 'representative'} page viewport overview`
        } else if (image.kind === 'region-crop') {
          score = isSalientRegion ? 100 : 88
          reason = isSalientRegion
            ? `${sectionRole || 'major'} region adds component and media detail`
            : 'representative region adds local detail'
        } else {
          score = (isEntry ? 76 : 62 - pageIndex) - (isLongOverview ? 35 : 0)
          reason = isLongOverview
            ? 'long page fallback overview; down-ranked to avoid unreadable visual tokens'
            : `${page.role || 'representative'} page overview fallback`
        }
        if (page.horizontalOverflow && image.kind === 'viewport-crop') {
          score += 45
          reason = `${reason}; captures horizontal overflow evidence`
        }
        if (responsiveUrls.has(page.url) && isMobile && image.kind === 'viewport-crop') {
          score += 20
          reason = `${reason}; captures measured responsive differences`
        }
        if (majorMediaSections.has(image.sectionId || '')) score += 10

        const summarySize = image.aiSummary || expectedSummarySize(image.width, image.height)

        return {
          ...image,
          page,
          score,
          reason,
          isSalientRegion,
          visualTokens: estimateVisualTokens(summarySize.width, summarySize.height),
        }
      }),
    )

  if (candidates.length === 0) return []
  const candidatePool = candidates
  const overviewCandidates = candidatePool.filter((candidate) => candidate.kind !== 'region-crop')
  const first = [...(overviewCandidates.length > 0 ? overviewCandidates : candidatePool)].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  )[0]
  const selected = [first]

  // Before spending slots on responsive or region-level diversity, give every selected URL
  // one visual overview when the image and visual-token budgets allow it. Structural facts
  // alone are not enough for the model to judge a visually distinct page.
  for (const page of pages) {
    if (selected.length >= maxImages) break
    if (selected.some((candidate) => candidate.page.url === page.url)) continue
    const selectedIds = new Set(selected.map((candidate) => candidate.id))
    const usedVisualTokens = selected.reduce((total, candidate) => total + candidate.visualTokens, 0)
    const representative = candidatePool
      .filter((candidate) => candidate.page.url === page.url && !selectedIds.has(candidate.id))
      .filter((candidate) => usedVisualTokens + candidate.visualTokens <= maxVisualTokens)
      .filter((candidate) =>
        selected.every((selectedImage) => {
          if (isExactImageDuplicate(candidate, selectedImage)) return false
          if (imageSimilarity(candidate, selectedImage) <= MAX_STRUCTURALLY_REDUNDANT_IMAGE_SIMILARITY) return true
          return pageStructureSignatures.get(candidate.page.id) !== pageStructureSignatures.get(selectedImage.page.id)
        }),
      )
      .sort(
        (a, b) =>
          Number(a.kind === 'region-crop') - Number(b.kind === 'region-crop') ||
          b.score - a.score ||
          a.id.localeCompare(b.id),
      )[0]
    if (!representative) continue
    selected.push({
      ...representative,
      reason: `${representative.reason}; selected to cover a distinct page URL`,
    })
  }

  while (selected.length < maxImages) {
    const selectedIds = new Set(selected.map((candidate) => candidate.id))
    const usedVisualTokens = selected.reduce((total, candidate) => total + candidate.visualTokens, 0)
    const next = candidatePool
      .filter((candidate) => !selectedIds.has(candidate.id))
      .filter((candidate) => usedVisualTokens + candidate.visualTokens <= maxVisualTokens)
      .map((candidate) => {
        let informationGain = 0
        if (
          candidate.kind === 'region-crop' &&
          !selected.some((selectedImage) => selectedImage.sectionId === candidate.sectionId)
        ) {
          informationGain += candidate.isSalientRegion ? 48 : 34
        }
        if (selected.every((selectedImage) => candidate.page.url !== selectedImage.page.url)) informationGain += 24
        if (selected.every((selectedImage) => candidate.page.viewport !== selectedImage.page.viewport)) {
          informationGain += 18
        }
        if (candidate.page.horizontalOverflow && candidate.kind === 'viewport-crop') informationGain += 45
        if (
          responsiveUrls.has(candidate.page.url) &&
          candidate.page.viewport === 'mobile' &&
          candidate.kind === 'viewport-crop'
        ) {
          informationGain += 26
        }
        const maximumSimilarity = Math.max(
          ...selected.map((selectedImage) => imageSimilarity(candidate, selectedImage)),
        )
        const diversityGain = Math.round((1 - maximumSimilarity) * 42)
        const similarityPenalty =
          maximumSimilarity > MAX_REPRESENTATIVE_IMAGE_SIMILARITY ? 160 : Math.round(maximumSimilarity * 48)
        informationGain += diversityGain - similarityPenalty
        return {
          ...candidate,
          informationGain,
          maximumSimilarity,
          totalScore: candidate.score + informationGain,
        }
      })
      .sort((a, b) => b.totalScore - a.totalScore || a.id.localeCompare(b.id))[0]
    if (next && next.informationGain >= 24) {
      selected.push({
        ...next,
        score: next.totalScore,
        reason: `${next.reason}; ${Math.round((1 - next.maximumSimilarity) * 100)}% visual difference; selected for ${next.informationGain} points of information gain`,
      })
    } else break
  }

  return selected.slice(0, maxImages).map(({ id, score, reason }) => ({ id, score, reason }))
}

function deduplicateInteractionStyles(
  styles: { hover: unknown[]; focus: unknown[]; active: unknown[]; disabled?: unknown[] },
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
  return {
    hover: dedup(styles.hover),
    focus: dedup(styles.focus),
    active: dedup(styles.active),
    disabled: dedup(styles.disabled || []),
  }
}

export function selectEvidencePackage(
  evidence: DesignEvidence,
  inputMode: IntelligenceInputMode,
  budget: Partial<EvidenceSelectionBudget> = {},
): EvidencePackage {
  const limits = { ...DEFAULT_BUDGET, ...budget }
  const eligiblePages = evidence.pages.filter(
    (page) => page.health?.status !== 'unusable' && page.health?.aiEligible !== false,
  )
  const pages = selectRepresentativePages(eligiblePages, limits.maxPages)
  const selectedPageIds = pages.map((page) => page.id)
  const inferencePageIds = new Set(pages.filter((page) => !hasSevereHorizontalOverflow(page)).map((page) => page.id))
  const pageUrlMap = new Map(pages.map((page) => [page.id, page.url]))
  const overflowSectionIds = new Set(
    pages.flatMap((page) =>
      (page.horizontalOverflowSources || []).flatMap((source) => (source.sectionId ? [source.sectionId] : [])),
    ),
  )
  const sectionDedup = new Set<string>()
  const sectionCandidates = evidence.sections
    .filter((section) => inferencePageIds.has(section.pageId))
    .filter((section) => {
      const url = pageUrlMap.get(section.pageId) || ''
      const key = `${url}|${section.role}|${section.order}`
      if (overflowSectionIds.has(section.id)) return true
      if (sectionDedup.has(key)) return false
      sectionDedup.add(key)
      return true
    })
  const sections = selectRepresentativeSections(sectionCandidates, pageUrlMap, limits.maxSections, overflowSectionIds)
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
    limits.maxInteractions,
  )
  const responsiveObservations = evidence.responsiveObservations
    .filter(
      (observation) =>
        selectedSectionIds.includes(observation.sectionId) ||
        observation.evidenceRefs.some((reference) => selectedSectionIds.includes(reference)),
    )
    .slice(0, limits.maxResponsiveObservations)
  const mediaImportanceRank: Record<string, number> = { major: 0, supporting: 1, icon: 2 }
  const mediaLayers = evidence.mediaLayers
    .filter((media) => selectedSectionIds.includes(media.sectionId))
    .sort((a, b) => (mediaImportanceRank[a.importance] ?? 1) - (mediaImportanceRank[b.importance] ?? 1))
    .slice(0, limits.maxMediaLayers)
  const imageSelection =
    inputMode === 'multimodal'
      ? selectRepresentativeImages(
          pages.filter((page) => inferencePageIds.has(page.id)),
          evidence,
          limits.maxImages,
          limits.maxVisualTokens,
        )
      : []
  const imageIds = imageSelection.map((selection) => selection.id)

  const omittedEvidence: EvidencePackage['omittedEvidence'] = []
  if (eligiblePages.length < evidence.pages.length) omittedEvidence.push({ kind: 'pages', reason: 'unsafe' })
  if (evidence.pages.length > pages.length) omittedEvidence.push({ kind: 'pages', reason: 'budget' })
  if (inferencePageIds.size < pages.length) {
    omittedEvidence.push({ kind: 'capture-details', reason: 'severe-horizontal-overflow' })
  }
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
    crossPagePatternIds: [...new Set(sections.map((section) => section.role))].flatMap((role) => {
      const urls = new Set(
        sections
          .filter((section) => section.role === role)
          .map((section) => pageUrlMap.get(section.pageId))
          .filter((url): url is string => Boolean(url)),
      )
      return urls.size >= 2 ? [createEvidenceId('pattern', 'section-role', role)] : []
    }),
  }
  const usageCount = Object.fromEntries(
    Object.entries(evidence.tokens.usageCount || {})
      .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
      .slice(0, 30),
  )
  const confidencePriority = { high: 3, medium: 2, low: 1 }
  const tokenEvidence = Object.fromEntries(
    Object.entries(evidence.tokens.evidence || {})
      .sort(
        (first, second) =>
          confidencePriority[second[1].confidence] - confidencePriority[first[1].confidence] ||
          second[1].observationCount - first[1].observationCount ||
          first[0].localeCompare(second[0]),
      )
      .slice(0, 40),
  )

  return {
    schemaVersion: '1',
    analysisId: evidence.analysisId,
    inputMode,
    selectedPageIds,
    selectedSectionIds,
    imageIds,
    imageSelection,
    evidence: {
      ...evidence,
      tokens: {
        ...evidence.tokens,
        ...(Object.keys(usageCount).length > 0 ? { usageCount } : {}),
        ...(Object.keys(tokenEvidence).length > 0 ? { evidence: tokenEvidence } : {}),
      },
      pages: pages.map((page) => ({
        id: page.id,
        url: page.url,
        viewport: page.viewport,
        role: page.role,
        viewportWidth: page.viewportWidth,
        viewportHeight: page.viewportHeight,
        contentWidth: page.contentWidth,
        contentHeight: page.contentHeight,
        horizontalOverflow: page.horizontalOverflow,
        horizontalOverflowSources: page.horizontalOverflowSources,
        health: page.health
          ? {
              status: page.health.status,
              aiEligible: page.health.aiEligible,
              issues: page.health.issues.map(({ code, severity }) => ({ code, severity })),
            }
          : undefined,
        imageIds: page.images.map((image) => image.id).filter((imageId) => imageIds.includes(imageId)),
      })),
      topology,
      sections: sections.map(({ evidenceRefs: _e, rect, ...s }) => ({ ...s, approxBounds: approximateBounds(rect) })),
      components: components.map(
        ({ styles: _s, evidenceRefs: _e, rect: _r, pageId: _p, stateRefs: _st, confidence: _cf, ...c }) => c,
      ),
      layoutNodes: layoutNodes.map(({ rect: _r, pageId: _p, observedTypography: _ty, ...n }) => n),
      interactionStyles: deduplicateInteractionStyles(evidence.interactionStyles, 20),
      interactionObservations: interactionObservations.map((observation) => {
        const { before: _b, after: _a, evidenceRefs: _e, pageId: _p, targetId: _t, ...obs } = observation
        return { ...obs, changes: distillInteractionChanges(observation) }
      }),
      responsiveObservations: responsiveObservations.map(({ evidenceRefs: _e, ...obs }) => obs),
      mediaLayers: mediaLayers.map(({ rect: _r, pageId: _p, ...m }) => m),
      breakpoints: evidence.breakpoints.slice(0, 8),
      motion: evidence.motion.slice(0, 16),
      limitations: evidence.limitations.slice(0, 30),
    },
    omittedEvidence,
  }
}
