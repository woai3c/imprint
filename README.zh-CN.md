<div align="center">
  <img src="./assets/brand/imprint-mark.svg" alt="印记 · Imprint" width="96" />

  <h1>印记 · Imprint</h1>

  <p><strong>将网站转换为确定性、AI 可直接使用的设计上下文。</strong></p>

  <p>
    提取颜色、字体、间距、圆角、阴影和组件风格，
    导出为 DESIGN.md、CSS Variables、Tailwind CSS 主题、JSON Design Tokens 和可追溯 Design Evidence。
  </p>

  <p>
    <a href="./README.md">English</a>
    ·
    <a href="https://github.com/woai3c/imprint/releases/latest">下载安装</a>
    ·
    <a href="#功能">功能</a>
    ·
    <a href="#开发">开发</a>
  </p>
</div>

## Imprint 是什么？

Imprint 是一个开源桌面应用，可以将网站转换为可复用的设计系统。

它会分析颜色、字体、间距、圆角、阴影、布局规律和组件风格，并生成能够直接用于 AI Coding 和前端开发的结构化输出。

AI 是这些输出的下游使用者，不是提取过程的依赖。核心分析、声明和导出由确定性程序完成，不需要模型厂商、
API Key 或本地 Agent 运行时。

Imprint 仅接受网站 URL 作为分析输入，不支持分析独立的截图文件。截图只包含某个时刻渲染后的像素，无法可靠还原
DOM 层级、计算样式、响应式规则或交互状态。Imprint 展示和导出的截图由分析器从已加载的网站中自动捕获，作为
URL 分析的可追溯视觉证据。

不再让 AI 随机生成千篇一律的界面，而是让它基于真实产品的设计系统进行开发。

```text
网站 URL
       ↓
    Imprint
       ↓
   Design System
       ↓
Claude Code / Codex / 其他 AI Agent
       ↓
风格一致、可持续迭代的产品界面
```

## 为什么需要 Imprint？

AI Coding 可以快速生成界面，但生成结果往往风格普通，并且难以在多个页面之间保持一致。

单靠提示词很难完整描述一套设计语言。Imprint 从真实网站中提取视觉规律，将其转换成 AI 可以理解并持续遵循的结构化设计规范。

## 功能

| 功能           | 说明                                                          |
| -------------- | ------------------------------------------------------------- |
| 网站分析       | 输入 URL，自动分析网页视觉风格                                |
| 多样化页面发现 | 联合导航链接与 sitemap，选择有代表性的同站页面                |
| 可追溯证据     | 记录页面拓扑、区块几何、组件实例、视口覆盖和证据限制          |
| Token 置信度   | 保存每个 token 的来源、页面覆盖和确定性置信度                 |
| 截图证据       | 自动捕获已分析页面和视口，作为可追溯的视觉证据                |
| 设计系统生成   | 提取颜色、字体、间距、圆角、阴影和组件风格                    |
| AI 友好文档    | 导出 Google DESIGN.md alpha，并保留可追溯的 Imprint 扩展      |
| 代码导出       | 支持 CSS Variables、Tailwind CSS v4 主题和 JSON Design Tokens |
| Agent 集成     | 通过导出文件或 MCP 与外部 Coding Agent 配合使用               |
| 本地优先存储   | 所有数据保存在本地 SQLite，无需注册账号                       |
| 网站主题库     | 保存分析快照，并在隔离的固定验证场景中预览其设计令牌          |
| 内置主题       | 国风山水、赛博朋克、极简北欧、毛玻璃等多种设计风格            |
| 验证场景       | 在工作流、内容展示与交互状态中检验主题的层级、密度和可读性    |

## 与 AI Coding Agent 配合使用

1. 使用 Imprint 分析网站 URL。
2. 导出生成的 `DESIGN.md`。
3. 将 `DESIGN.md` 放到目标项目中。
4. 给 AI Coding Agent 以下指令：

> 阅读 DESIGN.md，并将它作为所有 UI 实现的视觉规范。在保留当前产品需求的前提下遵循其中的颜色、字体、间距、圆角、阴影和组件风格，不要复制来源网站的品牌、文案和受版权保护的内容。

### 应该导出哪一种？

