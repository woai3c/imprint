const assert = require("assert").strict;
const { spawn } = require("child_process");
const { mkdtemp, readFile, rm, writeFile } = require("fs").promises;
const http = require("http");
const os = require("os");
const path = require("path");


const testsDir = __dirname;
const repoRoot = path.dirname(testsDir);
const fixtureDir = path.join(testsDir, "fixture-site");


function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(
          `${executable} ${args.join(" ")} exited ${code}\n${stdout}\n${stderr}`,
        ));
      }
    });
  });
}


function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}


async function main() {
  const keepArtifacts = process.argv.includes("--keep");
  const evidenceDir = await mkdtemp(path.join(os.tmpdir(), "copy-design-it-"));
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://fixture.local");
      const relative = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
      const file = path.resolve(fixtureDir, relative);
      if (!file.startsWith(path.resolve(fixtureDir) + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { "content-type": contentType(file) });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;

    await run(process.execPath, [
    "copy-design/scripts/capture_site.js",
    "--url", `${origin}/`,
    "--url", `${origin}/pricing.html?session=fake`,
    "--output", evidenceDir,
    "--allow-private",
  ]);
  await run(process.execPath, [
    "copy-design/scripts/extract_style_facts.js",
    "--input", path.join(evidenceDir, "capture.json"),
    "--output", path.join(evidenceDir, "style-facts.json"),
  ]);
  await run(process.execPath, [
    "copy-design/scripts/render_design_section.js",
    "--input", path.join(evidenceDir, "style-facts.json"),
    "--output", path.join(evidenceDir, "section-node.md"),
    "--profile", "fixture-light",
    "--language", "zh-CN",
  ]);
  await run(process.execPath, [
    "copy-design/scripts/verify_managed_section.js",
    "inspect",
    "--file", path.join(evidenceDir, "section-node.md"),
  ]);
  await run(process.execPath, [
    "copy-design/scripts/render_design_section.js",
    "--input", path.join(evidenceDir, "style-facts.json"),
    "--output", path.join(evidenceDir, "section-node-en.md"),
    "--profile", "fixture-light-en",
    "--language", "en",
  ]);
  await run(process.execPath, [
    "copy-design/scripts/verify_managed_section.js",
    "inspect",
    "--file", path.join(evidenceDir, "section-node-en.md"),
  ]);

  const capture = JSON.parse(await readFile(path.join(evidenceDir, "capture.json"), "utf8"));
  const facts = JSON.parse(await readFile(path.join(evidenceDir, "style-facts.json"), "utf8"));
  const section = await readFile(path.join(evidenceDir, "section-node.md"), "utf8");
  const englishSection = await readFile(path.join(evidenceDir, "section-node-en.md"), "utf8");

  const target = path.join(evidenceDir, "AGENTS.md");
  const firstPreview = path.join(evidenceDir, "AGENTS.first.md");
  const secondPreview = path.join(evidenceDir, "AGENTS.second.md");
  await writeFile(target, "# Existing rules\n\nManual rule.\n", "utf8");
  await run(process.execPath, [
    "copy-design/scripts/verify_managed_section.js",
    "preview",
    "--file", target,
    "--section", path.join(evidenceDir, "section-node.md"),
    "--output", firstPreview,
  ]);
  await writeFile(target, await readFile(firstPreview), "utf8");
  await run(process.execPath, [
    "copy-design/scripts/verify_managed_section.js",
    "preview",
    "--file", target,
    "--section", path.join(evidenceDir, "section-node.md"),
    "--output", secondPreview,
  ]);
  assert.equal(await readFile(firstPreview, "utf8"), await readFile(secondPreview, "utf8"));

  const withOverride = section.replace(
    "### 用户覆盖规则\n\n- 暂无。",
    "### 用户覆盖规则\n\n- 将默认圆角减小到 `8px`。",
  );
  await writeFile(target, `# Existing rules\n\n${withOverride}`, "utf8");
  await run(process.execPath, [
    "copy-design/scripts/render_design_section.js",
    "--input", path.join(evidenceDir, "style-facts.json"),
    "--output", path.join(evidenceDir, "section-node-preserved.md"),
    "--profile", "fixture-light",
    "--language", "zh-CN",
    "--preserve-from", target,
  ]);
  const preserved = await readFile(path.join(evidenceDir, "section-node-preserved.md"), "utf8");
  assert.match(preserved, /将默认圆角减小到 `8px`/);

  assert.equal(capture.pages.length, 6);
  assert.equal(capture.errors.length, 0);
  assert.equal(capture.source.urls.some((url) => url.includes("session=")), false);
  assert.ok(facts.tokens.colors.length >= 4);
  assert.ok(facts.tokens.semanticColors.length >= 3);
  assert.ok(facts.components.some((component) => component.kind === "button"));
  assert.ok(facts.responsive.mediaQueries.length >= 2);
  assert.ok(facts.responsive.observations.length >= 2);
  assert.ok(facts.interactionStates.length >= 1);
  assert.match(section, /<!-- copy-design:start id=[0-9a-f]{12} schema=1 -->/);
  assert.match(section, /### 用户覆盖规则/);
  assert.match(englishSection, /### User overrides/);

  const summary = {
    captures: capture.pages.length,
    colors: facts.tokens.colors.length,
    components: facts.components.length,
    responsiveObservations: facts.responsive.observations.length,
    interactionStates: facts.interactionStates.length,
    sectionBytes: Buffer.byteLength(section, "utf8"),
  };
  if (keepArtifacts) {
    summary.outputDir = evidenceDir;
    summary.screenshots = path.join(evidenceDir, "screenshots");
    summary.styleFacts = path.join(evidenceDir, "style-facts.json");
    summary.designSection = path.join(evidenceDir, "section-node.md");
    summary.generatedInstructions = target;
  }
  console.log(JSON.stringify(summary, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (!keepArtifacts) {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
