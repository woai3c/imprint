import { describe, expect, test } from 'vitest'

import {
  type ComponentCandidate,
  type ComponentVariantCandidate,
  classifyComponentVariant,
  hasVisibleShadow,
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
    expect(
      classifyComponentVariant(
        'button',
        { backgroundColor: '#2563eb', borderRadius: '999px', padding: '0px' },
        { role: 'primary-action', primaryColor: '#2563eb', widthPx: 34, heightPx: 34 },
      ),
    ).toBe('icon')
    expect(
      classifyComponentVariant(
        'button',
        {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          color: 'rgb(132, 145, 165)',
          borderRadius: '0px 9999px 9999px 0px',
          padding: '0px 12px',
        },
        { role: 'primary-action', primaryColor: '#1772f6', widthPx: 72, heightPx: 40 },
      ),
    ).toBe('text')
  })

  test('does not treat transparent or zero-geometry shadows as visible paint', () => {
    expect(hasVisibleShadow('0 0 0 2px rgba(0, 0, 0, 0)')).toBe(false)
    expect(hasVisibleShadow('rgba(0, 0, 0, 0) 0px 0px 0px 2px')).toBe(false)
    expect(hasVisibleShadow('0 0 0 0 rgb(0, 0, 0)')).toBe(false)
    expect(hasVisibleShadow('0 0 0 2px rgba(0, 0, 0, 0.2)')).toBe(true)
    expect(hasVisibleShadow('0 2px 8px hsla(0, 0%, 0%, 0%)')).toBe(false)
    expect(hasVisibleShadow('0 2px 8px hsla(0, 0%, 0%, 20%)')).toBe(true)
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

  test('keeps distinct borderless button surface and corner families separate', () => {
    const candidates: ComponentVariantCandidate[] = [
      {
        type: 'button',
        confidence: 0.94,
        evidence: ['native-element'],
        primaryColor: '#2563eb',
        widthPx: 108,
        heightPx: 32,
        styles: {
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          color: '#2563eb',
          border: '0px none #2563eb',
          borderRadius: '4px',
          boxShadow: 'none',
          padding: '6px 14px',
        },
      },
      {
        type: 'button',
        confidence: 0.92,
        evidence: ['native-element'],
        primaryColor: '#2563eb',
        widthPx: 108,
        heightPx: 32,
        styles: {
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          color: '#2563eb',
          border: '0px none #2563eb',
          borderRadius: '9999px',
          boxShadow: 'none',
          padding: '6px 14px',
        },
      },
    ]

    const variants = summarizeComponentVariants(candidates)

    expect(variants.map((variant) => variant.name)).toEqual([
      'button-secondary-pill-tinted',
      'button-secondary-rounded-tinted',
    ])
    expect(variants.map((variant) => variant.count)).toEqual([1, 1])
  })

  test('keeps distinct card surface and radius families separate', () => {
    const candidates: ComponentVariantCandidate[] = [
      ...Array.from({ length: 3 }, () => ({
        type: 'card' as const,
        confidence: 0.9,
        evidence: ['repeated-sibling-structure'],
        styles: {
          backgroundColor: '#ffffff',
          border: '0px none transparent',
          borderRadius: '2px',
          boxShadow: 'none',
        },
      })),
      ...Array.from({ length: 2 }, () => ({
        type: 'card' as const,
        confidence: 0.86,
        evidence: ['border-boundary'],
        styles: {
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          boxShadow: 'none',
        },
      })),
      {
        type: 'card',
        confidence: 0.82,
        evidence: ['contained-spacing'],
        styles: {
          backgroundColor: '#ffffff',
          border: '0px none transparent',
          borderRadius: '20px',
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.12)',
        },
      },
    ]

    const variants = summarizeComponentVariants(candidates)

    expect(variants.map((variant) => variant.name)).toEqual(['card-elevated-r20', 'card-flat-r2', 'card-outlined-r16'])
    expect(variants.find((variant) => variant.name === 'card-flat-r2')?.count).toBe(3)
    expect(summarizeComponentVariants([candidates[0]])[0].name).toBe('card')
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
