# Imprint (印象)

An open-source desktop app that extracts UI design styles from any website URL and exports them as CSS/Tailwind theme files for AI consumption.

[中文文档](./README.md)

## Features

- **One-click extraction** — Enter a URL to automatically extract colors, fonts, spacing, shadows, border-radius, and more
- **Code-first** — Style extraction is done entirely by code (zero token cost); LLMs only assist with semantic naming
- **Multi-format export** — CSS custom properties, Tailwind v4 `@theme`, Markdown design doc, JSON design tokens (DTCG)
- **Live theming** — Apply extracted styles to the app itself for instant preview
- **Template demo** — Dashboard, landing page, e-commerce, blog templates rendered with your extracted theme
- **Built-in themes** — Chinese landscape, cyberpunk, Nordic minimal, glassmorphism, dark mode, and more
- **Local storage** — All data stored locally in SQLite, no login required, exportable for sharing
- **AI-friendly** — Exports are designed for AI to directly generate or modify UI
- **i18n** — Supports Chinese and English interface

## Tech Stack

| Layer    | Technology                                          |
| -------- | --------------------------------------------------- |
| Desktop  | Electron 34 + Electron Forge                        |
| Frontend | React 19, TypeScript, Vite                          |
| UI       | Tailwind CSS v4                                     |
| State    | Zustand v5                                          |
| Database | SQLite (better-sqlite3)                             |
| Analysis | Playwright (playwright-core)                        |
| i18n     | i18next + react-i18next                             |
| AI       | API Key or local Agent CLI (x-code-cli, kimi, etc.) |

## Development

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Package
pnpm build

# Create installer
pnpm make
```

## AI Configuration

Two options (pick one):

1. **API Key** — Configure an LLM provider's API Key in Settings (DeepSeek, Claude, GPT, Kimi, etc.)
2. **Local Agent CLI** — Auto-detects installed AI Agent CLIs (x-code-cli, claude, codex, opencode, gemini, kimi)

## Directory Structure

```
src/
├── main/                   # Electron main process
│   ├── index.ts            # Entry, creates window
│   ├── preload.ts          # Preload script, exposes API
│   ├── database.ts         # SQLite database
│   ├── ipc.ts              # IPC handlers
│   ├── settings.ts         # App settings persistence
│   ├── export.ts           # CSS/Tailwind/JSON/MD generation
│   ├── agent-detect.ts     # Detect local AI Agent CLIs
│   └── analyzer/           # Web analysis engine
│       ├── index.ts        # Analysis orchestration
│       ├── style-extractor.ts  # DOM style extraction
│       ├── color-cluster.ts    # Color clustering algorithm
│       └── token-builder.ts    # Design token builder
└── renderer/               # React frontend
    ├── App.tsx             # Router entry
    ├── main.tsx            # Render entry
    ├── i18n/               # Internationalization
    ├── components/         # Components
    ├── pages/              # Pages
    ├── stores/             # Zustand stores
    └── styles/             # Global styles
```

## License

MIT
