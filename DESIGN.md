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

Every useful result should move cleanly between the desktop app, CLI, and MCP server. The desktop app gives users one
self-contained `DESIGN.md`; specialized CSS, Tailwind, and JSON representations remain available to CLI/MCP automation.
Prefer semantic, implementation-neutral concepts over app-specific decoration.

The current downloadable release surface is Desktop. CLI and MCP remain tested source-build integration surfaces until
their installable package and client setup are released in the next product stage. MCP stays a local stdio process and
must not introduce a hosted Imprint service, account, model provider, or API-key dependency.

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
- website analysis exposes cancellation throughout the run and, after one page is complete, a separate visible action
  that keeps completed work and opens the current result;
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
  responsive, state, media, coverage, and limitation facts, plus the token catalog that owns every positional
  `tokenRefs` reference inside that evidence package. The latter remains the portable all-capture token artifact.
  Deterministic profiles and DESIGN.md always resolve evidence claims against the evidence-owned catalog, validate all
  references before persistence and export, and fail explicitly instead of silently resolving against another catalog.
- Legacy history records without Design Evidence retain their saved artifacts and show a concise compatibility notice
  instead of fabricated topology.
- Page structure is a compact ordered map, not a decorative site diagram. Use localized section roles and preserve the
  source URL and viewport beside every sequence.
- Limitations belong beside coverage. Each user-relevant limitation maps to one plain-language explanation; limitations
  that resolve to the same explanation are shown once. Internal diagnostics such as page-health details, extraction
  issue payloads, and per-candidate skip records remain in evidence or logs and never become duplicate generic UI rows.
- Deterministic claims are part of every core result. Identical captured evidence produces an identical Design Profile,
  reconstruction brief, validation recipe, and compact DESIGN.md observation summary. DESIGN.md keeps only selected
  medium/high-confidence statements that add composition, component semantics, safely executed interaction, or other
  high-value facts not already expressed clearly by its token and evidence tables. Each visible claim keeps a compact,
  human-readable route and viewport scope when the supporting page can be resolved. Relevant token references and their
  resolved values appear with the claim. Raw claim IDs, assertions, and the complete internal evidence record are not
  repeated as a human-facing appendix.
- New analyses derive a bounded transfer guide from the same evidence. Overview presents reusable cross-page foundations
  as **Core Design Rules**, matching component-and-variant guidance as **Contextual Component Patterns**, scoped facts as
  **Local Design Observations**, and unresolved areas as **Unknowns and Coverage Gaps**. Internal P0/P1/P2 priority values
  remain implementation details and never appear in the normal desktop view or human-facing DESIGN.md. These groups also
  avoid exposing DesignProfile, claim catalog, assertion, or evidence-ID terminology. A human-readable **View evidence**
  action may still open the supporting screenshot region without revealing the internal identifier. A local observation
  never becomes a global rule merely because the user opens its details.
- Analysis status describes capture and evidence quality only. A usable deterministic analysis cannot become `partial`
  or `failed` because an unrelated external tool is unavailable.
- Imprint does not contain a model-provider, API-key, local-model, or Agent CLI execution path. The user's external coding
  agent consumes exported context and screenshots only after analysis has completed.
- Selecting a section, component, layout, or media reference opens the related screenshot and highlights its normalized
  evidence rectangle; evidence without a genuine screenshot region opens a compact evidence detail instead of a
  fabricated highlight.
- Responsive evidence compares adjacent viewport pairs (desktop to tablet, tablet to mobile) rather than only the
  widest capture against the rest, so three-viewport analyses describe each transition separately.
- Human-facing DESIGN.md prose localizes analyzer terms such as responsive change types and observed property names;
  raw internal field names remain in structured metadata only. Repeated section-position and next-section statements
  appear only when the sampled pages agree on one value, rather than combining unrelated page-local positions.
- The Overview leads with the observed page scope, key structure, canonical components, responsive facts, and explicit
  preserve/avoid guidance. Multi-page captures report their actual page count instead of applying one entry-page role to
  the entire site. Profile JSON remains the complete separate versioned claim artifact.
