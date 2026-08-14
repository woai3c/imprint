import { isRecord } from '../../shared/type-guards.js'
import { parseJsonObjects } from '../ai/json-payload.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { coreT } from '../i18n/index.js'
import { isDesignAssertionKind, isDesignAssertionPredicate } from './assertion-schema.js'
import { buildEvidenceFallbackProfile, markSignatureMovesAsCoverageRepair } from './evidence-fallback.js'
import { listEvidenceIds } from './evidence-selector.js'
import type {
  Confidence,
  DesignClaim,
  DesignClaimAssertion,
  DesignProfile,
  DesignProfileSchemaVersion,
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
const VISIBLE_FOCUS_ASSERTION =
  /\b(?:clear|clearly visible|visible|prominent|distinct)\s+(?:keyboard\s+)?focus|(?:focus|keyboard focus)\s+(?:indicator|ring).*(?:clear|visible|prominent|distinct)|清晰可见|清楚可见|明显的?(?:键盘)?焦点|可见的?(?:键盘)?焦点/i
const ORDERED_VISUAL_SEQUENCE =
  /\b(?:first|then|next|finally|followed by)\b|\bfrom\b[^.]{1,100}\bto\b|(?:→|->)|(?:先|首先|随后|然后|接着|再到|最后|最终|依次|从[^。]{1,80}到)/i
const HORIZONTAL_OVERFLOW_ASSERTION =
  /\b(?:horizontal overflow|overflow|clipp|off-screen|min(?:imum)?-width)\b|横向溢出|横向滚动|裁切|超出视口|最小宽度/i

const SECTION_ROLE_ALIASES: Record<string, string> = {
  页眉: 'header',
  头部: 'header',
  顶部栏: 'header',
  导航: 'navigation',
  导航栏: 'navigation',
  主视觉: 'hero',
  首屏: 'hero',
  内容: 'content',
  正文: 'content',
  功能组: 'feature-group',
  特性组: 'feature-group',
  媒体: 'media',
  操作: 'action',
  行动: 'action',
  侧栏: 'aside',
  边栏: 'aside',
  页脚: 'footer',
  底部: 'footer',
  未知: 'unknown',
}

const COMPONENT_TYPE_ALIASES: Record<string, string> = {
  按钮: 'button',
  输入框: 'input',
  输入: 'input',
  导航: 'navigation',
  导航栏: 'navigation',
  卡片: 'card',
  对话框: 'modal',
  弹窗: 'modal',
  列表: 'list',
  表格: 'table',
}

function normalizeSectionRole(value: string, schemaVersion: DesignProfileSchemaVersion): string {
  const normalized = value.trim().toLowerCase()
  return schemaVersion === '1' ? SECTION_ROLE_ALIASES[normalized] || normalized : normalized
}

function normalizeComponentType(value: string, schemaVersion: DesignProfileSchemaVersion): string {
  const normalized = value.trim().toLowerCase()
  return schemaVersion === '1' ? COMPONENT_TYPE_ALIASES[normalized] || normalized : normalized
}

function collectTokenColorValues(evidence: DesignEvidence): Set<string> {
  return new Set(
    Object.values(evidence.tokens.colors || {})
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase()),
  )
}

