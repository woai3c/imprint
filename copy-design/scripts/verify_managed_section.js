#!/usr/bin/env node

const { spawnSync } = require("child_process");
const {
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  mkdirSync,
} = require("fs");
const path = require("path");

const ALLOWED_TARGETS = new Set(["AGENTS.md", "CLAUDE.md", "DESIGN.md"]);
const TOKEN_SOURCE = String.raw`<!-- copy-design:(start|end) id=([0-9a-f]{12})(?: schema=([1-9][0-9]*))? -->`;

function fail(message) {
  throw new Error(message);
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) fail(`Unexpected argument: ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) fail(`${arg} requires a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  return options;
}

function gitRoot(candidate) {
  const resolved = path.resolve(candidate);
  const result = spawnSync("git", ["-C", resolved, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 && result.stdout.trim()
    ? path.resolve(result.stdout.trim())
    : resolved;
}

function assertRootTarget(root, targetValue) {
  const target = path.isAbsolute(targetValue)
    ? path.resolve(targetValue)
    : path.resolve(root, targetValue);
  if (!ALLOWED_TARGETS.has(path.basename(target))) {
    fail(`Target must be one of: ${[...ALLOWED_TARGETS].sort().join(", ")}`);
  }
  if (path.dirname(target) !== root) fail("Target must be directly inside the project root");
  if (existsSync(target) && path.dirname(realpathSync(target)) !== root) {
    fail("Target resolves outside the project root");
  }
  return target;
}

function resolveTargets(rootValue, targetValue) {
  const root = gitRoot(rootValue);
  if (!existsSync(root)) fail(`Project root does not exist: ${root}`);
  let targets;
  if (targetValue) {
    targets = [assertRootTarget(root, targetValue)];
  } else {
    const agents = assertRootTarget(root, "AGENTS.md");
    const claude = assertRootTarget(root, "CLAUDE.md");
    targets = [agents, claude].filter(existsSync);
    if (targets.length === 0) targets = [assertRootTarget(root, "DESIGN.md")];
  }
  return {
    root,
    targets,
    existing: targets.map(existsSync),
  };
}

function parseBlocks(text) {
  const regex = new RegExp(TOKEN_SOURCE, "g");
  const tokens = [...text.matchAll(regex)];
  const rawCount = (text.match(/<!-- copy-design:(?:start|end)/g) || []).length;
  if (tokens.length !== rawCount) fail("Malformed copy-design marker found");

  const blocks = [];
  const seen = new Set();
  let open = null;
  for (const token of tokens) {
    const [raw, kind, id, schema] = token;
    const start = token.index;
    const end = start + raw.length;
    if (kind === "start") {
      if (open) fail(`Nested managed block at id=${id}`);
      if (!schema) fail(`Start marker is missing schema at id=${id}`);
      if (seen.has(id)) fail(`Duplicate managed block id=${id}`);
      open = { id, schema: Number(schema), start };
    } else {
      if (schema) fail(`End marker must not declare schema at id=${id}`);
      if (!open) fail(`End marker has no matching start at id=${id}`);
      if (open.id !== id) fail(`Mismatched managed block ids: ${open.id} != ${id}`);
      blocks.push({ ...open, end });
      seen.add(id);
      open = null;
    }
  }
  if (open) fail(`Unclosed managed block id=${open.id}`);
  return blocks;
}

function parseSection(section, maxBytes = 30_000) {
  const blocks = parseBlocks(section);
  if (blocks.length !== 1) fail("A generated section must contain exactly one managed block");
  const block = blocks[0];
  if (section.slice(0, block.start).trim() || section.slice(block.end).trim()) {
    fail("Generated section contains content outside its managed block");
  }
  if (Buffer.byteLength(section, "utf8") > maxBytes) {
    fail(`Generated section exceeds ${maxBytes} UTF-8 bytes`);
  }
  if (!/^## /m.test(section)) fail("Generated section is missing a level-2 title");
  if (!/^### /m.test(section)) fail("Generated section is missing required subsections");
  return block;
}

function newlineFor(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeNewlines(text, newline) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, newline);
}

function mergeText(existing, section, filename) {
  const sectionBlock = parseSection(section);
  const existingBlocks = parseBlocks(existing);
  const matches = existingBlocks.filter((block) => block.id === sectionBlock.id);
  if (matches.length > 1) fail(`Existing file has duplicate id=${sectionBlock.id}`);
  const newline = newlineFor(existing);
  const normalizedSection = normalizeNewlines(section.trim(), newline);

  if (matches.length === 1) {
    const block = matches[0];
    return existing.slice(0, block.start) + normalizedSection + existing.slice(block.end);
  }
  if (!existing) {
    const title = filename === "DESIGN.md"
      ? "# Design Guidelines"
      : `# ${filename.replace(/\.md$/i, "")}`;
    return `${title}${newline}${newline}${normalizedSection}${newline}`;
  }
  const separator = existing.endsWith(newline + newline)
    ? ""
    : existing.endsWith(newline)
      ? newline
      : newline + newline;
  return existing + separator + normalizedSection + newline;
}

function readUtf8(file) {
  return readFileSync(file, "utf8");
}

function inspectFile(file, maxBytes = 30_000) {
  if (!existsSync(file)) fail(`File does not exist: ${file}`);
  const text = readUtf8(file);
  const blocks = parseBlocks(text);
  const report = blocks.map((block) => {
    const bytes = Buffer.byteLength(text.slice(block.start, block.end), "utf8");
    if (bytes > maxBytes) fail(`Managed block id=${block.id} exceeds ${maxBytes} bytes`);
    return { id: block.id, schema: block.schema, bytes };
  });
  return { file: path.resolve(file), blocks: report };
}

function help() {
  console.log(`Usage:
  node verify_managed_section.js resolve --root <project-root> [--target <file>]
  node verify_managed_section.js inspect --file <file> [--max-bytes <number>]
  node verify_managed_section.js preview --file <target> --section <section> --output <preview>
  node verify_managed_section.js verify-update --before <file> --after <file> --section <section>`);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    help();
    return;
  }
  const options = parseOptions(rest);

  if (command === "resolve") {
    console.log(JSON.stringify(resolveTargets(options.root || process.cwd(), options.target), null, 2));
    return;
  }
  if (command === "inspect") {
    if (!options.file) fail("--file is required");
    console.log(JSON.stringify(inspectFile(options.file, Number(options["max-bytes"] || 30_000)), null, 2));
    return;
  }
  if (command === "preview") {
    for (const name of ["file", "section", "output"]) {
      if (!options[name]) fail(`--${name} is required`);
    }
    const existing = existsSync(options.file) ? readUtf8(options.file) : "";
    const section = readUtf8(options.section);
    const merged = mergeText(existing, section, path.basename(options.file));
    mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    writeFileSync(options.output, merged, "utf8");
    console.log(JSON.stringify({
      target: path.resolve(options.file),
      preview: path.resolve(options.output),
      changed: merged !== existing,
    }, null, 2));
    return;
  }
  if (command === "verify-update") {
    for (const name of ["before", "after", "section"]) {
      if (!options[name]) fail(`--${name} is required`);
    }
    const before = existsSync(options.before) ? readUtf8(options.before) : "";
    const after = readUtf8(options.after);
    const section = readUtf8(options.section);
    const expected = mergeText(before, section, path.basename(options.after));
    if (after !== expected) fail("Updated file differs from the deterministic managed-section merge");
    console.log(JSON.stringify({
      ...inspectFile(options.after),
      updateMatchesPreview: true,
    }, null, 2));
    return;
  }
  fail(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(`copy-design verification failed: ${error.message}`);
  process.exitCode = 1;
}
