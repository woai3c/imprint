import { describe, expect, test } from 'vitest'

import { dedupeProfileClaims } from '../../src/core/design-intelligence/claim-dedupe.js'
import type { DesignClaim, DesignProfile } from '../../src/core/design-intelligence/types.js'

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
    thesis: claim('深色开发者文档界面'),
    signatureMoves: [],
    composition: {
      containerStrategy: claim('全出血容器'),
      alignmentStrategy: claim('左对齐'),
      densityAndWhitespace: claim('高密度 header'),
      rhythm: claim('垂直堆叠'),
    },
    attention: {
      entryPoint: claim('header 为首个区域'),
      visualSequence: [],
      actionHierarchy: claim('主按钮实心'),
      contrastStrategy: claim('深底白字'),
    },
    visualLanguage: {
      color: claim('深色画布'),
      typography: claim('Inter 正文'),
      shape: claim('4px 圆角'),
      surfaces: claim('平铺分层'),
    },
    sectionGrammar: [],
    interactionLanguage: {
      primaryDrivers: [],
      feedbackStyle: claim('即时过渡'),
      stateChangeAmplitude: claim('幅度小'),
      continuityRules: [],
    },
    componentGrammar: [],
    transferRules: { preserve: [], adapt: [], avoid: [] },
    uncertainties: [],
  }
}

describe('dedupeProfileClaims', () => {
  test('removes array claims that repeat an earlier claim, ignoring punctuation', () => {
    const profile = makeProfile()
    profile.signatureMoves = [
      { ...claim('所有页面共享全宽 header 与嵌套导航结构'), id: 'move-1', name: '持久顶部条', distinctiveness: 'x' },
    ]
    profile.interactionLanguage.continuityRules = [
      claim('所有页面共享全宽 header 与嵌套导航结构。'),
      claim('按钮几何与状态反馈跨页一致'),
    ]

    const { profile: deduped, removed } = dedupeProfileClaims(profile)

    expect(removed).toBe(1)
    expect(deduped.interactionLanguage.continuityRules.map((item) => item.statement)).toEqual([
      '按钮几何与状态反馈跨页一致',
    ])
    expect(deduped.signatureMoves).toHaveLength(1)
  })

  test('returns the original profile when nothing is duplicated', () => {
    const profile = makeProfile()
    profile.interactionLanguage.continuityRules = [
      claim('按钮几何与状态反馈跨页一致'),
      claim('颜色与字体令牌跨页保持一致'),
    ]

    const { profile: deduped, removed } = dedupeProfileClaims(profile)

    expect(removed).toBe(0)
    expect(deduped).toBe(profile)
  })

  test('required single claims act as dedupe sources but are never removed', () => {
    const profile = makeProfile()
    profile.composition.alignmentStrategy = claim('标题与正文多为左对齐')
    profile.attention.visualSequence = [claim('标题与正文多为左对齐')]

    const { profile: deduped, removed } = dedupeProfileClaims(profile)

    expect(removed).toBe(1)
    expect(deduped.composition.alignmentStrategy.statement).toBe('标题与正文多为左对齐')
    expect(deduped.attention.visualSequence).toHaveLength(0)
  })

  test('drops later duplicates inside section grammar lists', () => {
    const profile = makeProfile()
    profile.sectionGrammar = [
      {
        role: 'header',
        composition: [
          claim('全宽流式 header 固定于顶部'),
          claim('全宽流式 header，固定于顶部'),
          claim('header 内包含品牌媒体与按钮'),
        ],
        contentRhythm: [],
        transitionToNext: [],
      },
    ]

    const { profile: deduped, removed } = dedupeProfileClaims(profile)

    expect(removed).toBe(1)
    expect(deduped.sectionGrammar[0].composition.map((item) => item.statement)).toEqual([
      '全宽流式 header 固定于顶部',
      'header 内包含品牌媒体与按钮',
    ])
  })

  test('deduplicates english claims by containment and word overlap', () => {
    const profile = makeProfile()
    profile.language = 'en'
    profile.signatureMoves = [
      { ...claim('Buttons use a 4px corner radius'), id: 'move-1', name: 'Geometry', distinctiveness: 'x' },
    ]
    profile.componentGrammar = [
      {
        component: 'button',
        role: 'action',
        rules: [claim('Buttons use a 4px corner radius value'), claim('Cards keep 20px of inner spacing')],
      },
    ]

    const { profile: deduped, removed } = dedupeProfileClaims(profile)

    expect(removed).toBe(1)
    expect(deduped.componentGrammar[0].rules.map((item) => item.statement)).toEqual([
      'Cards keep 20px of inner spacing',
    ])
  })
})
