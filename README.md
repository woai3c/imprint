<div align="center">
  <img src="./assets/brand/imprint-mark.svg" alt="Imprint" width="96" />

  <h1>Imprint</h1>

  <p><strong>Turn websites into deterministic, AI-ready design context.</strong></p>

  <p>
    Extract colors, typography, spacing, radii, shadows, and component styles,
    then export them as DESIGN.md, CSS Variables, Tailwind CSS themes, JSON Design Tokens, and traceable Design Evidence.
  </p>

  <p>
    <a href="./README.zh-CN.md">简体中文</a>
    ·
    <a href="https://github.com/woai3c/imprint/releases/latest">Download</a>
    ·
    <a href="#features">Features</a>
    ·
    <a href="#development">Development</a>
  </p>
</div>

## What is Imprint?

Imprint is an open-source desktop application that transforms websites into reusable design systems.

It analyzes visual rules such as colors, typography, spacing, border radii, shadows, layout patterns, and component styles, then generates structured outputs that can be used directly by AI coding agents and frontend projects.

AI is a downstream consumer, not an extraction dependency. Core analysis, claims, and exports are deterministic and
require no model provider, API key, or local agent runtime.

Imprint accepts website URLs as analysis input; it does not analyze standalone screenshot files. A screenshot contains
only one rendered pixel state and cannot reliably reveal the DOM hierarchy, computed styles, responsive rules, or
interaction states. The screenshots shown and exported by Imprint are captured from the loaded website as traceable
evidence for the URL-based analysis.

Instead of asking AI to invent another generic interface, give it a real design system to follow.

```text
Website URL
        ↓
      Imprint
        ↓
   Design System
        ↓
Claude Code / Codex / Other AI Agents
        ↓
Consistent, production-ready interfaces
```

## Why Imprint?

AI coding tools can generate interfaces quickly, but they often produce generic and inconsistent visual styles.

Prompts alone are not enough to describe a complete design language. Imprint extracts that language from real websites
and converts it into structured specifications that AI agents can follow.

## Features

| Feature                  | Description                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Website analysis         | Analyze visual styles directly from a URL                                                       |
| Diverse page discovery   | Combine navigation links and sitemaps, then sample representative same-site routes              |
| Traceable evidence       | Record page topology, section geometry, component instances, viewport coverage, and limitations |
| Token confidence         | Preserve per-token provenance, source-page coverage, and deterministic confidence               |
| Screenshot evidence      | Capture analyzed pages and viewports as traceable visual evidence                               |
| Design system generation | Generate colors, typography, spacing, radii, shadows, and component guidance                    |
| AI-ready documentation   | Export Google DESIGN.md alpha with traceable Imprint extensions                                 |
| Code export              | Export CSS Variables, Tailwind CSS v4 themes, and JSON Design Tokens                            |
| Agent integration        | Use exported artifacts or MCP with external coding agents                                       |
| Local-first storage      | Store project data locally with SQLite                                                          |
| Saved website themes     | Save analysis snapshots and preview their tokens inside scoped, fixed validation scenarios      |
| Built-in themes          | Chinese ink painting, cyberpunk, Nordic minimalism, glassmorphism, and more                     |
| Validation scenarios     | Test theme hierarchy, density, and legibility across workflows and interaction states           |

## Use with AI Coding Agents

1. Analyze a website URL with Imprint.
2. Export the generated `DESIGN.md`.
3. Copy `DESIGN.md` into your project.
4. Give your AI coding agent the following instruction:

> Read DESIGN.md and use it as the visual source of truth for all UI implementation. Preserve the existing product requirements and do not copy copyrighted text or branding from the source website.

### Which format should I export?

| Goal                                                   | Recommended output       | Include with it                      |
| ------------------------------------------------------ | ------------------------ | ------------------------------------ |
| Ask AI to revise an existing UI                        | **DESIGN.md**            | Current UI screenshot or source code |
| Implement directly in a CSS project                    | **CSS Variables**        | The existing style entry file        |
| Implement directly in a Tailwind v4 project            | **Tailwind `@theme`**    | The project's theme stylesheet       |
| Use a toolchain or an agent that needs structured data | **Tokens JSON**          | A precise automation task            |
| Audit how the source pages were observed               | **Design Evidence JSON** | The related screenshots              |

If you give AI only one exported file, choose **DESIGN.md**.

