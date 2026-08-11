import type { DesignEvidence } from '../design-evidence/types.js'
import type { DesignClaim, DesignProfile, IntelligenceInputMode } from './types.js'

export interface ProfileCoverageRepairResult {
  profile: DesignProfile
  repaired: string[]
}

function buildFallbackComponentGrammar(
  evidence: DesignEvidence,
  language: 'en' | 'zh-CN',
): DesignProfile['componentGrammar'] {
  const groups = new Map<string, typeof evidence.components>()
  for (const component of evidence.components) {
    const group = groups.get(component.type) || []
    group.push(component)
    groups.set(component.type, group)
  }
  return [...groups.entries()].slice(0, 6).map(([type, components]) => {
    const roles = [...new Set(components.flatMap((component) => (component.role ? [component.role] : [])))].slice(0, 3)
    const tokenRefs = [...new Set(components.flatMap((component) => component.tokenRefs))].slice(0, 8)
    const rule: DesignClaim = {
      statement:
        language === 'zh-CN'
          ? `已在页面证据中重复观察到 ${type} 组件。`
          : `${type} components recur in the captured page evidence.`,
      implementation:
        language === 'zh-CN'
          ? '以已观察实例的令牌组合为基准；未执行的交互状态需单独验证。'
          : 'Base the implementation on tokens from observed instances and separately verify unexecuted states.',
      confidence: 'low',
      evidence: components.slice(0, 2).map((component) => ({
        evidenceId: component.id,
        note: language === 'zh-CN' ? '程序提取的组件证据' : 'Programmatically extracted component evidence',
      })),
      ...(tokenRefs.length > 0 ? { tokenRefs } : {}),
    }
    return {
      component: type,
      role:
        roles.length > 0
          ? roles.join(', ')
          : language === 'zh-CN'
            ? `已观察的 ${type} 组件`
            : `Observed ${type} component`,
      rules: [rule],
    }
  })
}

function buildFallbackSectionGrammar(
  evidence: DesignEvidence,
  language: 'en' | 'zh-CN',
): DesignProfile['sectionGrammar'] {
  const groups = new Map<string, typeof evidence.sections>()
  for (const section of evidence.sections) {
    if (section.role === 'unknown') continue
    const group = groups.get(section.role) || []
    group.push(section)
    groups.set(section.role, group)
  }
  return [...groups.entries()].slice(0, 8).map(([role, sections]) => {
    const tokenRefs = [...new Set(sections.flatMap((section) => section.tokenRefs))].slice(0, 8)
    const rule: DesignClaim = {
      statement:
        language === 'zh-CN'
          ? `程序证据中已观察到 ${role} 区块。`
          : `A ${role} section is present in the programmatically captured structure.`,
      implementation:
        language === 'zh-CN'
          ? '沿用该角色的区块位置和已提取令牌；具体视觉关系需对照截图复核。'
          : 'Keep the observed placement and extracted tokens for this role, then verify visual relationships against screenshots.',
      confidence: 'low',
      evidence: sections.slice(0, 2).map((section) => ({
        evidenceId: section.id,
        note: language === 'zh-CN' ? '程序提取的同角色区块' : 'Programmatically extracted section with this role',
      })),
      ...(tokenRefs.length > 0 ? { tokenRefs } : {}),
    }
    return { role, composition: [rule], contentRhythm: [], transitionToNext: [] }
  })
}

