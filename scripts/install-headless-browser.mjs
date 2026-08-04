import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

if (process.platform !== 'darwin') process.exit(0)

const require = createRequire(import.meta.url)
const playwrightRoot = path.dirname(require.resolve('playwright-core/package.json'))
const playwrightCli = path.join(playwrightRoot, 'cli.js')
const result = spawnSync(process.execPath, [playwrightCli, 'install', '--only-shell', 'chromium'], {
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
