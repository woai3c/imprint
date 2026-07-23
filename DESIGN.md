# `copy-design` Skill 设计文档

## 1. 文档状态

- 状态：MVP 已实现并通过本地集成测试
- 目标实现：通用 Agent Skill；核心工作流不绑定单一厂商
- 推荐 skill 名称：`copy-design`
- 默认输出：项目根目录的 `AGENTS.md`、`CLAUDE.md` 或 `DESIGN.md`
- 当前实现：`copy-design/` 中包含标准 skill、零 npm 依赖的 Node.js 20+ 完整链路和按需 references
- 当前验证：本地 fixture 的两个路由、三个视口、hover/focus 状态、响应式差异、幂等合并、损坏标记失败关闭和用户覆盖保留
- 后续范围：自动代表页发现、更多可证明无副作用的展示状态、真实项目消费规范后的视觉回归闭环

## 实现进度（后续开发入口）

这是后续继续实现时的权威入口。每次增加功能后，必须同步更新本节、相关测试和 README，不能只修改代码。

- 当前里程碑：`MVP v0.2 — Node.js 20+ CommonJS`
- 最后更新：`2026-07-23`
- Phase 1 核心闭环：已完成
- Phase 2 覆盖率与精度：部分完成
- Phase 3 实现与视觉回归闭环：尚未开始
- Agent 兼容策略：核心 `SKILL.md`、scripts 和 references 保持厂商无关；`agents/openai.yaml` 仅为可选 OpenAI/Codex UI 适配器

### 已完成

- [x] 标准 `SKILL.md`、references 和可选 Agent UI 元数据
- [x] 将核心工作流改为 Agent 无关，不要求特定厂商工具名称
- [x] 探测 Node.js 20+，并在 URL 采集时探测本地浏览器
- [x] 确定 Node.js 为唯一脚本运行时；不自动安装运行时或依赖
- [x] 将全部脚本改为 CommonJS `.js`
- [x] 使用 Chrome 原生 DevTools pipe 和 Node.js 内置流，移除自制 WebSocket/HTTP 传输层
- [x] Node.js Chrome DevTools Protocol 页面采集
- [x] Node.js 设计事实提取、Markdown 渲染和受管区块校验
- [x] 用户显式传入多个 URL
- [x] 桌面、平板、手机三种默认视口
- [x] 截图、可见 DOM 摘要、计算样式、元素几何、CSS 变量、媒体查询和字体证据
- [x] 安全采集 hover 和 focus，不进行点击或提交
- [x] 颜色、字体、间距、圆角、边框、阴影、动效、层级和基础组件候选提取
- [x] 跨视口响应式差异观察
- [x] `AGENTS.md`、`CLAUDE.md`、`DESIGN.md` 目标解析和受管区块预览
- [x] 稳定 profile ID、幂等替换、损坏标记失败关闭
- [x] 重新生成时保留用户覆盖规则
- [x] 默认中文 README 和独立英文 README
- [x] 单元测试、本地响应式 fixture 和真实 Chrome 集成测试
- [x] `node tests/integration_capture.js --keep` 可视化演示，保留截图、事实 JSON 和最终示例文档
- [x] GitHub 子目录一键安装说明，并通过通用 `npx skills` 安装器验证 Skill 可被发现
- [x] Codex、Claude Code、Cursor、Gemini CLI、OpenCode、GitHub Copilot、Kimi Code CLI 和 Qwen Code 的安装命令
- [x] X-Code CLI 插件分发清单，可从 GitHub 完整安装包含脚本和 references 的 Skill

### 部分完成

- [ ] 视觉模式：Agent 已可依据截图和模板工作，但尚无独立的截图事实提取脚本
- [ ] 交互式优化：用户覆盖可持久化在 Markdown，但尚无结构化 profile 历史
- [ ] 运行时降级：Node.js 20+ 具备完整确定性链路；缺少兼容 Node.js 时由 Agent 按视觉工作流手动执行
- [ ] 多页面：支持显式 URL，但尚未自动发现和筛选代表页面
- [ ] 组件状态：支持 hover/focus，尚未覆盖菜单、弹窗、tabs、drawer、selected、checked 和 expanded

