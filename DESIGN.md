# Imprint Design System

Imprint is a design-system extraction tool. Its interface should make hidden design decisions visible without competing
with the material being analyzed. Themes may change the atmosphere, but they must preserve the same interaction model,
information hierarchy, and accessibility baseline.

This file is the source of truth for Imprint's own product interface. It is distinct from the `DESIGN.md` artifacts that
Imprint generates for analyzed websites.

## Product positioning

Imprint is a deterministic design-context and visual-validation tool for AI coding agents. Its core value is converting
what a browser actually rendered into stable, traceable evidence, claims, tokens, and implementation artifacts that an
agent can use without guessing. AI is only a downstream consumer of exported context, not a built-in runtime dependency
or an authority for source facts. The same captured evidence always produces the same claims, profile, reconstruction
brief, validation recipe, and exports. Coding and adaptation remain the responsibility of the user's external agent.

## Design values

### Truthful extraction

Show what the browser actually rendered. Extraction, claim construction, and core exports are deterministic and
evidence-based. External agents must not invent or modify source facts.

### Visible structure

Turn raw visual evidence into an understandable system. Reveal the relationship between source pages, computed styles,
clustered values, semantic tokens, and export formats through progressive disclosure.

### Portability

Every useful result should move cleanly between the desktop app, CLI, MCP server, CSS variables, Tailwind, JSON, and
Markdown. Prefer semantic, implementation-neutral concepts over app-specific decoration.

### Content first

The analyzed design system is the primary content. Theme atmosphere may provide context and emotional resonance, but it
must not obscure text, controls, screenshots, code, or color samples.

## Composition and interaction principles

These principles turn the product values into repeatable design decisions. They apply to the desktop app itself and to
every built-in theme; a theme may reinterpret their visual expression but may not break their interaction contract.

### Proximity (亲密性)

Place labels, controls, status, and help text beside the object they describe. Separate unrelated task groups with more
space than related items, and keep page-level actions with the page heading rather than scattering them through content.

### Contrast (对比)

Use contrast to express hierarchy and state, not decoration. Primary actions, selected items, errors, and focus must be
immediately distinguishable. Supporting text should be quieter but still comfortably readable; normal product metadata
must not fall below 12px, with 11px reserved for compact, non-essential preview annotations.

### Alignment (对齐)

Anchor page headings, control rows, cards, and result panels to a small set of shared edges. Prefer grid and baseline
relationships over arbitrary offsets. Every element should appear intentionally connected to the composition around it.

### Repetition (重复)

Repeat semantic patterns—page headers, primary and secondary actions, selected states, feedback, spacing, and icon
weight—so users can transfer learning across pages. Repetition concerns meaning and behavior as well as appearance.

### Directness (直截了当)

Let users act on the visible object whenever practical: clicking a theme card applies it, selecting a validation
scenario replaces the preview, and changing a setting updates that setting. Avoid proxy controls and unnecessary
confirmation steps for reversible actions.

### Stay in context (足不出户)

Keep the user in the current workspace while comparing, previewing, copying, and refining results. Use inline panels and
overlays for supporting information. Leave the app only when the task inherently targets an external website or file.

### Simplify interaction (简化交互)

Prefer one clear primary path, sensible defaults, and progressive disclosure. Do not ask users for information the app
can derive, and do not expose advanced configuration before it becomes relevant.

### Provide invitations (提供邀请)

Controls must reveal how they can be used. Use visible labels, familiar shapes, hover and focus states, `aria` labels,
and nearby context. Essential meaning must never depend on hover alone, and icon-only actions require accessible names.

### Meaningful transitions (巧用过渡)

Use brief transitions to explain changes of state or content continuity, not to decorate routine work. Standard content
transitions use the active theme's motion tokens and must respect `prefers-reduced-motion`.

### Immediate feedback (即时反应)

Acknowledge input immediately. Selection and setting changes should update in place; copy, save, import, export, and
delete actions need a visible status; long-running analysis needs continuous progress. Destructive actions require a
clear confirmation before execution.

### Interaction acceptance checks

- the interface acknowledges an action visually within 100ms, even if the operation continues asynchronously;
- every long-running operation exposes progress or a busy state and prevents accidental duplicate submission;
- website analysis exposes a compact, accessible stop action beside its progress without shifting the URL controls;
- every icon-only or color-only control has a visible or accessible name and an unambiguous selected state;
- success, failure, disabled, selected, hover, keyboard-focus, and reduced-motion states are verified;
- reversible actions happen directly; destructive or irreversible actions request confirmation;
- content changes preserve spatial context and do not introduce motion when reduced motion is requested.

