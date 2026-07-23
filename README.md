# copy-design

[English documentation](README.en.md)

`copy-design` 是一个通用 Agent Skill。它分析参考网站或截图中可观察到的 UI 设计语言，将颜色、字体、间距、圆角、阴影、布局、组件、响应式行为和安全交互状态整理成可执行的项目设计规范。

生成结果会写入项目根目录：

| 现有文件 | 写入目标 |
| --- | --- |
| 只有 `AGENTS.md` | 更新 `AGENTS.md` |
| 只有 `CLAUDE.md` | 更新 `CLAUDE.md` |
| 两者都有 | 同时更新，两处受管区块保持一致 |
| 两者都没有 | 更新或创建 `DESIGN.md` |

它复制的是设计语言，而不是网站源代码、业务逻辑、文案、Logo、品牌图片或受限制的字体文件。

## 可以提取什么

- 主题色、背景、表面、文字、边框和状态颜色
- 字体族、字号、字重、行高和字距
- 页面与组件间距、圆角、边框和阴影
- 页面最大宽度、栅格、侧栏、导航和内容密度
- 按钮、输入框、卡片、导航等常见组件规律
- 桌面、平板和移动端的响应式变化
- hover、focus 和动效信息
- 直接证据、合理推断、置信度和证据缺口
- 用户后续提出的覆盖规则

重新分析同一个 profile 时，Skill 会更新自己的受管区块，并保留用户明确提出的覆盖规则，不会覆盖目标文件中的其他人工内容。

## 环境要求

完整的网站采集模式需要：

- Node.js 20+
- Chrome、Edge 或 Chromium

脚本使用 CommonJS `.js`、Node.js 内置模块和浏览器原生 DevTools pipe，不需要安装 npm 依赖，也不会自动安装运行时或浏览器。

如果只有截图，Agent 可以使用自身的图片理解能力执行视觉分析，不强制要求本地浏览器。

## 安装

### 从 GitHub 安装（推荐）

