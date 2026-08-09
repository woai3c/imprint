# Imprint 分析准确率与性能实施计划

状态：已实施并通过本地验证；在线配对 benchmark 仍需在配置真实供应商凭据后复核外部耗时
适用范围：Desktop、CLI、MCP 共用的确定性分析器，以及 Desktop/CLI 的可选 AI 设计解读  
核心约束：准确率提升不能依赖增加默认 AI 调用次数；程序分析可以适度增加，但默认总耗时必须下降

当前进度（2026-08-09）：

- 已新增紧凑 `AnalysisDigest`、短证据/令牌 ID 映射和组件精确 computed style 摘要；
- 默认设计解读已由 observation、独立语义命名、synthesis 和自动 repair，改为一次紧凑 synthesis；
- 紧凑 claim pool 会在本地展开成兼容的 `DesignProfile`，现有 UI、导出和缓存结构不需要迁移；
- API 路径默认输出上限为 4096 token，默认视觉输入最多 2 张，每张硬限制为 1600×1600、250KB；设计解读不会因 thinking 截断自动再次请求；
- AI 解读和程序提取均已记录分阶段耗时、token、图片数量和预算超限；本地 SQLite 可复用完整解读结果；
- 页面健康门检、自适应单子页 mobile、安全交互、确定性矛盾校验、可选组件规格/视觉 QA 和显式深度复核均已落地；
- 2026-08-09 复审提出的 5 个 P1 与 2 个 P2 已逐项修复，并增加缓存、图片、污染页、矛盾、重试和自适应捕获回归用例；
- 单元测试、类型检查、ESLint、Electron/CLI 构建、浏览器 E2E 和 15 个 fixture 的离线 benchmark 已通过；在线 AI 配对 benchmark 尚未执行。

## 1. 目标

本计划同时解决两个问题：

1. 提升页面清理、响应式判断、组件语义、交互状态和跨页面归纳的准确率。
2. 将当前 6–8 分钟的常见总耗时降到可接受范围，尤其压缩 AI 阶段。

默认路径的目标不是通过提高模型推理强度换准确率，而是：

- 让程序先生成更可靠、更紧凑的事实；
- 让 AI 只做程序不擅长的设计语言归纳；
- 默认只进行一次 AI 调用；
- 用确定性校验拦截错误结论，而不是再调用一个 AI 复核；
- 重复分析和重新打开结果时尽可能复用本地缓存。

### 1.1 性能目标

| 指标             |                        当前基线 |        默认路径目标 |          硬性上限 |
| ---------------- | ------------------------------: | ------------------: | ----------------: |
| 程序分析 P50     |                        约 83 秒 |            ≤ 100 秒 |      P95 ≤ 130 秒 |
| AI 调用次数      |      通常 2 次，失败时可能 3 次 |                1 次 | 默认不得超过 1 次 |
| AI 阶段 P50      | 约 6 分钟（两次调用中位数之和） |            ≤ 150 秒 |      P95 ≤ 240 秒 |
| 首次完整结果 P50 |                     约 6–8 分钟 |            ≤ 4 分钟 |      P95 ≤ 6 分钟 |
| AI 文本输入      |    最近一次约 4.3 万 token/两次 | ≤ 1.2 万 token/一次 |    ≤ 1.6 万 token |
| AI 输出          | 最近一次综合阶段约 1.1 万 token |       ≤ 4,000 token |     ≤ 6,000 token |
| 默认视觉输入     |                 最多 4 张长截图 |      1–2 张视觉摘要 |         最多 2 张 |

以上是产品 SLO，不是单个供应商的绝对承诺。供应商排队或网络异常应被单独记录，不能与 Imprint 自身处理时间混在一起。

### 1.2 质量目标

- 所有关于颜色、字重、尺寸、页面数量、登录状态、视口宽度和交互执行状态的硬事实均可由程序验证。
- AI 不得把横向溢出描述成已完成的响应式隐藏或重排。
- AI 不得把单页特征描述成全站统一规则，除非证据覆盖所有相关页面。
- 活动弹层、Cookie 层和其他临时遮挡不得进入颜色、组件或截图证据。
- 重要组件的设计结论必须能追溯到精简后的真实 computed style，而不是仅根据令牌名称猜测。
- `tests/benchmark` 现有质量维度不得退化；Groundedness、Restraint 和 Specificity 应提升。

