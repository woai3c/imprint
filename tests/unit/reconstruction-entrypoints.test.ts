import { describe, expect, test } from 'vitest'

import { resolveCliExportFormats } from '../../src/cli/export-formats.js'
import { artifactTabIds } from '../../src/renderer/components/analyze/artifact-tabs.js'

describe('CLI document formats', () => {
  test('keeps reconstruction out of the public export surface', () => {
    const formats = resolveCliExportFormats('all', { hasProfile: true })
    expect(formats).toContain('profile')
    expect(formats).not.toContain('reconstruction')
    expect(formats).not.toContain('brief')
    expect(resolveCliExportFormats('all', { hasProfile: false })).not.toContain('profile')
  })
})

describe('Desktop analysis artifacts', () => {
  test('keeps DESIGN.md as the only exported document', () => {
    expect(artifactTabIds()).toEqual(['overview', 'preview', 'markdown'])
  })
})
