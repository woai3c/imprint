import { describe, expect, test } from 'vitest'

import {
  type ComponentCandidate,
  type ComponentVariantCandidate,
  classifyComponentVariant,
  isOutlinedButton,
  isPillRadius,
  mergeComponentPatterns,
  summarizeComponentCandidates,
  summarizeComponentVariants,
} from '../../src/core/analyzer/component-detect.js'

describe('component candidate summarization', () => {
  test('distinguishes outlined and pill controls from tinted or compact-radius buttons', () => {
    expect(
      isOutlinedButton({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        border: '1px solid rgb(37, 99, 235)',
      }),
    ).toBe(true)
    expect(
      isOutlinedButton({
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        border: '0px none rgb(37, 99, 235)',
      }),
    ).toBe(false)
    expect(isPillRadius({ borderRadius: '24px' }, { heightPx: 34 })).toBe(true)
    expect(isPillRadius({ borderRadius: '4px' }, { heightPx: 34 })).toBe(false)
    expect(
      classifyComponentVariant(
        'button',
        { backgroundColor: '#2563eb', borderRadius: '24px', padding: '0px' },
        { primaryColor: '#2563eb', widthPx: 90, heightPx: 34 },
      ),
    ).toBe('primary')
  })

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

  test('prefers an informative visual style over a more frequent zero-style candidate', () => {
    const candidates: ComponentCandidate[] = [
      ...Array.from({ length: 8 }, () => ({
        type: 'button' as const,
        confidence: 0.98,
        evidence: ['native-element'],
        styles: {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          border: '0px none rgb(17, 24, 39)',
          borderRadius: '0px',
          padding: '0px',
        },
      })),
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        styles: {
          backgroundColor: 'rgb(37, 99, 235)',
          color: 'rgb(255, 255, 255)',
          border: '1px solid rgb(37, 99, 235)',
          borderRadius: '8px',
          padding: '8px',
        },
      },
    ]

    expect(summarizeComponentCandidates(candidates)[0].styles.backgroundColor).toBe('rgb(37, 99, 235)')
  })

  test('splits button evidence into deterministic semantic variants', () => {
    const base = {
      type: 'button' as const,
      confidence: 0.98,
      evidence: ['native-element'],
      primaryColor: '#2563eb',
    }
    const candidates: ComponentVariantCandidate[] = [
      {
        ...base,
        tokenRefs: ['color.primary'],
        widthPx: 120,
        heightPx: 40,
        styles: {
          backgroundColor: 'rgb(37, 99, 235)',
          color: 'rgb(255, 255, 255)',
          borderRadius: '8px',
          padding: '8px 16px',
        },
      },
      {
        ...base,
        widthPx: 120,
        heightPx: 40,
        styles: {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          border: '1px solid rgb(37, 99, 235)',
          borderRadius: '8px',
          padding: '8px 16px',
        },
      },
      ...Array.from({ length: 2 }, () => ({
        ...base,
        widthPx: 120,
        heightPx: 40,
        styles: {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          border: '1px solid rgb(37, 99, 235)',
          borderRadius: '8px',
          padding: '8px 16px',
        },
      })),
      {
        ...base,
        widthPx: 120,
        heightPx: 40,
        styles: {
          backgroundColor: 'rgb(255, 255, 255)',
          border: '1px solid rgb(37, 99, 235)',
          borderRadius: '8px',
          padding: '8px 16px',
        },
      },
      {
        ...base,
        widthPx: 80,
        heightPx: 32,
        styles: {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          border: '0px none rgb(37, 99, 235)',
          borderRadius: '0px',
          padding: '0px',
        },
      },
      {
        ...base,
        tokenRefs: ['color.primary'],
        widthPx: 32,
        heightPx: 32,
        styles: {
          backgroundColor: 'rgb(37, 99, 235)',
          borderRadius: '9999px',
          padding: '0px',
        },
      },
    ]

    const variants = summarizeComponentVariants(candidates)

    expect(variants.map((variant) => variant.name)).toEqual([
      'button-primary',
      'button-secondary',
      'button-text',
      'button-icon',
    ])
    expect(variants.find((variant) => variant.name === 'button-secondary')).toMatchObject({
      count: 4,
      styles: { backgroundColor: 'rgba(0, 0, 0, 0)' },
    })
    expect(variants.reduce((total, variant) => total + variant.count, 0)).toBe(7)
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
