import { isPillRadius } from './component-detect.js'
import type { ComponentVariantPattern } from './component-detect.js'
import type { DesignToken, GeneratedExampleComponent } from './types.js'

export type DocLanguage = 'en' | 'zh-CN'

/**
 * Generate an Agent Prompt Guide section for DESIGN.md.
 * Tells AI coding agents how to use the extracted tokens.
 * Pure code — generates a template-based guide.
 */
export function generateAgentGuide(tokens: DesignToken, url?: string, language: DocLanguage = 'en'): string {
  const zh = language === 'zh-CN'
  const lines: string[] = []
  const siteName = url ? new URL(url).hostname.replace('www.', '') : zh ? '目标站点' : 'target site'

  lines.push(zh ? '## 给 AI 的使用说明' : '## Agent Prompt Guide')
  lines.push('')
  lines.push(
    zh
      ? `使用这些设计令牌生成与 ${siteName} 视觉风格一致的 UI。`
      : `Use these design tokens to generate UI that matches the visual style of ${siteName}.`,
  )
  lines.push('')

  // Example component prompt
  lines.push(zh ? '### 示例组件提示' : '### Example Component Prompt')
  lines.push('')
  lines.push('```')
  lines.push(
    zh ? `使用 ${siteName} 设计系统构建一个卡片组件：` : `Build a card component using the ${siteName} design system:`,
  )
  lines.push(`- Background: var(--color-${tokens.colors['surface'] ? 'surface' : 'background'})`)
  lines.push(`- Text: var(--color-foreground)`)
  lines.push(`- Border radius: var(--radius-${tokens.radii.length > 1 ? 'md' : 'sm'})`)
  if (tokens.shadows.length > 0) {
    lines.push(`- Shadow: var(--shadow-sm)`)
  }
  lines.push(`- Padding: var(--spacing-${Math.min(4, tokens.spacing.length)})`)
  lines.push('```')
  lines.push('')

  // Implementation order
  lines.push(zh ? '### 实施顺序' : '### Implementation Order')
  lines.push('')
  if (zh) {
    lines.push('1. 建立 CSS 变量（颜色、字体、间距）')
    lines.push('2. 用间距令牌搭建基础布局')
    lines.push('3. 按字号阶梯设置排版')
    lines.push('4. 添加组件级样式（边框、阴影、圆角）')
    lines.push('5. 实现交互状态（hover/焦点颜色）')
  } else {
    lines.push('1. Set up CSS variables (colors, typography, spacing)')
    lines.push('2. Apply base layout with spacing tokens')
    lines.push('3. Style typography using font scale')
    lines.push('4. Add component-level styles (borders, shadows, radii)')
    lines.push('5. Implement interaction states (hover/focus colors)')
  }
  lines.push('')

  // Token usage reference
  lines.push(zh ? '### 令牌使用速查' : '### Token Usage Reference')
  lines.push('')
  lines.push(zh ? '| 场景 | 令牌模式 |' : '| Context | Token Pattern |')
  lines.push('|---------|--------------|')
  lines.push(zh ? '| 页面背景 | `--color-background` |' : '| Page background | `--color-background` |')
  lines.push(zh ? '| 卡片/容器 | `--color-surface` |' : '| Card/surface | `--color-surface` |')
  lines.push(zh ? '| 正文文字 | `--color-foreground` |' : '| Body text | `--color-foreground` |')
  lines.push(zh ? '| 辅助文字 | `--color-muted-foreground` |' : '| Muted/secondary text | `--color-muted-foreground` |')
  lines.push(zh ? '| 主操作 | `--color-primary` |' : '| Primary action | `--color-primary` |')
  lines.push(zh ? '| 边框 | `--color-border` 或 `--border-*` |' : '| Borders | `--color-border` or `--border-*` |')
  lines.push(
    zh
      ? '| 间距（内边距/间隙） | `--spacing-1` 到 `--spacing-N` |'
      : '| Spacing (padding/gap) | `--spacing-1` through `--spacing-N` |',
  )
  lines.push(zh ? '| 圆角 | `--radius-sm/md/lg` |' : '| Border radius | `--radius-sm/md/lg` |')
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate a Design Principles section for DESIGN.md.
 * Universal composition rules (proximity, alignment, repetition, contrast)
 * grounded in the extracted tokens — no generic textbook definitions.
 */
export function generateDesignPrinciples(tokens: DesignToken, language: DocLanguage = 'en'): string {
  const zh = language === 'zh-CN'
  const lines: string[] = []

  lines.push(zh ? '## 设计原则' : '## Design Principles')
  lines.push('')
  lines.push(
    zh
      ? '使用这些令牌进行排版组合的规则，由提取数值推导。'
      : 'Composition rules for using these tokens, derived from the extracted values.',
  )
  lines.push('')

  // Proximity — derived from the spacing scale
  if (tokens.spacing.length > 0) {
    const related = tokens.spacing[0]
    const group = tokens.spacing[Math.min(3, tokens.spacing.length - 1)]
    lines.push(zh ? '### 亲密性' : '### Proximity')
    lines.push('')
    lines.push(
      zh
        ? `- 相关元素间距保持在 \`${related}\` 以内，分组之间使用 \`${group}\` 以上的间隔`
        : `- Keep related items within \`${related}\`; separate groups with \`${group}\` or more`,
    )
    lines.push(
      zh ? '- 用间距刻度分组，而不是堆砌分割线' : '- Group with space from the scale instead of adding divider lines',
    )
    lines.push('')
  }

  // Alignment — scale discipline
  lines.push(zh ? '### 对齐' : '### Alignment')
  lines.push('')
  lines.push(
    zh
      ? '- 重复模块对齐到统一边线；尺寸与间距只取刻度值，不产生刻度外的任意值'
      : '- Align repeated blocks to shared edges; size and space with the scale steps, never off-scale values',
  )
  lines.push(zh ? '- 同一区块内文本列保持统一起始边' : '- Keep text columns on one inline start within a section')
  lines.push('')

  // Repetition — token reuse
  lines.push(zh ? '### 重复' : '### Repetition')
  lines.push('')
  const counts = zh
    ? [
        `${Object.keys(tokens.colors).length} 种颜色`,
        `${tokens.typography.fontSizes.length} 个字号`,
        `${tokens.radii.length} 档圆角`,
      ]
    : [
        `${Object.keys(tokens.colors).length} colors`,
        `${tokens.typography.fontSizes.length} font sizes`,
        `${tokens.radii.length} radii`,
      ]
  if (tokens.shadows.length > 0)
    counts.push(zh ? `${tokens.shadows.length} 级阴影` : `${tokens.shadows.length} shadows`)
  lines.push(
    zh
      ? `- 严格复用提取刻度（${counts.join('、')}），不发明近似值`
      : `- Reuse the extracted scale exactly (${counts.join(', ')}) — never invent near-duplicate values`,
  )
  lines.push(
    zh
      ? '- 一致性来自重复复用令牌，而非装饰单个元素'
      : '- Coherence comes from repeating the same tokens, not from decorating individual elements',
  )
  lines.push('')

  // Contrast — hierarchy
  lines.push(zh ? '### 对比' : '### Contrast')
  lines.push('')
  const hasMuted = Object.keys(tokens.colors).some((name) => name.includes('muted'))
  const hasPrimary = Object.keys(tokens.colors).some((name) => name.includes('primary'))
  if (hasMuted) {
    lines.push(
      zh
        ? '- 正文用前景色，次要信息用柔和色（muted）'
        : '- Use the foreground color for primary text and the muted color for secondary text',
    )
  } else {
    lines.push(
      zh
        ? '- 用提取的最深与最浅文字色建立层级，而非只靠字号'
        : '- Establish text hierarchy with the darkest and lightest extracted text colors, not size alone',
    )
  }
  if (hasPrimary) {
    lines.push(
      zh
        ? '- 主色每屏只承载一个关键操作，次要操作保持中性'
        : '- Reserve the primary color for one key action per view; supporting actions stay neutral',
    )
  }
  lines.push(
    zh
      ? '- hover、焦点、选中状态与操作色保持同一色相家族'
      : '- Keep hover, focus, and selected states in the same hue family as the action color',
  )
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate Do's and Don'ts based on analyzed design patterns.
 * Code-based heuristics — no LLM needed.
 */
export function generateDosAndDonts(
  tokens: DesignToken,
  language: DocLanguage = 'en',
  components: readonly ComponentVariantPattern[] = [],
  responsiveEvidence: {
    hasDeclaredBreakpoints?: boolean
    hasObservedResponsiveBehavior?: boolean
  } = {},
): string {
  const zh = language === 'zh-CN'
  const lines: string[] = []

  // The canonical English heading is required by the DESIGN.md alpha parser;
  // localized guidance remains below it.
  lines.push("## Do's and Don'ts")
  lines.push('')
  lines.push(zh ? '### 正确做法' : "### Do's")
  lines.push('')

  if (Object.keys(tokens.colors).length > 0) {
    lines.push(
      zh
        ? '- ✅ 使用已定义的颜色令牌，不要硬编码色值'
        : '- ✅ Use the defined color tokens instead of hardcoded hex values',
    )
  }
  if (tokens.spacing.length > 0) {
    lines.push(zh ? '- ✅ 遵循间距刻度保持一致节奏' : '- ✅ Follow the spacing scale for consistent rhythm')
  }

  // Font-specific
  const primaryFont = tokens.typography.fontStacks?.[0] || tokens.typography.fontFamilies[0]
  if (primaryFont) {
    lines.push(
      zh ? `- ✅ 使用 \`${primaryFont}\` 作为主字体栈` : `- ✅ Use \`${primaryFont}\` as the primary font stack`,
    )
  }

  // Radius-specific
  if (tokens.radii.length > 0) {
    const regularRadii = tokens.radii
      .flatMap((radius) => {
        const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em)?$/i.exec(radius.trim())
        if (!match) return []
        const value =
          Number(match[1]) * (match[2]?.toLowerCase() === 'rem' || match[2]?.toLowerCase() === 'em' ? 16 : 1)
        // Percentages and oversized values describe circles/pills, not the corner
        // character of ordinary surfaces. They must not make an otherwise compact
        // system look broadly rounded.
        return Number.isFinite(value) && value >= 0 && value <= 64 ? [value] : []
      })
      .sort((first, second) => first - second)
    const middle = Math.floor(regularRadii.length / 2)
    const representativeRadius =
      regularRadii.length === 0
        ? undefined
        : regularRadii.length % 2 === 0
          ? (regularRadii[middle - 1] + regularRadii[middle]) / 2
          : regularRadii[middle]
    if (representativeRadius !== undefined && representativeRadius >= 12) {
      lines.push(
        zh ? '- ✅ 使用较大的圆角，保持柔和友好的观感' : '- ✅ Use generous border-radius for a soft, friendly feel',
      )
    } else if (representativeRadius !== undefined && representativeRadius <= 4) {
      const hasPillButton = components.some(
        (component) =>
          component.type === 'button' &&
          (isPillRadius(component.styles) ||
            ((component.variant === 'icon' || /(?:pill|circular)/i.test(component.name)) &&
              [...(component.styles.borderRadius || '').matchAll(/-?\d+(?:\.\d+)?/g)].some(
                (match) => Number.parseFloat(match[0]) >= 12,
              ))),
      )
      lines.push(
        hasPillButton
          ? zh
            ? '- ✅ 普通表面使用小圆角；胶囊和圆形按钮按已观察变体单独复用'
            : '- ✅ Use compact radii on ordinary surfaces; preserve observed pill and circular button variants separately'
          : zh
            ? '- ✅ 保持小圆角，维持锐利精确的气质'
            : '- ✅ Keep border-radius minimal for a sharp, precise aesthetic',
      )
    }
  }

  // Shadow-specific
  if (tokens.shadows.length > 0) {
    lines.push(zh ? '- ✅ 用阴影层级建立视觉层次' : '- ✅ Use elevation (shadows) to create visual hierarchy')
  } else {
    lines.push(
      zh
        ? '- ✅ 未观察到稳定的阴影刻度；优先使用已观察到的边框与背景色变化建立层次'
        : '- ✅ No stable shadow scale was observed; prefer observed borders and background shifts for hierarchy',
    )
  }

  if (responsiveEvidence.hasObservedResponsiveBehavior) {
    lines.push(
      zh
        ? '- ✅ 保留已观察到的响应式行为及其视口差异'
        : '- ✅ Preserve the observed responsive behavior across viewports',
    )
  } else if (responsiveEvidence.hasDeclaredBreakpoints) {
    lines.push(
      zh
        ? '- 已声明断点，但本次捕获未观察到响应式行为'
        : '- Breakpoints were declared, but responsive behavior was not observed in this capture',
    )
  }

  // Spacing-specific
  if (tokens.spacing.length >= 4) {
    lines.push(
      zh
        ? '- ✅ 重复间距优先使用间距刻度；组件和结构中的已观察例外保持精确值'
        : '- ✅ Use the spacing scale for recurring rhythm; keep observed component and structural exceptions exact',
    )
  }

  lines.push('')
  lines.push(zh ? '### 避免' : "### Don'ts")
  lines.push('')
  if (Object.keys(tokens.colors).length > 0) {
    const hasDerivedAccessibilityColor = Boolean(tokens.colorRoles?.primaryAction?.recommendedOnPrimary)
    lines.push(
      hasDerivedAccessibilityColor
        ? zh
          ? '- ❌ 不要把新颜色当成页面观察值；派生的无障碍建议必须明确标注并单独验证'
          : "- ❌ Don't present new colors as observed values; label and validate derived accessibility recommendations separately"
        : zh
          ? '- ❌ 不要引入色板之外的新颜色'
          : "- ❌ Don't introduce new colors outside the defined palette",
    )
  }
  if (tokens.spacing.length > 0) {
    lines.push(zh ? '- ❌ 不要混用不同的间距体系' : "- ❌ Don't mix different spacing systems")
  }

  if (tokens.typography.fontFamilies.length === 1) {
    lines.push(
      zh
        ? '- ❌ 不要混用多种字体，保持单一字体族'
        : "- ❌ Don't mix multiple font families — stick to the single typeface",
    )
  }

  const weights = tokens.typography.fontWeights
  if (weights.length > 0 && weights.length <= 3) {
    lines.push(
      zh
        ? `- ❌ 不要使用以下之外的字重：${weights.join(', ')}`
        : `- ❌ Don't use font weights outside: ${weights.join(', ')}`,
    )
  }

  lines.push('')

  return lines.join('\n')
}

export function generateExampleComponents(
  examples: readonly GeneratedExampleComponent[],
  language: DocLanguage = 'en',
): string {
  if (examples.length === 0) return ''

  const zh = language === 'zh-CN'
  const lines: string[] = []

  lines.push(zh ? '## 示例组件' : '## Example Components')
  lines.push('')
  lines.push(
    zh
      ? '以下 HTML 示例由已配置的 AI 根据提取的设计令牌、设计规则与组件模式生成。'
      : 'The configured AI generated these HTML examples from the extracted tokens, design rules, and component patterns.',
  )

  for (const example of examples) {
    lines.push('')
    lines.push(`### ${example.title}`)
    lines.push('')
    lines.push('```html')
    lines.push(example.html)
    lines.push('```')
  }

  return lines.join('\n')
}
