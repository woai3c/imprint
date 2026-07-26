import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tag = process.argv[2] || process.env.GITHUB_REF_NAME || ''
const match = tag.match(/^v(\d+\.\d+\.\d+)$/)

if (!match) {
  console.error(`Invalid release tag "${tag}". Expected vX.Y.Z.`)
  process.exit(1)
}

const version = match[1]
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8')

if (packageJson.version !== version) {
  console.error(`Tag ${tag} does not match package.json version ${packageJson.version}.`)
  process.exit(1)
}

if (!changelog.includes(`## [${version}] - `)) {
  console.error(`CHANGELOG.md does not contain a ${version} release section.`)
  process.exit(1)
}

console.log(`Verified Imprint ${tag}.`)
