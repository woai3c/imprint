import { isRecord } from '../../shared/type-guards.js'
import { parseJsonObjects } from '../ai/json-payload.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { listEvidenceIds } from './evidence-selector.js'
import type {
  Confidence,
  DesignClaim,
  DesignProfile,
  EvidenceRef,
  IntelligenceInputMode,
  PatternSpec,
  SignatureMove,
} from './types.js'

const CONFIDENCES = new Set<Confidence>(['high', 'medium', 'low'])
const GENERIC_ONLY =
  /^(?:a |an |the )?(?:modern|clean|premium|professional|friendly|high-tech|minimal|elegant|现代|简洁|高端|专业|友好|科技感|极简)[\s,，、和与&-]*$/i
const UNPROVABLE_INTENT =
  /(?:the designer (?:wants|wanted|intends|intended)|the brand (?:wants|must|intends)|设计师(?:希望|想要|意图)|品牌(?:一定|希望|想要))/i
const HTML_OR_URL = /<[^>]+>|https?:\/\/|javascript:|```/i
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/gi

function collectTokenColorValues(evidence: DesignEvidence): Set<string> {
  return new Set(
    Object.values(evidence.tokens.colors || {})
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase()),
  )
}

function introducesNewTokenValues(text: string, knownColors: Set<string>): boolean {
  for (const match of text.matchAll(COLOR_LITERAL)) {
    if (!knownColors.has(match[0].trim().toLowerCase())) return true
  }
  return false
}

export interface ProfileValidationResult {
  profile: DesignProfile | null
  status: 'complete' | 'partial' | 'failed'
  rejected: string[]
  imageObservationsValid?: boolean
}

function isSafeText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= maxLength && !HTML_OR_URL.test(value)
}

export function extractProfileCandidate(response: string): unknown {
  const objects = parseJsonObjects(response)
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index]
    if (isRecord(object) && isRecord(object.profile)) return object.profile
    if (isRecord(object) && String(object.schemaVersion) === '1' && object.thesis) return object
  }
  return null
}

function parseEvidenceRefs(value: unknown, validIds: Set<string>): EvidenceRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.evidenceId !== 'string' ||
      !validIds.has(candidate.evidenceId) ||
      !isSafeText(candidate.note, 240)
    ) {
      return []
    }
    return [{ evidenceId: candidate.evidenceId, note: candidate.note.trim() }]
  })
}

function buildTokenEvidenceOwners(evidence: DesignEvidence, validIds: Set<string>): Map<string, string[]> {
  const owners = new Map<string, string[]>()
  const add = (evidenceId: string, tokenRefs: string[]) => {
    if (!validIds.has(evidenceId)) return
    for (const tokenRef of tokenRefs) {
      const ids = owners.get(tokenRef) || []
      if (!ids.includes(evidenceId)) ids.push(evidenceId)
      owners.set(tokenRef, ids)
    }
  }
  evidence.sections.forEach((section) => add(section.id, section.tokenRefs))
  evidence.layoutNodes.forEach((node) => add(node.id, node.tokenRefs))
  evidence.components.forEach((component) => add(component.id, component.tokenRefs))
  return owners
}

/**
 * Some models confuse extracted token refs with evidence IDs. A token ref is accepted as a citation only when it can
 * be deterministically resolved back to selected DOM evidence that uses that token. The normalized profile still
 * stores the token separately, while downstream validation continues to operate on real evidence IDs.
 */
function tokenRefMatchesClaimPath(tokenRef: string, path: string): boolean {
  if (/^composition\.(?:densityAndWhitespace|rhythm)$/.test(path)) return tokenRef.startsWith('spacing.')
  if (path === 'attention.contrastStrategy' || path === 'visualLanguage.color') return tokenRef.startsWith('color.')
  if (path === 'visualLanguage.typography') return tokenRef.startsWith('typography.')
  if (path === 'visualLanguage.shape') return /^(?:radius|border)\./.test(tokenRef)
  if (path === 'visualLanguage.surfaces') return /^(?:color|shadow|border)\./.test(tokenRef)
  return false
}

function normalizeClaimTokenCitations(value: unknown, tokenOwners: Map<string, string[]>, path = ''): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => normalizeClaimTokenCitations(item, tokenOwners, `${path}.${index}`))
    return
  }
  if (!isRecord(value)) return

  if (typeof value.statement === 'string' && typeof value.implementation === 'string') {
    const tokenRefs = new Set(
      Array.isArray(value.tokenRefs)
        ? value.tokenRefs.filter(
            (tokenRef): tokenRef is string => typeof tokenRef === 'string' && tokenOwners.has(tokenRef),
          )
        : [],
    )
    if (Array.isArray(value.evidence)) {
      value.evidence = value.evidence.flatMap((candidate) => {
        if (
          !isRecord(candidate) ||
          typeof candidate.evidenceId !== 'string' ||
          !tokenOwners.has(candidate.evidenceId) ||
          !tokenRefMatchesClaimPath(candidate.evidenceId, path) ||
          !isSafeText(candidate.note, 240)
        ) {
          return [candidate]
        }
        tokenRefs.add(candidate.evidenceId)
        return (tokenOwners.get(candidate.evidenceId) || []).slice(0, 2).map((evidenceId) => ({
          evidenceId,
          note: candidate.note,
        }))
      })
    }
    value.tokenRefs = [...tokenRefs].slice(0, 16)
  }

  Object.entries(value).forEach(([key, item]) =>
    normalizeClaimTokenCitations(item, tokenOwners, path ? `${path}.${key}` : key),
  )
}

function validateClaim(
  value: unknown,
  validIds: Set<string>,
  path: string,
  rejected: string[],
  inputMode: IntelligenceInputMode,
  visualOnly = false,
  knownColors?: Set<string>,
): DesignClaim | null {
  if (!isRecord(value)) {
    rejected.push(`${path}:not-an-object`)
    return null
  }
  if (
    typeof value.statement !== 'string' ||
    !value.statement.trim() ||
    value.statement.length > 240 ||
    GENERIC_ONLY.test(value.statement.trim()) ||
    UNPROVABLE_INTENT.test(value.statement) ||
    HTML_OR_URL.test(value.statement)
  ) {
    rejected.push(`${path}:invalid-statement`)
    return null
  }
  if (
    typeof value.implementation !== 'string' ||
    !value.implementation.trim() ||
    value.implementation.length > 360 ||
    UNPROVABLE_INTENT.test(value.implementation) ||
    HTML_OR_URL.test(value.implementation)
  ) {
    rejected.push(`${path}:invalid-implementation`)
    return null
  }
  if (
    knownColors &&
    (introducesNewTokenValues(value.statement, knownColors) ||
      introducesNewTokenValues(value.implementation, knownColors))
  ) {
    rejected.push(`${path}:token-value-not-in-evidence`)
    return null
  }
  if (typeof value.confidence !== 'string' || !CONFIDENCES.has(value.confidence as Confidence)) {
    rejected.push(`${path}:invalid-confidence`)
    return null
  }
  const evidence = parseEvidenceRefs(value.evidence, validIds)
  if (evidence.length === 0) {
    rejected.push(`${path}:missing-evidence`)
    return null
  }
  let confidence = value.confidence as Confidence
  const hasVisualOrLayoutEvidence = evidence.some((reference) =>
    /^(?:image|section|layout)-/.test(reference.evidenceId),
  )
  if (confidence === 'high' && (evidence.length < 2 || !hasVisualOrLayoutEvidence)) confidence = 'medium'
  if (inputMode === 'structural-only' && visualOnly && confidence !== 'low') confidence = 'low'
  return {
    statement: value.statement.trim(),
    implementation: value.implementation.trim(),
    confidence,
    evidence,
    ...(Array.isArray(value.tokenRefs) && value.tokenRefs.length > 0
      ? {
          tokenRefs: value.tokenRefs
            .filter((tokenRef): tokenRef is string => typeof tokenRef === 'string')
            .slice(0, 16),
        }
      : {}),
  }
}

function validateClaims(
  value: unknown,
  validIds: Set<string>,
  path: string,
  rejected: string[],
  inputMode: IntelligenceInputMode,
  max: number,
  visualOnly = false,
  knownColors?: Set<string>,
): DesignClaim[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, max)
    .map((candidate, index) =>
      validateClaim(candidate, validIds, `${path}.${index}`, rejected, inputMode, visualOnly, knownColors),
    )
    .filter((claim): claim is DesignClaim => claim !== null)
}

function validateInteractionClaim(
  value: unknown,
  validIds: Set<string>,
  interactionIds: Set<string>,
  activeInteractionIds: Set<string>,
  path: string,
  rejected: string[],
  inputMode: IntelligenceInputMode,
  knownColors?: Set<string>,
): DesignClaim | null {
  const claim = validateClaim(value, validIds, path, rejected, inputMode, false, knownColors)
  if (!claim) return null
  const hasInteractionEvidence = claim.evidence.some((reference) => interactionIds.has(reference.evidenceId))
  if (!hasInteractionEvidence) {
    return { ...claim, confidence: 'low' }
  }
  const hasActiveEvidence = claim.evidence.some((reference) => activeInteractionIds.has(reference.evidenceId))
  if (!hasActiveEvidence) {
    const assertsUniversalBehavior = /\b(?:all|every|always|uniformly)\b|所有|全部|一律|均会|始终/i.test(
      `${claim.statement} ${claim.implementation}`,
    )
    const assertsExecutedBehavior =
      /\b(?:click|clicked|expand|expanded|toggle|toggled|open|opened|close|closed|navigate|navigates)\b|点击|展开|切换|打开|关闭|跳转/i.test(
        `${claim.statement} ${claim.implementation}`,
      )
    if (assertsExecutedBehavior || assertsUniversalBehavior) return { ...claim, confidence: 'low' }
    if (claim.confidence === 'high') return { ...claim, confidence: 'medium' }
  }
  return claim
}

function validateInteractionClaims(
  value: unknown,
  validIds: Set<string>,
  interactionIds: Set<string>,
  activeInteractionIds: Set<string>,
  path: string,
  rejected: string[],
  inputMode: IntelligenceInputMode,
  max: number,
  knownColors?: Set<string>,
): DesignClaim[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, max)
    .map((candidate, index) =>
      validateInteractionClaim(
        candidate,
        validIds,
        interactionIds,
        activeInteractionIds,
        `${path}.${index}`,
        rejected,
        inputMode,
        knownColors,
      ),
    )
    .filter((claim): claim is DesignClaim => claim !== null)
}

function requiredClaim(
  parent: Record<string, unknown>,
  key: string,
  validIds: Set<string>,
  path: string,
  rejected: string[],
  inputMode: IntelligenceInputMode,
  visualOnly = false,
  knownColors?: Set<string>,
): DesignClaim | null {
  return validateClaim(parent[key], validIds, `${path}.${key}`, rejected, inputMode, visualOnly, knownColors)
}

function requireEvidenceKind(
  claim: DesignClaim | null,
  pattern: RegExp,
  path: string,
  rejected: string[],
): DesignClaim | null {
  if (!claim) return null
  if (claim.evidence.some((reference) => pattern.test(reference.evidenceId))) return claim
  rejected.push(`${path}:unsupported-evidence-kind`)
  return null
}

function canonicalPageUrl(value: string): string {
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return value
  }
}

interface EvidenceScope {
  pageUrlByEvidenceId: Map<string, string>
  pageIdByEvidenceId: Map<string, string>
  sectionRoleByEvidenceId: Map<string, string>
  // Roles present in each page capture. Page screenshots (image-*) are capture-level evidence:
  // they can legitimately support a section-grammar claim for any role that capture contains.
  sectionRolesByPageId: Map<string, Set<string>>
  // Evidence owned by footer/legal or small fixed utility regions. "Evidence exists"
  // does not mean "semantically important" — these can only support local claims.
  utilityEvidenceIds: Set<string>
}

function isUtilitySection(section: DesignEvidence['sections'][number]): boolean {
  if (section.role === 'footer') return true
  const area = section.rect.width * section.rect.height
  if (area < 0.005) return true
  if (section.layoutMode !== 'flow' && area < 0.02) return true
  return false
}

function buildEvidenceScope(evidence: DesignEvidence): EvidenceScope {
  const pageUrlByPageId = new Map(evidence.pages.map((page) => [page.id, canonicalPageUrl(page.url)]))
  const sectionById = new Map(evidence.sections.map((section) => [section.id, section]))
  const pageUrlByEvidenceId = new Map<string, string>()
  const pageIdByEvidenceId = new Map<string, string>()
  const sectionRoleByEvidenceId = new Map<string, string>()
  const sectionRolesByPageId = new Map<string, Set<string>>()
  const utilityEvidenceIds = new Set<string>()
  const assignPage = (evidenceId: string, pageId: string) => {
    pageIdByEvidenceId.set(evidenceId, pageId)
    const url = pageUrlByPageId.get(pageId)
    if (url) pageUrlByEvidenceId.set(evidenceId, url)
  }
  const assignSection = (evidenceId: string, sectionId: string) => {
    const section = sectionById.get(sectionId)
    if (!section) return
    assignPage(evidenceId, section.pageId)
    sectionRoleByEvidenceId.set(evidenceId, section.role)
    if (isUtilitySection(section)) utilityEvidenceIds.add(evidenceId)
  }

  for (const page of evidence.pages) {
    assignPage(page.id, page.id)
    for (const image of page.images) assignPage(image.id, page.id)
  }
  for (const section of evidence.sections) {
    assignSection(section.id, section.id)
    const roles = sectionRolesByPageId.get(section.pageId) || new Set<string>()
    roles.add(section.role)
    sectionRolesByPageId.set(section.pageId, roles)
  }
  for (const component of evidence.components) assignSection(component.id, component.sectionId)
  for (const node of evidence.layoutNodes) assignSection(node.id, node.sectionId)
  for (const observation of evidence.interactionObservations) assignSection(observation.id, observation.sectionId)
  for (const observation of evidence.responsiveObservations) assignSection(observation.id, observation.sectionId)
  for (const media of evidence.mediaLayers) assignSection(media.id, media.sectionId)
  for (const layer of evidence.topology.globalLayers) assignPage(layer.id, layer.pageId)

  return { pageUrlByEvidenceId, pageIdByEvidenceId, sectionRoleByEvidenceId, sectionRolesByPageId, utilityEvidenceIds }
}

function referencedPageUrls(claim: DesignClaim, scope: EvidenceScope): Set<string> {
  return new Set(
    claim.evidence
      .map((reference) => scope.pageUrlByEvidenceId.get(reference.evidenceId))
      .filter((url): url is string => Boolean(url)),
  )
}

function capSinglePageGlobalClaim<T extends DesignClaim>(
  claim: T,
  scope: EvidenceScope,
  availablePageCount: number,
): T {
  const referencedPages = referencedPageUrls(claim, scope).size
  const assertsUniversalCoverage =
    /\b(?:all|every|across all|each of the|both|two pages|three pages|four pages)\b|全站|所有|全部|每页|两个页面|三页|四页|均采用|均使用/i.test(
      `${claim.statement} ${claim.implementation}`,
    )
  if (assertsUniversalCoverage && availablePageCount > 1 && referencedPages < availablePageCount) {
    return { ...claim, confidence: 'low' } as T
  }
  if (claim.confidence !== 'high') return claim
  const utilityOnly =
    claim.evidence.length > 0 && claim.evidence.every((reference) => scope.utilityEvidenceIds.has(reference.evidenceId))
  if (utilityOnly) return { ...claim, confidence: 'medium' } as T
  if (availablePageCount <= 1 || referencedPages >= 2) {
    return claim
  }
  return { ...claim, confidence: 'medium' } as T
}

const GENERIC_IMAGE_DESCRIPTION =
  /^(?:a |an |the )?(?:web ?page |site )?(?:screenshot|image|picture|photo|capture|截图|图片|图像|照片)(?:\s*(?:of|for|截图|图片))?[.。]?$/i

function isSubstantiveImageDescription(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length >= 12 && trimmed.length <= 240 && !GENERIC_IMAGE_DESCRIPTION.test(trimmed)
}

export function validateDesignProfile(
  value: unknown,
  evidence: DesignEvidence,
  expectedMode: IntelligenceInputMode,
  language: 'en' | 'zh-CN',
  allowedEvidenceIds?: Set<string>,
  options?: { requireImageObservations?: string[] },
): ProfileValidationResult {
  const rejected: string[] = []
  if (!isRecord(value)) {
    return { profile: null, status: 'failed', rejected: ['root:not-an-object'] }
  }
  if (String(value.schemaVersion) !== '1') {
    return {
      profile: null,
      status: 'failed',
      rejected: [`root:bad-schemaVersion(${JSON.stringify(value.schemaVersion)})`],
    }
  }
  if (value.inputMode !== expectedMode) {
    const actual = value.inputMode
    if (typeof actual === 'string' && (actual === 'multimodal' || actual === 'structural-only')) {
      value.inputMode = expectedMode
    } else {
      return {
        profile: null,
        status: 'failed',
        rejected: [`root:bad-inputMode(${JSON.stringify(actual)},expected=${expectedMode})`],
      }
    }
  }
  if (value.language !== language) {
    const actual = value.language
    if (typeof actual === 'string') {
      value.language = language
    } else {
      return {
        profile: null,
        status: 'failed',
        rejected: [`root:bad-language(${JSON.stringify(actual)},expected=${language})`],
      }
    }
  }
  value.schemaVersion = '1'
  if (value.tokens || value.tokenValues) rejected.push('root:unexpected-token-values')
  const requiredImageIds = options?.requireImageObservations || []
  let imageObservationsValid: boolean | undefined
  if (expectedMode === 'multimodal' && requiredImageIds.length > 0) {
    const observations = Array.isArray(value.imageObservations) ? value.imageObservations : []
    imageObservationsValid = requiredImageIds.every((imageId) =>
      observations.some(
        (entry) =>
          isRecord(entry) &&
          entry.imageId === imageId &&
          typeof entry.description === 'string' &&
          isSubstantiveImageDescription(entry.description),
      ),
    )
    if (!imageObservationsValid) rejected.push('root:image-observations-self-check-failed')
  }
  // A failed image self-check means the model never saw the attachments; visual claims are capped as structural-only.
  const claimMode: IntelligenceInputMode = imageObservationsValid === false ? 'structural-only' : expectedMode
  const knownColors = collectTokenColorValues(evidence)
  const coverage = evidence.coverage
  const noClassifiedMedia = coverage.mediaCoverage.classifiedRegions === 0
  const singleViewport = coverage.viewportCoverage.length < 2
  const horizontalOverflowPageUrls = new Set(
    evidence.pages.filter((page) => page.horizontalOverflow).map((page) => canonicalPageUrl(page.url)),
  )
  const allEvidenceIds = listEvidenceIds(evidence)
  const validIds = allowedEvidenceIds
    ? new Set([...allowedEvidenceIds].filter((evidenceId) => allEvidenceIds.has(evidenceId)))
    : allEvidenceIds
  normalizeClaimTokenCitations(value, buildTokenEvidenceOwners(evidence, validIds))
  const evidenceScope = buildEvidenceScope(evidence)
  const availablePageCount = new Set(
    [...validIds]
      .map((evidenceId) => evidenceScope.pageUrlByEvidenceId.get(evidenceId))
      .filter((url): url is string => Boolean(url)),
  ).size
  const observedSectionRoles = new Set(
    evidence.sections.filter((section) => validIds.has(section.id)).map((section) => section.role),
  )
  const interactionIds = new Set(
    evidence.interactionObservations
      .map((observation) => observation.id)
      .filter((evidenceId) => validIds.has(evidenceId)),
  )
  const activeInteractionIds = new Set(
    evidence.interactionObservations
      .filter((observation) => observation.safety === 'safe-active')
      .map((observation) => observation.id)
      .filter((evidenceId) => validIds.has(evidenceId)),
  )
  const thesis = validateClaim(value.thesis, validIds, 'thesis', rejected, claimMode, false, knownColors)
  if (!thesis || !Array.isArray(value.signatureMoves)) {
    return { profile: null, status: 'failed', rejected }
  }
  const signatureMoves = value.signatureMoves.slice(0, 3).flatMap((candidate, index): SignatureMove[] => {
    if (!isRecord(candidate) || !isSafeText(candidate.id, 80) || !isSafeText(candidate.name, 100)) {
      rejected.push(`signatureMoves.${index}:invalid-identity`)
      return []
    }
    const claim = validateClaim(candidate, validIds, `signatureMoves.${index}`, rejected, claimMode, false, knownColors)
    if (!claim || !isSafeText(candidate.distinctiveness, 240)) return []
    // A site-wide signature needs recurring, non-incidental support. Single-page support caps
    // confidence instead of dropping the move (same treatment as patterns and global claims);
    // footer/utility-only support is a real quality problem and still rejects.
    const capped =
      availablePageCount > 1 && referencedPageUrls(claim, evidenceScope).size < 2 && claim.confidence === 'high'
    if (!claim.evidence.some((reference) => !evidenceScope.utilityEvidenceIds.has(reference.evidenceId))) {
      rejected.push(`signatureMoves.${index}:utility-only-evidence`)
      return []
    }
    return [
      {
        ...claim,
        confidence: capped ? ('medium' as const) : claim.confidence,
        id: candidate.id.slice(0, 80),
        name: candidate.name.slice(0, 100),
        distinctiveness: candidate.distinctiveness.slice(0, 240),
      },
    ]
  })
  if (signatureMoves.length === 0) return { profile: null, status: 'failed', rejected }

  if (
    !isRecord(value.composition) ||
    !isRecord(value.attention) ||
    !isRecord(value.visualLanguage) ||
    !isRecord(value.interactionLanguage) ||
    !isRecord(value.transferRules)
  ) {
    return { profile: null, status: 'failed', rejected: [...rejected, 'root:missing-required-groups'] }
  }
  const composition = {
    containerStrategy: requireEvidenceKind(
      requiredClaim(
        value.composition,
        'containerStrategy',
        validIds,
        'composition',
        rejected,
        claimMode,
        false,
        knownColors,
      ),
      /^(?:image|section|layout)-/,
      'composition.containerStrategy',
      rejected,
    ),
    alignmentStrategy: requireEvidenceKind(
      requiredClaim(
        value.composition,
        'alignmentStrategy',
        validIds,
        'composition',
        rejected,
        claimMode,
        false,
        knownColors,
      ),
      /^(?:image|section|layout)-/,
      'composition.alignmentStrategy',
      rejected,
    ),
    densityAndWhitespace: requireEvidenceKind(
      requiredClaim(
        value.composition,
        'densityAndWhitespace',
        validIds,
        'composition',
        rejected,
        claimMode,
        false,
        knownColors,
      ),
      /^(?:image|section|layout)-/,
      'composition.densityAndWhitespace',
      rejected,
    ),
    rhythm: requireEvidenceKind(
      requiredClaim(value.composition, 'rhythm', validIds, 'composition', rejected, claimMode, false, knownColors),
      /^(?:image|section|layout)-/,
      'composition.rhythm',
      rejected,
    ),
  }
  const attention = {
    entryPoint: requiredClaim(
      value.attention,
      'entryPoint',
      validIds,
      'attention',
      rejected,
      claimMode,
      true,
      knownColors,
    ),
    visualSequence: validateClaims(
      value.attention.visualSequence,
      validIds,
      'attention.visualSequence',
      rejected,
      claimMode,
      5,
      true,
      knownColors,
    ),
    actionHierarchy: requiredClaim(
      value.attention,
      'actionHierarchy',
      validIds,
      'attention',
      rejected,
      claimMode,
      false,
      knownColors,
    ),
    contrastStrategy: requiredClaim(
      value.attention,
      'contrastStrategy',
      validIds,
      'attention',
      rejected,
      claimMode,
      false,
      knownColors,
    ),
  }
  const imagery = value.visualLanguage.imagery
    ? validateClaim(
        value.visualLanguage.imagery,
        validIds,
        'visualLanguage.imagery',
        rejected,
        claimMode,
        true,
        knownColors,
      )
    : undefined
  if (imagery && noClassifiedMedia && imagery.confidence === 'high') imagery.confidence = 'medium'
  const visualLanguage = {
    color: requiredClaim(
      value.visualLanguage,
      'color',
      validIds,
      'visualLanguage',
      rejected,
      claimMode,
      false,
      knownColors,
    ),
    typography: requiredClaim(
      value.visualLanguage,
      'typography',
      validIds,
      'visualLanguage',
      rejected,
      claimMode,
      false,
      knownColors,
    ),
    shape: requiredClaim(
      value.visualLanguage,
      'shape',
      validIds,
      'visualLanguage',
      rejected,
      claimMode,
      false,
      knownColors,
    ),
    surfaces: requiredClaim(
      value.visualLanguage,
      'surfaces',
      validIds,
      'visualLanguage',
      rejected,
      claimMode,
      false,
      knownColors,
    ),
    imagery,
    motion: value.visualLanguage.motion
      ? validateClaim(
          value.visualLanguage.motion,
          validIds,
          'visualLanguage.motion',
          rejected,
          claimMode,
          false,
          knownColors,
        )
      : undefined,
  }
  const required = [
    ...Object.values(composition),
    attention.entryPoint,
    attention.actionHierarchy,
    attention.contrastStrategy,
    visualLanguage.color,
    visualLanguage.typography,
    visualLanguage.shape,
    visualLanguage.surfaces,
  ]
  if (required.some((claim) => claim === null)) return { profile: null, status: 'failed', rejected }

  const sectionGrammar = Array.isArray(value.sectionGrammar)
    ? value.sectionGrammar.slice(0, 12).flatMap((item, index) => {
        if (!isRecord(item) || !isSafeText(item.role, 80)) return []
        const role = item.role.trim().toLowerCase()
        if (!observedSectionRoles.has(role as (typeof evidence.sections)[number]['role'])) {
          rejected.push(`sectionGrammar.${index}:unobserved-role`)
          return []
        }
        const keepRoleEvidence = (claim: DesignClaim): boolean =>
          claim.evidence.some((reference) => {
            if (evidenceScope.sectionRoleByEvidenceId.get(reference.evidenceId) === role) return true
            if (!reference.evidenceId.startsWith('image-')) return false
            const pageId = evidenceScope.pageIdByEvidenceId.get(reference.evidenceId)
            return Boolean(pageId && evidenceScope.sectionRolesByPageId.get(pageId)?.has(role))
          })
        const validateRoleClaims = (claims: unknown, path: string) =>
          validateClaims(claims, validIds, path, rejected, claimMode, 5, false, knownColors).filter((claim) => {
            if (keepRoleEvidence(claim)) return true
            rejected.push(`${path}:mismatched-section-role`)
            return false
          })
        return [
          {
            role,
            composition: validateRoleClaims(item.composition, `sectionGrammar.${index}.composition`),
            contentRhythm: validateRoleClaims(item.contentRhythm, `sectionGrammar.${index}.contentRhythm`),
            transitionToNext: validateRoleClaims(item.transitionToNext, `sectionGrammar.${index}.transitionToNext`),
          },
        ]
      })
    : []
  const feedbackStyle = validateInteractionClaim(
    value.interactionLanguage.feedbackStyle,
    validIds,
    interactionIds,
    activeInteractionIds,
    'interactionLanguage.feedbackStyle',
    rejected,
    claimMode,
    knownColors,
  )
  const stateChangeAmplitude = validateInteractionClaim(
    value.interactionLanguage.stateChangeAmplitude,
    validIds,
    interactionIds,
    activeInteractionIds,
    'interactionLanguage.stateChangeAmplitude',
    rejected,
    claimMode,
    knownColors,
  )
  if (!feedbackStyle || !stateChangeAmplitude) return { profile: null, status: 'failed', rejected }

  const componentGrammar = Array.isArray(value.componentGrammar)
    ? value.componentGrammar.slice(0, 16).flatMap((item, index) => {
        if (!isRecord(item) || !isSafeText(item.component, 80) || !isSafeText(item.role, 120)) return []
        return [
          {
            component: item.component.slice(0, 80),
            role: item.role.slice(0, 120),
            rules: validateClaims(
              item.rules,
              validIds,
              `componentGrammar.${index}.rules`,
              rejected,
              claimMode,
              8,
              false,
              knownColors,
            ),
          },
        ]
      })
    : []
  const validTokenRefs = new Set([
    ...evidence.sections.flatMap((section) => section.tokenRefs),
    ...evidence.components.flatMap((component) => component.tokenRefs),
    ...evidence.layoutNodes.flatMap((node) => node.tokenRefs),
  ])
  const patterns = Array.isArray(value.patterns)
    ? value.patterns.slice(0, 12).flatMap((item, index): PatternSpec[] => {
        if (
          !isRecord(item) ||
          !isSafeText(item.id, 80) ||
          !isSafeText(item.name, 100) ||
          !isSafeText(item.role, 160) ||
          typeof item.sourceInstances !== 'number' ||
          !Number.isInteger(item.sourceInstances) ||
          item.sourceInstances < 1 ||
          typeof item.confidence !== 'string' ||
          !CONFIDENCES.has(item.confidence as Confidence)
        ) {
          rejected.push(`patterns.${index}:invalid-identity`)
          return []
        }
        const evidenceRefs = Array.isArray(item.evidenceRefs)
          ? item.evidenceRefs.filter(
              (reference): reference is string => typeof reference === 'string' && validIds.has(reference),
            )
          : []
        if (evidenceRefs.length === 0) {
          rejected.push(`patterns.${index}:missing-evidence`)
          return []
        }
        const responsiveRules = validateClaims(
          item.responsiveRules,
          validIds,
          `patterns.${index}.responsiveRules`,
          rejected,
          claimMode,
          6,
          false,
          knownColors,
        )
        if (singleViewport) {
          for (const rule of responsiveRules) {
            if (rule.confidence === 'high') rule.confidence = 'medium'
          }
        }
        if (horizontalOverflowPageUrls.size > 0) {
          for (const rule of responsiveRules) {
            const appliesToOverflowPage = [...referencedPageUrls(rule, evidenceScope)].some((url) =>
              horizontalOverflowPageUrls.has(url),
            )
            const text = `${rule.statement} ${rule.implementation}`
            const claimsSuccessfulReflow =
              /\b(?:reflows?|stacks?|hides?|hidden|collapses?|fits?|adapts?|responsiv\w*)\b|重排|堆叠|隐藏|收起|适配|响应式/i.test(
                text,
              )
            const acknowledgesOverflow =
              /\b(?:horizontal overflow|overflow|clipp|off-screen|min(?:imum)?-width)\b|横向溢出|横向滚动|裁切|超出视口|最小宽度/i.test(
                text,
              )
            if (appliesToOverflowPage && claimsSuccessfulReflow && !acknowledgesOverflow) rule.confidence = 'low'
          }
        }
        return [
          {
            id: item.id.slice(0, 80),
            name: item.name.slice(0, 100),
            role: item.role.slice(0, 160),
            structureRules: validateClaims(
              item.structureRules,
              validIds,
              `patterns.${index}.structureRules`,
              rejected,
              claimMode,
              6,
              false,
              knownColors,
            ),
            visualRules: validateClaims(
              item.visualRules,
              validIds,
              `patterns.${index}.visualRules`,
              rejected,
              claimMode,
              6,
              true,
              knownColors,
            ),
            interactionRules: validateInteractionClaims(
              item.interactionRules,
              validIds,
              interactionIds,
              activeInteractionIds,
              `patterns.${index}.interactionRules`,
              rejected,
              claimMode,
              6,
              knownColors,
            ),
            responsiveRules,
            tokenRefs: Array.isArray(item.tokenRefs)
              ? item.tokenRefs.filter(
                  (reference): reference is string => typeof reference === 'string' && validTokenRefs.has(reference),
                )
              : [],
            evidenceRefs,
            sourceInstances: item.sourceInstances,
            confidence:
              item.confidence === 'high' && evidenceRefs.length < 2
                ? ('medium' as const)
                : (item.confidence as Confidence),
          },
        ]
      })
    : []
  const uncertainties = Array.isArray(value.uncertainties)
    ? value.uncertainties.slice(0, 12).flatMap((item) => {
        if (!isRecord(item) || !isSafeText(item.topic, 120) || !isSafeText(item.reason, 360)) return []
        return [
          {
            topic: item.topic.slice(0, 120),
            reason: item.reason.slice(0, 360),
            neededEvidence: isSafeText(item.neededEvidence, 240) ? item.neededEvidence : undefined,
          },
        ]
      })
    : []
  const coverageUncertainties: Record<string, { en: [string, string]; zh: [string, string] }> = {
    'fewer-pages-than-requested': {
      en: ['Cross-page grammar', 'Fewer representative pages were available than requested.'],
      zh: ['跨页面语法', '实际可用的代表页面少于请求数量。'],
    },
    'single-viewport': {
      en: ['Responsive behavior', 'Only one viewport was available for structural comparison.'],
      zh: ['响应式行为', '只有一个视口可用于结构比较。'],
    },
    'horizontal-overflow-observed': {
      en: [
        'Responsive behavior',
        'At least one capture overflowed horizontally, so off-screen content may be clipped rather than reflowed.',
      ],
      zh: ['响应式行为', '至少一个视口存在横向溢出，视口外内容可能只是被裁切，并非已经重排。'],
    },
    'some-safe-interactions-skipped': {
      en: ['Interaction states', 'Some interaction candidates were skipped by the safe-action policy or budget.'],
      zh: ['交互状态', '部分交互候选因安全策略或预算限制未执行。'],
    },
    'no-major-media-detected': {
      en: ['Media language', 'No major media region was detected for image-language inference.'],
      zh: ['媒体语言', '未检测到可用于图像语言推断的主要媒体区域。'],
    },
    'no-classified-media-regions': {
      en: ['Media language', 'Media regions were detected but none could be classified into a visual role.'],
      zh: ['媒体语言', '检测到媒体区域，但无法将其归类到明确的视觉角色。'],
    },
    'no-interaction-states-observed': {
      en: ['Interaction states', 'No hover, focus, or safely observed state changes were captured.'],
      zh: ['交互状态', '未捕获到 hover、focus 或安全观察到的状态变化。'],
    },
  }
  for (const limitation of evidence.limitations) {
    const copy = coverageUncertainties[limitation]
    if (!copy) continue
    const [topic, reason] = language === 'zh-CN' ? copy.zh : copy.en
    if (!uncertainties.some((item) => item.topic === topic)) {
      uncertainties.push({ topic, reason, neededEvidence: undefined })
    }
  }

  const profile: DesignProfile = {
    schemaVersion: '1',
    language,
    inputMode: claimMode,
    thesis,
    signatureMoves,
    composition: composition as DesignProfile['composition'],
    attention: attention as DesignProfile['attention'],
    visualLanguage: {
      color: visualLanguage.color!,
      typography: visualLanguage.typography!,
      shape: visualLanguage.shape!,
      surfaces: visualLanguage.surfaces!,
      ...(visualLanguage.imagery ? { imagery: visualLanguage.imagery } : {}),
      ...(visualLanguage.motion ? { motion: visualLanguage.motion } : {}),
    },
    sectionGrammar,
    interactionLanguage: {
      primaryDrivers: validateInteractionClaims(
        value.interactionLanguage.primaryDrivers,
        validIds,
        interactionIds,
        activeInteractionIds,
        'interactionLanguage.primaryDrivers',
        rejected,
        claimMode,
        5,
        knownColors,
      ),
      feedbackStyle,
      stateChangeAmplitude,
      ...(value.interactionLanguage.scrollNarrative
        ? {
            scrollNarrative:
              validateInteractionClaim(
                value.interactionLanguage.scrollNarrative,
                validIds,
                interactionIds,
                activeInteractionIds,
                'interactionLanguage.scrollNarrative',
                rejected,
                claimMode,
                knownColors,
              ) || undefined,
          }
        : {}),
      continuityRules: validateInteractionClaims(
        value.interactionLanguage.continuityRules,
        validIds,
        interactionIds,
        activeInteractionIds,
        'interactionLanguage.continuityRules',
        rejected,
        claimMode,
        6,
        knownColors,
      ),
    },
    componentGrammar,
    ...(patterns.length > 0 ? { patterns } : {}),
    transferRules: {
      preserve: validateClaims(
        value.transferRules.preserve,
        validIds,
        'transferRules.preserve',
        rejected,
        claimMode,
        6,
        false,
        knownColors,
      ),
      adapt: validateClaims(
        value.transferRules.adapt,
        validIds,
        'transferRules.adapt',
        rejected,
        claimMode,
        6,
        false,
        knownColors,
      ),
      avoid: validateClaims(
        value.transferRules.avoid,
        validIds,
        'transferRules.avoid',
        rejected,
        claimMode,
        6,
        false,
        knownColors,
      ),
    },
    uncertainties: uncertainties.slice(0, 12),
  }

  const constrainGlobal = <T extends DesignClaim>(claim: T): T =>
    capSinglePageGlobalClaim(claim, evidenceScope, availablePageCount)
  profile.thesis = constrainGlobal(profile.thesis)
  profile.signatureMoves = profile.signatureMoves.map((claim) => constrainGlobal(claim))
  for (const key of Object.keys(profile.composition) as Array<keyof DesignProfile['composition']>) {
    profile.composition[key] = constrainGlobal(profile.composition[key])
  }
  profile.attention.actionHierarchy = constrainGlobal(profile.attention.actionHierarchy)
  profile.attention.contrastStrategy = constrainGlobal(profile.attention.contrastStrategy)
  for (const key of ['color', 'typography', 'shape', 'surfaces', 'imagery', 'motion'] as const) {
    const claim = profile.visualLanguage[key]
    if (claim) profile.visualLanguage[key] = constrainGlobal(claim)
  }
  if (availablePageCount > 1) {
    // Interaction evidence is usually concentrated on the entry page, so single-page continuity
    // is structural, not a model error: demote to low confidence (surfaced as cautious
    // inferences) instead of dropping. Preserve rules keep the claim with capped confidence.
    profile.interactionLanguage.continuityRules = profile.interactionLanguage.continuityRules.map((claim) =>
      referencedPageUrls(claim, evidenceScope).size >= 2 ? claim : { ...claim, confidence: 'low' as const },
    )
    profile.transferRules.preserve = profile.transferRules.preserve.flatMap((claim, index) => {
      if (!claim.evidence.some((reference) => !evidenceScope.utilityEvidenceIds.has(reference.evidenceId))) {
        rejected.push(`transferRules.preserve.${index}:utility-only-evidence`)
        return []
      }
      if (referencedPageUrls(claim, evidenceScope).size < 2 && claim.confidence === 'high') {
        return [{ ...claim, confidence: 'medium' as const }]
      }
      return [claim]
    })
  }
  if (availablePageCount <= 1) {
    profile.transferRules.preserve = profile.transferRules.preserve.filter((claim, index) => {
      if (claim.evidence.some((reference) => !evidenceScope.utilityEvidenceIds.has(reference.evidenceId))) return true
      rejected.push(`transferRules.preserve.${index}:utility-only-evidence`)
      return false
    })
  }
  profile.patterns = profile.patterns?.map((pattern) => {
    if (pattern.confidence !== 'high' || availablePageCount <= 1) return pattern
    const pageCount = new Set(
      pattern.evidenceRefs
        .map((evidenceId) => evidenceScope.pageUrlByEvidenceId.get(evidenceId))
        .filter((url): url is string => Boolean(url)),
    ).size
    if (pageCount >= 2) return pattern
    return { ...pattern, confidence: 'medium' as const }
  })
  if (profile.attention.visualSequence.length === 0) rejected.push('attention.visualSequence:empty')
  if (profile.sectionGrammar.length === 0) rejected.push('sectionGrammar:empty')
  if (profile.componentGrammar.length === 0) rejected.push('componentGrammar:empty')
  if (profile.interactionLanguage.primaryDrivers.length === 0) {
    rejected.push('interactionLanguage.primaryDrivers:empty')
  }
  for (const kind of ['preserve', 'adapt', 'avoid'] as const) {
    if (profile.transferRules[kind].length === 0) rejected.push(`transferRules.${kind}:empty`)
  }
  return { profile, status: rejected.length > 0 ? 'partial' : 'complete', rejected, imageObservationsValid }
}
