# Imprint 产品设计方案

> 基于竞品分析和产品定位，整理的设计方案文档。  
> 最后更新：2026-07-25

---

## 一、产品定位

**一句话定位：**

> Reverse-engineer UI design systems into AI-ready specifications.

**核心差异化：**

| 维度     | 竞品（Design Extractor 等） | Imprint                                    |
| -------- | --------------------------- | ------------------------------------------ |
| 形态     | 在线 SaaS                   | 本地桌面应用（离线 + 隐私）                |
| 数据     | 一次性输出，无历史          | 本地持久化，历史管理                       |
| 预览     | 无或仅 Live Preview         | 换肤预览 + 模板演示系统                    |
| AI 依赖  | 强依赖云端 LLM              | 代码优先，LLM 仅做语义增强                 |
| 消费方式 | 浏览器复制                  | GUI + CLI 双模式，AI agent 直接消费        |
| 登录页面 | 无法穿透（卡在登录）        | 复用用户浏览器 session（可分析需登录页面） |
| 付费     | 按次收费 / 每日限额         | 完全免费，无限制                           |

---

## 二、输出格式规范

### 2.1 四种导出格式

参考 Design Extractor 的 Tab 结构，我们对齐为 5 种导出：

| Tab 名称      | 文件格式 | 说明                                                        |
| ------------- | -------- | ----------------------------------------------------------- |
| Preview       | 在线预览 | 基于提取风格生成的示例页面（类似 DesignMD 的 Live Preview） |
| DESIGN.md     | `.md`    | 完整设计规范文档（AI 友好）                                 |
| Tailwind v4   | `.css`   | `@theme { }` 格式                                           |
| CSS Variables | `.css`   | `:root { }` 格式                                            |
| Design Tokens | `.json`  | W3C DTCG 标准 JSON                                          |

### 2.2 DESIGN.md 结构

```markdown
# {网站名称}

> "{设计系统简称} — {字体系统描述}"

## Overview

{一段自然语言描述设计系统特征}

**Signature traits:**

- {特征1}
- {特征2}

## Colors

{语义化颜色说明，包含使用频率}

### Light Theme

#### Text Scale

- **Text Primary** (#1f2328): Primary body text, headings (1702 hits). Role: text.
- **Text Secondary** (#59636e): Muted text, metadata (926 hits). Role: text.

#### Surface & Shadows

- **Surface Base** (#ffffff): Card surfaces, page background (450 hits). Role: background.

#### Interactive

- **Action Primary** (#0969da): Links, buttons, action states. Role: action.

### Dark Theme

{同上结构}

## Typography

{字体层级说明}

### Type Scale Evidence

| Role         | Font Family | Size | Weight | Line Height | Usage             |
| ------------ | ----------- | ---- | ------ | ----------- | ----------------- |
| Body Default | ...         | 14px | 400    | 21px        | Primary body text |

## Layout

### Responsive Strategy

- mobile (< 768px): ...
- tablet (768-1024px): ...
- desktop (> 1024px): ...

### Spacing System

Base grid: {N}px
Scale: {values}

## Elevation & Depth

### Shadow Evidence

{实际检测到的 shadow 值}

## Shapes

### Radius Roles

| Role | Value  | Usage              |
| ---- | ------ | ------------------ |
| sm   | 2px    | Subtle rounding    |
| md   | 6px    | Default cards      |
| lg   | 24px   | Prominent elements |
| pill | 9999px | Tags, badges       |

## Components

{检测到的组件模式}

## Do's and Don'ts

{基于设计系统特征生成的设计守则}

## Agent Prompt Guide

### Example Component Prompts

- Create button component using validated primary color role and spacing tokens.
- Create card component with mapped radius role and evidence-backed elevation.

### Iteration Guide

1. Start with extracted palette and typography roles only.
2. Map spacing and radius directly from token tables before visual polish.
3. Apply component patterns one section at a time.
4. Keep elevation claims tied to explicit evidence.
```

### 2.3 Tailwind v4 格式

