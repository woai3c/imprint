import { normalizeColorValue } from '../analyzer/color-cluster.js'
import {
  classifyComponentVariant,
  hasVisibleBorder,
  hasVisibleShadow,
  isPillRadius,
} from '../analyzer/component-detect.js'
import type { ComponentType, ComponentVariant } from '../analyzer/component-detect.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { distillInteractionChanges } from './evidence-selector.js'
import type { EvidencePackage, IntelligenceInputMode, InteractionChange } from './types.js'

export interface DigestTokenValue {
  id: string
  value: string
}

export interface AnalysisDigest {
  schemaVersion: '1'
  inputMode: IntelligenceInputMode
  pages: Array<{
    id: string
    urlGroup: string
    role: string
    viewport: string
    images: string[]
    sectionSequence: string[]
    overflow?: {
      viewportWidth: number
      contentWidth: number
      sources?: Array<{ locator: string; overflowPx: number; section?: string; role?: string }>
    }
    limitations: string[]
  }>
  tokenFacts: {
    colors: Array<{ id: string; name: string; value: string; roles: string[]; count: number; pages: number }>
    typography: {
      families: DigestTokenValue[]
      stacks: DigestTokenValue[]
      sizes: DigestTokenValue[]
      weights: DigestTokenValue[]
      lineHeights: DigestTokenValue[]
      letterSpacings: DigestTokenValue[]
    }
    spacing: DigestTokenValue[]
    radii: DigestTokenValue[]
    shadows: DigestTokenValue[]
    borders: DigestTokenValue[]
    zIndices: DigestTokenValue[]
    transitions: DigestTokenValue[]
  }
  sectionPatterns: Array<{
    role: string
    count: number
    pages: string[]
    layouts: string[]
    tokenRefs: string[]
    sampleEvidenceIds: string[]
    observedStyles?: NonNullable<DesignEvidence['sections'][number]['observedStyles']>
  }>
  componentPatterns: Array<{
    type: string
    role?: string
    variant?: ComponentVariant
    count: number
    pages: string[]
    sampleSize?: { width: number; height: number; shape: 'square' | 'wide' | 'tall' }
    cornerShape?: 'pill' | 'rounded' | 'sharp'
    exactStyles: Record<string, string>
    tokenRefs: string[]
    stateChanges: InteractionChange[]
    sampleEvidenceIds: string[]
  }>
  layoutPatterns: Array<{
    role: string
    textRole?: string
    count: number
    traits: string[]
    tokenRefs: string[]
    sampleEvidenceIds: string[]
  }>
  interactionFacts: Array<{
    id: string
    section: string
    driver: string
    safety: string
    trigger: string
    changes: InteractionChange[]
    changedProperties: string[]
  }>
  responsiveFacts: Array<{
    id: string
    page: string
    section: string
    from: string
    to: string
    change: string
    changedProperties: string[]
  }>
  mediaFacts: Array<{
    id: string
    section: string
    kind: string
    role: string
    importance: string
    layoutMode?: string
  }>
  coverage: {
    pageCoverage: string
    urlCoverage?: { requested: number; captured: number }
    captureCoverage?: { expected: number; captured: number; status: string; requestedViewports: string[] }
    viewportCoverage: string[]
    safeInteractions: number
    skippedInteractions: number
    omitted: string[]
  }
  uncertainties: string[]
}

export interface AnalysisDigestPackage {
  digest: AnalysisDigest
  evidenceIdMap: ReadonlyMap<string, string>
  evidenceShortIdMap: ReadonlyMap<string, string>
  tokenRefMap: ReadonlyMap<string, string>
  tokenShortIdMap: ReadonlyMap<string, string>
}

const EXACT_STYLE_KEYS = new Set([
  'background',
  'backgroundColor',
  'border',
  'borderColor',
  'borderRadius',
  'borderStyle',
  'borderWidth',
  'boxShadow',
  'color',
  'columnGap',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'gap',
  'height',
  'letterSpacing',
  'lineHeight',
  'margin',
  'maxWidth',
  'minHeight',
  'minWidth',
  'opacity',
  'outline',
  'outlineColor',
  'outlineWidth',
  'padding',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'rowGap',
  'transform',
  'width',
])