## 2. 当前基线与主要瓶颈

### 2.1 实际日志基线

基于 2026-08-08 至 2026-08-09 的本机 Imprint 日志：

| 阶段           | 样本数 | 中位耗时 |     最快 |     最慢 |     中位输入 |     中位输出 |
| -------------- | -----: | -------: | -------: | -------: | -----------: | -----------: |
| 程序分析       |     12 |  82.8 秒 |  79.8 秒 |   109 秒 |            — |            — |
| AI observation |      9 |  81.5 秒 |  54.1 秒 | 272.4 秒 | 19,065 token |  2,455 token |
| AI synthesis   |      8 | 281.7 秒 | 169.1 秒 | 581.6 秒 | 28,600 token | 11,076 token |

最近一次知乎分析的具体数据：

- 程序分析：107.5 秒；
- 证据包：49,998 字符，4 个页面/视口捕获、12 个区块、13 个组件、19 个布局节点、10 个交互、4 张图片；
- observation：54.1 秒，16,640 输入 token，2,240 输出 token；
- synthesis：232.6 秒，26,228 输入 token，11,076 输出 token；
- 两次提示分别约 54,614 和 59,146 字符；
- 默认低推理强度下，AI 主路径仍接近 4 分 47 秒；加上浏览器分析后即进入 6 分钟级别。

### 2.2 当前关键路径

```text
浏览器加载与确定性提取（约 80–109 秒）
  │
  ├─ 语义颜色命名 AI ───────────────┐  当前与设计解读并行
  │                                  │
  └─ observation AI（串行第 1 次）   │
        │                             │
        └─ synthesis AI（串行第 2 次）┘
              │
              └─ 必要时 synthesis repair（串行第 3 次）

示例组件 AI：用户单独触发，不属于首次设计解读，但仍可能再花 1–5 分钟。
```

主要问题不是模型推理强度，而是：

1. observation 和 synthesis 重复携带大部分相同证据。
2. observation 在最新多模态分析中没有图片，仍消耗约一分钟和一万多输入 token。
3. synthesis 的返回结构要求大量重复的 statement、implementation、confidence 和 evidence，导致输出接近或超过一万 token。
4. 最多 4 张超长页面截图会增加视觉 token、上传和模型处理时间。
5. Allowed IDs、Allowed token refs 与完整证据包存在重复信息。
6. 组件真实样式在 AI 安全证据中被移除，AI 收到大量结构数据，却缺少部分真正影响判断的精确样式事实。
7. 失败后的 AI repair 是额外串行调用；很多引用错误本可由程序纠正或接受部分结果。

## 3. 设计原则

1. **本地事实优先**：能用浏览器和确定性代码得到的结论，不交给 AI 猜。
2. **单次综合**：默认只保留一次 AI synthesis；不再默认运行 observation AI。
3. **聚合而非删覆盖**：保留多页面代表性，但把重复实例聚合成计数和少量样本。
4. **错误由程序拦截**：数值矛盾、越权泛化、未执行交互等由 validator 降级或移除。
5. **视觉输入有预算**：按信息增益选图，不按“捕获到几张就发送几张”。
6. **质量增强有时间上限**：每个新增程序步骤都必须有预算、超时和降级路径。
7. **缓存是产品能力**：相同证据不重复付费、不重复等待。
8. **深度复核显式触发**：任何第二次 AI 调用都只能由用户主动选择，不能进入默认流程。

## 4. 目标流程

