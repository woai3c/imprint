# Manual comparison site

This deterministic local site is for manually verifying Desktop history comparison. It has no remote assets, API
requests, random values, current-time content, or animations. Every scenario is served at the same analysis URL so the
two captures remain route-compatible.

## Run a comparison

Start the unchanged reference:

```sh
pnpm run test:comparison-site -- --variant reference
```

Analyze `http://127.0.0.1:4173/` in Imprint. Stop the server with `Ctrl+C`, start exactly one changed scenario, and
analyze the same URL again:

```sh
pnpm run test:comparison-site -- --variant colors
```

In Desktop history, choose **Compare two analyses**, select the earlier reference and the later changed capture, then
compare the report with the table below. Keep the same Imprint viewport, theme, language, access, and page-count
settings for both captures.

For a no-change stability check, capture `reference` two or three times without restarting it. A stable run must not
report a supported change.

## Make your own controlled change

Start the empty custom scenario and capture it once:

```sh
pnpm run test:comparison-site -- --variant custom
```

While the server is still running, add one CSS change to `variants/custom.css` and capture the same URL again. The
server reads the file on every request and disables browser caching, so it does not need to be restarted. Use
`git diff -- tests/comparison-site/variants/custom.css` to see the exact change being tested. Restore the file before
starting another scenario so that separate categories are not mixed together.

## Scenarios

| Variant             | Exact source override                     | Expected changed category      |
| ------------------- | ----------------------------------------- | ------------------------------ |
| `reference`         | None                                      | None                           |
| `custom`            | None until manually edited                | Depends on the single edit     |
| `colors`            | Primary color `#2457d6` → `#c43d2f`       | Colors                         |
| `typography`        | Main heading `40px` → `52px`              | Typography                     |
| `spacing`           | Button horizontal padding `20px` → `36px` | Spacing                        |
| `radii`             | Shared corner radius `8px` → `20px`       | Radii                          |
| `layout-responsive` | Feature grid desktop columns `3` → `2`    | Layout and responsive behavior |
| `interaction`       | Observed hover offset `-2px` → `-8px`     | Interaction states             |

The `damaged-overlay` variant is reserved for fail-closed benchmark coverage. It deliberately obscures the document
with a full-viewport fixed surface and is expected to produce an unusable or incomplete capture, not a changed design
category.

The scenario files are under `variants/`; each contains only its deliberate CSS override. Layout and responsive
behavior overlap in the grid scenario because changing the desktop column count also changes the observed desktop-to-
mobile transition. This is expected, not a category-isolation claim.

These controlled scenarios verify known changes and repeatability. Passing them does not demonstrate accuracy on
arbitrary live websites, where loading, fonts, authentication, data, and dynamic content can introduce other evidence
differences.
