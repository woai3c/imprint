import { createHash } from 'node:crypto'

import {
  classifyComponentVariant,
  hasVisibleBorder,
  hasVisibleShadow,
  isPillRadius,
} from '../analyzer/component-detect.js'
import type { ComponentType } from '../analyzer/component-detect.js'
import { resolveScreenshotAssetCoverage } from '../design-evidence/asset-integrity.js'
import { hasSevereHorizontalOverflow } from '../design-evidence/reliability.js'
import {
  displayedResponsiveChangeType,
  hasConsistentResponsiveSectionIdentity,
  usefulResponsiveChanges,
} from '../design-evidence/responsive-reliability.js'
import type { ComponentEvidence, DesignEvidence, EvidencePage, SectionEvidence } from '../design-evidence/types.js'
import { coreTranslator } from '../i18n/index.js'
import { listEvidenceIds, listEvidenceTokenRefs } from './evidence-index.js'
import { DESIGN_PROFILE_SCHEMA_VERSION } from './types.js'
import type {
  Confidence,
  DesignClaim,
  DesignClaimAssertion,
  DesignClaimCatalog,
  DesignClaimCatalogEntry,
  DesignClaimCatalogPlacement,
  DesignClaimSingletonSlot,
  DesignProfile,
} from './types.js'

export const DESIGN_CLAIM_CATALOG_VERSION = '1'

