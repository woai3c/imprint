import type { ComponentPattern } from './component-detect.js'
import type { DesignToken } from './types.js'

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
export function generateDosAndDonts(tokens: DesignToken, language: DocLanguage = 'en'): string {
  const zh = language === 'zh-CN'
  const lines: string[] = []

  lines.push(zh ? '## 正确做法与避免事项' : "## Do's and Don'ts")
  lines.push('')
  lines.push(zh ? '### 正确做法' : "### Do's")
  lines.push('')

  // Always applicable
  lines.push(
    zh
      ? '- ✅ 使用已定义的颜色令牌，不要硬编码色值'
      : '- ✅ Use the defined color tokens instead of hardcoded hex values',
  )
  lines.push(zh ? '- ✅ 遵循间距刻度保持一致节奏' : '- ✅ Follow the spacing scale for consistent rhythm')

  // Font-specific
  if (tokens.typography.fontFamilies.length > 0) {
    lines.push(
      zh
        ? `- ✅ 使用 \`${tokens.typography.fontFamilies[0]}\` 作为主字体`
        : `- ✅ Use \`${tokens.typography.fontFamilies[0]}\` as the primary font`,
    )
  }

  // Radius-specific
  if (tokens.radii.length > 0) {
    const maxR = Math.max(...tokens.radii.map((r) => parseFloat(r)))
    if (maxR >= 12) {
      lines.push(
        zh ? '- ✅ 使用较大的圆角，保持柔和友好的观感' : '- ✅ Use generous border-radius for a soft, friendly feel',
      )
    } else if (maxR <= 4) {
      lines.push(
        zh ? '- ✅ 保持小圆角，维持锐利精确的气质' : '- ✅ Keep border-radius minimal for a sharp, precise aesthetic',
      )
    }
  }

  // Shadow-specific
  if (tokens.shadows.length > 0) {
    lines.push(zh ? '- ✅ 用阴影层级建立视觉层次' : '- ✅ Use elevation (shadows) to create visual hierarchy')
  } else {
    lines.push(
      zh
        ? '- ✅ 用边框与背景色变化建立层次（无阴影设计）'
        : '- ✅ Use borders and background shifts for hierarchy (no shadows)',
    )
  }

  // Spacing-specific
  if (tokens.spacing.length >= 4) {
    lines.push(
      zh ? '- ✅ 坚持使用间距刻度，避免任意像素值' : '- ✅ Stick to the spacing scale — avoid arbitrary pixel values',
    )
  }

  lines.push('')
  lines.push(zh ? '### 避免' : "### Don'ts")
  lines.push('')
  lines.push(zh ? '- ❌ 不要引入色板之外的新颜色' : "- ❌ Don't introduce new colors outside the defined palette")
  lines.push(zh ? '- ❌ 不要混用不同的间距体系' : "- ❌ Don't mix different spacing systems")

  if (tokens.shadows.length === 0) {
    lines.push(
      zh ? '- ❌ 不要添加阴影——该设计为扁平层级' : "- ❌ Don't add box-shadows — this design uses flat elevation",
    )
  }

  if (tokens.typography.fontFamilies.length === 1) {
    lines.push(
      zh
        ? '- ❌ 不要混用多种字体，保持单一字体族'
        : "- ❌ Don't mix multiple font families — stick to the single typeface",
    )
  }

  const weights = tokens.typography.fontWeights
  if (weights.length <= 3) {
    lines.push(
      zh
        ? `- ❌ 不要使用以下之外的字重：${weights.join(', ')}`
        : `- ❌ Don't use font weights outside: ${weights.join(', ')}`,
    )
  }

  lines.push(
    zh ? '- ❌ 不要忽略响应式间距，使用相对单位' : "- ❌ Don't ignore the responsive spacing — use relative units",
  )
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate example HTML components using extracted tokens and detected patterns.
 * Gives AI agents and developers a concrete starting point.
 */
export function generateExampleComponents(
  tokens: DesignToken,
  components?: ComponentPattern[],
  language: DocLanguage = 'en',
): string {
  const zh = language === 'zh-CN'
  const lines: string[] = []
  const colorEntries = Object.entries(tokens.colors)
  const bgColor = findColor(colorEntries, ['background', 'bg', 'surface'])
  const cardColor = findColor(colorEntries, ['card', 'surface', 'secondary'])
  const textColor = findColor(colorEntries, ['foreground', 'text', 'body'])
  const mutedColor = findColor(colorEntries, ['muted-foreground', 'muted', 'secondary-foreground'])
  const primaryColor = findColor(colorEntries, ['primary', 'accent', 'brand'])
  const primaryFg = findColor(colorEntries, ['primary-foreground', 'on-primary', 'white'], '#fff')
  const borderColor = findColor(colorEntries, ['border', 'divider', 'separator'])

  const font = tokens.typography.fontFamilies[0] || 'system-ui, sans-serif'
  const fontStack = tokens.typography.fontStacks?.[0] || font
  const radius = tokens.radii[1] || tokens.radii[0] || '8px'
  const radiusSm = tokens.radii[0] || '4px'
  const shadow = tokens.shadows[0] || 'none'
  const spacing = tokens.spacing
  const padUnit = spacing[2] || spacing[1] || '16px'
  const padSm = spacing[1] || spacing[0] || '8px'
  const gapUnit = spacing[1] || spacing[0] || '8px'

  lines.push(zh ? '## 示例组件' : '## Example Components')
  lines.push('')
  lines.push(
    zh
      ? '以下 HTML 示例基于提取的设计令牌构建。'
      : 'Ready-to-use HTML examples built with the extracted design tokens.',
  )
  lines.push(zh ? '可直接复制作为起点，按需调整。' : 'Copy these as starting points and adapt to your needs.')
  lines.push('')

  // Card
  lines.push(zh ? '### 卡片' : '### Card')
  lines.push('')
  lines.push('```html')
  lines.push(`<div style="
  background: ${cardColor};
  color: ${textColor};
  font-family: ${fontStack};
  border-radius: ${radius};
  padding: ${padUnit};
  box-shadow: ${shadow};${borderColor ? `\n  border: 1px solid ${borderColor};` : ''}
">`)
  lines.push(
    `  <h3 style="margin: 0 0 ${gapUnit}; font-size: ${tokens.typography.fontSizes[3] || '1.125rem'}; font-weight: ${tokens.typography.fontWeights[tokens.typography.fontWeights.length - 1] || '600'};">${zh ? '卡片标题' : 'Card Title'}</h3>`,
  )
  lines.push(
    `  <p style="margin: 0; color: ${mutedColor}; font-size: ${tokens.typography.fontSizes[1] || '0.875rem'};">${zh ? '次要信息使用柔和文字颜色。' : 'Description text using muted color for secondary content.'}</p>`,
  )
  lines.push('</div>')
  lines.push('```')
  lines.push('')

  // Button
  const hasButtons = components?.some((c) => c.type === 'button')
  const btnRadius = hasButtons
    ? components!.find((c) => c.type === 'button')?.styles.borderRadius || radiusSm
    : radiusSm
  const btnFontSize = hasButtons
    ? components!.find((c) => c.type === 'button')?.styles.fontSize || tokens.typography.fontSizes[1] || '0.875rem'
    : tokens.typography.fontSizes[1] || '0.875rem'

  lines.push(zh ? '### 按钮' : '### Button')
  lines.push('')
  lines.push('```html')
  lines.push(`<button style="
  background: ${primaryColor};
  color: ${primaryFg};
  font-family: ${fontStack};
  font-size: ${btnFontSize};
  font-weight: 500;
  border: none;
  border-radius: ${btnRadius};
  padding: ${padSm} ${padUnit};
  cursor: pointer;${tokens.transitions?.[0] ? `\n  transition: opacity ${tokens.transitions[0]} ease;` : ''}
">${zh ? '主要操作' : 'Primary Action'}</button>`)
  lines.push('')
  lines.push(`<button style="
  background: transparent;
  color: ${textColor};
  font-family: ${fontStack};
  font-size: ${btnFontSize};
  font-weight: 500;
  border: 1px solid ${borderColor || textColor};
  border-radius: ${btnRadius};
  padding: ${padSm} ${padUnit};
  cursor: pointer;
">${zh ? '次要操作' : 'Secondary Action'}</button>`)
  lines.push('```')
  lines.push('')

  // Navigation
  if (components?.some((c) => c.type === 'navigation')) {
    lines.push(zh ? '### 导航' : '### Navigation')
    lines.push('')
    lines.push('```html')
    lines.push(`<nav style="
  display: flex;
  align-items: center;
  gap: ${padUnit};
  padding: ${padSm} ${padUnit};
  background: ${bgColor};
  border-bottom: 1px solid ${borderColor || 'rgba(0,0,0,0.1)'};
  font-family: ${fontStack};
">`)
    lines.push(
      `  <a href="#" style="color: ${primaryColor}; text-decoration: none; font-weight: 500; font-size: ${btnFontSize};">${zh ? '当前' : 'Active'}</a>`,
    )
    lines.push(
      `  <a href="#" style="color: ${mutedColor}; text-decoration: none; font-size: ${btnFontSize};">${zh ? '链接' : 'Link'}</a>`,
    )
    lines.push(
      `  <a href="#" style="color: ${mutedColor}; text-decoration: none; font-size: ${btnFontSize};">${zh ? '链接' : 'Link'}</a>`,
    )
    lines.push('</nav>')
    lines.push('```')
    lines.push('')
  }

  // Input
  if (components?.some((c) => c.type === 'input')) {
    const inputPattern = components!.find((c) => c.type === 'input')!
    const inputRadius = inputPattern.styles.borderRadius || radiusSm
    const inputPad = inputPattern.styles.padding || `${padSm} ${padUnit}`
    const inputFontSize = inputPattern.styles.fontSize || tokens.typography.fontSizes[1] || '0.875rem'

    lines.push(zh ? '### 输入框' : '### Input')
    lines.push('')
    lines.push('```html')
    lines.push(`<input type="text" placeholder="${zh ? '请输入文字' : 'Enter text...'}" style="
  width: 100%;
  background: ${inputPattern.styles.backgroundColor || cardColor};
  color: ${textColor};
  font-family: ${fontStack};
  font-size: ${inputFontSize};
  border: ${inputPattern.styles.border || `1px solid ${borderColor}`};
  border-radius: ${inputRadius};
  padding: ${inputPad};
  outline: none;
  box-sizing: border-box;
" />`)
    lines.push('```')
    lines.push('')
  }

  // Page layout
  lines.push(zh ? '### 页面布局' : '### Page Layout')
  lines.push('')
  lines.push('```html')
  lines.push(`<div style="
  min-height: 100vh;
  background: ${bgColor};
  color: ${textColor};
  font-family: ${fontStack};
  font-size: ${tokens.typography.fontSizes[2] || '1rem'};
  line-height: ${tokens.typography.lineHeights?.[0] || '1.5'};
">`)
  lines.push(`  <header style="padding: ${padUnit}; border-bottom: 1px solid ${borderColor || 'rgba(0,0,0,0.1)'};">`)
  lines.push(`    <h1 style="margin: 0;">${zh ? '站点标题' : 'Site Title'}</h1>`)
  lines.push('  </header>')
  lines.push(`  <main style="max-width: 1200px; margin: 0 auto; padding: ${padUnit};">`)
  lines.push(zh ? `    <!-- 内容区域 -->` : `    <!-- Content here -->`)
  lines.push('  </main>')
  lines.push('</div>')
  lines.push('```')
  lines.push('')

  return lines.join('\n')
}

function findColor(entries: Array<[string, string]>, keywords: string[], fallback?: string): string {
  for (const keyword of keywords) {
    const exact = entries.find(([name]) => name === keyword)
    if (exact) return `var(--color-${exact[0]})`
  }
  for (const keyword of keywords) {
    const partial = entries.find(([name]) => name.includes(keyword))
    if (partial) return `var(--color-${partial[0]})`
  }
  if (fallback) return fallback
  return entries[0] ? `var(--color-${entries[0][0]})` : '#000'
}