## Brand identity

The official product names are **印记** in Chinese and **Imprint** in English. They are equivalent names, not a product
name and a tagline.

The logo turns the product workflow into one compact symbol:

- the ink frame represents observation and the visible structure of a rendered interface;
- the separated vermilion modules represent extraction and reconstruction into reusable design tokens;
- the open center keeps the analyzed website and its content primary;
- the red square in the English wordmark acts as an imprint signature.

The canonical brand colors are sampled from the selected ink-first logo:

- brand ink: `#1D2531`;
- brand vermilion: `#D83425`;
- brand paper: `#FAF7F2`;
- reverse ink: `#FAF7F2`.

Use the standalone mark for application icons, taskbars, favicons, and compact navigation. Use the localized horizontal
lockup when only one product language is appropriate. Use the bilingual lockup for repositories, presentations,
packaging, and other contexts shared by Chinese and international audiences. Do not place either product name inside the
desktop application icon.

On macOS, the menu bar uses a transparent monochrome template version of the standalone mark so the system can adapt it
to light, dark, and highlighted menu bar states. The paper tile belongs only to the application icon.

Brand vermilion is an identity accent, not the destructive-state token. In product UI, the ink color should carry the
main visual weight and vermilion should remain a restrained signature. On dark or highly saturated themes, reverse the
ink portion of the mark while preserving the vermilion modules.

Production assets and usage notes live in `assets/brand/` and `assets/icons/`.

## System layers

Imprint follows a derived-token architecture:

1. **Foundation tokens** express design intent: color, typography, type scale, spacing density, shape, elevation, icon
   weight, layout width, and motion.
2. **Derived CSS variables** expand foundation choices into usable scales such as radii, text sizes, line heights,
   shadows, focus rings, and transition timings.
3. **Semantic component styles** apply those variables to navigation, cards, inputs, buttons, tables, previews, and
   states.
4. **Art direction** adds theme-specific materials and composition without changing the semantic layers above it.

This is conceptually similar to a Seed → Map → Alias token lifecycle, but the values and component language are specific
to Imprint rather than an enterprise administration UI.

## Shared design patterns

- **Evidence before generated artifacts:** screenshots, extracted values, and program-owned claims precede separately
  requested examples or work performed by an external coding agent.
- **Progressive disclosure:** lead with summaries, then expose tokens, code, and documentation as users need them.
- **Stable hierarchy:** light, dark, and artistic themes keep the same information order and interaction locations.
- **Functional material:** transparency, texture, glow, and illustration establish layers; they never replace contrast.
- **Application-level dialogs:** modal dialogs and destructive confirmations render through a top-level portal, and their
  scrim covers the complete desktop window rather than the card or panel that opened them.
- **Semantic states:** primary, secondary, muted, accent, destructive, focus, disabled, and selected states retain the
  same meaning in every theme.
- **One hue family for interaction states:** hover, active, selected, and focus surfaces derive from the primary or
  neutral scale of the theme, never from a contrasting hue. A theme's signature contrast color belongs only in
  signature positions — the focus ring, the navigation selection indicator, or ambient art direction.
- **Reversible theming:** changing or importing a theme must not leave typography, spacing, radius, or motion values
  behind.

## Design Evidence and deterministic context

Terminology: observed evidence and program-owned claims are "design context" (zh "设计上下文"). Internal code
identifiers (DesignProfile, design-context) are never shown in the UI. User copy must use plain language that a
non-technical user understands; limitation codes never appear as labels, and unknown page or section roles are omitted
rather than labeled "unknown".
Secondary options (such as analysis depth) explain themselves through a small info affordance whose message appears on
hover and keyboard focus; primary options keep visible adjacent help text. Result tab labels never wrap — when space
runs out, the tab strip scrolls horizontally instead.

- Every completed analysis opens on **Overview**. It shows source coverage, page
  structure, detected sections, component instances, viewport evidence, observed states, and explicit limitations.
- Label deterministic browser and code results as **Observed** and program-owned summaries as **Deterministic**. Never
  present an inference as an observed fact.
