import { describe, expect, test } from 'vitest'

import { resolveCliExportFormats } from '../../src/cli/export-formats.js'
import { artifactTabIds } from '../../src/renderer/components/analyze/artifact-tabs.js'

describe('CLI reconstruction formats', () => {
  test('uses reconstruction as canonical and accepts brief as an alias', () => {
    const available = { hasProfile: true, hasReconstructionBrief: true }
    expect(resolveCliExportFormats('reconstruction', available)).toEqual(['reconstruction'])
    expect(resolveCliExportFormats('brief', available)).toEqual(['reconstruction'])
  })

  test('resolves profile and reconstruction availability independently for all', () => {
    expect(resolveCliExportFormats('all', { hasProfile: true, hasReconstructionBrief: true })).toEqual(
      expect.arrayContaining(['profile', 'reconstruction']),
    )
    const profileWithoutBrief = resolveCliExportFormats('all', {
      hasProfile: true,
      hasReconstructionBrief: false,
    })
    expect(profileWithoutBrief).toContain('profile')
    expect(profileWithoutBrief).not.toContain('reconstruction')
    expect(resolveCliExportFormats('all', { hasProfile: false, hasReconstructionBrief: false })).not.toContain(
      'profile',
    )
  })
})

describe('Desktop analysis artifacts', () => {
  test('keeps DESIGN.md as the only exported document', () => {
    expect(artifactTabIds()).toEqual(['overview', 'preview', 'markdown'])
  })
})