```text
页面加载
  ↓
弹层清理、懒加载、DOM 稳定
  ↓
确定性提取 ──→ 页面健康门检 ──→ 必要时仅本地重试一次
  ↓
跨页面聚合 + 响应式/交互/令牌矛盾检查
  ↓
生成紧凑 AnalysisDigest + 1–2 张视觉摘要
  ↓
命中本地 AI 缓存？ ──是──→ 读取已验证 DesignProfile
  │否
  ↓
一次 AI synthesis（同时返回设计解读与少量语义别名）
  ↓
确定性解析、引用映射、矛盾降级、部分结果保留
  ↓
生成 Reconstruction Brief、Validation Recipe 和导出物
```

## 5. 值得引入的能力与取舍

| 能力                                         | 来源/动机                       | 准确率收益     |            程序耗时 |            AI 耗时 | 决策           |
| -------------------------------------------- | ------------------------------- | -------------- | ------------------: | -----------------: | -------------- |
| 懒加载后关闭活动弹层，覆盖 iframe/Shadow DOM | Dembrandt                       | 高             |            小幅增加 |           降低污染 | 已完成         |
| 页面健康门检与本地重试                       | Dembrandt 的防御式提取思路      | 高             | +1–5 秒，重试时更多 |       避免无效调用 | 必做           |
| 组件精确 computed style 摘要                 | Website Cloner 的逐组件规格思路 | 高             |               <1 秒 |   输入略增但更有效 | 必做           |
| 自适应多视口捕获                             | Website Cloner 的多视口核对     | 中高           |       常态 +0–20 秒 |     不增加图片数量 | 必做           |
| 有界安全交互遍历                             | 两个竞品的状态检查思路          | 中高           |             +2–8 秒 |             不增加 | 必做           |
| 确定性矛盾检查                               | `a.log` 暴露的问题              | 高             |               <1 秒 |        减少 repair | 必做           |
| 可读视觉摘要替代多张长截图                   | Imprint 性能约束                | 高             |             +1–3 秒 |           显著下降 | 必做           |
| 自动截图健康检查                             | Website Cloner 的视觉 QA 思路   | 中高           |             +1–5 秒 |             不增加 | 必做           |
| 生成结果与原站像素级 diff                    | 克隆类产品常用                  | 对设计抽象有限 |            +5–30 秒 |           可能增加 | 不进入默认流程 |
| 每个组件生成完整规格文件                     | Website Cloner                  | 审计性高       |             +1–5 秒 | 若发送给 AI 会膨胀 | 仅作为可选导出 |
| 第二个 AI 充当裁判                           | 常见 Agent 流程                 | 不稳定         |                   0 |          +2–6 分钟 | 禁止默认启用   |
| 全页面、全视口、全交互穷举                   | 克隆类产品                      | 边际收益递减   |           +1–5 分钟 |           可能增加 | 不采用         |
| 无限制自动点击                               | 风险过高                        | 不确定         |                  高 |             不确定 | 不采用         |

## 6. 详细实施方案

### 6.1 工作流 A：完整的阶段计时与性能预算

当前已有 AI `callDetails` 和部分日志，但语义命名、图片处理、等待缓存和总关键路径没有统一统计。

新增 `AnalysisTiming`：

```ts
interface AnalysisTiming {
  browserMs: number
  preparationMs: number
  extractionMs: number
  healthGateMs: number
  digestMs: number
  imageSummaryMs: number
  aiQueueMs?: number
  aiInvokeMs?: number
  validationMs: number
  totalMs: number
  aiInputTokens?: number
  aiOutputTokens?: number
  imageCount: number
  cacheHit: boolean
}
```

要求：

- Desktop、CLI、MCP 使用相同字段；
- 日志记录阶段耗时、字符数、token 数、图片数量和压缩后尺寸，不记录提示词、页面正文或认证数据；
- 区分供应商等待/网络时间和本地处理时间；
- benchmark 输出 P50/P95，并与保存的基线比较；
- 默认路径任一新增本地步骤超过预算时应记录 `budget-exceeded`，但不能阻塞最终结果。

涉及文件：

- `src/core/analyzer/index.ts`
- `src/main/design-intelligence.ts`
- `src/core/design-intelligence/interpreter.ts`
- `src/shared/ipc-contract.ts`
- `tests/benchmark/`

