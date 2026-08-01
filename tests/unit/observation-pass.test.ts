import { describe, expect, it } from 'vitest'

import type { AiImageInput } from '../../src/core/ai/provider.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import {
  type InterpretationInvoke,
  buildDesignInterpretationPrompt,
  buildSectionObservationPrompt,
  extractObservationCandidate,
  runInterpretationPipeline,
  selectEvidencePackage,
  splitImagesByPass,
  validateSectionObservations,
} from '../../src/core/design-intelligence/index.js'

const tokens: DesignToken = {
  colors: { background: '#ffffff', foreground: '#111827', primary: '#2563eb' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['16px', '32px'],
    fontWeights: ['400', '700'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['8px', '24px'],
  radii: ['12px'],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: ['0.2s ease'],
}

const evidence: DesignEvidence = {
  schemaVersion: '1',
  analysisId: 'analysis-test',
  source: {
    requestedUrl: 'https://example.com',
    finalUrl: 'https://example.com/',
    accessMode: 'anonymous',
  },
  pages: [
    {
      id: 'page-a',
      url: 'https://example.com/',
      viewport: 'desktop',
      role: 'landing',
      images: [
        { id: 'image-a', kind: 'overview', path: 'capture.png', width: 1440, height: 1600 },
        {
          id: 'image-c',
          kind: 'region-crop',
          path: 'crop.png',
          width: 720,
          height: 400,
          sourceRect: { x: 0.1, y: 0.1, width: 0.8, height: 0.4 },
        },
      ],
    },
    {
      id: 'page-b',
      url: 'https://example.com/',
      viewport: 'mobile',
      role: 'landing',
      images: [{ id: 'image-b', kind: 'overview', path: 'mobile.png', width: 375, height: 1600 }],
    },
  ],
  tokens,
  featureTags: ['responsive'],
  topology: {
    schemaVersion: '1',
    pages: [
      { pageId: 'page-a', role: 'landing', sectionIds: ['section-a'] },
      { pageId: 'page-b', role: 'landing', sectionIds: ['section-b'] },
    ],
    globalLayers: [],
    crossPagePatternIds: [],
  },
  sections: [
    {
      id: 'section-a',
      pageId: 'page-a',
      order: 0,
      role: 'hero',
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.4 },
      layoutMode: 'flow',
      tokenRefs: ['color.background'],
      componentRefs: ['component-a'],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: ['image-a'],
    },
    {
      id: 'section-b',
      pageId: 'page-b',
      order: 1,
      role: 'content',
      rect: { x: 0.05, y: 0.1, width: 0.9, height: 0.5 },
      layoutMode: 'flow',
      tokenRefs: ['color.background'],
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: ['image-b'],
    },
  ],
  components: [
    {
      id: 'component-a',
      pageId: 'page-a',
      sectionId: 'section-a',
      type: 'button',
      rect: { x: 0.2, y: 0.3, width: 0.2, height: 0.05 },
      styles: {},
      tokenRefs: ['color.primary'],
      stateRefs: [],
      confidence: 0.9,
      evidenceRefs: ['section-a', 'image-a'],
    },
  ],
  layoutNodes: [],
  interactionStyles: { hover: [], focus: [], active: [] },
  interactionObservations: [],
  breakpoints: [],
  responsiveObservations: [
    {
      id: 'responsive-a',
      sectionId: 'section-a',
      fromViewport: 'desktop',
      toViewport: 'mobile',
      changeType: 'reflow',
      changedProperties: ['width'],
      summary: 'Hero narrows at mobile width.',
      evidenceRefs: ['section-a', 'section-b'],
    },
  ],
  motion: [],
  mediaLayers: [],
  coverage: {
    pageCoverage: 'complete',
    sectionCoverage: 1,
    viewportCoverage: ['desktop', 'mobile'],
    interactionCoverage: { candidates: 0, safelyObserved: 0, skipped: 0 },
    mediaCoverage: { majorRegions: 0, classifiedRegions: 0 },
    accessRestrictions: [],
    limitations: [],
  },
  limitations: [],
}

function claim(statement = 'The layout uses a centered hero with deliberate breathing room') {
  return {
    statement,
    implementation: 'Use a centered container and keep wide outer gutters across primary sections.',
    confidence: 'high',
    evidence: [
      { evidenceId: 'section-a', note: 'Desktop hero bounds' },
      { evidenceId: 'section-b', note: 'Mobile hero bounds' },
    ],
  }
}

function rawProfile(mode: 'structural-only' | 'multimodal' = 'structural-only') {
  return {
    schemaVersion: '1',
    language: 'en',
    inputMode: mode,
    thesis: claim(),
    signatureMoves: [
      {
        ...claim('Large focused openings establish hierarchy before supporting detail'),
        id: 'move-focused-opening',
        name: 'Focused opening',
        distinctiveness: 'The spacious opening and compact action cluster recur together.',
      },
    ],
    composition: {
      containerStrategy: claim(),
      alignmentStrategy: claim(),
      densityAndWhitespace: claim(),
      rhythm: claim(),
    },
    attention: {
      entryPoint: claim(),
      visualSequence: [claim()],
      actionHierarchy: claim(),
      contrastStrategy: claim(),
    },
    visualLanguage: {
      color: claim(),
      typography: claim(),
      shape: claim(),
      surfaces: claim(),
    },
    sectionGrammar: [
      {
        role: 'hero',
        composition: [claim()],
        contentRhythm: [claim()],
        transitionToNext: [claim()],
      },
    ],
    interactionLanguage: {
      primaryDrivers: [claim()],
      feedbackStyle: claim(),
      stateChangeAmplitude: claim(),
      continuityRules: [
        {
          ...claim(),
          evidence: [{ evidenceId: 'responsive-a', note: 'Observed desktop-to-mobile reflow' }],
          confidence: 'medium',
        },
      ],
    },
    componentGrammar: [{ component: 'button', role: 'primary action', rules: [claim()] }],
    transferRules: {
      preserve: [claim()],
      adapt: [claim()],
      avoid: [claim()],
    },
    uncertainties: [],
  }
}

function observationEntry(sectionId: string, evidenceIds: string[] = ['section-a']) {
  return {
    sectionId,
    structure: 'A narrow centered column holds the heading above a single primary action.',
    visualRelations: 'The heading dominates through size while the action sits directly below it.',
    states: '',
    limitations: '',
    evidenceIds,
  }
}

describe('Section observation pass', () => {
  it('validates observations with entry-level partial acceptance', () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const candidate = {
      observations: [
        observationEntry('section-a'),
        observationEntry('section-b', ['section-b']),
        observationEntry('section-forged'),
        observationEntry('section-a'),
        { ...observationEntry('section-b'), evidenceIds: ['image-forged'] },
        { ...observationEntry('section-b'), structure: 'see https://evil.example' },
      ],
    }
    const result = validateSectionObservations(candidate, evidencePackage)
    expect(result.observations.map((observation) => observation.sectionId)).toEqual(['section-a', 'section-b'])
    expect(result.rejected.length).toBeGreaterThanOrEqual(4)
  })

  it('extracts observation payloads from noisy CLI output', () => {
    const text = `log line\n${JSON.stringify({ observations: [observationEntry('section-a')] })}\ntrailing`
    const candidate = extractObservationCandidate(text)
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    expect(validateSectionObservations(candidate, evidencePackage).observations).toHaveLength(1)
  })

  it('lists every selected section in the observation prompt', () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const prompt = buildSectionObservationPrompt(evidencePackage, 'en')
    expect(prompt).toContain('section-a')
    expect(prompt).toContain('section-b')
    expect(prompt).toContain('"observations"')
  })

  it('runs the observation pass before synthesis and feeds notes into the synthesis prompt', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const calls: string[] = []
    const invoke: InterpretationInvoke = async (prompt) => {
      calls.push(prompt)
      if (prompt.includes('section observer')) {
        return {
          text: JSON.stringify({
            observations: [observationEntry('section-a'), observationEntry('section-b', ['image-b'])],
          }),
        }
      }
      return { text: JSON.stringify(rawProfile()) }
    }
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke,
    })
    expect(result.pipeline).toBe('two-pass')
    expect(result.profile.thesis.statement).toContain('centered hero')
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('section observer')
    expect(calls[1]).toContain('SECTION_OBSERVATIONS')
    expect(calls[1]).toContain('section-a')
  })

  it('degrades to single-pass when observation output is invalid', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const observationPrompts: string[] = []
    const invoke: InterpretationInvoke = async (prompt) => {
      if (prompt.includes('section observer')) {
        observationPrompts.push(prompt)
        return { text: 'not json at all' }
      }
      return { text: JSON.stringify(rawProfile()) }
    }
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke,
    })
    expect(result.pipeline).toBe('single-pass')
    expect(observationPrompts).toHaveLength(1)
  })

  it('degrades to single-pass synthesis when the observation pass fails', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const calls: string[] = []
    const invoke: InterpretationInvoke = async (prompt) => {
      calls.push(prompt)
      if (prompt.includes('section observer')) throw new Error('provider down')
      return { text: JSON.stringify(rawProfile()) }
    }
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke,
    })
    expect(result.pipeline).toBe('single-pass')
    expect(result.profile.thesis).toBeDefined()
    const synthesisPrompt = calls.find((prompt) => prompt.includes('design-language interpreter'))
    expect(synthesisPrompt).toBeDefined()
    expect(synthesisPrompt).not.toContain('SECTION_OBSERVATIONS')
  })

  it('routes region crops to the observation pass and overviews to synthesis', () => {
    const images: AiImageInput[] = [
      { name: 'image-a.png', mimeType: 'image/png', base64: 'AAA' },
      { name: 'image-b.png', mimeType: 'image/png', base64: 'BBB' },
      { name: 'image-c.png', mimeType: 'image/png', base64: 'CCC' },
    ]
    const split = splitImagesByPass(evidence, images)
    expect(split.observationImages.map((image) => image.name)).toEqual(['image-c.png'])
    expect(split.synthesisImages.map((image) => image.name)).toEqual(['image-a.png', 'image-b.png'])
  })

  it('keeps the synthesis prompt free of observation blocks when no notes exist', () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const prompt = buildDesignInterpretationPrompt(evidencePackage, 'en')
    expect(prompt).not.toContain('SECTION_OBSERVATIONS')
    const withNotes = buildDesignInterpretationPrompt(evidencePackage, 'en', [observationEntry('section-a')])
    expect(withNotes).toContain('SECTION_OBSERVATIONS')
  })
})
