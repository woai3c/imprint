import { describe, expect, test } from 'vitest'

import { resolveCliExportFormats } from '../../src/cli/export-formats.js'
import { desktopArtifactExports } from '../../src/renderer/components/analyze/artifact-exports.js'
import { artifactTabIds } from '../../src/renderer/components/analyze/artifact-tabs.js'
import type { AnalysisResultData } from '../../src/shared/ipc-contract.js'

describe('CLI document formats', () => {
  test('keeps reconstruction out of the public export surface', () => {
    const formats = resolveCliExportFormats('all', { hasProfile: true })
    expect(formats).toContain('profile')
    expect(formats).toContain('components')
    expect(formats).toContain('visual-qa')
    expect(formats).not.toContain('reconstruction')
    expect(formats).not.toContain('brief')
    expect(resolveCliExportFormats('all', { hasProfile: false })).not.toContain('profile')
  })
})

describe('Desktop analysis artifacts', () => {
  test('shows the human-facing artifacts as tabs and exports the same implementation formats', () => {
    expect(artifactTabIds()).toEqual(['overview', 'preview', 'markdown', 'tailwind', 'css'])
    const result = {
      tokens: { colors: {} },
      cssVariables: ':root {}',
      tailwindTheme: '@theme {}',
      designDoc: '# Design System',
      screenshots: [],
      duration: 1,
      url: 'https://example.com',
    } as AnalysisResultData
    expect(desktopArtifactExports(result).map(({ id, defaultName }) => [id, defaultName])).toEqual([
      ['design-md', 'DESIGN.md'],
      ['css-variables', 'variables.css'],
      ['tailwind-theme', 'theme.css'],
    ])
  })
})