```css
@theme {
  /* Colors - Light */
  --color-text-primary: #1f2328;
  --color-text-secondary: #59636e;
  --color-surface-base: #ffffff;
  --color-surface-muted: #eff2f5;
  --color-border-default: #d1d9e0;
  --color-action-primary: #0969da;

  /* Colors - Dark */
  --color-dark-text-primary: #f0f6fc;
  --color-dark-surface-base: #0d1117;

  /* Typography */
  --font-family-body: 'Mona Sans VF', sans-serif;
  --font-family-mono: ui-monospace, monospace;

  /* Spacing */
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-6: 24px;
  --spacing-8: 32px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-md: 6px;
  --radius-lg: 24px;
  --radius-pill: 9999px;
}
```

### 2.4 CSS Variables 格式

```css
:root {
  /* Colors */
  --color-text-primary: #1f2328;
  --color-text-secondary: #59636e;
  --color-surface-base: #ffffff;

  /* Typography */
  --font-body-default-family: 'Mona Sans VF', sans-serif;
  --font-body-default-size: 14px;
  --font-body-default-weight: 400;
  --font-body-default-line-height: 21px;

  /* Spacing */
  --spacing-1: 4px;
  --spacing-2: 8px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-md: 6px;
}
```

### 2.5 Design Tokens (W3C DTCG JSON)

```json
{
  "color": {
    "Text Primary": {
      "$type": "color",
      "$value": "#1f2328",
      "$description": "Primary body text, headings, icons (1702 hits)"
    }
  },
  "typography": {
    "Body Default": {
      "$type": "typography",
      "$value": {
        "fontFamily": "Mona Sans VF",
        "fontSize": "14px",
        "fontWeight": 400,
        "lineHeight": "21px"
      },
      "$description": "Primary body text (774 hits)"
    }
  },
  "spacing": {
    "space-1": {
      "$type": "dimension",
      "$value": "4px",
      "$description": "Micro spacing, inline gaps"
    }
  },
  "borderRadius": {
    "radius-md": {
      "$type": "dimension",
      "$value": "6px",
      "$description": "Default card and container rounding"
    }
  }
}
```

---

## 三、从竞品借鉴的关键功能

### 3.1 语义化命名（需 LLM）

**现状：** 当前 `token-builder.ts` 输出的颜色命名是按色相聚类的（如 `blue-1`, `gray-2`），缺乏语义。

**目标：** 像 Design Extractor 那样输出 `text-primary`, `surface-base`, `action-primary` 等语义名。

**实现策略：**

```
代码提取 raw styles
    ↓
统计每个颜色值的 DOM 出现次数和使用上下文（text/background/border）
    ↓
代码初步分类（text-colors / surface-colors / border-colors / action-colors）
    ↓
LLM 精修命名 + 生成 description（可选步骤，无 LLM 时用代码规则命名）
```

关键原则：**无 LLM 时仍可工作**，LLM 只是锦上添花。

### 3.2 使用频率统计

在 DOM 遍历时记录每个样式值的出现次数：

```typescript
interface StyleUsage {
  value: string
  count: number // DOM 中出现次数
  contexts: string[] // 使用上下文：'text' | 'background' | 'border' | 'shadow'
  elements: string[] // 典型元素：'h1', 'p', 'button', 'a'
}
```

这个数据用于：

- 判断 primary / secondary 颜色层级
- 在 DESIGN.md 中标注 "(1702 hits)"
- 帮助 LLM 更准确地做语义命名

### 3.3 Light/Dark 双主题提取

**方法：**

1. 提取页面时，检测 `<html>` 或 `<body>` 上是否有 `class` 切换（如 `.dark`, `[data-theme="dark"]`）
2. 检测 `prefers-color-scheme` media query 中的样式
3. 如果网站原生支持暗色：
   - 先提取 light 模式下的完整样式
   - 切换到 dark 模式（通过 JS 注入切换 class 或 media emulation）
   - 再提取 dark 模式下的完整样式
4. 输出时分 Light Theme / Dark Theme 两组

### 3.4 设计特征标签（Tags）

在结果概览中显示 3-5 个标签化的设计特征：

