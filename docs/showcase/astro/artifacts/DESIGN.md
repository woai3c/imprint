---
version: alpha
name: Astro
description: Extracted by Imprint from observed website styles and structural evidence.
colors:
  background: "#23262d"
  surface: rgba(13, 17, 20, 0.302)
  secondary: "#23262d"
  foreground: "#f2f6fa"
  muted-foreground: "#bfc1c9"
  primary: "#61dafb"
  border: "#343841"
  observed-ffffff: "#ffffff"
  observed-3c81f5-80: rgba(60, 129, 245, 0.502)
  observed-0d0f14: "#0d0f14"
  observed-878c96-33: rgba(135, 140, 150, 0.2)
  observed-e8c4f9: "#e8c4f9"
  observed-d83333: "#d83333"
  observed-545864: "#545864"
  observed-5570b3-d0: rgba(85, 112, 179, 0.816)
  observed-264a89-80: rgba(38, 74, 137, 0.502)
  observed-3178c6: "#3178c6"
  observed-4bf3c8: "#4bf3c8"
  observed-54b9ff: "#54b9ff"
  observed-1a3e57: "#1a3e57"
  observed-9ca3af: "#9ca3af"
  observed-acafff: "#acafff"
  observed-ffd493: "#ffd493"
typography:
  font-family-1:
    fontFamily: ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji
  font-family-2:
    fontFamily: ui-sans-serif
  font-family-3:
    fontFamily: Obviously
  font-family-4:
    fontFamily: Inter
  font-family-5:
    fontFamily: ui-monospace
  font-family-6:
    fontFamily: MDIO
  size-xs:
    fontSize: 0.75rem
  size-sm:
    fontSize: 0.844rem
  size-base:
    fontSize: 0.875rem
  size-lg:
    fontSize: 1rem
  size-xl:
    fontSize: 1.125rem
  size-2xl:
    fontSize: 1.25rem
  size-3xl:
    fontSize: 1.5rem
  size-4xl:
    fontSize: 2.25rem
  weight-light:
    fontWeight: 300
  weight-380:
    fontWeight: 380
  weight-normal:
    fontWeight: 400
  weight-medium:
    fontWeight: 500
  weight-semibold:
    fontWeight: 600
  line-height-tight:
    lineHeight: 1
  line-height-snug:
    lineHeight: 1.25
  line-height-normal:
    lineHeight: 1.429
  line-height-relaxed:
    lineHeight: 1.5
  line-height-loose:
    lineHeight: 1.65
  letter-spacing-tight:
    letterSpacing: 0.3px
  letter-spacing-normal:
    letterSpacing: 0.35px
  letter-spacing-wide:
    letterSpacing: 0.4px
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 9999px
spacing:
  space-1: 2px
  space-2: 3px
  space-3: 4px
  space-4: 8px
  space-5: 12px
  space-6: 16px
  space-7: 20px
  space-8: 24px
  space-9: 32px
  space-10: 48px
  space-11: 64px
  space-12: 80px
components:
  button-primary:
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
  button-secondary-lg-pill-filled:
    backgroundColor: "{colors.foreground}"
    textColor: "#17191e"
    rounded: "{rounded.2xl}"
  button-secondary-md-pill-outlined:
    textColor: "{colors.observed-ffffff}"
    rounded: "{rounded.2xl}"
  button-secondary-md-pill-tinted:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.2xl}"
  button-icon:
    textColor: "{colors.muted-foreground}"
  card-outlined-r16:
    backgroundColor: "#0c0f19"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: 32px
  card-outlined-square:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    padding: 16px
  navigation:
    textColor: "{colors.foreground}"
  input:
    backgroundColor: "#060913"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  list:
    textColor: "{colors.foreground}"
