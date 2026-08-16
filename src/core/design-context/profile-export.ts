import type { DesignToken } from '../analyzer/types.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { coreTranslator } from '../i18n/index.js'
import type { DesignClaim, DesignProfile } from './types.js'

// Token refs in claims follow the evidence-package scheme: `color.<name>` plus 1-based array
// paths like `spacing.2` or `typography.font-stack.1` (see buildTokenIndex in design-evidence).
function resolveTokenRefValue(tokens: DesignToken, ref: string): string | null {
  const colorName = /^color\.(.+)$/.exec(ref)?.[1]
  if (colorName) return tokens.colors[colorName] ?? null
  const dot = ref.lastIndexOf('.')
  if (dot <= 0) return null
  const index = Number.parseInt(ref.slice(dot + 1), 10)
  if (!Number.isInteger(index) || index < 1) return null
  const arrays: Record<string, readonly string[]> = {
    'typography.font-family': tokens.typography.fontFamilies,
    'typography.font-stack': tokens.typography.fontStacks,
    'typography.font-size': tokens.typography.fontSizes,
    'typography.font-weight': tokens.typography.fontWeights,
    'typography.line-height': tokens.typography.lineHeights,
    'typography.letter-spacing': tokens.typography.letterSpacings,
    spacing: tokens.spacing,
    radius: tokens.radii,
    shadow: tokens.shadows,
    border: tokens.borders,
    'z-index': tokens.zIndices,
    transition: tokens.transitions,
  }
  return arrays[ref.slice(0, dot)]?.[index - 1] ?? null
}

export function generateDesignProfileJson(profile: DesignProfile): string {
  return JSON.stringify(profile, null, 2)
}

interface LowConfidenceEntry {
  section: string
  label?: string
  claim: DesignClaim
}