- The app never asks users to compose generic prompts for an external agent. Deterministic reconstruction facts are
  included in DESIGN.md instead of requiring a second desktop export. Target-aware adaptation belongs to the user's
  external coding agent and requires both DESIGN.md and the target UI's source or screenshot.
- Validation scenarios use an allowlisted renderer. Report token-scale, rule-reference, state, contrast, overflow, and
  reduced-motion checks independently, including capture, rule-construction, or rendering failure layers; never collapse
  them into a single opaque quality score.

## Analysis comparison and reporting

- Analysis History exposes one visible **Compare two analyses** page action. Its picker names and previews both records,
  defaults to the two latest eligible records, and offers only later records for the same normalized route. Users may
  choose any earlier and later pair for that route; comparison does not create or mutate a pinned reference. Repeated
  row-level comparison buttons and per-record reference actions are avoided.
- The comparison checks the recorded page and viewport set, page-analysis mode, access mode, language, coverage, and page-health eligibility
  before reporting supported token changes. Missing or incompatible evidence produces `inconclusive`, never “no
  change.” The selected page count is an upper bound. Analysis records every discovered and completed page;
  coverage remains partial when the user stops the run before selected pages finish. A selected page or
  planned viewport that fails also remains incomplete. Selecting two records does not mutate either record.
- Each new analysis stores a versioned Capture Manifest with requested viewports and the bounded page limit, access mode, locale,
  timezone, color scheme, reduced-motion preference, the runtime browser identity, each captured viewport's effective
  DPR/user agent/emulation profile, browser and tool versions, actual animation-freeze coverage, font readiness,
  page-health coverage, and explicit limitations. Missing legacy manifests or differences in conditions that can affect
  token extraction produce `inconclusive`; browser, platform, or tool-version differences remain visible
  limitations for the currently exact token comparison.
- Before browser work begins, every entry point must normalize its inputs through versioned Analysis Request schema
  `2`: an HTTP(S) URL, an ordered deduplicated subset of desktop/tablet/mobile viewports, a positive integer page bound
  with no product-level maximum, access mode, dark-mode extraction choice, depth, and page-discovery mode. Entry points may declare different
  defaults, but they must pass the resulting explicit request to the same core analyzer. Invalid values are rejected
  instead of silently falling back to another viewport or page count. The request schema version is recorded in the
  Capture Manifest; a recorded-version mismatch, including a new capture compared with a legacy capture that lacks
  the field, makes the comparison inconclusive.
- Even when manifest checks pass, label the comparison as limited because tolerances and cross-capture entity matching
  are not yet calibrated. Do not present it as pixel fidelity, compliance, or a universal drift verdict.
- Comparison cards group color, typography, spacing, radius, layout, interaction-state, and responsive results. Token
  categories compare their stored scales. Layout comparison is limited to matched sections and the observed order,
  layout mode, display/position, maximum width, and grid-column count; gap remains owned by the spacing category so a
  spacing-token change does not inflate the layout category. Interaction comparison is limited to
  observed style groups that align by page, trigger, and changed-property set. Responsive comparison is limited to
  matched sections observed across the same viewport pair. The comparison exposes one visible visual-difference action
  instead of sending users through raw evidence identifiers or replacing the comparison with a single-analysis view.
  Unresolved identities and unaligned observations are excluded and produce explicit limited coverage; when reliable
  pairs remain, the category may say only that its comparable evidence has no observed change. Category-level
  `inconclusive` is reserved for cases with no comparable evidence, such as a responsive comparison with only one
  viewport. Neither result claims that excluded or unobserved behavior is unchanged.
- Cross-capture entity identity is a separate experimental result, not another drift category. Sections match only
  through a unique exact semantic signature (role, layout mode, parent role, component semantics) or, at medium
  confidence, when the same section role is unique on both captures. Components match only by a unique type,
  element-kind, and role signature inside an already matched section. Repeated candidates remain `ambiguous` and a
  missing counterpart remains `unmatched`; neither status is automatically reported as a design change. Do not pair
  repeated sections or components by DOM order, evidence ID, or an uncalibrated similarity threshold.
