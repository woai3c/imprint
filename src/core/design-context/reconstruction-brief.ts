import type { DesignToken } from '../analyzer/types.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import type { DesignClaim, DesignContextMeta, DesignProfile } from './types.js'

export type ReconstructionBriefIneligibilityReason =
  'no-profile' | 'low-confidence-thesis' | 'preserve-directive-missing' | 'avoid-directive-missing'

export type ReconstructionBriefEligibility =
  { eligible: true; status: 'complete' } | { eligible: false; reason: ReconstructionBriefIneligibilityReason }

function claimLine(claim: DesignClaim): string {
  return `- ${claim.implementation} [${claim.confidence}; ${[
    ...claim.evidence.map((item) => item.evidenceId),
    ...(claim.tokenRefs || []),
  ].join(', ')}]`
}

function labeledClaimLine(label: string, claim: DesignClaim): string {
  return `- **${label}:** ${claim.implementation} [${claim.confidence}; ${[
    ...claim.evidence.map((item) => item.evidenceId),
    ...(claim.tokenRefs || []),
  ].join(', ')}]`
}

// The brief is actionable guidance for coding agents; low-confidence claims are noise there.
const solid = <T extends DesignClaim>(claims: T[]): T[] => claims.filter((claim) => claim.confidence !== 'low')

const solidLine = (claim: DesignClaim, render: (claim: DesignClaim) => string): string[] =>
  claim.confidence === 'low' ? [] : [render(claim)]

export function getReconstructionBriefEligibility(
  profile: DesignProfile | null | undefined,
  meta: Pick<DesignContextMeta, 'status' | 'capabilityLevel'>,
): ReconstructionBriefEligibility {
  if (!profile) return { eligible: false, reason: 'no-profile' }
  if (profile.thesis.confidence === 'low') {
    return { eligible: false, reason: 'low-confidence-thesis' }
  }
  if (solid(profile.transferRules.preserve).length === 0) {
    return { eligible: false, reason: 'preserve-directive-missing' }
  }
  if (solid(profile.transferRules.avoid).length === 0) {
    return { eligible: false, reason: 'avoid-directive-missing' }
  }
  return { eligible: true, status: meta.status }
}

export function reconstructionBriefUnavailableMessage(reason: ReconstructionBriefIneligibilityReason): string {
  switch (reason) {
    case 'no-profile':
      return 'Reconstruction export requires a deterministic design profile.'
    case 'low-confidence-thesis':
      return 'Reconstruction export is unavailable because the design thesis has low confidence.'
    case 'preserve-directive-missing':
      return 'Reconstruction export is unavailable because the profile has no reliable preserve directive.'
    case 'avoid-directive-missing':
      return 'Reconstruction export is unavailable because the profile has no reliable avoid directive.'
  }
}

