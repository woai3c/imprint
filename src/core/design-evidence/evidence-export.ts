import type { DocLanguage } from '../analyzer/agent-guide.js'
import { computeInteractionStateMetrics } from './interaction-metrics.js'
import type { DesignEvidence } from './types.js'

const TYPOGRAPHY_REF_GROUPS = {
  'typography.font-family': 'font',
  'typography.font-stack': 'font',
  'typography.font-size': 'size',
  'typography.font-weight': 'weight',
  'typography.line-height': 'lineHeight',
} as const

function typographyValueForRef(evidence: DesignEvidence, ref: string): string | null {
  const dot = ref.lastIndexOf('.')
  if (dot <= 0) return null
  const group = ref.slice(0, dot) as keyof typeof TYPOGRAPHY_REF_GROUPS
  const index = Number.parseInt(ref.slice(dot + 1), 10) - 1
  if (!(group in TYPOGRAPHY_REF_GROUPS) || !Number.isInteger(index) || index < 0) return null
  const values = {
    'typography.font-family': evidence.tokens.typography.fontFamilies,
    'typography.font-stack': evidence.tokens.typography.fontStacks,
    'typography.font-size': evidence.tokens.typography.fontSizes,
    'typography.font-weight': evidence.tokens.typography.fontWeights,
    'typography.line-height': evidence.tokens.typography.lineHeights,
  }
  return values[group][index] ?? null
}

function markdownCodeList(values: ReadonlySet<string>): string {
  const selected = [...values].slice(0, 4)
  return selected.length > 0 ? selected.map((value) => `\`${value.replace(/`/g, '')}\``).join(', ') : '—'
}

function observedLineHeight(node: DesignEvidence['layoutNodes'][number]): string | null {
  const typography = node.observedTypography
  if (!typography?.lineHeight) return null
  if (typography.lineHeight.trim().toLowerCase() === 'normal') return 'normal'
  const fontSize = typography.fontSize?.match(/^(\d*\.?\d+)px$/i)
  const lineHeight = typography.lineHeight.match(/^(\d*\.?\d+)px$/i)
  if (!fontSize || !lineHeight) return typography.lineHeight
  const ratio = Number.parseFloat(lineHeight[1]) / Number.parseFloat(fontSize[1])
  return Number.isFinite(ratio) && ratio > 0 ? ratio.toFixed(3).replace(/\.?0+$/, '') : typography.lineHeight
}