- Entity matching remains internal comparison machinery rather than a user task. The normal report does not expose
  aggregate match counts, raw evidence IDs, or ambiguous candidate groups. When unresolved identities limit a category,
  its scope states in plain language that similar elements were excluded to prevent false change reports. Two-sided
  evidence references remain stored for traceability but are not exposed as navigation controls.
- Visual difference pairs only uniquely matched, readable full-page screenshots from the same normalized page route and
  viewport, and the action is absent when every paired screenshot has the same recorded content hash. It opens above the
  comparison and returns to the unchanged comparison when closed. The comparison header provides a visible return to
  the pair picker, preserving the current pair so users can continue with another comparison without closing and
  restarting the flow. The default view keeps the earlier and later original screenshots side by side with synchronized
  vertical context and outlines meaningful difference regions without recoloring their content. When page height
  changes and an unchanged prefix and suffix can be established reliably,
  align those regions around the inserted or removed middle instead of marking every downstream shifted pixel. State
  when height alignment or proportional preview reduction is applied. Preview reduction must apply one uniform scale to
  both captures; independently rounded vertical scales create false text differences on long pages. Minor rendering
  noise below the display threshold is ignored. Describe the result as screenshot differences: text, numbers, ads, and
  layout may all contribute, and a rectangular outline means that some pixels inside it changed rather than every item
  in the rectangle. The image is a visual observation only: it does not infer a DOM cause, establish compliance, or
  classify a change as a defect.
- The visual-difference viewer displays the saved full-resolution screenshot files while deriving difference regions
  from one uniformly scaled preview. One shared control zooms both sides from the fitted view to 300% without changing
  their left-earlier, right-later order. Do not repeat visible earlier/later labels above the images; that established
  order and accessible image names preserve the distinction without covering screenshot content.
- “Changed” is a factual observation, not a defect. Comparison has no approval, contract, or governance workflow. The
  user can copy the current localized report or export it as a standalone Markdown file. Both outputs include the two
  analysis records and capture times, the overall result, comparability reasons and limitations, category coverage,
  and every reported change. Exported reports must preserve the same factual boundaries as the visible comparison and
  must not introduce causal, defect, or compliance claims. The comparison header stays on one line: return, title,
  result, and report actions. Screenshot difference is a compact outlined text button and is absent when no visual pair
  exists; copy and Markdown export remain icon actions with immediate hover and keyboard-focus tooltips. Fixed product
  boundaries such as exact-observed-value and captured-page-only scope do not produce a repeated banner; the category
  coverage and exported report retain those boundaries. Only capture-specific browser or tool differences receive a
  visible condition warning. Comparison candidates are cached for the renderer session and reused when returning to the
  picker or reopening it. A successful new analysis invalidates that cache; deleting records updates it in place. A
  visual-difference dialog uses the standard modal scrim without stacking it over the comparison dialog's scrim.
- Present layout observations in plain language using the observed section role, page route, viewport, property, and
  direction of change. Identical observations for the same route across viewports are grouped into one summary; raw
  evidence paths and values remain available only in collapsed technical details. Section `order` is a zero-based
  extraction index, so the interface describes it as the number of identified sections before the matched section,
  never as a user-facing ordinal position. Do not infer a section name, purpose, or cause that the evidence did not
  record.

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

## URL privacy boundaries

- The complete submitted URL is used only while navigating and may remain in the active input for retry. Desktop result
  views, recovery state, history rows, Theme Library snapshots, generated artifacts, Design Evidence, token provenance,
  and logs remove URL userinfo, the full query string, and fragments before storage or display.
- Database startup migration applies the same redaction to legacy analysis and theme URLs, nested evidence and token
  provenance URLs, screenshot metadata, and generated documents. Logger startup redacts URLs in the current and rotated
  local logs. These migrations intentionally do not retain the removed values.