### 尚未实现

- [ ] 同源代表页面自动发现、分类、去重和数量上限
- [ ] light/dark 多主题采集和独立 design profile
- [ ] `.copy-design/profiles/<name>/` 结构化 spec、overrides 和 evidence manifest
- [ ] 开放 Shadow DOM 和同源 iframe 遍历
- [ ] 用户控制的已登录浏览器会话复用
- [ ] 更精确的组件 anatomy、变体、状态和语义颜色识别
- [ ] 自动对比度检查、渐变和透明叠层分析
- [ ] 图片比例、裁切、图标描边和视觉素材风格分析
- [ ] 参考网站与当前实现的区域级视觉差异比较
- [ ] “提取 → 实现 → 截图 → 对比 → 修正”的自动闭环
- [ ] Windows 之外的真实浏览器和 CI 验证

### 下一批建议任务

1. 用三个不同类型的真实公开网站执行前向测试，记录失败证据。
2. 实现同源代表页面自动发现和安全过滤。
3. 实现 dark theme 与持久化 profile。
4. 增加可证明无副作用的菜单、弹窗和 tab 状态控制器。
5. 进入 Phase 3 前先实现区域级视觉差异报告。

### 继续开发前检查

```powershell
node tests/test_managed_section.js
node tests/test_render_section.js
node tests/integration_capture.js
```

此外，维护者应使用本机 Agent 环境已提供的 skill 校验器检查 `copy-design/`；仓库不会为校验自动安装额外运行时。

当前集成测试预期：

- 两个本地路由 × 三个视口，共 6 次成功采集
- 无采集错误
- URL 查询参数不进入 evidence
- 至少提取颜色、按钮组件、两个媒体查询、响应式观察和 hover/focus 差异
- 生成的受管区块小于 30 KB 并通过校验

## 2. 产品目标

给定一个用户认为设计优秀的网站，自动观察其视觉和交互设计，提炼出足以指导后续前端实现的设计系统，并安全写入当前项目的设计约束文件。

生成的规范必须回答：

- 这个网站为什么“看着舒服”
- 它使用了哪些稳定的颜色、字体、间距和形状规则
- 页面整体是怎样组织和响应不同屏幕的
- 常用组件长什么样、有哪些状态
- 在新项目中怎样复现这种设计语言
- 哪些结论来自直接证据，哪些只是合理推断

## 3. 非目标

skill 默认不执行以下工作：

- 克隆目标网站的源代码、文案或业务功能
- 下载并重新分发专有图片、Logo、字体和付费素材
- 绕过登录、验证码、反自动化或访问控制
- 自动触发提交、购买、删除、发送消息等有副作用的操作
- 在没有证据时声称做到 100% 像素级一致
- 未经用户要求直接修改项目的前端实现
- 将海量原始抓取数据永久写入项目

## 4. 典型触发方式

skill 的 description 应覆盖以下语义：

- “复制这个网站的 UI 风格”
- “分析这个网站的设计系统并保存到项目”
- “提取这个页面的颜色、字体、间距、组件和响应式规则”
- “把参考网站的设计规范追加到 AGENTS.md/CLAUDE.md”
- “根据这个 URL 生成 DESIGN.md”

示例请求：

```text
使用 $copy-design 分析 https://example.com 的整体设计风格，
重点关注首页、价格页和登录页，并写入当前项目的设计规范。
```

```text
使用 $copy-design 提取这个页面的移动端设计。
不要复制品牌素材，只保留布局、颜色、字体和组件规则。
```

## 5. 输入协议

### 5.1 必需输入

- 至少一个来源 URL、可访问的本地开发地址，或一组用户提供的截图
- 当前项目目录

### 5.2 可选输入

