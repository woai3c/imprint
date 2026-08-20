import type { DesignToken } from '../analyzer/types.js'
import { sanitizeUrlForPersistence } from '../analyzer/url-privacy.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { coreTranslator } from '../i18n/index.js'
import type { DesignClaim, DesignProfile } from './types.js'

// Claim token refs use the evidence-package scheme: named colors plus 1-based
// array paths such as `spacing.2` and `typography.font-stack.1`.
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

function claimEvidenceIds(claim: DesignClaim): string[] {
  return [
    ...new Set([
      ...claim.evidence.map((reference) => reference.evidenceId),
      ...(claim.assertions?.flatMap((assertion) => assertion.evidenceIds) || []),
    ]),
  ]
}

function claimEvidenceCount(claim: DesignClaim): number {
  return claimEvidenceIds(claim).length
}

function scopeUrl(url: string): string {
  const sanitized = sanitizeUrlForPersistence(url)
  try {
    const parsed = new URL(sanitized)
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    return `${parsed.host}${pathname}`
  } catch {
    return sanitized
  }
}

function buildClaimScopeFormatter(
  evidence: DesignEvidence | undefined,
  t: ReturnType<typeof coreTranslator>,
): (claim: DesignClaim) => string | null {
  if (!evidence) return () => null

  const pages = new Map(evidence.pages.map((page) => [page.id, page]))
  const pageIds = new Map<string, string>()
  const add = (evidenceId: string, pageId: string): void => {
    pageIds.set(evidenceId, pageId)
  }
  for (const page of evidence.pages) {
    add(page.id, page.id)
    page.images.forEach((image) => add(image.id, page.id))
  }
  evidence.sections.forEach((section) => add(section.id, section.pageId))
  evidence.components.forEach((component) => add(component.id, component.pageId))
  evidence.layoutNodes.forEach((node) => add(node.id, node.pageId))
  evidence.pseudoElements?.forEach((pseudo) => add(pseudo.id, pseudo.pageId))
  evidence.interactionObservations.forEach((observation) => add(observation.id, observation.pageId))
  evidence.mediaLayers.forEach((layer) => add(layer.id, layer.pageId))
  evidence.topology.globalLayers.forEach((layer) => add(layer.id, layer.pageId))
  const sectionPageIds = new Map(evidence.sections.map((section) => [section.id, section.pageId]))
  evidence.responsiveObservations.forEach((observation) => {
    const pageId = sectionPageIds.get(observation.sectionId)
    if (pageId) add(observation.id, pageId)
  })

  return (claim) => {
    const viewportsByUrl = new Map<string, Set<string>>()
    for (const evidenceId of claimEvidenceIds(claim)) {
      const page = pages.get(pageIds.get(evidenceId) || '')
      if (!page) continue
      const url = scopeUrl(page.url)
      const viewports = viewportsByUrl.get(url) || new Set<string>()
      viewports.add(page.viewport)
      viewportsByUrl.set(url, viewports)
    }
    const scopes = [...viewportsByUrl.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(
        ([url, viewports]) =>
          `${url} · ${[...viewports]
            .sort()
            .map((viewport) => translatedTerm(viewport, t))
            .join('/')}`,
      )
    if (scopes.length === 0) return null
    const visible = scopes.slice(0, 2)
    if (scopes.length > visible.length) {
      visible.push(t('scopeMore', { count: scopes.length - visible.length }))
    }
    return visible.join(t('scopeSeparator'))
  }
}

function isExecutedInteractionClaim(claim: DesignClaim): boolean {
  return Boolean(
    claim.assertions?.some((assertion) => assertion.kind === 'interaction' && assertion.predicate === 'executed'),
  )
}

function hasClassifiedImagery(claim: DesignClaim): boolean {
  const roles =
    claim.assertions
      ?.filter((assertion) => assertion.target === 'imagery')
      .flatMap((assertion) => (Array.isArray(assertion.value) ? [assertion.value[1]] : [])) || []
  return roles.length === 0 || roles.some((role) => role !== 'unknown')
}

function translatedTerm(value: string, t: ReturnType<typeof coreTranslator>): string {
  const aliases: Record<string, string> = {
    'node.heading.fontSize': 'headingFontSize',
  }
  return t(`terms.${aliases[value] || value}`, { defaultValue: value })
}

function formatClaimText(
  text: string,
  aliasRefs: ReadonlyMap<string, string>,
  t: ReturnType<typeof coreTranslator>,
): string {
  let formatted = [...aliasRefs.entries()].reduce((value, [source, target]) => {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return value.replace(new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g'), target)
  }, text)
  const terms = [
    'childGridTemplateColumns',
    'gridTemplateColumns',
    'controlledVisibility',
    'controlledOpacity',
    'sequenceIndex',
    'ariaExpanded',
    'ariaSelected',
    'node.heading.fontSize',
    'layoutMode',
    'lineHeight',
    'fontSize',
    'primary-action',
    'feature-group',
    'safe-active',
    'decorative',
    'navigation',
    'combobox',
    'secondary',
    'rounded',
    'primary',
    'button',
    'desktop',
    'mobile',
    'header',
    'content',
    'footer',
    'table',
    'input',
    'action',
    'aside',
    'media',
    'hero',
    'sharp',
    'pill',
    'flow',
    'right',
    'full',
    'grid',
    'list',
    'card',
    'text',
    'icon',
    'image',
    'click',
    'tab',
    'reflow',
    'reorder',
    'visibility',
    'interaction',
    'mixed',
    'scale',
    'height',
    'position',
    'order',
    'display',
  ]
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    formatted = formatted.replace(new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g'), translatedTerm(term, t))
  }
  formatted = formatted.replaceAll(', ', t('listSeparator')).replaceAll(' -> ', t('sequenceArrow'))
  let compact = formatted
  do {
    formatted = compact
    compact = formatted.replace(/([\p{Script=Han}])\s+([\p{Script=Han}])/gu, '$1$2')
  } while (compact !== formatted)
  return compact
}

type LabeledClaim = DesignClaim & { label?: string }

function mergeClaims(first: LabeledClaim, second: LabeledClaim): LabeledClaim {
  const evidence = [
    ...new Map([...first.evidence, ...second.evidence].map((reference) => [reference.evidenceId, reference])).values(),
  ]
  const assertions = [...(first.assertions || []), ...(second.assertions || [])]
  const uniqueAssertions = [...new Map(assertions.map((assertion) => [JSON.stringify(assertion), assertion])).values()]
  const confidenceRank: Record<DesignClaim['confidence'], number> = { low: 0, medium: 1, high: 2 }
  return {
    ...first,
    confidence:
      confidenceRank[first.confidence] <= confidenceRank[second.confidence] ? first.confidence : second.confidence,
    evidence,
    ...(first.tokenRefs || second.tokenRefs
      ? { tokenRefs: [...new Set([...(first.tokenRefs || []), ...(second.tokenRefs || [])])] }
      : {}),
    ...(uniqueAssertions.length > 0 ? { assertions: uniqueAssertions } : {}),
  }
}

function claimLines(
  title: string,
  claims: LabeledClaim[],
  t: ReturnType<typeof coreTranslator>,
  options: {
    formatText: (text: string) => string
    formatTokenRefs: (claim: DesignClaim) => string | null
    renderedClaimKeys: Set<string>
    scopeForClaim: (claim: DesignClaim) => string | null
  },
): string[] {
  const uniqueClaims = new Map<string, LabeledClaim>()
  for (const claim of claims) {
    if (claim.confidence === 'low') continue
    const key = claim.catalogId ? `catalog:${claim.catalogId}` : `statement:${claim.statement}`
    if (options.renderedClaimKeys.has(key)) continue
    const existing = uniqueClaims.get(key)
    uniqueClaims.set(key, existing ? mergeClaims(existing, claim) : claim)
  }
  uniqueClaims.forEach((_claim, key) => options.renderedClaimKeys.add(key))

  const visibleByPresentation = new Map<string, LabeledClaim>()
  for (const claim of uniqueClaims.values()) {
    const key = JSON.stringify([
      claim.label || '',
      options.formatText(claim.statement),
      options.scopeForClaim(claim) || '',
    ])
    const existing = visibleByPresentation.get(key)
    visibleByPresentation.set(key, existing ? mergeClaims(existing, claim) : claim)
  }
  const visible = [...visibleByPresentation.values()]
  if (visible.length === 0) return []

  return [
    `### ${title}`,
    '',
    ...visible.map((claim) => {
      const confidence = t(`confidence.${claim.confidence}`)
      const scope = options.scopeForClaim(claim)
      const metadata = scope
        ? t('factMetadataWithScope', { confidence, count: claimEvidenceCount(claim), scope })
        : t('factMetadata', { confidence, count: claimEvidenceCount(claim) })
      const statement = options.formatText(claim.statement)
      const tokenRefs = options.formatTokenRefs(claim)
      return [
        `- ${claim.label ? `**${claim.label}${t('labelSeparator')}** ` : ''}${statement} _(${metadata})_`,
        ...(tokenRefs ? [`  - ${t('relatedTokens')}${t('labelValueSeparator')}${tokenRefs}`] : []),
      ].join('\n')
    }),
    '',
  ]
}

export function generateDesignProfileMarkdown(
  profile: DesignProfile,
  tokens?: DesignToken,
  publicColorNames: ReadonlyMap<string, string> = new Map(),
  evidence?: DesignEvidence,
): string {
  const t = coreTranslator(profile.language, 'profileExport')
  const aliasRefs = new Map<string, string>()
  for (const [sourceName, publicName] of publicColorNames) {
    aliasRefs.set(`color.${sourceName}`, `color.${publicName}`)
  }
  const formatText = (text: string): string => formatClaimText(text, aliasRefs, t)
  const formatTokenRef = (ref: string): string => {
    const mapped = aliasRefs.get(ref) ?? ref
    const directlyResolved = tokens ? resolveTokenRefValue(tokens, ref) : null
    const sourceRef = [...aliasRefs.entries()].find(
      ([candidate, publicRef]) =>
        publicRef === mapped && tokens?.colors[candidate.slice('color.'.length)] !== undefined,
    )?.[0]
    const value = directlyResolved || (tokens && sourceRef ? resolveTokenRefValue(tokens, sourceRef) : null)
    return value ? `\`${mapped}\` (${value})` : `\`${mapped}\``
  }
  const claimOptions = {
    formatText,
    formatTokenRefs: (claim: DesignClaim): string | null =>
      claim.tokenRefs?.length ? claim.tokenRefs.map(formatTokenRef).join(t('listSeparator')) : null,
    renderedClaimKeys: new Set<string>(),
    scopeForClaim: buildClaimScopeFormatter(evidence, t),
  }
  const compositionClaims = Object.entries(profile.composition).map(([label, claim]) => ({
    ...claim,
    label: t(`claimLabels.${label}`),
  }))
  const componentClaims = profile.componentGrammar.flatMap((grammar) =>
    grammar.rules.map((claim) => ({
      ...claim,
      label: [translatedTerm(grammar.component, t), translatedTerm(grammar.role, t)]
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(' · '),
    })),
  )
  const attentionClaims = [
    { ...profile.attention.entryPoint, label: t('claimLabels.entryPoint') },
    ...profile.attention.visualSequence.map((claim) => ({ ...claim, label: t('claimLabels.visualSequence') })),
    { ...profile.attention.actionHierarchy, label: t('claimLabels.actionHierarchy') },
    { ...profile.attention.contrastStrategy, label: t('claimLabels.contrastStrategy') },
  ]
  const sectionClaims = profile.sectionGrammar.flatMap((grammar) =>
    [...grammar.composition, ...grammar.contentRhythm, ...grammar.transitionToNext].map((claim) => ({
      ...claim,
      label: translatedTerm(grammar.role, t),
    })),
  )
  const executedInteractionClaims = profile.interactionLanguage.primaryDrivers.filter(isExecutedInteractionClaim)
  const additionalPatternClaims = [
    { ...profile.visualLanguage.surfaces, label: t('claimLabels.surfaces') },
    ...(profile.visualLanguage.imagery && hasClassifiedImagery(profile.visualLanguage.imagery)
      ? [{ ...profile.visualLanguage.imagery, label: t('claimLabels.imagery') }]
      : []),
    ...(profile.visualLanguage.motion ? [{ ...profile.visualLanguage.motion, label: t('claimLabels.motion') }] : []),
  ]
  const uncertainties = uniqueUncertainties(profile)
  const patternClaims = (profile.patterns || []).flatMap((pattern) =>
    [...pattern.structureRules, ...pattern.visualRules, ...pattern.interactionRules, ...pattern.responsiveRules].map(
      (claim) => ({ ...claim, label: pattern.name }),
    ),
  )
  const transferClaims = [
    ...profile.transferRules.preserve.map((claim) => ({ ...claim, label: t('claimLabels.preserve') })),
    ...profile.transferRules.adapt.map((claim) => ({ ...claim, label: t('claimLabels.adapt') })),
    ...profile.transferRules.avoid.map((claim) => ({ ...claim, label: t('claimLabels.avoid') })),
  ]
  const uncertaintyLines =
    uncertainties.length > 0
      ? [
          `### ${t('sections.uncertainties')}`,
          '',
          ...uncertainties.map(
            (item) => `- ${formatText(item.topic)}${t('labelValueSeparator')}${formatText(item.reason)}`,
          ),
          '',
        ]
      : []

  return [
    t('catalogHeading'),
    '',
    t('catalogLayerNotice'),
    '',
    ...claimLines(t('sections.selectedHighlights'), profile.signatureMoves, t, claimOptions),
    ...claimLines(t('sections.composition'), compositionClaims, t, claimOptions),
    ...claimLines(t('sections.attention'), attentionClaims, t, claimOptions),
    ...claimLines(t('sections.sectionSemantics'), sectionClaims, t, claimOptions),
    ...claimLines(t('sections.componentSemantics'), componentClaims, t, claimOptions),
    ...claimLines(t('sections.executedInteractions'), executedInteractionClaims, t, claimOptions),
    ...claimLines(t('sections.additionalPatterns'), additionalPatternClaims, t, claimOptions),
    ...claimLines(t('sections.reusablePatterns'), patternClaims, t, claimOptions),
    ...claimLines(t('sections.transferBoundaries'), transferClaims, t, claimOptions),
    ...uncertaintyLines,
  ].join('\n')
}
