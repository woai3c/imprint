# Competitive CLI Benchmark

This is an opt-in, reproducible baseline for comparing website design-system extraction CLIs. It is deliberately separate from `tests/benchmark`: the existing Design DNA corpus characterizes Imprint behavior and is therefore not neutral competitor ground truth.

## What it measures

- Successful extraction from the same local HTML and a nominal 1440×900 desktop viewport
- Recall of manually reviewed, salient colors, font families, font sizes, and corner radii
- Google DESIGN.md alpha lint errors/warnings when a tool emits a compatible document
- Whether the official Google emitter can convert that document to non-empty DTCG JSON
- Warm extraction time; package download/setup time is recorded separately

The primary score is a macro-average of the non-empty token-category recalls. Token names are intentionally ignored because equivalent tools often choose different semantic names.

## Run it

```bash
pnpm test:competitive
```

The default command builds and benchmarks Imprint only. To download and compare every pinned open-source CLI:

```bash
pnpm test:competitive:all
```

Narrow a run when iterating:

```bash
node scripts/competitive-benchmark.mjs --tools imprint,brandmd --fixtures saas-landing,dark-neon
```

Results and raw artifacts are written below `tests/benchmark/results/competitive/`, which is already ignored by Git. A run writes timestamped artifacts plus `latest.json` and `latest.md`.

## Pinned adapters

| Tool       |   Version | Artifact used                                             |
| ---------- | --------: | --------------------------------------------------------- |
| Imprint    | workspace | `DESIGN.md`                                               |
| BrandMD    |    0.16.1 | `DESIGN.md`                                               |
| Dembrandt  |    0.27.1 | `output/<host>/DESIGN.md`                                 |
| designlang |   12.21.0 | Best official-lintable DESIGN.md, with DTCG JSON fallback |

External tools run through `pnpm dlx` at the exact versions above. designlang uses `--system-chrome` and disables dependency install scripts so its optional bundled Chromium download is not part of setup or timing.

## Boundaries

This first phase is a deterministic token/format baseline, not a complete product ranking. It does not yet measure real-site access, authenticated pages, anti-bot behavior, multi-page synthesis, responsive reconstruction, evidence provenance, AI interpretation, false-positive precision, or downstream agent visual fidelity. Those need separate corpora and review protocols; adding them to this score would create false precision.

Update `ground-truth.json` only after reviewing the fixture source itself. When upgrading a competitor pin, record the version change with the result because CLI behavior and output schemas are moving quickly.
