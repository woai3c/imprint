# Analyzer Quality Plan

## Objective

Systematically improve Imprint's evidence promotion and `DESIGN.md` output so that coding agents receive a concise,
truthful, useful representation of the observed design language. This plan replaces site-by-site output patching with
one shared evidence, promotion, and export pipeline used by Desktop, CLI, and MCP.

The work is complete only after controlled tests pass, an independent empty-context review passes, and the original
20-site live corpus has been rerun in two batches of at most 10 concurrent sites and audited for agent usability.

## Non-negotiable rules

1. An observation is not automatically reusable.
2. Component identity confidence and style reuse confidence are separate decisions.
3. Section evidence must not be presented as component evidence.
4. Tokens and component patterns have one canonical derivation; exporters must not independently reconstruct them.
5. Portable artifacts contain promoted design language. Local, weak, declared-only, and unknown observations remain in
   structured evidence instead of being presented as global rules.
6. Deduplication uses normalized value, semantic role, scope, and provenance. Equal strings with different meanings are
   not blindly merged.
7. Analyzer behavior remains site-agnostic. Do not add hostname, brand, route, class-name, or test-ID tuning.
8. Live public sites are mutable observation inputs, not deterministic regression ground truth.
9. Partial or externally restricted evidence may be reported as degraded-but-truthful. It must not be called a full
   pass, but it is not an analyzer defect when the limitation is explicit and no unsupported conclusion is emitted.
10. Functional commits are allowed before the complete goal finishes, but only when the functional slice is complete,
    its controlled tests pass, and its independent review findings are resolved. Never commit a half-fix merely as a
    checkpoint; every commit is followed by continued work toward the remaining review and live-corpus gates.

## Target pipeline

```text
DOM / computed styles / interactions / screenshots
                         |
                         v
              normalized observations
                         |
                         v
          support, semantic, and scope evaluation
                         |
                         v
          canonical promotion decision
            /             |               \
           v              v                v
  portable foundation  component/local  declared/unknown
           |              |                |
           v              v                v
 CSS/Tailwind/DTCG   DESIGN.md P1/P2   Evidence/Tokens JSON
 DESIGN.md contract      summaries       complete evidence
```

## Phase 0 — Baseline and quality contract

- Preserve the current `a.log`, the 2026-08-31 mainstream-site audit, targeted reruns, commit hash, browser version,
  capture coverage, and artifact metrics as the before state.
- Produce a repeatable audit summary containing:
  - terminal status and zero-evidence success detection;
  - page, capture, screenshot, and responsive-pair coverage;
  - strict YAML validity and token-reference integrity;
  - portable low-confidence token count;
  - P1 recipe count, minimum reuse confidence, matching style count, and page support;
  - component recipes containing section-only responsive evidence;
  - repeated detailed component entities across YAML and Markdown;
  - candidate preview size and omitted counts;
  - document section sizes without imposing a total-line target.
- Classify checks as hard failures, honest limitations, or manual visual-review items.

Exit criteria:

- The same audit can be run against controlled fixtures and every live-site artifact.
- A report cannot be called passing merely because it was generated or its YAML parsed.

## Phase 1 — Canonical token candidate and promotion model

Primary files:

- `src/core/analyzer/types.ts`
- `src/core/analyzer/token-builder.ts`
- `src/core/analyzer/token-evidence.ts`
- `src/core/analyzer/analysis-output.ts`
- `src/core/analyzer/style-merge.ts`

Work:

1. Introduce one internal candidate representation for colors, typography, spacing, radii, shadows, borders, z-index,
   and transitions. Retain value, normalized URL support, capture support, source categories, rendered/declaration
   evidence, semantic role, measurement confidence, semantic confidence, and reuse scope.
2. Build candidate values first, calculate evidence second, and promote only after evidence evaluation.
3. Use the existing reuse scopes as actual decisions:
   - `foundation`: portable tokens;
   - `component`: component recipe only;
   - `local`: local/role exception only;
   - `declared-only` and `unknown`: candidate/evidence only.
4. Use cross-URL support for multi-page foundation claims. For one-page analysis, require repeated independent rendered
   use or declaration-plus-rendered evidence; never rely only on a numeric allow/deny list.
5. Keep control-only and specialized spacing local. Do not let repeated viewports count as independent pages.
6. Keep unique semantic typography as role-level observations when it lacks reusable support rather than deleting it.
7. Preserve jointly observed foreground/background and action-role provenance for semantic colors.
8. Rebuild token indices and token evidence after promotion so all references remain valid.
9. Apply the same promotion semantics to dark-mode output; dark overrides may not reintroduce rejected base tokens.

Exit criteria:

- No low semantic-confidence value appears in portable implementation output.
- Single incidental `2px` spacing, local three-instance radius, and unsupported computed typography do not become global
  scales.
- Genuine repeated one-page foundations remain usable within the explicitly observed page scope.
- CSS, SCSS, Tailwind, DTCG, DESIGN.md, Desktop, CLI, and MCP consume the same final token set.
- Every token reference resolves after reindexing, including legacy stored inputs.

## Phase 2 — One canonical component catalog

Primary files:

- `src/core/analyzer/component-detect.ts`
- `src/core/design-context/transfer-grammar.ts`
- `src/core/export/index.ts`
- `src/core/export/component-specs.ts`

Work:

1. Build component patterns once from canonical captures using component type, visual variant, size family,
   representative full-style signature, semantic-role consensus, and provenance.
2. Expose distinct metrics:
   - all identity observations;
   - representative-style matches;
   - normalized page support;
   - identity confidence;
   - reuse confidence and scope;
   - semantic-role agreement.
3. Make YAML summaries, P1/P2 transfer grammar, component tables, and component specs consume this catalog.
4. Require `isReusableComponentPattern()` plus actionable shared style/token evidence for P1.
5. Keep singletons and low-reuse patterns in P2 summaries only.
6. Use representative-style matches as recipe source instances; do not report an entire coarse variant group as one
   exact recipe.
7. Derive `primary-action` only from consistent semantic evidence across matching instances. A first item or a visual
   fill alone cannot assign the whole group a business role.
8. Keep interaction claims only when the observation directly targets a component evidence ID.

Exit criteria:

- Every P1 recipe passes the shared reusable-pattern predicate.
- P1 count never exceeds reusable pattern count.
- P1 source instances equal or are bounded by representative-style matches.
- Identity and reuse confidence are separately visible and used for their proper decisions.
- Mixed-role and singleton groups cannot be promoted as site-wide component recipes.

## Phase 3 — Responsive, media, and topology evidence boundaries

Work:

1. Remove section-derived responsive claims from component recipes. The current schema contains section identities, not
   cross-viewport component identities.
2. Keep responsive evidence in the section-level responsive chapter and group identical facts by URL scope, viewport
   transition, section role, and change signature.
3. Preserve complete page scopes and evidence references in Evidence JSON.
4. Treat default adaptive mobile coverage as limited evidence, not failure and not site-wide responsive proof.
5. Do not force media classification. Improve it only through web-standard semantics such as `figure`, `figcaption`,
   `alt`, ARIA, presentation roles, element kind, geometry, and semantic containment. Remove or avoid class/ID inference.
6. Investigate repeated topology roles against DOM hierarchy and screenshots. Add neutral fixtures before changing
   extraction; do not suppress real repeated landmarks merely to shorten output.

Exit criteria:

- No component recipe contains section grid, section geometry, heading typography, or section visibility claims.
- Section responsive facts remain available with honest scope.
- Unknown media remains unknown unless generic traceable evidence supports a role.
- Topology changes are backed by neutral fixtures and do not hide valid page structure.

## Phase 4 — Artifact ownership and DESIGN.md deduplication

All artifacts continue to be built through `src/core/analysis-artifacts.ts`.

Ownership:

| Artifact              | Owned content                                                                      |
| --------------------- | ---------------------------------------------------------------------------------- |
| CSS / SCSS / Tailwind | Promoted portable tokens only                                                      |
| DTCG Tokens JSON      | Portable tokens plus complete candidate extensions                                 |
| DESIGN.md YAML        | Portable tokens, reusable component contracts, bounded coverage summary            |
| DESIGN.md Markdown    | Human/agent guidance, P1 recipes, scoped responsive facts, boundaries, limitations |
| Design Profile JSON   | P0/P1/P2 claims and evidence references                                            |
| Design Evidence JSON  | Complete pages, instances, local values, candidates, and provenance                |

Deduplication:

1. Keep component totals in `x-imprint.componentSummary`; retain details only for reusable patterns.
2. Expand each P1 component exactly once. Remove the second complete component table when it repeats the same catalog.
3. Summarize P2 by type/count and point structured consumers to evidence artifacts.
4. Define token values once in token sections; recipes reference token names without repeatedly expanding long values or
   font stacks.
5. Candidate previews contain value, support counts, confidence, and omission counts. Full source arrays stay in JSON.
6. Group topology by viewport plus semantic role-tree signature while retaining page counts and example scopes.
7. Group equivalent responsive facts while retaining support counts and scopes.
8. Keep YAML machine coverage; Markdown renders only the human summary and actionable limitations.
9. Do not use a total line-count gate. Gate duplicate detailed entities and per-section ownership instead.

Exit criteria:

- A component has at most one detailed Markdown recipe.
- Non-reusable patterns are not fully repeated in YAML and Markdown.
- Candidate source arrays do not dominate DESIGN.md.
- Aggregated counts in YAML, profile, and evidence agree.
- DESIGN.md remains independently useful to an implementation agent without pretending to contain all raw evidence.

## Phase 5 — Controlled regression matrix

Add neutral fixtures for:

1. responsive section changes with an unchanged nested button;
2. many identified buttons with dispersed styles and weak reuse;
3. one representative component style repeated across pages;
4. singleton spacing, local radii, and singleton semantic typography;
5. equal values with different semantic roles/scopes;
6. mixed primary and ordinary actions;
7. repeated topology signatures across different URLs;
8. nested article headers versus real repeated top-level landmarks;
9. semantically unknown media and standards-backed figure/product media;
10. legacy records missing any newly optional fields.

Required invariants:

- no P1 recipe below the reuse gate;
- no component recipe with section-only responsive assertions;
- no local/low candidate in CSS, SCSS, Tailwind, or primary DTCG groups;
- all token and evidence references resolve;
- repeated viewports do not add page support;
- canonical mobile captures do not inflate component counts;
- Desktop, CLI, and MCP build the same shared artifacts;
- English and Chinese outputs retain the same structure through catalogs, not language ternaries;
- no hostname, route, brand, class-name, or test-ID analyzer branches.

## Phase 6 — Test gates

Run in order:

1. focused unit tests for each changed subsystem;
2. `pnpm test`;
3. `pnpm test:design-evidence`;
4. `pnpm test:e2e`;
5. `pnpm run ci`.

Any discovered regression receives a neutral fixture before the implementation is changed. Do not tune a fixture to
resemble a named public site.

## Phase 7 — Empty-context independent review loop

After implementation and controlled tests pass:

1. Spawn a new reviewer with no conversation context.
2. Give the reviewer this plan, the complete diff, test results, and representative before/after artifacts.
3. Require review of token promotion, component reuse, responsive scope, artifact ownership, deduplication, legacy
   compatibility, site independence, and test adequacy.
4. Fix every evidence-backed correctness or regression issue.
5. Rerun affected tests and the full required gates.
6. Spawn another new empty-context reviewer; do not reuse the previous review context.
7. Repeat until the reviewer reports no blocking correctness findings. Documented unavoidable limitations and minor
   site-specific imperfections may remain when they do not impair agent use.

### Review gate 2 findings (2026-09-01)

The second empty-context review did not pass. These findings are part of the plan and must be closed before live-site
validation:

1. Count distinct rendered owners, not characters, shorthand aliases, box sides, or repeated viewports, when deciding
   whether a one-page value is reusable.
2. Compute semantic confidence independently from measurement confidence using role and provenance agreement.
3. Retain every rejected value in one canonical candidate model with a stable ID and complete evidence; legacy color
   candidate lists are compatibility projections only.
4. Make the normalized complete style signature part of component-pattern identity so two reusable exact styles inside
   one coarse variant remain two patterns.
5. Map dark-mode non-color overrides to explicit base token IDs. Suppress mappings that cannot be established without
   guessing, and revalidate restored records.
6. Audit the complete artifact bundle rather than trusting self-reported `DESIGN.md` summaries.
7. Use one typed token-reference catalog for comparison, evidence ownership, candidate identity, and dark overrides;
   never mix zero-based internal paths with one-based public references.
8. Version the changed Component Specs contract as schema v2.
9. Do not derive business roles or media narrative intent from English implementation tokens or generic alt text.

Remediation order:

1. canonical token identity, owner support, semantic agreement, and candidate provenance;
2. exact-style component identity and standards-backed role/media semantics;
3. dark-mode mapping, reference comparison, and all downstream projections;
4. artifact-bundle audit plus neutral regression fixtures;
5. every controlled gate, followed by a new empty-context reviewer.

### Review gate 3 findings (2026-09-01)

The next empty-context review also did not pass. It identified five remaining architectural gaps; all are blocking the
next review and live-corpus phases:

1. Preserve source-specific owner counts. A value observed in content, controls, and structure must not assign every
   owner to every source. One-page promotion must also support declaration-plus-rendered evidence and the standards-
   backed root page canvas without lowering the independent-owner rule for ordinary values.
2. Make candidate discovery genuinely complete before promotion. Do not cap typography, spacing, radii, shadows,
   borders, z-index, or transition observations in `token-builder`; retain exact rendered colors even when clustering
   merges them. Evidence and scope evaluation, not an early frequency cap, decide the portable catalog.
3. Treat only explicit `primary-action` observations as the primary action contract. A generic button may support an
   action accent, but cannot create `colors.primary` or `colorRoles.primaryAction` by itself.
4. Validate dark evidence against its value. A changed stored value cannot inherit evidence merely because it occupies
   the same path; ungrounded or unmatched overrides must be suppressed and retained as candidates.
5. Recompute artifact claims from the files. The bundle audit must verify screenshot existence, encoded dimensions,
   content hashes, complete candidate equality, direct relational references, and P1 profile/component-spec agreement,
   with mutation tests proving that false self-reports fail.

These findings are implemented and tested before rerunning all controlled gates. A new reviewer must receive a fresh,
empty context and review the resulting code rather than the remediation explanation above.

### Review gate 4 findings (2026-09-01)

Two fresh empty-context reviews independently failed the post-gate-3 tree. Their evidence is consolidated here by
root cause; every item must be closed before another review or the live corpus:

1. Color role assignment is still performed before complete candidate evaluation. On the controlled fixture it
   promoted the small muted surface as `surface` and muted copy as `foreground`, while the dominant white surface and
   main dark ink remained foundation-supported but unassigned. Evaluate exact foreground/background candidates first,
   preserve observed pairing, and assign canvas, surface, secondary surface, main ink, and muted ink from support and
   semantic evidence rather than cluster proximity or raw text frequency.
2. A generic filled action must remain hierarchy-neutral. It may establish an action accent and an `action` component
   treatment, but it must not become `primary`, `secondary`, or `decorative` without direct hierarchy evidence.
3. Input and modal semantic variants are currently partitioned again in Profile after the canonical catalog, while
   Component Specs consumes the unsplit catalog. Move standards-backed semantic partitioning into the canonical
   catalog and make all projections consume the same stable variant identity and style suffix.
4. Capture-local owner ordinals plus per-URL maximum counts prevent viewport inflation but undercount genuinely
   different owners that appear only at different responsive states. Retain stable page-local DOM owner identities and
   union typed per-source owner sets across captures of one normalized URL.
5. The artifact audit uses one untyped global ID set. Replace it with typed maps and validate page/section/component/
   interaction/image ownership, target-kind agreement, global ID uniqueness, and cross-page parent relationships.
6. The artifact audit checks candidate leakage but not exact portable token name/value equality in each CSS, SCSS,
   Tailwind, and DTCG artifact. Parse and compare every formatter independently, including dark catalogs and generated
   DTCG keys, with omission, extra, rename, and value mutation tests.
7. Unassigned colors currently collapse all semantic families into one value-only candidate and roleless colors are
   absent from history comparison. Preserve owner-normalized semantic-family/source distributions in stable candidate
   identities and compare roleless exact observed colors as unordered evidence records.
8. Remove remaining English route, CSS class-name, and test-ID branches from analyzer decisions. Use native HTML/ARIA,
   behavior, computed geometry, and structural evidence; otherwise keep the result unknown or limited.

