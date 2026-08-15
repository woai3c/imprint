<div align="center">
  <img src="./assets/brand/imprint-mark.svg" alt="Imprint" width="96" />

  <h1>Imprint</h1>

  <p><strong>Turn websites and screenshots into deterministic, AI-ready design context.</strong></p>

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

Imprint is an open-source desktop application that transforms websites and UI screenshots into reusable design systems.

It analyzes visual rules such as colors, typography, spacing, border radii, shadows, layout patterns, and component styles, then generates structured outputs that can be used directly by AI coding agents and frontend projects.

AI is a downstream consumer, not an extraction dependency. Core analysis, claims, and exports remain deterministic and
work without a model provider. Optional AI should help apply that evidence to a target project; it must never author or
change observed source facts.

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

| Feature                  | Description                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Website analysis         | Analyze visual styles directly from a URL                                                       |
| Diverse page discovery   | Combine navigation links and sitemaps, then sample representative same-site routes              |
| Traceable evidence       | Record page topology, section geometry, component instances, viewport coverage, and limitations |
| Token confidence         | Preserve per-token provenance, source-page coverage, and deterministic confidence               |
| Screenshot analysis      | Extract design patterns from UI screenshots                                                     |
| Design system generation | Generate colors, typography, spacing, radii, shadows, and component guidance                    |
| AI-ready documentation   | Export Google DESIGN.md alpha with traceable Imprint extensions                                 |
| Code export              | Export CSS Variables, Tailwind CSS v4 themes, and JSON Design Tokens                            |
| Local AI agents          | Work with Claude Code, Codex, Kimi, Gemini CLI, OpenCode, and x-code-cli                        |
| Local-first storage      | Store project data locally with SQLite                                                          |
| Saved website themes     | Save analysis snapshots and preview their tokens inside scoped, fixed validation scenarios      |
| Built-in themes          | Chinese ink painting, cyberpunk, Nordic minimalism, glassmorphism, and more                     |
| Validation scenarios     | Test theme hierarchy, density, and legibility across workflows and interaction states           |

## Use with AI Coding Agents

1. Analyze a website or screenshot with Imprint.
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

## Deterministic design context and optional AI

Every analysis produces deterministic `DesignEvidence`: multi-viewport screenshots, page topology, normalized section
and component geometry, responsive differences, safe interaction observations, media layers, coverage, and limitations.
Program-owned claims turn that evidence into a stable, traceable design context. These results work without AI and are
stored separately from Tokens JSON.

Optional AI is reserved for proposals that benefit from target context, such as semantic aliases, human-readable design
intent, or adapting the extracted system to an existing project. AI proposals remain separate from source truth, cite
the deterministic claims and evidence they use, and never replace extracted token keys or change exported facts.

Screenshot input for an optional AI task is opt-in. It requires a vision-capable API model and explicit consent in
Settings, only uses a limited selection from anonymous public pages, and is never sent for signed-in analyses without
separate explicit consent. If an AI task fails, tokens, evidence, deterministic claims, screenshots, and implementation
exports remain unchanged.

## CLI and MCP intelligence

CLI extraction never calls an AI provider unless `--intelligence` is explicitly set. API keys are read from process
environment variables only — `IMPRINT_AI_API_KEY` (generic override, checked first) or the provider's standard
variable:

| Provider     | Environment variable                                 |
| ------------ | ---------------------------------------------------- |
| `openai`     | `OPENAI_API_KEY`                                     |
| `anthropic`  | `ANTHROPIC_API_KEY`                                  |
| `google`     | `GOOGLE_GENERATIVE_AI_API_KEY`                       |
| `deepseek`   | `DEEPSEEK_API_KEY`                                   |
| `moonshotai` | `MOONSHOT_API_KEY`                                   |
| `alibaba`    | `ALIBABA_API_KEY`                                    |
| `zhipu`      | `ZHIPU_API_KEY`                                      |
| `xai`        | `XAI_API_KEY`                                        |
| `custom`     | `IMPRINT_AI_API_KEY` (with `--base-url` / `baseUrl`) |

```bash
pnpm build:cli
export DEEPSEEK_API_KEY=sk-...            # PowerShell: $env:DEEPSEEK_API_KEY='sk-...'
imprint extract https://example.com --viewport all --format evidence
imprint extract https://example.com --pages 5 --discovery auto --format json
imprint extract https://example.com --viewport all --intelligence structural --provider deepseek --format profile
imprint extract https://example.com --intelligence structural --provider deepseek --format reconstruction
imprint extract https://example.com --intelligence vision --provider openai --allow-screenshots
```

The MCP server keeps `imprint_extract` deterministic. Use `imprint_interpret` for an explicit provider call, or set
`depth: "language"` on `imprint_compare` to compare two validated structural profiles. Set `includeBrief: true` on
`imprint_interpret` only when the complete eligible Reconstruction Brief is needed; it is omitted by default. Pass the
API key through your MCP client's server configuration, for example:

```json
{
  "mcpServers": {
    "imprint": {
      "command": "imprint-mcp",
      "env": { "DEEPSEEK_API_KEY": "sk-..." }
    }
  }
}
```

AI keys configured here are independent of the desktop app's Settings — each entry point reads only its own source.

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
│   ├── design-evidence/ # Stable observed evidence and coverage
│   ├── design-intelligence/ # Validated profiles, briefs, context, validation
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
