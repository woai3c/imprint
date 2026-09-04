import { canonicalEvidenceCaptureKeys } from '../design-evidence/canonical-pages.js'
import type { CapturedPageEvidence } from '../design-evidence/index.js'
import { buildDesignEvidence, isInternallyConsistentCapturedPage } from '../design-evidence/index.js'
import { hasSevereHorizontalOverflow } from '../design-evidence/reliability.js'
import type { DesignEvidence, TechStackInfo } from '../design-evidence/types.js'
import { clusterColors, normalizeColorValue } from './color-cluster.js'
import { buildFoundationForegroundPairEvidence, isFoundationForegroundPair } from './color-pair-evidence.js'
import { reselectPortableFoundationColors } from './color-role-promotion.js'
import { appendExtractionIssueLimitation, isPageHealthExtractionIssue } from './extraction-limitations.js'
import { buildEvidenceBackedClaims, generateFeatureTags } from './feature-tags.js'
import type { MotionToken, ResponsiveBreakpoint } from './responsive-motion.js'
import { selectFoundationSurfaceColors } from './semantic-owner.js'
import { mergeStyles, mergeStylesWithNormalizedUsage } from './style-merge.js'
import { buildDesignTokens, normalizeDesignTokenUsageCount } from './token-builder.js'
import { tokenCandidateId } from './token-catalog.js'
import { type TokenEvidenceCapture, buildTokenEvidence, measurementConfidenceFor } from './token-evidence.js'
import { isPortableTokenEvidence, promotePortableDesignTokens } from './token-promotion.js'
import type {
  ColorTokenCandidate,
  DesignToken,
  ExtractedStyles,
  ExtractionIssue,
  InteractionStyles,
  TokenReuseScope,
  TokenValueCandidate,
} from './types.js'
import { pageIdentityUrl } from './url-identity.js'

export interface BuildAnalysisOutputInput {
  analysisId: string
  requestedUrl: string
  finalUrl: string
  accessMode: 'anonymous' | 'managed'
  authWallDetected: boolean
  expectedPageCount: number
  expectedViewports: string[]
  expectedCaptureCount: number
  styles: ExtractedStyles[]
  styleCaptures: TokenEvidenceCapture[]
  evidenceEligibleStyles: ExtractedStyles[]
  evidenceEligibleStyleCaptures: TokenEvidenceCapture[]
  extractionIssues: ExtractionIssue[]
  limitations: string[]
  interactionStyles: InteractionStyles
  breakpoints: ResponsiveBreakpoint[]
  motion: MotionToken[]
  captures: CapturedPageEvidence[]
  techStack?: TechStackInfo
}

export interface AnalysisOutput {
  tokens: DesignToken
  rawStyles: ExtractedStyles
  designEvidence: DesignEvidence
  featureTags: string[]
}

export interface AnalysisOutputStages {
  onClusteringColors?: () => void
  onGeneratingTokens?: () => void
}

