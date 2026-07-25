# 印象 (Imprint)

一个开源桌面应用，输入网站 URL 即可提取 UI 设计风格，导出为 CSS/Tailwind 主题文件供 AI 使用。

[English](./README.en.md)

## 功能

- **一键提取** — 输入 URL，自动提取颜色、字体、间距、阴影、圆角等设计系统
- **代码优先** — 样式提取完全由代码完成（零 token 消耗），仅语义化命名借助 LLM
- **多格式导出** — CSS 自定义属性、Tailwind v4 `@theme`、Markdown 设计文档、JSON 设计令牌
- **实时换肤** — 将提取的设计风格应用到产品自身 UI，即时体验效果
- **模板演示** — 后台管理、官网、电商、博客等模板，用提取的主题渲染展示
- **内置主题** — 国风山水画、赛博朋克、极简北欧、毛玻璃、暗黑系等精品主题
- **本地存储** — 所有数据保存在本地 SQLite，无需登录，可导出共享
- **AI 友好** — 导出物专为 AI 设计，可直接用于生成或修改 UI
- **国际化** — 支持中文和英文界面

## 技术栈

| 层级     | 技术                                                    |
| -------- | ------------------------------------------------------- |
| 桌面框架 | Electron 34 + Electron Forge                            |
| 前端     | React 19, TypeScript, Vite                              |
| UI       | Tailwind CSS v4                                         |
| 状态     | Zustand v5                                              |
| 数据     | SQLite (better-sqlite3)                                 |
| 分析     | Playwright (playwright-core)                            |
| 国际化   | i18next + react-i18next                                 |
| AI       | 支持 API Key 直连或本地 Agent CLI (x-code-cli, kimi 等) |

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

## AI 配置

支持两种方式（二选一）：

1. **API Key** — 在设置页配置 LLM 厂商的 API Key（DeepSeek、Claude、GPT、Kimi 等）
2. **本地 Agent CLI** — 自动检测已安装的 AI Agent CLI（x-code-cli、claude、codex、opencode、gemini、kimi）

## 目录结构

```
src/
├── main/                   # Electron 主进程
│   ├── index.ts            # 入口，创建窗口
│   ├── preload.ts          # 预加载脚本，暴露 API
│   ├── database.ts         # SQLite 数据库
│   ├── ipc.ts              # IPC 处理程序
│   ├── settings.ts         # 应用设置持久化
│   ├── export.ts           # CSS/Tailwind/JSON/MD 生成
│   ├── agent-detect.ts     # 检测本地 AI Agent CLI
│   └── analyzer/           # 网页分析引擎
│       ├── index.ts        # 分析流程编排
│       ├── style-extractor.ts  # DOM 样式提取
│       ├── color-cluster.ts    # 颜色聚类算法
│       └── token-builder.ts    # 设计令牌构建
└── renderer/               # React 前端
    ├── App.tsx             # 路由入口
    ├── main.tsx            # 渲染入口
    ├── i18n/               # 国际化
    ├── components/         # 组件
    ├── pages/              # 页面
    ├── stores/             # Zustand 状态
    └── styles/             # 全局样式
```

## License

MIT
