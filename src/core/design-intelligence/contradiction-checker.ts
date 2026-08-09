import { normalizeColorValue } from '../analyzer/color-cluster.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import type { DesignClaim, DesignProfile } from './types.js'

export interface ContradictionCheckResult {
  profile: DesignProfile
  rejected: string[]
}

const CSS_LENGTH = /-?\d+(?:\.\d+)?(?:px|rem|em)\b/gi
const FONT_WEIGHT = /\b(?:font[- ]?weight|字重)\D{0,12}(\d{3})\b/gi
const MAXIMUM_WORD = /\b(?:max(?:imum)?|highest|largest)\b|最大|最高/i
const MINIMUM_WORD = /\b(?:min(?:imum)?|lowest|smallest)\b|最小|最低/i
const RANGE_WORD = /\b(?:range|from\s+\d+\s+to|between\s+\d+\s+and)\b|范围|从\s*\d+\s*到/i
const ONLY_COUNT = /\b(?:only|exactly)\s+(\d+)\s+(?:font\s*)?weights?\b|(?:仅有|只有|恰好)\s*(\d+)\s*种?字重/i
const COLOR_LITERAL = /#[\da-f]{3,8}\b|rgba?\([^)]+\)/gi

function normalizeLength(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.endsWith('px')) return `${Number.parseFloat(normalized) / 16}rem`
  if (normalized.endsWith('em')) return `${Number.parseFloat(normalized)}rem`
  return normalized
}

function claimText(claim: DesignClaim): string {
  return `${claim.statement} ${claim.implementation}`
}

function numericLength(value: string): number | null {
  const normalized = normalizeLength(value)
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)rem$/)
  return match ? Number.parseFloat(match[1]) : null
}

function boundaryMismatch(text: string, values: number[], mentioned: number[]): string | null {
  if (values.length === 0 || mentioned.length === 0) return null
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  if (MAXIMUM_WORD.test(text) && !mentioned.includes(maximum)) return `maximum(${mentioned.join(',')}!=${maximum})`
  if (MINIMUM_WORD.test(text) && !mentioned.includes(minimum)) return `minimum(${mentioned.join(',')}!=${minimum})`
  if (RANGE_WORD.test(text) && (Math.min(...mentioned) !== minimum || Math.max(...mentioned) !== maximum)) {
    return `range(${Math.min(...mentioned)}-${Math.max(...mentioned)}!=${minimum}-${maximum})`
  }
  return null
}

function colorRolesByValue(evidence: DesignEvidence): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const [name, value] of Object.entries(evidence.tokens.colors)) {
    const normalized = normalizeColorValue(value)
    if (!normalized) continue
    const roles = result.get(normalized) || new Set<string>()
    const sources = evidence.tokens.evidence?.[`colors.${name}`]?.sources || []
    for (const source of sources) {
      if (/primary-action|action|selected|link|accent|brand/i.test(source)) roles.add('action')
      if (/rendered:text|textColor|text/i.test(source)) roles.add('text')
      if (/bgArea|bgColor|background|surface/i.test(source)) roles.add('background')
      if (/border/i.test(source)) roles.add('border')
    }
    result.set(normalized, roles)
  }
  return result
}

function assertedColorRole(context: string): string | null {
  if (/\b(?:text|foreground)\s+colou?r\b|文字色|文本色|前景色/i.test(context)) return 'text'
  if (/\b(?:background|surface)\s+colou?r\b|背景色|表面色/i.test(context)) return 'background'
  if (/\bborder\s+colou?r\b|边框色/i.test(context)) return 'border'
  if (/\b(?:action|button|link|accent)\s+colou?r\b|操作色|按钮色|链接色|强调色/i.test(context)) return 'action'
  return null
}

function colorRoleMismatch(text: string, rolesByValue: Map<string, Set<string>>): string | null {
  for (const match of text.matchAll(COLOR_LITERAL)) {
    const normalized = normalizeColorValue(match[0])
    if (!normalized) continue
    const start = Math.max(0, (match.index || 0) - 48)
    const context = text.slice(start, (match.index || 0) + match[0].length + 48)
    const asserted = assertedColorRole(context)
    const observed = rolesByValue.get(normalized)
    if (asserted && observed && observed.size > 0 && !observed.has(asserted)) {
      return `${normalized}:${asserted}!=${[...observed].sort().join('|')}`
    }
  }
  return null
}