Remediation order:

1. stable owner identity and exact color candidate/role evaluation;
2. hierarchy-neutral actions and canonical component semantic variants;
3. candidate provenance plus reference comparison;
4. site-agnostic page/component evidence;
5. typed relational and exact cross-formatter bundle audit;
6. controlled artifact comparison and every required gate, followed by another fresh empty-context review.

### Review gate 5 findings (2026-09-01)

The next fresh empty-context review failed despite the controlled happy-path bundle being internally consistent. The
following counterexamples must be closed before another review:

1. Foundation color re-selection can promote a status/action/destructive fill as `surface` or `secondary` because the
   generic `bgColor` alias is counted as support without subtracting specialized semantic owners. Evaluate every exact
   color against all competing semantic categories, and add a status-fill replacement regression.
2. `nth-of-type` locators are not cross-viewport identities. Do not union owner IDs or pair responsive sections merely
   because paths happen to match. Use one canonical matching capture per URL for token support, and require unique,
   standards-backed semantic fingerprints for cross-viewport section/layout pairing; otherwise report the limitation.
3. Exact component style identity omits expected recipe dimensions. Capture line height, letter spacing, height,
   minimum height, and unequal side borders before computing the complete style signature, with a browser regression
   that splits controls differing only on those properties.
4. Remove the remaining English route, class, ID, and test-ID analyzer decisions in page discovery, auth-wall
   detection, and page preparation. Rank URLs by language-neutral structure and link location; use HTTP, native
   form/dialog semantics, behavior, and geometry, or leave the condition unknown.
5. Independently parse and compare every dark CSS, SCSS, and Tailwind catalog with the canonical DTCG dark catalog.
   Mutation tests must fail for missing, renamed, extra, or changed dark implementation values.
6. Complete artifact ownership auditing: validate each evidence reference's type and page/section owner, and compare
   `DESIGN.md` frontmatter tokens and reusable-component details with canonical Evidence/Profile/Component Specs data.
7. Split equal-value color-candidate provenance by semantic family, including family-specific sources, source counts,
   capture counts, owners, and pages. History comparison must report a same-role/value candidate whose material
   provenance changes instead of calling it unchanged.

Remediation order:

1. canonical per-page support and complete color semantic competition;
2. semantic responsive identities and complete component style snapshots;
3. site-agnostic discovery/auth/preparation;
4. family-specific candidate provenance and comparison;
5. dark formatter plus typed ownership/frontmatter audit mutations;
6. all controlled gates and a new fresh empty-context review.

### Review gate 6 findings (2026-09-01)

The fresh review failed and supplied concrete counterexamples. The final implementation and tests must close all seven
groups before review gate 7:

1. Specialized status, action, and destructive fills must compete with generic surface roles; generic aliases cannot
   turn a specialized owner into foundation support.
2. Cross-viewport section and layout matching must use unique standards-backed semantic identities, never
   capture-local `nth-of-type` paths. A node may be paired page-wide when its semantic identity is unique even if the
   nearest extracted section boundary changes by viewport; its cited section owners must retain the same role.
3. Component exact-style identity must include line height, letter spacing, height, minimum height, and unequal side
   borders, and recipe export must not silently truncate the style contract.
4. Discovery, authentication detection, obstruction handling, and page-health decisions must not depend on English
   route words, vendor names, CSS classes, IDs, or test IDs.
5. Dark CSS, SCSS, and Tailwind output must be independently parsed and exactly compared with canonical DTCG dark
   tokens, including missing, extra, renamed, and changed values.
6. Artifact auditing must validate typed ownership for every relation and reconstruct `DESIGN.md` frontmatter token and
   reusable-component maps from Evidence/Profile/Component Specs rather than trusting self-reported counts.
7. Equal-value color candidates must retain family-specific provenance, and history comparison must report materially
   changed provenance even when role and value are unchanged.

The first post-review browser gate exposed one additional neutral boundary: a responsive media node was lost when the
desktop extractor assigned it to `main` and the mobile extractor assigned it to a nested `article`. The fix is part of
item 2: nested section headings no longer identify their ancestors, and unique semantic layout nodes are paired across
the page with typed, same-role section ownership. The `content-feed` regression now proves the observed `180px` to
`120px` media-height change without restoring path-based matching.

### Review gate 7 findings (2026-09-01)

The next fresh empty-context review found two blocking counterexamples. Both must remain covered before another review:

1. Ordinary surface support must subtract the set union of every specialized background owner. Taking the largest
   action, destructive, status, or selected family is insufficient when distinct families share one exact color. Exact
   owner IDs are evaluated as sets; legacy evidence without IDs uses a conservative sum across disjoint semantic
   families so ambiguity cannot create foundation support.
2. A compact account/profile form is not an access wall merely because it contains `autocomplete="username"` and an
   action. Authentication detection now requires a native password credential flow, a composed identity plus one-time
   code flow, an HTTP authorization response, or a blocking credential dialog. Password-change compositions containing
   `new-password` remain analyzable. Page-health classification consumes this same detector instead of applying a
   second password-selector heuristic.

The browser gate then confirmed that compact password-only native forms remain necessary for managed login handoff.
That positive case, the profile-form negative case, the password-change negative case, and the OTP flow are all direct
browser regressions. The full controlled gates and a new empty-context review are required before live validation.

### Review gate 8 findings (2026-09-01)

The next fresh empty-context review found four additional counterexamples. They must remain covered before another
review and the live corpus:

1. Close-valued colors can be merged before role proposal, so exact repeated card surfaces must be eligible to fill an
   absent foundation role from the complete candidate catalog; re-selection cannot require a clustered role slot.
2. Every property used to split exact reusable component identities must survive the canonical recipe projection.
   In particular, grid and inline-flex variants cannot become distinct names with identical exported recipes.
3. An unmatched cross-viewport section label does not prove visibility. Responsive evidence must report an identity
   limitation instead of turning a changed accessible heading or label into invented hide/show behavior.
4. History comparison must preserve semantic candidates whose literal equals another portable color. Value equality
   cannot suppress a border or other provenance record merely because the same value is also the primary color.

These four boundaries require direct neutral regressions, every controlled gate, and a new empty-context reviewer
before Phase 8 begins.

### Review gate 9 findings (2026-09-02)

The next fresh empty-context review found four cross-layer counterexamples. They must remain covered before another
review and the live corpus:

1. Candidate identity is semantic, not literal-only. The evidence stage reconstructs semantic families for every
   rendered exact color, including values already assigned to a portable role, then removes only the family already
   represented by that role. A primary-action literal used by an independent structural border therefore retains the
   border candidate without duplicating its action candidate.
2. A credential form is an access wall only when it is page-level, or when a standards-backed credential dialog
   actually blocks the page. Meaningful visible article/main/section content outside an optional sign-in surface keeps
   the page analyzable; bare password and OTP access surfaces remain positive browser regressions.
3. Every promoted font stack must use the same deterministic, standards-based implementation catalog in DESIGN.md,
   CSS variables, Tailwind v4, SCSS, dark-mode projections, and artifact auditing. Generic fallbacks produce stable
   names such as `font-sans`, `font-serif`, and `font-mono`; multiple stacks in one family receive stable suffixes.
4. Exact font-stack evidence requires an exact normalized stack match. Primary-family alias matching is reserved for
   the separate font-family token, so different fallback systems cannot lend owners to one another.

These boundaries require direct unit/browser regressions, complete artifact-catalog mutation coverage, every
controlled gate, and a new empty-context reviewer before Phase 8 begins.

### Review gate 10 findings (2026-09-02)

The next fresh empty-context review found four identity-boundary counterexamples. They must remain covered before
another review and the live corpus:

1. A mode-specific value never renames its base implementation token. Dark typography values use the base font-stack
   and Tailwind font-weight identities in CSS, Tailwind, SCSS, DESIGN.md, and artifact auditing even when the observed
   generic family or weight changes.
2. A broad landmark is not itself a credential boundary. When an unwrapped OTP composition resolves to `main`,
   `section`, or `article`, independently visible semantic regions inside that landmark remain public content and keep
   the page analyzable; explicit forms, asides, and blocking dialogs retain bounded credential ownership.
3. CSS font-family lists are parsed with quote, escape, and comma state. Exact stack evidence preserves a family such
   as `"Foo, Bar"` as one family, distinguishes it from `Foo, Bar`, and never publishes a syntactically different
   fallback list.
4. Provisional role assignment cannot change rejected candidate identity. Only a role with portable foundation
   evidence suppresses its equivalent semantic candidate, and promotion does not add a second built-token candidate
   when the exact observed semantic candidate already exists.

These boundaries require direct unit/browser regressions, dark artifact mutation coverage, every controlled gate, and
a new empty-context reviewer before Phase 8 begins.

### Review gate 11 findings (2026-09-02)

The next fresh empty-context review found five further cross-layer counterexamples. They must remain covered before
another review and the live corpus:

1. Authentication detection must distinguish a standards-blocking modal credential surface from an optional inline
   credential widget without using viewport-area or large-copy heuristics as the deciding signal. `dialog:modal` and
   `aria-modal="true"` credential compositions are blocking even when compact; independently visible structured
   content outside a credential cluster keeps the page analyzable even when the copy is concise.
2. Implementation-facing typography names are value-derived identities, not array positions. A sparse scale cannot
   call a heading-only `1.75rem` value `base`, and positive tracking cannot be called `tight`. Base-mode identities
   remain stable in dark overrides, and the auditor must enforce explicit semantic-name invariants in addition to
   reconstructing the implementation catalog.
3. Equal-valued color evidence competes only within the same painted-property channel. Specialized background roles
   suppress generic background aliases from the same owner, while the same owner can still provide independent text,
   border, and background provenance for the same literal.
4. Every deterministic claim's `evidenceRefs` must resolve to first-class Evidence entities. Raw color-role locators
   belong in typed provenance; claims cite their matching captured page evidence, and claim-to-bundle integration tests
   must pass the production artifact auditor.
5. CSS font-family identity follows CSS escape semantics. Hex escapes, escaped whitespace, escaped commas, optional
   hex terminator whitespace, and quoted equivalents normalize to the same semantic family without changing the exact
   valid stack selected for export; escaped generic keywords retain generic-family behavior.

These boundaries require neutral regressions, semantic alias mutation coverage, every controlled gate, and a new
empty-context reviewer before Phase 8 begins.

### Review gate 12 findings (2026-09-02)

The next fresh empty-context review found three remaining cases where internally consistent output can still describe
the wrong document or hierarchy. They must be fixed as shared identity/semantics contracts rather than isolated export
patches:

1. A URL query is part of document identity unless the application proves otherwise. Discovery, queue deduplication,
   responsive pairing, evidence IDs, page coverage, and cross-page promotion must preserve distinct query-addressed
   documents. Public artifacts continue to remove credentials, query text, and fragments; a query-safe opaque route
   identity must preserve capture grouping and page counts without leaking query keys or values. Selection may bound
   repeated variants of one pathname, but cannot silently collapse them before capture.
2. Native form submission establishes behavior, not visual or business hierarchy. A submit-capable control is a
   `primary-action` only when it is the sole enabled visible submitter for its form; multiple submitters stay generic
   actions unless independent site-agnostic hierarchy evidence exists. The shared rule must agree across role snapshots,
   computed color observations, Evidence components, Token promotion, deterministic claims, and component recipes.
3. Typography feature tags derive from parsed CSS family-list semantics, never substrings in custom family names.
   Only the first primary stack's actual generic fallback can support `monospace typography` or
   `serif editorial style`; quoted generic words remain custom. The artifact auditor independently reconstructs this
   expectation from DTCG typography and rejects contradictory DESIGN.md feature tags.

Required regressions include query-only routes with distinct rendered documents and sanitized persisted URLs; one-form
multi-submitter negative coverage through browser extraction and artifact promotion; single-submitter positive coverage;
quoted, escaped, and misleading custom font names; and feature-tag mutation failures in the standalone bundle auditor.
Run focused tests, full Node 22 CI, Design Evidence, full E2E, regenerate the controlled bundle, and obtain a new
empty-context reviewer pass before Phase 8 begins.

### Review gate 13 findings (2026-09-02)

The next empty-context review found six remaining cross-artifact inconsistencies. Treat them as shared contracts and
keep their neutral regressions in the permanent gate:

1. Query-addressed documents need a deterministic query-safe opaque route identity. The identity must not depend on
   capture order and must survive persistence. Thread it through Evidence pages, token/candidate provenance, capture
   coverage, responsive ownership, reference comparison, and the standalone auditor; public URLs still remove query
   text. Never reconstruct ownership from a sanitized URL when two documents can share it.
2. Equal-valued colors compete only inside the same painted-property channel. Text, background, and border evidence
   retain independent support; specialized roles suppress generic aliases only within their own channel and owners.
3. Human-facing usage counts report canonical independent owners, not raw property occurrences summed across
   responsive captures. DESIGN.md labels the count basis and agrees with structured Evidence.
4. Agent guidance follows transfer scope. When no P0/core rule exists, local observations cannot produce unscoped
   prohibitions on colors, spacing, typography families, or weights; guidance must be omitted or explicitly scoped to
   matching captured contexts, and the auditor rejects scope contradictions.
5. Font-weight names are value-derived and base-anchored across DESIGN.md, CSS, SCSS, Tailwind, DTCG, and dark
   overrides. Export formats may not use positional aliases for the same semantic values.
6. Native `input[type="image"]` submitters participate in the same form-action hierarchy as buttons and submit inputs.
   A sole enabled visible image submitter is primary; multiple submitters remain hierarchy-neutral; image submitters
   must not be emitted as text-input recipes.

Required regressions include reordered query routes after persisted round-trip and responsive cross-link mutations;
same-literal text/border/background independence; viewport-invariant owner counts; a one-page/P2-only guidance audit;
base/dark weight-name parity across all implementation formats; and sole/multiple image-submitter browser chains.
After fixing them, rerun every Node 22 controlled gate, regenerate and visually inspect the controlled bundle, and use
a new empty-context reviewer before Phase 8.

### Review gate 14 findings (2026-09-02)

The next empty-context review found three remaining identity and responsive-scope failures. Fix them at the shared
evidence boundary and retain direct artifact mutations before the live corpus:

1. Query-safe identity must survive Desktop persistence and legacy comparison, not only new Evidence generation.
   Persist the entry document's deterministic opaque route identity before public URL sanitization, pass it explicitly
   into reference comparison, and use it for history eligibility. Never reconstruct current identities from sanitized
   `final_url`. Legacy evidence with duplicate `(public URL, viewport)` captures and missing route IDs is inherently
   ambiguous: reject it as `ambiguous-page-provenance` before building maps or matching entities instead of silently
   overwriting one page.
2. Typography role counts use one canonical capture per route and report independent observed owners, not raw layout
   nodes summed across responsive captures. The count basis must be explicit in DESIGN.md, viewport-specific type
   changes remain in scoped responsive evidence, and the standalone auditor must reject a mutated count.
3. General topology and structural facts must retain route/viewport scope. Canonical captures supply general facts;
   responsive differences belong in the responsive section. Identical topology signatures within one viewport are
   grouped with support and example routes, while conflicting viewport values cannot appear as simultaneous unscoped
   rules. The auditor must reject conflicting unscoped role/property facts.

Required regressions cover duplicate legacy sanitized pages with no route IDs; distinct persisted opaque identities
for query-only entry documents without query leakage; Desktop history same-route inclusion and different-query
exclusion; canonical typography owner counts across one and multiple routes; typography count mutation; grouped
same-signature topology; and unscoped structural-conflict mutation. Rerun the Node 22 focused, full unit, Design
Evidence, E2E, and CI gates, regenerate and visually inspect the controlled bundle, and obtain a new empty-context
reviewer pass before Phase 8.

### Review gate 15 findings (2026-09-02)

The next empty-context review found six remaining redirect, compatibility, and canonical-selection failures. Resolve
them through shared contracts before live validation:

1. After navigation stabilizes, deduplicate successful captures by resolved document identity and viewport before any
   style merge, Evidence capture append, or analyzed-page increment. Multiple discovered query URLs that redirect to
   one final document produce one capture and globally unique Evidence IDs; failed attempts remain retryable and
   coverage reports the resolved unique documents honestly.
2. Desktop history identity needs an explicit versioned compatibility policy. Migrate legacy records only when their
   original route is recoverable without guessing; keep ambiguous query-redacted records ineligible. A new capture of
   an unambiguous legacy non-query route remains comparable after upgrade, while distinct query documents do not merge.
