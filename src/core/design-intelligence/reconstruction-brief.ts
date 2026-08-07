import type { DesignToken } from '../analyzer/types.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import type { DesignClaim, DesignProfile } from './types.js'

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

export function generateReconstructionBrief(
  profile: DesignProfile,
  evidence: DesignEvidence,
  tokens: DesignToken,
): string {
  const zh = profile.language === 'zh-CN'
  const lines: string[] = [
    zh ? '# AI 重构简报' : '# AI Reconstruction Brief',
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
    ...profile.signatureMoves.map((move) => `- **${move.name}:** ${move.implementation}`),
    '',
    zh ? '## 构图与注意力' : '## Composition and Attention',
    '',
    ...Object.entries(profile.composition).map(([label, claim]) => labeledClaimLine(label, claim)),
    labeledClaimLine('entryPoint', profile.attention.entryPoint),
    ...profile.attention.visualSequence.map((claim, index) => labeledClaimLine(`visualSequence${index + 1}`, claim)),
    labeledClaimLine('actionHierarchy', profile.attention.actionHierarchy),
    labeledClaimLine('contrastStrategy', profile.attention.contrastStrategy),
    '',
    zh ? '## 区块与组件语法' : '## Section and Component Grammar',
    '',
    ...profile.sectionGrammar
      .slice(0, 8)
      .flatMap((section) =>
        [...section.composition, ...section.contentRhythm, ...section.transitionToNext]
          .slice(0, 4)
          .map((claim) => labeledClaimLine(section.role, claim)),
      ),
    ...profile.componentGrammar
      .slice(0, 10)
      .flatMap((component) =>
        component.rules
          .slice(0, 4)
          .map((claim) => labeledClaimLine(`${component.component} / ${component.role}`, claim)),
      ),
    ...(profile.patterns || [])
      .slice(0, 6)
      .flatMap((pattern) =>
        [...pattern.structureRules, ...pattern.visualRules, ...pattern.interactionRules, ...pattern.responsiveRules]
          .slice(0, 4)
          .map((claim) => labeledClaimLine(pattern.name, claim)),
      ),
    '',
    zh ? '## 交互语言' : '## Interaction Language',
    '',
    ...profile.interactionLanguage.primaryDrivers.map(claimLine),
    claimLine(profile.interactionLanguage.feedbackStyle),
    claimLine(profile.interactionLanguage.stateChangeAmplitude),
    ...(profile.interactionLanguage.scrollNarrative ? [claimLine(profile.interactionLanguage.scrollNarrative)] : []),
    ...profile.interactionLanguage.continuityRules.map(claimLine),
    '',
    zh ? '## 必须保持' : '## Preserve',
    '',
    ...profile.transferRules.preserve.map(claimLine),
    '',
    zh ? '## 可以适配' : '## Adapt',
    '',
    ...profile.transferRules.adapt.map(claimLine),
    '',
    zh ? '## 必须避免' : '## Avoid',
    '',
    ...profile.transferRules.avoid.map(claimLine),
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
