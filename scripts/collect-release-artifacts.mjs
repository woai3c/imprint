import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [platform, arch, rawVersion] = process.argv.slice(2)
const version = (rawVersion || '').replace(/^v/, '')
const makeRoot = path.join(repoRoot, 'out', 'make')
const releaseRoot = path.join(repoRoot, 'release-assets')

if (!['windows', 'macos'].includes(platform) || !['x64', 'arm64'].includes(arch) || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/collect-release-artifacts.mjs windows|macos x64|arm64 vX.Y.Z')
  process.exit(1)
}

function walk(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(entryPath) : [entryPath]
  })
}

fs.rmSync(releaseRoot, { recursive: true, force: true })
fs.mkdirSync(releaseRoot, { recursive: true })

const files = walk(makeRoot)
const copied = []

function copy(source, targetName) {
  fs.copyFileSync(source, path.join(releaseRoot, targetName))
  copied.push(targetName)
}

if (platform === 'macos') {
  const dmgFiles = files.filter((file) => path.extname(file).toLowerCase() === '.dmg')
  if (dmgFiles.length !== 1) throw new Error(`Expected one DMG artifact, found ${dmgFiles.length}.`)
  copy(dmgFiles[0], `Imprint-v${version}-macos-${arch}.dmg`)
} else {
  const zipFiles = files.filter((file) => path.extname(file).toLowerCase() === '.zip')
  if (zipFiles.length !== 1) throw new Error(`Expected one Windows zip artifact, found ${zipFiles.length}.`)
  copy(zipFiles[0], `Imprint-v${version}-windows-${arch}.zip`)
}

console.log(`Collected ${copied.length} artifact(s):`)
copied.forEach((file) => console.log(`- ${file}`))
