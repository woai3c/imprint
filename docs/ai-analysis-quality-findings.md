# AI Analysis Quality Findings

Last reviewed: 2026-08-11

This document records confirmed quality issues in the Design Intelligence pipeline. It separates deterministic
evidence defects from model-output defects so fixes can be tested independently.

## Current priorities

### P0 — Preserve token evidence used by the AI digest

`selectEvidencePackage()` keeps only the top 40 token-evidence records, while `buildAnalysisDigest()` emits a wider
set of color tokens and looks up their counts in that truncated map. Valid colors can therefore reach the model with
`count: 0`, `pages: 0`, and no roles even though the exported token table contains observations.

Observed impact in GitHub analysis `57178eda-7b1a-4e4a-92ae-20a6555130fe`:

- `accent`, `border`, `border-subtle`, `palette-4`, and `palette-8` were incorrectly described as unobserved in the AI
  digest.
- The model consequently reported false uncertainty around accent, border, and green roles.

Acceptance criteria:

- Every token included in `tokenFacts.colors` retains its matching evidence summary.
- Digest counts and page coverage agree with the deterministic token table.
- Add a regression test with more than 40 token-evidence entries.

### P0 — Surface partial AI status in exported documentation

The database correctly records `design_intelligence_status = partial`, but the exported `DESIGN.md` only displays the
input mode. A reader can mistake a fallback-heavy profile for a fully validated result.

Acceptance criteria:

- Export `complete`, `partial`, or `failed/not available` beside the AI input mode.
- Explain that rejected fields were omitted or replaced with low-confidence fallbacks.

### P1 — Validate evidence relevance, not only evidence-ID validity

The current validator accepts valid IDs even when they belong to an unrelated page or do not support the claimed
property. In the GitHub result, the Enterprise green-CTA claim cites a Profile-page layout node whose token is blue.

Acceptance criteria:

- Color and component claims must cite evidence from the claimed page/section or an explicitly cross-page pattern.
- Exact color claims must reference the matching color token or component style.
- Interaction claims must match the cited changed properties and from/to values.

### P1 — Reject semantic duplicates across profile fields

Distinct compact claim IDs can currently contain the same statement and evidence. The GitHub result repeats the green
CTA claim under both `signatureMoves` and `attention.contrastStrategy`, and repeats the hover claim under
`primaryDrivers` and `stateChangeAmplitude`.

Acceptance criteria:

- Normalize and compare statement, implementation, evidence IDs, and token refs across semantic singleton fields.
- Keep the claim in the most specific field and drop or regenerate duplicates.

### P1 — Improve schema and role-enum recovery

The current Kimi result returned non-object required fields and four unobserved section roles, leaving
`attention.visualSequence` and `sectionGrammar` empty after validation.

Acceptance criteria:

- Make literal enum values language-independent in the prompt.
- Normalize safe localized role aliases before rejecting them.
- Keep status `partial` whenever a required evidence-backed section becomes empty.

### P2 — Improve validation output and recipe defaults

- Convert internal contradiction codes into concise localized explanations in `DESIGN.md`.
- Do not choose the smallest spacing token as the default recipe gap; use the dominant spacing rhythm or a
  representative observed token.
- Add interaction checks that prevent “visible focus ring” claims when cited values are transparent or `none`.

## Comparison baseline

The two runs below analyze different sites, providers, and input modes, so the figures measure pipeline cost and output
shape rather than site-content accuracy.

| Metric               |              Legacy Zhihu run |   Current GitHub run |
| -------------------- | ----------------------------: | -------------------: |
| Pipeline             | two-pass + example generation |          single-pass |
| Input mode           |               structural-only | multimodal, 3 images |
| AI input tokens      |                        56,213 |               10,459 |
| AI output tokens     |                        39,029 |                2,783 |
| Validated claims     |                            56 |                   23 |
| Rejected adjustments |                             2 |                   21 |
| End-to-end duration  |                       620.1 s |              136.0 s |
| Final status         |                       partial |              partial |

The current pipeline is substantially faster and more conservative. The legacy pipeline produced broader, more
complete-looking prose, but its weaker validation allowed unsupported high-confidence claims, semantic token aliases,
and source-branded example components.
