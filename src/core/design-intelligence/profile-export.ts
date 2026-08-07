import type { DesignClaim, DesignProfile } from './types.js'

export function generateDesignProfileJson(profile: DesignProfile): string {
  return JSON.stringify(profile, null, 2)
}

function claimLines(
  title: string,
  claims: Array<DesignClaim & { label?: string }>,
  labels: { confidence: string; evidence: string; tokens: string },
) {
  if (claims.length === 0) return []
  return [
    `### ${title}`,
    '',
    ...claims.flatMap((claim) => [
      `- ${claim.label ? `**${claim.label}:** ` : ''}${claim.statement}`,
      `  - ${claim.implementation}`,
      `  - ${labels.confidence}: ${claim.confidence}`,
      `  - ${labels.evidence}: ${claim.evidence.map((reference) => `\`${reference.evidenceId}\``).join(', ')}`,
      ...(claim.tokenRefs && claim.tokenRefs.length > 0
        ? [`  - ${labels.tokens}: ${claim.tokenRefs.map((reference) => `\`${reference}\``).join(', ')}`]
        : []),
    ]),
    '',
  ]
}

export function generateDesignProfileMarkdown(profile: DesignProfile): string {
  const zh = profile.language === 'zh-CN'
  const labels = {
    confidence: zh ? '置信度' : 'Confidence',
    evidence: zh ? '证据' : 'Evidence',
    tokens: zh ? 'Token 引用' : 'Token refs',
  }
  return [
    zh ? '## AI 设计解读' : '## AI Design Insights',
    '',
    zh
      ? '> 层级：Inferred / 已推断。以下主张来自经校验的证据综合，不代表原设计师的真实意图。'
      : '> Layer: Inferred. These claims synthesize validated evidence and do not assert the original designer’s intent.',
    '',
    `**${zh ? '输入模式' : 'Input mode'}:** \`${profile.inputMode}\``,
    '',
    ...claimLines(zh ? '设计主张' : 'Design Thesis', [profile.thesis], labels),
    ...claimLines(
      zh ? '标志性手法' : 'Signature Moves',
      profile.signatureMoves.map((move) => ({
        ...move,
        label: move.name,
      })),
      labels,
    ),
    ...claimLines(
      zh ? '构图方式' : 'Composition',
      Object.entries(profile.composition).map(([label, claim]) => ({
        ...claim,
        label,
      })),
      labels,
    ),
    ...claimLines(
      zh ? '注意力层级' : 'Attention Hierarchy',
      [
        { ...profile.attention.entryPoint, label: 'entryPoint' },
        ...profile.attention.visualSequence.map((claim, index) => ({
          ...claim,
          label: `visualSequence.${index + 1}`,
        })),
        { ...profile.attention.actionHierarchy, label: 'actionHierarchy' },
        { ...profile.attention.contrastStrategy, label: 'contrastStrategy' },
      ],
      labels,
    ),
    ...claimLines(
      zh ? '视觉语言' : 'Visual Language',
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
    ),
    ...claimLines(
      zh ? '交互语言' : 'Interaction Language',
      [
        ...profile.interactionLanguage.primaryDrivers.map((claim, index) => ({
          ...claim,
          label: `primaryDriver.${index + 1}`,
        })),
        { ...profile.interactionLanguage.feedbackStyle, label: 'feedbackStyle' },
        { ...profile.interactionLanguage.stateChangeAmplitude, label: 'stateChangeAmplitude' },
        ...(profile.interactionLanguage.scrollNarrative
          ? [{ ...profile.interactionLanguage.scrollNarrative, label: 'scrollNarrative' }]
          : []),
        ...profile.interactionLanguage.continuityRules.map((claim, index) => ({
          ...claim,
          label: `continuity.${index + 1}`,
        })),
      ],
      labels,
    ),
    ...profile.sectionGrammar.flatMap((section) =>
      claimLines(
        `${zh ? '区块语法' : 'Section Grammar'} · ${section.role}`,
        [
          ...section.composition.map((claim) => ({ ...claim, label: 'composition' })),
          ...section.contentRhythm.map((claim) => ({ ...claim, label: 'contentRhythm' })),
          ...section.transitionToNext.map((claim) => ({ ...claim, label: 'transitionToNext' })),
        ],
        labels,
      ),
    ),
    ...profile.componentGrammar.flatMap((component) =>
      claimLines(
        `${zh ? '组件语法' : 'Component Grammar'} · ${component.component}`,
        component.rules.map((claim) => ({
          ...claim,
          label: component.role,
        })),
        labels,
      ),
    ),
    ...(profile.patterns || []).flatMap((pattern) =>
      claimLines(
        `${zh ? '可迁移模式' : 'Transferable Pattern'} · ${pattern.name}`,
        [
          ...pattern.structureRules.map((claim) => ({ ...claim, label: 'structure' })),
          ...pattern.visualRules.map((claim) => ({ ...claim, label: 'visual' })),
          ...pattern.interactionRules.map((claim) => ({ ...claim, label: 'interaction' })),
          ...pattern.responsiveRules.map((claim) => ({ ...claim, label: 'responsive' })),
        ],
        labels,
      ),
    ),
    ...claimLines(zh ? '必须保持' : 'Preserve', profile.transferRules.preserve, labels),
    ...claimLines(zh ? '可以适配' : 'Adapt', profile.transferRules.adapt, labels),
    ...claimLines(zh ? '必须避免' : 'Avoid', profile.transferRules.avoid, labels),
    ...(profile.tokenAliases && profile.tokenAliases.length > 0
      ? [
          `### ${zh ? '建议 Token 别名' : 'Suggested Token Aliases'}`,
          '',
          ...profile.tokenAliases.map((alias) => `- \`${alias.tokenId}\` → \`${alias.name}\``),
          '',
        ]
      : []),
    ...(profile.uncertainties.length > 0
      ? [
          `### ${zh ? '不确定性' : 'Uncertainties'}`,
          '',
          ...profile.uncertainties.map((item) => `- ${item.topic}: ${item.reason}`),
          '',
        ]
      : []),
  ].join('\n')
}
