import { describe, expect, test } from 'vitest'

import {
  isContextDependentRadius,
  parseSectionGradient,
  safeSectionObservedStyles,
  scalarRadiusFromCorners,
  structuralBorderRadius,
} from '../../src/core/design-evidence/structural-styles.js'

describe('structural styles', () => {
  test('allows only equivalent simple length corners into the scalar radius scale', () => {
    expect(scalarRadiusFromCorners(['24px', '24px', '24px', '24px'])).toBe('24px')
    expect(scalarRadiusFromCorners(['0px', '0px', '48px', '48px'])).toBeNull()
    expect(scalarRadiusFromCorners(['50%', '50%', '50%', '50%'])).toBeNull()
    expect(scalarRadiusFromCorners(['12px 24px', '12px 24px', '12px 24px', '12px 24px'])).toBeNull()
    expect(scalarRadiusFromCorners(['12px / 24px', '12px / 24px', '12px / 24px', '12px / 24px'])).toBeNull()
  })

  test('preserves all four corners for structural evidence', () => {
    expect(structuralBorderRadius(['0px', '0px', '48px', '48px'])).toBe('0px 0px 48px 48px')
    expect(structuralBorderRadius(['48px', '48px', '0px', '0px'])).toBe('48px 48px 0px 0px')
  })

  test('does not promote layout-dependent CSS math into portable structural radii', () => {
    const contextual = 'max(0px, min(4px, -999900% + 1.43586e+07px)) 4px'

    expect(structuralBorderRadius([contextual, contextual, contextual, contextual])).toBeNull()
    expect(
      safeSectionObservedStyles({
        borderTopLeftRadius: contextual,
        borderTopRightRadius: contextual,
        borderBottomRightRadius: contextual,
        borderBottomLeftRadius: contextual,
      }),
    ).toBeUndefined()
  })

  test('treats browser-clamped extreme radii as context-dependent without rejecting ordinary pill radii', () => {
    expect(isContextDependentRadius('3.35544e+07px')).toBe(true)
    expect(isContextDependentRadius('33554400px')).toBe(true)
    expect(isContextDependentRadius('9999px')).toBe(false)
    expect(isContextDependentRadius('24px')).toBe(false)
    expect(scalarRadiusFromCorners(['33554400px', '33554400px', '33554400px', '33554400px'])).toBeNull()
  })

  test('keeps uniform length radii in the scalar scale instead of duplicating them as structure', () => {
    expect(
      safeSectionObservedStyles({
        borderTopLeftRadius: '16px',
        borderTopRightRadius: '16px',
        borderBottomRightRadius: '16px',
        borderBottomLeftRadius: '16px',
      }),
    ).toBeUndefined()
    expect(
      safeSectionObservedStyles({
        borderTopLeftRadius: '0px',
        borderTopRightRadius: '0px',
        borderBottomRightRadius: '48px',
        borderBottomLeftRadius: '48px',
      })?.borderRadius,
    ).toBe('0px 0px 48px 48px')
  })

  test('parses safe gradient type, direction, and color stops', () => {
    expect(parseSectionGradient('linear-gradient(160deg, rgb(255, 237, 213), rgb(254, 215, 170))')).toEqual({
      type: 'linear-gradient',
      direction: '160deg',
      stops: ['rgb(255, 237, 213)', 'rgb(254, 215, 170)'],
      value: 'linear-gradient(160deg, rgb(255, 237, 213), rgb(254, 215, 170))',
    })
  })

  test.each([
    'url(https://example.com/private.png)',
    'linear-gradient(#fff, #000), url(data:image/png;base64,abc)',
    `linear-gradient(#fff, ${'#000 '.repeat(200)})`,
  ])('rejects unsafe or unbounded background image %s', (value) => {
    expect(parseSectionGradient(value)).toBeNull()
  })
})
