import { describe, expect, test } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import { generateDesignProfileMarkdown } from '../../src/core/design-intelligence/profile-export.js'
import {
  generateReconstructionBrief,
  getReconstructionBriefEligibility,
} from '../../src/core/design-intelligence/reconstruction-brief.js'
import type { DesignClaim, DesignIntelligenceMeta, DesignProfile } from '../../src/core/design-intelligence/types.js'

function claim(statement: string, confidence: DesignClaim['confidence'] = 'medium'): DesignClaim {
  return {
    statement,
    implementation: `${statement} — implementation`,
    confidence,
    evidence: [{ evidenceId: 'section-a', note: 'note' }],
  }
}

function makeProfile(): DesignProfile {
  return {
    schemaVersion: '1',
    language: 'zh-CN',
    inputMode: 'structural-only',
    thesis: claim('深色开发者文档界面', 'high'),
    signatureMoves: [],
    composition: {
      containerStrategy: claim('全出血容器', 'high'),
      alignmentStrategy: claim('左对齐', 'medium'),
      densityAndWhitespace: claim('高密度 header', 'medium'),
      rhythm: claim('垂直堆叠', 'medium'),
    },
    attention: {
      entryPoint: claim('DOM 顺序上 header 为首个区域', 'low'),
      visualSequence: [claim('首页视线顺序为标题到按钮', 'low')],
      actionHierarchy: claim('主按钮实心品牌色', 'medium'),
      contrastStrategy: claim('深底白字', 'high'),
    },
    visualLanguage: {
      color: claim('深色画布', 'high'),
      typography: claim('Inter 正文', 'medium'),
      shape: claim('4px 圆角', 'medium'),
      surfaces: claim('平铺分层', 'medium'),
    },
    sectionGrammar: [],
    interactionLanguage: {
      primaryDrivers: [claim('hover 以透明度变化为主', 'medium')],
      feedbackStyle: claim('即时过渡', 'medium'),
      stateChangeAmplitude: claim('幅度小', 'medium'),
      continuityRules: [claim('header 跨页一致', 'low')],
    },
    componentGrammar: [],
    transferRules: {
      preserve: [claim('保留深色调色板', 'high')],
      adapt: [],
      avoid: [claim('避免引入未经观察的视觉语言', 'medium'), claim('避免把 footer 当全局模式', 'low')],
    },
    uncertainties: [],
  }
}