function emptyDesignTokens(): DesignToken {
  return {
    colors: {},
    typography: {
      fontFamilies: [],
      fontStacks: [],
      fontSizes: [],
      fontWeights: [],
      lineHeights: [],
      letterSpacings: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
    usageCount: {},
    evidence: {},
  }
}

const RENDERED_COLOR_CANDIDATE_CATEGORIES = new Set([
  'textColor',
  'bgColor',
  'bgArea',
  'borderColor',
  'structuralBorderColor',
  'accentColor',
  'linkColor',
  'selectedColor',
  'primaryActionBackgroundColor',
  'primaryActionForegroundColor',
  'actionBackgroundColor',
  'actionForegroundColor',
  'destructiveActionBackgroundColor',
  'destructiveActionForegroundColor',
  'statusBackgroundColor',
  'statusForegroundColor',
  'statusColor',
])

export function colorCandidateObservationCount(
  styles: Pick<ExtractedStyles, 'usageCount' | 'usageOwnerCounts' | 'usageOwnerIds'>,
  value: string,
  kind: 'declared-only' | 'observed-unassigned' = 'observed-unassigned',
): number {
  const normalized = normalizeColorValue(value)
  if (!normalized) return 0
  const counts = new Map<string, number>()
  const owners = new Set<string>()
  for (const [key, count] of Object.entries(styles.usageCount)) {
    const separator = key.indexOf(':')
    if (separator <= 0 || !Number.isFinite(count) || count <= 0) continue
    const category = key.slice(0, separator)
    if (normalizeColorValue(key.slice(separator + 1)) !== normalized) continue
    const eligibleCategory =
      kind === 'declared-only'
        ? category === 'declaredColor'
        : RENDERED_COLOR_CANDIDATE_CATEGORIES.has(category) && category !== 'bgArea'
    if (eligibleCategory) (styles.usageOwnerIds?.[key] || []).forEach((owner) => owners.add(owner))
    const ownerCount = styles.usageOwnerCounts?.[key]
    const normalizedCount = Number.isFinite(ownerCount) && Number(ownerCount) > 0 ? Number(ownerCount) : count
    counts.set(category, Math.max(counts.get(category) || 0, normalizedCount))
  }
  if (owners.size > 0) return owners.size
  if (kind === 'declared-only') return counts.get('declaredColor') || 0
  const baseRendered = Math.max(
    counts.get('bgColor') || 0,
    counts.get('textColor') || 0,
    counts.get('borderColor') || 0,
  )
  return (
    baseRendered ||
    Math.max(
      counts.get('structuralBorderColor') || 0,
      ...[...counts.entries()]
        .filter(([category]) => RENDERED_COLOR_CANDIDATE_CATEGORIES.has(category) && category !== 'bgArea')
        .map(([, count]) => count),
    )
  )
}

type ColorSemanticFamily =
  'action-background' | 'action-foreground' | 'status' | 'accent' | 'background' | 'foreground' | 'border'
type ColorPropertyChannel = 'background' | 'foreground' | 'border' | 'accent'

const COLOR_SEMANTIC_FAMILY_PRIORITY: ColorSemanticFamily[] = [
  'action-background',
  'status',
  'action-foreground',
  'accent',
  'background',
  'foreground',
  'border',
]

function colorSemanticFamily(category: string): ColorSemanticFamily | null {
  if (
    ['primaryActionBackgroundColor', 'actionBackgroundColor', 'primaryActionColor', 'actionColor'].includes(category)
  ) {
    return 'action-background'
  }
  if (
    [
      'destructiveActionBackgroundColor',
      'destructiveActionForegroundColor',
      'statusBackgroundColor',
      'statusForegroundColor',
      'statusColor',
    ].includes(category)
  ) {
    return 'status'
  }
  if (['primaryActionForegroundColor', 'actionForegroundColor'].includes(category)) return 'action-foreground'
  if (['selectedColor', 'accentColor', 'linkColor'].includes(category)) return 'accent'
  if (['bgColor', 'bgArea'].includes(category)) return 'background'
  if (category === 'textColor') return 'foreground'
  if (['borderColor', 'structuralBorderColor'].includes(category)) return 'border'
  return null
}

function colorPropertyChannel(category: string, sources: readonly string[]): ColorPropertyChannel {
  if (['borderColor', 'structuralBorderColor'].includes(category)) return 'border'
  if (
    [
      'primaryActionForegroundColor',
      'actionForegroundColor',
      'destructiveActionForegroundColor',
      'statusForegroundColor',
      'statusColor',
      'linkColor',
      'textColor',
    ].includes(category)
  ) {
    return 'foreground'
  }
  if (category === 'accentColor') {
    if (sources.some((source) => /^element:(?:primary-)?action$/.test(source))) return 'background'
    if (sources.includes('element:link')) return 'foreground'
    return 'accent'
  }
  if (category === 'selectedColor') return 'accent'
  return 'background'
}

const FOUNDATION_SURFACE_SOURCES = new Set(['semantic:page-canvas', 'semantic:content-surface'])
const COMPONENT_SURFACE_SOURCES = new Set([
  'semantic:chrome-surface',
  'semantic:control-surface',
  'semantic:status-surface',
])
const SPECIALIZED_SURFACE_SOURCES = new Set(['semantic:code-surface', 'semantic:media-surface'])

function backgroundCandidateReuseScope(
  sourceCounts: Readonly<Record<string, number>>,
  sourcePages: ReadonlyMap<string, ReadonlySet<string>>,
  eligiblePageCount: number,
  semanticConfidence: 'low' | 'medium' | 'high',
): TokenReuseScope {
  const countFor = (sources: ReadonlySet<string>) =>
    [...sources].reduce((sum, source) => sum + (sourceCounts[source] || 0), 0)
  const pagesFor = (sources: ReadonlySet<string>) =>
    new Set([...sources].flatMap((source) => [...(sourcePages.get(source) || [])]))

  const foundationCount = countFor(FOUNDATION_SURFACE_SOURCES)
  const componentCount = countFor(COMPONENT_SURFACE_SOURCES)
  const specializedCount = countFor(SPECIALIZED_SURFACE_SOURCES)
  const localCount = sourceCounts['semantic:unknown'] || 0
  const classifiedCount = foundationCount + componentCount + specializedCount + localCount
  if (classifiedCount <= 0) return 'local'

  const foundationPages = pagesFor(FOUNDATION_SURFACE_SOURCES).size
  const foundationAgreement = foundationCount / classifiedCount
  const hasReusableFoundationCoverage =
    semanticConfidence !== 'low' &&
    foundationAgreement >= 0.6 &&
    ((eligiblePageCount >= 2 && foundationPages >= 2 && foundationPages / eligiblePageCount >= 0.75) ||
      (eligiblePageCount === 1 && foundationPages === 1 && foundationCount >= 2))
  if (hasReusableFoundationCoverage) return 'foundation'

  const competingScopes: Array<[TokenReuseScope, number]> = [
    ['component', componentCount],
    ['specialized-content', specializedCount],
    ['local', Math.max(localCount, foundationCount)],
  ]
  return (
    competingScopes.sort(
      ([firstScope, firstCount], [secondScope, secondCount]) =>
        secondCount - firstCount || firstScope.localeCompare(secondScope),
    )[0]?.[0] || 'local'
  )
}

function colorCandidateSemanticAssessment(
  captures: TokenEvidenceCapture[],
  value: string,
  eligiblePageCount: number,
): {
  roleCounts: Record<string, number>
  dominantFamily?: ColorSemanticFamily
  families: Array<{
    family: ColorSemanticFamily
    ownerCount: number
    pageCount: number
    pages: string[]
    captureCount: number
    sources: string[]
    sourceCounts: Record<string, number>
    semanticAgreement: number
    semanticConfidence: 'low' | 'medium' | 'high'
    reuseScope: TokenReuseScope
  }>
} {
  const normalized = normalizeColorValue(value)
  if (!normalized) return { roleCounts: {}, families: [] }
  interface FamilyCaptureEvidence {
    page: string
    family: ColorSemanticFamily
    channel: ColorPropertyChannel
    ownerCount: number
    sources: Set<string>
    sourceCounts: Map<string, number>
    priority: number
  }
  const representatives = new Map<string, FamilyCaptureEvidence>()
  const captureCounts = new Map<ColorSemanticFamily, number>()
  for (const [captureIndex, capture] of captures.entries()) {
    const page = pageIdentityUrl(capture.url)
    const ownerFamilies = new Map<string, Map<ColorPropertyChannel, Set<ColorSemanticFamily>>>()
    const records: Array<{
      family: ColorSemanticFamily
      channel: ColorPropertyChannel
      owners: string[]
      sources: string[]
      sourceOwners: Record<string, string[]>
      sourceCounts: Record<string, number>
      fallbackCount: number
    }> = []
    for (const [key, rawCount] of Object.entries(capture.styles.usageCount)) {
      const separator = key.indexOf(':')
      if (separator <= 0 || !Number.isFinite(rawCount) || rawCount <= 0) continue
      if (normalizeColorValue(key.slice(separator + 1)) !== normalized) continue
      const category = key.slice(0, separator)
      const family = colorSemanticFamily(category)
      if (!family) continue
      const sources = capture.styles.valueSources?.[key] || []
      const channel = colorPropertyChannel(category, sources)
      const ownerIds = capture.styles.usageOwnerIds?.[key] || []
      for (const ownerId of ownerIds) {
        const channels = ownerFamilies.get(ownerId) || new Map<ColorPropertyChannel, Set<ColorSemanticFamily>>()
        const families = channels.get(channel) || new Set<ColorSemanticFamily>()
        families.add(family)
        channels.set(channel, families)
        ownerFamilies.set(ownerId, channels)
      }
      const usageOwnerCount = capture.styles.usageOwnerCounts?.[key]
      const fallbackCount =
        ownerIds.length > 0
          ? ownerIds.length
          : Number.isFinite(usageOwnerCount) && Number(usageOwnerCount) > 0
            ? Number(usageOwnerCount)
            : Number(rawCount)
      records.push({
        family,
        channel,
        owners: ownerIds,
        sources,
        sourceOwners: capture.styles.valueSourceOwnerIds?.[key] || {},
        sourceCounts: capture.styles.valueSourceCounts?.[key] || {},
        fallbackCount,
      })
    }
    const selectedFamilyByOwnerChannel = new Map<string, Map<ColorPropertyChannel, ColorSemanticFamily>>()
    for (const [owner, channels] of ownerFamilies) {
      const selectedByChannel = new Map<ColorPropertyChannel, ColorSemanticFamily>()
      for (const [channel, families] of channels) {
        const selected = COLOR_SEMANTIC_FAMILY_PRIORITY.find((family) => families.has(family))
        if (selected) selectedByChannel.set(channel, selected)
      }
      if (selectedByChannel.size > 0) selectedFamilyByOwnerChannel.set(owner, selectedByChannel)
    }
    const familyChannelsInCapture = new Map(
      records.map((record) => [
        `${record.channel}:${record.family}`,
        { family: record.family, channel: record.channel },
      ]),
    )
    const viewportPriority =
      capture.viewport === 'desktop' ? 3 : capture.viewport === 'tablet' ? 2 : capture.viewport === 'mobile' ? 1 : 0
    const capturedFamilies = new Set<ColorSemanticFamily>()
    for (const { family, channel } of familyChannelsInCapture.values()) {
      const familyOwners = new Set(
        [...selectedFamilyByOwnerChannel].flatMap(([owner, selected]) =>
          selected.get(channel) === family ? [owner] : [],
        ),
      )
      const familyRecords = records.filter((record) => record.family === family && record.channel === channel)
      const fallbackCount = Math.max(0, ...familyRecords.map((record) => record.fallbackCount))
      const ownerCount = familyRecords.some((record) => record.owners.length > 0) ? familyOwners.size : fallbackCount
      if (ownerCount <= 0) continue
      const sources = new Set<string>()
      const sourceOwners = new Map<string, Set<string>>()
      const fallbackSourceCounts = new Map<string, number>()
      for (const record of familyRecords) {
        for (const source of record.sources) {
          const declaredOwners = record.sourceOwners[source] || []
          const relevantOwners = declaredOwners.length > 0 ? declaredOwners : record.owners
          const owners = sourceOwners.get(source) || new Set<string>()
          for (const owner of relevantOwners) {
            if (selectedFamilyByOwnerChannel.get(owner)?.get(channel) === family) owners.add(owner)
          }
          if (owners.size > 0 || familyOwners.size === 0) sources.add(source)
          sourceOwners.set(source, owners)
          const amount = record.sourceCounts[source]
          if (Number.isFinite(amount) && amount > 0) {
            fallbackSourceCounts.set(source, Math.max(fallbackSourceCounts.get(source) || 0, amount))
          }
        }
      }
      const sourceCounts = new Map<string, number>()
      for (const source of sources) {
        sourceCounts.set(source, sourceOwners.get(source)?.size || fallbackSourceCounts.get(source) || 1)
      }
      const key = JSON.stringify([page, channel, family])
      const priority = viewportPriority * 1_000_000 - captureIndex
      const existing = representatives.get(key)
      if (!existing || priority > existing.priority) {
        representatives.set(key, { page, family, channel, ownerCount, sources, sourceCounts, priority })
      }
      capturedFamilies.add(family)
    }
    capturedFamilies.forEach((family) => captureCounts.set(family, (captureCounts.get(family) || 0) + 1))
  }
  const totals = new Map<ColorSemanticFamily, number>()
  const totalsByChannel = new Map<ColorPropertyChannel, number>()
  const channelsByFamily = new Map<ColorSemanticFamily, Set<ColorPropertyChannel>>()
  const pagesByFamily = new Map<ColorSemanticFamily, Set<string>>()
  const sourcesByFamily = new Map<ColorSemanticFamily, Set<string>>()
  const sourceCountsByFamily = new Map<ColorSemanticFamily, Map<string, number>>()
  const sourcePagesByFamily = new Map<ColorSemanticFamily, Map<string, Set<string>>>()
  for (const representative of representatives.values()) {
    totals.set(representative.family, (totals.get(representative.family) || 0) + representative.ownerCount)
    totalsByChannel.set(
      representative.channel,
      (totalsByChannel.get(representative.channel) || 0) + representative.ownerCount,
    )
    const familyChannels = channelsByFamily.get(representative.family) || new Set<ColorPropertyChannel>()
    familyChannels.add(representative.channel)
    channelsByFamily.set(representative.family, familyChannels)
    const familyPages = pagesByFamily.get(representative.family) || new Set<string>()
    familyPages.add(representative.page)
    pagesByFamily.set(representative.family, familyPages)
    const familySources = sourcesByFamily.get(representative.family) || new Set<string>()
    representative.sources.forEach((source) => familySources.add(source))
    sourcesByFamily.set(representative.family, familySources)
    const familySourceCounts = sourceCountsByFamily.get(representative.family) || new Map<string, number>()
    representative.sourceCounts.forEach((count, source) =>
      familySourceCounts.set(source, (familySourceCounts.get(source) || 0) + count),
    )
    sourceCountsByFamily.set(representative.family, familySourceCounts)
    const familySourcePages = sourcePagesByFamily.get(representative.family) || new Map<string, Set<string>>()
    for (const source of representative.sources) {
      const sourcePages = familySourcePages.get(source) || new Set<string>()
      sourcePages.add(representative.page)
      familySourcePages.set(source, sourcePages)
    }
    sourcePagesByFamily.set(representative.family, familySourcePages)
  }
  const sortedFamilies = [...totals.entries()].sort(
    ([firstFamily, firstCount], [secondFamily, secondCount]) =>
      secondCount - firstCount ||
      COLOR_SEMANTIC_FAMILY_PRIORITY.indexOf(firstFamily) - COLOR_SEMANTIC_FAMILY_PRIORITY.indexOf(secondFamily),
  )
  return {
    roleCounts: Object.fromEntries(sortedFamilies),
    dominantFamily: sortedFamilies[0]?.[0],
    families: sortedFamilies.map(([family, familyOwnerCount]) => {
      const familyPages = [...(pagesByFamily.get(family) || [])].sort()
      const familySources = [...(sourcesByFamily.get(family) || [])].sort()
      const familySourceCounts = Object.fromEntries(
        [...(sourceCountsByFamily.get(family) || new Map<string, number>())].sort(([first], [second]) =>
          first.localeCompare(second),
        ),
      )
      const familyPageCount = familyPages.length
      const comparableOwnerCount = [...(channelsByFamily.get(family) || [])].reduce(
        (sum, channel) => sum + (totalsByChannel.get(channel) || 0),
        0,
      )
      const semanticAgreement = comparableOwnerCount > 0 ? familyOwnerCount / comparableOwnerCount : 0
      const semanticConfidence =
        familyOwnerCount <= 0 || semanticAgreement < 0.6
          ? ('low' as const)
          : semanticAgreement >= 0.8 && familyPageCount >= 2
            ? ('high' as const)
            : ('medium' as const)
      const pageSupportRatio = eligiblePageCount > 0 ? familyPageCount / eligiblePageCount : 0
      const foundationSupport =
        semanticConfidence !== 'low' &&
        ((eligiblePageCount >= 2 && familyPageCount >= 2 && pageSupportRatio >= 0.75) ||
          (eligiblePageCount === 1 && familyPageCount === 1 && familyOwnerCount >= 2))
      const reuseScope =
        family === 'background'
          ? backgroundCandidateReuseScope(
              familySourceCounts,
              sourcePagesByFamily.get(family) || new Map<string, Set<string>>(),
              eligiblePageCount,
              semanticConfidence,
            )
          : foundationSupport
            ? ('foundation' as const)
            : familyPageCount > 0
              ? ('local' as const)
              : ('unknown' as const)
      return {
        family,
        ownerCount: familyOwnerCount,
        pageCount: familyPageCount,
        pages: familyPages,
        captureCount: captureCounts.get(family) || 0,
        sources: familySources,
        sourceCounts: familySourceCounts,
        semanticAgreement: Number(semanticAgreement.toFixed(3)),
        semanticConfidence,
        reuseScope,
      }
    }),
  }
}

function representedColorFamilies(tokens: DesignToken): Map<string, Set<ColorSemanticFamily>> {
  const represented = new Map<string, Set<ColorSemanticFamily>>()
  const add = (value: string | undefined, ...families: ColorSemanticFamily[]) => {
    const normalized = value ? normalizeColorValue(value) : null
    if (!normalized) return
    const existing = represented.get(normalized) || new Set<ColorSemanticFamily>()
    families.forEach((family) => existing.add(family))
    represented.set(normalized, existing)
  }
  for (const [role, value] of Object.entries(tokens.colors)) {
    if (!isPortableTokenEvidence(tokens.evidence?.[`colors.${role}`], `colors.${role}`)) continue
    if (['background', 'surface', 'secondary'].includes(role)) add(value, 'background')
    else if (['foreground', 'muted-foreground'].includes(role)) add(value, 'foreground')
    else if (role.startsWith('border')) add(value, 'border')
    else if (role === 'primary') add(value, 'action-background')
    else if (role === 'danger') add(value, 'status')
    else if (role === 'accent') add(value, 'action-background', 'accent')
    else if (['editorial-accent', 'decorative-accent'].includes(role)) add(value, 'accent')
  }
  return represented
}

function completeColorCandidateCatalog(tokens: DesignToken, captures: TokenEvidenceCapture[]): ColorTokenCandidate[] {
  const candidates = [...(tokens.candidates?.colors || [])]
  const observedValues = new Set(
    candidates
      .filter((candidate) => candidate.kind === 'observed-unassigned')
      .map((candidate) => normalizeColorValue(candidate.value) || candidate.value),
  )
  for (const rawValue of Object.values(tokens.colors)) {
    const value = normalizeColorValue(rawValue)
    if (!value || observedValues.has(value)) continue
    const observationCount = captures.reduce(
      (total, capture) => total + colorCandidateObservationCount(capture.styles, value),
      0,
    )
    if (observationCount <= 0) continue
    candidates.push({ value, kind: 'observed-unassigned', observationCount, sources: [] })
    observedValues.add(value)
  }
  return candidates
}

export function enrichColorCandidateEvidence(tokens: DesignToken, captures: TokenEvidenceCapture[]): void {
  const eligiblePageCount = new Set(captures.map((capture) => pageIdentityUrl(capture.url))).size
  const valueCandidates = [...(tokens.candidates?.values || [])]
  for (const candidate of completeColorCandidateCatalog(tokens, captures)) {
    const pages = new Set<string>()
    const sources = new Set(candidate.sources)
    const observationsByPage = new Map<string, number>()
    let captureCount = 0
    for (const capture of captures) {
      let matched = false
      for (const [key, count] of Object.entries(capture.styles.usageCount)) {
        const separator = key.indexOf(':')
        if (separator <= 0 || !Number.isFinite(count) || count <= 0) continue
        const category = key.slice(0, separator)
        const eligible =
          candidate.kind === 'declared-only'
            ? category === 'declaredColor'
            : RENDERED_COLOR_CANDIDATE_CATEGORIES.has(category)
        if (!eligible || normalizeColorValue(key.slice(separator + 1)) !== candidate.value) continue
        matched = true
        for (const source of capture.styles.valueSources?.[key] || []) sources.add(source)
      }
      if (!matched) continue
      const page = pageIdentityUrl(capture.url)
      observationsByPage.set(
        page,
        Math.max(
          observationsByPage.get(page) || 0,
          colorCandidateObservationCount(capture.styles, candidate.value, candidate.kind),
        ),
      )
      captureCount += 1
      pages.add(page)
    }
    const observationCount = [...observationsByPage.values()].reduce((total, count) => total + count, 0)
    const measurementConfidence = measurementConfidenceFor(pages.size, captureCount, observationCount, sources)
    const semantic =
      candidate.kind === 'declared-only'
        ? { roleCounts: {}, families: [] }
        : colorCandidateSemanticAssessment(captures, candidate.value, eligiblePageCount)
    const dominantSemantic = semantic.families[0]
    const reasonsForSources = (familySources: readonly string[]) => [
      ...(candidate.kind === 'declared-only' ? (['declared-only'] as const) : (['rendered-use'] as const)),
      ...(familySources.some((source) => source.startsWith('computed:')) ? (['computed-style'] as const) : []),
    ]
    const dominantSources = dominantSemantic?.sources || [...sources].sort()
    const dominantReasons = reasonsForSources(dominantSources)
    const id = tokenCandidateId(
      'colors',
      candidate.value,
      dominantSemantic?.family || '',
      candidate.kind === 'declared-only' ? 'declared-color' : 'observed-color',
    )
    candidate.observationCount = Number(observationCount.toFixed(3))
    candidate.id = id
    candidate.role = dominantSemantic?.family
    candidate.captureCount = dominantSemantic?.captureCount || captureCount
    candidate.pageCount = dominantSemantic?.pageCount || pages.size
    candidate.eligiblePageCount = eligiblePageCount
    candidate.pageSupportRatio =
      eligiblePageCount > 0 ? Number(((dominantSemantic?.pageCount || pages.size) / eligiblePageCount).toFixed(3)) : 0
    candidate.pages = dominantSemantic?.pages || [...pages].sort()
    candidate.sources = dominantSources
    candidate.measurementConfidence = dominantSemantic
      ? measurementConfidenceFor(
          dominantSemantic.pageCount,
          dominantSemantic.captureCount,
          dominantSemantic.ownerCount,
          new Set(dominantSources),
        )
      : measurementConfidence
    candidate.semanticConfidence = dominantSemantic?.semanticConfidence || 'low'
    candidate.semanticAgreement = dominantSemantic?.semanticAgreement || 0
    candidate.roleCounts = semantic.roleCounts
    candidate.reuseScope =
      candidate.kind === 'declared-only' ? 'declared-only' : dominantSemantic?.reuseScope || 'unknown'
    candidate.reasons = dominantReasons
    const semanticFamilies =
      candidate.kind === 'declared-only' || semantic.families.length === 0
        ? [
            {
              family: undefined,
              ownerCount: candidate.observationCount,
              pageCount: pages.size,
              pages: candidate.pages,
              captureCount,
              sources: candidate.sources,
              sourceCounts: {},
              semanticAgreement: 0,
              semanticConfidence: 'low' as const,
              reuseScope: candidate.kind === 'declared-only' ? ('declared-only' as const) : ('unknown' as const),
            },
          ]
        : semantic.families
    for (const family of semanticFamilies) {
      const pairedSurface =
        family.family === 'foreground'
          ? buildFoundationForegroundPairEvidence(
              [tokens.colors.background, tokens.colors.surface, tokens.colors.secondary],
              candidate.value,
              captures,
            )
          : undefined
      const renderedEvidence =
        family.family === 'foreground'
          ? buildTokenEvidence(
              {
                ...emptyDesignTokens(),
                colors: {
                  ...(pairedSurface ? { background: pairedSurface.background } : {}),
                  foreground: candidate.value,
                },
              },
              captures,
            )['colors.foreground']
          : undefined
      const auditableRenderedEvidence = renderedEvidence?.renderedTextOwners?.length ? renderedEvidence : undefined
      const auditablePairedSurface = auditableRenderedEvidence?.pairedSurface
      const pairedFoundation = family.semanticConfidence !== 'low' && isFoundationForegroundPair(auditablePairedSurface)
      const familyId = tokenCandidateId(
        'colors',
        candidate.value,
        family.family || '',
        candidate.kind === 'declared-only' ? 'declared-color' : 'observed-color',
      )
      const familyMeasurementConfidence = measurementConfidenceFor(
        auditableRenderedEvidence?.pageCount ?? family.pageCount,
        auditableRenderedEvidence?.captureCount ?? family.captureCount,
        auditableRenderedEvidence?.ownerCount ?? family.ownerCount,
        new Set([...(family.sources || []), ...(auditableRenderedEvidence?.sources || [])]),
      )
      const familySources = [...new Set([...family.sources, ...(auditableRenderedEvidence?.sources || [])])]
        .filter((source) => source !== 'rendered:text' || Boolean(auditableRenderedEvidence))
        .sort()
      const familySourceCounts = Object.fromEntries(
        Object.entries(family.sourceCounts).filter(([source]) => familySources.includes(source)),
      )
      const familyReasons = [
        ...reasonsForSources(familySources),
        ...(auditablePairedSurface ? (['paired-surface'] as const) : []),
      ]
      const familyCandidate: TokenValueCandidate = {
        id: familyId,
        group: 'colors',
        ...(family.family ? { role: family.family } : {}),
        value: candidate.value,
        provenance: candidate.kind === 'declared-only' ? 'declared-color' : 'observed-color',
        rejectionReason: candidate.kind === 'declared-only' ? 'declared-only' : 'unassigned-role',
        evidence: {
          value: candidate.value,
          confidence: family.semanticConfidence,
          measurementConfidence: familyMeasurementConfidence,
          semanticConfidence: family.semanticConfidence,
          reuseScope: pairedFoundation ? 'foundation' : family.reuseScope,
          observationCount: Number((auditableRenderedEvidence?.observationCount ?? family.ownerCount).toFixed(3)),
          ownerCount: Number((auditableRenderedEvidence?.ownerCount ?? family.ownerCount).toFixed(3)),
          semanticAgreement: family.semanticAgreement,
          pageCount: auditableRenderedEvidence?.pageCount ?? family.pageCount,
          captureCount: auditableRenderedEvidence?.captureCount ?? family.captureCount,
          eligiblePageCount: auditableRenderedEvidence?.eligiblePageCount ?? eligiblePageCount,
          pageSupportRatio:
            auditableRenderedEvidence?.pageSupportRatio ??
            (eligiblePageCount > 0 ? Number((family.pageCount / eligiblePageCount).toFixed(3)) : 0),
          pages: auditableRenderedEvidence?.pages ?? family.pages,
          sources: familySources,
          ...(Object.keys(familySourceCounts).length > 0 ? { sourceCounts: familySourceCounts } : {}),
          roleCounts: family.family ? { [family.family]: family.ownerCount } : {},
          ...(auditableRenderedEvidence?.renderedTextOwners
            ? { renderedTextOwners: auditableRenderedEvidence.renderedTextOwners }
            : {}),
          ...(auditablePairedSurface ? { pairedSurface: auditablePairedSurface } : {}),
          reasons: familyReasons,
        },
      }
      const existingIndex = valueCandidates.findIndex((item) => item.id === familyId)
      if (existingIndex >= 0) valueCandidates[existingIndex] = familyCandidate
      else valueCandidates.push(familyCandidate)
    }
  }
  const represented = representedColorFamilies(tokens)
  const unrepresentedCandidates = valueCandidates.filter((candidate) => {
    if (candidate.group !== 'colors' || candidate.provenance !== 'observed-color' || !candidate.role) return true
    const normalized = normalizeColorValue(candidate.value)
    return !normalized || !represented.get(normalized)?.has(candidate.role as ColorSemanticFamily)
  })
  if (unrepresentedCandidates.length > 0) {
    tokens.candidates = { ...tokens.candidates, values: unrepresentedCandidates }
  } else if (tokens.candidates?.colors?.length) {
    tokens.candidates = { colors: tokens.candidates.colors }
  } else {
    delete tokens.candidates
  }
}

function portableCatalogSignature(tokens: DesignToken): string {
  return JSON.stringify({
    colors: tokens.colors,
    typography: tokens.typography,
    spacing: tokens.spacing,
    radii: tokens.radii,
    shadows: tokens.shadows,
    borders: tokens.borders,
    zIndices: tokens.zIndices,
    transitions: tokens.transitions,
  })
}

export function stabilizePortableTokens(tokens: DesignToken, captures: TokenEvidenceCapture[]): void {
  // Role re-selection may have changed values since the previous evidence build. Always start from the current token
  // catalog so the first portability decision cannot inherit provenance from a replaced value.
  tokens.evidence = buildTokenEvidence(tokens, captures)
  while (true) {
    const before = portableCatalogSignature(tokens)
    promotePortableDesignTokens(tokens)
    // Promotion may remove a surface that another token depends on. Rebuild from the reduced catalog, then repeat
    // until every remaining token is still portable against the exact catalog that will be exported.
    tokens.evidence = buildTokenEvidence(tokens, captures)
    if (portableCatalogSignature(tokens) === before) return
  }
}

function finalizePortableTokens(tokens: DesignToken, captures: TokenEvidenceCapture[]): void {
  tokens.evidence = buildTokenEvidence(tokens, captures)
  reselectPortableFoundationColors(tokens, captures)
  enrichColorCandidateEvidence(tokens, captures)
  stabilizePortableTokens(tokens, captures)
}

function capturedPageJoinKey(capture: CapturedPageEvidence): string {
  return `${pageIdentityUrl(capture.snapshot.url)}\u0000${capture.snapshot.viewport}`
}

function styleCaptureJoinKey(capture: TokenEvidenceCapture): string {
  return `${pageIdentityUrl(capture.url)}\u0000${capture.viewport}`
}

function groupByKey<T>(values: readonly T[], keyFor: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const value of values) {
    const key = keyFor(value)
    const group = groups.get(key) || []
    group.push(value)
    groups.set(key, group)
  }
  return groups
}

