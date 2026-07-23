---
name: copy-design
description: Analyze a reference website or supplied screenshots, extract its observable UI design system (colors, typography, spacing, radii, borders, shadows, layout, components, responsive behavior, and safe interaction states), and save actionable design rules into the current project's root AGENTS.md, CLAUDE.md, or DESIGN.md. Use when a user asks to copy, reproduce, study, reverse-engineer, or transfer a website's visual style; generate project design guidelines from a URL; refine a previously extracted design profile; or update project agent instructions with reference-site UI details. Do not use to clone source code, copy protected brand assets, bypass access controls, or impersonate a service.
---

# Copy Design

Extract a reference site's observable design language, turn evidence into concise implementation rules, and maintain those rules as an idempotent managed block in the project root.

Treat this as an agent-neutral workflow. Use ordinary shell execution, file reads, image inspection, and controlled text patches available in the current agent. Do not require a vendor-specific tool name. The optional `agents/openai.yaml` file only supplies OpenAI-compatible UI metadata; it is not part of the core workflow and other agents may ignore it.

## Apply the workflow

1. Probe Node.js and select enhanced or visual-only mode.
2. Resolve scope and project root.
3. Select enhanced capture or visual-only analysis.
4. Collect representative pages, viewports, and safe states.
5. Extract facts before assigning semantic meaning.
6. Generate and review a bounded Markdown section.
7. Update every resolved target with an exact managed-block patch.
8. Verify markers, scope, privacy, and user overrides.
9. Report coverage, limitations, and target files.

Do not modify frontend code unless the user separately asks for implementation.

## Probe runtimes

Probe capabilities in this order:

1. Run `node --version` and require Node.js 20 or newer for bundled scripts.
2. Probe for local Chrome, Edge, or Chromium only when URL capture is requested.
3. Record the selected execution path in the final report.

Use Node.js as the only bundled script runtime:

| Available capability | Use |
| --- | --- |
| Node.js 20+ and a supported browser | Run the complete enhanced pipeline: capture, extraction, rendering, and verification. |
| Node.js 20+ without a supported browser | Use supplied screenshots or native agent browsing for evidence, then use the renderer and verifier when structured facts are available. |
| No compatible Node.js | Use native agent browsing/image/file capabilities and follow the references manually in visual-only mode. |

The `.js` scripts use CommonJS, Node.js built-ins, and Chrome's native DevTools pipe only. Do not install Node.js, npm packages, browser packages, or any other dependency automatically. If a compatible runtime is missing, degrade to the manual visual workflow and report the limitation.

## Resolve scope

Require at least one URL, local development URL, or supplied screenshot. Infer reasonable defaults instead of asking broad questions:

- Capture the entry page plus user-named routes.
- Use desktop `1440x900`, tablet `768x1024`, and mobile `390x844` unless the user specifies otherwise.
- Limit automatic discovery to representative same-origin pages.
- Treat light and dark themes as separate profiles.
- Derive the profile from the source host unless the user names it.

Use the Git root as the project root. If no Git root exists, use the user-specified project directory or current working directory.

Run target resolution before editing:

```text
node <skill-dir>/scripts/verify_managed_section.js resolve --root <project-root>
```

Follow the returned targets exactly:

- Update `AGENTS.md` when it alone exists.
- Update `CLAUDE.md` when it alone exists.
- Update both with identical blocks when both exist.
- Update or create `DESIGN.md` when neither exists.
- Honor an explicit root-level target named by the user.

If Node.js is unavailable, apply this target matrix directly.

## Choose a capture mode

### Enhanced mode

Use enhanced mode for accessible HTTP/HTTPS pages when local Chrome, Edge, or Chromium is available. Run:

```text
node <skill-dir>/scripts/capture_site.js \
  --url <url> \
  --output <temporary-evidence-dir>

node <skill-dir>/scripts/extract_style_facts.js \
  --input <temporary-evidence-dir>/capture.json \
  --output <temporary-evidence-dir>/style-facts.json
```

Pass each user-required route with another `--url`. Add `--allow-private` only for a local/private address explicitly placed in scope by the user. Do not silently install browser packages; use visual-only mode if no supported browser exists.

Inspect screenshots and `style-facts.json` together. Read [references/extraction-rules.md](references/extraction-rules.md) before promoting candidates to design rules. Read [references/evidence-schema.md](references/evidence-schema.md) when interpreting or repairing structured evidence.

### Visual-only mode

Use visual-only mode when the source is a screenshot, DOM access is unavailable, authentication cannot be safely reused, or automation is blocked.