function uniqueUncertainties(profile: DesignProfile): DesignProfile['uncertainties'] {
  const seen = new Set<string>()
  let hasOverflowUncertainty = false
  return profile.uncertainties.filter((item) => {
    const text = `${item.topic} ${item.reason}`
    if (/^(?:确定性矛盾检查|Deterministic contradiction check)$/i.test(item.topic.trim())) return false
    if (/tokenFacts|tokenRefs/i.test(text)) return false
    const isOverflowUncertainty = /horizontal[- ]overflow|横向溢出|水平溢出/i.test(text)
    if (isOverflowUncertainty && hasOverflowUncertainty) return false
    if (isOverflowUncertainty) hasOverflowUncertainty = true
    const key = `${item.topic.trim()}|${item.reason.replace(/\s+/g, ' ').trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function profileClaims(profile: DesignProfile): DesignClaim[] {
  return [
    profile.thesis,
    ...profile.signatureMoves,
    ...Object.values(profile.composition),
    profile.attention.entryPoint,
    ...profile.attention.visualSequence,
    profile.attention.actionHierarchy,
    profile.attention.contrastStrategy,
    ...Object.values(profile.visualLanguage).filter((claim): claim is DesignClaim => Boolean(claim)),
    ...profile.sectionGrammar.flatMap((grammar) => [
      ...grammar.composition,
      ...grammar.contentRhythm,
      ...grammar.transitionToNext,
    ]),
    ...profile.interactionLanguage.primaryDrivers,
    profile.interactionLanguage.feedbackStyle,
    profile.interactionLanguage.stateChangeAmplitude,
    ...(profile.interactionLanguage.scrollNarrative ? [profile.interactionLanguage.scrollNarrative] : []),
    ...profile.interactionLanguage.continuityRules,
    ...profile.componentGrammar.flatMap((grammar) => grammar.rules),
    ...(profile.patterns || []).flatMap((pattern) => [
      ...pattern.structureRules,
      ...pattern.visualRules,
      ...pattern.interactionRules,
      ...pattern.responsiveRules,
    ]),
    ...profile.transferRules.preserve,
    ...profile.transferRules.adapt,
    ...profile.transferRules.avoid,
  ]
}

function evidenceFieldValue(value: unknown): string {
  const serialized =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value)
  const compact = (serialized || '-').replace(/\s+/g, ' ').replace(/`/g, "'").trim()
  return `\`${compact.length > 160 ? `${compact.slice(0, 159)}…` : compact}\``
}

function evidenceFields(entries: Array<[string, unknown]>): string {
  const parts = entries
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${evidenceFieldValue(value)}`)
  const visible: string[] = []
  let length = 0
  for (const part of parts) {
    const addedLength = part.length + (visible.length > 0 ? 2 : 0)
    if (visible.length > 0 && length + addedLength > 640) break
    visible.push(part)
    length += addedLength
  }
  return visible.join('; ')
}

function evidenceReferenceLines(
  profile: DesignProfile,
  evidence: DesignEvidence | undefined,
  t: ReturnType<typeof coreTranslator>,
): string[] {
  if (!evidence) return []
  const citedIds = [
    ...new Set(
      profileClaims(profile)
        .filter((claim) => claim.confidence !== 'low')
        .flatMap((claim) => [
          ...claim.evidence.map((reference) => reference.evidenceId),
          ...(claim.assertions?.flatMap((assertion) => assertion.evidenceIds) || []),
        ]),
    ),
  ]
  if (citedIds.length === 0) return []

  const pages = new Map(evidence.pages.map((page) => [page.id, page]))
  const sections = new Map(evidence.sections.map((section) => [section.id, section]))
  const components = new Map(evidence.components.map((component) => [component.id, component]))
  const layoutNodes = new Map(evidence.layoutNodes.map((node) => [node.id, node]))
  const pseudoElements = new Map((evidence.pseudoElements || []).map((pseudo) => [pseudo.id, pseudo]))
  const interactions = new Map(evidence.interactionObservations.map((observation) => [observation.id, observation]))
  const responsive = new Map(evidence.responsiveObservations.map((observation) => [observation.id, observation]))
  const media = new Map(evidence.mediaLayers.map((layer) => [layer.id, layer]))
  const topologyLayers = new Map(evidence.topology.globalLayers.map((layer) => [layer.id, layer]))
  const images = new Map(
    evidence.pages.flatMap((page) => page.images.map((item) => [item.id, { item, page }] as const)),
  )
  const pageContext = (pageId: string): Array<[string, unknown]> => {
    const page = pages.get(pageId)
    return [
      ['pageId', pageId],
      ['viewport', page?.viewport],
      ['url', page?.url],
    ]
  }
  const describe = (id: string): { kind: string; details: string } => {
    const page = pages.get(id)
    if (page) {
      return {
        kind: t('evidenceIndex.kinds.page'),
        details: evidenceFields([
          ['viewport', page.viewport],
          ['role', page.role],
          ['url', page.url],
          ['viewportSize', [page.viewportWidth, page.viewportHeight]],
          ['contentSize', [page.contentWidth, page.contentHeight]],
          ['horizontalOverflow', page.horizontalOverflow],
        ]),
      }
    }
    const image = images.get(id)
    if (image) {
      return {
        kind: t('evidenceIndex.kinds.image'),
        details: evidenceFields([
          ['kind', image.item.kind],
          ['size', [image.item.width, image.item.height]],
          ...pageContext(image.page.id),
        ]),
      }
    }
    const section = sections.get(id)
    if (section) {
      return {
        kind: t('evidenceIndex.kinds.section'),
        details: evidenceFields([
          ['role', section.role],
          ['order', section.order],
          ['layoutMode', section.layoutMode],
          ['rect', section.rect],
          ['observedStyles', section.observedStyles],
          ['tokenRefs', section.tokenRefs],
          ...pageContext(section.pageId),
        ]),
      }
    }
    const component = components.get(id)
    if (component) {
      return {
        kind: t('evidenceIndex.kinds.component'),
        details: evidenceFields([
          ['type', component.type],
          ['role', component.role],
          ['elementKind', component.elementKind],
          ['sectionId', component.sectionId],
          ['styles', component.styles],
          ['tokenRefs', component.tokenRefs],
          ...pageContext(component.pageId),
        ]),
      }
    }
    const layoutNode = layoutNodes.get(id)
    if (layoutNode) {
      return {
        kind: t('evidenceIndex.kinds.layoutNode'),
        details: evidenceFields([
          ['role', layoutNode.role],
          ['textRole', layoutNode.textRole],
          ['sectionId', layoutNode.sectionId],
          ['rect', layoutNode.rect],
          ['observedTypography', layoutNode.observedTypography],
          ['observedStyles', layoutNode.observedStyles],
          ...pageContext(layoutNode.pageId),
        ]),
      }
    }
    const pseudo = pseudoElements.get(id)
    if (pseudo) {
      return {
        kind: t('evidenceIndex.kinds.pseudoElement'),
        details: evidenceFields([
          ['kind', pseudo.kind],
          ['target', pseudo.target],
          ['sectionId', pseudo.sectionId],
          ['styles', pseudo.styles],
          ...pageContext(pseudo.pageId),
        ]),
      }
    }
    const interaction = interactions.get(id)
    if (interaction) {
      return {
        kind: t('evidenceIndex.kinds.interaction'),
        details: evidenceFields([
          ['driver', interaction.driver],
          ['safety', interaction.safety],
          ['sectionId', interaction.sectionId],
          ['changedProperties', interaction.changedProperties],
          ['before', interaction.before],
          ['after', interaction.after],
          ...pageContext(interaction.pageId),
        ]),
      }
    }
    const responsiveObservation = responsive.get(id)
    if (responsiveObservation) {
      const section = sections.get(responsiveObservation.sectionId)
      return {
        kind: t('evidenceIndex.kinds.responsive'),
        details: evidenceFields([
          ['sectionId', responsiveObservation.sectionId],
          ['fromViewport', responsiveObservation.fromViewport],
          ['toViewport', responsiveObservation.toViewport],
          ['changeType', responsiveObservation.changeType],
          ['changedProperties', responsiveObservation.changedProperties],
          ['changes', responsiveObservation.changes],
          ['summary', responsiveObservation.summary],
          ...(section ? pageContext(section.pageId) : []),
        ]),
      }
    }
    const mediaLayer = media.get(id)
    if (mediaLayer) {
      return {
        kind: t('evidenceIndex.kinds.media'),
        details: evidenceFields([
          ['kind', mediaLayer.kind],
          ['role', mediaLayer.role],
          ['importance', mediaLayer.importance],
          ['sectionId', mediaLayer.sectionId],
          ['rect', mediaLayer.rect],
          ...pageContext(mediaLayer.pageId),
        ]),
      }
    }
    const topologyLayer = topologyLayers.get(id)
    if (topologyLayer) {
      return {
        kind: t('evidenceIndex.kinds.topologyLayer'),
        details: evidenceFields([
          ['role', topologyLayer.role],
          ['layoutMode', topologyLayer.layoutMode],
          ...pageContext(topologyLayer.pageId),
        ]),
      }
    }
    return { kind: t('evidenceIndex.kinds.unknown'), details: evidenceFields([['evidenceId', id]]) }
  }
  return [
    `### ${t('evidenceIndex.heading')}`,
    '',
    t('evidenceIndex.notice'),
    '',
    ...citedIds.map((id) => {
      const description = describe(id)
      return `- \`${id}\` — ${description.kind}: ${description.details}`
    }),
    '',
  ]
}

