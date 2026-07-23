const assert = require("assert").strict;
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "copy-design", "scripts", "verify_managed_section.js");
const sectionText = `<!-- copy-design:start id=0123456789ab schema=1 -->
## Reference design system: fixture

### Tokens

- Test
<!-- copy-design:end id=0123456789ab -->
`;

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [script, ...args.map(String)], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, expectedStatus, result.stderr);
  return result;
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-design-unit-"));
  try {
    let payload = JSON.parse(run(["resolve", "--root", root]).stdout);
    assert.deepEqual(payload.targets.map((target) => path.basename(target)), ["DESIGN.md"]);

    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Agents\n", "utf8");
    payload = JSON.parse(run(["resolve", "--root", root]).stdout);
    assert.deepEqual(payload.targets.map((target) => path.basename(target)), ["AGENTS.md"]);

    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Claude\n", "utf8");
    payload = JSON.parse(run(["resolve", "--root", root]).stdout);
    assert.deepEqual(
      payload.targets.map((target) => path.basename(target)),
      ["AGENTS.md", "CLAUDE.md"],
    );

    const target = path.join(root, "AGENTS.md");
    const section = path.join(root, "section.md");
    const first = path.join(root, "first.md");
    const second = path.join(root, "second.md");
    fs.writeFileSync(target, "# Agents\n\nManual rule.\n", "utf8");
    fs.writeFileSync(section, sectionText, "utf8");
    run(["preview", "--file", target, "--section", section, "--output", first]);
    fs.writeFileSync(target, fs.readFileSync(first, "utf8"), "utf8");
    run(["preview", "--file", target, "--section", section, "--output", second]);
    assert.equal(fs.readFileSync(first, "utf8"), fs.readFileSync(second, "utf8"));
    assert.equal((fs.readFileSync(second, "utf8").match(/copy-design:start/g) || []).length, 1);

    const malformed = path.join(root, "malformed.md");
    fs.writeFileSync(
      malformed,
      "<!-- copy-design:start id=0123456789ab schema=1 -->\n",
      "utf8",
    );
    const failure = run(["inspect", "--file", malformed], 1);
    assert.match(failure.stderr, /Unclosed managed block/);
    console.log("managed-section tests passed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
