import { describe, expect, it } from 'vitest'
import { parseDocument, stringify } from 'yaml'

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// The audit entry point is intentionally a standalone Node script used against generated artifacts.
// @ts-expect-error -- the repository does not emit declarations for scripts/*.mjs
import { auditArtifactBundle, auditDesignDoc } from '../../scripts/audit-design-doc.mjs'

interface CandidatePreviewExtension {
  candidates: {
    declaredColors: Array<{ value: string; pageCount: number }>
    observedUnassignedColors: Array<{ value: string; pageCount: number }>
    tokenValues: Array<{ value: string; pageCount: number }>
  }
}

function updateFrontMatter(source: string, mutate: (value: Record<string, unknown>) => void): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  if (!match) throw new Error('Fixture is missing frontmatter')
  const document = parseDocument(match[1])
  const value = document.toJS() as Record<string, unknown>
  mutate(value)
  return `---\n${stringify(value, { lineWidth: 0 }).trimEnd()}\n---\n${source.slice(match[0].length)}`
}

function componentAssertions(evidenceIds: string[], component = 'button', variant = 'primary') {
  return evidenceIds.flatMap((evidenceId) => [
    { kind: 'component', target: component, predicate: 'present', scope: 'instance', evidenceIds: [evidenceId] },
    {
      kind: 'component',
      target: component,
      predicate: 'variant',
      scope: 'instance',
      evidenceIds: [evidenceId],
      value: variant,
    },
  ])
}

const validDocument = `---
version: alpha
name: Example Design System
description: Evidence-backed design system.
colors:
  background: "#ffffff"
  primary: "#2255ff"
spacing:
  space-1: 4px
  space-2: 8px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    padding: 8px
x-imprint:
  - evidence:
      layer: observed
      pageCount: 2
      captureCount: 4
      tokenConfidence:
        high: 3
        medium: 2
        low: 0
      coverage:
        pageCoverage: complete
        captureCoverage:
          status: complete
        assetCoverage:
          expected: 4
          valid: 4
          status: complete
          issueCount: 0
        limitations: []
    componentSummary:
      patterns: 1
      instances: 3
      reusablePatterns: 1
      omittedLocalPatterns: 0
      details:
        - name: button-primary
          type: button
          count: 3
          identityConfidence: 0.95
          reuseConfidence: 0.85
          reuseScope: cross-page
          matchingStyleInstances: 3
          pageCount: 2
---

## Typography

**Font families:** No portable font family was established; consult local typography Evidence before choosing a typeface.

## Layout

### Reusable Spacing Candidates

- Level 1: \`4px\` (4 independent owners)
- Level 2: \`8px\` (4 independent owners)

## Components

#### Primary button

_3 representative-style matches across 2 pages · identity 0.95 · reuse 0.85_

### Reconstruction Summary

- **Entry-page section hierarchy:** content
`

const HOME_ROUTE_ID = 'route-111111111111'
const ABOUT_ROUTE_ID = 'route-222222222222'

const portableEvidence = {
  value: '#2255ff',
  confidence: 'high',
  measurementConfidence: 'high',
  semanticConfidence: 'high',
  reuseScope: 'foundation',
  observationCount: 4,
  ownerCount: 4,
  semanticAgreement: 1,
  pageCount: 2,
  captureCount: 4,
  eligiblePageCount: 2,
  pageSupportRatio: 1,
  pages: ['https://example.com/', 'https://example.com/about'],
  pageRefs: [HOME_ROUTE_ID, ABOUT_ROUTE_ID],
  sources: ['usage:primaryActionBackgroundColor'],
  reasons: ['cross-page', 'rendered-use', 'computed-style'],
}

function onePageRenderedTextEvidence(value: string, renderedTextOwners: Array<Record<string, unknown>>) {
  return {
    ...portableEvidence,
    value,
    confidence: 'medium',
    measurementConfidence: 'medium',
    semanticConfidence: 'medium',
    observationCount: renderedTextOwners.length,
    ownerCount: renderedTextOwners.length,
    pageCount: 1,
    captureCount: 1,
    eligiblePageCount: 1,
    pageSupportRatio: 1,
    pages: ['https://example.com/'],
    pageRefs: [HOME_ROUTE_ID],
    sources: ['rendered:text'],
    reasons: ['rendered-use', 'computed-style'],
    renderedTextOwners,
  }
}

function portableRenderedTextEvidence(value: string, renderedTextOwners: Array<Record<string, unknown>>) {
  const owners = renderedTextOwners.map((owner, index) =>
    index % 2 === 0
      ? { ...owner, page: 'https://example.com/', routeId: HOME_ROUTE_ID }
      : { ...owner, page: 'https://example.com/about', routeId: ABOUT_ROUTE_ID },
  )
  return {
    ...onePageRenderedTextEvidence(value, owners),
    pageCount: 2,
    captureCount: 2,
    eligiblePageCount: 2,
    pageSupportRatio: 1,
    pages: ['https://example.com/', 'https://example.com/about'],
    pageRefs: [HOME_ROUTE_ID, ABOUT_ROUTE_ID],
  }
}

function directTextSource(foreground = '#111111') {
  return {
    kind: 'direct-text',
    widthPx: 240,
    heightPx: 48,
    visibleWidthPx: 240,
    visibleHeightPx: 48,
    paintedAreaPx: 11_520,
    captureIntersectionRatio: 1,
    effectiveClipPathAreaRatio: 1,
    ancestorClipCount: 0,
    clientRectCount: 1,
    glyphRectCount: 1,
    visibleBounds: { xPx: 0, yPx: 0, widthPx: 240, heightPx: 48 },
    visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 240, heightPx: 48 }],
    visibleGlyphAreaPx: 11_520,
    clipPathChain: [],
    nonRectangularClipPathCount: 0,
    clip: 'auto',
    clipPath: 'none',
    contentVisibility: 'visible',
    opacity: 1,
    filterOpacity: 1,
    filterChain: [],
    maskChain: [],
    blendChain: [],
    textIndentPx: 0,
    filter: 'none',
    glyphPaintKind: 'solid-color',
    foreground,
  }
}

function localRenderedTypographyCandidate() {
  const renderedTextOwners = [
    {
      page: 'https://example.com/',
      routeId: HOME_ROUTE_ID,
      viewport: 'desktop',
      ownerId: 'candidate-font-inter-1',
      textRole: 'body',
      styles: {
        color: '#111111',
        backgroundColor: '#ffffff',
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        fontWeight: '400',
        lineHeight: '24px',
        letterSpacing: 'normal',
      },
      source: directTextSource(),
    },
  ]
  return {
    id: 'candidate.typography.fontFamilies.inter',
    group: 'typography.fontFamilies',
    value: 'Inter',
    provenance: 'built-token',
    rejectionReason: 'local-scope',
    evidence: {
      ...onePageRenderedTextEvidence('Inter', renderedTextOwners),
      reuseScope: 'local',
    },
  }
}

function visiblePseudoPaint() {
  return {
    widthPx: 120,
    heightPx: 32,
    xPx: 0,
    yPx: 0,
    captureWidthPx: 1000,
    captureHeightPx: 700,
    visibleWidthPx: 120,
    visibleHeightPx: 32,
    paintedAreaPx: 3840,
    captureIntersectionRatio: 1,
    opacity: 1,
    filterOpacity: 1,
    filterChain: [],
    maskChain: [],
    blendChain: [],
  }
}

const portableSpacingEvidence = (value: string) => ({
  ...portableEvidence,
  value,
  foundationOwnerCount: 4,
  minimumPageFoundationOwnerCount: 2,
  sources: ['element:structural-spacing'],
})

function bundleEvidence() {
  const pages = [
    ['page-home-desktop', 'https://example.com/', 'desktop'],
    ['page-home-mobile', 'https://example.com/', 'mobile'],
    ['page-about-desktop', 'https://example.com/about', 'desktop'],
    ['page-about-mobile', 'https://example.com/about', 'mobile'],
  ].map(([id, url, viewport]) => ({
    id,
    url,
    routeId: url === 'https://example.com/' ? HOME_ROUTE_ID : ABOUT_ROUTE_ID,
    viewport,
    health: { checkedAt: '2026-09-02T00:00:01.000Z' },
    images: [],
  }))
  return {
    schemaVersion: '1',
    analysisId: 'audit-fixture',
    source: {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
      language: 'en',
    },
    pages,
    coverage: {
      pageCoverage: 'complete',
      captureCoverage: { status: 'complete' },
      assetCoverage: { expected: 4, valid: 4, status: 'complete', issueCount: 0 },
      limitations: [],
    },
    limitations: [],
    tokens: {
      colors: { background: '#ffffff', primary: '#2255ff' },
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['4px', '8px'],
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
      evidence: {
        'colors.background': {
          ...portableEvidence,
          value: '#ffffff',
          pages: [...portableEvidence.pages],
          pageRefs: [...portableEvidence.pageRefs],
        },
        'colors.primary': {
          ...portableEvidence,
          pages: [...portableEvidence.pages],
          pageRefs: [...portableEvidence.pageRefs],
        },
        'spacing.0': portableSpacingEvidence('4px'),
        'spacing.1': portableSpacingEvidence('8px'),
      },
      candidates: { values: [] },
    },
    sections: [
      {
        id: 'section-home',
        pageId: 'page-home-desktop',
        role: 'content',
        tokenRefs: ['color.primary'],
        componentRefs: ['button-home-1', 'button-home-2'],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: [],
      },
      {
        id: 'section-about',
        pageId: 'page-about-desktop',
        role: 'content',
        tokenRefs: ['color.primary'],
        componentRefs: ['button-about'],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: [],
      },
    ],
    components: [
      {
        id: 'button-home-1',
        pageId: 'page-home-desktop',
        sectionId: 'section-home',
        type: 'button',
        role: 'primary-action',
        rect: { x: 0, y: 0, width: 0.1, height: 0.05 },
        styles: { backgroundColor: '#2255ff', padding: '8px' },
        confidence: 0.95,
        tokenRefs: ['color.primary'],
        stateRefs: [],
        evidenceRefs: ['section-home'],
      },
      {
        id: 'button-home-2',
        pageId: 'page-home-desktop',
        sectionId: 'section-home',
        type: 'button',
        role: 'primary-action',
        rect: { x: 0.2, y: 0, width: 0.1, height: 0.05 },
        styles: { backgroundColor: '#2255ff', padding: '8px' },
        confidence: 0.95,
        tokenRefs: ['color.primary'],
        stateRefs: [],
        evidenceRefs: ['section-home'],
      },
      {
        id: 'button-about',
        pageId: 'page-about-desktop',
        sectionId: 'section-about',
        type: 'button',
        role: 'primary-action',
        rect: { x: 0, y: 0, width: 0.1, height: 0.05 },
        styles: { backgroundColor: '#2255ff', padding: '8px' },
        confidence: 0.95,
        tokenRefs: ['color.primary'],
        stateRefs: [],
        evidenceRefs: ['section-about'],
      },
    ],
    layoutNodes: [],
    topology: {
      pages: [
        { pageId: 'page-home-desktop', sectionIds: ['section-home'] },
        { pageId: 'page-about-desktop', sectionIds: ['section-about'] },
      ],
      globalLayers: [],
      crossPagePatternIds: [],
    },
    interactionStyles: { hover: [], focus: [], active: [] },
    interactionObservations: [],
    responsiveObservations: [],
    mediaLayers: [],
  }
}

function bundleDtcg(evidence: ReturnType<typeof bundleEvidence>) {
  return {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    color: {
      background: { $type: 'color', $value: '#ffffff' },
      primary: { $type: 'color', $value: '#2255ff' },
    },
    typography: {
      fontFamilies: { $type: 'fontFamily', $value: [] },
      fontStacks: { $type: 'fontFamily', $value: [] },
      fontSizes: { $type: 'dimension', $value: [] },
      fontWeights: { $type: 'fontWeight', $value: [] },
      lineHeights: { $type: 'number', $value: [] },
    },
    spacing: {
      '1': { $type: 'dimension', $value: '4px' },
      '2': { $type: 'dimension', $value: '8px' },
    },
    borderRadius: {},
    shadow: {},
    zIndex: {},
    transition: {},
    $extensions: {
      'com.imprint.borders': [],
      'com.imprint.tokenEvidence': evidence.tokens.evidence,
      'com.imprint.candidates': evidence.tokens.candidates,
    },
  }
}

interface ForegroundPairFixture {
  background: string
  pageCount: number
  eligiblePageCount: number
  pageSupportRatio: number
  normalizedShare: number
  normalizedMainTextShare?: number
  ownerCount?: number
  minimumPageOwnerCount?: number
  mainTextPageCount?: number
  mainTextOwnerCount?: number
  headingPageCount?: number
  headingOwnerCount?: number
  contrastRatio: number
  textRoles: string[]
}

function addFoundationForegroundArtifacts(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  rawDtcg: unknown,
  value: string,
  pairedSurface: ForegroundPairFixture,
) {
  const supportedPageShare = Math.min(
    1,
    pairedSurface.pageSupportRatio > 0
      ? pairedSurface.normalizedShare / pairedSurface.pageSupportRatio
      : pairedSurface.normalizedShare,
  )
  const decimalPlaces = String(supportedPageShare).split('.')[1]?.length || 0
  const totalOwnersPerPage = Math.max(1, 10 ** decimalPlaces)
  const matchedOwnersPerPage = Math.max(1, Math.round(supportedPageShare * totalOwnersPerPage))
  const routeCatalog = [
    ...new Map(
      evidence.pages.map((page) => [page.routeId, { page: page.url, routeId: page.routeId }] as const),
    ).values(),
  ].slice(0, pairedSurface.eligiblePageCount)
  const supportedRoutes = routeCatalog.slice(0, pairedSurface.pageCount)
  const routePages = supportedRoutes.map((route) => route.page)
  const routeSupport = routeCatalog.map((route, pageIndex) => {
    const totalOwnerIds = Array.from(
      { length: totalOwnersPerPage },
      (_item, ownerIndex) => `pair-total-${pageIndex}-${ownerIndex}`,
    )
    const supported = pageIndex < pairedSurface.pageCount
    const ownerIds = supported ? totalOwnerIds.slice(0, matchedOwnersPerPage) : []
    return {
      ...route,
      supported,
      ownerIds,
      totalOwnerIds,
      mainTextOwnerIds: ownerIds,
      headingOwnerIds: pairedSurface.textRoles.includes('heading') ? ownerIds : [],
      textRoles: supported ? pairedSurface.textRoles : [],
      normalizedShare: ownerIds.length / totalOwnerIds.length,
      normalizedMainTextShare: ownerIds.length / totalOwnerIds.length,
    }
  })
  const ownerCount = routeSupport.reduce((sum, route) => sum + route.ownerIds.length, 0)
  const headingOwnerCount = routeSupport.reduce((sum, route) => sum + route.headingOwnerIds.length, 0)
  const completePairedSurface = {
    ownerCount,
    minimumPageOwnerCount: matchedOwnersPerPage,
    mainTextPageCount: pairedSurface.pageCount,
    mainTextOwnerCount: ownerCount,
    normalizedMainTextShare:
      routeSupport.reduce((sum, route) => sum + route.normalizedMainTextShare, 0) / pairedSurface.eligiblePageCount,
    headingPageCount: pairedSurface.textRoles.includes('heading') ? pairedSurface.pageCount : 0,
    headingOwnerCount,
    routeSupport,
    ...pairedSurface,
  }
  const renderedTextOwners = routeSupport.flatMap((route) =>
    route.ownerIds.slice(0, 8).map((ownerId) => ({
      page: route.page,
      routeId: route.routeId,
      viewport: 'desktop',
      ownerId,
      textRole: pairedSurface.textRoles.includes('heading') ? 'heading' : 'body',
      styles: {
        color: value,
        backgroundColor: pairedSurface.background,
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        fontWeight: '400',
        lineHeight: '24px',
        letterSpacing: 'normal',
      },
      source: directTextSource(value),
    })),
  )
  const colors = evidence.tokens.colors as Record<string, string>
  const tokenEvidence = evidence.tokens.evidence as Record<string, Record<string, unknown>>
  colors.foreground = value
  tokenEvidence['colors.foreground'] = {
    ...portableEvidence,
    value,
    observationCount: ownerCount,
    ownerCount,
    pageCount: pairedSurface.pageCount,
    captureCount: pairedSurface.pageCount,
    eligiblePageCount: pairedSurface.eligiblePageCount,
    pageSupportRatio: pairedSurface.pageSupportRatio,
    pages: routePages,
    pageRefs: supportedRoutes.map((route) => route.routeId),
    sources: [...portableEvidence.sources, 'rendered:text', 'observed:text-background-pair'],
    reasons: [...portableEvidence.reasons, 'paired-surface'],
    renderedTextOwners,
    pairedSurface: completePairedSurface,
  }
  const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
  ;(dtcg.color as Record<string, unknown>).foreground = { $type: 'color', $value: value }
  artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatter) => {
    ;(frontMatter.colors as Record<string, string>).foreground = value
  }).replace(
    '| `--color-background` | `#ffffff` | - | - |',
    `| \`--color-background\` | \`#ffffff\` | - | - |\n| \`--color-foreground\` | \`${value}\` | - | - |`,
  )
  artifacts['variables.css'] = artifacts['variables.css'].replace(
    '--color-background: #ffffff;',
    `--color-background: #ffffff; --color-foreground: ${value};`,
  )
  artifacts['variables.scss'] = artifacts['variables.scss'].replace(
    '$color-background: #ffffff;',
    `$color-background: #ffffff;\n$color-foreground: ${value};`,
  )
  artifacts['theme.css'] = artifacts['theme.css'].replace(
    '--color-background: #ffffff;',
    `--color-background: #ffffff; --color-foreground: ${value};`,
  )
}

function addUnpairedMutedForegroundArtifacts(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  rawDtcg: unknown,
  value: string,
) {
  ;(evidence.tokens.colors as Record<string, string>)['muted-foreground'] = value
  ;(evidence.tokens.evidence as Record<string, Record<string, unknown>>)['colors.muted-foreground'] = {
    ...portableEvidence,
    value,
  }
  const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
  ;(dtcg.color as Record<string, unknown>)['muted-foreground'] = { $type: 'color', $value: value }
  artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatter) => {
    ;(frontMatter.colors as Record<string, string>)['muted-foreground'] = value
  })
  artifacts['variables.css'] = artifacts['variables.css'].replace(
    '--color-foreground:',
    `--color-muted-foreground: ${value}; --color-foreground:`,
  )
  artifacts['variables.scss'] += `\n$color-muted-foreground: ${value};`
  artifacts['theme.css'] = artifacts['theme.css'].replace(
    '--color-foreground:',
    `--color-muted-foreground: ${value}; --color-foreground:`,
  )
}

function addPairedMutedForegroundArtifacts(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  rawDtcg: unknown,
  value: string,
  contrastRatio: number,
) {
  addUnpairedMutedForegroundArtifacts(artifacts, evidence, rawDtcg, value)
  const tokenEvidence = evidence.tokens.evidence as Record<string, Record<string, unknown>>
  const foregroundEvidence = tokenEvidence['colors.foreground']
  const pairedSurface = foregroundEvidence.pairedSurface as Record<string, unknown>
  tokenEvidence['colors.muted-foreground'] = {
    ...foregroundEvidence,
    value,
    renderedTextOwners: (foregroundEvidence.renderedTextOwners as Array<Record<string, unknown>>).map((owner) => ({
      ...owner,
      styles: { ...(owner.styles as Record<string, unknown>), color: value },
      source: { ...(owner.source as Record<string, unknown>), foreground: value },
    })),
    pairedSurface: { ...pairedSurface, contrastRatio },
  }
}

function addResponsiveTypographyAndStructureEvidence(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  options: { typographyCount?: number; scopedStructure?: boolean } = {},
) {
  const sections = evidence.sections as Array<Record<string, unknown>>
  const layoutNodes = evidence.layoutNodes as Array<Record<string, unknown>>
  for (const page of evidence.pages) {
    let section = sections.find((candidate) => candidate.pageId === page.id)
    if (!section) {
      section = {
        id: `section-${page.id}`,
        pageId: page.id,
        role: 'content',
        tokenRefs: [],
        componentRefs: [],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: [],
      }
      sections.push(section)
    }
    section.observedStyles = {
      layout: { gridTemplateColumns: page.viewport === 'desktop' ? '2fr 1fr' : '1fr' },
    }
    layoutNodes.push({
      id: `layout-${page.id}`,
      pageId: page.id,
      sectionId: section.id,
      role: 'heading',
      textRole: 'display',
      textStyleSource: directTextSource(),
      tokenRefs: [],
      observedTypography: { fontFamily: 'Inter', fontSize: '40px', fontWeight: '700', lineHeight: '46px' },
      traits: [],
    })
  }

  const typographyCount = options.typographyCount ?? 2
  const structureScope =
    options.scopedStructure === false
      ? ''
      : ' · scope: `desktop` https://example.com/; `desktop` https://example.com/about'
  artifacts['DESIGN.md'] += `

## Design Evidence Overview

### Typography Role Evidence

> Count basis: one evidence-eligible canonical capture per route without severe horizontal overflow; desktop is preferred, followed by tablet and mobile.

| Observed role | Independent owners | Font | Size | Weight | Line height |
|---|---:|---|---|---|---|
| \`display\` | ${typographyCount} | \`Inter\` | \`40px\` | \`700\` | \`46px\` |

### Page Topology

- \`desktop\` · 2 routes · examples: https://example.com/; https://example.com/about: content
- \`mobile\` · 2 routes · examples: https://example.com/; https://example.com/about: content

### Structural Facts

- content · 2 independent owners${structureScope} — \`grid: 2fr 1fr\`
`
}

function addDarkBundleArtifacts(
  artifacts: Record<string, string>,
  rawDtcg: unknown,
  mutate?: (artifacts: Record<string, string>) => void,
) {
  const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & { dark?: unknown }
  const darkValue = '#101827'
  const { $schema: _schema, ...darkRoot } = structuredClone(dtcg)
  darkRoot.color.primary.$value = darkValue
  const entryScopedEvidence = Object.fromEntries(
    Object.entries(darkRoot.$extensions['com.imprint.tokenEvidence']).map(([path, rawItem]) => {
      const item = rawItem as Record<string, unknown>
      const renderedTextOwners = Array.isArray(item.renderedTextOwners)
        ? item.renderedTextOwners.map((rawOwner) => ({
            ...(rawOwner as Record<string, unknown>),
            page: 'https://example.com/',
            routeId: HOME_ROUTE_ID,
          }))
        : undefined
      const pairedSurface =
        item.pairedSurface && typeof item.pairedSurface === 'object' && !Array.isArray(item.pairedSurface)
          ? {
              ...(item.pairedSurface as Record<string, unknown>),
              pageCount: 1,
              eligiblePageCount: 1,
              pageSupportRatio: 1,
              routeSupport: Array.isArray((item.pairedSurface as Record<string, unknown>).routeSupport)
                ? ((item.pairedSurface as Record<string, unknown>).routeSupport as Array<Record<string, unknown>>)
                    .slice(0, 1)
                    .map((route) => ({
                      ...route,
                      page: 'https://example.com/',
                      routeId: HOME_ROUTE_ID,
                    }))
                : undefined,
            }
          : undefined
      return [
        path,
        {
          ...item,
          pageCount: 1,
          captureCount: 1,
          eligiblePageCount: 1,
          pageSupportRatio: 1,
          pages: ['https://example.com/'],
          pageRefs: [HOME_ROUTE_ID],
          ...(renderedTextOwners ? { renderedTextOwners } : {}),
          ...(pairedSurface ? { pairedSurface } : {}),
        },
      ]
    }),
  )
  darkRoot.$extensions['com.imprint.tokenEvidence'] = {
    ...entryScopedEvidence,
    'colors.primary': {
      ...portableEvidence,
      value: darkValue,
      observationCount: 2,
      ownerCount: 2,
      pageCount: 1,
      captureCount: 1,
      eligiblePageCount: 1,
      pageSupportRatio: 1,
      pages: ['https://example.com/'],
      pageRefs: [HOME_ROUTE_ID],
    },
  }
  dtcg.dark = darkRoot
  const extensions = dtcg.$extensions as Record<string, unknown>
  extensions['com.imprint.darkMode'] = {
    method: 'media-query',
    overrides: { 'color.primary': darkValue },
  }
  artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
    '    componentSummary:',
    `    darkMode:
      method: media-query
      overrideRefs:
        - color.primary
      overrides:
        color.primary: "${darkValue}"
      colors:
        background: "#ffffff"
        primary: "${darkValue}"
      fontFamilies: {}
    componentSummary:`,
  )
  artifacts['variables.css'] += `
/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #ffffff;
    --color-primary: ${darkValue};
    --spacing-1: 4px;
    --spacing-2: 8px;
  }
}`
  artifacts['variables.scss'] += `
// Captured dark mode values
$dark-color-background: #ffffff;
$dark-color-primary: ${darkValue};
$dark-spacing-1: 4px;
$dark-spacing-2: 8px;

@mixin imprint-dark-theme {
  --color-background: #ffffff;
  --color-primary: ${darkValue};
  --spacing-1: 4px;
  --spacing-2: 8px;
}
@media (prefers-color-scheme: dark) {
  :root { @include imprint-dark-theme; }
}`
  artifacts['theme.css'] += `
/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #ffffff;
    --color-primary: ${darkValue};
    --spacing-1: 4px;
    --spacing-2: 8px;
  }
}`
  artifacts['DESIGN.md'] += `

**Dark Mode:** Supported. Dark tokens were observed by emulating prefers-color-scheme: dark and reading computed styles; this does not imply the site loads in dark by default.

### Dark Mode Colors

| Token | Value |
|-------|-------|
| \`--color-background\` | \`#ffffff\` |
| \`--color-primary\` | \`${darkValue}\` |
`
  mutate?.(artifacts)
}

function addMultipleFontArtifacts(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  rawDtcg: unknown,
) {
  const renderedOwner = (ownerId: string, fontFamily: string, overrides: Record<string, string> = {}) => ({
    page: 'https://example.com/',
    routeId: HOME_ROUTE_ID,
    viewport: 'desktop',
    ownerId,
    textRole: 'body',
    styles: {
      color: '#111111',
      backgroundColor: '#ffffff',
      fontFamily,
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: '24px',
      letterSpacing: 'normal',
      ...overrides,
    },
    source: {
      kind: 'direct-text',
      widthPx: 160,
      heightPx: 24,
      visibleWidthPx: 160,
      visibleHeightPx: 24,
      paintedAreaPx: 3840,
      captureIntersectionRatio: 1,
      effectiveClipPathAreaRatio: 1,
      ancestorClipCount: 0,
      clientRectCount: 1,
      glyphRectCount: 1,
      visibleBounds: { xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 },
      visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 }],
      visibleGlyphAreaPx: 3840,
      clipPathChain: [],
      nonRectangularClipPathCount: 0,
      clip: 'auto',
      clipPath: 'none',
      contentVisibility: 'visible',
      opacity: 1,
      filterOpacity: 1,
      filterChain: [],
      maskChain: [],
      blendChain: [],
      textIndentPx: 0,
      filter: 'none',
      glyphPaintKind: 'solid-color',
      foreground: '#111111',
    },
  })
  const fontFamilies = evidence.tokens.typography.fontFamilies as string[]
  const fontStacks = evidence.tokens.typography.fontStacks as string[]
  fontFamilies.push('Georgia', 'Inter')
  fontStacks.push('Georgia, serif', 'Inter, sans-serif')
  const tokenEvidence = evidence.tokens.evidence as Record<string, Record<string, unknown>>
  const owners = (prefix: string, fontFamily: string) => [
    renderedOwner(`${prefix}-1`, fontFamily),
    renderedOwner(`${prefix}-2`, fontFamily),
  ]
  tokenEvidence['typography.fontFamilies.0'] = portableRenderedTextEvidence(
    'Georgia',
    owners('font-georgia', 'Georgia, serif'),
  )
  tokenEvidence['typography.fontFamilies.1'] = portableRenderedTextEvidence(
    'Inter',
    owners('font-inter', 'Inter, sans-serif'),
  )
  tokenEvidence['typography.fontStacks.0'] = portableRenderedTextEvidence(
    'Georgia, serif',
    owners('stack-georgia', 'Georgia, serif'),
  )
  tokenEvidence['typography.fontStacks.1'] = portableRenderedTextEvidence(
    'Inter, sans-serif',
    owners('stack-inter', 'Inter, sans-serif'),
  )

  const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
  ;(dtcg.typography.fontFamilies.$value as string[]).push(...fontFamilies)
  ;(dtcg.typography.fontStacks.$value as string[]).push(...fontStacks)
  artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
    'spacing:\n',
    `typography:
  font-family-serif:
    fontFamily: Georgia, serif
  font-family-sans:
    fontFamily: Inter, sans-serif
spacing:
`,
  )
  artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
    '**Font families:** No portable font family was established; consult local typography Evidence before choosing a typeface.',
    '**Font families:** Georgia, Inter',
  )
  artifacts['variables.css'] = artifacts['variables.css'].replace(
    ' }',
    ' --font-serif: Georgia, serif; --font-sans: Inter, sans-serif; }',
  )
  artifacts['theme.css'] = artifacts['theme.css'].replace(
    ' }',
    ' --font-serif: Georgia, serif; --font-sans: Inter, sans-serif; }',
  )
  artifacts['variables.scss'] += '\n$font-serif: Georgia, serif;\n$font-sans: Inter, sans-serif;'
}