function replacementClaim(claim: DesignClaim, language: DesignProfile['language']): DesignClaim {
  return {
    statement:
      language === 'zh-CN'
        ? '该规则的精确边界未被确定性证据支持。'
        : 'The exact boundary of this rule is not supported by deterministic evidence.',
    implementation:
      language === 'zh-CN'
        ? '仅使用已提取的令牌值和用途，并在实现前复核该规则。'
        : 'Use only extracted token values and observed roles, then verify this rule before implementation.',
    confidence: 'low',
    evidence: claim.evidence.slice(0, 2),
    ...(claim.tokenRefs && claim.tokenRefs.length > 0 ? { tokenRefs: claim.tokenRefs } : {}),
  }
}

export function checkProfileContradictions(
  inputProfile: DesignProfile,
  evidence: DesignEvidence,
): ContradictionCheckResult {
  const profile = structuredClone(inputProfile)
  const rejected: string[] = []
  const hardRejectedClaims = new WeakSet<object>()
  const knownTokenRefs = new Set([
    ...evidence.sections.flatMap((section) => section.tokenRefs),
    ...evidence.components.flatMap((component) => component.tokenRefs),
    ...evidence.layoutNodes.flatMap((node) => node.tokenRefs),
  ])
  const knownLengths = {
    typography: new Set(
      [
        ...evidence.tokens.typography.fontSizes,
        ...evidence.tokens.typography.lineHeights,
        ...evidence.tokens.typography.letterSpacings,
      ].map(normalizeLength),
    ),
    spacing: new Set(evidence.tokens.spacing.map(normalizeLength)),
    radius: new Set(evidence.tokens.radii.map(normalizeLength)),
  }
  const knownWeights = new Set(evidence.tokens.typography.fontWeights.map((value) => value.trim()))
  const knownWeightValues = [...knownWeights].map(Number).filter(Number.isFinite)
  const rolesByColor = colorRolesByValue(evidence)
  const pageByEvidenceId = new Map<string, DesignEvidence['pages'][number]>()
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const sectionById = new Map(evidence.sections.map((section) => [section.id, section]))
  for (const page of evidence.pages) {
    pageByEvidenceId.set(page.id, page)
    page.images.forEach((image) => pageByEvidenceId.set(image.id, page))
  }
  for (const section of evidence.sections) pageByEvidenceId.set(section.id, pageById.get(section.pageId)!)
  for (const component of evidence.components) {
    const section = sectionById.get(component.sectionId)
    if (section) pageByEvidenceId.set(component.id, pageById.get(section.pageId)!)
  }
  for (const node of evidence.layoutNodes) {
    const section = sectionById.get(node.sectionId)
    if (section) pageByEvidenceId.set(node.id, pageById.get(section.pageId)!)
  }
  for (const observation of [...evidence.interactionObservations, ...evidence.responsiveObservations]) {
    const section = sectionById.get(observation.sectionId)
    if (section) pageByEvidenceId.set(observation.id, pageById.get(section.pageId)!)
  }
  const activeInteractionIds = new Set(
    evidence.interactionObservations
      .filter((observation) => observation.safety === 'safe-active')
      .map((observation) => observation.id),
  )
  const responsiveIds = new Set(evidence.responsiveObservations.map((observation) => observation.id))

  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`))
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const isClaim =
      typeof record.statement === 'string' &&
      typeof record.implementation === 'string' &&
      typeof record.confidence === 'string' &&
      Array.isArray(record.evidence)
    if (isClaim) {
      const claim = record as unknown as DesignClaim
      const text = claimText(claim)
      const hardReject = (reason: string) => {
        hardRejectedClaims.add(record)
        rejected.push(`${path}:${reason}`)
      }
      if (claim.tokenRefs) {
        const filtered = claim.tokenRefs.filter((tokenRef) => knownTokenRefs.has(tokenRef))
        if (filtered.length !== claim.tokenRefs.length) rejected.push(`${path}:unknown-token-ref`)
        claim.tokenRefs = filtered
      }

      const lengthContext = /font|type|line.?height|letter.?spacing|字号|字体|行高|字距/i.test(text)
        ? knownLengths.typography
        : /radius|rounded|corner|圆角/i.test(text)
          ? knownLengths.radius
          : /spacing|gap|padding|margin|rhythm|间距|留白|边距/i.test(text)
            ? knownLengths.spacing
            : null
      if (lengthContext) {
        const unknown = [...text.matchAll(CSS_LENGTH)]
          .map((match) => match[0])
          .find((value) => !lengthContext.has(normalizeLength(value)))
        if (unknown) {
          hardReject(`numeric-value-not-in-token-set(${unknown})`)
        } else {
          const mentioned = [...text.matchAll(CSS_LENGTH)]
            .map((match) => numericLength(match[0]))
            .filter((value): value is number => value !== null)
          const actual = [...lengthContext].map(numericLength).filter((value): value is number => value !== null)
          const mismatch = boundaryMismatch(text, actual, mentioned)
          if (mismatch) hardReject(`numeric-boundary-contradiction(${mismatch})`)
        }
      }
      const mentionsFontWeight = /font[- ]?weights?|字重/i.test(text)
      const mentionedWeights = mentionsFontWeight
        ? [...text.matchAll(/\b[1-9]00\b/g)].map((match) => Number(match[0]))
        : [...text.matchAll(FONT_WEIGHT)].map((match) => Number(match[1]))
      const unknownWeight = mentionedWeights.find((weight) => !knownWeights.has(String(weight)))
      if (unknownWeight) {
        hardReject(`font-weight-not-in-token-set(${unknownWeight})`)
      } else if (mentionsFontWeight) {
        const mismatch = boundaryMismatch(text, knownWeightValues, mentionedWeights)
        const onlyCount = text.match(ONLY_COUNT)
        if (mismatch) hardReject(`font-weight-boundary-contradiction(${mismatch})`)
        if (onlyCount && Number(onlyCount[1] || onlyCount[2]) !== knownWeightValues.length) {
          hardReject(`font-weight-count-contradiction(${onlyCount[1] || onlyCount[2]}!=${knownWeightValues.length})`)
        }
      }
      const roleMismatch = colorRoleMismatch(text, rolesByColor)
      if (roleMismatch) hardReject(`color-role-contradiction(${roleMismatch})`)

      const referencedPages = claim.evidence
        .map((reference) => pageByEvidenceId.get(reference.evidenceId))
        .filter((page): page is DesignEvidence['pages'][number] => Boolean(page))
      const referencesOverflow = referencedPages.some((page) => page.horizontalOverflow)
      const referencesResponsive = claim.evidence.some((reference) => responsiveIds.has(reference.evidenceId))
      if (
        referencesOverflow &&
        !referencesResponsive &&
        /\b(?:reflows?|stacks?|hides?|collapses?|fits?|responsive)\b|重排|堆叠|隐藏|收起|响应式适配/i.test(text)
      ) {
        hardReject('overflow-does-not-prove-reflow')
      }

      const assertsExecutedInteraction =
        /\b(?:clicked|after click|expanded|toggled|opened|closed|navigated)\b|点击后|展开后|切换后|打开后|关闭后|跳转后/i.test(
          text,
        )
      const hasActiveInteraction = claim.evidence.some((reference) => activeInteractionIds.has(reference.evidenceId))
      if (assertsExecutedInteraction && !hasActiveInteraction) {
        hardReject('passive-evidence-cannot-prove-executed-interaction')
      }
      if (
        evidence.source.accessMode === 'managed' &&
        /\b(?:logged out|guest page|login wall|authentication wall)\b|未登录|游客页|登录墙/i.test(text)
      ) {
        hardReject('managed-access-contradiction')
      }
      if (/dark-palette-\d+\D{0,20}(?:equals|matches|corresponds|对应|等同)\D{0,20}palette-\d+/i.test(text)) {
        hardReject('dark-palette-index-assumption')
      }
    }
    Object.entries(record).forEach(([key, item]) => {
      if (!isClaim || !['statement', 'implementation', 'confidence', 'evidence', 'tokenRefs'].includes(key)) {
        visit(item, path ? `${path}.${key}` : key)
      }
    })
  }

  visit(profile, '')
  const prune = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const item = value[index]
        if (item && typeof item === 'object' && hardRejectedClaims.has(item)) value.splice(index, 1)
        else prune(item)
      }
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    for (const [key, item] of Object.entries(record)) {
      if (item && typeof item === 'object' && hardRejectedClaims.has(item)) {
        if (['imagery', 'motion', 'scrollNarrative'].includes(key)) delete record[key]
        else record[key] = replacementClaim(item as DesignClaim, profile.language)
      } else {
        prune(item)
      }
    }
  }
  prune(profile)
  for (const reason of rejected.slice(0, 8)) {
    profile.uncertainties.push({
      topic: profile.language === 'zh-CN' ? '确定性矛盾检查' : 'Deterministic contradiction check',
      reason,
    })
  }
  profile.uncertainties = profile.uncertainties.slice(0, 12)
  return { profile, rejected }
}
