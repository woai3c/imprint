import { normalizeColorValue } from '../analyzer/color-cluster.js'
import {
  classifyComponentVariant,
  hasVisibleShadow,
  isOutlinedButton,
  isPillRadius,
} from '../analyzer/component-detect.js'
import type { ComponentType } from '../analyzer/component-detect.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import type { DesignClaim, DesignProfile } from './types.js'

export interface ContradictionCheckResult {
  profile: DesignProfile
  rejected: string[]
}

const CSS_LENGTH = /-?\d+(?:\.\d+)?(?:px|rem|em)\b/gi
const FONT_WEIGHT = /\b(?:font[- ]?weight|字重)\D{0,12}(\d{3})\b/gi
const MAXIMUM_WORD = /\b(?:max(?:imum)?|highest|largest)\b|最大|最高/i
const MINIMUM_WORD = /\b(?:min(?:imum)?|lowest|smallest)\b|最小|最低/i
const RANGE_WORD = /\b(?:range|from\s+\d+\s+to|between\s+\d+\s+and)\b|范围|从\s*\d+\s*到/i
const ONLY_COUNT = /\b(?:only|exactly)\s+(\d+)\s+(?:font\s*)?weights?\b|(?:仅有|只有|恰好)\s*(\d+)\s*种?字重/i
const COLOR_LITERAL = /#[\da-f]{3,8}\b|rgba?\([^)]+\)/gi
const PRIMARY_BUTTON_ASSERTION =
  /\b(?:primary|main)\s+(?:button|action|cta)\b|(?:主按钮|主操作|主要操作|主要行动|一级按钮|(?:一级|主要|主)\s*CTA)/i
const OUTLINED_BUTTON_ASSERTION =
  /\b(?:outlined?|bordered)\s+(?:button|action|cta)s?\b|(?:描边|边框)(?:式)?按钮|按钮[^。！？]{0,16}(?:描边|边框)/i
const PRIMARY_BUTTON_NON_PILL_ASSERTION =
  /\b(?:square|sharp[- ]cornered|small[- ]radius|compact[- ]radius)\b|(?:主按钮|主行动|主要行动|主\s*CTA)[^。！？]{0,32}(?:方块|直角|小圆角|不(?:加|用|要)[^。！？]{0,8}(?:大圆角|胶囊))/i
const PILL_COMPONENT_ASSERTION = /\bpill(?:-shaped)?\b|胶囊(?:形|轮廓|式)?/i
const NEGATED_PILL_COMPONENT_ASSERTION =
  /\b(?:avoid|not|never|without)\b[^.!?]{0,20}\bpill(?:-shaped)?\b|(?:避免|不要|不得|不能|不是|并非|无)[^。！？]{0,12}胶囊/i
const UNIVERSAL_SMALL_BUTTON_RADIUS_ASSERTION =
  /\b(?:all|every)\s+buttons?[^.!?]{0,48}(?:small|minimal|compact)\s+(?:corner\s+)?radius|buttons?[^.!?]{0,40}(?:uniform|consistent)[^.!?]{0,24}(?:small|minimal|compact)\s+(?:corner\s+)?radius|按钮[^。！？]{0,32}(?:统一|一律|全部|均|维持|保持)[^。！？]{0,16}小圆角/i
const UNIVERSAL_NO_SHADOW_BUTTON_ASSERTION =
  /\b(?:all|every)\s+buttons?[^.!?]{0,40}(?:no\s+(?:box[- ]?)?shadow|box-shadow\s*:\s*none)|buttons?[^.!?]{0,44}(?:always|uniformly|consistently)[^.!?]{0,24}(?:no\s+(?:box[- ]?)?shadow|box-shadow\s*:\s*none)|按钮[^。！？]{0,24}(?:一律|全部|均|统一|维持)[^。！？]{0,20}(?:无阴影|boxShadow\s*:\s*none)/i
const RESPONSIVE_CHANGE_ASSERTION =
  /(?:\b(?:mobile|narrow|small[- ]screen|compact viewport)\b[^.!?;]{0,80}\b(?:reflows?|stacks?|hides?|collapses?|single[- ]column|one[- ]column|fits?)\b|\b(?:reflows?|stacks?|hides?|collapses?|single[- ]column|one[- ]column)\b[^.!?;]{0,80}\b(?:mobile|narrow|small[- ]screen|compact viewport)\b)|(?:移动端|窄屏|小屏|窄视口)[^。！？；]{0,48}(?:重排|堆叠|隐藏|收起|改单列|单列|适配|完整容纳)|(?:重排|堆叠|隐藏|收起|改单列|单列)[^。！？；]{0,48}(?:移动端|窄屏|小屏|窄视口)/i
const RESPONSIVE_VISIBILITY_ASSERTION =
  /(?:\b(?:mobile|narrow|small[- ]screen|compact viewport)\b[^.!?;]{0,80}\b(?:hides?|hidden|collapses?)\b|\b(?:hides?|hidden|collapses?)\b[^.!?;]{0,80}\b(?:mobile|narrow|small[- ]screen|compact viewport)\b)|(?:移动端|窄屏|小屏|窄视口)[^。！？；]{0,48}(?:隐藏|收起)|(?:隐藏|收起)[^。！？；]{0,48}(?:移动端|窄屏|小屏|窄视口)/i
const RESPONSIVE_REFLOW_ASSERTION =
  /(?:\b(?:mobile|narrow|small[- ]screen|compact viewport)\b[^.!?;]{0,80}\b(?:reflows?|stacks?|single[- ]column|one[- ]column)\b|\b(?:reflows?|stacks?|single[- ]column|one[- ]column)\b[^.!?;]{0,80}\b(?:mobile|narrow|small[- ]screen|compact viewport)\b)|(?:移动端|窄屏|小屏|窄视口)[^。！？；]{0,48}(?:重排|堆叠|改单列|单列)|(?:重排|堆叠|改单列|单列)[^。！？；]{0,48}(?:移动端|窄屏|小屏|窄视口)/i
const RESPONSIVE_CONTENT_PRESERVATION_ASSERTION =
  /\b(?:rather\s+than|without|but\s+not|and\s+not)\s+(?:remov(?:e|ing)|hid(?:e|ing)|omitt?(?:ing)?)\b|(?:而非|而不是|并非|不会|不应|不要|且不|但不)(?:移除|隐藏|删去|省略)(?:内容|元素|区块)?/i
const REPEATED_CARD_GRAMMAR_ASSERTION =
  /\b(?:repeated|recurring)\s+(?:white\s+)?cards?\b|\bcard\s+flow\b|(?:重复|反复|连续)(?:的)?(?:白色)?卡片|卡片(?:流|单元)[^。！？]{0,24}(?:重复|反复|节奏)/i
const FONT_WEIGHT_TIER_COUNT =
  /字重(?:分|有|包含)?\s*(\d+|[一二两三四五六七八九十]+)\s*(?:个|种)?(?:层级|档位|级)|\bfont[- ]?weights?\b[^.!?]{0,24}\b(\d+)\s+(?:observed\s+)?(?:tiers?|levels?)\b|\b(\d+)\s+(?:font[- ]?)?weight\s+(?:tiers?|levels?)\b/i
