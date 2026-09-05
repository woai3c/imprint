# Verification and runtime paths

Run commands at the repository root. [package.json](../../package.json), scripts, and workflow definitions own exact
commands; this guide owns check selection and evidence limits. Use the pinned pnpm and required Node version from that
manifest. An existing installation is sufficient for checks; on a new checkout, `pnpm install --frozen-lockfile` downloads
dependencies and runs allowed native build/prepare hooks. Inspect command definitions before executing unfamiliar paths.

## Local fast verification

| Changed surface                            | Smallest useful check                                                                                                                                                                        | What it establishes / limit                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown or YAML                           | `pnpm exec prettier --check AGENTS.md docs/development/*.md .github/workflows/*.yml README.md README.zh-CN.md`, narrowed to changed files; verify local links and actual command definitions | Formatting and referenced owners; requires semantic review for policy correctness                                                     |
| A specific core behavior                   | `pnpm exec vitest run tests/unit/token-builder.test.ts` is a focused example; select the actual affected tests                                                                               | Declared regression expectations; does not demonstrate arbitrary live-site accuracy                                                   |
| Shared extraction/export or CI test wiring | `pnpm test`                                                                                                                                                                                  | All tests selected by [vitest.config.ts](../../vitest.config.ts); includes cross-module cases but has no separate Integration project |
| TypeScript, IPC or entrypoint contracts    | `pnpm typecheck` and `pnpm exec eslint src/core/analyzer/token-builder.ts` (substitute affected source files)                                                                                | Type and lint rules; neither exercises Electron or a real browser                                                                     |
| CLI/MCP build contract                     | `pnpm build:cli`                                                                                                                                                                             | Compiles shared source entrypoints; its prehook deletes/recreates generated `dist/`                                                   |

The implementing Agent owns local results. Focused checks and the unit suite are the edit-loop default; measure elapsed
time in task evidence instead of promising a machine-independent budget. `pnpm lint` applies fixes and `pnpm format`
rewrites the tree, so use non-mutating scoped checks while unrelated work is present. `pnpm run ci` includes fixing lint
and desktop packaging; it is not a read-only shortcut or identical to the PR gate set. `pnpm ci` is not this script.

## Targeted runtime verification

Runtime tests require the actual candidate's build. An old `dist/`, `.vite/`, or `out/` does not prove the current source.
All commands below are available paths, not claims that they ran for the current task. Use the
[Capability Report](harness-capabilities.md) before relying on an environment.