- The browser-observed overview is a complete supported result, not an error or a setup advertisement. It states plainly
  that everything shown was directly observed by the browser, without displaying internal implementation labels.
- Keep Design Evidence JSON separate from Tokens JSON. The former carries source, topology, geometry, component,
  responsive, state, media, coverage, and limitation facts; the latter remains the portable token artifact.
- Legacy history records without Design Evidence retain their saved artifacts and show a concise compatibility notice
  instead of fabricated topology.
- Page structure is a compact ordered map, not a decorative site diagram. Use localized section roles and preserve the
  source URL and viewport beside every sequence.
- Limitations belong beside coverage. Each user-relevant limitation maps to one plain-language explanation; limitations
  that resolve to the same explanation are shown once. Internal diagnostics such as page-health details, extraction
  issue payloads, and per-candidate skip records remain in evidence or logs and never become duplicate generic UI rows.
- Deterministic claims are part of every core result. Identical captured evidence produces an identical Design Profile,
  reconstruction brief, validation recipe, and DESIGN.md claim body.
- Analysis status describes capture and evidence quality only. A usable deterministic analysis cannot become `partial`
  or `failed` because an unrelated external tool is unavailable.
- Imprint does not contain a model-provider, API-key, local-model, or Agent CLI execution path. The user's external coding
  agent consumes exported context and screenshots only after analysis has completed.
- Selecting a section, component, layout, or media reference opens the related screenshot and highlights its normalized
  evidence rectangle; evidence without a genuine screenshot region opens a compact evidence detail instead of a
  fabricated highlight.
- Responsive evidence compares adjacent viewport pairs (desktop to tablet, tablet to mobile) rather than only the
  widest capture against the rest, so three-viewport analyses describe each transition separately.
- The Overview groups the program-owned representative topology, observed highlights, composition, order and action
  evidence, visual language, transfer rules, and uncertainties. Profile JSON remains a separate versioned artifact.
- The app never asks users to compose generic prompts for an external agent. Deterministic reconstruction facts may be
  exported as a separate, one-click copyable and downloadable `RECONSTRUCTION.md`. Target-aware adaptation belongs to
  the user's external coding agent and requires both Imprint's artifacts and the target UI's source or screenshot.
- Validation scenarios use an allowlisted renderer. Report token-scale, rule-reference, state, contrast, overflow, and
  reduced-motion checks independently, including capture, rule-construction, or rendering failure layers; never collapse
  them into a single opaque quality score.

## Authenticated analysis

- Start URL analysis in an isolated visitor context. Do not read or copy the user's everyday Chrome profile.
- Ask for authentication only after strong page evidence indicates a redirect, response, form, or blocking sign-in
  surface. A normal sign-in link in public navigation is not enough.
- The authentication prompt keeps the user in context and offers three explicit outcomes: sign in with an isolated
  Imprint browser, analyze the currently visible visitor page, or cancel.
- Persist approved sessions in a local profile isolated to the target website. Reuse a valid saved session silently;
  open a visible browser only when the saved session is missing or expired.
- After sign-in verification, continue extraction in the same isolated browser session so cookies, redirects, and page
  state cannot be lost between verification and analysis. Imprint closes the managed browser when extraction finishes;
  cleanup must be time-bounded so a slow browser shutdown never stalls the result.
- The sign-in prompt remains reversible while the browser is open: the user may still analyze the currently visible
  visitor/sign-in page instead of completing sign-in.
- Expose saved website sessions from the Analysis page header with the concise label Website sign-ins. The manager,
  rather than the button, must explain without repetition why Imprint saves them, that signing in is optional and
  public/sign-in pages remain analyzable without it, and that only post-sign-in content is unavailable to visitors.
  List the website and last-used time, allow individual or complete removal with confirmation, and explain that removal
  signs Imprint out without affecting everyday Chrome.
- Visitor analysis remains a complete supported outcome. When a sign-in barrier was detected, label the result beside
  its source evidence and explain that the extracted system represents the sign-in page or prompt.
- Analysis failures are durable inline states, not transient progress messages. Keep the submitted URL and any previous
  successful result visible, show the failing stage and actual error, and offer explicit retry and dismiss actions.
- Never log cookies, credentials, or storage values. Authentication state stays local and is not part of exported
  design artifacts.

## Multi-page analysis evidence