const UNIVERSAL_VISUAL_SCOPE =
  /\b(?:all|every)\s+(?:content\s+)?(?:buttons?|cards?|modules?|sections?|surfaces?|components?)\b|(?:所有|全部|每个)(?:内容)?(?:按钮|卡片|模块|区块|表面|组件)|(?:按钮|卡片|模块|区块|表面|组件)[^。！？]{0,12}一律/i
const NEGATED_UNIVERSAL_SCOPE =
  /\b(?:avoid|do\s+not|don['’]t|never)\b[^.!?]{0,48}\b(?:all|every)\b|(?:不要|避免|切勿|不得)[^。！？]{0,48}(?:所有|全部|每个|一律)/i
const EXHAUSTIVE_RESPONSIVE_LIST_ASSERTION =
  /\b(?:only|sole)\b[^.!?]{0,48}\b(?:record(?:ed|s)?|observ(?:ed|es)?)\b|(?:只|仅)(?:记录|观察|检测)到/i
const HEADER_RELATIVE_POSITION_ASSERTION =
  /(?:\b(?:header|top\s*bar|app\s*bar)\b[^.!?]{0,64}\brelative\s+position(?:ed|ing)?\b|(?:顶栏|头部|顶部栏)[^。！？]{0,40}相对定位)/i

function normalizeLength(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.endsWith('px')) return `${Number.parseFloat(normalized) / 16}rem`
  if (normalized.endsWith('em')) return `${Number.parseFloat(normalized)}rem`
  return normalized
}

type LengthContext = 'typography' | 'spacing' | 'radius' | 'border'

function lengthTokenPrefix(context: LengthContext, text: string, literal: string): string {
  if (context === 'spacing') return 'spacing.'
  if (context === 'radius') return 'radius.'
  if (context === 'border') return 'border.'
  const index = text.toLowerCase().indexOf(literal.toLowerCase())
  const nearby = index >= 0 ? text.slice(Math.max(0, index - 28), index + literal.length + 28) : text
  if (/line.?height|行高/i.test(nearby)) return 'typography.line-height.'
  if (/letter.?spacing|字距/i.test(nearby)) return 'typography.letter-spacing.'
  return 'typography.font-size.'
}

function replaceUnsupportedLength(text: string, literal: string, groundedValue: string) {
  return text.replace(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), groundedValue)
}

function tokenRefValue(evidence: DesignEvidence, ref: string): string | undefined {
  const dot = ref.lastIndexOf('.')
  if (dot <= 0) return undefined
  const index = Number.parseInt(ref.slice(dot + 1), 10) - 1
  if (!Number.isInteger(index) || index < 0) return undefined
  const group = ref.slice(0, dot)
  if (group === 'border') return evidence.tokens.borders[index]?.match(CSS_LENGTH)?.[0]
  const groups: Record<string, readonly string[]> = {
    'typography.font-size': evidence.tokens.typography.fontSizes,
    'typography.line-height': evidence.tokens.typography.lineHeights,
    'typography.letter-spacing': evidence.tokens.typography.letterSpacings,
    spacing: evidence.tokens.spacing,
    radius: evidence.tokens.radii,
  }
  return groups[group]?.[index]
}

function literalMatchesLengthContext(text: string, literal: string, context: LengthContext): boolean {
  const pattern = new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  let found = false
  for (const match of text.matchAll(pattern)) {
    found = true
    const index = match.index || 0
    const nearby = text.slice(Math.max(0, index - 36), index + literal.length + 36)
    const withoutTypographyHeight = nearby.replace(/line[- ]?height|letter[- ]?spacing|行高|字距/gi, '')
    if (
      /\b(?:width|height|min-width|max-width|min-height|max-height|diameter)\b|宽度|高度|直径/i.test(
        withoutTypographyHeight,
      )
    ) {
      return false
    }
    const markers = {
      typography: /font|type|typography|line[- ]?height|letter[- ]?spacing|body text|字号|字体|行高|字距|排版/i,
      spacing: /spacing|gap|padding|margin|rhythm|offset|section gap|间距|留白|边距|偏移/i,
      radius: /radius|rounded|corner|圆角/i,
      border: /border|outline|边框|边界|描边/i,
    }
    if (!markers[context].test(nearby)) return false
    if (Object.entries(markers).some(([kind, marker]) => kind !== context && marker.test(nearby))) return false
  }
  return found
}

function claimText(claim: DesignClaim): string {
  return `${claim.statement} ${claim.implementation}`
}

function removeUnsupportedResponsiveSegments(value: string): string {
  return value
    .split(/(?<=[。！？.!?；;])\s*/)
    .filter((segment) => !RESPONSIVE_CHANGE_ASSERTION.test(segment))
    .join(' ')
    .replace(/[；;]\s*$/, '')
    .trim()
}

function removeUnsupportedContentPreservation(value: string): string {
  return value
    .replace(
      /[，,]?\s*(?:而非|而不是|并非|不会|不应|不要|且不|但不)(?:移除|隐藏|删去|省略)(?:内容|元素|区块)?[^。！？；;]*/gi,
      '',
    )
    .replace(
      /,?\s*(?:rather\s+than|without|but\s+not|and\s+not)\s+(?:remov(?:e|ing)|hid(?:e|ing)|omitt?(?:ing)?)[^.!?;]*/gi,
      '',
    )
    .replace(/\s+([。！？.!?；;])/g, '$1')
    .trim()
}

function replaceRepeatedCardGrammar(value: string, language: DesignProfile['language']): string {
  return language === 'zh-CN'
    ? value
        .replace(/(?:重复|反复|连续)(?:的)?(?:白色)?卡片(?:单元)?/g, '重复的内容单元')
        .replace(/卡片流/g, '内容流')
        .replace(/卡片单元/g, '内容单元')
        .replace(/卡片之间/g, '内容单元之间')
    : value
        .replace(/(?:repeated|recurring)\s+(?:white\s+)?cards?/gi, 'repeated content units')
        .replace(/card flow/gi, 'content flow')
}

function repairPrimaryPillClaim(claim: DesignClaim, language: DesignProfile['language']): void {
  if (language === 'zh-CN') {
    claim.statement = '已引用的主按钮是紧凑的实心胶囊按钮，使用强调色填充和对比前景。'
    claim.implementation = '主 CTA 保留已观察到的胶囊轮廓与紧凑尺寸；不要将它改写成方形或小圆角按钮。'
  } else {
    claim.statement = 'The cited primary button is a compact solid pill with an accent fill and contrasting foreground.'
    claim.implementation =
      'Keep the observed pill silhouette and compact size for the primary CTA; do not rewrite it as square or small-radius.'
  }
}

function repairUnsupportedPillClaim(
  claim: DesignClaim,
  components: DesignEvidence['components'],
  componentContext: (component: DesignEvidence['components'][number]) => {
    tokenRefs: string[]
    primaryColor: string | undefined
    role: string | undefined
    widthPx?: number
    heightPx?: number
  },
  language: DesignProfile['language'],
): void {
  const rounded = components.some(
    (component) =>
      !isPillRadius(component.styles, componentContext(component)) && /[1-9]/.test(component.styles.borderRadius || ''),
  )
  const replacement =
    language === 'zh-CN'
      ? rounded
        ? '已观察到的圆角'
        : '已观察到的直角'
      : rounded
        ? 'observed rounded'
        : 'observed sharp-cornered'
  claim.statement = claim.statement.replace(PILL_COMPONENT_ASSERTION, replacement)
  claim.implementation = claim.implementation.replace(PILL_COMPONENT_ASSERTION, replacement)
}

