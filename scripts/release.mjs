import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const semverPattern = /^v?(\d+)\.(\d+)\.(\d+)$/
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const releaseChannel = process.argv[2]

const releaseConfigs = {
  desktop: {
    displayName: 'Imprint Desktop',
    packagePath: path.join(repoRoot, 'package.json'),
    changelogPath: path.join(repoRoot, 'CHANGELOG.md'),
    changelogFallback:
      '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\nRelease notes are generated from Conventional Commits by `pnpm release:desktop`.\n',
    tagPrefix: 'v',
    tagPattern: 'v[0-9]*.[0-9]*.[0-9]*',
    initialBaselineTag: '',
    commitMessage: (tag) => `release: ${tag}`,
    tagMessage: (tag) => `Imprint ${tag}`,
    completionMessage: 'GitHub Actions is now building the Desktop release artifacts.',
  },
  cli: {
    displayName: 'design-imprint CLI/MCP',
    packagePath: path.join(repoRoot, 'packages', 'design-imprint', 'package.json'),
    changelogPath: path.join(repoRoot, 'packages', 'design-imprint', 'CHANGELOG.md'),
    changelogFallback:
      '# design-imprint Changelog\n\nAll notable changes to the standalone CLI and MCP package are documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package follows\n[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Release notes are generated from Conventional Commits by\n`pnpm release:cli`.\n',
    tagPrefix: 'cli-v',
    tagPattern: 'cli-v[0-9]*.[0-9]*.[0-9]*',
    initialBaselineTag: 'v0.1.2',
    commitMessage: (tag) => `release(cli): ${tag}`,
    tagMessage: (_tag, version) => `design-imprint v${version}`,
    completionMessage: 'GitHub Actions is now verifying and publishing the CLI/MCP release.',
  },
}

const config = releaseConfigs[releaseChannel]
if (!config) {
  console.error('Usage: node scripts/release.mjs desktop|cli [version|patch|minor|major] [options]')
  process.exit(1)
}

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

