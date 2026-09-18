import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = path.join(repoRoot, 'packages', 'design-imprint')
const outputDirectory = path.join(packageRoot, 'dist')
const npmPackage = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))

fs.rmSync(outputDirectory, { recursive: true, force: true })
fs.mkdirSync(outputDirectory, { recursive: true })

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const build = spawnSync(
  pnpmCommand,
  ['exec', 'tsc', '-p', 'tsconfig.cli.json', '--outDir', path.relative(repoRoot, outputDirectory)],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
    windowsHide: true,
  },
)

if (build.error) throw build.error
if (build.status !== 0) process.exit(build.status ?? 1)

for (const filename of ['LICENSE', 'README.md', 'README.zh-CN.md']) {
  fs.copyFileSync(path.join(repoRoot, filename), path.join(packageRoot, filename))
}

console.log(`Built npm package ${npmPackage.name}@${npmPackage.version}.`)
