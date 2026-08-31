import { createHash } from 'node:crypto'
import fs from 'node:fs'

import type { PageHealthReport } from '../analyzer/page-health.js'
import type { MotionToken, ResponsiveBreakpoint } from '../analyzer/responsive-motion.js'
import type { PageScreenshot } from '../analyzer/types.js'
import type { DesignToken, InteractionStyles } from '../analyzer/types.js'
import { pageIdentityUrl } from '../analyzer/url-identity.js'
import { screenshotAssetIssueCount } from './asset-integrity.js'
import type { InteractionObservationSnapshot } from './interaction-observer.js'
import type { PageEvidenceSnapshot, PageSectionSnapshot } from './page-extractor.js'
import { pageIdentityFromMetadata } from './page-identity.js'
import { hasSevereHorizontalOverflow } from './reliability.js'
import { createEvidenceId } from './stable-id.js'
import { safeSectionObservedStyles } from './structural-styles.js'
import { tokenRefCompatibleWithStyle } from './token-style-compatibility.js'
import type {
  ComponentEvidence,
  DesignEvidence,
  EvidenceImage,
  LayoutEvidenceNode,
  MediaLayerEvidence,
  PseudoElementEvidence,
  ResponsiveSectionObservation,
  SectionEvidence,
} from './types.js'

export interface CapturedPageEvidence {
  screenshot: PageScreenshot
  snapshot: PageEvidenceSnapshot
  /** Supplemental captures inform responsive evidence but do not satisfy the user-requested capture plan. */
  captureScope?: 'requested' | 'supplemental'
  interactionStyles?: InteractionStyles
  interactionObservations?: InteractionObservationSnapshot[]
  health?: PageHealthReport
  supplementalImages?: Array<Omit<EvidenceImage, 'id' | 'sectionId'> & { sectionKey?: string; valid?: boolean }>
}

export interface BuildDesignEvidenceInput {
  analysisId: string
  requestedUrl: string
  finalUrl: string
  accessMode: 'anonymous' | 'managed'
  authWallDetected?: boolean
  expectedPageCount: number
  expectedViewports?: string[]
  /** Actual page/viewport captures planned by the analyzer's adaptive strategy. */
  expectedCaptureCount?: number
  /** Retained overview screenshots that failed encoded-dimension validation. */
  screenshotAssetIssueCount?: number
  tokens: DesignToken
  featureTags: string[]
  interactionStyles: InteractionStyles
  breakpoints: ResponsiveBreakpoint[]
  motion: MotionToken[]
  captures: CapturedPageEvidence[]
  limitations?: string[]
  techStack?: import('./types.js').TechStackInfo
}

function imageContentHash(filePath: string): string | undefined {
  try {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    return undefined
  }
}

