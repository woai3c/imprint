# Output template

Use this template for visual-only analysis or when manually refining generated evidence.

```md
<!-- copy-design:start id=<stable-12-hex-id> schema=1 -->
## Reference design system: <profile>

- Source: `<query-free URL or screenshot set>`
- Mode: `<enhanced or visual-only>`
- Coverage: `<routes, viewports, themes, states>`
- Confidence: `<summary>`

### Design DNA

- <visual hierarchy and density>
- <surface and color strategy>
- <typographic character>
- <shape and spacing character>

### Design tokens

#### Color

| Role | Value | Usage | Confidence |
| --- | --- | --- | --- |
| ... | ... | ... | ... |

#### Typography

| Role | Family | Size/line height | Weight | Confidence |
| --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... |

#### Spacing, radii, borders, and shadows

- ...

### Layout system

- ...

### Components

#### <component>

- Anatomy:
- Size:
- Surface:
- Typography:
- States:
- Responsive behavior:

### Responsive behavior

- ...

### Interaction and motion

- ...

### Accessibility

- ...

### Implementation rules

- ...

### Avoid

- ...

### User overrides

- None recorded.

### Evidence gaps

- ...
<!-- copy-design:end id=<stable-12-hex-id> -->
```

Compute the stable ID from:

```text
sha256(normalized-source + "\n" + lowercased-profile-name)[0:12]
```

Strip URL query, fragment, embedded credentials, and sensitive identifiers before computing or displaying the source.

Keep user overrides separate from source-site facts. On regeneration, preserve them exactly unless the user explicitly changes them.