function getLatestTag(pattern) {
  if (!pattern) return ''
  const escapedPrefix = config.tagPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stableTagPattern = new RegExp(`^${escapedPrefix}\\d+\\.\\d+\\.\\d+$`)
  return (
    git('tag', '--list', pattern, '--sort=-version:refname')
      .split('\n')
      .find((tag) => stableTagPattern.test(tag)) || ''
  )
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

function buildChangelogSection(version, commits) {
  const categoryByType = {
    feat: 'Added',
    fix: 'Fixed',
    perf: 'Changed',
    refactor: 'Changed',
  }
  const categoryOrder = ['Breaking Changes', 'Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']
  const categories = new Map(categoryOrder.map((category) => [category, []]))

  for (const commit of commits) {
    const parsed = formatCommitSubject(commit.subject)
    if (parsed.breaking) {
      categories.get('Breaking Changes').push(`- ${parsed.text} (${commit.hash})`)
    } else if (categoryByType[parsed.type]) {
      categories.get(categoryByType[parsed.type]).push(`- ${parsed.text} (${commit.hash})`)
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  const lines = [`## [${version}] - ${date}`]
  for (const category of categoryOrder) {
    const entries = categories.get(category)
    if (entries.length === 0) continue
    lines.push('', `### ${category}`, '', ...entries)
  }

  return `${lines.join('\n')}\n`
}

function insertChangelogSection(section) {
  const current = fs.existsSync(config.changelogPath)
    ? fs.readFileSync(config.changelogPath, 'utf8').trimEnd()
    : config.changelogFallback.trimEnd()
  const nextReleaseIndex = current.search(/^## \[/m)

  if (nextReleaseIndex === -1) return `${current}\n\n${section}`

  return `${current.slice(0, nextReleaseIndex).trimEnd()}\n\n${section}\n${current.slice(nextReleaseIndex).trimStart()}`
}

async function selectVersion(currentVersion, latestTag) {
  const currentTag = `${config.tagPrefix}${currentVersion}`
  const canReleaseCurrent = !git('tag', '--list', currentTag)
  const choices = []
  if (canReleaseCurrent) choices.push({ label: `current  ${currentTag}`, value: currentVersion })
  for (const type of ['patch', 'minor', 'major']) {
    const version = incrementVersion(currentVersion, type)
    choices.push({ label: `${type.padEnd(8)}${config.tagPrefix}${version}`, value: version })
  }

  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log(`${config.displayName} version: ${config.tagPrefix}${currentVersion}`)
    console.log(`Latest ${releaseChannel} release tag: ${latestTag || 'none'}`)
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
    console.log(`Channel: ${config.displayName}`)
    console.log(`Version: ${config.tagPrefix}${details.currentVersion} -> ${config.tagPrefix}${details.targetVersion}`)
    console.log(`Changelog range: ${details.previousTag ? `${details.previousTag}..HEAD` : 'all commits'}`)
    console.log(`Git action: create release commit and annotated tag ${details.tag}`)
    console.log(`Publish: ${details.push ? `push the commit and ${details.tag} atomically to origin` : 'local only'}`)
    console.log('')
    const answer = (await terminal.question('Continue? [y/N]: ')).trim()
    return /^y(es)?$/i.test(answer)
  } finally {
    terminal.close()
  }
}

function printHelp() {
  const command = releaseChannel === 'desktop' ? 'release:desktop' : 'release:cli'
  console.log(`${config.displayName} release

Usage:
  pnpm ${command}
  pnpm ${command} patch|minor|major
  pnpm ${command} 0.2.0
  pnpm ${command} current --no-push
  pnpm ${command} current --dry-run

Options:
  --no-push  Create the release commit and tag locally without pushing.
  --dry-run  Preview the generated changelog without checks or repository changes.
  --yes      Skip the final confirmation (requires an explicit version argument).
  --help     Show this help.

The command requires a clean main branch, updates only the ${releaseChannel} version and changelog,
creates an annotated ${config.tagPrefix}X.Y.Z tag, and optionally pushes the commit and tag.`)
}

async function main() {
  const args = process.argv.slice(3)
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  const noPush = args.includes('--no-push')
  const dryRun = args.includes('--dry-run')
  const assumeYes = args.includes('--yes')
  const versionArgument = args.find((arg) => !arg.startsWith('--'))
  if (assumeYes && !versionArgument) throw new Error('--yes requires an explicit version or bump type.')

  const packageJson = JSON.parse(fs.readFileSync(config.packagePath, 'utf8'))
  const currentVersion = normalizeVersion(packageJson.version)
  const branch = git('branch', '--show-current')
  if (branch !== 'main') {
    throw new Error(`Releases must be created from main; the current branch is "${branch || 'detached'}".`)
  }
  if (!dryRun) assertCleanWorktree()

  const latestTag = getLatestTag(config.tagPattern)
  const previousTag = latestTag || config.initialBaselineTag
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

  const tag = `${config.tagPrefix}${targetVersion}`
  if (git('tag', '--list', tag)) throw new Error(`Tag ${tag} already exists.`)
  if (compareVersions(targetVersion, currentVersion) < 0) {
    throw new Error(`Target version ${tag} is older than ${config.displayName} ${config.tagPrefix}${currentVersion}.`)
  }
  if (targetVersion === currentVersion && latestTag === tag) {
    throw new Error(`${tag} is already the latest ${releaseChannel} release.`)
  }

  if (dryRun) {
    const commits = readCommits(previousTag)
    console.log(buildChangelogSection(targetVersion, commits))
    console.log('Dry run only: no files, commits, tags, or remotes were changed.')
    return
  }

  const confirmed = await confirmRelease({ currentVersion, targetVersion, previousTag, tag, push: !noPush }, assumeYes)
  if (!confirmed) {
    console.log('Release cancelled.')
    return
  }

  console.log('\nRunning release checks...')
  run(pnpmCommand, ['run', 'release:check'], { inherit: true })
  assertCleanWorktree()

  const commits = readCommits(previousTag)
  const section = buildChangelogSection(targetVersion, commits)
  packageJson.version = targetVersion
  fs.writeFileSync(config.packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  fs.writeFileSync(config.changelogPath, `${insertChangelogSection(section).trimEnd()}\n`)

  const stagedPaths = [path.relative(repoRoot, config.packagePath), path.relative(repoRoot, config.changelogPath)]
  git('add', ...stagedPaths)
  git('commit', '-m', config.commitMessage(tag))
  git('tag', '-a', tag, '-m', config.tagMessage(tag, targetVersion))

  if (!noPush) {
    git('remote', 'get-url', 'origin')
    console.log(`Pushing main and ${tag} to origin...`)
    run('git', ['push', '--atomic', 'origin', `HEAD:${branch}`, `refs/tags/${tag}`], { inherit: true })
  }

  console.log('')
  console.log(`Release ${tag} prepared successfully.`)
  console.log(
    noPush ? `Push it with: git push --atomic origin HEAD:${branch} refs/tags/${tag}` : config.completionMessage,
  )
}

main().catch((error) => {
  console.error(`\nRelease failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
