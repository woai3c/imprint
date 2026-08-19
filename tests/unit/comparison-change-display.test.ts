import { describe, expect, it } from 'vitest'

import type { ReferenceComparisonChange } from '../../src/core/analyzer/reference-compare.js'
import type { CrossCaptureEntityMatchingResult } from '../../src/core/governance/entity-matcher.js'
import {
  describeLayoutOrderChange,
  groupLayoutChangesForDisplay,
} from '../../src/renderer/lib/comparison-change-display.js'

function change(id: string, referenceId: string, targetId: string): ReferenceComparisonChange {
  return {
    id,
    category: 'layout',
    kind: 'changed',
    tokenPath: `layout.footer.${id}.order`,
    from: '6',
    to: '5',
    referenceEvidenceIds: [referenceId],
    targetEvidenceIds: [targetId],
  }
}

function matching(pageKeys: string[]): CrossCaptureEntityMatchingResult {
  return {
    schemaVersion: '1',
    sections: pageKeys.map((pageKey, index) => ({
      kind: 'section',
      pageKey,
      status: 'matched',
      confidence: 'high',
      reason: 'exact-semantic-signature',
      referenceIds: [`reference-${index}`],
      targetIds: [`target-${index}`],
    })),
    components: [],
    summary: {
      sections: {
        matchedPairs: pageKeys.length,
        highConfidencePairs: pageKeys.length,
        mediumConfidencePairs: 0,
        ambiguousGroups: 0,
        unmatchedEntities: 0,
      },
      components: {
        matchedPairs: 0,
        highConfidencePairs: 0,
        mediumConfidencePairs: 0,
        ambiguousGroups: 0,
        unmatchedEntities: 0,
      },
    },
    limitations: ['identity-only', 'ambiguous-and-unmatched-are-not-drift'],
  }
}

describe('groupLayoutChangesForDisplay', () => {
  it('combines the same observed layout change across viewports', () => {
    const changes = [change('1', 'reference-0', 'target-0'), change('2', 'reference-1', 'target-1')]
    const groups = groupLayoutChangesForDisplay(
      changes,
      matching(['https://example.com/::desktop', 'https://example.com/::mobile']),
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      role: 'footer',
      property: 'order',
      routeIdentity: 'https://example.com/',
      viewports: ['desktop', 'mobile'],
    })
    expect(groups[0].changes).toEqual(changes)
  })

  it('keeps identical observations on different routes separate', () => {
    const changes = [change('1', 'reference-0', 'target-0'), change('2', 'reference-1', 'target-1')]
    const groups = groupLayoutChangesForDisplay(
      changes,
      matching(['https://example.com/::desktop', 'https://example.com/about::desktop']),
    )

    expect(groups).toHaveLength(2)
  })

  it('keeps an unrecognized or unpaired item as a lossless technical fallback', () => {
    const item = change('1', 'missing-reference', 'missing-target')
    const groups = groupLayoutChangesForDisplay([item], matching([]))

    expect(groups).toEqual([{ key: '1', changes: [item], viewports: [] }])
  })
})

describe('describeLayoutOrderChange', () => {
  it('treats the zero-based order as the count of identified sections before the match', () => {
    expect(describeLayoutOrderChange('6', '5')).toEqual({
      direction: 'fewerBefore',
      from: 6,
      to: 5,
      delta: 1,
    })
    expect(describeLayoutOrderChange('2', '4')).toEqual({
      direction: 'moreBefore',
      from: 2,
      to: 4,
      delta: 2,
    })
  })

  it('rejects missing, negative, fractional, and unchanged order values', () => {
    expect(describeLayoutOrderChange(undefined, '5')).toBeNull()
    expect(describeLayoutOrderChange('-1', '2')).toBeNull()
    expect(describeLayoutOrderChange('1.5', '2')).toBeNull()
    expect(describeLayoutOrderChange('3', '3')).toBeNull()
  })
})