const tokens: DesignToken = {
  colors: { primary: '#6b1eb9' },
  typography: {
    fontFamilies: [],
    fontStacks: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    letterSpacings: [],
  },
  spacing: [],
  radii: [],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

const evidence = {
  responsiveObservations: [],
  limitations: [],
  coverage: {
    pageCoverage: 'partial',
    sectionCoverage: 0.75,
    viewportCoverage: ['desktop', 'mobile'],
    interactionCoverage: { candidates: 4, safelyObserved: 2, skipped: 2 },
    mediaCoverage: { majorRegions: 2, classifiedRegions: 1, iconRegions: 3 },
    accessRestrictions: [],
    limitations: ['single-page-coverage'],
  },
} as unknown as DesignEvidence

const completeMeta: DesignIntelligenceMeta = {
  status: 'complete',
  capabilityLevel: 'structural-ai',
}

describe('generateDesignProfileMarkdown', () => {
  test('renders profile framework copy through the selected locale catalog', () => {
    const chinese = generateDesignProfileMarkdown(makeProfile())
    const englishProfile = makeProfile()
    englishProfile.language = 'en'
    const english = generateDesignProfileMarkdown(englishProfile)

    expect(chinese).toContain('## AI 设计解读')
    expect(chinese).toContain('### 必须保持')
    expect(english).toContain('## AI Design Insights')
    expect(english).toContain('### Preserve')
    expect(chinese).not.toContain('profileExport.')
    expect(english).not.toContain('profileExport.')
  })

  test('exports schema v2 assertions as authoritative machine-readable facts', () => {
    const profile = makeProfile()
    profile.schemaVersion = '2'
    profile.thesis.assertions = [
      {
        kind: 'section',
        target: 'hero',
        predicate: 'layout-mode',
        value: 'flow',
        scope: 'instance',
        evidenceIds: ['section-a'],
      },
    ]

    const markdown = generateDesignProfileMarkdown(profile)

    expect(markdown).toContain('已验证断言')
    expect(markdown).toContain('`section:hero:layout-mode="flow"@instance`')
  })

  test('omits low-confidence claims while keeping solid claims in the document', () => {
    const markdown = generateDesignProfileMarkdown(makeProfile())

    expect(markdown).toContain('全出血容器')
    expect(markdown).toContain('深底白字')
    expect(markdown).toContain('### 必须避免')
    expect(markdown).toContain('避免引入未经观察的视觉语言')
    expect(markdown).not.toContain('低置信度推断')
    expect(markdown).not.toContain('首页视线顺序为标题到按钮')
    expect(markdown).not.toContain('DOM 顺序上 header 为首个区域')
    expect(markdown).not.toContain('避免把 footer 当全局模式')
  })

  test('keeps the thesis in the body even when low confidence', () => {
    const profile = makeProfile()
    profile.thesis = claim('证据不足时的设计主张', 'low')

    const markdown = generateDesignProfileMarkdown(profile)

    expect(markdown).toContain('### 设计主张')
    expect(markdown).toContain('证据不足时的设计主张')
    expect(markdown).not.toContain('低置信度推断')
  })

  test('maps renamed color refs to their aliases and resolves ref values', () => {
    const profile = makeProfile()
    profile.thesis = {
      ...claim('品牌色 color.palette-8 与间距主张', 'high'),
      implementation: '在正文中使用 color.palette-8，不仅是 token ref。',
      tokenRefs: ['color.palette-8', 'spacing.2', 'color.primary'],
    }
    profile.tokenAliases = [{ tokenId: 'palette-8', name: 'text-subtle' }]
    const renamedTokens: DesignToken = {
      ...tokens,
      colors: { primary: '#6b1eb9', 'text-subtle': '#67676c' },
      spacing: ['4px', '12px'],
    }

    const markdown = generateDesignProfileMarkdown(profile, renamedTokens)

    expect(markdown).toContain('`color.text-subtle` (#67676c)')
    expect(markdown).toContain('`spacing.2` (12px)')
    expect(markdown).toContain('`color.primary` (#6b1eb9)')
    expect(markdown).toContain('品牌色 color.text-subtle 与间距主张')
    expect(markdown).toContain('在正文中使用 color.text-subtle')
    expect(markdown).not.toContain('color.palette-8')
  })

  test('maps renamed color refs inside uncertainty prose', () => {
    const profile = makeProfile()
    profile.tokenAliases = [{ tokenId: 'palette-8', name: 'text-subtle' }]
    profile.uncertainties = [
      {
        topic: '辅助色语义',
        reason: 'color.palette-8 的跨页角色仍需确认。',
      },
    ]

    const markdown = generateDesignProfileMarkdown(profile)

    expect(markdown).toContain('color.text-subtle 的跨页角色仍需确认')
    expect(markdown).not.toContain('color.palette-8')
  })

  test('keeps raw refs when no tokens are provided', () => {
    const profile = makeProfile()
    profile.thesis = { ...claim('品牌色主张', 'high'), tokenRefs: ['color.primary'] }

    expect(generateDesignProfileMarkdown(profile)).toContain('`color.primary`')
  })

  test('labels deterministic evidence fallback separately from the attempted input mode', () => {
    const profile = makeProfile()
    profile.inputMode = 'multimodal'
    profile.signatureMoves = [
      {
        ...claim('Only structural evidence remains', 'low'),
        id: 'evidence-fallback',
        name: 'Structural fallback',
        distinctiveness: 'No validated model synthesis is available.',
      },
    ]

    const markdown = generateDesignProfileMarkdown(profile)

    expect(markdown).toContain('`multimodal`')
    expect(markdown).toContain('`evidence-fallback`')
    expect(markdown).toContain('确定性证据兜底')
  })

  test('surfaces partial AI validation status in the exported document', () => {
    const markdown = generateDesignProfileMarkdown(makeProfile(), undefined, 'partial')

    expect(markdown).toContain('**状态:** `partial`')
    expect(markdown).toContain('部分 AI 字段未通过确定性校验')
  })

  test('does not label a partial AI profile as a full fallback after local coverage repair', () => {
    const profile = makeProfile()
    profile.inputMode = 'multimodal'
    profile.signatureMoves = [
      {
        ...claim('Only the rejected signature move was repaired', 'low'),
        id: 'evidence-fallback',
        name: 'Local structural repair',
        distinctiveness: 'The remaining AI fields are still validated.',
      },
    ]

    const markdown = generateDesignProfileMarkdown(profile, undefined, 'partial', new Map(), 'multimodal-ai')

    expect(markdown).toContain('**状态:** `partial`')
    expect(markdown).toContain('部分 AI 字段未通过确定性校验')
    expect(markdown).not.toContain('确定性证据兜底，不是有效的 AI 视觉综合')
  })

  test('omits low-confidence fallbacks and internal validation diagnostics', () => {
    const profile = makeProfile()
    const fallback = claim('仅使用已观察到的设计令牌', 'low')
    profile.composition.containerStrategy = fallback
    profile.composition.alignmentStrategy = { ...fallback }
    profile.uncertainties = [
      { topic: '确定性矛盾检查', reason: '数值不一致' },
      { topic: '确定性矛盾检查', reason: '数值不一致' },
      { topic: '水平溢出细节', reason: '裁切范围仍需确认。' },
      { topic: '响应式行为', reason: '横向溢出的移动端意图仍需确认。' },
    ]

    const markdown = generateDesignProfileMarkdown(profile)

    expect(markdown).not.toContain('仅使用已观察到的设计令牌')
    expect(markdown).not.toContain('确定性矛盾检查')
    expect(markdown.match(/横向溢出|水平溢出/g)).toHaveLength(1)
  })

  test('groups repeated component types under one heading while retaining each observed role', () => {
    const profile = makeProfile()
    profile.componentGrammar = [
      { component: 'button', role: 'main action', rules: [claim('主操作按钮使用实心表面')] },
      { component: 'button', role: 'weak action', rules: [claim('弱操作按钮使用轻量边框')] },
    ]

    const markdown = generateDesignProfileMarkdown(profile)

    expect(markdown.match(/### 组件语法 · button/g)).toHaveLength(1)
    expect(markdown).toContain('**main action:** 主操作按钮使用实心表面')
    expect(markdown).toContain('**weak action:** 弱操作按钮使用轻量边框')
  })

  test('numbers multiple rules that share the same component role', () => {
    const profile = makeProfile()
    profile.componentGrammar = [
      {
        component: 'button',
        role: 'main action',
        rules: [claim('主操作按钮使用实心表面'), claim('工具按钮使用轻量投影')],
      },
    ]

    const markdown = generateDesignProfileMarkdown(profile)

    expect(markdown).toContain('**main action.1:** 主操作按钮使用实心表面')
    expect(markdown).toContain('**main action.2:** 工具按钮使用轻量投影')
    expect(markdown).not.toContain('**main action:**')
  })

  test('renumbers visible list claims after low-confidence items are omitted', () => {
    const profile = makeProfile()
    profile.interactionLanguage.primaryDrivers = [claim('未验证的首个驱动', 'low'), claim('已验证的聚焦样式', 'medium')]
    profile.componentGrammar = [
      {
        component: 'button',
        role: 'action',
        rules: [claim('低置信规则', 'low'), claim('保留主按钮填充', 'medium'), claim('保留文字按钮', 'medium')],
      },
    ]

    const markdown = generateDesignProfileMarkdown(profile)

    expect(markdown).toContain('**primaryDriver.1:** 已验证的聚焦样式')
    expect(markdown).not.toContain('primaryDriver.2')
    expect(markdown).toContain('**action.1:** 保留主按钮填充')
    expect(markdown).toContain('**action.2:** 保留文字按钮')
    expect(markdown).not.toContain('action.3')
  })
})

describe('generateReconstructionBrief', () => {
  test('filters low-confidence claims out of the brief', () => {
    const brief = generateReconstructionBrief(makeProfile(), evidence, tokens, completeMeta)

    expect(brief).not.toBeNull()
    expect(brief).toContain('保留深色调色板')
    expect(brief).toContain('主按钮实心品牌色')
    expect(brief).not.toContain('避免把 footer 当全局模式')
    expect(brief).not.toContain('header 跨页一致')
    expect(brief).not.toContain('首页视线顺序为标题到按钮')
  })

  test('rejects complete profiles whose thesis is low confidence', () => {
    const profile = makeProfile()
    profile.thesis = claim('证据不足的设计主张', 'low')

    expect(generateReconstructionBrief(profile, evidence, tokens, completeMeta)).toBeNull()
    expect(getReconstructionBriefEligibility(profile, completeMeta)).toEqual({
      eligible: false,
      reason: 'low-confidence-thesis',
    })
  })

  test.each([
    {
      name: 'preserve',
      update: (profile: DesignProfile) => ({
        ...profile,
        transferRules: { ...profile.transferRules, preserve: [claim('低置信保留项', 'low')] },
      }),
      reason: 'preserve-directive-missing',
    },
    {
      name: 'avoid',
      update: (profile: DesignProfile) => ({
        ...profile,
        transferRules: { ...profile.transferRules, avoid: [claim('低置信避免项', 'low')] },
      }),
      reason: 'avoid-directive-missing',
    },
  ])('rejects complete profiles without a reliable $name directive', ({ update, reason }) => {
    const profile = update(makeProfile())

    expect(generateReconstructionBrief(profile, evidence, tokens, completeMeta)).toBeNull()
    expect(getReconstructionBriefEligibility(profile, completeMeta)).toEqual({ eligible: false, reason })
  })

  test('marks eligible partial profiles and includes validation and coverage limitations', () => {
    const profile = makeProfile()
    profile.transferRules.avoid = [claim('避免引入未观察到的装饰语言', 'medium')]
    const meta: DesignIntelligenceMeta = {
      status: 'partial',
      capabilityLevel: 'structural-ai',
      rejected: ['visualLanguage.motion:unsupported-evidence'],
      repaired: ['transferRules.preserve:coverage-repaired'],
    }

    const brief = generateReconstructionBrief(profile, evidence, tokens, meta)

    expect(brief).not.toBeNull()
    expect(brief).toContain('Partial interpretation')
    expect(brief).toContain('visualLanguage.motion:unsupported-evidence')
    expect(brief).toContain('transferRules.preserve:coverage-repaired')
    expect(brief).toContain('page=partial')
    expect(brief).toContain('sections=75%')
  })

  test.each([
    {
      name: 'evidence fallback',
      update: (profile: DesignProfile) => profile,
      meta: { status: 'partial', capabilityLevel: 'evidence-fallback' } as DesignIntelligenceMeta,
      reason: 'evidence-fallback',
    },
    {
      name: 'low-confidence thesis',
      update: (profile: DesignProfile) => ({ ...profile, thesis: claim('低置信主张', 'low') }),
      meta: { status: 'partial', capabilityLevel: 'structural-ai' } as DesignIntelligenceMeta,
      reason: 'low-confidence-thesis',
    },
    {
      name: 'missing preserve directive',
      update: (profile: DesignProfile) => ({
        ...profile,
        transferRules: { ...profile.transferRules, preserve: [claim('低置信保留项', 'low')] },
      }),
      meta: { status: 'partial', capabilityLevel: 'structural-ai' } as DesignIntelligenceMeta,
      reason: 'preserve-directive-missing',
    },
    {
      name: 'missing avoid directive',
      update: (profile: DesignProfile) => ({
        ...profile,
        transferRules: { ...profile.transferRules, avoid: [claim('低置信避免项', 'low')] },
      }),
      meta: { status: 'partial', capabilityLevel: 'structural-ai' } as DesignIntelligenceMeta,
      reason: 'avoid-directive-missing',
    },
  ])('does not generate a partial brief for $name', ({ update, meta, reason }) => {
    const profile = update(makeProfile())

    expect(generateReconstructionBrief(profile, evidence, tokens, meta)).toBeNull()
    expect(getReconstructionBriefEligibility(profile, meta)).toEqual({ eligible: false, reason })
  })

  test('does not generate for failed, fallback, or missing profiles', () => {
    expect(
      generateReconstructionBrief(makeProfile(), evidence, tokens, {
        status: 'failed',
        capabilityLevel: 'evidence-fallback',
      }),
    ).toBeNull()
    expect(getReconstructionBriefEligibility(null, completeMeta)).toEqual({
      eligible: false,
      reason: 'no-profile',
    })
  })
})
