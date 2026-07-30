import type { DesignToken } from '../analyzer/types.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import type { AgentContextBundle, AnalysisCapabilityLevel, DesignProfile } from './types.js'

function tokenSubset(tokens: DesignToken, task: string): Record<string, string> {
  const subset: Record<string, string> = {}
  const taskWords = new Set(
    task
      .toLowerCase()
      .split(/[^\p{L}\p{N}-]+/u)
      .filter(Boolean),
  )
  const colorEntries = Object.entries(tokens.colors)
    .filter(
      ([key]) =>
        /background|foreground|surface|text|primary|action|border/i.test(key) ||
        [...taskWords].some((word) => key.toLowerCase().includes(word)),
    )
    .slice(0, 12)
  const selectedColorEntries = colorEntries.length > 0 ? colorEntries : Object.entries(tokens.colors).slice(0, 8)
  selectedColorEntries.forEach(([key, value]) => {
    subset[`color.${key}`] = value
  })
  if (/type|text|heading|article|content|排版|文字|标题|内容/i.test(task)) {
    tokens.typography.fontSizes.forEach((value, index) => {
      subset[`typography.font-size.${index + 1}`] = value
    })
  }
  tokens.spacing.forEach((value, index) => {
    subset[`spacing.${index + 1}`] = value
  })
  tokens.radii.forEach((value, index) => {
    subset[`radius.${index + 1}`] = value
  })
  if (/card|dialog|modal|overlay|panel|卡片|弹窗|浮层|面板/i.test(task)) {
    tokens.shadows.slice(0, 4).forEach((value, index) => {
      subset[`shadow.${index + 1}`] = value
    })
  }
  return subset
}

function relevance(value: string, taskWords: Set<string>): number {
  const normalized = value.toLowerCase()
  return [...taskWords].filter((word) => word.length >= 2 && normalized.includes(word)).length
}

export function generateAgentContextBundle(
  task: string,
  capabilityLevel: AnalysisCapabilityLevel,
  evidence: DesignEvidence,
  profile?: DesignProfile | null,
): AgentContextBundle {
  const taskWords = new Set(
    task
      .toLowerCase()
      .split(/[^\p{L}\p{N}-]+/u)
      .filter(Boolean),
  )
  const relevantPatterns =
    profile?.patterns
      ?.map((pattern) => ({
        pattern,
        score: relevance(`${pattern.name} ${pattern.role}`, taskWords),
      }))
      .filter(({ score }) => score > 0)
      .sort((first, second) => second.score - first.score)
      .map(({ pattern }) => pattern) || []
  const selectedPatterns =
    relevantPatterns.length > 0 ? relevantPatterns.slice(0, 8) : profile?.patterns?.slice(0, 3) || []
  const relevantComponentRules =
    profile?.componentGrammar
      .filter((component) => relevance(`${component.component} ${component.role}`, taskWords) > 0)
      .flatMap((component) => component.rules) || []
  const applicableRules = profile
    ? [
        ...profile.transferRules.preserve,
        ...Object.values(profile.composition),
        ...relevantComponentRules,
        ...selectedPatterns.flatMap((pattern) => pattern.structureRules),
      ].map((claim) => claim.implementation)
    : []
  return {
    task,
    capabilityLevel,
    ...(profile ? { designThesis: profile.thesis.statement } : {}),
    applicableRules: applicableRules.slice(0, 16),
    tokenSubset: tokenSubset(evidence.tokens, task),
    relevantPatternIds: selectedPatterns.map((pattern) => pattern.id),
    responsiveRules: [
      ...(profile?.interactionLanguage.continuityRules.map((claim) => claim.implementation) || []),
      ...evidence.responsiveObservations
        .slice(0, 8)
        .map(
          (observation) =>
            `${observation.fromViewport} to ${observation.toViewport}: ${observation.changeType} (${observation.changedProperties.join(', ')})`,
        ),
    ],
    interactionRules:
      profile && /button|field|form|menu|tab|dialog|state|action|表单|按钮|字段|菜单|状态|操作/i.test(task)
        ? profile.interactionLanguage.primaryDrivers.map((claim) => claim.implementation).slice(0, 8)
        : [],
    avoid: profile?.transferRules.avoid.map((claim) => claim.implementation).slice(0, 8) || [],
    evidenceSummary: [
      `${evidence.pages.length} page/viewport captures`,
      `${evidence.sections.length} sections`,
      `${evidence.components.length} component instances`,
      `${evidence.interactionObservations.filter((observation) => observation.safety === 'safe-active').length} safe active interaction observations`,
    ],
    limitations: [
      ...evidence.limitations,
      ...(profile?.uncertainties.map((item) => `${item.topic}: ${item.reason}`) || []),
    ],
  }
}