function buildFallbackInteractionLanguage(
  evidence: DesignEvidence,
  language: 'en' | 'zh-CN',
  fallbackEvidence: DesignClaim['evidence'],
): DesignProfile['interactionLanguage'] {
  const observations = evidence.interactionObservations.filter(
    (observation) => observation.changedProperties.length > 0,
  )
  const uniqueDrivers = observations.filter(
    (observation, index, all) => all.findIndex((candidate) => candidate.driver === observation.driver) === index,
  )
  const buildObservedClaim = (
    observation: (typeof observations)[number],
    zhStatement: string,
    enStatement: string,
    zhImplementation: string,
    enImplementation: string,
  ): DesignClaim => ({
    statement: language === 'zh-CN' ? zhStatement : enStatement,
    implementation: language === 'zh-CN' ? zhImplementation : enImplementation,
    confidence: 'low',
    evidence: [
      {
        evidenceId: observation.id,
        note:
          language === 'zh-CN'
            ? observation.safety === 'safe-active'
              ? '程序安全执行的交互状态'
              : '程序提取的被动状态声明'
            : observation.safety === 'safe-active'
              ? 'Programmatically executed safe interaction state'
              : 'Programmatically extracted passive state declaration',
      },
    ],
  })
  const primaryDrivers = uniqueDrivers.slice(0, 3).map((observation) => {
    const properties = observation.changedProperties.slice(0, 3).join(', ')
    const zhObservation = observation.safety === 'safe-active' ? '安全执行状态' : '被动状态声明'
    const enObservation = observation.safety === 'safe-active' ? 'safely executed state' : 'passive state declaration'
    return buildObservedClaim(
      observation,
      `${observation.driver} 的${zhObservation}记录了 ${properties} 的变化。`,
      `The ${enObservation} for ${observation.driver} records changes to ${properties}.`,
      `只在 ${observation.driver} 状态复用证据中记录的变化属性。`,
      `Reuse only the recorded changed properties for the ${observation.driver} state.`,
    )
  })
  const observation = observations[0]
  if (observation) {
    const properties = observation.changedProperties.slice(0, 3).join(', ')
    return {
      primaryDrivers,
      feedbackStyle: buildObservedClaim(
        observation,
        `${observation.driver} 状态证据以 ${properties} 的差异表达反馈样式。`,
        `The ${observation.driver} state evidence expresses feedback styling through ${properties} differences.`,
        `将反馈绑定到 ${observation.driver} 驱动器，不推断未执行的状态。`,
        `Bind this feedback to the ${observation.driver} driver without inferring unexecuted states.`,
      ),
      stateChangeAmplitude: buildObservedClaim(
        observation,
        `状态变化范围限定在证据记录的 ${properties}。`,
        `State-change amplitude is limited to the recorded ${properties} changes.`,
        '保持其余属性不变，并把更大范围的变化标记为待验证。',
        'Keep other properties stable and mark broader changes for validation.',
      ),
      continuityRules: [
        buildObservedClaim(
          observation,
          `复用交互时保持 ${observation.driver} 与 ${properties} 的证据对应关系。`,
          `Preserve the evidenced pairing between ${observation.driver} and ${properties} when reusing the interaction.`,
          '跨组件迁移前重新验证相同驱动器是否产生相同属性变化。',
          'Revalidate that the same driver changes the same properties before transferring it across components.',
        ),
      ],
    }
  }

  const fallbackClaim = (
    zhStatement: string,
    enStatement: string,
    zhImplementation: string,
    enImplementation: string,
  ) => ({
    statement: language === 'zh-CN' ? zhStatement : enStatement,
    implementation: language === 'zh-CN' ? zhImplementation : enImplementation,
    confidence: 'low' as const,
    evidence: fallbackEvidence,
  })
  return {
    primaryDrivers: [
      fallbackClaim(
        '交互驱动范围以程序安全观察结果为上限。',
        'Interaction drivers are limited to programmatically safe observations.',
        '未观察到的点击、切换或滚动驱动器需单独验证。',
        'Validate unobserved click, toggle, or scroll drivers separately.',
      ),
    ],
    feedbackStyle: fallbackClaim(
      '反馈样式只采用已记录的状态属性。',
      'Feedback styling uses only recorded state properties.',
      '不要从静态样式推断状态已执行。',
      'Do not infer an executed state from static styles.',
    ),
    stateChangeAmplitude: fallbackClaim(
      '状态变化幅度尚无可复用的主动交互证据。',
      'No reusable active evidence establishes the state-change amplitude.',
      '保持变化最小，并在实现后验证。',
      'Keep changes minimal and validate them after implementation.',
    ),
    continuityRules: [
      fallbackClaim(
        '跨组件的交互连续性需要相同驱动器证据。',
        'Interaction continuity across components requires evidence for the same driver.',
        '逐个组件验证状态，不传播未经观察的规则。',
        'Validate states per component instead of propagating unobserved rules.',
      ),
    ],
  }
}