function addSingleFontArtifacts(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  rawDtcg: unknown,
) {
  const fontFamilies = evidence.tokens.typography.fontFamilies as string[]
  const fontStacks = evidence.tokens.typography.fontStacks as string[]
  fontFamilies.push('Inter')
  fontStacks.push('Inter, sans-serif')
  const tokenEvidence = evidence.tokens.evidence as Record<string, Record<string, unknown>>
  const renderedOwner = {
    page: 'https://example.com/',
    routeId: HOME_ROUTE_ID,
    viewport: 'desktop',
    ownerId: 'font-inter',
    textRole: 'body',
    styles: {
      color: '#111111',
      backgroundColor: '#ffffff',
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: '24px',
      letterSpacing: 'normal',
    },
    source: {
      kind: 'direct-text',
      widthPx: 160,
      heightPx: 24,
      visibleWidthPx: 160,
      visibleHeightPx: 24,
      paintedAreaPx: 3840,
      captureIntersectionRatio: 1,
      effectiveClipPathAreaRatio: 1,
      ancestorClipCount: 0,
      clientRectCount: 1,
      glyphRectCount: 1,
      visibleBounds: { xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 },
      visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 }],
      visibleGlyphAreaPx: 3840,
      clipPathChain: [],
      nonRectangularClipPathCount: 0,
      clip: 'auto',
      clipPath: 'none',
      contentVisibility: 'visible',
      opacity: 1,
      filterOpacity: 1,
      filterChain: [],
      maskChain: [],
      blendChain: [],
      textIndentPx: 0,
      filter: 'none',
      glyphPaintKind: 'solid-color',
      foreground: '#111111',
    },
  }
  tokenEvidence['typography.fontFamilies.0'] = portableRenderedTextEvidence('Inter', [
    { ...renderedOwner, ownerId: 'font-inter-1' },
    { ...renderedOwner, ownerId: 'font-inter-2' },
  ])
  tokenEvidence['typography.fontStacks.0'] = portableRenderedTextEvidence('Inter, sans-serif', [
    { ...renderedOwner, ownerId: 'stack-inter-1' },
    { ...renderedOwner, ownerId: 'stack-inter-2' },
  ])
  const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
  ;(dtcg.typography.fontFamilies.$value as string[]).push('Inter')
  ;(dtcg.typography.fontStacks.$value as string[]).push('Inter, sans-serif')
  artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
    'spacing:\n',
    `typography:
  font-family-sans:
    fontFamily: Inter, sans-serif
spacing:
`,
  )
  artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
    '**Font families:** No portable font family was established; consult local typography Evidence before choosing a typeface.',
    '**Font families:** Inter',
  )
  artifacts['variables.css'] = artifacts['variables.css'].replace(' }', ' --font-sans: Inter, sans-serif; }')
  artifacts['theme.css'] = artifacts['theme.css'].replace(' }', ' --font-sans: Inter, sans-serif; }')
  artifacts['variables.scss'] += '\n$font-sans: Inter, sans-serif;'
}

function addEscapedGenericFontArtifacts(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  rawDtcg: unknown,
) {
  const escapedSerif = 's\\65 rif'
  evidence.tokens.typography.fontFamilies.push(escapedSerif)
  evidence.tokens.typography.fontStacks.push(escapedSerif)
  const tokenEvidence = evidence.tokens.evidence as Record<string, Record<string, unknown>>
  const renderedOwner = {
    page: 'https://example.com/',
    routeId: HOME_ROUTE_ID,
    viewport: 'desktop',
    ownerId: 'font-serif',
    textRole: 'body',
    styles: {
      color: '#111111',
      backgroundColor: '#ffffff',
      fontFamily: escapedSerif,
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: '24px',
      letterSpacing: 'normal',
    },
    source: {
      kind: 'direct-text',
      widthPx: 160,
      heightPx: 24,
      visibleWidthPx: 160,
      visibleHeightPx: 24,
      paintedAreaPx: 3840,
      captureIntersectionRatio: 1,
      effectiveClipPathAreaRatio: 1,
      ancestorClipCount: 0,
      clientRectCount: 1,
      glyphRectCount: 1,
      visibleBounds: { xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 },
      visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 }],
      visibleGlyphAreaPx: 3840,
      clipPathChain: [],
      nonRectangularClipPathCount: 0,
      clip: 'auto',
      clipPath: 'none',
      contentVisibility: 'visible',
      opacity: 1,
      filterOpacity: 1,
      filterChain: [],
      maskChain: [],
      blendChain: [],
      textIndentPx: 0,
      filter: 'none',
      glyphPaintKind: 'solid-color',
      foreground: '#111111',
    },
  }
  tokenEvidence['typography.fontFamilies.0'] = portableRenderedTextEvidence(escapedSerif, [
    { ...renderedOwner, ownerId: 'font-serif-1' },
    { ...renderedOwner, ownerId: 'font-serif-2' },
  ])
  tokenEvidence['typography.fontStacks.0'] = portableRenderedTextEvidence(escapedSerif, [
    { ...renderedOwner, ownerId: 'stack-serif-1' },
    { ...renderedOwner, ownerId: 'stack-serif-2' },
  ])
  const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
  ;(dtcg.typography.fontFamilies.$value as string[]).push(escapedSerif)
  ;(dtcg.typography.fontStacks.$value as string[]).push(escapedSerif)
  artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
    'spacing:\n',
    `typography:
  font-family-serif:
    fontFamily: ${escapedSerif}
spacing:
`,
  )
  artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
    '**Font families:** No portable font family was established; consult local typography Evidence before choosing a typeface.',
    `**Font families:** ${escapedSerif}`,
  )
  artifacts['variables.css'] = artifacts['variables.css'].replace(' }', ` --font-serif: ${escapedSerif}; }`)
  artifacts['theme.css'] = artifacts['theme.css'].replace(' }', ` --font-serif: ${escapedSerif}; }`)
  artifacts['variables.scss'] += `\n$font-serif: ${escapedSerif};`
}

function addDarkFontOverrideArtifacts(artifacts: Record<string, string>, rawDtcg: unknown) {
  const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & {
    dark: ReturnType<typeof bundleDtcg>
  }
  ;(dtcg.dark.typography.fontFamilies.$value as string[])[0] = 'Georgia'
  ;(dtcg.dark.typography.fontStacks.$value as string[])[0] = 'Georgia, serif'
  const darkEvidence = dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<
    string,
    ReturnType<typeof onePageRenderedTextEvidence>
  >
  darkEvidence['typography.fontFamilies.0'] = {
    ...darkEvidence['typography.fontFamilies.0'],
    value: 'Georgia',
  }
  darkEvidence['typography.fontStacks.0'] = {
    ...darkEvidence['typography.fontStacks.0'],
    value: 'Georgia, serif',
  }
  for (const owner of darkEvidence['typography.fontFamilies.0'].renderedTextOwners) {
    owner.styles.fontFamily = 'Georgia, serif'
  }
  for (const owner of darkEvidence['typography.fontStacks.0'].renderedTextOwners) {
    owner.styles.fontFamily = 'Georgia, serif'
  }
  const darkMode = dtcg.$extensions['com.imprint.darkMode'] as { overrides: Record<string, string> }
  darkMode.overrides['typography.font-family.1'] = 'Georgia'
  darkMode.overrides['typography.font-stack.1'] = 'Georgia, serif'

  artifacts['variables.css'] = artifacts['variables.css'].replace(
    '    --spacing-2: 8px;\n',
    '    --spacing-2: 8px;\n    --font-sans: Georgia, serif;\n',
  )
  artifacts['theme.css'] = artifacts['theme.css'].replace(
    '    --spacing-2: 8px;\n',
    '    --spacing-2: 8px;\n    --font-sans: Georgia, serif;\n',
  )
  artifacts['variables.scss'] = artifacts['variables.scss']
    .replace('$dark-spacing-2: 8px;', '$dark-spacing-2: 8px;\n$dark-font-sans: Georgia, serif;')
    .replace('  --spacing-2: 8px;\n}', '  --spacing-2: 8px;\n  --font-sans: Georgia, serif;\n}')
  artifacts['DESIGN.md'] = artifacts['DESIGN.md']
    .replace(
      '        - color.primary',
      `        - color.primary
        - typography.font-family.1
        - typography.font-stack.1`,
    )
    .replace(
      '        color.primary: "#101827"',
      `        color.primary: "#101827"
        typography.font-family.1: Georgia
        typography.font-stack.1: Georgia, serif`,
    )
    .replace(
      '      fontFamilies: {}',
      `      fontFamilies:
        font-family-sans:
          fontFamily: Georgia, serif`,
    )
}

function addSparseTypographyArtifacts(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  rawDtcg: unknown,
) {
  evidence.tokens.typography.fontSizes.push('1.75rem')
  evidence.tokens.typography.letterSpacings.push('1.12px')
  const tokenEvidence = evidence.tokens.evidence as Record<string, Record<string, unknown>>
  const renderedOwner = {
    page: 'https://example.com/',
    routeId: HOME_ROUTE_ID,
    viewport: 'desktop',
    ownerId: 'font-size-28-1',
    textRole: 'heading',
    styles: {
      color: '#111111',
      backgroundColor: '#ffffff',
      fontFamily: 'Inter, sans-serif',
      fontSize: '28px',
      fontWeight: '700',
      lineHeight: '36px',
      letterSpacing: '1.12px',
    },
    source: {
      kind: 'direct-text',
      widthPx: 240,
      heightPx: 36,
      visibleWidthPx: 240,
      visibleHeightPx: 36,
      paintedAreaPx: 8640,
      captureIntersectionRatio: 1,
      effectiveClipPathAreaRatio: 1,
      ancestorClipCount: 0,
      clientRectCount: 1,
      glyphRectCount: 1,
      visibleBounds: { xPx: 0, yPx: 0, widthPx: 240, heightPx: 36 },
      visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 240, heightPx: 36 }],
      visibleGlyphAreaPx: 8640,
      clipPathChain: [],
      nonRectangularClipPathCount: 0,
      clip: 'auto',
      clipPath: 'none',
      contentVisibility: 'visible',
      opacity: 1,
      filterOpacity: 1,
      filterChain: [],
      maskChain: [],
      blendChain: [],
      textIndentPx: 0,
      filter: 'none',
      glyphPaintKind: 'solid-color',
      foreground: '#111111',
    },
  }
  tokenEvidence['typography.fontSizes.0'] = portableRenderedTextEvidence('1.75rem', [
    renderedOwner,
    { ...renderedOwner, ownerId: 'font-size-28-2' },
  ])
  tokenEvidence['typography.letterSpacings.0'] = portableRenderedTextEvidence('1.12px', [
    { ...renderedOwner, ownerId: 'letter-spacing-1' },
    { ...renderedOwner, ownerId: 'letter-spacing-2' },
  ])
  const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & {
    typography: ReturnType<typeof bundleDtcg>['typography'] & { letterSpacing?: unknown }
  }
  ;(dtcg.typography.fontSizes.$value as string[]).push('1.75rem')
  dtcg.typography.letterSpacing = { $type: 'dimension', $value: ['1.12px'] }
  artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
    'spacing:\n',
    `typography:
  size-28:
    fontSize: 1.75rem
  letter-spacing-wide:
    letterSpacing: 1.12px
spacing:
`,
  )
  artifacts['variables.css'] = artifacts['variables.css'].replace(
    ' }',
    ' --font-size-28: 1.75rem; --letter-spacing-wide: 1.12px; }',
  )
  artifacts['theme.css'] = artifacts['theme.css'].replace(' }', ' --text-28: 1.75rem; --tracking-wide: 1.12px; }')
  artifacts['variables.scss'] += '\n$font-size-28: 1.75rem;\n$letter-spacing-wide: 1.12px;'
}

async function writeBundle(
  mutate?: (artifacts: Record<string, string>, evidence: ReturnType<typeof bundleEvidence>, dtcg: unknown) => void,
) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-artifact-audit-'))
  const evidence = bundleEvidence()
  const screenshot = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  const screenshotPath = path.join(directory, 'fixture-overview.png')
  await fs.writeFile(screenshotPath, screenshot)
  const screenshotHash = createHash('sha256').update(screenshot).digest('hex')
  evidence.pages.forEach((page) => {
    page.images = [
      {
        id: `image-${page.id}`,
        kind: 'overview',
        path: screenshotPath,
        width: 1,
        height: 1,
        capturedAt: '2026-09-02T00:00:00.000Z',
        contentHash: screenshotHash,
      },
    ]
  })
  const dtcg = bundleDtcg(evidence)
  const artifacts: Record<string, string> = {
    'DESIGN.md': validDocument,
    'design-evidence.json': '',
    'design-tokens.json': '',
    'design-profile.json': JSON.stringify({
      schemaVersion: '3',
      claimSource: 'deterministic-catalog',
      transferGrammar: {
        schemaVersion: '1',
        coreRules: [],
        componentRecipes: [
          {
            component: 'button',
            variant: 'primary',
            priority: 'P1',
            sourceInstances: 3,
            matchingStyleInstances: 3,
            pageCount: 2,
            identityConfidence: 0.95,
            reuseConfidence: 0.85,
            reuseScope: 'cross-page',
            observedStyles: { backgroundColor: '#2255ff', padding: '8px' },
            observed: {
              tokenRefs: ['color.primary'],
              evidence: [
                { evidenceId: 'button-home-1' },
                { evidenceId: 'button-about' },
                { evidenceId: 'button-home-2' },
              ],
              assertions: [
                {
                  kind: 'component',
                  target: 'button',
                  predicate: 'present',
                  scope: 'instance',
                  evidenceIds: ['button-home-1'],
                },
                {
                  kind: 'component',
                  target: 'button',
                  predicate: 'variant',
                  scope: 'instance',
                  evidenceIds: ['button-home-1'],
                  value: 'primary',
                },
                {
                  kind: 'component',
                  target: 'button',
                  predicate: 'present',
                  scope: 'instance',
                  evidenceIds: ['button-about'],
                },
                {
                  kind: 'component',
                  target: 'button',
                  predicate: 'variant',
                  scope: 'instance',
                  evidenceIds: ['button-about'],
                  value: 'primary',
                },
                {
                  kind: 'component',
                  target: 'button',
                  predicate: 'present',
                  scope: 'instance',
                  evidenceIds: ['button-home-2'],
                },
                {
                  kind: 'component',
                  target: 'button',
                  predicate: 'variant',
                  scope: 'instance',
                  evidenceIds: ['button-home-2'],
                  value: 'primary',
                },
              ],
            },
          },
        ],
      },
    }),
    'component-specs.json': JSON.stringify({
      schemaVersion: '2',
      components: [
        {
          component: 'button',
          variant: 'primary',
          role: 'primary-action',
          sourceInstances: 3,
          pageCount: 2,
          identityConfidence: 0.95,
          reuseConfidence: 0.85,
          reuseScope: 'cross-page',
          styles: { backgroundColor: ['#2255ff'], padding: ['8px'] },
          tokenRefs: ['color.primary'],
          stateRefs: [],
          evidenceRefs: ['button-home-1', 'button-about', 'button-home-2'],
        },
      ],
    }),
    'visual-qa.json': JSON.stringify({ schemaVersion: '1', summary: { pass: 0, warning: 0, fail: 0 }, checks: [] }),
    'variables.css':
      ':root { --color-background: #ffffff; --color-primary: #2255ff; --spacing-1: 4px; --spacing-2: 8px; }',
    'variables.scss': '$color-background: #ffffff;\n$color-primary: #2255ff;\n$spacing-1: 4px;\n$spacing-2: 8px;',
    'theme.css':
      '@theme { --color-background: #ffffff; --color-primary: #2255ff; --spacing-1: 4px; --spacing-2: 8px; }',
    'style-guide.html': '<!doctype html><title>Style guide</title>',
  }
  mutate?.(artifacts, evidence, dtcg)
  artifacts['design-evidence.json'] = JSON.stringify(evidence)
  artifacts['design-tokens.json'] = JSON.stringify(dtcg)
  await Promise.all(
    Object.entries(artifacts).map(([filename, source]) => fs.writeFile(path.join(directory, filename), source)),
  )
  return directory
}

async function writeGate21Bundle(
  language: 'en' | 'zh-CN',
  mutate?: (
    artifacts: Record<string, string>,
    evidence: ReturnType<typeof bundleEvidence>,
    dtcg: ReturnType<typeof bundleDtcg>,
  ) => void,
) {
  return writeBundle((artifacts, evidence, rawDtcg) => {
    const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
    evidence.source.language = language
    if (language === 'zh-CN') {
      artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
        '**Font families:** No portable font family was established; consult local typography Evidence before choosing a typeface.',
        '**字体族：** 尚未建立可移植字体族；选择字体前请查看局部排版证据。',
      )
    }
    const profile = JSON.parse(artifacts['design-profile.json'])
    profile.language = language
    const grammarText =
      language === 'zh-CN'
        ? {
            evidenceNote: '支持该迁移配方的证据',
            repeated:
              '代表性样式和已列令牌引用在这 {{count}} 个完全匹配的样式实例中重复出现；它们是已观察的共享子集，不是完整组件规范。',
            single: '代表性样式和令牌引用来自这个已观察实例；单个实例不能建立全站默认规则。',
            implementation: '仅当目标界面包含对应组件和变体时，复用这一代表性处理方式。',
          }
        : {
            evidenceNote: 'Evidence supporting this transfer recipe',
            repeated:
              'The representative styles and listed token references recur across these {{count}} exact-style matches; they are an observed subset, not a complete component specification.',
            single:
              'The representative styles and token references come from this observed instance; one instance does not establish a site-wide default.',
            implementation:
              'Reuse the representative treatment only when the target UI contains this component and variant.',
          }
    const repeatedStatement = (count: number) => grammarText.repeated.replace('{{count}}', String(count))
    const completeRecipe = (
      recipe: Record<string, unknown>,
      options: { useWhen: string; count: number; confidence: string; restrictions: string[] },
    ) => {
      recipe.useWhen = options.useWhen
      recipe.confidence = options.confidence
      recipe.states = []
      recipe.responsive = []
      recipe.restrictions = options.restrictions
      const observed = recipe.observed as Record<string, unknown>
      observed.statement = options.count === 1 ? grammarText.single : repeatedStatement(options.count)
      observed.implementation = grammarText.implementation
      observed.confidence = options.confidence
      observed.evidence = (observed.evidence as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        note: grammarText.evidenceNote,
      }))
      observed.source = 'deterministic-catalog'
    }
    completeRecipe(profile.transferGrammar.componentRecipes[0], {
      useWhen: 'primary-action',
      count: 3,
      confidence: 'high',
      restrictions: ['keep-variant-scope', 'do-not-invent-unobserved-state'],
    })
    profile.transferGrammar.componentRecipes.push(
      {
        component: 'card',
        variant: 'default',
        priority: 'P2',
        useWhen: 'content-group',
        sourceInstances: 1,
        matchingStyleInstances: 1,
        pageCount: 1,
        identityConfidence: 0.9,
        reuseConfidence: 0.25,
        reuseScope: 'isolated',
        observedStyles: {},
        observed: {
          tokenRefs: [],
          evidence: [{ evidenceId: 'card-home', note: grammarText.evidenceNote }],
          assertions: [
            {
              kind: 'component',
              target: 'card',
              predicate: 'present',
              scope: 'instance',
              evidenceIds: ['card-home'],
            },
            {
              kind: 'component',
              target: 'card',
              predicate: 'variant',
              scope: 'instance',
              evidenceIds: ['card-home'],
              value: 'default',
            },
          ],
          statement: grammarText.single,
          implementation: grammarText.implementation,
          confidence: 'low',
          source: 'deterministic-catalog',
        },
        states: [],
        responsive: [],
        restrictions: ['keep-variant-scope', 'do-not-promote-overlay-elevation', 'do-not-invent-unobserved-state'],
        confidence: 'low',
      },
      {
        component: 'list',
        variant: 'default',
        priority: 'P2',
        useWhen: 'content-collection',
        sourceInstances: 2,
        matchingStyleInstances: 2,
        pageCount: 2,
        identityConfidence: 0.9,
        reuseConfidence: 0.85,
        reuseScope: 'cross-page',
        observedStyles: {},
        observed: {
          tokenRefs: [],
          evidence: [
            { evidenceId: 'list-home', note: grammarText.evidenceNote },
            { evidenceId: 'list-about', note: grammarText.evidenceNote },
          ],
          assertions: [
            {
              kind: 'component',
              target: 'list',
              predicate: 'present',
              scope: 'instance',
              evidenceIds: ['list-home'],
            },
            {
              kind: 'component',
              target: 'list',
              predicate: 'variant',
              scope: 'instance',
              evidenceIds: ['list-home'],
              value: 'default',
            },
            {
              kind: 'component',
              target: 'list',
              predicate: 'present',
              scope: 'instance',
              evidenceIds: ['list-about'],
            },
            {
              kind: 'component',
              target: 'list',
              predicate: 'variant',
              scope: 'instance',
              evidenceIds: ['list-about'],
              value: 'default',
            },
          ],
          statement: repeatedStatement(2),
          implementation: grammarText.implementation,
          confidence: 'high',
          source: 'deterministic-catalog',
        },
        states: [],
        responsive: [],
        restrictions: ['keep-variant-scope', 'do-not-invent-unobserved-state'],
        confidence: 'high',
      },
    )
    evidence.components.push(
      {
        id: 'card-home',
        pageId: 'page-home-desktop',
        sectionId: 'section-home',
        type: 'card',
        rect: { x: 0, y: 0.2, width: 0.4, height: 0.2 },
        styles: {},
        confidence: 0.9,
        tokenRefs: [],
        stateRefs: [],
        evidenceRefs: ['section-home'],
      },
      {
        id: 'list-home',
        pageId: 'page-home-desktop',
        sectionId: 'section-home',
        type: 'list',
        rect: { x: 0, y: 0.5, width: 0.4, height: 0.2 },
        styles: {},
        confidence: 0.9,
        tokenRefs: [],
        stateRefs: [],
        evidenceRefs: ['section-home'],
      },
      {
        id: 'list-about',
        pageId: 'page-about-desktop',
        sectionId: 'section-about',
        type: 'list',
        rect: { x: 0, y: 0.5, width: 0.4, height: 0.2 },
        styles: {},
        confidence: 0.9,
        tokenRefs: [],
        stateRefs: [],
        evidenceRefs: ['section-about'],
      },
    )
    evidence.sections.find((section) => section.id === 'section-home')!.componentRefs.push('card-home', 'list-home')
    evidence.sections.find((section) => section.id === 'section-about')!.componentRefs.push('list-about')
    artifacts['design-profile.json'] = JSON.stringify(profile)

    const candidateEvidence = (value: string, pageCount: number) => ({
      ...portableEvidence,
      value,
      reuseScope: 'local',
      observationCount: pageCount + 2,
      ownerCount: pageCount + 2,
      pageCount,
      captureCount: pageCount,
      eligiblePageCount: 2,
      pageSupportRatio: pageCount / 2,
      pages: pageCount === 2 ? ['https://example.com/', 'https://example.com/about'] : ['https://example.com/'],
      pageRefs: pageCount === 2 ? [HOME_ROUTE_ID, ABOUT_ROUTE_ID] : [HOME_ROUTE_ID],
    })
    const declaredColor = {
      id: 'candidate.colors.declared',
      group: 'colors',
      value: '#123456',
      provenance: 'observed-color',
      rejectionReason: 'declared-only',
      evidence: candidateEvidence('#123456', 2),
    }
    const observedColor = {
      id: 'candidate.colors.observed',
      group: 'colors',
      value: '#654321',
      provenance: 'observed-color',
      rejectionReason: 'local-scope',
      evidence: candidateEvidence('#654321', 1),
    }
    const spacingCandidate = {
      id: 'candidate.spacing.local',
      group: 'spacing',
      value: '2px',
      provenance: 'built-token',
      rejectionReason: 'local-scope',
      evidence: candidateEvidence('2px', 1),
    }
    const secondSpacingCandidate = {
      id: 'candidate.spacing.local-two',
      group: 'spacing',
      value: '3px',
      provenance: 'built-token',
      rejectionReason: 'local-scope',
      evidence: candidateEvidence('3px', 2),
    }
    evidence.tokens.candidates = {
      values: [declaredColor, observedColor, spacingCandidate, secondSpacingCandidate],
      colors: [
        {
          id: declaredColor.id,
          value: declaredColor.value,
          kind: 'declared-only',
          observationCount: declaredColor.evidence.observationCount,
          pageCount: declaredColor.evidence.pageCount,
          captureCount: declaredColor.evidence.captureCount,
          sources: ['css-declaration'],
        },
        {
          id: observedColor.id,
          value: observedColor.value,
          kind: 'observed-unassigned',
          observationCount: observedColor.evidence.observationCount,
          pageCount: observedColor.evidence.pageCount,
          captureCount: observedColor.evidence.captureCount,
          sources: ['computed-style'],
        },
      ],
    } as never
    dtcg.$extensions['com.imprint.candidates'] = { values: evidence.tokens.candidates.values }

    for (const page of evidence.pages) {
      page.horizontalOverflow = true
      page.viewportWidth = page.viewport === 'desktop' ? 1440 : 375
      page.contentWidth = page.viewport === 'desktop' ? 1800 : page.id === 'page-home-mobile' ? 900 : 920
    }
    evidence.topology.pages.push(
      { pageId: 'page-home-mobile', sectionIds: [] },
      { pageId: 'page-about-mobile', sectionIds: [] },
    )

    artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
      const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
      extension.schema = 'imprint.design-system/2'
      extension.componentSummary = {
        patterns: 3,
        instances: 6,
        reusablePatterns: 2,
        actionablePatterns: 1,
        renderedP1Patterns: 1,
        omittedP1Patterns: 0,
        yamlComponentContracts: 1,
        omittedLocalPatterns: 1,
        omittedReusablePatterns: 1,
      }
      extension.candidateSummary = {
        scope: 'preview',
        previewLimitPerKind: 5,
        fullEvidenceArtifact: 'tokens-json',
        declaredColors: { total: 1, included: 1, omitted: 0 },
        observedUnassignedColors: { total: 1, included: 1, omitted: 0 },
        tokenValues: { total: 2, included: 2, omitted: 0 },
      }
      extension.candidates = {
        declaredColors: [{ value: '#123456', pageCount: 2 }],
        observedUnassignedColors: [{ value: '#654321', pageCount: 1 }],
        tokenValues: [
          { value: '2px', pageCount: 1 },
          { value: '3px', pageCount: 2 },
        ],
      }
    })
    const recipeBlock =
      language === 'zh-CN'
        ? `#### 按钮 · 主要

_3 个代表样式匹配实例，覆盖 2 个页面 · 身份 0.95 · 复用 0.85 · 跨页观察_

- **适用场景：** 目标页面需要一个主要操作时
- **观察配方：** ${repeatedStatement(3)}
  - **相关令牌：** \`color.primary\`
  - **代表性样式：** \`background-color: #2255ff\`、\`padding: 8px\``
        : `#### button · primary

_3 representative-style match(es) across 2 page(s) · identity 0.95 · reuse 0.85 · observed across pages_

- **Use when:** the target needs its principal action
- **Observed recipe:** ${repeatedStatement(3)}
  - **Related tokens:** \`color.primary\`
  - **Representative styles:** \`background-color: #2255ff\`, \`padding: 8px\``
    const p2 =
      language === 'zh-CN'
        ? `### 局部设计观察

#### 局部或专用组件模式

- **卡片：** 1 个局部模式，1 个代表性实例
- **列表：** 1 个局部模式，2 个代表性实例`
        : `### Local Design Observations

#### Local or specialized component patterns

- **card:** 1 local pattern(s), 1 representative instance(s)
- **list:** 1 local pattern(s), 2 representative instance(s)`
    const topology =
      language === 'zh-CN'
        ? `### 页面拓扑

- \`desktop\` · 2 个路由 · 示例：https://example.com/; https://example.com/about：检测到横向溢出（内容 1800px > 视口 1440px）；视口外内容不能视为已隐藏或已重排
- \`mobile\` · 1 个路由 · 示例：https://example.com/：检测到横向溢出（内容 900px > 视口 375px）；视口外内容不能视为已隐藏或已重排
- \`mobile\` · 1 个路由 · 示例：https://example.com/about：检测到横向溢出（内容 920px > 视口 375px）；视口外内容不能视为已隐藏或已重排`
        : `### Page Topology

- \`desktop\` · 2 routes · examples: https://example.com/; https://example.com/about: horizontal overflow observed (content 1800px > viewport 1440px); off-screen content is not evidence of hiding or reflow
- \`mobile\` · 1 route · example: https://example.com/: horizontal overflow observed (content 900px > viewport 375px); off-screen content is not evidence of hiding or reflow
- \`mobile\` · 1 route · example: https://example.com/about: horizontal overflow observed (content 920px > viewport 375px); off-screen content is not evidence of hiding or reflow`
    artifacts['DESIGN.md'] = artifacts['DESIGN.md']
      .replace(
        `#### Primary button

_3 representative-style matches across 2 pages · identity 0.95 · reuse 0.85_`,
        recipeBlock,
      )
      .concat(
        `\n## Do's and Don'ts\n\n${p2}\n\n## ${language === 'zh-CN' ? '设计证据概览' : 'Design Evidence Overview'}\n\n${topology}\n`,
      )
    mutate?.(artifacts, evidence, dtcg)
  })
}