```
[4px-base micro-grid spacing]  [variable-font weight hierarchy]
[contribution-green semantic accent]  [flat-border elevation language]
```

**生成方式：**

- 代码判断：检测 spacing 最大公约数 → "Xpx-base grid"
- 代码判断：检测 font-family 是否包含 VF → "variable-font"
- LLM 补充：总结视觉风格关键词

### 3.5 Agent Prompt Guide

在 DESIGN.md 末尾附加一段 AI agent 使用指引：

- 示例组件 prompt（怎么用这些 token 来生成 UI）
- 迭代指南（先用什么、后加什么）
- Do's and Don'ts（设计守则）

**这部分必须用 LLM 生成**，因为需要理解设计意图。无 LLM 时可以输出一个通用模板。

### 3.6 复用用户浏览器 Session（核心差异化）

**问题：** 竞品（如 DesignMD）在分析需要登录的页面时，会卡在登录界面上，只能提取登录页的样式。

**我们的方案：** 利用 Playwright 的 `userDataDir` 或 `connect-over-CDP` 模式复用用户本地浏览器的登录状态。

```typescript
// 方案 A：使用用户的 Chrome profile（推荐）
const context = await chromium.launchPersistentContext(userChromeProfilePath, { headless: true })

// 方案 B：连接到用户已打开的浏览器（CDP）
const browser = await chromium.connectOverCDP('http://localhost:9222')
```

**优势：**

- 用户已登录知乎/GitHub/内部系统 → Imprint 直接能访问完整页面
- 无需用户重新输入密码或 cookie
- 竞品（在线 SaaS）做不到这一点，因为它们在服务端渲染，拿不到用户本地浏览器状态

**实现细节：**

- 自动检测用户本地 Chrome/Edge 的 profile 路径
- 提供选项：是否复用登录态（默认开启）
- 如果检测到 profile 锁定（浏览器正在运行），切换到 CDP 连接模式或使用 profile 副本

### 3.7 分析过程中的页面截图预览

**来源：** DesignMD 在分析过程中左侧显示目标页面截图 + 提取的颜色/字体信息，用户能直观看到"正在分析什么"。

**我们的实现：**

```
┌──────────────────────────────────────────────────────┐
│  分析结果                                             │
├─────────────────────┬────────────────────────────────┤
│                     │  [Preview] [DESIGN.md] [Tailwind] [CSS] [JSON]  │
│  ┌───────────────┐  │                                │
│  │  目标页面截图   │  │  @theme {                      │
│  │  (above fold)  │  │    --color-text-primary: ...   │
│  └───────────────┘  │    --color-surface-base: ...   │
│                     │    ...                          │
│  Extracted Colors   │  }                              │
│  ■ ■ ■ ■ ■ ■       │                                │
│                     │                                │
│  Typography Scale   │                                │
│  Body  16px  400    │                                │
│  Small 14px  400    │                                │
│  ...                │                                │
│                     │                                │
│  source_url         │                                │
└─────────────────────┴────────────────────────────────┘
```

**关键点：**

- 左侧：目标页面截图（above the fold）+ 颜色色卡 + 字体信息速览
- 右侧：Tab 切换查看各格式的输出代码
- 截图在分析开始时就显示，让用户确认"分析的是正确的页面"

### 3.8 Live Preview（实时风格预览页面）

**来源：** DesignMD 提供 "Live Preview" Tab，基于提取的设计风格实时生成一个示例页面。

**与我们现有"模板演示系统"的关系：**

- 我们的模板演示已经能做到类似效果（Dashboard/Landing/Ecommerce/Blog 模板 + 换肤）
- 区别在于 DesignMD 的 Preview 是自动生成的，分析完直接展示
- **改进方向：** 分析结果页面中增加一个 Preview tab，自动用提取的 token 渲染一个示例页面

### 3.9 多格式导出 + PDF 风格指南

**来源：** StyleSniff 提供 PDF 风格指南导出，适合分享给非技术人员或客户。

**StyleSniff 的导出格式：**

- CSS custom properties
- SCSS variables
- Tailwind CSS config
- JSON (Figma Tokens Studio 兼容)
- HTML 在线风格指南
- PDF 风格指南

