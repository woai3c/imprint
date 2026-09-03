# Analyzer quality follow-up TODO

This file records non-blocking findings deferred after the systemic analyzer quality gate. Add an item only when it is
reproducible but does not materially change the foundation, component role, responsive behavior, or implementation
Tokens that an Agent would choose from `DESIGN.md`.

## Deferred items

- Rejected color candidates can currently combine semantic family counts with rendered-text owner samples from a wider
  use of the same literal color. This can make candidate-only `ownerCount`, `pageCount`, and rendered pair metadata
  disagree. Portable Tokens and the main `DESIGN.md` guidance remain protected by the stricter promotion gate. A future
  cleanup should build every rejected color candidate from one role-specific owner/page set and remove rendered pair
  markers whenever no trustworthy paired surface exists.
- Fractional browser geometry can produce ratios infinitesimally above `1` before serialization. Page and pseudo paint
  extraction now clamp new ratios and the auditor accepts machine-epsilon drift in existing bundles. The rendered-text
  path in `style-extractor.ts` still conservatively demotes such an epsilon-overflow owner instead of publishing a false
  Token; unify that final path later, and retain the tolerance unless geometry moves outside `[0, 1]` materially.
- Guardian and NPR were explicitly rejected in the 2026-09-03 live corpus because persistent large overlays left no
  usable page content. Keep this as a truthful site limitation; do not add hostname-specific dismissal logic.
- Responsive `sequenceIndex` changes can describe a shared absolute offset when an earlier unmatched section appears or
  disappears, even though the paired sections retain their relative order. This is scoped and evidence-backed today,
  but a future refinement should promote `reorder` guidance only when the relative order of paired sections changes.
- Component evidence can preserve CSS Color 4 values such as `lab()` while compact YAML contracts omit them because
  the public color normalizer currently supports only RGB and hex. The detailed recipe and component specs remain
  truthful. Consider a shared CSS Color 4 normalizer before projecting these values into compact Token references.
- Screenshot asset validation currently checks presence, dimensions, hashes, and capture coverage, but not near-blank
  pixels or extreme horizontal-overflow aspect ratios. The Microsoft corpus had one blank overview while its remaining
  page screenshots were usable; Atlassian and NASA truthfully reported overflow but produced some overly wide full-page
  images. Add conservative visual-quality flags without treating screenshots as analysis input or discarding sound DOM
  evidence.

## Not eligible for deferral

- Unsupported global Tokens or dark-mode overrides.
- Cross-transaction, cross-page, or cross-component evidence binding.
- Invalid or unresolved public artifact references.
- A component role or responsive claim likely to mislead an implementation Agent.
- Analyzer crashes or successful runs with no usable evidence.
