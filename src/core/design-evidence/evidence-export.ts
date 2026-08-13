import type { DocLanguage } from '../analyzer/agent-guide.js'
import { hasVisibleBorder, hasVisibleShadow, isTransparentColor } from '../analyzer/component-detect.js'
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

function markdownCodeList(values: ReadonlyMap<string, number>): string {
  const selected = [...values.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, 4)
    .map(([value]) => value)
  return selected.length > 0 ? selected.map((value) => `\`${value.replace(/`/g, '')}\``).join(', ') : '—'
}

function incrementValue(values: Map<string, number>, value: string): void {
  values.set(value, (values.get(value) || 0) + 1)
}

function displaySectionRole(role: string | undefined): string {
  return !role || role === 'unknown' ? 'content' : role
}

function boundedPixelValue(value: string | number | undefined, maximum = 240): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i)
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  return amount > 0 && amount <= maximum ? value : null
}

function compactRoles(roles: string[]): string[] {
  const groups: Array<{ role: string; count: number }> = []
  for (const role of roles) {
    const last = groups[groups.length - 1]
    if (last?.role === role) last.count += 1
    else groups.push({ role, count: 1 })
  }
  return groups.map(({ role, count }) => (count > 1 ? `${role} ×${count}` : role))
}

function canonicalPageIds(evidence: DesignEvidence): Set<string> {
  const pagesByUrl = new Map<string, DesignEvidence['pages']>()
  for (const page of evidence.pages) {
    const pages = pagesByUrl.get(page.url) || []
    pages.push(page)
    pagesByUrl.set(page.url, pages)
  }
  return new Set(
    [...pagesByUrl.values()].flatMap((pages) => {
      const preferred = pages.find((page) => page.viewport === 'desktop') || pages[0]
      return preferred ? [preferred.id] : []
    }),
  )
}

function isUsefulPseudoValue(property: string, value: string): boolean {
  if (property === 'backgroundColor') return !isTransparentColor(value)
  if (property === 'boxShadow') return value !== 'none'
  return !/^(?:none|normal|auto|0px|rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?\s*\))$/i.test(value)
}

