import type { DesignToken } from '../analyzer/types.js'
import type { DesignClaim, DesignIntelligenceStatus, DesignProfile } from './types.js'

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

function claimLines(
  title: string,
  claims: Array<DesignClaim & { label?: string }>,
  labels: { confidence: string; evidence: string; tokens: string },
  lowBucket: LowConfidenceEntry[],
  options: { keepLow?: boolean; formatRef?: (ref: string) => string; formatText?: (text: string) => string } = {},
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
      `- ${claim.label ? `**${claim.label}:** ` : ''}${options.formatText?.(claim.statement) ?? claim.statement}`,
      `  - ${options.formatText?.(claim.implementation) ?? claim.implementation}`,
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

function numberedVisibleClaims(claims: DesignClaim[], prefix: string): Array<DesignClaim & { label: string }> {
  let visibleIndex = 0
  return claims.map((claim) => ({
    ...claim,
    label: `${prefix}.${claim.confidence === 'low' ? 0 : ++visibleIndex}`,
  }))
}

export function generateDesignProfileMarkdown(
  profile: DesignProfile,
  tokens?: DesignToken,
  status?: DesignIntelligenceStatus,
  publicColorNames: ReadonlyMap<string, string> = new Map(),
): string {
  const zh = profile.language === 'zh-CN'
  const evidenceFallback = profile.signatureMoves.some((move) => move.id === 'evidence-fallback')
  const displayedStatus = evidenceFallback ? 'evidence-fallback' : status
  const labels = {
    confidence: zh ? '置信度' : 'Confidence',
    evidence: zh ? '证据' : 'Evidence',
    tokens: zh ? 'Token 引用' : 'Token refs',
  }
  const lowBucket: LowConfidenceEntry[] = []
  // Claims were written before color renaming, so their refs still use palette-N names. Map them
  // to the applied aliases and append the resolved value so refs are checkable within the document.
  const aliasRefs = new Map<string, string>()
  for (const [sourceName, publicName] of publicColorNames) {
    aliasRefs.set(`color.${sourceName}`, `color.${publicName}`)
  }
  for (const alias of profile.tokenAliases || []) {
    const publicName = publicColorNames.get(alias.name) || publicColorNames.get(alias.tokenId) || alias.name
    aliasRefs.set(`color.${alias.tokenId}`, `color.${publicName}`)
    aliasRefs.set(`color.${alias.name}`, `color.${publicName}`)
  }
  const formatRef = (ref: string): string => {
    const mapped = aliasRefs.get(ref) ?? ref
    const directlyResolved = tokens ? resolveTokenRefValue(tokens, ref) : null
    const sourceRef = [...aliasRefs.entries()].find(
      ([candidate, publicRef]) =>
        publicRef === mapped && tokens?.colors[candidate.slice('color.'.length)] !== undefined,
    )?.[0]
    const value = directlyResolved || (tokens && sourceRef ? resolveTokenRefValue(tokens, sourceRef) : null)
    return value ? `\`${mapped}\` (${value})` : `\`${mapped}\``
  }
  const formatText = (text: string): string =>
    [...aliasRefs.entries()].reduce((value, [source, target]) => {
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return value.replace(new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g'), target)
    }, text)
  const claimOptions = { formatRef, formatText }
  const uncertainties = uniqueUncertainties(profile)
  const componentGroups = new Map<string, Array<(typeof profile.componentGrammar)[number]>>()
  for (const component of profile.componentGrammar) {
    const group = componentGroups.get(component.component) || []
    group.push(component)
    componentGroups.set(component.component, group)
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
    ...(displayedStatus ? [`**${zh ? '状态' : 'Status'}:** \`${displayedStatus}\``, ''] : []),
    ...(evidenceFallback
      ? [
          zh
            ? '> 状态：`evidence-fallback`。AI 输出未通过校验；下列解读是确定性证据兜底，不是有效的 AI 视觉综合。'
            : '> Status: `evidence-fallback`. The AI output failed validation; the interpretation below is a deterministic evidence fallback, not a valid AI visual synthesis.',
          '',
        ]
      : []),
    ...(!evidenceFallback && status === 'partial'
      ? [
          zh
            ? '> 部分 AI 字段未通过确定性校验，已被省略、降为低置信度或替换为证据兜底；使用前请复核。'
            : '> Some AI fields failed deterministic validation and were omitted, demoted, or replaced with evidence fallbacks; review before use.',
          '',
        ]
      : []),
    ...claimLines(zh ? '设计主张' : 'Design Thesis', [profile.thesis], labels, lowBucket, {
      keepLow: true,
      formatRef,
      formatText,
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
        ...numberedVisibleClaims(profile.attention.visualSequence, 'visualSequence'),
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
        ...numberedVisibleClaims(profile.interactionLanguage.primaryDrivers, 'primaryDriver'),
        { ...profile.interactionLanguage.feedbackStyle, label: 'feedbackStyle' },
        { ...profile.interactionLanguage.stateChangeAmplitude, label: 'stateChangeAmplitude' },
        ...(profile.interactionLanguage.scrollNarrative
          ? [{ ...profile.interactionLanguage.scrollNarrative, label: 'scrollNarrative' }]
          : []),
        ...numberedVisibleClaims(profile.interactionLanguage.continuityRules, 'continuity'),
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
    ...[...componentGroups.entries()].flatMap(([componentType, components]) =>
      claimLines(
        `${zh ? '组件语法' : 'Component Grammar'} · ${componentType}`,
        components.flatMap((component) =>
          (() => {
            const visibleCount = component.rules.filter((claim) => claim.confidence !== 'low').length
            let visibleIndex = 0
            return component.rules.map((claim) => ({
              ...claim,
              label:
                visibleCount > 1
                  ? `${component.role}.${claim.confidence === 'low' ? 0 : ++visibleIndex}`
                  : component.role,
            }))
          })(),
        ),
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
    ...(uncertainties.length > 0
      ? [
          `### ${zh ? '不确定性' : 'Uncertainties'}`,
          '',
          ...uncertainties.map((item) => `- ${formatText(item.topic)}: ${formatText(item.reason)}`),
          '',
        ]
      : []),
  ].join('\n')
}