`copy-design` 遵循开放的 [Agent Skills](https://agentskills.io) 目录规范，可用于 Codex、Claude Code、Cursor、Gemini CLI、OpenCode 等工具。使用通用的 [Agent Skills CLI](https://github.com/vercel-labs/skills) 可以直接从 GitHub 导入完整 Skill，并自动识别已安装的 Agent：

```powershell
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design
```

命令会让你选择安装目标和作用域。默认安装到当前项目；添加 `--global` 或 `-g` 可安装到用户级目录，在所有项目中使用。

### 常见 Agent 和 Agent CLI 的安装命令

下面列出一些常见 Agent 的用户级、非交互安装命令。它们安装的是同一份通用 Skill，只是目标目录不同：

```powershell
# Codex
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent codex --yes

# Claude Code
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent claude-code --yes

# Cursor
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent cursor --yes

# Gemini CLI
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent gemini-cli --yes

# OpenCode
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent opencode --yes

# GitHub Copilot
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent github-copilot --yes

# Kimi Code CLI
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent kimi-code-cli --yes

# Qwen Code
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent qwen-code --yes
```

安装器会拉取完整的 `copy-design/` 目录，包括 `SKILL.md`、脚本和 references，不会只下载入口文件。

如果你的工具不在上表中，可以省略 `--agent` 让安装器自动检测，也可以查看 [Agent Skills CLI 支持列表](https://github.com/vercel-labs/skills#supported-agents) 获取对应标识。

### X-Code CLI

仓库带有 [X-Code CLI](https://github.com/woai3c/x-code-cli) 插件清单，可以直接从 GitHub 安装完整 Skill：

```powershell
xc plugin install github:woai3c/copy-design-skill
```

安装后重启 `xc`，或在当前 X-Code CLI 会话中执行：

```text
/plugin refresh
```

也可以直接在 X-Code CLI 会话中安装并刷新：

```text
/plugin install github:woai3c/copy-design-skill
/plugin refresh
```

`copy-design` 包含脚本和 references，因此不要使用 X-Code CLI 的 `/skill install <url>` 安装本仓库；该命令只下载单个 `SKILL.md`。这里使用插件安装命令，是为了完整拉取仓库并注册其中的 `copy-design` Skill。

更新已安装的版本：

```powershell
npx skills update copy-design
```

X-Code CLI 通过插件安装时使用：

```powershell
xc plugin update copy-design@local
```

### 让 Agent 帮你安装

支持 GitHub Skill 安装的 Agent 可以直接接收下面这段消息：

```text
请从 GitHub 安装 copy-design Skill：
https://github.com/woai3c/copy-design-skill/tree/main/copy-design

使用当前 Agent 支持的 Skill 安装器，安装到用户级目录。
必须安装完整目录，包括 SKILL.md、scripts、references 和 agents。
完成后告诉我安装路径。
```

在 Codex 中也可以明确调用 `$skill-installer`，让它从上面的 GitHub 子目录安装。其他受支持的 Agent 可以使用前面对应的 `npx skills add ... --agent <标识>` 命令；X-Code CLI 使用它自己的 `xc plugin install ...` 命令。

Skill 可以执行本地脚本。安装任何第三方 Skill 前都应先确认仓库来源并审查内容。

### 手动或离线安装

只有在 Agent 不支持 GitHub 导入或机器无法访问 GitHub 时，才需要把完整的 `copy-design/` 目录复制或链接到该 Agent 的 skills 目录。不能只复制 `SKILL.md`，因为脚本和 references 也是 Skill 功能的一部分。

## 使用

### 分析一个网站

```text
使用 copy-design 分析 https://example.com 的 UI 设计风格。
重点分析首页和价格页，覆盖桌面端、平板和移动端。
不要复制 Logo、文案和品牌图片，把设计规范保存到当前项目。
```

### 指定多个页面

```text
使用 copy-design 分析：
- https://example.com/
- https://example.com/pricing
- https://example.com/login

提取颜色、字体、间距、布局、卡片、按钮、表单和响应式规则。
```

### 分析截图

```text
使用 copy-design 分析我提供的桌面端和移动端截图。
无法确定的精确数值标记为估算，不要虚构 CSS 变量或未展示的交互状态。
```

### 继续调整结果

生成第一版后可以继续反馈：

```text
那个蓝色只是链接色，不是主色。
以价格页按钮作为主要操作样式。
保留布局，但把项目默认圆角改成 8px。
```

这些调整会写入“用户覆盖规则”，后续重新采集时继续保留。

## 测试效果

### 方法一：运行本地可视化演示

在仓库根目录运行：

```powershell
node tests/integration_capture.js --keep
```

脚本会启动本地测试网站，用三个视口采集两个页面，并在输出中打印一个临时目录。该目录会保留：

- `screenshots/`：6 张页面截图
- `capture.json`：浏览器采集证据
- `style-facts.json`：提取后的设计事实
- `section-node.md`：生成的设计规范区块
- `AGENTS.md`：合并后的最终示例

先查看 `screenshots/`，再打开 `AGENTS.md`，可以直观看到网站 UI 如何被转换成项目设计规则。

不加 `--keep` 会执行同样的回归测试，但结束后自动清理临时文件：

```powershell
node tests/integration_capture.js
```

### 方法二：在临时项目测试真实网站

先创建一个空项目，避免修改当前仓库的文档：

```powershell
New-Item -ItemType Directory copy-design-demo
Set-Location copy-design-demo
git init
```

然后在该目录中向已安装 Skill 的 Agent 发送：

```text
使用 copy-design 分析 <你要测试的网站 URL>。
覆盖桌面端、平板和移动端，将结果写入当前项目。
完成后告诉我采集了哪些页面和状态，以及哪些结论置信度较低。
```

正常情况下会生成 `DESIGN.md`。你可以继续要求 Agent 修正颜色角色、圆角、组件优先级或页面权重，观察“用户覆盖规则”是否能在重新分析后保留。

### 运行全部自动化测试

```powershell
node tests/test_managed_section.js
node tests/test_render_section.js
node tests/integration_capture.js
```

## 手动运行脚本

通常应让 Agent 根据 `SKILL.md` 自动编排。调试时可以手动执行：

```powershell
node <skill-dir>/scripts/capture_site.js `
  --url https://example.com `
  --output <temporary-evidence-dir>

node <skill-dir>/scripts/extract_style_facts.js `
  --input <temporary-evidence-dir>/capture.json `
  --output <temporary-evidence-dir>/style-facts.json

node <skill-dir>/scripts/render_design_section.js `
  --input <temporary-evidence-dir>/style-facts.json `
  --output <temporary-evidence-dir>/design-section.md `
  --profile example-light `
  --language zh-CN

node <skill-dir>/scripts/verify_managed_section.js inspect `
  --file <temporary-evidence-dir>/design-section.md
```

本地开发地址需要显式添加 `--allow-private`。原始截图和证据应保存在临时目录，不要提交到被分析的项目。
