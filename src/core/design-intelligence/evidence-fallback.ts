import type { DesignEvidence } from '../design-evidence/types.js'
import type { DesignClaim, DesignProfile, IntelligenceInputMode } from './types.js'

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
  const visual = claim(
    '颜色、排版、间距与圆角应直接使用已提取的设计令牌。',
    'Color, typography, spacing, and radius decisions should come directly from extracted tokens.',
    '只引用导出的令牌，不补造未观察到的数值。',
    'Use exported tokens only; do not invent unobserved values.',
  )
  const interaction = claim(
    '交互细节仅保留已安全观察到的状态。',
    'Interaction details are limited to safely observed states.',
    '未观察到的点击或切换行为标记为待验证。',
    'Treat unobserved click or toggle behavior as requiring validation.',
  )
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
      visualSequence: [structural],
      actionHierarchy: structural,
      contrastStrategy: visual,
    },
    visualLanguage: { color: visual, typography: visual, shape: visual, surfaces: visual },
    sectionGrammar: primarySection
      ? [{ role: primarySection.role, composition: [structural], contentRhythm: [visual], transitionToNext: [] }]
      : [],
    interactionLanguage: {
      primaryDrivers: [interaction],
      feedbackStyle: interaction,
      stateChangeAmplitude: interaction,
      continuityRules: [interaction],
    },
    componentGrammar: [],
    transferRules: { preserve: [structural, visual], adapt: [structural], avoid: [interaction] },
    uncertainties: [
      {
        topic: language === 'zh-CN' ? 'AI 输出未通过校验' : 'AI output did not pass validation',
        reason: reason.slice(0, 360),
        neededEvidence:
          language === 'zh-CN'
            ? '可手动发起深度复核；默认流程不会自动再次调用 AI。'
            : 'A deep review can be requested manually; the default path will not call AI again.',
      },
    ],
  }
}
