# Development workflow

This is Imprint's repository-owned workflow for AI-assisted development. Its commands and decision paths use ordinary
repository files, the active Agent host, and the maintainer's task conversation or PR. No bootstrap Skill is required.
The requesting maintainer owns intent, consequential plan decisions, and Human Local Acceptance. Repository administrators
own remote policy; the release maintainer owns publication. Agent instructions are advisory, not a sandbox or proof of
approval. See the [Capability Report](harness-capabilities.md) for actual availability and [verification](verification.md)
for check selection.

## Select context before relying on it

At exploration, planning, implementation, review, and handoff, assemble the smallest packet that can affect that stage:

1. Identify the canonical worktree, current revision plus uncommitted changes, relevant paths, and applicable root/nested
   instructions. Preserve existing work. Instructions in a showcase's `prompt/` apply to that example, not Imprint.
2. Carry the user's goal, constraints, independently stated acceptance criteria, authorized decisions, and unresolved
   questions. Keep intended behavior separate from what the current code happens to do.
3. Select sources from the routing table below. Check relevance, authority for the question, path/platform/version scope,
   currentness, and contradictions. Include enough surrounding code and tests to understand consumers and side effects.
4. Bind test results and findings to the actual candidate, inputs, environment, and exclusions. Recheck volatile facts
   after edits, dependency or CI changes, a new host, compaction/resume, or a changed requirement. Old test output or a
   previous Agent summary cannot establish the new candidate's state.
5. Preserve `Observed`, `Inferred`, and `Unknown` claims explicitly. Return a conflict that changes intent or design to the
   requesting maintainer; otherwise carry its narrower limitation forward. Do not replace uncertainty with a summary.

| Task concern                        | Start with the smallest authoritative owners                                                                                                                                                 | Revalidate when                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Product scope and public interfaces | [README](../../README.md), [AGENTS](../../AGENTS.md), relevant `src/cli` / `src/mcp` contracts                                                                                               | User intent or release scope changes                                |
| Renderer appearance or interaction  | [DESIGN.md](../../DESIGN.md), affected renderer component/store, both renderer locale catalogs                                                                                               | Theme, copy, flow, or desktop-shell behavior changes                |
| Extraction and truthful exports     | `src/core/analyzer`, `src/core/design-evidence`, `src/core/design-context`, `src/core/export`; related unit tests and [annotated fixtures](../../tests/design-evidence-regression/README.md) | Shared contracts, evidence semantics, or output guidance changes    |
| Desktop IPC, persistence, lifecycle | `src/main/preload.ts`, `src/main/ipc.ts`, `src/main/database.ts`, `src/main/index.ts`; affected E2E tests                                                                                    | IPC, schema, recovery, authentication, or platform behavior changes |
| Comparison claims                   | [comparison fixtures](../../tests/comparison-site/README.md) and [benchmark policy](../../tests/comparison-benchmark/README.md)                                                              | Algorithm, corpus, ground truth, or frozen policy changes           |
| Commands and delivery               | [package.json](../../package.json), actual scripts/configs, [verification](verification.md), `.github/workflows`                                                                             | Toolchain, hook, workflow, runner, or permissions change            |

Use repository search and links; do not load every row for every task. Ignored `tmp/`, research outputs, local plans, logs,
and `.x-code` sessions are task evidence only when explicitly relevant. They are not maintained project authority or
portable prerequisites. Do not publish their contents or private captured-site data as context. Runtime results establish
observed behavior; product intent comes from the maintained specification or an authorized human decision.

## Define, plan, and implement

Keep goal, constraints/non-goals, acceptance criteria, affected surfaces, risks, unknowns, and the proposed verification
in the task conversation or existing issue/PR. Persist a plan only when review or resumption needs it.

A small, reversible, unambiguous change within an explicit request can use an inline plan and proportionate self-review.
Non-trivial work includes changes to shared extraction semantics, public CLI/MCP or IPC contracts, saved analyses and
migrations, authentication/session handling, desktop lifecycle, or CI/release behavior. Present the approach, affected
owners, meaningful tradeoffs, and verification before implementing it. Reuse explicit authorization already given for
that direction; ask for Human Plan Review only where a material decision is still missing. Silence is not approval.

Implement the authorized scope, run the fastest relevant checks, then exercise changed behavior in its applicable safe
runtime. Failures return to implementation and affected verification. Intent or plan defects return to the maintainer
and planning. Follow the [verification ladder](verification.md); documentation changes do not need a fabricated UI flow.

## Review, accept, and deliver

For non-trivial work, use one fresh-context Reviewer Agent when the host can supply it. Give it the goal and acceptance
criteria, authorized plan/decisions, applicable instructions, exact candidate/diff, related source/tests, verification
results, exclusions, and unknowns. Do not forward the full implementation conversation or its verdict. The reviewer has
no implementation ownership and must not edit the candidate. Use one bounded review pass; the implementer owns repairs.