- `routes`：必须分析的路由列表
- `viewports`：视口列表
- `states`：希望覆盖的交互状态
- `profile`：设计配置名称，默认从站点域名生成
- `mode`：`enhanced`、`visual` 或 `auto`
- `pageLimit`：自动发现页面上限
- `stateLimit`：每页交互状态上限
- `include`：特别关注的设计方面
- `exclude`：不希望模仿或采集的内容
- `assetPolicy`：资产只描述、允许引用，或用户明确授权复制
- `target`：用户显式指定的输出文件；必须位于项目根目录
- `replaceProfile`：是否用本次 profile 取代旧的受管设计区块

### 5.3 推荐默认值

```yaml
mode: auto
viewports:
  - name: desktop
    width: 1440
    height: 900
  - name: tablet
    width: 768
    height: 1024
  - name: mobile
    width: 390
    height: 844
pageLimit: 8
stateLimit: 6
sameOriginOnly: true
disableAnimationsDuringCapture: true
assetPolicy: describe-only
```

这些是采样默认值，不应被误写成目标站的响应式断点。真实断点必须从媒体查询和跨视口行为中推断。

## 6. 推荐 skill 包结构

当前仓库使用 `skill-creator` 初始化标准目录和 OpenAI UI 元数据；核心 `SKILL.md`、scripts 和 references 不依赖该工具运行，其他 Agent 可直接读取或安装。

```text
copy-design/
├── SKILL.md
├── agents/
│   └── openai.yaml  # 可选的 OpenAI/Codex UI 元数据
├── scripts/
│   ├── capture_site.js
│   ├── extract_style_facts.js
│   ├── render_design_section.js
│   └── verify_managed_section.js
└── references/
    ├── evidence-schema.md
    ├── extraction-rules.md
    ├── output-template.md
    └── safety-and-rights.md
```

不建议初期创建 `assets/`。该 skill 的默认产物是 Markdown 规则，原始截图和 DOM 快照应放入系统临时目录，并在任务完成后清理。只有后续确认需要固定的测试页面或模板时才增加 assets。

### 6.1 `SKILL.md`

只保留核心流程和决策规则：

- 明确输入和模式选择
- 选择项目根目录和输出目标
- 按证据采集、提取、归纳、生成、合并、校验的顺序执行
- 指向必要的 references
- 规定降级策略和停止条件
- 要求输出可追溯性与置信度
- 要求只修改受管区块

`SKILL.md` 应短于 500 行，并使用祈使式指令。详细 schema、提取算法、模板和安全说明放入 references，避免每次触发都占用过多上下文。

### 6.2 `scripts/capture_site.js`

职责：

- 启动本机 Chrome、Edge 或 Chromium，并通过原生 DevTools pipe 通信
- 创建确定性的视口、语言、时区和颜色模式
- 等待页面、字体和布局稳定
- 禁用动画和光标闪烁后截图
- 记录 DOM 摘要、元素几何、计算样式、CSS 变量和媒体查询
- 安全触发允许的 hover、focus、展开和关闭操作
- 输出临时 evidence bundle

脚本不负责语义推断，也不直接修改项目文件。

### 6.3 `scripts/extract_style_facts.js`

职责：

- 规范化颜色、长度、字体和阴影
- 过滤不可见节点、浏览器默认噪声和一次性值
- 聚类相近值并保留原始证据
- 统计跨页面、跨视口和跨组件的重复规则
- 检测候选 token、布局模式、组件和状态差异
- 输出符合 schema 的结构化 JSON

脚本只产生“事实和候选项”，最终的语义命名由当前 Agent 根据页面上下文完成。

Node.js 是唯一脚本运行时。所有脚本使用 CommonJS、Node.js 内置模块和同一套 schema、稳定 ID 与受管标记协议；不会自动安装 npm 包或其他运行时。

### 6.4 `scripts/render_design_section.js`

职责：

- 接收归纳后的设计 spec JSON
- 按固定章节顺序渲染 Markdown
- 生成稳定的受管区块标记
- 对表格、颜色值、URL 和 Markdown 特殊字符进行转义
- 将结果写到标准输出或临时文件

