# AGENTS.md

This file is loaded into the agent's context at the start of every session. Keep it concise — the agent reads it every turn.

## Project

Imprint — Electron desktop app + standalone CLI + MCP server that extracts a website's design system (colors, typography, spacing...) from a URL and exports it as CSS variables / Tailwind v4 `@theme` / JSON tokens / Markdown docs. Package manager is pnpm (pinned); Node >= 20.19 required.

Analysis input is URL-only. Imprint does not analyze standalone screenshot files: screenshots are captured from the loaded website as traceable evidence, while the DOM, computed styles, responsive behavior, and interaction states provide the extractable source data. Do not describe screenshots as a supported analysis input in code comments, UI copy, or documentation.

## Rules

- Use visualizations when they help explain complex concepts.
- Keep responses concise and direct, and clearly distinguish facts from assumptions.
- Base research on reliable sources.
- Stay aligned with the user's goals and constraints.
- Avoid unnecessary questions; ask only when a key decision requires confirmation.
- Use sub-agents judiciously and avoid unnecessary parallelism.
- Keep code changes minimal and avoid unrelated refactoring.
- Keep analyzer and extraction behavior site-agnostic. Do not branch on hostnames, brands, vendor-specific routes,
  CSS classes, test IDs, or other implementation details of a particular website to improve its result. Use web
  standards and general DOM/URL semantics, and validate general claims with neutral fixtures covering multiple site
  structures. If a case cannot be handled generically, report the limitation instead of adding a site adapter or
  tuning logic and fixtures to make a named website's result look better.
- Verify actual results through testing; do not assume something is complete just because it looks complete.
- Protect existing code and data.
- Report key results without unnecessary progress updates.

## Commands

- `pnpm dev` — run the Electron app (electron-forge + Vite)
- `pnpm build` — package the desktop app (NOT the CLI)
- `pnpm build:cli` — compile `src/cli`, `src/core`, `src/mcp` to `dist/` via `tsconfig.cli.json`; required before running the `imprint` / `imprint-mcp` bin entries
- `pnpm test` — run the Vitest unit suite for core analyzer behavior
- `pnpm test:coverage` — run the unit suite and write V8 text/HTML/LCOV coverage reports
- `pnpm test:e2e` — package the app, build the CLI, and run browser/Electron E2E coverage against local fixtures; requires installed Chrome or Edge
- `pnpm test:design-evidence` — run the annotated Design Evidence browser regression suite
- `pnpm run test:comparison-site -- --variant reference` — serve the deterministic local site used to manually verify Desktop history comparison; scenario details are in `tests/comparison-site/README.md`
- `pnpm run ci` — typecheck + lint + unit tests + build, the full local check (`pnpm ci` is a reserved pnpm command and will fail)
- `pnpm release` — from a clean `main`, generate the changelog, release commit, and annotated tag, then push them to
  trigger native Windows x64 and macOS arm64/x64 release builds
- Unit tests use Vitest. E2E tests use Node's test runner with `playwright-core`.

## Architecture

Three entry points share the extraction engine:

1. Desktop app: `src/renderer` (React 19 + Zustand + Tailwind v4) talks to `src/main` only through `window.electronAPI`, defined in `src/main/preload.ts`; handlers live in `src/main/ipc.ts`. New app features = preload method + IPC handler + renderer call, three places.
2. CLI: `src/cli/index.ts` (`imprint` bin).
3. MCP stdio server: `src/mcp/server.ts` (`imprint-mcp` bin), exposes `imprint_extract` / `imprint_compare` tools to AI agents.

Data flow: Playwright (playwright-core) loads the target site -> `style-extractor.ts` pulls computed styles from the DOM -> `color-cluster.ts` clusters colors -> `token-builder.ts` builds design tokens -> deterministic design context -> `export` generates CSS/Tailwind/JSON/MD. In the app, results are stored in SQLite (better-sqlite3, `<userData>/copy-design.db`, schema created in `src/main/database.ts`). Imprint has no built-in model-provider or Agent CLI runtime; external coding agents consume its exported artifacts through files, CLI, or MCP.

Desktop window, tray, single-instance, and platform lifecycle logic lives in `src/main/index.ts`.

### Product design

`DESIGN.md` is the source of truth for Imprint's own product design, brand, themes, interaction rules, and desktop shell. Read it before renderer visual work and keep it synchronized with material UI changes. Built-in themes are complete systems grouped as foundation, narrative, or experimental; validation scenarios are theme test surfaces, not bundled website templates.

### Shared analyzer code — read before editing

The analyzer and export implementations have a single source of truth:

- `src/core/analyzer/` + `src/core/export/` — shared by Desktop, CLI, and MCP. They must stay free of `electron` imports so CLI and MCP can run outside Electron.
- `src/main/analyzer/index.ts` — the Electron-only adapter that injects `app.getPath('userData')`.

Extraction and export changes belong in `src/core`; do not create a second desktop copy.

### Browser requirement

`playwright-core` does not bundle a browser. Both analyzers call `findBrowser()` to locate an installed Chrome/Edge and throw if none exists — analysis cannot run without Chrome or Edge on the machine.

## Conventions

- Formatting is enforced: no semicolons, single quotes, printWidth 120 (Prettier). Import order is auto-sorted by `@trivago/prettier-plugin-sort-imports` — don't hand-tune import ordering.
- Relative imports in `.ts` files use `.js` extensions (e.g. `from './database.js'`) — required for the compiled CLI output.
- ESLint: unused imports are errors; intentionally unused vars/args must be prefixed with `_`.
- Write source comments, JSDoc, internal documentation, and developer-facing explanations in English by default.
- Never hard-code language-specific user-facing copy in implementation files. This applies to Renderer UI, CLI/MCP
  messages, generated exports, and analyzer guidance. Add English and translated text to the applicable i18n catalog,
  then reference message keys from code. Do not implement localization with language ternaries.
- Renderer UI strings go through i18next — add keys to BOTH `src/renderer/i18n/locales/en.json` and `zh-CN.json`.
- Renderer font sizes must resolve to even pixel values (12px, 14px, 16px …): use the `text-xs/sm/base` scale or even
  `text-[Npx]` — never odd px (`text-[11px]`) or fractional rem that lands on odd pixels (`0.9375rem` = 15px). Odd
  sizes render CJK text blurry on Windows. This also applies to theme typography tokens in `skin-store.ts`.
- Export actions must name the artifact they create. Recommend `DESIGN.md` + the current screenshot/source for AI UI
  revisions; CSS/Tailwind are implementation outputs, and Tokens JSON is structured tool input. The saved export-format
  preference applies only to Theme Library cards.
- Commits: Conventional Commits enforced by commitlint (husky `commit-msg` hook + PR CI); write commit messages in English. Pre-commit runs lint-staged (eslint --fix + prettier). PR CI will auto-commit lint/format fixes to your branch.
