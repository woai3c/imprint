import { describe, expect, it } from 'vitest'

import fs from 'node:fs'
import os from 'node:os'

import { analyze, findBrowser } from '../../src/core/analyzer/index.js'
import { compareReferenceCaptures } from '../../src/core/analyzer/reference-compare.js'
import { createComparisonSiteServer } from '../comparison-site/server.mjs'

const browserAvailable = Boolean(findBrowser())

async function listen(server, port = 0) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Comparison site did not expose a TCP port')
  return address.port
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

async function captureVariant(variant, port, dataDir) {
  const server = createComparisonSiteServer(variant)
  await listen(server, port)
  try {
    return await analyze(`http://127.0.0.1:${port}/`, {
      viewports: ['desktop', 'mobile'],
      maxPages: 3,
      useSession: false,
      dataDir,
    })
  } finally {
    await close(server)
  }
}

function comparisonInput(result) {
  return {
    analysisId: result.analysisId,
    url: result.finalUrl,
    tokens: result.tokens,
    evidence: result.designEvidence,
    manifest: result.captureManifest,
  }
}

describe('manual comparison site browser regression', () => {
  it.skipIf(!browserAvailable)(
    'keeps the reference stable and reports each documented variant without category drift',
    { timeout: 300_000 },
    async () => {
      const dataDir = fs.mkdtempSync(`${os.tmpdir()}/imprint-comparison-site-`)
      const initialServer = createComparisonSiteServer('reference')
      const port = await listen(initialServer)
      let reference
      let repeatedReference
      try {
        reference = await analyze(`http://127.0.0.1:${port}/`, {
          viewports: ['desktop', 'mobile'],
          maxPages: 3,
          useSession: false,
          dataDir,
        })
        repeatedReference = await analyze(`http://127.0.0.1:${port}/`, {
          viewports: ['desktop', 'mobile'],
          maxPages: 3,
          useSession: false,
          dataDir,
        })
      } finally {
        await close(initialServer)
      }

      const stable = compareReferenceCaptures(comparisonInput(reference), comparisonInput(repeatedReference))
      expect(reference.designEvidence.coverage).toMatchObject({
        pageCoverage: 'complete',
        urlCoverage: { requested: 1, captured: 1 },
        captureCoverage: { expected: 2, captured: 2, status: 'complete' },
      })
      expect(reference.designEvidence.coverage.limitations).not.toContain('fewer-pages-than-requested')
      expect(reference.designEvidence.coverage.limitations).not.toContain('fewer-page-viewports-than-requested')
      expect(reference.captureManifest).toMatchObject({
        request: { maxPages: 3 },
        capture: {
          pages: { requested: 3, discovered: 0, selected: 0, analyzed: 1 },
          expected: 2,
          captured: 2,
          status: 'complete',
        },
      })
      expect(stable.comparability.reasons).toEqual([])
      expect(stable.status).toBe('unchanged')
      expect(stable.categories.flatMap((category) => category.changes)).toEqual([])

      const cases = [
        { variant: 'colors', expected: ['colors'] },
        { variant: 'typography', expected: ['typography'] },
        { variant: 'spacing', expected: ['spacing'] },
        { variant: 'radii', expected: ['radii'] },
        { variant: 'layout-responsive', expected: ['layout', 'responsive'] },
        { variant: 'interaction', expected: ['interaction-states'] },
      ]

      for (const scenario of cases) {
        const target = await captureVariant(scenario.variant, port, dataDir)
        const comparison = compareReferenceCaptures(comparisonInput(reference), comparisonInput(target))
        const actual = comparison.categories
          .filter((category) => category.status === 'changed')
          .map((category) => category.category)
          .sort()

        expect(comparison.comparability.reasons, `${scenario.variant} must remain comparable`).toEqual([])
        expect(actual, `${scenario.variant} must report only its documented categories`).toEqual(
          [...scenario.expected].sort(),
        )
      }
    },
  )
})