它不直接覆盖 `AGENTS.md`、`CLAUDE.md` 或 `DESIGN.md`。实际合并由代理使用受控补丁完成。

### 6.5 `scripts/verify_managed_section.js`

职责：

- 检查起止标记是否成对且不嵌套
- 检查同一 profile 是否重复
- 检查必需章节是否存在
- 对比修改前后的文件，确认受管区块外内容没有变化
- 检查文档长度预算和潜在敏感 URL 参数

脚本使用 CommonJS `.js`，保持目标解析、稳定 ID、标记和幂等协议的一致性。

### 6.6 references

- `evidence-schema.md`：原始证据和归纳结果的数据结构
- `extraction-rules.md`：token、布局、组件和状态的提取规则
- `output-template.md`：写入三类目标文件时的 Markdown 模板
- `safety-and-rights.md`：交互安全、隐私清理、资产和品牌边界

## 7. 总体架构

```text
用户输入
   ↓
范围解析与能力探测
   ↓
页面发现与安全过滤
   ↓
多页面 × 多视口 × 安全状态采集
   ↓
样式事实提取与聚类
   ↓
语义化设计系统推断
   ↓
Markdown 受管区块生成
   ↓
目标文件选择与幂等合并
   ↓
结构校验与结果报告
```

核心设计原则是把“事实提取”和“设计判断”分开：

- 脚本负责稳定、可测试、重复执行的采集和统计
- Agent 负责理解页面角色、命名语义 token、总结设计原则和解释例外
- 校验器负责防止重复、越界修改和敏感信息泄漏

## 8. 完整工作流

### 阶段 A：解析范围

1. 解析 URL、截图、路由、视口和用户关注点。
2. 使用 `git rev-parse --show-toplevel` 确认项目根目录；不在 Git 仓库时使用用户明确指定的项目目录或当前工作目录。
3. 只读取根目录的 `AGENTS.md`、`CLAUDE.md` 和 `DESIGN.md`，确定现有约束与输出目标。
4. 规范化来源 URL：
   - 去除 fragment
   - 默认去除 query
   - 对可能包含 token、email、session、signature 的参数强制脱敏
5. 探测浏览器自动化、截图和 DOM 读取能力。
6. 选择增强模式或视觉模式，并在输出中记录模式。

### 阶段 B：发现代表页面

当用户没有给出完整路由时：

1. 从入口页提取同源链接。
2. 排除登出、删除、支付、下载、管理动作和带敏感参数的 URL。
3. 根据 URL、标题和 DOM 特征对页面分类：
   - 营销/首页
   - 列表/搜索
   - 详情
   - 表单/登录
   - 价格/结算展示
   - 文档/文章
   - 仪表盘/数据页
4. 每类优先选择一个代表页面。
5. 总量不超过 `pageLimit`。

不应把自动页面发现做成无限爬虫。

### 阶段 C：确定性采集

每个页面按每个视口执行：

1. 建立隔离的浏览器上下文。
2. 使用固定 locale、timezone、reduced motion 和 color scheme；若用户指定暗色模式，则建立独立 profile。
3. 导航后等待 DOM ready、字体加载完成和关键布局稳定。
4. 对持续轮询的网站设置最大等待时间，不强求永久 network idle。
5. 隐藏光标，暂停 CSS 动画和 transition，再采集基础截图。
6. 记录：
   - 可见 DOM 的标签、角色、稳定类名和层级摘要
   - 元素 `getBoundingClientRect`
   - 选择后的计算样式属性白名单
   - 文档和组件范围内的 CSS 自定义属性
   - 可读样式表中的 `@media`、`@font-face`、keyframes 和状态选择器
   - 图片的展示尺寸、比例和视觉角色，不默认下载原文件
7. 保存页面全局截图和关键组件裁剪图。
8. 对安全元素采集 hover、focus、expanded、selected、disabled 等状态。

计算样式白名单至少应覆盖：