- Place a compact, clearly labeled Pages to analyze control below the URL-and-action row. Let its help text use the full
  width beneath both the URL field and Analyze button instead of wrapping at the input's narrower boundary. Its control
  sets a maximum from 1 to 5 and defaults to 3; never place this secondary option between the URL field and primary
  action.
- Keep this configuration visually quiet: use a label, compact select, and adjacent help text without a decorative icon
  or full-width card surface. Explain that the entered URL counts as the first page, discovered same-site URLs fill the
  remaining slots, and analysis finishes with fewer pages when the website exposes fewer usable routes. Automatic
  discovery combines rendered navigation links with same-origin sitemap entries, excludes authentication, legal, and
  asset URLs, and favors a diverse set of product, pricing, documentation, company, support, and content pages instead
  of filling the run with several near-identical routes. Links inside the primary content or top navigation outrank
  footer-only contact and support routes; low-representativeness utility routes are skipped rather than used to fill a
  page quota.
- The entry page remains authoritative for canvas, surface, and foreground roles. Additional pages may strengthen or
  add action colors, components, breakpoints, motion, and other tokens. Token JSON and DTCG exports carry deterministic
  per-token confidence, observation counts, source pages, and provenance; repeated viewports are captures, not distinct
  pages. DESIGN.md summarizes confidence and calls out low-confidence values for review.
- Every successfully analyzed URL produces screenshot evidence with its URL and viewport. Show all available evidence
  in the result panel and report the actual page and screenshot counts when a site exposes fewer pages than requested.
- Screenshot evidence opens in an in-context lightbox. Wheel and explicit controls zoom the image; zoomed images support
  pointer and touch dragging, and returning to the fitted scale resets the image to the center.
- When analysis produced multiple screenshots, the lightbox offers previous/next edge controls (mirrored by the arrow
  keys) with a current/total counter. The previous control hides on the first screenshot and the next control hides on
  the last; switching screenshots resets zoom and pan to the fitted center.
- Compact, non-essential workflow guidance may use an accessible info control with hover and keyboard-focus content
  instead of occupying a permanent result card. The related action labels themselves must remain visible.

## Analysis history

- Every completed analysis persists its full text result (tokens, CSS variables, Tailwind theme, DESIGN.md) along
  with page screenshot paths in the local SQLite database. Text payloads are small; screenshots already live on disk
  and are never duplicated into the database.
- History rows act as work entries, not a log: selecting a record opens the complete result in a dialog where the
  user can review every artifact, copy the design document, export files, or save the result to the Theme Library.
- Each history row shows the first captured page screenshot as a compact, top-aligned thumbnail; records whose
  screenshot is unavailable retain the same layout with an explicit placeholder. Show the record's localized creation
  date and time together so analyses from the same day remain distinguishable. Chinese uses `YYYY-MM-DD HH:MM:SS`;
  English uses the familiar localized medium date and time with seconds.
- The history-detail shell stays fixed within the desktop window while its active artifact scrolls inside the dialog.
  Long token previews and documents must never extend beyond an unscrollable clipped surface. Escape, the visible close
  action, and a direct click on the surrounding backdrop all dismiss the dialog; interaction inside it never does.
- History and detail preview images use cached small thumbnails; full-resolution screenshots load only when the user
  opens the lightbox. The detail backdrop uses an opaque scrim without live blur to keep opening and closing responsive.
- Deleting a history record is destructive and requires explicit confirmation; deleting a record never removes a
  theme that was already saved to the library.
- History rows support multi-select through always-visible checkboxes, including a select-all checkbox that applies to
  the current search filter. A selection toolbar reports the selected count and offers batch deletion behind the same
  explicit confirmation as single deletion, plus a way to clear the selection.
- Load history summaries from SQLite in pages of 10 and create thumbnail elements only for the current page. Search and
  select-all still apply to the complete filtered result set while pagination limits the rows and images rendered.

## Persistent preferences

- Persist renderer-only user preferences in namespaced localStorage keys and validate every value before use. Migrate
  legacy language keys so existing choices survive upgrades.
- Language, color mode, current app theme, default analysis page limit, last validation scenario, and explicitly
  dismissed informational notices survive a full app restart.
- Keep transient work state out of localStorage: submitted URLs, analysis results and failures, search input, progress,
  open dialogs, and pending authentication decisions remain in memory or their existing durable stores.
