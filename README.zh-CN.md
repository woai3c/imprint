<div align="center">
  <img src="./assets/brand/imprint-mark.svg" alt="印记 · Imprint" width="96" />

  <h1>印记 · Imprint</h1>

  <p><strong>将网站和截图转换为 AI 可直接使用的设计系统。</strong></p>

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

Imprint 是一个开源桌面应用，可以将网站和 UI 截图转换为可复用的设计系统。

它会分析颜色、字体、间距、圆角、阴影、布局规律和组件风格，并生成能够直接用于 AI Coding 和前端开发的结构化输出。

不再让 AI 随机生成千篇一律的界面，而是让它基于真实产品的设计系统进行开发。

```text
网站或 UI 截图
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

单靠提示词很难完整描述一套设计语言。Imprint 从真实网站和截图中提取视觉规律，将其转换成 AI 可以理解并持续遵循的结构化设计规范。

## 功能

| 功能          | 说明                                                              |
| ------------- | ----------------------------------------------------------------- |
| 网站分析      | 输入 URL，自动分析网页视觉风格                                    |
| 可追溯证据    | 记录页面拓扑、区块几何、组件实例、视口覆盖和证据限制              |
| 截图分析      | 从 UI 截图中提取设计规律                                          |
| 设计系统生成  | 提取颜色、字体、间距、圆角、阴影和组件风格                        |
| AI 友好文档   | 导出 DESIGN.md，可直接作为 AI Coding 上下文                       |
| 代码导出      | 支持 CSS Variables、Tailwind CSS v4 主题和 JSON Design Tokens     |
| 本地 AI Agent | 支持 Claude Code、Codex、Kimi、Gemini CLI、OpenCode 和 x-code-cli |
| 本地优先存储  | 所有数据保存在本地 SQLite，无需注册账号                           |
| 实时主题预览  | 将提取的设计系统应用到 Imprint 界面，实时查看效果                 |
| 内置主题      | 国风山水、赛博朋克、极简北欧、毛玻璃等多种设计风格                |
| 验证场景      | 在工作流、内容展示与交互状态中检验主题的层级、密度和可读性        |

## 与 AI Coding Agent 配合使用

1. 使用 Imprint 分析网站或 UI 截图。
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

## Design Evidence 与 Design DNA

每次分析会先生成确定性的 `DesignEvidence`：多视口截图、页面拓扑、归一化区块与组件几何、响应式差异、安全交互观察、
媒体层、覆盖范围和限制。它不依赖 AI，并与 Tokens JSON 分开保存。

配置 API 厂商或 Agent CLI 后，印记会把受预算约束的证据包解读为经过校验、带版本号的 `DesignProfile`。桌面端概览会
展示设计主张、标志性手法、迁移规则、置信度和可点击的证据引用。AI 建议的 token 名称只作为 alias 保存，不会替换实际
提取的 token key。

截图输入默认关闭。只有支持视觉输入的 API 模型，并且用户在设置中明确授权后，才会选择少量匿名公开页面截图；登录后
页面默认不会向任何已配置的 AI 发送内容，只有用户明确请求结构解读后才会发送结构化证据，截图始终不会发送。Agent
CLI 也只使用结构化证据。即使设计解读失败，token、证据、截图和实现导出仍然完整可用，并且可以只重试 AI 步骤。

## CLI 与 MCP 智能模式

CLI 只有在明确传入 `--intelligence` 时才会调用 AI 厂商。API Key 从进程环境变量读取——优先使用
`IMPRINT_AI_API_KEY`（通用覆盖），否则使用对应厂商的标准变量：

| 厂商         | 环境变量                                                |
| ------------ | ------------------------------------------------------- |
| `openai`     | `OPENAI_API_KEY`                                        |
| `anthropic`  | `ANTHROPIC_API_KEY`                                     |
| `google`     | `GOOGLE_GENERATIVE_AI_API_KEY`                          |
| `deepseek`   | `DEEPSEEK_API_KEY`                                      |
| `moonshotai` | `MOONSHOT_API_KEY`                                      |
| `alibaba`    | `ALIBABA_API_KEY`                                       |
| `zhipu`      | `ZHIPU_API_KEY`                                         |
| `xai`        | `XAI_API_KEY`                                           |
| `custom`     | `IMPRINT_AI_API_KEY`（需配合 `--base-url` / `baseUrl`） |

```bash
pnpm build:cli
export DEEPSEEK_API_KEY=sk-...            # PowerShell: $env:DEEPSEEK_API_KEY='sk-...'
imprint extract https://example.com --viewport all --format evidence
imprint extract https://example.com --viewport all --intelligence structural --provider deepseek --format profile
imprint extract https://example.com --intelligence vision --provider openai --allow-screenshots
```

MCP 的 `imprint_extract` 始终是确定性提取。显式调用 `imprint_interpret` 才会访问 AI 厂商；也可以给
`imprint_compare` 传入 `depth: "language"`，比较两个经过校验的结构化 DesignProfile。通过 MCP 客户端的
服务器配置传入 API Key，例如：

```json
{
  "mcpServers": {
    "imprint": {
      "command": "imprint-mcp",
      "env": { "DEEPSEEK_API_KEY": "sk-..." }
    }
  }
}
```

此处配置的 API Key 与桌面应用的设置互相独立——各入口只读取自己的来源。

## 下载安装

从 [GitHub Releases](https://github.com/woai3c/imprint/releases/latest) 下载最新版本。

| 平台    | 架构                  |
| ------- | --------------------- |
| Windows | x64                   |
| macOS   | Apple Silicon (arm64) |
| macOS   | Intel (x64)           |

## 技术栈

| 层级     | 技术                                                  |
| -------- | ----------------------------------------------------- |
| 桌面框架 | Electron + Electron Forge                             |
| 前端     | React 19 + TypeScript + Vite                          |
| UI       | Tailwind CSS v4                                       |
| 状态管理 | Zustand                                               |
| 数据存储 | SQLite (better-sqlite3)                               |
| 网页分析 | Playwright                                            |
| 国际化   | i18next + react-i18next                               |
| AI       | OpenAI / Claude / DeepSeek / Kimi API，本地 Agent CLI |

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

# 运行 E2E 测试（无需 LLM）
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
│   └── agent-detect.ts  # AI Agent 检测
│
├── core/                # 共享提取引擎（CLI + MCP + 桌面）
│   ├── analyzer/        # 样式提取、颜色聚类、Token 构建
│   ├── design-evidence/ # 稳定的观察证据与覆盖信息
│   ├── design-intelligence/ # 已校验 Profile、简报、上下文与验证
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
