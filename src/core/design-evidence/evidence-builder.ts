import { createHash } from 'node:crypto'
import fs from 'node:fs'

import type { MotionToken, ResponsiveBreakpoint } from '../analyzer/responsive-motion.js'
import type { PageScreenshot } from '../analyzer/types.js'
import type { DesignToken, InteractionStyles } from '../analyzer/types.js'
import type { InteractionObservationSnapshot } from './interaction-observer.js'
import type { PageEvidenceSnapshot, PageSectionSnapshot } from './page-extractor.js'
import { createEvidenceId } from './stable-id.js'
import type {
  ComponentEvidence,
  DesignEvidence,
  EvidenceImage,
  LayoutEvidenceNode,
  MediaLayerEvidence,
  ResponsiveSectionObservation,
  SectionEvidence,
} from './types.js'

export interface CapturedPageEvidence {
  screenshot: PageScreenshot
  snapshot: PageEvidenceSnapshot
  interactionStyles?: InteractionStyles
  interactionObservations?: InteractionObservationSnapshot[]
  supplementalImages?: Array<Omit<EvidenceImage, 'id' | 'sectionId'> & { sectionKey?: string }>
}

export interface BuildDesignEvidenceInput {
  analysisId: string
  requestedUrl: string
  finalUrl: string
  accessMode: 'anonymous' | 'managed'
  authWallDetected?: boolean
  expectedPageCount: number
  tokens: DesignToken
  featureTags: string[]
  interactionStyles: InteractionStyles
  breakpoints: ResponsiveBreakpoint[]
  motion: MotionToken[]
  captures: CapturedPageEvidence[]
  techStack?: import('./types.js').TechStackInfo
}

function imageContentHash(filePath: string): string | undefined {
  try {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    return undefined
  }
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

function buildTokenIndex(tokens: DesignToken): Map<string, string[]> {
  const index = new Map<string, string[]>()
  const add = (value: string, ref: string) => {
    const variants = new Set([value.toLowerCase().trim(), normalizeColor(value), normalizeTokenValue(value)])
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
  for (const value of Object.values(styles)) {
    const candidates = new Set<string>([
      value.toLowerCase().trim(),
      normalizeColor(value),
      normalizeTokenValue(value),
      ...(value
        .match(/rgba?\([^)]+\)|#[\da-f]{3,8}|-?\d+(?:\.\d+)?(?:px|rem|em|s|ms)\b/gi)
        ?.flatMap((part) => [part.toLowerCase(), normalizeColor(part), normalizeTokenValue(part)]) || []),
    ])
    for (const candidate of candidates) {
      tokenIndex.get(candidate)?.forEach((ref) => refs.add(ref))
    }
  }
  return [...refs].sort()
}

function changedSectionProperties(from: PageSectionSnapshot, to: PageSectionSnapshot): string[] {
  const changed = new Set<string>()
  if (from.order !== to.order) changed.add('order')
  if (from.layoutMode !== to.layoutMode) changed.add('layoutMode')
  for (const key of new Set([...Object.keys(from.styles), ...Object.keys(to.styles)])) {
    if (from.styles[key] !== to.styles[key]) changed.add(key)
  }
  const rectKeys = ['x', 'y', 'width', 'height'] as const
  for (const key of rectKeys) {
    if (Math.abs(from.rect[key] - to.rect[key]) >= 0.04) changed.add(`rect.${key}`)
  }
  return [...changed]
}

function buildResponsiveObservations(
  captures: CapturedPageEvidence[],
  sectionIds: Map<string, string>,
  imageIds: Map<string, string>,
): ResponsiveSectionObservation[] {
  const viewportOrder = ['desktop', 'tablet', 'mobile']
  const byUrl = new Map<string, CapturedPageEvidence[]>()
  for (const capture of captures) {
    const list = byUrl.get(capture.snapshot.url) || []
    list.push(capture)
    byUrl.set(capture.snapshot.url, list)
  }

  const observations: ResponsiveSectionObservation[] = []
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
      const fromByKey = new Map(fromCapture.snapshot.sections.map((section) => [section.key, section]))
      const toByKey = new Map(toCapture.snapshot.sections.map((section) => [section.key, section]))
      for (const key of new Set([...fromByKey.keys(), ...toByKey.keys()])) {
        const from = fromByKey.get(key)
        const to = toByKey.get(key)
        const fromCaptureKey = `${fromCapture.snapshot.url}|${fromCapture.snapshot.viewport}`
        const toCaptureKey = `${toCapture.snapshot.url}|${toCapture.snapshot.viewport}`
        const fromSectionId = sectionIds.get(`${fromCaptureKey}|${key}`)
        const toSectionId = sectionIds.get(`${toCaptureKey}|${key}`)
        if (!from || !to || !fromSectionId || !toSectionId) {
          const sectionId = fromSectionId || toSectionId
          if (!sectionId) continue
          observations.push({
            id: createEvidenceId('responsive', sectionId, fromCapture.snapshot.viewport, toCapture.snapshot.viewport),
            sectionId,
            fromViewport: fromCapture.snapshot.viewport,
            toViewport: toCapture.snapshot.viewport,
            changeType: 'visibility',
            changedProperties: ['visibility'],
            summary: 'The section is present in only one of the compared viewport captures.',
            evidenceRefs: [
              ...(fromSectionId ? [fromSectionId] : []),
              ...(toSectionId ? [toSectionId] : []),
              imageIds.get(fromCaptureKey) || '',
              imageIds.get(toCaptureKey) || '',
            ].filter(Boolean),
          })
          continue
        }

        const changedProperties = changedSectionProperties(from, to)
        const fromInteractionKinds = fromCapture.snapshot.interactionCandidates
          .filter((candidate) => candidate.sectionKey === key)
          .map((candidate) => candidate.kind)
          .sort()
        const toInteractionKinds = toCapture.snapshot.interactionCandidates
          .filter((candidate) => candidate.sectionKey === key)
          .map((candidate) => candidate.kind)
          .sort()
        const interactionChanged = JSON.stringify(fromInteractionKinds) !== JSON.stringify(toInteractionKinds)
        if (interactionChanged) changedProperties.push('interactionModel')
        if (changedProperties.length === 0) continue
        const reorderOnly =
          changedProperties.includes('order') &&
          changedProperties.every((property) => ['order', 'rect.x', 'rect.y'].includes(property))
        const structural = changedProperties.some((property) =>
          ['order', 'layoutMode', 'display', 'gridTemplateColumns', 'rect.x', 'rect.y'].includes(property),
        )
        const sizeOnly = changedProperties.every((property) =>
          [
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
          summary: `Observed ${changedProperties.length} section-level changes between ${fromCapture.snapshot.viewport} and ${toCapture.snapshot.viewport}.`,
          evidenceRefs: [
            fromSectionId,
            toSectionId,
            imageIds.get(fromCaptureKey) || '',
            imageIds.get(toCaptureKey) || '',
          ].filter(Boolean),
        })
      }
    }
  }
  return observations
}