export function buildEvidenceFallbackProfile(
  evidence: DesignEvidence,
  language: 'en' | 'zh-CN',
  inputMode: IntelligenceInputMode,
  reason: string,
): DesignProfile {
  const primarySection =
    evidence.sections.find((section) => !['footer', 'unknown'].includes(section.role)) || evidence.sections[0]
  const secondarySection = evidence.sections.find((section) => section.id !== primarySection?.id)
  const fallbackPage = evidence.pages[0]
  const evidenceIds = [primarySection?.id, secondarySection?.id, fallbackPage?.images[0]?.id, fallbackPage?.id].filter(
    (id): id is string => Boolean(id),
  )
  const refs = evidenceIds.slice(0, 2).map((evidenceId) => ({
    evidenceId,
    note: language === 'zh-CN' ? '程序提取的页面证据' : 'Programmatically extracted page evidence',
  }))
  const claim = (
    zhStatement: string,
    enStatement: string,
    zhImplementation: string,
    enImplementation: string,
  ): DesignClaim => ({
    statement: language === 'zh-CN' ? zhStatement : enStatement,
    implementation: language === 'zh-CN' ? zhImplementation : enImplementation,
    confidence: 'low',
    evidence: refs,
  })
  const structural = claim(
    '页面以程序提取到的主要区块建立视觉层级。',
    'The page hierarchy is organized by the primary sections found in structural evidence.',
    '复用已提取的区块顺序，并在实现前人工复核细节。',
    'Reuse the extracted section sequence and manually review details before implementation.',
  )
  const sequence = claim(
    '阅读顺序先从首个主要区块开始，随后进入后续内容区块。',
    'The reading order starts with the first primary section, then proceeds into the following content section.',
    '按程序提取的区块顺序组织阅读路径；具体视觉注意力仍需对照截图复核。',
    'Follow the programmatically extracted section order and verify the actual visual attention path against screenshots.',
  )
  const visual = claim(
    '颜色、排版、间距与圆角应直接使用已提取的设计令牌。',
    'Color, typography, spacing, and radius decisions should come directly from extracted tokens.',
    '只引用导出的令牌，不补造未观察到的数值。',
    'Use exported tokens only; do not invent unobserved values.',
  )
  const interactionLanguage = buildFallbackInteractionLanguage(evidence, language, refs)
  const preserve = claim(
    '迁移时保留证据中已观察到的区块层级与令牌化视觉关系。',
    'Preserve the observed section hierarchy and tokenized visual relationships when transferring the design.',
    '保持主要区块顺序，并复用导出的颜色、排版、间距与圆角令牌；实现前复核细节。',
    'Keep the primary section order and reuse exported color, typography, spacing, and radius tokens; review details before implementation.',
  )
  const adapt = claim(
    '区块数量与内容密度可按目标页面调整，未观察到的响应式行为不作推断。',
    'Section count and content density may adapt to the target page without inferring unobserved responsive behavior.',
    '以已提取结构为起点，仅在目标内容需要时调整布局，并单独验证窄屏表现。',
    'Start from the extracted structure, adapt layout only for target content needs, and validate narrow-screen behavior separately.',
  )
  const overflowFact = evidence.pages.flatMap((page) =>
    page.horizontalOverflow
      ? (page.horizontalOverflowSources || [])
          .filter((source) => source.sectionId)
          .map((source) => ({ page, sectionId: source.sectionId as string }))
      : [],
  )[0]
  const avoid = overflowFact
    ? {
        ...claim(
          '不要把已观察到的横向溢出原样迁移为通用移动端布局。',
          'Do not transfer the observed horizontal overflow as a general mobile layout rule.',
          '以关联区块为范围检查固定宽度或最小宽度约束，并在目标窄屏视口重新验证裁切行为。',
          'Inspect fixed-width or minimum-width constraints within the source section and revalidate clipping in the target narrow viewport.',
        ),
        evidence: [
          {
            evidenceId: overflowFact.sectionId,
            note:
              language === 'zh-CN' ? '程序定位的横向溢出关联区块' : 'Programmatically located overflow source section',
          },
          {
            evidenceId: overflowFact.page.id,
            note: language === 'zh-CN' ? '程序观察到横向溢出的页面' : 'Page with programmatically observed overflow',
          },
        ],
      }
    : claim(
        '未执行的交互状态和未令牌化的原始 DOM 数值不能作为设计规则。',
        'Unexecuted interaction states and untokenized raw DOM values are not design rules.',
        '只实现有状态证据或导出令牌支持的细节，其余内容明确标记为待验证。',
        'Implement only details supported by state evidence or exported tokens, and mark everything else for validation.',
      )
  const componentGrammar = buildFallbackComponentGrammar(evidence, language)
  const sectionGrammar = buildFallbackSectionGrammar(evidence, language)
  return {
    schemaVersion: '1',
    language,
    inputMode,
    thesis: structural,
    signatureMoves: [
      {
        ...structural,
        id: 'evidence-fallback',
        name: language === 'zh-CN' ? '结构证据回退' : 'Structural evidence fallback',
        distinctiveness:
          language === 'zh-CN'
            ? '仅陈述程序可以验证的页面结构。'
            : 'States only what programmatic evidence can verify.',
      },
    ],
    composition: {
      containerStrategy: structural,
      alignmentStrategy: structural,
      densityAndWhitespace: visual,
      rhythm: visual,
    },
    attention: {
      entryPoint: structural,
      visualSequence: [sequence],
      actionHierarchy: structural,
      contrastStrategy: visual,
    },
    visualLanguage: { color: visual, typography: visual, shape: visual, surfaces: visual },
    sectionGrammar,
    interactionLanguage,
    componentGrammar,
    transferRules: { preserve: [preserve], adapt: [adapt], avoid: [avoid] },
    uncertainties: [
      {
        topic: language === 'zh-CN' ? 'AI 输出未通过校验' : 'AI output did not pass validation',
        reason: reason.slice(0, 360),
        neededEvidence:
          language === 'zh-CN'
            ? '请检查本次提取证据或更换模型后重新运行网站分析。'
            : 'Inspect the extracted evidence or rerun the website analysis with a different model.',
      },
    ],
  }
}