function responsivePropertyLabel(property: string, language: DesignProfile['language']): string {
  const normalized = property.replace(/^node\.[^.]+\./, '')
  if (language !== 'zh-CN') return normalized.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  const labels: Record<string, string> = {
    layoutMode: '布局模式',
    position: '定位',
    height: '高度',
    borderTop: '上边框',
    borderRight: '右边框',
    borderBottom: '下边框',
    borderLeft: '左边框',
    boxShadow: '阴影',
    order: '顺序',
    display: '显示方式',
    gridTemplateColumns: '网格列',
    childGridTemplateColumns: '子网格列',
    fontSize: '字号',
    lineHeight: '行高',
  }
  return labels[normalized] || normalized
}

function repairExhaustiveResponsiveClaim(
  claim: DesignClaim,
  observations: DesignEvidence['responsiveObservations'],
  language: DesignProfile['language'],
): void {
  const properties = [
    ...new Set(
      observations.flatMap((observation) =>
        observation.changedProperties.filter(
          (property) =>
            !property.startsWith('rect.') &&
            property !== 'visibility' &&
            /^(?:order|layoutMode|position|display|height|gridTemplateColumns|childGridTemplateColumns|maxWidth|gap|padding|border|boxShadow|node\.)/.test(
              property,
            ),
        ),
      ),
    ),
  ]
    .slice(0, 10)
    .map((property) => responsivePropertyLabel(property, language))
  const uniqueProperties = [...new Set(properties)]
  const transitions = [
    ...new Set(observations.map((observation) => `${observation.fromViewport} → ${observation.toViewport}`)),
  ].join(', ')
  if (language === 'zh-CN') {
    claim.statement = `引用的响应式证据在 ${transitions} 间记录了${uniqueProperties.join('、')}变化。`
    claim.implementation = '逐项实现直接观察到的变化；不要把部分属性列表写成完整响应式行为。'
  } else {
    claim.statement = `The cited responsive evidence records ${uniqueProperties.join(', ')} changes across ${transitions}.`
    claim.implementation =
      'Implement each directly observed change; do not present a partial property list as the complete responsive behavior.'
  }
}

function scopeHeaderPositioning(
  claim: DesignClaim,
  observation: DesignEvidence['responsiveObservations'][number],
  language: DesignProfile['language'],
): void {
  const change = observation.changes?.position
  const from = change?.from === undefined ? 'relative' : String(change.from)
  const to = change?.to === undefined ? 'fixed' : String(change.to)
  const transition = `${observation.fromViewport} → ${observation.toViewport}`
  const companionProperties = [
    ...new Set(
      observation.changedProperties
        .filter((property) => property !== 'position' && !property.startsWith('rect.') && property !== 'visibility')
        .map((property) => responsivePropertyLabel(property, language)),
    ),
  ]
  if (language === 'zh-CN') {
    claim.statement = `顶栏定位在 ${transition} 间由 ${from} 变为 ${to}。`
    claim.implementation = `按已观察的视口范围实现定位切换${companionProperties.length > 0 ? `，并保留同一响应式证据中的${companionProperties.join('、')}变化` : ''}。`
  } else {
    claim.statement = `Header positioning changes from ${from} to ${to} across ${transition}.`
    claim.implementation = `Implement the positioning change at the observed viewport range${companionProperties.length > 0 ? ` and preserve ${companionProperties.join(', ')} changes from the same responsive evidence` : ''}.`
  }
}

function replaceFontWeightTierCount(value: string, count: number, language: DesignProfile['language']): string {
  return value.replace(
    new RegExp(FONT_WEIGHT_TIER_COUNT.source, 'gi'),
    language === 'zh-CN' ? `字重包含 ${count} 个观察档位` : `font weights include ${count} observed tiers`,
  )
}

function parsedTierCount(value: string): number | null {
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10)
  const chineseNumbers: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  }
  return chineseNumbers[value] ?? null
}

function softenUniversalVisualScope(value: string, language: DesignProfile['language']): string {
  if (language === 'zh-CN') {
    return value
      .replace(/(?:所有|全部|每个)(?=(?:内容)?(?:按钮|卡片|模块|区块|表面|组件))/g, '已观察到的')
      .replace(/((?:按钮|卡片|模块|区块|表面|组件)[^。！？]{0,12})一律/g, '$1')
  }
  return value.replace(
    /\b(?:all|every)\s+(?=(?:content\s+)?(?:buttons?|cards?|modules?|sections?|surfaces?|components?)\b)/gi,
    'observed ',
  )
}

function numericLength(value: string): number | null {
  const normalized = normalizeLength(value)
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)rem$/)
  return match ? Number.parseFloat(match[1]) : null
}

function boundaryMismatch(text: string, values: number[], mentioned: number[]): string | null {
  if (values.length === 0 || mentioned.length === 0) return null
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  if (MAXIMUM_WORD.test(text) && !mentioned.includes(maximum)) return `maximum(${mentioned.join(',')}!=${maximum})`
  if (MINIMUM_WORD.test(text) && !mentioned.includes(minimum)) return `minimum(${mentioned.join(',')}!=${minimum})`
  if (RANGE_WORD.test(text) && (Math.min(...mentioned) !== minimum || Math.max(...mentioned) !== maximum)) {
    return `range(${Math.min(...mentioned)}-${Math.max(...mentioned)}!=${minimum}-${maximum})`
  }
  return null
}

function colorRolesByValue(evidence: DesignEvidence): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const [name, value] of Object.entries(evidence.tokens.colors)) {
    const normalized = normalizeColorValue(value)
    if (!normalized) continue
    const roles = result.get(normalized) || new Set<string>()
    const sources = evidence.tokens.evidence?.[`colors.${name}`]?.sources || []
    for (const source of sources) {
      if (/primary-action|action|selected|link|accent|brand/i.test(source)) roles.add('action')
      if (/rendered:text|textColor|text/i.test(source)) roles.add('text')
      if (/bgArea|bgColor|background|surface/i.test(source)) roles.add('background')
      if (/border/i.test(source)) roles.add('border')
    }
    result.set(normalized, roles)
  }
  return result
}

function assertedColorRole(context: string): string | null {
  if (/\b(?:text|foreground)\s+colou?r\b|文字色|文本色|前景色/i.test(context)) return 'text'
  if (/\b(?:background|surface)\s+colou?r\b|背景色|表面色/i.test(context)) return 'background'
  if (/\bborder\s+colou?r\b|边框色/i.test(context)) return 'border'
  if (/\b(?:action|button|link|accent)\s+colou?r\b|操作色|按钮色|链接色|强调色/i.test(context)) return 'action'
  return null
}

function colorRoleMismatch(text: string, rolesByValue: Map<string, Set<string>>): string | null {
  for (const match of text.matchAll(COLOR_LITERAL)) {
    const normalized = normalizeColorValue(match[0])
    if (!normalized) continue
    const start = Math.max(0, (match.index || 0) - 48)
    const context = text.slice(start, (match.index || 0) + match[0].length + 48)
    const asserted = assertedColorRole(context)
    const observed = rolesByValue.get(normalized)
    if (asserted && observed && observed.size > 0 && !observed.has(asserted)) {
      return `${normalized}:${asserted}!=${[...observed].sort().join('|')}`
    }
  }
  return null
}