function configureOrdinaryActionRecipe(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  language: 'en' | 'zh-CN',
  forgePrimaryUse = false,
) {
  for (const component of evidence.components.filter((candidate) => candidate.type === 'button')) {
    component.role = 'action'
  }
  const profile = JSON.parse(artifacts['design-profile.json'])
  const recipe = profile.transferGrammar.componentRecipes.find(
    (candidate: { component: string }) => candidate.component === 'button',
  )
  recipe.variant = 'action'
  recipe.useWhen = forgePrimaryUse ? 'primary-action' : 'action'
  for (const assertion of recipe.observed.assertions) {
    if (assertion.predicate === 'variant') assertion.value = 'action'
  }
  artifacts['design-profile.json'] = JSON.stringify(profile)

  const specs = JSON.parse(artifacts['component-specs.json'])
  specs.components[0].variant = 'action'
  specs.components[0].role = 'action'
  artifacts['component-specs.json'] = JSON.stringify(specs)

  artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
    const components = frontMatterValue.components as Record<string, unknown>
    components['button-action'] = components['button-primary']
    delete components['button-primary']
  })
  artifacts['DESIGN.md'] = artifacts['DESIGN.md']
    .replace(
      language === 'zh-CN' ? '#### 按钮 · 主要' : '#### button · primary',
      language === 'zh-CN' ? '#### 按钮 · 操作' : '#### button · action',
    )
    .replace(
      language === 'zh-CN'
        ? '- **适用场景：** 目标页面需要一个主要操作时'
        : '- **Use when:** the target needs its principal action',
      forgePrimaryUse
        ? language === 'zh-CN'
          ? '- **适用场景：** 目标页面需要一个主要操作时'
          : '- **Use when:** the target needs its principal action'
        : language === 'zh-CN'
          ? '- **适用场景：** 目标页面需要次要或普通操作时'
          : '- **Use when:** the target needs a supporting or ordinary action',
    )
}

function configureLargeComponentSample(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
): string[] {
  const homeIds = Array.from({ length: 13 }, (_, index) => `button-home-${String(index + 1).padStart(2, '0')}`)
  const aboutIds = Array.from({ length: 12 }, (_, index) => `button-about-${String(index + 1).padStart(2, '0')}`)
  const components = [
    ...homeIds.map((id, index) => ({
      id,
      pageId: 'page-home-desktop',
      sectionId: 'section-home',
      type: 'button',
      role: 'primary-action',
      rect: { x: index * 0.01, y: 0, width: 0.1, height: 0.05 },
      styles: { backgroundColor: '#2255ff', padding: '8px' },
      confidence: 0.95,
      tokenRefs: ['color.primary'],
      stateRefs: [],
      evidenceRefs: ['section-home'],
    })),
    ...aboutIds.map((id, index) => ({
      id,
      pageId: 'page-about-desktop',
      sectionId: 'section-about',
      type: 'button',
      role: 'primary-action',
      rect: { x: index * 0.01, y: 0, width: 0.1, height: 0.05 },
      styles: { backgroundColor: '#2255ff', padding: '8px' },
      confidence: 0.95,
      tokenRefs: ['color.primary'],
      stateRefs: [],
      evidenceRefs: ['section-about'],
    })),
  ]
  evidence.components = components
  evidence.sections.find((section) => section.id === 'section-home')!.componentRefs = homeIds
  evidence.sections.find((section) => section.id === 'section-about')!.componentRefs = aboutIds

  const evidenceRefs = aboutIds.flatMap((aboutId, index) => [homeIds[index], aboutId])
  const profile = JSON.parse(artifacts['design-profile.json'])
  const recipe = profile.transferGrammar.componentRecipes[0]
  recipe.sourceInstances = 25
  recipe.matchingStyleInstances = 25
  recipe.observed.evidence = evidenceRefs.map((evidenceId) => ({ evidenceId }))
  recipe.observed.assertions = evidenceRefs.flatMap((evidenceId) => [
    {
      kind: 'component',
      target: 'button',
      predicate: 'present',
      scope: 'instance',
      evidenceIds: [evidenceId],
    },
    {
      kind: 'component',
      target: 'button',
      predicate: 'variant',
      scope: 'instance',
      evidenceIds: [evidenceId],
      value: 'primary',
    },
  ])
  artifacts['design-profile.json'] = JSON.stringify(profile)

  const specs = JSON.parse(artifacts['component-specs.json'])
  specs.components[0].sourceInstances = 25
  specs.components[0].evidenceRefs = evidenceRefs
  artifacts['component-specs.json'] = JSON.stringify(specs)
  artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (value) => {
    const extension = (value['x-imprint'] as Array<Record<string, unknown>>)[0]
    const summary = extension.componentSummary as { instances: number; details: Array<Record<string, unknown>> }
    summary.instances = 25
    summary.details[0].count = 25
    summary.details[0].matchingStyleInstances = 25
  }).replace('_3 representative-style matches', '_25 representative-style matches')
  return evidenceRefs
}

function configureGeometrySeparatedButtonPatterns(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
) {
  // Non-zero horizontal padding excludes these square controls from the stricter icon-sized heuristic.
  // Their lack of rendered text and compact square geometry must still keep them in the icon pattern.
  const sharedStyles = { backgroundColor: '#2255ff', padding: '16px 8px' }
  for (const page of evidence.pages) {
    page.viewportWidth = page.viewport === 'desktop' ? 1000 : 375
    page.viewportHeight = page.viewport === 'desktop' ? 1000 : 667
    page.contentWidth = page.viewportWidth
    page.contentHeight = page.viewportHeight
  }

  for (const component of evidence.components) {
    component.role = 'action'
    component.rect = { ...component.rect, width: 0.05, height: 0.05 }
    component.styles = sharedStyles
    component.tokenRefs = ['color.primary']
  }
  evidence.components.push({
    id: 'button-text-home',
    pageId: 'page-home-desktop',
    sectionId: 'section-home',
    type: 'button',
    role: 'action',
    rect: { x: 0.4, y: 0, width: 0.12, height: 0.05 },
    styles: sharedStyles,
    confidence: 0.95,
    tokenRefs: ['color.primary'],
    stateRefs: [],
    evidenceRefs: ['section-home'],
  })
  evidence.sections.find((section) => section.id === 'section-home')!.componentRefs.push('button-text-home')

  const profile = JSON.parse(artifacts['design-profile.json'])
  const iconRecipe = profile.transferGrammar.componentRecipes[0]
  iconRecipe.variant = 'icon'
  iconRecipe.useWhen = 'action'
  iconRecipe.observedStyles = sharedStyles
  iconRecipe.observed.tokenRefs = ['color.primary']
  iconRecipe.confidence = 'high'
  iconRecipe.states = []
  iconRecipe.responsive = []
  iconRecipe.restrictions = ['keep-variant-scope', 'do-not-invent-unobserved-state']
  iconRecipe.observed.statement =
    'The representative styles and listed token references recur across these 3 exact-style matches; they are an observed subset, not a complete component specification.'
  iconRecipe.observed.implementation =
    'Reuse the representative treatment only when the target UI contains this component and variant.'
  iconRecipe.observed.confidence = 'high'
  iconRecipe.observed.evidence = iconRecipe.observed.evidence.map((item: { evidenceId: string }) => ({
    ...item,
    note: 'Evidence supporting this transfer recipe',
  }))
  iconRecipe.observed.source = 'deterministic-catalog'
  iconRecipe.observed.assertions = componentAssertions(
    iconRecipe.observed.evidence.map((item: { evidenceId: string }) => item.evidenceId),
    'button',
    'icon',
  )
  profile.transferGrammar.componentRecipes.push({
    component: 'button',
    variant: 'action',
    priority: 'P2',
    useWhen: 'action',
    sourceInstances: 1,
    matchingStyleInstances: 1,
    pageCount: 1,
    identityConfidence: 0.95,
    reuseConfidence: 0.25,
    reuseScope: 'isolated',
    observedStyles: sharedStyles,
    observed: {
      tokenRefs: ['color.primary'],
      evidence: [{ evidenceId: 'button-text-home', note: 'Evidence supporting this transfer recipe' }],
      assertions: componentAssertions(['button-text-home'], 'button', 'action'),
      statement:
        'The representative styles and token references come from this observed instance; one instance does not establish a site-wide default.',
      implementation: 'Reuse the representative treatment only when the target UI contains this component and variant.',
      confidence: 'low',
      source: 'deterministic-catalog',
    },
    states: [],
    responsive: [],
    restrictions: ['keep-variant-scope', 'do-not-invent-unobserved-state'],
    confidence: 'low',
  })
  artifacts['design-profile.json'] = JSON.stringify(profile)

  const specs = JSON.parse(artifacts['component-specs.json'])
  const iconSpec = specs.components[0]
  iconSpec.variant = 'icon'
  iconSpec.role = 'action'
  iconSpec.styles = { backgroundColor: ['#2255ff'], padding: ['16px 8px'] }
  artifacts['component-specs.json'] = JSON.stringify(specs)

  artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
    frontMatterValue.components = { 'button-icon': { backgroundColor: '{colors.primary}' } }
    const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
    extension.componentSummary = {
      patterns: 2,
      instances: 4,
      reusablePatterns: 1,
      actionablePatterns: 1,
      renderedP1Patterns: 1,
      omittedP1Patterns: 0,
      yamlComponentContracts: 1,
      omittedLocalPatterns: 1,
      omittedReusablePatterns: 0,
    }
  })
  artifacts['DESIGN.md'] = artifacts['DESIGN.md']
    .replace(
      `#### Primary button

_3 representative-style matches across 2 pages · identity 0.95 · reuse 0.85_`,
      `#### button · icon

_3 representative-style match(es) across 2 page(s) · identity 0.95 · reuse 0.85 · observed across pages_

- **Use when:** the target needs a supporting or ordinary action
- **Observed recipe:** The representative styles and listed token references recur across these 3 exact-style matches; they are an observed subset, not a complete component specification.
  - **Related tokens:** \`color.primary\`
  - **Representative styles:** \`background-color: #2255ff\`, \`padding: 16px 8px\``,
    )
    .concat(
      `\n## Do's and Don'ts\n\n### Local Design Observations\n\n#### Local or specialized component patterns\n\n- **button:** 1 local pattern(s), 1 representative instance(s)\n`,
    )
}

function configureGroupedResponsiveProjection(
  artifacts: Record<string, string>,
  evidence: ReturnType<typeof bundleEvidence>,
  language: 'en' | 'zh-CN',
) {
  const page = (id: string) => evidence.pages.find((candidate) => candidate.id === id)!
  const sectionTemplate = evidence.sections.find((section) => section.id === 'section-home')!
  const section = (id: string, pageId: string) => ({
    ...structuredClone(sectionTemplate),
    id,
    pageId,
    componentRefs: [],
  })
  const sections = {
    homeDesktopA: evidence.sections.find((candidate) => candidate.id === 'section-home')!,
    homeDesktopB: section('responsive-home-desktop-b', page('page-home-desktop').id),
    homeMobileA: section('responsive-home-mobile-a', page('page-home-mobile').id),
    homeMobileB: section('responsive-home-mobile-b', page('page-home-mobile').id),
    aboutDesktopA: evidence.sections.find((candidate) => candidate.id === 'section-about')!,
    aboutDesktopB: section('responsive-about-desktop-b', page('page-about-desktop').id),
    aboutMobileA: section('responsive-about-mobile-a', page('page-about-mobile').id),
    aboutMobileB: section('responsive-about-mobile-b', page('page-about-mobile').id),
  }
  evidence.sections.push(
    sections.homeDesktopB,
    sections.homeMobileA,
    sections.homeMobileB,
    sections.aboutDesktopB,
    sections.aboutMobileA,
    sections.aboutMobileB,
  )
  const observation = (
    id: string,
    desktopSection: (typeof sections)['homeDesktopA'],
    mobileSection: (typeof sections)['homeMobileA'],
    from: string,
    to: string,
  ) => ({
    id,
    sectionId: desktopSection.id,
    fromViewport: 'desktop',
    toViewport: 'mobile',
    changeType: 'reflow' as const,
    changedProperties: ['gridTemplateColumns'],
    changes: { gridTemplateColumns: { from, to } },
    summary: 'Observed grid change.',
    evidenceRefs: [desktopSection.id, mobileSection.id],
  })
  evidence.responsiveObservations = [
    observation('responsive-home-a', sections.homeDesktopA, sections.homeMobileA, 'repeat(3, 1fr)', '1fr'),
    observation('responsive-home-b', sections.homeDesktopB, sections.homeMobileB, 'repeat(3, 1fr)', '1fr'),
    observation('responsive-about-a', sections.aboutDesktopA, sections.aboutMobileA, 'repeat(3, 1fr)', '1fr'),
    observation(
      'responsive-about-b',
      sections.aboutDesktopB,
      sections.aboutMobileB,
      'repeat(4, 1fr)',
      'repeat(2, 1fr)',
    ),
  ]

  const heading = language === 'zh-CN' ? '### 响应式结构观察' : '### Responsive Structure Observations'
  const sharedLine =
    language === 'zh-CN'
      ? '- 桌面端 → 移动端 · 内容 · 布局重排（网格列） · 支持：2 个路由 · 3 个观察实例 · 示例：https://example.com/; https://example.com/about'
      : '- desktop → mobile · content · layout reflow (grid columns) · support: 2 routes · 3 observed instances · examples: https://example.com/; https://example.com/about'
  const sharedValues =
    language === 'zh-CN' ? '  - 网格列: repeat(3, 1fr) → 1fr' : '  - grid columns: repeat(3, 1fr) → 1fr'
  const distinctLine =
    language === 'zh-CN'
      ? '- 桌面端 → 移动端 · 内容 · 布局重排（网格列） · 支持：1 个路由 · 1 个观察实例 · 示例：https://example.com/about'
      : '- desktop → mobile · content · layout reflow (grid columns) · support: 1 route · 1 observed instance · examples: https://example.com/about'
  const distinctValues =
    language === 'zh-CN'
      ? '  - 网格列: repeat(4, 1fr) → repeat(2, 1fr)'
      : '  - grid columns: repeat(4, 1fr) → repeat(2, 1fr)'
  artifacts['DESIGN.md'] += `\n${heading}\n\n${sharedLine}\n${sharedValues}\n${distinctLine}\n${distinctValues}\n`
  return { distinctLine, distinctValues, sharedLine }
}

