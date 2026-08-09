import { describe, expect, test } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import { generateDesignProfileMarkdown } from '../../src/core/design-intelligence/profile-export.js'
import { generateReconstructionBrief } from '../../src/core/design-intelligence/reconstruction-brief.js'
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
      avoid: [claim('避免把 footer 当全局模式', 'low')],
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
} as unknown as DesignEvidence

describe('generateDesignProfileMarkdown', () => {
  test('moves low-confidence claims into an appendix and keeps solid claims in the body', () => {
    const markdown = generateDesignProfileMarkdown(makeProfile())

    const appendixIndex = markdown.indexOf('低置信度推断')
    expect(appendixIndex).toBeGreaterThan(-1)

    // Solid claims stay in the main body, before the appendix.
    expect(markdown.indexOf('全出血容器')).toBeLessThan(appendixIndex)
    expect(markdown.indexOf('深底白字')).toBeLessThan(appendixIndex)

    // Low-confidence claims only appear inside the appendix.
    const body = markdown.slice(0, appendixIndex)
    const appendix = markdown.slice(appendixIndex)
    expect(body).not.toContain('首页视线顺序为标题到按钮')
    expect(body).not.toContain('DOM 顺序上 header 为首个区域')
    expect(appendix).toContain('首页视线顺序为标题到按钮')
    expect(appendix).toContain('[注意力层级 · visualSequence.1]')
    expect(appendix).toContain('避免把 footer 当全局模式')
  })

  test('keeps the thesis in the body even when low confidence', () => {
    const profile = makeProfile()
    profile.thesis = claim('证据不足时的设计主张', 'low')

    const markdown = generateDesignProfileMarkdown(profile)

    const appendixIndex = markdown.indexOf('低置信度推断')
    expect(markdown.indexOf('设计主张')).toBeLessThan(appendixIndex)
    expect(markdown.slice(0, appendixIndex)).toContain('证据不足时的设计主张')
  })

  test('maps renamed color refs to their aliases and resolves ref values', () => {
    const profile = makeProfile()
    profile.thesis = {
      ...claim('品牌色与间距主张', 'high'),
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
})

describe('generateReconstructionBrief', () => {
  test('filters low-confidence claims out of the brief', () => {
    const brief = generateReconstructionBrief(makeProfile(), evidence, tokens)

    expect(brief).toContain('保留深色调色板')
    expect(brief).toContain('主按钮实心品牌色')
    expect(brief).not.toContain('避免把 footer 当全局模式')
    expect(brief).not.toContain('header 跨页一致')
    expect(brief).not.toContain('首页视线顺序为标题到按钮')
  })
})