- Route paths remain because they identify the analyzed page and may still contain sensitive business or personal data.
  Automatic path classification cannot guarantee safe sharing; users must review paths and captured screenshot content
  before exporting or sharing. Imprint does not claim that URL redaction masks sensitive content rendered inside a page.

## Multi-page analysis evidence

- Desktop analysis automatically follows usable same-site pages up to a user-visible page limit. The default is 8 pages;
  users may enter any positive integer with no product-level maximum. Treat this value as a maximum rather than a
  promise that every site exposes that many representative pages. Place the compact numeric input and short explanation
  below the URL-and-action row; never put this secondary control between the URL field and primary action. CLI and MCP
  use the same positive-integer contract and the same default of 8 when omitted.
- The entered URL is the first page. Automatic
  discovery combines rendered navigation links with same-origin sitemap entries, excludes authentication, legal, and
  asset URLs, and favors a diverse set of product, pricing, documentation, company, support, and content pages instead
  of filling the run with several near-identical routes. Links inside the primary content or top navigation outrank
  footer-only contact and support routes; low-representativeness utility routes are skipped rather than used to fill a
  page quota. For a non-root entry URL, discovered descendant routes keep the entered path's context; when at least one
  usable descendant exists, automatic selection stays within that context instead of mixing in unrelated global routes.
  When no such descendant exists, normal same-origin diversity scoring remains the fallback. If a selected route fails
  navigation or the page-health gate, analysis continues with other ranked candidates until the requested page bound,
  candidate exhaustion, cancellation, or an explicit early finish. Newly completed pages can contribute more same-origin links to the queue; identity normalization prevents
  query, fragment, and repeated-route loops.
- Canvas, surface, foreground, and action roles are ranked from per-page-normalized observations across the complete
  evidence-eligible page set; capture order or one missing entry viewport must not silently relabel site-wide semantic
  colors. Additional pages may strengthen components, breakpoints, motion, and other tokens. Token JSON and DTCG exports
  carry deterministic per-token confidence, observation counts, source pages, and provenance; repeated viewports are
  captures, not distinct pages. DESIGN.md summarizes confidence and calls out low-confidence values for review.
- Every successfully analyzed URL produces screenshot evidence with its URL and viewport. Show all available evidence
  in the result panel and report the actual page and screenshot counts.
- Full-page evidence must retain the measured document height even when a page has horizontal overflow. Capture only the
  intended viewport width so accidental off-canvas content does not widen or truncate the saved overview.
- Analysis has no global elapsed-time cutoff. Once at least one page is complete, progress states the
  completed/discovered counts and offers **Finish and view current result**; this keeps completed work, while Cancel
  continues to discard the run. Persist whether the run completed normally or was finished by the user, and show an
  early-finish reason in Desktop results and history. Completion metadata is operational context and must never be
  written into DESIGN.md. Individual page navigation, adaptive capture, browser-context, and browser shutdown operations
  remain independently bounded so one stalled browser operation cannot hang the run or discard completed extraction;
  desktop logs record stage transitions and the last active stage for diagnosis.
- Screenshot evidence opens in an in-context lightbox. Wheel and explicit controls zoom the image; zoomed images support
  pointer and touch dragging, and returning to the fitted scale resets the image to the center.
- When analysis produced multiple screenshots, the lightbox offers previous/next edge controls (mirrored by the arrow
  keys) with a current/total counter. The previous control hides on the first screenshot and the next control hides on
  the last; switching screenshots resets zoom and pan to the fitted center.
- Compact, non-essential workflow guidance may use an accessible info control with hover and keyboard-focus content
  instead of occupying a permanent result card. The related action labels themselves must remain visible.

## Analysis history

- Every completed analysis persists its complete shared result data and DESIGN.md along with page screenshot paths in
  the local SQLite database. Text payloads are small; screenshots already live on disk and are never duplicated into
  the database. The desktop export surface exposes only DESIGN.md.