describe('DESIGN.md artifact audit', () => {
  it('passes a structurally valid, evidence-backed document without imposing a total line limit', () => {
    const result = auditDesignDoc(validDocument, 'DESIGN.md')

    expect(result.hardFailures).toEqual([])
    expect(result.classification).toBe('pass')
    expect(result.metrics).toMatchObject({ p1Recipes: 1, reusableComponentPatterns: 1 })
  })

  it('rejects low-reuse details, duplicate projections, and candidate source arrays', () => {
    const invalidDocument = validDocument
      .replace(
        '    backgroundColor: "{colors.primary}"',
        `    backgroundColor: "{colors.primary}"
    textColor: "{colors.missing}"`,
      )
      .replace('reuseConfidence: 0.85', 'reuseConfidence: 0.32')
      .replace('matchingStyleInstances: 3', 'matchingStyleInstances: 1')
      .replace(
        'componentSummary:',
        `candidates:
      tokenValues:
        - value: 2px
          sources: [computed:spacing]
    componentSummary:`,
      )
      .replace(
        '#### Primary button',
        `| Type | Instances | Identity confidence | Reuse confidence | Reuse scope | Representative styles |
|---|---:|---:|---:|---|---:|
| button | 3 | 0.95 | 0.85 | cross-page | 3 |

#### Primary button

#### Primary button

- **Observed responsive behavior:** section grid changed
- **已观察响应式行为：** 区块网格发生变化`,
      )
      .replace('reuse 0.85', 'reuse 0.32')
      .replace('_3 representative-style', '_1 representative-style')
    const result = auditDesignDoc(invalidDocument, 'DESIGN.md')

    expect(result.classification).toBe('analyzer-failure')
    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'low-reuse-component-detail:button-primary',
        'singleton-component-detail:button-primary',
        'candidate-preview-contains-source-arrays',
        'duplicate-component-recipe:Primary button',
        'duplicate-component-table-and-recipes',
        'unbounded-component-detail-table',
        'component-recipe-contains-section-responsive-claim',
        'low-reuse-p1-recipe',
        'singleton-p1-recipe',
        'design-md-lint:broken-ref',
      ]),
    )
  })

  it('rejects a syntactically valid document that omits observed evidence metadata', () => {
    const result = auditDesignDoc(
      `---
version: alpha
name: Missing Evidence
description: This document has no observed evidence envelope.
x-imprint:
  - schema: imprint.design-system/2
---

## Components
`,
      'DESIGN.md',
    )

    expect(result.classification).toBe('analyzer-failure')
    expect(result.hardFailures).toContain('missing-observed-evidence')
  })

  it('does not let non-finite YAML metrics pass numeric quality gates', () => {
    const result = auditDesignDoc(
      validDocument
        .replace('reuseConfidence: 0.85', 'reuseConfidence: .nan')
        .replace('matchingStyleInstances: 3', 'matchingStyleInstances: null'),
      'DESIGN.md',
    )

    expect(result.classification).toBe('analyzer-failure')
    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'non-finite-reuse-component-detail:button-primary',
        'non-finite-component-style-count:button-primary',
      ]),
    )
  })

  it('passes only when the complete artifact bundle agrees with its evidence', async () => {
    const directory = await writeBundle()
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toEqual([])
    expect(result.classification).toBe('pass')
    expect(result.metrics).toMatchObject({
      bundleArtifacts: 10,
      portableTokens: 4,
      componentSpecs: 1,
      screenshotAssets: 4,
      validOverviewScreenshots: 4,
    })
  })

  it('requires exact semantic owners when a bundle claims the current owner model', async () => {
    const currentBundle = await writeBundle((_artifacts, evidence) => {
      ;(evidence as typeof evidence & { semanticOwnerVersion: '1' }).semanticOwnerVersion = '1'
      const backgroundEvidence = evidence.tokens.evidence['colors.background'] as Record<string, unknown>
      backgroundEvidence.semanticOwnerRefs = [
        {
          page: 'https://example.com/',
          routeId: HOME_ROUTE_ID,
          viewport: 'desktop',
          ownerId: 'body',
          domain: 'foundation',
          role: 'page-canvas',
        },
      ]
      for (const component of evidence.components) {
        Object.assign(component, {
          elementKind: 'button',
          semanticIdentity: 'button',
          visualTreatment: 'filled',
          usageContext: 'general',
          visualOwnerKey: component.id,
          semanticSourceKey: component.id,
        })
      }
      const componentSpecs = JSON.parse(_artifacts['component-specs.json'])
      Object.assign(componentSpecs.components[0], {
        semanticIdentity: 'button',
        visualTreatment: 'filled',
        usageContext: 'general',
      })
      _artifacts['component-specs.json'] = JSON.stringify(componentSpecs)
    })
    expect((await auditArtifactBundle(currentBundle)).hardFailures).toEqual([])

    const missingOwners = await writeBundle((_artifacts, evidence) => {
      ;(evidence as typeof evidence & { semanticOwnerVersion: '1' }).semanticOwnerVersion = '1'
    })
    expect((await auditArtifactBundle(missingOwners)).hardFailures).toContain(
      'semantic-surface-owner-envelope-invalid:background',
    )
  })

  it('rejects equal-literal component color references from an incompatible semantic channel', async () => {
    const evidenceMismatch = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0]
      component.styles = { ...component.styles, color: '#ffffff' }
      component.tokenRefs = [...component.tokenRefs, 'color.background']
    })
    expect((await auditArtifactBundle(evidenceMismatch)).hardFailures).toContain(
      'semantic-token-ref-mismatch:evidence.component.button-home-1:color.background',
    )

    const frontMatterMismatch = await writeBundle((artifacts) => {
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatter) => {
        const component = (frontMatter.components as Record<string, Record<string, string>>)['button-primary']
        component.textColor = '{colors.background}'
      })
    })
    expect((await auditArtifactBundle(frontMatterMismatch)).hardFailures).toContain(
      'design-doc-component-token-map-mismatch',
    )
  })

  it('requires independent per-route owners for portable geometry evidence', async () => {
    const directory = await writeBundle((_artifacts, evidence) => {
      const spacingEvidence = evidence.tokens.evidence['spacing.0'] as Record<string, unknown>
      spacingEvidence.foundationOwnerCount = 0
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'portable-geometry-owner-support-invalid:spacing.0',
    )
  })

  it('accepts independently consistent foreground/background pair evidence', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 0.9,
        contrastRatio: 17.74,
        textRoles: ['body', 'heading'],
      })
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual([])
  })

  it('rejects zero-share and route-count mutations in portable foreground pair evidence', async () => {
    const zeroShareDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 0,
        contrastRatio: 17.74,
        textRoles: ['body'],
      })
    })
    expect((await auditArtifactBundle(zeroShareDirectory)).hardFailures).toContain(
      'foundation-foreground-pair-route-support-mismatch',
    )

    const routeCountDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        contrastRatio: 17.74,
        textRoles: ['body'],
      })
      const tokenEvidence = evidence.tokens.evidence['colors.foreground'] as unknown as {
        pairedSurface: { routeSupport: unknown[] }
      }
      tokenEvidence.pairedSurface.routeSupport.pop()
    })
    expect((await auditArtifactBundle(routeCountDirectory)).hardFailures).toContain(
      'foundation-foreground-pair-route-support-mismatch',
    )
  })

  it('requires exact rendered owner samples for a portable foreground pair', async () => {
    const missingSourceDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        contrastRatio: 17.74,
        textRoles: ['body'],
      })
      const tokenEvidence = evidence.tokens.evidence['colors.foreground'] as unknown as { sources: string[] }
      tokenEvidence.sources = tokenEvidence.sources.filter((source) => source !== 'rendered:text')
    })
    expect((await auditArtifactBundle(missingSourceDirectory)).hardFailures).toContain(
      'missing-rendered-text-pair-source:colors.foreground',
    )

    const wrongBackgroundDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        contrastRatio: 17.74,
        textRoles: ['body'],
      })
      const tokenEvidence = evidence.tokens.evidence['colors.foreground'] as unknown as {
        renderedTextOwners: Array<{ styles: { backgroundColor: string } }>
      }
      tokenEvidence.renderedTextOwners[0].styles.backgroundColor = '#000000'
    })
    expect((await auditArtifactBundle(wrongBackgroundDirectory)).hardFailures).toContain(
      'rendered-text-owner-value-mismatch:colors.foreground',
    )

    const wrongPaintDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        contrastRatio: 17.74,
        textRoles: ['body'],
      })
      const tokenEvidence = evidence.tokens.evidence['colors.foreground'] as unknown as {
        renderedTextOwners: Array<{ source: { foreground: string } }>
      }
      tokenEvidence.renderedTextOwners[0].source.foreground = '#ffffff'
    })
    expect((await auditArtifactBundle(wrongPaintDirectory)).hardFailures).toContain(
      'rendered-text-owner-value-mismatch:colors.foreground',
    )

    const inflatedSampleDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 0.9,
        contrastRatio: 17.74,
        textRoles: ['body'],
      })
      const tokenEvidence = evidence.tokens.evidence['colors.foreground'] as unknown as {
        renderedTextOwners: Array<Record<string, unknown>>
      }
      tokenEvidence.renderedTextOwners.push({
        ...structuredClone(tokenEvidence.renderedTextOwners[0]),
        ownerId: 'forged-ninth-sample',
      })
    })
    expect((await auditArtifactBundle(inflatedSampleDirectory)).hardFailures).toContain(
      'rendered-text-pair-sample-mismatch:colors.foreground',
    )
  })

  it('rejects an unreadable portable foreground even when its pair metadata claims support', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#ffffff', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 0.75,
        contrastRatio: 1,
        textRoles: ['body'],
      })
    })

    const result = await auditArtifactBundle(directory)
    expect(result.hardFailures).toContain('foundation-foreground-background-low-contrast')
    expect(result.hardFailures).toContain('foundation-foreground-pair-insufficient-support')
  })

  it('rejects a portable foreground that is readable only against a local paired surface', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, rawDtcg, '#000000', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        contrastRatio: 21,
        textRoles: ['body', 'heading'],
      })
      const background = '#02090a'
      evidence.tokens.colors.background = background
      evidence.tokens.evidence['colors.background'].value = background
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.color.background = { $type: 'color', $value: background }
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatter) => {
        ;(frontMatter.colors as Record<string, string>).background = background
      }).replace('| `--color-background` | `#ffffff` |', `| \`--color-background\` | \`${background}\` |`)
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '--color-background: #ffffff;',
        `--color-background: ${background};`,
      )
      artifacts['variables.scss'] = artifacts['variables.scss'].replace(
        '$color-background: #ffffff;',
        `$color-background: ${background};`,
      )
      artifacts['theme.css'] = artifacts['theme.css'].replace(
        '--color-background: #ffffff;',
        `--color-background: ${background};`,
      )
    })

    const result = await auditArtifactBundle(directory)
    expect(result.hardFailures).not.toContain('foundation-foreground-background-low-contrast')
    expect(result.hardFailures).toContain('foundation-foreground-global-background-low-contrast')
  })

  it('independently rejects chromatic or surface-valued subtle border roles', async () => {
    const chromatic = await writeBundle((_artifacts, evidence) => {
      evidence.tokens.colors['border-subtle'] = '#2255ff'
      evidence.tokens.evidence['colors.border-subtle'] = {
        ...portableEvidence,
        value: '#2255ff',
        sources: ['usage:borderColor'],
        roleCounts: { borderColor: 4 },
      }
    })
    expect((await auditArtifactBundle(chromatic)).hardFailures).toEqual(
      expect.arrayContaining([
        'foundation-border-subtle-nonneutral',
        'foundation-border-subtle-missing-structural-evidence',
      ]),
    )

    const surface = await writeBundle((_artifacts, evidence) => {
      evidence.tokens.colors['border-subtle'] = '#ffffff'
      evidence.tokens.evidence['colors.border-subtle'] = {
        ...portableEvidence,
        value: '#ffffff',
        sources: ['usage:structuralBorderColor'],
        roleCounts: { structuralBorderColor: 4 },
      }
    })
    expect((await auditArtifactBundle(surface)).hardFailures).toContain(
      'foundation-border-subtle-matches-foundation-surface',
    )
  })

  it('rejects shifting an inverse foreground into the portable muted role without surface evidence', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 0.7,
        contrastRatio: 17.74,
        textRoles: ['body', 'heading'],
      })
      addUnpairedMutedForegroundArtifacts(artifacts, evidence, dtcg, '#f0f6fc')
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain('foundation-muted-foreground-missing-pair')
  })

  it('independently rejects a chromatic heading accent in the portable muted role', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 0.7,
        contrastRatio: 17.74,
        textRoles: ['body', 'heading'],
      })
      addPairedMutedForegroundArtifacts(artifacts, evidence, dtcg, '#c70000', 6.13)
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'foundation-muted-foreground-pair-invalid-hierarchy',
    )
  })

  it('rejects a repeated page chrome color labeled as a foundation background candidate', async () => {
    const directory = await writeBundle((_artifacts, evidence, rawDtcg) => {
      const candidate = {
        id: 'candidate.colors.chrome-background',
        group: 'colors',
        role: 'background',
        value: '#111111',
        provenance: 'observed-color',
        rejectionReason: 'unassigned-role',
        evidence: {
          ...portableEvidence,
          value: '#111111',
          sources: ['computed:background', 'semantic:chrome-surface'],
          sourceCounts: { 'computed:background': 4, 'semantic:chrome-surface': 4 },
        },
      }
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'foundation-background-candidate-missing-foundation-owner:evidence.tokens.candidates.values.0',
    )
  })

  it('rejects forged pair metadata and a stronger rejected foreground candidate', async () => {
    const forged = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111827', {
        background: '#000000',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 0.25,
        normalizedShare: 0.75,
        contrastRatio: 99,
        textRoles: ['body'],
      })
    })
    const forgedResult = await auditArtifactBundle(forged)
    expect(forgedResult.hardFailures).toEqual(
      expect.arrayContaining([
        'foundation-foreground-pair-background-mismatch',
        'foundation-foreground-pair-support-mismatch',
        'foundation-foreground-pair-contrast-mismatch',
      ]),
    )

    const dominated = await writeBundle((artifacts, evidence, rawDtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, rawDtcg, '#374151', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 0.2,
        contrastRatio: 10.31,
        textRoles: ['body'],
      })
      const candidate = {
        id: 'candidate.colors.stronger-foreground',
        group: 'colors',
        role: 'foreground',
        value: '#111827',
        provenance: 'observed-color',
        rejectionReason: 'unassigned-role',
        evidence: {
          ...portableEvidence,
          value: '#111827',
          observationCount: 8,
          ownerCount: 8,
          pairedSurface: {
            background: '#ffffff',
            pageCount: 2,
            eligiblePageCount: 2,
            pageSupportRatio: 1,
            normalizedShare: 0.8,
            normalizedMainTextShare: 0.8,
            ownerCount: 8,
            minimumPageOwnerCount: 4,
            mainTextPageCount: 2,
            mainTextOwnerCount: 8,
            headingPageCount: 2,
            headingOwnerCount: 4,
            contrastRatio: 17.74,
            textRoles: ['body', 'heading'],
            routeSupport: ['https://example.com/', 'https://example.com/about'].map((page, pageIndex) => ({
              page,
              routeId: pageIndex === 0 ? HOME_ROUTE_ID : ABOUT_ROUTE_ID,
              supported: true,
              ownerIds: Array.from({ length: 4 }, (_item, ownerIndex) => `candidate-owner-${pageIndex}-${ownerIndex}`),
              totalOwnerIds: Array.from(
                { length: 5 },
                (_item, ownerIndex) => `candidate-owner-${pageIndex}-${ownerIndex}`,
              ),
              mainTextOwnerIds: Array.from(
                { length: 4 },
                (_item, ownerIndex) => `candidate-owner-${pageIndex}-${ownerIndex}`,
              ),
              headingOwnerIds: Array.from(
                { length: 2 },
                (_item, ownerIndex) => `candidate-owner-${pageIndex}-${ownerIndex}`,
              ),
              textRoles: ['body', 'heading'],
              normalizedShare: 0.8,
              normalizedMainTextShare: 0.8,
            })),
          },
        },
      }
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
    })
    expect((await auditArtifactBundle(dominated)).hardFailures).toContain(
      'foundation-foreground-pair-dominated:candidate.colors.stronger-foreground',
    )
  })

  it('accepts a rejected low-confidence foreground candidate paired with a truthful local surface', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, rawDtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 0.9,
        contrastRatio: 17.74,
        textRoles: ['body', 'heading'],
      })
      const localForeground = '#ffffff'
      const localSurface = '#4a154b'
      const tokenEvidence = evidence.tokens.evidence as Record<string, Record<string, unknown>>
      const localEvidence = structuredClone(tokenEvidence['colors.foreground'])
      localEvidence.value = localForeground
      localEvidence.confidence = 'low'
      localEvidence.semanticConfidence = 'low'
      localEvidence.reuseScope = 'local'
      localEvidence.renderedTextOwners = (localEvidence.renderedTextOwners as Array<Record<string, unknown>>).map(
        (owner) => ({
          ...owner,
          styles: {
            ...(owner.styles as Record<string, unknown>),
            color: localForeground,
            backgroundColor: localSurface,
          },
          source: { ...(owner.source as Record<string, unknown>), foreground: localForeground },
        }),
      )
      localEvidence.pairedSurface = {
        ...(localEvidence.pairedSurface as Record<string, unknown>),
        background: localSurface,
        contrastRatio: 14,
      }
      const candidate = {
        id: 'candidate.colors.local-inverse-foreground',
        group: 'colors',
        role: 'foreground',
        value: localForeground,
        provenance: 'observed-color',
        rejectionReason: 'unassigned-role',
        evidence: localEvidence,
      }
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
    })

    expect((await auditArtifactBundle(directory)).hardFailures).not.toContain(
      'candidate-foreground-pair:candidate.colors.local-inverse-foreground-background-mismatch',
    )
  })

  it.each(['en', 'zh-CN'] as const)(
    'requires an evidence-limited empty font-family projection in %s',
    async (language) => {
      const baseline = await writeGate21Bundle(language)
      expect((await auditArtifactBundle(baseline)).hardFailures).toEqual([])

      const pageLanguageDiffers = await writeGate21Bundle(language, (_artifacts, evidence) => {
        evidence.source.language = language === 'zh-CN' ? 'en' : 'zh-CN'
      })
      expect((await auditArtifactBundle(pageLanguageDiffers)).hardFailures).toEqual([])

      const forgedDefault = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
          language === 'zh-CN'
            ? '**字体族：** 尚未建立可移植字体族；选择字体前请查看局部排版证据。'
            : '**Font families:** No portable font family was established; consult local typography Evidence before choosing a typeface.',
          language === 'zh-CN' ? '**字体族：** 系统默认' : '**Font families:** System default',
        )
      })
      expect((await auditArtifactBundle(forgedDefault)).hardFailures).toContain(
        'design-doc-typography-family-projection-mismatch',
      )
    },
  )

  it.each(['en', 'zh-CN'] as const)(
    'cross-checks bounded component, candidate, and overflow projections in %s',
    async (language) => {
      const baseline = await auditArtifactBundle(await writeGate21Bundle(language))
      expect(baseline.hardFailures).toEqual([])

      const querySafeRoutes = await writeGate21Bundle(language, (artifacts, evidence) => {
        for (const page of evidence.pages) {
          page.url = 'https://example.com/app'
          ;(page as typeof page & { routeId: string }).routeId = page.id.includes('home') ? 'route-home' : 'route-about'
        }
        for (const tokenEvidence of Object.values(evidence.tokens.evidence)) {
          ;(tokenEvidence as typeof tokenEvidence & { pageRefs: string[] }).pageRefs = ['route-home', 'route-about']
          tokenEvidence.pages = Array.from({ length: tokenEvidence.pageCount }, () => 'https://example.com/app')
        }
        for (const candidate of evidence.tokens.candidates.values) {
          ;(candidate.evidence as typeof candidate.evidence & { pageRefs: string[] }).pageRefs =
            candidate.evidence.pageCount === 2 ? ['route-home', 'route-about'] : ['route-home']
          candidate.evidence.pages = Array.from(
            { length: candidate.evidence.pageCount },
            () => 'https://example.com/app',
          )
        }
        const profile = JSON.parse(artifacts['design-profile.json'])
        const evidenceNote = language === 'zh-CN' ? '支持该迁移配方的证据' : 'Evidence supporting this transfer recipe'
        const routeEvidence = ['button-about', 'button-home-1', 'button-home-2']
        profile.transferGrammar.componentRecipes[0].observed.evidence = routeEvidence.map((evidenceId) => ({
          evidenceId,
          note: evidenceNote,
        }))
        profile.transferGrammar.componentRecipes[0].observed.assertions = componentAssertions(routeEvidence)
        const listRecipe = profile.transferGrammar.componentRecipes.find(
          (recipe: { component: string }) => recipe.component === 'list',
        )
        const listRouteEvidence = ['list-about', 'list-home']
        listRecipe.observed.evidence = listRouteEvidence.map((evidenceId: string) => ({
          evidenceId,
          note: evidenceNote,
        }))
        listRecipe.observed.assertions = componentAssertions(listRouteEvidence, 'list', 'default')
        artifacts['design-profile.json'] = JSON.stringify(profile)
        const specs = JSON.parse(artifacts['component-specs.json'])
        specs.components[0].evidenceRefs = ['button-about', 'button-home-1', 'button-home-2']
        artifacts['component-specs.json'] = JSON.stringify(specs)
        artifacts['DESIGN.md'] = artifacts['DESIGN.md']
          .split('\n')
          .map((line) => {
            if (line.includes('1800px')) {
              return line.replace(
                'https://example.com/; https://example.com/about',
                'https://example.com/app [route-home]; https://example.com/app [route-about]',
              )
            }
            if (line.includes('900px')) {
              return line.replace('https://example.com/', 'https://example.com/app [route-home]')
            }
            if (line.includes('920px')) {
              return line.replace('https://example.com/about', 'https://example.com/app [route-about]')
            }
            return line
          })
          .join('\n')
      })
      expect((await auditArtifactBundle(querySafeRoutes)).hardFailures).toEqual([])

      const wrongP1 = await writeGate21Bundle(language, (artifacts) => {
        const heading = language === 'zh-CN' ? '#### 按钮 · 主要' : '#### button · primary'
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(heading, '#### synthetic · wrong')
      })
      expect((await auditArtifactBundle(wrongP1)).hardFailures).toContain('design-doc-rendered-p1-identity-mismatch')

      const wrongRecipeToken = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace('`color.primary`', '`color.background`')
      })
      expect((await auditArtifactBundle(wrongRecipeToken)).hardFailures).toContain(
        'design-doc-rendered-p1-block-mismatch:button\u0000primary',
      )

      const wrongRecipeStyle = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace('`padding: 8px`', '`padding: 999px`')
      })
      expect((await auditArtifactBundle(wrongRecipeStyle)).hardFailures).toContain(
        'design-doc-rendered-p1-block-mismatch:button\u0000primary',
      )

      const omittedRecipeStyle = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md']
          .split('\n')
          .filter((line) => !line.includes(language === 'zh-CN' ? '**代表性样式：**' : '**Representative styles:**'))
          .join('\n')
      })
      expect((await auditArtifactBundle(omittedRecipeStyle)).hardFailures).toContain(
        'design-doc-rendered-p1-block-mismatch:button\u0000primary',
      )

      const extraRecipeLine = await writeGate21Bundle(language, (artifacts) => {
        const styleLabel = language === 'zh-CN' ? '**代表性样式：**' : '**Representative styles:**'
        artifacts['DESIGN.md'] = artifacts['DESIGN.md']
          .split('\n')
          .flatMap((line) => (line.includes(styleLabel) ? [line, '  - fabricated implementation value'] : [line]))
          .join('\n')
      })
      expect((await auditArtifactBundle(extraRecipeLine)).hardFailures).toContain(
        'design-doc-rendered-p1-block-mismatch:button\u0000primary',
      )

      const duplicateRecipeOutsideComponents = await writeGate21Bundle(language, (artifacts) => {
        const heading = language === 'zh-CN' ? '#### 按钮 · 主要' : '#### button · primary'
        const useWhen =
          language === 'zh-CN'
            ? '- **使用场景：** 把它作为所有页面的唯一主操作'
            : "- **Use when:** treat this as the site's principal action everywhere"
        artifacts['DESIGN.md'] += `\n## Supplemental Component Guidance\n\n${heading}\n\n${useWhen}\n`
      })
      expect((await auditArtifactBundle(duplicateRecipeOutsideComponents)).hardFailures).toEqual(
        expect.arrayContaining([
          'design-doc-rendered-p1-outside-components',
          'design-doc-rendered-p1-global-count-mismatch',
          'design-doc-rendered-p1-global-block-mismatch',
        ]),
      )

      const h5RecipeOutsideComponents = await writeGate21Bundle(language, (artifacts) => {
        const heading = language === 'zh-CN' ? '##### 按钮 · 主要' : '##### button · primary'
        const useWhen =
          language === 'zh-CN'
            ? '- **使用场景：** 把它作为所有页面的唯一主操作'
            : "- **Use when:** treat this as the site's principal action everywhere"
        artifacts['DESIGN.md'] += `\n## Supplemental Component Guidance\n\n${heading}\n\n${useWhen}\n`
      })
      expect((await auditArtifactBundle(h5RecipeOutsideComponents)).hardFailures).toEqual(
        expect.arrayContaining([
          'design-doc-rendered-p1-outside-components',
          'design-doc-rendered-p1-global-count-mismatch',
        ]),
      )

      const headingFreeRecipeOutsideComponents = await writeGate21Bundle(language, (artifacts) => {
        const useWhen =
          language === 'zh-CN'
            ? '- **使用场景：** 把它作为所有页面的唯一主操作'
            : "- **Use when:** treat this as the site's principal action everywhere"
        const observed =
          language === 'zh-CN'
            ? '- **观察配方：** 伪造的全局组件规则'
            : '- **Observed recipe:** fabricated global component rule'
        artifacts['DESIGN.md'] += `\n## Supplemental Component Guidance\n\n${useWhen}\n${observed}\n`
      })
      expect((await auditArtifactBundle(headingFreeRecipeOutsideComponents)).hardFailures).toEqual(
        expect.arrayContaining([
          'design-doc-rendered-p1-outside-components',
          'design-doc-rendered-p1-global-count-mismatch',
        ]),
      )

      const typeImbalance = await writeGate21Bundle(language, (artifacts) => {
        const profile = JSON.parse(artifacts['design-profile.json'])
        const base = profile.transferGrammar.componentRecipes[0]
        for (const suffix of ['a', 'b', 'c', 'd']) {
          profile.transferGrammar.componentRecipes.push({ ...structuredClone(base), variant: `extra-${suffix}` })
        }
        artifacts['design-profile.json'] = JSON.stringify(profile)
        const metric =
          language === 'zh-CN'
            ? '_3 个代表样式匹配实例，覆盖 2 个页面 · 身份 0.95 · 复用 0.85 · 跨页观察_'
            : '_3 representative-style match(es) across 2 page(s) · identity 0.95 · reuse 0.85 · observed across pages_'
        const details = ['a', 'b', 'c', 'd']
          .map((suffix) => `#### ${language === 'zh-CN' ? '按钮' : 'button'} · extra · ${suffix}\n\n${metric}`)
          .join('\n\n')
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
          '### Reconstruction Summary',
          `${details}\n\n### Reconstruction Summary`,
        )
      })
      expect((await auditArtifactBundle(typeImbalance)).hardFailures).toContain(
        'design-doc-rendered-p1-type-budget-exceeded:button:5',
      )

      const missingP2 = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md']
          .split('\n')
          .filter((line) => !(language === 'zh-CN' ? line.startsWith('- **列表：**') : line.startsWith('- **list:**')))
          .join('\n')
      })
      expect((await auditArtifactBundle(missingP2)).hardFailures).toContain('design-doc-p2-summary-mismatch')

      const miscountedP2 = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
          language === 'zh-CN' ? '1 个局部模式，2 个代表性实例' : '1 local pattern(s), 2 representative instance(s)',
          language === 'zh-CN' ? '1 个局部模式，9 个代表性实例' : '1 local pattern(s), 9 representative instance(s)',
        )
      })
      expect((await auditArtifactBundle(miscountedP2)).hardFailures).toContain('design-doc-p2-summary-mismatch')

      const wrongCandidateValue = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (value) => {
          const extension = (value['x-imprint'] as CandidatePreviewExtension[])[0]
          extension.candidates.declaredColors[0].value = '#abcdef'
        })
      })
      expect((await auditArtifactBundle(wrongCandidateValue)).hardFailures).toContain(
        'candidate-preview-catalog-mismatch:declaredColors',
      )

      const wrongCandidatePages = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (value) => {
          const extension = (value['x-imprint'] as CandidatePreviewExtension[])[0]
          extension.candidates.observedUnassignedColors[0].pageCount = 2
        })
      })
      expect((await auditArtifactBundle(wrongCandidatePages)).hardFailures).toContain(
        'candidate-preview-catalog-mismatch:observedUnassignedColors',
      )

      const reorderedCandidates = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (value) => {
          const extension = (value['x-imprint'] as CandidatePreviewExtension[])[0]
          extension.candidates.tokenValues.reverse()
        })
      })
      expect((await auditArtifactBundle(reorderedCandidates)).hardFailures).toContain(
        'candidate-preview-catalog-mismatch:tokenValues',
      )

      const missingLegacyCandidate = await writeGate21Bundle(language, (artifacts, evidence) => {
        evidence.tokens.candidates.colors.splice(0, 1)
        artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (value) => {
          const extension = (value['x-imprint'] as Array<Record<string, unknown>>)[0]
          const candidates = extension.candidates as Record<string, unknown>
          const summary = extension.candidateSummary as Record<string, unknown>
          delete candidates.declaredColors
          delete summary.declaredColors
        })
      })
      expect((await auditArtifactBundle(missingLegacyCandidate)).hardFailures).toContain(
        'candidate-preview-catalog-mismatch:declaredColors',
      )

      const missingOverflow = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md']
          .split('\n')
          .filter(
            (line) => !(line.includes('920px') && (line.includes('horizontal overflow') || line.includes('横向溢出'))),
          )
          .join('\n')
      })
      expect((await auditArtifactBundle(missingOverflow)).hardFailures).toContain(
        'page-topology-overflow-groups-mismatch',
      )

      const overflowMissingFromTopologyIndex = await writeGate21Bundle(language, (artifacts, evidence) => {
        evidence.topology.pages = evidence.topology.pages.filter((entry) => entry.pageId !== 'page-about-mobile')
        artifacts['DESIGN.md'] = artifacts['DESIGN.md']
          .split('\n')
          .filter(
            (line) => !(line.includes('920px') && (line.includes('horizontal overflow') || line.includes('横向溢出'))),
          )
          .join('\n')
      })
      expect((await auditArtifactBundle(overflowMissingFromTopologyIndex)).hardFailures).toContain(
        'page-topology-overflow-groups-mismatch',
      )

      const wrongOverflowSupport = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
          language === 'zh-CN' ? '`desktop` · 2 个路由' : '`desktop` · 2 routes',
          language === 'zh-CN' ? '`desktop` · 3 个路由' : '`desktop` · 3 routes',
        )
      })
      expect((await auditArtifactBundle(wrongOverflowSupport)).hardFailures).toContain(
        'page-topology-overflow-groups-mismatch',
      )

      const mergedOverflowGeometry = await writeGate21Bundle(language, (artifacts) => {
        const lines = artifacts['DESIGN.md'].split('\n')
        const firstMobile = lines.findIndex(
          (line) => line.includes('900px') && (line.includes('horizontal overflow') || line.includes('横向溢出')),
        )
        if (firstMobile >= 0) {
          lines[firstMobile] = lines[firstMobile]
            .replace(language === 'zh-CN' ? '1 个路由' : '1 route', language === 'zh-CN' ? '2 个路由' : '2 routes')
            .replace('https://example.com/', 'https://example.com/; https://example.com/about')
        }
        artifacts['DESIGN.md'] = lines
          .filter(
            (line) => !(line.includes('920px') && (line.includes('horizontal overflow') || line.includes('横向溢出'))),
          )
          .join('\n')
      })
      expect((await auditArtifactBundle(mergedOverflowGeometry)).hardFailures).toContain(
        'page-topology-overflow-groups-mismatch',
      )
    },
  )

  it.each(['en', 'zh-CN'] as const)(
    'derives ordinary versus primary action usage from canonical role support in %s',
    async (language) => {
      const ordinary = await writeGate21Bundle(language, (artifacts, evidence) => {
        configureOrdinaryActionRecipe(artifacts, evidence, language)
      })
      expect((await auditArtifactBundle(ordinary)).hardFailures).toEqual([])

      const forgedPrimary = await writeGate21Bundle(language, (artifacts, evidence) => {
        configureOrdinaryActionRecipe(artifacts, evidence, language, true)
      })
      expect((await auditArtifactBundle(forgedPrimary)).hardFailures).toEqual(
        expect.arrayContaining([
          'profile-component-use-when-mismatch:button\u0000action:primary-action:action',
          'design-doc-rendered-p1-block-mismatch:button\u0000action',
        ]),
      )

      const strippedProjectionMarker = await writeGate21Bundle(language, (artifacts) => {
        artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
          const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
          const summary = extension.componentSummary as Record<string, unknown>
          delete summary.actionablePatterns
        })
      })
      expect((await auditArtifactBundle(strippedProjectionMarker)).hardFailures).toEqual(
        expect.arrayContaining([
          'non-finite-component-summary:actionablePatterns',
          'component-summary-catalog-mismatch:actionablePatterns',
        ]),
      )
    },
  )

  it.each(['en', 'zh-CN'] as const)(
    'independently verifies grouped responsive support and exact value signatures in %s',
    async (language) => {
      const baseline = await writeGate21Bundle(language, (artifacts, evidence) => {
        configureGroupedResponsiveProjection(artifacts, evidence, language)
      })
      expect((await auditArtifactBundle(baseline)).hardFailures).toEqual([])

      const wrongSupport = await writeGate21Bundle(language, (artifacts, evidence) => {
        const { sharedLine } = configureGroupedResponsiveProjection(artifacts, evidence, language)
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
          sharedLine,
          sharedLine.replace(
            language === 'zh-CN' ? '支持：2 个路由' : 'support: 2 routes',
            language === 'zh-CN' ? '支持：3 个路由' : 'support: 3 routes',
          ),
        )
      })
      expect((await auditArtifactBundle(wrongSupport)).hardFailures).toContain('responsive-observation-groups-mismatch')

      const mergedDifferentValues = await writeGate21Bundle(language, (artifacts, evidence) => {
        const { distinctLine, distinctValues } = configureGroupedResponsiveProjection(artifacts, evidence, language)
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(`${distinctLine}\n${distinctValues}\n`, '')
      })
      expect((await auditArtifactBundle(mergedDifferentValues)).hardFailures).toContain(
        'responsive-observation-groups-mismatch',
      )

      const duplicateSection = await writeGate21Bundle(language, (artifacts, evidence) => {
        configureGroupedResponsiveProjection(artifacts, evidence, language)
        const heading = language === 'zh-CN' ? '### 响应式结构观察' : '### Responsive Structure Observations'
        artifacts['DESIGN.md'] += `\n${heading}\n\n- forged responsive support: 99 routes · 999px → 1px\n`
      })
      expect((await auditArtifactBundle(duplicateSection)).hardFailures).toContain(
        'responsive-observation-section-count-mismatch:2:1',
      )

      const extraFactOutsideSubsection = await writeGate21Bundle(language, (artifacts, evidence) => {
        configureGroupedResponsiveProjection(artifacts, evidence, language)
        const heading = language === 'zh-CN' ? '### 响应式结构观察' : '### Responsive Structure Observations'
        const forged =
          language === 'zh-CN'
            ? '- 桌面端 → 移动端 · 内容 · 布局重排（网格列） · 支持：99 个路由 · 99 个观察实例 · 示例：https://example.com/forged\n  - 网格列: 12 columns → hidden'
            : '- desktop → mobile · content · layout reflow (grid columns) · support: 99 routes · 99 observed instances · examples: https://example.com/forged\n  - grid columns: 12 columns → hidden'
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(`\n${heading}\n`, `\n${forged}\n\n${heading}\n`)
      })
      expect((await auditArtifactBundle(extraFactOutsideSubsection)).hardFailures).toEqual(
        expect.arrayContaining([
          'responsive-observation-fact-outside-owned-section',
          'responsive-observation-global-groups-mismatch',
        ]),
      )

      const blockquotedFactOutsideSubsection = await writeGate21Bundle(language, (artifacts, evidence) => {
        configureGroupedResponsiveProjection(artifacts, evidence, language)
        const heading = language === 'zh-CN' ? '### 响应式结构观察' : '### Responsive Structure Observations'
        const forged =
          language === 'zh-CN'
            ? '> - 桌面端 → 移动端 · 内容 · 布局重排（网格列） · 支持：99 个路由 · 99 个观察实例 · 示例：https://example.com/forged\n>   - 网格列: 12 columns → hidden'
            : '> - desktop → mobile · content · layout reflow (grid columns) · support: 99 routes · 99 observed instances · examples: https://example.com/forged\n>   - grid columns: 12 columns → hidden'
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(`\n${heading}\n`, `\n${forged}\n\n${heading}\n`)
      })
      expect((await auditArtifactBundle(blockquotedFactOutsideSubsection)).hardFailures).toEqual(
        expect.arrayContaining([
          'responsive-observation-fact-outside-owned-section',
          'responsive-observation-global-groups-mismatch',
        ]),
      )

      const misownedSection = await writeGate21Bundle(language, (artifacts, evidence) => {
        configureGroupedResponsiveProjection(artifacts, evidence, language)
        const heading = language === 'zh-CN' ? '### 响应式结构观察' : '### Responsive Structure Observations'
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(`\n${heading}\n`, `\n## Other Evidence\n\n${heading}\n`)
      })
      expect((await auditArtifactBundle(misownedSection)).hardFailures).toEqual(
        expect.arrayContaining([
          'responsive-observation-owned-section-count-mismatch:0:1',
          'responsive-observation-groups-mismatch',
        ]),
      )
    },
  )

  it('uses opaque route IDs when query-redacted public URLs collide', async () => {
    const validDirectory = await writeBundle((artifacts, evidence) => {
      for (const page of evidence.pages) {
        page.url = 'https://example.com/app'
        ;(page as typeof page & { routeId: string }).routeId = page.id.includes('home') ? 'route-home' : 'route-about'
      }
      for (const tokenEvidence of Object.values(evidence.tokens.evidence)) {
        ;(tokenEvidence as typeof tokenEvidence & { pageRefs: string[] }).pageRefs = ['route-home', 'route-about']
      }
      const profile = JSON.parse(artifacts['design-profile.json'])
      const routeEvidence = ['button-about', 'button-home-1', 'button-home-2']
      profile.transferGrammar.componentRecipes[0].observed.evidence = routeEvidence.map((evidenceId) => ({
        evidenceId,
      }))
      profile.transferGrammar.componentRecipes[0].observed.assertions = componentAssertions(routeEvidence)
      artifacts['design-profile.json'] = JSON.stringify(profile)
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].evidenceRefs = ['button-about', 'button-home-1', 'button-home-2']
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })
    expect(
      (await auditArtifactBundle(validDirectory)).hardFailures.some((failure) =>
        failure.includes('rendered-text-owner'),
      ),
    ).toBe(false)

    const invalidDirectory = await writeBundle((_artifacts, evidence) => {
      for (const page of evidence.pages) {
        page.url = 'https://example.com/app'
        delete (page as typeof page & { routeId?: string }).routeId
      }
    })
    expect((await auditArtifactBundle(invalidDirectory)).hardFailures).toContain(
      'ambiguous-sanitized-page-route:https://example.com/app|desktop',
    )
  })

  it('audits rendered foreground provenance by route ID after query routes share one public URL', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, rawDtcg, '#111111', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        contrastRatio: 18.88,
        textRoles: ['body'],
      })
      for (const page of evidence.pages) page.url = 'https://example.com/app'
      for (const tokenEvidence of Object.values(evidence.tokens.evidence)) {
        tokenEvidence.pages = Array.from({ length: tokenEvidence.pageCount }, () => 'https://example.com/app')
      }
      const foreground = evidence.tokens.evidence['colors.foreground'] as unknown as {
        pages: string[]
        renderedTextOwners: Array<{ page: string }>
        pairedSurface: { routeSupport: Array<{ page: string }> }
      }
      foreground.pages = ['https://example.com/app', 'https://example.com/app']
      foreground.renderedTextOwners.forEach((owner) => {
        owner.page = 'https://example.com/app'
      })
      foreground.pairedSurface.routeSupport.forEach((route) => {
        route.page = 'https://example.com/app'
      })
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual([])
  })

  it('rejects missing or duplicated route IDs in rendered foreground provenance', async () => {
    const missingOwnerRoute = await writeBundle((artifacts, evidence, rawDtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, rawDtcg, '#111111', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        contrastRatio: 18.88,
        textRoles: ['body'],
      })
      const foreground = evidence.tokens.evidence['colors.foreground'] as unknown as {
        renderedTextOwners: Array<{ routeId?: string }>
      }
      delete foreground.renderedTextOwners[0].routeId
    })
    expect((await auditArtifactBundle(missingOwnerRoute)).hardFailures).toContain(
      'duplicate-or-invalid-rendered-text-owner:colors.foreground',
    )

    const duplicatePairRoute = await writeBundle((artifacts, evidence, rawDtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, rawDtcg, '#111111', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        contrastRatio: 18.88,
        textRoles: ['body'],
      })
      const foreground = evidence.tokens.evidence['colors.foreground'] as unknown as {
        pairedSurface: { routeSupport: Array<{ routeId: string }> }
      }
      foreground.pairedSurface.routeSupport[1].routeId = foreground.pairedSurface.routeSupport[0].routeId
    })
    expect((await auditArtifactBundle(duplicatePairRoute)).hardFailures).toContain(
      'foundation-foreground-pair-route-support-mismatch',
    )
  })

  it('audits synchronized rendered-owner forgeries inside rejected candidates', async () => {
    const validDirectory = await writeBundle((_artifacts, evidence, rawDtcg) => {
      evidence.tokens.candidates.values.push(localRenderedTypographyCandidate() as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
    })
    expect(
      (await auditArtifactBundle(validDirectory)).hardFailures.some(
        (failure) => failure.includes('rendered-text-pair') || failure.includes('rendered-text-owner'),
      ),
    ).toBe(false)

    const missingRouteDirectory = await writeBundle((_artifacts, evidence, rawDtcg) => {
      const candidate = localRenderedTypographyCandidate()
      delete (candidate.evidence.renderedTextOwners[0] as { routeId?: string }).routeId
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
    })
    expect((await auditArtifactBundle(missingRouteDirectory)).hardFailures).toContain(
      'duplicate-or-invalid-rendered-text-owner:typography.fontFamilies.0',
    )

    const blendedDirectory = await writeBundle((_artifacts, evidence, rawDtcg) => {
      const candidate = localRenderedTypographyCandidate()
      candidate.evidence.renderedTextOwners[0].source.blendChain = [{ value: 'difference', owner: 'self' }]
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
    })
    expect((await auditArtifactBundle(blendedDirectory)).hardFailures).toContain(
      'invalid-rendered-text-owner-evidence:typography.fontFamilies.0',
    )

    const removedProvenanceDirectory = await writeBundle((_artifacts, evidence, rawDtcg) => {
      const candidate = localRenderedTypographyCandidate()
      delete (candidate.evidence as { renderedTextOwners?: unknown[] }).renderedTextOwners
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
    })
    expect((await auditArtifactBundle(removedProvenanceDirectory)).hardFailures).toContain(
      'missing-source-implied-rendered-text-owner:evidence.tokens.candidates.values.0',
    )
  })

  it('audits synchronized paired-route forgeries inside rejected color candidates', async () => {
    const addCandidate = (
      artifacts: Record<string, string>,
      evidence: ReturnType<typeof bundleEvidence>,
      rawDtcg: unknown,
      mutate?: (candidate: {
        evidence: { pairedSurface: { routeSupport: Array<{ routeId: string; page: string }> } }
      }) => void,
    ) => {
      addFoundationForegroundArtifacts(artifacts, evidence, rawDtcg, '#111827', {
        background: '#ffffff',
        pageCount: 2,
        eligiblePageCount: 2,
        pageSupportRatio: 1,
        normalizedShare: 1,
        contrastRatio: 17.74,
        textRoles: ['body'],
      })
      const candidateEvidence = structuredClone(evidence.tokens.evidence['colors.foreground'])
      candidateEvidence.value = '#333333'
      candidateEvidence.reuseScope = 'local'
      candidateEvidence.pairedSurface.contrastRatio = 12.63
      for (const owner of candidateEvidence.renderedTextOwners) {
        owner.styles.color = '#333333'
        owner.source.foreground = '#333333'
      }
      const candidate = {
        id: 'candidate.colors.local-foreground',
        group: 'colors',
        value: '#333333',
        role: 'foreground',
        provenance: 'observed-color',
        rejectionReason: 'local-scope',
        evidence: candidateEvidence,
      }
      mutate?.(candidate)
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
    }

    const validDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addCandidate(artifacts, evidence, dtcg)
    })
    expect(
      (await auditArtifactBundle(validDirectory)).hardFailures.some(
        (failure) => failure.includes('rendered-text-pair') || failure.includes('rendered-text-owner'),
      ),
    ).toBe(false)

    const forgedDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addCandidate(artifacts, evidence, dtcg, (candidate) => {
        candidate.evidence.pairedSurface.routeSupport[1].routeId = HOME_ROUTE_ID
      })
    })
    expect((await auditArtifactBundle(forgedDirectory)).hardFailures).toContain(
      'rendered-text-pair:colors.0-route-support-mismatch',
    )

    const wrongPageDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addCandidate(artifacts, evidence, dtcg, (candidate) => {
        candidate.evidence.pairedSurface.routeSupport[0].page = 'https://wrong.example/unrelated'
      })
    })
    expect((await auditArtifactBundle(wrongPageDirectory)).hardFailures).toContain(
      'rendered-text-pair:colors.0-route-support-mismatch',
    )

    const removedProvenanceDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addCandidate(artifacts, evidence, dtcg, (candidate) => {
        const candidateEvidence = candidate.evidence as typeof candidate.evidence & {
          renderedTextOwners?: unknown[]
          pairedSurface?: unknown
          sources: string[]
        }
        delete candidateEvidence.renderedTextOwners
        delete candidateEvidence.pairedSurface
      })
    })
    const removedProvenance = await auditArtifactBundle(removedProvenanceDirectory)
    expect(
      removedProvenance.hardFailures.some(
        (failure) => failure.includes('rendered-text-pair') || failure.includes('rendered-text-owner'),
      ),
    ).toBe(false)
    expect(removedProvenance.warnings).toEqual(
      expect.arrayContaining([
        'deferred-color-candidate-provenance:missing-source-implied-rendered-text-owner:evidence.tokens.candidates.values.0',
        'deferred-color-candidate-provenance:missing-source-implied-paired-surface:evidence.tokens.candidates.values.0',
      ]),
    )
  })

  it('does not count one route-local text owner twice across responsive captures', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      const fontEvidence = evidence.tokens.evidence['typography.fontFamilies.0'] as unknown as {
        renderedTextOwners: Array<Record<string, unknown>>
      }
      fontEvidence.renderedTextOwners[1] = {
        ...structuredClone(fontEvidence.renderedTextOwners[0]),
        viewport: 'mobile',
      }
    })

    const result = await auditArtifactBundle(directory)
    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'duplicate-or-invalid-rendered-text-owner:typography.fontFamilies.0',
        'mixed-rendered-text-owner-viewports:typography.fontFamilies.0',
      ]),
    )
  })

  it('binds rendered-owner page and viewport provenance to the canonical Evidence capture', async () => {
    const imaginaryViewportDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      const fontEvidence = evidence.tokens.evidence['typography.fontFamilies.0'] as unknown as {
        renderedTextOwners: Array<{ viewport: string }>
      }
      fontEvidence.renderedTextOwners.forEach((owner) => {
        owner.viewport = 'imaginary'
      })
    })
    expect((await auditArtifactBundle(imaginaryViewportDirectory)).hardFailures).toContain(
      'rendered-text-owner-capture-mismatch:typography.fontFamilies.0',
    )

    const wrongPageDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      const fontEvidence = evidence.tokens.evidence['typography.fontFamilies.0'] as unknown as {
        pages: string[]
        renderedTextOwners: Array<{ page: string }>
      }
      fontEvidence.pages = ['https://wrong.example/unrelated']
      fontEvidence.renderedTextOwners.forEach((owner) => {
        owner.page = 'https://wrong.example/unrelated'
      })
    })
    expect((await auditArtifactBundle(wrongPageDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'rendered-text-owner-capture-mismatch:typography.fontFamilies.0',
        'rendered-text-page-coverage-mismatch:typography.fontFamilies.0',
      ]),
    )
  })

  it('rejects responsive typography inflation and unscoped structural facts', async () => {
    const validDirectory = await writeBundle((artifacts, evidence) => {
      addResponsiveTypographyAndStructureEvidence(artifacts, evidence)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const inflatedDirectory = await writeBundle((artifacts, evidence) => {
      addResponsiveTypographyAndStructureEvidence(artifacts, evidence, { typographyCount: 4 })
    })
    expect((await auditArtifactBundle(inflatedDirectory)).hardFailures).toContain(
      'design-doc-typography-owner-count-mismatch:display',
    )

    const unscopedDirectory = await writeBundle((artifacts, evidence) => {
      addResponsiveTypographyAndStructureEvidence(artifacts, evidence, { scopedStructure: false })
    })
    expect((await auditArtifactBundle(unscopedDirectory)).hardFailures).toContain('unscoped-structural-fact')
  })

  it('requires the canonical typography count basis in English and Chinese', async () => {
    const missingEnglish = await writeBundle((artifacts, evidence) => {
      addResponsiveTypographyAndStructureEvidence(artifacts, evidence)
      artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
        '> Count basis: one evidence-eligible canonical capture per route without severe horizontal overflow; desktop is preferred, followed by tablet and mobile.\n\n',
        '',
      )
    })
    expect((await auditArtifactBundle(missingEnglish)).hardFailures).toContain(
      'typography-role-count-basis-statement-missing',
    )

    const chinese = await writeBundle((artifacts, evidence) => {
      addResponsiveTypographyAndStructureEvidence(artifacts, evidence)
      artifacts['DESIGN.md'] = artifacts['DESIGN.md']
        .replace('### Typography Role Evidence', '### 排版角色证据')
        .replace(
          '> Count basis: one evidence-eligible canonical capture per route without severe horizontal overflow; desktop is preferred, followed by tablet and mobile.',
          '> 计数口径：每个路由只使用一次证据有效且无严重溢出的代表性捕获；优先桌面端，其次平板和移动端。',
        )
        .replace(
          '| Observed role | Independent owners | Font | Size | Weight | Line height |',
          '| 观察角色 | 独立元素数 | 字体 | 字号 | 字重 | 行高 |',
        )
    })
    expect((await auditArtifactBundle(chinese)).hardFailures).toEqual([])
  })

  it('independently audits reordered responsive captures with an unhealthy desktop fallback', async () => {
    const writeCanonicalFallback = (reportedCount: number, hierarchy = 'hero') =>
      writeBundle((artifacts, evidence) => {
        const pages = evidence.pages as Array<
          (typeof evidence.pages)[number] & {
            viewportWidth?: number
            contentWidth?: number
            horizontalOverflow?: boolean
            health?: { evidenceEligible: boolean }
          }
        >
        for (const page of pages) {
          page.viewportWidth = page.viewport === 'desktop' ? 1440 : 375
          page.contentWidth = page.viewportWidth
          page.horizontalOverflow = false
          let section = evidence.sections.find((candidate) => candidate.pageId === page.id)
          if (!section) {
            section = {
              id: `section-${page.id}`,
              pageId: page.id,
              role: page.id === 'page-home-mobile' ? 'hero' : 'content',
              tokenRefs: [],
              componentRefs: [],
              interactionRefs: [],
              mediaLayerRefs: [],
              evidenceRefs: [],
            }
            evidence.sections.push(section)
          }
          if (!evidence.topology.pages.some((candidate) => candidate.pageId === page.id)) {
            evidence.topology.pages.push({ pageId: page.id, sectionIds: [section.id] })
          }
          ;(evidence.layoutNodes as Array<Record<string, unknown>>).push({
            id: `layout-${page.id}`,
            pageId: page.id,
            sectionId: section.id,
            role: 'heading',
            textRole: 'display',
            textStyleSource: directTextSource(),
            tokenRefs: [],
            traits: [],
          })
        }
        const unhealthyDesktop = pages.find((page) => page.id === 'page-home-desktop')!
        unhealthyDesktop.health = { ...unhealthyDesktop.health, evidenceEligible: false }
        const mobileHomeSection = evidence.sections.find((section) => section.pageId === 'page-home-mobile')!
        for (const component of evidence.components.filter((item) => item.pageId === 'page-home-desktop')) {
          component.pageId = 'page-home-mobile'
          component.sectionId = mobileHomeSection.id
          component.evidenceRefs = [mobileHomeSection.id]
        }
        evidence.sections.find((section) => section.id === 'section-home')!.componentRefs = []
        mobileHomeSection.componentRefs = ['button-home-1', 'button-home-2']
        ;(evidence.layoutNodes as Array<Record<string, unknown>>).push({
          id: 'layout-page-home-mobile-second',
          pageId: 'page-home-mobile',
          sectionId: 'section-page-home-mobile',
          role: 'heading',
          textRole: 'display',
          textStyleSource: directTextSource(),
          tokenRefs: [],
          traits: [],
        })
        evidence.pages = [pages[3], pages[1], pages[2], pages[0]]
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
          '- **Entry-page section hierarchy:** content',
          `- **Entry-page section hierarchy:** ${hierarchy}`,
        )
        artifacts['DESIGN.md'] += `

## Design Evidence Overview

### Typography Role Evidence

> Count basis: one evidence-eligible canonical capture per route without severe horizontal overflow; desktop is preferred, followed by tablet and mobile.

| Observed role | Independent owners | Font | Size | Weight | Line height |
|---|---:|---|---|---|---|
| \`display\` | ${reportedCount} | — | — | — | — |
`
      })

    expect((await auditArtifactBundle(await writeCanonicalFallback(3))).hardFailures).toEqual([])
    expect((await auditArtifactBundle(await writeCanonicalFallback(2))).hardFailures).toContain(
      'design-doc-typography-owner-count-mismatch:display',
    )
    expect((await auditArtifactBundle(await writeCanonicalFallback(3, 'content'))).hardFailures).toContain(
      'reconstruction-summary-hierarchy-mismatch',
    )
  })

  it('uses the evidence-eligible canonical fallback for base and dark rendered token owners', async () => {
    for (const excludedDesktop of ['ineligible', 'severe-overflow'] as const) {
      const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
        addSingleFontArtifacts(artifacts, evidence, rawDtcg)
        const homeDesktop = evidence.pages.find((page) => page.id === 'page-home-desktop') as
          | ((typeof evidence.pages)[number] & {
              viewportWidth?: number
              contentWidth?: number
              horizontalOverflow?: boolean
              health: { checkedAt: string; evidenceEligible?: boolean }
            })
          | undefined
        if (!homeDesktop) throw new Error('Fixture is missing the entry desktop capture')
        if (excludedDesktop === 'ineligible') homeDesktop.health.evidenceEligible = false
        else {
          homeDesktop.viewportWidth = 100
          homeDesktop.contentWidth = 400
          homeDesktop.horizontalOverflow = true
          artifacts['DESIGN.md'] += `

### Page Topology

- \`desktop\` · 1 route · example: https://example.com/: horizontal overflow observed (content 400px > viewport 100px); off-screen content is not evidence of hiding or reflow
`
        }
        const baseEvidence = evidence.tokens.evidence as Record<string, Record<string, unknown>>
        for (const item of Object.values(baseEvidence)) {
          if (!Array.isArray(item.renderedTextOwners)) continue
          item.renderedTextOwners = item.renderedTextOwners.map((rawOwner) => {
            const owner = rawOwner as Record<string, unknown>
            return owner.routeId === HOME_ROUTE_ID ? { ...owner, viewport: 'mobile' } : owner
          })
        }
        const mobileHomeSection = {
          id: 'section-page-home-mobile',
          pageId: 'page-home-mobile',
          role: 'content',
          tokenRefs: [],
          componentRefs: ['button-home-1', 'button-home-2'],
          interactionRefs: [],
          mediaLayerRefs: [],
          evidenceRefs: [],
        }
        evidence.sections.push(mobileHomeSection)
        evidence.topology.pages.push({ pageId: 'page-home-mobile', sectionIds: [mobileHomeSection.id] })
        for (const component of evidence.components.filter((item) => item.pageId === 'page-home-desktop')) {
          component.pageId = 'page-home-mobile'
          component.sectionId = mobileHomeSection.id
          component.evidenceRefs = [mobileHomeSection.id]
        }
        evidence.sections.find((section) => section.id === 'section-home')!.componentRefs = []
        addDarkBundleArtifacts(artifacts, rawDtcg)
        addDarkFontOverrideArtifacts(artifacts, rawDtcg)
        const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & { dark: ReturnType<typeof bundleDtcg> }
        const darkEvidence = dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<
          string,
          Record<string, unknown>
        >
        for (const item of Object.values(darkEvidence)) {
          if (!Array.isArray(item.renderedTextOwners)) continue
          item.renderedTextOwners = item.renderedTextOwners.map((rawOwner) => ({
            ...(rawOwner as Record<string, unknown>),
            viewport: 'mobile',
          }))
        }
        evidence.pages.reverse()
      })

      expect((await auditArtifactBundle(directory)).hardFailures).toEqual([])
    }
  })

  it('rejects token provenance that does not resolve to every claimed opaque query route', async () => {
    const directory = await writeBundle((_artifacts, evidence) => {
      for (const page of evidence.pages) {
        page.url = 'https://example.com/app'
        ;(page as typeof page & { routeId: string }).routeId = page.id.includes('home') ? 'route-home' : 'route-about'
      }
      for (const tokenEvidence of Object.values(evidence.tokens.evidence)) {
        ;(tokenEvidence as typeof tokenEvidence & { pageRefs: string[] }).pageRefs = ['route-home', 'route-about']
      }
      ;(evidence.tokens.evidence['spacing.0'] as typeof portableEvidence & { pageRefs: string[] }).pageRefs = [
        'route-home',
      ]
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'evidence-page-ref-count-mismatch:evidence.tokens.evidence.spacing.0.pageRefs',
    )
  })

  it('rejects responsive evidence crossing two query routes after their public URLs collide', async () => {
    const directory = await writeBundle((_artifacts, evidence) => {
      for (const page of evidence.pages) {
        page.url = 'https://example.com/app'
        ;(page as typeof page & { routeId: string }).routeId = page.id.includes('home') ? 'route-home' : 'route-about'
      }
      for (const tokenEvidence of Object.values(evidence.tokens.evidence)) {
        ;(tokenEvidence as typeof tokenEvidence & { pageRefs: string[] }).pageRefs = ['route-home', 'route-about']
      }
      evidence.responsiveObservations.push({
        id: 'responsive-cross-query-route',
        sectionId: 'section-home',
        fromViewport: 'desktop',
        toViewport: 'desktop',
        changeType: 'reflow',
        changedProperties: ['display'],
        summary: 'Fixture',
        evidenceRefs: ['section-home', 'section-about'],
      } as never)
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'wrong-owner-evidence-relation:evidence.responsiveObservations.0.evidenceRefs:section-about',
    )
  })

  it('rejects global token prohibitions when no P0 foundation supports that category', async () => {
    const directory = await writeBundle((artifacts) => {
      artifacts['DESIGN.md'] += "\n## Do's and Don'ts\n\n- ❌ Don't introduce new colors outside the defined palette\n"
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain('unscoped-agent-guidance-without-p0:color')
  })

  it('rejects DESIGN.md counts that drift from canonical independent owner evidence', async () => {
    const directory = await writeBundle((artifacts) => {
      artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
        '- Level 1: `4px` (4 independent owners)',
        '- Level 1: `4px` (40 independent owners)',
      )
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain('design-doc-owner-count-mismatch:spacing.0')
  })

  it('scopes same-literal spacing and radius owner counts to their own localized subsections', async () => {
    const withRadius = (mutateRadius?: (artifacts: Record<string, string>) => void): Promise<string> =>
      writeBundle((artifacts, evidence, rawDtcg) => {
        evidence.tokens.radii = ['4px']
        evidence.tokens.evidence['radii.0'] = {
          ...portableSpacingEvidence('4px'),
          ownerCount: 7,
          sources: ['computed:ordinary-radius'],
        }
        const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
        dtcg.borderRadius = { sm: { $type: 'dimension', $value: '4px' } }
        artifacts['DESIGN.md'] = artifacts['DESIGN.md']
          .replace(
            'components:\n',
            `rounded:
  sm: 4px
components:
`,
          )
          .replace(
            '\n## Components\n',
            `
## Shapes

### Corner Radius Scale

- sm: \`4px\` (7 independent owners)

## Components
`,
          )
        artifacts['variables.css'] = artifacts['variables.css'].replace(' }', ' --radius-sm: 4px; }')
        artifacts['variables.scss'] += '\n$radius-sm: 4px;'
        artifacts['theme.css'] = artifacts['theme.css'].replace(' }', ' --radius-sm: 4px; }')
        mutateRadius?.(artifacts)
      })

    const valid = await auditArtifactBundle(await withRadius())
    expect(valid.hardFailures).not.toContain('design-doc-owner-count-mismatch:radii.0')

    const wrong = await auditArtifactBundle(
      await withRadius((artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
          '- sm: `4px` (7 independent owners)',
          '- sm: `4px` (70 independent owners)',
        )
      }),
    )
    expect(wrong.hardFailures).toContain('design-doc-owner-count-mismatch:radii.0')

    const missing = await auditArtifactBundle(
      await withRadius((artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace('- sm: `4px` (7 independent owners)\n', '')
      }),
    )
    expect(missing.hardFailures).toContain('design-doc-owner-count-mismatch:radii.0')

    const chinese = await auditArtifactBundle(
      await withRadius((artifacts) => {
        artifacts['DESIGN.md'] = artifacts['DESIGN.md']
          .replace('### Corner Radius Scale', '### 圆角刻度')
          .replace('(7 independent owners)', '（7 个独立元素）')
      }),
    )
    expect(chinese.hardFailures).not.toContain('design-doc-owner-count-mismatch:radii.0')
  })

  it('treats equivalent rendered RGB and canonical hex colors as the same frontmatter contract', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      const canvas = 'rgb(255, 255, 255)'
      evidence.tokens.colors.background = canvas
      evidence.tokens.evidence['colors.background'].value = canvas
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.color.background.$value = canvas
      for (const filename of ['variables.css', 'variables.scss', 'theme.css']) {
        artifacts[filename] = artifacts[filename].replaceAll('#ffffff', canvas)
      }

      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].styles.backgroundColor = ['rgb(34, 85, 255)']
      artifacts['component-specs.json'] = JSON.stringify(specs)
      const profile = JSON.parse(artifacts['design-profile.json'])
      profile.transferGrammar.componentRecipes[0].observedStyles.backgroundColor = 'rgb(34, 85, 255)'
      artifacts['design-profile.json'] = JSON.stringify(profile)
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toEqual([])
    expect(result.classification).toBe('pass')
  })

  it('accepts generated color-role claims only when they cite registered page evidence', async () => {
    const validDirectory = await writeBundle((_artifacts, evidence) => {
      ;(evidence as typeof evidence & { deterministicClaims: unknown[] }).deterministicClaims = [
        {
          label: 'neutral palette with a single accent',
          confidence: 'medium',
          reasons: ['Observed action use remains in one hue family.'],
          evidenceRefs: ['page-home-desktop'],
          provenance: [
            {
              source: 'color-role-observation',
              ref: 'color-role:page-home-desktop|body > main > button:nth-of-type(1)',
            },
            { source: 'token-usage', ref: 'usage:primaryActionBackgroundColor' },
          ],
        },
      ]
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const invalidDirectory = await writeBundle((_artifacts, evidence) => {
      ;(evidence as typeof evidence & { deterministicClaims: unknown[] }).deterministicClaims = [
        {
          label: 'neutral palette with a single accent',
          confidence: 'medium',
          reasons: ['Observed action use remains in one hue family.'],
          evidenceRefs: ['color-role:https://example.com/|1440x900|body > main > button'],
          provenance: [
            {
              source: 'color-role-observation',
              ref: 'color-role:missing-page|body > main > button',
            },
          ],
        },
      ]
    })
    const invalid = await auditArtifactBundle(invalidDirectory)
    expect(invalid.hardFailures).toEqual(
      expect.arrayContaining([
        'invalid-evidence-relation:evidence.deterministicClaims.0.evidenceRefs.0:color-role:https://example.com/|1440x900|body > main > button:expected-page-or-image-or-section-or-component',
        'invalid-claim-provenance:evidence.deterministicClaims.0.provenance.0',
      ]),
    )
  })

  it('rejects misleading sparse typography aliases even when their values are present', async () => {
    const validDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSparseTypographyArtifacts(artifacts, evidence, dtcg)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const invalidDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSparseTypographyArtifacts(artifacts, evidence, dtcg)
      artifacts['theme.css'] = artifacts['theme.css']
        .replace('--text-28: 1.75rem;', '--text-base: 1.75rem;')
        .replace('--tracking-wide: 1.12px;', '--tracking-tight: 1.12px;')
      artifacts['DESIGN.md'] = artifacts['DESIGN.md']
        .replace('  size-28:', '  size-base:')
        .replace('  letter-spacing-wide:', '  letter-spacing-tight:')
    })
    const invalid = await auditArtifactBundle(invalidDirectory)
    expect(invalid.hardFailures).toEqual(
      expect.arrayContaining([
        'misleading-font-size-alias:theme.css:--text-base:1.75rem',
        'misleading-letter-spacing-alias:theme.css:--tracking-tight:1.12px',
        'misleading-font-size-alias:DESIGN.md:--text-base:1.75rem',
        'misleading-letter-spacing-alias:DESIGN.md:--tracking-tight:1.12px',
      ]),
    )
  })

  it('decodes CSS font escapes when naming and deduplicating artifact font systems', async () => {
    const validDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addEscapedGenericFontArtifacts(artifacts, evidence, dtcg)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const invalidDirectory = await writeBundle((artifacts, evidence, rawDtcg) => {
      addEscapedGenericFontArtifacts(artifacts, evidence, rawDtcg)
      evidence.tokens.typography.fontFamilies.push('serif')
      evidence.tokens.typography.fontStacks.push('serif')
      const tokenEvidence = evidence.tokens.evidence as Record<string, typeof portableEvidence>
      tokenEvidence['typography.fontFamilies.1'] = { ...portableEvidence, value: 'serif', sources: ['rendered:text'] }
      tokenEvidence['typography.fontStacks.1'] = { ...portableEvidence, value: 'serif', sources: ['rendered:text'] }
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      ;(dtcg.typography.fontFamilies.$value as string[]).push('serif')
      ;(dtcg.typography.fontStacks.$value as string[]).push('serif')
    })
    const invalid = await auditArtifactBundle(invalidDirectory)
    expect(invalid.hardFailures).toEqual(
      expect.arrayContaining([
        'duplicate-semantic-font-stack:generic:serif',
        'duplicate-semantic-font-family:generic:serif',
      ]),
    )
  })

  it('rejects forged ancestor clip provenance for a portable typography token', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      const tokenEvidence = evidence.tokens.evidence['typography.fontFamilies.0'] as unknown as {
        renderedTextOwners: Array<{ source: Record<string, unknown> }>
      }
      tokenEvidence.renderedTextOwners[0].source.clipPathChain = [
        { value: 'circle(40px)', widthPx: 160, heightPx: 80, owner: 'ancestor' },
      ]
      // A producer cannot make a curved clip auditable by forging only the scalar count back to zero.
      tokenEvidence.renderedTextOwners[0].source.nonRectangularClipPathCount = 0
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'invalid-rendered-text-owner-evidence:typography.fontFamilies.0',
        'rendered-text-owner-value-mismatch:typography.fontFamilies.0',
      ]),
    )
  })

  it('rejects arbitrary filter provenance for a portable typography token', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      const tokenEvidence = evidence.tokens.evidence['typography.fontFamilies.0'] as unknown as {
        renderedTextOwners: Array<{ source: Record<string, unknown> }>
      }
      tokenEvidence.renderedTextOwners[0].source.filter = 'url(#zero-alpha)'
      tokenEvidence.renderedTextOwners[0].source.filterOpacity = 1
      tokenEvidence.renderedTextOwners[0].source.filterChain = [{ value: 'url(#zero-alpha)', owner: 'self' }]
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'invalid-rendered-text-owner-evidence:typography.fontFamilies.0',
    )
  })

  it('rejects mask provenance for portable typography', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      const tokenEvidence = evidence.tokens.evidence['typography.fontFamilies.0'] as unknown as {
        renderedTextOwners: Array<{ source: Record<string, unknown> }>
      }
      tokenEvidence.renderedTextOwners[0].source.maskChain = [
        { value: 'linear-gradient(transparent, transparent)', owner: 'self' },
      ]
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'invalid-rendered-text-owner-evidence:typography.fontFamilies.0',
    )
  })

  it('rejects backdrop-dependent blend provenance for portable typography', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      const tokenEvidence = evidence.tokens.evidence['typography.fontFamilies.0'] as unknown as {
        renderedTextOwners: Array<{ source: Record<string, unknown> }>
      }
      tokenEvidence.renderedTextOwners[0].source.blendChain = [{ value: 'difference', owner: 'self' }]
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'invalid-rendered-text-owner-evidence:typography.fontFamilies.0',
    )
  })

  it('accepts gradient-painted typography provenance but rejects a fabricated flat foreground', async () => {
    const useGradientPaint = (evidence: ReturnType<typeof bundleEvidence>) => {
      for (const path of ['typography.fontFamilies.0', 'typography.fontStacks.0']) {
        const tokenEvidence = evidence.tokens.evidence[path] as unknown as {
          renderedTextOwners: Array<{ styles: Record<string, unknown>; source: Record<string, unknown> }>
        }
        for (const owner of tokenEvidence.renderedTextOwners) {
          delete owner.styles.color
          delete owner.source.foreground
          owner.source.glyphPaintKind = 'background-clip'
          owner.source.backgroundClip = 'text'
          owner.source.backgroundImage = 'linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))'
        }
      }
    }

    const validDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      useGradientPaint(evidence)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const invalidDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      useGradientPaint(evidence)
      const tokenEvidence = evidence.tokens.evidence['typography.fontFamilies.0'] as unknown as {
        renderedTextOwners: Array<{ styles: Record<string, unknown> }>
      }
      tokenEvidence.renderedTextOwners[0].styles.color = '#ff0000'
    })
    expect((await auditArtifactBundle(invalidDirectory)).hardFailures).toContain(
      'rendered-text-owner-value-mismatch:typography.fontFamilies.0',
    )
  })

  it('accepts typography whose computed color is intentionally omitted after ancestor opacity', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      for (const path of ['typography.fontFamilies.0', 'typography.fontStacks.0']) {
        const tokenEvidence = evidence.tokens.evidence[path] as unknown as {
          renderedTextOwners: Array<{ styles: { color?: string }; source: { opacity: number } }>
        }
        for (const owner of tokenEvidence.renderedTextOwners) {
          delete owner.styles.color
          owner.source.opacity = 0.92
        }
      }
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual([])
  })

  it('recomputes rendered typography owner counts instead of trusting promotion metadata', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      for (const path of ['typography.fontFamilies.0', 'typography.fontStacks.0']) {
        const item = evidence.tokens.evidence[path] as unknown as { renderedTextOwners: unknown[] }
        item.renderedTextOwners.pop()
      }
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'rendered-text-owner-count-mismatch:typography.fontFamilies.0',
        'insufficient-rendered-text-promotion-evidence:typography.fontFamilies.0',
        'rendered-text-owner-count-mismatch:typography.fontStacks.0',
        'insufficient-rendered-text-promotion-evidence:typography.fontStacks.0',
      ]),
    )
  })

  it('rejects rendered-owner glyph intersections forged outside the final visible bounds', async () => {
    const directory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      const tokenEvidence = evidence.tokens.evidence['typography.fontFamilies.0'] as unknown as {
        renderedTextOwners: Array<{ source: Record<string, unknown> }>
      }
      tokenEvidence.renderedTextOwners[0].source.visibleBounds = { xPx: 0, yPx: 0, widthPx: 50, heightPx: 24 }
      tokenEvidence.renderedTextOwners[0].source.visibleWidthPx = 50
      tokenEvidence.renderedTextOwners[0].source.visibleGlyphRects = [{ xPx: 100, yPx: 0, widthPx: 60, heightPx: 24 }]
      tokenEvidence.renderedTextOwners[0].source.visibleGlyphAreaPx = 1440
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'invalid-rendered-text-owner-evidence:typography.fontFamilies.0',
    )
  })

  it('rejects frontmatter token and component summaries that drift from canonical artifacts', async () => {
    const directory = await writeBundle((artifacts) => {
      artifacts['DESIGN.md'] = artifacts['DESIGN.md']
        .replace('  background: "#ffffff"', '  background: "#fefefe"')
        .replace('  button-primary:\n    backgroundColor:', '  button-renamed:\n    backgroundColor:')
        .replace('          count: 3', '          count: 4')
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'design-doc-colors-catalog-mismatch',
        'design-doc-component-token-map-mismatch',
        'component-summary-detail-mismatch:button-primary:count',
      ]),
    )
  })

  it('recomputes screenshot coverage and rejects missing or tampered assets', async () => {
    const missingDirectory = await writeBundle((_artifacts, evidence) => {
      evidence.pages.forEach((page) => {
        page.images = []
      })
    })
    const missing = await auditArtifactBundle(missingDirectory)

    expect(missing.hardFailures).toEqual(
      expect.arrayContaining([
        'zero-valid-screenshot-assets',
        'evidence-asset-coverage-mismatch:valid',
        'design-doc-asset-coverage-mismatch:valid',
      ]),
    )

    const tamperedDirectory = await writeBundle((_artifacts, evidence) => {
      evidence.pages[0].images[0].contentHash = '0'.repeat(64)
    })
    const tampered = await auditArtifactBundle(tamperedDirectory)

    expect(tampered.hardFailures).toContain('screenshot-content-hash-mismatch:evidence.pages.0.images.0')

    const staleHealthDirectory = await writeBundle((_artifacts, evidence) => {
      evidence.pages[0].health.checkedAt = '2026-09-01T23:59:59.000Z'
    })
    expect((await auditArtifactBundle(staleHealthDirectory)).hardFailures).toContain(
      'stale-final-capture-health:evidence.pages.0',
    )

    const missingTimestampDirectory = await writeBundle((_artifacts, evidence) => {
      delete (evidence.pages[0].images[0] as { capturedAt?: string }).capturedAt
    })
    expect((await auditArtifactBundle(missingTimestampDirectory)).hardFailures).toContain(
      'missing-screenshot-captured-at:evidence.pages.0.images.0',
    )
  })

  it('compares complete candidate records and P1 component recipes across artifacts', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      const candidate = {
        id: 'candidate.spacing.example',
        group: 'spacing',
        value: '2px',
        provenance: 'built-token',
        rejectionReason: 'local-scope',
        evidence: { ...portableEvidence, value: '2px', reuseScope: 'local' },
      }
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = {
        values: [{ ...candidate, value: '3px', evidence: { ...candidate.evidence, value: '3px' } }],
      }
      const profile = JSON.parse(artifacts['design-profile.json'])
      profile.transferGrammar.componentRecipes[0].reuseConfidence = 0.9
      artifacts['design-profile.json'] = JSON.stringify(profile)
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'candidate-catalog-mismatch:evidence-vs-dtcg',
        'profile-component-metric-mismatch:button\u0000primary:reuseConfidence',
      ]),
    )
  })

  it('rejects a bounded component evidence sample that omits a claimed canonical page', async () => {
    const directory = await writeBundle((artifacts) => {
      const profile = JSON.parse(artifacts['design-profile.json'])
      profile.transferGrammar.componentRecipes[0].observed.evidence = [
        { evidenceId: 'button-home-1' },
        { evidenceId: 'button-home-2' },
      ]
      artifacts['design-profile.json'] = JSON.stringify(profile)
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].evidenceRefs = ['button-home-1', 'button-home-2']
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toContain('component-evidence-sample-page-coverage-mismatch:button\u0000primary')
  })

  it('rejects structural controls from the reusable component specification', async () => {
    const directory = await writeBundle((artifacts) => {
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].visualTreatment = 'structural'
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain('structural-control-component-spec:0')
  })

  it('rejects a button-like component specification without observed label typography', async () => {
    const directory = await writeBundle((artifacts) => {
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].visualTreatment = 'button-like'
      for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']) {
        delete specs.components[0].styles[property]
      }
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain('unlabelled-button-like-component-spec:0')
  })

  it('rejects a button-like component specification without a painted or control-sized boundary', async () => {
    const directory = await writeBundle((artifacts) => {
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].visualTreatment = 'button-like'
      specs.components[0].semanticIdentity = 'link'
      specs.components[0].styles.backgroundColor = ['rgba(0, 0, 0, 0)']
      specs.components[0].styles.border = ['1px solid rgba(0, 0, 0, 0)']
      specs.components[0].styles.padding = ['0px 0px 0px 0px']
      specs.components[0].styles.height = ['31px']
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain('unbounded-button-like-component-spec:0')
  })

  it('rejects a context-dependent browser-clamped radius from component specifications', async () => {
    const directory = await writeBundle((artifacts) => {
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].styles.borderRadius = ['3.35544e+07px']
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain('context-dependent-radius-component-spec:0')
  })

  it('rejects content-sized and compound-control geometry from component specifications', async () => {
    const navigationDirectory = await writeBundle((artifacts) => {
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].component = 'navigation'
      specs.components[0].semanticIdentity = 'navigation'
      specs.components[0].styles.height = ['339px']
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })
    expect((await auditArtifactBundle(navigationDirectory)).hardFailures).toContain(
      'context-dependent-component-geometry:0',
    )

    const compoundInputDirectory = await writeBundle((artifacts) => {
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].component = 'input'
      specs.components[0].semanticIdentity = 'input'
      specs.components[0].styles.height = ['32px']
      specs.components[0].styles.padding = ['0px 85px 0px 12px']
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })
    expect((await auditArtifactBundle(compoundInputDirectory)).hardFailures).toContain(
      'context-dependent-component-geometry:0',
    )
  })

  it('enforces the exact route-balanced component-only sample above the 24-instance limit', async () => {
    const validDirectory = await writeBundle((artifacts, evidence) => {
      configureLargeComponentSample(artifacts, evidence)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const pollutedDirectory = await writeBundle((artifacts, evidence) => {
      configureLargeComponentSample(artifacts, evidence)
      const profile = JSON.parse(artifacts['design-profile.json'])
      profile.transferGrammar.componentRecipes[0].observed.evidence.push({ evidenceId: 'section-home' })
      artifacts['design-profile.json'] = JSON.stringify(profile)
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].evidenceRefs.push('section-home')
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })
    expect((await auditArtifactBundle(pollutedDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'component-evidence-sample-length-mismatch:button\u0000primary:25:24',
        'noncanonical-component-evidence-sample-ref:button\u0000primary:section-home',
      ]),
    )

    const reorderedDirectory = await writeBundle((artifacts, evidence) => {
      configureLargeComponentSample(artifacts, evidence)
      const profile = JSON.parse(artifacts['design-profile.json'])
      profile.transferGrammar.componentRecipes[0].observed.evidence.reverse()
      artifacts['design-profile.json'] = JSON.stringify(profile)
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].evidenceRefs.reverse()
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })
    expect((await auditArtifactBundle(reorderedDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'component-evidence-sample-order-mismatch:button\u0000primary',
        'component-evidence-sample-catalog-mismatch:button\u0000primary',
      ]),
    )

    const duplicateDirectory = await writeBundle((artifacts, evidence) => {
      const refs = configureLargeComponentSample(artifacts, evidence)
      const profile = JSON.parse(artifacts['design-profile.json'])
      profile.transferGrammar.componentRecipes[0].observed.evidence[23] = { evidenceId: refs[0] }
      artifacts['design-profile.json'] = JSON.stringify(profile)
      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].evidenceRefs[23] = refs[0]
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })
    expect((await auditArtifactBundle(duplicateDirectory)).hardFailures).toContain(
      'duplicate-component-evidence-sample-ref:button\u0000primary:spec:button-home-01',
    )

    const wrongTypeDirectory = await writeBundle((artifacts, evidence) => {
      const refs = configureLargeComponentSample(artifacts, evidence)
      evidence.components.find((component) => component.id === refs[0])!.type = 'card'
    })
    expect((await auditArtifactBundle(wrongTypeDirectory)).hardFailures).toContain(
      'noncanonical-component-evidence-sample-ref:button\u0000primary:button-home-01',
    )
  })

  it('keeps same-style icon and larger action evidence in their geometry-derived canonical patterns', async () => {
    const validDirectory = await writeBundle((artifacts, evidence) => {
      configureGeometrySeparatedButtonPatterns(artifacts, evidence)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const crossedDirectory = await writeBundle((artifacts, evidence) => {
      configureGeometrySeparatedButtonPatterns(artifacts, evidence)
      const profile = JSON.parse(artifacts['design-profile.json'])
      const iconRecipe = profile.transferGrammar.componentRecipes.find(
        (recipe: { component: string; variant: string }) => recipe.component === 'button' && recipe.variant === 'icon',
      )
      iconRecipe.observed.evidence[2] = { evidenceId: 'button-text-home' }
      iconRecipe.observed.assertions = componentAssertions(
        iconRecipe.observed.evidence.map((item: { evidenceId: string }) => item.evidenceId),
        'button',
        'icon',
      )
      artifacts['design-profile.json'] = JSON.stringify(profile)

      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components[0].evidenceRefs[2] = 'button-text-home'
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })
    expect((await auditArtifactBundle(crossedDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'noncanonical-component-evidence-sample-ref:button\u0000icon:button-text-home',
        'component-evidence-sample-catalog-mismatch:button\u0000icon',
        'component-spec-evidence-sample-catalog-mismatch:button\u0000icon',
      ]),
    )
  })

  it('rejects unowned container typography and content-driven component height', async () => {
    const unownedTextDirectory = await writeBundle((_artifacts, evidence) => {
      evidence.components[0].styles.fontFamily = 'Times'
    })
    expect((await auditArtifactBundle(unownedTextDirectory)).hardFailures).toContain(
      'unowned-component-text-style:button-home-1',
    )

    const containerDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0]
      component.type = 'list'
      ;(component as typeof component & { textStyleOwner?: 'root' | 'descendant' }).textStyleOwner = 'root'
      component.styles.fontFamily = 'Times'
      component.styles.height = '400px'
    })
    expect((await auditArtifactBundle(containerDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'container-component-owns-text-style:button-home-1',
        'content-sized-component-height:button-home-1',
      ]),
    )

    const transparentForegroundDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0] as (typeof evidence.components)[number] & {
        textStyleOwner?: 'root' | 'descendant'
      }
      component.textStyleOwner = 'root'
      component.styles.color = 'rgba(0, 0, 0, 0)'
    })
    expect((await auditArtifactBundle(transparentForegroundDirectory)).hardFailures).toContain(
      'transparent-component-foreground:button-home-1',
    )

    const nativeSource = (visibleWidthPx = 120, textIndentPx = 0) => ({
      kind: 'native-value',
      widthPx: 120,
      heightPx: 24,
      visibleWidthPx,
      visibleHeightPx: 24,
      paintedAreaPx: visibleWidthPx * 24,
      captureIntersectionRatio: visibleWidthPx / 120,
      effectiveClipPathAreaRatio: 1,
      ancestorClipCount: 0,
      clientRectCount: 1,
      glyphRectCount: 0,
      visibleBounds: { xPx: 0, yPx: 0, widthPx: visibleWidthPx, heightPx: 24 },
      visibleGlyphRects: [],
      visibleGlyphAreaPx: 0,
      nativeTextBounds: { xPx: 10, yPx: 4, widthPx: 100, heightPx: 16 },
      nativeTextOrigin: 'explicit-value',
      clipPathChain: [],
      nonRectangularClipPathCount: 0,
      clip: 'auto',
      clipPath: 'none',
      contentVisibility: 'visible',
      opacity: 1,
      filterOpacity: 1,
      filterChain: [],
      maskChain: [],
      blendChain: [],
      textIndentPx,
      filter: 'none',
      glyphPaintKind: 'solid-color',
      foreground: '#2255ff',
    })
    const validNativeDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0] as (typeof evidence.components)[number] & {
        textStyleOwner?: 'root' | 'descendant'
        textStyleSource?: Record<string, unknown>
      }
      component.textStyleOwner = 'root'
      component.styles.color = '#2255ff'
      component.styles.fontFamily = 'Georgia'
      component.textStyleSource = nativeSource()
    })
    expect((await auditArtifactBundle(validNativeDirectory)).hardFailures).not.toContain(
      'invalid-component-text-style-source:button-home-1',
    )

    const originlessNativeDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0] as (typeof evidence.components)[number] & {
        textStyleOwner?: 'root' | 'descendant'
        textStyleSource?: Record<string, unknown>
      }
      component.textStyleOwner = 'root'
      component.styles.color = '#2255ff'
      component.styles.fontFamily = 'Georgia'
      const source = nativeSource() as Record<string, unknown>
      delete source.nativeTextOrigin
      component.textStyleSource = source
    })
    expect((await auditArtifactBundle(originlessNativeDirectory)).hardFailures).toContain(
      'invalid-component-text-style-source:button-home-1',
    )

    const filteredTextDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0] as (typeof evidence.components)[number] & {
        textStyleOwner?: 'root' | 'descendant'
        textStyleSource?: Record<string, unknown>
      }
      component.textStyleOwner = 'root'
      component.styles.color = '#2255ff'
      component.styles.fontFamily = 'Georgia'
      component.textStyleSource = {
        ...nativeSource(),
        filter: 'opacity(0)',
        filterOpacity: 0,
        filterChain: [{ value: 'opacity(0)', owner: 'self' }],
      }
    })
    expect((await auditArtifactBundle(filteredTextDirectory)).hardFailures).toContain(
      'invalid-component-text-style-source:button-home-1',
    )

    const partiallyCapturedNativeDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0] as (typeof evidence.components)[number] & {
        textStyleOwner?: 'root' | 'descendant'
        textStyleSource?: Record<string, unknown>
      }
      component.textStyleOwner = 'root'
      component.styles.color = '#2255ff'
      component.styles.fontFamily = 'Georgia'
      component.textStyleSource = nativeSource(50)
    })
    expect((await auditArtifactBundle(partiallyCapturedNativeDirectory)).hardFailures).toContain(
      'invalid-component-text-style-source:button-home-1',
    )

    const displacedNativeDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0] as (typeof evidence.components)[number] & {
        textStyleOwner?: 'root' | 'descendant'
        textStyleSource?: Record<string, unknown>
      }
      component.textStyleOwner = 'root'
      component.styles.color = '#2255ff'
      component.styles.fontFamily = 'Georgia'
      component.textStyleSource = nativeSource(120, 100)
    })
    expect((await auditArtifactBundle(displacedNativeDirectory)).hardFailures).toContain(
      'invalid-component-text-style-source:button-home-1',
    )

    const clippedSourceDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0] as (typeof evidence.components)[number] & {
        textStyleOwner?: 'root' | 'descendant'
        textStyleSource?: Record<string, unknown>
      }
      component.textStyleOwner = 'root'
      component.styles.color = '#2255ff'
      component.styles.fontFamily = 'Georgia'
      component.textStyleSource = {
        kind: 'native-value',
        widthPx: 120,
        heightPx: 24,
        visibleWidthPx: 120,
        visibleHeightPx: 24,
        paintedAreaPx: 1.152,
        captureIntersectionRatio: 1,
        effectiveClipPathAreaRatio: 0.0004,
        ancestorClipCount: 0,
        clientRectCount: 1,
        glyphRectCount: 0,
        visibleBounds: { xPx: 0, yPx: 0, widthPx: 120, heightPx: 24 },
        visibleGlyphRects: [],
        visibleGlyphAreaPx: 0,
        nativeTextOrigin: 'explicit-value',
        clipPathChain: [{ value: 'inset(49%)', widthPx: 120, heightPx: 24, owner: 'self' }],
        nonRectangularClipPathCount: 0,
        clip: 'auto',
        clipPath: 'inset(49%)',
        contentVisibility: 'visible',
        opacity: 1,
        filterOpacity: 1,
        filterChain: [],
        maskChain: [],
        blendChain: [],
        textIndentPx: 0,
        filter: 'none',
        glyphPaintKind: 'solid-color',
        foreground: '#2255ff',
      }
    })
    expect((await auditArtifactBundle(clippedSourceDirectory)).hardFailures).toContain(
      'invalid-component-text-style-source:button-home-1',
    )

    const circularClipDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0] as (typeof evidence.components)[number] & {
        textStyleOwner?: 'root' | 'descendant'
        textStyleSource?: Record<string, unknown>
      }
      component.textStyleOwner = 'root'
      component.styles.color = '#2255ff'
      component.styles.fontFamily = 'Georgia'
      component.textStyleSource = {
        kind: 'native-value',
        widthPx: 120,
        heightPx: 24,
        visibleWidthPx: 120,
        visibleHeightPx: 24,
        paintedAreaPx: 2880,
        captureIntersectionRatio: 1,
        effectiveClipPathAreaRatio: 1,
        ancestorClipCount: 0,
        clientRectCount: 1,
        glyphRectCount: 0,
        visibleBounds: { xPx: 0, yPx: 0, widthPx: 120, heightPx: 24 },
        visibleGlyphRects: [],
        visibleGlyphAreaPx: 0,
        nativeTextOrigin: 'explicit-value',
        clipPathChain: [{ value: 'circle(1px)', widthPx: 120, heightPx: 24, owner: 'self' }],
        nonRectangularClipPathCount: 1,
        clip: 'auto',
        clipPath: 'circle(1px)',
        contentVisibility: 'visible',
        opacity: 1,
        filterOpacity: 1,
        filterChain: [],
        maskChain: [],
        blendChain: [],
        textIndentPx: 0,
        filter: 'none',
        glyphPaintKind: 'solid-color',
        foreground: '#2255ff',
      }
    })
    expect((await auditArtifactBundle(circularClipDirectory)).hardFailures).toContain(
      'invalid-component-text-style-source:button-home-1',
    )

    const maskedSourceDirectory = await writeBundle((_artifacts, evidence) => {
      const component = evidence.components[0] as (typeof evidence.components)[number] & {
        textStyleOwner?: 'root' | 'descendant'
        textStyleSource?: Record<string, unknown>
      }
      component.textStyleOwner = 'root'
      component.styles.color = '#2255ff'
      component.styles.fontFamily = 'Georgia'
      component.textStyleSource = {
        ...nativeSource(),
        maskChain: [{ value: 'linear-gradient(transparent, transparent)', owner: 'self' }],
      }
    })
    expect((await auditArtifactBundle(maskedSourceDirectory)).hardFailures).toContain(
      'invalid-component-text-style-source:button-home-1',
    )
  })

  it('requires auditable glyph-paint provenance for layout typography', async () => {
    const addLayoutHeading = (artifacts: Record<string, string>, evidence: ReturnType<typeof bundleEvidence>) => {
      addResponsiveTypographyAndStructureEvidence(artifacts, evidence)
      const node = evidence.layoutNodes[0] as unknown as {
        id: string
        textStyleSource?: Record<string, unknown>
        observedTypography: Record<string, unknown>
      }
      node.observedTypography.color = '#111111'
      return node
    }

    const validDirectory = await writeBundle((artifacts, evidence) => addLayoutHeading(artifacts, evidence))
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const missingSourceDirectory = await writeBundle((artifacts, evidence) => {
      const node = addLayoutHeading(artifacts, evidence)
      delete node.textStyleSource
    })
    expect((await auditArtifactBundle(missingSourceDirectory)).hardFailures).toContain(
      'invalid-layout-text-style-source:layout-page-home-desktop',
    )

    const transparentSourceDirectory = await writeBundle((artifacts, evidence) => {
      const node = addLayoutHeading(artifacts, evidence)
      const source = node.textStyleSource!
      source.foreground = 'rgba(17, 17, 17, 0)'
    })
    expect((await auditArtifactBundle(transparentSourceDirectory)).hardFailures).toContain(
      'invalid-layout-text-style-source:layout-page-home-desktop',
    )

    const maskedSourceDirectory = await writeBundle((artifacts, evidence) => {
      const node = addLayoutHeading(artifacts, evidence)
      node.textStyleSource!.maskChain = [{ value: 'linear-gradient(transparent, transparent)', owner: 'self' }]
    })
    expect((await auditArtifactBundle(maskedSourceDirectory)).hardFailures).toContain(
      'invalid-layout-text-style-source:layout-page-home-desktop',
    )
  })

  it('accepts an empty pseudo element when its own paint is visible', async () => {
    const directory = await writeBundle((_artifacts, evidence) => {
      const section = evidence.sections[0]
      evidence.pseudoElements = [
        {
          id: 'pseudo-painted-empty-home',
          pageId: section.pageId,
          sectionId: section.id,
          target: 'body > main:nth-of-type(1)',
          kind: 'before',
          styles: { content: '""', backgroundColor: 'rgb(30, 120, 210)' },
          paint: visiblePseudoPaint(),
          evidenceRefs: [section.id],
        },
      ]
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual([])
  })

  it('accepts machine-epsilon drift in a pseudo capture intersection ratio', async () => {
    const directory = await writeBundle((_artifacts, evidence) => {
      const section = evidence.sections[0]
      evidence.pseudoElements = [
        {
          id: 'pseudo-epsilon-home',
          pageId: section.pageId,
          sectionId: section.id,
          target: 'body > main:nth-of-type(1)',
          kind: 'before',
          styles: { content: '""', backgroundColor: 'rgb(30, 120, 210)' },
          paint: { ...visiblePseudoPaint(), captureIntersectionRatio: 1 + Number.EPSILON },
          evidenceRefs: [section.id],
        },
      ]
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual([])
  })

  it('rejects empty pseudo evidence whose modern paint is fully transparent', async () => {
    const directory = await writeBundle((_artifacts, evidence) => {
      const section = evidence.sections[0]
      evidence.pseudoElements = [
        {
          id: 'pseudo-unpainted-home',
          pageId: section.pageId,
          sectionId: section.id,
          target: 'body > main:nth-of-type(1)',
          kind: 'before',
          paint: visiblePseudoPaint(),
          styles: {
            content: '" "',
            backgroundColor: 'color(srgb 1 0 0 / none)',
            borderTop: '3px solid oklch(60% 0.2 30 / none)',
            borderRight: '3px solid oklch(60% 0.2 30 / none)',
            borderBottom: '3px solid oklch(60% 0.2 30 / none)',
            borderLeft: '3px solid oklch(60% 0.2 30 / none)',
            boxShadow: '0 4px 12px color(srgb 1 0 0 / none)',
          },
          evidenceRefs: [section.id],
        },
      ]
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'unpainted-empty-pseudo-evidence:pseudo-unpainted-home',
    )
  })

  it.each([
    ['zero geometry', { widthPx: 0 }],
    ['near-transparent paint', { opacity: 0.001 }],
    ['off-capture geometry', { xPx: -10_000 }],
    ['meaningfully impossible ratio', { captureIntersectionRatio: 1.01 }],
    ['masked paint', { maskChain: [{ value: 'linear-gradient(transparent, transparent)', owner: 'paint' }] }],
    ['blended paint', { blendChain: [{ value: 'difference', owner: 'paint' }] }],
  ])('rejects %s pseudo paint provenance', async (_label, mutation) => {
    const directory = await writeBundle((_artifacts, evidence) => {
      const section = evidence.sections[0]
      evidence.pseudoElements = [
        {
          id: 'pseudo-invalid-paint-home',
          pageId: section.pageId,
          sectionId: section.id,
          target: 'body > main:nth-of-type(1)',
          kind: 'before',
          styles: { content: '""', backgroundColor: 'rgb(30, 120, 210)' },
          paint: { ...visiblePseudoPaint(), ...mutation },
          evidenceRefs: [section.id],
        },
      ]
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'invalid-pseudo-paint-evidence:pseudo-invalid-paint-home',
    )
  })

  it('rejects component contrast notes outside the independently selected P1 projection', async () => {
    const directory = await writeBundle((artifacts) => {
      artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
        '### Reconstruction Summary',
        `### Component Contrast Notes

- \`button-omitted\`: foreground \`#8491a5\` over observed background \`#ffffff\` is 3.19:1, below the 4.5:1 target.

### Reconstruction Summary`,
      )
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'contrast-note-outside-selected-p1:button-omitted',
    )
  })

  it('independently rejects a synchronized downgrade of an actionable P1 pattern', async () => {
    const directory = await writeGate21Bundle('en', (artifacts) => {
      const profile = JSON.parse(artifacts['design-profile.json'])
      profile.transferGrammar.componentRecipes.find(
        (recipe: { component: string }) => recipe.component === 'button',
      ).priority = 'P2'
      artifacts['design-profile.json'] = JSON.stringify(profile)

      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components = []
      artifacts['component-specs.json'] = JSON.stringify(specs)

      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        delete frontMatterValue.components
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const summary = extension.componentSummary as Record<string, number>
        summary.actionablePatterns = 0
        summary.renderedP1Patterns = 0
        summary.omittedP1Patterns = 0
        summary.yamlComponentContracts = 0
        summary.omittedReusablePatterns = 2
      })
        .replace(
          `#### button · primary

_3 representative-style match(es) across 2 page(s) · identity 0.95 · reuse 0.85 · observed across pages_

`,
          '',
        )
        .replace(
          '- **card:** 1 local pattern(s), 1 representative instance(s)',
          '- **button:** 1 local pattern(s), 3 representative instance(s)\n- **card:** 1 local pattern(s), 1 representative instance(s)',
        )
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'canonical-component-spec-count:button\u0000primary:0:1',
        'profile-component-priority-mismatch:button\u0000primary:P2:P1',
      ]),
    )
  })

  it('independently rejects a synchronized promotion of a reusable but non-actionable P2 pattern', async () => {
    const directory = await writeGate21Bundle('en', (artifacts) => {
      const profile = JSON.parse(artifacts['design-profile.json'])
      profile.transferGrammar.componentRecipes.find(
        (recipe: { component: string }) => recipe.component === 'list',
      ).priority = 'P1'
      artifacts['design-profile.json'] = JSON.stringify(profile)

      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components.push({
        component: 'list',
        variant: 'default',
        sourceInstances: 2,
        pageCount: 2,
        identityConfidence: 0.9,
        reuseConfidence: 0.85,
        reuseScope: 'cross-page',
        styles: {},
        tokenRefs: [],
        stateRefs: [],
        evidenceRefs: ['list-home', 'list-about'],
      })
      artifacts['component-specs.json'] = JSON.stringify(specs)

      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const summary = extension.componentSummary as Record<string, number>
        summary.actionablePatterns = 2
        summary.renderedP1Patterns = 2
        summary.omittedP1Patterns = 0
        summary.omittedReusablePatterns = 0
      })
        .replace(
          '### Reconstruction Summary',
          `#### list · default

_2 representative-style match(es) across 2 page(s) · identity 0.90 · reuse 0.85 · observed across pages_

### Reconstruction Summary`,
        )
        .replace('- **list:** 1 local pattern(s), 2 representative instance(s)\n', '')
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'canonical-component-spec-count:list\u0000default:1:0',
        'profile-component-priority-mismatch:list\u0000default:P1:P2',
      ]),
    )
  })

  it('independently keeps repeated broad live regions out of P1 status recipes', async () => {
    const directory = await writeGate21Bundle('en', (artifacts, evidence) => {
      for (const component of evidence.components.filter((item) => item.type === 'list')) {
        Object.assign(component, {
          type: 'status',
          role: 'status-neutral',
          elementKind: 'status',
          rect: { x: 0, y: 0, width: 1, height: 0.143 },
          styles: {
            color: '#203040',
            fontFamily: 'Inter',
            fontSize: '16px',
            padding: '16px',
            backgroundColor: 'color(srgb 1 0 0 / none)',
            border: '1px solid color(srgb 1 0 0 / none)',
            boxShadow: '0 2px 6px oklch(60% 0.2 30 / none)',
          },
          textStyleOwner: 'root',
          textStyleSource: {
            kind: 'direct-text',
            widthPx: 1000,
            heightPx: 100,
            visibleWidthPx: 1000,
            visibleHeightPx: 100,
            paintedAreaPx: 100000,
            captureIntersectionRatio: 1,
            effectiveClipPathAreaRatio: 1,
            ancestorClipCount: 0,
            clientRectCount: 1,
            glyphRectCount: 1,
            visibleBounds: { xPx: 0, yPx: 0, widthPx: 1000, heightPx: 100 },
            visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 1000, heightPx: 100 }],
            visibleGlyphAreaPx: 100000,
            clipPathChain: [],
            nonRectangularClipPathCount: 0,
            clip: 'auto',
            clipPath: 'none',
            contentVisibility: 'visible',
            opacity: 1,
            filterOpacity: 1,
            filterChain: [],
            maskChain: [],
            blendChain: [],
            textIndentPx: 0,
            filter: 'none',
            glyphPaintKind: 'solid-color',
            foreground: '#203040',
          },
          statusBoundary: {
            strongVisualBoundary: true,
            paintedFill: true,
            paintedBorder: true,
            paintedShadow: true,
            directlyOwnedText: true,
            widthPx: 1000,
            heightPx: 100,
            viewportWidth: 1000,
            viewportHeight: 700,
          },
        })
      }

      const profile = JSON.parse(artifacts['design-profile.json'])
      const recipe = profile.transferGrammar.componentRecipes.find(
        (candidate: { component: string }) => candidate.component === 'list',
      )
      recipe.component = 'status'
      recipe.variant = 'neutral'
      recipe.priority = 'P1'
      for (const assertion of recipe.observed.assertions) {
        assertion.target = 'status'
        if (assertion.predicate === 'variant') assertion.value = 'neutral'
      }
      artifacts['design-profile.json'] = JSON.stringify(profile)

      const specs = JSON.parse(artifacts['component-specs.json'])
      specs.components.push({
        component: 'status',
        variant: 'neutral',
        role: 'status-neutral',
        sourceInstances: 2,
        pageCount: 2,
        identityConfidence: 0.9,
        reuseConfidence: 0.85,
        reuseScope: 'cross-page',
        styles: { color: ['#203040'], fontFamily: ['Inter'], fontSize: ['16px'], padding: ['16px'] },
        tokenRefs: [],
        stateRefs: [],
        evidenceRefs: ['list-home', 'list-about'],
      })
      artifacts['component-specs.json'] = JSON.stringify(specs)
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'canonical-component-spec-count:status\u0000neutral:1:0',
        'profile-component-priority-mismatch:status\u0000neutral:P1:P2',
      ]),
    )
  })

  it('reconstructs every component summary total instead of accepting forged internal arithmetic', async () => {
    const directory = await writeGate21Bundle('en', (artifacts) => {
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const summary = extension.componentSummary as Record<string, number>
        summary.patterns = 7
        summary.instances = 16
        summary.reusablePatterns = 5
        summary.omittedLocalPatterns = 2
        summary.omittedReusablePatterns = 4
      })
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'component-summary-catalog-mismatch:patterns',
        'component-summary-catalog-mismatch:instances',
        'component-summary-catalog-mismatch:reusablePatterns',
        'component-summary-catalog-mismatch:omittedLocalPatterns',
        'component-summary-catalog-mismatch:omittedReusablePatterns',
      ]),
    )
  })

  it('validates direct relational ownership IDs in Design Evidence', async () => {
    const directory = await writeBundle((_artifacts, evidence) => {
      evidence.components[0].pageId = 'missing-page'
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toContain('unresolved-evidence-ref:evidence.components.0.pageId:missing-page')
  })

  it('enforces evidence entity types, page ownership, target kinds, and globally unique IDs', async () => {
    const directory = await writeBundle((_artifacts, evidence) => {
      evidence.components[0].pageId = 'section-home'
      evidence.components[1].sectionId = 'section-about'
      evidence.interactionObservations.push({
        id: 'interaction-mismatched-target',
        pageId: 'page-home-desktop',
        sectionId: 'section-home',
        targetId: 'section-home',
        targetKind: 'component',
        evidenceRefs: ['section-home'],
      } as never)
      evidence.mediaLayers.push({
        id: 'section-home',
        pageId: 'page-home-desktop',
        sectionId: 'section-home',
      } as never)
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'duplicate-evidence-id:section-home:section:media',
        'invalid-evidence-relation:evidence.components.0.pageId:section-home:expected-page',
        'cross-page-evidence-relation:evidence.components.1',
        'invalid-evidence-relation:evidence.interactionObservations.0.targetId:section-home:expected-component',
      ]),
    )
  })

  it('rejects existing evidence IDs when they belong to another page, section, target, or responsive pair', async () => {
    const directory = await writeBundle((_artifacts, evidence) => {
      evidence.sections[0].evidenceRefs = ['image-page-about-desktop']
      evidence.components[0].evidenceRefs = ['section-about']
      const mutableEvidence = evidence as Record<string, unknown>
      mutableEvidence.pseudoElements = [
        {
          id: 'pseudo-home',
          pageId: 'page-home-desktop',
          sectionId: 'section-home',
          target: 'body > main',
          kind: 'before',
          styles: {},
          evidenceRefs: ['section-about'],
        },
      ]
      evidence.interactionObservations.push({
        id: 'interaction-home',
        pageId: 'page-home-desktop',
        sectionId: 'section-home',
        targetId: 'button-home-1',
        targetKind: 'component',
        driver: 'hover',
        safety: 'passive',
        trigger: { kind: 'css-pseudo-class:hover' },
        before: {},
        after: {},
        changedProperties: [],
        evidenceRefs: ['section-home', 'button-about'],
      } as never)
      evidence.responsiveObservations.push({
        id: 'responsive-home',
        sectionId: 'section-home',
        fromViewport: 'desktop',
        toViewport: 'mobile',
        changeType: 'reflow',
        changedProperties: ['display'],
        summary: 'Fixture',
        evidenceRefs: ['section-home', 'section-about'],
      } as never)
      evidence.topology.globalLayers.push({
        id: 'layer-home',
        pageId: 'page-home-desktop',
        role: 'other',
        layoutMode: 'fixed',
        evidenceRefs: ['section-about'],
      } as never)
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'wrong-owner-evidence-relation:evidence.sections.0.evidenceRefs.0:image-page-about-desktop',
        'wrong-owner-evidence-relation:evidence.components.0.evidenceRefs.0:section-about',
        'wrong-owner-evidence-relation:evidence.pseudo.0.evidenceRefs.0:section-about',
        'wrong-owner-evidence-relation:evidence.interactionObservations.0.evidenceRefs.1:button-about',
        'wrong-owner-evidence-relation:evidence.responsiveObservations.0.evidenceRefs:section-about',
        'wrong-owner-evidence-relation:evidence.topology.globalLayers.0.evidenceRefs.0:section-about',
      ]),
    )
  })

  it('requires exact names and values in every implementation formatter and DTCG object group', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      artifacts['variables.css'] = artifacts['variables.css'].replace('--color-primary', '--color-renamed')
      artifacts['variables.scss'] = artifacts['variables.scss'].replace('$spacing-1: 4px', '$spacing-1: 6px')
      artifacts['theme.css'] += '\n:root { --spacing-stale: 12px; }'
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.spacing = {
        '1': { $type: 'dimension', $value: '8px' },
        '2': { $type: 'dimension', $value: '4px' },
      }
      dtcg.color = { renamed: dtcg.color.primary }
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'missing-implementation-token:variables.css:--color-primary',
        'unexpected-implementation-token:variables.css:--color-renamed',
        'implementation-token-value-mismatch:variables.scss:$spacing-1',
        'unexpected-implementation-token:theme.css:--spacing-stale',
        'missing-dtcg-key:color.primary',
        'unexpected-dtcg-key:color.renamed',
        'dtcg-token-value-mismatch:spacing.1',
        'dtcg-token-value-mismatch:spacing.2',
      ]),
    )
  })

  it('requires every promoted font stack in DESIGN.md and each implementation format', async () => {
    const validDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addMultipleFontArtifacts(artifacts, evidence, dtcg)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const invalidDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addMultipleFontArtifacts(artifacts, evidence, dtcg)
      artifacts['variables.css'] = artifacts['variables.css'].replace(' --font-sans: Inter, sans-serif;', '')
    })
    expect((await auditArtifactBundle(invalidDirectory)).hardFailures).toContain(
      'missing-implementation-token:variables.css:--font-sans',
    )
  })

  it('rejects typography feature tags that contradict the independent DTCG font semantics', async () => {
    const validDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const invalidMonospaceDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
        '  - evidence:',
        `  - featureTags:
      - monospace typography
    evidence:`,
      )
    })
    expect((await auditArtifactBundle(invalidMonospaceDirectory)).hardFailures).toContain(
      'unsupported-feature-tag:monospace-typography',
    )

    const invalidSerifDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
        '  - evidence:',
        `  - featureTags:
      - 衬线编辑风格
    evidence:`,
      )
    })
    expect((await auditArtifactBundle(invalidSerifDirectory)).hardFailures).toContain(
      'unsupported-feature-tag:serif-editorial-style',
    )
  })

  it('validates complete dark catalogs in CSS, SCSS variables/mixin, and Tailwind output', async () => {
    const validDirectory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const invalidDirectory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg, (sources) => {
        sources['variables.css'] = sources['variables.css'].replace('    --color-primary: #101827;\n', '')
        sources['variables.scss'] = sources['variables.scss']
          .replace('$dark-spacing-1: 4px;', '$dark-spacing-1: 6px;')
          .replace('  --spacing-2: 8px;\n}', '}')
        sources['theme.css'] += '\n/* Dark mode overrides */\n:root { --spacing-stale: 12px; }'
      })
    })
    const result = await auditArtifactBundle(invalidDirectory)

    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'missing-dark-implementation-token:variables.css:--color-primary',
        'dark-implementation-token-value-mismatch:variables.scss:$dark-spacing-1',
        'missing-dark-implementation-token:variables.scss@mixin:--spacing-2',
        'invalid-dark-implementation-scope:theme.css',
      ]),
    )
  })

  it('binds dark token evidence to the explicit entry route regardless of Evidence page order', async () => {
    const validDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
      evidence.pages.reverse()
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const subpageDirectory = await writeBundle((artifacts, evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      evidence.pages.reverse()
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & { dark: ReturnType<typeof bundleDtcg> }
      const darkEvidence = dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<string, Record<string, unknown>>
      for (const item of Object.values(darkEvidence)) {
        item.pages = ['https://example.com/about']
        item.pageRefs = [ABOUT_ROUTE_ID]
        if (Array.isArray(item.renderedTextOwners)) {
          item.renderedTextOwners = item.renderedTextOwners.map((rawOwner) => ({
            ...(rawOwner as Record<string, unknown>),
            page: 'https://example.com/about',
            routeId: ABOUT_ROUTE_ID,
          }))
        }
        if (item.pairedSurface && typeof item.pairedSurface === 'object' && !Array.isArray(item.pairedSurface)) {
          const pair = item.pairedSurface as Record<string, unknown>
          if (Array.isArray(pair.routeSupport)) {
            pair.routeSupport = pair.routeSupport.map((rawRoute) => ({
              ...(rawRoute as Record<string, unknown>),
              page: 'https://example.com/about',
              routeId: ABOUT_ROUTE_ID,
            }))
          }
        }
      }
    })
    expect((await auditArtifactBundle(subpageDirectory)).hardFailures).toEqual(
      expect.arrayContaining(['evidence-page-ref-page-mismatch:dtcg.dark.tokenEvidence.colors.primary.pageRefs']),
    )
  })

  it('rejects a changed dark foundation surface without an exact readable text pair', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & { dark: ReturnType<typeof bundleDtcg> }
      dtcg.dark.color.background.$value = '#000000'
      ;(dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<string, unknown>)['colors.background'] = {
        ...portableEvidence,
        value: '#000000',
        observationCount: 2,
        ownerCount: 2,
        pageCount: 1,
        captureCount: 1,
        eligiblePageCount: 1,
        pageSupportRatio: 1,
        pages: ['https://example.com/'],
        pageRefs: [HOME_ROUTE_ID],
      }
      const darkMode = dtcg.$extensions['com.imprint.darkMode'] as { overrides: Record<string, string> }
      darkMode.overrides['color.background'] = '#000000'
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const projected = extension.darkMode as {
          overrideRefs: string[]
          overrides: Record<string, string>
          colors: Record<string, string>
        }
        projected.overrideRefs.unshift('color.background')
        projected.overrides['color.background'] = '#000000'
        projected.colors.background = '#000000'
      }).replace('| `--color-background` | `#ffffff` |', '| `--color-background` | `#000000` |')
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '    --color-background: #ffffff;',
        '    --color-background: #000000;',
      )
      artifacts['theme.css'] = artifacts['theme.css'].replace(
        '    --color-background: #ffffff;',
        '    --color-background: #000000;',
      )
      artifacts['variables.scss'] = artifacts['variables.scss']
        .replace('$dark-color-background: #ffffff;', '$dark-color-background: #000000;')
        .replace('  --color-background: #ffffff;', '  --color-background: #000000;')
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'dark-background-missing-readable-foreground-pair',
    )
  })

  it('rejects unsupported dark DTCG keys, orphan evidence, and forged unchanged evidence', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & { dark: ReturnType<typeof bundleDtcg> }
      ;(dtcg.dark.spacing as Record<string, unknown>).fabricated = { $type: 'dimension', $value: '13px' }
      ;(dtcg.dark.color.background as Record<string, unknown>).$type = 'dimension'
      ;(dtcg.dark.color.background as Record<string, unknown>).$fabricated = true
      const darkEvidence = dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<string, Record<string, unknown>>
      darkEvidence['colors.fabricated'] = { ...portableEvidence, value: '#ff00ff' }
      darkEvidence['spacing.0'] = { ...darkEvidence['spacing.0'], observationCount: 999, semanticAgreement: 42 }
      darkEvidence['spacing.1'] = { ...darkEvidence['spacing.1'], observationCount: 0.5, ownerCount: 0.5 }
      darkEvidence['spacing.1'].pairedSurface = {}
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'unexpected-dtcg-key:spacing.fabricated',
        'invalid-dtcg-token-shape:color.background',
        'stale-dark-token-evidence:colors.fabricated',
        'dark-token-semantic-agreement-out-of-range:spacing.0',
        'non-integer-dark-token-evidence:spacing.1.observationCount',
        'non-integer-dark-token-evidence:spacing.1.ownerCount',
        'unexpected-paired-surface-evidence:spacing.1',
      ]),
    )
  })

  it('rejects duplicate raw DTCG member names before JSON parsing collapses them', async () => {
    const directory = await writeBundle()
    const filename = path.join(directory, 'design-tokens.json')
    const source = await fs.readFile(filename, 'utf8')
    await fs.writeFile(filename, source.replace('"$value":"#ffffff"', '"$value":"#000000","$value":"#ffffff"'))

    expect((await auditArtifactBundle(directory)).hardFailures).toContain('duplicate-json-key:design-tokens.json')
  })

  it('rejects out-of-range support ratios in the base portable evidence catalog', async () => {
    const directory = await writeBundle((_artifacts, evidence, rawDtcg) => {
      const item = (evidence.tokens.evidence as Record<string, Record<string, unknown>>)['colors.primary']
      item.pageSupportRatio = 42
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      ;(dtcg.$extensions['com.imprint.tokenEvidence'] as Record<string, Record<string, unknown>>)[
        'colors.primary'
      ].pageSupportRatio = 42
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'portable-token-page-support-out-of-range:colors.primary',
    )

    const fractionalDirectory = await writeBundle((_artifacts, evidence, rawDtcg) => {
      const item = (evidence.tokens.evidence as Record<string, Record<string, unknown>>)['colors.primary']
      item.observationCount = 0.5
      item.ownerCount = 0.5
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      const dtcgItem = (dtcg.$extensions['com.imprint.tokenEvidence'] as Record<string, Record<string, unknown>>)[
        'colors.primary'
      ]
      dtcgItem.observationCount = 0.5
      dtcgItem.ownerCount = 0.5
    })
    expect((await auditArtifactBundle(fractionalDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'non-integer-portable-token-evidence:colors.primary.observationCount',
        'non-integer-portable-token-evidence:colors.primary.ownerCount',
      ]),
    )

    const insufficientDirectory = await writeBundle((_artifacts, evidence, rawDtcg) => {
      const item = (evidence.tokens.evidence as Record<string, Record<string, unknown>>)['colors.primary']
      item.eligiblePageCount = 4
      item.pageSupportRatio = 0.5
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      const dtcgItem = (dtcg.$extensions['com.imprint.tokenEvidence'] as Record<string, Record<string, unknown>>)[
        'colors.primary'
      ]
      dtcgItem.eligiblePageCount = 4
      dtcgItem.pageSupportRatio = 0.5
    })
    expect((await auditArtifactBundle(insufficientDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'invalid-portable-token-evidence-envelope:colors.primary',
        'insufficient-portable-token-foundation-coverage:colors.primary',
      ]),
    )

    const hiddenDenominatorDirectory = await writeBundle((_artifacts, evidence) => {
      for (const [suffix, routeId] of [
        ['contact', 'route-333333333333'],
        ['legal', 'route-444444444444'],
      ]) {
        const page = structuredClone(evidence.pages[0])
        page.id = `page-${suffix}-desktop`
        page.url = `https://example.com/${suffix}`
        page.routeId = routeId
        page.images[0].id = `image-page-${suffix}-desktop`
        evidence.pages.push(page)
      }
    })
    expect((await auditArtifactBundle(hiddenDenominatorDirectory)).hardFailures).toContain(
      'invalid-portable-token-evidence-envelope:colors.primary',
    )
  })

  it('matches the producer threshold for a foreground pair supported by half of four routes', async () => {
    const writeFourRoutePair = (supportedRouteCount: number) =>
      writeBundle((artifacts, evidence, rawDtcg) => {
        const pages = evidence.pages
        Object.assign(pages[1], {
          id: 'page-contact-desktop',
          url: 'https://example.com/contact',
          routeId: 'route-333333333333',
          viewport: 'desktop',
        })
        Object.assign(pages[3], {
          id: 'page-legal-desktop',
          url: 'https://example.com/legal',
          routeId: 'route-444444444444',
          viewport: 'desktop',
        })
        const routeCatalog = pages.map((page) => ({ page: page.url, routeId: page.routeId }))
        const tokenEvidence = evidence.tokens.evidence as Record<string, Record<string, unknown>>
        for (const item of Object.values(tokenEvidence)) {
          Object.assign(item, {
            observationCount: 4,
            ownerCount: 4,
            pageCount: 4,
            captureCount: 4,
            eligiblePageCount: 4,
            pageSupportRatio: 1,
            pages: routeCatalog.map((route) => route.page),
            pageRefs: routeCatalog.map((route) => route.routeId),
          })
          if (item.foundationOwnerCount !== undefined) {
            item.foundationOwnerCount = 4
            item.minimumPageFoundationOwnerCount = 1
          }
        }
        artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
          const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
          ;(extension.evidence as Record<string, unknown>).pageCount = 4
        })
        addFoundationForegroundArtifacts(artifacts, evidence, rawDtcg, '#111111', {
          background: '#ffffff',
          pageCount: supportedRouteCount,
          eligiblePageCount: 4,
          pageSupportRatio: supportedRouteCount / 4,
          normalizedShare: supportedRouteCount / 4,
          normalizedMainTextShare: supportedRouteCount / 4,
          contrastRatio: 18.88,
          textRoles: ['body'],
        })
      })

    expect((await auditArtifactBundle(await writeFourRoutePair(2))).hardFailures).toEqual([])
    expect((await auditArtifactBundle(await writeFourRoutePair(1))).hardFailures).toEqual(
      expect.arrayContaining([
        'insufficient-rendered-text-promotion-evidence:colors.foreground',
        'foundation-foreground-pair-insufficient-support',
      ]),
    )
  })

  it('rejects clipped or role-inconsistent rendered owners behind a foundation foreground pair', async () => {
    const pairedSurface = {
      background: '#ffffff',
      pageCount: 2,
      eligiblePageCount: 2,
      pageSupportRatio: 1,
      normalizedShare: 1,
      contrastRatio: 18.88,
      textRoles: ['body'],
    }
    const clippedDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111111', pairedSurface)
      const item = (evidence.tokens.evidence as Record<string, Record<string, unknown>>)['colors.foreground']
      const owners = item.renderedTextOwners as Array<{ source: Record<string, unknown> }>
      owners[0].source.clipPathChain = [{ value: 'inset(49%)', widthPx: 160, heightPx: 24, owner: 'ancestor' }]
    })
    expect((await auditArtifactBundle(clippedDirectory)).hardFailures).toContain(
      'invalid-rendered-text-owner-evidence:colors.foreground',
    )

    const roundedDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111111', pairedSurface)
      const item = (evidence.tokens.evidence as Record<string, Record<string, unknown>>)['colors.foreground']
      const owners = item.renderedTextOwners as Array<{ source: Record<string, unknown> }>
      owners[0].source.clipPath = 'inset(0 round 50%)'
      owners[0].source.clipPathChain = [{ value: 'inset(0 round 50%)', widthPx: 160, heightPx: 24, owner: 'self' }]
    })
    expect((await auditArtifactBundle(roundedDirectory)).hardFailures).toContain(
      'invalid-rendered-text-owner-evidence:colors.foreground',
    )

    for (const { clipPath, bounds } of [
      {
        clipPath: 'inset(0 100px 0 0)',
        bounds: { xPx: 100, yPx: 0, widthPx: 60, heightPx: 24 },
      },
      {
        clipPath: 'inset(0 0 0 100px)',
        bounds: { xPx: 0, yPx: 0, widthPx: 60, heightPx: 24 },
      },
      {
        clipPath: 'inset(12px 0 0 0)',
        bounds: { xPx: 0, yPx: 0, widthPx: 160, heightPx: 12 },
      },
      {
        clipPath: 'inset(0 0 12px 0)',
        bounds: { xPx: 0, yPx: 12, widthPx: 160, heightPx: 12 },
      },
    ]) {
      const displacedDirectory = await writeBundle((artifacts, evidence, dtcg) => {
        addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111111', pairedSurface)
        const item = (evidence.tokens.evidence as Record<string, Record<string, unknown>>)['colors.foreground']
        const owners = item.renderedTextOwners as Array<{ source: Record<string, unknown> }>
        const source = owners[0].source
        source.clipPath = clipPath
        source.clipPathChain = [{ value: clipPath, widthPx: 160, heightPx: 24, owner: 'self' }]
        source.visibleBounds = bounds
        source.visibleGlyphRects = [bounds]
        source.visibleWidthPx = bounds.widthPx
        source.visibleHeightPx = bounds.heightPx
        source.visibleGlyphAreaPx = bounds.widthPx * bounds.heightPx
        source.paintedAreaPx = bounds.widthPx * bounds.heightPx
      })
      expect((await auditArtifactBundle(displacedDirectory)).hardFailures).toContain(
        'invalid-rendered-text-owner-evidence:colors.foreground',
      )
    }

    const roleDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addFoundationForegroundArtifacts(artifacts, evidence, dtcg, '#111111', pairedSurface)
      const item = (evidence.tokens.evidence as Record<string, Record<string, unknown>>)['colors.foreground']
      const owners = item.renderedTextOwners as Array<{ textRole: string }>
      for (const owner of owners) owner.textRole = 'label'
    })
    expect((await auditArtifactBundle(roleDirectory)).hardFailures).toContain(
      'rendered-text-pair-role-mismatch:colors.foreground',
    )
  })

  it('validates the complete localized DESIGN.md dark color and detection projection', async () => {
    const validChineseDirectory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
      artifacts['DESIGN.md'] = artifacts['DESIGN.md']
        .replace('### Dark Mode Colors', '### 深色模式颜色')
        .replace('| Token | Value |', '| 令牌 | 值 |')
        .replace(
          '**Dark Mode:** Supported. Dark tokens were observed by emulating prefers-color-scheme: dark and reading computed styles; this does not imply the site loads in dark by default.',
          '**深色模式：** 支持。暗色令牌通过模拟 prefers-color-scheme: dark 后读取计算样式主动观察得到；不代表该站点默认以深色加载。',
        )
    })
    expect((await auditArtifactBundle(validChineseDirectory)).hardFailures).toEqual([])

    const invalidDirectory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const projected = extension.darkMode as { colors: Record<string, string>; method: string }
        projected.colors.fabricated = '#ff00ff'
        projected.method = 'class-toggle'
      })
        .replace('| `--color-primary` | `#101827` |', '| `--color-primary` | `#ff00ff` |')
        .concat(
          '\n> **Dark Mode:** Supported. Dark tokens were observed by toggling .fabricated-dark and reading computed styles; this does not imply the site loads in dark by default.\n',
        )
    })
    const result = await auditArtifactBundle(invalidDirectory)
    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'design-doc-dark-color-catalog-mismatch',
        'design-doc-dark-color-table-mismatch',
        'design-doc-dark-detection-mismatch',
        'design-doc-dark-detection-projection-mismatch',
      ]),
    )
  })

  it('rejects additional dark color tables nested in Markdown containers', async () => {
    const englishDirectory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
      artifacts['DESIGN.md'] += `
> ### Dark Mode Colors
> | Token | Value |
> | --- | --- |
> | \`--color-primary\` | \`#ff00ff\` |
`
    })
    expect((await auditArtifactBundle(englishDirectory)).hardFailures).toContain('design-doc-dark-color-table-mismatch')

    const chineseDirectory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
      artifacts['DESIGN.md'] += `
- > ### 深色模式颜色
  > | 令牌 | 值 |
  > | --- | --- |
  > | \`--color-primary\` | \`#ff00ff\` |
`
    })
    expect((await auditArtifactBundle(chineseDirectory)).hardFailures).toContain('design-doc-dark-color-table-mismatch')
  })

  it('requires the exact dark activation scope and one declaration per implementation token', async () => {
    const invalidScopeDirectory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
      for (const filename of ['variables.css', 'variables.scss', 'theme.css']) {
        artifacts[filename] = artifacts[filename].replace('prefers-color-scheme: dark', 'prefers-color-scheme: light')
      }
    })
    expect((await auditArtifactBundle(invalidScopeDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'invalid-dark-implementation-scope:variables.css',
        'invalid-dark-implementation-scope:variables.scss',
        'invalid-dark-implementation-scope:theme.css',
      ]),
    )

    const duplicateDirectory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '    --color-primary: #101827;',
        '    --color-primary: #101827;\n    --color-primary: #ff00ff;',
      )
      artifacts['theme.css'] = artifacts['theme.css'].replace(
        '    --color-primary: #101827;',
        '    --color-primary: #101827;\n    --color-primary: #ff00ff;',
      )
      artifacts['variables.scss'] = artifacts['variables.scss']
        .replace('$dark-color-primary: #101827;', '$dark-color-primary: #101827; $dark-color-primary: #ff00ff;')
        .replace('  --color-primary: #101827;', '  --color-primary: #101827; --color-primary: #ff00ff;')
    })
    expect((await auditArtifactBundle(duplicateDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'duplicate-dark-implementation-token:variables.css:--color-primary',
        'duplicate-dark-implementation-token:variables.scss:$dark-color-primary',
        'duplicate-dark-implementation-token:variables.scss@mixin:--color-primary',
        'duplicate-dark-implementation-token:theme.css:--color-primary',
      ]),
    )

    const escapedDuplicateDirectory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '    --color-primary: #101827;',
        '    --color-primary: #101827;\n    --color\\-primary: #ff00ff;',
      )
      artifacts['theme.css'] = artifacts['theme.css'].replace(
        '    --color-primary: #101827;',
        '    --color-primary: #101827;\n    --color\\-primary: #ff00ff;',
      )
    })
    expect((await auditArtifactBundle(escapedDuplicateDirectory)).hardFailures).toEqual(
      expect.arrayContaining([
        'duplicate-dark-implementation-token:variables.css:--color-primary',
        'duplicate-dark-implementation-token:theme.css:--color-primary',
      ]),
    )
  })

  it('rejects duplicate base implementation declarations regardless of layout or CSS escaping', async () => {
    const directory = await writeBundle((artifacts) => {
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '--color-primary: #2255ff;',
        '--color-primary: #2255ff; --color\\-primary: #ff00ff;',
      )
      artifacts['theme.css'] = artifacts['theme.css'].replace(
        '--color-primary: #2255ff;',
        '--color-primary: #2255ff; --color-primary: #ff00ff;',
      )
      artifacts['variables.scss'] += ' $color-primary: #ff00ff;'
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'duplicate-implementation-token:variables.css:--color-primary',
        'duplicate-implementation-token:variables.scss:$color-primary',
        'duplicate-implementation-token:theme.css:--color-primary',
      ]),
    )
  })

  it('requires base implementation declarations to remain in their generated owners', async () => {
    const directory = await writeBundle((artifacts) => {
      artifacts['variables.css'] = artifacts['variables.css'].replace(':root {', '.wrong-scope {')
      artifacts['theme.css'] = artifacts['theme.css'].replace('@theme {', '.wrong-scope {')
      artifacts['variables.scss'] = `.wrong-scope {\n${artifacts['variables.scss']}\n}`
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'invalid-base-implementation-scope:variables.css',
        'invalid-base-implementation-scope:variables.scss',
        'invalid-base-implementation-scope:theme.css',
      ]),
    )
  })

  it('does not count comment-only declarations in dark implementation catalogs', async () => {
    const directory = await writeBundle((artifacts, _evidence, dtcg) => {
      addDarkBundleArtifacts(artifacts, dtcg)
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '    --color-primary: #101827;',
        '    /* --color-primary: #101827; */',
      )
      artifacts['theme.css'] = artifacts['theme.css'].replace(
        '    --color-primary: #101827;',
        '    /* --color-primary: #101827; */',
      )
      artifacts['variables.scss'] = artifacts['variables.scss']
        .replace('$dark-color-primary: #101827;', '/* $dark-color-primary: #101827; */')
        .replace('  --color-primary: #101827;', '  /* --color-primary: #101827; */')
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'missing-dark-implementation-token:variables.css:--color-primary',
        'missing-dark-implementation-token:variables.scss:$dark-color-primary',
        'missing-dark-implementation-token:variables.scss@mixin:--color-primary',
        'missing-dark-implementation-token:theme.css:--color-primary',
      ]),
    )
  })

  it('accepts class-toggle dark scopes only when DTCG, DESIGN.md, and all implementations agree', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      const contract = dtcg.$extensions['com.imprint.darkMode'] as Record<string, unknown>
      contract.method = 'class-toggle'
      contract.selector = '.dark'
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const projected = extension.darkMode as Record<string, unknown>
        projected.method = 'class-toggle'
        projected.selector = '.dark'
      }).replace(
        'emulating prefers-color-scheme: dark and reading computed styles',
        'toggling .dark and reading computed styles',
      )
      for (const filename of ['variables.css', 'theme.css']) {
        artifacts[filename] = artifacts[filename].replace(
          /@media \(prefers-color-scheme: dark\) \{\n  :root \{([\s\S]*?)\n  \}\n\}\s*$/,
          '.dark {$1\n}',
        )
      }
      artifacts['variables.scss'] = artifacts['variables.scss'].replace(
        /@media \(prefers-color-scheme: dark\) \{\s*:root \{\s*@include imprint-dark-theme;\s*\}\s*\}\s*$/,
        '.dark {\n  @include imprint-dark-theme;\n}',
      )
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual([])
  })

  it('accepts a quoted data-attribute dark selector through effective stylesheet parsing', async () => {
    const selector = '[data-theme="dark"]'
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      const contract = dtcg.$extensions['com.imprint.darkMode'] as Record<string, unknown>
      contract.method = 'class-toggle'
      contract.selector = selector
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const projected = extension.darkMode as Record<string, unknown>
        projected.method = 'class-toggle'
        projected.selector = selector
      }).replace(
        'emulating prefers-color-scheme: dark and reading computed styles',
        `toggling ${selector} and reading computed styles`,
      )
      for (const filename of ['variables.css', 'theme.css']) {
        artifacts[filename] = artifacts[filename].replace(
          /@media \(prefers-color-scheme: dark\) \{\n  :root \{([\s\S]*?)\n  \}\n\}\s*$/,
          `${selector} {$1\n}`,
        )
      }
      artifacts['variables.scss'] = artifacts['variables.scss'].replace(
        /@media \(prefers-color-scheme: dark\) \{\s*:root \{\s*@include imprint-dark-theme;\s*\}\s*\}\s*$/,
        `${selector} {\n  @include imprint-dark-theme;\n}`,
      )
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual([])
  })

  it('rejects dark candidate provenance that is not bound to a real Evidence capture', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & {
        dark: {
          $extensions: Record<string, unknown>
        }
      }
      const candidate = localRenderedTypographyCandidate()
      candidate.evidence.pages = ['imprint://dark-mode/']
      candidate.evidence.renderedTextOwners[0].page = 'imprint://dark-mode/'
      dtcg.dark.$extensions['com.imprint.candidates'] = { values: [candidate] }
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'rendered-text-owner-capture-mismatch:typography.fontFamilies.0',
    )
  })

  it('rejects non-text dark candidate provenance that names a nonexistent Evidence route', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & {
        dark: {
          $extensions: Record<string, unknown>
        }
      }
      dtcg.dark.$extensions['com.imprint.candidates'] = {
        values: [
          {
            id: 'candidate.shadows.fabricated',
            group: 'shadows',
            value: '0 8px 24px rgb(0 0 0 / 40%)',
            provenance: 'dark-mode',
            rejectionReason: 'not-in-base-catalog',
            evidence: {
              ...portableEvidence,
              value: '0 8px 24px rgb(0 0 0 / 40%)',
              pageCount: 1,
              captureCount: 1,
              eligiblePageCount: 1,
              pages: ['https://fabricated.invalid/'],
              pageRefs: ['route-ffffffffffff'],
              sources: ['element:structural-shadow'],
            },
          },
        ],
      }
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'unresolved-evidence-page-ref:dtcg.dark.candidates.values.0.pageRefs:route-ffffffffffff',
        'evidence-page-ref-page-mismatch:dtcg.dark.candidates.values.0.pageRefs',
      ]),
    )
  })

  it('rejects colluding omission of every Evidence route ID and dark candidate page reference', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      for (const page of evidence.pages) delete (page as { routeId?: string }).routeId
      for (const item of Object.values(evidence.tokens.evidence)) delete (item as { pageRefs?: string[] }).pageRefs

      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & { dark: ReturnType<typeof bundleDtcg> }
      const baseEvidence = dtcg.$extensions['com.imprint.tokenEvidence'] as Record<string, { pageRefs?: string[] }>
      for (const item of Object.values(baseEvidence)) delete item.pageRefs
      const darkEvidence = dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<string, { pageRefs?: string[] }>
      for (const item of Object.values(darkEvidence)) delete item.pageRefs
      dtcg.dark.$extensions['com.imprint.candidates'] = {
        values: [
          {
            id: 'candidate.shadows.unbound',
            group: 'shadows',
            value: '0 8px 24px rgb(0 0 0 / 40%)',
            provenance: 'dark-mode',
            rejectionReason: 'not-in-base-catalog',
            evidence: {
              ...portableEvidence,
              value: '0 8px 24px rgb(0 0 0 / 40%)',
              pageCount: 1,
              captureCount: 1,
              eligiblePageCount: 1,
              pages: ['https://example.com/'],
              pageRefs: undefined,
              sources: ['element:structural-shadow'],
            },
          },
        ],
      }
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'missing-or-invalid-evidence-page-route-id:0',
        'missing-evidence-route-catalog:dtcg.dark.candidates.values.0.pageRefs',
        'missing-evidence-page-refs:dtcg.dark.candidates.values.0.pageRefs',
      ]),
    )
  })

  it('rejects promoted dark override evidence that is not bound to a real Evidence capture', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & {
        dark: ReturnType<typeof bundleDtcg>
      }
      const darkEvidence = dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<string, { pages: string[] }>
      darkEvidence['colors.primary'].pages = ['imprint://dark-mode/']
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'evidence-page-ref-page-mismatch:dtcg.dark.tokenEvidence.colors.primary.pageRefs',
    )
  })

  it('derives required dark overrides from changed dark tokens instead of trusting the declared map', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & {
        dark: ReturnType<typeof bundleDtcg>
      }
      const extensions = dtcg.$extensions as Record<string, { overrides?: Record<string, string> }>
      delete extensions['com.imprint.darkMode'].overrides?.['color.primary']
      const darkEvidence = dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<string, unknown>
      delete darkEvidence['colors.primary']
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const darkMode = extension.darkMode as { overrideRefs: string[]; overrides: Record<string, string> }
        darkMode.overrideRefs = []
        darkMode.overrides = {}
      })
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining(['dark-override-catalog-mismatch', 'ungrounded-dark-override:color.primary']),
    )
  })

  it('rejects synchronized removal of a base token from the complete dark catalog', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & { dark: ReturnType<typeof bundleDtcg> }
      delete dtcg.dark.color.primary
      delete (dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<string, unknown>)['colors.primary']
      delete (dtcg.$extensions['com.imprint.darkMode'] as { overrides: Record<string, string> }).overrides[
        'color.primary'
      ]
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const darkMode = extension.darkMode as { overrideRefs: string[]; overrides: Record<string, string> }
        darkMode.overrideRefs = []
        darkMode.overrides = {}
      })
      artifacts['variables.css'] = artifacts['variables.css'].replace('    --color-primary: #101827;\n', '')
      artifacts['variables.scss'] = artifacts['variables.scss']
        .replace('$dark-color-primary: #101827;\n', '')
        .replace('  --color-primary: #101827;\n', '')
      artifacts['theme.css'] = artifacts['theme.css'].replace('    --color-primary: #101827;\n', '')
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain('missing-dark-base-token:color.primary')
  })

  it('rejects a dark foreground paired to a surface that is not effective in the exported dark theme', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      const routeId = HOME_ROUTE_ID
      const page = 'https://example.com/'
      const ownerIds = ['copy-1', 'copy-2']
      const renderedOwners = ownerIds.map((ownerId) => ({
        page,
        routeId,
        viewport: 'desktop',
        ownerId,
        textRole: 'body',
        styles: {
          color: '#111111',
          backgroundColor: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '24px',
          letterSpacing: 'normal',
        },
        source: directTextSource('#111111'),
      }))
      const pairEvidence = {
        background: '#ffffff',
        pageCount: 1,
        eligiblePageCount: 1,
        pageSupportRatio: 1,
        normalizedShare: 1,
        normalizedMainTextShare: 1,
        ownerCount: 2,
        minimumPageOwnerCount: 2,
        mainTextPageCount: 1,
        mainTextOwnerCount: 2,
        headingPageCount: 0,
        headingOwnerCount: 0,
        contrastRatio: 18.88,
        textRoles: ['body'],
        routeSupport: [
          {
            page,
            routeId,
            supported: true,
            ownerIds,
            totalOwnerIds: ownerIds,
            mainTextOwnerIds: ownerIds,
            headingOwnerIds: [],
            textRoles: ['body'],
            normalizedShare: 1,
            normalizedMainTextShare: 1,
          },
        ],
      }
      const foregroundEvidence = {
        ...onePageRenderedTextEvidence('#111111', renderedOwners),
        sources: ['rendered:text', 'observed:text-background-pair'],
        reasons: ['rendered-use', 'computed-style', 'paired-surface'],
        pairedSurface: pairEvidence,
      }
      evidence.tokens.colors.foreground = '#111111'
      ;(evidence.tokens.evidence as Record<string, unknown>)['colors.foreground'] = foregroundEvidence
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & { dark: ReturnType<typeof bundleDtcg> }
      ;(dtcg.color as Record<string, unknown>).foreground = { $type: 'color', $value: '#111111' }
      ;(dtcg.$extensions['com.imprint.tokenEvidence'] as Record<string, unknown>)['colors.foreground'] =
        foregroundEvidence
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        ;(frontMatterValue.colors as Record<string, string>).foreground = '#111111'
      })
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '--color-background: #ffffff;',
        '--color-background: #ffffff; --color-foreground: #111111;',
      )
      artifacts['variables.scss'] += '\n$color-foreground: #111111;'
      artifacts['theme.css'] = artifacts['theme.css'].replace(
        '--color-background: #ffffff;',
        '--color-background: #ffffff; --color-foreground: #111111;',
      )

      addDarkBundleArtifacts(artifacts, dtcg)
      dtcg.dark.color.foreground = { $type: 'color', $value: '#f5f5f5' }
      const darkRenderedOwners = renderedOwners.map((owner) => ({
        ...owner,
        styles: { ...owner.styles, color: '#f5f5f5', backgroundColor: '#16171d' },
        source: directTextSource('#f5f5f5'),
      }))
      const darkForegroundEvidence = {
        ...onePageRenderedTextEvidence('#f5f5f5', darkRenderedOwners),
        sources: ['rendered:text', 'observed:text-background-pair'],
        reasons: ['rendered-use', 'computed-style', 'paired-surface'],
        pairedSurface: { ...pairEvidence, background: '#16171d', contrastRatio: 16.53 },
      }
      ;(dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<string, unknown>)['colors.foreground'] =
        darkForegroundEvidence
      ;(dtcg.$extensions['com.imprint.darkMode'] as { overrides: Record<string, string> }).overrides[
        'color.foreground'
      ] = '#f5f5f5'
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatterValue) => {
        const extension = (frontMatterValue['x-imprint'] as Array<Record<string, unknown>>)[0]
        const darkMode = extension.darkMode as { overrideRefs: string[]; overrides: Record<string, string> }
        darkMode.overrideRefs.push('color.foreground')
        darkMode.overrides['color.foreground'] = '#f5f5f5'
      })
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '    --color-primary: #101827;',
        '    --color-primary: #101827;\n    --color-foreground: #f5f5f5;',
      )
      artifacts['variables.scss'] = artifacts['variables.scss']
        .replace('$dark-color-primary: #101827;', '$dark-color-primary: #101827;\n$dark-color-foreground: #f5f5f5;')
        .replace('  --color-primary: #101827;', '  --color-primary: #101827;\n  --color-foreground: #f5f5f5;')
      artifacts['theme.css'] = artifacts['theme.css'].replace(
        '    --color-primary: #101827;',
        '    --color-primary: #101827;\n    --color-foreground: #f5f5f5;',
      )
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'dark-foreground-pair-background-not-effective',
    )
  })

  it('rejects a dark-only global token even when every implementation format colludes', async () => {
    const directory = await writeBundle((artifacts, _evidence, rawDtcg) => {
      addDarkBundleArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & {
        dark: ReturnType<typeof bundleDtcg>
      }
      ;(dtcg.dark.color as Record<string, unknown>).fabricated = { $type: 'color', $value: '#ff00ff' }
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '    --color-primary: #101827;',
        '    --color-primary: #101827;\n    --color-fabricated: #ff00ff;',
      )
      artifacts['variables.scss'] = artifacts['variables.scss']
        .replace('$dark-color-primary: #101827;', '$dark-color-primary: #101827;\n$dark-color-fabricated: #ff00ff;')
        .replace('  --color-primary: #101827;', '  --color-primary: #101827;\n  --color-fabricated: #ff00ff;')
      artifacts['theme.css'] = artifacts['theme.css'].replace(
        '    --color-primary: #101827;',
        '    --color-primary: #101827;\n    --color-fabricated: #ff00ff;',
      )
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toContain(
      'dark-token-outside-base-catalog:color.fabricated',
    )
  })

  it('rejects forged dark typography observation counts and semantic agreement', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      addSingleFontArtifacts(artifacts, evidence, rawDtcg)
      addDarkBundleArtifacts(artifacts, rawDtcg)
      addDarkFontOverrideArtifacts(artifacts, rawDtcg)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg> & { dark: ReturnType<typeof bundleDtcg> }
      const darkEvidence = dtcg.dark.$extensions['com.imprint.tokenEvidence'] as Record<
        string,
        { observationCount: number; semanticAgreement: number }
      >
      for (const path of ['typography.fontFamilies.0', 'typography.fontStacks.0']) {
        darkEvidence[path].observationCount = 999
        darkEvidence[path].semanticAgreement = 42
      }
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual(
      expect.arrayContaining([
        'rendered-text-observation-count-mismatch:typography.fontFamilies.0',
        'rendered-text-observation-count-mismatch:typography.fontStacks.0',
        'dark-token-semantic-agreement-out-of-range:typography.fontFamilies.0',
        'dark-token-semantic-agreement-out-of-range:typography.fontStacks.0',
      ]),
    )
  })

  it('anchors dark font implementation names and DESIGN.md data to the base token identity', async () => {
    const validDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      addDarkBundleArtifacts(artifacts, dtcg)
      addDarkFontOverrideArtifacts(artifacts, dtcg)
    })
    expect((await auditArtifactBundle(validDirectory)).hardFailures).toEqual([])

    const invalidDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      addDarkBundleArtifacts(artifacts, dtcg)
      addDarkFontOverrideArtifacts(artifacts, dtcg)
      artifacts['variables.css'] = artifacts['variables.css'].replace(
        '    --font-sans: Georgia, serif;',
        '    --font-serif: Georgia, serif;',
      )
      artifacts['DESIGN.md'] = artifacts['DESIGN.md'].replace(
        '          fontFamily: Georgia, serif',
        '          fontFamily: Courier, monospace',
      )
    })
    const result = await auditArtifactBundle(invalidDirectory)
    expect(result.hardFailures).toContain('missing-dark-implementation-token:variables.css:--font-sans')
    expect(result.hardFailures).toContain('unexpected-dark-implementation-token:variables.css:--font-serif')
    expect(result.hardFailures).toContain('design-doc-dark-font-catalog-mismatch')

    const missingOwnerDirectory = await writeBundle((artifacts, evidence, dtcg) => {
      addSingleFontArtifacts(artifacts, evidence, dtcg)
      addDarkBundleArtifacts(artifacts, dtcg)
      addDarkFontOverrideArtifacts(artifacts, dtcg)
      const darkRoot = (dtcg as ReturnType<typeof bundleDtcg> & { dark: ReturnType<typeof bundleDtcg> }).dark
      const darkEvidence = darkRoot.$extensions['com.imprint.tokenEvidence'] as Record<
        string,
        { renderedTextOwners?: unknown[] }
      >
      delete darkEvidence['typography.fontFamilies.0'].renderedTextOwners
    })
    expect((await auditArtifactBundle(missingOwnerDirectory)).hardFailures).toContain(
      'missing-rendered-text-owner-evidence:typography.fontFamilies.0',
    )
  })

  it('rejects non-finite evidence, unresolved cross-artifact refs, and candidate implementation leaks', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      const candidate = {
        id: 'candidate.spacing.example',
        group: 'spacing',
        value: '2px',
        rejectionReason: 'local-scope',
        evidence: {
          ...portableEvidence,
          value: '2px',
          semanticConfidence: null,
          reuseScope: 'local',
        },
      }
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
      artifacts['design-profile.json'] = JSON.stringify({
        schemaVersion: '3',
        claimSource: 'deterministic-catalog',
        tokenRefs: ['spacing.99'],
        evidenceRefs: ['missing-evidence'],
      })
      artifacts['component-specs.json'] = JSON.stringify({
        schemaVersion: '2',
        components: [
          {
            component: 'button',
            sourceInstances: null,
            pageCount: 2,
            identityConfidence: 0.95,
            reuseConfidence: 0.72,
            tokenRefs: ['color.primary'],
            evidenceRefs: ['button-home'],
          },
        ],
      })
      artifacts['variables.css'] += '\n:root { --spacing-local: 2px; }'
    })
    const result = await auditArtifactBundle(directory)

    expect(result.classification).toBe('analyzer-failure')
    expect(result.hardFailures).toEqual(
      expect.arrayContaining([
        'missing-candidate-semantic-confidence:evidence.tokens.candidates.values.0',
        'unresolved-token-ref:profile.tokenRefs.0:spacing.99',
        'unresolved-evidence-ref:profile.evidenceRefs.0:missing-evidence',
        'non-finite-component-metric:0.sourceInstances',
        'candidate-leaked-to-implementation:candidate.spacing.example',
      ]),
    )
  })

  it('does not confuse a rejected spacing value with an equal breakpoint value', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      const candidate = {
        id: 'candidate.spacing.breakpoint-collision',
        group: 'spacing',
        value: '320px',
        sourcePath: 'spacing.99',
        provenance: 'built-token',
        rejectionReason: 'low-semantic-confidence',
        evidence: {
          ...portableEvidence,
          value: '320px',
          confidence: 'low',
          measurementConfidence: 'low',
          semanticConfidence: 'low',
          reuseScope: 'local',
          observationCount: 1,
          ownerCount: 1,
          semanticAgreement: 0,
          pageCount: 1,
          captureCount: 1,
          eligiblePageCount: 2,
          pageSupportRatio: 0.5,
          pages: ['https://example.com/'],
          pageRefs: ['https://example.com/'],
        },
      }
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
      artifacts['variables.css'] += '\n:root { --breakpoint-mobile-320: 320px; }'
    })
    const result = await auditArtifactBundle(directory)

    expect(result.hardFailures).not.toContain(
      'candidate-leaked-to-implementation:candidate.spacing.breakpoint-collision',
    )
  })

  it('allows a local single-family stack to share a CSS literal with a portable font family', async () => {
    const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
      const family = '"Charlie Display"'
      evidence.tokens.typography.fontFamilies.push(family)
      const owner = {
        page: 'https://example.com/',
        routeId: HOME_ROUTE_ID,
        viewport: 'desktop',
        ownerId: 'charlie-display',
        textRole: 'heading',
        styles: {
          color: '#111111',
          backgroundColor: '#ffffff',
          fontFamily: family,
          fontSize: '32px',
          fontWeight: '700',
          lineHeight: '36px',
          letterSpacing: 'normal',
        },
        source: directTextSource(),
      }
      evidence.tokens.evidence['typography.fontFamilies.0'] = portableRenderedTextEvidence(family, [
        { ...owner, ownerId: 'charlie-display-home' },
        { ...owner, ownerId: 'charlie-display-about' },
      ]) as never
      const candidate = {
        ...localRenderedTypographyCandidate(),
        id: 'candidate.typography.fontStacks.charlie-display',
        group: 'typography.fontStacks',
        value: family,
      }
      candidate.evidence.value = family
      candidate.evidence.renderedTextOwners[0].styles.fontFamily = family
      evidence.tokens.candidates.values.push(candidate as never)
      const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
      ;(dtcg.typography.fontFamilies.$value as string[]).push(family)
      artifacts['DESIGN.md'] = updateFrontMatter(artifacts['DESIGN.md'], (frontMatter) => {
        frontMatter.typography = { 'font-family-family-1': { fontFamily: family } }
        const extension = (frontMatter['x-imprint'] as Array<Record<string, unknown>>)[0]
        extension.candidateSummary = {
          scope: 'preview',
          previewLimitPerKind: 5,
          fullEvidenceArtifact: 'tokens-json',
          tokenValues: { total: 1, included: 1, omitted: 0 },
        }
        extension.candidates = { tokenValues: [{ value: family, pageCount: 1 }] }
      }).replace(
        '**Font families:** No portable font family was established; consult local typography Evidence before choosing a typeface.',
        `**Font families:** ${family}`,
      )
      artifacts['variables.css'] = artifacts['variables.css'].replace(' }', ` --font-family-1: ${family}; }`)
      artifacts['theme.css'] = artifacts['theme.css'].replace(' }', ` --font-family-1: ${family}; }`)
      artifacts['variables.scss'] += `\n$font-family-1: ${family};`
    })

    expect((await auditArtifactBundle(directory)).hardFailures).toEqual([])
  })

  it.each([
    ['spacing', '8px', 'candidate.spacing.portable-collision'],
    ['borders', '2px solid rgb(0, 97, 254)', 'candidate.border.portable-collision'],
  ] as const)(
    'rejects a rejected %s candidate that duplicates a same-dimension portable value',
    async (group, value, id) => {
      const directory = await writeBundle((artifacts, evidence, rawDtcg) => {
        const candidate = {
          id,
          group,
          value,
          sourcePath: `${group}.99`,
          provenance: 'built-token',
          rejectionReason: 'local-scope',
          evidence: {
            ...portableEvidence,
            value,
            reuseScope: 'local',
          },
        }
        evidence.tokens.candidates.values.push(candidate as never)
        const dtcg = rawDtcg as ReturnType<typeof bundleDtcg>
        dtcg.$extensions['com.imprint.candidates'] = evidence.tokens.candidates
        if (group === 'borders') {
          ;(evidence.tokens as typeof evidence.tokens & { borders: string[] }).borders = [value]
          ;(evidence.tokens.evidence as Record<string, unknown>)['borders.0'] = { ...portableEvidence, value }
          dtcg.border = { '1': { $type: 'border', $value: value } }
          artifacts['variables.css'] += `\n:root { --border-1: ${value}; }`
          artifacts['variables.scss'] += `\n$border-1: ${value};`
          artifacts['theme.css'] += `\n@theme { --border-1: ${value}; }`
        }
      })

      const result = await auditArtifactBundle(directory)
      expect(result.hardFailures).toContain(`candidate-conflicts-portable-token:${id}`)
    },
  )
})
