# Imprint Design System

Imprint is a design-system extraction tool. Its interface should make hidden design decisions visible without competing
with the material being analyzed. Themes may change the atmosphere, but they must preserve the same interaction model,
information hierarchy, and accessibility baseline.

This file is the source of truth for Imprint's own product interface. It is distinct from the `DESIGN.md` artifacts that
Imprint generates for analyzed websites.

## Design values

### Truthful extraction

Show what the browser actually rendered. Extraction is deterministic and evidence-based; AI may improve semantic names,
but it must not invent source styles.

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

- **Evidence before interpretation:** screenshots and extracted values precede generated descriptions.
- **Progressive disclosure:** lead with summaries, then expose tokens, code, and documentation as users need them.
- **Stable hierarchy:** light, dark, and artistic themes keep the same information order and interaction locations.
- **Functional material:** transparency, texture, glow, and illustration establish layers; they never replace contrast.
- **Semantic states:** primary, secondary, muted, accent, destructive, focus, disabled, and selected states retain the
  same meaning in every theme.
- **One hue family for interaction states:** hover, active, selected, and focus surfaces derive from the primary or
  neutral scale of the theme, never from a contrasting hue. A theme's signature contrast color belongs only in
  signature positions — the focus ring, the navigation selection indicator, or ambient art direction.
- **Reversible theming:** changing or importing a theme must not leave typography, spacing, radius, or motion values
  behind.

## Design Evidence and AI design insights

Terminology: the user-facing name for AI interpretation is "AI design insights" (zh "AI 设计解读"); internal code
identifiers (DesignProfile, design-intelligence) are never shown in the UI. User copy must be plain language a
non-technical user understands — internal identifiers (`evidence-only`, `structural-only`, limitation codes,
capability levels) never appear as labels; unknown page or section roles are omitted rather than labeled "unknown".
Secondary options (such as analysis depth) explain themselves through a small info affordance whose message appears on
hover and keyboard focus; primary options keep visible adjacent help text. Result tab labels never wrap — when space
runs out, the tab strip scrolls horizontally instead.

- Every completed analysis opens on **Overview**. The overview is useful without AI: it shows source coverage, page
  structure, detected sections, component instances, viewport evidence, observed states, and explicit limitations.
- Label deterministic browser and code results as **Observed**. Reserve **Inferred** for a validated DesignProfile and
  **Generated** for reconstruction briefs or validation scenarios. Never present one layer as another.
- The evidence-only overview is a complete supported result, not an error or a setup advertisement. It states plainly
  that everything shown was directly observed by the browser, without displaying capability tags or internal mode
  names.
- Keep Design Evidence JSON separate from Tokens JSON. The former carries source, topology, geometry, component,
  responsive, state, media, coverage, and limitation facts; the latter remains the portable token artifact.
- Legacy history records without Design Evidence retain their saved artifacts and show a concise compatibility notice
  instead of fabricated topology.
- Page structure is a compact ordered map, not a decorative site diagram. Use localized section roles and preserve the
  source URL and viewport beside every sequence.
- Limitations belong beside coverage. Each recorded limitation maps to a plain-language explanation; internal debug
  entries (such as per-candidate skip records) never reach the UI.
- AI design insights run after deterministic extraction and never block the first usable result. The status card
  distinguishes pending, complete, partial, failed, skipped, and not-configured states; retry reruns only
  interpretation, never the browser. Status icons are reserved for running, success, and failure — neutral states use
  text alone, and the UI never decorates status lines with capability tags. Complete and partial results share the
  same concise completion label; validation details remain in the supporting status text below it.
- When the configured model cannot see screenshots, analysis does not silently degrade: the status card offers an
  explicit three-way choice — generate a structural interpretation, switch to a vision-capable model in Settings, or
  skip AI interpretation. Skipping is persisted and reversible from the status card.
- Every AI claim cites real evidence IDs and displays its confidence. Selecting a section, component, layout, or
  media reference opens the related screenshot and highlights its normalized evidence rectangle; when the evidence lies
  inside a captured region crop, the crop opens directly with the rectangle remapped into crop-local coordinates.
  Evidence that has no genuine screenshot region (topology layers, cross-page patterns, token-level references) opens a
  compact evidence detail instead — never a fabricated full-frame highlight.
- A completed or partial interpretation offers "Re-interpret" alongside the failure retry; both rerun only
  the AI layer on the stored evidence, never the browser.
- Structural-only interpretation must never be styled or worded as full visual analysis. Screenshot input requires a
  vision-capable model plus the settings consent, which defaults to on for new installations because it materially
  improves interpretation; existing installs keep their saved choice, and the toggle stays one click away in Settings.
  Signed-in evidence stays local until the user explicitly starts interpretation from its status card, and signed-in
  screenshots are sent only when the separate signed-in vision consent in Settings is enabled (off by default); its
  copy names the provider and warns that account or internal information may be present.