| 目标                               | 推荐输出                 | 一起提供             |
| ---------------------------------- | ------------------------ | -------------------- |
| 让 AI 修改已有 UI                  | **DESIGN.md**            | 当前 UI 截图或源代码 |
| 直接在 CSS 项目中实现              | **CSS Variables**        | 现有样式入口文件     |
| 直接在 Tailwind v4 项目中实现      | **Tailwind `@theme`**    | 项目的主题样式文件   |
| 交给工具链或需要结构化数据的 Agent | **Tokens JSON**          | 具体的自动化任务说明 |
| 审计来源页面的实际观察范围         | **Design Evidence JSON** | 对应页面截图         |

如果只给 AI 一个导出文件，请选择 **DESIGN.md**。

Imprint 生成的 `DESIGN.md` 遵循 [Google Labs DESIGN.md alpha 规范](https://github.com/google-labs-code/design.md)：先构建类型化文档模型，再按规范 YAML 分组和固定章节顺序渲染。紧凑的 `x-imprint` 扩展只保留来源、覆盖率、分析摘要、响应式元数据和 alpha 规范暂未覆盖的令牌；完整令牌溯源保留在 Tokens JSON 与 `design-evidence.json` 中。

## 确定性设计上下文

每次分析都会生成确定性的 `DesignEvidence`：多视口截图、页面拓扑、归一化区块与组件几何、响应式差异、安全交互观察、
媒体层、覆盖范围和限制。程序规则再将证据转换为稳定、可追溯的 Design Profile、重构简报、验证方案和导出物。相同的
捕获证据会生成完全相同的上下文。

Imprint 不包含模型厂商、API Key 设置或 Agent CLI 执行路径。外部 Coding Agent 可以通过文件或 MCP 使用分析完成后的
产物，但不会参与提取，也不能改变来源事实。

## CLI 与 MCP

```bash
pnpm build:cli
imprint extract https://example.com --viewport all --format evidence
imprint extract https://example.com --pages 5 --discovery auto --format json
imprint extract https://example.com --viewport all --format profile
```

MCP 服务器提供确定性的 `imprint_extract` 与 `imprint_compare` 工具，不需要任何厂商凭据。`imprint_compare` 可以接收
两个 URL 或两个已经导出的 Design Profile，并按 token 或确定性设计语言进行比较。

## 下载安装

从 [GitHub Releases](https://github.com/woai3c/imprint/releases/latest) 下载最新版本。

| 平台    | 架构                  |
| ------- | --------------------- |
| Windows | x64                   |
| macOS   | Apple Silicon (arm64) |
| macOS   | Intel (x64)           |

## 技术栈

| 层级     | 技术                         |
| -------- | ---------------------------- |
| 桌面框架 | Electron + Electron Forge    |
| 前端     | React 19 + TypeScript + Vite |
| UI       | Tailwind CSS v4              |
| 状态管理 | Zustand                      |
| 数据存储 | SQLite (better-sqlite3)      |
| 网页分析 | Playwright                   |
| 国际化   | i18next + react-i18next      |

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发模式
pnpm dev

# 打包应用
pnpm build

# 构建分发包（Windows 输出 zip，macOS 输出 DMG）
pnpm make

# 运行确定性 E2E 测试
pnpm test:e2e
```

## 发布

构建签名、Apple 公证、GitHub Actions 配置和发布流程，请参阅：

- [桌面应用构建、签名与发布指南](./DEPLOYMENT.zh-CN.md)

## 项目结构

```
src/
├── main/                # Electron 主进程
│   ├── analyzer/        # 网页分析引擎（Electron 包装层）
│   ├── export.ts        # 设计系统导出
│   ├── database.ts      # SQLite 数据库
│
├── core/                # 共享提取引擎（CLI + MCP + 桌面）
│   ├── analyzer/        # 样式提取、颜色聚类、Token 构建
│   ├── design-evidence/ # 稳定的观察证据与覆盖信息
│   ├── design-context/  # 已校验 Profile、简报、上下文与验证
│   └── export/          # CSS / Tailwind / JSON / Markdown / SCSS 生成器
│
├── cli/                 # CLI 入口（imprint 命令）
├── mcp/                 # MCP stdio 服务器（imprint-mcp 命令）
│
└── renderer/            # React 前端
    ├── components/
    ├── pages/
    ├── stores/
    └── i18n/
```

## 许可证

MIT