function appendTypographyRoleMatrix(lines: string[], evidence: DesignEvidence, zh: boolean): void {
  const rows = new Map<
    NonNullable<DesignEvidence['layoutNodes'][number]['textRole']>,
    { count: number; font: Set<string>; size: Set<string>; weight: Set<string>; lineHeight: Set<string> }
  >()
  for (const node of evidence.layoutNodes) {
    if (!node.textRole) continue
    const row = rows.get(node.textRole) || {
      count: 0,
      font: new Set<string>(),
      size: new Set<string>(),
      weight: new Set<string>(),
      lineHeight: new Set<string>(),
    }
    row.count += 1
    const resolvedGroups = new Set<(typeof TYPOGRAPHY_REF_GROUPS)[keyof typeof TYPOGRAPHY_REF_GROUPS]>()
    for (const ref of node.tokenRefs) {
      const group = ref.slice(0, ref.lastIndexOf('.')) as keyof typeof TYPOGRAPHY_REF_GROUPS
      const destination = TYPOGRAPHY_REF_GROUPS[group]
      const value = typographyValueForRef(evidence, ref)
      if (destination && value) {
        row[destination].add(value)
        resolvedGroups.add(destination)
      }
    }
    const observed = node.observedTypography
    if (observed?.fontFamily && !resolvedGroups.has('font')) row.font.add(observed.fontFamily)
    if (observed?.fontSize && !resolvedGroups.has('size')) row.size.add(observed.fontSize)
    if (observed?.fontWeight && !resolvedGroups.has('weight')) row.weight.add(observed.fontWeight)
    const lineHeight = observedLineHeight(node)
    if (lineHeight && !resolvedGroups.has('lineHeight')) row.lineHeight.add(lineHeight)
    rows.set(node.textRole, row)
  }
  if (rows.size === 0) return

  const order = ['display', 'heading', 'body', 'label', 'metadata'] as const
  lines.push('')
  lines.push(zh ? '### 排版角色证据' : '### Typography Role Evidence')
  lines.push('')
  lines.push(
    zh
      ? '| 观察角色 | 实例 | 字体 | 字号 | 字重 | 行高 |'
      : '| Observed role | Instances | Font | Size | Weight | Line height |',
  )
  lines.push('|---|---:|---|---|---|---|')
  for (const role of order) {
    const row = rows.get(role)
    if (!row) continue
    lines.push(
      `| \`${role}\` | ${row.count} | ${markdownCodeList(row.font)} | ${markdownCodeList(row.size)} | ${markdownCodeList(row.weight)} | ${markdownCodeList(row.lineHeight)} |`,
    )
  }
  lines.push('')
}

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
  const stateMetrics = computeInteractionStateMetrics(evidence)
  const iconRegions = evidence.coverage.mediaCoverage.iconRegions ?? 0

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
      ? `- 状态证据：${stateMetrics.dedupedStatePatterns} 个去重状态模式、${stateMetrics.passiveObservations} 条被动状态观察（未执行用户操作）、${stateMetrics.safeActiveObservations} 条安全主动观察、${stateMetrics.skippedCandidates} 个跳过候选`
      : `- State evidence: ${stateMetrics.dedupedStatePatterns} deduped state patterns, ${stateMetrics.passiveObservations} passive state observations (no user action), ${stateMetrics.safeActiveObservations} safe active observations, ${stateMetrics.skippedCandidates} skipped candidates`,
  )
  lines.push(
    zh
      ? `- 媒体证据：${evidence.coverage.mediaCoverage.majorRegions} 个主要区域（${evidence.coverage.mediaCoverage.classifiedRegions} 个已分类），另有 ${iconRegions} 个图标实例不计入主要区域`
      : `- Media evidence: ${evidence.coverage.mediaCoverage.majorRegions} major regions (${evidence.coverage.mediaCoverage.classifiedRegions} classified), plus ${iconRegions} icon instances not counted as major regions`,
  )
  lines.push('')

  appendTypographyRoleMatrix(lines, evidence, zh)

  lines.push(zh ? '### 页面拓扑' : '### Page Topology')
  lines.push('')
  for (const topologyPage of evidence.topology.pages) {
    const page = evidence.pages.find((candidate) => candidate.id === topologyPage.pageId)
    if (!page) continue
    if (page.horizontalOverflow && page.viewportWidth && page.contentWidth) {
      lines.push(
        zh
          ? `- \`${page.viewport}\` ${page.url}：检测到横向溢出（内容 ${page.contentWidth}px > 视口 ${page.viewportWidth}px）；视口外内容不能视为已隐藏或已重排`
          : `- \`${page.viewport}\` ${page.url}: horizontal overflow observed (content ${page.contentWidth}px > viewport ${page.viewportWidth}px); off-screen content is not evidence of hiding or reflow`,
      )
      for (const source of page.horizontalOverflowSources?.slice(0, 3) || []) {
        const sectionContext = [source.sectionRole, source.sectionId ? `\`${source.sectionId}\`` : '']
          .filter(Boolean)
          .join(' · ')
        lines.push(
          zh
            ? `  - 来源：\`${source.locator}\`${sectionContext ? `（区块 ${sectionContext}）` : ''}；超出 ${source.overflowPx}px，元素宽 ${source.width}px，position: ${source.position}`
            : `  - Source: \`${source.locator}\`${sectionContext ? ` (section ${sectionContext})` : ''}; ${source.overflowPx}px outside, ${source.width}px wide, position: ${source.position}`,
        )
      }
    }
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
    lines.push(zh ? '### 状态证据明细' : '### State Evidence Details')
    lines.push('')
    const passiveObservations = evidence.interactionObservations.filter(
      (observation) => observation.safety === 'passive',
    )
    const activeObservations = evidence.interactionObservations.filter(
      (observation) => observation.safety === 'safe-active',
    )
    const passiveCounts = new Map<string, number>()
    const activeDriverCounts = new Map<string, number>()
    const propertyCounts = new Map<string, number>()
    for (const obs of evidence.interactionObservations) {
      if (obs.safety === 'passive') {
        const passiveLabel = obs.trigger.kind.startsWith('css-pseudo-class:')
          ? obs.trigger.kind.slice('css-pseudo-class:'.length)
          : obs.trigger.kind
        passiveCounts.set(passiveLabel, (passiveCounts.get(passiveLabel) || 0) + 1)
      } else {
        activeDriverCounts.set(obs.driver, (activeDriverCounts.get(obs.driver) || 0) + 1)
      }
      for (const prop of obs.changedProperties) {
        propertyCounts.set(prop, (propertyCounts.get(prop) || 0) + 1)
      }
    }
    lines.push(
      zh
        ? `- 被动状态观察：${passiveObservations.length} 条（未执行用户操作，与概览口径一致）`
        : `- Passive state observations: ${passiveObservations.length} (no user action executed; same metric as the overview)`,
    )
    const passiveSummary = [...passiveCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([state, count]) => `${state} ×${count}`)
      .join(', ')
    if (passiveSummary) lines.push(`- ${zh ? '声明状态' : 'Declared states'}: ${passiveSummary}`)
    lines.push(
      zh
        ? `- 安全主动观察：${activeObservations.length} 条`
        : `- Safe active observations: ${activeObservations.length}`,
    )
    const activeDriverSummary = [...activeDriverCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([driver, count]) => `${driver} ×${count}`)
      .join(', ')
    if (activeDriverSummary) lines.push(`- ${zh ? '实际驱动' : 'Executed drivers'}: ${activeDriverSummary}`)
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
      const section = evidence.sections.find((candidate) => candidate.id === observation.sectionId)
      const page = section ? evidence.pages.find((candidate) => candidate.id === section.pageId) : undefined
      const context = `${page?.url || evidence.source.finalUrl} · ${section?.role || 'unknown'} · \`${observation.sectionId}\``
      lines.push(
        zh
          ? `- ${context}：${observation.fromViewport} → ${observation.toViewport}，${observation.changeType}（${observation.changedProperties.join('、')}）`
          : `- ${context}: ${observation.fromViewport} → ${observation.toViewport}, ${observation.changeType} (${observation.changedProperties.join(', ')})`,
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
  'horizontal-overflow-observed': {
    en: 'At least one viewport has horizontal overflow; off-screen content may be clipped rather than responsively reflowed',
    zh: '至少一个视口存在横向溢出；视口外内容可能只是被裁切，并非已完成响应式重排',
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
  'extraction-stage-degraded': {
    en: 'At least one extraction stage degraded; inspect the application log for the exact stage and reason',
    zh: '至少一个提取阶段发生降级；请在应用日志中查看具体阶段和原因',
  },
}

function humanizeLimitation(key: string, zh: boolean): string | null {
  const extractionIssue = /^extraction-issue:([^:]+):(.+)$/.exec(key)
  if (extractionIssue) {
    const safeDecode = (value: string) => {
      try {
        return decodeURIComponent(value)
      } catch {
        return value
      }
    }
    const stage = safeDecode(extractionIssue[1])
    const reason = safeDecode(extractionIssue[2])
    return zh ? `提取阶段 ${stage}：${reason}` : `Extraction stage ${stage}: ${reason}`
  }
  const label = LIMITATION_LABELS[key]
  if (label) return zh ? label.zh : label.en
  if (key.startsWith('page-health:') || key.startsWith('skipped:') || key.startsWith('skipped-interaction:'))
    return null
  return key
}