x-imprint:
  - schema: imprint.design-system/2
    language: en
    source:
      requestedUrl: https://astro.build/
      finalUrl: https://astro.build/
      accessMode: anonymous
    featureTags:
      - rich color system
      - spacing rhythm led by 4px, 8px, 16px
      - large-radius rounded style
    evidence:
      layer: observed
      pageCount: 3
      captureCount: 6
      coverage:
        pageCoverage: complete
        urlCoverage:
          requested: 3
          captured: 3
        captureCoverage:
          expected: 6
          captured: 6
          status: complete
          requestedViewports:
            - desktop
            - tablet
            - mobile
        assetCoverage:
          expected: 6
          valid: 6
          status: complete
          issueCount: 0
        sectionCoverage: 1
        viewportCoverage:
          - desktop
          - tablet
          - mobile
        interactionCoverage:
          candidates: 36
          safelyObserved: 3
          skipped: 33
        mediaCoverage:
          majorRegions: 75
          classifiedRegions: 32
          iconRegions: 87
        accessRestrictions: []
        limitations:
          - horizontal-overflow-observed
          - some-safe-interactions-skipped
          - responsive-section-identity-mismatch
      tokenConfidence:
        high: 56
        medium: 32
        low: 5
    analysis:
      mode: deterministic
      claimSource: deterministic-catalog
      catalogVersion: "1"
    nonstandardTokens:
      shadows:
        - rgba(255, 255, 255, 0) 1.6px 1.6px 3.2px 0px
        - rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px
        - rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(24, 24, 27, 0.03) 0px 5px 2px 0px, rgba(24, 24, 27, 0.1) 0px 3px 2px 0px, rgba(24, 24, 27, 0.17) 0px 1px 1px 0px, rgba(24, 24, 27, 0.2) 0px 0px 1px 0px, rgba(24, 24, 27, 0.2) 0px 0px 0px 0px
        - rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 20px 25px -5px, rgba(0, 0, 0, 0.1) 0px 8px 10px -6px
      borders:
        - 1px solid rgb(52, 56, 65)
        - 1px solid rgba(135, 140, 150, 0.2)
        - 1px solid rgb(35, 38, 45)
        - 1px solid rgb(232, 196, 249)
      zIndices:
        - "-50"
        - "-10"
        - "-2"
        - "-1"
        - "10"
        - "20"
        - "30"
        - "50"
      transitions:
        - 0.15s
        - 0.2s
        - 0.3s
        - 0.5s
        - 1s
        - 1.5s
    componentSummary:
      source: design-evidence
      countBasis: one canonical capture per page; desktop preferred
      canonicalViewports:
        - desktop
      patterns: 11
      instances: 76
      details:
        - name: button-primary
          type: button
          count: 5
          elementKinds:
            - anchor
            - input
        - name: button-secondary-lg-pill-filled
          type: button
          count: 1
          elementKinds:
            - anchor
        - name: button-secondary-md-pill-outlined
          type: button
          count: 1
          elementKinds:
            - anchor
        - name: button-secondary-md-pill-tinted
          type: button
          count: 2
          elementKinds:
            - anchor
        - name: button-icon
          type: button
          count: 2
          elementKinds:
            - button
        - name: card-outlined-r16
          type: card
          count: 1
        - name: card-outlined-square
          type: card
          count: 19
        - name: navigation
          type: navigation
          count: 13
        - name: input
          type: input
          count: 3
          elementKinds:
            - input
        - name: list
          type: list
          count: 18
        - name: tab
          type: tab
          count: 11
          elementKinds:
            - button
    colorRoles:
      primaryAction:
        observedBackground: "#61dafb"
        observedForeground: "#030712"
        contrastRatio: 12.4
        observationCount: 3
    responsive:
      breakpointSource: declared-css
      breakpoints:
        - width: 384
          label: mobile-384
          layoutChanges: []
        - width: 448
          label: mobile-448
          layoutChanges: []
        - width: 640
          label: tablet-sm-640
          layoutChanges: []
        - width: 768
          label: tablet-sm-768
          layoutChanges: []
        - width: 1024
          label: tablet
          layoutChanges: []
        - width: 1280
          label: desktop
          layoutChanges: []
        - width: 1536
          label: wide
          layoutChanges: []
      observedViewportTransitions:
        - desktop->tablet
        - desktop->mobile
---

# Design System

## Overview

### Design Transfer Guide

> Business requirements determine content and behavior. This contract constrains only the observed visual and interaction language within its stated scope.

- Apply core design rules by default within their stated scope.
- Apply a contextual component pattern only when the target contains the matching component and variant.
- Treat local design observations as references for matching contexts; they must not override core rules or contextual component patterns.
- Do not copy source branding, logos, copy, or media.
- Accessibility, correct product behavior, and explicit user requirements take priority.

#### Core Design Rules

- **Typography:** Use ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji as the observed primary stack(s), with the captured sizes 1rem and weights 300, 400. _(high confidence · evidence refs: 3 · scope: astro.build/ · desktop; astro.build/agencies · desktop; +1 more scope)_
  - **Implementation:** Map large-format text, heading, body, label, and metadata to the closest observed role; do not introduce an unrelated type family or an unlisted size.
  - **Related tokens:** `typography.font-stack.1` (ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji), `typography.font-size.4` (1rem), `typography.font-weight.1` (300), `typography.font-weight.3` (400)
- **Density and rhythm:** Build recurring padding and gaps from the most-used observed spacing values: 16px, 32px, 48px, 80px. _(high confidence · evidence refs: 40 · scope: astro.build/ · desktop; astro.build/agencies · desktop; +1 more scope)_
  - **Implementation:** Use smaller values inside controls and related groups, and larger values between sections; keep one-off page geometry outside the reusable spacing rhythm.
  - **Related tokens:** `spacing.6` (16px), `spacing.9` (32px), `spacing.10` (48px), `spacing.12` (80px)

#### Design dimension coverage

These six lines show whether each dimension has enough cross-page support to become a reusable core rule or remains a local observation. A local dimension can still have a narrower core rule above or more specific observations below.

- **Color:** Local design observation
- **Typography:** Reusable core rule
- **Shape:** Local design observation
- **Surface and elevation:** Local design observation
- **Density and rhythm:** Reusable core rule
- **Composition:** Local design observation

### Reconstruction Summary
- **Site scope:** This analysis covers 3 observed pages from Astro.
- **Entry-page section hierarchy:** navigation ×2 → content → hero → content ×3 → feature-group → content → navigation → feature-group → content → feature-group → media → content → feature-group ×2 → footer → navigation ×2
- **Key structure:** `Observed across 3 pages: navigation max-width: 1280px`
- **Representative component variants across pages:** tab ×11, primary button ×5, secondary button (large, pill-shaped, solid fill) ×1, secondary button (medium, pill-shaped, outlined) ×1, secondary button (medium, pill-shaped, tinted fill) ×2, icon button ×2, card (outlined, 16px radius) ×1, card (outlined, square-cornered) ×19, navigation ×13, input ×3, list ×18
- **Responsive facts:** [entry] content desktop → tablet: columns 3 → 2; [entry] feature-group desktop → tablet: columns 3 → 2; [entry] feature-group desktop → tablet: columns 5 → 4; [entry] feature-group desktop → tablet: columns 3 → 1; [entry] hero desktop → tablet: heading font-size 48px → 36px; [entry] content desktop → tablet: heading font-size 36px → 30px
- **Preserve:** Preserve the observed fact: Observed across 3 pages: navigation max-width: 1280px. Preserve the observed fact: [entry] content desktop → tablet: columns 3 → 2. Preserve the observed fact: [entry] feature-group desktop → tablet: columns 3 → 2. Preserve the observed fact: [entry] feature-group desktop → tablet: columns 5 → 4.
- **Avoid:** Do not substitute decorative, status, or border colors for the observed action role. Do not generalize one-off geometry into the reusable spacing scale.

