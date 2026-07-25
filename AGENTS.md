# AGENTS.md

This file is loaded into the agent's context at the start of every session. Keep it concise — the agent reads it every turn.

## Project

Imprint — Electron desktop app + standalone CLI + MCP server that extracts a website's design system (colors, typography, spacing...) from a URL and exports it as CSS variables / Tailwind v4 `@theme` / JSON tokens / Markdown docs. Package manager is pnpm (pinned); Node >= 20.19 required.

## Commands

- `pnpm dev` — run the Electron app (electron-forge + Vite)
- `pnpm build` — package the desktop app (NOT the CLI)
- `pnpm build:cli` — compile `src/cli`, `src/core`, `src/mcp` to `dist/` via `tsconfig.cli.json`; required before running the `imprint` / `imprint-mcp` bin entries
- `pnpm ci` — typecheck + lint + build, the full local check
- There is no test runner configured — don't look for or invent test commands.

## Architecture

Three entry points share the extraction engine:

1. Desktop app: `src/renderer` (React 19 + Zustand + Tailwind v4) talks to `src/main` only through `window.electronAPI`, defined in `src/main/preload.ts`; handlers live in `src/main/ipc.ts`. New app features = preload method + IPC handler + renderer call, three places.
2. CLI: `src/cli/index.ts` (`imprint` bin).
3. MCP stdio server: `src/mcp/server.ts` (`imprint-mcp` bin), exposes `imprint_extract` / `imprint_compare` tools to AI agents.

Data flow: Playwright (playwright-core) loads the target site -> `style-extractor.ts` pulls computed styles from the DOM -> `color-cluster.ts` clusters colors -> `token-builder.ts` builds design tokens -> `export` generates CSS/Tailwind/JSON/MD. In the app, results are stored in SQLite (better-sqlite3, `<userData>/copy-design.db`, schema created in `src/main/database.ts`); LLM is only used for semantic token naming (`llm-enhancer.ts`), never for extraction.

### Duplicated analyzer code — read before editing

The analyzer/export logic exists TWICE and the copies must be kept in sync manually:

- `src/core/analyzer/` + `src/core/export/` — used by CLI and MCP. Must stay free of `electron` imports (runs outside Electron). User-facing strings in English. Has extra modules (`design-compare.ts`, `component-detect.ts`, `responsive-motion.ts`).
- `src/main/analyzer/` + `src/main/export.ts` — used by the desktop app. Depends on `electron` (app paths); user-facing strings in Chinese.

Most files are byte-identical between the two; only `analyzer/index.ts` diverges (electron usage + language). When you fix or change extraction logic, mirror it in both copies.

### Browser requirement

`playwright-core` does not bundle a browser. Both analyzers call `findBrowser()` to locate an installed Chrome/Edge and throw if none exists — analysis cannot run without Chrome or Edge on the machine.

## Conventions

- Formatting is enforced: no semicolons, single quotes, printWidth 120 (Prettier). Import order is auto-sorted by `@trivago/prettier-plugin-sort-imports` — don't hand-tune import ordering.
- Relative imports in `.ts` files use `.js` extensions (e.g. `from './database.js'`) — required for the compiled CLI output.
- ESLint: unused imports are errors; intentionally unused vars/args must be prefixed with `_`.
- Renderer UI strings go through i18next — add keys to BOTH `src/renderer/i18n/locales/en.json` and `zh-CN.json`.
- Commits: Conventional Commits enforced by commitlint (husky `commit-msg` hook + PR CI); write commit messages in English. Pre-commit runs lint-staged (eslint --fix + prettier). PR CI will auto-commit lint/format fixes to your branch.
