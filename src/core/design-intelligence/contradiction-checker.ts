import type { DesignEvidence } from '../design-evidence/types.js'
import type { Confidence, DesignClaim, DesignProfile } from './types.js'

export interface ContradictionCheckResult {
  profile: DesignProfile
  rejected: string[]
}

const CSS_LENGTH = /-?\d+(?:\.\d+)?(?:px|rem|em)\b/gi
const FONT_WEIGHT = /\b(?:font[- ]?weight|字重)\D{0,12}(\d{3})\b/gi

function normalizeLength(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.endsWith('px')) return `${Number.parseFloat(normalized) / 16}rem`
  if (normalized.endsWith('em')) return `${Number.parseFloat(normalized)}rem`
  return normalized
}

function claimText(claim: DesignClaim): string {
  return `${claim.statement} ${claim.implementation}`
}

function downgrade(confidence: Confidence): Confidence {
  return confidence === 'high' ? 'medium' : 'low'
}

export function checkProfileContradictions(
  inputProfile: DesignProfile,
  evidence: DesignEvidence,
): ContradictionCheckResult {
  const profile = structuredClone(inputProfile)
  const rejected: string[] = []
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
          claim.confidence = 'low'
          rejected.push(`${path}:numeric-value-not-in-token-set(${unknown})`)
        }
      }
      const unknownWeight = [...text.matchAll(FONT_WEIGHT)]
        .map((match) => match[1])
        .find((weight) => !knownWeights.has(weight))
      if (unknownWeight) {
        claim.confidence = 'low'
        rejected.push(`${path}:font-weight-not-in-token-set(${unknownWeight})`)
      }

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
        claim.confidence = 'low'
        rejected.push(`${path}:overflow-does-not-prove-reflow`)
      }

      const assertsExecutedInteraction =
        /\b(?:clicked|after click|expanded|toggled|opened|closed|navigated)\b|点击后|展开后|切换后|打开后|关闭后|跳转后/i.test(
          text,
        )
      const hasActiveInteraction = claim.evidence.some((reference) => activeInteractionIds.has(reference.evidenceId))
      if (assertsExecutedInteraction && !hasActiveInteraction) {
        claim.confidence = 'low'
        rejected.push(`${path}:passive-evidence-cannot-prove-executed-interaction`)
      }
      if (
        evidence.source.accessMode === 'managed' &&
        /\b(?:logged out|guest page|login wall|authentication wall)\b|未登录|游客页|登录墙/i.test(text)
      ) {
        claim.confidence = 'low'
        rejected.push(`${path}:managed-access-contradiction`)
      }
      if (/dark-palette-\d+\D{0,20}(?:equals|matches|corresponds|对应|等同)\D{0,20}palette-\d+/i.test(text)) {
        claim.confidence = downgrade(claim.confidence)
        rejected.push(`${path}:dark-palette-index-assumption`)
      }
    }
    Object.entries(record).forEach(([key, item]) => {
      if (!isClaim || !['statement', 'implementation', 'confidence', 'evidence', 'tokenRefs'].includes(key)) {
        visit(item, path ? `${path}.${key}` : key)
      }
    })
  }

  visit(profile, '')
  for (const reason of rejected.slice(0, 8)) {
    profile.uncertainties.push({
      topic: profile.language === 'zh-CN' ? '确定性矛盾检查' : 'Deterministic contradiction check',
      reason,
    })
  }
  profile.uncertainties = profile.uncertainties.slice(0, 12)
  return { profile, rejected }
}