function containsRect(outer: EvidenceImage['sourceRect'], inner: PageSectionSnapshot['rect']): boolean {
  if (!outer) return false
  const tolerance = 1e-9
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

interface InstanceIdRegistry<T extends { key: string }> {
  byItem: Map<T, string>
  byKey: Map<string, string[]>
}

function createInstanceIdRegistry<T extends { key: string }>(
  kind: string,
  pageId: string,
  items: readonly T[],
): InstanceIdRegistry<T> {
  const totals = new Map<string, number>()
  items.forEach((item) => totals.set(item.key, (totals.get(item.key) || 0) + 1))

  const occurrences = new Map<string, number>()
  const byItem = new Map<T, string>()
  const byKey = new Map<string, string[]>()
  items.forEach((item) => {
    const occurrence = (occurrences.get(item.key) || 0) + 1
    occurrences.set(item.key, occurrence)
    const id =
      (totals.get(item.key) || 0) > 1
        ? createEvidenceId(kind, pageId, item.key, occurrence)
        : createEvidenceId(kind, pageId, item.key)
    byItem.set(item, id)
    const ids = byKey.get(item.key) || []
    ids.push(id)
    byKey.set(item.key, ids)
  })
  return { byItem, byKey }
}

function normalizeColor(value: string): string {
  const match = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i)
  if (!match || (match[4] !== undefined && Number(match[4]) !== 1)) return value.toLowerCase().trim()
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

function normalizeTokenValue(value: string): string {
  const normalized = normalizeColor(value).replace(/\s+/g, ' ').trim().toLowerCase()
  if (/^-?\d+(?:\.\d+)?px$/.test(normalized)) {
    const rem = Number.parseFloat(normalized) / 16
    return `${rem.toFixed(3).replace(/\.?0+$/, '')}rem`
  }
  return normalized
}

function normalizeFontValue(value: string): string {
  return value.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function cssLengthPx(value: string | undefined): number | null {
  if (!value) return null
  const match = value.trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/i)
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  return ['rem', 'em'].includes(match[2].toLowerCase()) ? amount * 16 : amount
}

function buildTokenIndex(tokens: DesignToken): Map<string, string[]> {
  const index = new Map<string, string[]>()
  const add = (value: string, ref: string) => {
    const variants = new Set([
      value.toLowerCase().trim(),
      normalizeColor(value),
      normalizeTokenValue(value),
      normalizeFontValue(value),
    ])
    for (const variant of variants) {
      const refs = index.get(variant) || []
      if (!refs.includes(ref)) refs.push(ref)
      index.set(variant, refs)
    }
  }

  Object.entries(tokens.colors).forEach(([name, value]) => add(value, `color.${name}`))
  tokens.typography.fontFamilies.forEach((value, index) => add(value, `typography.font-family.${index + 1}`))
  tokens.typography.fontStacks.forEach((value, index) => add(value, `typography.font-stack.${index + 1}`))
  tokens.typography.fontSizes.forEach((value, index) => add(value, `typography.font-size.${index + 1}`))
  tokens.typography.fontWeights.forEach((value, index) => add(value, `typography.font-weight.${index + 1}`))
  tokens.typography.lineHeights.forEach((value, index) => add(value, `typography.line-height.${index + 1}`))
  tokens.typography.letterSpacings.forEach((value, index) => add(value, `typography.letter-spacing.${index + 1}`))
  tokens.spacing.forEach((value, index) => add(value, `spacing.${index + 1}`))
  tokens.radii.forEach((value, index) => add(value, `radius.${index + 1}`))
  tokens.shadows.forEach((value, index) => add(value, `shadow.${index + 1}`))
  tokens.borders.forEach((value, index) => add(value, `border.${index + 1}`))
  tokens.zIndices.forEach((value, index) => add(value, `z-index.${index + 1}`))
  tokens.transitions.forEach((value, index) => add(value, `transition.${index + 1}`))
  return index
}

function tokenRefsForStyles(styles: Record<string, string>, tokenIndex: Map<string, string[]>): string[] {
  const refs = new Set<string>()
  for (const [property, value] of Object.entries(styles)) {
    const candidates = new Set<string>([
      value.toLowerCase().trim(),
      normalizeColor(value),
      normalizeTokenValue(value),
      normalizeFontValue(value),
      ...(value
        .match(/rgba?\([^)]+\)|#[\da-f]{3,8}|-?\d+(?:\.\d+)?(?:px|rem|em|s|ms)\b/gi)
        ?.flatMap((part) => [part.toLowerCase(), normalizeColor(part), normalizeTokenValue(part)]) || []),
    ])
    for (const candidate of candidates) {
      tokenIndex
        .get(candidate)
        ?.filter((ref) => tokenRefCompatibleWithStyle(property, ref))
        .forEach((ref) => refs.add(ref))
    }
  }
  const fontSize = cssLengthPx(styles.fontSize)
  const lineHeight = cssLengthPx(styles.lineHeight)
  if (fontSize && lineHeight) {
    const ratio = (lineHeight / fontSize).toFixed(3).replace(/\.?0+$/, '')
    tokenIndex.get(ratio)?.forEach((ref) => {
      if (ref.startsWith('typography.line-height.')) refs.add(ref)
    })
  }
  return [...refs].sort()
}

function changedSectionValues(
  from: PageSectionSnapshot,
  to: PageSectionSnapshot,
): Record<string, { from?: string | number; to?: string | number }> {
  const changes: Record<string, { from?: string | number; to?: string | number }> = {}
  if (from.order !== to.order) changes.sequenceIndex = { from: from.order, to: to.order }
  if (from.layoutMode !== to.layoutMode) changes.layoutMode = { from: from.layoutMode, to: to.layoutMode }
  for (const key of new Set([...Object.keys(from.styles), ...Object.keys(to.styles)])) {
    const fromValue = from.styles[key]
    const toValue = to.styles[key]
    if (key === 'childGridTemplateColumns' && (!fromValue?.trim() || !toValue?.trim())) continue
    if (fromValue !== toValue) changes[key] = { from: fromValue, to: toValue }
  }
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (Math.abs(from.rect[key] - to.rect[key]) >= 0.04) {
      changes[`rect.${key}`] = { from: from.rect[key], to: to.rect[key] }
    }
  }
  return changes
}