### 6.2 工作流 B：页面健康门检

在截图和样式进入证据包前计算 `PageHealthReport`：

- 是否仍有覆盖视口 8% 以上的高层级 dialog/overlay；
- 是否存在大面积纯色遮挡或透明 backdrop；
- DOM 是否仍在持续突变；
- 页面主体是否为空、骨架屏占比过高或主要字体未就绪；
- viewportWidth 与 contentWidth 是否明显不一致；
- 是否处于认证墙、验证码、错误页或限流页；
- 截图尺寸是否与预期视口/文档尺寸一致；
- 页面是否发生非预期导航。

处理策略：

1. 可恢复问题只进行一次本地清理和重截图，额外预算上限 8 秒。
2. 不可恢复问题进入 `limitations`，降低相关证据权重。
3. 严重遮挡、空页面或错误页不得发送给 AI；其余页面继续分析。
4. 不接受 Cookie、不提交表单、不绕过登录或验证码。

新增建议：

- `src/core/analyzer/page-health.ts`
- `tests/e2e/page-health.test.mjs`

已完成基础：`page-preparer.ts` 已在懒加载前后和 DOM 稳定后处理弹层，并支持 iframe、开放 Shadow DOM 和敏感表单防误点。

### 6.3 工作流 C：自适应多视口，而不是全量多视口

默认继续保留入口页 desktop + mobile。其他代表页面不一律增加 mobile 捕获，而由本地信号决定：

- 页面角色与入口页显著不同；
- 存在独有的 CSS media query、container query 或最小宽度；
- desktop DOM 结构指纹与入口页差异较大；
- 页面出现横向溢出；
- 该页面是唯一的 product、pricing、account 或 workspace 角色。

预算：

- 默认最多新增 1 个子页面 mobile 捕获；
- 额外浏览器耗时目标 ≤ 20 秒；
- 达到总程序分析 120 秒软预算后停止新增捕获；
- 未捕获的视口必须显式记录为未知，AI 不得补推。

这样可以借鉴竞品的多视口准确性，同时避免 3 个页面全部重新加载造成一分钟以上额外等待。

### 6.4 工作流 D：有界安全交互观察

只执行可逆、容器内、白名单交互：

- accordion/disclosure 展开与恢复；
- tab 切换与恢复；
- carousel 的本地上一张/下一张；
- hover、focus、disabled 等无副作用状态；
- 本地 theme toggle 仅在能恢复且不触发持久账户设置时执行。

禁止：

- 表单提交、登录、注册、支付、关注、点赞、删除、上传、下载；
- 带外部导航的链接；
- 无法恢复初始状态的操作；
- 文案模糊且不在已识别组件容器内的按钮。

预算：每页最多 4 个主动候选、每个候选最多 1.5 秒、每页总计最多 6 秒。超出即停止并记录 skipped，不增加 AI 调用。

### 6.5 工作流 E：生成紧凑的 `AnalysisDigest`

不再把大体积 `DesignEvidence` 直接重复发送给 AI。新增只面向解释层的紧凑摘要：

```ts
interface AnalysisDigest {
  pages: Array<{
    id: string
    role: string
    viewport: string
    sectionSequence: string[]
    overflow?: { viewportWidth: number; contentWidth: number }
    limitations: string[]
  }>
  tokenFacts: {
    colors: Array<{ id: string; value: string; roles: string[]; count: number; pages: number }>
    typography: { sizes: string[]; weights: string[]; lineHeights: string[] }
    spacing: string[]
    radii: string[]
  }
  sectionPatterns: Array<{
    role: string
    count: number
    pages: string[]
    layouts: string[]
    tokenRefs: string[]
    sampleEvidenceIds: string[]
  }>
  componentPatterns: Array<{
    type: string
    role?: string
    count: number
    pages: string[]
    exactStyles: Record<string, string>
    stateChanges: Array<{ property: string; from: string; to: string }>
    sampleEvidenceIds: string[]
  }>
  responsiveFacts: Array<{
    page: string
    from: string
    to: string
    change: string
    evidenceIds: string[]
  }>
  uncertainties: string[]
}
```

