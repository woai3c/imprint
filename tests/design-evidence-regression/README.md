# Design Evidence browser regression

This suite runs Imprint against 24 annotated pages, six controlled comparison pages, and the reusable manual comparison
site in a real installed Chrome or Edge browser. It verifies observable analyzer behavior; it does not calculate a
quality score, compare products, call an AI provider, or write a ranking report.

Run it with:

```sh
pnpm test:design-evidence
```

Each `fixtures/<name>.html` page is paired with `fixtures/<name>.annotations.json`. The annotations describe concrete
expected behavior such as section roles, component types and element kinds, safe interaction observations, responsive
changes, media kinds, structural treatments, semantic color handling, and stable evidence identifiers.

Nine neutral semantic fixtures independently annotate viewport canvas/content/code/media ownership, search-landmark context,
and false-versus-real relative section reordering. Their oracle reads only the annotations and public artifacts; it does
not call the production semantic classifier.

A separate URL fixture varies a full-screen root between absent, hidden, transparent, and fully clipped states.
All four captures must preserve the visible canvas and foreground colors.

Another URL fixture wraps an unchanged painted page root in transparent application mounts, including multiple levels
and `display: contents`. The canvas owner and foreground must survive those DOM-only changes; inline script text is
not visible content coverage.

The regression runner analyzes desktop and mobile viewports, checks the annotated behavior, and repeats extraction. The
repeat capture must keep section IDs stable, satisfy the current reference-comparability gate, and produce no supported
token drift. This is a controlled-fixture stability gate, not evidence that arbitrary live websites are stable. It
requires a locally installed Chrome or Edge because `playwright-core` does not bundle a browser.

Two query-switched, same-route pages cover known token changes. `known-change-calibration` freezes one change in every
currently supported token category. `known-change-holdout` is kept separate and changes only color and radius, so a
typography or spacing report counts as a false positive. Both run with a single viewport and therefore also verify that
responsive comparison fails closed with no evidence instead of claiming no change.

Four additional pages exercise structural comparison. `known-structural-calibration` changes layout, an observed hover
state, and responsive behavior. Separate layout and interaction holdouts assert the exact changed-category set, while
unchanged reruns must produce no differences. `known-structural-partial-coverage` verifies that ambiguous repeated
sections are excluded without discarding reliable matched evidence. These holdouts were added after the comparison
implementation: they protect future behavior but cannot prove that the current implementation was never influenced by
similar controlled cases.

The tests calculate both missed expected categories and unexpected changed categories. These controlled cases validate
comparison wiring and fail-closed behavior; they do not establish a universal live-site accuracy rate, a perceptual
threshold, or the P0 product exit criteria.

`tests/comparison-site` exposes the same categories through a stable local URL for manual Desktop testing. Its browser
regression verifies the documented result for every scenario before those instructions are presented to users.

When adding a fixture, keep it self-contained, add only factual assertions that can be verified from its HTML and
rendered behavior, and avoid subjective quality thresholds.
