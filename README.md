# 印记 (Imprint)

> 从网站和截图中提取设计语言，自动生成可复用的设计系统。

Imprint 是一个开源桌面应用，可以分析网站 URL 或 UI 截图，提取其中的视觉规则（颜色、字体、间距、圆角、阴影、组件风格等），并生成 AI 可直接使用的设计规范和代码变量。

让 AI Coding 不再随机生成 UI，而是基于真实产品的设计系统构建一致、高质量的界面。

[English](./README.en.md)

---

## 为什么需要 Imprint？

AI Coding 极大降低了开发 UI 的成本，但让 AI 持续生成符合产品风格的界面仍然很困难。

传统流程：

```
设计师
↓
Figma 设计稿
↓
开发实现
```

AI 时代：

```
优秀网站 / UI 截图
↓
Imprint
↓
Design System
↓
AI Agent
↓
一致性的产品界面
```

Imprint 将真实产品中的视觉语言转换为 AI 可以理解的设计系统，让 AI 更容易生成符合目标风格的 UI。

---

## 功能

### 🎨 设计语言提取

- **网站分析** — 输入 URL，自动分析网页视觉风格
- **截图分析** — 从 UI 截图中提取设计规律
- **设计系统生成** — 提取颜色、字体、间距、阴影、圆角等 Design Tokens
- **视觉风格分析** — 分析页面布局、组件样式和整体设计语言

### 🤖 AI Coding 集成

- **AI 友好输出** — 生成 Markdown 设计规范，可直接作为 AI Coding 上下文
- **代码变量导出** — 支持 CSS Variables、Tailwind CSS v4 `@theme`、JSON Design Tokens
- **Agent 集成** — 支持本地 AI Agent CLI，包括 Claude Code、Codex、Kimi、x-code-cli 等

### 🖥️ 产品体验

- **实时换肤** — 将提取的设计系统应用到应用 UI，实时查看效果
- **模板演示** — 提供后台管理、官网、电商、博客等模板展示生成效果
- **内置主题** — 内置国风山水、赛博朋克、极简北欧、毛玻璃、暗黑等设计风格

### 🔒 隐私与本地化

- **本地优先** — 所有数据保存在本地 SQLite，无需注册账号
- **多语言支持** — 支持中文和英文界面

---

## 使用流程

```
输入网站 URL 或截图
```

      ↓

```
分析网页结构和视觉样式
```

      ↓

```
生成 Design System
```

      ↓

```
导出：
• DESIGN.md
• CSS Variables
• Tailwind Theme
• JSON Tokens
```

      ↓

```
用于 AI Coding 或前端开发
```

---

## 示例输出

Imprint 可以生成：

### DESIGN.md

包含：

- 产品视觉风格说明
- 色彩系统
- Typography 规范
- 间距规则
- 圆角规范
- 阴影规则
- 组件设计建议

### CSS Variables

```css
:root {
  --color-primary: #2563eb;
  --radius-md: 8px;
  --spacing-lg: 24px;
}
```

### Tailwind CSS v4 Theme

```css
@theme {
  --color-primary: #2563eb;
  --radius-md: 8px;
}
```

---

## 技术栈

| 层级     | 技术                                                  |
| -------- | ----------------------------------------------------- |
| 桌面框架 | Electron 34 + Electron Forge                          |
| 前端     | React 19 + TypeScript + Vite                          |
| UI       | Tailwind CSS v4                                       |
| 状态管理 | Zustand v5                                            |
| 数据存储 | SQLite (better-sqlite3)                               |
| 网页分析 | Playwright                                            |
| 国际化   | i18next + react-i18next                               |
| AI       | OpenAI / Claude / DeepSeek / Kimi API，本地 Agent CLI |

---

## AI 配置

Imprint 支持两种 AI 使用方式：

### 1. API Key

在设置页面配置 AI 服务：

支持：

- OpenAI
- Claude
- DeepSeek
- Kimi
- 其他兼容 OpenAI API 的服务

### 2. 本地 Agent CLI

自动检测本机已安装的 AI Agent：

支持：

- Claude Code
- Codex
- Kimi
- Gemini CLI
- OpenCode
- x-code-cli

---

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发模式
pnpm dev

# 打包
pnpm build

# 构建安装包
pnpm make
```

---

## 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── analyzer/            # 网页分析引擎
│   │   ├── style-extractor.ts
│   │   ├── color-cluster.ts
│   │   └── token-builder.ts
│   ├── export.ts            # Design System 导出
│   ├── database.ts          # SQLite 数据库
│   └── agent-detect.ts      # AI Agent 检测
│
└── renderer/                # React 前端
    ├── components/
    ├── pages/
    ├── stores/
    └── styles/
```

---

## License

MIT
