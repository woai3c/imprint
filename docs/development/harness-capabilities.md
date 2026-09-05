# Harness Capability Report

## Scope and evidence boundary

This report covers the Imprint repository and the local macOS Codex session that prepared these workflow changes.
The starting base was `e23833f35e8827e64285c204b49c58664d23bb34` with seven pre-existing analyzer/navigation/page-health
source and test edits. During this task, those edits were committed outside this harness work as
`d15f07473a50eca9f823c3c0054fe09fd85d1803`. Their before/after SHA-256 hashes match. Local command evidence covers that
disclosed source state; the verified candidate was `d15f074` plus this harness patch before commit, not another OS or clean base.
The requesting maintainer owns acceptance and future report updates through the normal change workflow.

The starting repository already had product/architecture guidance, pinned tools, fixtures, unit tests, E2E and release
automation. It lacked a portable context/knowledge lifecycle, general review/acceptance handoff, and unit execution in
PR/tag CI. The change links those rules from `AGENTS.md` and adds the existing `pnpm test` to the two existing workflows.
It introduces no Agent runtime, model provider, package dependency, or automatic knowledge writer.

`READY` means a representative path was demonstrated in the stated scope. `PARTIAL` identifies a working subset;
`SETUP REQUIRED` means a selected path still needs named setup; `NOT CONFIGURED` means no active path is selected;
`UNVERIFIED` means the evidence is insufficient; `NOT APPLICABLE` means the surface is outside this product/scope.
These statuses do not describe task success. Runtime/tool availability in this session does not guarantee another host.

## Operational capabilities