Record reviewer host, context separation, reviewed revision or worktree identity, scope, and unavailable evidence. A
same-model fresh session provides context separation, not model diversity. Findings name consequence, file/location,
evidence, violated requirement, and the check needed after repair. Findings return through implementation, affected fast
and runtime checks, and review of the changed candidate. On reviewer failure or timeout, disclose missing review; do not
loop automatically. Without a fresh review path, label self-review non-independent and route non-trivial work to the
requesting maintainer for Human Technical Review before acceptance. Small fast-path edits may use self-review alone.

The maintainer then decides whether the outcome is wanted using the demonstrated acceptance criteria, review findings,
and missing evidence. Record Human Local Acceptance in the conversation or PR, separately from technical results.
If it is pending, hand off the reviewable local candidate or an authorized Draft. A behavior defect returns through
implementation, checks, and review; changed intent returns to planning. Neither green tests nor a review pass approves
product meaning. For desktop appearance and lifecycle, show the affected platform/flow; add another environment's human
acceptance only when platform differences or risk make local evidence insufficient.

Draft PRs are work in progress. Create or mark Ready only after relevant verification, independent review or its named
fallback, and Human Local Acceptance are accounted for. Commit, push, remote PR changes, merge, and release require the
user's authority for that action; preparing a candidate does not provide it. Changes still in a worktree do not reach
future clones or activate GitHub features.

Account for every applicable job in [PR Check](../../.github/workflows/pr-check.yml) at the current PR candidate. A failed,
cancelled, timed-out, missing, or unexpectedly skipped gate is not success. The format job can push a new commit: inspect
the resulting head and rerun/reconcile checks and review for it before claiming readiness. Do not assume a bot commit
triggered another run. Hosted E2E placement is in [verification](verification.md#e2e-placement-and-release).
Platform AI review is separate from local review and applies only when configured. CI or platform findings return to
implementation, local checks, applicable fresh review, PR update, and all applicable gates. Repeat Human Acceptance when
the repair changes accepted behavior. A maintainer must check this manually where branch protection is absent.

## Promote only confirmed knowledge

During the current change, evaluate each potential lesson through the Knowledge Promotion Gate: is it durable beyond
this task, non-obvious from nearby code, reusable, and supported by an authoritative source or explicit owner decision?

- `Observed`: cite direct evidence and distinguish actual behavior from intended policy. Only confirmed meaning may
  become a rule; an implementation-derived test alone does not establish product intent.
- `Inferred`: record supporting evidence and confidence in the task/issue; it remains a candidate, not policy.
- `Unknown`: record the question, engineering impact, and human or source that can resolve it; block only dependent work.

Update the smallest existing owner in the same reviewable change: product appearance belongs in `DESIGN.md`, supported
public behavior in the README pair, workflow in this document, verification in its guide or the relevant fixture README,
and cross-cutting Agent invariants in `AGENTS.md`. Link to tool configuration for fully mechanical conventions. If no
maintained owner can hold a confirmed architecture/product/operations fact, add one focused document under the relevant
`docs/` subject and route to it. Keep semantic intent/rationale separate from a test, type, lint rule, or CI check that
enforces its deterministic part. Add enforcement only when it protects a confirmed behavior economically.

For review-derived lessons, record whether feedback was adopted, rejected, superseded, or unresolved; require final-diff
and specification/test/decision evidence of adoption. A resolved thread, "fixed" statement, or merge is insufficient.
Include scope and a revalidation trigger for volatile facts. Revise/remove stale knowledge and update links; do not append
raw transcripts, transient results, inferred preferences, or implementation inventories to global instructions.
Reverify and review material knowledge changes. Late confirmed discoveries use a separate human-reviewed change through
the same workflow. Automatic post-merge knowledge audit is not configured and is not required for this manual path.

## Handoff evidence

Use the conversation or PR to state the goal/outcome, candidate identity (including dirty work), changed owners, relevant
commands and results, runtime provenance/exclusions, review provenance and finding dispositions, Human Acceptance,
knowledge changes, risks, and next required action. Use `PASSED`, `FAILED`, `NOT EXECUTED`, or `NOT APPLICABLE` per check.
For an unexecuted applicable check, name capability status, reason, consequence, and fallback/owner.
Record artifact delivery separately as `WORKTREE ONLY`, `COMMITTED`, or `PUSHED`; claim `PLATFORM ACTIVE` only with direct
evidence that the platform consumes that revision. Update affected [capability rows](harness-capabilities.md) when their
prerequisites or representative evidence change. A handoff is not Human Acceptance or release approval.