const SINGLETON_SLOTS: readonly DesignClaimSingletonSlot[] = [
  'thesis',
  'composition.container',
  'composition.alignment',
  'composition.density',
  'composition.rhythm',
  'attention.entry',
  'attention.action',
  'attention.contrast',
  'visual.color',
  'visual.typography',
  'visual.shape',
  'visual.surfaces',
  'interaction.feedback',
  'interaction.amplitude',
]

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function stableList(values: readonly string[], limit = Number.POSITIVE_INFINITY): string[] {
  return unique(values.filter(Boolean)).sort().slice(0, limit)
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function roundedPercent(value: number): number {
  return Math.round(value * 100)
}

function pageRank(page: EvidencePage): number {
  if (page.viewport === 'desktop') return 0
  if (page.viewport === 'tablet') return 1
  if (page.viewport === 'mobile') return 2
  return 3
}

/** One healthy, non-overflowing capture per URL; desktop is preferred. */
export function canonicalCatalogPageIds(evidence: DesignEvidence): Set<string> {
  const byUrl = new Map<string, EvidencePage[]>()
  for (const page of evidence.pages) {
    const pages = byUrl.get(page.url) || []
    pages.push(page)
    byUrl.set(page.url, pages)
  }
  const result = new Set<string>()
  for (const pages of byUrl.values()) {
    const eligible = pages.filter(
      (page) => !hasSevereHorizontalOverflow(page) && page.health?.evidenceEligible !== false,
    )
    const selected = [...eligible].sort(
      (first, second) =>
        pageRank(first) - pageRank(second) ||
        (second.viewportWidth || 0) - (first.viewportWidth || 0) ||
        first.id.localeCompare(second.id),
    )[0]
    if (selected) result.add(selected.id)
  }
  return result
}

function sectionAnchor(section: SectionEvidence): 'full' | 'left' | 'center' | 'right' {
  if (section.rect.width >= 0.96) return 'full'
  const freeSpace = Math.max(0, 1 - section.rect.width)
  const centeredX = freeSpace / 2
  if (Math.abs(section.rect.x - centeredX) <= 0.04) return 'center'
  if (section.rect.x <= Math.max(0.06, freeSpace * 0.3)) return 'left'
  return 'right'
}

function componentShape(component: ComponentEvidence, page: EvidencePage | undefined): 'pill' | 'rounded' | 'sharp' {
  const heightPx = page?.contentHeight ? component.rect.height * page.contentHeight : undefined
  if (isPillRadius(component.styles, { heightPx })) return 'pill'
  return /[1-9]/.test(component.styles.borderRadius || '') ? 'rounded' : 'sharp'
}

function assertionScope(evidenceIds: readonly string[], evidence: DesignEvidence): DesignClaimAssertion['scope'] {
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const pageIdByEvidenceId = new Map<string, string>()
  const pageIdBySectionId = new Map(evidence.sections.map((section) => [section.id, section.pageId]))
  evidence.pages.forEach((page) => {
    pageIdByEvidenceId.set(page.id, page.id)
    page.images.forEach((image) => pageIdByEvidenceId.set(image.id, page.id))
  })
  evidence.sections.forEach((section) => pageIdByEvidenceId.set(section.id, section.pageId))
  evidence.components.forEach((component) => pageIdByEvidenceId.set(component.id, component.pageId))
  evidence.layoutNodes.forEach((node) => pageIdByEvidenceId.set(node.id, node.pageId))
  evidence.interactionObservations.forEach((observation) => pageIdByEvidenceId.set(observation.id, observation.pageId))
  evidence.responsiveObservations.forEach((observation) => {
    const pageId = pageIdBySectionId.get(observation.sectionId)
    if (pageId) pageIdByEvidenceId.set(observation.id, pageId)
  })
  evidence.mediaLayers.forEach((media) => pageIdByEvidenceId.set(media.id, media.pageId))
  const urls = new Set(
    evidenceIds.flatMap((id) => {
      const page = pageById.get(pageIdByEvidenceId.get(id) || '')
      return page ? [page.url] : []
    }),
  )
  return urls.size >= 2 ? 'cross-page' : urls.size === 1 ? 'page' : 'instance'
}

function claimId(
  key: string,
  placements: readonly DesignClaimCatalogPlacement[],
  evidenceIds: readonly string[],
  assertions: readonly DesignClaimAssertion[],
): string {
  return `claim-${createHash('sha256')
    .update(JSON.stringify({ key, placements, evidenceIds, assertions }))
    .digest('hex')
    .slice(0, 12)}`
}

interface CatalogBuilder {
  add: (
    key: string,
    placements: DesignClaimCatalogPlacement[],
    input: {
      statement: string
      implementation: string
      confidence: Confidence
      evidenceIds: string[]
      assertions: DesignClaimAssertion[]
      tokenRefs?: string[]
      title?: string
      distinctiveness?: string
    },
  ) => DesignClaimCatalogEntry
  entries: DesignClaimCatalogEntry[]
}

function createCatalogBuilder(evidence: DesignEvidence, language: 'en' | 'zh-CN'): CatalogBuilder {
  const t = coreTranslator(language, 'designContext.catalog')
  const entries: DesignClaimCatalogEntry[] = []
  const entriesByKey = new Map<string, DesignClaimCatalogEntry>()
  const add: CatalogBuilder['add'] = (key, placements, input) => {
    const existing = entriesByKey.get(key)
    if (existing) return existing
    const evidenceIds = stableList(input.evidenceIds)
    const allowedEvidenceIds = new Set(evidenceIds)
    const assertions = input.assertions.map((assertion) => ({
      ...assertion,
      evidenceIds: stableList(assertion.evidenceIds.filter((id) => allowedEvidenceIds.has(id))),
    }))
    const id = claimId(key, placements, evidenceIds, assertions)
    const entry: DesignClaimCatalogEntry = {
      id,
      placements,
      claim: {
        statement: input.statement,
        implementation: input.implementation,
        confidence: input.confidence,
        evidence: evidenceIds.map((evidenceId) => ({ evidenceId, note: t('evidenceNote') })),
        ...(input.tokenRefs?.length ? { tokenRefs: stableList(input.tokenRefs, 12) } : {}),
        assertions,
        source: 'deterministic-catalog',
        catalogId: id,
      },
      ...(input.title ? { title: input.title } : {}),
      ...(input.distinctiveness ? { distinctiveness: input.distinctiveness } : {}),
    }
    entries.push(entry)
    entriesByKey.set(key, entry)
    return entry
  }
  return { add, entries }
}

function confidenceFor(ids: readonly string[], evidence: DesignEvidence): Confidence {
  return assertionScope(ids, evidence) === 'cross-page' ? 'high' : 'medium'
}

function agreementConfidence(ids: readonly string[], values: readonly string[], evidence: DesignEvidence): Confidence {
  if (confidenceFor(ids, evidence) !== 'high' || values.length === 0) return 'medium'
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
  const agreement = Math.max(...counts.values()) / values.length
  return agreement >= 0.75 ? 'high' : 'medium'
}

function ownerTokenRefs(
  owners: Array<{ id: string; tokenRefs: string[] }>,
  prefix: string,
  limit = 6,
): Array<{ ref: string; ownerId: string }> {
  const result: Array<{ ref: string; ownerId: string }> = []
  const seen = new Set<string>()
  for (const owner of owners) {
    for (const ref of owner.tokenRefs) {
      if (!ref.startsWith(prefix) || seen.has(ref)) continue
      seen.add(ref)
      result.push({ ref, ownerId: owner.id })
      if (result.length >= limit) return result
    }
  }
  return result
}

function orderedSectionAssertions(
  sections: SectionEvidence[],
  evidence: DesignEvidence,
  limit = 4,
): DesignClaimAssertion[] {
  const result: DesignClaimAssertion[] = []
  for (let index = 0; index < Math.min(sections.length - 1, limit); index += 1) {
    const first = sections[index]
    const second = sections[index + 1]
    const evidenceIds = [first.id, second.id]
    result.push({
      kind: 'section',
      target: first.role,
      predicate: 'ordered-before',
      scope: assertionScope(evidenceIds, evidence),
      evidenceIds,
      value: second.role,
    })
  }
  return result
}

function buildCompositionClaims(
  builder: CatalogBuilder,
  evidence: DesignEvidence,
  sections: SectionEvidence[],
  sectionsByPage: Map<string, SectionEvidence[]>,
  t: ReturnType<typeof coreTranslator>,
): void {
  if (sections.length === 0) return
  const sample = sections.slice(0, 8)
  const widths = sample.map((section) => section.rect.width)
  const anchors = sample.map(sectionAnchor)
  const dominantAnchor = [...new Set(anchors)].sort(
    (first, second) =>
      anchors.filter((value) => value === second).length - anchors.filter((value) => value === first).length,
  )[0]
  const sectionIds = sample.map((section) => section.id)
  builder.add('composition-container', [{ kind: 'singleton', slot: 'composition.container' }], {
    statement: t('containerStatement', {
      count: sample.length,
      width: roundedPercent(median(widths)),
    }),
    implementation: t('boundedImplementation'),
    confidence: confidenceFor(sectionIds, evidence),
    evidenceIds: sectionIds,
    assertions: [
      {
        kind: 'evidence',
        target: 'composition',
        predicate: 'supports',
        scope: assertionScope(sectionIds, evidence),
        evidenceIds: sectionIds,
        property: 'rect.width.median-percent',
        value: roundedPercent(median(widths)),
      },
    ],
  })
  builder.add('composition-alignment', [{ kind: 'singleton', slot: 'composition.alignment' }], {
    statement: t('alignmentStatement', {
      anchor: dominantAnchor,
      count: anchors.filter((value) => value === dominantAnchor).length,
    }),
    implementation: t('boundedImplementation'),
    confidence: agreementConfidence(sectionIds, anchors, evidence),
    evidenceIds: sectionIds,
    assertions: [
      {
        kind: 'evidence',
        target: 'composition',
        predicate: 'supports',
        scope: assertionScope(sectionIds, evidence),
        evidenceIds: sectionIds,
        property: 'rect.anchor',
        value: dominantAnchor,
      },
    ],
  })
  const counts = [...sectionsByPage.values()].map((values) => values.length)
  const densityEvidenceIds = sections.map((section) => section.id)
  builder.add('composition-density', [{ kind: 'singleton', slot: 'composition.density' }], {
    statement: t('densityStatement', {
      minimum: Math.min(...counts),
      maximum: Math.max(...counts),
      captures: counts.length,
    }),
    implementation: t('boundedImplementation'),
    confidence: confidenceFor(densityEvidenceIds, evidence),
    evidenceIds: densityEvidenceIds,
    assertions: [
      {
        kind: 'evidence',
        target: 'composition',
        predicate: 'supports',
        scope: assertionScope(densityEvidenceIds, evidence),
        evidenceIds: densityEvidenceIds,
        property: 'detected-section-count-range',
        value: [String(Math.min(...counts)), String(Math.max(...counts))],
      },
    ],
  })
}

function buildVisualClaims(
  builder: CatalogBuilder,
  evidence: DesignEvidence,
  sections: SectionEvidence[],
  components: ComponentEvidence[],
  pageById: Map<string, EvidencePage>,
  t: ReturnType<typeof coreTranslator>,
): void {
  const owners = [...sections, ...components]
  const colorRefs = ownerTokenRefs(owners, 'color.')
  if (colorRefs.length > 0) {
    const evidenceIds = colorRefs.map((item) => item.ownerId)
    const assertions: DesignClaimAssertion[] = colorRefs.map((item) => ({
      kind: 'token',
      target: item.ref,
      predicate: 'observed',
      scope: assertionScope([item.ownerId], evidence),
      evidenceIds: [item.ownerId],
    }))
    const input = {
      statement: t('tokenOwnershipStatement', { count: colorRefs.length, dimension: t('dimensions.color') }),
      implementation: t('tokenOwnershipImplementation'),
      confidence: confidenceFor(evidenceIds, evidence),
      evidenceIds,
      assertions,
      tokenRefs: colorRefs.map((item) => item.ref),
    }
    builder.add('visual-color', [{ kind: 'singleton', slot: 'visual.color' }], input)
  }

  const typographyOwners = evidence.layoutNodes.filter(
    (node) =>
      sections.some((section) => section.id === node.sectionId) &&
      (node.observedTypography || node.tokenRefs.some((ref) => ref.startsWith('typography.'))),
  )
  if (typographyOwners.length > 0) {
    const sample = typographyOwners.slice(0, 8)
    const typographyRefs = ownerTokenRefs(sample, 'typography.')
    const evidenceIds = sample.map((node) => node.id)
    builder.add('visual-typography', [{ kind: 'singleton', slot: 'visual.typography' }], {
      statement: t('typographyStatement', {
        count: sample.length,
        roles: stableList(
          sample.map((node) => node.textRole || node.role),
          5,
        ).join(', '),
      }),
      implementation: t('tokenOwnershipImplementation'),
      confidence: confidenceFor(evidenceIds, evidence),
      evidenceIds,
      assertions: sample.map((node) => ({
        kind: 'evidence',
        target: 'typography',
        predicate: 'supports',
        scope: assertionScope([node.id], evidence),
        evidenceIds: [node.id],
        property: 'text-role',
        value: node.textRole || node.role,
      })),
      tokenRefs: typographyRefs.map((item) => item.ref),
    })
  }

  if (components.length > 0) {
    const samples = components.slice(0, 8)
    const shapeFacts = samples.map((component) => ({
      component,
      shape: componentShape(component, pageById.get(component.pageId)),
    }))
    const shapes = stableList(shapeFacts.map((item) => item.shape))
    const evidenceIds = samples.map((component) => component.id)
    builder.add('visual-shape', [{ kind: 'singleton', slot: 'visual.shape' }], {
      statement: t('shapeStatement', { count: samples.length, shapes: shapes.join(', ') }),
      implementation: t('boundedImplementation'),
      confidence: confidenceFor(evidenceIds, evidence),
      evidenceIds,
      assertions: shapeFacts.map(({ component, shape }) => ({
        kind: 'component',
        target: component.type,
        predicate: 'corner-shape',
        scope: assertionScope([component.id], evidence),
        evidenceIds: [component.id],
        value: shape,
      })),
      tokenRefs: ownerTokenRefs(samples, 'radius.').map((item) => item.ref),
    })
  }

  const surfaceOwners = owners.filter((owner) => {
    if ('styles' in owner) {
      return Boolean(
        owner.styles.backgroundColor ||
        hasVisibleBorder(owner.styles.border) ||
        hasVisibleShadow(owner.styles.boxShadow),
      )
    }
    const styles = owner.observedStyles
    return Boolean(
      styles?.backgroundColor ||
      styles?.gradient ||
      Object.values(styles?.borders || {}).some(hasVisibleBorder) ||
      hasVisibleShadow(styles?.boxShadow),
    )
  })
  if (surfaceOwners.length > 0) {
    const samples = surfaceOwners.slice(0, 8)
    const evidenceIds = samples.map((owner) => owner.id)
    const bordered = samples.filter((owner) =>
      'styles' in owner
        ? hasVisibleBorder(owner.styles.border)
        : Object.values(owner.observedStyles?.borders || {}).some(hasVisibleBorder),
    ).length
    const shadowed = samples.filter((owner) => {
      const shadow = 'styles' in owner ? owner.styles.boxShadow : owner.observedStyles?.boxShadow
      return hasVisibleShadow(shadow)
    }).length
    builder.add('visual-surfaces', [{ kind: 'singleton', slot: 'visual.surfaces' }], {
      statement: t('surfaceStatement', { count: samples.length, bordered, shadowed }),
      implementation: t('boundedImplementation'),
      confidence: confidenceFor(evidenceIds, evidence),
      evidenceIds,
      assertions: [
        {
          kind: 'evidence',
          target: 'surfaces',
          predicate: 'supports',
          scope: assertionScope(evidenceIds, evidence),
          evidenceIds,
          property: 'observed-surface-counts',
          value: [`owners:${samples.length}`, `bordered:${bordered}`, `shadowed:${shadowed}`],
        },
      ],
      tokenRefs: stableList(
        samples.flatMap((owner) => owner.tokenRefs),
        8,
      ),
    })
  }
}

function buildSectionClaims(
  builder: CatalogBuilder,
  evidence: DesignEvidence,
  sections: SectionEvidence[],
  pageById: Map<string, EvidencePage>,
  t: ReturnType<typeof coreTranslator>,
): void {
  const grouped = new Map<string, SectionEvidence[]>()
  sections.forEach((section) => {
    if (section.role === 'unknown') return
    const items = grouped.get(section.role) || []
    items.push(section)
    grouped.set(section.role, items)
  })
  const groups = [...grouped.entries()]
    .sort((first, second) => second[1].length - first[1].length || first[0].localeCompare(second[0]))
    .slice(0, 8)
  for (const [role, items] of groups) {
    const samples = items.slice(0, 6)
    const evidenceIds = samples.map((section) => section.id)
    const urls = new Set(
      samples.flatMap((section) => (pageById.get(section.pageId) ? [pageById.get(section.pageId)!.url] : [])),
    )
    const placements: DesignClaimCatalogPlacement[] = [{ kind: 'section', role, bucket: 'composition' }]
    if (urls.size >= 2) placements.push({ kind: 'signature' })
    builder.add(`section-${role}-composition`, placements, {
      statement: t('sectionCompositionStatement', {
        count: samples.length,
        role,
        layouts: stableList(samples.map((section) => section.layoutMode)).join(', '),
      }),
      implementation: t('boundedImplementation'),
      confidence: confidenceFor(evidenceIds, evidence),
      evidenceIds,
      assertions: samples.map((section) => ({
        kind: 'section',
        target: role,
        predicate: 'layout-mode',
        scope: assertionScope([section.id], evidence),
        evidenceIds: [section.id],
        value: section.layoutMode,
      })),
      tokenRefs: stableList(
        samples.flatMap((section) => section.tokenRefs),
        8,
      ),
      title: t('sectionTitle', { role }),
      distinctiveness: t('sectionDistinctiveness', { role, count: samples.length }),
    })
    const stablePositions = stableList(samples.map((section) => String(section.order + 1)))
    if (stablePositions.length === 1) {
      builder.add(`section-${role}-rhythm`, [{ kind: 'section', role, bucket: 'contentRhythm' }], {
        statement: t('sectionRhythmStatement', {
          role,
          position: stablePositions[0],
        }),
        implementation: t('boundedImplementation'),
        confidence: confidenceFor(evidenceIds, evidence),
        evidenceIds,
        assertions: [
          {
            kind: 'evidence',
            target: 'composition',
            predicate: 'supports',
            scope: assertionScope(evidenceIds, evidence),
            evidenceIds,
            property: 'sequence-index',
            value: stablePositions,
          },
        ],
      })
    }
    const transitions = items.flatMap((section) => {
      const next = sections
        .filter((candidate) => candidate.pageId === section.pageId)
        .find((candidate) => candidate.order === section.order + 1)
      return next && next.role !== 'unknown' ? [{ section, next }] : []
    })
    if (transitions.length > 0) {
      const samplesWithNext = transitions.slice(0, 4)
      const stableNextRoles = stableList(samplesWithNext.map(({ next }) => next.role))
      if (stableNextRoles.length === 1) {
        const transitionEvidenceIds = samplesWithNext.flatMap(({ section, next }) => [section.id, next.id])
        builder.add(`section-${role}-transition`, [{ kind: 'section', role, bucket: 'transitionToNext' }], {
          statement: t('sectionTransitionStatement', {
            role,
            next: stableNextRoles[0],
          }),
          implementation: t('boundedImplementation'),
          confidence: confidenceFor(transitionEvidenceIds, evidence),
          evidenceIds: transitionEvidenceIds,
          assertions: samplesWithNext.map(({ section, next }) => ({
            kind: 'section',
            target: section.role,
            predicate: 'ordered-before',
            scope: assertionScope([section.id, next.id], evidence),
            evidenceIds: [section.id, next.id],
            value: next.role,
          })),
        })
      }
    }
  }
}

function buildComponentClaims(
  builder: CatalogBuilder,
  evidence: DesignEvidence,
  components: ComponentEvidence[],
  pageById: Map<string, EvidencePage>,
  t: ReturnType<typeof coreTranslator>,
): void {
  const groups = new Map<string, ComponentEvidence[]>()
  components.forEach((component) => {
    const key = `${component.type}\u0000${component.role || component.type}`
    const values = groups.get(key) || []
    values.push(component)
    groups.set(key, values)
  })
  for (const [key, items] of [...groups.entries()]
    .sort((first, second) => second[1].length - first[1].length || first[0].localeCompare(second[0]))
    .slice(0, 10)) {
    const [type, role] = key.split('\u0000')
    const samples = items.slice(0, 6)
    const evidenceIds = samples.map((component) => component.id)
    const facts = samples.map((component) => {
      const page = pageById.get(component.pageId)
      return {
        component,
        shape: componentShape(component, page),
        variant: classifyComponentVariant(component.type as ComponentType, component.styles, {
          role: component.role,
          tokenRefs: component.tokenRefs,
          primaryColor: evidence.tokens.colors.primary,
          widthPx: page?.contentWidth ? component.rect.width * page.contentWidth : undefined,
          heightPx: page?.contentHeight ? component.rect.height * page.contentHeight : undefined,
        }),
      }
    })
    const variants = stableList(facts.flatMap((fact) => (fact.variant ? [fact.variant] : [])))
    const shapes = stableList(facts.map((fact) => fact.shape))
    const assertions: DesignClaimAssertion[] = facts.flatMap(({ component, shape, variant }) => [
      {
        kind: 'component',
        target: type,
        predicate: 'present',
        scope: assertionScope([component.id], evidence),
        evidenceIds: [component.id],
      },
      {
        kind: 'component',
        target: type,
        predicate: 'corner-shape',
        scope: assertionScope([component.id], evidence),
        evidenceIds: [component.id],
        value: shape,
      },
      ...(variant
        ? [
            {
              kind: 'component' as const,
              target: type,
              predicate: 'variant',
              scope: assertionScope([component.id], evidence),
              evidenceIds: [component.id],
              value: variant,
            },
          ]
        : []),
    ])
    const urls = new Set(samples.map((component) => pageById.get(component.pageId)?.url).filter(Boolean))
    const placements: DesignClaimCatalogPlacement[] = [{ kind: 'component', component: type, role }]
    if (urls.size >= 2) placements.push({ kind: 'signature' })
    const isPrimary = variants.includes('primary')
    if (isPrimary) placements.push({ kind: 'singleton', slot: 'attention.action' })
    const localizedVariants = variants.map((variant) => t(`componentVariants.${variant}`, { defaultValue: variant }))
    const variantClause = localizedVariants.length
      ? t('componentVariantClause', { count: localizedVariants.length, variants: localizedVariants.join(', ') })
      : ''
    builder.add(`component-${type}-${role}`, placements, {
      statement: t(type === role ? 'componentStatementSameRole' : 'componentStatementWithRole', {
        count: samples.length,
        type,
        role,
        shapes: shapes.join(', '),
        variantClause,
      }),
      implementation: t('componentImplementation'),
      confidence: confidenceFor(evidenceIds, evidence),
      evidenceIds,
      assertions,
      tokenRefs: stableList(
        samples.flatMap((component) => component.tokenRefs),
        8,
      ),
      title: t('componentTitle', { type, role }),
      distinctiveness: t('componentDistinctiveness', { count: samples.length, type }),
    })
  }
}

function buildInteractionClaims(
  builder: CatalogBuilder,
  evidence: DesignEvidence,
  validPageIds: Set<string>,
  t: ReturnType<typeof coreTranslator>,
): void {
  const observations = evidence.interactionObservations.filter(
    (observation) => validPageIds.has(observation.pageId) && observation.changedProperties.length > 0,
  )
  const patternGroups = new Map<string, typeof observations>()
  observations.forEach((observation) => {
    const key = JSON.stringify({
      driver: observation.driver,
      safety: observation.safety,
      properties: stableList(observation.changedProperties),
    })
    const values = patternGroups.get(key) || []
    values.push(observation)
    patternGroups.set(key, values)
  })
  for (const [key, items] of [...patternGroups.entries()]
    .sort((first, second) => second[1].length - first[1].length || first[0].localeCompare(second[0]))
    .slice(0, 10)) {
    const samples = items.slice(0, 12)
    const representative = samples[0]
    const evidenceIds = samples.map((observation) => observation.id)
    const assertions: DesignClaimAssertion[] = samples.flatMap((observation) => [
      {
        kind: 'interaction',
        target: observation.driver,
        predicate: 'observed',
        scope: assertionScope([observation.id], evidence),
        evidenceIds: [observation.id],
      },
      ...observation.changedProperties.map((property): DesignClaimAssertion => ({
        kind: 'interaction',
        target: observation.driver,
        predicate: 'property-change',
        scope: assertionScope([observation.id], evidence),
        evidenceIds: [observation.id],
        property,
      })),
      ...(observation.safety === 'safe-active'
        ? [
            {
              kind: 'interaction' as const,
              target: observation.driver,
              predicate: 'executed',
              scope: assertionScope([observation.id], evidence),
              evidenceIds: [observation.id],
            },
          ]
        : []),
    ])
    const placements: DesignClaimCatalogPlacement[] = [{ kind: 'interaction', bucket: 'driver' }]
    if (representative.driver === 'scroll') placements.push({ kind: 'interaction', bucket: 'scrollNarrative' })
    builder.add(`interaction-pattern-${key}`, placements, {
      statement: t(
        representative.safety === 'passive'
          ? 'passiveInteractionPatternStatement'
          : 'activeInteractionPatternStatement',
        {
          count: samples.length,
          driver: representative.driver,
          properties: stableList(representative.changedProperties).join(', '),
        },
      ),
      implementation: t(
        representative.safety === 'passive' ? 'passiveInteractionImplementation' : 'activeInteractionImplementation',
      ),
      confidence: representative.safety === 'passive' ? 'medium' : confidenceFor(evidenceIds, evidence),
      evidenceIds,
      assertions,
    })
  }
  if (observations.length === 0) return
  const visualObservations = observations
    .filter((observation) =>
      observation.changedProperties.some(
        (property) => !/^(?:aria-|data-|checked$|disabled$|selected$|expanded$)/i.test(property),
      ),
    )
    .slice(0, 16)
  const evidenceIds = visualObservations.map((observation) => observation.id)
  const properties = stableList(
    visualObservations.flatMap((observation) => observation.changedProperties),
    12,
  )
  const passive = visualObservations.filter((observation) => observation.safety === 'passive').length
  if (visualObservations.length > 0) {
    builder.add('interaction-feedback', [{ kind: 'singleton', slot: 'interaction.feedback' }], {
      statement: t('interactionFeedbackStatement', {
        count: visualObservations.length,
        properties: properties.join(', '),
        passive,
      }),
      implementation: t('passiveInteractionImplementation'),
      confidence: visualObservations.every((observation) => observation.safety === 'passive')
        ? 'medium'
        : confidenceFor(evidenceIds, evidence),
      evidenceIds,
      assertions: [
        ...visualObservations.flatMap((observation) =>
          observation.changedProperties.map((property) => ({
            kind: 'interaction' as const,
            target: observation.driver,
            predicate: 'property-change',
            scope: assertionScope([observation.id], evidence),
            evidenceIds: [observation.id],
            property,
          })),
        ),
        {
          kind: 'evidence',
          target: 'interaction',
          predicate: 'supports',
          scope: assertionScope(evidenceIds, evidence),
          evidenceIds,
          property: 'observation-count',
          value: visualObservations.length,
        },
        {
          kind: 'evidence',
          target: 'interaction',
          predicate: 'supports',
          scope: assertionScope(evidenceIds, evidence),
          evidenceIds,
          property: 'passive-observation-count',
          value: passive,
        },
      ],
    })
    const counts = visualObservations.map((observation) => observation.changedProperties.length)
    builder.add('interaction-amplitude', [{ kind: 'singleton', slot: 'interaction.amplitude' }], {
      statement: t('interactionAmplitudeStatement', {
        minimum: Math.min(...counts),
        maximum: Math.max(...counts),
      }),
      implementation: t('amplitudeImplementation'),
      confidence: visualObservations.every((observation) => observation.safety === 'passive')
        ? 'medium'
        : confidenceFor(evidenceIds, evidence),
      evidenceIds,
      assertions: [
        {
          kind: 'evidence',
          target: 'interaction',
          predicate: 'supports',
          scope: assertionScope(evidenceIds, evidence),
          evidenceIds,
          property: 'changed-property-count-range',
          value: [String(Math.min(...counts)), String(Math.max(...counts))],
        },
      ],
    })
  }
  const transitioned = observations.filter((observation) => observation.transition)
  if (transitioned.length > 0) {
    const transitionEvidenceIds = transitioned.map((observation) => observation.id)
    builder.add('visual-motion', [{ kind: 'visual', slot: 'motion' }], {
      statement: t('motionStatement', { count: transitioned.length }),
      implementation: t('boundedImplementation'),
      confidence: transitioned.every((observation) => observation.safety === 'passive')
        ? 'medium'
        : confidenceFor(transitionEvidenceIds, evidence),
      evidenceIds: transitionEvidenceIds,
      assertions: [
        {
          kind: 'evidence',
          target: 'motion',
          predicate: 'supports',
          scope: assertionScope(transitionEvidenceIds, evidence),
          evidenceIds: transitionEvidenceIds,
          property: 'transition-metadata-observed',
          value: true,
        },
      ],
    })
  }
}

function buildResponsiveAndScopeClaims(
  builder: CatalogBuilder,
  evidence: DesignEvidence,
  validSectionIds: Set<string>,
  safeCapturePageIds: Set<string>,
  t: ReturnType<typeof coreTranslator>,
): void {
  const roleBySection = new Map(evidence.sections.map((section) => [section.id, section.role]))
  const pageIdByEvidenceId = new Map<string, string>()
  evidence.pages.forEach((page) => {
    pageIdByEvidenceId.set(page.id, page.id)
    page.images.forEach((image) => pageIdByEvidenceId.set(image.id, page.id))
  })
  evidence.sections.forEach((section) => pageIdByEvidenceId.set(section.id, section.pageId))
  evidence.components.forEach((component) => pageIdByEvidenceId.set(component.id, component.pageId))
  evidence.layoutNodes.forEach((node) => pageIdByEvidenceId.set(node.id, node.pageId))
  evidence.interactionObservations.forEach((observation) => pageIdByEvidenceId.set(observation.id, observation.pageId))
  evidence.mediaLayers.forEach((media) => pageIdByEvidenceId.set(media.id, media.pageId))
  for (const observation of evidence.responsiveObservations
    .filter((item) => {
      if (!hasConsistentResponsiveSectionIdentity(item, evidence)) return false
      if (!validSectionIds.has(item.sectionId) || roleBySection.get(item.sectionId) === 'unknown') return false
      if (
        item.evidenceRefs.some((evidenceId) => {
          const pageId = pageIdByEvidenceId.get(evidenceId)
          return pageId !== undefined && !safeCapturePageIds.has(pageId)
        })
      ) {
        return false
      }
      const recordsAbsent = Object.values(item.changes || {}).some(
        (change) => change.from === 'absent' || change.to === 'absent',
      )
      const directlyHidden = Object.entries(item.changes || {}).some(
        ([property, change]) =>
          (/(?:^|\.)display$/.test(property) && change.to === 'none') ||
          (/(?:^|\.)visibility$/.test(property) && ['hidden', 'collapse'].includes(String(change.to))),
      )
      return !recordsAbsent || directlyHidden
    })
    .slice(0, 10)) {
    const role = roleBySection.get(observation.sectionId)
    const changes = usefulResponsiveChanges(observation, role)
    if (changes.length === 0) continue
    const changedProperties = changes.map(([property]) => property)
    const changeType = displayedResponsiveChangeType(observation.changeType, changedProperties)
    const evidenceIds = [observation.id, ...observation.evidenceRefs]
    const assertions: DesignClaimAssertion[] = changedProperties.map((property) => ({
      kind: 'responsive',
      target: role || observation.sectionId,
      predicate: 'property-change',
      scope: 'page',
      evidenceIds: [observation.id],
      property,
      value: observation.changes?.[property]
        ? [String(observation.changes[property].from ?? ''), String(observation.changes[property].to ?? '')]
        : undefined,
    }))
    if (changeType === 'reflow') {
      assertions.push({
        kind: 'responsive',
        target: role || observation.sectionId,
        predicate: 'reflow',
        scope: 'page',
        evidenceIds: [observation.id],
      })
    }
    assertions.push({
      kind: 'evidence',
      target: 'responsive',
      predicate: 'supports',
      scope: 'page',
      evidenceIds: [observation.id],
      property: 'change-type',
      value: changeType,
    })
    builder.add(`responsive-${observation.id}`, [{ kind: 'transfer', bucket: 'adapt' }], {
      statement: t('responsiveStatement', {
        role: role || observation.sectionId,
        from: observation.fromViewport,
        to: observation.toViewport,
        change: changeType,
        properties: changedProperties.join(', '),
      }),
      implementation: t('responsiveImplementation'),
      confidence: 'medium',
      evidenceIds,
      assertions,
    })
  }

  for (const page of evidence.pages
    .filter((candidate) => candidate.health?.evidenceEligible !== false)
    .filter(hasSevereHorizontalOverflow)
    .slice(0, 4)) {
    const sourceIds = stableList(page.horizontalOverflowSources?.flatMap((source) => source.sectionId || []) || [], 4)
    const evidenceIds = stableList([page.id, ...sourceIds])
    builder.add(`overflow-${page.id}`, [{ kind: 'transfer', bucket: 'avoid' }], {
      statement: t('overflowStatement', {
        viewport: page.viewportWidth || 0,
        content: page.contentWidth || 0,
        viewportName: page.viewport,
      }),
      implementation: t('overflowImplementation'),
      confidence: 'high',
      evidenceIds,
      assertions: [
        {
          kind: 'responsive',
          target: 'viewport',
          predicate: 'horizontal-overflow',
          scope: 'page',
          evidenceIds,
          value: [String(page.viewportWidth || 0), String(page.contentWidth || 0)],
        },
      ],
    })
  }
}

function buildMediaClaim(
  builder: CatalogBuilder,
  evidence: DesignEvidence,
  validPageIds: Set<string>,
  t: ReturnType<typeof coreTranslator>,
): void {
  const media = evidence.mediaLayers
    .filter((item) => validPageIds.has(item.pageId) && item.importance === 'major')
    .slice(0, 8)
  if (media.length === 0) return
  const evidenceIds = media.map((item) => item.id)
  builder.add('visual-imagery', [{ kind: 'visual', slot: 'imagery' }], {
    statement: t('mediaStatement', {
      count: media.length,
      kinds: stableList(media.map((item) => item.kind)).join(', '),
      roles: stableList(media.map((item) => item.role)).join(', '),
    }),
    implementation: t('boundedImplementation'),
    confidence: confidenceFor(evidenceIds, evidence),
    evidenceIds,
    assertions: media.map((item) => ({
      kind: 'evidence',
      target: 'imagery',
      predicate: 'supports',
      scope: assertionScope([item.id], evidence),
      evidenceIds: [item.id],
      property: 'media-kind-role',
      value: [item.kind, item.role],
    })),
  })
}

function buildUncertainties(evidence: DesignEvidence, language: 'en' | 'zh-CN'): DesignProfile['uncertainties'] {
  const t = coreTranslator(language, 'designContext.catalog')
  const result: DesignProfile['uncertainties'] = []
  const add = (key: string, reason: string, neededEvidence?: string) => {
    if (result.some((item) => item.topic === key)) return
    result.push({ topic: key, reason, ...(neededEvidence ? { neededEvidence } : {}) })
  }
  if (evidence.coverage.pageCoverage === 'partial') {
    add(t('uncertainties.pageTopic'), t('uncertainties.pageReason'), t('uncertainties.pageNeeded'))
  }
  if (evidence.coverage.captureCoverage?.status === 'partial') {
    add(t('uncertainties.captureTopic'), t('uncertainties.captureReason'), t('uncertainties.captureNeeded'))
  }
  const unhealthyCaptures = evidence.pages.filter((page) => page.health?.evidenceEligible === false).length
  if (unhealthyCaptures > 0) {
    add(
      t('uncertainties.healthTopic'),
      t('uncertainties.healthReason', { count: unhealthyCaptures }),
      t('uncertainties.healthNeeded'),
    )
  }
  if (resolveScreenshotAssetCoverage(evidence).status === 'partial') {
    add(t('uncertainties.assetTopic'), t('uncertainties.assetReason'), t('uncertainties.assetNeeded'))
  }
  const reusablePageIds = canonicalCatalogPageIds(evidence)
  const reusableUrls = new Set(evidence.pages.filter((page) => reusablePageIds.has(page.id)).map((page) => page.url))
  if (reusableUrls.size < 2) {
    add(t('uncertainties.crossPageTopic'), t('uncertainties.crossPageReason'), t('uncertainties.crossPageNeeded'))
  }
  if (evidence.interactionObservations.every((observation) => observation.safety === 'passive')) {
    add(t('uncertainties.interactionTopic'), t('uncertainties.interactionReason'), t('uncertainties.interactionNeeded'))
  }
  if (
    evidence.responsiveObservations.some((observation) =>
      Object.values(observation.changes || {}).some((change) => change.from === 'absent' || change.to === 'absent'),
    )
  ) {
    add(
      t('uncertainties.responsivePresenceTopic'),
      t('uncertainties.responsivePresenceReason'),
      t('uncertainties.responsivePresenceNeeded'),
    )
  }
  if (
    evidence.limitations.includes('responsive-section-identity-mismatch') ||
    evidence.responsiveObservations.some(
      (observation) => !hasConsistentResponsiveSectionIdentity(observation, evidence),
    )
  ) {
    add(
      t('uncertainties.responsiveIdentityTopic'),
      t('uncertainties.responsiveIdentityReason'),
      t('uncertainties.responsiveIdentityNeeded'),
    )
  }
  if (evidence.pages.some(hasSevereHorizontalOverflow)) {
    add(t('uncertainties.overflowTopic'), t('uncertainties.overflowReason'), t('uncertainties.overflowNeeded'))
  }
  if (evidence.sections.length === 0) {
    add(t('uncertainties.sectionTopic'), t('uncertainties.sectionReason'), t('uncertainties.sectionNeeded'))
  }
  return result.slice(0, 8)
}

export function buildDeterministicClaimCatalog(evidence: DesignEvidence, language: 'en' | 'zh-CN'): DesignClaimCatalog {
  const t = coreTranslator(language, 'designContext.catalog')
  const builder = createCatalogBuilder(evidence, language)
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const validPageIds = canonicalCatalogPageIds(evidence)
  const safeCapturePageIds = new Set(
    evidence.pages
      .filter((page) => !hasSevereHorizontalOverflow(page) && page.health?.evidenceEligible !== false)
      .map((page) => page.id),
  )
  const sections = evidence.sections
    .filter((section) => validPageIds.has(section.pageId))
    .sort((first, second) => first.pageId.localeCompare(second.pageId) || first.order - second.order)
  const validSectionIds = new Set(sections.map((section) => section.id))
  const components = evidence.components.filter(
    (component) => validPageIds.has(component.pageId) && validSectionIds.has(component.sectionId),
  )
  const sectionsByPage = new Map<string, SectionEvidence[]>()
  sections.forEach((section) => {
    const values = sectionsByPage.get(section.pageId) || []
    values.push(section)
    sectionsByPage.set(section.pageId, values)
  })

  const sequences = [...sectionsByPage.values()]
    .map((sequence) =>
      sequence
        .filter((section) => section.role !== 'unknown')
        .filter((section, index, values) => index === 0 || values[index - 1].role !== section.role),
    )
    .filter((sequence) => sequence.length > 0)
  if (sequences.length > 0) {
    const sequenceGroups = new Map<string, SectionEvidence[][]>()
    sequences.forEach((sequence) => {
      const key = sequence.map((section) => section.role).join('>')
      const values = sequenceGroups.get(key) || []
      values.push(sequence)
      sequenceGroups.set(key, values)
    })
    const [sequenceKey, matchingSequences] = [...sequenceGroups.entries()].sort(
      (first, second) => second[1].length - first[1].length || first[0].localeCompare(second[0]),
    )[0]
    const representative = matchingSequences[0]
    const evidenceIds = stableList(matchingSequences.flatMap((sequence) => sequence.map((section) => section.id)))
    const sequenceAssertions = matchingSequences.flatMap((sequence) => {
      const assertions = orderedSectionAssertions(sequence, evidence)
      return assertions.length > 0
        ? assertions
        : [
            {
              kind: 'section' as const,
              target: sequence[0].role,
              predicate: 'present',
              scope: assertionScope([sequence[0].id], evidence),
              evidenceIds: [sequence[0].id],
            },
          ]
    })
    const recurring = assertionScope(evidenceIds, evidence) === 'cross-page'
    const placements: DesignClaimCatalogPlacement[] = [
      { kind: 'singleton', slot: 'thesis' },
      { kind: 'singleton', slot: 'composition.rhythm' },
      { kind: 'attention-sequence' },
    ]
    if (recurring) placements.push({ kind: 'signature' })
    builder.add('observed-section-sequence', placements, {
      statement: t(recurring ? 'recurringSequenceStatement' : 'localSequenceStatement', {
        first: representative[0].role,
        roles: sequenceKey.replaceAll('>', ' -> '),
        captures: matchingSequences.length,
      }),
      implementation: t('sequenceImplementation'),
      confidence: recurring ? 'high' : 'medium',
      evidenceIds,
      assertions: sequenceAssertions,
      title: t('sequenceTitle'),
      distinctiveness: t('sequenceDistinctiveness', { captures: matchingSequences.length }),
    })

    const entryGroups = new Map<string, SectionEvidence[][]>()
    sequences.forEach((sequence) => {
      const values = entryGroups.get(sequence[0].role) || []
      values.push(sequence)
      entryGroups.set(sequence[0].role, values)
    })
    const [entryRole, entrySequences] = [...entryGroups.entries()].sort(
      (first, second) => second[1].length - first[1].length || first[0].localeCompare(second[0]),
    )[0]
    const entryEvidenceIds = stableList(
      entrySequences.flatMap((sequence) => sequence.slice(0, 2).map((section) => section.id)),
    )
    const recurringEntry = assertionScope(entryEvidenceIds, evidence) === 'cross-page'
    builder.add('observed-entry-section', [{ kind: 'singleton', slot: 'attention.entry' }], {
      statement: t(recurringEntry ? 'recurringEntryStatement' : 'localEntryStatement', {
        role: entryRole,
        captures: entrySequences.length,
      }),
      implementation: t('entryImplementation'),
      confidence: recurringEntry ? 'high' : 'medium',
      evidenceIds: entryEvidenceIds,
      assertions: entrySequences.flatMap((sequence) => [
        {
          kind: 'section' as const,
          target: entryRole,
          predicate: 'present',
          scope: assertionScope([sequence[0].id], evidence),
          evidenceIds: [sequence[0].id],
        },
        ...(sequence[1]
          ? [
              {
                kind: 'section' as const,
                target: entryRole,
                predicate: 'ordered-before',
                scope: assertionScope([sequence[0].id, sequence[1].id], evidence),
                evidenceIds: [sequence[0].id, sequence[1].id],
                value: sequence[1].role,
              },
            ]
          : []),
      ]),
    })
  }

  buildCompositionClaims(builder, evidence, sections, sectionsByPage, t)
  buildVisualClaims(builder, evidence, sections, components, pageById, t)
  buildSectionClaims(builder, evidence, sections, pageById, t)
  buildComponentClaims(builder, evidence, components, pageById, t)
  buildInteractionClaims(builder, evidence, validPageIds, t)
  buildResponsiveAndScopeClaims(builder, evidence, validSectionIds, safeCapturePageIds, t)
  buildMediaClaim(builder, evidence, validPageIds, t)

  const claims = builder.entries
    .map((entry, index) => ({ entry, index }))
    .sort((first, second) => {
      const priority = (entry: DesignClaimCatalogEntry): number => {
        if (entry.placements.some((placement) => placement.kind === 'singleton')) return 0
        if (entry.placements.some((placement) => placement.kind === 'transfer' && placement.bucket === 'avoid'))
          return 1
        if (entry.placements.some((placement) => placement.kind === 'transfer' && placement.bucket === 'adapt'))
          return 2
        if (entry.placements.some((placement) => placement.kind === 'signature')) return 3
        if (entry.placements.some((placement) => placement.kind === 'visual')) return 4
        if (entry.placements.some((placement) => placement.kind === 'section')) return 5
        if (entry.placements.some((placement) => placement.kind === 'component')) return 6
        return 7
      }
      return priority(first.entry) - priority(second.entry) || first.index - second.index
    })
    .slice(0, 64)
    .map(({ entry }) => entry)

  return {
    schemaVersion: '1',
    catalogVersion: DESIGN_CLAIM_CATALOG_VERSION,
    language,
    claims,
    uncertainties: buildUncertainties(evidence, language),
  }
}

function unavailableClaim(language: 'en' | 'zh-CN', slot: DesignClaimSingletonSlot): DesignClaim {
  const t = coreTranslator(language, 'designContext.catalog')
  return {
    statement: t('unavailableStatement', { slot }),
    implementation: t('unavailableImplementation'),
    confidence: 'low',
    evidence: [],
    assertions: [],
    source: 'unavailable',
  }
}

function cloneClaim(entry: DesignClaimCatalogEntry): DesignClaim {
  return structuredClone(entry.claim)
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const ASSERTION_SCOPE_RANK = {
  'cross-page': 0,
  page: 1,
  instance: 2,
} as const

function bestAssertionScopeRank(entry: DesignClaimCatalogEntry): number {
  return Math.min(...(entry.claim.assertions || []).map((assertion) => ASSERTION_SCOPE_RANK[assertion.scope]), 3)
}

/**
 * Stable program-owned order for bounded highlight slots.
 */
function compareCatalogHighlights(first: DesignClaimCatalogEntry, second: DesignClaimCatalogEntry): number {
  return (
    CONFIDENCE_RANK[first.claim.confidence] - CONFIDENCE_RANK[second.claim.confidence] ||
    bestAssertionScopeRank(first) - bestAssertionScopeRank(second) ||
    second.claim.evidence.length - first.claim.evidence.length ||
    (first.id < second.id ? -1 : first.id > second.id ? 1 : 0)
  )
}

export function materializeDesignProfile(catalog: DesignClaimCatalog): DesignProfile {
  const entriesFor = (matches: (placement: DesignClaimCatalogPlacement) => boolean): DesignClaimCatalogEntry[] =>
    catalog.claims.filter((entry) => entry.placements.some(matches))
  const rankedEntriesFor = (matches: (placement: DesignClaimCatalogPlacement) => boolean): DesignClaimCatalogEntry[] =>
    entriesFor(matches).sort(compareCatalogHighlights)
  const singleton = (slot: DesignClaimSingletonSlot): DesignClaim => {
    const entry = rankedEntriesFor((placement) => placement.kind === 'singleton' && placement.slot === slot)[0]
    return entry ? cloneClaim(entry) : unavailableClaim(catalog.language, slot)
  }
  const optional = (slot: 'imagery' | 'motion'): DesignClaim | undefined => {
    const entry = entriesFor((placement) => placement.kind === 'visual' && placement.slot === slot)[0]
    return entry ? cloneClaim(entry) : undefined
  }
  const chosenSignatures = rankedEntriesFor((placement) => placement.kind === 'signature').slice(0, 2)
  const sectionGroups = new Map<string, DesignProfile['sectionGrammar'][number]>()
  for (const entry of catalog.claims) {
    for (const placement of entry.placements) {
      if (placement.kind !== 'section') continue
      const group = sectionGroups.get(placement.role) || {
        role: placement.role,
        composition: [],
        contentRhythm: [],
        transitionToNext: [],
      }
      group[placement.bucket].push(cloneClaim(entry))
      sectionGroups.set(placement.role, group)
    }
  }
  const componentGroups = new Map<string, DesignProfile['componentGrammar'][number]>()
  for (const entry of catalog.claims) {
    for (const placement of entry.placements) {
      if (placement.kind !== 'component') continue
      const key = `${placement.component}\u0000${placement.role}`
      const group = componentGroups.get(key) || {
        component: placement.component,
        role: placement.role,
        rules: [],
      }
      group.rules.push(cloneClaim(entry))
      componentGroups.set(key, group)
    }
  }
  const claimsFor = (matches: (placement: DesignClaimCatalogPlacement) => boolean): DesignClaim[] =>
    entriesFor(matches).map(cloneClaim)
  const rankedClaimsFor = (
    matches: (placement: DesignClaimCatalogPlacement) => boolean,
    limit: number,
  ): DesignClaim[] => rankedEntriesFor(matches).slice(0, limit).map(cloneClaim)
  return {
    schemaVersion: DESIGN_PROFILE_SCHEMA_VERSION,
    language: catalog.language,
    claimSource: 'deterministic-catalog',
    catalogVersion: catalog.catalogVersion,
    thesis: singleton('thesis'),
    signatureMoves: chosenSignatures.map((entry) => ({
      ...cloneClaim(entry),
      id: entry.id,
      name: entry.title || entry.id,
      distinctiveness: entry.distinctiveness || entry.claim.statement,
    })),
    composition: {
      containerStrategy: singleton('composition.container'),
      alignmentStrategy: singleton('composition.alignment'),
      densityAndWhitespace: singleton('composition.density'),
      rhythm: singleton('composition.rhythm'),
    },
    attention: {
      entryPoint: singleton('attention.entry'),
      visualSequence: claimsFor((placement) => placement.kind === 'attention-sequence'),
      actionHierarchy: singleton('attention.action'),
      contrastStrategy: singleton('attention.contrast'),
    },
    visualLanguage: {
      color: singleton('visual.color'),
      typography: singleton('visual.typography'),
      shape: singleton('visual.shape'),
      surfaces: singleton('visual.surfaces'),
      ...(optional('imagery') ? { imagery: optional('imagery') } : {}),
      ...(optional('motion') ? { motion: optional('motion') } : {}),
    },
    sectionGrammar: [...sectionGroups.values()],
    interactionLanguage: {
      primaryDrivers: rankedClaimsFor(
        (placement) => placement.kind === 'interaction' && placement.bucket === 'driver',
        4,
      ),
      feedbackStyle: singleton('interaction.feedback'),
      stateChangeAmplitude: singleton('interaction.amplitude'),
      ...(claimsFor((placement) => placement.kind === 'interaction' && placement.bucket === 'scrollNarrative')[0]
        ? {
            scrollNarrative: claimsFor(
              (placement) => placement.kind === 'interaction' && placement.bucket === 'scrollNarrative',
            )[0],
          }
        : {}),
      continuityRules: claimsFor((placement) => placement.kind === 'interaction' && placement.bucket === 'continuity'),
    },
    componentGrammar: [...componentGroups.values()],
    transferRules: {
      preserve: claimsFor((placement) => placement.kind === 'transfer' && placement.bucket === 'preserve'),
      adapt: claimsFor((placement) => placement.kind === 'transfer' && placement.bucket === 'adapt'),
      avoid: claimsFor((placement) => placement.kind === 'transfer' && placement.bucket === 'avoid'),
    },
    uncertainties: structuredClone(catalog.uncertainties),
  }
}

export interface DesignClaimCatalogIntegrity {
  valid: boolean
  errors: string[]
}

export function validateDesignClaimCatalog(
  catalog: DesignClaimCatalog,
  evidence: DesignEvidence,
): DesignClaimCatalogIntegrity {
  const errors: string[] = []
  const knownEvidenceIds = listEvidenceIds(evidence)
  const knownTokenRefs = listEvidenceTokenRefs(evidence)
  const tokenRefsByOwner = new Map<string, Set<string>>([
    ...evidence.sections.map((section) => [section.id, new Set(section.tokenRefs)] as const),
    ...evidence.components.map((component) => [component.id, new Set(component.tokenRefs)] as const),
    ...evidence.layoutNodes.map((node) => [node.id, new Set(node.tokenRefs)] as const),
  ])
  const severePageIds = new Set(evidence.pages.filter(hasSevereHorizontalOverflow).map((page) => page.id))
  const unsafePageIds = new Set(
    evidence.pages.filter((page) => page.health?.evidenceEligible === false).map((page) => page.id),
  )
  const severeEvidenceIds = new Set<string>()
  const unsafeEvidenceIds = new Set<string>()
  evidence.pages.forEach((page) => {
    if (severePageIds.has(page.id)) {
      severeEvidenceIds.add(page.id)
      page.images.forEach((image) => severeEvidenceIds.add(image.id))
    }
    if (unsafePageIds.has(page.id)) {
      unsafeEvidenceIds.add(page.id)
      page.images.forEach((image) => unsafeEvidenceIds.add(image.id))
    }
  })
  evidence.sections.forEach((section) => {
    if (severePageIds.has(section.pageId)) severeEvidenceIds.add(section.id)
    if (unsafePageIds.has(section.pageId)) unsafeEvidenceIds.add(section.id)
  })
  evidence.components.forEach((component) => {
    if (severePageIds.has(component.pageId)) severeEvidenceIds.add(component.id)
    if (unsafePageIds.has(component.pageId)) unsafeEvidenceIds.add(component.id)
  })
  evidence.layoutNodes.forEach((node) => {
    if (severePageIds.has(node.pageId)) severeEvidenceIds.add(node.id)
    if (unsafePageIds.has(node.pageId)) unsafeEvidenceIds.add(node.id)
  })
  evidence.interactionObservations.forEach((observation) => {
    if (severePageIds.has(observation.pageId)) severeEvidenceIds.add(observation.id)
    if (unsafePageIds.has(observation.pageId)) unsafeEvidenceIds.add(observation.id)
  })
  evidence.mediaLayers.forEach((media) => {
    if (severePageIds.has(media.pageId)) severeEvidenceIds.add(media.id)
    if (unsafePageIds.has(media.pageId)) unsafeEvidenceIds.add(media.id)
  })
  const interactionById = new Map(evidence.interactionObservations.map((observation) => [observation.id, observation]))
  const seenIds = new Set<string>()

  catalog.claims.forEach((entry, index) => {
    const path = `claims.${index}`
    if (seenIds.has(entry.id)) errors.push(`${path}:duplicate-id`)
    seenIds.add(entry.id)
    if (entry.claim.catalogId !== entry.id) errors.push(`${path}:catalog-id-mismatch`)
    if (entry.claim.source !== 'deterministic-catalog') errors.push(`${path}:invalid-source`)
    if (entry.placements.length === 0) errors.push(`${path}:missing-placement`)
    if (!entry.claim.statement.trim()) errors.push(`${path}:missing-statement`)
    if (entry.claim.evidence.length === 0) errors.push(`${path}:missing-evidence`)
    const claimEvidenceIds = new Set(entry.claim.evidence.map((reference) => reference.evidenceId))
    for (const evidenceId of claimEvidenceIds) {
      if (!knownEvidenceIds.has(evidenceId)) errors.push(`${path}:unknown-evidence(${evidenceId})`)
    }
    if ((entry.claim.assertions?.length || 0) === 0) errors.push(`${path}:missing-assertions`)
    entry.claim.assertions?.forEach((assertion, assertionIndex) => {
      if (assertion.evidenceIds.length === 0) errors.push(`${path}.assertions.${assertionIndex}:missing-evidence`)
      assertion.evidenceIds.forEach((evidenceId) => {
        if (!claimEvidenceIds.has(evidenceId)) {
          errors.push(`${path}.assertions.${assertionIndex}:evidence-outside-claim(${evidenceId})`)
        }
        if (!knownEvidenceIds.has(evidenceId)) {
          errors.push(`${path}.assertions.${assertionIndex}:unknown-evidence(${evidenceId})`)
        }
      })
    })
    entry.claim.tokenRefs?.forEach((tokenRef) => {
      if (!knownTokenRefs.has(tokenRef)) errors.push(`${path}:unknown-token-ref(${tokenRef})`)
      const ownedByCitedEvidence = [...claimEvidenceIds].some((evidenceId) =>
        tokenRefsByOwner.get(evidenceId)?.has(tokenRef),
      )
      if (!ownedByCitedEvidence) errors.push(`${path}:token-ref-without-cited-owner(${tokenRef})`)
    })
    if ([...claimEvidenceIds].some((evidenceId) => severeEvidenceIds.has(evidenceId))) {
      const limitationOnly = entry.placements.every(
        (placement) => placement.kind === 'transfer' && placement.bucket === 'avoid',
      )
      if (!limitationOnly) errors.push(`${path}:severe-overflow-used-for-reusable-claim`)
    }
    if ([...claimEvidenceIds].some((evidenceId) => unsafeEvidenceIds.has(evidenceId))) {
      const limitationOnly = entry.placements.every(
        (placement) => placement.kind === 'transfer' && placement.bucket === 'avoid',
      )
      if (!limitationOnly) errors.push(`${path}:unsafe-page-used-for-reusable-claim`)
    }
    const citedInteractions = [...claimEvidenceIds].flatMap((evidenceId) => {
      const observation = interactionById.get(evidenceId)
      return observation ? [observation] : []
    })
    if (
      entry.claim.confidence === 'high' &&
      citedInteractions.length > 0 &&
      citedInteractions.every((observation) => observation.safety === 'passive')
    ) {
      errors.push(`${path}:passive-interaction-high-confidence`)
    }
  })
  return { valid: errors.length === 0, errors }
}

export function countAvailableSingletons(catalog: DesignClaimCatalog): number {
  const available = new Set(
    catalog.claims.flatMap((entry) =>
      entry.placements.flatMap((placement) => (placement.kind === 'singleton' ? [placement.slot] : [])),
    ),
  )
  return SINGLETON_SLOTS.filter((slot) => available.has(slot)).length
}