- Opening a history record that has complete saved tokens, evidence, and a current deterministic profile re-renders its
  DESIGN.md with the current document exporter without revisiting the website. The captured facts remain unchanged;
  legacy records without enough structured data retain their originally saved document.
- History rows act as work entries, not a log: selecting a record opens the complete result in a dialog where the
  user can review the overview, visual preview, and DESIGN.md; copy or export DESIGN.md; or save the result to the Theme
  Library.
- Each history row shows the first captured page screenshot as a compact, top-aligned thumbnail; records whose
  screenshot is unavailable retain the same layout with an explicit placeholder. Show the record's localized creation
  date and time together so analyses from the same day remain distinguishable. Chinese uses `YYYY-MM-DD HH:MM:SS`;
  English uses the familiar localized medium date and time with seconds.
- The history-detail shell stays fixed within the desktop window while its active artifact scrolls inside the dialog.
  Long token previews and documents must never extend beyond an unscrollable clipped surface. Escape, the visible close
  action, and a direct click on the surrounding backdrop all dismiss the dialog; interaction inside it never does.
- History and detail preview images use cached small thumbnails; full-resolution screenshots load only when the user
  opens the lightbox or visual difference. The detail backdrop uses an opaque scrim without live blur to keep opening
  and closing responsive.
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
- Language, color mode, current app theme, last validation scenario, and explicitly
  dismissed informational notices survive a full app restart.
- Keep transient work state out of localStorage: submitted URLs, analysis results and failures, search input, progress,
  open dialogs, and pending authentication decisions remain in memory or their existing durable stores.
- Main-process settings contain only analyzer defaults, display preferences, and network proxy configuration; they
  never store model-provider credentials or agent command selections.
- The settings page exposes network and local-data controls only. Product operation never requires an external account,
  model configuration, secret, or command-line agent.

## Export semantics

The desktop app has one export artifact: **DESIGN.md**. It explains design intent, rules, observed evidence, reusable
values, coverage, and limitations. Users provide it together with the current UI screenshot or source code when asking
an external coding agent to revise an existing interface.

The document begins with a transfer contract: Core Design Rules apply by default only within their declared scope;
Contextual Component Patterns apply only when the target contains the matching component and variant; Local Design
Observations remain scoped and cannot override either. Unknowns and Coverage Gaps state where the evidence cannot support
a reusable conclusion. Six bounded design dimensions summarize color, typography, shape, surface/elevation,
density/rhythm, and composition without producing an opaque style score. Component patterns distinguish general Web
usage guidance from observed source styles, include only observed states and responsive behavior, and state restrictions
that prevent special shapes, overlay elevation, or local layout from being generalized.

Generated documents are built as a typed document model and rendered with the Google Labs DESIGN.md alpha token schema
and canonical section order. Standard tokens and safely mapped components stay in the normative fields. A compact
`x-imprint` extension retains source, coverage and analysis summaries, responsive metadata, and token groups not covered
by the alpha schema. The Markdown body includes high-value observations, uncertainty notes, representative route and
viewport scope, relevant section/component semantics, implementation boundaries, and resolved token values. The file
does not require a second artifact to understand or apply the report, and it does not repeat a raw internal evidence-ID
index.

The result page keeps Overview and Visual Preview as in-app inspection surfaces, not export formats. Its copy and export
actions always produce the same complete DESIGN.md, and the Theme Library does the same without a format selector.
Built-in-theme exports contain reusable design intent and tokens but omit Imprint-specific background images, textures,
and desktop-shell component styles. In the document preview, render front matter as collapsed machine-readable YAML and
the remaining body as Markdown; copy and export preserve the original document byte content.

CLI and MCP integrations may continue to request CSS variables, Tailwind v4 `@theme`, Tokens JSON, Design Evidence, or
the reconstruction brief for machine workflows. Those compatibility formats are not separate choices in the desktop
experience and DESIGN.md never depends on them.

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