export function generateReconstructionBrief(
  profile: DesignProfile | null | undefined,
  evidence: DesignEvidence,
  tokens: DesignToken,
  meta: DesignContextMeta,
): string | null {
  const eligibility = getReconstructionBriefEligibility(profile, meta)
  if (!eligibility.eligible || !profile) return null

  const zh = profile.language === 'zh-CN'
  const lines: string[] = [
    zh ? '# 重构简报' : '# Reconstruction Brief',
    '',
    zh
      ? '为新的 UI 延续已推断出的设计语言；不要复制来源页面、文案、Logo 或媒体资产。'
      : 'Extend the inferred design language into a new UI; do not copy source pages, text, logos, or media assets.',
    '',
    zh ? '## 设计主张' : '## Design Thesis',
    '',
    profile.thesis.statement,
    profile.thesis.implementation,
    '',
    zh ? '## 标志性手法' : '## Signature Moves',
    '',
    ...solid(profile.signatureMoves).map((move) => `- **${move.name}:** ${move.implementation}`),
    '',
    zh ? '## 构图与注意力' : '## Composition and Attention',
    '',
    ...Object.entries(profile.composition).flatMap(([label, claim]) =>
      solidLine(claim, (item) => labeledClaimLine(label, item)),
    ),
    ...solidLine(profile.attention.entryPoint, (claim) => labeledClaimLine('entryPoint', claim)),
    ...solid(profile.attention.visualSequence).map((claim, index) =>
      labeledClaimLine(`visualSequence${index + 1}`, claim),
    ),
    ...solidLine(profile.attention.actionHierarchy, (claim) => labeledClaimLine('actionHierarchy', claim)),
    ...solidLine(profile.attention.contrastStrategy, (claim) => labeledClaimLine('contrastStrategy', claim)),
    '',
    zh ? '## 区块与组件语法' : '## Section and Component Grammar',
    '',
    ...profile.sectionGrammar.slice(0, 8).flatMap((section) =>
      solid([...section.composition, ...section.contentRhythm, ...section.transitionToNext])
        .slice(0, 4)
        .map((claim) => labeledClaimLine(section.role, claim)),
    ),
    ...profile.componentGrammar.slice(0, 10).flatMap((component) =>
      solid(component.rules)
        .slice(0, 4)
        .map((claim) => labeledClaimLine(`${component.component} / ${component.role}`, claim)),
    ),
    ...(profile.patterns || []).slice(0, 6).flatMap((pattern) =>
      solid([
        ...pattern.structureRules,
        ...pattern.visualRules,
        ...pattern.interactionRules,
        ...pattern.responsiveRules,
      ])
        .slice(0, 4)
        .map((claim) => labeledClaimLine(pattern.name, claim)),
    ),
    '',
    zh ? '## 交互语言' : '## Interaction Language',
    '',
    ...solid(profile.interactionLanguage.primaryDrivers).map(claimLine),
    ...solidLine(profile.interactionLanguage.feedbackStyle, claimLine),
    ...solidLine(profile.interactionLanguage.stateChangeAmplitude, claimLine),
    ...(profile.interactionLanguage.scrollNarrative
      ? solidLine(profile.interactionLanguage.scrollNarrative, claimLine)
      : []),
    ...solid(profile.interactionLanguage.continuityRules).map(claimLine),
    '',
    zh ? '## 必须保持' : '## Preserve',
    '',
    ...solid(profile.transferRules.preserve).map(claimLine),
    '',
    zh ? '## 可以适配' : '## Adapt',
    '',
    ...solid(profile.transferRules.adapt).map(claimLine),
    '',
    zh ? '## 必须避免' : '## Avoid',
    '',
    ...solid(profile.transferRules.avoid).map(claimLine),
    '',
    zh ? '## 实现值' : '## Implementation Values',
    '',
    '```json',
    JSON.stringify(
      {
        colors: tokens.colors,
        typography: tokens.typography,
        spacing: tokens.spacing,
        radii: tokens.radii,
        shadows: tokens.shadows,
        cssVariables: {
          ...Object.fromEntries(Object.entries(tokens.colors).map(([name, value]) => [`--color-${name}`, value])),
          ...Object.fromEntries(tokens.spacing.map((value, index) => [`--spacing-${index + 1}`, value])),
          ...Object.fromEntries(tokens.radii.map((value, index) => [`--radius-${index + 1}`, value])),
        },
      },
      null,
      2,
    ),
    '```',
    '',
    zh ? '## 响应式要求' : '## Responsive Requirements',
    '',
    ...evidence.responsiveObservations
      .slice(0, 12)
      .map(
        (observation) =>
          `- ${observation.fromViewport} → ${observation.toViewport}: ${observation.changeType} (${observation.changedProperties.join(', ')})`,
      ),
    '',
    zh ? '## 限制' : '## Limitations',
    '',
    `- ${zh ? '输入模式' : 'Input mode'}: ${profile.inputMode}`,
    ...profile.uncertainties.map((item) => `- ${item.topic}: ${item.reason}`),
    ...evidence.limitations.map((item) => `- ${item}`),
    '',
    zh
      ? '推荐同时提供：本简报、完整 DESIGN.md，以及当前待修改 UI 的截图或源代码。'
      : 'Provide this brief with the full DESIGN.md and the current UI screenshot or source code.',
  ]
  return lines.join('\n')
}
