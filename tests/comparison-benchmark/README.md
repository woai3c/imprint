# Comparison Benchmark

This internal benchmark measures the current shared comparison engine against declared ground truth. It reuses the
same `analyze()` and `compareReferenceCaptures()` implementation as Desktop, but it does not write Desktop history or
change analyzer behavior.

The benchmark reports raw counts and individual failures. A passing controlled corpus is not a universal live-site
accuracy claim and does not establish user comprehension or product value.

## Run the controlled corpus

```sh
pnpm benchmark:comparison
```

The command builds the CLI/shared core first, uses only the local deterministic comparison site, and writes:

```text
tmp/comparison-benchmark/<run-id>/report.json
tmp/comparison-benchmark/<run-id>/report.md
```

The report records the Git commit and dirty state, corpus hash, browser, platform, capture summaries, category results,
comparability reasons, evidence-reference failures, and entity-matching summaries. Full tokens, evidence, URLs, and
screenshots are not retained by default. Analyzer data is created in an isolated temporary directory and removed after
each capture pair.

A capture-pair execution error is recorded as a failed scenario with only its error class; it does not abort the rest
of the corpus or persist a potentially sensitive error message.

Use `--keep-artifacts` only when debugging non-sensitive fixtures. It retains screenshots and analyzer data under the
report directory and must not be used casually for authenticated or private pages.

## Corpus semantics

Every scenario declares:

- one capture request, with optional reference/target overrides;
- a source provider;
- a predeclared repetition count;
- an expected overall status and exact changed-category set;
- exact comparability reasons when the expected result is `inconclusive`.

The supported roles are:

- `calibration`: may be used to reproduce failures and choose general behavior;
- `regression-holdout`: protects behavior already known to the implementation authors;
- `prospective-holdout`: added only after the algorithm and evaluation policy are frozen.
- `observe` expectation: records a mutable live-site result without treating observed changes as ground-truth errors.

If the implementation is changed after inspecting a prospective holdout failure, that sample must be reclassified as a
regression holdout. A new untouched sample is required for the next prospective evaluation.

The current controlled variants were already visible during comparison development. They are therefore labeled as
calibration or regression holdouts, never as independent prospective holdouts.

## Evaluation rules

For healthy scenarios, categories are evaluated independently:

- expected `changed`, actual `changed`: detected;
- expected `changed`, actual `unchanged`: missed;
- expected `changed`, actual `inconclusive`: unresolved and reported separately;
- expected `unchanged`, actual `changed`: unexpected change;
- expected `unchanged`, actual `unchanged`: stable.

For intentionally incompatible or damaged scenarios, only `inconclusive` with the declared reasons is a correct
fail-closed result. Returning `changed` or `unchanged` is a fail-closed violation.

Every reported change is also checked for resolvable evidence references:

- `changed` requires reference and target evidence;
- `added` requires target evidence;
- `removed` requires reference evidence.

Entity matching is recorded for every comparable pair. Accuracy is only meaningful for fixtures with annotated entity
identity; unannotated live-site matched/ambiguous/unmatched counts are descriptive, not an accuracy claim.

## Public online observation

Use localhost scenarios for exact ground truth. To observe remote-network behavior, copy the public observation example
into the ignored `tmp/` directory and replace its URL with a public page whose access rules permit the test:

```sh
mkdir -p tmp/comparison-benchmark
cp tests/comparison-benchmark/corpus/public-observation.example.json tmp/comparison-benchmark/public-sites.json
pnpm benchmark:comparison -- --corpus tmp/comparison-benchmark/public-sites.json --allow-network
```

Non-loopback URLs require both `--allow-network` and `source.networkAccessConfirmed: true`. This is an explicit operator
confirmation that the selected public page and access frequency are appropriate; it is not a claim that the operator
owns the site. Credentials, cookies, headers, and browser storage are not accepted by the benchmark schema.

Mutable live sites without a frozen or controlled state may be used to observe capture stability, but their differences
cannot be labeled false positives because the site may have changed. Declare `"expectation": { "status": "observe",
"changedCategories": [] }` for those scenarios. Observation-only pairs are excluded from pass/fail and category
accuracy counts, while evidence-reference invariants are still checked. Keep private corpus files and reports under
`tmp/`; do not commit them.

Localhost supplies controlled known-change ground truth, while public online pages supply remote-network observations.
The benchmark keeps those concerns separate unless a future reproduced failure proves that combination is necessary.

## Anti-overfitting rule

Benchmark ground truth may be scenario-specific, but production analyzer and comparison behavior must remain
site-agnostic. A failure must be reduced to a neutral fixture and fixed through web standards or general DOM/URL
semantics. Do not add hostname, brand, route, CSS-class, test-ID, or named-site branches to make a result pass. If a
case cannot be handled generically, record the limitation.