function deduplicateCapturedPages(capturedPages: readonly CapturedPageEvidence[]): CapturedPageEvidence[] {
  const groups = groupByKey(capturedPages, capturedPageJoinKey)
  return [...groups.values()].flatMap((group) => {
    const captureKeys = group.map((capture) => capture.captureKey).filter((key): key is string => Boolean(key))
    if (group.length > 1 && (captureKeys.length !== group.length || new Set(captureKeys).size !== captureKeys.length)) {
      return []
    }
    const consistent = group.filter(isInternallyConsistentCapturedPage)
    if (consistent.length === 0) return []
    if (group.length === 1) return consistent
    return [
      consistent.sort(
        (first, second) =>
          Number(first.health?.evidenceEligible === false) - Number(second.health?.evidenceEligible === false) ||
          Number(hasSevereHorizontalOverflow(first.snapshot)) - Number(hasSevereHorizontalOverflow(second.snapshot)) ||
          (first.captureKey as string).localeCompare(second.captureKey as string),
      )[0],
    ]
  })
}

function canonicalEvidenceStyleCaptures(
  styleCaptures: readonly TokenEvidenceCapture[],
  rawCapturedPages: readonly CapturedPageEvidence[],
  retainedCapturedPages: readonly CapturedPageEvidence[],
): TokenEvidenceCapture[] {
  const capturedPageByCaptureKey = new Map(
    rawCapturedPages.flatMap((capture) => (capture.captureKey ? [[capture.captureKey, capture] as const] : [])),
  )
  const capturedPagesByLegacyKey = groupByKey(rawCapturedPages, capturedPageJoinKey)
  const styleCapturesByLegacyKey = groupByKey(styleCaptures, styleCaptureJoinKey)
  const retainedCapturedPageSet = new Set(retainedCapturedPages)
  const styleCaptureKeyCounts = new Map<string, number>()
  const captureKeyCounts = new Map<string, number>()
  for (const capture of styleCaptures) {
    if (capture.captureKey) {
      styleCaptureKeyCounts.set(capture.captureKey, (styleCaptureKeyCounts.get(capture.captureKey) || 0) + 1)
    }
  }
  for (const capture of rawCapturedPages) {
    if (capture.captureKey) {
      captureKeyCounts.set(capture.captureKey, (captureKeyCounts.get(capture.captureKey) || 0) + 1)
    }
  }

  const captureBySelectionKey = new Map<string, TokenEvidenceCapture>()
  const candidates = styleCaptures.flatMap((capture) => {
    const legacyKey = styleCaptureJoinKey(capture)
    const capturedPage = capture.captureKey
      ? styleCaptureKeyCounts.get(capture.captureKey) === 1 && captureKeyCounts.get(capture.captureKey) === 1
        ? capturedPageByCaptureKey.get(capture.captureKey)
        : undefined
      : styleCapturesByLegacyKey.get(legacyKey)?.length === 1 && capturedPagesByLegacyKey.get(legacyKey)?.length === 1
        ? capturedPagesByLegacyKey.get(legacyKey)?.[0]?.captureKey
          ? undefined
          : capturedPagesByLegacyKey.get(legacyKey)?.[0]
        : undefined
    if (
      !capturedPage ||
      !retainedCapturedPageSet.has(capturedPage) ||
      capturedPageJoinKey(capturedPage) !== legacyKey
    ) {
      return []
    }
    const selectionKey = capture.captureKey ? `capture:${capture.captureKey}` : `legacy:${legacyKey}`
    captureBySelectionKey.set(selectionKey, capture)
    return [
      {
        key: selectionKey,
        routeIdentity: pageIdentityUrl(capture.url),
        viewport: capture.viewport,
        viewportWidth: capturedPage.snapshot.viewportWidth,
        contentWidth: capturedPage.snapshot.contentWidth,
        horizontalOverflow: capturedPage.snapshot.horizontalOverflow,
        health: capturedPage.health,
      },
    ]
  })
  const selectedKeys = canonicalEvidenceCaptureKeys(candidates)
  return [...selectedKeys].flatMap((key) => {
    const capture = captureBySelectionKey.get(key)
    return capture ? [capture] : []
  })
}