**我们的规划：**

- Phase 1 已支持：CSS / Tailwind / JSON / Markdown
- 后续可增加：PDF 导出（基于 Markdown 渲染）、SCSS 变量格式
- HTML 风格指南 = 我们的 Preview / Live Preview 功能，已覆盖

### 3.10 交互状态提取

**来源：** DesignMD 强调提取 "hover and focus states, interaction states"。

**实现方式：**

- 在 Playwright 中模拟 hover / focus / active 状态
- 对比元素在不同状态下的计算样式差异
- 输出 interaction tokens：

```css
--color-action-primary-hover: #0756b3;
--color-action-primary-active: #064590;
--transition-default: 0.2s ease-out;
```

---

## 四、CLI 模式设计

### 4.1 命令结构

```bash
# 基本用法
imprint extract <url> [options]

# 选项
--format <type>       输出格式: design.md | tailwind | css | json | all (默认: all)
--output <path>       输出路径 (默认: ./DESIGN.md 或 ./design-tokens.{ext})
--viewport <size>     视口: desktop | tablet | mobile | all (默认: desktop)
--dark-mode           同时提取暗色模式
--use-session         复用用户浏览器登录态（默认开启）
--no-session          不复用登录态，使用干净的浏览器上下文
--ai                  启用 LLM 语义增强（需要已配置 API key 或 agent CLI）
--no-ai              禁用 LLM（纯代码提取）
--quiet              静默模式，无进度输出
--json-stdout        将 token JSON 直接输出到 stdout（方便管道）
```

### 4.2 使用场景

```bash
# AI agent 直接消费（最常见）
imprint extract https://vercel.com --format design.md --output ./DESIGN.md

# 生成 Tailwind 主题文件
imprint extract https://linear.app --format tailwind --output ./src/theme.css

# 管道模式，AI agent 通过 stdout 获取 token
imprint extract https://stripe.com --format json --json-stdout | claude "用这些 token 生成一个定价页面"

# 完整提取
imprint extract https://github.com --format all --dark-mode --ai --output ./design/
```

### 4.3 实现方式

CLI 复用桌面应用的核心逻辑（analyzer + exporter），通过 Electron 的 CLI 模式或独立的 Node.js 入口：

```
src/
├── core/            # 核心逻辑（analyzer, exporter, token-builder）
│   ├── analyzer/
│   ├── export/
│   └── ...
├── main/            # Electron 主进程（GUI 入口）
├── renderer/        # React 前端
└── cli/             # CLI 入口
    └── index.ts
```

CLI 不依赖 Electron，直接使用 `playwright-core` + 核心逻辑。

---

## 五、产品路线图

### Phase 1：基础能力（当前）✅

- [x] URL 输入 → 页面分析
- [x] 颜色/字体/间距/圆角/阴影提取
- [x] 颜色聚类
- [x] 导出为 CSS Variables / Tailwind v4 / Markdown / JSON
- [x] 本地 SQLite 持久化
- [x] 历史记录管理
- [x] 内置主题 + 换肤预览
- [x] 模板演示系统
- [x] Light/Dark 模式（产品 UI）
- [x] i18n 国际化

### Phase 2：语义增强 + 体验优化

- [ ] **复用用户浏览器 Session**（穿透登录墙，核心差异化）
- [ ] **分析过程截图预览**（左侧显示目标页面截图 + 色卡 + 字体速览）
- [ ] **分析结果 Live Preview Tab**（自动用提取的 token 渲染示例页面）
- [ ] 使用频率统计（DOM hit count）
- [ ] 颜色使用上下文分类（text / surface / border / action）
- [ ] 代码级语义命名（无 LLM 的基础命名）
- [ ] LLM 语义增强（精确命名 + description + 设计意图总结）
- [ ] Light/Dark 双主题同时提取
- [ ] 交互状态提取（hover / focus / active）
- [ ] 设计特征标签生成
- [ ] Agent Prompt Guide 输出
- [ ] Do's and Don'ts 生成
- [ ] DESIGN.md 输出对标 Design Extractor 质量