| Capability / scope                                  | Status           | Direct evidence and limitation                                                                                                                                                                                                                                                                                             | Fallback or setup; reevaluate when                                                                                                                                              |
| --------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientation, architecture and instruction delivery  | `PARTIAL`        | This session received root `AGENTS.md` and read relevant current source/config. The new workflow routes to existing product and component owners. Automatic loading/refresh in other hosts is unverified.                                                                                                                  | Explicitly read root and applicable nested instructions; recheck on host/session or instruction changes.                                                                        |
| Task-scoped context selection                       | `PARTIAL`        | [Context Selection Gate](workflow.md#select-context-before-relying-on-it) distinguishes intent, current source, task evidence and uncertainty. This task identified dirty source, ignored local plans and remote revision limits. Sustained adoption is not measured.                                                      | Reassemble the bounded packet at each stage/resume; maintainer resolves intent conflicts. Reevaluate after workflow or ownership changes.                                       |
| Planning / Human Plan Review                        | `READY`          | The requesting maintainer supplies scope and decisions through the live task conversation; [workflow](workflow.md#define-plan-and-implement) preserves existing authorization and requires missing material decisions.                                                                                                     | An unattended session must use an existing issue/PR decision or stop dependent work. Recheck when decision owner/channel changes.                                               |
| Local typecheck and Unit tests                      | `READY`          | `pnpm typecheck` and `pnpm test` passed on this macOS worktree: 76 files, 916 tests. Commands/configs are repository-owned.                                                                                                                                                                                                | Rerun affected checks after source/toolchain changes; broader scope is not inferred from this result.                                                                           |
| Separate Integration suite                          | `NOT CONFIGURED` | Vitest selects `tests/unit/**/*.test.ts`; inspected tests include cross-module cases, and Node E2E covers process boundaries. No dedicated Integration project is declared.                                                                                                                                                | Use existing Unit/E2E coverage for relevant boundaries; no extra framework is needed merely for this label. Recheck if a dedicated suite is introduced.                         |
| Shared-core architecture enforcement                | `PARTIAL`        | Shared-engine ownership is documented; TypeScript checks pass. The source-build CLI configuration excludes Electron entrypoints, but no dedicated forbidden-import gate was found.                                                                                                                                         | Review shared-core dependency direction and run the CLI build when it changes. Recheck on boundary/config changes; add enforcement only for a demonstrated regression.          |
| Targeted browser extraction/evidence runtime        | `UNVERIFIED`     | Annotated suite and neutral loopback fixtures exist; Chrome is installed here. No browser semantic run was executed for this harness change.                                                                                                                                                                               | Use [runtime paths](verification.md#targeted-runtime-verification); maintainer exercises affected URL flow when unavailable. Recheck after browser, analyzer or oracle changes. |
| Targeted Desktop UI/IPC runtime                     | `UNVERIFIED`     | Playwright/Electron tests isolate userData; no fresh desktop build/interaction was exercised here.                                                                                                                                                                                                                         | Use the scoped Desktop launch/test path, or record human local evidence; recheck after native, renderer, IPC, host or platform changes.                                         |
| Migration runtime                                   | `UNVERIFIED`     | Synthetic legacy-database E2E checks migration/idempotence; it was inspected, not executed here, and is not downgrade evidence.                                                                                                                                                                                            | Run its isolated path before migration acceptance; maintainer owns recovery decisions. Recheck on schema/native-module changes.                                                 |
| CLI and local stdio MCP runtime                     | `UNVERIFIED`     | Source build and official MCP-client tests exist. Neither a fresh CLI build nor process/protocol run was performed here. Installable CLI/MCP distribution remains next-stage work.                                                                                                                                         | Execute the scoped build/invocation path; do not claim installed bin availability. Recheck on entrypoint/SDK/protocol changes.                                                  |
| Independent pre-acceptance review (this Codex host) | `READY`          | One fresh-context, same-model reviewer inspected the exact eight-file candidate without implementation history, ownership or edits. One storage-disclosure finding returned to implementation and was re-reviewed as resolved. This proves the current host's review path, not model diversity or another host.            | Use one bounded no-edit review for non-trivial work; elsewhere use labeled self-review plus maintainer technical review if unavailable. Recheck each host/candidate.            |
| Human Local Acceptance                              | `READY`          | The requesting maintainer and live conversation provide a decision route. After the verified handoff, the maintainer accepted this harness scope and authorized a local commit.                                                                                                                                            | Future changed behavior still needs its own acceptance decision. Recheck when owner/channel or accepted scope changes.                                                          |
| Draft / Ready PR handling                           | `PARTIAL`        | GitHub PR workflow exists; [workflow](workflow.md#review-accept-and-deliver) defines the handoff. New guidance is local only, and no PR was created here.                                                                                                                                                                  | Maintainer records acceptance and checks the current head before Ready; recheck after publication or policy changes.                                                            |
| PR CI execution                                     | `PARTIAL`        | GitHub lists PR Check active and [one successful prior run](https://github.com/woai3c/imprint/actions/runs/32158927510) at `99e2900`. New Unit steps have local command evidence only. Fork behavior and new-candidate execution are unverified.                                                                           | [Remote verification](#remote-verification-and-human-setup); account for every current-head job, including format-created commits. Recheck on each changed workflow/head.       |
| Merge enforcement on `main`                         | `NOT CONFIGURED` | GitHub returned `Branch not protected`; repository rulesets and effective branch rules were empty at inspection.                                                                                                                                                                                                           | Administrator chooses manual governance or protection; until then the maintainer checks gates/acceptance manually. Recheck settings before relying on enforcement.              |
| Platform AI review                                  | `UNVERIFIED`     | No repository reviewer workflow/config was found; available workflow APIs do not prove absence of an independently installed App. No platform review run was verified.                                                                                                                                                     | Use local separate-context review and maintainer technical review. Administrator can verify App/runner configuration before claiming this capability.                           |
| Full E2E and release delivery                       | `PARTIAL`        | Existing policy runs E2E on PRs and tags. [Latest inspected tag run](https://github.com/woai3c/imprint/actions/runs/33951511686), at base `e23833f`, failed its E2E step; native builds/publishing were skipped. A [prior release run](https://github.com/woai3c/imprint/actions/runs/33159635956) succeeded at `6eeef88`. | Release maintainer owns the failed gate; inspect/reproduce its failure before release. No diagnosis or repair is claimed here. Recheck exact candidate/runner results.          |
| Continuous Knowledge Capture                        | `PARTIAL`        | [Knowledge Promotion Gate](workflow.md#promote-only-confirmed-knowledge) owns provenance, confirmed adoption, smallest-owner routing and stale-rule removal. Current CI omission was verified from definitions and repaired; long-term reuse is unmeasured.                                                                | Maintainer confirms meaning; keep unconfirmed candidates in task evidence. Reevaluate after contradictory evidence or ownership changes.                                        |
| Automatic post-merge knowledge audit                | `NOT CONFIGURED` | No merge-triggered collector, headless Agent/model path or knowledge-PR workflow is configured in the repository.                                                                                                                                                                                                          | Capture confirmed knowledge during work; late lessons use a separate human-reviewed change. Optional automation needs an explicit owner/provider/cost decision.                 |
| Hosted service observability and staging            | `NOT APPLICABLE` | Public delivery is a local Desktop app; CLI/MCP are local source entrypoints, not an Imprint-operated service.                                                                                                                                                                                                             | Use local runtime evidence and GitHub release job/assets for applicable diagnosis. Reassess only if an operated service is introduced.                                          |

## Remote verification and human setup

At the initial handoff, `AGENTS.md`, README links, these three guides, and both CI edits were `WORKTREE ONLY`.
The maintainer subsequently accepted the reviewed scope and authorized a local commit. Resolve local delivery evidence
from the commit containing these paths; push and remote activation require separate evidence. Existing remote workflow
activity does not activate the new Unit steps. Future clones receive the changes only after authorized push delivery.

For GitHub, the repository administrator or authorized maintainer should:

1. After normal review/acceptance and authorized publication, inspect a PR against `main` on the actual resulting head.
   Verify Lint & Format, Type Check (including the added unit step), Electron E2E, and Commit Message Check. Record run
   URL, head/merge revision as applicable, each result, and any format-generated commit. Fork checkout/write behavior has
   not been demonstrated; retain that exclusion until an approved representative fork run verifies it.
2. Inspect `main` protection/rules and explicitly decide whether to keep manual merge governance or configure required
   checks/review. Changing these settings requires administrator authority; documentation cannot enforce them. If selected,
   verify actual required-check behavior without merging an intentionally failing change. Revert through the same owner.
3. Treat the failed release run as unresolved release evidence. Inspect its failing test and rerun relevant local/hosted
   checks on the repaired candidate before separately authorizing publication. Do not retry tags or publish assets merely
   to improve a capability label. Signing configuration belongs to the existing release workflow; no secret values were
   inspected or installed in this task.

Read-only inspection can use the existing authenticated `gh` client: `gh run view <run-id> --repo woai3c/imprint`,
`gh api repos/woai3c/imprint/branches/main/protection`, `gh api repos/woai3c/imprint/rulesets`, and
`gh api repos/woai3c/imprint/rules/branches/main`. Lack of access is `UNVERIFIED`, not proof that configuration is absent.
No broader credentials or model integration are required for the repository-owned manual workflow. Optional platform AI
review or automatic knowledge audit remains a separate decision: choose a runner/provider, scoped permissions, untrusted
contribution handling, cost/timeout/failure route and human-reviewed output before installing automation. No App or paid
service was selected here.

## Current task outcomes

Keep this snapshot separate from the capability rows. The actual local candidate is `d15f074` plus this harness patch;
it is not a clean-base product certification. The harness task did not change the seven pre-existing source/test files.

- `PASSED`: initial bounded inventory (Schema v7, no traversal/report truncation), current command/config inspection,
  typecheck, and the 916-test unit suite.
- `PASSED`: scoped Prettier checks, 45 local links/anchors, YAML parsing, documented command/test paths, and diff whitespace.
  Semantic YAML comparison verified that only the two unit steps changed; existing triggers/jobs/permissions were retained.
- `PASSED`: final Schema v7 inventory discovers all three new guides and the root links, with no traversal/report
  truncation or broken root links. Git status/diff and source hashes separately establish the change boundary; the scanner
  deliberately does not certify worktree cleanliness.
- `PASSED`: independent review by the fresh-context Codex reviewer `harness_review`, with no implementation ownership or
  edits. Its P2 finding about persistent/retained runtime captures was adopted, documented from source, and re-reviewed as
  resolved with no new findings. Review covered the eight-file candidate at `d15f074` with verification-guide SHA-256
  `c995e5e264702dc2f2d79737e28264283044f926ac7b745a29bb1b475a3a736a`. The subsequent outcome/status-only report update received
  scoped static validation and non-independent implementer review; it is outside the independent review snapshot.
- `NOT EXECUTED`: local Desktop/browser/CLI/MCP/E2E runs; no product behavior changed in this patch. Next full E2E boundaries
  are the existing PR and tag workflows; targeted runtime evidence for new product work still follows the guide.
- `PASSED`: Human Local Acceptance of the reviewed harness scope, recorded in the follow-up task conversation together
  with authorization to commit locally. This does not authorize push, PR, merge, release, or external policy changes.
- `NOT EXECUTED`: new remote CI steps, push, PR, merge or release. Local delivery is established by Git commit evidence;
  remote behavior and the previously reported runtime exclusions remain unverified for the new candidate.

Harness effectiveness over repeated tasks has not been evaluated. Product benchmarks are not harness-effectiveness
evidence. A fresh review/check can establish this candidate's coherence, not long-term reliability or semantic correctness.
