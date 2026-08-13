# Design Evidence browser regression

This suite runs Imprint against 15 self-contained pages in a real installed Chrome or Edge browser. It verifies
observable analyzer behavior; it does not calculate a quality score, compare products, call an AI provider, or write a
ranking report.

Run it with:

```sh
pnpm test:design-evidence
```

Each `fixtures/<name>.html` page is paired with `fixtures/<name>.annotations.json`. The annotations describe concrete
expected behavior such as section roles, component types and element kinds, safe interaction observations, responsive
changes, media kinds, structural treatments, semantic color handling, and stable evidence identifiers.

The regression runner analyzes desktop and mobile viewports, checks the annotated behavior, and repeats extraction to
ensure section IDs remain stable. It requires a locally installed Chrome or Edge because `playwright-core` does not
bundle a browser.

When adding a fixture, keep it self-contained, add only factual assertions that can be verified from its HTML and
rendered behavior, and avoid subjective quality thresholds.