- display、position、overflow、z-index
- width、height、min/max size
- margin、padding、gap
- grid、flex、alignment
- font family/size/weight/line-height/letter-spacing
- foreground/background/border/outline colors
- border width/style/radius
- box-shadow、opacity、filter、backdrop-filter
- transform、transition、animation

### 阶段 D：安全交互状态采集

允许自动执行：

- hover
- focus 与 blur
- 展开/折叠菜单
- 打开/关闭无提交弹窗
- 切换纯展示 tab
- 切换不会写入远端数据的视觉开关

禁止自动执行：

- 提交表单
- 登录、注册、发送验证码
- 购买、支付、预约
- 删除、发布、点赞、关注
- 上传文件
- 发送消息、邮件或通知
- 任何无法确认是否有副作用的操作

无法安全触发的状态应列入“未覆盖状态”，等待用户截图补充。

### 阶段 E：设计事实提取

#### 颜色

1. 将 hex、rgb、rgba、hsl 等格式转换为统一色彩表示，同时保留原值。
2. 按用途区分文字、背景、边框、图标、阴影和状态。
3. 对相近颜色进行感知聚类，不以简单字符串相等为准。
4. 综合出现频率、可见面积、语义角色和跨页面一致性排序。
5. 计算关键前景/背景对比度。
6. 推断以下候选角色：
   - canvas/surface/elevated surface
   - primary/secondary text
   - muted text
   - border/divider
   - accent/primary action
   - success/warning/danger/info

#### 字体

收集并归纳：

- 字体族与 fallback
- 实际加载状态
- 字号、字重、行高、字距
- 标题、正文、说明、按钮、标签和代码字体角色
- 不同视口的字号变化

专有字体只记录名称、外观特征和替代建议，不复制字体文件。

#### 间距

1. 从 padding、margin、gap 和几何间隔中收集可见样本。
2. 过滤绝对定位装饰、隐藏元素和明显一次性偏移。
3. 以小容差聚类相近值。
4. 拟合基础间距序列，例如 4/8 系列，但只有证据充分时才命名为全局 scale。
5. 区分组件内间距、组件间距、区域间距和页面外边距。

#### 圆角、边框和阴影

- 按控件、卡片、容器、弹层和胶囊标签分类
- 归一化多层阴影并区分 elevation 角色
- 记录是否使用内描边、半透明边框或背景模糊
- 避免把圆形头像的 50% 圆角当作全局大圆角

#### 布局

提取：

- 页面最大宽度和左右 gutter
- 栅格列数、列宽、gap
- 侧栏宽度和 sticky 行为
- header/footer 高度
- 区域垂直节奏
- 对齐锚点
- 内容密度
- overflow 和滚动容器

#### 组件

基于 ARIA role、标签、重复 DOM 子树、类名语义和视觉相似度识别：

- 按钮与图标按钮
- 链接和导航项
- 输入框、选择器、复选框、单选框
- 卡片、列表项、表格和分页
- badge、chip、tooltip
- tabs、accordion、breadcrumb
- modal、drawer、popover、toast
- 空状态、错误状态和 skeleton

每个组件记录 anatomy、尺寸、变体、状态、内部间距、圆角、边框、阴影和响应式变化。

#### 响应式

同时使用两类证据：

- 样式表中的媒体查询
- 多视口采集的实际几何和可见性变化

最终写成行为规则，例如“低于主断点时侧栏变成顶部触发的 drawer”，而不是只罗列媒体查询数值。

#### 动效

记录：

- duration
- easing
- delay
- transition property
- 位移、缩放、淡入淡出和弹性效果
- reduced-motion 行为

暂停动画只用于得到稳定截图，原始动画定义仍需在暂停前读取。

### 阶段 F：语义推断与置信度

每条归纳结论应带内部证据和置信度：