### Phase 3：CLI + AI Agent 集成

- [ ] CLI 入口 (`imprint extract <url>`)
- [ ] 多格式输出 (--format)
- [ ] stdout JSON 输出（管道模式）
- [ ] 核心逻辑从 Electron 主进程解耦到 `src/core/`
- [ ] 独立 npm 包发布（`npx imprint extract ...`）

### Phase 4：高级能力（远期）

- [ ] 组件模式检测（识别 Card, Button, Nav 等组件结构）
- [ ] 多页面分析（首页 + 内页 + 交互页）
- [ ] 响应式断点自动检测
- [ ] 动效/过渡分析（transition, animation）
- [ ] 设计系统对比（两个 URL 的风格差异分析）
- [ ] PDF 风格指南导出（适合分享给非技术人员）
- [ ] SCSS 变量格式导出
- [ ] MCP Server 本地模式（stdio，供 Cursor / Claude Desktop 调用）
- [ ] 模板演示系统扩展至 10+ 模板

---

## 5.5 模板演示系统

模板演示是 Imprint 的独特功能（竞品没有）。用户提取设计风格后，可在多种真实场景模板中预览换肤效果。

### 当前模板（4 个）

| #   | 模板      | 场景            |
| --- | --------- | --------------- |
| 1   | Dashboard | 后台管理面板    |
| 2   | Landing   | 产品着陆页/官网 |
| 3   | Ecommerce | 电商商品列表    |
| 4   | Blog      | 博客/文章列表   |

### 计划新增模板（6+ 个）

| #   | 模板           | 场景          | 说明                       |
| --- | -------------- | ------------- | -------------------------- |
| 5   | Login/Auth     | 登录/注册页   | 表单、输入框、按钮组合     |
| 6   | Profile        | 用户个人主页  | 头像、信息卡片、Tab 导航   |
| 7   | Pricing        | 定价页        | 卡片网格、CTA 按钮、对比表 |
| 8   | Settings       | 设置页        | 表单、开关、分组面板       |
| 9   | Chat/Messaging | 聊天界面      | 消息气泡、输入框、列表     |
| 10  | Docs/Knowledge | 文档/知识库   | 侧边导航、内容区、目录     |
| 11  | Kanban/Task    | 看板/任务管理 | 拖拽卡片、列布局、标签     |
| 12  | Analytics      | 数据分析      | 图表占位、指标卡片、筛选器 |

### 模板设计原则

- 每个模板覆盖不同的 UI 组件组合（按钮、卡片、表格、表单、导航等）
- 模板应尽可能使用 CSS 变量，确保换肤能完整覆盖
- 模板只是静态展示，不需要真实交互逻辑
- 模板代码应该简洁，方便用户理解设计 token 如何应用

---

## 六、技术改进计划

### 6.1 style-extractor 增强

当前 `extractStyles` 只收集 raw values，需要增加：

```typescript
interface EnhancedStyleUsage {
  value: string
  count: number
  role: 'text' | 'background' | 'border' | 'accent' | 'shadow'
  elements: { tag: string; class: string; count: number }[]
  specificity: 'primary' | 'secondary' | 'tertiary'
}
```

### 6.2 token-builder 重构

当前 `buildDesignTokens` 输出扁平结构，需要改为分层语义结构：

```typescript
interface SemanticDesignTokens {
  meta: {
    name: string
    url: string
    extractedAt: string
    features: string[] // 设计特征标签
  }
  colors: {
    light: SemanticColorGroup
    dark?: SemanticColorGroup
  }
  typography: TypeScaleToken[]
  spacing: SpacingSystem
  radius: RadiusRoles
  elevation: ElevationEvidence
  components: ComponentPattern[]
}
```

### 6.3 目录结构调整（Phase 3 准备）