3. Source-route inference selects an explicit route ID when all captures matching the source URL share one route ID,
   regardless of viewport count. Distinct multi-viewport query entries must be a route mismatch even when callers omit
   the persisted identity.
4. Ambiguous legacy page provenance short-circuits before constructing page maps, compared-page keys, entity matches,
   or category comparisons. An inconclusive result reports no fabricated comparison scope.
5. Typography and structural exports use the same deterministic, health-aware canonical page selection contract as
   the design-context catalog. Viewport preference and eligibility must not depend on capture order; the standalone
   auditor independently reconstructs the contract rather than copying a weaker approximation.
6. Typography Role Evidence includes a localized, typography-specific statement that counts use one canonical
   capture per route and identifies the viewport preference/eligibility basis. The auditor requires the statement in
   both English and Chinese and rejects mutations.
7. Supplemental screenshot metadata records the PNG's inspected pixel dimensions rather than rounded DOM clip
   geometry. Fractional section rectangles must not create false bundle-audit failures or inaccurate image evidence.

Required regressions include converging query redirects in a real browser; globally unique Evidence IDs and truthful
coverage; idempotent legacy migration plus new-record history inclusion; multi-viewport query source inference;
zero compared keys for ambiguous legacy evidence; reordered tablet/mobile captures and unhealthy desktop fallback;
English/Chinese typography-basis mutations; and exact supplemental-image dimension checks in a generated bundle.
Rerun all Node 22 gates, regenerate the controlled bundle, and obtain a new empty-context reviewer pass before Phase 8.

### Review gate 16 findings (2026-09-02)

The next empty-context review found two remaining transaction and summary-selection failures. Resolve both before live
validation:

1. A sub-page capture must not mutate aggregate styles, interactions, motion, components, breakpoints,
   evidence-eligible inputs, or `analyzedPages` until its primary Evidence snapshot and screenshot have completed.
   Stage all per-page results locally and commit them atomically. A failed alias remains retryable by another discovered
   URL resolving to the same document, and failed-page observations never influence Tokens, components, or coverage.
2. Reconstruction Summary hierarchy uses the same deterministic, evidence-eligible, non-severe-overflow canonical
   selector as the rest of DESIGN.md. Prefer the entry route's canonical capture, then a deterministic canonical route;
   omit the hierarchy when none is eligible. The standalone auditor independently reconstructs and validates this
   summary rather than trusting generated prose.

Required regressions include one-shot post-dedup/pre-Evidence failure followed by a successful converging alias; no
aggregate contamination when all aliases fail; unhealthy desktop fallback to tablet independent of capture order;
severe-overflow tablet fallback to mobile; and a mutated Reconstruction Summary hierarchy rejected by the bundle
auditor. Rerun all Node 22 gates, regenerate the controlled bundle, and obtain another empty-context reviewer pass
before Phase 8.

### Review gate 17 findings (2026-09-02)

The next empty-context review found two remaining transaction and authentication-boundary failures. Resolve both
before live validation:

1. Nested discovery belongs to the same page-local transaction as styles and Evidence. Links and discovery issues
   observed on a sub-page must not update the shared queue, discovered/selected coverage, or later design aggregation
   until that parent page's primary Evidence and screenshots have completed. If every converging alias fails, a child
   visible only on the failed document must never be requested or contribute Tokens, components, or Evidence. When a
   later alias succeeds, its nested links may be committed exactly once.
2. Authentication detection must enforce the Gate 11 semantic modal boundary. A large or positioned non-modal
   `dialog[open]` is not a blocking login dialog merely because it covers a viewport-area threshold. Require a native
   `:modal` dialog, `aria-modal="true"`, or independently verified inert/non-interactive outside-content semantics;
   leave purely visual obstruction handling to page health. Compact native and ARIA modal credential dialogs remain
   positive cases.

Required regressions include all converging aliases failing after nested discovery with zero child requests and no
child-only design values; first alias failure followed by a successful alias that introduces its child once; a large
non-modal credential dialog beside meaningful public content remaining analyzable; and native/ARIA modal positive
controls. Rerun all Node 22 gates, regenerate the controlled bundle, and obtain another empty-context reviewer pass
before Phase 8.

### Review gate 18 findings (2026-09-02)

The next empty-context review found three remaining discovery and authentication boundary failures. Resolve them
before live validation:

1. Unresolved raw aliases cannot consume the remaining unique-document capacity for nested discovery. A successful
   canonical parent must be allowed to discover children whenever the committed unique-page count leaves capacity,
   even while additional aliases are still queued. Final processing remains bounded by successful unique pages, and
   queued identities remain deduplicated.
2. Record a candidate's resolved identity immediately after navigation commits, before HTTP, HTML, authentication,
   preparation, or health rejection. This early identity is used only for alias and selected-count accounting; it must
   never mark the page analyzed or prevent a later alias retry. A first alias resolving to a 503 canonical and a later
   successful alias represent one selected document and complete coverage.
3. Auth-wall decisions use complete standards semantics: an empty-visible-text native credential form is still direct
   evidence; `input[type="image"]` is a native submit action; meaningful standalone figure/SVG/canvas content is public
   counter-evidence; and a non-modal credential dialog is blocking when meaningful outside content is independently
   verified as inert. Do not reintroduce viewport-area or copy-length heuristics as the deciding auth signal.

Required regressions include three converging aliases with failure then success while another alias remains queued and
one child slot remains; a 503 resolved alias followed by a successful alias with one selected document and complete
coverage; inert-outside dialog, textless password form, and image-submitter positives; and a standalone figure/SVG
public-content negative. Format every new source file, rerun all Node 22 gates, regenerate the controlled bundle, and
obtain another empty-context reviewer pass before Phase 8.

### Review gate 19 findings (2026-09-02)

The next empty-context review found two remaining site-agnostic classification failures. Resolve both before live
validation:

1. Auth-wall classification must not depend on total copy length, control count, or viewport-area thresholds. Determine
   whether a credential surface blocks the page from standards-backed credential composition and structural ownership.
   Native password forms remain direct credential evidence; independent semantic articles/sections and accessibly named
   figure, SVG, or canvas content remain public counter-evidence at any rendered size. Native `:modal`,
   `aria-modal="true"`, and independently verified inert outside content remain blocking.
2. Page identity must not blacklist a vendor or brand name. Retain healthy metadata regardless of brand, and suppress
   identity only through generic interstitial semantics or explicit unusable/auth/captcha/error/rate-limit/navigation
   health evidence.

Required regressions include a native password form containing more than 5,000 characters; a concise independent
article beside an optional password form; small accessibly named SVG and canvas content beside an optional password
form; all existing textless/image/inert/modal/non-modal controls; healthy brand identity retention; and blocked-health
identity rejection. Rerun all Node 22 gates, regenerate the controlled bundle, and obtain another empty-context
reviewer pass before Phase 8.

### Live gate 20 findings (2026-09-02)

The first ten-site batch exposed four shared artifact-contract failures and one audit false positive that the controlled
single-page bundle did not cover. Stop the live corpus before batch two, fix these at their shared boundaries, and pass a
new empty-context review before rerunning batch one:

1. Component Profile and Component Specs currently project the same representative pattern differently. Profile keeps
   every representative component ID, while Component Specs sorts a mixed component/section/image reference list and
   truncates it to 24. Define one bounded, component-owned representative evidence sample in the canonical component
   catalog and make both artifacts consume it. Complete instance and image provenance remains in Design Evidence JSON.
2. The component grammar truncates the combined P1/P2 list only after global ranking. On component-rich sites this
   fills all 14 slots with P1 recipes, hides the existence of the remaining P2 patterns, and still repeats every reusable
   pattern in top-level YAML component tokens plus `componentSummary.details`. Build the complete canonical projection
   first, select a bounded and type-balanced P1 set, summarize the remainder by type as P2, and enforce artifact
   ownership: actionable component tokens in YAML, aggregate counts in `componentSummary`, one detailed P1 Markdown
   recipe, reusable contracts in Component Specs JSON, and complete raw patterns/provenance in Design Evidence JSON.
   Exact styles observed on different pages are already coalesced by the canonical catalog; visually distinct styles
   must not be blindly merged merely because their component type or literal values match.
3. Radius owner-count failures in Airbnb, Atlassian, Cloudflare, DEV, and GitHub are auditor false positives. The
   exporter reports the correct radius counts, but the auditor searches the whole document by literal value and reads
   an earlier spacing line when both groups contain values such as `4px` or `12px`. Scope count validation to the
   localized spacing and radius subsections and match each ordered token entry inside its own group.
4. Screenshot asset coverage is inferred from extraction-issue messages instead of the Evidence pages actually
   produced. A dimension-readable but clipped full-page bitmap is correctly demoted to `region-crop`, yet coverage can
   still claim a valid overview. Derive coverage from pages containing an `overview` image and disclose partial
   overview coverage while retaining useful bounded crops.
5. Identical horizontal-overflow facts are emitted once per route while ordinary topology signatures are grouped.
   Group overflow facts by viewport and measured geometry, retaining route support and examples; keep distinct
   geometries separate.

Guardian's first-batch failure is an external access restriction: every candidate is covered by a full-page consent
choice dialog and the analyzer deliberately does not accept or reject consent on the user's behalf. Do not add
language-, CMP-, or site-specific clicks. Record the exact attempt as externally restricted/degraded rather than an
analyzer defect, provided the run report explicitly preserves the reason and does not emit unsupported design claims.

Required neutral regressions include more than 24 representative component instances with exact Profile/Specs
agreement; many reusable/actionable variants across several component types with bounded P1 details and non-empty P2
summaries; same-literal spacing/radius values with different owner counts plus missing/mutated radius lines in English
and Chinese; a two-page bundle where one clipped bitmap becomes a region crop and coverage is `1/2 partial`; and two
routes sharing one overflow geometry plus a third route with a distinct geometry. Rerun all Node 22 focused and full
gates, regenerate a multi-page/multi-component controlled bundle, and obtain a new empty-context reviewer pass before
restarting the live corpus.

### Review gate 21 findings (2026-09-02)

The next empty-context review confirmed the Gate 20 generation paths agree, but found four false-negative classes in
the standalone artifact auditor. Resolve them before using that auditor as the live-corpus gate:

1. Reconstruct the bounded, type-balanced P1 detail set from Design Profile and verify the exact rendered recipe
   identities and per-type budget, not only the number of `####` headings. Verify the rendered recipe evidence metrics
   against the selected Profile records.
2. Reconstruct every P2 component summary by type from Design Profile and verify both pattern and representative-instance
   counts. A merely non-empty local-pattern block is not sufficient.
3. Reconstruct all three candidate preview groups from the Evidence token catalog and verify ordered `{ value,
pageCount }` records plus total/included/omitted counts. Shape-only validation cannot prove the preview is truthful.
4. Reconstruct horizontal-overflow groups from Evidence using viewport, content width, viewport width, and query-safe
   route identity. Verify every expected group, its geometry, route-support count, and examples; reject missing groups,
   altered support counts, or merged distinct geometries.

Required regressions mutate English and Chinese generated bundles: wrong P1 identity or type selection, missing or
miscounted P2 types, candidate values/page counts/order, and overflow group deletion/support/geometry. Every mutation
must produce a hard failure. Rerun the Node 22 focused and full gates, regenerate the real multi-page projection, and
obtain a different empty-context reviewer pass before Phase 8.

### Review gate 22 findings (2026-09-02)

The fresh Gate 21 reviewer reproduced three remaining compound false negatives. These are source-of-truth defects, not
site-specific exceptions, and must be closed before the live corpus:

1. Candidate previews must be generated and independently audited from canonical `tokens.candidates.values`. The legacy
   `tokens.candidates.colors` array is a compatibility projection only; deleting one legacy entry must never change the
   DESIGN.md total, preview, or order while its canonical record remains.
2. Horizontal-overflow groups must be generated and independently audited from every Evidence page. Ordinary section
   topology may use `evidence.topology.pages`, but a missing topology index must not erase a page's directly observed
   overflow measurement.
3. Profile and Component Specs must expose the same raw ordered component-only evidence sample. Enforce uniqueness,
   canonical page/type/style ownership, the exact `min(sourceInstances, 24)` length, and deterministic route-balanced
   order; do not sort, deduplicate, or discard invalid references before comparison.

Required neutral regressions cover a canonical candidate retained after its legacy projection is removed, an overflow
page absent from the topology index, and a route-balanced component pattern with more than 24 instances plus duplicate,
reordered, wrong-type, and non-component sample pollution. Rerun all Node 22 gates, regenerate the real projection, and
obtain another different empty-context reviewer pass before Phase 8.

### Review gate 23 findings (2026-09-02)

The Gate 22 reviewer proved that type plus exact CSS is not a complete canonical component identity. A real GitHub P1
icon button and P2 text button shared the same type and complete styles but were correctly separated by rendered
geometry; replacing one P1 reference with the P2 instance in Profile assertions and Component Specs still passed the
auditor.

Resolve this at the catalog boundary:

1. Independently reconstruct canonical component patterns in the standalone auditor from canonical Evidence instances,
   including button visual variant, measured size family, semantic subtype/status role, card/button style family, and
   complete style signature.
2. Match every Profile/Spec recipe to exactly one reconstructed pattern by its final exported variant identity. Validate
   source instance count, matching-style count, page count, identity/reuse metrics, role, styles, token references, and
   the unconditional route-balanced `slice(0, 24)` evidence sample from that exact pattern.
3. Treat zero or multiple catalog matches and any reconstructed count mismatch as hard failures. Never skip the exact
   sample comparison because a broader candidate set has a different length.

Add a neutral regression with same-type, same-style buttons split only by square icon geometry versus text geometry;
jointly polluting Profile evidence/assertions and Specs with the other pattern must fail. Recheck the reviewer's real
reproduction, rerun all Node 22 gates and the nine-site projection, then obtain a different empty-context review pass
before Phase 8.

### Review gate 24 findings (2026-09-02)

The fresh Gate 23 reviewer confirmed exact canonical component identity and samples, but reproduced three remaining
systemic false negatives. Resolve them together before the live corpus:

1. The standalone auditor must independently recompute component reuse and actionability from canonical Evidence,
   complete styles, and all shared token dimensions. Require the exact actionable set to be P1 and present in Component
   Specs, with every other canonical pattern P2. A synchronized Profile/Specs/DESIGN downgrade or promotion must not
   evade the gate.
2. Recompute every `componentSummary` total from the independently reconstructed catalog, including patterns,
   instances, reusable patterns, actionable patterns, rendered/omitted P1 patterns, YAML contracts, omitted local
   patterns, and omitted reusable patterns. Internally consistent forged arithmetic is still a hard failure.
3. Group responsive observations before the 20-record human projection. The identity of a group is viewport
   transition, section role, displayed change type, and the complete ordered property/value change signature. Preserve
   unique route support, observation-instance support, and a bounded deterministic route example list. Exact same
   facts within and across routes collapse into one supported fact; different values remain separate. The standalone
   auditor must independently rebuild and compare the complete rendered groups in English and Chinese.

Required neutral regressions synchronize an actionable P1 downgrade and a reusable-but-non-actionable P2 promotion;
forge all component summary totals while preserving their internal arithmetic; and cover repeated same-role sections on
one route, the same fact on another route, and the same property with different values. Recheck the reviewer's three
real reproductions, rerun all Node 22 gates and the nine-site projection, and obtain another different empty-context
review pass before Phase 8.

### Review gate 25 findings (2026-09-02)

The fresh Gate 24 reviewer confirmed the canonical component catalog, actionability reconstruction, component-summary
totals, and grouped responsive facts, but reproduced three remaining Agent-facing audit false negatives. Resolve them
together before the live corpus:

1. Independently derive every component recipe's semantic `useWhen` value from canonical Evidence. In particular, a
   button is a `primary-action` only when at least 80% of the pattern's style-owning observations carry that role;
   otherwise it is an ordinary `action`. A synchronized Profile and DESIGN.md semantic promotion must not evade the
   gate.
2. Reconstruct each selected P1 recipe's complete localized Markdown projection from independently verified Profile
   data and canonical Evidence. Validate the exact owned recipe block, including heading, evidence metric, use case,
   observed statement, ordered related-token references, complete ordered representative styles, observed states,
   responsive facts, and non-common restrictions. Reject missing, changed, reordered, or extra Agent-facing lines.
3. Require the localized responsive-observation subsection to occur exactly once, inside its owning Design Evidence
   Overview section, whenever canonical responsive groups exist, and zero times otherwise. A second heading or extra
   contradictory group anywhere in the document is a hard failure even if the first subsection is valid.