| 等级 | 条件 | 输出方式 |
| --- | --- | --- |
| 高 | 原始 CSS 变量明确，或跨多个页面/组件稳定重复 | 可写成强制规则 |
| 中 | 由多处计算样式和视觉语义共同推断 | 写成推荐规则，并说明例外 |
| 低 | 仅截图估算、单次出现或语义不明确 | 标记为近似值，不能冒充精确 token |

建议的内部评分因素：

- 是否来自 CSS 变量或明确媒体查询
- 出现频率
- 覆盖页面数
- 覆盖视口数
- 可见面积
- 语义一致性
- 是否存在冲突样本
- 是否仅能从截图估算

不要为了让文档看起来完整而填补没有证据的值。

### 阶段 G：生成规范

生成内容应控制在“足够执行但不会污染代理上下文”的范围。推荐受管区块上限为约 12–20 KB；超过时优先合并重复规则、减少原始样本和保留高价值组件。

章节顺序固定为：

1. 来源与覆盖范围
2. 设计 DNA
3. 设计令牌
4. 布局系统
5. 组件规范
6. 响应式规则
7. 交互与动效
8. 可访问性
9. 实施准则
10. 避免事项
11. 证据缺口与置信度

### 阶段 H：选择输出文件

目标解析矩阵：

```text
AGENTS.md 存在，CLAUDE.md 不存在 → AGENTS.md
AGENTS.md 不存在，CLAUDE.md 存在 → CLAUDE.md
AGENTS.md 和 CLAUDE.md 都存在    → 两者
二者都不存在，DESIGN.md 存在    → DESIGN.md
三者都不存在                    → 创建 DESIGN.md
```

如果用户显式指定其中一个根目录文件，则尊重用户选择。不能把受管设计区块写到子目录或项目根目录之外。

### 阶段 I：幂等合并

受管区块格式：

```md
<!-- copy-design:start id=<stable-id> schema=1 -->
## Extracted design system: <profile>

...
<!-- copy-design:end id=<stable-id> -->
```

稳定 ID 输入：

```text
sha256(normalized-origin + "\n" + profile-name)[0:12]
```

合并算法：

1. 读取原文件并保留原始换行风格。
2. 查找匹配 ID 的完整起止标记。
3. 找到一个区块：原位替换。
4. 找不到区块：在文件末尾补一个空行后追加。
5. 找到多个区块、标记缺失或嵌套：停止写入并报告，不猜测修复。
6. 新建 `DESIGN.md` 时添加一级标题，再添加受管区块。
7. 写入后重新解析标记。
8. 对比修改前后内容，确认受管区块之外完全一致。

当同时更新 `AGENTS.md` 和 `CLAUDE.md` 时，两者的生成区块内容与 ID 必须一致。修改前保留内存快照；任何一个校验失败时，不应留下只有一边更新成功的状态。

## 9. 结构化证据模型

建议 evidence bundle 使用版本化 JSON。简化结构如下：

```json
{
  "schemaVersion": "1.0",
  "source": {
    "origin": "https://example.com",
    "profile": "example-light",
    "capturedAt": "ISO-8601",
    "mode": "enhanced"
  },
  "scope": {
    "pages": [],
    "viewports": [],
    "states": [],
    "omissions": []
  },
  "tokens": {
    "colors": [],
    "typography": [],
    "spacing": [],
    "radii": [],
    "borders": [],
    "shadows": [],
    "motion": [],
    "zIndex": []
  },
  "layoutPatterns": [],
  "components": [],
  "responsiveRules": [],
  "accessibilityFindings": [],
  "inferences": [],
  "conflicts": []
}
```

每个候选项至少包含：

```json
{
  "role": "color.action.primary",
  "value": "#2563EB",
  "confidence": "high",
  "evidence": [
    {
      "page": "/pricing",
      "viewport": "desktop",
      "selectorHint": "main CTA",
      "property": "background-color"
    }
  ],
  "exceptions": []
}
```

`selectorHint` 只能使用稳定、脱敏的提示，不应保存用户内容、完整复杂选择器或可能泄露业务信息的 DOM 路径。

## 10. 输出模板

生成区块的建议形态：