```
src/
├── core/                    # 无 Electron 依赖的核心逻辑
│   ├── analyzer/
│   │   ├── style-extractor.ts
│   │   ├── color-cluster.ts
│   │   ├── dark-mode-detect.ts    # 新增
│   │   ├── usage-counter.ts       # 新增
│   │   ├── interaction-states.ts  # 新增（hover/focus/active 状态提取）
│   │   └── session-manager.ts     # 新增（浏览器 session 复用）
│   ├── token/
│   │   ├── builder.ts
│   │   ├── semantic-namer.ts      # 新增（代码规则命名）
│   │   └── llm-enhancer.ts        # 新增（LLM 语义增强）
│   └── export/
│       ├── css-variables.ts
│       ├── tailwind-theme.ts
│       ├── design-doc.ts
│       ├── dtcg-json.ts
│       └── agent-guide.ts         # 新增
├── main/                    # Electron 主进程
├── renderer/                # React 前端
│   └── pages/
│       └── AnalyzeResultPage.tsx  # 新增（两栏式结果展示）
└── cli/                     # CLI 入口
    ├── index.ts
    └── commands/
        └── extract.ts
```

---

## 七、与竞品的功能对比

### 7.1 功能矩阵对比

| 功能                     | Design Extractor |    DesignMD    |  StyleSniff   |    **Imprint**     |
| ------------------------ | :--------------: | :------------: | :-----------: | :----------------: |
| **基础提取**             |                  |                |               |                    |
| 颜色提取                 |        ✅        |       ✅       |      ✅       |         ✅         |
| 字体提取                 |        ✅        |       ✅       |      ✅       |         ✅         |
| 间距提取                 |        ✅        |       ✅       |      ✅       |         ✅         |
| 圆角提取                 |        ✅        |       ✅       |      ✅       |         ✅         |
| 阴影/Elevation           |        ✅        |       ✅       |      ✅       |         ✅         |
| 交互状态（hover/focus）  |        ❌        |       ✅       |      ❌       |     🔜 Phase 2     |
| 响应式断点检测           |        ✅        |       ✅       |      ❌       |     🔜 Phase 4     |
| **语义分析**             |                  |                |               |                    |
| 语义化命名               |     ✅ (LLM)     |    ✅ (LLM)    |      ✅       |     🔜 Phase 2     |
| 使用频率统计             |        ✅        |       ❌       |      ❌       |     🔜 Phase 2     |
| 设计特征标签             |        ✅        |       ❌       |      ❌       |     🔜 Phase 2     |
| Agent Prompt Guide       |        ✅        |       ❌       |      ❌       |     🔜 Phase 2     |
| Light/Dark 双主题        |        ✅        |       ❌       |      ❌       |     🔜 Phase 2     |
| **导出格式**             |                  |                |               |                    |
| DESIGN.md / Markdown     |        ✅        |       ✅       |      ❌       |         ✅         |
| Tailwind v4              |        ✅        |       ❌       |      ✅       |         ✅         |
| CSS Variables            |        ✅        |       ❌       |      ✅       |         ✅         |
| W3C DTCG JSON            |        ✅        |       ✅       |      ✅       |         ✅         |
| SCSS Variables           |        ❌        |       ❌       |      ✅       |     🔜 Phase 4     |
| PDF Style Guide          |        ❌        |       ❌       |      ✅       |     🔜 Phase 4     |
| Figma Token Studio JSON  |        ❌        |       ❌       |      ✅       |     🔜 Phase 4     |
| **预览 & 体验**          |                  |                |               |                    |
| 页面截图预览             |        ❌        | ✅（左侧面板） |      ❌       |     🔜 Phase 2     |
| Live Preview（示例页面） |        ❌        |       ✅       |   ✅ (HTML)   | ✅（模板演示系统） |
| 换肤预览                 |        ❌        |       ❌       |      ❌       |         ✅         |
| 多模板演示               |        ❌        |       ❌       |      ❌       |   ✅（10+ 模板）   |
| **核心差异**             |                  |                |               |                    |
| 穿透登录墙               |        ❌        |       ❌       |      ❌       |         ✅         |
| 本地历史管理             |        ❌        |       ❌       |      ❌       |         ✅         |
| 离线使用                 |        ❌        |       ❌       |      ❌       |         ✅         |
| CLI 集成                 |        ❌        |   🔜 计划中    |      ❌       |     🔜 Phase 3     |
| 免费无限制               |    ❌（未知）    |  ✅（5次/天）  | ❌（$2.5/次） |   ✅（完全免费）   |
| 隐私保护                 |        ❌        |       ❌       |      ❌       |    ✅（纯本地）    |

