import { describe, expect, test } from 'vitest'

import { formatPageSectionTopology } from '../../src/core/design-evidence/topology-summary.js'
import type { SectionEvidence } from '../../src/core/design-evidence/types.js'

function section(id: string, role: SectionEvidence['role'], order: number, parentSectionId?: string): SectionEvidence {
  return {
    id,
    pageId: 'page-desktop',
    order,
    role,
    rect: { x: 0, y: 0, width: 1, height: 0.2 },
    layoutMode: 'flow',
    ...(parentSectionId ? { parentSectionId } : {}),
    tokenRefs: [],
    componentRefs: [],
    interactionRefs: [],
    mediaLayerRefs: [],
    evidenceRefs: [],
  }
}

describe('page section topology summaries', () => {
  test('preserves parent-child structure and compacts repeated siblings', () => {
    const sections = [
      section('header', 'header', 0),
      section('navigation', 'navigation', 1, 'header'),
      section('content', 'content', 2),
      section('hero', 'hero', 3, 'content'),
      section('feature-a', 'feature-group', 4, 'content'),
      section('feature-b', 'feature-group', 5, 'content'),
      section('footer', 'footer', 6),
    ]
    const evidence = {
      topology: {
        schemaVersion: '1' as const,
        pages: [{ pageId: 'page-desktop', role: 'landing' as const, sectionIds: sections.map(({ id }) => id) }],
        globalLayers: [],
        crossPagePatternIds: [],
      },
      sections,
    }

    expect(formatPageSectionTopology(evidence, 'page-desktop')).toBe(
      'header (navigation) → content (hero → feature-group ×2) → footer',
    )
  })

  test('collapses nested wrappers with the same semantic role', () => {
    const sections = [
      section('navigation', 'navigation', 0),
      section('navigation-wrapper', 'navigation', 1, 'navigation'),
      section('nested-content', 'content', 2, 'navigation-wrapper'),
      section('navigation-leaf', 'navigation', 3, 'navigation'),
    ]
    const evidence = {
      topology: {
        schemaVersion: '1' as const,
        pages: [{ pageId: 'page-desktop', role: 'landing' as const, sectionIds: sections.map(({ id }) => id) }],
        globalLayers: [],
        crossPagePatternIds: [],
      },
      sections,
    }

    expect(formatPageSectionTopology(evidence, 'page-desktop')).toBe('navigation (content)')
  })

  test('collapses unknown wrappers and omits unknown leaves without inventing content', () => {
    const sections = [
      section('unknown-root', 'unknown', 0),
      section('hero', 'hero', 1, 'unknown-root'),
      section('unknown-wrapper', 'unknown', 2, 'hero'),
      section('media', 'media', 3, 'unknown-wrapper'),
      section('unknown-leaf', 'unknown', 4, 'hero'),
      section('footer', 'footer', 5),
    ]
    const evidence = {
      topology: {
        schemaVersion: '1' as const,
        pages: [{ pageId: 'page-desktop', role: 'landing' as const, sectionIds: sections.map(({ id }) => id) }],
        globalLayers: [],
        crossPagePatternIds: [],
      },
      sections,
    }

    expect(formatPageSectionTopology(evidence, 'page-desktop')).toBe('hero (media) → footer')
    expect(
      formatPageSectionTopology(evidence, 'page-desktop', (role) => (role === 'unknown' ? 'content' : role)),
    ).not.toContain('content')
  })
})