压缩规则：

- 相同角色、布局、tokenRefs 和关键样式的组件聚合，只保留计数与 1–2 个样本 ID；
- 组件保留会影响产品判断的精确属性：背景、文字色、边框、圆角、阴影、字号、字重、间距和状态变化；
- 页面正文、图片路径、品牌文案和完整 CSS 不进入摘要；
- 长 evidence ID 在请求中映射成 `p1/s1/c1/r1` 等短 ID，返回后由程序映射回稳定原始 ID；
- Allowed IDs 不再单独重复一遍，合法 ID 集合由短 ID 映射表表达；
- token 的 usageCount 和 evidence 只发送聚合后的角色、次数与页面数；
- 明确发送数值边界，例如实际字体权重集合 `[400, 500, 600, 700]`，避免 AI 自行总结错误范围。

预算：

- 文本提示总长度目标 ≤ 28,000 字符；
- 不含图片的输入目标 ≤ 8,000 token；
- 含视觉输入后的总输入目标 ≤ 12,000 token。

涉及文件：

- 新增 `src/core/design-intelligence/analysis-digest.ts`
- 修改 `evidence-selector.ts`、`types.ts`、`prompt.ts`
- 新增聚合稳定性、隐私和 token 预算测试

### 6.6 工作流 F：一次 AI synthesis

默认删除 AI observation pass，以程序生成的 section/component 摘要代替。一次 synthesis 同时完成：

- 设计语言 thesis；
- 最多 2 个 signature moves；
- 精简的 composition、visual、interaction 和 responsive 规则；
- 跨页面可迁移规则；
- 仅针对仍为 `palette-N` 且证据充分的少量语义别名建议。

为减少输出，AI 返回紧凑 claim pool，而不是在每个分组里重复完整对象：

```json
{
  "claims": [{ "id": "q1", "s": "...", "i": "...", "c": "high", "e": ["s1", "s4"], "t": ["c2"] }],
  "thesis": "q1",
  "signatureMoves": ["q2"],
  "composition": ["q3", "q4"],
  "visual": ["q5", "q6"],
  "interaction": ["q7"],
  "responsive": ["q8"],
  "preserve": ["q9"],
  "adapt": ["q10"],
  "avoid": ["q11"],
  "aliases": [{ "token": "c8", "name": "surface-raised" }]
}
```

程序将其展开为当前 `DesignProfile`，保持导出和 UI 兼容。

调用策略：

- 默认低推理强度；不依赖高推理强度达到正确性；
- 支持 JSON Schema/structured output 的供应商优先使用结构化输出；
- 默认 `maxOutputTokens = 4096`，有 thinking token 的供应商单独计算预算；
- 不自动发起 citation repair；能验证的 claim 保留，非法 claim 丢弃并形成 uncertainty；
- 只有根对象完全无法解析时返回 evidence fallback，不再自动进行第三次调用；
- 用户主动点击“深度复核”时才允许第二次 AI 调用。

预计收益（需以 benchmark 验证）：

- 删除 observation：减少约 54–272 秒；
- synthesis 输入从约 2.6–2.9 万 token 降到约 1.2 万以内；
- synthesis 输出从约 0.8–1.1 万 token 降到 4,000 以内；
- 默认 AI 总耗时预计由 4–10 分钟降到约 1.5–3 分钟。

### 6.7 工作流 G：视觉输入压缩与信息增益选择

不再默认发送 4 张超长全页截图。程序按信息增益选择并压缩最多 2 张可读视觉摘要：

1. **页面级摘要**：优先使用入口或有真实 overflow/响应式差异的 viewport crop；不把 2000×8000 一类长全页图直接发送给 AI。
2. **增量摘要**：在 hero、workspace 主区、主要媒体、独有布局、代表子页或 mobile overflow 中选择与第一张差异最大的区域。

