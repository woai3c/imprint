import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.resolve(repoRoot, process.argv[2] || 'release-packages')
const packageRoot = path.join(repoRoot, 'packages', 'design-imprint')
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
const expectedFilename = `${packageJson.name}-${packageJson.version}.tgz`
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

fs.mkdirSync(destination, { recursive: true })
const expectedPath = path.join(destination, expectedFilename)
const generatedPath = path.join(packageRoot, expectedFilename)
fs.rmSync(expectedPath, { force: true })
if (generatedPath !== expectedPath) fs.rmSync(generatedPath, { force: true })

const packed = spawnSync(npmCommand, ['pack', '.', '--ignore-scripts'], {
  cwd: packageRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'inherit'],
  windowsHide: true,
})

if (packed.error) throw packed.error
if (packed.status !== 0) process.exit(packed.status ?? 1)
if (!fs.existsSync(generatedPath)) throw new Error(`npm pack did not create ${generatedPath}.`)
if (generatedPath !== expectedPath) {
  fs.copyFileSync(generatedPath, expectedPath)
  fs.rmSync(generatedPath)
}

console.log(expectedPath)
