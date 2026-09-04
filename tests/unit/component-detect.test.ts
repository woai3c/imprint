import { describe, expect, test } from 'vitest'

import {
  type ComponentCandidate,
  type ComponentVariantCandidate,
  classifyCardStyle,
  classifyComponentVariant,
  hasCrispEdgeShadow,
  hasDepthShadow,
  hasVisibleBorder,
  hasVisibleColor,
  hasVisibleShadow,
  isOutlinedButton,
  isPillRadius,
  isReusableComponentPattern,
  isTransparentColor,
  mergeComponentPatterns,
  normalizeComponentStyleRecord,
  summarizeComponentCandidates,
  summarizeComponentVariants,
} from '../../src/core/analyzer/component-detect.js'
import { isActionableComponentPattern } from '../../src/core/design-context/component-catalog.js'

describe('component candidate summarization', () => {
  test('keeps reusable structural controls out of actionable component contracts', () => {
    const [pattern] = summarizeComponentVariants(
      Array.from({ length: 2 }, (_value, index) => ({
        type: 'button' as const,
        confidence: 0.98,
        evidence: [`compound-button-${index}`],
        pageId: `page-${index}`,
        semanticIdentity: 'button' as const,
        visualTreatment: 'structural' as const,
        usageContext: 'general' as const,
        widthPx: 480,
        heightPx: 240,
        styles: {
          backgroundColor: '#ffffff',
          color: '#172033',
          border: '1px solid #ccd5e0',
          padding: '24px',
          height: '240px',
        },
      })),
    )

    expect(pattern.visualTreatments).toEqual(['structural'])
    expect(isReusableComponentPattern(pattern)).toBe(true)
    expect(isActionableComponentPattern(pattern, [])).toBe(false)
  })

  test('keeps an unlabelled button-like link out of actionable component contracts', () => {
    const [pattern] = summarizeComponentVariants(
      Array.from({ length: 2 }, (_value, index) => ({
        type: 'button' as const,
        confidence: 0.9,
        evidence: [`unlabelled-link-${index}`],
        pageId: 'page-one',
        semanticIdentity: 'link' as const,
        visualTreatment: 'button-like' as const,
        usageContext: 'general' as const,
        widthPx: 260,
        heightPx: 140,
        styles: {
          backgroundColor: '#ffffff',
          height: '140px',
          padding: '0 52px',
        },
      })),
    )

    expect(isReusableComponentPattern(pattern)).toBe(true)
    expect(isActionableComponentPattern(pattern, [])).toBe(false)
  })

  test('keeps reusable component styles on their rendered owner', () => {
    const styles = {
      backgroundColor: '#ffffff',
      color: '#172033',
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      height: '160px',
      minHeight: '40px',
      padding: '12px 16px',
    }

    expect(normalizeComponentStyleRecord('button', styles, 'descendant')).toEqual(styles)
    expect(normalizeComponentStyleRecord('button', styles)).toEqual({
      backgroundColor: '#ffffff',
      height: '160px',
      minHeight: '40px',
      padding: '12px 16px',
    })
    expect(normalizeComponentStyleRecord('navigation', styles, 'root')).toEqual({
      backgroundColor: '#ffffff',
      height: '160px',
      minHeight: '40px',
      padding: '12px 16px',
    })
    expect(normalizeComponentStyleRecord('list', styles, 'root')).toEqual({
      backgroundColor: '#ffffff',
      padding: '12px 16px',
    })
    expect(normalizeComponentStyleRecord('status', styles, 'root')).toEqual({
      backgroundColor: '#ffffff',
      color: '#172033',
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      padding: '12px 16px',
    })
    expect(
      normalizeComponentStyleRecord(
        'input',
        { backgroundColor: '#ffffff', color: 'rgba(0, 0, 0, 0)', fontFamily: 'Inter, sans-serif' },
        'root',
      ),
    ).toEqual({ backgroundColor: '#ffffff', fontFamily: 'Inter, sans-serif' })
  })

  test('does not split container patterns by descendant typography or content height', () => {
    const patterns = summarizeComponentVariants([
      {
        type: 'list',
        confidence: 0.9,
        evidence: ['list-one'],
        pageId: 'page-one',
        textStyleOwner: 'root',
        styles: {
          backgroundColor: '#ffffff',
          color: '#172033',
          fontFamily: 'Times',
          height: '120px',
          padding: '12px 16px',
        },
      },
      {
        type: 'list',
        confidence: 0.9,
        evidence: ['list-two'],
        pageId: 'page-two',
        textStyleOwner: 'root',
        styles: {
          backgroundColor: '#ffffff',
          color: '#2255aa',
          fontFamily: 'Inter, sans-serif',
          height: '280px',
          padding: '12px 16px',
        },
      },
    ])

    expect(patterns).toHaveLength(1)
    expect(patterns[0]).toMatchObject({ count: 2, pageCount: 2, styles: { backgroundColor: '#ffffff' } })
    expect(patterns[0].styles).toEqual({ backgroundColor: '#ffffff', padding: '12px 16px' })
  })

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
    ).toBe('action')
    expect(
      classifyComponentVariant(
        'button',
        { backgroundColor: '#2563eb', borderRadius: '24px', padding: '0px' },
        { role: 'primary-action', primaryColor: '#2563eb', widthPx: 90, heightPx: 34 },
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
    expect(
      classifyComponentVariant(
        'button',
        { backgroundColor: 'rgba(0, 0, 0, 0)', borderRadius: '0px', padding: '0px' },
        { widthPx: 39, heightPx: 39, hasVisibleText: true },
      ),
    ).toBe('text')
    expect(
      classifyComponentVariant(
        'button',
        { backgroundColor: 'rgba(0, 0, 0, 0)', borderRadius: '0px', padding: '0px' },
        { widthPx: 39, heightPx: 39, hasVisibleText: false },
      ),
    ).toBe('icon')
  })

  test('does not treat transparent or zero-geometry shadows as visible paint', () => {
    expect(hasVisibleShadow('0 0 0 2px rgba(0, 0, 0, 0)')).toBe(false)
    expect(hasVisibleShadow('rgba(0, 0, 0, 0) 0px 0px 0px 2px')).toBe(false)
    expect(hasVisibleShadow('0 0 0 0 rgb(0, 0, 0)')).toBe(false)
    expect(hasVisibleShadow('0 0 0 2px rgba(0, 0, 0, 0.2)')).toBe(true)
    expect(hasVisibleShadow('0 2px 8px hsla(0, 0%, 0%, 0%)')).toBe(false)
    expect(hasVisibleShadow('0 2px 8px hsla(0, 0%, 0%, 20%)')).toBe(true)
    expect(hasVisibleShadow('0 2px 8px color(srgb 1 0 0 / 0)')).toBe(false)
    expect(hasVisibleShadow('0 2px 8px oklch(60% 0.2 30 / 0.4)')).toBe(true)
    expect(hasVisibleShadow('0 2px 8px color(srgb 1 0 0 / none)')).toBe(false)
    expect(hasVisibleShadow('0 2px 8px oklch(60% 0.2 30 / var(--alpha))')).toBe(false)
  })

  test('requires nontransparent CSS Color 4 or hex-alpha border paint', () => {
    expect(hasVisibleBorder('1px solid color(srgb 1 0 0 / 0)')).toBe(false)
    expect(hasVisibleBorder('1px solid oklch(60% 0.2 30 / 0%)')).toBe(false)
    expect(hasVisibleBorder('1px solid #f000')).toBe(false)
    expect(hasVisibleBorder('1px solid color(srgb 1 0 0 / 0.5)')).toBe(true)
    expect(hasVisibleBorder('1px solid #f008')).toBe(true)
    expect(hasVisibleBorder('1px solid oklch(60% 0.2 30 / none)')).toBe(false)
    expect(hasVisibleBorder('1px solid color(srgb 1 0 0 / var(--alpha))')).toBe(false)
  })

  test('requires a validated nonzero alpha before treating a color as painted', () => {
    expect(isTransparentColor('color(srgb 1 0 0 / none)')).toBe(true)
    expect(isTransparentColor('oklch(60% 0.2 30 / none)')).toBe(true)
    expect(hasVisibleColor('rgb(255, 0, 0)')).toBe(true)
    expect(hasVisibleColor('oklch(60% 0.2 30 / 0.4)')).toBe(true)
    expect(hasVisibleColor('color(srgb 1 0 0 / 0)')).toBe(false)
    expect(hasVisibleColor('color(srgb 1 0 0 / none)')).toBe(false)
    expect(hasVisibleColor('color(srgb 1 0 0 / calc(1 - 1))')).toBe(false)
    expect(hasVisibleColor('unrecognized-color-expression')).toBe(false)
  })

  test('distinguishes crisp edge shadows from shadows that convey depth', () => {
    expect(hasCrispEdgeShadow('rgba(31, 35, 40, 0.15) 0 0 0 1px')).toBe(true)
    expect(hasDepthShadow('rgba(31, 35, 40, 0.15) 0 0 0 1px')).toBe(false)
    expect(hasCrispEdgeShadow('rgba(209, 217, 224, 0.7) 0 -1px 0 0 inset')).toBe(true)
    expect(hasDepthShadow('rgba(209, 217, 224, 0.7) 0 -1px 0 0 inset')).toBe(false)
    expect(hasCrispEdgeShadow('0 1px 3px rgba(0, 0, 0, 0.12)')).toBe(false)
    expect(hasDepthShadow('0 1px 3px rgba(0, 0, 0, 0.12)')).toBe(true)
    expect(hasDepthShadow('2px 2px 0 rgb(0, 0, 0)')).toBe(true)
    expect(classifyCardStyle({ borderRadius: '6px', boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.15)' })).toBe('outlined-r6')
  })

  test('classifies layout-dependent radius math without inventing a numeric radius', () => {
    const borderRadius = 'max(0px, min(4px, -999900% + 1.43586e+07px)) / 4px'

    expect(classifyCardStyle({ borderRadius, boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.15)' })).toBe('outlined-rounded')
    expect(isPillRadius({ borderRadius })).toBe(false)
    expect(classifyCardStyle({ borderRadius: '3.35544e+07px' })).toBe('flat-rounded')
    expect(isPillRadius({ borderRadius: '33554400px' })).toBe(false)
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
    expect(button).toMatchObject({ styleObservationCount: 2, pageCount: 1, reuseConfidence: 0.47 })
    expect(isReusableComponentPattern(button)).toBe(false)
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
      reuseConfidence: 0.25,
      reuseScope: 'isolated',
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
      surfaceColors: ['#ffffff', '#f8fafc'],
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
      'button-action-rounded-filled',
      'button-action-rounded-outlined-style-1',
      'button-action-rounded-outlined-style-2',
      'button-text',
      'button-icon',
    ])
    expect(variants.find((variant) => variant.name === 'button-action-rounded-outlined-style-1')).toMatchObject({
      count: 3,
      styles: { backgroundColor: 'rgba(0, 0, 0, 0)' },
    })
    expect(variants.find((variant) => variant.name === 'button-action-rounded-outlined-style-2')).toMatchObject({
      count: 1,
      styles: { backgroundColor: 'rgb(255, 255, 255)' },
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
      'button-action-pill-tinted',
      'button-action-rounded-tinted',
    ])
    expect(variants.map((variant) => variant.count)).toEqual([1, 1])
  })

  test('treats nearly transparent paint as unpainted instead of a tinted surface', () => {
    const candidates: ComponentVariantCandidate[] = [
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        primaryColor: '#1f883d',
        widthPx: 96,
        heightPx: 32,
        styles: {
          backgroundColor: 'rgba(0, 0, 0, 0.01)',
          color: '#ffffff',
          border: '1px solid #262c28',
          borderRadius: '6px',
        },
      },
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        primaryColor: '#1f883d',
        widthPx: 96,
        heightPx: 32,
        styles: {
          backgroundColor: 'rgba(0, 0, 0, 0.01)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
        },
      },
    ]

    expect(summarizeComponentVariants(candidates).map((variant) => variant.name)).toEqual([
      'button-action-rounded-flat',
      'button-action-rounded-outlined',
    ])
  })

  test('describes opaque primary controls with decorative borders as filled rather than outlined', () => {
    const candidates: ComponentVariantCandidate[] = [
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        role: 'primary-action',
        primaryColor: '#2563eb',
        tokenRefs: ['color.primary'],
        widthPx: 96,
        heightPx: 34,
        styles: {
          backgroundColor: '#2563eb',
          border: '1px solid #2563eb',
          borderRadius: '4px',
          padding: '0 16px',
        },
      },
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        role: 'primary-action',
        primaryColor: '#2563eb',
        tokenRefs: ['color.primary'],
        widthPx: 96,
        heightPx: 34,
        styles: {
          backgroundColor: '#2563eb',
          border: '1px solid rgba(0, 0, 0, 0.15)',
          borderRadius: '999px',
          padding: '0 16px',
        },
      },
    ]

    expect(summarizeComponentVariants(candidates).map((variant) => variant.name)).toEqual([
      'button-primary-pill-filled',
      'button-primary-rounded-filled',
    ])
  })

  test('classifies button surfaces from observed paint instead of semantic button type', () => {
    const candidates: ComponentVariantCandidate[] = [
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        role: 'primary-action',
        primaryColor: '#1f883d',
        surfaceColors: ['#ffffff', '#f6f8fa'],
        widthPx: 747,
        heightPx: 34,
        styles: {
          backgroundColor: '#ffffff',
          color: '#0969da',
          border: '1px solid #d1d9e0',
          borderRadius: '6px',
        },
      },
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        role: 'primary-action',
        primaryColor: '#1f883d',
        surfaceColors: ['#ffffff', '#f6f8fa'],
        widthPx: 108,
        heightPx: 34,
        styles: {
          backgroundColor: '#1f883d',
          color: '#ffffff',
          border: '1px solid rgba(31, 35, 40, 0.15)',
          borderRadius: '6px',
        },
      },
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        role: 'primary-action',
        primaryColor: '#1772f6',
        surfaceColors: ['#ffffff', '#f7f7f8'],
        widthPx: 34,
        heightPx: 34,
        styles: {
          backgroundColor: '#1772f6',
          color: '#ffffff',
          border: '1px solid #1772f6',
          borderRadius: '9999px',
        },
      },
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        primaryColor: '#1772f6',
        surfaceColors: ['#ffffff', '#f7f7f8'],
        widthPx: 34,
        heightPx: 34,
        styles: {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          color: '#1772f6',
          border: '1px solid #1772f6',
          borderRadius: '9999px',
        },
      },
    ]

    expect(summarizeComponentVariants(candidates).map((variant) => variant.name)).toEqual([
      'button-primary-rounded-filled',
      'button-primary-rounded-outlined',
      'button-icon-pill-filled',
      'button-icon-pill-outlined',
    ])
  })

  test('keeps tiny semantic controls in raw evidence but excludes them from reusable variants', () => {
    const candidates: ComponentVariantCandidate[] = [
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['aria-role'],
        elementKind: 'role-button',
        widthPx: 5,
        heightPx: 5,
        styles: { backgroundColor: '#16b89b', borderRadius: '999px' },
      },
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['native-element'],
        elementKind: 'button',
        widthPx: 32,
        heightPx: 32,
        styles: { backgroundColor: '#16b89b', borderRadius: '999px' },
      },
    ]

    expect(summarizeComponentVariants(candidates)).toMatchObject([
      { name: 'button-icon', count: 1, sampleSize: { width: 32, height: 32 } },
    ])
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

  test('separates identity confidence from repeated-style reuse evidence', () => {
    const [isolated] = summarizeComponentCandidates([
      { type: 'button', confidence: 0.98, evidence: ['native-element'], styles: { borderRadius: '8px' } },
    ])
    const [repeated] = summarizeComponentVariants([
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['button-one'],
        styles: { borderRadius: '8px' },
        pageId: 'page-one',
      },
      {
        type: 'button',
        confidence: 0.98,
        evidence: ['button-two'],
        styles: { borderRadius: '8px' },
        pageId: 'page-two',
      },
    ])

    expect(isolated).toMatchObject({ confidence: 0.98, reuseConfidence: 0.25, reuseScope: 'isolated' })
    expect(isReusableComponentPattern(isolated)).toBe(false)
    expect(repeated).toMatchObject({
      confidence: 0.98,
      reuseConfidence: 0.85,
      reuseScope: 'cross-page',
      styleObservationCount: 2,
      pageCount: 2,
    })
    expect(isReusableComponentPattern(repeated)).toBe(true)
  })

  test('keeps representative evidence and semantic roles limited to exact-style matches', () => {
    const shared = {
      type: 'button' as const,
      confidence: 0.96,
      role: 'primary-action',
      textStyleOwner: 'root' as const,
      styles: { backgroundColor: '#2563eb', borderRadius: '8px', fontWeight: '600' },
    }
    const [pattern, localPattern] = summarizeComponentVariants([
      { ...shared, evidence: ['button-one'], pageId: 'page-one' },
      { ...shared, evidence: ['button-two'], pageId: 'page-two' },
      {
        ...shared,
        role: 'action',
        evidence: ['button-different-style'],
        pageId: 'page-two',
        styles: { ...shared.styles, fontWeight: '700' },
      },
    ])

    expect(pattern).toMatchObject({ count: 2, styleObservationCount: 2, pageCount: 2 })
    expect(pattern.representativeEvidence).toEqual(['button-one', 'button-two'])
    expect(pattern.roleCounts).toEqual({ 'primary-action': 2 })
    expect(pattern.evidence).toEqual(['button-one', 'button-two'])
    expect(localPattern).toMatchObject({ count: 1, styleObservationCount: 1, reuseScope: 'isolated' })
    expect(localPattern.evidence).toEqual(['button-different-style'])
  })

  test('keeps two independently repeated exact styles as separate reusable patterns', () => {
    const candidates: ComponentVariantCandidate[] = [
      ...['first-a', 'first-b'].map((id) => ({
        type: 'button' as const,
        confidence: 0.95,
        evidence: [id],
        pageId: id.endsWith('a') ? 'page-one' : 'page-two',
        styles: { backgroundColor: '#2563eb', borderRadius: '8px', padding: '8px 16px' },
      })),
      ...['second-a', 'second-b'].map((id) => ({
        type: 'button' as const,
        confidence: 0.95,
        evidence: [id],
        pageId: id.endsWith('a') ? 'page-one' : 'page-two',
        styles: { backgroundColor: '#2563eb', borderRadius: '9999px', padding: '8px 20px' },
      })),
    ]

    const patterns = summarizeComponentVariants(candidates)

    expect(patterns).toHaveLength(2)
    expect(patterns.every(isReusableComponentPattern)).toBe(true)
    expect(patterns.map((pattern) => pattern.styleObservationCount)).toEqual([2, 2])
    expect(new Set(patterns.map((pattern) => pattern.styleSignature)).size).toBe(2)
  })
})
