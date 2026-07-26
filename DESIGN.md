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
- **Reversible theming:** changing or importing a theme must not leave typography, spacing, radius, or motion values
  behind.

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

## Anti-slop guardrails

Visual novelty must remain accountable to the product's extraction and validation workflow:

- Curate built-in themes as foundation, narrative, or experimental systems. Do not add a theme unless it has a distinct
  validation purpose and passes the complete-theme checklist.
- Limit a theme backdrop to two non-structural ambient color effects. A grid, paper, or mural texture may add one
  structural material layer when it carries the theme metaphor. Blur belongs only where transparency communicates a
  functional layer; reading surfaces stay stable and near-solid.
- Do not run decorative ambient animation. Motion must explain a user action, a state change, or content continuity.
- Choose a defined edge or elevation for a surface instead of stacking a hairline border, wide shadow, and glow.
- Every theme value or design-pattern claim must point to an observable token, component rule, or interaction behavior.
  Poetic language may set context, but it cannot substitute for implementation evidence.
- Treat the examples in the desktop app as validation scenarios, not bundled website templates. Organize them by product
  workflow, content and presentation, and interaction states.
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
