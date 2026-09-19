import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const MIB = 1024 * 1024
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = path.join(repoRoot, 'packages', 'design-imprint')
const npmPackage = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const repositoryMediaBase = 'https://raw.githubusercontent.com/woai3c/imprint/main/docs/media'
const result = spawnSync(npmCommand, ['pack', '.', '--dry-run', '--ignore-scripts', '--json'], {
  cwd: packageRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

if (result.error) throw result.error
if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

let pack
try {
  const parsed = JSON.parse(result.stdout)
  pack = Array.isArray(parsed) ? parsed[0] : parsed
} catch {
  process.stderr.write(result.stderr)
  throw new Error('npm pack did not return valid JSON.')
}

const files = Array.isArray(pack?.files) ? pack.files : []
const filePaths = new Set(files.map((file) => file.path))
const violations = []
const expectedBins = {
  'design-imprint': 'dist/cli/index.js',
  imprint: 'dist/cli/index.js',
  'imprint-mcp': 'dist/mcp/server.js',
}
const expectedDependencies = ['i18next', 'playwright-core', 'yaml']
const requiredFiles = [
  'LICENSE',
  'CHANGELOG.md',
  'README.md',
  'README.zh-CN.md',
  'dist/cli/index.js',
  'dist/mcp/server.js',
  'dist/core/i18n/locales/en.json',
  'dist/core/i18n/locales/zh-CN.json',
  'package.json',
]

if (npmPackage.name !== 'design-imprint') violations.push(`unexpected package name: ${npmPackage.name}`)
if (JSON.stringify(npmPackage.bin) !== JSON.stringify(expectedBins)) {
  violations.push('package bin mapping does not match the supported CLI/MCP commands')
}

const dependencies = Object.keys(npmPackage.dependencies || {}).sort()
if (JSON.stringify(dependencies) !== JSON.stringify(expectedDependencies)) {
  violations.push(`runtime dependencies must be exactly: ${expectedDependencies.join(', ')}`)
}

for (const file of requiredFiles) {
  if (!filePaths.has(file)) violations.push(`required package file is missing: ${file}`)
}

for (const file of files) {
  const filePath = String(file.path || '')
  if (!/^(?:dist\/|CHANGELOG\.md$|LICENSE$|README(?:\.zh-CN)?\.md$|package\.json$)/.test(filePath)) {
    violations.push(`unexpected published path: ${filePath}`)
  }
  if (/\.(?:ts|tsx|map)$/.test(filePath) || /(?:^|\/)(?:src|tests?|node_modules)(?:\/|$)/.test(filePath)) {
    violations.push(`source, test, dependency, or source-map file would be published: ${filePath}`)
  }
}

const packedSize = Number(pack?.size)
const unpackedSize = Number(pack?.unpackedSize)
if (!Number.isFinite(packedSize) || packedSize > 2 * MIB) {
  violations.push(`packed size ${formatBytes(packedSize)} exceeds 2.00 MiB`)
}
if (!Number.isFinite(unpackedSize) || unpackedSize > 4 * MIB) {
  violations.push(`unpacked size ${formatBytes(unpackedSize)} exceeds 4.00 MiB`)
}
if (files.length > 140) violations.push(`file count ${files.length} exceeds 140`)

for (const entrypoint of Object.values(expectedBins)) {
  const content = fs.readFileSync(path.join(packageRoot, entrypoint), 'utf8')
  if (!content.startsWith('#!/usr/bin/env node\n')) {
    violations.push(`bin entrypoint is missing its Node.js shebang: ${entrypoint}`)
  }
}

for (const filename of ['README.md', 'README.zh-CN.md']) {
  const content = fs.readFileSync(path.join(packageRoot, filename), 'utf8')
  if (/<img\b[^>]*\bsrc=["']\.\//.test(content)) {
    violations.push(`${filename} contains a relative image URL that will not render on npm`)
  }
  for (const demo of ['imprint-cli-demo', 'imprint-mcp-demo']) {
    if (!content.includes(`${repositoryMediaBase}/${demo}-`)) {
      violations.push(`${filename} does not link the published ${demo} media from the repository`)
    }
  }
}

console.log(
  `npm package: ${formatBytes(packedSize)} packed, ${formatBytes(unpackedSize)} unpacked, ${files.length} files`,
)

if (violations.length > 0) {
  console.error('\nPackage gate failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('npm package gate passed.')

function formatBytes(bytes) {
  return Number.isFinite(bytes) ? `${(bytes / MIB).toFixed(2)} MiB` : 'unknown'
}