Inspect every supplied image at original detail when exact spacing or typography matters. Infer only visible properties. Label numerical values as estimates, record missing breakpoints and states, and do not invent CSS variable names. Create the managed Markdown section directly from [references/output-template.md](references/output-template.md).

Never use image generation to reconstruct missing evidence.

## Keep capture safe

Read [references/safety-and-rights.md](references/safety-and-rights.md) before handling authenticated, private, or brand-heavy sources.

- Never submit forms, buy, delete, publish, upload, send messages, or trigger uncertain actions.
- Capture only base, hover, focus, expanded display-only, and other demonstrably non-mutating states.
- Never record cookies, authorization headers, storage values, passwords, form values, or sensitive URL queries.
- Do not bypass CAPTCHA, paywalls, bot protection, or access controls.
- Describe proprietary assets by role and visual traits; do not download or redistribute them by default.
- Keep raw screenshots and evidence in an OS temporary directory, not the project.

## Turn facts into rules

Separate three layers:

1. **Observed evidence**: computed styles, geometry, screenshots, media queries, and state differences.
2. **Design inference**: semantic roles, scales, component patterns, and responsive behavior.
3. **User overrides**: explicit preferences or corrections; these have the highest priority.

Promote a value to a global token only when it repeats across meaningful elements, pages, or viewports, or when a source CSS variable directly supports it. Keep one-off values local. State confidence and exceptions.

Prefer behavior statements such as "collapse the persistent sidebar into a drawer below the main breakpoint" over raw media-query dumps.

## Render a managed section

For enhanced evidence, generate a bounded first pass:

```text
node <skill-dir>/scripts/render_design_section.js \
  --input <temporary-evidence-dir>/style-facts.json \
  --output <temporary-evidence-dir>/design-section.md \
  --profile <profile> \
  --language <zh-CN-or-en> \
  --preserve-from <existing-target-if-any>
```

Use the project's primary language. Preserve user overrides from an existing block whenever updating the same profile.

Review the generated section before writing:

- Correct semantic roles using screenshot and component context.
- Remove noisy candidates and redundant component signatures.
- Keep direct evidence distinct from inference.
- Keep user overrides unchanged unless the user changes them.
- Keep the section below 30 KB and preferably within 12-20 KB.
- Do not insert raw DOM, full CSS, page copy, personal data, or asset URLs.

Validate the generated section:

```text
node <skill-dir>/scripts/verify_managed_section.js inspect \
  --file <temporary-evidence-dir>/design-section.md
```

## Merge without damaging project instructions

Use the managed markers exactly:

```md
<!-- copy-design:start id=<12-hex-id> schema=1 -->
...
<!-- copy-design:end id=<12-hex-id> -->
```

Generate a deterministic preview for each target:

```text
node <skill-dir>/scripts/verify_managed_section.js preview \
  --file <target> \
  --section <temporary-evidence-dir>/design-section.md \
  --output <temporary-evidence-dir>/<target-name>.preview.md
```

Inspect the preview, then apply the same change to the target with a controlled patch. Never replace an entire existing instruction file just to add the block.

If both `AGENTS.md` and `CLAUDE.md` are targets, prepare and validate both previews before editing either file. Keep their managed blocks identical. If either edit cannot be completed, do not leave a one-sided update.

Stop instead of guessing when markers are malformed, nested, mismatched, or duplicated.

After writing, run:

```text
node <skill-dir>/scripts/verify_managed_section.js inspect --file <target>
```

Compare the actual target with its preview. Ensure content outside the managed block is unchanged.

## Continue interactive refinement

Treat follow-up requests as one of two operations:

- **Evidence correction or expansion**: recapture only the affected route, viewport, theme, or state; regenerate the block; preserve user overrides.
- **User-directed adaptation**: update the localized `User overrides` subsection and the affected implementation rule without pretending the new preference came from the source site.

Examples of overrides include "use smaller radii," "copy the layout but not the brand colors," or "treat the pricing page as authoritative." Never let regeneration erase them.

For cross-session refinement, use the managed block as durable state. Keep structured evidence only when the user asks for a reusable profile; otherwise clean temporary evidence after successful verification.

## Report the outcome

Lead with:

- Files created or updated.
- Source, routes, viewports, mode, and safe states covered.
- Important user overrides preserved or added.
- Evidence gaps and lowered-confidence areas.
- Whether temporary evidence was cleaned or intentionally retained.

Do not claim pixel-perfect fidelity without implementation and visual-diff validation.
