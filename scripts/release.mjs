import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = path.join(repoRoot, 'package.json')
const changelogPath = path.join(repoRoot, 'CHANGELOG.md')
const semverPattern = /^v?(\d+)\.(\d+)\.(\d+)$/
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    stdio: options.inherit ? 'inherit' : 'pipe',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${command} ${args.join(' ')} failed${details ? `:\n${details}` : ''}`)
  }

  return (result.stdout || '').trim()
}

function git(...args) {
  return run('git', args)
}

function parseVersion(value) {
  const match = value.match(semverPattern)
  if (!match) throw new Error(`Invalid version "${value}". Expected a stable semantic version such as 1.2.3.`)
  return match.slice(1).map(Number)
}

function normalizeVersion(value) {
  const [major, minor, patch] = parseVersion(value)
  return `${major}.${minor}.${patch}`
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index]
  }
  return 0
}

function incrementVersion(version, type) {
  let [major, minor, patch] = parseVersion(version)
  if (type === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (type === 'minor') {
    minor += 1
    patch = 0
  } else if (type === 'patch') {
    patch += 1
  } else {
    throw new Error(`Unknown release type "${type}".`)
  }
  return `${major}.${minor}.${patch}`
}

function assertCleanWorktree() {
  const status = git('status', '--porcelain')
  if (status) {
    throw new Error(
      `The worktree is not clean. Commit or stash these changes before releasing:\n${status
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')}`,
    )
  }
}

function getLatestTag() {
  return git('tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-version:refname').split('\n').find(Boolean) || ''
}

function readCommits(previousTag) {
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD'
  const output = git('log', '--no-merges', '--pretty=format:%h%x1f%s', range)
  if (!output) return []

  return output.split('\n').map((line) => {
    const [hash, subject] = line.split('\x1f')
    return { hash, subject }
  })
}

function readContributors(previousTag) {
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD'
  const output = git('log', '--no-merges', '--pretty=format:%aN%x1f%aE', range)
  if (!output) return []

  const byEmail = new Map()
  for (const line of output.split('\n')) {
    const [name, email] = line.split('\x1f')
    if (!name || !email) continue
    const key = email.trim().toLowerCase()
    if (!byEmail.has(key)) byEmail.set(key, name.trim())
  }

  return [...byEmail.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function formatCommitSubject(subject) {
  const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i)
  if (!match) return { type: 'other', breaking: false, text: subject }

  const [, type, scope, breaking, text] = match
  return {
    type: type.toLowerCase(),
    breaking: Boolean(breaking),
    text: scope ? `${text} (${scope})` : text,
  }
}

function buildChangelogSection(version, commits, contributors = []) {
  const categoryByType = {
    feat: 'Added',
    fix: 'Fixed',
    perf: 'Performance',
    refactor: 'Changed',
    docs: 'Documentation',
    build: 'Maintenance',
    chore: 'Maintenance',
    ci: 'Maintenance',
    style: 'Maintenance',
    test: 'Maintenance',
  }
  const categoryOrder = [
    'Breaking Changes',
    'Added',
    'Fixed',
    'Performance',
    'Changed',
    'Documentation',
    'Maintenance',
    'Other',
  ]
  const categories = new Map(categoryOrder.map((category) => [category, []]))

  for (const commit of commits) {
    const parsed = formatCommitSubject(commit.subject)
    const category = parsed.breaking ? 'Breaking Changes' : categoryByType[parsed.type] || 'Other'
    categories.get(category).push(`- ${parsed.text} (${commit.hash})`)
  }

  if (commits.length === 0) {
    categories.get('Maintenance').push('- No user-facing changes were recorded.')
  }

  const date = new Date().toISOString().slice(0, 10)
  const lines = [`## [${version}] - ${date}`]
  for (const category of categoryOrder) {
    const entries = categories.get(category)
    if (entries.length === 0) continue
    lines.push('', `### ${category}`, '', ...entries)
  }

  if (contributors.length > 0) {
    lines.push('', '### Contributors', '', ...contributors.map((name) => `- ${name}`))
  }

  return `${lines.join('\n')}\n`
}

function insertChangelogSection(section) {
  const fallback =
    '# Changelog\n\nRelease notes are generated from Conventional Commits by `pnpm release` before each release tag is created.\n'
  const current = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8').trimEnd() : fallback.trimEnd()
  const nextReleaseIndex = current.search(/^## \[/m)

  if (nextReleaseIndex === -1) return `${current}\n\n${section}`

  return `${current.slice(0, nextReleaseIndex).trimEnd()}\n\n${section}\n${current.slice(nextReleaseIndex).trimStart()}`
}

async function selectVersion(currentVersion, latestTag) {
  const canReleaseCurrent = !git('tag', '--list', `v${currentVersion}`)
  const choices = []
  if (canReleaseCurrent) choices.push({ label: `current  v${currentVersion}`, value: currentVersion })
  choices.push(
    {
      label: `patch    v${incrementVersion(currentVersion, 'patch')}`,
      value: incrementVersion(currentVersion, 'patch'),
    },
    {
      label: `minor    v${incrementVersion(currentVersion, 'minor')}`,
      value: incrementVersion(currentVersion, 'minor'),
    },
    {
      label: `major    v${incrementVersion(currentVersion, 'major')}`,
      value: incrementVersion(currentVersion, 'major'),
    },
  )

  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log(`Current package version: v${currentVersion}`)
    console.log(`Latest release tag: ${latestTag || 'none'}`)
    console.log('')
    choices.forEach((choice, index) => console.log(`  ${index + 1}) ${choice.label}`))
    console.log(`  ${choices.length + 1}) custom`)
    console.log('')

    const answer = (await terminal.question(`Select release [1-${choices.length + 1}]: `)).trim()
    const selected = Number(answer)
    if (Number.isInteger(selected) && selected >= 1 && selected <= choices.length) {
      return choices[selected - 1].value
    }
    if (selected === choices.length + 1) {
      const custom = await terminal.question('Version (for example 0.2.0): ')
      return normalizeVersion(custom.trim())
    }
    throw new Error('Release cancelled because the selection was invalid.')
  } finally {
    terminal.close()
  }
}

async function confirmRelease(details, assumeYes) {
  if (assumeYes) return true

  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log('')
    console.log(`Version: v${details.currentVersion} -> v${details.targetVersion}`)
    console.log(`Changelog range: ${details.previousTag ? `${details.previousTag}..HEAD` : 'all commits'}`)
    console.log(`Git action: create chore(release) commit and annotated tag ${details.tag}`)
    console.log(`Publish: ${details.push ? `push the commit and ${details.tag} atomically to origin` : 'local only'}`)
    console.log('')
    const answer = (await terminal.question('Continue? [y/N]: ')).trim()
    return /^y(es)?$/i.test(answer)
  } finally {
    terminal.close()
  }
}

