import { afterEach, describe, expect, it } from 'vitest'

import { availableVariants, createComparisonSiteServer } from '../comparison-site/server.mjs'

const runningServers = new Set()

afterEach(async () => {
  await Promise.all(
    [...runningServers].map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
  runningServers.clear()
})

async function start(variant) {
  const server = createComparisonSiteServer(variant)
  runningServers.add(server)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

describe('manual comparison site', () => {
  it('serves every documented variant at the same analysis route without caching', async () => {
    expect(availableVariants).toEqual([
      'colors',
      'custom',
      'damaged-overlay',
      'interaction',
      'layout-responsive',
      'prospective-all-categories',
      'prospective-stable',
      'radii',
      'reference',
      'spacing',
      'typography',
    ])

    for (const variant of availableVariants) {
      const origin = await start(variant)
      const page = await fetch(`${origin}/`)
      const styles = await fetch(`${origin}/variant.css`)

      expect(page.status).toBe(200)
      expect(page.headers.get('cache-control')).toBe('no-store')
      expect(await page.text()).toContain('<title>Imprint Comparison Lab</title>')
      expect(styles.status).toBe(200)
      expect(styles.headers.get('cache-control')).toBe('no-store')

      const server = [...runningServers].at(-1)
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      runningServers.delete(server)
    }
  })

  it('rejects unknown variants and unknown routes', async () => {
    expect(() => createComparisonSiteServer('unknown')).toThrow('Unknown comparison-site variant')

    const origin = await start('reference')
    const response = await fetch(`${origin}/not-found`)
    expect(response.status).toBe(404)
  })
})
