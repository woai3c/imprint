# Live website observation corpus

`mainstream-20.json` fixes the public-site sample used for release-time analyzer observation. It is not deterministic
ground truth: sites, consent layers, bot defenses, regional responses, and content can change independently of Imprint.
The annotated local fixtures remain the CI semantic gate.

Run both ten-site batches with at most ten concurrent analyses:

```sh
pnpm test:live-corpus
```

Useful options:

```sh
pnpm test:live-corpus -- --batch 1 --concurrency 5
pnpm test:live-corpus -- --batch 2 --output tmp/live-corpus/release-candidate
pnpm test:live-corpus -- --no-resume
```

The command builds the shared CLI/core once, then loads that build for every site. Each site gets an isolated browser
data directory. Bundles, screenshots, logs, per-site audit reports, run metadata, and summaries are written below
`tmp/live-corpus/`, which is ignored by Git. A resumed run skips only completed `pass`, `degraded-but-truthful`, and
`external-refusal` entries; analyzer failures and interrupted entries run again. Each site has a 15-minute ceiling so
one stalled browser cannot block the entire fixed corpus indefinitely.

Statuses mean:

- `pass`: the complete artifact bundle passed the structural audit without limitations.
- `degraded-but-truthful`: the bundle passed hard invariants and disclosed one or more coverage limitations.
- `external-refusal`: the browser received an access/auth/challenge/response condition that yielded no usable capture.
- `analyzer-failure`: Imprint failed, or its generated bundle violated a hard invariant.

Public corpus output is observation evidence only. Before release, manually inspect foundation colors, component
semantics, responsive guidance, and representative screenshots for every usable bundle; do not turn changing public
site values into exact repository assertions.
