# Harness Capability Report

## Scope and evidence boundary

This report originally covered the Imprint repository and the local macOS Codex session that prepared these workflow changes.
The dated Windows source-entrypoint update below has its own candidate and exclusions; it does not extend the original
macOS runtime evidence or establish release readiness.
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

| Capability / scope                                  | Status           | Direct evidence and limitation                                                                                                                                                                                                                                                                                                                                                          | Fallback or setup; reevaluate when                                                                                                                                                                                                                            |
| --------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientation, architecture and instruction delivery  | `PARTIAL`        | This session received root `AGENTS.md` and read relevant current source/config. The new workflow routes to existing product and component owners. Automatic loading/refresh in other hosts is unverified.                                                                                                                                                                               | Explicitly read root and applicable nested instructions; recheck on host/session or instruction changes.                                                                                                                                                      |
| Task-scoped context selection                       | `PARTIAL`        | [Context Selection Gate](workflow.md#select-context-before-relying-on-it) distinguishes intent, current source, task evidence and uncertainty. This task identified dirty source, ignored local plans and remote revision limits. Sustained adoption is not measured.                                                                                                                   | Reassemble the bounded packet at each stage/resume; maintainer resolves intent conflicts. Reevaluate after workflow or ownership changes.                                                                                                                     |
| Planning / Human Plan Review                        | `READY`          | The requesting maintainer supplies scope and decisions through the live task conversation; [workflow](workflow.md#define-plan-and-implement) preserves existing authorization and requires missing material decisions.                                                                                                                                                                  | An unattended session must use an existing issue/PR decision or stop dependent work. Recheck when decision owner/channel changes.                                                                                                                             |
| Local typecheck and Unit tests                      | `READY`          | `pnpm typecheck` and `pnpm test` passed on the current macOS npm-distribution candidate: 77 files, 955 tests. Commands/configs are repository-owned.                                                                                                                                                                                                                                    | Rerun affected checks after source/toolchain changes; broader scope is not inferred from this result.                                                                                                                                                         |
| Separate Integration suite                          | `NOT CONFIGURED` | Vitest selects `tests/unit/**/*.test.ts`; inspected tests include cross-module cases, and Node E2E covers process boundaries. No dedicated Integration project is declared.                                                                                                                                                                                                             | Use existing Unit/E2E coverage for relevant boundaries; no extra framework is needed merely for this label. Recheck if a dedicated suite is introduced.                                                                                                       |
| Shared-core architecture enforcement                | `PARTIAL`        | Shared-engine ownership is documented; TypeScript checks pass. The source-build CLI configuration excludes Electron entrypoints, but no dedicated forbidden-import gate was found.                                                                                                                                                                                                      | Review shared-core dependency direction and run the CLI build when it changes. Recheck on boundary/config changes; add enforcement only for a demonstrated regression.                                                                                        |
| Targeted browser extraction/evidence runtime        | `UNVERIFIED`     | Annotated suite and neutral loopback fixtures exist; Chrome is installed here. No browser semantic run was executed for this harness change.                                                                                                                                                                                                                                            | Use [runtime paths](verification.md#targeted-runtime-verification); maintainer exercises affected URL flow when unavailable. Recheck after browser, analyzer or oracle changes.                                                                               |
| Targeted Desktop UI/IPC runtime                     | `UNVERIFIED`     | Playwright/Electron tests isolate userData; no fresh desktop build/interaction was exercised here.                                                                                                                                                                                                                                                                                      | Use the scoped Desktop launch/test path, or record human local evidence; recheck after native, renderer, IPC, host or platform changes.                                                                                                                       |
| Migration runtime                                   | `UNVERIFIED`     | Synthetic legacy-database E2E checks migration/idempotence; it was inspected, not executed here, and is not downgrade evidence.                                                                                                                                                                                                                                                         | Run its isolated path before migration acceptance; maintainer owns recovery decisions. Recheck on schema/native-module changes.                                                                                                                               |
| CLI and local stdio MCP runtime                     | `READY`          | The current macOS candidate passed all 29 serial CLI/MCP process checks after a fresh build, including real loopback extraction, every format, protocol errors, SIGINT, cancellation and graceful transport cleanup.                                                                                                                                                                    | Windows signal handling and a human-selected MCP host remain separate acceptance surfaces. Recheck on entrypoint, SDK, protocol, browser or packaging changes.                                                                                                |
| npm CLI/MCP distribution                            | `PARTIAL`        | `design-imprint@0.1.1` is public from `cli-v0.1.1`. The tagged Ubuntu workflow passed 955 unit tests, all 29 CLI/MCP process tests and installed-package smoke tests; the public tarball then passed the same macOS CLI/MCP extraction smoke path and matched the workflow artifact's registry SRI. The package contains 106 compiled/documentation/license files, not the source tree. | Configure Trusted Publishing for `cli-release.yml` with direct `npm publish` allowed; the bootstrap release used maintainer web authentication. Verify a future OIDC publication and Windows installed-package behavior. Recheck each package/release change. |
| Independent pre-acceptance review (this Codex host) | `READY`          | Fresh-context reviewers `npm_release_review` and `release_channel_review` inspected the candidate without implementation ownership or edits. Their packaging, integrity, channel-isolation, Windows-path, stable-tag and retry-state findings were repaired; final read-only review found no remaining P0-P3 issue. This proves context separation, not model diversity.                | Use one bounded no-edit review for non-trivial work; elsewhere use labeled self-review plus maintainer technical review if unavailable. Recheck each host/candidate.                                                                                          |
| Human Local Acceptance                              | `READY`          | The requesting maintainer and live conversation provide a decision route. After the verified handoff, the maintainer accepted this harness scope and authorized a local commit.                                                                                                                                                                                                         | Future changed behavior still needs its own acceptance decision. Recheck when owner/channel or accepted scope changes.                                                                                                                                        |
| Draft / Ready PR handling                           | `PARTIAL`        | GitHub PR workflow exists; [workflow](workflow.md#review-accept-and-deliver) defines the handoff. New guidance is local only, and no PR was created here.                                                                                                                                                                                                                               | Maintainer records acceptance and checks the current head before Ready; recheck after publication or policy changes.                                                                                                                                          |
| PR CI execution                                     | `PARTIAL`        | GitHub lists PR Check active and [one successful prior run](https://github.com/woai3c/imprint/actions/runs/32158927510) at `99e2900`. New Unit steps have local command evidence only. Fork behavior and new-candidate execution are unverified.                                                                                                                                        | [Remote verification](#remote-verification-and-human-setup); account for every current-head job, including format-created commits. Recheck on each changed workflow/head.                                                                                     |
| Merge enforcement on `main`                         | `NOT CONFIGURED` | GitHub returned `Branch not protected`; repository rulesets and effective branch rules were empty at inspection.                                                                                                                                                                                                                                                                        | Administrator chooses manual governance or protection; until then the maintainer checks gates/acceptance manually. Recheck settings before relying on enforcement.                                                                                            |
| Platform AI review                                  | `UNVERIFIED`     | No repository reviewer workflow/config was found; available workflow APIs do not prove absence of an independently installed App. No platform review run was verified.                                                                                                                                                                                                                  | Use local separate-context review and maintainer technical review. Administrator can verify App/runner configuration before claiming this capability.                                                                                                         |
| Full E2E and release delivery                       | `PARTIAL`        | Desktop `vX.Y.Z` and CLI/MCP `cli-vX.Y.Z` releases are independent. CLI run [`35306136865`](https://github.com/woai3c/imprint/actions/runs/35306136865) passed and created the non-latest `cli-v0.1.1` GitHub Release without running Desktop jobs; GitHub's latest release remained Desktop `v0.1.2`. Fresh Desktop native builds were outside this release.                           | Verify the applicable channel workflow on each exact tag. Recheck after workflow, runner, signing, package or release-policy changes; Desktop still owns its native E2E/build boundary.                                                                       |
| Continuous Knowledge Capture                        | `PARTIAL`        | [Knowledge Promotion Gate](workflow.md#promote-only-confirmed-knowledge) owns provenance, confirmed adoption, smallest-owner routing and stale-rule removal. Current CI omission was verified from definitions and repaired; long-term reuse is unmeasured.                                                                                                                             | Maintainer confirms meaning; keep unconfirmed candidates in task evidence. Reevaluate after contradictory evidence or ownership changes.                                                                                                                      |
| Automatic post-merge knowledge audit                | `NOT CONFIGURED` | No merge-triggered collector, headless Agent/model path or knowledge-PR workflow is configured in the repository.                                                                                                                                                                                                                                                                       | Capture confirmed knowledge during work; late lessons use a separate human-reviewed change. Optional automation needs an explicit owner/provider/cost decision.                                                                                               |
| Hosted service observability and staging            | `NOT APPLICABLE` | Public delivery is a local Desktop app plus a local CLI/MCP npm package, not an Imprint-operated service.                                                                                                                                                                                                                                                                               | Use local runtime evidence, npm package metadata and GitHub release jobs/assets for applicable diagnosis. Reassess only if an operated service is introduced.                                                                                                 |

## npm distribution and independent release update (2026-09-18)

This update began from `12161ed` on macOS with Node 22.23.2, npm 10.9.8, pnpm 10.7.1 and a browser accepted by
`imprint doctor`. The distribution implementation was delivered in `77f0b77`. The first immutable candidate was
`e060298` / `cli-v0.1.0`; the cancellation cleanup repair and successful release are `d298778` / `cli-v0.1.1`.

- `PASSED`: `pnpm typecheck`; 77 Vitest files / 955 unit tests; scoped ESLint with no errors; scoped Prettier; release
  workflow YAML parsing; Node syntax checks for the changed release/package scripts; and `git diff --check`.
- `PASSED`: `pnpm test:npm-package` built `design-imprint@0.1.0` as a 0.34 MiB packed / 1.54 MiB unpacked / 106-file
  tarball, rejected paths outside
  the allowlist, installed it in an isolated directory, checked `design-imprint`, `imprint` and `imprint-mcp`, and
  completed real CLI plus official-client MCP extraction without retained temporary or default persistent data. The
  installed MCP handshake version matched the installed package manifest.
- `PASSED`: the fresh source build plus all 29 tests in `cli-reliability`, `mcp-stdio` and `cli-mcp-output`, including the
  cancellation/transport cleanup behavior changed for public distribution. `pnpm release:desktop patch --dry-run`
  selected Desktop `0.1.3`; `pnpm release:cli current --dry-run` selected CLI/MCP `0.1.0`. Neither changed repository or
  remote state. Desktop verification passed while the npm manifest remained independently at `0.1.0`.
- `PASSED`: Node 22 plus npm 11 `publish --dry-run` accepted the absolute generated tarball path as
  `design-imprint@0.1.0`. GitHub OIDC and provenance cannot be established by that local dry run.
- `PASSED`: static workflow-contract checks proved that `vX.Y.Z` has only Desktop quality/build/publish jobs, while
  `cli-vX.Y.Z` has only CLI/MCP package/publish jobs, job-scoped OIDC and `--latest=false`. Both workflow YAML files parse.
- `PASSED`: registry-integrity verification accepted the generated tarball's SHA-512 SRI and rejected a deliberate
  mismatch. Stable release baselines ignored temporary prerelease-like tags, and the probe tags were removed afterward.
- `PASSED`: fresh-context, read-only review found no remaining P0-P3 issue after repairs. It covered independent
  baselines, npm SRI retry safety, Windows shell argument boundaries, stable tag filtering, GitHub Release state repair,
  historical case wording and the absence of cross-channel publication.
- `FAILED SAFELY`: GitHub Actions run `35304926045` for `cli-v0.1.0` passed release checks and all 955 unit tests, then
  failed the cancellation/transport cleanup process case on Ubuntu with 28/29 process tests passing. Packaging and
  publication jobs did not run, so no tarball artifact, npm version or CLI/MCP GitHub Release was produced.
- `PASSED`: the repair removes the invocation-owned temporary workspace immediately on cancellation as well as in the
  existing finalizer. The targeted cancellation/transport test passed four consecutive macOS runs, and the complete
  29-test CLI/MCP process set passed locally afterward. Remote confirmation belongs to the next immutable CLI tag.
- `PASSED`: a fresh-context, read-only review of the cancellation repair found no P0-P3 issue. It confirmed the removal
  target is only the invocation's `mkdtemp` directory, cleanup remains idempotent, successful and ordinary failure paths
  retain their finalizer, and no caller output or persistent session directory is in scope.
- `PASSED`: GitHub Actions run [`35306136865`](https://github.com/woai3c/imprint/actions/runs/35306136865) for
  `cli-v0.1.1` passed release checks, all 955 unit tests, all 29 Ubuntu CLI/MCP process tests and the exact installed-package
  smoke path. Its package artifact was 358.4 kB packed / 1.6 MB unpacked with 106 files.
- `PASSED`: the maintainer performed the one-time authenticated bootstrap publication of `design-imprint@0.1.1` from the
  exact workflow tarball. Registry SHA-512 integrity and SHA-1 shasum matched that artifact; its SHA-256 is
  `67ab1b9075305eda70bcf564142052a7936d839a5da5ac9ac81de64cd16521c0`.
- `PASSED`: a fresh public-registry download passed both CLI aliases, `doctor`, real CLI extraction, official-client MCP
  discovery/extraction and temporary/persistent-data cleanup on macOS. Workflow attempt 2 then verified the immutable
  registry SRI and created the non-draft, non-prerelease
  [`cli-v0.1.1` GitHub Release](https://github.com/woai3c/imprint/releases/tag/cli-v0.1.1) with `--latest=false`; Desktop
  `v0.1.2` remained GitHub's latest release.
- `NOT EXECUTED`: full Desktop E2E, Windows installed-package verification, a maintainer-selected MCP host, or a direct
  OIDC publication. The bootstrap version used maintainer web authentication because no package existed yet; Trusted
  Publishing for `cli-release.yml` remains one-time setup before relying on future automated `npm publish` calls.

## Windows source-entrypoint update (2026-09-06)

These scoped observations supplement the capability rows above. Verification candidate: `7333ce6` plus the CLI/MCP direct
output implementation, on Windows x64 (10.0.19045), Node 22.14.0, pnpm 10.7.1, installed Chrome 152.0.7977.76, and the
official MCP SDK client 1.30.0. Verification preceded the authorized local commit; resolve the delivered revision from
the commit containing this update. Human host acceptance remains pending, and no push or release is established here.

| Capability / Windows scope         | Status    | Observed evidence and remaining boundary                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local source checks                | `READY`   | Typecheck, scoped non-mutating ESLint/Prettier, all 955 unit tests, and a fresh CLI/MCP source build passed. This does not establish native Desktop runtime behavior.                                                                                                                                                                                                        |
| CLI and local stdio MCP extraction | `PARTIAL` | Real isolated CLI and official-client tests exercise URL-only Markdown, all ten formats, inline/saved results, parameter errors, overwrite, portable captures, explicit sessions, and MCP cancellation/closure. Existing profile/URL comparison calls also pass. Windows graceful CLI SIGINT and a human MCP host remain unverified; no installable distribution is claimed. |
| Annotated browser evidence         | `PARTIAL` | 38 cases passed; `portfolio-gallery` failed its responsive `reflow`/`mixed` assertion. The same isolated case fails on untouched base `7333ce6`. This is a recorded existing failure, not a passing suite; recheck after analyzer, browser, fixture, or oracle changes.                                                                                                      |

The relevant retained task logs and source-build samples are identified in the implementing conversation. They are local
evidence, not portable repository prerequisites. Full Desktop E2E remains at the existing PR/tag boundary; the maintainer
owns human acceptance and disposition of the reproduced pre-existing browser regression.

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