export function buildDesignEvidence(input: BuildDesignEvidenceInput): DesignEvidence {
  const tokenIndex = buildTokenIndex(input.tokens)
  const pages: DesignEvidence['pages'] = []
  const sections: SectionEvidence[] = []
  const components: ComponentEvidence[] = []
  const layoutNodes: LayoutEvidenceNode[] = []
  const mediaLayers: MediaLayerEvidence[] = []
  const interactionObservations: DesignEvidence['interactionObservations'] = []
  const sectionIds = new Map<string, string>()
  const imageIds = new Map<string, string>()

  for (const capture of input.captures) {
    const captureKey = `${capture.snapshot.url}|${capture.snapshot.viewport}`
    const pageId = createEvidenceId('page', capture.snapshot.url, capture.snapshot.viewport)
    const imageId = createEvidenceId('image', pageId, 'overview')
    imageIds.set(captureKey, imageId)
    pages.push({
      id: pageId,
      url: capture.snapshot.url,
      viewport: capture.snapshot.viewport,
      role: capture.snapshot.role,
      images: [
        {
          id: imageId,
          kind: 'overview',
          path: capture.screenshot.path,
          width: capture.snapshot.width,
          height: capture.snapshot.height,
          contentHash: imageContentHash(capture.screenshot.path),
        },
        ...(capture.supplementalImages || []).map((image, index) => ({
          ...image,
          id: createEvidenceId('image', pageId, image.kind, index),
          contentHash: imageContentHash(image.path),
        })),
      ],
    })

    for (const section of capture.snapshot.sections) {
      sectionIds.set(`${captureKey}|${section.key}`, createEvidenceId('section', pageId, section.key))
    }

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
        componentRefs: sectionComponents.map((component) => createEvidenceId('component', pageId, component.key)),
        interactionRefs: [],
        mediaLayerRefs: sectionMedia.map((media) => createEvidenceId('media', pageId, media.key)),
        evidenceRefs: [imageId],
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
          evidenceRefs: [sectionId, imageId],
        })
        sections[sections.length - 1].interactionRefs.push(id)
      }
    }

    for (const component of capture.snapshot.components) {
      const sectionId = sectionIds.get(`${captureKey}|${component.sectionKey}`)
      if (!sectionId) continue
      components.push({
        id: createEvidenceId('component', pageId, component.key),
        pageId,
        sectionId,
        type: component.type,
        role: component.role,
        rect: component.rect,
        styles: component.styles,
        tokenRefs: tokenRefsForStyles(component.styles, tokenIndex),
        stateRefs: [],
        confidence: component.confidence,
        evidenceRefs: [sectionId, imageId],
      })
    }

    for (const ariaState of capture.snapshot.ariaStates || []) {
      const sectionId = sectionIds.get(`${captureKey}|${ariaState.sectionKey}`)
      if (!sectionId) continue
      const id = createEvidenceId('interaction', pageId, ariaState.key)
      interactionObservations.push({
        id,
        pageId,
        sectionId,
        targetId: createEvidenceId('target', pageId, ariaState.key),
        driver: 'click',
        safety: 'passive',
        trigger: { kind: `aria-state:${ariaState.attribute}` },
        before: {},
        after: { [ariaState.attribute]: ariaState.value },
        changedProperties: [ariaState.attribute],
        evidenceRefs: [sectionId, imageId],
      })
      const section = sections.find((candidate) => candidate.id === sectionId)
      if (section) section.interactionRefs.push(id)
    }

    for (const observation of capture.interactionObservations || []) {
      const sectionId = sectionIds.get(`${captureKey}|${observation.sectionKey}`)
      if (!sectionId) continue
      const id = createEvidenceId('interaction', pageId, observation.key)
      const targetComponentId = observation.targetComponentKey
        ? createEvidenceId('component', pageId, observation.targetComponentKey)
        : undefined
      interactionObservations.push({
        id,
        pageId,
        sectionId,
        targetId: targetComponentId || createEvidenceId('target', pageId, observation.targetKey),
        driver: observation.driver,
        safety: 'safe-active',
        trigger: { kind: observation.triggerKind },
        before: observation.before,
        after: observation.after,
        changedProperties: observation.changedProperties,
        transition: observation.transition,
        evidenceRefs: targetComponentId ? [sectionId, imageId, targetComponentId] : [sectionId, imageId],
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
        id: createEvidenceId('layout', pageId, node.key),
        pageId,
        sectionId,
        role: node.role,
        rect: node.rect,
        textRole: node.textRole,
        tokenRefs: tokenRefsForStyles(node.styles, tokenIndex),
        traits: node.traits,
      })
    }

    for (const media of capture.snapshot.mediaLayers) {
      const sectionId = sectionIds.get(`${captureKey}|${media.sectionKey}`)
      if (!sectionId) continue
      mediaLayers.push({
        id: createEvidenceId('media', pageId, media.key),
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
    const pageId = createEvidenceId('page', capture.snapshot.url, capture.snapshot.viewport)
    const page = pages.find((candidate) => candidate.id === pageId)
    const firstSection = sections.find((section) => section.pageId === pageId)
    const interactionStyles =
      capture.interactionStyles ||
      (captureIndex === 0 ? input.interactionStyles : { hover: [], focus: [], active: [], disabled: [] })
    if (!page || !firstSection) return
    const passiveStyles: Array<{
      driver: 'hover' | 'focus' | 'click' | 'disabled'
      triggerKind: string
      styles: Record<string, string>[]
    }> = [
      { driver: 'hover', triggerKind: 'css-pseudo-class:hover', styles: interactionStyles.hover },
      { driver: 'focus', triggerKind: 'css-pseudo-class:focus', styles: interactionStyles.focus },
      { driver: 'click', triggerKind: 'css-pseudo-class:active', styles: interactionStyles.active },
      { driver: 'disabled', triggerKind: 'state:disabled', styles: interactionStyles.disabled || [] },
    ]
    for (const group of passiveStyles) {
      group.styles.slice(0, 12).forEach((styles, index) => {
        const id = createEvidenceId('interaction', page.id, group.triggerKind, index)
        interactionObservations.push({
          id,
          pageId: page.id,
          sectionId: firstSection.id,
          targetId: createEvidenceId('target', page.id, group.triggerKind, index),
          driver: group.driver,
          safety: 'passive',
          trigger: { kind: group.triggerKind },
          before: {},
          after: styles,
          changedProperties: Object.keys(styles),
          evidenceRefs: [firstSection.id, page.images[0]?.id].filter(Boolean),
        })
        firstSection.interactionRefs.push(id)
      })
    }
  })

  const uniqueUrls = new Set(pages.map((page) => page.url))
  const viewportCoverage = [...new Set(pages.map((page) => page.viewport))]
  const limitations: string[] = []
  if (uniqueUrls.size < input.expectedPageCount) limitations.push('fewer-pages-than-requested')
  if (viewportCoverage.length < 2) limitations.push('single-viewport')
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
        skippedCandidateLabels.push(`skipped-interaction:${candidate.kind}@${candidate.key.slice(0, 60)}`)
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
    urls.add(page.url)
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

  const responsiveObservations = buildResponsiveObservations(input.captures, sectionIds, imageIds)
  const coverage = {
    pageCoverage: uniqueUrls.size >= input.expectedPageCount ? ('complete' as const) : ('partial' as const),
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
      ...(input.authWallDetected ? ['auth-wall-detected'] : []),
    ],
    limitations,
  }

  return {
    schemaVersion: '1',
    analysisId: input.analysisId,
    source: {
      requestedUrl: input.requestedUrl,
      finalUrl: input.finalUrl,
      accessMode: input.accessMode,
      language: input.captures[0]?.snapshot.language,
    },
    pages,
    tokens: input.tokens,
    featureTags: input.featureTags,
    topology,
    sections,
    components,
    layoutNodes,
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
