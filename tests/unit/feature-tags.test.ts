import { describe, expect, test } from 'vitest'

import { buildEvidenceBackedClaims, generateFeatureTags } from '../../src/core/analyzer/feature-tags.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

function tokens(overrides: Partial<DesignToken> = {}): DesignToken {
  return {
    colors: { background: '#ffffff', foreground: '#111111', primary: '#1772f6' },
    typography: {
      fontFamilies: ['Inter'],
      fontStacks: ['Inter, sans-serif'],
      fontSizes: ['16px'],
      fontWeights: ['400'],
      lineHeights: ['1.5'],
      letterSpacings: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
    ...overrides,
  }
}

describe('design feature tags', () => {
  const evidence = (overrides: Partial<DesignEvidence> = {}) =>
    ({
      pages: [
        {
          id: 'page-desktop',
          url: 'https://example.com/',
          viewport: 'desktop',
          viewportWidth: 1440,
          viewportHeight: 900,
          images: [],
        },
      ],
      sections: [],
      ...overrides,
    }) as DesignEvidence
  test('reports observed dominant spacing values instead of inventing a base grid', () => {
    const designTokens = tokens({ spacing: ['1.5px', '4px', '6px', '8px', '12px', '16px', '24px', '32px'] })
    const styles = createExtractedStyles({
      usageCount: {
        'spacing:1.5px': 104,
        'spacing:4px': 731,
        'spacing:6px': 122,
        'spacing:8px': 1_451,
        'spacing:12px': 210,
        'spacing:16px': 1_962,
        'spacing:24px': 167,
        'spacing:32px': 202,
      },
    })

    const tags = generateFeatureTags(designTokens, styles)
    expect(tags).toContain('spacing rhythm led by 4px, 8px, 16px')
    expect(tags.join(' ')).not.toContain('base grid spacing')
  })

  test('does not claim a base grid for irregular spacing', () => {
    const designTokens = tokens({ spacing: ['3px', '5px', '8px', '11px', '14px'] })

    expect(generateFeatureTags(designTokens, createExtractedStyles()).join(' ')).not.toContain('base grid spacing')
  })

  test('does not label a proportional site as monospace because it also uses a code font', () => {
    const mixed = tokens({
      typography: {
        ...tokens().typography,
        fontFamilies: ['Mona Sans', 'Mona Sans Mono'],
        fontStacks: ['Mona Sans, sans-serif', 'Mona Sans Mono, monospace'],
      },
    })
    const monospace = tokens({
      typography: {
        ...tokens().typography,
        fontFamilies: ['Cascadia Code', 'Inter'],
        fontStacks: ['Cascadia Code, monospace', 'Inter, sans-serif'],
      },
    })

    expect(generateFeatureTags(mixed, createExtractedStyles())).not.toContain('monospace typography')
    expect(generateFeatureTags(monospace, createExtractedStyles())).toContain('monospace typography')
  })

  test('derives primary font style only from parsed generic CSS fallbacks', () => {
    const tagsFor = (fontFamily: string, fontStack: string) =>
      generateFeatureTags(
        tokens({
          typography: {
            ...tokens().typography,
            fontFamilies: [fontFamily],
            fontStacks: [fontStack],
          },
        }),
        createExtractedStyles(),
      )

    expect(tagsFor('serif', '"serif", sans-serif')).not.toContain('serif editorial style')
    expect(tagsFor('Monotype Grotesk', 'Monotype Grotesk, sans-serif')).not.toContain('monospace typography')
    expect(tagsFor('Code Pro', 'Code Pro, sans-serif')).not.toContain('monospace typography')
    expect(tagsFor('Georgia', 'Georgia, serif')).toContain('serif editorial style')
    expect(tagsFor('Terminal', 'Terminal, m\\6f nospace')).toContain('monospace typography')
  })

  test('uses the observed radius distribution instead of pill and avatar sentinels', () => {
    const designTokens = tokens({ radii: ['2px', '3px', '4px', '100%', '9999px'] })
    const styles = createExtractedStyles({
      usageCount: {
        'radius:2px': 54,
        'radius:3px': 66,
        'radius:4px': 45,
        'radius:100%': 4,
        'radius:9999px': 16,
      },
    })

    const tags = generateFeatureTags(designTokens, styles)
    expect(tags).toContain('compact-radius surfaces observed')
    expect(tags).not.toContain('large-radius rounded style')
  })

  test('defers palette intent claims until Evidence exists', () => {
    // Zhihu-like: gray canvas, white surface, one blue accent, plus status and incidental colors.
    const designTokens = tokens({
      colors: {
        background: '#f4f6f9',
        surface: '#ffffff',
        foreground: '#191b1f',
        'muted-foreground': '#373a40',
        primary: '#1772f6',
        accent: '#09408e',
        border: '#e5e7eb',
        'border-subtle': '#eef0f2',
        'palette-1': '#f6d365',
        'palette-2': '#22c55e',
        'palette-3': '#ef4444',
        'palette-4': '#f97316',
      },
    })
    const styles = createExtractedStyles({
      usageCount: {
        // The blue accent family carries real UI usage.
        'primaryActionColor:rgb(23, 114, 246)': 40,
        'linkColor:rgb(23, 114, 246)': 25,
        'selectedColor:rgb(9, 64, 142)': 12,
        // Yellow badge is barely used; green/red are status-dominant.
        'bgColor:rgb(246, 211, 101)': 2,
        'statusColor:rgb(34, 197, 94)': 30,
        'statusColor:rgb(239, 68, 68)': 28,
        'actionColor:rgb(239, 68, 68)': 2,
        // Orange avatar/badge chrome with no stable role evidence.
        'declaredColor:rgb(249, 115, 22)': 1,
      },
    })

    const tags = generateFeatureTags(designTokens, styles)
    expect(tags).not.toContain('neutral palette with a single accent')
    expect(tags).not.toContain('rich color system')
  })

  test('keeps rich color system for genuinely multi-hue product palettes', () => {
    const designTokens = tokens({
      colors: {
        background: '#ffffff',
        foreground: '#111111',
        primary: '#4f46e5',
        accent: '#0ea5e9',
        'palette-1': '#22c55e',
        'palette-2': '#f97316',
        'palette-3': '#e11d48',
      },
    })
    const styles = createExtractedStyles({
      usageCount: {
        'primaryActionColor:rgb(79, 70, 229)': 30,
        'brandTokenColor:rgb(14, 165, 233)': 24,
        'bgColor:rgb(34, 197, 94)': 18,
        'actionColor:rgb(249, 115, 22)': 16,
        'bgColor:rgb(225, 29, 72)': 14,
      },
    })

    expect(generateFeatureTags(designTokens, styles)).not.toContain('rich color system')
  })

  test('builds a grounded single-accent claim and excludes status colors', () => {
    const designTokens = tokens({
      colorRoles: {
        primaryAction: {
          observedBackground: '#1772f6',
          observedForeground: '#ffffff',
          contrastRatio: 4.6,
          provenance: [
            {
              captureId: 'https://example.com|1440x900',
              elementRef: 'body > main > button:nth-of-type(1)',
              elementKind: 'button',
              role: 'action',
            },
          ],
        },
      },
    })
    const styles = createExtractedStyles({
      usageCount: {
        'actionBackgroundColor:#1772f6': 4,
        'bgColor:#ffffff': 40,
        'textColor:#111111': 50,
        'statusForegroundColor:#067647': 8,
        'statusForegroundColor:#b42318': 6,
      },
    })
    const claims = buildEvidenceBackedClaims(designTokens, styles, evidence())
    const claim = claims.find((candidate) => candidate.label === 'neutral palette with a single accent')

    expect(claim).toMatchObject({ confidence: 'medium', provenance: expect.any(Array) })
    expect(claim?.reasons.join(' ')).not.toContain('#067647')
    expect(claim?.evidenceRefs).toEqual(['page-desktop'])
    expect(claim?.provenance).toContainEqual(
      expect.objectContaining({
        source: 'color-role-observation',
        ref: expect.stringMatching(/^color-role:page-desktop\|/),
      }),
    )
  })

  test('describes one action family with multicolor decoration when section evidence supports it', () => {
    const designTokens = tokens({
      colors: { background: '#fff7ed', foreground: '#431407', primary: '#ea580c' },
      colorRoles: {
        primaryAction: {
          observedBackground: '#ea580c',
          observedForeground: '#ffffff',
          contrastRatio: 3.56,
          provenance: [
            {
              captureId: 'https://example.com|1440x900',
              elementRef: 'body > main > a:nth-of-type(1)',
              elementKind: 'anchor',
              role: 'action',
            },
          ],
        },
      },
    })
    const styles = createExtractedStyles({
      usageCount: {
        'actionBackgroundColor:#ea580c': 2,
        'bgColor:#e879f9': 1,
        'bgColor:#a3e635': 1,
        'bgColor:#fb923c': 1,
        'bgArea:#e879f9': 0.004,
        'bgArea:#a3e635': 0.004,
      },
    })
    const claims = buildEvidenceBackedClaims(
      designTokens,
      styles,
      evidence({
        sections: [
          {
            id: 'section-hero',
            observedStyles: {
              gradient: {
                type: 'linear-gradient',
                direction: '160deg',
                stops: ['#ffedd5', '#fed7aa'],
                value: 'linear-gradient(160deg, #ffedd5, #fed7aa)',
              },
            },
          } as DesignEvidence['sections'][number],
        ],
      }),
    )

    expect(claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'single dominant action family with multicolor decorative accents',
          confidence: 'medium',
          evidenceRefs: expect.arrayContaining(['section-hero']),
          provenance: expect.arrayContaining([expect.objectContaining({ source: 'section-observation' })]),
        }),
      ]),
    )
  })

  test('does not aggregate several small one-off hue families across the area threshold', () => {
    const designTokens = tokens({
      colorRoles: {
        primaryAction: {
          observedBackground: '#ea580c',
          observedForeground: '#ffffff',
          contrastRatio: 3.56,
          provenance: [
            {
              captureId: 'https://example.com|1440x900',
              elementRef: 'body > main > button',
              elementKind: 'button',
              role: 'action',
            },
          ],
        },
      },
    })
    const styles = createExtractedStyles({
      usageCount: {
        'actionBackgroundColor:#ea580c': 3,
        'bgColor:#e879f9': 1,
        'bgColor:#a3e635': 1,
        'bgColor:#38bdf8': 1,
        'bgArea:#e879f9': 0.002,
        'bgArea:#a3e635': 0.002,
        'bgArea:#38bdf8': 0.002,
      },
    })
    const sectionEvidence = evidence({
      sections: [
        {
          id: 'section-hero',
          observedStyles: {
            gradient: {
              type: 'linear-gradient',
              stops: ['#fff7ed', '#ffedd5'],
              value: 'linear-gradient(#fff7ed, #ffedd5)',
            },
          },
        } as DesignEvidence['sections'][number],
      ],
    })

    expect(buildEvidenceBackedClaims(designTokens, styles, sectionEvidence)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'single dominant action family with multicolor decorative accents' }),
      ]),
    )
  })

  test('creates a structural claim only from observed section treatments', () => {
    const claims = buildEvidenceBackedClaims(
      tokens(),
      createExtractedStyles(),
      evidence({
        sections: [
          { id: 'hero', observedStyles: { borderRadius: '0px 0px 48px 48px' } },
          { id: 'quiz', observedStyles: { borderRadius: '48px 48px 0px 0px' } },
        ] as DesignEvidence['sections'],
      }),
    )

    expect(claims).toContainEqual(
      expect.objectContaining({
        label: 'section-level compound-radius treatments observed',
        confidence: 'high',
        evidenceRefs: ['hero', 'quiz'],
      }),
    )
  })

  test('requires materially different shadow elevations before calling the system layered', () => {
    const subtle = tokens({
      shadows: [
        'rgba(0, 0, 0, 0.1) 0px 1px 3px 0px',
        'oklch(0 0 0 / 0.1) 0px 1px 3px 0px',
        'rgba(26, 26, 26, 0.1) 0px 1px 3px 0px',
      ],
    })
    expect(generateFeatureTags(subtle, createExtractedStyles())).not.toContain('layered elevation system')

    const layered = tokens({
      shadows: ['0 1px 2px rgba(0, 0, 0, 0.08)', '0 4px 12px rgba(0, 0, 0, 0.12)', '0 12px 32px rgba(0, 0, 0, 0.18)'],
    })
    expect(generateFeatureTags(layered, createExtractedStyles())).toContain('layered elevation system')
  })

  test('keeps local rendered elevation hierarchy distinct from a portable shadow system', () => {
    const styles = createExtractedStyles({
      shadows: [
        '0 1px 2px rgba(0, 0, 0, 0.08)',
        '0 4px 12px rgba(0, 0, 0, 0.12)',
        '0 16px 40px rgba(37, 99, 235, 0.22)',
      ],
    })
    const tags = generateFeatureTags(tokens(), styles)

    expect(tags).toContain('observed layered elevation')
    expect(tags).not.toContain('layered elevation system')
    expect(tags).not.toContain('no stable shadow scale observed')
  })

  test('does not infer flat-design intent when no stable shadow scale was observed', () => {
    const tags = generateFeatureTags(tokens(), createExtractedStyles())

    expect(tags).toContain('no stable shadow scale observed')
    expect(tags).not.toContain('flat design (no shadows)')
  })
})