4. Treat `imprint.design-system/2` as an explicit bounded-projection contract. Deleting a required summary field must
   fail validation rather than silently downgrading the document to the legacy component-summary contract.

Required neutral regressions cover English and Chinese token-reference and representative-style mutation, omission and
extra lines; synchronized ordinary-action-to-primary promotion plus a genuine >=80% primary-action positive control;
and duplicate/misowned responsive headings with forged groups. Also remove a required bounded-summary marker while
retaining the v2 schema and require a hard failure. Recheck all three reviewer reproductions, rerun every
Node 22 gate and the nine-site projection, and obtain a different empty-context reviewer pass before Phase 8.

### Review gate 26 findings (2026-09-02)

The fresh Gate 25 reviewer confirmed the new recipe semantics, complete P1 projection, responsive subsection ownership,
and explicit v2 contract checks, but found four remaining systemic problems. Resolve them together before the live
corpus:

1. Treat generated Agent-facing Markdown facts as globally owned projections, not merely locally correct subsections.
   Parse localized responsive group/value records across the complete document and require every record to belong to
   the unique Responsive Structure Observations subsection. Likewise, parse component-recipe headings and recipe-shaped
   blocks across the complete document and require the global set to equal the selected P1 recipes owned by Components.
   Extra, duplicated, or contradictory projections anywhere else are hard failures even when the owning section is
   otherwise exact.
2. Replace the geometric `fixed|sticky` overlay shortcut with an obstruction classifier. Ordinary semantic headers and
   navigation, small non-modal banners, and edge-anchored chrome must not make a complete page evidence-ineligible.
   A genuinely blocking overlay must still be detected from general DOM semantics and geometry, without host-, class-,
   or vendor-specific branches. Preserve an explicit local limitation for partial obstruction rather than discarding
   the entire page, and deduplicate identical public limitation text after internal page scopes are removed.
3. Never infer a font choice from an empty promoted typography catalog. If no portable font family was established,
   export a localized evidence-limited statement that directs consumers to local Evidence; do not claim the site uses
   the system default. The standalone auditor must independently require this empty-catalog projection.
4. Re-evaluate the Dropbox projection after the health-classifier fix. A visually usable capture with substantial
   sections/components/layout evidence must not collapse to an empty design system solely because a normal top bar or
   small banner is fixed. Genuine access-blocking pages must remain degraded and excluded.
5. Make candidate-leak auditing token-dimension aware. An equal literal in another namespace (for example, a rejected
   spacing value equal to a valid breakpoint width) is not a candidate promotion. A candidate is leaked only when its
   value appears under the matching implementation-token dimension, while same-dimension leaks must still fail.

Required neutral regressions cover English and Chinese responsive-shaped facts outside the owning subsection and P1
recipe-shaped blocks outside Components; ordinary sticky header, small non-modal banner, and genuine blocking-overlay
browser fixtures; and English/Chinese empty-font-catalog wording plus mutation. Recheck both reviewer tamper bundles,
rerun Dropbox and the complete nine-site projection with the current analyzer where necessary, cover cross-dimension
candidate/breakpoint equality and a true same-dimension leak, rerun every Node 22 gate, and obtain a different
empty-context reviewer pass before Phase 8.

### Review gate 27 findings (2026-09-02)

The fresh Gate 26 reviewer confirmed that the original Gate 25 tamper bundles now fail, Dropbox retains usable
evidence, and the nine-site projection has no failures under the current auditor. It nevertheless produced three new
artifact/health counterexamples. Manual review of the same live artifacts also found three material token-promotion
errors and one recurring geometry class that the structural gates do not yet cover. Resolve these as one promotion and
ownership boundary before Phase 8:

1. Audit Agent-facing Markdown by normalized block structure, not one exact Markdown spelling. Recipe ownership must
   recognize recipe headings at every rendered subheading level and recipe-marker blocks with no heading; blockquote
   and nested-list prefixes must be normalized before detecting localized responsive group/value records. Every such
   projection must belong to its unique owning section and equal the canonical projection. English and Chinese H5,
   heading-free, blockquote, and nested-list mutations must fail.
2. A rejected non-color candidate may not duplicate a portable value in the same typed token dimension. Such a record
   is an internally contradictory catalog even when the implementation declaration legitimately belongs to the
   portable token; reject the candidate/catalog conflict and retain the cross-dimension breakpoint exception. Equal
   color literals may remain separated only by explicit semantic-family identity. Test spacing and border candidates
   synchronized to an existing same-group portable value, plus an equal spacing/breakpoint value.
3. Overlay obstruction follows the actual center hit chain. A full-screen fixed ancestor with
   `pointer-events: none` remains blocking when its centered descendant receives pointer events and owns the center
   hit. Ordinary sticky/fixed page chrome and edge banners remain eligible. Cover the transparent-pointer backdrop,
   interactive centered child, edge banner, and fixed-header controls in one neutral browser matrix.
4. Select ordinary foundation text roles jointly with the selected background from directly observed text/background
   pairs. Rank route-balanced paired support and normalized observed share before weak element-role labels; require a
   readable observed pair, and never replace a readable paired foreground with a cross-route but unrelated-surface
   foreground. Re-evaluate `muted-foreground` after foreground replacement so an inverse foreground cannot merely move
   into another global text role; it must be directly readable on the foundation background and visibly less emphatic
   than the selected foreground. Persist both paired-surface decisions in token/candidate evidence so the standalone
   auditor can reject unreadable, dominated, or role-shifted foundation pairs. If no sufficiently supported readable
   pair exists, omit that global text role and retain local pairs in Evidence instead of guessing.
5. Foundation radii require independent non-control, non-pill support. Values dominated by
   `geometry:circle-or-pill`, control, or specialized owners remain component/local candidates regardless of route
   recurrence; a few incidental content owners cannot globalize a sentinel such as `980px` or `9999px`. Ordinary
   repeated surface radii remain portable, and pill geometry remains available in component recipes/Evidence.
6. A reusable spacing scale contains positive spacing decisions, not overlap offsets or repeated layout geometry.
   Classify negative margins as geometry. Values above 96px require stable integral measurement and more than one
   independent foundation owner per supporting route; fractional large values and one-owner-per-route layout offsets
   remain structured candidates. Centered inline offsets remain geometry. This is an evidence rule, not a document
   line cap: complete observations stay in Evidence JSON and genuine repeated structural spacing can still qualify.
7. Validate the live failures directly after the neutral regressions: DEV must not publish the sparse orange
   `#d97706` as the global foreground; GitHub must not pair `#ffffff` with `#f0f6fc`; Apple must not publish `980px` as
   an ordinary radius; DEV's `348.766px` and Dropbox's `216px`/`258.5px` must not appear in the reusable spacing scale
   unless new evidence satisfies the shared rule. Inspect the corresponding screenshots and DESIGN.md guidance, not
   only audit exit codes.

Required regressions cover every reviewer reproduction under `/tmp/imprint-gate26-*`; light, dark, and mixed-surface
foreground fixtures; sparse cross-route accent text versus dominant readable text; repeated pill controls plus modest
surface radii; negative margins, large fractional geometry, one-large-owner-per-route geometry, and repeated integral
structural spacing. Rerun DEV, GitHub, Apple, and Dropbox first, then regenerate and audit the complete nine-site
projection. Rerun every Node 22 controlled gate and obtain a different empty-context reviewer pass before Phase 8.

### Review gate 28 findings (2026-09-02)

The fresh Gate 27 reviewer confirmed the previous adversarial Markdown, overlay-hit-chain, foreground/background,
radius, and spacing fixes on the controlled and nine-site artifacts, but reproduced five remaining promotion and page
health defects. A separate semantic-collision audit of the same nine-site artifacts found one additional Agent-facing
reference defect. Resolve all six at the shared evidence boundary before Phase 8:

1. Distinguish a fixed application/document shell from a blocking overlay. A viewport-sized fixed root that owns the
   page's meaningful landmarks and content is eligible page layout; a modal, dialog, backdrop, or obstruction that
   covers meaningful content outside its subtree remains blocking. Use DOM semantics, hit ownership, content
   containment, and geometry without class-, host-, or vendor-specific rules. Add a neutral fixed dashboard shell
   alongside genuine modal/backdrop controls to the browser health matrix.
2. Evaluate large structural spacing support independently on every canonical route. A value above 96px is foundation
   only when each supporting route contributes at least two independent foundation owners; three owners on one route
   plus one on another must not pass. Union owner identities across compatible source categories so the same DOM owner
   cannot receive double credit.
3. Apply the same independent-owner rule to extreme ordinary radii. A sentinel-sized radius such as `980px` observed
   on one oversized content owner per route remains local even when extraction labels it ordinary. Do not double-count
   `computed:ordinary-radius` and `element:content-radius` for one owner; retain normal repeated surface radii and pill
   geometry in their correct scopes.
4. Rank foreground pairs from direct semantic pair evidence, canonical-route support, and normalized observed share;
   excess contrast alone must not outrank a dominant readable pair. A dominant body pair on four routes must beat a
   sparse black pair on two routes, while direct body/heading breadth may distinguish a genuine primary foreground
   from a widely repeated muted role. The standalone auditor must independently reconstruct the same ordering.
5. Persist independent matched pair-owner support. On a one-page analysis, one incidental text owner cannot become a
   portable foreground merely because its pair is readable; require at least two rendered owners, or independent
   declaration-plus-rendered support where that provenance exists. Independently audit owner count, per-route support,
   and pair eligibility instead of trusting the emitted reuse scope.
6. Resolve equal color literals by CSS property channel and semantic token role, not value alone. Component text must
   never reference a background or border token merely because their literals match; backgrounds and borders obey the
   corresponding role families. If no semantically compatible portable token exists, preserve the literal in the
   component recipe. Apply this to canonical Evidence references, DESIGN.md YAML replacement, and the standalone
   auditor, with neutral equal-literal collision regressions for text, background, and border properties.

Recheck `/tmp/gate27-review-repros.mjs`, add the neutral semantic-color collision bundle, rerun the affected focused
tests, every Node 22 controlled gate, and the current nine-site projection. Then obtain a new empty-context reviewer
pass from a different Agent before Phase 8.

Implementation validation also exposed a selection-boundary defect while regenerating DEV: the highest-ranked
foreground pair could fail portability after selection, causing the role to be omitted even when the next directly
observed pair was portable. Ranking and promotion must therefore share one eligibility boundary: filter out
non-portable pair candidates before choosing the winner, then fall back to the next eligible pair rather than deleting
the role after ranking. A neutral regression must cover a semantically conflicting top pair followed by a valid
dominant pair, and the regenerated DEV artifact must retain the latter with matching pair/evidence owner support.

### Manual gate 28 projection findings (2026-09-02)

The current nine-site projection passes the structural auditor, but screenshot-to-DESIGN.md inspection found a
material component-contract defect that the hard gates do not yet detect. Native component roots and semantic
containers can carry browser-default or merely inherited text styles while their visible labels are styled on
descendants. Content-driven container height can likewise vary without defining a reusable component variant. The
current complete-style identity promotes those incidental root values into P1 recipes: examples include default
`Times`/`Arial` typography on otherwise branded controls and navigation, several list variants split only by content
height, a large live region described as inline status feedback, and contrast warnings computed from a container's
inherited color instead of visible text. Resolve this as one type-aware component-style ownership rule before the
independent review:

1. Separate component-boundary properties from visible-content properties. Background, border, radius, shadow,
   padding, display, and gap belong to the detected component root. Typography and foreground belong only to a
   directly rendered text owner; a wrapper's inherited/default text values must not masquerade as its visible label.
2. For text-bearing controls (`button`, `input`, and `tab`), use the root when it directly renders text, otherwise use
   a visible descendant that directly owns the label. Icon-only controls may retain an observed current-color channel
   where relevant, but must not emit browser-default typography without rendered text.
3. Treat content-driven height/min-height on list, card, table, modal, and status containers as observed sample
   geometry, not reusable style identity. Keep fixed control and navigation height where it is an actual component
   boundary decision. Preserve all raw rectangles in Evidence JSON.
4. Do not make broad `aria-live`/status containers actionable merely from native semantics and recurrence. A detailed
   status recipe needs a visible boundary or compact directly owned status content; otherwise retain its identity as
   P2/raw Evidence. Genuine repeated badges, alerts, and bounded feedback remain eligible.
5. Build style identity, shared token references, DESIGN.md recipes, Component Specs, and contrast checks from this
   same type-aware style record. Containers without directly owned visible text must not produce text contrast claims.
   The standalone auditor must reject P1 recipes that reintroduce type-irrelevant default typography or
   content-driven container height.

Required neutral regressions cover an unstyled native button with a branded nested label; an icon-only control; nav,
list, and card roots with browser-default typography but styled descendants; repeated lists that differ only by
content height; a large live region; a compact bordered status; and a fixed-height navigation shell. Regenerate and
inspect Dropbox, BBC, GitLab, Atlassian, and Apple first, rerun the current nine-site projection, all Node 22 gates, and
only then ask a new empty-context reviewer to assess the final code and artifacts.

### Manual gate 29 live finding (2026-09-02)

The exact-code Apple rerun exposed a narrower ownership defect inside the preceding rule: a descendant can be present
in the rendered DOM and own text while its glyphs are intentionally clipped into a screen-reader-only box. Carousel
dot tabs then retained their correct 1–8px visual boundary but incorrectly acquired the hidden label's 17px typography,
foreground token, and text-control contrast semantics. DOM text presence and a non-zero element rectangle therefore
do not prove a visible text-style owner.

Resolve this at the shared text-owner boundary without site or class-name exceptions:

1. A direct text owner must have non-empty direct text, meaningful glyph geometry, non-trivial element geometry, and
   no CSS clipping/clip-path/content-visibility treatment that prevents the label from being visually observed.
   Explicitly reject the conventional tiny clipped accessibility-label geometry. Keep native text inputs as text
   owners because their value/placeholder rendering is not represented by descendant text nodes.
2. Apply the same rendered-glyph predicate in the legacy component detector and Design Evidence extractor. If a
   control has only an accessible name or clipped label, retain its visual boundary recipe but omit typography,
   foreground token references, and text-contrast claims.
3. Add neutral fixtures for an icon/dot control containing a clipped screen-reader label next to a genuinely visible
   nested label. Assert both extraction paths preserve the visible label and suppress the clipped label. Regenerate
   Apple after the controlled test passes, then re-audit its tab recipes before completing the nine-site projection.

The complete exact-code nine-site projection then exposed five additional cross-layer boundary defects. Treat them as
one final manual gate before independent review; none may be repaired with host, route, class, or vendor exceptions:

4. Component-adjacent prose must obey the same bounded P1 selection as rendered component recipes and frontmatter
   contracts. Contrast notes for omitted P1 contracts currently re-expand hidden patterns and can compare a large
   image-backed control's foreground with an irrelevant root fill. Generate component contrast notes only for the
   exact selected P1 catalog shown in DESIGN.md; complete contracts and lower-priority evidence remain in JSON.
   Independently reject any contrast note whose component is outside that selected catalog.
5. A native input element is not automatically the visible text owner. Prefer its non-transparent current value or
   placeholder style when one is visibly painted; otherwise look for a visibly rendered label inside the detected
   visual input boundary. Never export a fully transparent foreground as a component recipe color. Retain native
   input geometry and typography only where their observed rendering is supported, and cover visible placeholders,
   transparent internal inputs with sibling labels, and empty non-text inputs in neutral browser fixtures.
6. Square geometry does not prove an icon-only button. Component variant classification must consume the text-owner
   fact: a compact square control with rendered text (for example, a calendar day) is text/action, while a same-sized
   control without rendered glyphs remains icon. Keep the rule identical in the canonical catalog, fallback export,
   Component Specs, and standalone auditor.
7. Raw DOM mutation-record volume is diagnostic, not by itself evidence corruption. A stable, readable page with
   continuous animation or telemetry attributes may remain `degraded` and retain the `dom-still-mutating` warning,
   but it must stay evidence-eligible when no independent unsafe condition exists. Skeletons, missing fonts, empty
   content, blocking overlays, access walls, HTTP failures, and navigation failures remain exclusionary. Add a neutral
   continuously mutating but visually stable page beside the existing unsafe health fixtures. This specifically
   repairs the generic failure in which seven of nine Cloudflare captures were discarded despite usable screenshots.