function sanitizeUnsupportedColorLiterals(
  text: string,
  knownColors: Set<string>,
  tokenRefs: unknown,
): { text: string; changed: boolean } {
  let changed = false
  const firstTokenRef = Array.isArray(tokenRefs)
    ? tokenRefs.find((tokenRef): tokenRef is string => typeof tokenRef === 'string' && tokenRef.startsWith('color.'))
    : undefined
  const replacement = firstTokenRef
    ? `token ${firstTokenRef}`
    : /[\u3400-\u9fff]/.test(text)
      ? '已观察的颜色令牌'
      : 'an observed color token'
  const sanitized = text.replace(COLOR_LITERAL, (literal) => {
    if (knownColors.has(literal.trim().toLowerCase())) return literal
    changed = true
    return replacement
  })
  return { text: sanitized, changed }
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
    if (isRecord(object) && ['1', '2'].includes(String(object.schemaVersion)) && object.thesis) return object
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

function parseAssertions(
  value: unknown,
  validIds: Set<string>,
  claimEvidenceIds: Set<string>,
  path: string,
  rejected: string[],
): DesignClaimAssertion[] | null {
  if (!Array.isArray(value)) return []
  let invalid = false
  const assertions = value.slice(0, 4).flatMap((candidate, index) => {
    const assertionPath = `${path}.assertions.${index}`
    if (
      !isRecord(candidate) ||
      typeof candidate.kind !== 'string' ||
      !isDesignAssertionKind(candidate.kind) ||
      !isSafeText(candidate.target, 120) ||
      typeof candidate.predicate !== 'string' ||
      !isDesignAssertionPredicate(candidate.kind, candidate.predicate) ||
      !['instance', 'page', 'cross-page'].includes(String(candidate.scope))
    ) {
      rejected.push(`${assertionPath}:invalid-assertion`)
      invalid = true
      return []
    }
    const evidenceIds = Array.isArray(candidate.evidenceIds)
      ? candidate.evidenceIds.filter(
          (evidenceId): evidenceId is string =>
            typeof evidenceId === 'string' && validIds.has(evidenceId) && claimEvidenceIds.has(evidenceId),
        )
      : []
    if (evidenceIds.length === 0) {
      rejected.push(`${assertionPath}:missing-bound-evidence`)
      invalid = true
      return []
    }
    const property = isSafeText(candidate.property, 120) ? candidate.property.trim() : undefined
    const rawValue = candidate.value
    const assertionValue =
      typeof rawValue === 'string' && isSafeText(rawValue, 160)
        ? rawValue.trim()
        : typeof rawValue === 'number' && Number.isFinite(rawValue)
          ? rawValue
          : typeof rawValue === 'boolean'
            ? rawValue
            : Array.isArray(rawValue) && rawValue.length <= 8 && rawValue.every((item) => isSafeText(item, 120))
              ? rawValue.map((item) => item.trim())
              : undefined
    if (rawValue !== undefined && assertionValue === undefined) {
      rejected.push(`${assertionPath}:invalid-value`)
      invalid = true
      return []
    }
    return [
      {
        kind: candidate.kind,
        target: candidate.target.trim(),
        predicate: candidate.predicate,
        scope: candidate.scope as DesignClaimAssertion['scope'],
        evidenceIds: [...new Set(evidenceIds)].slice(0, 3),
        ...(property ? { property } : {}),
        ...(assertionValue !== undefined ? { value: assertionValue } : {}),
      },
    ]
  })
  return invalid ? null : assertions
}

function tokenRefMatchesStructuredField(tokenRef: string, path: string): boolean {
  if (/^composition\.(?:densityAndWhitespace|rhythm)$/.test(path)) return tokenRef.startsWith('spacing.')
  if (path === 'attention.contrastStrategy' || path === 'visualLanguage.color') return tokenRef.startsWith('color.')
  if (path === 'visualLanguage.typography') return tokenRef.startsWith('typography.')
  if (path === 'visualLanguage.shape') return /^(?:radius|border)\./.test(tokenRef)
  if (path === 'visualLanguage.surfaces') return /^(?:color|shadow|border)\./.test(tokenRef)
  return true
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
  schemaVersion: DesignProfileSchemaVersion = '1',
): DesignClaim | null {
  if (!isRecord(value)) {
    rejected.push(`${path}:not-an-object`)
    return null
  }
  if (typeof value.statement !== 'string' || typeof value.implementation !== 'string') {
    rejected.push(`${path}:invalid-text`)
    return null
  }
  let statement = value.statement
  let implementation = value.implementation
  if (
    !statement.trim() ||
    statement.length > 240 ||
    (schemaVersion === '1' && GENERIC_ONLY.test(statement.trim())) ||
    (schemaVersion === '1' && UNPROVABLE_INTENT.test(statement)) ||
    HTML_OR_URL.test(statement)
  ) {
    rejected.push(`${path}:invalid-statement`)
    return null
  }
  if (
    !implementation.trim() ||
    implementation.length > 360 ||
    (schemaVersion === '1' && UNPROVABLE_INTENT.test(implementation)) ||
    HTML_OR_URL.test(implementation)
  ) {
    rejected.push(`${path}:invalid-implementation`)
    return null
  }
  let sanitizedTokenValue = false
  if (knownColors) {
    const sanitizedStatement = sanitizeUnsupportedColorLiterals(statement, knownColors, value.tokenRefs)
    const sanitizedImplementation = sanitizeUnsupportedColorLiterals(implementation, knownColors, value.tokenRefs)
    statement = sanitizedStatement.text
    implementation = sanitizedImplementation.text
    sanitizedTokenValue = sanitizedStatement.changed || sanitizedImplementation.changed
    if (sanitizedTokenValue) rejected.push(`${path}:token-value-sanitized`)
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
  if (sanitizedTokenValue) confidence = 'low'
  const assertions =
    schemaVersion === '2'
      ? parseAssertions(
          value.assertions,
          validIds,
          new Set(evidence.map((reference) => reference.evidenceId)),
          path,
          rejected,
        )
      : []
  if (assertions === null) {
    rejected.push(`${path}:invalid-structured-assertion`)
    return null
  }
  if (schemaVersion === '2' && assertions.length === 0) {
    rejected.push(`${path}:missing-structured-assertion`)
    return null
  }
  const tokenRefs = Array.isArray(value.tokenRefs)
    ? value.tokenRefs.filter((tokenRef): tokenRef is string => typeof tokenRef === 'string').slice(0, 16)
    : []
  if (schemaVersion === '2' && tokenRefs.some((tokenRef) => !tokenRefMatchesStructuredField(tokenRef, path))) {
    rejected.push(`${path}:token-role-mismatch`)
    return null
  }
  return {
    statement: statement.trim(),
    implementation: implementation.trim(),
    confidence,
    evidence,
    ...(tokenRefs.length > 0 ? { tokenRefs } : {}),
    ...(assertions.length > 0 ? { assertions } : {}),
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
  schemaVersion: DesignProfileSchemaVersion = '1',
): DesignClaim[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, max)
    .map((candidate, index) =>
      validateClaim(
        candidate,
        validIds,
        `${path}.${index}`,
        rejected,
        inputMode,
        visualOnly,
        knownColors,
        schemaVersion,
      ),
    )
    .filter((claim): claim is DesignClaim => claim !== null)
}

function validateVisualSequenceClaims(
  value: unknown,
  validIds: Set<string>,
  path: string,
  rejected: string[],
  inputMode: IntelligenceInputMode,
  max: number,
  knownColors?: Set<string>,
  schemaVersion: DesignProfileSchemaVersion = '1',
): DesignClaim[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, max).flatMap((candidate, index) => {
    const itemPath = `${path}.${index}`
    const claim = validateClaim(candidate, validIds, itemPath, rejected, inputMode, true, knownColors, schemaVersion)
    if (!claim) return []
    if (schemaVersion === '2') {
      if (
        claim.assertions?.some((assertion) => assertion.kind === 'section' && assertion.predicate === 'ordered-before')
      ) {
        return [claim]
      }
      rejected.push(`${itemPath}:missing-ordered-sequence-assertion`)
      return []
    }
    if (ORDERED_VISUAL_SEQUENCE.test(`${claim.statement} ${claim.implementation}`)) return [claim]
    rejected.push(`${itemPath}:semantic-field-mismatch`)
    return []
  })
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
  schemaVersion: DesignProfileSchemaVersion = '1',
): DesignClaim | null {
  const claim = validateClaim(value, validIds, path, rejected, inputMode, false, knownColors, schemaVersion)
  if (!claim) return null
  const hasInteractionEvidence = claim.evidence.some((reference) => interactionIds.has(reference.evidenceId))
  if (
    schemaVersion === '2' &&
    hasInteractionEvidence &&
    !claim.assertions?.some((assertion) => assertion.kind === 'interaction')
  ) {
    rejected.push(`${path}:missing-interaction-assertion`)
    return null
  }
  if (!hasInteractionEvidence) {
    return { ...claim, confidence: 'low' }
  }
  const hasActiveEvidence = claim.evidence.some((reference) => activeInteractionIds.has(reference.evidenceId))
  if (!hasActiveEvidence && schemaVersion === '1') {
    const assertsUniversalBehavior = /\b(?:all|every|always|uniformly)\b|所有|全部|一律|均会|始终/i.test(
      `${claim.statement} ${claim.implementation}`,
    )
    const assertsExecutedBehavior =
      /\b(?:click|clicked|press|pressed|pressing|expand|expanded|toggle|toggled|open|opened|close|closed|navigate|navigates)\b|点击|按压|按下|展开|切换|打开|关闭|跳转/i.test(
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
  schemaVersion: DesignProfileSchemaVersion = '1',
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
        schemaVersion,
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
  schemaVersion: DesignProfileSchemaVersion = '1',
): DesignClaim | null {
  return validateClaim(
    parent[key],
    validIds,
    `${path}.${key}`,
    rejected,
    inputMode,
    visualOnly,
    knownColors,
    schemaVersion,
  )
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

function groundColorClaims(profile: DesignProfile, evidence: DesignEvidence, scope: EvidenceScope, rejected: string[]) {
  const refsByValue = new Map<string, string[]>()
  const pagesByRef = new Map<string, Set<string>>()
  for (const [name, value] of Object.entries(evidence.tokens.colors)) {
    const normalized = value.trim().toLowerCase()
    const ref = `color.${name}`
    const refs = refsByValue.get(normalized) || []
    refs.push(ref)
    refsByValue.set(normalized, refs)
    pagesByRef.set(
      ref,
      new Set((evidence.tokens.evidence?.[`colors.${name}`]?.pages || []).map((page) => canonicalPageUrl(page))),
    )
  }

  let mismatch = false
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`))
      return
    }
    if (!isRecord(value)) return
    if (typeof value.statement === 'string' && typeof value.implementation === 'string') {
      const claim = value as unknown as DesignClaim
      const literals = [...`${claim.statement} ${claim.implementation}`.matchAll(COLOR_LITERAL)]
        .map((match) => match[0].trim().toLowerCase())
        .filter((literal, index, all) => all.indexOf(literal) === index && refsByValue.has(literal))
      if (literals.length === 0) return
      const claimPages = referencedPageUrls(claim, scope)
      const matchedRefs: string[] = []
      for (const literal of literals) {
        const refs = refsByValue.get(literal) || []
        const ref =
          refs.find((candidate) => [...(pagesByRef.get(candidate) || [])].some((page) => claimPages.has(page))) ||
          refs[0]
        if (ref && !matchedRefs.includes(ref)) matchedRefs.push(ref)
        const tokenPages = refs.flatMap((candidate) => [...(pagesByRef.get(candidate) || [])])
        if (claimPages.size > 0 && tokenPages.length > 0 && !tokenPages.some((page) => claimPages.has(page))) {
          mismatch = true
          claim.confidence = 'low'
          rejected.push(`${path}:color-token-page-mismatch(${ref || literal})`)
        }
      }
      claim.tokenRefs = [...(claim.tokenRefs || []).filter((ref) => !ref.startsWith('color.')), ...matchedRefs].slice(
        0,
        16,
      )
      return
    }
    Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key))
  }
  visit(profile, '')
  return mismatch
}

function groundOverflowClaims(
  profile: DesignProfile,
  evidence: DesignEvidence,
  scope: EvidenceScope,
  rejected: string[],
): boolean {
  const overflowFacts = evidence.pages.flatMap((page) => {
    if (!page.horizontalOverflow) return []
    const sourceSectionIds = [
      ...new Set(
        (page.horizontalOverflowSources || [])
          .map((source) => source.sectionId)
          .filter((sectionId): sectionId is string => Boolean(sectionId)),
      ),
    ]
    return [{ page, sourceSectionIds }]
  })
  if (overflowFacts.length === 0) return false

  let mismatch = false
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`))
      return
    }
    if (!isRecord(value)) return
    if (typeof value.statement === 'string' && typeof value.implementation === 'string') {
      const claim = value as unknown as DesignClaim
      if (!HORIZONTAL_OVERFLOW_ASSERTION.test(`${claim.statement} ${claim.implementation}`)) return
      const citedIds = new Set(claim.evidence.map((reference) => reference.evidenceId))
      const citedPageIds = new Set(
        claim.evidence
          .map((reference) => scope.pageIdByEvidenceId.get(reference.evidenceId))
          .filter((pageId): pageId is string => Boolean(pageId)),
      )
      const fact =
        overflowFacts.find(({ sourceSectionIds }) => sourceSectionIds.some((sectionId) => citedIds.has(sectionId))) ||
        overflowFacts.find(({ page }) => citedPageIds.has(page.id)) ||
        overflowFacts[0]
      const grounded =
        fact.sourceSectionIds.length > 0
          ? fact.sourceSectionIds.some((sectionId) => citedIds.has(sectionId))
          : citedPageIds.has(fact.page.id)
      if (grounded) return

      const preferredIds = [...fact.sourceSectionIds, ...fact.page.images.map((image) => image.id), fact.page.id].slice(
        0,
        2,
      )
      if (preferredIds.length === 0) return
      claim.evidence = preferredIds.map((evidenceId) => ({
        evidenceId,
        note:
          profile.language === 'zh-CN'
            ? '程序定位的横向溢出页面或关联区块'
            : 'Programmatically located overflow page or source section',
      }))
      if (claim.confidence === 'high') claim.confidence = 'medium'
      mismatch = true
      rejected.push(`${path}:overflow-evidence-scope-repaired`)
      return
    }
    Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key))
  }
  visit(profile, '')
  return mismatch
}