function buildResponsiveObservations(
  captures: CapturedPageEvidence[],
  sectionIds: Map<string, string>,
  imageIds: Map<string, string>,
): { observations: ResponsiveSectionObservation[]; identityMismatchCount: number } {
  const viewportOrder = ['desktop', 'tablet', 'mobile']
  const byUrl = new Map<string, CapturedPageEvidence[]>()
  for (const capture of captures) {
    const identityUrl = pageIdentityUrl(capture.snapshot.url)
    const list = byUrl.get(identityUrl) || []
    list.push(capture)
    byUrl.set(identityUrl, list)
  }

  const observations: ResponsiveSectionObservation[] = []
  let identityMismatchCount = 0
  for (const pageCaptures of byUrl.values()) {
    if (pageCaptures.length < 2) continue
    pageCaptures.sort(
      (a, b) =>
        viewportOrder.indexOf(a.snapshot.viewport) - viewportOrder.indexOf(b.snapshot.viewport) ||
        a.snapshot.width - b.snapshot.width,
    )
    for (let captureIndex = 0; captureIndex < pageCaptures.length - 1; captureIndex += 1) {
      const fromCapture = pageCaptures[captureIndex]
      const toCapture = pageCaptures[captureIndex + 1]
      if (hasSevereHorizontalOverflow(fromCapture.snapshot) || hasSevereHorizontalOverflow(toCapture.snapshot)) {
        continue
      }
      const fromByKey = new Map(fromCapture.snapshot.sections.map((section) => [section.key, section]))
      const toByKey = new Map(toCapture.snapshot.sections.map((section) => [section.key, section]))
      for (const key of new Set([...fromByKey.keys(), ...toByKey.keys()])) {
        const from = fromByKey.get(key)
        const to = toByKey.get(key)
        const fromCaptureKey = `${pageIdentityUrl(fromCapture.snapshot.url)}|${fromCapture.snapshot.viewport}`
        const toCaptureKey = `${pageIdentityUrl(toCapture.snapshot.url)}|${toCapture.snapshot.viewport}`
        const fromSectionId = sectionIds.get(`${fromCaptureKey}|${key}`)
        const toSectionId = sectionIds.get(`${toCaptureKey}|${key}`)
        if (!from || !to || !fromSectionId || !toSectionId) {
          if (fromCapture.snapshot.horizontalOverflow || toCapture.snapshot.horizontalOverflow) continue
          const sectionId = fromSectionId || toSectionId
          if (!sectionId) continue
          observations.push({
            id: createEvidenceId('responsive', sectionId, fromCapture.snapshot.viewport, toCapture.snapshot.viewport),
            sectionId,
            fromViewport: fromCapture.snapshot.viewport,
            toViewport: toCapture.snapshot.viewport,
            changeType: 'visibility',
            changedProperties: ['visibility'],
            changes: { visibility: { from: from ? 'visible' : 'absent', to: to ? 'visible' : 'absent' } },
            summary: 'The section is present in only one of the compared viewport captures.',
            evidenceRefs: [
              ...(fromSectionId ? [fromSectionId] : []),
              ...(toSectionId ? [toSectionId] : []),
              imageIds.get(`${fromCaptureKey}|${key}`) || imageIds.get(fromCaptureKey) || '',
              imageIds.get(`${toCaptureKey}|${key}`) || imageIds.get(toCaptureKey) || '',
            ].filter(Boolean),
          })
          continue
        }

        // A stable DOM locator is necessary but not sufficient for cross-viewport identity.
        // Responsive markup can reuse the same structural path for a semantically different region.
        if (from.role !== to.role) {
          identityMismatchCount += 1
          continue
        }

        const changes = changedSectionValues(from, to)
        if (fromCapture.snapshot.horizontalOverflow || toCapture.snapshot.horizontalOverflow) {
          for (const property of Object.keys(changes)) {
            if (property.startsWith('rect.')) delete changes[property]
          }
        }
        const fromNodes = new Map(
          fromCapture.snapshot.layoutNodes.filter((node) => node.sectionKey === key).map((node) => [node.key, node]),
        )
        const toNodes = new Map(
          toCapture.snapshot.layoutNodes.filter((node) => node.sectionKey === key).map((node) => [node.key, node]),
        )
        for (const nodeKey of new Set([...fromNodes.keys(), ...toNodes.keys()])) {
          const fromNode = fromNodes.get(nodeKey)
          const toNode = toNodes.get(nodeKey)
          if (!fromNode || !toNode) continue
          for (const property of ['fontSize', 'lineHeight', 'display'] as const) {
            if (fromNode.styles[property] === toNode.styles[property]) continue
            changes[`node.${fromNode.role}.${property}`] = {
              from: fromNode.styles[property],
              to: toNode.styles[property],
            }
          }
        }
        const changedProperties = Object.keys(changes)
        const fromInteractionKinds = fromCapture.snapshot.interactionCandidates
          .filter((candidate) => candidate.sectionKey === key)
          .map((candidate) => candidate.kind)
          .sort()
        const toInteractionKinds = toCapture.snapshot.interactionCandidates
          .filter((candidate) => candidate.sectionKey === key)
          .map((candidate) => candidate.kind)
          .sort()
        const interactionChanged = JSON.stringify(fromInteractionKinds) !== JSON.stringify(toInteractionKinds)
        if (interactionChanged) {
          changedProperties.push('interactionModel')
          changes.interactionModel = { from: fromInteractionKinds.join(', '), to: toInteractionKinds.join(', ') }
        }
        if (changedProperties.length === 0) continue
        const reorderOnly =
          changedProperties.includes('sequenceIndex') &&
          changedProperties.every((property) => ['sequenceIndex', 'rect.x', 'rect.y'].includes(property))
        const structural = changedProperties.some((property) =>
          ['sequenceIndex', 'layoutMode', 'display', 'gridTemplateColumns', 'rect.x', 'rect.y'].includes(property),
        )
        const sizeOnly = changedProperties.every((property) =>
          [
            'height',
            'rect.width',
            'rect.height',
            'maxWidth',
            'paddingTop',
            'paddingRight',
            'paddingBottom',
            'paddingLeft',
            'gap',
          ].includes(property),
        )
        const changeType: ResponsiveSectionObservation['changeType'] =
          interactionChanged && changedProperties.length === 1
            ? 'interaction'
            : reorderOnly
              ? 'reorder'
              : interactionChanged
                ? 'mixed'
                : structural
                  ? 'reflow'
                  : sizeOnly
                    ? 'scale'
                    : 'mixed'
        observations.push({
          id: createEvidenceId(
            'responsive',
            fromSectionId,
            toSectionId,
            fromCapture.snapshot.viewport,
            toCapture.snapshot.viewport,
          ),
          sectionId: fromSectionId,
          fromViewport: fromCapture.snapshot.viewport,
          toViewport: toCapture.snapshot.viewport,
          changeType,
          changedProperties,
          changes,
          summary: `Observed ${changedProperties.length} section-level changes between ${fromCapture.snapshot.viewport} and ${toCapture.snapshot.viewport}.`,
          evidenceRefs: [
            fromSectionId,
            toSectionId,
            imageIds.get(`${fromCaptureKey}|${key}`) || imageIds.get(fromCaptureKey) || '',
            imageIds.get(`${toCaptureKey}|${key}`) || imageIds.get(toCaptureKey) || '',
          ].filter(Boolean),
        })
      }
    }
  }
  return { observations, identityMismatchCount }
}

