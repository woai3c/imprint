#!/usr/bin/env node

const { createHash } = require("crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const path = require("path");

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { language: "zh-CN" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node render_design_section.js --input <style-facts.json> [options]

Options:
  --output <file>          Write to a file; stdout when omitted.
  --profile <name>        Defaults to the source host.
  --source <url>          Override the displayed source.
  --language <zh-CN|en>   Default: zh-CN.
  --preserve-from <file>  Preserve this profile's user overrides.`);
      process.exit(0);
    }
    if (!arg.startsWith("--")) fail(`Unexpected argument: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${arg} requires a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.input) fail("--input is required");
  if (!["zh-CN", "en"].includes(options.language)) fail("--language must be zh-CN or en");
  return options;
}

function sanitizeUrl(raw) {
  try {
    const url = new URL(raw);
    const authorityStart = String(raw).indexOf("://") + 3;
    const firstSlash = String(raw).indexOf("/", authorityStart);
    const firstQuery = String(raw).search(/[?#]/);
    const hasExplicitPath = firstSlash >= 0 && (firstQuery < 0 || firstSlash < firstQuery);
    return `${url.origin}${hasExplicitPath ? url.pathname : ""}`;
  } catch {
    return raw || "unknown-source";
  }
}

function sourceFromFacts(facts, override) {
  if (override) return sanitizeUrl(override);
  const source = facts.source || {};
  return sanitizeUrl((source.origins || source.urls || [])[0] || "unknown-source");
}

function profileFromSource(source) {
  try {
    return new URL(source).hostname || "reference-design";
  } catch {
    return "reference-design";
  }
}

function stableId(source, profile) {
  return createHash("sha256")
    .update(`${sanitizeUrl(source)}\n${profile.trim().toLowerCase()}`, "utf8")
    .digest("hex")
    .slice(0, 12);
}

function mdCode(value) {
  return `\`${String(value ?? "").replaceAll("`", "ˋ")}\``;
}

function cell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
}

function shorten(value, limit = 100) {
  const text = String(value ?? "");
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function table(headers, rows) {
  if (rows.length === 0) return [];
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ];
}

function confidence(value, language) {
  if (language === "en") return value || "low";
  return ({ high: "高", medium: "中", low: "低" })[value] || value || "低";
}