```md
<!-- copy-design:start id=8f36c1e94a2b schema=1 -->
## Extracted design system: Example

Source: `https://example.com`
Coverage: 5 pages, 3 viewports, light theme
Evidence quality: high for tokens/layout; medium for interaction states

### Design DNA

- Calm neutral surfaces with one saturated action color.
- Dense controls inside generously spaced page sections.

### Tokens

| Role | Value | Usage |
| --- | --- | --- |
| Canvas | `#...` | Page background |
| Surface | `#...` | Cards and popovers |
| Primary text | `#...` | Headings and body |

### Layout

- ...

### Components

#### Primary button

- ...

### Responsive behavior

- ...

### Interaction and motion

- ...

### Accessibility

- ...

### Implementation rules

- ...

### Avoid

- ...

### Evidence gaps

- Authenticated states were not available.
<!-- copy-design:end id=8f36c1e94a2b -->
```

最终内容应使用项目主要语言；token 名称可保留通用英文，便于直接映射到 CSS 变量或设计系统代码。

## 11. 与项目既有规则的冲突处理

读取目标文件后，将已有人工规则视为更高优先级：

1. 不重写人工区块。
2. 如果目标站规范与项目明确规范冲突，在生成区块中记录“项目覆盖项”。
3. 不自动删除旧 profile。
4. 同一 profile 重跑时更新原区块。
5. 用户明确要求替换来源时，才删除旧受管区块；删除前精确确认 ID。

示例：

```md
### Project overrides

- Keep the project's existing WCAG AA contrast requirement even where the reference
  site's muted text appears lower contrast.
