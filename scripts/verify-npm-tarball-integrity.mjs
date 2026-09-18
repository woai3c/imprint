import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const tarballPath = process.argv[2]
const expectedIntegrity = process.argv[3]

if (!tarballPath || !expectedIntegrity) {
  console.error('Usage: node scripts/verify-npm-tarball-integrity.mjs <tarball> <expected-sha512-integrity>')
  process.exit(1)
}

const resolvedTarballPath = path.resolve(tarballPath)
const actualIntegrity = `sha512-${crypto.createHash('sha512').update(fs.readFileSync(resolvedTarballPath)).digest('base64')}`

if (actualIntegrity !== expectedIntegrity) {
  console.error(`Registry integrity does not match ${path.basename(resolvedTarballPath)}.`)
  process.exit(1)
}

console.log(`Verified registry integrity for ${path.basename(resolvedTarballPath)}.`)
