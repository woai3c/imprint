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

将完整的 `copy-design/` 目录复制或链接到 Agent 使用的 skills 目录：

```text
<agent-skills-dir>/
└── copy-design/
    ├── SKILL.md
    ├── agents/
    ├── scripts/
    └── references/
```

不能只复制 `SKILL.md`，因为 `scripts/` 和 `references/` 也是 Skill 功能的一部分。不同 Agent 的 skills 目录不同，请使用对应 Agent 的 Skill 安装方式。

如果 Agent 没有原生 Skill 机制，也可以让它直接读取仓库中的入口文件：

```text
请完整读取 <copy-design-repo>/copy-design/SKILL.md，
按照其中的工作流分析 https://example.com，
并将设计规范写入当前项目根目录。
```

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
