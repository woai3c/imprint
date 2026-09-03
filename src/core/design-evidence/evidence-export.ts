import type { DocLanguage } from '../analyzer/agent-guide.js'
import { hasVisibleBorder, hasVisibleColor, hasVisibleShadow } from '../analyzer/component-detect.js'
import { evidencePageRouteIdentity } from '../analyzer/url-identity.js'
import { sanitizeDesignEvidenceForPersistence } from '../analyzer/url-privacy.js'
import { coreTranslator } from '../i18n/index.js'
import { resolveScreenshotAssetCoverage } from './asset-integrity.js'
import { canonicalEvidencePageIds } from './canonical-pages.js'
import { computeInteractionStateMetrics } from './interaction-metrics.js'
import {
  boundedPixelValue,
  displayedResponsiveChangeType,
  hasConsistentResponsiveSectionIdentity,
  usefulResponsiveChanges,
} from './responsive-reliability.js'
import { isContextDependentRadius } from './structural-styles.js'
import { formatPageSectionTopology } from './topology-summary.js'
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

function publicPageScopeLabel(evidence: DesignEvidence, page: DesignEvidence['pages'][number]): string {
  const routeIdentities = new Set(
    evidence.pages.filter((candidate) => candidate.url === page.url).map(evidencePageRouteIdentity),
  )
  return routeIdentities.size > 1 ? `${page.url} [${evidencePageRouteIdentity(page)}]` : page.url
}

const RESPONSIVE_BRIEF_GROUP_LIMIT = 20

interface ResponsiveBriefGroup {
  fromViewport: string
  toViewport: string
  role: string
  changeType: string
  changes: Array<[string, { from?: string | number; to?: string | number }]>
  instanceCount: number
  routes: Map<string, DesignEvidence['pages'][number]>
  signature: string
}

function groupedResponsiveObservations(evidence: DesignEvidence): ResponsiveBriefGroup[] {
  const sectionById = new Map(evidence.sections.map((section) => [section.id, section]))
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const groups = new Map<string, ResponsiveBriefGroup>()
  for (const observation of evidence.responsiveObservations) {
    if (!hasConsistentResponsiveSectionIdentity(observation, evidence)) continue
    const section = sectionById.get(observation.sectionId)
    const changes = usefulResponsiveChanges(observation, section?.role).sort(([first], [second]) =>
      first.localeCompare(second),
    )
    if (changes.length === 0) continue
    const role = displaySectionRole(section?.role)
    const changeType = displayedResponsiveChangeType(
      observation.changeType,
      changes.map(([property]) => property),
    )
    const signature = JSON.stringify([observation.fromViewport, observation.toViewport, role, changeType, changes])
    const group = groups.get(signature) || {
      fromViewport: observation.fromViewport,
      toViewport: observation.toViewport,
      role,
      changeType,
      changes,
      instanceCount: 0,
      routes: new Map(),
      signature,
    }
    group.instanceCount += 1
    const page = section ? pageById.get(section.pageId) : undefined
    if (page) group.routes.set(evidencePageRouteIdentity(page), page)
    groups.set(signature, group)
  }
  return [...groups.values()].sort(
    (first, second) =>
      second.routes.size - first.routes.size ||
      second.instanceCount - first.instanceCount ||
      first.fromViewport.localeCompare(second.fromViewport) ||
      first.toViewport.localeCompare(second.toViewport) ||
      first.role.localeCompare(second.role) ||
      first.changeType.localeCompare(second.changeType) ||
      first.signature.localeCompare(second.signature),
  )
}

function captureScopeLabel(evidence: DesignEvidence, page: DesignEvidence['pages'][number]): string {
  return `\`${page.viewport}\` ${publicPageScopeLabel(evidence, page)}`
}

function compactScopeList(scopes: readonly string[], moreLabel: (count: number) => string): string {
  const uniqueScopes = [...new Set(scopes)]
  const displayed = uniqueScopes.slice(0, 3)
  if (uniqueScopes.length > displayed.length) displayed.push(moreLabel(uniqueScopes.length - displayed.length))
  return displayed.join('; ')
}