function claimLines(
  title: string,
  claims: Array<DesignClaim & { label?: string }>,
  labels: { confidence: string; evidence: string; tokens: string; assertions: string },
  lowBucket: LowConfidenceEntry[],
  options: {
    keepLow?: boolean
    formatRef?: (ref: string) => string
    formatText?: (text: string) => string
    renderedCatalogIds?: Set<string>
  } = {},
) {
  const candidates = options.keepLow ? claims : claims.filter((claim) => claim.confidence !== 'low')
  if (!options.keepLow) {
    for (const claim of claims) {
      if (claim.confidence === 'low') lowBucket.push({ section: title, label: claim.label, claim })
    }
  }
  const main = candidates.filter((claim) => {
    if (!claim.catalogId || !options.renderedCatalogIds) return true
    if (options.renderedCatalogIds.has(claim.catalogId)) return false
    options.renderedCatalogIds.add(claim.catalogId)
    return true
  })
  if (main.length === 0) return []
  return [
    `### ${title}`,
    '',
    ...main.flatMap((claim) => [
      `- ${claim.label ? `**${claim.label}:** ` : ''}${options.formatText?.(claim.statement) ?? claim.statement}`,
      `  - ${labels.confidence}: ${claim.confidence}`,
      `  - ${labels.evidence}: ${claim.evidence.map((reference) => `\`${reference.evidenceId}\``).join(', ')}`,
      ...(claim.assertions && claim.assertions.length > 0
        ? (() => {
            const counts = new Map<string, number>()
            claim.assertions.forEach((assertion) => {
              const property = assertion.property ? `/${assertion.property}` : ''
              const value = assertion.value === undefined ? '' : `=${JSON.stringify(assertion.value)}`
              const text = `${assertion.kind}:${assertion.target}:${assertion.predicate}${property}${value}@${assertion.scope}`
              counts.set(text, (counts.get(text) || 0) + 1)
            })
            return [
              `  - ${labels.assertions}: ${[...counts.entries()]
                .map(([text, count]) => `\`${text}\`${count > 1 ? ` ×${count}` : ''}`)
                .join(', ')}`,
            ]
          })()
        : []),
      ...(claim.tokenRefs && claim.tokenRefs.length > 0
        ? [
            `  - ${labels.tokens}: ${claim.tokenRefs.map((reference) => options.formatRef?.(reference) ?? `\`${reference}\``).join(', ')}`,
          ]
        : []),
    ]),
    '',
  ]
}

function numberedVisibleClaims(claims: DesignClaim[], prefix: string): Array<DesignClaim & { label: string }> {
  let visibleIndex = 0
  return claims.map((claim) => ({
    ...claim,
    label: `${prefix}.${claim.confidence === 'low' ? 0 : ++visibleIndex}`,
  }))
}

export function generateDesignProfileMarkdown(
  profile: DesignProfile,
  tokens?: DesignToken,
  publicColorNames: ReadonlyMap<string, string> = new Map(),
  evidence?: DesignEvidence,
): string {
  const t = coreTranslator(profile.language, 'profileExport')
  const labels = {
    confidence: t('labels.confidence'),
    evidence: t('labels.evidence'),
    tokens: t('labels.tokens'),
    assertions: t('labels.assertions'),
  }
  const deterministicSectionKeys: Record<string, string> = {
    thesis: 'catalogThesis',
    signatureMoves: 'selectedHighlights',
    attention: 'catalogAttention',
    interactionLanguage: 'catalogInteraction',
    preserve: 'catalogPreserve',
    avoid: 'catalogAvoid',
  }
  const section = (key: string): string => t(`sections.${deterministicSectionKeys[key] || key}`)
  const lowBucket: LowConfidenceEntry[] = []
  // Map internal palette names to stable public names and append resolved values so references
  // remain checkable within the document.
  const aliasRefs = new Map<string, string>()
  for (const [sourceName, publicName] of publicColorNames) {
    aliasRefs.set(`color.${sourceName}`, `color.${publicName}`)
  }
  const formatRef = (ref: string): string => {
    const mapped = aliasRefs.get(ref) ?? ref
    const directlyResolved = tokens ? resolveTokenRefValue(tokens, ref) : null
    const sourceRef = [...aliasRefs.entries()].find(
      ([candidate, publicRef]) =>
        publicRef === mapped && tokens?.colors[candidate.slice('color.'.length)] !== undefined,
    )?.[0]
    const value = directlyResolved || (tokens && sourceRef ? resolveTokenRefValue(tokens, sourceRef) : null)
    return value ? `\`${mapped}\` (${value})` : `\`${mapped}\``
  }
  const formatText = (text: string): string =>
    [...aliasRefs.entries()].reduce((value, [source, target]) => {
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return value.replace(new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g'), target)
    }, text)
  const claimOptions = {
    formatRef,
    formatText,
    renderedCatalogIds: new Set<string>(),
  }
  const uncertainties = uniqueUncertainties(profile)
  const uncertaintyLines =
    uncertainties.length > 0
      ? [
          `### ${section('uncertainties')}`,
          '',
          ...uncertainties.map((item) => `- ${formatText(item.topic)}: ${formatText(item.reason)}`),
          '',
        ]
      : []
  const citedEvidenceLines = evidenceReferenceLines(profile, evidence, t)
  const componentGroups = new Map<string, Array<(typeof profile.componentGrammar)[number]>>()
  for (const component of profile.componentGrammar) {
    const group = componentGroups.get(component.component) || []
    group.push(component)
    componentGroups.set(component.component, group)
  }
  return [
    t('catalogHeading'),
    '',
    t('catalogLayerNotice'),
    '',
    t('catalogBoundaryNotice'),
    '',
    ...claimLines(section('thesis'), [profile.thesis], labels, lowBucket, claimOptions),
    ...claimLines(
      section('signatureMoves'),
      profile.signatureMoves.map((move) => ({
        ...move,
        label: move.name,
      })),
      labels,
      lowBucket,
      claimOptions,
    ),
    ...claimLines(
      section('composition'),
      Object.entries(profile.composition).map(([label, claim]) => ({
        ...claim,
        label,
      })),
      labels,
      lowBucket,
      claimOptions,
    ),
    ...claimLines(
      section('attention'),
      [
        { ...profile.attention.entryPoint, label: 'entryPoint' },
        ...numberedVisibleClaims(profile.attention.visualSequence, 'visualSequence'),
        { ...profile.attention.actionHierarchy, label: 'actionHierarchy' },
        { ...profile.attention.contrastStrategy, label: 'contrastStrategy' },
      ],
      labels,
      lowBucket,
      claimOptions,
    ),
    ...claimLines(
      section('visualLanguage'),
      Object.entries(profile.visualLanguage).flatMap(([label, claim]) =>
        claim
          ? [
              {
                ...claim,
                label,
              },
            ]
          : [],
      ),
      labels,
      lowBucket,
      claimOptions,
    ),
    ...claimLines(
      section('interactionLanguage'),
      [
        ...numberedVisibleClaims(profile.interactionLanguage.primaryDrivers, 'primaryDriver'),
        { ...profile.interactionLanguage.feedbackStyle, label: 'feedbackStyle' },
        { ...profile.interactionLanguage.stateChangeAmplitude, label: 'stateChangeAmplitude' },
        ...(profile.interactionLanguage.scrollNarrative
          ? [{ ...profile.interactionLanguage.scrollNarrative, label: 'scrollNarrative' }]
          : []),
        ...numberedVisibleClaims(profile.interactionLanguage.continuityRules, 'continuity'),
      ],
      labels,
      lowBucket,
      claimOptions,
    ),
    ...profile.sectionGrammar.flatMap((section) =>
      claimLines(
        `${t('sections.sectionGrammar')} · ${section.role}`,
        [
          ...section.composition.map((claim) => ({ ...claim, label: 'composition' })),
          ...section.contentRhythm.map((claim) => ({ ...claim, label: 'contentRhythm' })),
          ...section.transitionToNext.map((claim) => ({ ...claim, label: 'transitionToNext' })),
        ],
        labels,
        lowBucket,
        claimOptions,
      ),
    ),
    ...[...componentGroups.entries()].flatMap(([componentType, components]) =>
      claimLines(
        `${section('componentGrammar')} · ${componentType}`,
        components.flatMap((component) =>
          (() => {
            const visibleCount = component.rules.filter((claim) => claim.confidence !== 'low').length
            let visibleIndex = 0
            return component.rules.map((claim) => ({
              ...claim,
              label:
                visibleCount > 1
                  ? `${component.role}.${claim.confidence === 'low' ? 0 : ++visibleIndex}`
                  : component.role,
            }))
          })(),
        ),
        labels,
        lowBucket,
        claimOptions,
      ),
    ),
    ...(profile.patterns || []).flatMap((pattern) =>
      claimLines(
        `${section('transferablePattern')} · ${pattern.name}`,
        [
          ...pattern.structureRules.map((claim) => ({ ...claim, label: 'structure' })),
          ...pattern.visualRules.map((claim) => ({ ...claim, label: 'visual' })),
          ...pattern.interactionRules.map((claim) => ({ ...claim, label: 'interaction' })),
          ...pattern.responsiveRules.map((claim) => ({ ...claim, label: 'responsive' })),
        ],
        labels,
        lowBucket,
        claimOptions,
      ),
    ),
    ...claimLines(section('preserve'), profile.transferRules.preserve, labels, lowBucket, claimOptions),
    ...claimLines(section('adapt'), profile.transferRules.adapt, labels, lowBucket, claimOptions),
    ...claimLines(section('avoid'), profile.transferRules.avoid, labels, lowBucket, claimOptions),
    ...citedEvidenceLines,
    ...uncertaintyLines,
  ].join('\n')
}