```

## 12. 隐私、安全和访问控制

### URL 与网络

- 默认只访问用户提供的 origin 和同源页面
- 不把网页内容提交给额外的第三方服务
- 不自动访问链接中的私网地址、云元数据地址或非 HTTP 协议
- 用户明确提供的本地开发地址可以访问，但不得扩大到其他本地端口
- 不尝试绕过验证码、付费墙或访问控制

### 浏览器数据

以下内容不得进入 evidence bundle 或输出文档：

- Cookie
- Authorization header
- localStorage/sessionStorage 值
- 密码和表单值
- 含签名、session 或 token 的 URL query
- 用户姓名、邮箱、订单和其他个人数据

需要登录时，优先使用用户已经控制的浏览器会话；skill 不索取或记录明文凭据。

### 文件

- 默认只有目标 Markdown 文件是持久项目修改
- 临时截图和 evidence bundle 使用独立临时目录
- 任务结束后删除临时敏感数据
- 不覆盖受管区块之外的内容
- 不跟随会让目标落到项目根目录外的路径或符号链接

### 资产

- 默认 `describe-only`
- 可记录公开字体名称、图标风格、图片比例和素材角色
- 不默认下载或嵌入字体、Logo、插画和摄影
- 用户明确拥有授权时，资产处理也应作为单独、可审计步骤

## 13. 降级与失败策略

| 情况 | 行为 |
| --- | --- |
| 没有浏览器自动化 | 切换视觉模式，明确精确值为估算 |
| URL 不可访问 | 使用用户截图；没有截图则停止并说明所需输入 |
| 部分 CSS 跨域不可读 | 依赖计算样式和截图，不伪造原始变量名 |
| 登录状态不可用 | 分析公开页面并列出缺失页面 |
| Canvas/WebGL 为主 | 只总结视觉构图，降低组件/token 置信度 |
| 页面持续动画或轮询 | 采用布局稳定检测和最大等待时间 |
| 受管标记损坏 | 不写入，报告具体文件和标记问题 |
| 两个目标文件只成功一个 | 恢复本次修改前状态并报告失败 |
| 证据互相冲突 | 保留分场景规则或标为例外，不强行合并 |
| 文档超过长度预算 | 优先保留高置信度 token、布局和核心组件 |

## 14. 实现阶段

### Phase 1：MVP

- 使用兼容的 Skill 脚手架初始化 `copy-design`（当前仓库已完成）
- 编写精简 `SKILL.md`
- 实现项目根目录和目标文件解析
- 实现浏览器采集适配器
- 提取核心 token、布局和按钮/输入/卡片/导航组件
- 实现 Markdown 渲染和受管区块校验
- 完成三视口采集
- 完成 visual-only 降级

### Phase 2：覆盖率

- 同域页面分类和代表页发现
- 状态安全分类器
- 媒体查询与实际响应行为合并
- Shadow DOM 和同源 iframe
- 暗色主题和多个 design profile
- 更完整的组件检测

### Phase 3：闭环验证

- 让后续前端实现消费生成的规范
- 采集实现页面截图
- 与参考站按结构区域进行视觉比较
- 根据差异更新规范或实现
- 建立固定测试站点和 golden evidence

## 15. 测试方案

### 15.1 单元测试

- URL 规范化和敏感参数清理
- 四种目标文件矩阵
- 受管区块新增、替换、重复和损坏场景
- 颜色格式归一化
- 间距和圆角聚类
- 字体 shorthand 解析
- 多层阴影解析
- Markdown 转义
- 置信度计算

### 15.2 集成测试

准备本地 fixture 网站，覆盖：

- CSS 变量设计系统
- 无 CSS 变量的普通样式
- 桌面/移动端不同导航
- light/dark theme
- hover/focus/disabled/error
- modal、drawer、table、form、card
- 开放 Shadow DOM
- 跨域样式表不可读
- 无限动画和持续网络请求

验证生成 evidence JSON 和 Markdown golden file。

### 15.3 幂等测试

对同一来源连续运行两次：

- 第二次不增加区块数量
- 受管区块外字节不变
- 稳定 ID 不变
- 页面证据变化时只更新区块内容

### 15.4 故障测试

- 浏览器启动失败
- 页面超时
- 某个视口采集失败
- 磁盘写入失败
- Markdown 标记损坏
- `AGENTS.md` 与 `CLAUDE.md` 同时更新时一边失败

### 15.5 前向测试

skill 完成后，用全新代理线程执行真实用户式任务，而不是告诉代理预期结论。至少选择：

- 一个营销网站
- 一个 SaaS 仪表盘
- 一个内容/文档网站
- 一个移动端重排明显的网站
- 一个只能提供截图的案例

检查另一个代理仅凭生成文档，能否实现同一设计语言的全新页面。前向测试修改真实项目或耗时明显时，应先获得用户同意。

## 16. 验收标准

### 功能

- 支持 URL 和截图输入
- 支持增强模式和视觉模式
- 覆盖桌面、平板、手机
- 输出 token、布局、组件、响应式、动效和证据缺口
- 正确执行目标文件矩阵
- 同一 profile 可幂等更新

### 质量

- 高置信度规则可追溯到证据
- 低置信度规则明确标为估算
- 不把一次性值错误提升为全局 token
- 不把原始 CSS/DOM 大量倾倒进项目说明文件
- 文档足够明确，可直接指导前端实现

### 安全

- 不触发有副作用的网页操作
- 不保存 Cookie、凭据、表单值或敏感 query
- 不默认复制受限制资产
- 不修改受管区块之外的项目内容
- 失败时不留下半更新状态

### 可维护性

- schema 有版本
- SKILL.md 保持精简
- 确定性逻辑位于 scripts
- 详细规则按需放入 references
- 所有脚本有代表性测试
- skill 通过当前 Agent 环境提供的标准结构校验器

## 17. 建议的首个实现决策

MVP 应优先保证以下三件事，而不是一开始追求所有组件：

1. 稳定采集三个视口的可见页面和计算样式
2. 从噪声中得到可信、语义化的 token 与布局规则
3. 安全、幂等地维护 `AGENTS.md`、`CLAUDE.md` 或 `DESIGN.md`

完成这三点后，再增加复杂状态和视觉回归，能显著降低实现风险，也更容易判断提取质量究竟卡在采集、推断还是输出。