没有额外合成低清联系表：独立摘要图更清晰，也省去一次栅格拼接。任何被选中的长图会先裁为可读顶部摘要，再缩放；最终外发图片单张不超过 1600×1600 和 250KB。压缩结果按原图内容 hash 缓存为本地 JPEG，API 与 Agent CLI 共用；原始完整截图只保存在本地。

选图规则：

- 页面角色优先于页面顺序；
- 相同结构页面只保留一个视觉样本；
- 横向溢出页面必须保留 viewport crop，不用超宽 full-page 图代替；
- 被健康门检判定为遮挡或错误页的图片不进入 AI；
- 结构型页面可只发一张页面级摘要；媒体风格明显时增加显著区域摘要；
- 原图和证据仍本地保存，AI 只接收摘要图。

预算：图片生成 ≤ 3 秒，压缩后单张硬上限 250KB，尺寸硬上限 1600×1600，默认 1 张、最多 2 张。视觉 token 必须进入总输入预算。

### 6.8 工作流 H：确定性矛盾检查

在 AI 结果进入 `DesignProfile` 前执行：

- 字重、字号、间距、圆角、颜色值必须来自对应 token 集合；
- “最大/最小/仅有/全部”等边界词必须与实际集合一致；
- “所有页面/三个页面/全站”等范围词必须覆盖全部相关 URL；
- passive CSS/ARIA 证据不能支持“点击后”“展开后”等已执行行为；
- horizontalOverflow 页面不能无证据支持“侧栏隐藏”“内容重排”；
- managed access 已解决登录墙时不能描述为游客页；
- dark palette 与 base palette 不按序号建立语义对应；
- 组件颜色角色必须同时符合 token value 和 usage role；
- screenshot 与结构证据冲突时，结论降为 uncertainty，不自动调用 AI 解决。

处理顺序：修正可机械修正的引用 → 降低 confidence → 移除明显错误 claim → 生成 uncertainty。不得静默保留矛盾结论。

已完成基础：横向溢出、跨页泛化、passive 交互、managed auth 和 dark palette 已有部分护栏；本工作流将其统一为可测试规则集。

### 6.9 工作流 I：缓存与重复分析

当前同一 analysis 已按 fingerprint 复用最终 profile，但 observation 缓存只在当前进程内存中。目标方案：

- `AnalysisDigest` 使用稳定内容 hash；
- AI 结果缓存键包含 digest hash、视觉摘要 hash、provider、model、reasoning effort、语言、prompt version 和 schema version；
- 完全命中时 1 秒内返回，不调用供应商；
- 仅 token alias 变化时复用主体 profile，并重新运行本地 alias 校验；
- 仅 UI 语言变化时优先本地保留原结果，不自动重跑；用户主动要求翻译时才调用；
- 页面证据或截图 hash 变化时必须失效；
- 登录态分析的缓存仅存本机 SQLite，不跨用户、不上传共享；
- “重新解读”默认允许使用结构摘要缓存，但用户选择“强制重新调用 AI”时跳过最终结果缓存。

### 6.10 工作流 J：本地视觉 QA

值得引入，但默认只做不依赖 AI 的健康与结构验证：

- 截图是否为空、全黑、全白或被单一 overlay 覆盖；
- 页面内容边界是否超出视口；
- desktop/mobile 的关键 section 是否真实存在、消失或移动；
- 生成的验证场景是否存在自身 overflow、文本裁切和低对比度。

不在默认分析中进行原站与验证场景的像素级 diff，因为验证场景不是原站克隆，像素差会把合理的抽象迁移误判为错误。完整视觉对照可作为开发 benchmark 或显式“深度验证”功能。

## 7. 分阶段实施顺序

### 阶段 0：基线与保护网

- [x] 实现统一 `AnalysisTiming`。
- [x] 保存当前 15 个 benchmark fixture 的质量与耗时基线。
- [x] 增加知乎类长页面、横向溢出、延迟活动弹层和不同子页面布局 fixture。
- [x] 把 prompt 字符数、输入/输出 token、图片数和总 AI 时间加入 benchmark 结果。

完成条件：能回答每一秒花在哪个阶段，并能自动检测性能回归。

### 阶段 1：最大幅度降低 AI 时间