function printHelp() {
  console.log(`Imprint release

Usage:
  pnpm release
  pnpm release patch|minor|major
  pnpm release 0.2.0
  pnpm release current --no-push
  pnpm release current --dry-run

Options:
  --no-push  Create the release commit and tag locally without pushing.
  --dry-run  Preview the generated changelog without checks or repository changes.
  --yes      Skip the final confirmation (requires an explicit version argument).
  --help     Show this help.

The command requires a clean main branch, runs release checks, updates package.json
and CHANGELOG.md, creates an annotated vX.Y.Z tag, and pushes the commit and tag.
The tag triggers native Windows and macOS packaging in GitHub Actions.`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  const noPush = args.includes('--no-push')
  const dryRun = args.includes('--dry-run')
  const assumeYes = args.includes('--yes')
  const versionArgument = args.find((arg) => !arg.startsWith('--'))
  if (assumeYes && !versionArgument) throw new Error('--yes requires an explicit version or bump type.')

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  const currentVersion = normalizeVersion(packageJson.version)
  const branch = git('branch', '--show-current')
  if (branch !== 'main')
    throw new Error(`Releases must be created from main; the current branch is "${branch || 'detached'}".`)
  if (!dryRun) assertCleanWorktree()

  const latestTag = getLatestTag()
  let targetVersion
  if (!versionArgument) {
    targetVersion = await selectVersion(currentVersion, latestTag)
  } else if (versionArgument === 'current') {
    targetVersion = currentVersion
  } else if (['patch', 'minor', 'major'].includes(versionArgument)) {
    targetVersion = incrementVersion(currentVersion, versionArgument)
  } else {
    targetVersion = normalizeVersion(versionArgument)
  }

  const tag = `v${targetVersion}`
  if (git('tag', '--list', tag)) throw new Error(`Tag ${tag} already exists.`)
  if (compareVersions(targetVersion, currentVersion) < 0) {
    throw new Error(`Target version v${targetVersion} is older than package version v${currentVersion}.`)
  }
  if (targetVersion === currentVersion && latestTag === tag) {
    throw new Error(`${tag} is already the latest release.`)
  }

  if (dryRun) {
    const commits = readCommits(latestTag)
    const contributors = readContributors(latestTag)
    console.log(buildChangelogSection(targetVersion, commits, contributors))
    console.log('Dry run only: no files, commits, tags, or remotes were changed.')
    return
  }

  const confirmed = await confirmRelease(
    { currentVersion, targetVersion, previousTag: latestTag, tag, push: !noPush },
    assumeYes,
  )
  if (!confirmed) {
    console.log('Release cancelled.')
    return
  }

  console.log('\nRunning release checks...')
  run(pnpmCommand, ['run', 'release:check'], { inherit: true })
  assertCleanWorktree()

  const commits = readCommits(latestTag)
  const contributors = readContributors(latestTag)
  const section = buildChangelogSection(targetVersion, commits, contributors)
  packageJson.version = targetVersion
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  fs.writeFileSync(changelogPath, `${insertChangelogSection(section).trimEnd()}\n`)

  git('add', 'package.json', 'CHANGELOG.md')
  git('commit', '-m', `release: ${tag}`)
  git('tag', '-a', tag, '-m', `Imprint ${tag}`)

  if (!noPush) {
    git('remote', 'get-url', 'origin')
    console.log(`Pushing main and ${tag} to origin...`)
    run('git', ['push', '--atomic', 'origin', `HEAD:${branch}`, `refs/tags/${tag}`], { inherit: true })
  }

  console.log('')
  console.log(`Release ${tag} prepared successfully.`)
  console.log(
    noPush
      ? `Push it with: git push --atomic origin HEAD:${branch} refs/tags/${tag}`
      : 'GitHub Actions is now building the Windows and macOS release artifacts.',
  )
}

main().catch((error) => {
  console.error(`\nRelease failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
