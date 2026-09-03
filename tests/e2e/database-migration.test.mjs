import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'

import { _electron as electron } from 'playwright-core'

import { opaqueRouteIdentity } from '../../dist/core/analyzer/url-identity.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const helperPath = path.join(repoRoot, 'tests', 'e2e', 'helpers', 'legacy-database.mjs')
const legacyPrivateUrl = 'https://user:password@example.com/products?access_token=private-value#panel'

let userDataDir
let databasePath

function runDatabaseHelper(operation, targetDatabasePath = databasePath) {
  const result = spawnSync(electronPath, [helperPath, operation, targetDatabasePath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout ? JSON.parse(result.stdout) : null
}

async function migrateByLaunchingDesktop(targetUserDataDir = userDataDir) {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      IMPRINT_E2E: '1',
      IMPRINT_E2E_USER_DATA_DIR: targetUserDataDir,
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
  assert.equal(migrated.route_identity, opaqueRouteIdentity(legacyPrivateUrl))
  assert.equal(migrated.route_identity_version, 1)
  assert.equal(migrated.site_name, 'example.com')
  assert.equal(migrated.preview_path, '/tmp/capture.png')
  assert.equal(migrated.duration_ms, 987)
  assert.equal(migrated.capture_manifest_json, null)
  const structurallyMalformed = secondSnapshot.analyses.find(
    (record) => record.id === 'analysis-structurally-malformed',
  )
  assert.equal(structurallyMalformed.route_identity, opaqueRouteIdentity(legacyPrivateUrl))
  assert.equal(structurallyMalformed.route_identity_version, 1)
  const nonQuery = secondSnapshot.analyses.find((record) => record.id === 'analysis-non-query')
  assert.equal(nonQuery.route_identity, opaqueRouteIdentity('https://example.com/about'))
  assert.equal(nonQuery.route_identity_version, 1)
  const distinctQuery = secondSnapshot.analyses.find((record) => record.id === 'analysis-distinct-query')
  assert.equal(
    distinctQuery.route_identity,
    opaqueRouteIdentity('https://example.com/products?access_token=another-private-value'),
  )
  assert.notEqual(distinctQuery.route_identity, migrated.route_identity)
  assert.equal(structurallyMalformed.site_name, 'example.com')
  assert.equal(structurallyMalformed.preview_path, null)
  assert.ok(secondSnapshot.analysisColumns.some((column) => column.name === 'capture_manifest_json'))
  assert.ok(secondSnapshot.analysisColumns.some((column) => column.name === 'completion_json'))
  assert.ok(secondSnapshot.analysisColumns.some((column) => column.name === 'site_name'))
  assert.ok(secondSnapshot.analysisColumns.some((column) => column.name === 'preview_path'))
  assert.deepEqual(
    secondSnapshot.migrations.map(({ id }) => id),
    ['normalized-analysis-duration-v1', 'opaque-analysis-route-identity-v1', 'persisted-url-and-summary-v1'],
  )
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

test('keeps already-redacted legacy routes ineligible when their original identity is unrecoverable', async () => {
  const sanitizedUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-sanitized-legacy-db-'))
  const sanitizedDatabasePath = path.join(sanitizedUserDataDir, 'copy-design.db')
  try {
    runDatabaseHelper('create-sanitized', sanitizedDatabasePath)
    await migrateByLaunchingDesktop(sanitizedUserDataDir)
    const firstSnapshot = runDatabaseHelper('inspect', sanitizedDatabasePath)
    await migrateByLaunchingDesktop(sanitizedUserDataDir)
    const secondSnapshot = runDatabaseHelper('inspect', sanitizedDatabasePath)

    assert.deepEqual(secondSnapshot, firstSnapshot)
    const record = secondSnapshot.analyses.find((candidate) => candidate.id === 'analysis-query-redacted')
    assert.equal(record.route_identity, null)
    assert.equal(record.route_identity_version, null)
  } finally {
    await fs.rm(sanitizedUserDataDir, { force: true, recursive: true })
  }
})
