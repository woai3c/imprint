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
| Installable CLI/MCP package                | `pnpm test:npm-package`                                                                                                                                                                      | Builds, allowlist-checks, packs, installs, and exercises the actual tarball against a loopback site; does not publish to npm          |

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
  `node --test --test-concurrency=1 tests/e2e/cli-reliability.test.mjs tests/e2e/mcp-stdio.test.mjs tests/e2e/cli-mcp-output.test.mjs` for real process/protocol
  and loopback extraction checks. A cheaper protocol-only check is
  `node --test --test-name-pattern='official MCP client initializes' tests/e2e/mcp-stdio.test.mjs`.
  Inspect stdout/stderr, exit codes, returned schema/tool names, and generated artifact content. Browser-dependent CLI
  cases may skip when no browser is found; a green process exit then does not establish extraction readiness. Run
  `pnpm test:npm-package` to additionally prove the packed `design-imprint` tarball, installed `design-imprint` / `imprint`
  aliases, installed `imprint-mcp` server, package allowlist, and a real installed CLI/MCP extraction on the current host.
  CLI/MCP extraction now returns selected content by default and uses a request-owned temporary workspace; completed,
  failed, and gracefully cancelled calls must remove it before successful delivery. Explicit `--output` / `outputDir`
  saves artifacts; explicit session reuse can still read/update [persistent session data](../../src/core/data-dir.ts).
  MCP URL comparison retains its existing persistent storage behavior. Desktop storage is unchanged.
  The extraction process tests use [isolated homes, working directories and temp roots](../../tests/e2e/helpers/extraction-harness.mjs).
  They verify filesystem inventories before teardown, including an absent or sentinel-seeded `.imprint`; teardown alone
  is not evidence of product cleanup. The output suite checks every format, inline/saved combinations, aliases, invalid
  parameters, overwrite, portable captures, and cancellation using neutral loopback pages and the official MCP client.
  Windows `child.kill('SIGINT')` force termination is not evidence of handled cancellation: that legacy process case is
  explicitly skipped on Windows, while shared cancellation and real MCP cancellation/closure are checked separately.
  Report missing OS-signal coverage. Tests intentionally save selected artifacts in owned temporary directories, then
  remove those test directories. Never clear the real user's `.imprint` as a test reset.
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

## CLI/MCP output contract checks

Start with the shared request/delivery checks before building and running the process suite above:

```sh
pnpm exec vitest run tests/unit/cli-command.test.ts tests/unit/analysis-artifacts.test.ts tests/unit/extraction-delivery.test.ts
```

The unit tests cover matching defaults, aliases, legacy payloads, selected artifacts, managed-session opt-in, ownership
and cleanup, and injected partial-write/copy failures. Windows uses dangling junctions for the link regression; POSIX
uses file symlinks. The process suite checks the ten formats through both entrypoints using neutral local pages. It
parses DESIGN.md front matter and runs the existing Markdown linter, parses CSS/Tailwind and JSON, and checks SCSS/HTML
structure and independently specified fixture properties. This validates the existing exports, not a new formal DTCG
certification or PDF renderer. The `all` envelope and saved manifests are checked separately from artifact contents.

For source-level human acceptance, build the CLI/MCP entrypoints, then start the existing local fixture in a separate
terminal:

```sh
pnpm run test:comparison-site -- --variant reference
```

From the repository root, directly consume Markdown and CSS, inspect the JSON collection, and explicitly save to a new
task-owned directory:

```sh
node dist/cli/index.js http://127.0.0.1:4173/
node dist/cli/index.js http://127.0.0.1:4173/ --format css
node dist/cli/index.js http://127.0.0.1:4173/ --format all
node dist/cli/index.js http://127.0.0.1:4173/ --output ./tmp/cli-mcp-acceptance
```

