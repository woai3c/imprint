# copy-design

[中文文档](README.md)

`copy-design` is an agent-neutral skill that analyzes the observable UI design language of reference websites or screenshots. It turns colors, typography, spacing, radii, shadows, layouts, components, responsive behavior, and safe interaction states into actionable project design guidelines.

Generated guidelines are written to the project root:

| Existing files | Target |
| --- | --- |
| `AGENTS.md` only | Update `AGENTS.md` |
| `CLAUDE.md` only | Update `CLAUDE.md` |
| Both files | Update both with identical managed blocks |
| Neither file | Update or create `DESIGN.md` |

The skill transfers design language—not source code, business logic, page copy, logos, brand photography, or restricted font files.

## What it extracts

- Theme, background, surface, text, border, and state colors
- Font families, sizes, weights, line heights, and letter spacing
- Page and component spacing, radii, borders, and shadows
- Maximum widths, grids, sidebars, navigation, and content density
- Repeated patterns for buttons, inputs, cards, navigation, and other components
- Responsive changes across desktop, tablet, and mobile
- Hover, focus, and motion evidence
- Direct observations, inferences, confidence, and evidence gaps
- Explicit user overrides from later refinement

When the same profile is analyzed again, the skill updates its managed block, preserves explicit user overrides, and leaves unrelated manual content untouched.

## Requirements

Complete website capture requires:

- Node.js 20+
- Chrome, Edge, or Chromium

The scripts use CommonJS `.js`, Node.js built-ins, and the browser's native DevTools pipe. No npm dependency is required, and the skill never installs runtimes or browsers automatically.

Screenshot-only analysis can use the agent's native image capabilities and does not require a local browser.

## Installation

### Install from GitHub (recommended)