- Main-process settings contain only analyzer defaults, Theme Library export format, display preferences, and network
  proxy configuration; they never store model-provider credentials or agent command selections.
- The settings page exposes network and local-data controls only. Product operation never requires an external account,
  model configuration, secret, or command-line agent.

## Export semantics

Export choices describe different jobs and must never be presented as interchangeable:

- **DESIGN.md** is the recommended single artifact for an AI that must revise an existing UI. It explains design intent,
  rules, evidence, and reusable values. Users should provide it together with the current UI screenshot or source code.
  Generated documents are built as a typed document model and rendered with the Google Labs DESIGN.md alpha token schema
  and canonical section order. Standard tokens and safely mapped components stay in the normative fields. A compact
  `x-imprint` extension retains source, coverage and analysis summaries, responsive metadata, and token groups not covered
  by the alpha schema; full token provenance and component evidence belong in Tokens JSON, `design-evidence.json`, and
  `component-specs.json` instead of being duplicated into the front matter. In the result preview, render the front matter
  as collapsed machine-readable YAML and the remaining document as Markdown; copy and export always preserve the original
  document byte content.
- **CSS variables** are recommended for framework-agnostic web and CSS projects.
- **Tailwind v4 `@theme`** is recommended when the target project already uses Tailwind v4.
- **Tokens JSON** is recommended for design-token tooling, automation, and agents that need machine-readable values.
- **Reconstruction Brief** is a deterministic, evidence-gated execution artifact for carrying the observed design context
  into a new UI. It remains separate from DESIGN.md and is exported as `RECONSTRUCTION.md`.

Every export action must name the artifact it will create. Theme-library preferences apply only to theme-card exports;
the analysis result page exports the artifact represented by its active tab. Built-in-theme exports include reusable
design intent and tokens, but not Imprint-specific background images, textures, or desktop-shell component styles.

The Preview tab renders deterministic token and component test surfaces only; it never executes generated markup or
scripts. Validation work belongs in the dedicated Theme Library scenarios and uses allowlisted components with explicit
states, responsive widths, and accessibility checks.

## Anti-slop guardrails

Visual novelty must remain accountable to the product's extraction and validation workflow:

- Curate built-in themes as foundation, narrative, or experimental systems. Do not add a theme unless it has a distinct
  validation purpose and passes the complete-theme checklist.
- Limit a theme backdrop to two non-structural ambient compositions. A multi-stop gradient that behaves as one coherent
  light field counts as one composition; do not scatter unrelated decorative blobs. A grid, paper, or mural texture may
  add one structural material layer when it carries the theme metaphor. Live blur belongs only where transparency
  communicates a fixed functional layer. Repeated reading cards stay stable: they may use a translucent laminated fill,
  sheen, and defined edge over a soft backdrop. The sole exception is Aurora Glass on macOS, where the original live
  refraction is an explicit platform material and must remain reduced-motion-aware and independently performance-tested.
- Do not run decorative ambient animation. Motion must explain a user action, a state change, or content continuity.
  Aurora Glass on macOS is the one intentional exception: its single background light field may drift slowly when
  reduced motion is not requested, preserving the original refractive material without animating content or controls.
- Choose a defined edge or elevation for a surface instead of stacking a hairline border, wide shadow, and glow.
- Every theme value or design-pattern claim must point to an observable token, component rule, or interaction behavior.
  Poetic language may set context, but it cannot substitute for implementation evidence.
- Treat the examples in the desktop app as validation scenarios, not bundled website templates. Organize them by product
  workflow, content and presentation, and interaction states. Keep every scenario directly visible in a compact grouped
  tile layout; do not hide scenario switching inside a select menu.
- Pin a compact theme-calibration strip above every validation surface: primary and secondary actions, a text link, an
  input with a focus ring, checkbox and radio controls, and default/success/warning/error status badges. Every control
  binds directly to a semantic theme role (no arbitrary fallback colors), and the strip states that these fixed
  components exist to compare the same controls across themes.
- Keep every built-in and extracted theme visible by name and separate palette swatches beside the validation controls.
  Present them in two labeled groups: Imprint appearance themes are complete systems that change the app shell, while
  extracted website themes are evidence snapshots scoped to the current preview. Theme choices wrap within their group
  instead of moving into an overflow menu, preserving one-click comparison at every library size. Applying either kind
  of theme updates the current validation surface in place without resetting or replaying the scenario; theme management
  and export remain exclusive to Theme Library.
