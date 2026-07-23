const assert = require("assert").strict;
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "copy-design", "scripts", "render_design_section.js");
const minimalFacts = {
  schemaVersion: "1.0",
  source: {
    origins: ["https://example.com"],
    urls: ["https://example.com/"],
    mode: "enhanced",
  },
  coverage: {
    captures: 1,
    routes: ["https://example.com/"],
    viewports: [{ name: "desktop", width: 1440, height: 900 }],
    warnings: [],
  },
  tokens: {
    semanticColors: [
      { role: "canvas", value: "#FFFFFF", reason: "body", confidence: "high" },
    ],
    colors: [],
    typography: [],
    spacing: [],
    spacingBase: null,
    radii: [],
    borders: [],
    shadows: [],
    motion: [],
  },
  layouts: [],
  components: [],
  responsive: { mediaQueries: [], observations: [] },
  interactionStates: [],
  evidenceGaps: [],
};

function render(input, output, preserveFrom) {
  const args = [
    script,
    "--input", input,
    "--output", output,
    "--profile", "fixture",
    "--language", "zh-CN",
  ];
  if (preserveFrom) args.push("--preserve-from", preserveFrom);
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-design-render-"));
  try {
    const facts = path.join(root, "facts.json");
    const initial = path.join(root, "initial.md");
    const existing = path.join(root, "AGENTS.md");
    const regenerated = path.join(root, "regenerated.md");
    fs.writeFileSync(facts, JSON.stringify(minimalFacts), "utf8");
    render(facts, initial);

    const withOverrides = fs.readFileSync(initial, "utf8").replace(
      "### 用户覆盖规则\n\n- 暂无。",
      "### 用户覆盖规则\n\n- 将默认圆角减小到 `8px`。\n- 只参考布局，不使用来源站品牌色。",
    );
    fs.writeFileSync(existing, `# Existing rules\n\n${withOverrides}`, "utf8");
    render(facts, regenerated, existing);

    const result = fs.readFileSync(regenerated, "utf8");
    assert.match(result, /将默认圆角减小到 `8px`/);
    assert.match(result, /只参考布局，不使用来源站品牌色/);
    assert.equal((result.match(/^### 用户覆盖规则$/gm) || []).length, 1);
    console.log("render-section tests passed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