- [x] 实现 `AnalysisDigest` 与短证据 ID 映射。
- [x] 将组件关键 computed style 放入摘要。
- [x] 改为单次 synthesis。
- [x] 用紧凑 claim pool 替代重复 `DesignProfile` JSON。
- [x] 合并少量语义颜色命名，移除独立语义命名 AI 请求。
- [x] 取消默认 AI repair，保留部分有效结果。
- [x] 默认最多发送 2 张图片。

完成条件：默认 AI 调用数为 1，输入 ≤ 1.6 万 token，输出 ≤ 6,000 token，在线 benchmark 质量不低于当前版本。

### 阶段 2：本地准确率增强

- [x] 页面健康门检与一次本地重试。
- [x] 完整确定性矛盾规则集。
- [x] 自适应子页面 mobile 捕获。
- [x] 有界安全交互观察。
- [x] 视觉摘要图生成。

完成条件：程序分析 P95 ≤ 130 秒；新增准确率 fixture 全部通过；默认 AI 输入不因新增证据而超预算。

### 阶段 3：缓存、体验与可选深度能力

- [x] 持久化 digest/视觉摘要/AI 结果缓存。
- [x] UI 展示“程序分析完成”和“AI 解读预计剩余阶段”，但不伪造精确剩余秒数。
- [x] 增加显式“深度复核”，允许第二次 AI 调用并提示预计增加的时间和费用。
- [x] 将完整逐组件规格和视觉 diff 作为开发/导出选项，不进入默认分析。

完成条件：缓存命中 1 秒内返回；默认流程仍只有一次 AI 调用。

## 8. 测试与验收

### 8.1 单元测试

- digest 聚合稳定、顺序确定、短 ID 可逆；
- token/字符/图片预算不会超限；
- 精确组件样式不会泄露正文或本地路径；
- 数值边界、跨页范围、交互执行状态和 overflow 矛盾均被拦截；
- 部分合法 profile 在存在坏 claim 时仍可使用；
- cache key 对证据、图片、模型、语言和 prompt 版本变化正确失效。

### 8.2 浏览器 E2E

- 延迟弹层、iframe、Shadow DOM、正文 decoy 和敏感登录弹窗；
- 懒加载后出现的活动页不会进入样式和截图；
- 375px 视口下 1032px 内容宽度被识别为 overflow；
- 自适应多视口只在满足条件时增加捕获；
- 安全交互能恢复原状态，危险操作永不执行；
- 页面健康重试不超过一次和 8 秒预算。

### 8.3 Benchmark

离线：

```bash
pnpm test:benchmark
```

在线配对测试：

- 相同 provider、model、reasoning effort；
- 当前双阶段流程与新单阶段流程各运行至少 5 轮；
- 比较 Groundedness、Specificity、Executability、Transferability、Distinctiveness、Restraint、Safety；
- 同时比较 P50/P95、输入/输出 token、图片数、失败率和 repair 率；
- 任何质量维度明显退化都阻止默认切换。

### 8.4 发布门槛

- 默认 AI 调用数：1；
- AI repair 率：0；
- 可解析 profile 成功率：≥ 98%；
- 硬事实矛盾率：0；
- 缓存命中返回：≤ 1 秒；
- 程序分析 P95：≤ 130 秒；
- AI P50：≤ 150 秒，P95：≤ 240 秒；
- 总流程 P50：≤ 4 分钟，P95：≤ 6 分钟；
- 15 个 benchmark fixture 不退化，新增污染和 overflow fixture 全部通过。

## 9. 风险与降级策略