Imprint's generated `DESIGN.md` follows the [Google Labs DESIGN.md alpha specification](https://github.com/google-labs-code/design.md): a typed document model is rendered into the normative YAML groups and canonical section order. The summarized `x-imprint` extension keeps source, coverage, analysis summaries, responsive metadata, and token groups not covered by the alpha schema; complete token provenance remains in Tokens JSON and `design-evidence.json`.

## Deterministic design context

Every analysis produces deterministic `DesignEvidence`: multi-viewport screenshots, page topology, normalized section
and component geometry, responsive differences, safe interaction observations, media layers, coverage, and limitations.
Program-owned rules turn that evidence into a stable, traceable Design Profile, Reconstruction Brief, validation recipe,
and exports. Identical captured evidence produces identical context.

Imprint has no built-in model provider, API-key settings, or Agent CLI execution path. External coding agents can consume
the completed artifacts through files or MCP, but they never participate in extraction or change source facts.

## CLI and MCP

```bash
pnpm build:cli
imprint doctor
imprint doctor --browser-path "/path/to/chrome" --json
imprint extract https://example.com --viewport all --format evidence
imprint extract https://example.com --pages 5 --discovery auto --format json
imprint extract https://example.com --viewport all --format profile
imprint extract https://example.com --format reconstruction
```

`imprint doctor` verifies Node.js, the operating system, browser executable access, and an actual headless launch without
navigating to a website. `--browser-path` selects an explicit Chrome, Edge, or Chromium executable for both diagnostics
and extraction; an invalid explicit path fails instead of silently falling back. The CLI uses stable exit codes: `0`
success, `2` invalid command/options, `3` missing or unusable runtime dependency, `4` capture/export failure, and `130`
SIGINT cancellation. Doctor reports schema `1` JSON with `--json`; it diagnoses the environment but does not install a
browser.

The MCP server exposes deterministic `imprint_extract` and `imprint_compare` tools. It requires no provider credentials.
`imprint_compare` accepts either two URLs or two previously exported Design Profiles and supports token or deterministic
language-depth comparison. Its stdio transport writes one newline-delimited JSON-RPC message per stdout line, keeps logs
on stderr, and supports legacy lifecycle negotiation through protocol version `2025-11-25`. The compiled server is
covered by an official `@modelcontextprotocol/sdk` client contract test.

## Download

Download the latest version from [GitHub Releases](https://github.com/woai3c/imprint/releases/latest).

| Platform | Architecture          |
| -------- | --------------------- |
| Windows  | x64                   |
| macOS    | Apple Silicon (arm64) |
| macOS    | Intel (x64)           |

## Tech Stack

| Layer                | Technology                   |
| -------------------- | ---------------------------- |
| Desktop Framework    | Electron + Electron Forge    |
| Frontend             | React 19 + TypeScript + Vite |
| UI                   | Tailwind CSS v4              |
| State Management     | Zustand                      |
| Storage              | SQLite (better-sqlite3)      |
| Web Analysis         | Playwright                   |
| Internationalization | i18next + react-i18next      |

## Development

```bash
# Install dependencies
pnpm install

# Start development mode
pnpm dev

# Package the app
pnpm build

# Build distributable (zip on Windows, DMG on macOS)
pnpm make

# Run deterministic E2E tests
pnpm test:e2e
```

## Release

For build signing, notarization, GitHub Actions configuration, and release procedures, see:

- [Desktop App Build, Signing, and Release Guide (Chinese)](./DEPLOYMENT.zh-CN.md)

## Project Structure

```
src/
├── main/                # Electron main process
│   ├── analyzer/        # Web analysis engine (Electron wrapper)
│   ├── export.ts        # Design system export
│   ├── database.ts      # SQLite database
│
├── core/                # Shared extraction engine (CLI + MCP + Desktop)
│   ├── analyzer/        # Style extraction, color clustering, token building
│   ├── design-evidence/ # Stable observed evidence and coverage
│   ├── design-context/  # Validated profiles, briefs, context, validation
│   └── export/          # CSS / Tailwind / JSON / Markdown / SCSS generators
│
├── cli/                 # CLI entry point (imprint bin)
├── mcp/                 # MCP stdio server (imprint-mcp bin)
│
└── renderer/            # React frontend
    ├── components/
    ├── pages/
    ├── stores/
    └── i18n/
```

## License

MIT