### 7.2 定位差异总结

```
Design Extractor / DesignMD / StyleSniff（在线 SaaS）
    ↕ 差异化
Imprint（本地桌面 + CLI）

竞品优势：
- 零安装，打开浏览器就能用
- 服务端算力可以跑重型 LLM
- DesignMD 免费每天 5 次，StyleSniff 付费 $2.5/次

竞品劣势（=我们的机会）：
- 无法穿透登录墙（DesignMD 分析知乎只能拿到登录页）
- URL 提交到第三方服务器（隐私风险）
- 无本地历史管理
- 无实时换肤预览体验
- 有使用次数限制
- 无多模板演示（仅 DesignMD 有单一 Live Preview）

Imprint 优势：
- 隐私：URL 不上传到第三方服务器
- 穿透登录：复用用户浏览器 session，可分析需登录的页面
- 离线：无网络也能工作（纯代码模式）
- 历史管理：本地持久化，随时回溯
- 换肤预览：实时体验提取的风格
- 模板演示：10+ 模板实时换肤展示效果
- AI 灵活性：支持多家 API + 本地 Agent CLI
- CLI 集成：AI agent 直接通过命令行消费
- 免费：完全免费，无使用次数限制
```

---

## 八、竞品分析详情

### 8.1 Design Extractor ⭐⭐⭐⭐⭐（最直接竞品）

- **官网：** https://www.design-extractor.com
- **定位：** "Turn any website into a structured design spec that AI coding agents can use to build pixel-perfect UI."
- **输出格式：** DESIGN.md / Tailwind v4 / CSS Variables / Design Tokens (W3C DTCG JSON)
- **目标用户：** Claude Code, Cursor, Copilot, AI coding agents

**核心特点：**

- 语义化命名（text-primary, surface-base, action-primary）
- 使用频率统计（"1702 hits"）
- Light/Dark 双主题同时提取
- Agent Prompt Guide + Do's and Don'ts
- 设计特征标签（"4px-base micro-grid spacing"）
- 颜色按角色分组（Brand / Surface / Text / Interactive）

**不足：**

- 在线 SaaS，URL 需提交到服务器
- 无本地历史管理
- 无预览/换肤功能
- 无法穿透登录

### 8.2 DesignMD ⭐⭐⭐⭐⭐（最直接竞品）

- **官网：** https://www.designmd.cc
- **定位：** "Extract Design Tokens from Any URL into a DESIGN.md"
- **输出格式：** Preview / Markdown / Tokens JSON / Live Preview
- **免费额度：** 每 IP 每天 5 次分析，无需注册

**核心特点：**

- 页面截图显示在左侧（above the fold + 色卡 + 字体信息）
- Live Preview：基于提取的风格实时生成一个示例页面
- 读取 live DOM 和 CSSOM（非截图推测）
- 提取 CSS variables、computed styles、responsive breakpoints、hover/focus states
- 已生成 5,452+ 个 DESIGN.md（有一定用户规模）
- 计划推出 CLI 集成

**不足：**

- **无法穿透登录墙**（分析知乎时卡在登录页面，只能提取登录页样式）
- 在线 SaaS，每天有次数限制
- 无历史管理
- 无换肤体验

**值得借鉴：**

- 左侧截图 + 色卡 + 字体速览 的布局
- Live Preview（用提取的 token 渲染示例页面）
- 交互状态提取（hover, focus states）

### 8.3 StyleSniff ⭐⭐⭐⭐

- **官网：** https://stylesniff.com
- **定位：** "Professional design system audits from any website"
- **输出格式：** PDF Style Guide / Design Tokens (CSS/SCSS/Tailwind/JSON/Figma) / Live HTML Style Guide
- **付费模式：** 按次付费，$2.50/次（50% 折扣期间）

**核心特点：**