`copy-design` follows the open [Agent Skills](https://agentskills.io) directory conventions and works with tools such as Codex, Claude Code, Cursor, Gemini CLI, and OpenCode. Use the cross-agent [Agent Skills CLI](https://github.com/vercel-labs/skills) to import the complete skill directly from GitHub and detect installed agents:

```powershell
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design
```

The command lets you choose the target agent and scope. Project scope is the default; add `--global` or `-g` to make the skill available across projects.

### Commands for common agents and agent CLIs

The following commands install the same agent-neutral skill globally and non-interactively. Only the target agent directory differs:

```powershell
# Codex
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent codex --yes

# Claude Code
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent claude-code --yes

# Cursor
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent cursor --yes

# Gemini CLI
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent gemini-cli --yes

# OpenCode
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent opencode --yes

# GitHub Copilot
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent github-copilot --yes

# Kimi Code CLI
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent kimi-code-cli --yes

# Qwen Code
npx skills add https://github.com/woai3c/copy-design-skill/tree/main/copy-design --global --agent qwen-code --yes
```

The installer fetches the complete `copy-design/` directory, including `SKILL.md`, scripts, references, and agent metadata.

If your tool is not listed above, omit `--agent` to let the installer detect it, or find its identifier in the [Agent Skills CLI supported-agent list](https://github.com/vercel-labs/skills#supported-agents).

### X-Code CLI

This repository includes an X-Code CLI plugin manifest, so X-Code can fetch and register the complete skill directly from GitHub:

```powershell
xc plugin install github:woai3c/copy-design-skill
```

Restart `xc` after installation, or refresh the current X-Code CLI session:

```text
/plugin refresh
```

You can also install and refresh without leaving the X-Code CLI session:

```text
/plugin install github:woai3c/copy-design-skill
/plugin refresh
```

`copy-design` includes scripts and references, so do not install this repository with X-Code CLI's `/skill install <url>` command; that command downloads only one `SKILL.md`. The plugin command clones the complete repository and registers its `copy-design` skill.

Update an installed copy:

```powershell
npx skills update copy-design
```

For an X-Code CLI plugin installation, use:

```powershell
xc plugin update copy-design@local
```

### Ask an agent to install it

Agents with GitHub skill installation support can receive this prompt directly:

```text
Install the copy-design skill from GitHub:
https://github.com/woai3c/copy-design-skill/tree/main/copy-design

Use this agent's supported skill installer and install it at user scope.
Install the complete directory, including SKILL.md, scripts, references, and agents.
Confirm the installed path when finished.
```

In Codex, you can explicitly invoke `$skill-installer` and ask it to install the GitHub subdirectory above. Other supported agents can use the matching `npx skills add ... --agent <id>` command above; X-Code CLI uses its own `xc plugin install ...` command.

Skills can execute local scripts. Verify the repository source and review its contents before installing any third-party skill.

### Manual or offline fallback

Copy or link the complete `copy-design/` directory into the agent's skills directory only when GitHub import is unavailable. Do not copy only `SKILL.md`; the scripts and references are part of the skill.

## Usage

### Analyze a website

```text
Use copy-design to analyze the UI design of https://example.com.
Focus on the home and pricing pages and cover desktop, tablet, and mobile.
Do not copy logos, page copy, or brand photography.
Save the design guidelines to the current project.
```

### Analyze multiple routes

```text
Use copy-design on:
- https://example.com/
- https://example.com/pricing
- https://example.com/login

Extract color, typography, spacing, layout, card, button, form,
and responsive rules.
```

### Analyze screenshots

```text
Use copy-design on the supplied desktop and mobile screenshots.
Mark uncertain numeric values as estimates and do not invent CSS variables
or interaction states that are not visible.
```

### Refine the result

After the first result, continue with feedback such as:

```text
That blue is link-only, not the primary color.
Treat the pricing-page button as the authoritative primary action.
Keep the layout, but change the project default radius to 8px.
```

These adjustments are stored under `User overrides` and preserved during later analysis.

## See the result

### Option 1: run the local visual demo

From the repository root:

```powershell
node tests/integration_capture.js --keep
```

The script starts a local fixture site, captures two pages at three viewports, and prints a temporary output directory. It retains:

- `screenshots/`: six page screenshots
- `capture.json`: raw browser evidence
- `style-facts.json`: extracted design facts
- `section-node.md`: the generated design-guideline block
- `AGENTS.md`: a final merged example

Inspect `screenshots/` first, then open `AGENTS.md` to see how the UI was translated into project design rules.

Without `--keep`, the same regression test cleans its temporary files when complete:

```powershell
node tests/integration_capture.js
```

### Option 2: test a real website in a temporary project

Create an empty project so the test does not modify this repository's documentation:

```powershell
New-Item -ItemType Directory copy-design-demo
Set-Location copy-design-demo
git init
```

Then ask an agent with the skill installed:

```text
Use copy-design to analyze <website URL>.
Cover desktop, tablet, and mobile and write the result to this project.
When finished, report the captured pages and states and identify
any low-confidence conclusions.
```

A successful run normally creates `DESIGN.md`. Continue by correcting color roles, radii, component priorities, or route authority, then confirm that `User overrides` survives another analysis.

### Run all automated tests

```powershell
node tests/test_managed_section.js
node tests/test_render_section.js
node tests/integration_capture.js
```

## Manual script workflow

Agents should normally orchestrate the workflow from `SKILL.md`. For diagnostics:

```powershell
node <skill-dir>/scripts/capture_site.js `
  --url https://example.com `
  --output <temporary-evidence-dir>

node <skill-dir>/scripts/extract_style_facts.js `
  --input <temporary-evidence-dir>/capture.json `
  --output <temporary-evidence-dir>/style-facts.json

node <skill-dir>/scripts/render_design_section.js `
  --input <temporary-evidence-dir>/style-facts.json `
  --output <temporary-evidence-dir>/design-section.md `
  --profile example-light `
  --language en

node <skill-dir>/scripts/verify_managed_section.js inspect `
  --file <temporary-evidence-dir>/design-section.md
```

Add `--allow-private` explicitly for local development URLs. Keep raw screenshots and evidence in a temporary directory rather than committing them to the analyzed project.