- **DOM/evidence/export semantics:** run `pnpm test:design-evidence` for the annotated local fixtures when those semantics
  change. To target comparison-site wiring, use
  `pnpm exec vitest run -c vitest.design-evidence.config.ts tests/design-evidence-regression/comparison-site-regression.test.ts`.
  Follow the [suite's oracle and scope rules](../../tests/design-evidence-regression/README.md). Browser captures can take
  minutes; reserve the full annotated suite for relevant semantic changes. Installed Chrome/Edge is required for analysis;
  macOS packaging's headless-shell download does not replace that requirement.
  These suites create isolated directories under the OS temporary directory and retain their captures after closing the
  fixture servers. Record the directories created by the run; clean up only identified task-created artifacts when done.
- **CLI and MCP:** after `pnpm build:cli`, run
  `node --test --test-concurrency=1 tests/e2e/cli-reliability.test.mjs tests/e2e/mcp-stdio.test.mjs` for real process/protocol
  and loopback extraction checks. A cheaper protocol-only check is
  `node --test --test-name-pattern='official MCP client initializes' tests/e2e/mcp-stdio.test.mjs`.
  Inspect stdout/stderr, exit codes, returned schema/tool names, and generated artifact content. Browser-dependent CLI
  cases may skip when no browser is found; a green process exit then does not establish extraction readiness. These are
  source-build entrypoints, not evidence of installed `imprint` / `imprint-mcp` bin distribution.
  Extraction uses [the default data directory](../../src/core/data-dir.ts), the current user's `.imprint`, and writes
  captures under `.imprint/screenshots`. `--no-session` / `useSession: false` disables session reuse, not output writes or
  storage isolation; these tests do not clean those captures. When those writes are unsuitable, use the protocol-only
  check above and report extraction `NOT EXECUTED`, or let the maintainer select a disposable test environment for the
  full extraction check. Identify any artifacts created by the run before cleaning them; never clear the user's
  `.imprint` directory as a test reset.
- **Desktop renderer/IPC/lifecycle:** build with `pnpm build`, build the shared source with `pnpm build:cli`, then prepare
  the native test dependency with `pnpm exec electron-rebuild --force --only better-sqlite3`. Run a relevant file such as
  `node --test --test-concurrency=1 tests/e2e/platform-theme.test.mjs` or `tests/e2e/core-flow.test.mjs`.
  Existing tests launch Electron through Playwright, use loopback fixtures and temporary userData, and close/remove their
  own state. Follow [comparison-site instructions](../../tests/comparison-site/README.md) for human comparison acceptance.
  An interactive `pnpm dev` uses ordinary local app state unless explicitly isolated; prefer the test launch pattern
  (`IMPRINT_E2E=1` plus a new `IMPRINT_E2E_USER_DATA_DIR`) for disposable acceptance data. Reserve port 4173 for the manual
  comparison fixture, stop only the process you started, and keep viewport/theme/locale/settings fixed between captures.
- **Saved analyses/migrations:** use the same Desktop preparation, then
  `node --test --test-concurrency=1 tests/e2e/database-migration.test.mjs`. It creates a synthetic legacy database in a
  temporary directory and checks transformed records and repeat-launch idempotence. It does not exercise downgrades or
  authorize use of a person's existing `copy-design.db`.

Browser and Electron suites are more expensive than unit tests and can contend for displays, native dependencies, ports,
and generated files. One implementing owner controls preparation and execution per worktree; do not build, clean `dist/`,
rebuild native modules, or run Desktop suites concurrently in it. A missing controller, display, browser, or native build
is an explicit missing capability. The maintainer can perform the affected local flow as a human fallback; record that
separately from an unexecuted Agent runtime test. Use approved test accounts only for authentication work that needs them;
the existing loopback authentication fixtures need no production credentials.

Each runtime result records candidate plus dirty state, build/start state, OS/browser/host, fixture or non-secret role,
initial/reset state, exact actions and observable predicates, stdout/stderr or UI/file/database evidence, and exclusions.
Use state-based assertions. Captured screenshots support website evidence and UI verification; they are not Imprint
analysis inputs. Passing an analyzer's internal consistency tests alone cannot establish correct semantic interpretation.

## E2E placement and release

Preserve the existing policy: [PR Check](../../.github/workflows/pr-check.yml) runs full `pnpm test:e2e` for PRs targeting
`main`, including Drafts; [Desktop Release](../../.github/workflows/release.yml) repeats it for the tagged release candidate
before native builds/publishing. Both use Ubuntu with `xvfb-run --auto-servernum`. The suite packages Desktop, runs packaged
smoke checks, rebuilds the CLI and Electron SQLite dependency, then runs all Node E2E files serially. On macOS, `predev`,
`prebuild`, and `premake` can download Playwright's headless shell via [the existing installer](../../scripts/install-headless-browser.mjs).
Packaging/native preparation writes generated output and costs substantially more than unit tests; elapsed time and
runner cost vary. Keep full E2E out of each local edit loop, retaining its existing PR and release boundaries.

The PR author owns per-change failures; the release maintainer owns tag-gate failures. A failure blocks readiness at its
assigned boundary (and the release workflow blocks downstream publication). Repair through the local verification/review
loop, then rerun the relevant gate on the actual candidate. Existing branch enforcement and remote activation are
reported separately in the [Capability Report](harness-capabilities.md). No scheduled E2E or hosted staging environment
is configured. Any new cadence with material cost or risk needs the maintainer's decision.

When E2E is not run locally, report `NOT EXECUTED`, the next PR/tag boundary, and absence of broad runtime evidence. A past
run only covers its own SHA, OS, browser and fixtures. No controlled suite proves accuracy on arbitrary live websites.
Use [comparison policy](../../tests/comparison-benchmark/README.md) only for relevant changes; preserve its frozen
implementation/corpus rules. [Live-corpus runs](../../tests/live-corpus/README.md) contact changing external sites and write
captures; they are explicit evaluation work, not a default harness check.

Release follows [README](../../README.md#release) and [the release script](../../scripts/release.mjs), requiring separate
authority. A release is not verified by a tag alone: inspect quality, native build/smoke, publish outcomes and intended
assets. If an external operation's result is unknown, inspect its state before retrying. There is no demonstrated database
downgrade/automatic rollback path; a release or migration recovery decision belongs to the maintainer. Do not point older
builds at a user's database merely to test recovery.