| 风险                                       | 处理方式                                                    |
| ------------------------------------------ | ----------------------------------------------------------- |
| 单次 synthesis 缺少 observation 的局部细节 | 由程序生成 section/component 聚合摘要；在线 benchmark 对照  |
| 紧凑输出丢失表达能力                       | claim pool 只压缩结构，不压缩必要语义；程序展开成兼容 V1    |
| 图片减少导致视觉风格判断退化               | 使用页面级摘要 + 增量区域，按信息增益而非固定首页选图       |
| 自适应 mobile 捕获增加程序耗时             | 总预算 20 秒，最多一个额外页面，达到硬 deadline 立即停止    |
| 本地矛盾校验过严                           | 降为 uncertainty 优先于整条失败；保留 rejected 原因用于调试 |
| 缓存返回旧结果                             | 内容 hash + prompt/schema/model/语言完整参与 key            |
| 供应商速度波动                             | 独立记录 queue/invoke；超时返回确定性 evidence fallback     |
| 高推理强度再次把时间拉长                   | 高推理和第二次调用只放在显式深度复核，不改变默认路径        |

## 10. 明确不做的事情

- 不把提高默认 reasoning effort 当作准确率方案。
- 不在默认流程增加第三个“裁判 AI”。
- 不把所有页面全部跑 desktop/tablet/mobile。
- 不把完整 computed style、DOM、CSS 或所有截图直接塞给 AI。
- 不为了获得交互证据而点击不可逆或含副作用的操作。
- 不把验证场景与原站做像素级一致性要求。
- 不让 AI 失败阻塞已经完成的确定性分析结果。

## 11. 完成定义

本计划完成不是指“加入了更多分析步骤”，而是同时满足：

1. 默认 AI 从两次串行大调用变成一次紧凑调用。
2. 程序分析虽然更严格，但 P95 保持在 130 秒以内。
3. `a.log` 中出现的弹层污染、横向溢出误判、暗色令牌错配、登录状态矛盾、字重范围矛盾和跨页过度归纳均有确定性保护。
4. 新流程在固定 benchmark 上质量不低于当前版本。
5. 用户在常见网络与低推理强度模型下，首次完整结果 P50 不超过 4 分钟。
6. 任何额外 AI 深度分析都必须由用户主动触发，并明确提示时间成本。

## 12. 2026-08-09 复审问题关闭记录

| 问题                       | 修复结果                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 缓存输入不完整       | cache key 现在基于最终裁剪后的 `AnalysisDigest`、实际外发图片摘要 hash/版本、input mode、provider/model、reasoning、thinking、语言及 prompt/schema；同记录快捷命中也必须匹配完整 key。               |
| P1-02 污染页进入 AI        | 活动弹层先尝试安全关闭；不可用或 `aiEligible=false` 页面及其 section/component/layout/interaction/image/token 不进入 AI 包。健康恢复硬限 8 秒，无合格页面时直接跳过 AI。                             |
| P1-03 CLI/MCP 原图绕过预算 | 图片摘要移到共享 core，Desktop、CLI、MCP、benchmark 共用最多 2 张、单张 1600×1600/250KB 的内容哈希 JPEG；第二张必须满足信息增益与 4,000 visual-token 总预算。                                        |
| P1-04 硬矛盾残留           | 增加最大/最小/范围/数量、颜色用途、overflow、passive interaction、managed auth 与 dark palette 规则；可证明为假的 claim 被移除或替换为明确 uncertainty。                                             |
| P1-05 benchmark 不足       | `baseline.json` 保存每 fixture 七维下限；在线档以相同 provider/model/reasoning 配置成对执行 legacy 双阶段和当前单阶段各 5 轮，并对质量、失败/repair、AI 与总耗时 P50/P95 执行门槛。                  |
| P2-01 timing 分裂          | Desktop、CLI、MCP 返回统一端到端 timing，区分程序、AI、network、logical invoke 与 HTTP transport attempts；缓存命中归零 AI 时间，强制重跑不会重复累计旧 AI 时间。                                    |
| P2-02 自适应预算不实       | mobile 信号改为新增 breakpoint/container query、DOM 结构距离、overflow 与 product/pricing/account/workspace 角色；单页 mobile 20 秒和整体 120 秒使用真实 deadline，安全交互为每项 1.5 秒/总计 6 秒。 |

本地确定性验收已完成。真实供应商在线配对 benchmark 需要用户配置 API 凭据后执行，未执行前不宣称已经验证外部模型质量和实际 AI P50/P95。
