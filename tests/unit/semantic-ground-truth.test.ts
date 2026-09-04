import { describe, expect, test } from 'vitest'

import type { FixtureAnnotation } from '../design-evidence-regression/annotation-types.js'
import { evaluateSemanticGroundTruth } from '../design-evidence-regression/semantic-ground-truth.js'

const annotation: FixtureAnnotation = {
  fixture: 'semantic-oracle',
  description: 'Independent semantic oracle unit fixture.',
  expectedSectionRoles: [],
  minSections: 0,
  expectedComponentTypes: [],
  minSafelyObservedInteractions: 0,
  expectedResponsiveChangeTypesAny: [],
  minMediaLayers: 0,
  expectedMediaKinds: [],
  expectedSalienceTraits: [],
  minSectionCoverage: 0,
  semanticGroundTruth: {
    foundationColors: { background: '#eef1f5', surface: '#fff', secondary: null },
    forbiddenFoundationColors: ['#10151f'],
    expectedComponentRoles: ['searchbox', 'textbox'],
    expectedComponentSemantics: [{ elementKind: 'anchor', semanticIdentity: 'link', visualTreatment: 'button-like' }],
    expectedComponentPatternNames: ['input-search', 'input-text'],
    expectedComponentStyles: [{ pattern: 'input-search', property: 'padding', value: '8px 40px 8px 12px' }],
    forbiddenComponentStyles: [{ pattern: 'input-text', property: 'padding', value: '8px 40px 8px 12px' }],
    expectedRelativeReorderRoles: ['navigation', 'hero'],
  },
}

describe('independent semantic ground-truth evaluator', () => {
  test('accepts an artifact that satisfies the hand-authored semantic contract', () => {
    expect(
      evaluateSemanticGroundTruth(annotation, {
        colors: { background: 'rgb(238, 241, 245)', surface: '#ffffff' },
        componentRoles: ['searchbox', 'textbox'],
        componentSemantics: [{ elementKind: 'anchor', semanticIdentity: 'link', visualTreatment: 'button-like' }],
        componentPatternNames: ['input-search', 'input-text'],
        componentPatternStyles: {
          'input-search': { padding: ['8px 40px 8px 12px'] },
          'input-text': { padding: ['8px 12px 8px 12px'] },
        },
        responsiveChanges: [
          { role: 'navigation', properties: ['sequenceIndex'] },
          { role: 'hero', properties: ['sequenceIndex'] },
        ],
      }),
    ).toEqual([])
  })

  test('reports wrong foundation ownership, lost context, and missing relative reorder independently', () => {
    expect(
      evaluateSemanticGroundTruth(annotation, {
        colors: { background: '#ffffff', surface: '#10151f', secondary: '#eef1f5' },
        componentRoles: ['textbox'],
        componentSemantics: [],
        componentPatternNames: ['input-text'],
        componentPatternStyles: {
          'input-text': { padding: ['8px 40px 8px 12px'] },
        },
        responsiveChanges: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('foundation color background'),
        expect.stringContaining('foundation color surface'),
        expect.stringContaining('must be omitted'),
        expect.stringContaining('specialized color #10151f'),
        expect.stringContaining('component role searchbox'),
        expect.stringContaining('component pattern input-search'),
        expect.stringContaining('expected padding=8px 40px 8px 12px'),
        expect.stringContaining('must not use padding=8px 40px 8px 12px'),
        expect.stringContaining('relative reorder for navigation'),
        expect.stringContaining('relative reorder for hero'),
      ]),
    )
  })

  test('rejects a false relative reorder when a leading sibling merely disappears', () => {
    expect(
      evaluateSemanticGroundTruth(
        { ...annotation, semanticGroundTruth: { forbidRelativeReorder: true } },
        {
          colors: {},
          componentRoles: [],
          componentSemantics: [],
          componentPatternNames: [],
          componentPatternStyles: {},
          responsiveChanges: [{ role: 'hero', properties: ['sequenceIndex'] }],
        },
      ),
    ).toEqual([expect.stringContaining('false relative reorder')])
  })
})
