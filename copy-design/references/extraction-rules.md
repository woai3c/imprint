# Extraction and inference rules

Use this reference after capture and before finalizing project design instructions.

## Contents

1. Evidence order
2. Page coverage
3. Color
4. Typography
5. Spacing and shape
6. Layout
7. Components
8. Responsive behavior
9. Interaction and motion
10. Confidence and compression

## 1. Evidence order

Prefer evidence in this order:

1. Repeated explicit CSS custom properties with observed usage.
2. Repeated computed styles across pages and viewports.
3. Repeated element geometry and semantic component roles.
4. Cross-viewport visual behavior.
5. Screenshot-only estimates.

Use screenshots to validate the whole, not as the only source of numerical precision when runtime facts exist.

## 2. Page coverage

Select representative page types instead of crawling exhaustively:

- Marketing or home
- List/search
- Detail
- Form/authentication
- Pricing or plan comparison
- Article/documentation
- Dashboard/data

Prefer user-named routes. Record unavailable authenticated, experiment, empty, loading, success, and error states as gaps.

## 3. Color

- Normalize rendered colors before counting.
- Separate foreground, background, border, outline, icon, and shadow roles.
- Weight visible area, repetition, page coverage, and semantic element kind.
- Treat transparent overlays and gradients separately from solid colors.
- Infer canvas from `html`/`body` and large page surfaces.
- Infer action color from repeated interactive components, not frequency alone.
- Infer status colors only when semantic status evidence exists.
- Recheck contrast before enforcing muted text or subtle borders.
- Keep light and dark profiles separate.

Never label a color “brand primary” solely because it is saturated.

## 4. Typography

Extract:

- Family and fallback stack
- Loaded/declaration status
- Size, weight, style, line height, and letter spacing
- Heading, body, label, caption, control, and code roles
- Responsive changes

Do not copy font files. Record a proprietary family by name and describe an acceptable licensed or system fallback.

Cluster near-identical signatures only when the difference is rendering noise. Preserve intentional compact control text and display typography.

## 5. Spacing and shape

- Collect margin, padding, gap, and observed geometry.
- Exclude hidden elements and decorative absolute-position offsets.
- Separate component-internal, component-to-component, section, and page-gutter spacing.
- Infer a base scale only when many positive samples fit it.
- Treat percentage or pill/circle radii as component-specific.
- Group shadows by elevation role and visible context.
- Distinguish borders from focus outlines and inset highlight rings.

Do not turn the most frequent zero value into a token.

## 6. Layout

Identify:

- Canvas and main container
- Maximum content width
- Horizontal gutters
- Grid columns and gaps
- Header/footer height
- Sidebar width and sticky behavior
- Section vertical rhythm
- Alignment anchors
- Scroll and overflow containers

Derive container rules from landmark geometry across pages. Do not infer a universal grid from one isolated card row.

## 7. Components

Use native tags, ARIA roles, repeated DOM shapes, class hints, geometry, and visual signatures together.

For each repeated component, describe:

- Anatomy
- Size and density
- Internal spacing
- Typography
- Surface, border, radius, and shadow
- Variants
- Hover, focus, selected, expanded, disabled, loading, and error states
- Responsive substitutions

Keep separate signatures when they are meaningful variants. Merge signatures when differences are minor page-local noise.

## 8. Responsive behavior

Combine media conditions with observed changes:

- Visibility
- Reordering
- Column collapse
- Navigation substitution
- Sidebar-to-drawer behavior
- Width and gutter changes
- Type scaling
- Touch-target sizing
- Horizontal scrolling

Write behavior first and breakpoint second. If media-query evidence and observed behavior conflict, preserve the conflict and lower confidence.

## 9. Interaction and motion

Automatically collect only non-mutating states. Never click to discover styling.

For motion, capture:

- Property
- Duration
- Easing
- Delay
- Transform/opacity path
- Reduced-motion behavior

Separate micro-interactions from route/page transitions. Do not infer animation from a frozen screenshot.

## 10. Confidence and compression

Promote a candidate to:

- **Global rule** when repeated across pages/viewports or directly tokenized.
- **Component rule** when repeated within one semantic component.
- **Local exception** when isolated but clearly intentional.
- **Evidence gap** when unavailable or ambiguous.

Compress the final document:

- Prefer semantic tables and concise component rules.
- Omit raw selectors, full DOM paths, and raw stylesheet dumps.
- Remove candidates that do not change implementation decisions.
- Keep exceptions and user overrides.
- Stay under 30 KB per managed profile; target 12–20 KB.
