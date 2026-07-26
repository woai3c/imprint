<div align="center">
  <img src="./assets/brand/imprint-mark.svg" alt="Imprint · 印记" width="96" />
  <h1 align="center">Imprint</h1>
  <p align="center">English / <a href="./README.md">简体中文</a></p>
  <p align="center">Extract visual languages from websites and screenshots, and generate reusable design systems.</p>
</div>

Imprint is an open-source desktop application that analyzes websites and UI screenshots, extracts their visual rules (colors, typography, spacing, shadows, radii, component styles, etc.), and converts them into AI-friendly design specifications and code variables.

Make AI Coding more consistent by allowing AI agents to build interfaces based on real-world design systems instead of generating random UI styles.

## Why Imprint?

AI Coding makes building interfaces much easier, but maintaining a consistent product design style is still challenging.

Traditional workflow:

```
Designer
↓
Figma Design
↓
Development
```

AI era workflow:

```
Website / UI Screenshot
↓
Imprint
↓
Design System
↓
AI Agent
↓
Consistent Product UI
```

Imprint transforms real product visual languages into structured design systems that AI can understand and reuse.

## Features

### Design Language Extraction

- **Website Analysis** — Analyze visual styles from any URL
- **Screenshot Analysis** — Extract design patterns from UI screenshots
- **Design System Generation** — Extract colors, typography, spacing, shadows, radii and other design tokens
- **Visual Style Analysis** — Understand layouts, components and overall design language

### AI Coding Integration

- **AI-friendly Output** — Generate Markdown design specifications that can be used directly as AI context
- **Code Export** — Export CSS Variables, Tailwind CSS v4 `@theme`, and JSON Design Tokens
- **Agent Integration** — Works with local AI Agent CLIs such as Claude Code, Codex, Kimi and x-code-cli

### Product Experience

- **Live Theme Preview** — Apply extracted design systems to preview UI changes instantly
- **Validation Scenarios** — Test theme hierarchy, density, and legibility across workflows, content, and interaction states
- **Built-in Themes** — Includes premium styles such as Chinese ink painting, cyberpunk, Nordic minimalism, glassmorphism and dark themes

### Privacy & Local-first

- **Local Storage** — All data is stored locally with SQLite. No account required.
- **Internationalization** — Supports English and Chinese interfaces

## Workflow

```mermaid
graph TD
    A[Input website URL or screenshot] --> B[Analyze structure and visual styles]
    B --> C[Generate Design System]
    C --> D1[DESIGN.md]
    C --> D2[CSS Variables]
    C --> D3[Tailwind Theme]
    C --> D4[JSON Tokens]
    D1 --> E[Use with AI Coding or frontend development]
    D2 --> E
    D3 --> E
    D4 --> E
```

## Example Output

Imprint generates:

### Which format should I export?

| Goal                                                   | Recommended output    | Include with it                      |
| ------------------------------------------------------ | --------------------- | ------------------------------------ |
| Ask AI to revise an existing UI                        | **DESIGN.md**         | Current UI screenshot or source code |
| Implement directly in a CSS project                    | **CSS Variables**     | The existing style entry file        |
| Implement directly in a Tailwind v4 project            | **Tailwind `@theme`** | The project's theme stylesheet       |
| Use a toolchain or an agent that needs structured data | **Tokens JSON**       | A precise automation task            |

If you give AI only one exported file, choose **DESIGN.md**. CSS Variables and Tailwind are implementation artifacts, while Tokens JSON is machine-readable data; none of them replaces the existing UI screenshot or source code.

### DESIGN.md

Including:

- Visual style description
- Color system
- Typography rules
- Spacing system
- Border radius rules
- Shadow system
- Component guidelines

### CSS Variables

```css
:root {
  --color-primary: #2563eb;
  --radius-md: 8px;
  --spacing-lg: 24px;
}
```

### Tailwind CSS v4 Theme

```css
@theme {
  --color-primary: #2563eb;
  --radius-md: 8px;
}
```

## Tech Stack

| Layer                | Technology                                             |
| -------------------- | ------------------------------------------------------ |
| Desktop Framework    | Electron 34 + Electron Forge                           |
| Frontend             | React 19 + TypeScript + Vite                           |
| UI                   | Tailwind CSS v4                                        |
| State Management     | Zustand v5                                             |
| Storage              | SQLite (better-sqlite3)                                |
| Web Analysis         | Playwright                                             |
| Internationalization | i18next + react-i18next                                |
| AI                   | OpenAI / Claude / DeepSeek / Kimi API, Local Agent CLI |

## AI Configuration

Imprint supports two AI modes:

### 1. API Key

Configure AI providers:

- OpenAI
- Claude
- DeepSeek
- Kimi
- Other OpenAI-compatible APIs

### 2. Local Agent CLI

Automatically detects installed AI Agent tools:

- Claude Code
- Codex
- Kimi
- Gemini CLI
- OpenCode
- x-code-cli

## Development

```bash
pnpm install

pnpm dev

pnpm build

pnpm make

pnpm test:e2e
```

## Releasing

Run from a clean, up-to-date `main` branch:

```bash
pnpm release
```

The command selects a version, runs release checks, generates `CHANGELOG.md`, creates a release commit and annotated `vX.Y.Z` tag, and atomically pushes both to `origin` after confirmation. The tag triggers native GitHub Actions builds for Windows x64, macOS Apple Silicon, and macOS Intel.

Installers are built and published by [`.github/workflows/release.yml`](./.github/workflows/release.yml). Release-tag builds require macOS Developer ID/notarization credentials and a Windows PFX signing certificate, so missing credentials cannot silently produce an unsigned public release.

For the complete GitHub Actions, certificate, secret, release, and verification procedure, follow the [Chinese deployment guide](./DEPLOYMENT.zh-CN.md).

## Project Structure

```
src/
├── main/
│   ├── analyzer/
│   ├── export.ts
│   ├── database.ts
│   └── agent-detect.ts
│
└── renderer/
    ├── components/
    ├── pages/
    ├── stores/
    └── styles/
```

## License

MIT