Extracted from: https://astro.build/

**Design Features:** `rich color system` · `spacing rhythm led by 4px, 8px, 16px` · `large-radius rounded style`

**Dark Mode:** Not detected

## Colors

### Dominant Observed Color Roles

| Group | Tokens |
|---|---|
| Action | `--color-primary` |
| Editorial accent | `--color-observed-e8c4f9` |
| Decorative | `--color-observed-0d0f14`, `--color-observed-d83333`, `--color-observed-264a89-80`, `--color-observed-1a3e57` |
| Text | `--color-foreground`, `--color-muted-foreground`, `--color-observed-ffffff`, `--color-observed-3178c6`, `--color-observed-54b9ff`, `--color-observed-4bf3c8` |
| Surface/background | `--color-background`, `--color-surface` |
| Border | `--color-observed-878c96-33`, `--color-border`, `--color-observed-545864`, `--color-observed-5570b3-d0` |
| CSS-declared; no rendered use observed | `--color-observed-3c81f5-80` |

### Complete Color Tokens

| Token | Value | Usage | Confidence |
|-------|-------|-------|------------|
| `--color-background` | `#23262d` | 58× (background+border) | high · 3 pages |
| `--color-surface` | `rgba(13, 17, 20, 0.302)` | 6× (background) | high · 3 pages |
| `--color-secondary` | `#23262d` | 58× (background+border) | high · 3 pages |
| `--color-foreground` | `#f2f6fa` | 2517× (action+background+text+border) | high · 3 pages |
| `--color-muted-foreground` | `#bfc1c9` | 574× (action+text) | high · 3 pages |
| `--color-primary` | `#61dafb` | 9× (action+background+text) | high · 1 page |
| `--color-border` | `#343841` | 63× (background+border) | high · 3 pages |
| `--color-observed-ffffff` | `#ffffff` | 512× (action+background+text+border) | high · 3 pages |
| `--color-observed-3c81f5-80` | `rgba(60, 129, 245, 0.502)` | CSS-declared; no rendered use observed | high · 3 pages |
| `--color-observed-0d0f14` | `#0d0f14` | 33× (background) | high · 3 pages |
| `--color-observed-878c96-33` | `rgba(135, 140, 150, 0.2)` | 130× (background+border) | high · 3 pages |
| `--color-observed-e8c4f9` | `#e8c4f9` | 16× (action+text+border) | medium · 1 page |
| `--color-observed-d83333` | `#d83333` | 36× (background+text) | medium · 1 page |
| `--color-observed-545864` | `#545864` | 21× (border) | medium · 1 page |
| `--color-observed-5570b3-d0` | `rgba(85, 112, 179, 0.816)` | 6× (border) | medium · 1 page |
| `--color-observed-264a89-80` | `rgba(38, 74, 137, 0.502)` | 6× (background) | medium · 1 page |
| `--color-observed-3178c6` | `#3178c6` | 60× (text) | medium · 1 page |
| `--color-observed-4bf3c8` | `#4bf3c8` | 54× (text) | medium · 1 page |
| `--color-observed-54b9ff` | `#54b9ff` | 57× (text) | medium · 1 page |
| `--color-observed-1a3e57` | `#1a3e57` | 3× (background) | medium · 1 page |
| `--color-observed-9ca3af` | `#9ca3af` | 6× (text) | medium · 1 page |
| `--color-observed-acafff` | `#acafff` | 12× (text) | medium · 1 page |
| `--color-observed-ffd493` | `#ffd493` | 9× (text) | medium · 1 page |

### Observed Primary Action Pair

- Observed primary action pair: `#61dafb` / `#030712`
- Observed contrast: 12.40:1

## Typography

**Font families:** ui-sans-serif, Obviously, Inter, ui-monospace, MDIO

**Full font stacks:**
- `ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji`
- `Obviously, obviously-fallback, system-ui, sans-serif`
- `Inter, inter-fallback, system-ui, sans-serif`
- `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace`
- `MDIO, md-io-fallback, monospace`

**Font sizes:** 0.75rem, 0.844rem, 0.875rem, 1rem, 1.125rem, 1.25rem, 1.5rem, 2.25rem

**Font weights:** 300, 380, 400, 500, 600

**Letter spacing:** 0.3px, 0.35px, 0.4px

## Layout

### Reusable Spacing Candidates

- Level 1: `2px` (94×)
- Level 2: `3px` (36×)
- Level 3: `4px` (446×)
- Level 4: `8px` (1166×)
- Level 5: `12px` (337×)
- Level 6: `16px` (932×)
- Level 7: `20px` (30×)
- Level 8: `24px` (194×)
- Level 9: `32px` (183×)
- Level 10: `48px` (40×)
- Level 11: `64px` (36×)
- Level 12: `80px` (87×)