function isTransparentPaint(value: string | undefined): boolean {
  if (!value) return true
  const normalized = value.toLowerCase().replace(/\s+/g, '')
  if (normalized === 'none' || normalized === 'transparent' || normalized === '0' || normalized === '0px') return true
  if (/^#[\da-f]{8}$/.test(normalized) && normalized.endsWith('00')) return true
  if (/^(?:rgba|hsla)\([^)]*,0(?:\.0+)?\)$/.test(normalized)) return true
  const withoutTransparentColors = normalized
    .replace(/(?:rgba|hsla)\([^)]*,0(?:\.0+)?\)/g, '')
    .replace(/transparent/g, '')
    .replace(/inset/g, '')
    .replace(/-?\d+(?:\.\d+)?(?:px|rem|em)?/g, '')
    .replace(/[(),/]/g, '')
  if (!withoutTransparentColors) return true
  return false
}

function focusObservationHasVisibleIndicator(observation: DesignEvidence['interactionObservations'][number]): boolean {
  const outlineColor = observation.after['outline-color'] || observation.after.outlineColor
  const boxShadow = observation.after['box-shadow'] || observation.after.boxShadow
  return !isTransparentPaint(outlineColor) || !isTransparentPaint(boxShadow)
}

function validateVisibleFocusClaims(profile: DesignProfile, evidence: DesignEvidence, rejected: string[]): boolean {
  const observations = new Map(evidence.interactionObservations.map((observation) => [observation.id, observation]))
  let mismatch = false
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`))
      return
    }
    if (!isRecord(value)) return
    if (typeof value.statement === 'string' && typeof value.implementation === 'string') {
      const claim = value as unknown as DesignClaim
      if (!VISIBLE_FOCUS_ASSERTION.test(`${claim.statement} ${claim.implementation}`)) return
      const focusEvidence = claim.evidence
        .map((reference) => observations.get(reference.evidenceId))
        .filter(
          (observation): observation is DesignEvidence['interactionObservations'][number] =>
            observation?.driver === 'focus',
        )
      if (focusEvidence.length === 0 || focusEvidence.some(focusObservationHasVisibleIndicator)) return
      mismatch = true
      claim.confidence = 'low'
      rejected.push(`${path}:focus-visibility-not-observed`)
      return
    }
    Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key))
  }
  visit(profile, '')
  return mismatch
}

const INTERACTION_PROPERTY_PATTERNS: Array<{ property: string; pattern: RegExp }> = [
  { property: 'background-color', pattern: /background(?:-|\s*)colou?r|背景色/i },
  { property: 'box-shadow', pattern: /box(?:-|\s*)shadow|阴影/i },
  { property: 'outline', pattern: /outline|轮廓/i },
  { property: 'text-decoration', pattern: /text(?:-|\s*)decoration|underline|下划线/i },
  { property: 'border-color', pattern: /border(?:-|\s*)colou?r|边框色/i },
  {
    property: 'color',
    pattern:
      /(?:^|[\s,，、;；])color(?=$|[\s,，、;；])|(?:文字|文本|前景)(?:色|颜色)|(?:^|[\s，、；])颜色(?=$|[\s，、；])/i,
  },
  { property: 'opacity', pattern: /opacity|透明度/i },
]

const INTERACTION_DRIVER_PATTERNS: Array<{
  driver: DesignEvidence['interactionObservations'][number]['driver']
  pattern: RegExp
}> = [
  { driver: 'hover', pattern: /\bhover\b|mouse[ -]?over|悬停/i },
  { driver: 'focus', pattern: /\bfocus\b|keyboard|焦点|键盘/i },
  { driver: 'click', pattern: /\bclick(?:ed|ing)?\b|\btoggle\b|\bpress(?:ed|ing)?\b|点击|按下|切换|展开|打开|关闭/i },
  { driver: 'disabled', pattern: /\bdisabled?\b|禁用/i },
  { driver: 'scroll', pattern: /\bscroll\b|滚动/i },
  { driver: 'time', pattern: /\b(?:time|timed|automatic)\b|定时|自动/i },
]

function interactionDriverForProperty(
  text: string,
  property: string,
): DesignEvidence['interactionObservations'][number]['driver'] | undefined {
  const propertyPattern = INTERACTION_PROPERTY_PATTERNS.find((candidate) => candidate.property === property)?.pattern
  if (!propertyPattern) return undefined
  for (const clause of text.split(/[,.，。;；\n]/)) {
    if (!propertyPattern.test(clause)) continue
    const clauseDrivers = INTERACTION_DRIVER_PATTERNS.filter(({ pattern }) => pattern.test(clause))
    if (clauseDrivers.length === 1) return clauseDrivers[0].driver
  }
  const propertyIndex = text.search(propertyPattern)
  if (propertyIndex < 0) return undefined
  return INTERACTION_DRIVER_PATTERNS.flatMap(({ driver, pattern }) => {
    const index = text.search(pattern)
    return index >= 0 ? [{ driver, score: Math.abs(propertyIndex - index) + (index > propertyIndex ? 40 : 0) }] : []
  }).sort((a, b) => a.score - b.score)[0]?.driver
}

function interactionPropertyObserved(property: string, changedProperties: Set<string>, text: string): boolean {
  if (property === 'outline') return [...changedProperties].some((candidate) => candidate.startsWith('outline'))
  if (property === 'border-color') {
    if (changedProperties.has(property)) return true
    return [...changedProperties].some((candidate) => {
      if (!/^border-(?:top|right|bottom|left)-color$/.test(candidate)) return false
      const humanName = candidate.replaceAll('-', '[ -]?')
      return new RegExp(`\\b${humanName}\\b`, 'i').test(text)
    })
  }
  return changedProperties.has(property)
}

function validateInteractionClaimDetails(
  profile: DesignProfile,
  evidence: DesignEvidence,
  scope: EvidenceScope,
  validIds: Set<string>,
  rejected: string[],
): boolean {
  const eligibleObservations = evidence.interactionObservations.filter((observation) => validIds.has(observation.id))
  const observations = new Map(eligibleObservations.map((observation) => [observation.id, observation]))
  let mismatch = false
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`))
      return
    }
    if (!isRecord(value)) return
    if (typeof value.statement === 'string' && typeof value.implementation === 'string') {
      const claim = value as unknown as DesignClaim
      let cited = claim.evidence
        .map((reference) => observations.get(reference.evidenceId))
        .filter((observation): observation is DesignEvidence['interactionObservations'][number] => Boolean(observation))
      if (cited.length === 0) return
      let text = `${claim.statement} ${claim.implementation}`
      let changedProperties = new Set(cited.flatMap((observation) => observation.changedProperties))
      let unsupportedProperty = INTERACTION_PROPERTY_PATTERNS.find(
        ({ property, pattern }) =>
          pattern.test(text) && !interactionPropertyObserved(property, changedProperties, text),
      )?.property
      if (unsupportedProperty === 'border-color') {
        const observedSideColors = [...changedProperties].filter((property) =>
          /^border-(?:top|right|bottom|left)-color$/.test(property),
        )
        if (observedSideColors.length === 1) {
          const property = observedSideColors[0]
          const chineseProperty = (
            {
              'border-top-color': '上边框颜色',
              'border-right-color': '右边框颜色',
              'border-bottom-color': '下边框颜色',
              'border-left-color': '左边框颜色',
            } as Record<string, string>
          )[property]
          const replace = (source: string) =>
            source
              .replace(/\bborder(?:-|\s*)colou?r\b/gi, property)
              .replace(/边框(?:色|颜色)/g, chineseProperty || property)
          claim.statement = replace(claim.statement)
          claim.implementation = replace(claim.implementation)
          text = `${claim.statement} ${claim.implementation}`
          unsupportedProperty = undefined
          rejected.push(`${path}:interaction-property-normalized(${property})`)
        }
      }
      let repairAttempts = 0
      while (unsupportedProperty && repairAttempts < 3) {
        repairAttempts += 1
        const propertyToRepair = unsupportedProperty
        const citedSectionIds = new Set(cited.map((observation) => observation.sectionId))
        const citedPageIds = new Set(
          cited
            .map((observation) => scope.pageIdByEvidenceId.get(observation.id))
            .filter((pageId): pageId is string => Boolean(pageId)),
        )
        const citedDrivers = new Set(cited.map((observation) => observation.driver))
        const namedDriver = interactionDriverForProperty(text, propertyToRepair)
        const replacement = eligibleObservations
          .filter(
            (observation) =>
              (!namedDriver || observation.driver === namedDriver) &&
              interactionPropertyObserved(propertyToRepair, new Set(observation.changedProperties), text),
          )
          .sort((a, b) => {
            const score = (observation: DesignEvidence['interactionObservations'][number]) => {
              const sameDriver = citedDrivers.has(observation.driver)
              if (sameDriver && citedSectionIds.has(observation.sectionId)) return 0
              const pageId = scope.pageIdByEvidenceId.get(observation.id)
              if (sameDriver && pageId && citedPageIds.has(pageId)) return 1
              if (sameDriver) return 2
              if (citedSectionIds.has(observation.sectionId)) return 3
              if (pageId && citedPageIds.has(pageId)) return 4
              return 5
            }
            return score(a) - score(b) || a.id.localeCompare(b.id)
          })[0]
        if (!replacement) break
        const retainedReferences = claim.evidence.filter((reference) => {
          const observation = observations.get(reference.evidenceId)
          return (
            !observation ||
            INTERACTION_PROPERTY_PATTERNS.some(
              ({ property, pattern }) =>
                pattern.test(text) &&
                interactionPropertyObserved(property, new Set(observation.changedProperties), text),
            )
          )
        })
        claim.evidence = [
          ...retainedReferences.filter((reference) => reference.evidenceId !== replacement.id),
          {
            evidenceId: replacement.id,
            note:
              profile.language === 'zh-CN'
                ? `程序重绑到包含 ${propertyToRepair} 变化的交互证据`
                : `Programmatically rebound to interaction evidence containing a ${propertyToRepair} change`,
          },
        ].slice(0, 3)
        cited = claim.evidence
          .map((reference) => observations.get(reference.evidenceId))
          .filter((observation): observation is DesignEvidence['interactionObservations'][number] =>
            Boolean(observation),
          )
        changedProperties = new Set(cited.flatMap((observation) => observation.changedProperties))
        if (!interactionPropertyObserved(propertyToRepair, changedProperties, text)) break
        if (claim.confidence === 'high') claim.confidence = 'medium'
        rejected.push(`${path}:interaction-evidence-scope-repaired(${propertyToRepair})`)
        unsupportedProperty = INTERACTION_PROPERTY_PATTERNS.find(
          ({ property, pattern }) =>
            pattern.test(text) && !interactionPropertyObserved(property, changedProperties, text),
        )?.property
      }
      if (unsupportedProperty && path === 'interactionLanguage.stateChangeAmplitude' && changedProperties.size > 0) {
        const supportedProperties = [...changedProperties].sort().slice(0, 8)
        claim.statement =
          profile.language === 'zh-CN'
            ? `已引用的状态证据仅确认 ${supportedProperties.join('、')} 的属性差异，实际视觉幅度尚未执行验证。`
            : `The cited state evidence confirms only ${supportedProperties.join(', ')} property differences; the visual amplitude has not been actively verified.`
        claim.implementation =
          profile.language === 'zh-CN'
            ? '仅复用以上已记录的属性差异；其他反馈属性需要新增对应交互证据后再采用。'
            : 'Reuse only these recorded property differences; require matching interaction evidence before adding other feedback properties.'
        claim.confidence = 'low'
        rejected.push(`${path}:interaction-property-claim-sanitized(${unsupportedProperty})`)
        text = `${claim.statement} ${claim.implementation}`
        unsupportedProperty = undefined
      }
      const observedValues = new Set(
        cited
          .flatMap((observation) => [
            ...Object.values(observation.before),
            ...Object.values(observation.after),
            ...(observation.transition?.duration ? [observation.transition.duration] : []),
            ...(observation.transition?.easing ? [observation.transition.easing] : []),
          ])
          .map((item) => item.trim().toLowerCase()),
      )
      const exactValues = [
        ...[...text.matchAll(COLOR_LITERAL)].map((match) => match[0]),
        ...[...text.matchAll(/\b\d+(?:\.\d+)?(?:ms|s)\b/gi)].map((match) => match[0]),
      ].map((item) => item.trim().toLowerCase())
      const unsupportedValue = exactValues.find((item) => !observedValues.has(item))
      if (!unsupportedProperty && !unsupportedValue) return
      mismatch = true
      claim.confidence = 'low'
      if (unsupportedProperty) rejected.push(`${path}:interaction-property-not-observed(${unsupportedProperty})`)
      if (unsupportedValue) rejected.push(`${path}:interaction-value-not-observed(${unsupportedValue})`)
      return
    }
    Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key))
  }
  visit(profile, '')
  return mismatch
}

