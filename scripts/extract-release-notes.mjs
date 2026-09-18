import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rawTag = process.argv[2] || ''
const version = rawTag.match(/^(?:cli-)?v(\d+\.\d+\.\d+)$/)?.[1] || ''
const outputPath = process.argv[3]
const changelogRelativePath = process.argv[4] || 'CHANGELOG.md'

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/extract-release-notes.mjs vX.Y.Z|cli-vX.Y.Z [output-file] [changelog-file]')
  process.exit(1)
}

const changelogPath = path.resolve(repoRoot, changelogRelativePath)
const changelog = fs.readFileSync(changelogPath, 'utf8')
const heading = `## [${version}] - `
const start = changelog.indexOf(heading)
if (start === -1) {
  console.error(`${changelogRelativePath} does not contain release ${version}.`)
  process.exit(1)
}

const contentStart = changelog.indexOf('\n', start)
const nextHeading = changelog.indexOf('\n## [', contentStart)
const notes = changelog.slice(contentStart + 1, nextHeading === -1 ? undefined : nextHeading).trim()

if (!notes) {
  console.error(`Release ${version} has no changelog content.`)
  process.exit(1)
}

if (outputPath) {
  fs.writeFileSync(path.resolve(repoRoot, outputPath), `${notes}\n`)
} else {
  process.stdout.write(`${notes}\n`)
}