> Low-frequency page geometry above 96px is excluded from the reusable scale; representative structural dimensions and responsive changes remain in this document.

### Responsive Breakpoints Declared in CSS

> These widths come from CSS media/container queries. Only listed changes were directly observed; an empty cell does not prove that nothing changes at that width.

| Label | Width | Directly observed changes |
|-------|-------|-------|
| mobile-384 | `384px` | - |
| mobile-448 | `448px` | - |
| tablet-sm-640 | `640px` | - |
| tablet-sm-768 | `768px` | - |
| tablet | `1024px` | - |
| desktop | `1280px` | - |
| wide | `1536px` | - |

## Elevation & Depth

### Shadows

- sm: `rgba(255, 255, 255, 0) 1.6px 1.6px 3.2px 0px`
- md: `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`
- lg: `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(24, 24, 27, 0.03) 0px 5px 2px 0px, rgba(24, 24, 27, 0.1) 0px 3px 2px 0px, rgba(24, 24, 27, 0.17) 0px 1px 1px 0px, rgba(24, 24, 27, 0.2) 0px 0px 1px 0px, rgba(24, 24, 27, 0.2) 0px 0px 0px 0px`
- xl: `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 20px 25px -5px, rgba(0, 0, 0, 0.1) 0px 8px 10px -6px`

### Z-Index Layers

- Layer 1: `-50`
- Layer 2: `-10`
- Layer 3: `-2`
- Layer 4: `-1`
- Layer 5: `10`
- Layer 6: `20`
- Layer 7: `30`
- Layer 8: `50`

### Transition Durations

- fast: `0.15s`
- normal: `0.2s`
- slow: `0.3s`
- slower: `0.5s`
- slowest: `1s`
- duration-6: `1.5s`

## Shapes

### Corner Radius Scale

- sm: `6px` (4×)
- md: `8px` (94×)
- lg: `12px` (76×)
- xl: `16px` (30×)
- 2xl: `9999px` (197×)

## Components

### Contextual Component Patterns

> These patterns are not global defaults. Use one only when the target contains the matching component and variant. Keep each treatment scoped to that component and variant; when no state is listed, do not present an invented state as a source rule.

#### button · primary

_5 observed instance(s) · high_