/**
 * Contradiction checks and cross-profile dedupe run after schema validation and may remove
 * every rule from an otherwise valid array. Restore only deterministic, low-confidence
 * evidence fallbacks so exported profiles never contain empty component shells or omit the
 * minimum transfer guidance needed by downstream agents.
 */
export function repairProfileCoverage(
  inputProfile: DesignProfile,
  evidence: DesignEvidence,
): ProfileCoverageRepairResult {
  const profile = structuredClone(inputProfile)
  const fallback = buildEvidenceFallbackProfile(
    evidence,
    profile.language,
    profile.inputMode,
    'Post-validation checks removed required profile coverage',
  )
  const repaired: string[] = []
  if (profile.signatureMoves.length === 0) {
    profile.signatureMoves = fallback.signatureMoves
    repaired.push('signatureMoves')
  }
  if (profile.attention.visualSequence.length === 0) {
    profile.attention.visualSequence = fallback.attention.visualSequence
    repaired.push('attention.visualSequence')
  }
  if (profile.interactionLanguage.primaryDrivers.length === 0) {
    profile.interactionLanguage.primaryDrivers = fallback.interactionLanguage.primaryDrivers
    repaired.push('interactionLanguage.primaryDrivers')
  }

  const fallbackSections = new Map(fallback.sectionGrammar.map((section) => [section.role, section]))
  profile.sectionGrammar = profile.sectionGrammar.flatMap((section) => {
    const populated = section.composition.length + section.contentRhythm.length + section.transitionToNext.length > 0
    if (populated) return [section]
    const replacement = fallbackSections.get(section.role)
    if (!replacement) return []
    repaired.push(`sectionGrammar.${section.role}`)
    return [replacement]
  })
  if (profile.sectionGrammar.length === 0 && fallback.sectionGrammar.length > 0) {
    profile.sectionGrammar = fallback.sectionGrammar
    repaired.push('sectionGrammar')
  }

  const fallbackComponents = new Map(fallback.componentGrammar.map((component) => [component.component, component]))
  profile.componentGrammar = profile.componentGrammar.flatMap((component) => {
    if (component.rules.length > 0) return [component]
    repaired.push(`componentGrammar.${component.component}`)
    const replacement = fallbackComponents.get(component.component)
    return replacement ? [{ ...component, rules: replacement.rules }] : []
  })
  const representedComponents = new Set(profile.componentGrammar.map((component) => component.component))
  for (const component of fallback.componentGrammar) {
    if (representedComponents.has(component.component)) continue
    profile.componentGrammar.push(component)
    repaired.push(`componentGrammar.${component.component}`)
  }

  for (const kind of ['preserve', 'adapt', 'avoid'] as const) {
    if (profile.transferRules[kind].length > 0) continue
    profile.transferRules[kind] = fallback.transferRules[kind]
    repaired.push(`transferRules.${kind}`)
  }
  return { profile: repaired.length > 0 ? profile : inputProfile, repaired }
}
