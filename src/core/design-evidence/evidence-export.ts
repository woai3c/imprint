import type { DocLanguage } from '../analyzer/agent-guide.js'
import type { DesignEvidence } from './types.js'

export function generateDesignEvidenceJson(evidence: DesignEvidence): string {
  return JSON.stringify(evidence, null, 2)
}

export function generateDesignEvidenceBrief(
  evidence: DesignEvidence,
  language: DocLanguage = 'en',
  intelligenceMode?: 'structural-only' | 'multimodal',
): string {
  const zh = language === 'zh-CN'
  const lines: string[] = []
  const pageCount = new Set(evidence.pages.map((page) => page.url)).size
  const passiveStates =
    evidence.interactionStyles.hover.length +
    evidence.interactionStyles.focus.length +
    evidence.interactionStyles.active.length
  const safeActiveStates = evidence.interactionObservations.filter(
    (observation) => observation.safety === 'safe-active',
  ).length

  lines.push(zh ? '## 设计证据概览' : '## Design Evidence Overview')
  lines.push('')
  lines.push(
    intelligenceMode
      ? zh
        ? `> 层级：Observed / 已观察。以下内容来自浏览器观察和确定性代码分析。后续 AI 解读使用 \`${intelligenceMode}\` 输入模式推断，不能修改这些事实。`
        : `> Layer: Observed. The following content comes from browser observations and deterministic code analysis. The later AI interpretation uses \`${intelligenceMode}\` input and cannot modify these facts.`
      : zh
        ? '> 层级：Observed / 已观察。能力级别：`evidence-only`。以下内容来自浏览器观察和确定性代码分析；未生成 AI 视觉主张、标志性手法或迁移规则。'
        : '> Layer: Observed. Capability level: `evidence-only`. The following content comes from browser observations and deterministic code analysis; no AI visual thesis, signature moves, or transfer rules were generated.',
  )
  lines.push('')
  lines.push(zh ? `- 来源：${evidence.source.finalUrl}` : `- Final source: ${evidence.source.finalUrl}`)
  lines.push(
    zh
      ? `- 访问方式：${evidence.source.accessMode === 'managed' ? 'Imprint 独立登录会话' : '访客'}`
      : `- Access: ${evidence.source.accessMode === 'managed' ? 'managed Imprint session' : 'anonymous visitor'}`,
  )
  lines.push(
    zh
      ? `- 覆盖：${pageCount} 个页面、${evidence.pages.length} 个页面/视口证据、${evidence.sections.length} 个区块、${evidence.components.length} 个组件实例`
      : `- Coverage: ${pageCount} pages, ${evidence.pages.length} page/viewport captures, ${evidence.sections.length} sections, ${evidence.components.length} component instances`,
  )
  lines.push(
    zh
      ? `- 状态证据：${passiveStates} 条被动样式规则、${safeActiveStates} 条安全主动观察、${evidence.coverage.interactionCoverage.skipped} 个跳过候选`
      : `- State evidence: ${passiveStates} passive style rules, ${safeActiveStates} safe active observations, ${evidence.coverage.interactionCoverage.skipped} skipped candidates`,
  )
  lines.push(
    zh
      ? `- 媒体证据：${evidence.coverage.mediaCoverage.majorRegions} 个主要区域，${evidence.coverage.mediaCoverage.classifiedRegions} 个已分类区域`
      : `- Media evidence: ${evidence.coverage.mediaCoverage.majorRegions} major regions, ${evidence.coverage.mediaCoverage.classifiedRegions} classified regions`,
  )
  lines.push('')

  lines.push(zh ? '### 页面拓扑' : '### Page Topology')
  lines.push('')
  for (const topologyPage of evidence.topology.pages) {
    const page = evidence.pages.find((candidate) => candidate.id === topologyPage.pageId)
    if (!page) continue
    const roles = topologyPage.sectionIds
      .map((sectionId) => evidence.sections.find((section) => section.id === sectionId)?.role)
      .filter((r) => Boolean(r) && r !== 'unknown')
    if (roles.length === 0) continue
    lines.push(`- \`${page.viewport}\` ${page.url}: ${roles.join(' → ')}`)
  }

  if (evidence.techStack) {
    const ts = evidence.techStack
    const parts: string[] = []
    if (ts.frameworks.length > 0) parts.push(`${zh ? '框架' : 'Framework'}: ${ts.frameworks.join(', ')}`)
    if (ts.uiLibraries.length > 0) parts.push(`${zh ? 'UI 库' : 'UI Library'}: ${ts.uiLibraries.join(', ')}`)
    if (ts.cssApproach.length > 0) parts.push(`${zh ? 'CSS 方案' : 'CSS'}: ${ts.cssApproach.join(', ')}`)
    if (ts.bundler) parts.push(`${zh ? '构建工具' : 'Bundler'}: ${ts.bundler}`)
    if (ts.icons) parts.push(`${zh ? '图标' : 'Icons'}: ${ts.icons}`)
    if (parts.length > 0) {
      lines.push('')
      lines.push(zh ? '### 技术栈' : '### Tech Stack')
      lines.push('')
      for (const part of parts) lines.push(`- ${part}`)
    }
  }

  if (evidence.interactionObservations.length > 0) {
    lines.push('')
    lines.push(zh ? '### 状态观察' : '### State Observations')
    lines.push('')
    const driverCounts = new Map<string, number>()
    const propertyCounts = new Map<string, number>()
    for (const obs of evidence.interactionObservations) {
      driverCounts.set(obs.driver, (driverCounts.get(obs.driver) || 0) + 1)
      for (const prop of obs.changedProperties) {
        propertyCounts.set(prop, (propertyCounts.get(prop) || 0) + 1)
      }
    }
    lines.push(
      zh
        ? `- 共 ${evidence.interactionObservations.length} 条观察`
        : `- ${evidence.interactionObservations.length} observations total`,
    )
    const driverSummary = [...driverCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([driver, count]) => `${driver} ×${count}`)
      .join(', ')
    lines.push(`- ${zh ? '驱动类型' : 'Drivers'}: ${driverSummary}`)
    const propSummary = [...propertyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([prop, count]) => `${prop} ×${count}`)
      .join(', ')
    lines.push(`- ${zh ? '变化属性' : 'Changed properties'}: ${propSummary}`)
  }

  if (evidence.responsiveObservations.length > 0) {
    lines.push('')
    lines.push(zh ? '### 响应式结构观察' : '### Responsive Structure Observations')
    lines.push('')
    for (const observation of evidence.responsiveObservations.slice(0, 20)) {
      lines.push(
        zh
          ? `- ${observation.fromViewport} → ${observation.toViewport}：${observation.changeType}（${observation.changedProperties.join('、')}）`
          : `- ${observation.fromViewport} → ${observation.toViewport}: ${observation.changeType} (${observation.changedProperties.join(', ')})`,
      )
    }
  }

  const humanLimitations = evidence.limitations.map((l) => humanizeLimitation(l, zh)).filter(Boolean) as string[]
  if (humanLimitations.length > 0) {
    lines.push('')
    lines.push(zh ? '### 分析局限' : '### Analysis Limitations')
    lines.push('')
    for (const text of humanLimitations) lines.push(`- ${text}`)
  }

  return lines.join('\n')
}

const LIMITATION_LABELS: Record<string, { en: string; zh: string }> = {
  'fewer-pages-than-requested': {
    en: 'Fewer pages were analyzed than requested',
    zh: '实际分析页面数少于请求数',
  },
  'single-viewport': {
    en: 'Only a single viewport size was captured',
    zh: '仅捕获了单一视口尺寸',
  },
  'no-sections-detected': {
    en: 'No page sections were detected',
    zh: '未检测到页面区块',
  },
  'some-safe-interactions-skipped': {
    en: 'Some interactive states could not be safely observed',
    zh: '部分交互状态未能安全观察',
  },
  'no-interaction-states-observed': {
    en: 'No interactive state changes were observed',
    zh: '未观察到交互状态变化',
  },
  'no-major-media-detected': {
    en: 'No major media regions were detected',
    zh: '未检测到主要媒体区域',
  },
  'no-classified-media-regions': {
    en: 'Media regions were found but could not be classified',
    zh: '发现了媒体区域但未能分类',
  },
}

function humanizeLimitation(key: string, zh: boolean): string | null {
  const label = LIMITATION_LABELS[key]
  if (label) return zh ? label.zh : label.en
  if (key.startsWith('skipped:') || key.startsWith('skipped-interaction:')) return null
  return key
}
