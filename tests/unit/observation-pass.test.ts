import { describe, expect, it } from 'vitest'

import type { AiImageInput } from '../../src/core/ai/provider.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import {
  type InterpretationInvoke,
  buildAnalysisDigest,
  buildDesignInterpretationPrompt,
  buildSectionObservationPrompt,
  extractObservationCandidate,
  prepareAnalysisDigestPackageForPrompt,
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

function compactProfile() {
  const claims = Array.from({ length: 25 }, (_, index) => ({
    id: `q${index + 1}`,
    s: `Observed design rule ${index + 1} uses a specific hierarchy and measured grouping`,
    i: `Use the observed grouping strategy ${index + 1} while adapting content for the new page.`,
    c: 'medium',
    e: ['s1'],
    t: [],
  }))
  claims[20].e = ['c1']
  return {
    claims,
    thesis: 'q1',
    signatureMoves: [{ q: 'q25', n: 'Measured grouping', d: 'Hierarchy and grouping recur as one move.' }],
    composition: { container: 'q2', alignment: 'q3', density: 'q4', rhythm: 'q5' },
    attention: { entry: 'q6', sequence: ['q7'], action: 'q8', contrast: 'q9' },
    visual: { color: 'q10', typography: 'q11', shape: 'q12', surfaces: 'q13' },
    sections: [{ role: 'hero', composition: ['q14'], rhythm: ['q15'], transition: ['q16'] }],
    interaction: { drivers: ['q17'], feedback: 'q18', amplitude: 'q19', continuity: ['q20'] },
    components: [{ component: 'button', role: 'primary action', rules: ['q21'] }],
    transfer: { preserve: ['q22'], adapt: ['q23'], avoid: ['q24'] },
    uncertainties: [],
    aliases: [],
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

  it('runs exactly one compact synthesis call', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const calls: string[] = []
    const invoke: InterpretationInvoke = async (prompt) => {
      calls.push(prompt)
      return { text: JSON.stringify(rawProfile()) }
    }
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke,
    })
    expect(result.pipeline).toBe('single-pass')
    expect(result.profile.thesis.statement).toContain('centered hero')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('UNTRUSTED_ANALYSIS_DIGEST')
    expect(calls[0]).not.toContain('SECTION_OBSERVATIONS')
    expect(result.callDetails.map((detail) => detail.pass)).toEqual(['synthesis'])
    expect(result.repaired).toContain('componentGrammar.button')
    expect(result.rejected || []).not.toEqual(expect.arrayContaining([expect.stringContaining('coverage-repair')]))
  })

  it('reports deterministic correction diagnostics as repaired instead of rejected', async () => {
    const interactionEvidence = structuredClone(evidence)
    interactionEvidence.interactionObservations = [
      {
        id: 'interaction-background',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'component-a',
        driver: 'hover',
        safety: 'passive',
        trigger: { kind: 'css-pseudo-class:hover' },
        before: {},
        after: { 'background-color': '#111827' },
        changedProperties: ['background-color'],
        evidenceRefs: ['component-a', 'section-a'],
      },
      {
        id: 'interaction-outline',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'component-a',
        driver: 'hover',
        safety: 'passive',
        trigger: { kind: 'css-pseudo-class:hover' },
        before: {},
        after: { 'outline-color': '#2563eb' },
        changedProperties: ['outline-color'],
        evidenceRefs: ['component-a', 'section-a'],
      },
    ]
    interactionEvidence.sections[0].interactionRefs = ['interaction-background', 'interaction-outline']
    const candidate = rawProfile()
    candidate.interactionLanguage.primaryDrivers = [
      {
        ...claim('Hover changes the outline of the control.'),
        implementation: 'Apply the observed outline change on hover.',
        evidence: [{ evidenceId: 'interaction-background', note: 'Wrong hover evidence' }],
      },
    ]
    candidate.transferRules.avoid = [
      {
        ...claim('Avoid changing the control after clicking it.'),
        evidence: [{ evidenceId: 'interaction-background', note: 'Passive declaration only' }],
      },
    ]
    candidate.uncertainties = [
      {
        topic: 'Referenced tokens are undefined',
        reason: 'Some referenced tokens are not present in the token facts.',
        neededEvidence: 'Complete token definitions',
      },
    ]
    const evidencePackage = selectEvidencePackage(interactionEvidence, 'structural-only')

    const result = await runInterpretationPipeline(interactionEvidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({ text: JSON.stringify(candidate) }),
    })

    const reason = 'interactionLanguage.primaryDrivers.0:interaction-evidence-scope-repaired(outline)'
    expect(result.repaired).toContain(reason)
    expect(result.rejected || []).not.toContain(reason)
    expect(result.repaired).toContain('transferRules.avoid.0:passive-interaction-transfer-rule-sanitized')
    expect(result.repaired).toContain('transferRules.avoid')
    expect(result.repaired).toContain('uncertainties.0:contradicts-validated-token-refs')
    expect(result.rejected || []).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('passive-interaction-transfer-rule-sanitized'),
        expect.stringContaining('contradicts-validated-token-refs'),
      ]),
    )
    expect(result.profile.transferRules.avoid[0].statement).toBe(
      'Unexecuted interaction states and untokenized raw DOM values are not design rules.',
    )
    expect(result.profile.uncertainties).toEqual([])
  })

  it('expands the compact claim pool into the existing DesignProfile schema', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({ text: JSON.stringify(compactProfile()) }),
    })

    expect(result.profile.thesis.statement).toContain('design rule 1')
    expect(result.profile.thesis.evidence[0].evidenceId).toBe('section-a')
    expect(result.profile.componentGrammar[0].component).toBe('button')
    expect(result.pipeline).toBe('single-pass')
  })

  it('reports and drops compact aliases without observed role support', async () => {
    const aliasEvidence = structuredClone(evidence)
    aliasEvidence.tokens.colors['palette-1'] = '#576b95'
    aliasEvidence.tokens.evidence = {
      'colors.palette-1': {
        value: '#576b95',
        confidence: 'high',
        observationCount: 3,
        pageCount: 1,
        captureCount: 1,
        pages: ['https://example.com/'],
        sources: ['computed:color'],
        reasons: ['observed without a supported role'],
      },
    }
    aliasEvidence.sections[0].tokenRefs.push('color.palette-1')
    const evidencePackage = selectEvidencePackage(aliasEvidence, 'structural-only')
    const digestPackage = prepareAnalysisDigestPackageForPrompt(buildAnalysisDigest(aliasEvidence, evidencePackage))
    const paletteToken = digestPackage.tokenShortIdMap.get('color.palette-1')
    expect(paletteToken).toBeDefined()
    const candidate = compactProfile()
    candidate.aliases = [{ token: paletteToken!, name: 'ash-gray' }]

    const result = await runInterpretationPipeline(aliasEvidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({ text: JSON.stringify(candidate) }),
    })

    expect(result.profile.tokenAliases).toEqual([])
    expect(result.repaired).toEqual(expect.arrayContaining([expect.stringContaining('role-mismatch-sanitized')]))
  })

  it('does not run an automatic observation or repair call', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    let calls = 0
    const invoke: InterpretationInvoke = async (prompt) => {
      calls += 1
      expect(prompt).not.toContain('section observer')
      expect(prompt).not.toContain('repairing the citation fields')
      return { text: JSON.stringify(rawProfile()) }
    }
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only' as const,
      language: 'en' as const,
      invoke,
    })
    expect(result.pipeline).toBe('single-pass')
    expect(calls).toBe(1)
  })

  it('records compact prompt and timing budgets', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const invoke: InterpretationInvoke = async () => ({
      text: JSON.stringify(rawProfile()),
      durationMs: 25,
      usage: { input: 1200, output: 800 },
    })
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke,
    })
    expect(result.promptChars).toBeLessThanOrEqual(28_000)
    expect(result.digestChars).toBeGreaterThan(0)
    expect(result.timing).toMatchObject({ aiInvokeMs: 25, aiInputTokens: 1200, aiOutputTokens: 800, imageCount: 0 })
  })

  it('fills an invalid required claim without discarding valid AI conclusions', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const invalid = rawProfile()
    invalid.visualLanguage.color.evidence = []
    let calls = 0
    const invoke: InterpretationInvoke = async () => {
      calls += 1
      return { text: JSON.stringify(invalid) }
    }

    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke,
    })
    expect(result.status).toBe('partial')
    expect(result.evidenceFallback).toBeUndefined()
    expect(result.profile.signatureMoves[0].id).toBe('move-focused-opening')
    expect(result.profile.visualLanguage.color.confidence).toBe('low')
    expect(result.rejected).toContain('visualLanguage.color:missing-evidence')
    expect(calls).toBe(1)
  })

  it('preserves multimodal mode when a required claim uses deterministic evidence', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'multimodal')
    const invalid = rawProfile('multimodal')
    invalid.visualLanguage.color.evidence = []

    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'multimodal',
      language: 'en',
      invoke: async () => ({ text: JSON.stringify(invalid) }),
    })

    expect(result.evidenceFallback).toBeUndefined()
    expect(result.status).toBe('partial')
    expect(result.profile.inputMode).toBe('multimodal')
  })

  it('keeps selected region crops in the single synthesis call', () => {
    const images: AiImageInput[] = [
      { name: 'image-a.png', mimeType: 'image/png', base64: 'AAA' },
      { name: 'image-b.png', mimeType: 'image/png', base64: 'BBB' },
      { name: 'image-c.png', mimeType: 'image/png', base64: 'CCC' },
    ]
    const split = splitImagesByPass(evidence, images)
    expect(split.observationImages.map((image) => image.name)).toEqual(['image-c.png'])
    expect(split.synthesisImages.map((image) => image.name)).toEqual(['image-a.png', 'image-b.png', 'image-c.png'])
  })

  it('labels attached synthesis images with the digest short IDs', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'multimodal')
    let receivedPrompt = ''
    let receivedImages: AiImageInput[] = []
    await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'multimodal',
      language: 'en',
      synthesisImages: [{ name: 'image-a.png', mimeType: 'image/png', base64: 'AAA' }],
      invoke: async (prompt, images) => {
        receivedPrompt = prompt
        receivedImages = images
        return { text: JSON.stringify(rawProfile('multimodal')) }
      },
    })

    expect(receivedImages.map((image) => image.name)).toEqual(['i1.png'])
    expect(receivedPrompt).toContain('Attached images, in order: i1')
  })

  it('keeps the synthesis prompt free of observation blocks when no notes exist', () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const prompt = buildDesignInterpretationPrompt(evidencePackage, 'en')
    expect(prompt).not.toContain('SECTION_OBSERVATIONS')
    const withNotes = buildDesignInterpretationPrompt(evidencePackage, 'en', [observationEntry('section-a')])
    expect(withNotes).toContain('SECTION_OBSERVATIONS')
    expect(prompt).toContain('Never put a token ref in evidenceId')
    expect(prompt).toContain('Allowed evidence IDs')
    expect(prompt).toContain('Allowed token refs')
  })
})
