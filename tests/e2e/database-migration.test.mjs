import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'

import { _electron as electron } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const helperPath = path.join(repoRoot, 'tests', 'e2e', 'helpers', 'legacy-database.mjs')

let userDataDir
let databasePath

function runDatabaseHelper(operation) {
  const result = spawnSync(electronPath, [helperPath, operation, databasePath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout ? JSON.parse(result.stdout) : null
}

async function migrateByLaunchingDesktop() {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      IMPRINT_E2E: '1',
      IMPRINT_E2E_USER_DATA_DIR: userDataDir,
    },
    timeout: 60_000,
  })
  const page = await electronApp.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')
  await electronApp.close()
}

before(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-legacy-db-'))
  databasePath = path.join(userDataDir, 'copy-design.db')
  runDatabaseHelper('create')
})

after(async () => {
  if (userDataDir) await fs.rm(userDataDir, { force: true, recursive: true })
})

test('migrates and redacts a populated legacy Desktop database idempotently', { timeout: 120_000 }, async () => {
  await migrateByLaunchingDesktop()
  const firstSnapshot = runDatabaseHelper('inspect')
  await migrateByLaunchingDesktop()
  const secondSnapshot = runDatabaseHelper('inspect')

  assert.deepEqual(secondSnapshot, firstSnapshot)
  const serialized = JSON.stringify(secondSnapshot)
  assert.equal(serialized.includes('private-value'), false)
  assert.equal(serialized.includes('user:password'), false)

  const migrated = secondSnapshot.analyses.find((record) => record.id === 'analysis-valid')
  assert.equal(migrated.url, 'https://example.com/products')
  assert.equal(migrated.final_url, 'https://example.com/products')
  assert.equal(migrated.route_identity, 'https://example.com/products')
  assert.equal(migrated.duration_ms, 987)
  assert.equal(migrated.capture_manifest_json, null)
  assert.ok(secondSnapshot.analysisColumns.some((column) => column.name === 'capture_manifest_json'))
  assert.ok(secondSnapshot.analysisColumns.some((column) => column.name === 'completion_json'))
  assert.equal(
    secondSnapshot.analysisColumns.some((column) => column.name === 'is_reference'),
    false,
  )
  assert.equal(
    secondSnapshot.indexes.some((index) => index.name === 'idx_analyses_reference_route'),
    false,
  )
  assert.deepEqual(
    secondSnapshot.obsoleteComparisonTables.map(({ name }) => name),
    [],
  )
})