8. Foundation color re-selection must preserve the semantic constraints used by the initial role builder. `border`
   and especially `border-subtle` cannot be filled by an action/focus accent merely because it also appears in a
   control border. A subtle border must be neutral, structurally observed, and distinct from the selected background
   and surface; a default border must be neutral or have direct structural-border support and must also remain
   distinguishable from its foundation surfaces. Otherwise keep the value as a scoped candidate/component literal.
   Add neutral action-accent-versus-structural-border and background-equal-border regressions, and independently audit
   the final role evidence.

After these changes, rebuild and rerun the complete nine-site projection from the same code. Manually verify that
Cloudflare retains its observed orange design language with honest scope, Airbnb's repeated calendar cells are not
icon recipes, GitHub does not recommend transparent input text, Dropbox does not call action blue a subtle border,
and no contrast note names an omitted component contract. Only then proceed to the empty-context review gate.

### Manual gate 30 live finding (2026-09-02)

The exact-code Cloudflare rerun exposed a capture-transaction identity defect. The `/plans/` and `/products/`
Evidence snapshots and screenshots retained their correct URLs, but Token evidence read `subPage.url()` again after
safe interaction probing. A failed interaction recovery had moved the live page to `about:blank`, so two valid style
captures were collapsed under a synthetic route that did not exist in `DesignEvidence.pages`. The standalone auditor
correctly rejected the resulting unresolved `pageRefs`; this is not a site-specific extraction exception.

Resolve the document identity boundary before independent review:

1. Treat the URL returned inside `PageEvidenceSnapshot` as the immutable identity of a completed capture. The style
   capture, screenshot, analyzed-page record, ready marker, adaptive viewport supplement, and Evidence record for that
   transaction must use the same identity instead of re-reading a mutable browser page after screenshots or
   interactions.
2. Safe interaction recovery must restore the original document explicitly. Do not rely on browser history alone:
   aborted navigation, `history.replaceState`, or a one-entry history can make `goBack()` land on or retain
   `about:blank`. Discard the observation when recovery is required and navigate back to the captured URL within the
   remaining safety budget.
3. Enforce the relation at the Evidence boundary. Every Token evidence page must resolve to a captured Evidence route;
   never manufacture an opaque fallback route for an unknown source. Fail the build transaction instead of exporting
   a structurally valid-looking but unresolved reference.
4. Add neutral browser regressions for a disclosure that mutates history and for a multi-page analysis whose active
   page URL changes during safe probing. Add a builder regression proving an unmatched Token page cannot be exported.
   Rebuild, rerun Cloudflare first, and require zero unresolved route references before repeating the nine-site gate.

Gate 30 validation completed on the exact Node 22 build. The targeted Cloudflare rerun and the fresh batch-one
projection both retained `/plans/` and `/products/`, contained no `about:blank` source, and passed the standalone route
reference audit. All nine usable sites (Airbnb, Apple, Atlassian, BBC, Cloudflare, DEV, Dropbox, GitHub, and GitLab)
classified `degraded-but-truthful` with zero hard failures, zero low-confidence portable tokens, and bounded P1/candidate
output. Manual screenshot comparison confirmed the expected palette, typography, density, and component context; the
five named high-risk checks also passed. Conservative omissions such as an accent observed on fewer than half of a
site's canonical routes remain scoped in component literals/candidates rather than being promoted globally. Mixed
light/dark GitHub surfaces likewise retain their exact component-local borders instead of aliasing them to an
incompatible foundation token.

The Guardian was attempted without substitution and returned the explicit no-usable-captures exit code after every
route was covered by a blocking overlay. It emitted no design artifact and therefore did not turn restricted content
into unsupported design guidance. Reassess the same external restriction in the final corpus, but do not weaken the
large-overlay evidence gate merely to force a successful file.

### Review gate 31 findings (2026-09-02)

The next empty-context review failed the gate with three generic correctness defects. The existing compression,
promotion, route-identity, interaction-recovery, and mixed-surface fixes were independently confirmed, but final
corpus validation remains blocked until all three findings are covered by neutral fixtures and fixed in both the
canonical exporter and standalone auditor:

1. A clipped native input can still own the exported text style merely because its value or placeholder exists. Apply
   the same rendered geometry, clipping, paint, opacity, and text-indent checks used for visible DOM text before a
   native value or placeholder may own typography/color. If the native control is not visibly painting text, fall
   back to a visible label inside the detected visual input boundary. Persist enough source geometry/clipping facts
   for the standalone auditor to verify the ownership independently. Add a neutral clipped-input regression covering
   both component extraction paths and the final artifact.
2. A broad direct-text `aria-live` container can still become an actionable repeated status. Status promotion must
   require a geometry-backed visual feedback boundary: either a compact directly owned status region or an explicit
   bounded visual treatment. Full-width/tall transparent live regions stay P2/raw evidence even when repeated across
   pages. Recompute this rule independently in the auditor and add a direct-text broad-live-region regression beside
   the existing descendant-text fixture.
3. Capture health can become stale before screenshots finish. A blocking overlay that appears after the early health
   sample can dominate the saved image while the artifact still claims healthy evidence, as observed in the Guardian
   retry. Re-run health after all primary/supplemental screenshots and safe interactions, immediately before the
   capture transaction commits. If that final check is unusable or recovers the document, discard the stale local
   snapshot/screenshots/styles rather than committing them. Export a health timestamp that is at least as new as its
   images and make the auditor reject stale/missing final health for current artifacts. Add a delayed-overlay browser
   transaction regression; do not lower the large-overlay threshold.

After the controlled gates pass, rerun the affected live sites and the nine-site projection as needed, then send the
result to a different empty-context reviewer. The original twenty-site validation cannot begin until that reviewer
passes the exact final code.

Gate 31 fixes are now implemented without site-specific branches. Native values/placeholders must pass the same
rendered-host checks as DOM text, and canonical component evidence records independently auditable text-source paint,
geometry, clip, opacity, and glyph facts. Status evidence records viewport-relative boundary facts; a representative
status pattern needs at least 80% bounded support (and at least two instances) before P1 promotion, with the standalone
auditor recomputing the same contract from raw instances. Every screenshot now records its completion time, and entry,
subpage, and adaptive captures run a final health check after screenshots/interactions but before any aggregate state
is committed. A final recovery, unsafe state, or route drift discards the local transaction; the auditor rejects image
timestamps newer than final health.

Controlled validation on the exact Node 22 build passes: 70 unit files / 695 tests, 2 Design Evidence files / 26 tests,
and the packaged/full browser E2E chain / 110 tests. The new neutral regressions cover a clipped Georgia/red native
input with a visible Inter label, repeated 1000×532 direct-text live regions, stale/missing screenshot-health
timestamps, and a blocking overlay inserted 750 ms after animation freeze. Existing URL identity, adaptive capture,
component semantics, page-health recovery, CLI, MCP, Desktop packaging, and database paths remained green. A fresh
empty-context review and affected live reruns are still required before the twenty-site corpus begins.

The first affected-site rerun exposed one additional transaction edge: Airbnb and Cloudflare navigated while the new
entry-page final health evaluation was executing, destroying the browser execution context. The local capture was
already stale, but the unhandled inspection exception aborted the complete analysis instead of behaving like the
other final-health exclusions. Final entry health inspection is now guarded as part of the capture transaction: an
inspection/navigation race records `final-health:inspection-failed`, resets all entry-local aggregate candidates, and
continues to bounded subpage discovery. A neutral delayed-navigation regression proves that the result is the explicit
`NO_USABLE_CAPTURES` outcome when no later page succeeds, rather than an analyzer crash.

On the same live batch, seven unaffected sites still produced auditor-clean degraded-but-truthful artifacts. Guardian
now behaved exactly as intended: its initially readable entry screenshot was followed by a blocking consent overlay,
the final health gate rejected that stale capture, all subsequent candidates were also overlay-blocked, and no
DESIGN.md was emitted. Airbnb completed eight pages after the navigation-race guard. A direct Cloudflare retry advanced
past the former crash but stalled on a later external page until the temporary unbounded manual command was stopped;
repeat it under the standard 30-minute per-site runner before treating that external run as conclusive.

### Review gate 33 findings (2026-09-02)

The next empty-context review failed with three remaining generic defects; no original-corpus run may start yet:

1. Text-source visibility must be effective, not element-local. A native input can have a large visible-looking own
   rectangle while an ancestor places it outside the viewport, clips it to a one-pixel box, or makes the subtree
   transparent. Extend both extraction paths with the same viewport/ancestor clipping, effective-opacity,
   content-visibility, and meaningful-painted-area contract. Record the effective facts in canonical Evidence and
   require them independently in the auditor. Cover offscreen ancestors, ancestor overflow clipping,
   ancestor opacity, and near-total (not only exact 50%) clip paths.
2. Transparent direct-text live regions need a bounded width as well as height/area. A full-width 1000×100 region is
   page infrastructure, not a reusable feedback component. Also resolve nested native statuses after all candidates
   are collected: prefer a genuinely bounded descendant badge over a broad live ancestor instead of dropping the
   descendant early. Apply the same containment rule to style-role sampling, and mirror status actionability in the
   auditor. Add both the short-full-width and broad-wrapper/bounded-child neutral regressions.
3. Final-health exception recovery must be narrow. Only recognized browser navigation/context-destruction/page-close
   races may be converted to a discarded capture. Unexpected implementation exceptions must propagate as analyzer
   failures rather than being disguised as partial coverage. Add a pure classifier plus unit and browser regressions
   for recognized navigation races and an unrelated sentinel exception.

After all three fixes pass the complete controlled gates, use another new empty-context reviewer. Gate 33 otherwise
confirmed that aggregate rollback ordering, screenshot/health timestamps, recovered/URL-drift rejection, and late
overlay exclusion are sound.

Gate 33 is now implemented with site-agnostic evidence contracts. Native and DOM text owners must intersect the
full-page capture surface, survive every ancestor's display/visibility/content-visibility/effective-opacity state,
retain more than a two-pixel clipped dimension and sixteen painted pixels, and pass legacy clip, clip-path, and
text-indent checks. Canonical Evidence records capture intersection, effective clip-path area, ancestor clipping,
painted area, and visible dimensions; the standalone auditor rejects missing, inconsistent, or near-total clipped
facts. The vertical capture surface covers the complete document rather than only the initial viewport, so legitimate
below-the-fold text remains eligible while horizontally offscreen and ancestor-hidden text does not.

Transparent direct-text status regions now need compact width as well as height and area. Status candidates are
resolved only after collection: when a broad non-actionable live ancestor contains a bounded actionable native
status, both canonical component extraction and style-role sampling retain the bounded descendant; when both nested
boundaries are actionable, the outer visual boundary remains canonical. The independent auditor applies the same
compact-width rule before accepting status P1 projection. Final entry health now converts only recognized Playwright
navigation/context/page-close races into excluded captures; unrelated exceptions propagate.

Neutral regressions cover four hidden-native-input cases (offscreen ancestor, one-pixel overflow ancestor,
zero-opacity ancestor, and `inset(49%)`), a repeated transparent 1000×100 live region, a broad live wrapper with a
220×48 bounded child, nested actionable statuses, recognized final-health navigation, and unrelated sentinel errors.
The first targeted run exposed and corrected an over-strict viewport-only rule that dropped legitimate
below-the-fold status text; the capture-surface fixture and existing component ownership fixture now prevent that
regression. Controlled validation on Node 22 passes: 70 unit files / 696 tests, 2 Design Evidence files / 26 tests,
the packaged/full browser E2E chain / 115 tests, `pnpm run ci`, and `git diff --check`. A different empty-context
reviewer must now assess the exact current working tree before any original twenty-site run begins.

### Review gate 34 findings (2026-09-02)

The next empty-context review failed with four generic high-severity defects. The original twenty-site run remains
blocked until neutral regressions and complete controlled gates cover all four:

1. Effective rendered-text visibility currently protects component ownership but not the token-producing style
   extractor. Direct text under an ancestor that is transparent, clipped, or outside the capture surface can still
   contribute foundation typography and foreground/background usage. Apply the effective ancestor/capture/paint
   contract before any direct text contributes text pairs, typography counts, color pairs, or global token inputs.
   Preserve enough canonical provenance for the final auditor to reject a false foundation rather than validating
   only component sources.
2. Near-total non-inset clip paths are treated as fully visible. Add conservative, geometry-aware handling for common
   `circle()`, `ellipse()`, and `polygon()` shapes in both component extraction paths and the token-producing path.
   Persist the derived painted area and make the auditor independently reject inconsistent source clip geometry.
   Cover `circle(1px)` and a one-pixel polygon in neutral fixtures; unknown complex shapes should be omitted rather
   than assumed fully painted when visibility cannot be established.
3. Transparent borders falsely count as strong status boundaries. A border contributes a visual boundary only when
   its style/width is painted and its observed color has nonzero alpha; a visible fill or material shadow may also
   establish the boundary. Apply this to canonical component extraction and style-role sampling. Persist/reconstruct
   boundary paint facts so the standalone auditor does not trust a forged boolean. Add repeated full-width 1000×100
   live regions with `border:1px solid transparent` and require P2/raw status evidence.
4. Narrow final-health exception recovery covers only the entry capture. Apply the lifecycle-race classifier at the
   subpage and adaptive/mobile final-health commit boundaries as well: recognized navigation/context/page-close races
   discard the local transaction, while unrelated implementation exceptions propagate out of analysis. Add
   subpage/adaptive sentinel tests in addition to the existing entry navigation regression.

After these changes pass the complete controlled suite and auditor tamper tests, use yet another different
empty-context reviewer. Do not begin the corpus from a partially reviewed tree.

Gate 34 is implemented with one effective paint contract across the token-producing style extractor, canonical
component evidence, and legacy component detection. Direct text contributes typography, foreground, and text/surface
pairs only when it intersects the full-document capture surface, survives ancestor display/visibility/content-
visibility/effective-opacity, overflow and paint-containment clipping, and retains meaningful glyph geometry and
painted area. Token Evidence carries bounded rendered-owner provenance only for typography and foreground claims;
non-text tokens no longer inherit unrelated text-owner arrays merely because they share a DOM owner. Formal and
candidate TokenEvidence now use the same nested URL sanitizer, closing the query-route privacy regression caught by
the full E2E suite.

Common numeric `inset()`, `circle()`, `ellipse()`, and `polygon()` clip paths now contribute conservative bounds and
area ratios in all three extraction paths; unsupported shapes are omitted rather than assumed visible. The
standalone artifact auditor reparses the source shape, cross-checks visible bounds, capture intersection, painted
area, and effective shape ratio, and rejects forged near-total clips. Neutral browser fixtures cover one-pixel
circle, ellipse, and polygon clips for native values, component labels, and global typography.

Status paint evidence is split into fill, border, and shadow facts. Transparent borders cannot establish a strong
boundary; canonical patterns and the independent auditor both require the strong-boundary boolean to equal the
reconstructed union of actually painted layers. Final health inspection uses one lifecycle-race classifier at entry,
subpage, and adaptive/mobile boundaries. Recognized navigation/context/page-close races discard only the local
transaction; unrelated exceptions propagate with their boundary and original cause.

The first complete E2E run exposed two privacy failures caused by the over-broad text-owner attachment described
above. After fixing the generating scope and shared sanitizer, the direct query-route browser regression and the
repackaged Desktop persistence regression both pass. The full controlled gates and a new empty-context review still
must pass on this exact post-fix tree before the first functional commit or the twenty-site corpus.

The exact post-fix Node 22 tree now passes all controlled gates: 70 unit files / 701 tests, 2 Design Evidence files /
26 annotated browser tests, packaged/full E2E / 117 tests, `pnpm run ci`, and `git diff --check`. The second Design
Evidence run completed in 309.81 seconds, comparable to the preceding 312.91-second run, so the effective ancestor
checks did not introduce a growing performance regression in the controlled corpus. A new empty-context review is
the remaining gate before creating the first complete functional commit and beginning the original twenty-site run.

### Review gate 35 findings (2026-09-03)

The next empty-context review failed with five additional generic high-severity defects. No functional commit or
original-corpus run may begin until all five are fixed, the controlled suite is green again, and a different
empty-context reviewer passes the exact resulting tree:

1. Bounding boxes plus a scalar fill ratio do not prove that glyphs intersect a non-rectangular ancestor clip. Text
   can sit inside a circle/ellipse/polygon bounding square but outside the painted shape and still enter global tokens.
   Clip visibility must intersect glyph geometry with the actual supported shape (or conservatively omit an
   unprovable case), and canonical provenance must contain bounded final glyph/ancestor-clip facts that the auditor
   can recompute. Add neutral two-owner fixtures outside ancestor circle, ellipse, and polygon shapes plus tamper
   tests for the ancestor proof.