- 分析真实渲染的 CSS（computed styles），非源码猜测
- 多格式导出：CSS / SCSS / JSON / Tailwind / HTML / PDF
- PDF 风格指南（适合分享给非技术人员/客户）
- Figma Tokens Studio 兼容的 JSON 输出
- Live HTML Style Guide（可浏览的在线版本）
- 结果在 10 秒内生成

**不足：**

- 付费产品（无免费版）
- 无法分析需登录的页面
- 无本地历史
- 无换肤预览

**值得借鉴：**

- PDF 风格指南（面向非技术人员的分享需求）
- SCSS 变量格式
- Figma Tokens Studio JSON 兼容
- "Professional design system audit" 的产品叙事

### 8.4 其他竞品（待深入分析）

| 竞品          | 官网                         | 方向                    | 备注                    |
| ------------- | ---------------------------- | ----------------------- | ----------------------- |
| Superposition | https://superposition.design | Token 提取 → 多格式导出 | 老牌产品，支持 Figma/XD |
| Peel          | https://peel.studio          | 图片/视频/网站 → Token  | 支持从截图和视频提取    |
| Design Snap   | Chrome 插件                  | 浏览器插件提取          | 轻量级，即用即走        |
| Step1         | https://step1.dev            | 网站克隆 + 设计 DNA     | 偏向 website clone      |

---

## 九、关键技术决策

### 9.1 浏览器 Session 复用方案

**问题：** 在线竞品无法分析需要登录的页面（如知乎、内部系统），这是 Imprint 的核心差异化优势。

**技术方案（优先级排序）：**

**方案 1：使用用户 Chrome Profile 的副本（推荐）**

```typescript
import fs from 'node:fs'
import path from 'node:path'

function getUserChromeProfilePath(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA!, 'Google/Chrome/User Data')
  }
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME!, 'Library/Application Support/Google/Chrome')
  }
  return ''
}

// 复制 profile 中的 cookie 和 session 数据到临时目录
// 这样不会锁定用户的浏览器
async function createSessionContext() {
  const profilePath = getUserChromeProfilePath()
  const tempProfile = path.join(app.getPath('temp'), 'imprint-browser-session')

  // 只复制必要的 session 文件（Cookies, Login Data 等）
  // 不复制缓存，减少磁盘占用

  return await chromium.launchPersistentContext(tempProfile, {
    headless: true,
    // ...
  })
}
```

**方案 2：CDP 连接已运行的浏览器**

```typescript
// 用户需要以 --remote-debugging-port 启动 Chrome
const browser = await chromium.connectOverCDP('http://localhost:9222')
```

适用场景：高级用户，或者用户浏览器正在运行时的备选方案。

**方案 3：导入 Cookie 文件**

提供手动导入 cookie 的选项，作为前两种方案的降级备选。

### 9.2 分析结果页面布局

参考 DesignMD 的布局，设计两栏式结果展示：

```
┌──────────────────────────────────────────────────────────────┐
│  分析结果 - github.com                            [导出 ▼]   │
├──────────────────────┬───────────────────────────────────────┤
│  截图预览             │  [Preview] [Markdown] [Tailwind] [CSS] [JSON] │
│  ┌────────────────┐  │                                       │
│  │                │  │  # GitHub                             │
│  │  Above Fold    │  │                                       │
│  │  Screenshot    │  │  > "GitHub Profile — Mona Sans..."    │
│  │                │  │                                       │
│  └────────────────┘  │  ## Colors                            │
│                      │  ...                                  │
│  ■ 色卡 ■ ■ ■ ■ ■   │                                       │
│  PRIMARY  NEUTRAL    │                                       │
│                      │                                       │
│  Typography Scale    │                                       │
│  ┌─────────────────┐ │                                       │
│  │ -apple-system   │ │                                       │
│  │ Body  16px  400 │ │                                       │
│  │ Small 14px  400 │ │                                       │
│  └─────────────────┘ │                                       │
│                      │                     [Copy] [Download] │
└──────────────────────┴───────────────────────────────────────┘
```

---

_本文档将随竞品分析和产品迭代持续更新。_