function preservedOverrides(file, blockId) {
  if (!file || !existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const escaped = blockId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = text.match(new RegExp(
    `<!-- copy-design:start id=${escaped} schema=\\d+ -->([\\s\\S]*?)<!-- copy-design:end id=${escaped} -->`,
  ));
  if (!block) return null;
  const body = block[1];
  const heading = /^### (?:用户覆盖规则|User overrides)\s*$/m.exec(body);
  if (!heading) return null;
  const remainder = body.slice(heading.index + heading[0].length);
  const nextHeading = remainder.search(/^### /m);
  const content = (nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder).trim();
  if (!content || ["- 暂无。", "- None recorded."].includes(content)) return null;
  return content.split(/\r?\n/);
}

function renderZh(facts, source, profile, blockId, overrides) {
  const coverage = facts.coverage || {};
  const tokens = facts.tokens || {};
  const semantic = tokens.semanticColors || [];
  const typography = tokens.typography || [];
  const components = facts.components || [];
  const responsive = facts.responsive || {};
  const interactionStates = facts.interactionStates || [];
  const lines = [
    `<!-- copy-design:start id=${blockId} schema=1 -->`,
    `## 参考网站设计规范：${profile}`,
    "",
    `- 来源：${mdCode(source)}`,
    `- 采集模式：${mdCode(facts.source?.mode || "unknown")}`,
    `- 覆盖：${coverage.captures || 0} 个页面/视口组合，${(coverage.routes || []).length} 个路由，${(coverage.viewports || []).length} 种视口`,
    "- 解释规则：高置信度项可作为默认约束；中置信度项需要结合当前页面语义；低置信度项仅作参考。",
    "",
    "### 设计 DNA",
    "",
  ];

  const canvas = semantic.find((item) => item.role === "canvas");
  const action = semantic.find((item) => item.role === "action.primary");
  const type = typography[0];
  const radius = tokens.radii?.[0]?.value;
  const dna = [];
  if (canvas) dna.push(`以 ${mdCode(canvas.value)} 作为主要画布候选色，使用分层表面组织内容。`);
  if (action) dna.push(`主要交互强调色候选为 ${mdCode(action.value)}；将其集中用于关键操作。`);
  if (type) {
    dna.push(
      `最常见文字组合为 ${mdCode(type.family)}、${mdCode(type.size)}/${mdCode(type.lineHeight)}、字重 ${mdCode(type.fontWeight)}。`,
    );
  }
  if (tokens.spacingBase) {
    dna.push(`间距样本与 ${mdCode(tokens.spacingBase.value)} 基础节奏最接近。`);
  }
  if (radius) dna.push(`重复度最高的非零圆角为 ${mdCode(radius)}。`);
  lines.push(...(dna.length ? dna.map((item) => `- ${item}`) : ["- 当前证据不足以形成稳定的设计 DNA。"]));

  lines.push("", "### 设计令牌", "", "#### 语义颜色候选", "");
  lines.push(...(table(
    ["角色", "值", "依据", "置信度"],
    semantic.map((item) => [
      mdCode(item.role),
      mdCode(item.value),
      item.reason || "",
      confidence(item.confidence, "zh-CN"),
    ]),
  ).length
    ? table(
        ["角色", "值", "依据", "置信度"],
        semantic.map((item) => [
          mdCode(item.role),
          mdCode(item.value),
          item.reason || "",
          confidence(item.confidence, "zh-CN"),
        ]),
      )
    : ["- 未提取到可靠颜色候选。"]));

  if ((tokens.colors || []).length) {
    lines.push("", "#### 高频渲染颜色", "");
    lines.push(...table(
      ["值", "次数", "主要属性", "视口", "置信度"],
      tokens.colors.slice(0, 10).map((item) => [
        mdCode(item.value),
        item.count,
        (item.properties || []).slice(0, 3).join(", "),
        (item.viewports || []).join(", "),
        confidence(item.confidence, "zh-CN"),
      ]),
    ));
  }

  lines.push("", "#### 字体层级候选", "");
  const typeRows = typography.slice(0, 8).map((item) => [
    mdCode(item.family),
    mdCode(item.size),
    mdCode(item.fontWeight),
    mdCode(item.lineHeight),
    mdCode(item.letterSpacing),
    item.count,
    confidence(item.confidence, "zh-CN"),
  ]);
  lines.push(...(typeRows.length
    ? table(["字体", "字号", "字重", "行高", "字距", "次数", "置信度"], typeRows)
    : ["- 未提取到可靠字体层级。"]));

  const values = (items, count) => (items || []).slice(0, count).map((item) => mdCode(item.value));
  lines.push(
    "",
    "#### 间距、圆角、边框与阴影",
    "",
    `- 高频间距：${values(tokens.spacing, 12).join(", ") || "证据不足"}`,
    `- 高频圆角：${values(tokens.radii, 8).join(", ") || "证据不足"}`,
    `- 高频边框：${values(tokens.borders, 6).join(", ") || "证据不足"}`,
    `- 高频阴影：${(tokens.shadows || []).slice(0, 5).map((item) => mdCode(shorten(item.value))).join(", ") || "未观察到稳定阴影"}`,
    "",
    "### 布局系统",
    "",
  );

  const layoutRows = (facts.layouts || []).slice(0, 16).map((layout) => [
    layout.viewport?.name,
    `${layout.viewport?.width}×${layout.viewport?.height}`,
    layout.document?.scrollWidth,
    layout.document?.scrollHeight,
    [...new Set((layout.landmarks || []).map((item) => item.kind))].join(", ") || "—",
  ]);
  lines.push(...(layoutRows.length
    ? table(["视口", "采样尺寸", "文档宽度", "文档高度", "可见地标"], layoutRows)
    : ["- 没有可用布局样本。"]));
  lines.push(
    "",
    "- 不要把采样视口尺寸误当成站点断点；结合媒体查询和实际重排。",
    "- 保持 header、main、aside、footer 等对齐锚点一致。",
    "",
    "### 组件规范",
    "",
  );

  if (components.length === 0) lines.push("- 当前证据不足以形成重复组件规范。", "");
  for (const component of components.slice(0, 14)) {
    const style = component.style || {};
    lines.push(
      `#### ${component.kind}`,
      "",
      `- 样本数：${component.count}；覆盖视口：${(component.viewports || []).join(", ") || "未知"}；置信度：${confidence(component.confidence, "zh-CN")}。`,
      `- 平均尺寸：${mdCode(component.averageSize?.width)} × ${mdCode(component.averageSize?.height)} CSS px。`,
      `- 字体：${mdCode(style["font-family"])}，${mdCode(style["font-size"])}，字重 ${mdCode(style["font-weight"])}。`,
      `- 表面：背景 ${mdCode(style["background-color"])}，文字 ${mdCode(style.color)}，边框 ${mdCode(style["border-top-width"])} ${mdCode(style["border-top-color"])}。`,
      `- 形状：圆角 ${mdCode(style["border-top-left-radius"])}；阴影 ${mdCode(shorten(style["box-shadow"] || "none"))}。`,
      "",
    );
  }

  lines.push("### 响应式规则", "");
  if ((responsive.mediaQueries || []).length) {
    lines.push(`- 观测到的媒体查询：${responsive.mediaQueries.slice(0, 12).map((item) => mdCode(item.value)).join("；")}。`);
  }
  if ((responsive.observations || []).length) {
    for (const item of responsive.observations.slice(0, 16)) {
      lines.push(
        `- ${mdCode(item.route)}：${item.observation}；${item.from?.viewport} → ${item.to?.viewport}，置信度 ${confidence(item.confidence, "zh-CN")}。`,
      );
    }
  } else {
    lines.push("- 未获得足够的跨视口证据；不要自行假设移动端只是桌面端缩放。");
  }

  lines.push("", "### 交互与动效", "");
  if ((tokens.motion || []).length) {
    for (const item of tokens.motion.slice(0, 8)) {
      lines.push(`- ${mdCode(item.property)}：${mdCode(item.duration)}，缓动 ${mdCode(item.easing)}。`);
    }
  } else {
    lines.push("- 未观察到重复度足够高的 transition 组合。");
  }
  const stateGroups = new Map();
  for (const item of interactionStates) {
    const key = `${item.target?.kind || "element"}\0${item.state || "unknown"}`;
    if (!stateGroups.has(key)) stateGroups.set(key, new Set());
    for (const property of Object.keys(item.difference || {})) stateGroups.get(key).add(property);
  }
  for (const [key, properties] of [...stateGroups].slice(0, 12)) {
    const [kind, state] = key.split("\0");
    lines.push(`- ${mdCode(kind)} 的 ${mdCode(state)} 状态会改变：${[...properties].sort().map(mdCode).join(", ")}。`);
  }
  if (stateGroups.size === 0) lines.push("- 没有捕获到 hover/focus 的可见样式差异。");

  lines.push(
    "",
    "### 可访问性",
    "",
    "- 保留可见键盘焦点，不要只实现 hover。",
    "- 重新检查正文、弱化文字、按钮和边框的实际对比度。",
    "- 尊重 `prefers-reduced-motion`，保持原生或等价 ARIA 语义。",
    "",
    "### 实施准则",
    "",
    "- 优先把高置信度、跨页面重复的值映射为项目 token。",
    "- 中低置信度值先作为组件局部规则，确认后再提升为全局 token。",
    "- 复现设计语言，不复制源码、文案、Logo、插画、摄影或受限字体文件。",
    "- 项目已有人工设计约束优先于本受管区块。",
    "",
    "### 避免事项",
    "",
    "- 不要把一次性偏移或特殊圆角当成全局 token。",
    "- 不要从一次截图推断未采集的登录后、错误、弹窗或业务数据状态。",
    "- 不要仅凭颜色频次断言品牌语义。",
    "",
    "### 用户覆盖规则",
    "",
    ...(overrides || ["- 暂无。"]),
    "",
    "### 证据缺口",
    "",
    ...(facts.evidenceGaps || []).map((item) => `- ${item}`),
    ...(coverage.warnings || []).map((item) => `- ${item}`),
  );
  if (!(facts.evidenceGaps || []).length && !(coverage.warnings || []).length) {
    lines.push("- 当前自动报告未记录额外缺口；仍需在实现页面上执行视觉复核。");
  }
  lines.push("", `<!-- copy-design:end id=${blockId} -->`, "");
  return lines.join("\n");
}

function renderEn(facts, source, profile, blockId, overrides) {
  const coverage = facts.coverage || {};
  const tokens = facts.tokens || {};
  const semantic = tokens.semanticColors || [];
  const components = facts.components || [];
  const lines = [
    `<!-- copy-design:start id=${blockId} schema=1 -->`,
    `## Reference design system: ${profile}`,
    "",
    `- Source: ${mdCode(source)}`,
    `- Capture mode: ${mdCode(facts.source?.mode || "unknown")}`,
    `- Coverage: ${coverage.captures || 0} page/viewport captures, ${(coverage.routes || []).length} routes, ${(coverage.viewports || []).length} viewports`,
    "- Interpretation: enforce high-confidence findings; review medium-confidence findings in context; treat low-confidence findings as estimates.",
    "",
    "### Design DNA",
    "",
  ];
  const canvas = semantic.find((item) => item.role === "canvas");
  const action = semantic.find((item) => item.role === "action.primary");
  lines.push(canvas ? `- Use ${mdCode(canvas.value)} as the canvas candidate.` : "- Canvas evidence is incomplete.");
  lines.push(action ? `- Reserve ${mdCode(action.value)} for primary actions.` : "- Primary action color needs review.");
  if (tokens.radii?.[0]?.value) lines.push(`- The most repeated non-zero radius is ${mdCode(tokens.radii[0].value)}.`);

  lines.push("", "### Tokens", "");
  const colorRows = semantic.map((item) => [
    mdCode(item.role),
    mdCode(item.value),
    item.reason || "",
    confidence(item.confidence, "en"),
  ]);
  lines.push(...(colorRows.length
    ? table(["Role", "Value", "Evidence", "Confidence"], colorRows)
    : ["- No reliable semantic color candidates."]));

  if ((tokens.typography || []).length) {
    lines.push("", "#### Typography", "");
    lines.push(...table(
      ["Family", "Size", "Weight", "Line height", "Count", "Confidence"],
      tokens.typography.slice(0, 8).map((item) => [
        mdCode(item.family),
        mdCode(item.size),
        mdCode(item.fontWeight),
        mdCode(item.lineHeight),
        item.count,
        confidence(item.confidence, "en"),
      ]),
    ));
  }

  lines.push("", "### Layout", "");
  for (const layout of (facts.layouts || []).slice(0, 12)) {
    lines.push(
      `- ${mdCode(layout.viewport?.name)} ${layout.viewport?.width}×${layout.viewport?.height}: document ${layout.document?.scrollWidth}×${layout.document?.scrollHeight} CSS px.`,
    );
  }
  lines.push("- Infer breakpoints from media queries and observed reflow; do not treat sample viewport widths as breakpoints.", "", "### Components", "");
  if (components.length === 0) lines.push("- Repeated component evidence is incomplete.", "");
  for (const component of components.slice(0, 14)) {
    const style = component.style || {};
    lines.push(
      `#### ${component.kind}`,
      "",
      `- ${component.count} samples across ${(component.viewports || []).join(", ")}; ${confidence(component.confidence, "en")} confidence.`,
      `- Average size: ${mdCode(component.averageSize?.width)} × ${mdCode(component.averageSize?.height)} CSS px.`,
      `- Surface: ${mdCode(style["background-color"])}; text: ${mdCode(style.color)}; radius: ${mdCode(style["border-top-left-radius"])}.`,
      "",
    );
  }

  lines.push("### Responsive behavior", "");
  const observations = facts.responsive?.observations || [];
  if (observations.length) {
    for (const item of observations.slice(0, 16)) {
      lines.push(`- ${mdCode(item.route)}: ${item.observation} (${item.from?.viewport} → ${item.to?.viewport}).`);
    }
  } else {
    lines.push("- Cross-viewport evidence is incomplete; do not model mobile as a scaled desktop page.");
  }

  lines.push("", "### Interaction and motion", "");
  if ((tokens.motion || []).length) {
    for (const item of tokens.motion.slice(0, 8)) {
      lines.push(`- ${mdCode(item.property)}: ${mdCode(item.duration)}, ${mdCode(item.easing)}.`);
    }
  } else {
    lines.push("- No repeated transition combination was observed.");
  }

  lines.push(
    "",
    "### Accessibility",
    "",
    "- Preserve visible keyboard focus and native or equivalent ARIA semantics.",
    "- Recheck text, control, and border contrast before enforcing inferred colors.",
    "- Respect `prefers-reduced-motion`.",
    "",
    "### Implementation rules",
    "",
    "- Promote only repeated high-confidence evidence to global tokens.",
    "- Keep medium/low-confidence findings local until confirmed.",
    "- Reproduce the design language, not source code, copy, logos, illustrations, photography, or restricted font files.",
    "- Existing human-authored project constraints override this managed section.",
    "",
    "### Avoid",
    "",
    "- Do not turn one-off offsets or special-case radii into global tokens.",
    "- Do not invent authenticated, error, modal, or business-data states that were not captured.",
    "- Do not assign brand semantics from color frequency alone.",
    "",
    "### User overrides",
    "",
    ...(overrides || ["- None recorded."]),
    "",
    "### Evidence gaps",
    "",
    ...(facts.evidenceGaps || []).map((item) => `- ${item}`),
    ...(coverage.warnings || []).map((item) => `- ${item}`),
    "",
    `<!-- copy-design:end id=${blockId} -->`,
    "",
  );
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const facts = JSON.parse(readFileSync(options.input, "utf8"));
  if (facts.schemaVersion !== "1.0") fail("Unsupported style-facts schema");
  const source = sourceFromFacts(facts, options.source);
  const profile = options.profile || profileFromSource(source);
  const blockId = stableId(source, profile);
  const overrides = preservedOverrides(options["preserve-from"], blockId);
  const rendered = options.language === "zh-CN"
    ? renderZh(facts, source, profile, blockId, overrides)
    : renderEn(facts, source, profile, blockId, overrides);

  if (options.output) {
    const output = path.resolve(options.output);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, rendered, "utf8");
    console.log(JSON.stringify({ output, id: blockId, profile }, null, 2));
  } else {
    process.stdout.write(rendered);
  }
}

try {
  main();
} catch (error) {
  console.error(`copy-design render failed: ${error.message}`);
  process.exitCode = 1;
}