- Agent CLI interpretation runs in an isolated temporary directory containing only the task manifest and whitelisted
  evidence images, removed after the run. With screenshot consent, images are attached as explicit file references;
  whether the model actually sees them depends on the CLI's own configuration, so multimodal CLI runs must pass an
  image-observation self-check or the result degrades to structural-only. Product copy must never claim that a local
  Agent CLI keeps data on the machine — uploads follow the CLI's own configuration.
- Responsive evidence compares adjacent viewport pairs (desktop to tablet, tablet to mobile) rather than only the
  widest capture against the rest, so three-viewport analyses describe each transition separately.
- The Overview groups thesis, signature moves, composition, attention, visual language, transfer rules, and
  uncertainties. Profile JSON remains a separate versioned artifact; AI token names are aliases and never replace
  deterministic token keys.
- The app never asks users to compose prompts or task descriptions for an external agent — that conversation belongs in
  the user's own agent. Generated reconstruction briefs remain one-click copyable; they prohibit copying source text,
  logos, page composition, or media and travel with DESIGN.md plus the target UI's source or screenshot.
- Validation scenarios use an allowlisted renderer rather than model-authored HTML. Report token-scale, rule-reference,
  state, contrast, overflow, and reduced-motion checks independently, including evidence, interpretation, or generation
  failure layers; never collapse them into a single opaque quality score.

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
  screenshot is unavailable retain the same layout with an explicit placeholder.
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
- AI credentials, Agent CLI selection, and Theme Library export format stay in the main-process settings file. Never
  duplicate credentials into renderer storage.
- Model ID, custom-model vision capability, screenshot consent, and the standard/deep analysis choice stay with
  main-process settings. The consent copy must name the active provider, state in plain words that site screenshots are
  sent to the AI to improve interpretation, and state that signed-in pages require a separate explicit consent.
- A saved Agent CLI selection always displays the product name from the shared CLI registry (never a raw or legacy
  command string), whether or not detection has run in the current session.
- Detect local Agent CLIs asynchronously on first use, cache the result for the current app process, and provide an
  explicit refresh action for newly installed CLIs. Detection progress must not block navigation or other UI actions.
- Treat Agent CLI detection and selection as separate actions. Detection only reports candidates; it never selects one
  or changes the active AI method. Selecting another CLI replaces the saved selection; the global AI switch disables
  AI without clearing connection settings, so the CLI list does not expose a separate deselection action.
- Present API Key and Agent CLI as two mutually exclusive connection methods while preserving each method's saved
  configuration. A persistent status summary must state which fully configured method is active, or that AI enhancement
  is not enabled when the selected method is incomplete.
- Keep Agent CLI detection behavior as visible supporting text beside the detected list and refresh action. Do not hide
  this explanation in a tooltip that can be clipped by the desktop shell.
- When Agent CLI is active, run semantic enhancement non-interactively in an isolated temporary directory with the
  strongest read-only or no-tool controls supported by that CLI. Bound execution time and output size, never log prompts
  or responses, remove temporary data afterward, and fall back to deterministic extraction if the CLI is unavailable,
  unauthenticated, times out, or returns invalid output.

## Export semantics

Export choices describe different jobs and must never be presented as interchangeable:

- **DESIGN.md** is the recommended single artifact for an AI that must revise an existing UI. It explains design intent,
  rules, evidence, and reusable values. Users should provide it together with the current UI screenshot or source code.
- **CSS variables** are recommended for framework-agnostic web and CSS projects.
- **Tailwind v4 `@theme`** is recommended when the target project already uses Tailwind v4.
- **Tokens JSON** is recommended for design-token tooling, automation, and agents that need machine-readable values.

Every export action must name the artifact it will create. Theme-library preferences apply only to theme-card exports;
the analysis result page exports the artifact represented by its active tab. Built-in-theme exports include reusable
design intent and tokens, but not Imprint-specific background images, textures, or desktop-shell component styles.

When a saved analysis already contains validated example HTML, the Preview tab renders each example live in a sandboxed
iframe with the extracted CSS variables applied. Without validated examples, Imprint omits the example section from
both the preview and generated DESIGN.md so deterministic extraction stays compact. AI examples are validation surfaces
rather than reconstructions of source markup, and rendering never executes scripts. New validation work belongs in the
dedicated Theme Library validation scenarios instead of an optional generation prompt at the bottom of Preview.

## Anti-slop guardrails

Visual novelty must remain accountable to the product's extraction and validation workflow:

- Curate built-in themes as foundation, narrative, or experimental systems. Do not add a theme unless it has a distinct
  validation purpose and passes the complete-theme checklist.
- Limit a theme backdrop to two non-structural ambient compositions. A multi-stop gradient that behaves as one coherent
  light field counts as one composition; do not scatter unrelated decorative blobs. A grid, paper, or mural texture may
  add one structural material layer when it carries the theme metaphor. Live blur belongs only where transparency
  communicates a fixed functional layer. Repeated reading cards stay stable: they may use a translucent laminated fill,
  sheen, and defined edge over a soft backdrop, but never a per-card live backdrop filter.
- Do not run decorative ambient animation. Motion must explain a user action, a state change, or content continuity.
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
  Keep reading cards laminated rather than multiplying live blur across scrolling content.
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