const COLOR_ROLE_LABELS: ReadonlyArray<[RegExp, string]> = [
  [/^usage:(?:primaryActionColor|actionColor|selectedColor)$/, 'action'],
  [/^usage:linkColor$/, 'link'],
  [/^usage:textColor$/, 'text'],
  [/^usage:(?:bgColor|bgArea)$/, 'background'],
  [/^usage:(?:structuralBorderColor|borderColor)$/, 'border'],
  [/^usage:(?:accentColor|brandTokenColor)$/, 'accent'],
]

function shortIdRegistry() {
  const evidenceIdMap = new Map<string, string>()
  const evidenceShortIdMap = new Map<string, string>()
  const counters = new Map<string, number>()
  const add = (stableId: string, prefix: string) => {
    const existing = evidenceShortIdMap.get(stableId)
    if (existing) return existing
    const shortId = `${prefix}${(counters.get(prefix) || 0) + 1}`
    counters.set(prefix, (counters.get(prefix) || 0) + 1)
    evidenceIdMap.set(shortId, stableId)
    evidenceShortIdMap.set(stableId, shortId)
    return shortId
  }
  return { add, evidenceIdMap, evidenceShortIdMap }
}

function tokenRegistry() {
  const tokenRefMap = new Map<string, string>()
  const tokenShortIdMap = new Map<string, string>()
  const add = (tokenRef: string) => {
    const existing = tokenShortIdMap.get(tokenRef)
    if (existing) return existing
    const shortId = `t${tokenShortIdMap.size + 1}`
    tokenRefMap.set(shortId, tokenRef)
    tokenShortIdMap.set(tokenRef, shortId)
    return shortId
  }
  return { add, tokenRefMap, tokenShortIdMap }
}

function stableUnique(values: string[], limit = Number.POSITIVE_INFINITY): string[] {
  return [...new Set(values)].slice(0, limit)
}

function safeExactStyles(styles: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(styles)
      .filter(([key, value]) => {
        if (!EXACT_STYLE_KEYS.has(key) || !value || value.length > 120) return false
        return !/[\r\n]|url\s*\(|(?:file|https?):\/\//i.test(value)
      })
      .sort(([first], [second]) => first.localeCompare(second))
      .slice(0, 16),
  )
}

function comparableStyleValue(value: string): string {
  const color = normalizeColorValue(value)
  if (color) return color
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim()
  const length = normalized.match(/^(-?\d+(?:\.\d+)?)(px|em|rem)$/)
  if (!length) return normalized
  const numeric = Number.parseFloat(length[1])
  const rem = length[2] === 'px' ? numeric / 16 : numeric
  return `${Number(rem.toFixed(4))}rem`
}

function tokenValueByRef(evidence: DesignEvidence): Map<string, string> {
  const result = new Map<string, string>()
  const add = (ref: string, value: string) => result.set(ref, comparableStyleValue(value))
  Object.entries(evidence.tokens.colors).forEach(([name, value]) => add(`color.${name}`, value))
  evidence.tokens.typography.fontFamilies.forEach((value, index) => add(`typography.font-family.${index + 1}`, value))
  evidence.tokens.typography.fontStacks.forEach((value, index) => add(`typography.font-stack.${index + 1}`, value))
  evidence.tokens.typography.fontSizes.forEach((value, index) => add(`typography.font-size.${index + 1}`, value))
  evidence.tokens.typography.fontWeights.forEach((value, index) => add(`typography.font-weight.${index + 1}`, value))
  evidence.tokens.typography.lineHeights.forEach((value, index) => add(`typography.line-height.${index + 1}`, value))
  evidence.tokens.typography.letterSpacings.forEach((value, index) =>
    add(`typography.letter-spacing.${index + 1}`, value),
  )
  evidence.tokens.spacing.forEach((value, index) => add(`spacing.${index + 1}`, value))
  evidence.tokens.radii.forEach((value, index) => add(`radius.${index + 1}`, value))
  evidence.tokens.shadows.forEach((value, index) => add(`shadow.${index + 1}`, value))
  evidence.tokens.borders.forEach((value, index) => add(`border.${index + 1}`, value))
  evidence.tokens.zIndices.forEach((value, index) => add(`z-index.${index + 1}`, value))
  evidence.tokens.transitions.forEach((value, index) => add(`transition.${index + 1}`, value))
  return result
}