- Built-in themes are complete Imprint appearance systems and may style the desktop shell. Website themes saved from an
  analysis are evidence snapshots, not complete app skins: normalize their observed tokens into a complete semantic
  preview map, label observed and safely adapted roles, report known source contrast failures, and scope every generated
  variable to the validation surface. State that validation scenarios keep a fixed neutral layout and compare foundation
  tokens rather than reconstructing the source composition. When a meaningful dark variant was directly observed, keep it with the snapshot
  and expose a compact captured/dark switch beside the validation summary. A website theme must never overwrite or
  persist as the user's Imprint app theme.
- Saving a website theme snapshots the exact analysis selected by the user. Re-saving that analysis refreshes the same
  snapshot instead of creating duplicates. Saving a different analysis with the same derived theme name first asks for
  confirmation, then updates the existing theme in place, preserves its ID, and consolidates any legacy duplicates with
  that name into one entry; analysis history is retained. Renaming cannot create a duplicate name. Deleting a history
  record does not delete the saved theme. Theme deletion remains explicit and confirms that the source analysis will be
  retained.
- Avoid generic superlatives, filler metrics, and decorative labels in product copy. Say what the interface verifies or
  what the user can do.

## Desktop shell conventions

- The native window title uses one localized product name: `印记` in Chinese and `Imprint` in English. Do not combine
  both names in the constrained title-bar or taskbar label.
- The operating-system title bar, taskbar, Dock, and tray carry product identity. Keep the in-app sidebar focused on
  navigation; do not repeat the logo, product name, or marketing tagline there.
- Use familiar navigation symbols with concise labels. Keep Settings separated at the bottom of the sidebar, following
  its platform-standard secondary role.
- Closing the main window hides it to the system tray or macOS menu bar. A primary tray click restores the window, while
  the context menu provides an explicit Quit command.
- Selection changes state, not elevation. Theme cards use a stronger border and a visible Current label; they do not
  move, scale, gain a ring, or rise above neighboring cards.
- Theme preview swatches use a fixed circular shape, share one vertical centerline, and reserve consistent space for
  descriptions and state labels across every card.

### Platform material translation

- A built-in theme has one semantic identity and one shared structural CSS layer. Platform override sheets translate its
  material, typography, edge contrast, and elevation for Windows and macOS; they must not fork component structure or
  semantic color roles into two independent themes.
- Windows fixed chrome favors stable tinted surfaces and defined edges. Avoid large live `backdrop-filter` regions in the
  persistent sidebar, toolbar, and reading cards; preserve Acrylic-like depth with restrained tint, texture, and short
  shadows. Verify borders at 100%, 125%, and 150% display scale.
- On Windows, Aurora Glass uses one coherent cyan-violet light field behind neutral reading surfaces. Keep chromatic
  outlines and directional sheen off repeated cards; reserve violet for selected, primary, and focus states.
- macOS may retain softer translucent chrome where the high-density rendering path keeps text and hairlines legible.
  Aurora Glass restores its original live refraction on reading cards and inputs, plus a slow reduced-motion-aware
  background drift; other themes keep repeated reading cards stable and avoid multiplying live blur across content.
- Platform typography must resolve deliberately: Segoe UI Variable and Microsoft YaHei UI on Windows; the macOS system
  font and PingFang SC on macOS; platform monospace and CJK serif fallbacks preserve each theme's typographic role.
- Platform screenshot review is part of complete-theme acceptance. A theme is incomplete if it is only calibrated on one
  operating system, display density, or color mode.

## Complete-theme checklist

A built-in theme is complete only when it defines and verifies:

- semantic color roles and state contrast;
- body, heading, and monospace fonts;
- type scale, line height, and letter spacing;
- spacing unit, density, and sidebar width;
- radius scale, border width, and icon stroke;
- small, medium, large, and focus elevation;
- fast, normal, and slow motion with easing;
- background composition and surface material;
- design values and recurring visual patterns;
- empty, populated, validation-scenario, focus, disabled, selected, and reduced-motion states.

## Dark-theme invariants

- Avoid pure black as the primary content surface.
- Preserve the same information hierarchy as the light interface.
- Use luminous colors for status and focus, not for large reading surfaces.
- Keep long-form text at a comfortable contrast instead of maximum contrast.
- Test screenshots and color samples against surrounding dark surfaces.
