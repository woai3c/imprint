import { describe, expect, test } from 'vitest'

import {
  type ComponentCandidate,
  mergeComponentPatterns,
  summarizeComponentCandidates,
} from '../../src/core/analyzer/component-detect.js'

describe('component candidate summarization', () => {
  test('keeps semantic evidence, averages confidence, and uses the common style', () => {
    const commonStyles = {
      backgroundColor: 'rgb(37, 99, 235)',
      borderRadius: '8px',
    }
    const candidates: ComponentCandidate[] = [
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        styles: commonStyles,
      },
      {
        type: 'button',
        confidence: 0.9,
        evidence: ['aria-role'],
        styles: commonStyles,
      },
      {
        type: 'button',
        confidence: 0.65,
        evidence: ['class-name', 'interactive-behavior'],
        styles: {
          backgroundColor: 'rgb(255, 255, 255)',
          borderRadius: '4px',
        },
      },
    ]

    const [button] = summarizeComponentCandidates(candidates)

    expect(button).toMatchObject({
      type: 'button',
      count: 3,
      confidence: 0.84,
      styles: commonStyles,
    })
    expect(button.selectors).toContain('button')
    expect(button.evidence).toEqual(['aria-role', 'class-name', 'interactive-behavior', 'native-element'])
  })

  test('reports visual card evidence separately from standardized selectors', () => {
    const [card] = summarizeComponentCandidates([
      {
        type: 'card',
        confidence: 0.78,
        evidence: ['border-boundary', 'contained-spacing', 'repeated-sibling-structure'],
        styles: { borderRadius: '12px' },
      },
    ])

    expect(card).toMatchObject({
      type: 'card',
      count: 1,
      confidence: 0.78,
      selectors: [],
    })
  })

  test('merges component evidence and counts across analyzed pages', () => {
    const merged = mergeComponentPatterns([
      summarizeComponentCandidates([
        { type: 'button', confidence: 0.9, evidence: ['native-element'], styles: { borderRadius: '8px' } },
      ]),
      summarizeComponentCandidates([
        { type: 'button', confidence: 0.7, evidence: ['aria-role'], styles: { borderRadius: '4px' } },
        { type: 'button', confidence: 0.7, evidence: ['aria-role'], styles: { borderRadius: '4px' } },
      ]),
    ])

    expect(merged[0]).toMatchObject({ type: 'button', count: 3, confidence: 0.77, styles: { borderRadius: '4px' } })
    expect(merged[0].evidence).toEqual(['aria-role', 'native-element'])
  })
})