2. `color` is not necessarily the effective glyph paint. In particular, transparent
   `-webkit-text-fill-color` currently permits invisible red/Georgia text to become foreground and typography
   evidence. Use one glyph-paint contract across token extraction and both component paths. Distinguish solid paint,
   genuinely unpainted text, and background-clipped/gradient text: gradient text may support observed typography but
   must not manufacture a flat foreground color. Persist paint facts and cover transparent-fill negatives,
   nontransparent-fill positives, gradient text, and provenance tampering.
3. CSS Color 4 alpha forms such as `color(srgb ... / 0)` and `oklch(... / 0)` can still make transparent borders or
   shadows appear painted in canonical status evidence and in the independent auditor. Browser extraction must
   normalize computed paint alpha through a general color parser; unknown paint cannot establish a strong boundary.
   The standalone auditor must independently parse/normalize supported serialized paint and reject unknown or zero
   alpha. Add transparent and nonzero controls for modern border/fill/shadow syntax.
4. `ensurePageHealth` recovery still catches unexpected exceptions and may mutate/reload a page while reporting
   `recovered: false` when the issue count does not decrease. That can commit pre-recovery styles/screenshots beside
   post-recovery health. Recovery needs a discriminated outcome; any attempted remediation, reload, route drift, or
   lifecycle race invalidates the current capture transaction regardless of issue-count changes, while unrelated
   implementation exceptions propagate. Add real entry/subpage/adaptive recovery tests including sentinel errors,
   navigation races, and equal-count issue replacement.
5. An expected `adaptive-mobile-budget-exceeded` thrown inside final health is currently wrapped as an unexpected
   fatal inspection error before the normal adaptive limitation branch can handle it. Preserve expected deadline and
   cancellation outcomes through the final-health boundary and prove a slow mobile final check keeps valid desktop
   and subpage captures while recording the adaptive limitation.

Gate 35 remediation now uses one explicit rendered-glyph-paint contract in style extraction and both component paths.
Solid glyph paint is canvas-normalized and must have nonzero alpha; transparent text fill is omitted; background-clipped
image/gradient text can support typography but has no flat foreground color. Rendered text provenance carries a bounded
clip-path chain and paint kind. Because a bounding box cannot prove glyph intersection with a curved or concave shape,
circle, ellipse, and polygon clips anywhere in the owner chain are conservatively excluded. The standalone artifact
auditor independently rejects forged curved-ancestor chains, forged flat gradient colors, unknown/zero-alpha paint,
and CSS Color 4 or hex-alpha transparent status boundaries.

Health recovery is now transaction-safe: once remediation or reload runs, `recovered` is true regardless of issue-count
arithmetic, so entry, subpage, and adaptive callers discard their pre-recovery extraction. Only explicit Playwright
timeouts and browser lifecycle races become unusable health outcomes; unrelated recovery defects propagate. Final
health preserves the adaptive mobile budget signal for the existing nonfatal limitation branch. Targeted Node 22 gates
currently pass 117 unit assertions, 55 real-browser component/style tests, and five real-browser entry/subpage/adaptive
health transactions. The complete controlled suite and a new empty-context review remain required on the exact tree.

### Review gate 36 findings (2026-09-03)

The next empty-context review failed with three generic high-severity defects. They must be fixed and reviewed on a new
exact tree before any functional commit or live-site run:

1. A text owner's box can intersect a rectangular overflow/clip region while all actual glyph rectangles remain
   outside it. Style extraction and both component paths must intersect `Range.getClientRects()` with the final
   surviving paint bounds, persist bounded visible-glyph intersections, and let the independent auditor recompute the
   geometry. Add neutral direct-text and nested-button fixtures plus a provenance mutation.
2. Canonical status Evidence uses a legacy alpha expression for background fills even though border/shadow handling
   has a general canvas normalizer. Use the same general paint normalization for fills; zero-alpha or unknown CSS Color
   4 paint cannot establish a boundary. Add zero/nonzero modern fill controls and an audited-bundle mutation.
3. Raw `dom-still-mutating` volume is diagnostic, not proof that a readable visual capture needs remediation. Mark it
   non-recoverable unless a separate unsafe condition exists, retain the warning, and prove full entry, subpage, and
   adaptive transactions remain committed while genuine recovery still invalidates pre-recovery evidence.

Gate 36 remediation now intersects actual direct-text `Range` rectangles with the final rectangular paint region after
capture, overflow, paint-containment, and supported clip-path bounds. A host box is insufficient: at least one meaningful
glyph intersection is required. Current provenance retains the final relative visible bounds plus up to eight actual
visible-glyph intersections and their recomputable area; the standalone auditor independently validates their bounds and
arithmetic. Canonical status fill uses the same canvas-normalized nonzero-alpha paint rule as borders and shadows. Raw
DOM mutation volume remains a degraded diagnostic but no longer invokes recovery by itself.

The exact post-remediation Node 22 tree passes 70 unit files / 708 tests, 2 Design Evidence files / 26 browser tests in
306.41 seconds, packaged/full E2E / 124 tests in 337.72 seconds, `pnpm run ci`, `git diff --check`, and the focused
Prettier check. Full E2E proves both sides of the health decision: stable telemetry mutation commits entry, subpage, and
adaptive mobile evidence, while a true late obstruction still invalidates its pre-recovery transaction. A different
empty-context review remains required on this exact implementation before the first functional commit.

### Review gate 37 findings and remediation (2026-09-03)

The next empty-context review failed with two further generic high-severity evidence gaps:

1. Native control values, placeholders, selections, and input-button labels have no browser-exposed glyph rectangles.
   Both component paths previously accepted any surviving host rectangle, so a one-sided clip plus displaced text could
   export invisible typography. Native sources must instead prove that the final paint region contains the complete
   usable text box after borders and padding; materially displaced text is conservatively rejected. Canonical evidence
   now persists that native text box, and the standalone auditor requires its complete containment. Neutral browser
   regressions cover value, placeholder, selection, and input-button negatives plus fully visible left/center/right
   aligned positives; input wrappers fall back to a genuinely visible label.
2. Component and audit alpha parsers treated any recognized CSS Color 4 function without a numeric slash alpha as
   opaque. In particular, `/ none` and unknown alpha expressions could establish fills, borders, shadows, or component
   appearance. Alpha parsing is now tri-state and conservative: validated nonzero paint is visible, `none` is unpainted,
   and unsupported/invalid expressions remain unknown and cannot establish paint. All downstream component, surface,
   pseudo, export, and independent-audit decisions now require positively validated visible color instead of inferring
   opacity from “not known transparent.” Tests cover `/ none`, unknown alpha, numeric zero, and numeric nonzero controls.

The exact Gate 37 remediation tree passes 70 unit files / 709 tests, 2 Design Evidence files / 26 browser tests in
309.93 seconds, packaged/full E2E / 125 tests in 338.84 seconds, `pnpm run ci`, targeted ESLint/Prettier checks, and
`git diff --check`. A different empty-context reviewer must now inspect this exact tree before a functional commit or
the original twenty-site corpus begins.

### Review gate 38 findings and remediation (2026-09-03)

The next empty-context review failed with three generic high-severity promotion gaps:

1. CSS `filter: opacity(0)` was absent from rendered-text provenance. Repeated filtered text could therefore become
   portable typography even though its boxes, colors, and glyph ranges otherwise looked valid. Style extraction and
   both component paths now multiply every self/ancestor paint-filter opacity, conservatively reject unprovable or
   effectively invisible chains, and persist the bounded filter chain for independent audit. Final component and
   layout roots also require an effectively visible paint chain, while a hidden native form control may still resolve
   to a genuinely visible external input shell and label.
2. Empty `input[type=button][value=""]` controls were recorded as native text solely because their element type was a
   button. Native text evidence now records and validates its origin. Explicit nonempty values, observed placeholders
   and selections, and missing-value submit/reset user-agent defaults are distinct; an explicitly empty generic
   button has no text owner and remains an icon candidate only when its rendered geometry supports that classification.
3. CSS Color 4 `/ none` paint could survive the legacy pseudo-element path as fill, border, or shadow material. Pseudo
   extraction now uses the same strict normalized nonzero-paint functions as components, requires either painted
   content or independently visible material, and excludes host/pseudo filter invisibility. Both export paths and the
   standalone artifact auditor mirror that contract so blank transparent pseudo geometry cannot become reconstruction
   guidance.

Neutral browser regressions cover self/ancestor filter invisibility, explicit empty input buttons, missing-value
submit defaults, CSS Color 4 `/ none` pseudo fill/border/shadow, and positive controls. Provenance mutation tests cover
missing native origin, forged zero-opacity filters, and unpainted pseudo evidence. The complete controlled gates and a
new empty-context review remain required on the exact remediation tree.

### Review gate 39 findings and remediation (2026-09-03)

The next empty-context review found six generic high-severity gaps that extended the same evidence boundary:

1. Filters other than `opacity()` were implicitly treated as color- and visibility-preserving, even though an SVG
   filter can erase alpha and color functions can materially change the sampled foreground. All extraction paths and
   the standalone auditor now parse the complete filter chain and accept only independently auditable `opacity()`
   functions. Unsupported filters conservatively cannot establish component, layout, color, or typography evidence.
2. Layout typography copied styles from the structural node without proving the actual rendered glyph owner. Layout
   nodes now remain available for structural evidence, but text roles, typography, and flat colors are emitted only
   from a validated rendered-text owner with persisted paint provenance. Evidence export and the independent auditor
   enforce the same ownership and flat-color rules.
3. A hidden submitter could demote the only painted submit action in a form. Primary-action counting now includes only
   enabled, pointer-active submitters with an auditable visible paint chain; hidden submitters are excluded from both
   style roles and canonical component evidence.
4. Foreground pairing previously allowed RGB-near backgrounds to stand in for a foundation surface. Pair evidence and
   token selection now require an exact normalized match to an independently promoted background, surface, or secondary
   surface. This preserves sites whose text lives on content panels while preventing unrelated card text from becoming
   the page foreground merely because card and canvas colors are visually close.
5. `content: ""` pseudo elements were discarded before material paint was examined. Empty pseudos are now retained
   when their own fill, border, or shadow is positively visible, while empty unpainted geometry remains excluded.
6. The auditor trusted rendered-text promotion counts after validating only the enumerated sample. It now verifies
   unique owner identity, exact owner/page coverage, count arithmetic, token-value support for every owner, bounded
   per-page sampling, and the same one-page/cross-page promotion thresholds used by the producer.

Neutral unit and browser regressions cover SVG/arbitrary filters, transparent layout headings, hidden submitters,
exact-surface pairing, painted empty pseudos, and owner-list removal without metadata updates. Targeted Node 22 checks
and the controlled comparison regression pass. The exact remediation tree passes 70 unit files / 715 tests, 2 Design
Evidence files / 26 browser tests in 309.73 seconds, packaged/full E2E / 126 tests in 337.75 seconds, `pnpm run ci`,
and `git diff --check`. A new empty-context review remains required before a functional commit.

### Review gate 40 findings and remediation (2026-09-03)

The next empty-context review found three generic high-severity provenance gaps:

1. CSS masks were absent from all rendered-text visibility contracts. Text fully erased by a self or ancestor
   `mask-image` could still promote foreground and typography or supply component/layout text. Style extraction and
   both component paths now conservatively reject any non-`none` standard or WebKit mask source. Valid provenance
   explicitly carries an empty mask chain, and the standalone auditor rejects missing or forged mask provenance.
2. Foreground/surface pair metadata could be internally consistent without proving exact owners per canonical route.
   Pair construction now refuses count-only observations and persists every eligible route's exact total, matching,
   main-text, and heading owner sets. Aggregate counts, shares, roles, and minimum support are derived from those sets.
   Foreground evidence samples only exact owner/background matches, derives the `rendered:text` source from those
   observations, and the auditor independently recomputes route totals, exact capped samples, owner backgrounds, and
   pair sources. Identification of a text color no longer implies portable foreground reuse.
3. Empty pseudo elements could carry paint syntax without proving meaningful pixels inside the captured page. Before
   and after evidence now requires an explicit box for empty content, nontrivial geometry, effective opacity/filter
   visibility, no mask or transform, and a meaningful capture intersection. Provenance includes capture dimensions and
   exact visible geometry so the auditor can recompute intersection rather than trusting a claimed ratio. Zero-pixel,
   near-transparent, off-capture, masked, and arithmetically forged evidence is rejected.

The same remediation also pairs foreground candidates against every independently promoted foundation surface instead
of only the page canvas, and requires path-specific rendered-owner evidence before typography or portable text colors
survive promotion. Neutral unit mutations and real-browser fixtures cover all three findings. Targeted checks pass
234 unit assertions plus the mask and pseudo browser regressions. The first full E2E pass exposed one directly related
privacy omission: the newly added pair-route page URL was not included in persisted-token URL sanitization. The shared
token-evidence sanitizer now redacts that nested route while preserving its internal query-bearing capture identity;
both previously failing Desktop and query-only-route browser transactions pass independently.

The exact post-remediation Node 22 tree passes 70 unit files / 723 tests, 2 Design Evidence files / 26 browser tests in
310.04 seconds, packaged/full E2E / 126 tests in 339.00 seconds, `pnpm run ci`, and focused privacy, mask, pseudo, pair,
and rendered-owner regressions. A new empty-context review remains required before a functional commit.

### Review gate 41 findings and remediation (2026-09-03)

The next empty-context review found three further generic high-severity boundaries:

1. Query-bearing routes retained opaque IDs only at aggregate token level. Persistence could therefore collapse two
   distinct `renderedTextOwners[].page` or `pairedSurface.routeSupport[].page` values to the same public URL, while the
   auditor still grouped those owners by the redacted URL. Every rendered owner and pair route now carries the stable
   pre-redaction route ID, Evidence construction canonicalizes it from captured route identity, and the auditor groups,
   deduplicates, samples, and checks coverage by route ID. Human-readable page URLs remain display-only. Neutral unit
   mutations reject missing and duplicated route IDs, and a real query-only multi-document browser transaction writes
   and passes the complete artifact bundle after all query text is removed.
2. Page preparation treated every fixed/sticky layer over a small area threshold, and every non-modal dialog, as safe
   to dismiss. A viewport-fixed application shell containing legitimate primary content and an `×` panel control could
   lose its whole document before extraction. Preparation now shares the conservative health boundary: explicit
   standards/ARIA modals may be dismissed, while generic fixed layers require a large clipped area, center ownership,
   no page-chrome semantics, and no meaningful primary-content ownership. Sticky layers and non-modal dialogs are
   never mutated as obstructions. Browser regressions cover fixed app shells, non-modal panels, true shadow-root
   modals, and a complete analyzer transaction that would become empty if the legitimate shell were clicked.
3. Non-normal `mix-blend-mode` made glyph and pseudo colors backdrop-dependent while extraction still reported their
   uncomposited computed color as a portable flat value. All three text paths and pseudo-paint extraction now reject a
   non-normal blend on the paint owner or any ancestor. Valid provenance explicitly contains an empty blend chain; the
   promotion boundary demotes legacy evidence missing blend or stable route provenance, and the standalone auditor
   rejects missing or forged blend evidence. Browser fixtures cover repeated blended text, component labels, headings,
   and pseudo paint without introducing site-specific logic.

The exact post-remediation Node 22 tree passes 70 unit files / 729 tests, 2 Design Evidence files / 26 browser tests in
309.95 seconds, packaged/full E2E / 127 tests in 342.55 seconds, `pnpm run ci`, `git diff --check`, the query-route
artifact audit, and the focused fixed-shell, obstruction, text-paint, component, pseudo, privacy, and legacy-promotion
regressions. Another new empty-context review remains required before this functional slice can be committed.

### Review gate 42 findings and remediation (2026-09-03)

The next empty-context review found two remaining generic high-severity boundaries:

1. Preparation and health inspection still carried separate obstruction classifiers and protected a viewport-fixed
   document shell only when it owned a `<main>` landmark. A legitimate application document built from
   `<header>/<nav>/<article>` could therefore be rejected as blocked and then destroyed by its own `×` control.
   Both call sites now execute one browser-serializable classifier. It recognizes a fixed document shell only when it
   owns meaningful visible standards-backed primary content (or a meaningful article plus document chrome), no
   comparable meaningful content exists outside the candidate subtree, and no dialog/modal semantics apply. Generic
   fixed layers that cover independently meaningful content remain blocking and dismissible. Neutral browser tests
   cover the no-`main` shell, a genuine generic fixed blocker, non-modal dialogs, page chrome, shadow-root modals, and
   a complete no-`main` analyzer transaction.