/** Builds tokens and evidence from completed captures without owning browser lifecycle or persistence. */
export function buildAnalysisOutput(
  input: BuildAnalysisOutputInput,
  stages: AnalysisOutputStages = {},
): AnalysisOutput {
  const mergedStyles = mergeStyles(input.styles)
  const tokenSelectionStyles = mergeStylesWithNormalizedUsage(
    input.styles,
    input.styleCaptures.map((capture) => pageIdentityUrl(capture.url)),
    input.styleCaptures.map((capture) => capture.viewport),
  )

  stages.onClusteringColors?.()
  const clusteredColors = clusterColors(tokenSelectionStyles.colors, tokenSelectionStyles.usageCount)

  stages.onGeneratingTokens?.()
  const tokens = buildDesignTokens(
    tokenSelectionStyles,
    clusteredColors,
    tokenSelectionStyles,
    selectFoundationSurfaceColors(input.styleCaptures),
  )
  tokens.usageCount = normalizeDesignTokenUsageCount(mergedStyles.usageCount)
  finalizePortableTokens(tokens, input.styleCaptures)

  let evidenceTokens = emptyDesignTokens()
  let evidenceMergedStyles = mergeStyles([])
  const evidenceCaptures = deduplicateCapturedPages(input.captures)
  const canonicalStyleCaptures = canonicalEvidenceStyleCaptures(
    input.evidenceEligibleStyleCaptures,
    input.captures,
    evidenceCaptures,
  )
  const canonicalStyles = canonicalStyleCaptures.map((capture) => capture.styles)
  if (canonicalStyles.length > 0) {
    evidenceMergedStyles = mergeStyles(canonicalStyles)
    const evidenceSelectionStyles = mergeStylesWithNormalizedUsage(
      canonicalStyles,
      canonicalStyleCaptures.map((capture) => pageIdentityUrl(capture.url)),
      canonicalStyleCaptures.map((capture) => capture.viewport),
    )
    const evidenceColors = clusterColors(evidenceSelectionStyles.colors, evidenceSelectionStyles.usageCount)
    evidenceTokens = buildDesignTokens(
      evidenceSelectionStyles,
      evidenceColors,
      evidenceSelectionStyles,
      selectFoundationSurfaceColors(canonicalStyleCaptures),
    )
    evidenceTokens.usageCount = normalizeDesignTokenUsageCount(evidenceMergedStyles.usageCount)
    finalizePortableTokens(evidenceTokens, canonicalStyleCaptures)
  }

  // Public tokens and claims share the page-health-eligible catalog embedded in Design Evidence. The all-capture
  // snapshot remains available only as raw diagnostic styles; it must not create a second implementation catalog.
  let portableTokens = canonicalStyles.length > 0 ? evidenceTokens : emptyDesignTokens()
  let featureTags = generateFeatureTags(portableTokens, evidenceMergedStyles)
  const limitations = [...input.limitations]
  for (const limitation of canonicalStyles.flatMap((styles) => styles.semanticSurfaceLimitations || [])) {
    if (!limitations.includes(limitation)) limitations.push(limitation)
  }
  input.extractionIssues
    .filter((issue) => !isPageHealthExtractionIssue(issue))
    .slice(0, 8)
    .forEach((issue) => appendExtractionIssueLimitation(limitations, issue))

  let designEvidence = buildDesignEvidence({
    analysisId: input.analysisId,
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl,
    accessMode: input.accessMode,
    authWallDetected: input.authWallDetected,
    expectedPageCount: input.expectedPageCount,
    expectedViewports: input.expectedViewports,
    expectedCaptureCount: input.expectedCaptureCount,
    tokens: evidenceTokens,
    featureTags,
    interactionStyles: input.interactionStyles,
    breakpoints: input.breakpoints,
    motion: input.motion,
    captures: evidenceCaptures,
    limitations,
    techStack: input.techStack,
  })
  portableTokens = designEvidence.tokens
  const deterministicClaims = buildEvidenceBackedClaims(portableTokens, evidenceMergedStyles, designEvidence)
  featureTags = [...new Set([...deterministicClaims.map((claim) => claim.label), ...featureTags])].slice(0, 6)
  designEvidence = {
    ...designEvidence,
    semanticOwnerVersion: '1',
    featureTags,
    ...(deterministicClaims.length > 0 ? { deterministicClaims } : {}),
  }

  return { tokens: portableTokens, rawStyles: mergedStyles, designEvidence, featureTags }
}