For installed-package acceptance, first run `pnpm test:npm-package`; after registry publication, configure a real MCP host
using the [README npm settings](../../README.md#cli-and-mcp). Call `imprint_extract`
with only `{"url":"http://127.0.0.1:4173/"}`, then with `"format":"css"`, and then with a new absolute `outputDir`.
Verify the first text block, manifest paths, existing-file errors and explicit overwrite. Record host/version, returned
results and the maintainer's acceptance decision. Terminal display alone does not establish absence of writes; use the
isolated filesystem assertions above. Shell redirection and explicit save examples intentionally create files.
No local plan document is required to run these checks.

## E2E placement and release

Preserve the existing policy: [PR Check](../../.github/workflows/pr-check.yml) runs full `pnpm test:e2e` for PRs targeting
`main`, including Drafts. [Desktop Release](../../.github/workflows/release.yml) repeats the full suite under
`xvfb-run --auto-servernum` for each `vX.Y.Z` candidate before native builds. The suite packages Desktop, runs packaged
smoke checks, rebuilds the CLI and Electron SQLite dependency, then runs all Node E2E files serially.

[CLI and MCP Release](../../.github/workflows/cli-release.yml) is independent. For each `cli-vX.Y.Z` candidate it runs
release checks, unit tests, the complete CLI/MCP process suite, and the installed-tarball smoke test before npm publication;
it does not build or publish Desktop. On macOS, `predev`, `prebuild`, and `premake` can download Playwright's headless shell
via [the existing installer](../../scripts/install-headless-browser.mjs). Packaging/native preparation writes generated
output and costs substantially more than unit tests; elapsed time and runner cost vary. Keep full E2E out of each local
edit loop, retaining its existing PR and channel-specific release boundaries.

The PR author owns per-change failures; the release maintainer owns tag-gate failures. A failure blocks readiness at its
assigned boundary, and each release workflow blocks only its own downstream publication. Repair through the local
verification/review loop, then rerun the relevant gate on the actual candidate. Existing branch enforcement and remote
activation are reported separately in the [Capability Report](harness-capabilities.md). No scheduled E2E or hosted staging
environment is configured. Any new cadence with material cost or risk needs the maintainer's decision.

When E2E is not run locally, report `NOT EXECUTED`, the next PR or applicable channel tag boundary, and absence of broad
runtime evidence. A past run only covers its own SHA, OS, browser and fixtures. No controlled suite proves accuracy on
arbitrary live websites.
Use [comparison policy](../../tests/comparison-benchmark/README.md) only for relevant changes; preserve its frozen
implementation/corpus rules. [Live-corpus runs](../../tests/live-corpus/README.md) contact changing external sites and write
captures; they are explicit evaluation work, not a default harness check.

Release follows [README](../../README.md#release) and [the release script](../../scripts/release.mjs), requiring separate
authority. Desktop uses `pnpm release:desktop` with `vX.Y.Z`; CLI/MCP uses `pnpm release:cli` with `cli-vX.Y.Z`. Their
versions, changelogs, workflows and GitHub Release entries are independent. A release is not verified by a tag alone:
inspect the applicable workflow, publish outcome and intended assets. If an external operation's result is unknown,
inspect its state before retrying. There is no demonstrated database downgrade/automatic rollback path; a release or
migration recovery decision belongs to the maintainer. Do not point older builds at a user's database merely to test
recovery.

### First npm publication only

npm requires a package to exist before its [Trusted Publisher](https://docs.npmjs.com/trusted-publishers/) can be bound.
The first tag must still pass its normal gates before an authorized npm owner makes the immutable bootstrap publication:

1. From a clean, up-to-date `main`, run the intended `pnpm release:cli` command and authorize its normal atomic commit and
   `cli-vX.Y.Z` tag push. This changes neither the Desktop version nor its changelog.
2. Let the CLI/MCP tag workflow complete its `package` job. With no existing package or Trusted Publisher, the final
   publish job is expected to fail at npm publication before it creates the CLI/MCP GitHub Release. Any earlier failure
   blocks the bootstrap publication.
3. Download the `design-imprint-cli-v<version>` artifact from that exact workflow run. Record its SHA-256, install-test it
   if the environment changed, and publish that workflow-produced `design-imprint-<version>.tgz` through an authenticated
   npm owner session with `npm publish /absolute/path/to/<tarball> --access public`. The first publication has no GitHub
   provenance.
4. In npm package settings, add the GitHub Actions Trusted Publisher for organization/user `woai3c`, repository `imprint`,
   workflow `cli-release.yml`, with no environment unless the workflow is changed to use one. Under Allowed actions,
   explicitly enable `npm publish`; new connections otherwise allow `npm stage publish` by default, while this workflow
   intentionally performs a direct `npm publish`.
5. Verify `npm view design-imprint@<version> version` and confirm its `dist.integrity` matches that exact workflow
   tarball, then rerun the failed publish job from the same workflow run. The job independently compares those SHA-512
   integrity values before it skips the immutable version and creates the separate CLI/MCP GitHub Release without
   changing GitHub's Desktop-oriented latest release. Later CLI/MCP versions publish through OIDC with provenance.

Do not bootstrap from a local rebuild, a different workflow run, or a candidate whose gates did not pass. npm versions
are immutable. Record the artifact digest, npm version URL, workflow run and CLI/MCP GitHub Release as separate evidence.
The first CLI changelog and contributor range use the fixed package-introduction baseline `v0.1.2`; later CLI releases
use their preceding `cli-vX.Y.Z` tag and never derive this range from a newer Desktop tag.