export function buildDesignEvidence(input: BuildDesignEvidenceInput): DesignEvidence {
  const tokenIndex = buildTokenIndex(input.tokens)
  const pages: DesignEvidence['pages'] = []
  const sections: SectionEvidence[] = []
  const components: ComponentEvidence[] = []
  const layoutNodes: LayoutEvidenceNode[] = []
  const mediaLayers: MediaLayerEvidence[] = []
  const pseudoElements: PseudoElementEvidence[] = []
  const interactionObservations: DesignEvidence['interactionObservations'] = []
  const sectionIds = new Map<string, string>()
  const imageIds = new Map<string, string>()

  for (const capture of input.captures) {
    const identityUrl = pageIdentityUrl(capture.snapshot.url)
    const captureKey = `${identityUrl}|${capture.snapshot.viewport}`
    const pageId = createEvidenceId('page', identityUrl, capture.snapshot.viewport)
    const imageId = createEvidenceId('image', pageId, 'overview')
    const componentIds = createInstanceIdRegistry('component', pageId, capture.snapshot.components)
    const layoutIds = createInstanceIdRegistry('layout', pageId, capture.snapshot.layoutNodes)
    const mediaIds = createInstanceIdRegistry('media', pageId, capture.snapshot.mediaLayers)
    const pseudoSnapshots = capture.snapshot.pseudoElements || []
    const pseudoIds = createInstanceIdRegistry('pseudo', pageId, pseudoSnapshots)
    const ariaStateIds = createInstanceIdRegistry('interaction', pageId, capture.snapshot.ariaStates || [])
    const activeInteractionIds = createInstanceIdRegistry('interaction', pageId, capture.interactionObservations || [])
    const screenshotWidth = capture.screenshot.width || capture.snapshot.width
    const screenshotHeight = capture.screenshot.height || capture.snapshot.height
    const hasRecordedScreenshotDimensions =
      capture.screenshot.width !== undefined && capture.screenshot.height !== undefined
    const screenshotCoversSnapshot =
      screenshotWidth + 4 >= capture.snapshot.width && screenshotHeight + 8 >= capture.snapshot.height
    const hasUsableOverview = capture.screenshot.valid !== false && screenshotCoversSnapshot
    const hasReadableBoundedImage = hasRecordedScreenshotDimensions && !hasUsableOverview
    const capturedImage = {
      id: imageId,
      path: capture.screenshot.path,
      width: screenshotWidth,
      height: screenshotHeight,
      contentHash: imageContentHash(capture.screenshot.path),
    }
    const overviewImages = hasUsableOverview ? [{ ...capturedImage, kind: 'overview' as const }] : []
    const clippedOverviewImages = hasReadableBoundedImage
      ? [
          {
            ...capturedImage,
            kind: 'region-crop' as const,
            sourceRect: {
              x: 0,
              y: 0,
              // Values above 1 preserve the bitmap-to-document scale for oversized mismatches. Clamping would make
              // a highlight at 800px in a 1600px snapshot render at 1500px in a 3000px screenshot.
              width: screenshotWidth / Math.max(capture.snapshot.width, 1),
              height: screenshotHeight / Math.max(capture.snapshot.height, 1),
            },
          },
        ]
      : []
    const supplementalImages = (capture.supplementalImages || []).flatMap((candidate, index) => {
      const { valid, ...image } = candidate
      return valid === false
        ? []
        : [
            {
              ...image,
              id: createEvidenceId('image', pageId, image.kind, index),
              contentHash: imageContentHash(image.path),
            },
          ]
    })
    const evidenceImages = [...overviewImages, ...clippedOverviewImages, ...supplementalImages]
    const overviewImageId = overviewImages[0]?.id
    if (overviewImageId) imageIds.set(captureKey, overviewImageId)
    for (const section of capture.snapshot.sections) {
      sectionIds.set(`${captureKey}|${section.key}`, createEvidenceId('section', pageId, section.key))
    }
    const supplementalImageSupports = [...clippedOverviewImages, ...supplementalImages].map((image) => ({
      id: image.id,
      sourceRect: image.sourceRect,
      sectionKey: (image as EvidenceImage & { sectionKey?: string }).sectionKey,
    }))
    const imageRefsForRect = (rect: PageSectionSnapshot['rect'], sectionKey: string): string[] => {
      const containingImages = supplementalImageSupports
        .filter(
          (image) => (!image.sectionKey || image.sectionKey === sectionKey) && containsRect(image.sourceRect, rect),
        )
        .map((image) => image.id)
      return [...(overviewImageId ? [overviewImageId] : []), ...containingImages]
    }
    const imageRefsBySectionKey = new Map<string, string[]>()
    for (const section of capture.snapshot.sections) {
      const refs = imageRefsForRect(section.rect, section.key)
      imageRefsBySectionKey.set(section.key, refs)
      const boundedImageRef = supplementalImageSupports
        .filter((image) => refs.includes(image.id))
        .sort((first, second) => {
          const firstSectionSpecific = first.sectionKey === section.key ? 1 : 0
          const secondSectionSpecific = second.sectionKey === section.key ? 1 : 0
          const firstArea = first.sourceRect
            ? first.sourceRect.width * first.sourceRect.height
            : Number.POSITIVE_INFINITY
          const secondArea = second.sourceRect
            ? second.sourceRect.width * second.sourceRect.height
            : Number.POSITIVE_INFINITY
          return (
            secondSectionSpecific - firstSectionSpecific || firstArea - secondArea || first.id.localeCompare(second.id)
          )
        })[0]?.id
      if (boundedImageRef || refs[0]) imageIds.set(`${captureKey}|${section.key}`, boundedImageRef || refs[0])
    }
    const pageIdentity = pageIdentityFromMetadata({
      applicationName: capture.snapshot.applicationName,
      openGraphSiteName: capture.snapshot.openGraphSiteName,
      title: capture.snapshot.title,
      pageHealth: capture.health
        ? { status: capture.health.status, issueCodes: capture.health.issues.map((issue) => issue.code) }
        : undefined,
    })
    pages.push({
      id: pageId,
      url: capture.snapshot.url,
      viewport: capture.snapshot.viewport,
      ...pageIdentity,
      role: capture.snapshot.role,
      viewportWidth: capture.snapshot.viewportWidth,
      viewportHeight: capture.snapshot.viewportHeight,
      contentWidth: capture.snapshot.contentWidth,
      contentHeight: capture.snapshot.height,
      horizontalOverflow: capture.snapshot.horizontalOverflow,
      horizontalOverflowSources: capture.snapshot.horizontalOverflowSources.map(
        ({ sectionKey, sectionRole, ...source }) => ({
          ...source,
          ...(sectionKey ? { sectionId: sectionIds.get(`${captureKey}|${sectionKey}`) } : {}),
          ...(sectionRole ? { sectionRole } : {}),
        }),
      ),
      health: capture.health,
      images: evidenceImages,
    })

    const page = pages[pages.length - 1]
    for (const image of page.images) {
      const sectionKey = (image as { sectionKey?: string }).sectionKey
      if (sectionKey) {
        image.sectionId = sectionIds.get(`${captureKey}|${sectionKey}`)
        delete (image as { sectionKey?: string }).sectionKey
      }
    }

    for (const section of capture.snapshot.sections) {
      const sectionId = sectionIds.get(`${captureKey}|${section.key}`)!
      const imageEvidenceRefs = imageRefsBySectionKey.get(section.key) || []
      const sectionComponents = capture.snapshot.components.filter((component) => component.sectionKey === section.key)
      const sectionMedia = capture.snapshot.mediaLayers.filter((media) => media.sectionKey === section.key)
      sections.push({
        id: sectionId,
        pageId,
        order: section.order,
        role: section.role,
        rect: section.rect,
        layoutMode: section.layoutMode,
        parentSectionId: section.parentKey ? sectionIds.get(`${captureKey}|${section.parentKey}`) : undefined,
        tokenRefs: tokenRefsForStyles(section.styles, tokenIndex),
        componentRefs: sectionComponents.map((component) => componentIds.byItem.get(component)!),
        interactionRefs: [],
        mediaLayerRefs: sectionMedia.map((media) => mediaIds.byItem.get(media)!),
        evidenceRefs: imageEvidenceRefs,
        observedStyles: safeSectionObservedStyles(section.styles),
      })
      const snapType = section.styles.scrollSnapType
      if (snapType && snapType !== 'none') {
        const id = createEvidenceId('interaction', pageId, 'scroll-snap', section.key)
        interactionObservations.push({
          id,
          pageId,
          sectionId,
          targetId: createEvidenceId('target', pageId, 'scroll-snap', section.key),
          driver: 'scroll',
          safety: 'passive',
          trigger: { kind: 'css-scroll-snap' },
          before: {},
          after: { scrollSnapType: snapType, scrollSnapAlign: section.styles.scrollSnapAlign || '' },
          changedProperties: ['scrollSnapType', 'scrollSnapAlign'],
          evidenceRefs: [sectionId, ...imageEvidenceRefs],
        })
        sections[sections.length - 1].interactionRefs.push(id)
      }
    }

    for (const component of capture.snapshot.components) {
      const sectionId = sectionIds.get(`${captureKey}|${component.sectionKey}`)
      if (!sectionId) continue
      const imageEvidenceRefs = imageRefsForRect(component.rect, component.sectionKey)
      components.push({
        id: componentIds.byItem.get(component)!,
        pageId,
        sectionId,
        type: component.type,
        elementKind: component.elementKind,
        role: component.role,
        rect: component.rect,
        styles: component.styles,
        tokenRefs: tokenRefsForStyles(component.styles, tokenIndex),
        stateRefs: [],
        confidence: component.confidence,
        evidenceRefs: [sectionId, ...imageEvidenceRefs],
      })
    }

    for (const ariaState of capture.snapshot.ariaStates || []) {
      const sectionId = sectionIds.get(`${captureKey}|${ariaState.sectionKey}`)
      if (!sectionId) continue
      const imageEvidenceRefs = imageRefsBySectionKey.get(ariaState.sectionKey) || []
      const id = ariaStateIds.byItem.get(ariaState)!
      interactionObservations.push({
        id,
        pageId,
        sectionId,
        targetId: createEvidenceId('target', id),
        driver: 'click',
        safety: 'passive',
        trigger: { kind: `aria-state:${ariaState.attribute}` },
        before: {},
        after: { [ariaState.attribute]: ariaState.value },
        changedProperties: [ariaState.attribute],
        evidenceRefs: [sectionId, ...imageEvidenceRefs],
      })
      const section = sections.find((candidate) => candidate.id === sectionId)
      if (section) section.interactionRefs.push(id)
    }

    for (const observation of capture.interactionObservations || []) {
      const sectionId = sectionIds.get(`${captureKey}|${observation.sectionKey}`)
      if (!sectionId) continue
      const id = activeInteractionIds.byItem.get(observation)!
      const targetComponentId = observation.targetComponentKey
        ? componentIds.byKey.get(observation.targetComponentKey)?.[0]
        : undefined
      const targetComponent = targetComponentId
        ? components.find((candidate) => candidate.id === targetComponentId)
        : undefined
      const imageEvidenceRefs = targetComponent
        ? imageRefsForRect(targetComponent.rect, observation.sectionKey)
        : imageRefsBySectionKey.get(observation.sectionKey) || []
      interactionObservations.push({
        id,
        pageId,
        sectionId,
        targetId: targetComponentId || createEvidenceId('target', id),
        driver: observation.driver,
        safety: 'safe-active',
        trigger: { kind: observation.triggerKind },
        before: observation.before,
        after: observation.after,
        changedProperties: observation.changedProperties,
        transition: observation.transition,
        evidenceRefs: [sectionId, ...imageEvidenceRefs, ...(targetComponentId ? [targetComponentId] : [])],
      })
      const section = sections.find((candidate) => candidate.id === sectionId)
      if (section) section.interactionRefs.push(id)
      if (targetComponentId) {
        const component = components.find((candidate) => candidate.id === targetComponentId)
        if (component) component.stateRefs.push(id)
      }
    }

    for (const node of capture.snapshot.layoutNodes) {
      const sectionId = sectionIds.get(`${captureKey}|${node.sectionKey}`)
      if (!sectionId) continue
      layoutNodes.push({
        id: layoutIds.byItem.get(node)!,
        pageId,
        sectionId,
        role: node.role,
        rect: node.rect,
        textRole: node.textRole,
        tokenRefs: tokenRefsForStyles(node.styles, tokenIndex),
        observedTypography: {
          fontFamily: node.styles.fontFamily,
          fontSize: node.styles.fontSize,
          fontWeight: node.styles.fontWeight,
          lineHeight: node.styles.lineHeight,
        },
        observedStyles: Object.fromEntries(
          [
            'backgroundColor',
            'borderRadius',
            'borderTop',
            'borderRight',
            'borderBottom',
            'borderLeft',
            'boxShadow',
          ].flatMap((property) => {
            const value = node.styles[property]
            return value && value !== 'none' && value !== 'rgba(0, 0, 0, 0)' ? [[property, value]] : []
          }),
        ),
        traits: node.traits,
      })
    }

    for (const pseudo of pseudoSnapshots) {
      const sectionId = sectionIds.get(`${captureKey}|${pseudo.sectionKey}`)
      if (!sectionId) continue
      const imageEvidenceRefs = imageRefsBySectionKey.get(pseudo.sectionKey) || []
      pseudoElements.push({
        id: pseudoIds.byItem.get(pseudo)!,
        pageId,
        sectionId,
        target: pseudo.target,
        kind: pseudo.kind,
        styles: pseudo.styles,
        evidenceRefs: [sectionId, ...imageEvidenceRefs],
      })
    }

    for (const media of capture.snapshot.mediaLayers) {
      const sectionId = sectionIds.get(`${captureKey}|${media.sectionKey}`)
      if (!sectionId) continue
      mediaLayers.push({
        id: mediaIds.byItem.get(media)!,
        pageId,
        sectionId,
        kind: media.kind,
        role: media.role,
        importance: media.importance,
        rect: media.rect,
        zIndex: media.zIndex,
        objectFit: media.objectFit,
        objectPosition: media.objectPosition,
        opacity: media.opacity,
        filter: media.filter,
        blendMode: media.blendMode,
        naturalSize: media.naturalSize,
        hasResponsiveSources: media.hasResponsiveSources,
      })
    }
  }

  input.captures.forEach((capture, captureIndex) => {
    const identityUrl = pageIdentityUrl(capture.snapshot.url)
    const pageId = createEvidenceId('page', identityUrl, capture.snapshot.viewport)
    const overviewImageId = imageIds.get(`${identityUrl}|${capture.snapshot.viewport}`)
    const page = pages.find((candidate) => candidate.id === pageId)
    const firstSection = sections.find((section) => section.pageId === pageId)
    const interactionStyles =
      capture.interactionStyles ||
      (captureIndex === 0 ? input.interactionStyles : { hover: [], focus: [], active: [], disabled: [] })
    if (!page || !firstSection) return
    const passiveStyles: Array<{
      driver: 'hover' | 'focus' | 'click' | 'disabled'
      triggerKind: string
      styles: NonNullable<InteractionStyles['disabled']>
    }> = [
      { driver: 'hover', triggerKind: 'css-pseudo-class:hover', styles: interactionStyles.hover },
      { driver: 'focus', triggerKind: 'css-pseudo-class:focus', styles: interactionStyles.focus },
      { driver: 'click', triggerKind: 'css-pseudo-class:active', styles: interactionStyles.active },
      { driver: 'disabled', triggerKind: 'state:disabled', styles: interactionStyles.disabled || [] },
    ]
    for (const group of passiveStyles) {
      const representativeStyles = [...group.styles].sort(
        (first, second) => Number(Boolean(second.changedProperties)) - Number(Boolean(first.changedProperties)),
      )
      representativeStyles.slice(0, 12).forEach((styles, index) => {
        const id = createEvidenceId('interaction', page.id, group.triggerKind, index)
        interactionObservations.push({
          id,
          pageId: page.id,
          sectionId: firstSection.id,
          targetId: createEvidenceId('target', page.id, group.triggerKind, index),
          driver: group.driver,
          safety: 'passive',
          trigger: { kind: group.triggerKind },
          before: styles.before,
          after: styles.after,
          changedProperties: styles.changedProperties || Object.keys(styles.after),
          source: styles.source,
          selector: styles.selector,
          // Stylesheet-derived state patterns have no section geometry. Only a full overview can support their image
          // citation; a section or viewport crop may depict a different target entirely.
          evidenceRefs: [firstSection.id, ...(overviewImageId ? [overviewImageId] : [])],
        })
        firstSection.interactionRefs.push(id)
      })
    }
  })

  const uniqueUrls = new Set(pages.map((page) => pageIdentityUrl(page.url)))
  const viewportCoverage = [...new Set(pages.map((page) => page.viewport))]
  const expectedViewports = [...new Set(input.expectedViewports || viewportCoverage)]
  const expectedCaptureCount =
    input.expectedCaptureCount ?? input.expectedPageCount * Math.max(1, expectedViewports.length)
  const expectedViewportSet = new Set(expectedViewports)
  const requestedCaptures = input.captures.filter((capture) => capture.captureScope !== 'supplemental')
  const capturedExpectedCombinations = new Set(
    requestedCaptures
      .filter((capture) => expectedViewportSet.has(capture.snapshot.viewport))
      .map((capture) => `${pageIdentityUrl(capture.snapshot.url)}|${capture.snapshot.viewport}`),
  ).size
  const fullMatrixExpected = input.expectedPageCount * Math.max(1, expectedViewports.length)
  const viewportsByUrl = new Map<string, Set<string>>()
  for (const capture of requestedCaptures) {
    if (!expectedViewportSet.has(capture.snapshot.viewport)) continue
    const identityUrl = pageIdentityUrl(capture.snapshot.url)
    const viewports = viewportsByUrl.get(identityUrl) || new Set<string>()
    viewports.add(capture.snapshot.viewport)
    viewportsByUrl.set(identityUrl, viewports)
  }
  const responsivePairedUrls = [...viewportsByUrl.values()].filter((viewports) =>
    expectedViewports.every((viewport) => viewports.has(viewport)),
  ).length
  const limitations: string[] = []
  limitations.push(...(input.limitations || []))
  if (uniqueUrls.size < input.expectedPageCount) limitations.push('fewer-pages-than-requested')
  if (capturedExpectedCombinations < expectedCaptureCount) {
    limitations.push('fewer-page-viewports-than-requested')
  }
  if (viewportCoverage.length < 2) limitations.push('single-viewport')
  if (pages.some((page) => page.horizontalOverflow)) limitations.push('horizontal-overflow-observed')
  for (const page of pages) {
    for (const issue of page.health?.issues || []) limitations.push(`page-health:${issue.code}@${page.id}`)
  }
  if (sections.length === 0) limitations.push('no-sections-detected')
  const interactionCandidateCount = input.captures.reduce(
    (sum, capture) => sum + capture.snapshot.interactionCandidates.length,
    0,
  )
  const safelyObservedCount = interactionObservations.filter(
    (observation) => observation.safety === 'safe-active',
  ).length
  if (interactionCandidateCount > safelyObservedCount) limitations.push('some-safe-interactions-skipped')
  const skippedCandidateLabels: string[] = []
  for (const capture of input.captures) {
    const observedKeys = new Set((capture.interactionObservations || []).map((observation) => observation.key))
    for (const candidate of capture.snapshot.interactionCandidates) {
      if (!observedKeys.has(candidate.key)) {
        const label = `skipped-interaction:${candidate.kind}@${candidate.key.slice(0, 60)}`
        if (!skippedCandidateLabels.includes(label)) skippedCandidateLabels.push(label)
      }
    }
  }
  limitations.push(...skippedCandidateLabels.slice(0, 20))
  if (interactionObservations.length === 0) limitations.push('no-interaction-states-observed')
  const majorMediaLayers = mediaLayers.filter((media) => media.importance === 'major')
  if (majorMediaLayers.length === 0) limitations.push('no-major-media-detected')
  if (majorMediaLayers.length > 0 && majorMediaLayers.every((media) => media.role === 'unknown')) {
    limitations.push('no-classified-media-regions')
  }
  const assetIssueCount = input.screenshotAssetIssueCount ?? screenshotAssetIssueCount(limitations)

  const pageSectionIds = new Map<string, string[]>()
  for (const section of sections) {
    const ids = pageSectionIds.get(section.pageId) || []
    ids.push(section.id)
    pageSectionIds.set(section.pageId, ids)
  }

  const roleUrlCounts = new Map<string, Set<string>>()
  for (const section of sections) {
    const page = pages.find((candidate) => candidate.id === section.pageId)
    if (!page) continue
    const urls = roleUrlCounts.get(section.role) || new Set<string>()
    urls.add(pageIdentityUrl(page.url))
    roleUrlCounts.set(section.role, urls)
  }
  const crossPagePatternIds = [...roleUrlCounts.entries()]
    .filter(([, urls]) => urls.size >= 2)
    .map(([role]) => createEvidenceId('pattern', 'section-role', role))

  const topology = {
    schemaVersion: '1' as const,
    pages: pages.map((page) => ({
      pageId: page.id,
      role: page.role || 'unknown',
      sectionIds: pageSectionIds.get(page.id) || [],
    })),
    globalLayers: sections
      .filter((section) => section.layoutMode !== 'flow')
      .map((section) => ({
        id: createEvidenceId('layer', section.pageId, section.id),
        pageId: section.pageId,
        role: section.role === 'navigation' ? ('navigation' as const) : ('other' as const),
        layoutMode: section.layoutMode,
        evidenceRefs: [section.id, ...section.evidenceRefs],
      })),
    crossPagePatternIds,
  }

  const responsiveResult = buildResponsiveObservations(input.captures, sectionIds, imageIds)
  const responsiveObservations = responsiveResult.observations
  if (responsiveResult.identityMismatchCount > 0) {
    limitations.push('responsive-section-identity-mismatch')
  }
  const coverage = {
    pageCoverage: uniqueUrls.size >= input.expectedPageCount ? ('complete' as const) : ('partial' as const),
    urlCoverage: {
      requested: input.expectedPageCount,
      captured: uniqueUrls.size,
    },
    captureCoverage: {
      expected: expectedCaptureCount,
      captured: Math.min(expectedCaptureCount, capturedExpectedCombinations),
      status: capturedExpectedCombinations >= expectedCaptureCount ? ('complete' as const) : ('partial' as const),
      requestedViewports: expectedViewports,
      fullMatrix: {
        expected: fullMatrixExpected,
        captured: Math.min(fullMatrixExpected, capturedExpectedCombinations),
        status: capturedExpectedCombinations >= fullMatrixExpected ? ('complete' as const) : ('partial' as const),
      },
      ...(expectedViewports.length > 1
        ? {
            responsivePairs: {
              expectedUrls: input.expectedPageCount,
              capturedUrls: Math.min(input.expectedPageCount, responsivePairedUrls),
              status: responsivePairedUrls >= input.expectedPageCount ? ('complete' as const) : ('partial' as const),
            },
          }
        : {}),
    },
    assetCoverage: {
      expected: pages.length,
      valid: Math.max(0, pages.length - Math.min(pages.length, assetIssueCount)),
      status: assetIssueCount === 0 ? ('complete' as const) : ('partial' as const),
      issueCount: assetIssueCount,
    },
    sectionCoverage:
      input.captures.length === 0
        ? 0
        : Math.round(
            (input.captures.filter((capture) => capture.snapshot.sections.length > 0).length / input.captures.length) *
              100,
          ) / 100,
    viewportCoverage,
    interactionCoverage: {
      candidates: interactionCandidateCount,
      safelyObserved: safelyObservedCount,
      skipped: Math.max(0, interactionCandidateCount - safelyObservedCount),
    },
    mediaCoverage: {
      majorRegions: mediaLayers.filter((media) => media.importance === 'major').length,
      classifiedRegions: mediaLayers.filter((media) => media.importance === 'major' && media.role !== 'unknown').length,
      iconRegions: mediaLayers.filter((media) => media.importance === 'icon').length,
    },
    accessRestrictions: [
      ...(input.accessMode === 'managed' ? ['managed-access'] : []),
      ...(input.authWallDetected
        ? [input.accessMode === 'managed' ? 'auth-wall-resolved-by-managed-access' : 'auth-wall-detected']
        : []),
    ],
    limitations,
  }

  const entryPage = pages[0]
  return {
    schemaVersion: '1',
    analysisId: input.analysisId,
    source: {
      requestedUrl: input.requestedUrl,
      finalUrl: input.finalUrl,
      accessMode: input.accessMode,
      language: input.captures[0]?.snapshot.language,
      ...(entryPage?.title ? { title: entryPage.title } : {}),
      ...(entryPage?.siteName ? { siteName: entryPage.siteName } : {}),
    },
    pages,
    tokens: input.tokens,
    featureTags: input.featureTags,
    topology,
    sections,
    components,
    layoutNodes,
    pseudoElements,
    interactionStyles: input.interactionStyles,
    interactionObservations,
    breakpoints: input.breakpoints,
    responsiveObservations,
    motion: input.motion,
    mediaLayers,
    coverage,
    limitations,
    techStack: input.techStack,
  }
}
