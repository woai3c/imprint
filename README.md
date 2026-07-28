<div align="center">
  <img src="./assets/brand/imprint-mark.svg" alt="Imprint" width="96" />

  <h1>Imprint</h1>

  <p><strong>Turn websites and screenshots into AI-ready design systems.</strong></p>

  <p>
    Extract colors, typography, spacing, radii, shadows, and component styles,
    then export them as DESIGN.md, CSS Variables, Tailwind CSS themes, and JSON Design Tokens.
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

Imprint is an open-source desktop application that transforms websites and UI screenshots into reusable design systems.

It analyzes visual rules such as colors, typography, spacing, border radii, shadows, layout patterns, and component styles, then generates structured outputs that can be used directly by AI coding agents and frontend projects.

Instead of asking AI to invent another generic interface, give it a real design system to follow.

```text
Website or Screenshot
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

Prompts alone are not enough to describe a complete design language. Imprint extracts that language from real websites and screenshots and converts it into structured specifications that AI agents can follow.

## Features

| Feature                  | Description                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Website analysis         | Analyze visual styles directly from a URL                                             |
| Screenshot analysis      | Extract design patterns from UI screenshots                                           |
| Design system generation | Generate colors, typography, spacing, radii, shadows, and component guidance          |
| AI-ready documentation   | Export DESIGN.md for AI coding agents                                                 |
| Code export              | Export CSS Variables, Tailwind CSS v4 themes, and JSON Design Tokens                  |
| Local AI agents          | Work with Claude Code, Codex, Kimi, Gemini CLI, OpenCode, and x-code-cli              |
| Local-first storage      | Store project data locally with SQLite                                                |
| Live theme preview       | Apply extracted styles to Imprint and inspect the result                              |
| Built-in themes          | Chinese ink painting, cyberpunk, Nordic minimalism, glassmorphism, and more           |
| Validation scenarios     | Test theme hierarchy, density, and legibility across workflows and interaction states |

## Use with AI Coding Agents

1. Analyze a website or screenshot with Imprint.
2. Export the generated `DESIGN.md`.
3. Copy `DESIGN.md` into your project.
4. Give your AI coding agent the following instruction:

> Read DESIGN.md and use it as the visual source of truth for all UI implementation. Preserve the existing product requirements and do not copy copyrighted text or branding from the source website.

### Which format should I export?

| Goal                                                   | Recommended output    | Include with it                      |
| ------------------------------------------------------ | --------------------- | ------------------------------------ |
| Ask AI to revise an existing UI                        | **DESIGN.md**         | Current UI screenshot or source code |
| Implement directly in a CSS project                    | **CSS Variables**     | The existing style entry file        |
| Implement directly in a Tailwind v4 project            | **Tailwind `@theme`** | The project's theme stylesheet       |
| Use a toolchain or an agent that needs structured data | **Tokens JSON**       | A precise automation task            |

If you give AI only one exported file, choose **DESIGN.md**.

## Download

Download the latest version from [GitHub Releases](https://github.com/woai3c/imprint/releases/latest).

| Platform | Architecture          |
| -------- | --------------------- |
| Windows  | x64                   |
| macOS    | Apple Silicon (arm64) |
| macOS    | Intel (x64)           |

## Tech Stack

| Layer                | Technology                                             |
| -------------------- | ------------------------------------------------------ |
| Desktop Framework    | Electron + Electron Forge                              |
| Frontend             | React 19 + TypeScript + Vite                           |
| UI                   | Tailwind CSS v4                                        |
| State Management     | Zustand                                                |
| Storage              | SQLite (better-sqlite3)                                |
| Web Analysis         | Playwright                                             |
| Internationalization | i18next + react-i18next                                |
| AI                   | OpenAI / Claude / DeepSeek / Kimi API, Local Agent CLI |

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

# Run E2E tests (no LLM required)
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
│   └── agent-detect.ts  # AI agent detection
│
├── core/                # Shared extraction engine (CLI + MCP + Desktop)
│   ├── analyzer/        # Style extraction, color clustering, token building
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