2. The standalone bundle auditor validated nested rendered-owner and paired-surface provenance only for promoted
   tokens, not rejected candidates. Synchronized forgeries in Evidence and DTCG could therefore survive, and the
   auditor counted the same route-local owner twice when duplicated across responsive viewports. Candidate evidence
   now uses the same source, mask/blend, value, route, count, pair-arithmetic, and bounded-sample validation as promoted
   evidence without applying portable-token promotion thresholds. Owner identity is route plus owner ID, and exactly
   one canonical rendered-owner viewport is allowed per route. Mutation tests cover missing opaque route IDs,
   non-normal blend chains, forged pair routes, synchronized Evidence/DTCG changes, and cross-viewport duplicates.

The exact post-remediation Node 22 tree passes 70 unit files / 732 tests, 2 Design Evidence files / 26 browser tests in
310.00 seconds, packaged/full E2E / 128 tests in 348.01 seconds, `pnpm run ci`, targeted lint/type checks, and
`git diff --check`. A new empty-context reviewer must inspect this exact tree before any functional commit or live
corpus run.

### Review gate 43 findings and remediation (2026-09-03)

The next empty-context review found two additional high-severity provenance/classification gaps:

1. The shared obstruction classifier treated a semantic ancestor of a fixed document shell as outside content because
   DOM containment was tested only in the shell-to-content direction. A fixed application nested under `<main>` could
   still be rejected and have its own close control clicked even when the ancestor contained nothing independent. For
   ancestors, the classifier now measures only visible text and meaningful media outside the candidate subtree. An
   empty semantic wrapper no longer disqualifies its fixed document shell, while independently visible sibling content
   still makes a generic fixed layer blocking. The real-browser regression covers a nested `<main>` wrapper in addition
   to direct-body, no-`main`, genuine blocker, page-chrome, and dialog cases.
2. Rendered-owner provenance was internally shaped but not bound to the actual canonical Evidence capture. A forged
   but syntactically valid viewport or unrelated public URL could retain the real opaque route ID and pass; deleting
   candidate owner/pair fields also bypassed validation while source labels still claimed them. The auditor now
   independently selects one desktop-preferred Evidence capture per route, binds every owner to its exact persisted
   page and viewport, binds every pair route to the same page, and checks aggregate page arrays against route refs.
   Source labels require their corresponding nested provenance even for rejected candidates. Foreground-candidate
   generation now carries exact rendered-owner and pair evidence when auditable, and removes an unverifiable
   `rendered:text` source rather than exporting an uncheckable claim. Tests cover imaginary viewports, unrelated URLs,
   wrong pair pages, synchronized nested-field deletion, and a positive auditable foreground candidate.

The exact post-remediation Node 22 tree passes 70 unit files / 734 tests, 2 Design Evidence files / 26 browser tests in
310.52 seconds, packaged/full E2E / 128 tests in 348.32 seconds, `pnpm run ci`, focused producer/auditor/browser tests,
and `git diff --check`. A new empty-context reviewer must inspect this exact tree before any functional commit or live
corpus run.

### Review gate 44 findings and remediation (2026-09-03)

The next empty-context review found two further high-severity truthfulness/classification gaps:

1. A generic full-screen fixed blocker inherited page-chrome semantics merely by being nested under `header` or `nav`.
   The shared classifier therefore excluded it from blocking logic even when it covered the viewport center and hid
   independently meaningful article content. Page chrome is now exempt only when the candidate itself also has
   edge-anchored header/sidebar geometry. A neutral real-browser fixture proves that a full-screen blocker nested in a
   header is rejected and safely dismissed, while genuine fixed/sticky page chrome and fixed document shells remain
   untouched.
2. Dark-mode evidence was built against the synthetic `imprint://dark-mode/` URL and `dark` viewport, allowing rejected
   dark foreground or typography candidates to claim rendered owners and surface pairs that no Evidence capture could
   audit. Dark detection now records the exact source page and viewport, export binds dark token and candidate evidence
   to its deterministic route ID and page reference, and the standalone auditor checks dark candidate owners against
   canonical Evidence captures. Legacy/direct calls without a real capture source have rendered-owner and paired-
   surface claims removed before promotion and again after base-catalog alignment, so unavailable provenance cannot be
   used to justify a portable foreground or typography value. Producer and mutation tests cover both the bound and
   deliberately unbound paths.

The exact post-remediation Node 22 tree passes 70 unit files / 736 tests, 2 Design Evidence files / 26 browser tests in
310.60 seconds, packaged/full E2E / 128 tests in 349.77 seconds, focused unit/browser tests, type checking, lint, and
`git diff --check`. A new empty-context reviewer must inspect this exact tree before any functional commit or live
corpus run.

### Review gate 45 findings and remediation (2026-09-03)

The next empty-context review found two high-severity gaps in persisted dark-mode provenance:

1. Full stored dark tokens could retain changed foreground or typography values through the generic portable-evidence
   path without the rendered-owner evidence required for those specific token paths. Restored changed tokens now use
   the same path-specific rendered-owner and surface-pair requirements as newly promoted tokens; invalid stored
   provenance is downgraded before base-catalog alignment.
2. The standalone auditor validated dark candidates more deeply than promoted dark overrides. It now applies canonical
   capture binding, page/reference/count arithmetic, portable-geometry checks, and the full rendered-text promotion
   contract to every promoted dark token as well as rejected candidates.

Production artifact generation and Desktop record restoration now pass canonical Design Evidence into dark export and
restore. Dark evidence is bound to the actual Evidence route and canonical viewport. A real Desktop regression exposed
an important privacy interaction: the route ID intentionally preserves the identity of an original query-bearing URL,
while its public Evidence URL has the query removed. Binding now requires both the preserved opaque route identity and
the matching sanitized public URL, then writes the actual Evidence route/page into nested provenance. This keeps secrets
out of artifacts without discarding truthful dark tokens.

Neutral tests cover missing foreground owners/pairs, forged persisted pages, valid restored pairs, forged promoted dark
pages, missing promoted dark font owners, and query-bearing sources bound to sanitized Evidence. The exact Node 22 tree
passes 70 unit files / 741 tests, 2 Design Evidence files / 26 browser tests in 313.21 seconds, full E2E / 128 tests in
354.79 seconds, `pnpm run ci`, focused lint/type checks, and `git diff --check`. One preceding full E2E attempt had a
login-dialog timing failure after the managed analysis had already completed; the isolated four-test Desktop flow and
the subsequent complete 128-test run both passed. Per the user's explicit checkpoint request, this controlled-green
tree may be committed before the next empty-context review; that review and Phase 8 remain mandatory and any findings
will be follow-up commits.

### Review gates 46–47 findings and remediation (2026-09-03)

Two fresh empty-context reviews found that persisted dark foreground evidence could still survive with rendered owners
but no observed surface pair, and that the bundle auditor trusted the self-declared dark override map too much. The
shared path-specific promotion contract now requires foreground and muted-foreground values to carry rendered owners,
an observed text/background pair, the pair marker, auditable routes, and the appropriate semantic pair threshold.
Restoration strips unverifiable rendered provenance before base-catalog alignment.

The auditor now derives the complete override set from differences between the base and dark DTCG catalogs, validates
every changed token even when the override map, frontmatter, and evidence are jointly deleted, rejects every dark token
outside the base catalog, and binds dark non-text candidates to the canonical Evidence route set. Neutral mutations
cover missing declared overrides/evidence, a colluding dark-only token across every implementation format, and a dark
candidate that names a nonexistent route.

### Review gates 48–49 findings and remediation (2026-09-03)

The next two fresh reviews found deeper variants of the same restored-evidence boundary:

1. A changed dark foreground could be paired to a dark surface that was not part of the effective exported theme,
   producing a light foreground override while leaving the base light background active. Dark alignment now performs a
   second catalog pass after checking the effective background/surface/secondary set (including unchanged base
   fallbacks). An invalid foreground is removed from portable output and retained only as an explicitly rejected
   candidate. Muted foreground additionally has to remain readable and visibly subordinate to the effective primary
   foreground.
2. Pair route arrays and rendered-owner samples could disagree, while self-reported aggregate counts and contrast
   remained trusted. The shared foreground evidence boundary now verifies unique/subset owner sets, exact bounded
   samples, route-derived page/owner/body/heading counts, minimum support, normalized shares, page support, outer-token
   counts, actual computed contrast, and every sampled owner's foreground/background/source values. Typography owners
   are also checked against their claimed font metric instead of merely existing.
3. Removing every Evidence page route ID and every token/candidate page reference disabled route binding. Evidence
   pages now require a non-empty persisted route identity, and positive-support token or candidate evidence fails when
   the route catalog or page references are absent. Legacy non-hash opaque IDs remain accepted where their identity is
   explicit; omission is not.

Neutral producer tests cover missing surfaces, unrelated owner IDs, forged aggregate counts, forged contrast, forged
owner styles, and invalid muted hierarchy. Auditor mutations cover effective-surface mismatch and synchronized route
omission. The exact tree passes 70 unit files / 753 tests, type checking, the full local `pnpm run ci`, 26/26 Design
Evidence browser tests in 310.56 seconds, and `git diff --check`. The first full E2E run after the checkpoint passed
128/128 in 348.54 seconds; because gates 48–49 subsequently changed shared promotion/restoration logic, the complete
E2E gate must run again after the next empty-context reviewer passes.

### Review gate 50 findings and remediation (2026-09-03)

The next empty-context review found two remaining completeness issues. First, synchronously removing a dark token, its
evidence, its declared override, and every implementation value left no dark-catalog difference for the auditor to
inspect. Dark export now emits a complete catalog aligned to the exact base token-reference set, using the base value
for unchanged or safely rejected dark values. The auditor independently requires both directions of key equality:
missing base references and dark-only references are hard failures. Overrides remain only the genuinely changed,
grounded values.

Second, restored typography checked owner existence and style identity but still trusted aggregate owner counts. The
shared rendered-owner predicate now groups unique owners by route, binds their public page set and optional route refs,
requires exact counts for unsaturated samples, requires observation and owner counts to agree, and applies the same
one-page or cross-page foundation threshold used by the standalone auditor. A forged `ownerCount: 999` backed by one
undeclared owner is demoted to a rejected candidate. Neutral tests cover the synchronized dark-token deletion and the
forged stored font aggregate. The exact Node 22 tree passes 70 unit files / 755 tests, `pnpm run ci`, type checking, and
`git diff --check`; a new empty-context review is in progress before the browser gates are repeated.

### Review gate 51 findings and remediation (2026-09-03)

The next empty-context review verified the prior omission, route, pair, and typography fixes, then found three final
cross-token consistency gaps:

1. A valid changed background could survive after its dark foreground was rejected, leaving inherited foreground and
   changed background values with no readable observed pair. Changed background/surface/secondary tokens now require a
   retained, evidence-valid foreground pair on that exact surface. If the pair is missing or invalid, the related
   surface override is demoted in the same alignment transaction before base values are filled back, so the exported
   theme cannot contain a half-applied foundation.
2. Post-alignment palette names could still be rewritten from `palette-N` to `dark-palette-N`, violating complete
   base/dark key equality for a base-owned residual palette. Base-aligned dark catalogs are no longer namespaced after
   restriction. A changed mode-local palette index is treated as an unmatched candidate and the base reference/value
   remains stable; standalone dark snapshots without a base catalog retain the previous defensive namespace.
3. The auditor checked that dark typography counts were finite but did not require observation and owner counts to
   agree or semantic agreement to remain in `[0, 1]`. Rendered-text validation now independently enforces outer count
   equality, and portable/dark evidence rejects out-of-range semantic agreement.

Neutral tests cover atomic background/foreground fallback, stable base palette references with changed dark residuals,
and synchronized forged dark font-family/font-stack counts and semantic agreement. Focused producer/auditor tests pass
122/122 with type checking and `git diff --check`; a new empty-context review is required before repeating the full
controlled gates.

### Review gate 52 findings and remediation (2026-09-03)

The next fresh empty-context review expanded the dark-mode audit from individual override values to the complete
catalog-to-artifact path and found eight material false-negative classes: out-of-range restored semantic agreement,
incomplete rendered-text paint validation, missing surface-to-foreground atomicity in the auditor, ignored raw dark
DTCG keys, orphan or unchecked unchanged dark evidence, incomplete DESIGN.md dark color/detection projection checks,
unchecked CSS/SCSS/Tailwind activation scopes, and duplicate declarations whose later value changed effective output.

The remediation is organized around three shared invariants rather than eight special cases:

1. Every rendered-text owner now passes a reusable core paint-provenance validator covering visibility, bounded glyph
   geometry, clip/filter reconstruction, opacity, masks/blending, and paint source before it can promote typography or
   foreground tokens. Portable evidence also requires semantic agreement and page support to be finite probabilities.
   Invalid evidence attached to an unchanged restored token is omitted instead of being copied into a complete dark
   catalog.
2. The auditor now checks raw base/dark DTCG keys, exact base/dark catalog equality, and every emitted dark evidence
   record in both directions. Changed foundation surfaces require an independently valid readable text pair on that
   exact surface, matching the producer's atomic fallback contract.
3. Every Agent- or implementation-facing dark projection is checked against the independently parsed DTCG catalog.
   This includes DESIGN.md frontmatter colors, detection method/selector, English or Chinese dark-color tables, exact
   CSS/Tailwind media or class ownership, SCSS variable/mixin/invocation ownership, and exactly one declaration per
   expected dark implementation name.

Neutral mutations cover all eight failures, while valid English/Chinese tables, media-query themes, class-toggle
themes, and paired foundation themes remain accepted. The focused producer, persistence, and bundle-auditor suite
passes 140/140; the complete unit suite passes 70 files / 764 tests with lint, type checking, and `git diff --check`.
A new empty-context review must pass this exact tree before browser and live-corpus gates resume.

### Review gate 53 findings and remediation (2026-09-03)

The next empty-context mutation review confirmed the Gate 52 fixes but found five remaining grammar and provenance
edges. Ancestor clip-path entries lacked relative offsets and could therefore claim full-size visible glyphs; sampled
foreground owners could contradict pair text-role aggregates; base portable page support was not range checked; DTCG
token objects could carry the right name/value but the wrong `$type` or extra keys; DESIGN.md prose could contradict
its structured dark detection method; and CSS-escaped custom-property names could bypass duplicate detection.

The shared paint validator and standalone auditor now conservatively reject foundation promotion when an ancestor
clip-path cannot be geometrically reconstructed. Foreground pair samples bind each owner's text role to route-level
main-text/heading owner sets. Base and dark evidence use the same probability/envelope checks. Raw DTCG groups require
the generator's exact token object shape, value kind, and `$type`. The localized human dark-mode sentence is checked
against the structured media-query or class-toggle contract. Dark CSS/Tailwind declaration parsing decodes CSS
identifier escapes before exact-name and duplicate comparison.

Neutral tests cover ancestor-clipped typography and foreground evidence, role-inconsistent pair owners, base support
ratio forgery, wrong/extended DTCG token objects, English and Chinese detection prose, and escaped duplicate custom
properties. The focused suite passes 143/143 and the complete unit suite passes 70 files / 767 tests with lint, type
checking, and `git diff --check`. A fresh Gate 54 review is required on this exact tree.

### Review gate 54 findings and remediation (2026-09-03)

Gate 54 confirmed the preceding evidence bindings but found five remaining alternate-representation bypasses. A
rounded `inset(... round ...)` clip was reduced to a rectangular clip even though the persisted schema cannot prove
glyph intersection with the rounded corners. Portable evidence counts accepted positive fractions. Base
implementation catalogs retained the first declaration instead of rejecting duplicates, while inline SCSS and
CSS-escaped names could evade some occurrence checks. A contradictory dark-mode sentence could be hidden behind a
Markdown blockquote prefix. Finally, `JSON.parse` collapsed duplicate raw DTCG member names before the artifact audit
could compare them.

The producer, restoration path, and independent auditor now reject rounded inset paint provenance until the schema can
represent its geometry. Required portable counts are positive integers with an internally consistent page envelope;
optional owner aggregates and source/role counts must also be non-negative integers. Base and dark CSS, Tailwind, and
SCSS catalogs use decoded occurrence lists and require exactly one declaration for every expected implementation name,
including inline declarations. DESIGN.md scans every occurrence of the localized dark-mode marker before enforcing its
single canonical projection. Every JSON artifact is checked for duplicate decoded object keys before native parsing,
so first-value/last-value ambiguity cannot cross consumer boundaries.