const RAW_STYLE_LITERAL = /(?:^|[^\p{L}])-?\d|#[\da-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|calc\(|var\(/iu

type SectionObservedStyles = NonNullable<DesignEvidence['sections'][number]['observedStyles']>
type ResponsiveObservation = Omit<DesignEvidence['responsiveObservations'][number], 'evidenceRefs'>

function boundedStructuralHeight(role: string, value: string | undefined): boolean {
  if (!/^(?:header|navigation|action|toolbar|tablist)$/i.test(role) || !value) return false
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i)
  return Boolean(match && Number.parseFloat(match[1]) > 0 && Number.parseFloat(match[1]) <= 240)
}

function promptSectionObservedStyles(
  role: string,
  observedStyles: SectionObservedStyles | undefined,
): SectionObservedStyles | undefined {
  if (!observedStyles) return undefined
  const position = observedStyles.layout?.position
  const layout = Object.fromEntries(
    Object.entries(observedStyles.layout || {}).filter(([property, value]) => {
      if (property === 'height') return boundedStructuralHeight(role, value)
      if (property === 'top') return /^(?:sticky|fixed)$/i.test(position || '')
      return true
    }),
  )
  const borders = Object.fromEntries(
    Object.entries(observedStyles.borders || {}).filter(([, value]) => hasVisibleBorder(value)),
  )
  const boxShadow = hasVisibleShadow(observedStyles.boxShadow) ? observedStyles.boxShadow : undefined
  const result: SectionObservedStyles = {
    ...(observedStyles.backgroundColor ? { backgroundColor: observedStyles.backgroundColor } : {}),
    ...(observedStyles.borderRadius ? { borderRadius: observedStyles.borderRadius } : {}),
    ...(observedStyles.gradient ? { gradient: observedStyles.gradient } : {}),
    ...(Object.keys(layout).length > 0 ? { layout } : {}),
    ...(Object.keys(borders).length > 0 ? { borders } : {}),
    ...(boxShadow ? { boxShadow } : {}),
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function usefulResponsiveProperties(observation: ResponsiveObservation, sectionRole: string): string[] {
  const reusableProperty =
    /^(?:order|layoutMode|position|display|gridTemplateColumns|childGridTemplateColumns|maxWidth|gap|padding(?:Top|Right|Bottom|Left)?|borderRadius|border(?:Top|Right|Bottom|Left)|boxShadow|interactionModel|node\.[^.]+\.(?:fontSize|lineHeight|display))$/
  return observation.changedProperties.filter((property) => {
    if (property === 'height') {
      const change = observation.changes?.[property]
      return (
        boundedStructuralHeight(sectionRole, typeof change?.from === 'string' ? change.from : undefined) &&
        boundedStructuralHeight(sectionRole, typeof change?.to === 'string' ? change.to : undefined)
      )
    }
    return reusableProperty.test(property)
  })
}

function describeResponsiveChange(observation: ResponsiveObservation, properties: string[]): string {
  const details = properties.flatMap((property) => {
    const change = observation.changes?.[property]
    if (!change || change.from === undefined || change.to === undefined || change.from === change.to) return []
    return [`${property}: ${String(change.from).slice(0, 80)} -> ${String(change.to).slice(0, 80)}`]
  })
  return details.length > 0
    ? details.join('; ').slice(0, 360)
    : `Observed ${observation.changeType} between ${observation.fromViewport} and ${observation.toViewport}.`
}

function colorRoles(sources: string[] | undefined): string[] {
  const values = sources || []
  const hasRenderedUse = values.some((source) =>
    /^usage:(?:primaryAction|action|selected|accent|link|status|bgArea|bgColor|textColor|structuralBorderColor|borderColor)/.test(
      source,
    ),
  )
  if (!hasRenderedUse && values.some((source) => source.startsWith('css-variable:'))) return ['declared']
  return stableUnique(
    values.flatMap((source) => {
      const role = COLOR_ROLE_LABELS.find(([pattern]) => pattern.test(source))?.[1]
      return role ? [role] : []
    }),
  )
}

function tokenValues(values: string[], prefix: string, addToken: (tokenRef: string) => string): DigestTokenValue[] {
  return values.slice(0, 16).map((value, index) => ({ id: addToken(`${prefix}.${index + 1}`), value }))
}

function pageGroupMap(pages: EvidencePackage['evidence']['pages']): Map<string, string> {
  const groupByUrl = new Map<string, string>()
  for (const page of pages) {
    if (!groupByUrl.has(page.url)) groupByUrl.set(page.url, `u${groupByUrl.size + 1}`)
  }
  return groupByUrl
}

export function buildAnalysisDigest(evidence: DesignEvidence, evidencePackage: EvidencePackage): AnalysisDigestPackage {
  const ids = shortIdRegistry()
  const tokens = tokenRegistry()
  const selected = evidencePackage.evidence
  const selectedPageIds = new Set(evidencePackage.selectedPageIds)
  const selectedSectionIds = new Set(evidencePackage.selectedSectionIds)
  const selectedComponentIds = new Set(selected.components.map((component) => component.id))
  const pageGroups = pageGroupMap(selected.pages)
  const knownTokenValues = tokenValueByRef(evidence)
  const promptSafeStyles = (styles: Record<string, string>, tokenRefs: string[]): Record<string, string> =>
    Object.fromEntries(
      Object.entries(safeExactStyles(styles)).flatMap(([property, value]) => {
        const comparable = comparableStyleValue(value)
        const matchingTokenRef = tokenRefs.find((tokenRef) => knownTokenValues.get(tokenRef) === comparable)
        if (matchingTokenRef) return [[property, tokens.add(matchingTokenRef)]]
        // Exact DOM values such as 9999px radii and negative positioning offsets are useful
        // extraction evidence, but they are not reusable design tokens. Do not expose them to
        // the synthesis model, which otherwise tends to promote them into global rules.
        return RAW_STYLE_LITERAL.test(value) ? [] : [[property, value]]
      }),
    )

  selected.pages.forEach((page) => {
    ids.add(page.id, 'p')
    page.imageIds.forEach((imageId) => ids.add(imageId, 'i'))
  })
  selected.sections.forEach((section) => ids.add(section.id, 's'))
  selected.components.forEach((component) => ids.add(component.id, 'c'))
  selected.layoutNodes.forEach((node) => ids.add(node.id, 'l'))
  selected.interactionObservations.forEach((observation) => ids.add(observation.id, 'a'))
  selected.responsiveObservations.forEach((observation) => ids.add(observation.id, 'r'))
  selected.mediaLayers.forEach((media) => ids.add(media.id, 'm'))

  const pageShortId = (stableId: string) => ids.evidenceShortIdMap.get(stableId) || ids.add(stableId, 'p')
  const sectionShortId = (stableId: string) => ids.evidenceShortIdMap.get(stableId) || ids.add(stableId, 's')
  const tokenShortIds = (refs: string[]) =>
    stableUnique(
      refs.map((ref) => tokens.add(ref)),
      10,
    )

  const pages = selected.pages.map((page) => {
    const sectionSequence = selected.sections
      .filter((section) => section.pageId === page.id)
      .sort((first, second) => first.order - second.order)
      .map((section) => sectionShortId(section.id))
    const limitations: string[] = []
    if (page.horizontalOverflow) limitations.push('horizontal-overflow-observed')
    for (const issue of page.health?.issues || []) limitations.push(`page-health:${issue.code}`)
    if (selected.coverage.accessRestrictions.includes('auth-wall-resolved-by-managed-access')) {
      limitations.push('authenticated-managed-capture')
    }
    return {
      id: pageShortId(page.id),
      urlGroup: pageGroups.get(page.url) || 'u1',
      role: page.role || 'unknown',
      viewport: page.viewport,
      images: page.imageIds.flatMap((imageId) => {
        const shortId = ids.evidenceShortIdMap.get(imageId)
        return shortId ? [shortId] : []
      }),
      sectionSequence,
      ...(page.horizontalOverflow && page.viewportWidth && page.contentWidth
        ? {
            overflow: {
              viewportWidth: page.viewportWidth,
              contentWidth: page.contentWidth,
              ...(page.horizontalOverflowSources?.length
                ? {
                    sources: page.horizontalOverflowSources
                      .slice(0, 3)
                      .map(({ locator, overflowPx, sectionId, sectionRole }) => ({
                        locator,
                        overflowPx,
                        ...(sectionId && ids.evidenceShortIdMap.has(sectionId)
                          ? { section: ids.evidenceShortIdMap.get(sectionId) }
                          : {}),
                        ...(sectionRole ? { role: sectionRole } : {}),
                      })),
                  }
                : {}),
            },
          }
        : {}),
      limitations,
    }
  })

  const colors = Object.entries(selected.tokens.colors)
    .slice(0, 24)
    .map(([name, value]) => {
      const tokenRef = `color.${name}`
      // The selected package intentionally caps detailed token evidence for prompt size. Digest
      // facts still come from the complete deterministic extraction so a retained color never
      // degrades to count=0/pages=0 merely because its evidence fell outside that cap.
      const tokenEvidence = evidence.tokens.evidence?.[`colors.${name}`]
      return {
        id: tokens.add(tokenRef),
        name,
        value,
        roles: colorRoles(tokenEvidence?.sources),
        count: Math.round(tokenEvidence?.observationCount || 0),
        pages: tokenEvidence?.pageCount || 0,
      }
    })

  const sectionGroups = new Map<string, typeof selected.sections>()
  for (const section of selected.sections) {
    const observedStyles = promptSectionObservedStyles(section.role, section.observedStyles)
    const key = `${section.role}|${section.layoutMode}|${[...section.tokenRefs].sort().join(',')}|${JSON.stringify(observedStyles || {})}`
    const group = sectionGroups.get(key) || []
    group.push(section)
    sectionGroups.set(key, group)
  }
  const sectionPatterns = [...sectionGroups.values()].slice(0, 12).map((group) => ({
    role: group[0].role,
    count: group.length,
    pages: stableUnique(
      group.map((section) => pageShortId(section.pageId)),
      4,
    ),
    layouts: stableUnique(
      group.map((section) => section.layoutMode),
      4,
    ),
    tokenRefs: tokenShortIds(group.flatMap((section) => section.tokenRefs)),
    sampleEvidenceIds: group.slice(0, 2).map((section) => sectionShortId(section.id)),
    ...(promptSectionObservedStyles(group[0].role, group[0].observedStyles)
      ? { observedStyles: promptSectionObservedStyles(group[0].role, group[0].observedStyles) }
      : {}),
  }))

  const originalComponents = evidence.components.filter(
    (component) => selectedPageIds.has(component.pageId) && selectedSectionIds.has(component.sectionId),
  )
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const componentSize = (component: (typeof originalComponents)[number]) => {
    const page = pageById.get(component.pageId)
    const pageWidth = page?.contentWidth || page?.viewportWidth
    const pageHeight = page?.contentHeight || page?.viewportHeight
    if (!pageWidth || !pageHeight) return undefined
    const width = Math.round(component.rect.width * pageWidth)
    const height = Math.round(component.rect.height * pageHeight)
    if (width <= 0 || height <= 0) return undefined
    const ratio = width / height
    return {
      width,
      height,
      shape: ratio >= 1.5 ? ('wide' as const) : ratio <= 0.67 ? ('tall' as const) : ('square' as const),
    }
  }
  const componentVariant = (component: (typeof originalComponents)[number]) => {
    const size = componentSize(component)
    return classifyComponentVariant(component.type as ComponentType, component.styles, {
      tokenRefs: component.tokenRefs,
      primaryColor: evidence.tokens.colors.primary,
      role: component.role,
      ...(size ? { widthPx: size.width, heightPx: size.height } : {}),
    })
  }
  const componentGroups = new Map<string, typeof originalComponents>()
  for (const component of originalComponents) {
    const styles = safeExactStyles(component.styles)
    const key = `${component.type}|${componentVariant(component) || ''}|${component.role || ''}|${JSON.stringify(styles)}`
    const group = componentGroups.get(key) || []
    group.push(component)
    componentGroups.set(key, group)
  }
  const componentPatterns = [...componentGroups.values()]
    .flatMap((group) => {
      const componentIds = new Set(group.map((component) => component.id))
      const samples = group.filter((component) => selectedComponentIds.has(component.id)).slice(0, 2)
      if (samples.length === 0) return []
      const sample = samples[0]
      const variant = componentVariant(sample)
      const sampleSize = componentSize(sample)
      const cornerShape = isPillRadius(sample.styles, sampleSize ? { heightPx: sampleSize.height } : undefined)
        ? ('pill' as const)
        : sample.styles.borderRadius && /[1-9]/.test(sample.styles.borderRadius)
          ? ('rounded' as const)
          : ('sharp' as const)
      const relatedInteractions = evidence.interactionObservations.filter(
        (observation) =>
          componentIds.has(observation.targetId) ||
          group.some((component) => component.stateRefs.includes(observation.id)),
      )
      return [
        {
          type: group[0].type,
          ...(group[0].role ? { role: group[0].role } : {}),
          ...(variant ? { variant } : {}),
          count: group.length,
          pages: stableUnique(
            group.map((component) => pageShortId(component.pageId)),
            4,
          ),
          ...(sampleSize ? { sampleSize } : {}),
          cornerShape,
          exactStyles: promptSafeStyles(
            group[0].styles,
            group.flatMap((component) => component.tokenRefs),
          ),
          tokenRefs: tokenShortIds(group.flatMap((component) => component.tokenRefs)),
          stateChanges: relatedInteractions.flatMap(distillInteractionChanges).slice(0, 6),
          sampleEvidenceIds: samples.map((component) => ids.evidenceShortIdMap.get(component.id)!),
        },
      ]
    })
    .slice(0, 16)

  const layoutGroups = new Map<string, typeof selected.layoutNodes>()
  for (const node of selected.layoutNodes) {
    const key = `${node.role}|${node.textRole || ''}|${[...node.traits].sort().join(',')}|${[...node.tokenRefs].sort().join(',')}`
    const group = layoutGroups.get(key) || []
    group.push(node)
    layoutGroups.set(key, group)
  }
  const layoutPatterns = [...layoutGroups.values()].slice(0, 20).map((group) => ({
    role: group[0].role,
    ...(group[0].textRole ? { textRole: group[0].textRole } : {}),
    count: group.length,
    traits: group[0].traits.slice(0, 6),
    tokenRefs: tokenShortIds(group.flatMap((node) => node.tokenRefs)),
    sampleEvidenceIds: group.slice(0, 2).map((node) => ids.evidenceShortIdMap.get(node.id)!),
  }))

  const sectionById = new Map(selected.sections.map((section) => [section.id, section]))
  const interactionFacts = selected.interactionObservations.slice(0, 12).map((observation) => ({
    id: ids.evidenceShortIdMap.get(observation.id)!,
    section: sectionShortId(observation.sectionId),
    driver: observation.driver,
    safety: observation.safety,
    trigger: observation.trigger.kind,
    changes: observation.changes.slice(0, 6),
    changedProperties: observation.changedProperties.slice(0, 8),
  }))
  const responsiveFacts = selected.responsiveObservations
    .slice(0, 24)
    .flatMap((observation) => {
      const section = sectionById.get(observation.sectionId)
      const changedProperties = usefulResponsiveProperties(observation, section?.role || '')
      if (changedProperties.length === 0) return []
      return [
        {
          id: ids.evidenceShortIdMap.get(observation.id)!,
          page: section ? pageShortId(section.pageId) : pages[0]?.id || 'p1',
          section: sectionShortId(observation.sectionId),
          from: observation.fromViewport,
          to: observation.toViewport,
          change: describeResponsiveChange(observation, changedProperties),
          changedProperties: changedProperties.slice(0, 8),
        },
      ]
    })
    .slice(0, 12)
  const mediaFacts = selected.mediaLayers.slice(0, 12).map((media) => ({
    id: ids.evidenceShortIdMap.get(media.id)!,
    section: sectionShortId(media.sectionId),
    kind: media.kind,
    role: media.role,
    importance: media.importance || 'supporting',
    ...(media.layoutMode ? { layoutMode: media.layoutMode } : {}),
  }))

  const digest: AnalysisDigest = {
    schemaVersion: '1',
    inputMode: evidencePackage.inputMode,
    pages,
    tokenFacts: {
      colors,
      typography: {
        families: tokenValues(selected.tokens.typography.fontFamilies, 'typography.font-family', tokens.add),
        stacks: tokenValues(selected.tokens.typography.fontStacks, 'typography.font-stack', tokens.add),
        sizes: tokenValues(selected.tokens.typography.fontSizes, 'typography.font-size', tokens.add),
        weights: tokenValues(selected.tokens.typography.fontWeights, 'typography.font-weight', tokens.add),
        lineHeights: tokenValues(selected.tokens.typography.lineHeights, 'typography.line-height', tokens.add),
        letterSpacings: tokenValues(selected.tokens.typography.letterSpacings, 'typography.letter-spacing', tokens.add),
      },
      spacing: tokenValues(selected.tokens.spacing, 'spacing', tokens.add),
      radii: tokenValues(selected.tokens.radii, 'radius', tokens.add),
      shadows: tokenValues(selected.tokens.shadows, 'shadow', tokens.add),
      borders: tokenValues(selected.tokens.borders, 'border', tokens.add),
      zIndices: tokenValues(selected.tokens.zIndices, 'z-index', tokens.add),
      transitions: tokenValues(selected.tokens.transitions, 'transition', tokens.add),
    },
    sectionPatterns,
    componentPatterns,
    layoutPatterns,
    interactionFacts,
    responsiveFacts,
    mediaFacts,
    coverage: {
      pageCoverage: selected.coverage.pageCoverage,
      ...(selected.coverage.urlCoverage ? { urlCoverage: selected.coverage.urlCoverage } : {}),
      ...(selected.coverage.captureCoverage ? { captureCoverage: selected.coverage.captureCoverage } : {}),
      viewportCoverage: selected.coverage.viewportCoverage,
      safeInteractions: selected.coverage.interactionCoverage.safelyObserved,
      skippedInteractions: selected.coverage.interactionCoverage.skipped,
      omitted: evidencePackage.omittedEvidence.map((item) => `${item.kind}:${item.reason}`),
    },
    uncertainties: stableUnique(
      [...selected.limitations, ...selected.coverage.limitations, ...selected.coverage.accessRestrictions].flatMap(
        (limitation) => {
          const health = limitation.match(/^page-health:([^@]+)@(.+)$/)
          if (!health) return [limitation]
          const pageId = ids.evidenceShortIdMap.get(health[2])
          return pageId ? [`page-health:${health[1]}@${pageId}`] : []
        },
      ),
      20,
    ),
  }

  return {
    digest,
    evidenceIdMap: ids.evidenceIdMap,
    evidenceShortIdMap: ids.evidenceShortIdMap,
    tokenRefMap: tokens.tokenRefMap,
    tokenShortIdMap: tokens.tokenShortIdMap,
  }
}