- **Use when:** the target needs its principal action
- **Observed recipe:** The listed tokens are shared by at least 80% of these 5 matching instances; they are an observed subset, not a complete component specification.
  - **Related tokens:** `color.foreground` (#f2f6fa), `radius.5` (9999px), `typography.font-size.4` (1rem), `typography.font-stack.1` (ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji)
- **Observed responsive behavior:**
  - From desktop to tablet, the containing section uses layout reflow; the observed changed properties are height, heading font size, heading line height, section order.
  - From desktop to tablet, the containing section uses layout reflow; the observed changed properties are height, section order.
  - From desktop to mobile, the containing section uses layout reflow; the observed changed properties are height, body font size, body line height, paddingBottom, paddingTop, section order, vertical position, width.
- **Restrictions:**
  - Do not apply its pill or circular shape to ordinary surfaces.

#### input · default

_3 observed instance(s) · high_

- **Use when:** the target needs text entry or selection
- **Observed recipe:** The listed tokens are shared by at least 80% of these 3 matching instances; they are an observed subset, not a complete component specification.
  - **Related tokens:** `border.3` (1px solid rgb(35, 38, 45)), `color.foreground` (#f2f6fa), `radius.2` (8px), `spacing.3` (4px), `spacing.5` (12px), `typography.font-size.4` (1rem), `typography.font-stack.1` (ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji), `typography.font-weight.3` (400)
- **Observed responsive behavior:**
  - From desktop to tablet, the containing section uses layout reflow; the observed changed properties are height, section order.
  - From desktop to mobile, the containing section uses layout reflow; the observed changed properties are height, body font size, body line height, paddingBottom, paddingTop, section order, vertical position, width.

#### button · secondary · medium · pill · tinted

_2 observed instance(s) · medium_

- **Use when:** the target needs a supporting or ordinary action
- **Observed recipe:** The listed tokens are shared by at least 80% of these 2 matching instances; they are an observed subset, not a complete component specification.
  - **Related tokens:** `color.muted-foreground` (#bfc1c9), `radius.5` (9999px), `spacing.4` (8px), `spacing.6` (16px), `typography.font-size.4` (1rem), `typography.font-stack.1` (ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji), `typography.font-weight.3` (400)
- **Observed responsive behavior:**
  - From desktop to tablet, the containing section uses mixed layout change; the observed changed properties are child grid columns, height, heading font size, heading line height.
- **Restrictions:**
  - Do not apply its pill or circular shape to ordinary surfaces.

#### button · secondary · large · pill · filled

_1 observed instance(s) · medium_

- **Use when:** the target needs a supporting or ordinary action
- **Observed recipe:** The listed tokens come from this observed instance; one instance does not establish a site-wide default.
  - **Related tokens:** `color.foreground` (#f2f6fa), `radius.5` (9999px), `spacing.6` (16px), `typography.font-size.4` (1rem), `typography.font-stack.3` (Inter, inter-fallback, system-ui, sans-serif), `typography.font-weight.4` (500)
- **Restrictions:**
  - Do not apply its pill or circular shape to ordinary surfaces.

#### button · secondary · medium · pill · outlined

_1 observed instance(s) · medium_

- **Use when:** the target needs a supporting or ordinary action
- **Observed recipe:** The listed tokens come from this observed instance; one instance does not establish a site-wide default.
  - **Related tokens:** `color.observed-ffffff` (#ffffff), `radius.5` (9999px), `spacing.4` (8px), `spacing.8` (24px), `typography.font-size.3` (0.875rem), `typography.font-stack.3` (Inter, inter-fallback, system-ui, sans-serif), `typography.font-weight.4` (500)
- **Observed responsive behavior:**
  - From desktop to mobile, the containing section uses layout reflow; the observed changed properties are borderRight, borderTop, height, maxWidth, section order, vertical position, width.
- **Restrictions:**
  - Do not apply its pill or circular shape to ordinary surfaces.


> Instance counts use one canonical capture per page, preferring desktop. Other viewports inform responsive observations and are not added again.

| Type | Instances | Confidence | Representative styles |
|---|---:|---:|---|
| button-primary | 5 | 0.95 | `elementKind: anchor, input`<br>`sample: 384×40px`<br>`backgroundColor: rgba(35, 38, 45, 0.8)`<br>`color: rgb(242, 246, 250)`<br>`border: 1px solid rgba(133, 139, 152, 0.1)`<br>`borderRadius: 9999px`<br>`fontSize: 16px`<br>`fontWeight: 300` |
| button-secondary-lg-pill-filled | 1 | 0.9 | `elementKind: anchor`<br>`sample: 222×56px`<br>`backgroundColor: rgb(242, 246, 250)`<br>`color: rgb(23, 25, 30)`<br>`borderRadius: 9999px`<br>`padding: 0px 40px 0px 40px`<br>`fontSize: 16px`<br>`fontWeight: 500`<br>`display: flex`<br>`gap: 16px` |
| button-secondary-md-pill-outlined | 1 | 0.9 | `elementKind: anchor`<br>`sample: 108×40px`<br>`color: rgb(255, 255, 255)`<br>`border: 1px solid rgb(242, 246, 250)`<br>`borderRadius: 9999px`<br>`padding: 0px 24px 0px 24px`<br>`fontSize: 14px`<br>`fontWeight: 500`<br>`display: inline-flex`<br>`gap: 8px` |
| button-secondary-md-pill-tinted | 2 | 0.9 | `elementKind: anchor`<br>`sample: 275×42px`<br>`backgroundColor: rgba(44, 44, 44, 0.3)`<br>`color: rgb(191, 193, 201)`<br>`border: 1px solid rgba(133, 139, 152, 0.3)`<br>`borderRadius: 9999px`<br>`padding: 8px 16px 8px 16px`<br>`fontSize: 16px`<br>`display: inline-flex`<br>`gap: 8px` |
| button-icon | 2 | 0.98 | `elementKind: button`<br>`sample: 20×20px`<br>`color: rgb(191, 193, 201)`<br>`fontSize: 16px` |
| card-outlined-r16 | 1 | 0.92 | `sample: 1216×430px`<br>`backgroundColor: rgb(12, 15, 25)`<br>`color: rgb(242, 246, 250)`<br>`border: 1px solid rgba(133, 139, 152, 0.2)`<br>`borderRadius: 16px`<br>`padding: 32px 32px 32px 32px`<br>`fontSize: 16px` |
| card-outlined-square | 19 | 0.73 | `sample: 768×488px`<br>`backgroundColor: rgb(35, 38, 45)`<br>`color: rgb(242, 246, 250)`<br>`border: 1px solid rgb(52, 56, 65)`<br>`padding: 16px 16px 16px 16px`<br>`fontSize: 16px` |
| navigation | 13 | 0.98 | `sample: 1280×80px`<br>`color: rgb(242, 246, 250)`<br>`padding: 32px 0px 32px 0px`<br>`fontSize: 16px`<br>`display: flex`<br>`gap: 16px` |
| input | 3 | 0.96 | `elementKind: input`<br>`sample: 384×40px`<br>`backgroundColor: rgb(6, 9, 19)`<br>`color: rgb(242, 246, 250)`<br>`border: 1px solid rgb(35, 38, 45)`<br>`borderRadius: 8px`<br>`padding: 4px 12px 4px 12px`<br>`fontSize: 16px` |
| list | 18 | 0.9 | `sample: 124×152px`<br>`color: rgb(242, 246, 250)`<br>`fontSize: 16px`<br>`display: flex`<br>`gap: 8px` |
| tab | 11 | 0.98 | `elementKind: button`<br>`sample: 155×40px`<br>`color: rgb(242, 246, 250)`<br>`borderRadius: 8px`<br>`fontSize: 16px`<br>`display: flex`<br>`gap: 12px` |

## Do's and Don'ts

### Do's

- ✅ Use the defined color tokens instead of hardcoded hex values
- ✅ Follow the spacing scale for consistent rhythm
- ✅ Use `ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji` as the primary font stack
- ✅ Use elevation (shadows) to create visual hierarchy
- ✅ Preserve the observed responsive behavior across viewports
- ✅ Use the spacing scale for recurring rhythm; keep observed component and structural exceptions exact

### Don'ts

- ❌ Don't introduce new colors outside the defined palette
- ❌ Don't mix different spacing systems

### Local Design Observations

> These observations are useful references for matching contexts, but they are not site-wide rules and cannot override core design rules or contextual component patterns.

#### Observed local facts

> Each fact below applies only to its cited capture scope; verify it again before broader reuse.

- **Color:** Use the cited semantic tokens for these observed roles: primary text. _(high confidence · evidence refs: 12 · scope: astro.build/ · desktop; astro.build/agencies · desktop; +1 more scope)_
  - **Implementation:** Keep each cited semantic color in its named role; do not replace it with a decorative, status, or low-frequency observed color.
  - **Related tokens:** `color.foreground` (#f2f6fa)
- **Shape:** No ordinary radius reached reusable cross-page coverage. Component evidence also contains pill or circular treatments formed by control geometry. _(high confidence · evidence refs: 3 · scope: astro.build/ · desktop; astro.build/agencies · desktop; +1 more scope)_
  - **Implementation:** Choose an ordinary radius through the matching component recipe. Keep pill and circular values limited to variants that were directly observed with those shapes.
- **Surface and elevation:** In this foundation sample of 3 representative base surfaces, 3 use visible edge treatments and 0 use depth shadows. Their dominant treatment is edge-led. This does not describe every component or content group; component-specific surfaces remain governed by the matching contextual component patterns. _(high confidence · evidence refs: 3 · scope: astro.build/ · desktop; astro.build/agencies · desktop; +1 more scope)_
  - **Implementation:** Use a cited border or crisp edge shadow only in a matching surface or component context; this sample does not prove that every group is edge-led or that depth shadows are absent elsewhere.
  - **Related tokens:** `border.1` (1px solid rgb(52, 56, 65)), `color.observed-0d0f14` (#0d0f14)
- **Composition:** Across 3 representative pages, observed section widths range from 49% to 89% of the capture width; no shared container width was established. _(medium confidence · evidence refs: 3 · scope: astro.build/ · desktop; astro.build/agencies · desktop; +1 more scope)_
- **Composition:** One representative page capture contains this section sequence: navigation → content → hero → content → feature group → content → navigation → feature group → content → feature group → media → content → feature group → footer → navigation. _(medium confidence · evidence refs: 15 · scope: astro.build/ · desktop)_
  - **Implementation:** Preserve this order only where the cited captures support it; it describes observed sequence, not viewer gaze.
- **Interaction:** Stylesheet or computed-style evidence contains 12 focus states affecting these properties: outline-color, outline-offset, outline-style, outline-width. _(medium confidence · evidence refs: 12 · scope: astro.build/ · desktop; astro.build/agencies · desktop; +1 more scope)_
  - **Implementation:** Treat passive state evidence as declared or computed styling only; it does not prove an executed user action.
- **Interaction:** Stylesheet or computed-style evidence contains 11 click states affecting these properties: aria-selected. _(medium confidence · evidence refs: 11 · scope: astro.build/ · desktop)_
  - **Implementation:** Treat passive state evidence as declared or computed styling only; it does not prove an executed user action.
- **Interaction:** Stylesheet or computed-style evidence contains 10 hover states affecting these properties: filter. _(medium confidence · evidence refs: 10 · scope: astro.build/ · desktop; astro.build/agencies · desktop; +1 more scope)_
  - **Implementation:** Treat passive state evidence as declared or computed styling only; it does not prove an executed user action.
- **Interaction:** Visible transitions were observed in 3 interaction change states. _(medium confidence · evidence refs: 3 · scope: astro.build/ · desktop)_
- **Responsive behavior:** When the viewport changes from desktop to tablet, the content section undergoes layout reflow affecting these properties: section order, child grid columns. _(medium confidence · evidence refs: 5 · scope: astro.build/ · desktop/tablet)_
  - **Implementation:** Apply every listed property change at the cited viewport transition; the list must not be shortened to an 'only' claim.
- **Responsive behavior:** When the viewport changes from desktop to tablet, the hero section undergoes layout reflow affecting these properties: section order, heading font size. _(medium confidence · evidence refs: 5 · scope: astro.build/ · desktop/tablet)_
  - **Implementation:** Apply every listed property change at the cited viewport transition; the list must not be shortened to an 'only' claim.
- **Responsive behavior:** When the viewport changes from desktop to tablet, the content section undergoes layout reflow affecting these properties: section order, child grid columns, heading font size. _(medium confidence · evidence refs: 5 · scope: astro.build/ · desktop/tablet)_
  - **Implementation:** Apply every listed property change at the cited viewport transition; the list must not be shortened to an 'only' claim.

#### Local or specialized component patterns

- **list · default:** the target contains a repeated content collection _(18 observed instance(s))_
- **navigation · default:** the target needs navigation or scope switching _(13 observed instance(s))_
- **tab · default:** the target needs switching between related views _(11 observed instance(s))_
- **button · icon:** the target needs a supporting or ordinary action _(2 observed instance(s))_
- **card · default:** related content needs a distinct reusable surface _(1 observed instance(s))_

### Unknowns and Coverage Gaps

- **Viewport-specific section presence:** A section appears in only one compared capture; absence alone does not prove CSS hiding or removal.
  - **Needed evidence:** Match the same section across both viewports or directly observe display mode or visibility change.
- **Cross-viewport section identity:** A repeated DOM path had different semantic section roles across viewports, so no responsive relationship was asserted for that pair.
  - **Needed evidence:** Confirm the same semantic section in both viewports before comparing its responsive changes.
- **Severe horizontal overflow:** At least one capture is clipped and excluded from reusable layout inference.
  - **Needed evidence:** Capture a non-overflowing viewport before inferring responsive layout.

## Design Evidence Overview

> Layer: Observed. Everything below comes from browser observations and deterministic code analysis.

- Final source: https://astro.build/
- Access: anonymous visitor
- Coverage: 3/3 selected URLs observed; page×viewport captures 6/6 (complete); 92 section observations and 180 component observations across captures (not page instance counts)
- Screenshot assets: 6/6 dimension-valid (complete; 0 issues)
- State evidence: 85 deduped state patterns, 170 passive state observations (no user action), 3 safe active observations, 33 skipped candidates
- Media evidence: 75 major regions (32 classified), plus 87 icon instances not counted as major regions


### Typography Role Evidence

| Observed role | Instances | Font | Size | Weight | Line height |
|---|---:|---|---|---|---|
| `display` | 6 | `Obviously, obviously-fallback, system-ui, sans-serif` | `48px`, `1.5rem`, `2.25rem`, `30px` | `380`, `700` | `1.1`, `1.25` |
| `heading` | 140 | `ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji`, `Obviously, obviously-fallback, system-ui, sans-serif`, `MDIO, md-io-fallback, monospace` | `1rem`, `1.5rem`, `1.25rem`, `30px` | `600`, `380`, `400`, `300` | `1.5`, `1.25`, `1`, `1.333` |
| `body` | 213 | `ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji`, `Inter, inter-fallback, system-ui, sans-serif`, `Obviously, obviously-fallback, system-ui, sans-serif`, `MDIO, md-io-fallback, monospace` | `1rem`, `0.875rem`, `1.25rem`, `1.125rem` | `400`, `300`, `600`, `500` | `1.5`, `1.429`, `1.4`, `1.556` |
| `label` | 415 | `ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji`, `Obviously, obviously-fallback, system-ui, sans-serif`, `Inter, inter-fallback, system-ui, sans-serif`, `Arial` | `1rem`, `1.25rem`, `1.5rem`, `1.125rem` | `300`, `400`, `600`, `380` | `1.5`, `1.25`, `1.556`, `1.429` |

### Page Topology

- `desktop` https://astro.build/: horizontal overflow observed (content 2614px > viewport 1440px); off-screen content is not evidence of hiding or reflow
- `desktop` https://astro.build/: navigation ×2 → content → hero → content ×3 → feature-group → content → navigation → feature-group → content → feature-group → media → content → feature-group ×2 → footer → navigation ×2
- `tablet` https://astro.build/: horizontal overflow observed (content 1561px > viewport 768px); off-screen content is not evidence of hiding or reflow
- `tablet` https://astro.build/: navigation → content → hero → content → feature-group → content ×2 → feature-group → content → feature-group → navigation → feature-group → action → feature-group → media → content → feature-group ×2 → footer → navigation ×2
- `mobile` https://astro.build/: horizontal overflow observed (content 1364px > viewport 375px); off-screen content is not evidence of hiding or reflow
- `mobile` https://astro.build/: navigation → content → hero → content → feature-group → content ×2 → feature-group → content → navigation → feature-group → content → feature-group → media → content → feature-group ×2 → footer → navigation ×2
- `desktop` https://astro.build/blog/: navigation ×2 → hero → aside → feature-group → aside → navigation → footer → navigation ×2
- `mobile` https://astro.build/blog/: navigation → hero → feature-group → navigation → aside ×2 → footer → navigation ×2
- `desktop` https://astro.build/agencies/: navigation ×2 → hero → content → feature-group ×2 → footer → navigation ×2

### Structural Facts

- navigation: `max-width: 1280px` · `height: 80px`
- navigation: `height: 52px`
- content: `child grid: 373.328px 373.328px 373.344px`
- hero: `child grid: 277.875px`
- content: `max-width: 1280px` · `child grid: 373.328px 373.328px 373.344px`
- content: `max-width: 1280px`
- content: `child grid: 394.656px 394.656px 394.656px`
- content: `max-width: 1280px` · `child grid: 394.656px 394.672px 394.656px`
- feature-group: `grid: 392px 392px 392px`
- content: `child grid: 236.797px 236.797px 236.797px 236.797px 236.812px`
- feature-group: `grid: 236.797px 236.797px 236.797px 236.797px 236.812px`
- media: `max-width: 1280px`
- content: `max-width: 1280px` · `child grid: 298px 298px 298px`
- feature-group: `grid: 298px 298px 298px` · `border-bottom: 1px solid rgba(133, 139, 152, 0.2)`
- feature-group: `grid: repeat(2, minmax(0px, 1fr))`
- footer: `border-top: 1px solid rgba(133, 139, 152, 0.2)`
- navigation: `child grid: 124.25px 124.25px 124.25px 124.25px`
- navigation: `height: 116px`
- content: `child grid: 328px 328px`
- content: `max-width: 1280px` · `child grid: 328px 328px`
- feature-group: `grid: 328px 328px`
- content: `child grid: 344px 344px`
- content: `border: 1px solid rgba(133, 139, 152, 0.2)`
- content: `max-width: 1280px` · `child grid: 344px 344px`

### State Evidence Details

- Passive state observations: 170 (no user action executed; same metric as the overview)
- Declared states: hover ×60, focus ×60, aria-state:aria-selected ×33, active ×11, aria-state:aria-expanded ×3, state:disabled ×3
- Safe active observations: 3
- Executed drivers: click ×3
- Passively declared properties: outline-color ×41, outline-style ×38, aria-selected ×33, outline-width ×33, outline-offset ×32, color ×29, transform ×18, background-color ×18
- Executed changed properties: selected state ×3
- Representative state values:
  - `click` · safe active observation: selected state: no → yes
  - `click` · computed-state observation (no click): aria-selected: yes
  - `click` · computed-state observation (no click): aria-selected: no
  - `click` · computed-state observation (no click): aria-expanded: no
  - `hover` · computed-state observation (no click): color: rgb(191, 193, 201) → rgb(242, 246, 250); outline-color: rgb(191, 193, 201) → rgb(242, 246, 250); text-decoration-color: rgb(191, 193, 201) → rgb(242, 246, 250); transform: none → matrix(1.1, 0, 0, 1.1, 0, 0)
  - `hover` · computed-state observation (no click): background-color: rgba(43, 43, 43, 0.302) → rgba(44, 44, 44, 0.702)
  - `hover` · computed-state observation (no click): color: rgb(191, 193, 201) → rgb(255, 255, 255); outline-color: rgb(191, 193, 201) → rgb(255, 255, 255); text-decoration-color: rgb(191, 193, 201) → rgb(255, 255, 255)
  - `hover` · computed-state observation (no click): color: rgb(255 255 255/var(--tw-text-opacity,1))

### Responsive Structure Observations

- https://astro.build/ · content: desktop → tablet, layout reflow (section order, child grid columns)
  - section order: 2 → 1; child grid columns: 373.328px 373.328px 373.344px → 328px 328px
- https://astro.build/ · hero: desktop → tablet, layout reflow (section order, heading font size)
  - section order: 3 → 2; heading font size: 48px → 36px
- https://astro.build/ · content: desktop → tablet, layout reflow (section order, child grid columns, heading font size)
  - section order: 4 → 3; child grid columns: 373.328px 373.328px 373.344px → 328px 328px; heading font size: 36px → 30px
- https://astro.build/ · content: desktop → tablet, mixed layout change (heading font size)
  - heading font size: 30px → 24px
- https://astro.build/ · content: desktop → tablet, mixed layout change (child grid columns, heading font size)
  - child grid columns: 394.656px 394.656px 394.656px → 344px 344px; heading font size: 30px → 24px
- https://astro.build/ · content: desktop → tablet, layout reflow (section order, child grid columns, heading font size)
  - section order: 8 → 9; child grid columns: 394.656px 394.672px 394.656px → 344px 344px; heading font size: 30px → 24px
- https://astro.build/ · navigation: desktop → tablet, layout reflow (section order, heading font size)
  - section order: 9 → 11; heading font size: 30px → 24px
- https://astro.build/ · feature-group: desktop → tablet, layout reflow (section order, grid columns)
  - section order: 10 → 12; grid columns: 392px 392px 392px → 340px 340px
- https://astro.build/ · feature-group: desktop → tablet, layout reflow (section order, grid columns)
  - section order: 12 → 14; grid columns: 236.797px 236.797px 236.797px 236.797px 236.812px → 170px 170px 170px 170px
- https://astro.build/ · media: desktop → tablet, layout reflow (section order, heading font size)
  - section order: 13 → 15; heading font size: 36px → 24px
- https://astro.build/ · content: desktop → tablet, layout reflow (section order, child grid columns, heading font size)
  - section order: 14 → 16; child grid columns: 298px 298px 298px → 351px 351px; heading font size: 30px → 24px
- https://astro.build/ · feature-group: desktop → tablet, layout reflow (section order, grid columns)
  - section order: 15 → 17; grid columns: 298px 298px 298px → none
- https://astro.build/ · feature-group: desktop → tablet, order change (section order)
  - section order: 16 → 18
- https://astro.build/ · footer: desktop → tablet, order change (section order)
  - section order: 17 → 19
- https://astro.build/ · navigation: desktop → tablet, order change (section order)
  - section order: 18 → 20
- https://astro.build/ · navigation: desktop → tablet, layout reflow (section order, height)
  - section order: 19 → 21; height: 116px → 156px
- https://astro.build/blog/ · hero: desktop → mobile, layout reflow (section order, heading font size)
  - section order: 2 → 1; heading font size: 48px → 24px
- https://astro.build/blog/ · aside: desktop → mobile, layout reflow (section order, borderTop, borderRight)
  - section order: 3 → 4; borderTop: 0px solid rgb(52, 56, 65) → 1px solid rgb(52, 56, 65); borderRight: 1px solid rgb(52, 56, 65) → 0px solid rgb(52, 56, 65)
- https://astro.build/blog/ · feature-group: desktop → mobile, layout reflow (section order, heading font size)
  - section order: 5 → 2; heading font size: 24px → 20px
- https://astro.build/blog/ · aside: desktop → mobile, order change (section order)
  - section order: 6 → 5

### Analysis Limitations

- At least one viewport has horizontal overflow; off-screen content may be clipped rather than responsively reflowed
- Some interactive states could not be safely observed
- A repeated DOM path had different semantic section roles across viewports, so that pair was excluded from responsive claims.

## Extraction Confidence

- High: 56; medium: 32; low: 5
- Review recommended: `typography.fontSizes.1` (`0.844rem`), `typography.letterSpacings.2` (`0.4px`), `radii.0` (`6px`), `shadows.3` (`rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 20px 25px -5px, rgba(0, 0, 0, 0.1) 0px 8px 10px -6px`), `transitions.1` (`0.2s`)

## How to Use

- This file is the self-contained design reference: it includes core tokens, key observations, applicable scope, related token values, coverage, and limitations.
- Keep every implementation rule within its recorded URL, viewport, state, and confidence scope.
- After implementation, compare against the current source or capture for visual hierarchy, density, and responsive behavior.
- Exact token values and implementation metadata are included in this document's YAML and reference tables.