Neutral mutations cover rounded inset text, fractional base and dark counts, direct and escaped base duplicates,
inline dark SCSS duplicates, blockquoted contradictory detection prose, and duplicate DTCG `$value` keys. The complete
unit suite passes 70 files / 770 tests; the affected real-browser style/component suites pass 59/59. A fresh Gate 55
review must pass this exact tree before the remaining browser and live-corpus gates resume.

### Review gate 55 findings and remediation (2026-09-03)

Gate 55 found three remaining cases where internally consistent text could still describe an ineffective or
under-supported result. A colluding Evidence/DTCG edit could turn a two-route token into a claimed two-of-four
foundation while preserving ratio arithmetic. Implementation declarations could be moved to a wrong base selector or
left only inside comments because the audit counted declarations without validating their effective owner. A second
dark-color table inside a blockquote or nested list was invisible to the raw-line ownership scan.

Portable promotion and dark restoration now defensively reapply the same one-page or multi-page foundation thresholds
used when evidence is built. Bundle validation additionally bounds eligible routes and captures by the actual Evidence
page catalog. The stylesheet audit uses a quote-aware lexical pass that removes block and SCSS line comments before
reading declarations. It requires the exact generated base owners: `:root` for CSS, `@theme` plus the supplemental
`:root` split for Tailwind, and top-level declarations for SCSS; existing exact value/count checks then operate within
those owners. Dark CSS and SCSS use the same effective-text parsing. Dark table headings, boundaries, and rows now use
the shared Markdown-container normalization before global ownership comparison.

Neutral tests cover producer/restoration under-coverage, colluding two-of-four bundle evidence, wrong base owners in
all three stylesheet formats, comment-only dark declarations in all formats, and English/Chinese dark tables nested in
Markdown containers. The focused suite passes 170/170 and the complete unit suite passes 70 files / 774 tests; type
checking, lint, packaging, and `git diff --check` pass. A fresh Gate 56 review is required on this exact tree.

### Review gate 56 findings and remediation (2026-09-03)

Gate 56 found two remaining provenance shortcuts. First, persisted dark evidence could understate the eligible-route
denominator and attach foreground/background pair evidence to an unrelated token such as spacing. Second, a self
`clip-path: inset(...)` record proved the visible text dimensions but not that the reported bounds occupied the
unclipped part of the element.

Portable coverage is now token-path-aware: only foreground and muted-foreground may use paired-surface support, and
that support still has to pass the complete rendered-owner and route binding checks. Base evidence must name the whole
canonical base-route denominator. Restored dark evidence is instead bound to the actual dark sampling catalog, which
currently contains only the canonical entry-route capture; this neither hides a sampled route nor invents dark
observations for base routes that were never sampled. Malformed persisted pair structures fail closed. The shared
paint validator and independent auditor also require visible bounds to be contained by every edge of the reconstructed
self-inset rectangle, in addition to their existing glyph containment and area checks.

Neutral regressions cover unrelated pair injection, understated route catalogs, malformed stored pairs, and correctly
sized bounds displaced beyond left, right, top, or bottom inset edges. Stale valid bundle fixtures now model their real
two-route base evidence and one-route dark evidence rather than relying on relaxed validation. The focused suite passes
171/171, and the complete CI passes 70 files / 775 tests with type checking, lint, Desktop packaging, and
`git diff --check`. A fresh Gate 57 review must pass this exact tree before browser and live-corpus validation resumes.

### Review gate 57 findings and remediation (2026-09-03)

Gate 57 found one remaining dark provenance ownership error. Both restoration and the independent bundle auditor used
the first canonical page/map entry as the dark sample. Reordering `DesignEvidence.pages` could therefore accept a
subpage-bound dark override while rejecting the correctly entry-bound override, even though `DesignEvidence.source`
identified the entry document explicitly.

Both paths now resolve the entry through the explicit source route identity and select its canonical viewport capture.
The core retains a narrow single-route fallback only for legacy/minimal evidence where the only canonical route is
unambiguous; multi-route evidence without a resolvable source fails closed. The standalone auditor requires the source
identity carried by the complete modern artifact. No new persisted dark-source field was necessary because token owner
records already carry route and viewport, and the Evidence source supplies the independent entry identity.

Neutral regressions reorder pages as `[subpage, entry]`: entry-bound restored evidence and a valid bundle still pass,
while synchronized subpage-bound dark evidence is rejected by both ownership paths. Gate 57's separate concern about a
surface being retained through only a muted foreground did not reproduce; the existing hierarchy validator demotes
both overrides, so no speculative change was made. The focused suite passes 184/184 and complete CI passes 70 files /
777 tests with type checking, lint, Desktop packaging, and `git diff --check`. A fresh Gate 58 review must pass this
exact tree before browser and live-corpus validation resumes.

### Review gate 58 findings and remediation (2026-09-03)

Gate 58 found two false-rejection mismatches in the standalone artifact auditor. The producer intentionally accepts a
readable foreground/surface pair on two of four canonical routes because paired foreground evidence has a 50% route
threshold, but the auditor reapplied the generic 75% rendered-token threshold. Separately, the auditor's canonical
capture map always preferred desktop and counted routes with no eligible capture, while the producer excludes
`health.evidenceEligible === false` and severe horizontal overflow before falling back to tablet or mobile.

Rendered-text promotion validation is now path-aware: foreground and muted-foreground use the same independently
implemented pair qualification rules as the producer, while typography and every other rendered token retain the 75%
generic foundation threshold. The auditor's capture map is now built only from its independently reconstructed
canonical Evidence page IDs, so route denominators, page URLs, and owner viewports use the same observable eligibility
contract without calling producer code.

Neutral tests cover a valid primary foreground pair on two of four routes, rejection at one of four routes, and both
an explicitly ineligible desktop and a severely overflowing desktop whose base and entry-route dark rendered owners
are truthfully bound to the mobile fallback. The focused suite passes 186/186 and complete CI passes 70 files / 779
tests with type checking, lint, Desktop packaging, and `git diff --check`. A fresh Gate 59 review must pass this exact
tree before browser and live-corpus validation resumes.

### Review gate 59 findings and remediation (2026-09-03)

Gate 59 found a real producer/auditor split below the preceding audit fix. The Design Evidence layer and auditor
excluded severely overflowing desktop captures and selected a healthy responsive fallback, but `buildAnalysisOutput`
still merged every health-eligible style capture and `buildTokenEvidence` independently preferred desktop. Severe
overflow is deliberately retained as limitation evidence and can remain health-eligible, so public typography or
foreground owners could come from a desktop capture that the rest of the evidence contract excluded.

Canonical capture selection is now a shared core primitive. Before any public evidence style merge, color clustering,
Token construction, evidence generation, or promotion, analysis output joins style captures to their actual captured
page metadata and selects exactly one capture per route using health eligibility, severe-overflow exclusion, viewport
priority, viewport width, and a stable key. Raw all-capture styles remain diagnostic only. Design Evidence page
selection calls the same primitive, while the standalone auditor continues to reconstruct the rule independently.

The new end-to-end `buildAnalysisOutput` regression gives the severely overflowing desktop capture a Georgia typeface
and the healthy mobile fallback an Inter typeface. In forward and reversed input order, only Inter is exported, every
rendered owner names the mobile capture, and the independently selected Design Evidence page is mobile. Existing
bundle regressions cover the same fallback contract in the standalone auditor. The focused suite passes 187/187 and
complete CI passes 71 files / 780 tests with type checking, lint, Desktop packaging, and `git diff --check`. A fresh
Gate 60 review must pass this exact tree before browser and live-corpus validation resumes.

### Review gate 60 findings and remediation (2026-09-03)

Gate 60 found that the shared canonical selector still received an ambiguous join. Style captures and captured-page
metadata were joined by normalized final URL plus viewport. Two independent navigation transactions can redirect to
the same final URL at the same viewport; the metadata map then retained whichever duplicate appeared last, making
portable Token values and owners depend on array order. Design Evidence could also retain both transactions under one
canonical page identity.

Every committed capture transaction now carries an internal `captureKey` from the analyzer stage through both style
and captured-page inputs. Canonical style selection requires a one-to-one key match and verifies that the matched URL
and viewport still agree. Duplicate final-route/viewport transactions are resolved deterministically from their exact
health records: evidence-eligible, non-overflowing captures win, then the stable transaction key breaks equivalent
ties. Ambiguous legacy inputs without unique transaction keys fail closed instead of using last-write-wins. The same
deduplicated captured-page set feeds Design Evidence, so public Tokens, rendered owners, and canonical pages cannot
disagree about which transaction supplied the evidence. `captureKey` remains internal and is not added to the public
artifact schema.

The regression independently reorders two style arrays and two captured-page arrays for transactions that converge on
the same final URL/desktop viewport, with one healthy Inter capture and one severely overflowing Georgia capture. All
four orderings export only Inter, bind owners to the healthy transaction, and retain one non-overflowing canonical
Evidence page. The focused suite passes 188/188 and type checking plus `git diff --check` pass. Complete CI and a fresh
Gate 61 empty-context review are required on this exact tree before browser and live-corpus validation resumes.

### Review gate 61 findings and remediation (2026-09-03)

Gate 61 reproduced three remaining ways to lose transaction identity. An unkeyed style could use the legacy
URL/viewport fallback after page metadata had already been deduplicated, so a losing transaction could inherit the
winning page. Dark-mode source metadata still contained only URL and viewport, allowing the same error after the base
catalog had selected the correct transaction. Finally, `CapturedPageEvidence` did not prove that its screenshot and
DOM snapshot named the same URL and viewport.

The join now evaluates legacy uniqueness against the original, pre-deduplication collections. Keyed and unkeyed inputs
cannot mix: keyed joins require exactly one matching key on each side, while legacy joins require exactly one raw page
and one raw style with neither side keyed. Duplicate keys and partially keyed groups fail closed. A shared captured-page
validator rejects any transaction whose normalized screenshot URL or viewport contradicts its DOM snapshot, both at
the analysis boundary and inside the independently callable Design Evidence builder.

Dark sampling now receives the same analyzer stage key as its light styles and page snapshot. The winning transaction
key is retained as a non-enumerable in-memory Evidence-page field, checked before dark Tokens are built, and explicitly
removed by persistence sanitization. Fresh artifacts with an unbound or mismatched dark source produce no dark export,
including no rejected-candidate residue in DTCG. `buildAnalysisArtifacts` performs this check against the original
transaction-bearing Evidence, while every generated artifact and deterministic context consumes the sanitized copy.
Genuinely legacy records remain compatible only when both source and Evidence lack transaction keys.

Neutral regressions cover independent duplicate ordering, missing keys, a key on only one side, duplicate keys on each
side, style URL/viewport contradictions, screenshot URL/viewport contradictions through both builders, matching keyed
dark provenance, losing keyed dark provenance, missing-key dark provenance, and public JSON stripping. The focused
suite passes 275/275 and complete CI passes 71 files / 790 tests with type checking, lint, Desktop packaging, and
`git diff --check`. A fresh Gate 62 empty-context review must pass this exact tree before browser and live-corpus
validation resumes.

### Review gate 62 findings and remediation (2026-09-03)

Gate 62 found one compatibility regression in the new dark transaction check. `buildAnalysisArtifacts` correctly
passed raw transaction-bearing Evidence, but `resolveCanonicalDarkSource` compared its raw page URL with a sanitized
source URL. A legitimate query-bearing entry route was therefore rejected even when route ID, capture key, viewport,
and the complete raw URL all matched.

Dark URL comparison is now symmetric: the Evidence page may match either the complete source document identity or its
explicitly sanitized public identity. This supports the raw fresh-analyzer path and the sanitized legacy/public path;
the independently checked opaque route ID, exact capture key for modern records, and viewport still have to agree, so
the relaxation cannot bind a different transaction. A production-shaped `buildAnalysisArtifacts` regression uses a
raw query-bearing Evidence page and matching keyed dark source, verifies that the dark export is retained, and checks
that neither the private query value nor `captureKey` appears in DESIGN.md, DTCG, Evidence/Profile/Component/Visual-QA
JSON, CSS, Tailwind, or SCSS. The preceding mismatched-key and missing-key negative bundle cases remain in force.

The focused suite passes 276/276 and complete CI passes 71 files / 791 tests with type checking, lint, Desktop
packaging, and `git diff --check`. A fresh Gate 63 empty-context review must pass this exact tree before browser and
live-corpus validation resumes.

### Review gate 63 result (2026-09-03)

The final empty-context review passed with no reproducible systemic correctness blocker. Its independent six-case
transaction matrix covered matching raw-query dark provenance, sanitized unkeyed legacy compatibility, query/route/
key/viewport mismatches, one-sided keys, duplicate or missing page/style identities, metadata contradictions, and
order-independent duplicate redirects. It also confirmed that private query values and internal capture keys do not
enter public artifacts. The reviewer independently reran the 276 focused tests and all 71 files / 791 unit tests.

Per the agreed stopping rule, the code-review loop is complete. Only a later browser or corpus result that materially
misleads a design Agent reopens it; isolated site-specific or cosmetic imperfections are recorded in
`ANALYZER_QUALITY_TODO.md` and do not block completion.

## Phase 8 — Original 20-site live validation

Rerun the exact usable corpus from the original audit:

1. Airbnb
2. Apple
3. Atlassian
4. BBC
5. Cloudflare
6. DEV
7. Dropbox
8. GitHub
9. GitLab
10. Guardian
11. Linear
12. Microsoft
13. NASA
14. Next.js
15. NPR
16. React
17. Shopify
18. Slack
19. Stripe
20. W3C

Execution:

- Build the current shared CLI once.
- Run sites 1–10 concurrently, with no more than 10 active site analyses.
- Finish and collect the first batch before starting sites 11–20.
- Store commit, dirty state, browser environment, run logs, artifacts, and audit metrics in ignored `tmp/` output.
- Do not silently substitute another site when one is restricted or unavailable.

Per-site classification:

- `pass`: usable evidence and all hard invariants pass;
- `degraded-but-truthful`: external restriction or partial coverage is explicit and no unsupported rule is emitted;
- `analyzer-failure`: crash, zero-evidence success, invalid artifact, unresolved reference, or incorrect promotion.

Hard corpus gates:

- analyzer failures: 0;
- zero-evidence successes: 0;
- invalid YAML or unresolved references: 0;
- low-confidence portable tokens: 0;
- low-reuse P1 recipes: 0;
- component recipes containing section-responsive claims: 0;
- duplicate complete component entities: 0;
- every external/coverage limitation is explicit.

Agent-usability audit:

- Inspect every DESIGN.md structurally and compare at least one canonical screenshot per site for palette hierarchy,
  typography hierarchy, density, major component semantics, and misleading global claims.
- Accept occasional minor extraction imperfections caused by unique site implementations when they are scoped or
  disclosed and do not materially mislead an implementation agent.
- Reject errors that would cause an agent to choose the wrong foundation, component role, responsive behavior, or
  implementation token.

If a systemic issue appears, add a neutral fixture, fix it, repeat the empty-context review gate, and rerun the affected
live sites. Rerun the complete 20-site corpus when the change can affect shared promotion or export behavior.

## Phase 9 — Final review and commits

- Review the final working tree for unrelated changes.
- Run `pnpm run ci` on the final tree.
- Ensure the latest empty-context reviewer passed the same final code and artifacts.
- Functional commits may be created before the complete goal is finished, but only after that functional gate is
  internally complete, controlled tests pass, and its review findings are resolved. Do not commit half-fixes merely
  to checkpoint individual edits.
- Use English Conventional Commit messages and logically self-contained commits. A commit does not end the goal;
  continue through independent review and the full twenty-site validation.
- Rerun `pnpm run ci` after the final committed HEAD and after any later corpus-driven fix.

## Definition of done

The goal is complete when:

- all controlled and repository test gates pass;
- independent empty-context review passes with no blocking correctness issue;
- the original 20 sites have been attempted in two batches of at most 10 concurrent analyses;
- all usable/degraded artifacts satisfy the hard invariants;
- the corpus audit finds no systemic issue that would materially mislead an agent using DESIGN.md;
- any remaining minor imperfections are isolated, honestly scoped, and do not affect agent design decisions;
- every committed functional slice is complete and green, and the final corpus-validated code is committed.