function visiblePseudoStyles(
  kind: NonNullable<DesignEvidence['pseudoElements']>[number]['kind'],
  styles: Readonly<Record<string, string>>,
): Array<[string, string]> {
  const entries = Object.entries(styles).filter(([property, value]) => isUsefulPseudoValue(property, value))
  if (kind === 'first-letter') return entries
  const content = styles.content?.replace(/^['"]|['"]$/g, '').trim()
  const result: Array<[string, string]> = []
  let hasMaterial = false
  if (content && !/^(?:none|normal)$/i.test(content)) {
    result.push(
      ...entries.filter(([property]) =>
        ['content', 'color', 'fontFamily', 'fontSize', 'fontWeight'].includes(property),
      ),
    )
  }
  if (styles.backgroundColor && !isTransparentColor(styles.backgroundColor)) {
    result.push(['backgroundColor', styles.backgroundColor])
    hasMaterial = true
  }
  const borderGroups = new Map<string, string[]>()
  for (const [property, value] of Object.entries(styles)) {
    if (!/^border(?:Top|Right|Bottom|Left)$/.test(property) || !hasVisibleBorder(value)) continue
    const sides = borderGroups.get(value) || []
    sides.push(property.replace(/^border/, '').toLowerCase())
    borderGroups.set(value, sides)
  }
  for (const [value, sides] of borderGroups) {
    result.push([sides.length === 4 ? 'border' : `border-${sides.join('/')}`, value])
    hasMaterial = true
  }
  if (hasVisibleShadow(styles.boxShadow)) {
    result.push(['boxShadow', styles.boxShadow!])
    hasMaterial = true
  }
  if (hasMaterial) {
    if (styles.borderRadius && /[1-9]/.test(styles.borderRadius)) result.push(['borderRadius', styles.borderRadius])
    for (const property of ['width', 'height'] as const) {
      const value = styles[property]
      if (value && /[1-9]/.test(value)) result.push([property, value])
    }
    if (styles.transform && !/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(styles.transform)) {
      result.push(['transform', styles.transform])
    }
  }
  return result
}

function displayedResponsiveChangeType(
  original: DesignEvidence['responsiveObservations'][number]['changeType'],
  properties: readonly string[],
): DesignEvidence['responsiveObservations'][number]['changeType'] {
  return properties.length > 0 && properties.every((property) => property === 'order') ? 'reorder' : original
}

function compactVisibleBorders(borders: Readonly<Record<string, string>>): string[] {
  const groups = new Map<string, string[]>()
  for (const [side, value] of Object.entries(borders)) {
    if (!hasVisibleBorder(value)) continue
    const sides = groups.get(value) || []
    sides.push(side.replace(/^border/, '').toLowerCase())
    groups.set(value, sides)
  }
  return [...groups.entries()].map(([value, sides]) =>
    sides.length === 4 ? `border: ${value}` : `border-${sides.join('/')}: ${value}`,
  )
}

function isUsefulResponsiveChange(
  property: string,
  values: { from?: string | number; to?: string | number },
  sectionRole: string | undefined,
): boolean {
  if (property.startsWith('rect.') || property === 'visibility' || values.from === values.to) return false
  if (
    [
      'gridTemplateColumns',
      'childGridTemplateColumns',
      'node.heading.fontSize',
      'layoutMode',
      'position',
      'order',
    ].includes(property)
  ) {
    return true
  }
  if (property === 'height' || property.endsWith('.height')) {
    return (
      ['header', 'navigation', 'action'].includes(sectionRole || '') &&
      Boolean(boundedPixelValue(values.from) && boundedPixelValue(values.to))
    )
  }
  if (/^border(?:Top|Right|Bottom|Left)$/.test(property)) {
    return [values.from, values.to].some((value) => typeof value === 'string' && hasVisibleBorder(value))
  }
  return property === 'boxShadow'
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
    {
      count: number
      font: Map<string, number>
      size: Map<string, number>
      weight: Map<string, number>
      lineHeight: Map<string, number>
    }
  >()
  for (const node of evidence.layoutNodes) {
    if (!node.textRole) continue
    const row = rows.get(node.textRole) || {
      count: 0,
      font: new Map<string, number>(),
      size: new Map<string, number>(),
      weight: new Map<string, number>(),
      lineHeight: new Map<string, number>(),
    }
    row.count += 1
    const resolvedGroups = new Set<(typeof TYPOGRAPHY_REF_GROUPS)[keyof typeof TYPOGRAPHY_REF_GROUPS]>()
    for (const ref of node.tokenRefs) {
      const group = ref.slice(0, ref.lastIndexOf('.')) as keyof typeof TYPOGRAPHY_REF_GROUPS
      const destination = TYPOGRAPHY_REF_GROUPS[group]
      const value = typographyValueForRef(evidence, ref)
      if (destination && value) {
        incrementValue(row[destination], value)
        resolvedGroups.add(destination)
      }
    }
    const observed = node.observedTypography
    if (observed?.fontFamily && !resolvedGroups.has('font')) incrementValue(row.font, observed.fontFamily)
    if (observed?.fontSize && !resolvedGroups.has('size')) incrementValue(row.size, observed.fontSize)
    if (observed?.fontWeight && !resolvedGroups.has('weight')) incrementValue(row.weight, observed.fontWeight)
    const lineHeight = observedLineHeight(node)
    if (lineHeight && !resolvedGroups.has('lineHeight')) incrementValue(row.lineHeight, lineHeight)
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
  const urlCoverage = evidence.coverage.urlCoverage
  const captureCoverage = evidence.coverage.captureCoverage
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
      ? `- 覆盖：URL ${urlCoverage ? `${urlCoverage.captured}/${urlCoverage.requested}` : pageCount}；页面×视口 ${captureCoverage ? `${captureCoverage.captured}/${captureCoverage.expected}（${captureCoverage.status === 'complete' ? '完整' : '部分'}）` : evidence.pages.length}；${evidence.sections.length} 个区块观察、${evidence.components.length} 个跨捕获组件观察（不是页面实例数）`
      : `- Coverage: URLs ${urlCoverage ? `${urlCoverage.captured}/${urlCoverage.requested}` : pageCount}; page×viewport captures ${captureCoverage ? `${captureCoverage.captured}/${captureCoverage.expected} (${captureCoverage.status})` : evidence.pages.length}; ${evidence.sections.length} section observations and ${evidence.components.length} component observations across captures (not page instance counts)`,
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

  if (evidence.deterministicClaims?.length) {
    lines.push(zh ? '### 基于证据的确定性主张' : '### Evidence-backed Deterministic Claims')
    lines.push('')
    for (const claim of evidence.deterministicClaims) {
      lines.push(
        `- **${claim.label}** (${claim.confidence}) — ${claim.reasons.join(' ')} [${claim.evidenceRefs.map((ref) => `\`${ref}\``).join(', ')}]`,
      )
    }
    lines.push('')
  }

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
        const sectionContext = [
          source.sectionRole ? displaySectionRole(source.sectionRole) : '',
          source.sectionId ? `\`${source.sectionId}\`` : '',
        ]
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
      .filter((role): role is NonNullable<typeof role> => Boolean(role) && role !== 'unknown')
    if (roles.length === 0) continue
    lines.push(`- \`${page.viewport}\` ${page.url}: ${compactRoles(roles).join(' → ')}`)
  }

  const structuralFacts = evidence.sections.flatMap((section) => {
    const styles = section.observedStyles
    if (!styles) return []
    const facts = [
      styles.layout?.maxWidth ? `max-width: ${styles.layout.maxWidth}` : '',
      styles.layout?.gridTemplateColumns ? `grid: ${styles.layout.gridTemplateColumns}` : '',
      styles.layout?.childGridTemplateColumns ? `child grid: ${styles.layout.childGridTemplateColumns}` : '',
      section.layoutMode !== 'flow' ? `position: ${section.layoutMode}` : '',
      (section.layoutMode !== 'flow' || ['header', 'navigation'].includes(section.role)) &&
      boundedPixelValue(styles.layout?.height)
        ? `height: ${styles.layout?.height}`
        : '',
      ...compactVisibleBorders(styles.borders || {}),
    ].filter(Boolean)
    return facts.length > 0 ? [{ section, facts }] : []
  })
  const dedupedStructuralFacts = [
    ...new Map(
      structuralFacts.map((item) => [`${displaySectionRole(item.section.role)}|${item.facts.join('|')}`, item]),
    ).values(),
  ]
  if (dedupedStructuralFacts.length > 0) {
    lines.push('')
    lines.push(zh ? '### 结构事实' : '### Structural Facts')
    lines.push('')
    for (const { section, facts } of dedupedStructuralFacts.slice(0, 24)) {
      lines.push(
        `- ${displaySectionRole(section.role)} · \`${section.id}\`: ${facts.map((fact) => `\`${fact}\``).join(' · ')}`,
      )
    }
  }

  if ((evidence.pseudoElements?.length || 0) > 0) {
    const canonicalPages = canonicalPageIds(evidence)
    const pseudoGroups = new Map<
      string,
      {
        pseudo: NonNullable<DesignEvidence['pseudoElements']>[number]
        styles: Array<[string, string]>
        count: number
      }
    >()
    for (const pseudo of evidence.pseudoElements || []) {
      if (!canonicalPages.has(pseudo.pageId)) continue
      const section = evidence.sections.find((candidate) => candidate.id === pseudo.sectionId)
      const styles = visiblePseudoStyles(pseudo.kind, pseudo.styles)
      if (styles.length === 0) continue
      const key = `${section?.role || 'content'}|${pseudo.kind}|${JSON.stringify(styles)}`
      const group = pseudoGroups.get(key)
      if (group) group.count += 1
      else pseudoGroups.set(key, { pseudo, styles, count: 1 })
    }
    const pseudoLines: string[] = []
    for (const { pseudo, styles: visibleStyles, count } of [...pseudoGroups.values()].slice(0, 12)) {
      const section = evidence.sections.find((candidate) => candidate.id === pseudo.sectionId)
      const styles = visibleStyles.map(([property, value]) => `${property}: ${value}`).join('; ')
      const role = !section?.role || section.role === 'unknown' ? 'content' : section.role
      pseudoLines.push(`- \`::${pseudo.kind}\` · ${role}${count > 1 ? ` ×${count}` : ''}: \`${styles}\``)
    }
    if (pseudoLines.length > 0) {
      lines.push('')
      lines.push(zh ? '### 伪元素与首字处理' : '### Pseudo-element Treatments')
      lines.push('')
      lines.push(...pseudoLines)
    }
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
    const passivePropertyCounts = new Map<string, number>()
    const activePropertyCounts = new Map<string, number>()
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
        const counts = obs.safety === 'passive' ? passivePropertyCounts : activePropertyCounts
        counts.set(prop, (counts.get(prop) || 0) + 1)
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
    const passivePropSummary = [...passivePropertyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([prop, count]) => `${prop} ×${count}`)
      .join(', ')
    if (passivePropSummary) {
      lines.push(`- ${zh ? '被动声明属性' : 'Passively declared properties'}: ${passivePropSummary}`)
    }
    const activePropSummary = [...activePropertyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([prop, count]) => `${prop} ×${count}`)
      .join(', ')
    if (activePropSummary) {
      lines.push(`- ${zh ? '已执行变化属性' : 'Executed changed properties'}: ${activePropSummary}`)
    }
    const detailObservations = [
      ...new Map(
        [
          ...activeObservations,
          ...passiveObservations.filter((observation) => Object.keys(observation.before).length > 0),
        ].flatMap((observation) => {
          const changes = observation.changedProperties.flatMap((property) => {
            const before = observation.before[property]
            const after = observation.after[property]
            return before !== undefined && after !== undefined && before !== after
              ? [`${property}:${before}->${after}`]
              : []
          })
          return changes.length > 0
            ? [
                [
                  [observation.safety, observation.driver, observation.trigger.kind, changes.join('|')].join('|'),
                  observation,
                ] as const,
              ]
            : []
        }),
      ).values(),
    ]
    if (detailObservations.length > 0) {
      lines.push(`- ${zh ? '代表性状态值' : 'Representative state values'}:`)
    }
    for (const observation of detailObservations.slice(0, 8)) {
      const values = observation.changedProperties
        .flatMap((property) => {
          const before = observation.before[property]
          const after = observation.after[property]
          return before !== undefined && after !== undefined && before !== after
            ? [`${property}: ${before} → ${after}`]
            : []
        })
        .slice(0, 4)
        .join('; ')
      if (!values) continue
      const observationKind =
        observation.safety === 'safe-active'
          ? zh
            ? '安全主动实测'
            : 'safe active observation'
          : zh
            ? '计算样式观察（未点击）'
            : 'computed-state observation (no click)'
      lines.push(`  - \`${observation.driver}\` · ${observationKind}: ${values}`)
    }
  }

  const usefulResponsiveObservations = evidence.responsiveObservations.flatMap((observation) => {
    const section = evidence.sections.find((candidate) => candidate.id === observation.sectionId)
    const changes = Object.entries(observation.changes || {}).filter(([property, values]) =>
      isUsefulResponsiveChange(property, values, section?.role),
    )
    return changes.length > 0 ? [{ observation, section, changes }] : []
  })
  if (usefulResponsiveObservations.length > 0) {
    lines.push('')
    lines.push(zh ? '### 响应式结构观察' : '### Responsive Structure Observations')
    lines.push('')
    for (const { observation, section, changes } of usefulResponsiveObservations.slice(0, 20)) {
      const page = section ? evidence.pages.find((candidate) => candidate.id === section.pageId) : undefined
      const context = `${page?.url || evidence.source.finalUrl} · ${displaySectionRole(section?.role)} · \`${observation.sectionId}\``
      const properties = changes.map(([property]) => property)
      const changeType = displayedResponsiveChangeType(observation.changeType, properties)
      lines.push(
        zh
          ? `- ${context}：${observation.fromViewport} → ${observation.toViewport}，${changeType}（${properties.join('、')}）`
          : `- ${context}: ${observation.fromViewport} → ${observation.toViewport}, ${changeType} (${properties.join(', ')})`,
      )
      const values = changes
        .slice(0, 12)
        .map(([property, value]) => `${property}: ${value.from ?? 'absent'} → ${value.to ?? 'absent'}`)
        .join('; ')
      if (values) lines.push(`  - ${values}`)
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
  'fewer-page-viewports-than-requested': {
    en: 'At least one requested page×viewport capture is missing; cross-viewport coverage is partial',
    zh: '至少缺少一个请求的页面×视口捕获；跨视口覆盖不完整',
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