function replacementClaim(claim: DesignClaim, language: DesignProfile['language']): DesignClaim {
  return {
    statement:
      language === 'zh-CN'
        ? '该规则的精确边界未被确定性证据支持。'
        : 'The exact boundary of this rule is not supported by deterministic evidence.',
    implementation:
      language === 'zh-CN'
        ? '仅使用已提取的令牌值和用途，并在实现前复核该规则。'
        : 'Use only extracted token values and observed roles, then verify this rule before implementation.',
    confidence: 'low',
    evidence: claim.evidence.slice(0, 2),
    ...(claim.tokenRefs && claim.tokenRefs.length > 0 ? { tokenRefs: claim.tokenRefs } : {}),
  }
}

export function checkProfileContradictions(
  inputProfile: DesignProfile,
  evidence: DesignEvidence,
): ContradictionCheckResult {
  const profile = structuredClone(inputProfile)
  const rejected: string[] = []
  const hardRejectedClaims = new WeakSet<object>()
  const knownTokenRefs = new Set([
    ...evidence.sections.flatMap((section) => section.tokenRefs),
    ...evidence.components.flatMap((component) => component.tokenRefs),
    ...evidence.layoutNodes.flatMap((node) => node.tokenRefs),
  ])
  const tokenRefsByEvidenceId = new Map<string, string[]>([
    ...evidence.sections.map((section) => [section.id, section.tokenRefs] as const),
    ...evidence.components.map((component) => [component.id, component.tokenRefs] as const),
    ...evidence.layoutNodes.map((node) => [node.id, node.tokenRefs] as const),
  ])
  const knownLengths = {
    typography: new Set(
      [
        ...evidence.tokens.typography.fontSizes,
        ...evidence.tokens.typography.lineHeights,
        ...evidence.tokens.typography.letterSpacings,
      ].map(normalizeLength),
    ),
    spacing: new Set(evidence.tokens.spacing.map(normalizeLength)),
    radius: new Set(evidence.tokens.radii.map(normalizeLength)),
    border: new Set(
      evidence.tokens.borders.flatMap((border) =>
        [...border.matchAll(CSS_LENGTH)].map((match) => normalizeLength(match[0])),
      ),
    ),
  }
  const knownWeights = new Set(evidence.tokens.typography.fontWeights.map((value) => value.trim()))
  const knownWeightValues = [...knownWeights].map(Number).filter(Number.isFinite)
  const rolesByColor = colorRolesByValue(evidence)
  const pageByEvidenceId = new Map<string, DesignEvidence['pages'][number]>()
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const sectionById = new Map(evidence.sections.map((section) => [section.id, section]))
  for (const page of evidence.pages) {
    pageByEvidenceId.set(page.id, page)
    page.images.forEach((image) => pageByEvidenceId.set(image.id, page))
  }
  for (const section of evidence.sections) pageByEvidenceId.set(section.id, pageById.get(section.pageId)!)
  for (const component of evidence.components) {
    const section = sectionById.get(component.sectionId)
    if (section) pageByEvidenceId.set(component.id, pageById.get(section.pageId)!)
  }
  for (const node of evidence.layoutNodes) {
    const section = sectionById.get(node.sectionId)
    if (section) pageByEvidenceId.set(node.id, pageById.get(section.pageId)!)
  }
  for (const observation of [...evidence.interactionObservations, ...evidence.responsiveObservations]) {
    const section = sectionById.get(observation.sectionId)
    if (section) pageByEvidenceId.set(observation.id, pageById.get(section.pageId)!)
  }
  const activeInteractionIds = new Set(
    evidence.interactionObservations
      .filter((observation) => observation.safety === 'safe-active')
      .map((observation) => observation.id),
  )
  const interactionById = new Map(
    evidence.interactionObservations.map((observation) => [observation.id, observation] as const),
  )
  const responsiveIds = new Set(evidence.responsiveObservations.map((observation) => observation.id))
  const responsiveById = new Map(evidence.responsiveObservations.map((observation) => [observation.id, observation]))
  const componentsById = new Map<string, DesignEvidence['components']>()
  for (const component of evidence.components) {
    const components = componentsById.get(component.id) || []
    components.push(component)
    componentsById.set(component.id, components)
  }
  const componentContext = (component: DesignEvidence['components'][number]) => {
    const page = pageById.get(component.pageId)
    const pageWidth = page?.contentWidth || page?.viewportWidth
    const pageHeight = page?.contentHeight || page?.viewportHeight
    return {
      tokenRefs: component.tokenRefs,
      primaryColor: evidence.tokens.colors.primary,
      role: component.role,
      ...(pageWidth ? { widthPx: component.rect.width * pageWidth } : {}),
      ...(pageHeight ? { heightPx: component.rect.height * pageHeight } : {}),
    }
  }
  const allButtons = evidence.components.filter((component) => component.type === 'button')
  const hasPillButtons = allButtons.some((component) => isPillRadius(component.styles, componentContext(component)))
  const hasShadowedButtons = allButtons.some((component) => hasVisibleShadow(component.styles.boxShadow))
  const headerPositionChanges = evidence.responsiveObservations.filter((observation) => {
    const section = sectionById.get(observation.sectionId)
    return section?.role === 'header' && observation.changedProperties.includes('position')
  })

  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`))
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const isClaim =
      typeof record.statement === 'string' &&
      typeof record.implementation === 'string' &&
      typeof record.confidence === 'string' &&
      Array.isArray(record.evidence)
    if (isClaim) {
      const claim = record as unknown as DesignClaim
      let text = claimText(claim)
      let buttonRadiusSanitized = false
      const hardReject = (reason: string) => {
        hardRejectedClaims.add(record)
        rejected.push(`${path}:${reason}`)
      }
      if (claim.tokenRefs) {
        const filtered = claim.tokenRefs.filter((tokenRef) => knownTokenRefs.has(tokenRef))
        if (filtered.length !== claim.tokenRefs.length) rejected.push(`${path}:unknown-token-ref`)
        claim.tokenRefs = filtered
      }

      const lengthKind: LengthContext | null =
        /typography/i.test(path) ||
        /font|type|typography|line.?height|letter.?spacing|字号|字体|行高|字距|排版/i.test(text)
          ? 'typography'
          : /border|outline|边框|边界|描边/i.test(text)
            ? 'border'
            : /visualLanguage\.shape/i.test(path) || /radius|rounded|corner|圆角/i.test(text)
              ? 'radius'
              : /densityAndWhitespace|\.rhythm/i.test(path) ||
                  /spacing|gap|padding|margin|rhythm|间距|留白|边距/i.test(text)
                ? 'spacing'
                : null
      const lengthContext = lengthKind ? knownLengths[lengthKind] : null
      if (lengthContext) {
        const unknownValues = [
          ...new Set(
            [...text.matchAll(CSS_LENGTH)]
              .map((match) => match[0])
              .filter((value) => !lengthContext.has(normalizeLength(value))),
          ),
        ]
        for (const unknown of unknownValues) {
          const tokenPrefix = lengthTokenPrefix(lengthKind as LengthContext, text, unknown)
          const matchingClaimRefs = [
            ...new Set(
              (claim.tokenRefs || []).filter(
                (tokenRef) => knownTokenRefs.has(tokenRef) && tokenRef.startsWith(tokenPrefix),
              ),
            ),
          ]
          const matchingEvidenceRefs = [
            ...new Set(
              claim.evidence
                .flatMap((reference) => tokenRefsByEvidenceId.get(reference.evidenceId) || [])
                .filter((tokenRef) => knownTokenRefs.has(tokenRef) && tokenRef.startsWith(tokenPrefix)),
            ),
          ]
          const groundedTokenRef =
            matchingClaimRefs.length === 1
              ? matchingClaimRefs[0]
              : matchingClaimRefs.length === 0 && matchingEvidenceRefs.length === 1
                ? matchingEvidenceRefs[0]
                : undefined
          const groundedValue = groundedTokenRef ? tokenRefValue(evidence, groundedTokenRef) : undefined
          if (
            !groundedTokenRef ||
            !groundedValue ||
            !literalMatchesLengthContext(text, unknown, lengthKind as LengthContext)
          )
            continue
          claim.statement = replaceUnsupportedLength(claim.statement, unknown, groundedValue)
          claim.implementation = replaceUnsupportedLength(claim.implementation, unknown, groundedValue)
          claim.tokenRefs = [...new Set([...(claim.tokenRefs || []), groundedTokenRef])]
          if (claim.confidence === 'high') claim.confidence = 'medium'
          rejected.push(`${path}:numeric-value-sanitized(${unknown}->${groundedTokenRef})`)
          text = claimText(claim)
        }
        const remainingUnknown = [...text.matchAll(CSS_LENGTH)]
          .map((match) => match[0])
          .find((value) => !lengthContext.has(normalizeLength(value)))
        if (remainingUnknown) {
          hardReject(`numeric-value-not-in-token-set(${remainingUnknown})`)
        } else {
          const mentioned = [...text.matchAll(CSS_LENGTH)]
            .map((match) => numericLength(match[0]))
            .filter((value): value is number => value !== null)
          const actual = [...lengthContext].map(numericLength).filter((value): value is number => value !== null)
          const mismatch = boundaryMismatch(text, actual, mentioned)
          if (mismatch) hardReject(`numeric-boundary-contradiction(${mismatch})`)
        }
      }
      const mentionsFontWeight = /font[- ]?weights?|字重/i.test(text)
      const mentionedWeights = mentionsFontWeight
        ? [...text.matchAll(/\b[1-9]00\b/g)].map((match) => Number(match[0]))
        : [...text.matchAll(FONT_WEIGHT)].map((match) => Number(match[1]))
      const unknownWeight = mentionedWeights.find((weight) => !knownWeights.has(String(weight)))
      if (unknownWeight) {
        hardReject(`font-weight-not-in-token-set(${unknownWeight})`)
      } else if (mentionsFontWeight) {
        const mismatch = boundaryMismatch(text, knownWeightValues, mentionedWeights)
        const onlyCount = text.match(ONLY_COUNT)
        if (mismatch) hardReject(`font-weight-boundary-contradiction(${mismatch})`)
        if (onlyCount && Number(onlyCount[1] || onlyCount[2]) !== knownWeightValues.length) {
          hardReject(`font-weight-count-contradiction(${onlyCount[1] || onlyCount[2]}!=${knownWeightValues.length})`)
        }
        const tierCount = text.match(FONT_WEIGHT_TIER_COUNT)
        const statedTierCount = tierCount ? parsedTierCount(tierCount[1] || tierCount[2] || tierCount[3]) : null
        if (statedTierCount !== null && statedTierCount !== knownWeightValues.length) {
          claim.statement = replaceFontWeightTierCount(claim.statement, knownWeightValues.length, profile.language)
          claim.implementation = replaceFontWeightTierCount(
            claim.implementation,
            knownWeightValues.length,
            profile.language,
          )
          if (claim.confidence === 'high') claim.confidence = 'medium'
          rejected.push(`${path}:font-weight-tier-count-sanitized(${statedTierCount}->${knownWeightValues.length})`)
          text = claimText(claim)
        }
      }
      const roleMismatch = colorRoleMismatch(text, rolesByColor)
      if (roleMismatch) hardReject(`color-role-contradiction(${roleMismatch})`)

      const referencedPages = claim.evidence
        .map((reference) => pageByEvidenceId.get(reference.evidenceId))
        .filter((page): page is DesignEvidence['pages'][number] => Boolean(page))
      const referencesOverflow = referencedPages.some((page) => page.horizontalOverflow)
      const referencesResponsive = claim.evidence.some((reference) => responsiveIds.has(reference.evidenceId))
      const referencedResponsiveObservations = claim.evidence
        .map((reference) => responsiveById.get(reference.evidenceId))
        .filter((observation): observation is DesignEvidence['responsiveObservations'][number] => Boolean(observation))
      const referencesNonOverflowMobile = referencedPages.some(
        (page) => page.viewport === 'mobile' && !page.horizontalOverflow,
      )
      const assertsResponsiveChange = RESPONSIVE_CHANGE_ASSERTION.test(text)
      if (assertsResponsiveChange && !referencesResponsive && !referencesNonOverflowMobile) {
        const statement = removeUnsupportedResponsiveSegments(claim.statement)
        const implementation = removeUnsupportedResponsiveSegments(claim.implementation)
        if (!statement) {
          hardReject('responsive-claim-without-mobile-evidence')
        } else {
          claim.statement = statement
          claim.implementation =
            implementation ||
            (profile.language === 'zh-CN'
              ? '仅复用已观察到的结构；移动端行为需由对应的响应式或移动端证据确认。'
              : 'Reuse only the observed structure; verify mobile behavior with matching responsive or mobile evidence.')
          if (claim.confidence === 'high') claim.confidence = 'medium'
          rejected.push(`${path}:responsive-wording-without-mobile-evidence-sanitized`)
          text = claimText(claim)
        }
      }
      if (referencesOverflow && !referencesResponsive && assertsResponsiveChange) {
        hardReject('overflow-does-not-prove-reflow')
      }
      const hasDirectHiddenState = referencedResponsiveObservations.some((observation) =>
        Object.entries(observation.changes || {}).some(
          ([property, change]) =>
            change.from !== change.to &&
            ((/(?:^|\.)display$/i.test(property) && /^none$/i.test(String(change.to))) ||
              (/(?:^|\.)visibility$/i.test(property) && /^(?:hidden|collapse)$/i.test(String(change.to)))),
        ),
      )
      if (RESPONSIVE_VISIBILITY_ASSERTION.test(text) && !hasDirectHiddenState) {
        const statement = removeUnsupportedResponsiveSegments(claim.statement)
        const implementation = removeUnsupportedResponsiveSegments(claim.implementation)
        if (!statement) hardReject('responsive-hiding-without-direct-evidence')
        else {
          claim.statement = statement
          claim.implementation =
            implementation ||
            (profile.language === 'zh-CN'
              ? '仅复用已直接观察到的响应式属性；元素缺席不能证明其被 CSS 隐藏。'
              : 'Reuse only directly observed responsive properties; capture absence does not prove CSS hiding.')
          if (claim.confidence === 'high') claim.confidence = 'medium'
          rejected.push(`${path}:responsive-hiding-wording-sanitized`)
          text = claimText(claim)
        }
      }
      if (RESPONSIVE_CONTENT_PRESERVATION_ASSERTION.test(text)) {
        const statement = removeUnsupportedContentPreservation(claim.statement)
        const implementation = removeUnsupportedContentPreservation(claim.implementation)
        if (!statement) hardReject('responsive-content-preservation-without-direct-evidence')
        else {
          claim.statement = statement
          claim.implementation =
            implementation ||
            (profile.language === 'zh-CN'
              ? '只实现已观察到的视口变化；未逐项验证的内容可见性仍需单独确认。'
              : 'Implement only observed viewport changes; verify unobserved content visibility separately.')
          if (claim.confidence === 'high') claim.confidence = 'medium'
          rejected.push(`${path}:responsive-content-preservation-wording-sanitized`)
          text = claimText(claim)
        }
      }
      if (referencedResponsiveObservations.length > 0 && EXHAUSTIVE_RESPONSIVE_LIST_ASSERTION.test(text)) {
        repairExhaustiveResponsiveClaim(claim, referencedResponsiveObservations, profile.language)
        if (claim.confidence === 'high') claim.confidence = 'medium'
        rejected.push(`${path}:responsive-property-list-sanitized`)
        text = claimText(claim)
      }
      if (
        headerPositionChanges.length > 0 &&
        HEADER_RELATIVE_POSITION_ASSERTION.test(text) &&
        claim.evidence.some((reference) =>
          headerPositionChanges.some(
            (observation) => reference.evidenceId === observation.id || reference.evidenceId === observation.sectionId,
          ),
        )
      ) {
        const observation = headerPositionChanges.find((candidate) =>
          claim.evidence.some(
            (reference) => reference.evidenceId === candidate.id || reference.evidenceId === candidate.sectionId,
          ),
        )
        if (observation) scopeHeaderPositioning(claim, observation, profile.language)
        if (observation && !claim.evidence.some((reference) => reference.evidenceId === observation.id)) {
          claim.evidence.push({
            evidenceId: observation.id,
            note: profile.language === 'zh-CN' ? '顶栏定位随视口变化' : 'Header positioning changes across viewports',
          })
        }
        if (claim.confidence === 'high') claim.confidence = 'medium'
        rejected.push(`${path}:header-position-scope-sanitized`)
        text = claimText(claim)
      }
      const hasDirectReflow = referencedResponsiveObservations.some((observation) =>
        Object.entries(observation.changes || {}).some(
          ([property, change]) =>
            change.from !== change.to &&
            ['gridTemplateColumns', 'childGridTemplateColumns', 'layoutMode'].includes(property),
        ),
      )
      if (RESPONSIVE_REFLOW_ASSERTION.test(text) && !hasDirectReflow) {
        const statement = removeUnsupportedResponsiveSegments(claim.statement)
        const implementation = removeUnsupportedResponsiveSegments(claim.implementation)
        if (!statement) hardReject('responsive-reflow-without-direct-evidence')
        else {
          claim.statement = statement
          claim.implementation =
            implementation ||
            (profile.language === 'zh-CN'
              ? '仅保留已观察到的顺序变化；order 变化本身不能证明单列化或重排。'
              : 'Keep only the observed ordering change; order alone does not prove single-column reflow.')
          if (claim.confidence === 'high') claim.confidence = 'medium'
          rejected.push(`${path}:responsive-reflow-wording-sanitized`)
          text = claimText(claim)
        }
      }

      const assertsExecutedInteraction =
        /\b(?:click(?:ed|ing)?|after click|press(?:ed|ing)?|after press|expanded|toggled|opened|closed|navigated)\b|点击|按压|按下|展开后|切换后|打开后|关闭后|跳转后/i.test(
          text,
        )
      const hasActiveInteraction = claim.evidence.some((reference) => activeInteractionIds.has(reference.evidenceId))
      if (assertsExecutedInteraction && !hasActiveInteraction) {
        const passiveObservations = claim.evidence
          .map((reference) => interactionById.get(reference.evidenceId))
          .filter(
            (observation): observation is DesignEvidence['interactionObservations'][number] =>
              observation?.safety === 'passive',
          )
        if (passiveObservations.length > 0) {
          if (/^transferRules\.(?:preserve|adapt|avoid)\./.test(path)) {
            hardReject('passive-interaction-transfer-rule-sanitized')
          } else {
            const properties = [...new Set(passiveObservations.flatMap((observation) => observation.changedProperties))]
              .sort()
              .slice(0, 8)
            const propertyList =
              properties.length > 0 ? properties.join(profile.language === 'zh-CN' ? '、' : ', ') : ''
            claim.statement =
              profile.language === 'zh-CN'
                ? `被动状态声明记录了${propertyList ? ` ${propertyList} 的` : ''}样式差异，但没有执行真实按压或点击。`
                : `Passive state declarations record${propertyList ? ` ${propertyList}` : ''} style differences, but no real press or click was executed.`
            claim.implementation =
              profile.language === 'zh-CN'
                ? '仅将这些差异作为声明态样式复用；实际交互反馈需在执行相应操作后验证。'
                : 'Reuse these differences only as declared-state styling; verify actual feedback after executing the corresponding interaction.'
            claim.confidence = 'low'
            text = claimText(claim)
            rejected.push(`${path}:passive-interaction-wording-sanitized`)
          }
        } else {
          hardReject('passive-evidence-cannot-prove-executed-interaction')
        }
      }
      if (
        evidence.source.accessMode === 'managed' &&
        /\b(?:logged out|guest page|login wall|authentication wall)\b|未登录|游客页|登录墙/i.test(text)
      ) {
        hardReject('managed-access-contradiction')
      }
      if (/dark-palette-\d+\D{0,20}(?:equals|matches|corresponds|对应|等同)\D{0,20}palette-\d+/i.test(text)) {
        hardReject('dark-palette-index-assumption')
      }
      const referencedComponents = claim.evidence.flatMap((reference) => componentsById.get(reference.evidenceId) || [])
      const referencedButtons = referencedComponents.filter((component) => component.type === 'button')
      const referencedCards = referencedComponents.filter((component) => component.type === 'card')
      const assertsPrimaryButton = PRIMARY_BUTTON_ASSERTION.test(text)
      const assertsOutlinedButton = OUTLINED_BUTTON_ASSERTION.test(text)
      const assertsUniversalSmallButtonRadius = UNIVERSAL_SMALL_BUTTON_RADIUS_ASSERTION.test(text)
      const assertsUniversalNoShadowButton = UNIVERSAL_NO_SHADOW_BUTTON_ASSERTION.test(text)
      const assertsPillComponent = PILL_COMPONENT_ASSERTION.test(text) && !NEGATED_PILL_COMPONENT_ASSERTION.test(text)
      if (REPEATED_CARD_GRAMMAR_ASSERTION.test(text) && referencedCards.length === 0) {
        claim.statement = replaceRepeatedCardGrammar(claim.statement, profile.language)
        claim.implementation = replaceRepeatedCardGrammar(claim.implementation, profile.language)
        if (claim.confidence === 'high') claim.confidence = 'medium'
        rejected.push(`${path}:unbound-card-grammar-sanitized`)
        text = claimText(claim)
      }
      if (assertsPrimaryButton) {
        const referencedButtonVariants = referencedButtons.map((component) =>
          classifyComponentVariant(component.type as ComponentType, component.styles, componentContext(component)),
        )
        if (referencedButtonVariants.length > 0 && !referencedButtonVariants.includes('primary')) {
          hardReject(`component-variant-contradiction(primary!=${[...new Set(referencedButtonVariants)].join('|')})`)
        }
        const referencedPrimaryButtons = referencedButtons.filter(
          (component) =>
            classifyComponentVariant(component.type as ComponentType, component.styles, componentContext(component)) ===
            'primary',
        )
        if (
          !hardRejectedClaims.has(record) &&
          referencedPrimaryButtons.length > 0 &&
          referencedPrimaryButtons.every((component) => isPillRadius(component.styles, componentContext(component))) &&
          PRIMARY_BUTTON_NON_PILL_ASSERTION.test(text)
        ) {
          repairPrimaryPillClaim(claim, profile.language)
          if (claim.confidence === 'high') claim.confidence = 'medium'
          rejected.push(`${path}:primary-pill-shape-sanitized`)
          text = claimText(claim)
        }
      }
      if (
        !hardRejectedClaims.has(record) &&
        assertsPillComponent &&
        referencedComponents.length > 0 &&
        referencedComponents.every((component) => !isPillRadius(component.styles, componentContext(component)))
      ) {
        repairUnsupportedPillClaim(claim, referencedComponents, componentContext, profile.language)
        if (claim.confidence === 'high') claim.confidence = 'medium'
        rejected.push(`${path}:unsupported-pill-shape-sanitized`)
        text = claimText(claim)
      }
      if (
        !hardRejectedClaims.has(record) &&
        assertsOutlinedButton &&
        referencedButtons.length > 0 &&
        !referencedButtons.some((component) => isOutlinedButton(component.styles))
      ) {
        hardReject('button-outline-contradiction')
      }
      if (!hardRejectedClaims.has(record) && hasPillButtons && assertsUniversalSmallButtonRadius) {
        if (UNIVERSAL_SMALL_BUTTON_RADIUS_ASSERTION.test(claim.statement)) {
          claim.statement =
            profile.language === 'zh-CN'
              ? '普通表面以小圆角为主，按钮另有胶囊或圆形变体。'
              : 'Ordinary surfaces use compact radii, while buttons also include pill or circular variants.'
        }
        claim.implementation =
          profile.language === 'zh-CN'
            ? '普通卡片和输入框沿用已观察的小圆角；按钮应按证据分别复用小圆角与胶囊形变体。'
            : 'Reuse observed compact radii for ordinary cards and inputs; preserve compact and pill button variants separately from their evidence.'
        if (claim.confidence === 'high') claim.confidence = 'medium'
        buttonRadiusSanitized = true
        rejected.push(`${path}:button-radius-variants-sanitized`)
        text = claimText(claim)
      }
      if (!hardRejectedClaims.has(record) && hasShadowedButtons && assertsUniversalNoShadowButton) {
        claim.statement = buttonRadiusSanitized
          ? profile.language === 'zh-CN'
            ? '保留紧凑圆角和低投影语言，并区分胶囊按钮及少量浅阴影按钮变体。'
            : 'Preserve compact radii and low elevation while distinguishing pill and lightly shadowed button variants.'
          : profile.language === 'zh-CN'
            ? '整体表面保持低投影；多数按钮无阴影，少量浮动工具按钮使用浅阴影。'
            : 'Surfaces stay low-elevation overall; most buttons are flat while a few floating tools use light shadows.'
        claim.implementation =
          profile.language === 'zh-CN'
            ? '按组件证据区分无阴影常规按钮与带浅阴影的浮动工具按钮，不把任一变体扩展为全局规则。'
            : 'Distinguish flat ordinary buttons from lightly shadowed floating tools using component evidence; do not generalize either variant globally.'
        if (claim.confidence === 'high') claim.confidence = 'medium'
        rejected.push(`${path}:button-shadow-universal-sanitized`)
        text = claimText(claim)
      }
      if (
        !hardRejectedClaims.has(record) &&
        /^transferRules\.avoid\./.test(path) &&
        /\bbuttons?\b|按钮/i.test(text) &&
        /\b(?:second|another)\s+accent\s+colou?r\b|第二种强调色|另一种强调色/i.test(text)
      ) {
        const mentionsShadow = /\bshadow\b|投影/i.test(text)
        claim.statement = claim.statement
          .replace(/\b(?:second|another)\s+accent\s+colou?r\b/gi, 'second action hue')
          .replace(/(?:第二种|另一种)强调色/g, '第二种操作色相')
        claim.implementation =
          profile.language === 'zh-CN'
            ? `${mentionsShadow ? '常规按钮保持已观察到的低投影层级，并' : ''}沿用已观察到的操作色族；状态、趋势和装饰色按各自证据保留，不并入按钮主次层级。`
            : `${mentionsShadow ? 'Keep ordinary buttons at the observed low elevation and ' : ''}reuse the observed action color family; preserve status, trend, and decorative colors from their own evidence instead of folding them into button hierarchy.`
        rejected.push(`${path}:button-accent-scope-sanitized`)
        text = claimText(claim)
      }
      if (!hardRejectedClaims.has(record) && UNIVERSAL_VISUAL_SCOPE.test(text) && !NEGATED_UNIVERSAL_SCOPE.test(text)) {
        claim.statement = softenUniversalVisualScope(claim.statement, profile.language)
        claim.implementation = softenUniversalVisualScope(claim.implementation, profile.language)
        if (claim.confidence === 'high') claim.confidence = 'medium'
        rejected.push(`${path}:universal-visual-scope-sanitized`)
        text = claimText(claim)
      }
    }
    Object.entries(record).forEach(([key, item]) => {
      if (!isClaim || !['statement', 'implementation', 'confidence', 'evidence', 'tokenRefs'].includes(key)) {
        visit(item, path ? `${path}.${key}` : key)
      }
    })
  }

  visit(profile, '')
  const prune = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const item = value[index]
        if (item && typeof item === 'object' && hardRejectedClaims.has(item)) value.splice(index, 1)
        else prune(item)
      }
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    for (const [key, item] of Object.entries(record)) {
      if (item && typeof item === 'object' && hardRejectedClaims.has(item)) {
        if (['imagery', 'motion', 'scrollNarrative'].includes(key)) delete record[key]
        else record[key] = replacementClaim(item as DesignClaim, profile.language)
      } else {
        prune(item)
      }
    }
  }
  prune(profile)
  const hasMappedOverflowSource = evidence.pages.some(
    (page) => page.horizontalOverflow && page.horizontalOverflowSources?.some((source) => source.sectionId),
  )
  const hasObservedLayoutModeChange = evidence.responsiveObservations.some((observation) =>
    observation.changedProperties.includes('layoutMode'),
  )
  if (hasObservedLayoutModeChange) {
    const deniesLayoutModeEvidence =
      /\b(?:no|without|missing|lacks?)\b[^.]{0,48}\blayout(?:[ -]mode)?\b[^.]{0,28}\b(?:changes?|evidence)\b|(?:无|未(?:观察|检测|发现)?到|没有|缺少)[^。]{0,36}布局(?:模式)?[^。]{0,24}(?:变化|证据)/i
    profile.uncertainties = profile.uncertainties.map((item, index) => {
      if (!deniesLayoutModeEvidence.test(item.reason)) return item
      rejected.push(`uncertainties.${index}:contradicts-responsive-layout-facts`)
      const overflowObserved = evidence.pages.some((page) => page.horizontalOverflow)
      return {
        ...item,
        topic: profile.language === 'zh-CN' ? '响应式布局范围' : 'Responsive layout scope',
        reason:
          profile.language === 'zh-CN'
            ? overflowObserved
              ? hasMappedOverflowSource
                ? '已观察到局部布局模式变化并定位了横向溢出的页面及关联区块，但裁切范围和预期移动端行为仍需确认。'
                : '已观察到局部布局模式变化，但横向溢出的具体来源和影响范围仍需确认。'
              : '已观察到局部布局模式变化，但其适用范围和跨页面一致性仍需确认。'
            : overflowObserved
              ? hasMappedOverflowSource
                ? 'Local layout-mode changes were observed and the overflowing page and source section were located, but the clipping scope and intended mobile behavior still need confirmation.'
                : 'Local layout-mode changes were observed, but the source and scope of horizontal overflow still need confirmation.'
              : 'Local layout-mode changes were observed, but their scope and cross-page consistency still need confirmation.',
      }
    })
  }
  if (hasMappedOverflowSource) {
    const mentionsOverflow = /horizontal[- ]overflow(?:-observed)?|横向溢出|水平溢出/i
    const deniesLocatedOverflowSource =
      /(?:横向溢出|水平溢出)[^。]{0,16}(?:未定位|无法定位|定位不明)|(?:未给出|未提供|未标注|未指明|未说明|无法|不能|未能|尚未|缺少|没有)[^。]{0,64}(?:来源|溢出源|源区块|关联区块|具体区块|区块|section|page|定位|裁切范围|宽度阈值)|(?:来源|溢出源|源区块|关联区块|具体区块|区块|section|page|裁切范围|宽度阈值)[^。]{0,64}(?:未给出|未提供|未标注|未指明|未说明|无法|不能|未能|尚未|缺少|没有)|\b(?:cannot|unable to|could not|missing|lacks?|no|not provided|not identified|unspecified)\b[^.]{0,64}\b(?:locate|identify|source|section|page|clipping scope|width threshold)\b|\b(?:source|section|page|clipping scope|width threshold)\b[^.]{0,64}\b(?:cannot|unable|missing|unknown|not provided|not identified|unspecified)\b/i
    profile.uncertainties = profile.uncertainties.map((item, index) => {
      const text = `${item.topic} ${item.reason}`
      if (!mentionsOverflow.test(text) || !deniesLocatedOverflowSource.test(text)) return item
      rejected.push(`uncertainties.${index}:contradicts-overflow-source-facts`)
      return {
        ...item,
        topic: profile.language === 'zh-CN' ? '水平溢出细节' : 'Horizontal overflow details',
        reason:
          profile.language === 'zh-CN'
            ? '已定位到发生横向溢出的页面及关联区块，但裁切范围和预期移动端行为仍需确认。'
            : 'The page and source section with horizontal overflow were located, but the clipping scope and intended mobile behavior still need confirmation.',
        neededEvidence:
          profile.language === 'zh-CN' ? '裁切范围与预期移动端行为' : 'Clipping scope and intended mobile behavior',
      }
    })
  }
  const mobileCaptures = evidence.pages.filter((page) => page.viewport === 'mobile' && page.images.length > 0)
  if (mobileCaptures.length >= 2) {
    const topologyByPageId = new Map(evidence.topology.pages.map((page) => [page.pageId, page]))
    const mobileSequenceCount = mobileCaptures.filter(
      (page) => (topologyByPageId.get(page.id)?.sectionIds.length || 0) > 0,
    ).length
    const understatesMobileCaptures =
      /(?:移动端|mobile)[^。\.]{0,56}(?:仅|只有|only)[^。\.]{0,40}(?:一个|1\s*个?|one|page-)[^。\.]{0,40}(?:截图|捕获|screenshot|capture)/i
    const deniesMobileSequences =
      /(?:移动端|mobile)[^。\.]{0,80}(?:(?:区块序列|section\s*[-_]?\s*sequence)[^。\.]{0,24}(?:为空|空白|无|没有|缺少|未提供|(?:is\s+)?empty|missing|not provided)|(?:无|没有|缺少|未提供|为空|空白|no|without|missing|empty)[^。\.]{0,40}(?:区块序列|section\s*[-_]?\s*sequence))/i
    profile.uncertainties = profile.uncertainties.map((item, index) => {
      const text = `${item.topic} ${item.reason}`
      if (!understatesMobileCaptures.test(text) && !(mobileSequenceCount > 0 && deniesMobileSequences.test(text))) {
        return item
      }
      rejected.push(`uncertainties.${index}:contradicts-mobile-capture-facts`)
      return {
        ...item,
        topic: profile.language === 'zh-CN' ? '移动端结构覆盖' : 'Mobile structure coverage',
        reason:
          profile.language === 'zh-CN'
            ? `已采集 ${mobileCaptures.length} 个移动端页面/视口且均有截图，其中 ${mobileSequenceCount} 个包含区块序列；尚未覆盖的页面及跨页一致性仍需确认。`
            : `${mobileCaptures.length} mobile page/viewport captures include screenshots, and ${mobileSequenceCount} include section sequences; uncaptured pages and cross-page consistency still need confirmation.`,
        neededEvidence:
          profile.language === 'zh-CN'
            ? '尚未采集的移动端页面及跨页一致性'
            : 'Uncaptured mobile pages and cross-page consistency',
      }
    })
  }
  if (knownTokenRefs.size > 0) {
    const claimsUnknownTokenRefs =
      /(?:referenced\s+tokens?|token\s+refs?|被引用的令牌|令牌引用)[^。\.]{0,64}(?:undefined|unknown|missing|absent|not defined|not present|未定义|不存在|缺失|未出现|未出现在)|(?:undefined|unknown|missing|absent|not defined|not present|未定义|不存在|缺失|未出现|未出现在)[^。\.]{0,64}(?:referenced\s+tokens?|token\s+refs?|被引用的令牌|令牌引用)/i
    profile.uncertainties = profile.uncertainties.filter((item, index) => {
      const text = `${item.topic} ${item.reason}`
      const mentionedTokenRefs = [...text.matchAll(/\b(?:color\.[a-z0-9-]+|(?:typography\.)?[a-z-]+\.\d+)\b/gi)].map(
        (match) => match[0],
      )
      const deniesKnownTokenFacts =
        /tokenFacts/i.test(text) &&
        mentionedTokenRefs.length > 0 &&
        mentionedTokenRefs.every((tokenRef) => knownTokenRefs.has(tokenRef))
      if (!claimsUnknownTokenRefs.test(text) && !deniesKnownTokenFacts) return true
      rejected.push(`uncertainties.${index}:contradicts-validated-token-refs`)
      return false
    })
  }
  const seenUncertainties = new Set<string>()
  profile.uncertainties = profile.uncertainties
    .filter((item) => {
      const key = `${item.topic.trim()}|${item.reason.replace(/\s+/g, ' ').trim()}`
      if (seenUncertainties.has(key)) return false
      seenUncertainties.add(key)
      return true
    })
    .slice(0, 12)
  return { profile, rejected }
}
