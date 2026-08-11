# Design DNA Benchmark

固定的质量考卷：15 个风格迥异的合成 fixture + 人工标注，用来回答两个问题——**证据提取是否完整**、**设计语言理解是否具体**。修改提取器、prompt 或校验器之后必须跑一遍，指标退化即视为回归。

这个目录的标注是 Imprint 行为特征化，不能直接当作中立竞品分数。跨 CLI 的独立 token/格式基线见 [`../competitive-benchmark/README.md`](../competitive-benchmark/README.md)。

## 运行

```bash
pnpm test:benchmark        # 离线档：证据门检 + 评估线束自检（需本机 Chrome/Edge）
```

在线档（真实模型评分，可选）：

```bash
pnpm test:benchmark:live                      # 列出 .env / 环境中已配置的 AI 供应商，交互选择
pnpm test:benchmark:live -- --provider first  # 不弹出选择，直接用第一个已配置供应商
pnpm test:benchmark:live -- --provider deepseek --vision
pnpm test:benchmark:live -- --provider deepseek --rounds 5 --reasoning low
```

运行器自动从 `.env` 和进程环境中识别供应商密钥，变量名与 CLI/MCP 的约定完全一致（`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GOOGLE_GENERATIVE_AI_API_KEY`、`DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY`、`ALIBABA_API_KEY`、`ZHIPU_API_KEY`、`XAI_API_KEY`，通用覆盖 `IMPRINT_AI_API_KEY`），可选每供应商覆盖：`<PREFIX>_MODEL`、`<PREFIX>_BASE_URL`。模板见仓库根目录 `.env.example`。也可以手动设置 `IMPRINT_BENCHMARK_PROVIDER` / `IMPRINT_BENCHMARK_API_KEY` / `IMPRINT_BENCHMARK_MODEL` / `IMPRINT_BENCHMARK_VISION` 后跑 `pnpm test:benchmark`。

隔离说明：桌面应用的 AI key 保存在应用设置中，不读 `.env`；CLI/MCP 只读进程环境变量（Node 不自动加载 `.env`）；因此根目录 `.env` 只被本运行器使用，与产品配置不冲突。进程环境变量优先于 `.env` 同名变量。

在线档以相同 provider/model/reasoning 配置，对每个 fixture 成对执行旧双阶段与新单阶段管线（默认 5 轮），输出七维质量、失败率、repair 率、HTTP 传输次数，并写入 `tests/benchmark/results/latest.json`（已 gitignore）。
离线档同时汇总程序分析 P50/P95，并校验 `baseline.json` 中每个 fixture 的七维下限；在线结果额外对 AI 与端到端总耗时执行 P50/P95 SLO，并记录 prompt 字符数、输入/输出 token 和图片数。

## 结构

- `fixtures/<name>.html` — 自包含页面，无第三方资产；每个覆盖多区块、一个 allowlist 安全交互（accordion 或 tabs，带最小 JS）、响应式网格变化、transition。
- `fixtures/<name>.annotations.json` — 人工标注：期望的区块角色、组件类型、安全交互下限、响应式变化、媒体层级、显著性特征、覆盖下限，以及供人工对照的 `referenceProfile`（视觉主张 / 标志性手法 / 迁移规则）。
- `benchmark.test.ts` — 运行器，见下方门检语义。
- `annotation-types.ts` — 标注文件的 TS 类型。

## 门检语义（离线档）

每个 fixture 执行真实 `analyze()`（desktop + mobile，anonymous），然后断言：

| 门检         | 来源字段                                       | 含义                                                               |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------ |
| 区块角色子集 | `expectedSectionRoles`                         | 标注的角色全部出现在提取结果中                                     |
| 区块数量下限 | `minSections`                                  | 分段没有塌缩成一整块                                               |
| 组件类型子集 | `expectedComponentTypes`                       | 关键组件实例被识别                                                 |
| 视口覆盖     | desktop + mobile                               | 响应式证据成立                                                     |
| 区块覆盖下限 | `minSectionCoverage`                           | `coverage.sectionCoverage`                                         |
| 安全交互下限 | `minSafelyObservedInteractions`                | allowlist 主动观察真实执行且可恢复                                 |
| 响应式变化   | `expectedResponsiveChangeTypesAny`             | 命中任一标注的 changeType                                          |
| 媒体层级     | `minMediaLayers` / `expectedMediaKinds`        | 媒体被观察且类型正确                                               |
| 显著性特征   | `expectedSalienceTraits`                       | layout node traits 命中                                            |
| 特征标签     | `expectedFeatureTags` / `forbiddenFeatureTags` | 调色板等特征标签按语义角色判定（如中性底 + 单强调 ≠ rich palette） |
| 主要媒体上限 | `maxMajorMediaRegions`                         | 图标/头像不计入 major media region                                 |
| ID 稳定性    | 两次运行 section ID 序列一致                   | 证据引用不会因重跑失效                                             |
| 线束自检     | `referenceProfile` 构造的 profile              | `validateDesignProfile` 接受且七维质量不低于该 fixture 的保存基线  |

标注是**对当前提取器行为的特征化（characterization）**：首次建立时按实际合理行为标定，之后行为变化会立刻失败。修改提取器时有两种合法结果——行为确实改进了（更新标注并在提交信息中说明），或行为退化了（修代码）。

## 人工评审量表（对照 referenceProfile）

在线档或日常评审时，按提案 17.4 的七个维度人工对照标注中的 `referenceProfile`：

| 维度            | 问题                                                             |
| --------------- | ---------------------------------------------------------------- |
| Groundedness    | 主要结论是否引用了真实存在的证据 ID？                            |
| Specificity     | 隐去网站名后，描述是否仍能区别于其他网站？                       |
| Executability   | 工程师或 Agent 是否知道下一步具体怎么做？                        |
| Transferability | 规则能否指导一个源网站不存在的新页面？                           |
| Distinctiveness | 是否抓住了这个 fixture 真正独特的手法（对照 `signatureMoves`）？ |
| Restraint       | 是否承认证据不足，而不是过度解读？                               |
| Safety          | 是否避免复制资产、泄漏内容、执行不可信数据？                     |

量表是内部质量门槛，不合成单一"审美分数"。

## 添加新 fixture

1. 写 `fixtures/<name>.html`（自包含、无外部资产、带一个 allowlist 交互和响应式变化）。
2. 跑 `pnpm test:benchmark`，观察实际提取结果。
3. 写 `<name>.annotations.json`：把合理的实际行为标定为门检，并人工撰写 `referenceProfile`。
4. 提交时说明新 fixture 覆盖的设计语言维度。