function isUsefulPseudoValue(property: string, value: string): boolean {
  if (['backgroundColor', 'color'].includes(property)) return hasVisibleColor(value)
  if (property === 'boxShadow') return hasVisibleShadow(value)
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
  if (hasVisibleColor(styles.backgroundColor)) {
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
    if (styles.borderRadius && !isContextDependentRadius(styles.borderRadius) && /[1-9]/.test(styles.borderRadius)) {
      result.push(['borderRadius', styles.borderRadius])
    }
  }
  return result
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

function appendTypographyRoleMatrix(lines: string[], evidence: DesignEvidence, language: DocLanguage): void {
  const evidenceT = coreTranslator(language, 'designEvidence')
  const canonicalPages = canonicalEvidencePageIds(evidence)
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
    if (!node.textRole || !canonicalPages.has(node.pageId)) continue
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
  lines.push(evidenceT('typographyRole.heading'))
  lines.push('')
  lines.push(evidenceT('typographyRole.countBasis'))
  lines.push('')
  lines.push(evidenceT('typographyRole.header'))
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
  return JSON.stringify(sanitizeDesignEvidenceForPersistence(evidence), null, 2)
}

function renderDesignEvidenceBrief(evidence: DesignEvidence, language: DocLanguage): string {
  const zh = language === 'zh-CN'
  const lines: string[] = []
  const pageCount = new Set(evidence.pages.map(evidencePageRouteIdentity)).size
  const urlCoverage = evidence.coverage.urlCoverage
  const captureCoverage = evidence.coverage.captureCoverage
  const assetCoverage = resolveScreenshotAssetCoverage(evidence)
  const evidenceT = coreTranslator(language, 'designEvidence')
  const coverageT = coreTranslator(language, 'designEvidence.coverage')
  const stateT = coreTranslator(language, 'designEvidence.stateEvidence')
  const responsiveT = coreTranslator(language, 'designEvidence.responsive')
  const termT = coreTranslator(language, 'profileExport')
  const term = (value: string): string => {
    const aliases: Record<string, string> = {
      'node.heading.fontSize': 'headingFontSize',
    }
    return termT(`terms.${aliases[value] || value}`, { defaultValue: value })
  }
  const observedValue = (value: string): string =>
    ['hidden', 'visible', 'true', 'false', 'absent'].includes(value) ? term(value) : value
  const stateMetrics = computeInteractionStateMetrics(evidence)
  const iconRegions = evidence.coverage.mediaCoverage.iconRegions ?? 0

  lines.push(zh ? '## 设计证据概览' : '## Design Evidence Overview')
  lines.push('')
  lines.push(
    zh
      ? '> 层级：Observed / 已观察。以下内容全部来自浏览器观察和确定性代码分析。'
      : '> Layer: Observed. Everything below comes from browser observations and deterministic code analysis.',
  )
  lines.push('')
  lines.push(zh ? `- 来源：${evidence.source.finalUrl}` : `- Final source: ${evidence.source.finalUrl}`)
  lines.push(
    zh
      ? `- 访问方式：${evidence.source.accessMode === 'managed' ? 'Imprint 独立登录会话' : '访客'}`
      : `- Access: ${evidence.source.accessMode === 'managed' ? 'managed Imprint session' : 'anonymous visitor'}`,
  )
  lines.push(
    `- ${coverageT('scopeLine', {
      capturedUrls: urlCoverage?.captured ?? pageCount,
      selectedUrls: urlCoverage?.requested ?? pageCount,
      capturedCaptures: captureCoverage?.captured ?? evidence.pages.length,
      expectedCaptures: captureCoverage?.expected ?? evidence.pages.length,
      captureStatus: coverageT(`status.${captureCoverage?.status || 'complete'}`),
      sections: evidence.sections.length,
      components: evidence.components.length,
    })}`,
  )
  if (captureCoverage?.fullMatrix) {
    lines.push(
      `- ${coverageT('matrixLine', {
        captured: captureCoverage.fullMatrix.captured,
        expected: captureCoverage.fullMatrix.expected,
        status: coverageT(`status.${captureCoverage.fullMatrix.status}`),
      })}`,
    )
  }
  if (captureCoverage?.responsivePairs) {
    lines.push(
      `- ${coverageT('responsivePairLine', {
        captured: captureCoverage.responsivePairs.capturedUrls,
        expected: captureCoverage.responsivePairs.expectedUrls,
        status: coverageT(`status.${captureCoverage.responsivePairs.status}`),
      })}`,
    )
  }
  if (assetCoverage) {
    lines.push(
      `- ${coverageT('assetLine', {
        valid: assetCoverage.valid,
        expected: assetCoverage.expected,
        status: assetCoverage.status,
        issues: assetCoverage.issueCount,
      })}`,
    )
  }
  lines.push(
    stateT('overview', {
      patterns: stateMetrics.dedupedStatePatterns,
      computed: stateMetrics.computedProbedObservations,
      declared: stateMetrics.declaredApplicableObservations,
      passive: stateMetrics.otherPassiveObservations,
      active: stateMetrics.safeActiveObservations,
      skipped: stateMetrics.skippedCandidates,
    }),
  )
  lines.push(
    zh
      ? `- 媒体证据：${evidence.coverage.mediaCoverage.majorRegions} 个主要区域（${evidence.coverage.mediaCoverage.classifiedRegions} 个已分类），另有 ${iconRegions} 个图标实例不计入主要区域`
      : `- Media evidence: ${evidence.coverage.mediaCoverage.majorRegions} major regions (${evidence.coverage.mediaCoverage.classifiedRegions} classified), plus ${iconRegions} icon instances not counted as major regions`,
  )
  lines.push('')

  appendTypographyRoleMatrix(lines, evidence, language)

  lines.push(evidenceT('topology.heading'))
  lines.push('')
  const topologyGroups = new Map<
    string,
    {
      viewport: string
      topology: string
      pagesByRoute: Map<string, DesignEvidence['pages'][number]>
    }
  >()
  const overflowGroups = new Map<
    string,
    {
      viewport: string
      viewportWidth: number
      contentWidth: number
      pagesByRoute: Map<string, DesignEvidence['pages'][number]>
    }
  >()
  // Overflow is a direct page measurement and remains valid even when section topology could not be indexed.
  for (const page of evidence.pages) {
    if (page.horizontalOverflow && page.viewportWidth && page.contentWidth) {
      const overflowKey = `${page.viewport}|${page.contentWidth}|${page.viewportWidth}`
      const group = overflowGroups.get(overflowKey) || {
        viewport: page.viewport,
        viewportWidth: page.viewportWidth,
        contentWidth: page.contentWidth,
        pagesByRoute: new Map<string, DesignEvidence['pages'][number]>(),
      }
      group.pagesByRoute.set(evidencePageRouteIdentity(page), page)
      overflowGroups.set(overflowKey, group)
    }
  }
  for (const topologyPage of evidence.topology.pages) {
    const page = evidence.pages.find((candidate) => candidate.id === topologyPage.pageId)
    if (!page) continue
    const topology = formatPageSectionTopology(evidence, page.id, (role) => term(displaySectionRole(role)))
    if (!topology) continue
    const key = `${page.viewport}|${topology}`
    const group = topologyGroups.get(key) || {
      viewport: page.viewport,
      topology,
      pagesByRoute: new Map<string, DesignEvidence['pages'][number]>(),
    }
    group.pagesByRoute.set(evidencePageRouteIdentity(page), page)
    topologyGroups.set(key, group)
  }
  for (const group of overflowGroups.values()) {
    const pages = [...group.pagesByRoute.values()]
    const examples = compactScopeList(
      pages.map((page) => publicPageScopeLabel(evidence, page)),
      (count) => evidenceT('structure.scopeMore', { count }),
    )
    const scope = evidenceT('topology.routeGroup', { count: pages.length, viewport: group.viewport, examples })
    lines.push(
      zh
        ? `- ${scope}：检测到横向溢出（内容 ${group.contentWidth}px > 视口 ${group.viewportWidth}px）；视口外内容不能视为已隐藏或已重排`
        : `- ${scope}: horizontal overflow observed (content ${group.contentWidth}px > viewport ${group.viewportWidth}px); off-screen content is not evidence of hiding or reflow`,
    )
  }
  for (const group of topologyGroups.values()) {
    const pages = [...group.pagesByRoute.values()]
    const examples = compactScopeList(
      pages.map((page) => publicPageScopeLabel(evidence, page)),
      (count) => evidenceT('structure.scopeMore', { count }),
    )
    const scope = evidenceT('topology.routeGroup', { count: pages.length, viewport: group.viewport, examples })
    lines.push(`- ${scope}: ${group.topology}`)
  }

  const canonicalPages = canonicalEvidencePageIds(evidence)
  const pagesById = new Map(evidence.pages.map((page) => [page.id, page]))
  const structuralFacts = evidence.sections.flatMap((section) => {
    if (!canonicalPages.has(section.pageId)) return []
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
    const page = pagesById.get(section.pageId)
    return facts.length > 0 && page ? [{ section, page, facts }] : []
  })
  const structuralGroups = new Map<
    string,
    {
      role: string
      facts: string[]
      count: number
      scopes: string[]
    }
  >()
  for (const item of structuralFacts) {
    const role = displaySectionRole(item.section.role)
    const key = `${role}|${item.facts.join('|')}`
    const group = structuralGroups.get(key) || { role, facts: item.facts, count: 0, scopes: [] }
    group.count += 1
    group.scopes.push(captureScopeLabel(evidence, item.page))
    structuralGroups.set(key, group)
  }
  if (structuralGroups.size > 0) {
    lines.push('')
    lines.push(evidenceT('structure.heading'))
    lines.push('')
    for (const group of [...structuralGroups.values()].slice(0, 24)) {
      const scope = compactScopeList(group.scopes, (count) => evidenceT('structure.scopeMore', { count }))
      const support = evidenceT('structure.ownerScope', { count: group.count, scope })
      lines.push(`- ${group.role} · ${support} — ${group.facts.map((fact) => `\`${fact}\``).join(' · ')}`)
    }
  }

  if ((evidence.pseudoElements?.length || 0) > 0) {
    const canonicalPages = canonicalEvidencePageIds(evidence)
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
    lines.push(stateT('passiveSummary', { count: passiveObservations.length }))
    const passiveSummary = [...passiveCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([state, count]) => `${state} ×${count}`)
      .join(', ')
    if (passiveSummary) lines.push(`${stateT('nonClickStates')}: ${passiveSummary}`)
    lines.push(stateT('safeActiveSummary', { count: activeObservations.length }))
    const activeDriverSummary = [...activeDriverCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([driver, count]) => `${driver} ×${count}`)
      .join(', ')
    if (activeDriverSummary) lines.push(`- ${zh ? '实际驱动' : 'Executed drivers'}: ${activeDriverSummary}`)
    const passivePropSummary = [...passivePropertyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([prop, count]) => `${term(prop)} ×${count}`)
      .join(', ')
    if (passivePropSummary) {
      lines.push(`${stateT('nonClickProperties')}: ${passivePropSummary}`)
    }
    const activePropSummary = [...activePropertyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([prop, count]) => `${term(prop)} ×${count}`)
      .join(', ')
    if (activePropSummary) {
      lines.push(`- ${zh ? '已执行变化属性' : 'Executed changed properties'}: ${activePropSummary}`)
    }
    const detailObservations = [
      ...new Map(
        [...activeObservations, ...passiveObservations].flatMap((observation) => {
          const changes = observation.changedProperties.flatMap((property) => {
            const before = observation.before[property]
            const after = observation.after[property]
            if (after === undefined || before === after) return []
            return [before === undefined ? `${property}:${after}` : `${property}:${before}->${after}`]
          })
          return changes.length > 0
            ? [
                [
                  [
                    observation.safety,
                    observation.source || '',
                    observation.driver,
                    observation.trigger.kind,
                    changes.join('|'),
                  ].join('|'),
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
          if (after === undefined || before === after) return []
          return [
            before === undefined
              ? `${term(property)}: ${observedValue(after)}`
              : `${term(property)}: ${observedValue(before)} → ${observedValue(after)}`,
          ]
        })
        .slice(0, 4)
        .join('; ')
      if (!values) continue
      const observationKind =
        observation.safety === 'safe-active'
          ? stateT('safeActive')
          : observation.source === 'computed-probed'
            ? stateT('computedProbed')
            : observation.source === 'declared-applicable'
              ? stateT('declaredApplicable')
              : stateT('passive')
      lines.push(`  - \`${observation.driver}\` · ${observationKind}: ${values}`)
    }
  }

  const responsiveGroups = groupedResponsiveObservations(evidence)
  if (responsiveGroups.length > 0) {
    lines.push('')
    lines.push(responsiveT('heading'))
    lines.push('')
    for (const group of responsiveGroups.slice(0, RESPONSIVE_BRIEF_GROUP_LIMIT)) {
      const properties = group.changes.map(([property]) => property)
      const examples = compactScopeList(
        [...group.routes.entries()]
          .sort(([first], [second]) => first.localeCompare(second))
          .map(([, page]) => publicPageScopeLabel(evidence, page)),
        (count) => evidenceT('structure.scopeMore', { count }),
      )
      lines.push(
        responsiveT('groupLine', {
          from: term(group.fromViewport),
          to: term(group.toViewport),
          role: term(group.role),
          change: term(group.changeType),
          properties: properties.map(term).join(responsiveT('propertySeparator')),
          routeSupport: responsiveT('routeSupport', { count: group.routes.size }),
          instanceSupport: responsiveT('instanceSupport', { count: group.instanceCount }),
          examples: responsiveT('examples', { examples }),
        }),
      )
      const values = group.changes
        .slice(0, 12)
        .map(([property, value]) => `${term(property)}: ${value.from ?? 'absent'} → ${value.to ?? 'absent'}`)
        .join(responsiveT('valueSeparator'))
      if (values) lines.push(`  - ${values}`)
    }
  }

  const limitationKeys = [
    ...evidence.limitations,
    ...(evidence.responsiveObservations.some(
      (observation) => !hasConsistentResponsiveSectionIdentity(observation, evidence),
    )
      ? ['responsive-section-identity-mismatch']
      : []),
  ]
  const humanLimitations = [
    ...new Set([...new Set(limitationKeys)].map((l) => humanizeLimitation(l, zh)).filter(Boolean) as string[]),
  ]
  if (humanLimitations.length > 0) {
    lines.push('')
    lines.push(zh ? '### 分析局限' : '### Analysis Limitations')
    lines.push('')
    for (const text of humanLimitations) lines.push(`- ${text}`)
  }

  return lines.join('\n')
}