function capSinglePageGlobalClaim<T extends DesignClaim>(
  claim: T,
  scope: EvidenceScope,
  availablePageCount: number,
  schemaVersion: DesignProfileSchemaVersion,
): T {
  const referencedPages = referencedPageUrls(claim, scope).size
  const assertsUniversalCoverage =
    schemaVersion === '2'
      ? Boolean(claim.assertions?.some((assertion) => assertion.scope === 'cross-page'))
      : /\b(?:all|every|only|unique|across all|across pages?|cross-page|each of the|both|two pages|three pages|four pages)\b|全站|所有|全部|唯一|每页|各页|跨页面|多页|两个页面|三页|四页|均采用|均使用/i.test(
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
  const schemaVersion = String(value.schemaVersion)
  if (schemaVersion !== '1' && schemaVersion !== '2') {
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
  value.schemaVersion = schemaVersion
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
  if (validIds.size === 0) {
    return { profile: null, status: 'failed', rejected: [...rejected, 'root:no-valid-evidence'] }
  }
  normalizeClaimTokenCitations(value, buildTokenEvidenceOwners(evidence, validIds))
  const evidenceScope = buildEvidenceScope(evidence)
  const availablePageCount = new Set(
    [...validIds]
      .map((evidenceId) => evidenceScope.pageUrlByEvidenceId.get(evidenceId))
      .filter((url): url is string => Boolean(url)),
  ).size
  const observedSectionRoles = new Set(
    evidence.sections
      .filter((section) => validIds.has(section.id) && section.role !== 'unknown')
      .map((section) => section.role),
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
  const fallbackProfile = buildEvidenceFallbackProfile(evidence, language, claimMode, 'Required AI claim was unusable')
  let requiredFallbackUsed = false
  const assertionDimensionForPath = (path: string): string => {
    if (path.startsWith('composition.')) return 'composition'
    if (path.startsWith('attention.')) return 'attention'
    if (path.startsWith('visualLanguage.')) return path.split('.')[1] || 'design-thesis'
    if (path.startsWith('interactionLanguage.')) return 'interaction'
    if (path.startsWith('transferRules.')) return 'transfer'
    return 'design-thesis'
  }
  const fallbackClaim = (claim: DesignClaim, preferredEvidence?: RegExp, path = 'thesis'): DesignClaim => {
    const preferred = [...validIds].filter((evidenceId) => preferredEvidence?.test(evidenceId))
    const evidenceIds = preferred.length > 0 ? preferred : [...validIds]
    const selectedEvidenceIds = evidenceIds.slice(0, 2)
    return {
      ...claim,
      confidence: 'low',
      evidence: selectedEvidenceIds.map((evidenceId) => ({
        evidenceId,
        note: coreT(language, 'intelligence.assertions.evidenceNote'),
      })),
      ...(schemaVersion === '2'
        ? {
            assertions: [
              {
                kind: 'evidence' as const,
                target: assertionDimensionForPath(path),
                predicate: 'supports',
                scope: 'instance' as const,
                evidenceIds: selectedEvidenceIds,
              },
            ],
          }
        : {}),
    }
  }
  const resolveRequiredClaim = (
    parent: Record<string, unknown>,
    key: string,
    path: string,
    fallback: DesignClaim,
    visualOnly = false,
    preferredEvidence?: RegExp,
  ): DesignClaim => {
    const claimPath = `${path}.${key}`
    const candidate = requiredClaim(
      parent,
      key,
      validIds,
      path,
      rejected,
      claimMode,
      visualOnly,
      knownColors,
      schemaVersion,
    )
    const validated = preferredEvidence
      ? requireEvidenceKind(candidate, preferredEvidence, `${path}.${key}`, rejected)
      : candidate
    if (validated) return validated
    requiredFallbackUsed = true
    return fallbackClaim(fallback, preferredEvidence, claimPath)
  }
  const thesisCandidate = validateClaim(
    value.thesis,
    validIds,
    'thesis',
    rejected,
    claimMode,
    false,
    knownColors,
    schemaVersion,
  )
  const thesis = thesisCandidate || fallbackClaim(fallbackProfile.thesis, undefined, 'thesis')
  if (!thesisCandidate) requiredFallbackUsed = true
  const signatureMoveInput = Array.isArray(value.signatureMoves) ? value.signatureMoves : []
  if (!Array.isArray(value.signatureMoves)) rejected.push('signatureMoves:not-an-array')
  let signatureMoves = signatureMoveInput.slice(0, 3).flatMap((candidate, index): SignatureMove[] => {
    if (!isRecord(candidate) || !isSafeText(candidate.id, 80) || !isSafeText(candidate.name, 100)) {
      rejected.push(`signatureMoves.${index}:invalid-identity`)
      return []
    }
    const claim = validateClaim(
      candidate,
      validIds,
      `signatureMoves.${index}`,
      rejected,
      claimMode,
      false,
      knownColors,
      schemaVersion,
    )
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
  if (signatureMoves.length === 0) {
    requiredFallbackUsed = true
    signatureMoves = markSignatureMovesAsCoverageRepair(fallbackProfile.signatureMoves, language).map((move) => ({
      ...move,
      ...fallbackClaim(move, undefined, 'signatureMoves'),
    }))
  }

  const compositionInput = isRecord(value.composition) ? value.composition : {}
  const attentionInput = isRecord(value.attention) ? value.attention : {}
  const visualLanguageInput = isRecord(value.visualLanguage) ? value.visualLanguage : {}
  const interactionLanguageInput = isRecord(value.interactionLanguage) ? value.interactionLanguage : {}
  const transferRulesInput = isRecord(value.transferRules) ? value.transferRules : {}
  if (
    !isRecord(value.composition) ||
    !isRecord(value.attention) ||
    !isRecord(value.visualLanguage) ||
    !isRecord(value.interactionLanguage) ||
    !isRecord(value.transferRules)
  ) {
    rejected.push('root:missing-required-groups')
  }
  const composition = {
    containerStrategy: resolveRequiredClaim(
      compositionInput,
      'containerStrategy',
      'composition',
      fallbackProfile.composition.containerStrategy,
      false,
      /^(?:image|section|layout)-/,
    ),
    alignmentStrategy: resolveRequiredClaim(
      compositionInput,
      'alignmentStrategy',
      'composition',
      fallbackProfile.composition.alignmentStrategy,
      false,
      /^(?:image|section|layout)-/,
    ),
    densityAndWhitespace: resolveRequiredClaim(
      compositionInput,
      'densityAndWhitespace',
      'composition',
      fallbackProfile.composition.densityAndWhitespace,
      false,
      /^(?:image|section|layout)-/,
    ),
    rhythm: resolveRequiredClaim(
      compositionInput,
      'rhythm',
      'composition',
      fallbackProfile.composition.rhythm,
      false,
      /^(?:image|section|layout)-/,
    ),
  }
  const attention = {
    entryPoint: resolveRequiredClaim(
      attentionInput,
      'entryPoint',
      'attention',
      fallbackProfile.attention.entryPoint,
      true,
    ),
    visualSequence: validateVisualSequenceClaims(
      attentionInput.visualSequence,
      validIds,
      'attention.visualSequence',
      rejected,
      claimMode,
      5,
      knownColors,
      schemaVersion,
    ),
    actionHierarchy: resolveRequiredClaim(
      attentionInput,
      'actionHierarchy',
      'attention',
      fallbackProfile.attention.actionHierarchy,
    ),
    contrastStrategy: resolveRequiredClaim(
      attentionInput,
      'contrastStrategy',
      'attention',
      fallbackProfile.attention.contrastStrategy,
    ),
  }
  const imagery = visualLanguageInput.imagery
    ? validateClaim(
        visualLanguageInput.imagery,
        validIds,
        'visualLanguage.imagery',
        rejected,
        claimMode,
        true,
        knownColors,
        schemaVersion,
      )
    : undefined
  if (imagery && noClassifiedMedia && imagery.confidence === 'high') imagery.confidence = 'medium'
  const visualLanguage = {
    color: resolveRequiredClaim(visualLanguageInput, 'color', 'visualLanguage', fallbackProfile.visualLanguage.color),
    typography: resolveRequiredClaim(
      visualLanguageInput,
      'typography',
      'visualLanguage',
      fallbackProfile.visualLanguage.typography,
    ),
    shape: resolveRequiredClaim(visualLanguageInput, 'shape', 'visualLanguage', fallbackProfile.visualLanguage.shape),
    surfaces: resolveRequiredClaim(
      visualLanguageInput,
      'surfaces',
      'visualLanguage',
      fallbackProfile.visualLanguage.surfaces,
    ),
    imagery,
    motion: visualLanguageInput.motion
      ? validateClaim(
          visualLanguageInput.motion,
          validIds,
          'visualLanguage.motion',
          rejected,
          claimMode,
          false,
          knownColors,
          schemaVersion,
        )
      : undefined,
  }

  const sectionGrammar = Array.isArray(value.sectionGrammar)
    ? value.sectionGrammar.slice(0, 12).flatMap((item, index) => {
        if (!isRecord(item) || !isSafeText(item.role, 80)) return []
        const role = normalizeSectionRole(item.role, schemaVersion)
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
          validateClaims(claims, validIds, path, rejected, claimMode, 5, false, knownColors, schemaVersion).filter(
            (claim) => {
              if (keepRoleEvidence(claim)) return true
              rejected.push(`${path}:mismatched-section-role`)
              return false
            },
          )
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
    interactionLanguageInput.feedbackStyle,
    validIds,
    interactionIds,
    activeInteractionIds,
    'interactionLanguage.feedbackStyle',
    rejected,
    claimMode,
    knownColors,
    schemaVersion,
  )
  const stateChangeAmplitude = validateInteractionClaim(
    interactionLanguageInput.stateChangeAmplitude,
    validIds,
    interactionIds,
    activeInteractionIds,
    'interactionLanguage.stateChangeAmplitude',
    rejected,
    claimMode,
    knownColors,
    schemaVersion,
  )
  const resolvedFeedbackStyle =
    feedbackStyle ||
    fallbackClaim(fallbackProfile.interactionLanguage.feedbackStyle, undefined, 'interactionLanguage.feedbackStyle')
  const resolvedStateChangeAmplitude =
    stateChangeAmplitude ||
    fallbackClaim(
      fallbackProfile.interactionLanguage.stateChangeAmplitude,
      undefined,
      'interactionLanguage.stateChangeAmplitude',
    )
  if (!feedbackStyle || !stateChangeAmplitude) requiredFallbackUsed = true

  const componentGrammar = Array.isArray(value.componentGrammar)
    ? value.componentGrammar.slice(0, 16).flatMap((item, index) => {
        if (!isRecord(item) || !isSafeText(item.component, 80) || !isSafeText(item.role, 120)) return []
        const componentType = normalizeComponentType(item.component, schemaVersion)
        const matchingEvidenceIds = new Set(
          evidence.components
            .filter((component) => normalizeComponentType(component.type, schemaVersion) === componentType)
            .map((component) => component.id),
        )
        if (matchingEvidenceIds.size === 0) {
          rejected.push(`componentGrammar.${index}:unobserved-component-type`)
          return []
        }
        const rules = validateClaims(
          item.rules,
          validIds,
          `componentGrammar.${index}.rules`,
          rejected,
          claimMode,
          8,
          false,
          knownColors,
          schemaVersion,
        ).filter((claim, ruleIndex) => {
          const citesMatchingComponent = claim.evidence.some((reference) =>
            matchingEvidenceIds.has(reference.evidenceId),
          )
          const hasMatchingAssertion =
            schemaVersion === '1' ||
            claim.assertions?.some((assertion) => assertion.kind === 'component' && assertion.target === componentType)
          if (citesMatchingComponent && hasMatchingAssertion) return true
          if (citesMatchingComponent) {
            rejected.push(`componentGrammar.${index}.rules.${ruleIndex}:missing-component-assertion`)
            return false
          }
          rejected.push(`componentGrammar.${index}.rules.${ruleIndex}:mismatched-component-type`)
          return false
        })
        if (rules.length === 0) return []
        return [
          {
            component: componentType.slice(0, 80),
            role: item.role.slice(0, 120),
            rules,
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
          schemaVersion,
        )
        if (singleViewport) {
          for (const rule of responsiveRules) {
            if (rule.confidence === 'high') rule.confidence = 'medium'
          }
        }
        if (schemaVersion === '1' && horizontalOverflowPageUrls.size > 0) {
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
              schemaVersion,
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
              schemaVersion,
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
              schemaVersion,
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
    schemaVersion,
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
        interactionLanguageInput.primaryDrivers,
        validIds,
        interactionIds,
        activeInteractionIds,
        'interactionLanguage.primaryDrivers',
        rejected,
        claimMode,
        5,
        knownColors,
        schemaVersion,
      ),
      feedbackStyle: resolvedFeedbackStyle,
      stateChangeAmplitude: resolvedStateChangeAmplitude,
      ...(interactionLanguageInput.scrollNarrative
        ? {
            scrollNarrative:
              validateInteractionClaim(
                interactionLanguageInput.scrollNarrative,
                validIds,
                interactionIds,
                activeInteractionIds,
                'interactionLanguage.scrollNarrative',
                rejected,
                claimMode,
                knownColors,
                schemaVersion,
              ) || undefined,
          }
        : {}),
      continuityRules: validateInteractionClaims(
        interactionLanguageInput.continuityRules,
        validIds,
        interactionIds,
        activeInteractionIds,
        'interactionLanguage.continuityRules',
        rejected,
        claimMode,
        6,
        knownColors,
        schemaVersion,
      ),
    },
    componentGrammar,
    ...(patterns.length > 0 ? { patterns } : {}),
    transferRules: {
      preserve: validateClaims(
        transferRulesInput.preserve,
        validIds,
        'transferRules.preserve',
        rejected,
        claimMode,
        6,
        false,
        knownColors,
        schemaVersion,
      ),
      adapt: validateClaims(
        transferRulesInput.adapt,
        validIds,
        'transferRules.adapt',
        rejected,
        claimMode,
        6,
        false,
        knownColors,
        schemaVersion,
      ),
      avoid: validateClaims(
        transferRulesInput.avoid,
        validIds,
        'transferRules.avoid',
        rejected,
        claimMode,
        6,
        false,
        knownColors,
        schemaVersion,
      ),
    },
    uncertainties: uncertainties.slice(0, 12),
  }

  const semanticGroundingGap =
    schemaVersion === '1' &&
    [
      groundColorClaims(profile, evidence, evidenceScope, rejected),
      groundOverflowClaims(profile, evidence, evidenceScope, rejected),
      validateVisibleFocusClaims(profile, evidence, rejected),
      validateInteractionClaimDetails(profile, evidence, evidenceScope, validIds, rejected),
    ].some(Boolean)

  let globalScopeGap = false
  const constrainGlobal = <T extends DesignClaim>(claim: T, path: string): T => {
    const constrained = capSinglePageGlobalClaim(claim, evidenceScope, availablePageCount, schemaVersion)
    if (claim.confidence !== 'low' && constrained.confidence === 'low') {
      globalScopeGap = true
      rejected.push(`${path}:unsupported-cross-page-scope`)
    }
    return constrained
  }
  profile.thesis = constrainGlobal(profile.thesis, 'thesis')
  profile.signatureMoves = profile.signatureMoves.map((claim, index) =>
    constrainGlobal(claim, `signatureMoves.${index}`),
  )
  for (const key of Object.keys(profile.composition) as Array<keyof DesignProfile['composition']>) {
    profile.composition[key] = constrainGlobal(profile.composition[key], `composition.${key}`)
  }
  profile.attention.actionHierarchy = constrainGlobal(profile.attention.actionHierarchy, 'attention.actionHierarchy')
  profile.attention.contrastStrategy = constrainGlobal(profile.attention.contrastStrategy, 'attention.contrastStrategy')
  profile.attention.visualSequence = profile.attention.visualSequence.map((claim, index) =>
    constrainGlobal(claim, `attention.visualSequence.${index}`),
  )
  for (const key of ['color', 'typography', 'shape', 'surfaces', 'imagery', 'motion'] as const) {
    const claim = profile.visualLanguage[key]
    if (claim) profile.visualLanguage[key] = constrainGlobal(claim, `visualLanguage.${key}`)
  }
  for (const [grammarIndex, grammar] of profile.sectionGrammar.entries()) {
    grammar.composition = grammar.composition.map((claim, index) =>
      constrainGlobal(claim, `sectionGrammar.${grammarIndex}.composition.${index}`),
    )
    grammar.contentRhythm = grammar.contentRhythm.map((claim, index) =>
      constrainGlobal(claim, `sectionGrammar.${grammarIndex}.contentRhythm.${index}`),
    )
    grammar.transitionToNext = grammar.transitionToNext.map((claim, index) =>
      constrainGlobal(claim, `sectionGrammar.${grammarIndex}.transitionToNext.${index}`),
    )
  }
  for (const [grammarIndex, grammar] of profile.componentGrammar.entries()) {
    grammar.rules = grammar.rules.map((claim, index) =>
      constrainGlobal(claim, `componentGrammar.${grammarIndex}.rules.${index}`),
    )
  }
  for (const kind of ['preserve', 'adapt', 'avoid'] as const) {
    profile.transferRules[kind] = profile.transferRules[kind].map((claim, index) =>
      constrainGlobal(claim, `transferRules.${kind}.${index}`),
    )
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
  let criticalCoverageGap = false
  if (profile.attention.visualSequence.length === 0) {
    rejected.push('attention.visualSequence:empty')
    criticalCoverageGap = evidence.sections.length > 0
  }
  if (profile.sectionGrammar.length === 0) {
    rejected.push('sectionGrammar:empty')
    criticalCoverageGap ||= evidence.sections.length > 0
  }
  if (profile.componentGrammar.length === 0) {
    rejected.push('componentGrammar:empty')
    criticalCoverageGap ||= evidence.components.length > 0
  }
  if (profile.interactionLanguage.primaryDrivers.length === 0) {
    rejected.push('interactionLanguage.primaryDrivers:empty')
    criticalCoverageGap ||=
      evidence.interactionObservations.length > 0 ||
      evidence.interactionStyles.hover.length > 0 ||
      evidence.interactionStyles.focus.length > 0 ||
      evidence.interactionStyles.active.length > 0
  }
  for (const kind of ['preserve', 'adapt', 'avoid'] as const) {
    if (profile.transferRules[kind].length === 0) {
      rejected.push(`transferRules.${kind}:empty`)
      criticalCoverageGap = true
    }
  }
  return {
    profile,
    status:
      requiredFallbackUsed ||
      imageObservationsValid === false ||
      criticalCoverageGap ||
      semanticGroundingGap ||
      globalScopeGap
        ? 'partial'
        : 'complete',
    rejected,
    imageObservationsValid,
  }
}
