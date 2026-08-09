import type { DesignToken } from '../analyzer/types.js'
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

function claimLines(
  title: string,
  claims: Array<DesignClaim & { label?: string }>,
  labels: { confidence: string; evidence: string; tokens: string },
  lowBucket: LowConfidenceEntry[],
  options: { keepLow?: boolean; formatRef?: (ref: string) => string } = {},
) {
  const main = options.keepLow ? claims : claims.filter((claim) => claim.confidence !== 'low')
  if (!options.keepLow) {
    for (const claim of claims) {
      if (claim.confidence === 'low') lowBucket.push({ section: title, label: claim.label, claim })
    }
  }
  if (main.length === 0) return []
  return [
    `### ${title}`,
    '',
    ...main.flatMap((claim) => [
      `- ${claim.label ? `**${claim.label}:** ` : ''}${claim.statement}`,
      `  - ${claim.implementation}`,
      `  - ${labels.confidence}: ${claim.confidence}`,
      `  - ${labels.evidence}: ${claim.evidence.map((reference) => `\`${reference.evidenceId}\``).join(', ')}`,
      ...(claim.tokenRefs && claim.tokenRefs.length > 0
        ? [
            `  - ${labels.tokens}: ${claim.tokenRefs.map((reference) => options.formatRef?.(reference) ?? `\`${reference}\``).join(', ')}`,
          ]
        : []),
    ]),
    '',
  ]
}

export function generateDesignProfileMarkdown(profile: DesignProfile, tokens?: DesignToken): string {
  const zh = profile.language === 'zh-CN'
  const evidenceFallback = profile.signatureMoves.some((move) => move.id === 'evidence-fallback')
  const labels = {
    confidence: zh ? '置信度' : 'Confidence',
    evidence: zh ? '证据' : 'Evidence',
    tokens: zh ? 'Token 引用' : 'Token refs',
  }
  const lowBucket: LowConfidenceEntry[] = []
  // Claims were written before color renaming, so their refs still use palette-N names. Map them
  // to the applied aliases and append the resolved value so refs are checkable within the document.
  const aliasRefs = new Map(
    (profile.tokenAliases || []).map((alias) => [`color.${alias.tokenId}`, `color.${alias.name}`]),
  )
  const formatRef = (ref: string): string => {
    const mapped = aliasRefs.get(ref) ?? ref
    const value = tokens ? resolveTokenRefValue(tokens, mapped) : null
    return value ? `\`${mapped}\` (${value})` : `\`${mapped}\``
  }
  const claimOptions = { formatRef }
  return [
    zh ? '## AI 设计解读' : '## AI Design Insights',
    '',
    zh
      ? '> 层级：Inferred / 已推断。以下主张来自经校验的证据综合，不代表原设计师的真实意图。'
      : '> Layer: Inferred. These claims synthesize validated evidence and do not assert the original designer’s intent.',
    '',
    `**${zh ? '输入模式' : 'Input mode'}:** \`${profile.inputMode}\``,
    '',
    ...(evidenceFallback
      ? [
          zh
            ? '> 状态：`evidence-fallback`。AI 输出未通过校验；下列解读是确定性证据兜底，不是有效的 AI 视觉综合。'
            : '> Status: `evidence-fallback`. The AI output failed validation; the interpretation below is a deterministic evidence fallback, not a valid AI visual synthesis.',
          '',
        ]
      : []),
    ...claimLines(zh ? '设计主张' : 'Design Thesis', [profile.thesis], labels, lowBucket, {
      keepLow: true,
      formatRef,
    }),
    ...claimLines(
      zh ? '标志性手法' : 'Signature Moves',
      profile.signatureMoves.map((move) => ({
        ...move,
        label: move.name,
      })),
      labels,
      lowBucket,
      claimOptions,
    ),
    ...claimLines(
      zh ? '构图方式' : 'Composition',
      Object.entries(profile.composition).map(([label, claim]) => ({
        ...claim,
        label,
      })),
      labels,
      lowBucket,
      claimOptions,
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
      lowBucket,
      claimOptions,
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
      lowBucket,
      claimOptions,
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
      lowBucket,
      claimOptions,
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
        lowBucket,
        claimOptions,
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
        lowBucket,
        claimOptions,
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
        lowBucket,
        claimOptions,
      ),
    ),
    ...claimLines(zh ? '必须保持' : 'Preserve', profile.transferRules.preserve, labels, lowBucket, claimOptions),
    ...claimLines(zh ? '可以适配' : 'Adapt', profile.transferRules.adapt, labels, lowBucket, claimOptions),
    ...claimLines(zh ? '必须避免' : 'Avoid', profile.transferRules.avoid, labels, lowBucket, claimOptions),
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
    ...(lowBucket.length > 0
      ? [
          `### ${zh ? '低置信度推断（谨慎采纳）' : 'Low-confidence inferences (use with caution)'}`,
          '',
          ...lowBucket.map(
            (entry) =>
              `- **[${entry.section}${entry.label ? ` · ${entry.label}` : ''}]** ${entry.claim.statement} — ${entry.claim.implementation}`,
          ),
          '',
        ]
      : []),
  ].join('\n')
}
