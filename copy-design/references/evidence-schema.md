# Evidence schema

Use this reference when reading, validating, or extending `capture.json` and `style-facts.json`.

## Capture bundle

`capture_site.js` writes schema version `1.0`:

```json
{
  "schemaVersion": "1.0",
  "source": {
    "origins": ["https://example.com"],
    "urls": ["https://example.com/"]
  },
  "capture": {
    "startedAt": "ISO-8601",
    "browser": "chrome.exe",
    "viewports": [],
    "safeInteractions": ["hover", "focus"]
  },
  "pages": [],
  "errors": []
}
```

Each page contains:

- `inputUrl` and `finalUrl`: query- and fragment-free source locations.
- `viewport`: capture name, width, and height.
- `screenshot`: path relative to the evidence directory.
- `facts.document`: viewport and document geometry.
- `facts.elements`: visible semantic, geometric, and computed-style summaries.
- `facts.rootVariables`: computed custom properties on the root element.
- `facts.mediaQueries`: readable media conditions.
- `facts.fontFaces` and `facts.loadedFonts`: font metadata, not font binaries.
- `facts.stateSelectors`: readable interaction selectors.
- `states`: hover/focus property differences.
- `warnings`: truncation or unreadable stylesheet notes.

The capture intentionally excludes text content, form values, cookies, browser storage, headers, and full asset URLs.

## Style facts

`extract_style_facts.js` writes:

```json
{
  "schemaVersion": "1.0",
  "source": {},
  "coverage": {},
  "tokens": {},
  "layouts": [],
  "components": [],
  "responsive": {},
  "interactionStates": [],
  "evidenceGaps": []
}
```

Token categories:

- `semanticColors`: role candidates inferred from body, property, and component evidence.
- `colors`: normalized rendered colors ranked by visible weight and repetition.
- `typography`: repeated family/size/weight/line-height/letter-spacing signatures.
- `spacing`: non-negative pixel values from margin, padding, and gap.
- `spacingBase`: best-fit base rhythm when samples support one.
- `radii`, `borders`, `shadows`, `motion`, `zIndex`: repeated style candidates.
- `cssVariables`: directly observed root custom properties.
- `fonts`: declared and loaded font metadata.

Component entries contain a semantic `kind`, repetition count, page and viewport coverage, average size, a compact style signature, and confidence.

Responsive evidence has two distinct sources:

- `mediaQueries`: conditions readable from stylesheets.
- `observations`: actual differences between widest and narrowest captures of the same route.

Do not equate a sampling viewport with a breakpoint.

## Confidence

- `high`: direct variable/query evidence or repeated across multiple pages and viewports.
- `medium`: multiple observations or a stable local pattern.
- `low`: one-off, screenshot-only, or semantically ambiguous evidence.

Confidence measures evidence strength, not design quality. A high-confidence frequent color can still have the wrong semantic role; review it in context.

## Compatibility

Reject unknown major schema versions. Add fields compatibly within `1.x`; do not silently reinterpret existing fields. Preserve raw evidence when normalization would lose a meaningful distinction.
