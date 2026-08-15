import { describe, expect, it } from 'vitest'

import type { AiImageInput } from '../../src/core/ai/provider.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import {
  type InterpretationInvoke,
  buildDesignInterpretationPrompt,
  buildDeterministicClaimCatalog,
  buildSectionObservationPrompt,
  canonicalCatalogPageIds,
  extractObservationCandidate,
  materializeDesignProfile,
  runInterpretationPipeline,
  selectEvidencePackage,
  splitImagesByPass,
  validateDesignClaimCatalog,
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

function claimSelection(source: DesignEvidence = evidence, mode: 'structural-only' | 'multimodal' = 'structural-only') {
  const catalog = buildDeterministicClaimCatalog(source, 'en', mode)
  return {
    schemaVersion: '1',
    selectedClaimIds: catalog.claims.slice(0, 4).map((claim) => claim.id),
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

  it('runs exactly one finite-catalog curation call', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const calls: string[] = []
    const invoke: InterpretationInvoke = async (prompt) => {
      calls.push(prompt)
      return { text: JSON.stringify(claimSelection()) }
    }
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke,
    })
    expect(result.pipeline).toBe('single-pass')
    expect(result.profile.claimSource).toBe('deterministic-catalog')
    expect(result.profile.thesis.source).toBe('deterministic-catalog')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('DETERMINISTIC_CLAIM_CATALOG')
    expect(calls[0]).toContain('cannot create, rewrite, merge, repair, or extend a claim')
    expect(calls[0]).toContain('Program rules independently choose and order every exported claim')
    expect(calls[0]).not.toContain('SECTION_OBSERVATIONS')
    expect(result.callDetails.map((detail) => detail.pass)).toEqual(['curation'])
    expect(result.repaired).toBeUndefined()
  })

  it('falls back to the deterministic catalog when the model returns the old profile contract', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({ text: JSON.stringify({ schemaVersion: '2', thesis: { statement: 'forged' } }) }),
    })

    expect(result.evidenceFallback).toBe(true)
    expect(result.profile.schemaVersion).toBe('2')
    expect(result.profile.thesis.statement).not.toContain('forged')
    expect(result.rejected).toContain('selection:invalid-payload')
  })

  it('materializes program-owned claims into the existing DesignProfile schema', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({ text: JSON.stringify(claimSelection()) }),
    })

    expect(result.profile.thesis.catalogId).toMatch(/^claim-/)
    expect(result.profile.thesis.evidence[0].evidenceId).toBe('section-a')
    expect(result.profile.componentGrammar[0].component).toBe('button')
    expect(result.pipeline).toBe('single-pass')
  })

  it('ignores model-authored claims, evidence, assertions, confidence, and aliases', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const candidate = {
      ...claimSelection(),
      claims: [
        {
          statement: 'FORGED STATEMENT',
          confidence: 'high',
          evidence: [{ evidenceId: 'forged-evidence' }],
          assertions: [{ kind: 'evidence', target: 'design-thesis', predicate: 'supports' }],
          tokenRefs: ['color.forged'],
        },
      ],
      aliases: [{ token: 'color.forged', name: 'forged' }],
    }

    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({ text: JSON.stringify(candidate) }),
    })

    expect(result.profile.tokenAliases).toEqual([])
    expect(JSON.stringify(result.profile)).not.toContain('FORGED STATEMENT')
    expect(JSON.stringify(result.profile)).not.toContain('forged-evidence')
    expect(result.status).toBe('partial')
    expect(result.rejected).toContain('selection:ignored-authoring-fields(aliases,claims)')
  })

  it('keeps a complete status without auto-filling component families omitted by a valid profile', async () => {
    const supplementalEvidence = structuredClone(evidence)
    supplementalEvidence.components.push({
      ...supplementalEvidence.components[0],
      id: 'component-card',
      type: 'card',
      styles: {
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        boxShadow: 'none',
      },
    })
    supplementalEvidence.sections.splice(1, 0, {
      ...supplementalEvidence.sections[0],
      id: 'section-content-desktop',
      order: 1,
      role: 'content',
      componentRefs: [],
    })
    supplementalEvidence.topology.pages[0].sectionIds.push('section-content-desktop')
    const evidencePackage = selectEvidencePackage(supplementalEvidence, 'structural-only')
    const result = await runInterpretationPipeline(supplementalEvidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({ text: JSON.stringify(claimSelection(supplementalEvidence)) }),
    })

    expect(result.status).toBe('complete')
    expect(result.repaired).toBeUndefined()
    expect(result.profile.componentGrammar.some((component) => component.component === 'card')).toBe(true)
  })

  it('keeps curation complete but marks the overall analysis partial when reusable evidence is incomplete', async () => {
    const partialEvidence = structuredClone(evidence)
    partialEvidence.coverage.assetCoverage = {
      expected: 2,
      valid: 1,
      status: 'partial',
      issueCount: 1,
    }
    const evidencePackage = selectEvidencePackage(partialEvidence, 'structural-only')
    const result = await runInterpretationPipeline(partialEvidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({ text: JSON.stringify(claimSelection(partialEvidence)) }),
    })

    expect(result.status).toBe('partial')
    expect(result.interpretationCoverage.status).toBe('complete')
    expect(result.evidenceFallback).toBeUndefined()
  })

  it('does not run an automatic observation or repair call', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    let calls = 0
    const invoke: InterpretationInvoke = async (prompt) => {
      calls += 1
      expect(prompt).not.toContain('section observer')
      expect(prompt).not.toContain('repairing the citation fields')
      return { text: JSON.stringify(claimSelection()) }
    }
    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only' as const,
      language: 'en' as const,
      invoke,
    })
    expect(result.pipeline).toBe('single-pass')
    expect(calls).toBe(1)
  })

  it('records catalog prompt and timing budgets', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const invoke: InterpretationInvoke = async () => ({
      text: JSON.stringify(claimSelection()),
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

  it('drops unknown IDs without changing any deterministic claim', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const valid = claimSelection()
    const invalid = { ...valid, selectedClaimIds: [...valid.selectedClaimIds, 'claim-forged'] }
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
    expect(result.evidenceFallback).toBe(true)
    expect(result.profile.claimSource).toBe('deterministic-catalog')
    expect(JSON.stringify(result.profile)).not.toContain('claim-forged')
    expect(result.rejected).toContain(`selection.selectedClaimIds.${valid.selectedClaimIds.length}:unknown-claim-id`)
    expect(calls).toBe(1)
  })

  it('preserves multimodal mode when model curation is malformed', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'multimodal')

    const result = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'multimodal',
      language: 'en',
      invoke: async () => ({ text: '{not json' }),
    })

    expect(result.evidenceFallback).toBe(true)
    expect(result.status).toBe('partial')
    expect(result.profile.inputMode).toBe('multimodal')
  })

  it('keeps the materialized profile identical when only AI summaries change', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const selection = claimSelection()
    const first = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({
        text: JSON.stringify({
          ...selection,
          summaries: [{ claimId: selection.selectedClaimIds[0], text: 'First non-normative wording.' }],
        }),
      }),
    })
    const second = await runInterpretationPipeline(evidence, evidencePackage, {
      mode: 'structural-only',
      language: 'en',
      invoke: async () => ({
        text: JSON.stringify({
          ...selection,
          summaries: [{ claimId: selection.selectedClaimIds[0], text: 'Different non-normative wording.' }],
        }),
      }),
    })

    expect(second.profile).toEqual(first.profile)
    expect(second.curation.summaries).not.toEqual(first.curation.summaries)
    expect(JSON.stringify(first.profile)).not.toContain('non-normative wording')
  })

  it('keeps the materialized profile identical across AI selection order and failure', async () => {
    const evidencePackage = selectEvidencePackage(evidence, 'structural-only')
    const selection = claimSelection()
    const run = (text: string) =>
      runInterpretationPipeline(evidence, evidencePackage, {
        mode: 'structural-only',
        language: 'en',
        invoke: async () => ({ text }),
      })

    const first = await run(JSON.stringify(selection))
    const reordered = await run(
      JSON.stringify({ ...selection, selectedClaimIds: [...selection.selectedClaimIds].reverse() }),
    )
    const malformed = await run('{not json')

    expect(reordered.profile).toEqual(first.profile)
    expect(malformed.profile).toEqual(first.profile)
    expect(first.curation.selectedClaimIds).not.toEqual(reordered.curation.selectedClaimIds)
    expect(malformed.evidenceFallback).toBe(true)
  })

  it('materializes bounded highlights with stable program ranking instead of AI selection order', () => {
    const catalog = buildDeterministicClaimCatalog(evidence, 'en', 'structural-only')
    const candidates = catalog.claims.slice(0, 2)
    expect(candidates).toHaveLength(2)
    candidates.forEach((entry) =>
      entry.placements.push({ kind: 'signature' }, { kind: 'interaction', bucket: 'driver' }),
    )

    const unselected = materializeDesignProfile(catalog)
    expect(unselected.signatureMoves).toHaveLength(2)
    expect(unselected.interactionLanguage.primaryDrivers).toHaveLength(2)

    const materializedAgain = materializeDesignProfile(catalog)
    expect(materializedAgain).toEqual(unselected)
  })

  it('validates every program-owned evidence and token reference before invoking AI', () => {
    const catalog = buildDeterministicClaimCatalog(evidence, 'en', 'structural-only')
    expect(validateDesignClaimCatalog(catalog, evidence)).toEqual({ valid: true, errors: [] })

    const tampered = structuredClone(catalog)
    tampered.claims[0].claim.evidence[0].evidenceId = 'forged-evidence'
    expect(validateDesignClaimCatalog(tampered, evidence)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.stringContaining('unknown-evidence(forged-evidence)')]),
    })
  })

  it('caps passive interaction claims at medium confidence and preserves exact changed properties', () => {
    const interactiveEvidence = structuredClone(evidence)
    interactiveEvidence.interactionObservations = [
      {
        id: 'interaction-passive-hover',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'component-a',
        driver: 'hover',
        safety: 'passive',
        trigger: { kind: 'css-pseudo-class' },
        before: { backgroundColor: '#2563eb', transform: 'none' },
        after: { backgroundColor: '#1d4ed8', transform: 'scale(1.02)' },
        changedProperties: ['backgroundColor', 'transform'],
        evidenceRefs: ['component-a'],
      },
      {
        id: 'interaction-passive-hover-duplicate',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'component-a',
        driver: 'hover',
        safety: 'passive',
        trigger: { kind: 'css-pseudo-class' },
        before: { backgroundColor: '#2563eb', transform: 'none' },
        after: { backgroundColor: '#1d4ed8', transform: 'scale(1.02)' },
        changedProperties: ['backgroundColor', 'transform'],
        evidenceRefs: ['component-a'],
      },
    ]
    const catalog = buildDeterministicClaimCatalog(interactiveEvidence, 'en', 'structural-only')
    const interactionClaim = catalog.claims.find((entry) =>
      entry.placements.some((placement) => placement.kind === 'interaction' && placement.bucket === 'driver'),
    )

    expect(interactionClaim?.claim.confidence).toBe('medium')
    expect(interactionClaim?.claim.statement).toContain('2 observed passive hover states')
    expect(interactionClaim?.claim.statement).toContain('backgroundColor, transform')
    expect(
      catalog.claims.filter((entry) =>
        entry.placements.some((placement) => placement.kind === 'interaction' && placement.bucket === 'driver'),
      ),
    ).toHaveLength(1)
    expect(
      interactionClaim?.claim.assertions?.filter((assertion) => assertion.predicate === 'property-change'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'backgroundColor' }),
        expect.objectContaining({ property: 'transform' }),
      ]),
    )
  })

  it('treats capture-only section absence as uncertainty instead of a responsive hiding rule', () => {
    const presenceEvidence = structuredClone(evidence)
    presenceEvidence.responsiveObservations = [
      {
        id: 'responsive-presence-only',
        sectionId: 'section-a',
        fromViewport: 'desktop',
        toViewport: 'mobile',
        changeType: 'visibility',
        changedProperties: ['visibility'],
        changes: { visibility: { from: 'visible', to: 'absent' } },
        summary: 'The section is present in only one capture.',
        evidenceRefs: ['section-a', 'section-b'],
      },
    ]
    const catalog = buildDeterministicClaimCatalog(presenceEvidence, 'en', 'structural-only')

    expect(
      catalog.claims.some((entry) =>
        entry.placements.some((placement) => placement.kind === 'transfer' && placement.bucket === 'adapt'),
      ),
    ).toBe(false)
    expect(catalog.uncertainties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: 'Viewport-specific section presence',
          reason: expect.stringContaining('does not prove CSS hiding'),
        }),
      ]),
    )
  })

  it('uses the same responsive reliability filter for catalog claims as the evidence report', () => {
    const responsiveEvidence = structuredClone(evidence)
    responsiveEvidence.sections[0].role = 'content'
    responsiveEvidence.responsiveObservations = [
      {
        id: 'responsive-content-order',
        sectionId: 'section-a',
        fromViewport: 'desktop',
        toViewport: 'mobile',
        changeType: 'reflow',
        changedProperties: ['sequenceIndex', 'height', 'rect.height'],
        changes: {
          sequenceIndex: { from: 2, to: 0 },
          height: { from: '420px', to: '1385px' },
          'rect.height': { from: 0.3, to: 0.9 },
        },
        summary: 'Three raw properties changed.',
        evidenceRefs: ['section-a', 'section-b'],
      },
    ]

    const catalog = buildDeterministicClaimCatalog(responsiveEvidence, 'en', 'structural-only')
    const responsiveClaim = catalog.claims.find((entry) =>
      entry.placements.some((placement) => placement.kind === 'transfer' && placement.bucket === 'adapt'),
    )

    expect(responsiveClaim?.claim.statement).toContain('classified as reorder')
    expect(responsiveClaim?.claim.statement).toContain('sequenceIndex')
    expect(responsiveClaim?.claim.statement).not.toContain('height')
    expect(responsiveClaim?.claim.assertions?.some((assertion) => assertion.property === 'height')).toBe(false)
  })

  it('rejects legacy responsive observations whose cited sections have different semantic roles', () => {
    const legacyEvidence = structuredClone(evidence)
    legacyEvidence.responsiveObservations = [
      {
        id: 'responsive-legacy-mismatch',
        sectionId: 'section-a',
        fromViewport: 'desktop',
        toViewport: 'mobile',
        changeType: 'reflow',
        changedProperties: ['sequenceIndex'],
        changes: { sequenceIndex: { from: 2, to: 0 } },
        summary: 'A legacy observation paired sections by locator only.',
        evidenceRefs: ['section-a', 'section-b'],
      },
    ]

    const catalog = buildDeterministicClaimCatalog(legacyEvidence, 'en', 'structural-only')

    expect(
      catalog.claims.some((entry) =>
        entry.placements.some((placement) => placement.kind === 'transfer' && placement.bucket === 'adapt'),
      ),
    ).toBe(false)
    expect(catalog.uncertainties).toEqual(
      expect.arrayContaining([expect.objectContaining({ topic: 'Cross-viewport section identity' })]),
    )
  })

  it('counts visible section borders and keeps scope metadata out of avoid rules', () => {
    const surfaceEvidence = structuredClone(evidence)
    surfaceEvidence.sections[0].observedStyles = {
      borders: {
        borderTop: '1px solid rgb(226, 232, 240)',
        borderRight: '1px solid rgb(226, 232, 240)',
        borderBottom: '1px solid rgb(226, 232, 240)',
        borderLeft: '1px solid rgb(226, 232, 240)',
      },
    }
    const catalog = buildDeterministicClaimCatalog(surfaceEvidence, 'en', 'structural-only')
    const surfaceClaim = catalog.claims.find((entry) =>
      entry.placements.some((placement) => placement.kind === 'singleton' && placement.slot === 'visual.surfaces'),
    )

    expect(surfaceClaim?.claim.statement).toContain('1 have visible borders')
    expect(
      catalog.claims.some((entry) =>
        entry.placements.some((placement) => placement.kind === 'transfer' && placement.bucket === 'avoid'),
      ),
    ).toBe(false)
    expect(
      catalog.claims.some((entry) =>
        entry.placements.some((placement) => placement.kind === 'transfer' && placement.bucket === 'preserve'),
      ),
    ).toBe(false)
  })

  it('uses severe-overflow captures only for avoid and scope claims', () => {
    const overflowEvidence = structuredClone(evidence)
    overflowEvidence.pages[0].viewportWidth = 375
    overflowEvidence.pages[0].contentWidth = 1200
    overflowEvidence.pages[0].horizontalOverflow = true
    overflowEvidence.pages[0].horizontalOverflowSources = [
      {
        locator: 'main',
        overflowPx: 825,
        width: 1200,
        position: 'static',
        sectionId: 'section-a',
        sectionRole: 'hero',
      },
    ]
    const catalog = buildDeterministicClaimCatalog(overflowEvidence, 'en', 'structural-only')
    const claimsUsingOverflowSection = catalog.claims.filter((entry) =>
      entry.claim.evidence.some((reference) => reference.evidenceId === 'section-a'),
    )

    expect(claimsUsingOverflowSection).toHaveLength(1)
    expect(claimsUsingOverflowSection[0].placements).toEqual([{ kind: 'transfer', bucket: 'avoid' }])
    expect(claimsUsingOverflowSection[0].claim.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ evidenceId: 'page-a' })]),
    )
    expect(catalog.claims.some((entry) => entry.placements.some((placement) => placement.kind === 'component'))).toBe(
      false,
    )
  })

  it('never builds reusable claims from a capture that failed the page health gate', () => {
    const unhealthyEvidence = structuredClone(evidence)
    const catalogBuiltBeforeHealthFailure = buildDeterministicClaimCatalog(evidence, 'en', 'structural-only')
    unhealthyEvidence.pages.forEach((page) => {
      page.health = {
        status: 'unusable',
        checkedAt: '2026-08-15T00:00:00.000Z',
        recovered: false,
        attempts: 1,
        viewport: { width: 1_440, height: 900 },
        content: { width: 1_440, height: 900 },
        overlayAreaRatio: 0.8,
        mutationCount: 0,
        aiEligible: false,
        issues: [{ code: 'captcha', severity: 'error', recoverable: false }],
      }
    })

    const catalog = buildDeterministicClaimCatalog(unhealthyEvidence, 'en', 'structural-only')

    expect(canonicalCatalogPageIds(unhealthyEvidence)).toEqual(new Set())
    expect(
      catalog.claims.every((entry) =>
        entry.placements.every((placement) => placement.kind === 'transfer' && placement.bucket === 'avoid'),
      ),
    ).toBe(true)
    expect(catalog.uncertainties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: 'Page health gate', reason: expect.stringContaining('2 capture(s)') }),
      ]),
    )
    expect(validateDesignClaimCatalog(catalog, unhealthyEvidence)).toEqual({ valid: true, errors: [] })
    expect(validateDesignClaimCatalog(catalogBuiltBeforeHealthFailure, unhealthyEvidence)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.stringContaining('unsafe-page-used-for-reusable-claim')]),
    })
  })

  it('drops responsive comparisons when either cited capture failed the page health gate', () => {
    const mixedEvidence = structuredClone(evidence)
    mixedEvidence.pages[1].health = {
      status: 'unusable',
      checkedAt: '2026-08-15T00:00:00.000Z',
      recovered: false,
      attempts: 1,
      viewport: { width: 375, height: 900 },
      content: { width: 375, height: 900 },
      overlayAreaRatio: 0,
      mutationCount: 0,
      aiEligible: false,
      issues: [{ code: 'error-page', severity: 'error', recoverable: false }],
    }

    const catalog = buildDeterministicClaimCatalog(mixedEvidence, 'en', 'structural-only')

    expect(
      catalog.claims.some((entry) =>
        entry.placements.some((placement) => placement.kind === 'transfer' && placement.bucket === 'adapt'),
      ),
    ).toBe(false)
    expect(validateDesignClaimCatalog(catalog, mixedEvidence)).toEqual({ valid: true, errors: [] })
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

  it('keeps stable image IDs for catalog curation', async () => {
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
        return {
          text: JSON.stringify(claimSelection(evidence, 'multimodal')),
        }
      },
    })

    expect(receivedImages.map((image) => image.name)).toEqual(['image-a.png'])
    expect(receivedPrompt).toContain('Attached image IDs: image-a')
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