/** Public Markdown projection: keep observations while removing private URLs and internal implementation locators. */
export function generateDesignEvidenceBrief(evidence: DesignEvidence, language: DocLanguage = 'en'): string {
  return renderDesignEvidenceBrief(sanitizeDesignEvidenceForPersistence(evidence), language)
}

const LIMITATION_LABELS: Record<string, { en: string; zh: string }> = {
  'fewer-pages-than-requested': {
    en: 'Some automatically selected pages could not be captured; conclusions cover completed pages only',
    zh: '部分自动选定页面未能完成捕获；本文结论仅覆盖已完成页面',
  },
  'fewer-page-viewports-than-requested': {
    en: 'At least one planned page×viewport capture is missing; cross-viewport coverage is partial',
    zh: '至少缺少一个计划中的页面×视口捕获；跨视口覆盖不完整',
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
  const t = coreTranslator(zh ? 'zh-CN' : 'en', 'designEvidence.limitations')
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
    const adaptiveOverflow =
      /^page-(\d+):mobile-adaptive:(?:capture-)?health:(?:horizontal-overflow|content-width)$/.exec(stage)
    const dimensions = /^(\d+)\/(\d+)$/.exec(reason) || /^viewport (\d+), content (\d+)$/.exec(reason)
    if (adaptiveOverflow && dimensions) {
      return t('adaptiveMobileHorizontalOverflow', {
        page: adaptiveOverflow[1],
        viewport: dimensions[1],
        content: dimensions[2],
      })
    }
    return zh ? `提取阶段 ${stage}：${reason}` : `Extraction stage ${stage}: ${reason}`
  }
  if (key === 'adaptive-mobile-budget-exceeded') return t('adaptiveMobileBudgetExceeded')
  if (key === 'adaptive-mobile-skipped-budget') return t('adaptiveMobileSkippedBudget')
  if (key === 'fewer-pages-than-requested') return t('selectedPagesIncomplete')
  if (key === 'fewer-page-viewports-than-requested') return t('plannedCapturesIncomplete')
  if (key === 'query-route-redacted') return t('queryRouteRedacted')
  if (key.startsWith('page-health:partial-overlay@')) return t('partialOverlay')
  if (key === 'responsive-section-identity-mismatch') return t('responsiveSectionIdentityMismatch')
  if (key === 'breakpoint-stylesheets-unreadable') return t('breakpointStylesheetsUnreadable')
  const label = LIMITATION_LABELS[key]
  if (label) return zh ? label.zh : label.en
  if (key.startsWith('page-health:') || key.startsWith('skipped:') || key.startsWith('skipped-interaction:'))
    return null
  return key
}
