import { describe, expect, it } from 'vitest'

import { selectFoundationSurfaceColors } from '../../src/core/analyzer/semantic-owner.js'
import type { SemanticSurfaceObservation } from '../../src/core/analyzer/types.js'

function surface(
  ownerId: string,
  value: string,
  role: SemanticSurfaceObservation['role'],
  domain: SemanticSurfaceObservation['domain'],
): SemanticSurfaceObservation {
  return {
    captureId: 'capture',
    ownerId,
    value,
    role,
    domain,
    rendered: true,
    declared: true,
    elementKind: role === 'code-surface' ? 'pre' : 'section',
    areaRatio: role === 'page-canvas' ? 1 : 0.2,
    viewportCoverage: role === 'page-canvas' ? 1 : 0.2,
  }
}

function capture(url: string, observations: SemanticSurfaceObservation[], viewport = 'desktop') {
  return { url, viewport, styles: { semanticSurfaceObservations: observations } }
}

describe('semantic foundation surface selection', () => {
  it.each([2, 20, 200])('keeps the canvas stable when card count changes to %i', (cardCount) => {
    const observations = [
      surface('body', '#f3f4f6', 'page-canvas', 'foundation'),
      ...Array.from({ length: cardCount }, (_value, index) =>
        surface(`main > article:nth-of-type(${index + 1})`, '#ffffff', 'content-surface', 'foundation'),
      ),
    ]

    expect(selectFoundationSurfaceColors([capture('https://example.test/', observations)])).toEqual({
      background: '#f3f4f6',
      surface: '#ffffff',
    })
  })

  it.each([1, 10, 50])('does not promote %i repeated code surfaces into the foundation palette', (codeCount) => {
    const observations = [
      surface('body', '#f7f7f5', 'page-canvas', 'foundation'),
      surface('main > article:nth-of-type(1)', '#ffffff', 'content-surface', 'foundation'),
      surface('main > article:nth-of-type(2)', '#ffffff', 'content-surface', 'foundation'),
      surface('header', '#ffffff', 'chrome-surface', 'component'),
      ...Array.from({ length: codeCount }, (_value, index) =>
        surface(`main > article > pre:nth-of-type(${index + 1})`, '#08090a', 'code-surface', 'specialized-content'),
      ),
    ]

    expect(selectFoundationSurfaceColors([capture('https://example.test/article', observations)])).toEqual({
      background: '#f7f7f5',
      surface: '#ffffff',
    })
  })

  it('counts one canonical viewport per route', () => {
    const home = [
      surface('body', '#f3f4f6', 'page-canvas', 'foundation'),
      surface('main > article', '#ffffff', 'content-surface', 'foundation'),
    ]
    const docs = [
      surface('body', '#f3f4f6', 'page-canvas', 'foundation'),
      surface('main > article', '#ffffff', 'content-surface', 'foundation'),
    ]

    expect(
      selectFoundationSurfaceColors([
        capture('https://example.test/', home),
        capture('https://example.test/', home, 'mobile'),
        capture('https://example.test/docs', docs),
      ]),
    ).toEqual({ background: '#f3f4f6', surface: '#ffffff' })
  })

  it('omits secondary when no independent second content surface exists', () => {
    const observations = [
      surface('body', '#f3f4f6', 'page-canvas', 'foundation'),
      surface('main > article:nth-of-type(1)', '#ffffff', 'content-surface', 'foundation'),
      surface('main > article:nth-of-type(2)', '#ffffff', 'content-surface', 'foundation'),
      surface('main > form', '#eef2ff', 'control-surface', 'component'),
      surface('main > div[role=status]', '#fef2f2', 'status-surface', 'component'),
    ]

    expect(selectFoundationSurfaceColors([capture('https://example.test/', observations)])).toEqual({
      background: '#f3f4f6',
      surface: '#ffffff',
    })
  })

  it('does not promote repeated page chrome as a generic content surface', () => {
    const observations = [
      surface('body', '#f3f4f6', 'page-canvas', 'foundation'),
      surface('header', '#000000', 'chrome-surface', 'component'),
      surface('footer', '#000000', 'chrome-surface', 'component'),
    ]

    expect(
      selectFoundationSurfaceColors([
        capture('https://example.test/', observations),
        capture('https://example.test/docs', observations),
      ]),
    ).toEqual({ background: '#f3f4f6' })
  })
})
