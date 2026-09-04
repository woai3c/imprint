import { lint } from '@google/design.md/linter'
import { parseDocument } from 'yaml'

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const COMPONENT_REUSE_THRESHOLD = 0.55
const CANDIDATE_PREVIEW_LIMIT = 5
const COMPONENT_DETAIL_LIMIT = 14
const COMPONENT_DETAIL_LIMIT_PER_TYPE = 4
const COMPONENT_EVIDENCE_SAMPLE_LIMIT = 24
const GEOMETRY_RATIO_EPSILON = 1e-9
const RADIUS_NAMES = ['sm', 'md', 'lg', 'xl', '2xl']
const SHADOW_NAMES = ['sm', 'md', 'lg', 'xl']
const DURATION_NAMES = ['fast', 'normal', 'slow', 'slower', 'slowest']
const REQUIRED_BUNDLE_FILES = [
  'DESIGN.md',
  'design-evidence.json',
  'design-tokens.json',
  'design-profile.json',
  'component-specs.json',
  'visual-qa.json',
  'variables.css',
  'variables.scss',
  'theme.css',
  'style-guide.html',
]
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const PROFILE_EXPORT_LOCALES = Object.fromEntries(
  ['en', 'zh-CN'].map((language) => {
    const filename = path.resolve(SCRIPT_DIRECTORY, `../src/core/i18n/locales/${language}.json`)
    const locale = JSON.parse(readFileSync(filename, 'utf8'))
    return [language, locale.profileExport]
  }),
)
const TRANSFER_GRAMMAR_LOCALES = Object.fromEntries(
  ['en', 'zh-CN'].map((language) => {
    const filename = path.resolve(SCRIPT_DIRECTORY, `../src/core/i18n/locales/${language}.json`)
    const locale = JSON.parse(readFileSync(filename, 'utf8'))
    return [language, locale.transferGrammar]
  }),
)
const DESIGN_EVIDENCE_LOCALES = Object.fromEntries(
  ['en', 'zh-CN'].map((language) => {
    const filename = path.resolve(SCRIPT_DIRECTORY, `../src/core/i18n/locales/${language}.json`)
    const locale = JSON.parse(readFileSync(filename, 'utf8'))
    return [language, locale.designEvidence]
  }),
)
const DESIGN_DOC_LOCALES = Object.fromEntries(
  ['en', 'zh-CN'].map((language) => {
    const filename = path.resolve(SCRIPT_DIRECTORY, `../src/core/i18n/locales/${language}.json`)
    const locale = JSON.parse(readFileSync(filename, 'utf8'))
    return [language, locale.export?.designDoc]
  }),
)

function markdownSections(source) {
  const result = new Map()
  const lines = source.split(/\r?\n/)
  let current = '_frontmatter'
  for (const line of lines) {
    const match = /^## (.+)$/.exec(line)
    if (match) current = match[1]
    const section = result.get(current) || []
    section.push(line)
    result.set(current, section)
  }
  return result
}

function frontMatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (!match) return { errors: ['missing-front-matter'], value: null }
  const document = parseDocument(match[1], { prettyErrors: true, uniqueKeys: true })
  const errors = document.errors.map((error) => error.message)
  return { errors, value: errors.length === 0 ? document.toJS() : null }
}

function extensionFor(value) {
  const extensions = value?.['x-imprint']
  return Array.isArray(extensions) && extensions[0] && typeof extensions[0] === 'object' ? extensions[0] : null
}

function usesBoundedComponentProjection(extension, componentSummary = extension?.componentSummary) {
  return (
    extension?.schema === 'imprint.design-system/2' ||
    (isObject(componentSummary) && Object.hasOwn(componentSummary, 'actionablePatterns'))
  )
}

function candidatePreviewItems(extension) {
  const candidates = extension?.candidates
  if (!candidates || typeof candidates !== 'object') return []
  return Object.entries(candidates).flatMap(([kind, values]) =>
    Array.isArray(values) ? values.map((value) => ({ kind, value })) : [],
  )
}

function normalizedCandidateColor(value) {
  const trimmed = String(value || '')
    .trim()
    .toLowerCase()
  if (!/^rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*[\d.]+)?\)$/.test(trimmed) && !/^#[\da-f]{3}(?:[\da-f]{3})?$/.test(trimmed)) {
    return null
  }
  return normalizedFrontMatterColor(trimmed)
}

function parsedAuditColor(value) {
  const normalized = normalizedFrontMatterColor(value)
  const hex = /^#([\da-f]{6})$/i.exec(normalized)
  if (hex) {
    return {
      channels: [0, 2, 4].map((offset) => Number.parseInt(hex[1].slice(offset, offset + 2), 16)),
      alpha: 1,
    }
  }
  const rgba = /^rgba\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*([\d.]+)\)$/i.exec(normalized)
  if (!rgba) return null
  const channels = rgba.slice(1, 4).map(Number)
  const alpha = Number(rgba[4])
  if (channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) return null
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null
  return { channels, alpha }
}

function auditColorLuminance(value, backdrop) {
  const color = parsedAuditColor(value)
  if (!color) return null
  const backdropColor = parsedAuditColor(backdrop)
  const channels = color.channels
    .map((channel, index) =>
      color.alpha >= 1 || !backdropColor
        ? channel
        : channel * color.alpha + backdropColor.channels[index] * (1 - color.alpha),
    )
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function auditColorContrast(first, second) {
  const firstLuminance = auditColorLuminance(first, second)
  const secondLuminance = auditColorLuminance(second)
  if (firstLuminance === null || secondLuminance === null) return null
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05)
}

function auditFoundationMutedTone(foreground, candidate) {
  const foregroundColor = parsedAuditColor(foreground)
  const candidateColor = parsedAuditColor(candidate)
  if (!foregroundColor || !candidateColor) return false
  const foregroundChroma = Math.max(...foregroundColor.channels) - Math.min(...foregroundColor.channels)
  const candidateChroma = Math.max(...candidateColor.channels) - Math.min(...candidateColor.channels)
  return candidateChroma <= Math.max(48, foregroundChroma + 24)
}

function auditForegroundPairOrder(first, second) {
  const firstMainRoleBreadth = Number(first.textRoles.includes('body')) + Number(first.textRoles.includes('heading'))
  const secondMainRoleBreadth = Number(second.textRoles.includes('body')) + Number(second.textRoles.includes('heading'))
  return (
    second.mainTextPageCount - first.mainTextPageCount ||
    second.headingPageCount - first.headingPageCount ||
    second.normalizedMainTextShare - first.normalizedMainTextShare ||
    second.pageCount - first.pageCount ||
    second.normalizedShare - first.normalizedShare ||
    secondMainRoleBreadth - firstMainRoleBreadth ||
    second.contrastRatio - first.contrastRatio
  )
}

function auditMutedForegroundPairOrder(first, second) {
  return (
    second.pageCount - first.pageCount ||
    second.normalizedShare - first.normalizedShare ||
    second.textRoles.length - first.textRoles.length ||
    first.contrastRatio - second.contrastRatio
  )
}

function validatedForegroundPair(value, background, pair, pageRefs, label, hardFailures, canonicalCaptureByRoute) {
  if (!isObject(pair)) return null
  const normalizedBackground = normalizedCandidateColor(background)
  const pairedBackground = normalizedCandidateColor(pair.background)
  let valid = true
  if (!normalizedBackground || pairedBackground !== normalizedBackground) {
    hardFailures.push(`${label}-background-mismatch`)
    valid = false
  }
  const pageCount = pair.pageCount
  const eligiblePageCount = pair.eligiblePageCount
  const pageSupportRatio = pair.pageSupportRatio
  const normalizedShare = pair.normalizedShare
  const normalizedMainTextShare = pair.normalizedMainTextShare
  const ownerCount = pair.ownerCount
  const minimumPageOwnerCount = pair.minimumPageOwnerCount
  const mainTextPageCount = pair.mainTextPageCount
  const mainTextOwnerCount = pair.mainTextOwnerCount
  const headingPageCount = pair.headingPageCount
  const headingOwnerCount = pair.headingOwnerCount
  const contrastRatio = pair.contrastRatio
  const routeSupport = Array.isArray(pair.routeSupport) ? pair.routeSupport : []
  const auditedRouteTextRoles = new Set()
  let auditedSupportedPages = 0
  let auditedOwnerCount = 0
  let auditedMinimumPageOwnerCount = Number.POSITIVE_INFINITY
  let auditedMainTextPageCount = 0
  let auditedMainTextOwnerCount = 0
  let auditedHeadingPageCount = 0
  let auditedHeadingOwnerCount = 0
  let auditedNormalizedShare = 0
  let auditedNormalizedMainTextShare = 0
  const auditedRouteIds = new Set()
  const auditedSupportedRouteIds = new Set()
  let invalidRouteSupport = routeSupport.length !== eligiblePageCount
  for (const route of routeSupport) {
    const page = typeof route?.page === 'string' ? route.page : ''
    const routeId = typeof route?.routeId === 'string' ? route.routeId : ''
    const canonicalCapture = canonicalCaptureByRoute?.get(routeId)
    const arrays = ['ownerIds', 'totalOwnerIds', 'mainTextOwnerIds', 'headingOwnerIds']
    const validArrays = arrays.every((key) => Array.isArray(route?.[key]))
    if (
      !page ||
      !/^route-[0-9a-f]{12}$/.test(routeId) ||
      auditedRouteIds.has(routeId) ||
      !validArrays ||
      typeof route?.supported !== 'boolean'
    ) {
      invalidRouteSupport = true
      continue
    }
    if (canonicalCaptureByRoute && (!canonicalCapture || canonicalCapture.page !== page)) {
      invalidRouteSupport = true
    }
    auditedRouteIds.add(routeId)
    const ownerIds = new Set(route.ownerIds)
    const totalOwnerIds = new Set(route.totalOwnerIds)
    const mainTextOwnerIds = new Set(route.mainTextOwnerIds)
    const headingOwnerIds = new Set(route.headingOwnerIds)
    if (
      [...ownerIds, ...totalOwnerIds, ...mainTextOwnerIds, ...headingOwnerIds].some(
        (id) => typeof id !== 'string' || !id,
      ) ||
      ownerIds.size !== route.ownerIds.length ||
      totalOwnerIds.size !== route.totalOwnerIds.length ||
      mainTextOwnerIds.size !== route.mainTextOwnerIds.length ||
      headingOwnerIds.size !== route.headingOwnerIds.length ||
      [...ownerIds].some((id) => !totalOwnerIds.has(id)) ||
      [...mainTextOwnerIds].some((id) => !ownerIds.has(id)) ||
      [...headingOwnerIds].some((id) => !mainTextOwnerIds.has(id)) ||
      route.supported !== ownerIds.size > 0 ||
      (route.supported && totalOwnerIds.size === 0) ||
      !finite(route.normalizedShare) ||
      !finite(route.normalizedMainTextShare)
    ) {
      invalidRouteSupport = true
      continue
    }
    const expectedShare = totalOwnerIds.size > 0 ? ownerIds.size / totalOwnerIds.size : 0
    const expectedMainShare = totalOwnerIds.size > 0 ? mainTextOwnerIds.size / totalOwnerIds.size : 0
    if (
      Math.abs(route.normalizedShare - expectedShare) > 0.0015 ||
      Math.abs(route.normalizedMainTextShare - expectedMainShare) > 0.0015 ||
      (route.supported && route.normalizedShare <= 0)
    ) {
      invalidRouteSupport = true
    }
    const routeRoles = Array.isArray(route.textRoles)
      ? route.textRoles.filter((role) => ['body', 'heading', 'label', 'other'].includes(role))
      : []
    if (!Array.isArray(route.textRoles) || routeRoles.length !== route.textRoles.length) invalidRouteSupport = true
    routeRoles.forEach((role) => auditedRouteTextRoles.add(role))
    if (!route.supported) continue
    auditedSupportedRouteIds.add(routeId)
    auditedSupportedPages += 1
    auditedOwnerCount += ownerIds.size
    auditedMinimumPageOwnerCount = Math.min(auditedMinimumPageOwnerCount, ownerIds.size)
    auditedNormalizedShare += expectedShare
    auditedNormalizedMainTextShare += expectedMainShare
    if (mainTextOwnerIds.size > 0) auditedMainTextPageCount += 1
    auditedMainTextOwnerCount += mainTextOwnerIds.size
    if (headingOwnerIds.size > 0) auditedHeadingPageCount += 1
    auditedHeadingOwnerCount += headingOwnerIds.size
  }
  const auditedShare = eligiblePageCount > 0 ? auditedNormalizedShare / eligiblePageCount : 0
  const auditedMainShare = eligiblePageCount > 0 ? auditedNormalizedMainTextShare / eligiblePageCount : 0
  const claimedRouteIds = sortedStrings(pageRefs)
  if (
    invalidRouteSupport ||
    stableJson([...auditedSupportedRouteIds].sort()) !== stableJson(claimedRouteIds) ||
    auditedSupportedPages !== pageCount ||
    auditedOwnerCount !== ownerCount ||
    (auditedSupportedPages > 0 ? auditedMinimumPageOwnerCount : 0) !== minimumPageOwnerCount ||
    auditedMainTextPageCount !== mainTextPageCount ||
    auditedMainTextOwnerCount !== mainTextOwnerCount ||
    auditedHeadingPageCount !== headingPageCount ||
    auditedHeadingOwnerCount !== headingOwnerCount ||
    Math.abs(auditedShare - normalizedShare) > 0.0015 ||
    Math.abs(auditedMainShare - normalizedMainTextShare) > 0.0015
  ) {
    hardFailures.push(`${label}-route-support-mismatch`)
    valid = false
  }
  if (
    !Number.isInteger(pageCount) ||
    pageCount <= 0 ||
    !Number.isInteger(eligiblePageCount) ||
    eligiblePageCount <= 0 ||
    pageCount > eligiblePageCount
  ) {
    hardFailures.push(`${label}-invalid-counts`)
    valid = false
  }
  if (
    !Number.isInteger(headingPageCount) ||
    headingPageCount < 0 ||
    headingPageCount > mainTextPageCount ||
    !Number.isInteger(headingOwnerCount) ||
    headingOwnerCount < 0 ||
    headingOwnerCount > mainTextOwnerCount ||
    (headingPageCount === 0) !== (headingOwnerCount === 0)
  ) {
    hardFailures.push(`${label}-invalid-heading-support`)
    valid = false
  }
  if (
    !finite(normalizedMainTextShare) ||
    normalizedMainTextShare < 0 ||
    normalizedMainTextShare > normalizedShare + 0.0015 ||
    !Number.isInteger(mainTextPageCount) ||
    mainTextPageCount < 0 ||
    mainTextPageCount > pageCount ||
    !Number.isInteger(mainTextOwnerCount) ||
    mainTextOwnerCount < 0 ||
    mainTextOwnerCount > ownerCount ||
    (mainTextPageCount === 0) !== (mainTextOwnerCount === 0)
  ) {
    hardFailures.push(`${label}-invalid-main-text-support`)
    valid = false
  }
  if (
    !Number.isInteger(ownerCount) ||
    ownerCount <= 0 ||
    !Number.isInteger(minimumPageOwnerCount) ||
    minimumPageOwnerCount <= 0 ||
    (Number.isInteger(pageCount) && ownerCount < pageCount) ||
    minimumPageOwnerCount > ownerCount
  ) {
    hardFailures.push(`${label}-invalid-owner-support`)
    valid = false
  }
  const expectedSupport =
    Number.isInteger(pageCount) && Number.isInteger(eligiblePageCount) && eligiblePageCount > 0
      ? pageCount / eligiblePageCount
      : null
  if (
    !finite(pageSupportRatio) ||
    pageSupportRatio < 0 ||
    pageSupportRatio > 1 ||
    expectedSupport === null ||
    Math.abs(pageSupportRatio - expectedSupport) > 0.0015
  ) {
    hardFailures.push(`${label}-support-mismatch`)
    valid = false
  }
  if (
    !finite(normalizedShare) ||
    normalizedShare < 0 ||
    normalizedShare > 1 ||
    (finite(pageSupportRatio) && normalizedShare > pageSupportRatio + 0.0015)
  ) {
    hardFailures.push(`${label}-invalid-normalized-share`)
    valid = false
  }
  const computedContrast = auditColorContrast(value, background)
  if (computedContrast === null || !finite(contrastRatio) || Math.abs(contrastRatio - computedContrast) > 0.02) {
    hardFailures.push(`${label}-contrast-mismatch`)
    valid = false
  }
  const textRoles = Array.isArray(pair.textRoles)
    ? pair.textRoles.filter((role) => ['body', 'heading', 'label', 'other'].includes(role))
    : []
  if (!Array.isArray(pair.textRoles) || textRoles.length !== pair.textRoles.length) {
    hardFailures.push(`${label}-invalid-text-roles`)
    valid = false
  }
  if (stableJson([...auditedRouteTextRoles].sort()) !== stableJson([...textRoles].sort())) {
    hardFailures.push(`${label}-route-text-roles-mismatch`)
    valid = false
  }
  const hasMainTextRole = textRoles.some((role) => role === 'body' || role === 'heading')
  if (hasMainTextRole !== mainTextPageCount > 0) {
    hardFailures.push(`${label}-main-text-role-support-mismatch`)
    valid = false
  }
  if (textRoles.includes('heading') !== headingPageCount > 0) {
    hardFailures.push(`${label}-heading-role-support-mismatch`)
    valid = false
  }
  if (!valid) return null
  return {
    pageCount,
    eligiblePageCount,
    pageSupportRatio,
    normalizedShare,
    normalizedMainTextShare,
    ownerCount,
    minimumPageOwnerCount,
    mainTextPageCount,
    mainTextOwnerCount,
    headingPageCount,
    headingOwnerCount,
    contrastRatio: computedContrast,
    textRoles,
  }
}

function auditFoundationForegroundPair(pair) {
  if (!pair || pair.contrastRatio < 4.5) return false
  if (pair.eligiblePageCount <= 1) {
    return pair.pageCount === 1 && pair.normalizedShare > 0 && pair.ownerCount >= 2
  }
  return (
    pair.pageCount >= 2 &&
    pair.pageSupportRatio >= 0.5 &&
    pair.ownerCount >= pair.pageCount &&
    pair.minimumPageOwnerCount >= 1
  )
}

function auditPrimaryForegroundPair(pair) {
  if (!auditFoundationForegroundPair(pair)) return false
  if (pair.eligiblePageCount <= 1) return pair.mainTextPageCount === 1 && pair.mainTextOwnerCount >= 2
  return pair.mainTextPageCount >= 2 && pair.mainTextPageCount / pair.eligiblePageCount >= 0.5
}

function validatePortableGeometryEvidence(evidencePath, value, item, hardFailures) {
  if (!evidencePath.startsWith('spacing.') && !evidencePath.startsWith('radii.')) return
  const foundationOwnerCount = item.foundationOwnerCount
  const minimumPageFoundationOwnerCount = item.minimumPageFoundationOwnerCount
  if (
    !Number.isInteger(foundationOwnerCount) ||
    foundationOwnerCount <= 0 ||
    !Number.isInteger(minimumPageFoundationOwnerCount) ||
    minimumPageFoundationOwnerCount < 0 ||
    !Number.isInteger(item.pageCount) ||
    foundationOwnerCount < minimumPageFoundationOwnerCount * item.pageCount
  ) {
    hardFailures.push(`portable-geometry-owner-support-invalid:${evidencePath}`)
    return
  }
  const pixels = auditDimensionPixels(value)
  if (evidencePath.startsWith('spacing.')) {
    if (pixels !== null && pixels <= 0) hardFailures.push(`non-positive-portable-spacing:${evidencePath}`)
    if (
      pixels !== null &&
      pixels > 96 &&
      (Math.abs(pixels - Math.round(pixels)) > 0.01 || minimumPageFoundationOwnerCount < 2)
    ) {
      hardFailures.push(`large-spacing-route-owner-support-insufficient:${evidencePath}`)
    }
    return
  }
  const sourceCounts = isObject(item.sourceCounts) ? item.sourceCounts : {}
  if (Number(sourceCounts['geometry:circle-or-pill'] || 0) > Number(sourceCounts['computed:ordinary-radius'] || 0)) {
    hardFailures.push(`pill-geometry-promoted-as-radius:${evidencePath}`)
  }
  if (pixels !== null && pixels > 96 && minimumPageFoundationOwnerCount < 2) {
    hardFailures.push(`extreme-radius-route-owner-support-insufficient:${evidencePath}`)
  }
}

function validateFoundationForeground(tokens, hardFailures) {
  const background = tokens?.colors?.background
  const foreground = tokens?.colors?.foreground
  if (typeof background !== 'string' || typeof foreground !== 'string') return
  const foundationSurfaces = new Set(
    ['background', 'surface', 'secondary']
      .map((role) => normalizedCandidateColor(tokens?.colors?.[role]))
      .filter(Boolean),
  )
  const pairedFoundationBackground = (pair, label) => {
    const pairedBackground = normalizedCandidateColor(pair?.background)
    if (!pairedBackground || !foundationSurfaces.has(pairedBackground)) {
      hardFailures.push(`${label}-background-mismatch`)
    }
    return typeof pair?.background === 'string' ? pair.background : background
  }

  const evidence = tokens?.evidence?.['colors.foreground']
  const hasPairMarker =
    isObject(evidence) && Array.isArray(evidence.reasons) && evidence.reasons.includes('paired-surface')
  if (!isObject(evidence?.pairedSurface)) {
    if (hasPairMarker) hardFailures.push('foundation-foreground-pair-marker-mismatch')
    return
  }
  if (
    !hasPairMarker ||
    !Array.isArray(evidence.sources) ||
    !evidence.sources.includes('observed:text-background-pair')
  ) {
    hardFailures.push('foundation-foreground-pair-marker-mismatch')
  }
  const selectedBackground = pairedFoundationBackground(evidence.pairedSurface, 'foundation-foreground-pair')
  const selectedPair = validatedForegroundPair(
    foreground,
    selectedBackground,
    evidence.pairedSurface,
    evidence.pageRefs,
    'foundation-foreground-pair',
    hardFailures,
  )
  if (!selectedPair) return
  const selectedContrast = auditColorContrast(foreground, selectedBackground)
  if (selectedContrast !== null && selectedContrast < 4.5) {
    hardFailures.push('foundation-foreground-background-low-contrast')
  }
  const globalContrast = auditColorContrast(foreground, background)
  if (globalContrast === null || globalContrast < 4.5) {
    hardFailures.push('foundation-foreground-global-background-low-contrast')
  }
  if (
    !finite(evidence.ownerCount) ||
    !finite(evidence.pageCount) ||
    selectedPair.mainTextOwnerCount > evidence.ownerCount ||
    selectedPair.mainTextPageCount > evidence.pageCount
  ) {
    hardFailures.push('foundation-foreground-pair-owner-evidence-mismatch')
  }
  const selectedQualifies = auditPrimaryForegroundPair(selectedPair)
  if (!selectedQualifies) hardFailures.push('foundation-foreground-pair-insufficient-support')

  for (const candidate of Array.isArray(tokens?.candidates?.values) ? tokens.candidates.values : []) {
    if (
      candidate?.group !== 'colors' ||
      candidate?.role !== 'foreground' ||
      !isObject(candidate?.evidence?.pairedSurface)
    ) {
      continue
    }
    const id = candidate.id || candidate.value || 'unknown'
    const candidateBackground = pairedFoundationBackground(
      candidate.evidence.pairedSurface,
      `candidate-foreground-pair:${id}`,
    )
    const candidatePair = validatedForegroundPair(
      candidate.value,
      candidateBackground,
      candidate.evidence.pairedSurface,
      candidate.evidence.pageRefs,
      `candidate-foreground-pair:${id}`,
      hardFailures,
    )
    if (!candidatePair || (candidate.evidence.semanticConfidence || candidate.evidence.confidence) === 'low') continue
    if (
      !finite(candidate.evidence.ownerCount) ||
      !finite(candidate.evidence.pageCount) ||
      candidatePair.mainTextOwnerCount > candidate.evidence.ownerCount ||
      candidatePair.mainTextPageCount > candidate.evidence.pageCount
    ) {
      hardFailures.push(`candidate-foreground-pair-owner-evidence-mismatch:${id}`)
      continue
    }
    const candidateQualifies = auditPrimaryForegroundPair(candidatePair)
    if (!candidateQualifies) continue
    const rank = auditForegroundPairOrder(candidatePair, selectedPair)
    if (rank < 0 || (rank === 0 && String(candidate.value).localeCompare(String(foreground)) < 0)) {
      hardFailures.push(`foundation-foreground-pair-dominated:${id}`)
    }
  }

  const mutedForeground = tokens?.colors?.['muted-foreground']
  if (typeof mutedForeground !== 'string') return
  const mutedEvidence = tokens?.evidence?.['colors.muted-foreground']
  if (!isObject(mutedEvidence?.pairedSurface)) {
    hardFailures.push('foundation-muted-foreground-missing-pair')
    return
  }
  if (
    !Array.isArray(mutedEvidence.reasons) ||
    !mutedEvidence.reasons.includes('paired-surface') ||
    !Array.isArray(mutedEvidence.sources) ||
    !mutedEvidence.sources.includes('observed:text-background-pair')
  ) {
    hardFailures.push('foundation-muted-foreground-pair-marker-mismatch')
  }
  const selectedMutedPair = validatedForegroundPair(
    mutedForeground,
    selectedBackground,
    mutedEvidence.pairedSurface,
    mutedEvidence.pageRefs,
    'foundation-muted-foreground-pair',
    hardFailures,
  )
  if (!selectedMutedPair) return
  const globalMutedContrast = auditColorContrast(mutedForeground, background)
  if (globalMutedContrast === null || globalMutedContrast < 4.5) {
    hardFailures.push('foundation-muted-foreground-global-background-low-contrast')
  }
  if (
    !finite(mutedEvidence.ownerCount) ||
    !finite(mutedEvidence.pageCount) ||
    selectedMutedPair.mainTextOwnerCount > mutedEvidence.ownerCount ||
    selectedMutedPair.mainTextPageCount > mutedEvidence.pageCount
  ) {
    hardFailures.push('foundation-muted-foreground-pair-owner-evidence-mismatch')
  }
  const selectedMutedQualifies =
    auditFoundationForegroundPair(selectedMutedPair) &&
    selectedMutedPair.contrastRatio <= selectedPair.contrastRatio - 0.5 &&
    selectedMutedPair.contrastRatio >= 4.5 &&
    auditFoundationMutedTone(foreground, mutedForeground)
  if (!selectedMutedQualifies) hardFailures.push('foundation-muted-foreground-pair-invalid-hierarchy')

  const occupiedMutedValues = new Set(
    Object.entries(tokens?.colors || {}).flatMap(([role, value]) =>
      role === 'muted-foreground' ? [] : [normalizedCandidateColor(value)],
    ),
  )
  for (const candidate of Array.isArray(tokens?.candidates?.values) ? tokens.candidates.values : []) {
    if (
      candidate?.group !== 'colors' ||
      candidate?.role !== 'foreground' ||
      !isObject(candidate?.evidence?.pairedSurface)
    ) {
      continue
    }
    if (occupiedMutedValues.has(normalizedCandidateColor(candidate.value))) continue
    const id = candidate.id || candidate.value || 'unknown'
    if (
      normalizedCandidateColor(candidate.evidence.pairedSurface.background) !==
      normalizedCandidateColor(selectedBackground)
    ) {
      continue
    }
    const candidatePair = validatedForegroundPair(
      candidate.value,
      selectedBackground,
      candidate.evidence.pairedSurface,
      candidate.evidence.pageRefs,
      `candidate-muted-foreground-pair:${id}`,
      hardFailures,
    )
    if (!candidatePair || (candidate.evidence.semanticConfidence || candidate.evidence.confidence) === 'low') continue
    if (
      !finite(candidate.evidence.ownerCount) ||
      !finite(candidate.evidence.pageCount) ||
      candidatePair.mainTextOwnerCount > candidate.evidence.ownerCount ||
      candidatePair.mainTextPageCount > candidate.evidence.pageCount
    ) {
      hardFailures.push(`candidate-muted-foreground-pair-owner-evidence-mismatch:${id}`)
      continue
    }
    const candidateQualifies =
      auditFoundationForegroundPair(candidatePair) &&
      candidatePair.contrastRatio <= selectedPair.contrastRatio - 0.5 &&
      candidatePair.contrastRatio >= 4.5 &&
      auditFoundationMutedTone(foreground, candidate.value)
    if (!candidateQualifies) continue
    const rank = auditMutedForegroundPairOrder(candidatePair, selectedMutedPair)
    if (rank < 0 || (rank === 0 && String(candidate.value).localeCompare(String(mutedForeground)) < 0)) {
      hardFailures.push(`foundation-muted-foreground-pair-dominated:${id}`)
    }
  }
}

function validateDarkFoundationForeground(baseTokens, darkTokens, darkEvidence, darkCandidates, hardFailures) {
  if (!isObject(darkTokens)) return
  const effectiveTokens = {
    ...darkTokens,
    colors: { ...(baseTokens?.colors || {}), ...(darkTokens.colors || {}) },
    evidence: { ...(baseTokens?.evidence || {}), ...(isObject(darkEvidence) ? darkEvidence : {}) },
    candidates: { values: Array.isArray(darkCandidates) ? darkCandidates : [] },
  }
  validateFoundationForeground(effectiveTokens, hardFailures)

  const foundationSurfaces = new Set(
    ['background', 'surface', 'secondary']
      .map((role) => normalizedCandidateColor(effectiveTokens.colors[role]))
      .filter(Boolean),
  )
  for (const role of ['foreground', 'muted-foreground']) {
    const value = darkTokens.colors?.[role]
    if (typeof value !== 'string' || value === baseTokens?.colors?.[role]) continue
    const pairedBackground = normalizedCandidateColor(darkEvidence?.[`colors.${role}`]?.pairedSurface?.background)
    if (!pairedBackground || !foundationSurfaces.has(pairedBackground)) {
      hardFailures.push(`dark-${role}-pair-background-not-effective`)
    }
  }
  for (const surfaceRole of ['background', 'surface', 'secondary']) {
    const surface = darkTokens.colors?.[surfaceRole]
    if (typeof surface !== 'string' || surface === baseTokens?.colors?.[surfaceRole]) continue
    const hasReadablePair = ['foreground', 'muted-foreground'].some((foregroundRole) => {
      const foreground = darkTokens.colors?.[foregroundRole]
      const evidence = darkEvidence?.[`colors.${foregroundRole}`]
      if (
        typeof foreground !== 'string' ||
        !isObject(evidence?.pairedSurface) ||
        normalizedCandidateColor(evidence.pairedSurface.background) !== normalizedCandidateColor(surface)
      ) {
        return false
      }
      const pairFailures = []
      const pair = validatedForegroundPair(
        foreground,
        surface,
        evidence.pairedSurface,
        evidence.pageRefs,
        `dark-${surfaceRole}-${foregroundRole}-pair`,
        pairFailures,
      )
      const supported =
        foregroundRole === 'foreground' ? auditPrimaryForegroundPair(pair) : auditFoundationForegroundPair(pair)
      return pairFailures.length === 0 && supported && (auditColorContrast(foreground, surface) || 0) >= 4.5
    })
    if (!hasReadablePair) hardFailures.push(`dark-${surfaceRole}-missing-readable-foreground-pair`)
  }
}

function auditNeutralBorderColor(value) {
  const color = parsedAuditColor(value)
  if (!color || color.alpha < 0.999) return false
  const maximum = Math.max(...color.channels)
  const minimum = Math.min(...color.channels)
  const chroma = maximum - minimum
  return chroma <= 24 || chroma / Math.max(1, maximum) <= 0.12
}

function auditHasStructuralBorderEvidence(evidence) {
  return Boolean(
    isObject(evidence) &&
    ((Array.isArray(evidence.sources) && evidence.sources.includes('usage:structuralBorderColor')) ||
      Number(evidence.roleCounts?.structuralBorderColor || 0) > 0),
  )
}

function validateFoundationBorderRoles(tokens, hardFailures) {
  const colors = isObject(tokens?.colors) ? tokens.colors : {}
  const surfaceValues = new Set(
    ['background', 'surface', 'secondary'].flatMap((role) => {
      const value = colors[role]
      const normalized = typeof value === 'string' ? normalizedCandidateColor(value) : null
      return normalized ? [normalized] : []
    }),
  )
  const defaultBorder = typeof colors.border === 'string' ? normalizedCandidateColor(colors.border) : null
  for (const role of ['border', 'border-subtle']) {
    const value = colors[role]
    if (typeof value !== 'string') continue
    const normalized = normalizedCandidateColor(value)
    if (!normalized) continue
    const evidence = tokens?.evidence?.[`colors.${role}`]
    const neutral = auditNeutralBorderColor(value)
    const structural = auditHasStructuralBorderEvidence(evidence)
    if (surfaceValues.has(normalized)) {
      hardFailures.push(`foundation-${role}-matches-foundation-surface`)
    }
    if (role === 'border-subtle') {
      if (defaultBorder === normalized) hardFailures.push('foundation-border-subtle-matches-border')
      if (!neutral) hardFailures.push('foundation-border-subtle-nonneutral')
      if (!structural) hardFailures.push('foundation-border-subtle-missing-structural-evidence')
    } else if (!neutral && !structural) {
      hardFailures.push('foundation-border-missing-semantic-support')
    }
  }
}

const RENDERED_COLOR_USAGE_CATEGORIES = [
  'primaryActionBackgroundColor',
  'primaryActionForegroundColor',
  'primaryActionColor',
  'actionBackgroundColor',
  'actionForegroundColor',
  'actionColor',
  'destructiveActionBackgroundColor',
  'destructiveActionForegroundColor',
  'selectedColor',
  'accentColor',
  'linkColor',
  'statusBackgroundColor',
  'statusForegroundColor',
  'statusColor',
  'bgColor',
  'bgArea',
  'textColor',
  'borderColor',
  'structuralBorderColor',
]
const OBSERVED_COLOR_USAGE_CATEGORIES = RENDERED_COLOR_USAGE_CATEGORIES.filter((category) => category !== 'bgArea')

function colorUsageCount(tokens, category, value) {
  const normalized = normalizedCandidateColor(value)
  if (!normalized) return 0
  const prefix = `${category}:`
  return Object.entries(tokens?.usageCount || {}).reduce((total, [key, count]) => {
    if (!key.startsWith(prefix) || !finite(count)) return total
    return normalizedCandidateColor(key.slice(prefix.length)) === normalized ? total + count : total
  }, 0)
}

function isAuditDeclaredOnlyColor(tokens, value) {
  const rendered = RENDERED_COLOR_USAGE_CATEGORIES.reduce(
    (total, category) => total + colorUsageCount(tokens, category, value),
    0,
  )
  if (rendered > 0) return false
  return colorUsageCount(tokens, 'declaredColor', value) + colorUsageCount(tokens, 'brandTokenColor', value) > 0
}

function isAuditPortableColor(tokens, name, value) {
  return !isAuditDeclaredOnlyColor(tokens, value) && !/^(?:dark-)?palette-\d+$/.test(name)
}

function observedAuditColorUsageCount(tokens, value) {
  return OBSERVED_COLOR_USAGE_CATEGORIES.reduce(
    (total, category) => total + colorUsageCount(tokens, category, value),
    0,
  )
}

function expectedCandidateProjection(tokens) {
  const portableColors = new Set(
    Object.entries(tokens?.colors || {}).flatMap(([name, value]) => {
      const normalized = normalizedCandidateColor(value)
      return normalized && isAuditPortableColor(tokens, name, value) ? [normalized] : []
    }),
  )
  const colors = new Map()
  const addColor = (candidate) => {
    const normalized = normalizedCandidateColor(candidate?.value)
    if (!normalized || portableColors.has(normalized)) return
    const kind = candidate?.kind
    if (!['declared-only', 'observed-unassigned'].includes(kind)) return
    const key = `${kind}:${normalized}`
    const existing = colors.get(key)
    colors.set(key, {
      kind,
      value: normalized,
      observationCount: Math.max(Number(existing?.observationCount || 0), Number(candidate?.observationCount || 0)),
      pageCount: Math.max(Number(existing?.pageCount || 0), Number(candidate?.pageCount || 0)),
    })
  }
  if (Array.isArray(tokens?.candidates?.values)) {
    for (const candidate of tokens.candidates.values) {
      if (candidate?.group !== 'colors') continue
      addColor({
        kind:
          candidate?.rejectionReason === 'declared-only' || candidate?.provenance === 'declared-color'
            ? 'declared-only'
            : 'observed-unassigned',
        value: candidate?.value,
        observationCount: candidate?.evidence?.observationCount,
        pageCount: candidate?.evidence?.pageCount,
      })
    }
  } else {
    for (const candidate of Array.isArray(tokens?.candidates?.colors) ? tokens.candidates.colors : []) {
      addColor(candidate)
    }
  }
  for (const [name, value] of Object.entries(tokens?.colors || {})) {
    const evidence = tokens?.evidence?.[`colors.${name}`]
    if (isAuditDeclaredOnlyColor(tokens, value)) {
      addColor({
        kind: 'declared-only',
        value,
        observationCount: evidence?.observationCount || colorUsageCount(tokens, 'declaredColor', value),
        pageCount: evidence?.pageCount,
      })
    } else if (!isAuditPortableColor(tokens, name, value)) {
      addColor({
        kind: 'observed-unassigned',
        value,
        observationCount: evidence?.observationCount || observedAuditColorUsageCount(tokens, value),
        pageCount: evidence?.pageCount,
      })
    }
  }
  const orderedColors = [...colors.values()].sort(
    (first, second) =>
      first.kind.localeCompare(second.kind) ||
      second.observationCount - first.observationCount ||
      first.value.localeCompare(second.value),
  )
  const colorPreview = (kind) =>
    orderedColors
      .filter((candidate) => candidate.kind === kind)
      .slice(0, CANDIDATE_PREVIEW_LIMIT)
      .map((candidate) => ({ value: candidate.value, pageCount: candidate.pageCount || 0 }))
  const valueCandidates = (Array.isArray(tokens?.candidates?.values) ? tokens.candidates.values : []).filter(
    (candidate) => candidate?.group !== 'colors' || Boolean(candidate?.role),
  )
  return {
    declaredColors: {
      total: orderedColors.filter((candidate) => candidate.kind === 'declared-only').length,
      preview: colorPreview('declared-only'),
    },
    observedUnassignedColors: {
      total: orderedColors.filter((candidate) => candidate.kind === 'observed-unassigned').length,
      preview: colorPreview('observed-unassigned'),
    },
    tokenValues: {
      total: valueCandidates.length,
      preview: valueCandidates.slice(0, CANDIDATE_PREVIEW_LIMIT).map((candidate) => ({
        value: candidate?.value,
        pageCount: candidate?.evidence?.pageCount,
      })),
    },
  }
}

function validateCandidateProjection(extension, tokens, hardFailures) {
  if (!isObject(tokens)) return
  const expected = expectedCandidateProjection(tokens)
  const candidates = isObject(extension?.candidates) ? extension.candidates : {}
  const summary = isObject(extension?.candidateSummary) ? extension.candidateSummary : {}
  for (const kind of ['declaredColors', 'observedUnassignedColors', 'tokenValues']) {
    const group = expected[kind]
    const actualPreview = Array.isArray(candidates[kind]) ? candidates[kind] : []
    if (stableJson(actualPreview) !== stableJson(group.preview)) {
      hardFailures.push(`candidate-preview-catalog-mismatch:${kind}`)
    }
    const expectedSummary =
      group.total > 0
        ? {
            total: group.total,
            included: group.preview.length,
            omitted: Math.max(0, group.total - group.preview.length),
          }
        : undefined
    const actualSummary = isObject(summary[kind]) ? summary[kind] : undefined
    if (stableJson(actualSummary) !== stableJson(expectedSummary)) {
      hardFailures.push(`candidate-summary-catalog-mismatch:${kind}`)
    }
  }
  const expectedKinds = new Set(Object.entries(expected).flatMap(([kind, group]) => (group.total > 0 ? [kind] : [])))
  for (const kind of Object.keys(candidates)) {
    if (!expectedKinds.has(kind)) hardFailures.push(`unexpected-candidate-preview-kind:${kind}`)
  }
  const hasCandidates = expectedKinds.size > 0
  if (hasCandidates) {
    if (summary.previewLimitPerKind !== CANDIDATE_PREVIEW_LIMIT) {
      hardFailures.push('candidate-summary-preview-limit-mismatch')
    }
    if (summary.fullEvidenceArtifact !== 'tokens-json') {
      hardFailures.push('candidate-summary-artifact-mismatch')
    }
  } else if (extension?.candidateSummary !== undefined || extension?.candidates !== undefined) {
    hardFailures.push('unexpected-candidate-preview')
  }
}

function duplicateValues(values) {
  const counts = new Map()
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value)
}

function unique(values) {
  return [...new Set(values)]
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sortedStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string'))].sort()
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function evidencePageRouteIdentity(page) {
  return typeof page?.routeId === 'string' && page.routeId ? page.routeId : String(page?.url || '')
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function tokenCatalog(tokens) {
  const result = new Map()
  if (!isObject(tokens)) return result
  for (const [name, value] of Object.entries(tokens.colors || {})) result.set(`color.${name}`, String(value))
  const arrays = [
    ['typography.font-family', tokens.typography?.fontFamilies],
    ['typography.font-stack', tokens.typography?.fontStacks],
    ['typography.font-size', tokens.typography?.fontSizes],
    ['typography.font-weight', tokens.typography?.fontWeights],
    ['typography.line-height', tokens.typography?.lineHeights],
    ['typography.letter-spacing', tokens.typography?.letterSpacings],
    ['spacing', tokens.spacing],
    ['radius', tokens.radii],
    ['shadow', tokens.shadows],
    ['border', tokens.borders],
    ['z-index', tokens.zIndices],
    ['transition', tokens.transitions],
  ]
  for (const [prefix, values] of arrays) {
    if (!Array.isArray(values)) continue
    values.forEach((value, index) => result.set(`${prefix}.${index + 1}`, String(value)))
  }
  return result
}

function tokenEvidencePaths(tokens) {
  const result = new Map()
  for (const [name, value] of Object.entries(tokens?.colors || {})) result.set(`colors.${name}`, String(value))
  const arrays = [
    ['typography.fontFamilies', tokens?.typography?.fontFamilies],
    ['typography.fontStacks', tokens?.typography?.fontStacks],
    ['typography.fontSizes', tokens?.typography?.fontSizes],
    ['typography.fontWeights', tokens?.typography?.fontWeights],
    ['typography.lineHeights', tokens?.typography?.lineHeights],
    ['typography.letterSpacings', tokens?.typography?.letterSpacings],
    ['spacing', tokens?.spacing],
    ['radii', tokens?.radii],
    ['shadows', tokens?.shadows],
    ['borders', tokens?.borders],
    ['zIndices', tokens?.zIndices],
    ['transitions', tokens?.transitions],
  ]
  for (const [prefix, values] of arrays) {
    if (!Array.isArray(values)) continue
    values.forEach((value, index) => result.set(`${prefix}.${index}`, String(value)))
  }
  return result
}

function renderedTextOwnerSupports(evidencePath, value, owner, pairedBackground) {
  if (!isObject(owner) || !isObject(owner.styles) || !auditValidTextStyleSource(owner.source)) return false
  if (typeof owner.page !== 'string' || !owner.page || typeof owner.viewport !== 'string' || !owner.viewport)
    return false
  if (typeof owner.ownerId !== 'string' || !owner.ownerId) return false
  if (owner.source.glyphPaintKind === 'background-clip' && owner.styles.color !== undefined) return false
  if (evidencePath === 'typography.fontFamilies') {
    return normalizedPrimaryFontFamily(owner.styles.fontFamily) === normalizedPrimaryFontFamily(value)
  }
  if (evidencePath === 'typography.fontStacks') {
    return normalizedFontStack(owner.styles.fontFamily) === normalizedFontStack(value)
  }
  if (evidencePath === 'typography.fontSizes') {
    const pixels = (input) => {
      const match = String(input || '')
        .trim()
        .match(/^(-?\d*\.?\d+)(px|rem)$/i)
      if (!match) return null
      const amount = Number.parseFloat(match[1])
      return match[2].toLowerCase() === 'rem' ? amount * 16 : amount
    }
    const ownerPixels = pixels(owner.styles.fontSize)
    const valuePixels = pixels(value)
    return ownerPixels !== null && valuePixels !== null && Math.abs(ownerPixels - valuePixels) < 0.01
  }
  if (evidencePath === 'typography.fontWeights') return String(owner.styles.fontWeight) === String(value)
  if (evidencePath === 'typography.lineHeights') {
    const fontSize = Number.parseFloat(owner.styles.fontSize)
    const lineHeight = Number.parseFloat(owner.styles.lineHeight)
    const ratio = fontSize > 0 && lineHeight > 0 ? lineHeight / fontSize : NaN
    return owner.styles.lineHeight === value || (finite(ratio) && Math.abs(ratio - Number.parseFloat(value)) < 0.001)
  }
  if (evidencePath === 'typography.letterSpacings') return owner.styles.letterSpacing === value
  if (evidencePath.startsWith('colors.')) {
    return (
      auditColorsEqual(owner.styles.color, value) &&
      auditColorsEqual(owner.source.foreground, value) &&
      (pairedBackground === undefined || auditColorsEqual(owner.styles.backgroundColor, pairedBackground)) &&
      owner.source.glyphPaintKind === 'solid-color' &&
      owner.source.opacity >= 0.999 &&
      owner.source.filterOpacity >= 0.999
    )
  }
  return true
}

function evidencePathForPublicRef(ref) {
  const color = /^color\.(.+)$/.exec(ref)
  if (color) return `colors.${color[1]}`
  const groups = [
    ['typography.font-family', 'typography.fontFamilies'],
    ['typography.font-stack', 'typography.fontStacks'],
    ['typography.font-size', 'typography.fontSizes'],
    ['typography.font-weight', 'typography.fontWeights'],
    ['typography.line-height', 'typography.lineHeights'],
    ['typography.letter-spacing', 'typography.letterSpacings'],
    ['spacing', 'spacing'],
    ['radius', 'radii'],
    ['shadow', 'shadows'],
    ['border', 'borders'],
    ['z-index', 'zIndices'],
    ['transition', 'transitions'],
  ]
  for (const [publicPrefix, evidencePrefix] of groups) {
    const match = new RegExp(`^${publicPrefix.replace('.', '\\.')}\\.(\\d+)$`).exec(ref)
    if (match && Number(match[1]) >= 1) return `${evidencePrefix}.${Number(match[1]) - 1}`
  }
  return null
}

function collectNamedArrays(value, propertyNames) {
  const result = []
  const visit = (candidate, pathParts = []) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, [...pathParts, String(index)]))
      return
    }
    if (!isObject(candidate)) return
    for (const [key, item] of Object.entries(candidate)) {
      const pathLabel = [...pathParts, key].join('.')
      if (propertyNames.has(key) && Array.isArray(item)) result.push({ path: pathLabel, values: item })
      visit(item, [...pathParts, key])
    }
  }
  visit(value)
  return result
}

function collectEvidenceIdFields(value) {
  const result = []
  const visit = (candidate, pathParts = []) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, [...pathParts, String(index)]))
      return
    }
    if (!isObject(candidate)) return
    for (const [key, item] of Object.entries(candidate)) {
      const itemPath = [...pathParts, key].join('.')
      if (key === 'evidenceId' && typeof item === 'string') result.push({ path: itemPath, value: item })
      if (
        ['pageId', 'sectionId', 'parentSectionId', 'parentId', 'targetId'].includes(key) &&
        typeof item === 'string'
      ) {
        result.push({ path: itemPath, value: item })
      }
      if (
        [
          'evidenceIds',
          'evidenceRefs',
          'stateRefs',
          'componentRefs',
          'interactionRefs',
          'mediaLayerRefs',
          'sectionIds',
          'crossPagePatternIds',
        ].includes(key) &&
        Array.isArray(item)
      ) {
        item.forEach((ref, index) => {
          if (typeof ref === 'string') result.push({ path: `${itemPath}.${index}`, value: ref })
        })
      }
      visit(item, [...pathParts, key])
    }
  }
  visit(value)
  return result
}

function evidenceRegistry(evidence, hardFailures) {
  const maps = Object.fromEntries(
    [
      'page',
      'image',
      'section',
      'component',
      'layout',
      'pseudo',
      'interaction',
      'responsive',
      'media',
      'layer',
      'pattern',
    ].map((type) => [type, new Map()]),
  )
  const all = new Map()
  const imagePageIds = new Map()
  const register = (type, value, label) => {
    const id = value?.id
    if (typeof id !== 'string' || !id) {
      hardFailures.push(`missing-evidence-entity-id:${label}`)
      return
    }
    const previous = all.get(id)
    if (previous) hardFailures.push(`duplicate-evidence-id:${id}:${previous.type}:${type}`)
    else all.set(id, { type, value })
    maps[type].set(id, value)
  }
  const registerArray = (type, values, label) => {
    for (const [index, value] of (Array.isArray(values) ? values : []).entries()) {
      register(type, value, `${label}.${index}`)
    }
  }
  registerArray('page', evidence?.pages, 'evidence.pages')
  for (const [pageIndex, page] of (Array.isArray(evidence?.pages) ? evidence.pages : []).entries()) {
    registerArray('image', page?.images, `evidence.pages.${pageIndex}.images`)
    for (const image of Array.isArray(page?.images) ? page.images : []) {
      if (typeof image?.id === 'string') imagePageIds.set(image.id, page.id)
    }
  }
  registerArray('section', evidence?.sections, 'evidence.sections')
  registerArray('component', evidence?.components, 'evidence.components')
  registerArray('layout', evidence?.layoutNodes, 'evidence.layoutNodes')
  registerArray('pseudo', evidence?.pseudoElements, 'evidence.pseudoElements')
  registerArray('interaction', evidence?.interactionObservations, 'evidence.interactionObservations')
  registerArray('responsive', evidence?.responsiveObservations, 'evidence.responsiveObservations')
  registerArray('media', evidence?.mediaLayers, 'evidence.mediaLayers')
  registerArray('layer', evidence?.topology?.globalLayers, 'evidence.topology.globalLayers')
  for (const [index, id] of (Array.isArray(evidence?.topology?.crossPagePatternIds)
    ? evidence.topology.crossPagePatternIds
    : []
  ).entries()) {
    register('pattern', { id }, `evidence.topology.crossPagePatternIds.${index}`)
  }
  return { maps, all, imagePageIds }
}

function auditValidPseudoPaintEvidence(paint) {
  if (
    !isObject(paint) ||
    !finite(paint.widthPx) ||
    paint.widthPx <= 2 ||
    !finite(paint.heightPx) ||
    paint.heightPx <= 2 ||
    !finite(paint.xPx) ||
    !finite(paint.yPx) ||
    !finite(paint.captureWidthPx) ||
    paint.captureWidthPx <= 0 ||
    !finite(paint.captureHeightPx) ||
    paint.captureHeightPx <= 0 ||
    !finite(paint.visibleWidthPx) ||
    paint.visibleWidthPx <= 2 ||
    paint.visibleWidthPx > paint.widthPx + 0.01 ||
    !finite(paint.visibleHeightPx) ||
    paint.visibleHeightPx <= 2 ||
    paint.visibleHeightPx > paint.heightPx + 0.01 ||
    !finite(paint.paintedAreaPx) ||
    paint.paintedAreaPx <= 16 ||
    !finite(paint.captureIntersectionRatio) ||
    paint.captureIntersectionRatio <= 0.02 ||
    paint.captureIntersectionRatio > 1 + GEOMETRY_RATIO_EPSILON ||
    !finite(paint.opacity) ||
    paint.opacity <= 0.02 ||
    paint.opacity > 1 ||
    !finite(paint.filterOpacity) ||
    paint.filterOpacity <= 0.02 ||
    paint.filterOpacity > 1 ||
    !Array.isArray(paint.filterChain) ||
    paint.filterChain.length > 8 ||
    !Array.isArray(paint.maskChain) ||
    paint.maskChain.length !== 0 ||
    !Array.isArray(paint.blendChain) ||
    paint.blendChain.length !== 0
  ) {
    return false
  }
  const expectedVisibleWidth = Math.max(
    0,
    Math.min(paint.captureWidthPx, paint.xPx + paint.widthPx) - Math.max(0, paint.xPx),
  )
  const expectedVisibleHeight = Math.max(
    0,
    Math.min(paint.captureHeightPx, paint.yPx + paint.heightPx) - Math.max(0, paint.yPx),
  )
  const area = paint.visibleWidthPx * paint.visibleHeightPx
  if (
    Math.abs(paint.visibleWidthPx - expectedVisibleWidth) > 0.01 ||
    Math.abs(paint.visibleHeightPx - expectedVisibleHeight) > 0.01 ||
    Math.abs(paint.paintedAreaPx - area) > Math.max(0.01, area * 0.001) ||
    Math.abs(paint.captureIntersectionRatio - area / (paint.widthPx * paint.heightPx)) > 0.001
  ) {
    return false
  }
  let auditedFilterOpacity = 1
  let paintFilterCount = 0
  for (const item of paint.filterChain) {
    if (
      !isObject(item) ||
      typeof item.value !== 'string' ||
      item.value.length > 512 ||
      !['self', 'ancestor', 'paint'].includes(item.owner)
    ) {
      return false
    }
    const normalized = item.value.trim().toLowerCase().replace(/\s+/g, ' ')
    const opacity = auditFilterOpacity(normalized)
    if (!normalized || normalized === 'none' || opacity === undefined) return false
    auditedFilterOpacity *= opacity
    if (item.owner === 'paint') paintFilterCount += 1
  }
  return (
    paintFilterCount <= 1 &&
    Math.abs(auditedFilterOpacity - paint.filterOpacity) <= Math.max(0.0001, auditedFilterOpacity * 0.001)
  )
}

function validateEvidenceRelations(evidence, registry, hardFailures) {
  const { maps, imagePageIds } = registry
  const requireType = (id, type, label) => {
    if (typeof id !== 'string' || !maps[type].has(id)) {
      hardFailures.push(`invalid-evidence-relation:${label}:${String(id)}:expected-${type}`)
      return null
    }
    return maps[type].get(id)
  }
  const requirePageSection = (pageId, sectionId, label) => {
    const page = requireType(pageId, 'page', `${label}.pageId`)
    const section = requireType(sectionId, 'section', `${label}.sectionId`)
    if (page && section && section.pageId !== pageId) hardFailures.push(`cross-page-evidence-relation:${label}`)
    return { page, section }
  }
  const requireOwnedReference = (id, allowedTypes, label, owner) => {
    const registered = registry.all.get(id)
    if (!registered || !allowedTypes.includes(registered.type)) {
      hardFailures.push(`invalid-evidence-relation:${label}:${String(id)}:expected-${allowedTypes.join('-or-')}`)
      return
    }
    const value = registered.value
    if (registered.type === 'image') {
      const imagePageId = imagePageIds.get(id)
      const sectionAllowed = !value.sectionId || !owner.sectionIds || owner.sectionIds.has(value.sectionId)
      if ((owner.pageIds && !owner.pageIds.has(imagePageId)) || !sectionAllowed) {
        hardFailures.push(`wrong-owner-evidence-relation:${label}:${id}`)
      }
      return
    }
    if (owner.pageIds && value.pageId && !owner.pageIds.has(value.pageId)) {
      hardFailures.push(`wrong-owner-evidence-relation:${label}:${id}`)
      return
    }
    if (registered.type === 'section' && owner.sectionIds && !owner.sectionIds.has(value.id)) {
      hardFailures.push(`wrong-owner-evidence-relation:${label}:${id}`)
      return
    }
    if (registered.type === 'component') {
      if (owner.componentIds && !owner.componentIds.has(value.id)) {
        hardFailures.push(`wrong-owner-evidence-relation:${label}:${id}`)
      } else if (owner.sectionIds && !owner.sectionIds.has(value.sectionId)) {
        hardFailures.push(`wrong-owner-evidence-relation:${label}:${id}`)
      }
    }
  }
  const validateOwnedReferences = (refs, allowedTypes, label, owner) => {
    for (const [index, id] of (Array.isArray(refs) ? refs : []).entries()) {
      requireOwnedReference(id, allowedTypes, `${label}.${index}`, owner)
    }
  }

  for (const [index, page] of (Array.isArray(evidence?.pages) ? evidence.pages : []).entries()) {
    for (const [imageIndex, image] of (Array.isArray(page?.images) ? page.images : []).entries()) {
      if (!image?.sectionId) continue
      const section = requireType(image.sectionId, 'section', `evidence.pages.${index}.images.${imageIndex}.sectionId`)
      if (section && section.pageId !== page.id) {
        hardFailures.push(`cross-page-evidence-relation:evidence.pages.${index}.images.${imageIndex}`)
      }
    }
  }
  const pageRoutesByPublicCapture = new Map()
  for (const [index, page] of (Array.isArray(evidence?.pages) ? evidence.pages : []).entries()) {
    const publicCapture = `${String(page?.url || '')}|${String(page?.viewport || '')}`
    const routes = pageRoutesByPublicCapture.get(publicCapture) || []
    routes.push({ index, routeId: page?.routeId })
    pageRoutesByPublicCapture.set(publicCapture, routes)
  }
  for (const [publicCapture, routes] of pageRoutesByPublicCapture) {
    if (routes.length < 2) continue
    const routeIds = routes.map(({ routeId }) => routeId).filter((routeId) => typeof routeId === 'string' && routeId)
    if (routeIds.length !== routes.length || new Set(routeIds).size !== routes.length) {
      hardFailures.push(`ambiguous-sanitized-page-route:${publicCapture}`)
    }
  }
  for (const [index, section] of (Array.isArray(evidence?.sections) ? evidence.sections : []).entries()) {
    const label = `evidence.sections.${index}`
    requireType(section?.pageId, 'page', `${label}.pageId`)
    if (section?.parentSectionId) {
      const parent = requireType(section.parentSectionId, 'section', `${label}.parentSectionId`)
      if (parent && parent.pageId !== section.pageId)
        hardFailures.push(`cross-page-evidence-relation:${label}.parentSectionId`)
    }
    for (const id of Array.isArray(section?.componentRefs) ? section.componentRefs : []) {
      const component = requireType(id, 'component', `${label}.componentRefs`)
      if (component && (component.pageId !== section.pageId || component.sectionId !== section.id)) {
        hardFailures.push(`wrong-owner-evidence-relation:${label}.componentRefs:${id}`)
      }
    }
    for (const id of Array.isArray(section?.interactionRefs) ? section.interactionRefs : []) {
      const interaction = requireType(id, 'interaction', `${label}.interactionRefs`)
      if (interaction && (interaction.pageId !== section.pageId || interaction.sectionId !== section.id)) {
        hardFailures.push(`wrong-owner-evidence-relation:${label}.interactionRefs:${id}`)
      }
    }
    for (const id of Array.isArray(section?.mediaLayerRefs) ? section.mediaLayerRefs : []) {
      const media = requireType(id, 'media', `${label}.mediaLayerRefs`)
      if (media && (media.pageId !== section.pageId || media.sectionId !== section.id)) {
        hardFailures.push(`wrong-owner-evidence-relation:${label}.mediaLayerRefs:${id}`)
      }
    }
    validateOwnedReferences(section?.evidenceRefs, ['image'], `${label}.evidenceRefs`, {
      pageIds: new Set([section.pageId]),
      sectionIds: new Set([section.id]),
    })
  }
  for (const [index, component] of (Array.isArray(evidence?.components) ? evidence.components : []).entries()) {
    const label = `evidence.components.${index}`
    requirePageSection(component?.pageId, component?.sectionId, label)
    for (const id of Array.isArray(component?.stateRefs) ? component.stateRefs : []) {
      const interaction = requireType(id, 'interaction', `${label}.stateRefs`)
      if (
        interaction &&
        (interaction.pageId !== component.pageId ||
          interaction.sectionId !== component.sectionId ||
          interaction.targetId !== component.id)
      ) {
        hardFailures.push(`wrong-owner-evidence-relation:${label}.stateRefs:${id}`)
      }
    }
    validateOwnedReferences(component?.evidenceRefs, ['section', 'image'], `${label}.evidenceRefs`, {
      pageIds: new Set([component.pageId]),
      sectionIds: new Set([component.sectionId]),
    })
  }
  for (const [kind, values] of [
    ['layout', evidence?.layoutNodes],
    ['pseudo', evidence?.pseudoElements],
    ['media', evidence?.mediaLayers],
  ]) {
    for (const [index, value] of (Array.isArray(values) ? values : []).entries()) {
      const label = `evidence.${kind}.${index}`
      requirePageSection(value?.pageId, value?.sectionId, label)
      if (kind === 'layout' && value?.parentId) {
        const parent = requireType(value.parentId, 'layout', `evidence.${kind}.${index}.parentId`)
        if (parent && (parent.pageId !== value.pageId || parent.sectionId !== value.sectionId)) {
          hardFailures.push(`wrong-owner-evidence-relation:evidence.${kind}.${index}.parentId`)
        }
      }
      if (kind === 'pseudo') {
        validateOwnedReferences(value?.evidenceRefs, ['section', 'image'], `${label}.evidenceRefs`, {
          pageIds: new Set([value.pageId]),
          sectionIds: new Set([value.sectionId]),
        })
        if (['before', 'after'].includes(value?.kind)) {
          if (!auditValidPseudoPaintEvidence(value?.paint)) {
            hardFailures.push(`invalid-pseudo-paint-evidence:${String(value?.id || index)}`)
          }
          const styles = isObject(value?.styles) ? value.styles : {}
          const content = String(styles.content || '')
            .replace(/^(['"])([\s\S]*)\1$/, '$2')
            .trim()
          const meaningfulContent = Boolean(content && !['none', 'normal'].includes(content.toLowerCase()))
          const visibleMaterial =
            auditVisibleColor(styles.backgroundColor) ||
            ['border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft'].some((property) =>
              auditVisibleBorder(styles[property]),
            ) ||
            auditVisibleShadowLayers(styles.boxShadow).length > 0
          if (!meaningfulContent && !visibleMaterial) {
            hardFailures.push(`unpainted-empty-pseudo-evidence:${String(value?.id || index)}`)
          }
        }
      }
    }
  }
  for (const [index, interaction] of (Array.isArray(evidence?.interactionObservations)
    ? evidence.interactionObservations
    : []
  ).entries()) {
    const label = `evidence.interactionObservations.${index}`
    requirePageSection(interaction?.pageId, interaction?.sectionId, label)
    const targetKind = interaction?.targetKind
    if (targetKind && ['component', 'section', 'page'].includes(targetKind)) {
      const target = requireType(interaction?.targetId, targetKind, `${label}.targetId`)
      if (
        target &&
        ((targetKind === 'page' && target.id !== interaction.pageId) ||
          (targetKind !== 'page' && target.pageId !== interaction.pageId) ||
          (targetKind === 'component' && target.sectionId !== interaction.sectionId) ||
          (targetKind === 'section' && target.id !== interaction.sectionId))
      ) {
        hardFailures.push(`wrong-owner-evidence-relation:${label}.targetId`)
      }
    } else if (targetKind !== undefined) {
      hardFailures.push(`invalid-evidence-target-kind:${label}:${String(targetKind)}`)
    } else if (!registry.all.has(interaction?.targetId)) {
      hardFailures.push(`invalid-evidence-relation:${label}.targetId:${String(interaction?.targetId)}:expected-target`)
    }
    validateOwnedReferences(interaction?.evidenceRefs, ['section', 'component', 'image'], `${label}.evidenceRefs`, {
      pageIds: new Set([interaction.pageId]),
      sectionIds: new Set([interaction.sectionId]),
      componentIds: interaction.targetKind === 'component' ? new Set([interaction.targetId]) : new Set(),
    })
  }
  for (const [index, responsive] of (Array.isArray(evidence?.responsiveObservations)
    ? evidence.responsiveObservations
    : []
  ).entries()) {
    const label = `evidence.responsiveObservations.${index}`
    const anchorSection = requireType(responsive?.sectionId, 'section', `${label}.sectionId`)
    const anchorPage = anchorSection ? maps.page.get(anchorSection.pageId) : null
    const pageIds = new Set(
      [...maps.page.values()]
        .filter(
          (page) =>
            anchorPage &&
            evidencePageRouteIdentity(page) === evidencePageRouteIdentity(anchorPage) &&
            [responsive?.fromViewport, responsive?.toViewport].includes(page.viewport),
        )
        .map((page) => page.id),
    )
    const referencedSections = (Array.isArray(responsive?.evidenceRefs) ? responsive.evidenceRefs : []).flatMap(
      (id) => {
        const section = maps.section.get(id)
        return section ? [section] : []
      },
    )
    const sectionIds = new Set(referencedSections.map((section) => section.id))
    if (anchorSection && !sectionIds.has(anchorSection.id)) {
      hardFailures.push(`missing-responsive-anchor-evidence:${label}:${anchorSection.id}`)
    }
    if (referencedSections.length > 2) hardFailures.push(`excess-responsive-section-evidence:${label}`)
    const referencedPageIds = referencedSections.map((section) => section.pageId)
    if (new Set(referencedPageIds).size !== referencedPageIds.length) {
      hardFailures.push(`duplicate-responsive-viewport-evidence:${label}`)
    }
    for (const section of referencedSections) {
      if (!pageIds.has(section.pageId) || (anchorSection && section.role !== anchorSection.role)) {
        hardFailures.push(`wrong-owner-evidence-relation:${label}.evidenceRefs:${section.id}`)
      }
    }
    validateOwnedReferences(responsive?.evidenceRefs, ['section', 'image'], `${label}.evidenceRefs`, {
      pageIds,
      sectionIds,
    })
  }
  for (const [index, pageTopology] of (Array.isArray(evidence?.topology?.pages)
    ? evidence.topology.pages
    : []
  ).entries()) {
    requireType(pageTopology?.pageId, 'page', `evidence.topology.pages.${index}.pageId`)
    for (const sectionId of Array.isArray(pageTopology?.sectionIds) ? pageTopology.sectionIds : []) {
      const section = requireType(sectionId, 'section', `evidence.topology.pages.${index}.sectionIds`)
      if (section && section.pageId !== pageTopology.pageId) {
        hardFailures.push(`wrong-owner-evidence-relation:evidence.topology.pages.${index}.sectionIds:${sectionId}`)
      }
    }
  }
  for (const [index, layer] of (Array.isArray(evidence?.topology?.globalLayers)
    ? evidence.topology.globalLayers
    : []
  ).entries()) {
    const label = `evidence.topology.globalLayers.${index}`
    requireType(layer?.pageId, 'page', `${label}.pageId`)
    const sectionIds = new Set(
      [...maps.section.values()].filter((section) => section.pageId === layer.pageId).map((section) => section.id),
    )
    validateOwnedReferences(layer?.evidenceRefs, ['section', 'image'], `${label}.evidenceRefs`, {
      pageIds: new Set([layer.pageId]),
      sectionIds,
    })
  }
  for (const [index, claim] of (Array.isArray(evidence?.deterministicClaims)
    ? evidence.deterministicClaims
    : []
  ).entries()) {
    const label = `evidence.deterministicClaims.${index}`
    if (!Array.isArray(claim?.evidenceRefs) || claim.evidenceRefs.length === 0) {
      hardFailures.push(`missing-claim-evidence:${label}`)
    }
    validateOwnedReferences(claim?.evidenceRefs, ['page', 'image', 'section', 'component'], `${label}.evidenceRefs`, {})
    for (const [provenanceIndex, provenance] of (Array.isArray(claim?.provenance) ? claim.provenance : []).entries()) {
      const provenanceLabel = `${label}.provenance.${provenanceIndex}`
      if (provenance?.source === 'color-role-observation') {
        const match = /^color-role:([^|]+)\|.+/.exec(String(provenance.ref || ''))
        if (!match || !maps.page.has(match[1])) hardFailures.push(`invalid-claim-provenance:${provenanceLabel}`)
      } else if (provenance?.source === 'section-observation') {
        requireType(provenance.ref, 'section', `${provenanceLabel}.ref`)
      } else if (provenance?.source === 'component-observation') {
        requireType(provenance.ref, 'component', `${provenanceLabel}.ref`)
      } else if (provenance?.source === 'token-usage') {
        if (!String(provenance.ref || '').startsWith('usage:')) {
          hardFailures.push(`invalid-claim-provenance:${provenanceLabel}`)
        }
      } else {
        hardFailures.push(`invalid-claim-provenance-source:${provenanceLabel}`)
      }
    }
  }
}

function normalizedCssValue(value) {
  return String(value).trim().replace(/\s+/g, ' ').replace(/;$/, '')
}

function declaredImplementationEntries(source, format) {
  const pattern = format === 'scss' ? /(\$[\w-]+)\s*:\s*([^;{}]+);/g : /(--[\w-]+)\s*:\s*([^;{}]+);/g
  return [...String(source || '').matchAll(pattern)].map((match) => [match[1], normalizedCssValue(match[2])])
}

function tokenRefMatchesCandidateGroup(ref, group) {
  const prefixes = {
    colors: ['color.'],
    spacing: ['spacing.'],
    radii: ['radius.'],
    shadows: ['shadow.'],
    borders: ['border.'],
    zIndices: ['z-index.'],
    transitions: ['transition.'],
    'typography.fontFamilies': ['typography.font-family.'],
    'typography.fontStacks': ['typography.font-stack.'],
    'typography.fontSizes': ['typography.font-size.'],
    'typography.fontWeights': ['typography.font-weight.'],
    'typography.lineHeights': ['typography.line-height.'],
    'typography.letterSpacings': ['typography.letter-spacing.'],
  }
  return (prefixes[group] || []).some((prefix) => String(ref).startsWith(prefix))
}

function tokenRefSharesImplementationNamespace(ref, group) {
  if (group === 'typography.fontFamilies' || group === 'typography.fontStacks') {
    return (
      tokenRefMatchesCandidateGroup(ref, 'typography.fontFamilies') ||
      tokenRefMatchesCandidateGroup(ref, 'typography.fontStacks')
    )
  }
  return tokenRefMatchesCandidateGroup(ref, group)
}

function implementationNameMatchesCandidateGroup(name, group) {
  const key = String(name).replace(/^(?:--|\$)/, '')
  if (group === 'colors') return key.startsWith('color-')
  if (group === 'spacing') return key.startsWith('spacing-')
  if (group === 'radii') return key.startsWith('radius-')
  if (group === 'shadows') return key.startsWith('shadow-')
  if (group === 'borders') return key.startsWith('border-')
  if (group === 'zIndices') return key.startsWith('z-')
  if (group === 'transitions') return key.startsWith('duration-')
  if (group === 'typography.fontFamilies' || group === 'typography.fontStacks') {
    return key.startsWith('font-') && !key.startsWith('font-size-') && !key.startsWith('font-weight-')
  }
  if (group === 'typography.fontSizes') return key.startsWith('font-size-') || key.startsWith('text-')
  if (group === 'typography.fontWeights') return key.startsWith('font-weight-')
  if (group === 'typography.lineHeights') return key.startsWith('line-height-') || key.startsWith('leading-')
  if (group === 'typography.letterSpacings') {
    return key.startsWith('letter-spacing-') || key.startsWith('tracking-')
  }
  return false
}

const RENDERED_TEXT_OWNER_PAGE_CAP = 8

function validateRenderedTextOwnerProvenance(evidencePath, value, item, hardFailures, canonicalCaptureByRoute) {
  const owners = Array.isArray(item?.renderedTextOwners) ? item.renderedTextOwners : []
  if (owners.length === 0) {
    hardFailures.push(`missing-rendered-text-owner-evidence:${evidencePath}`)
    return null
  }
  const groupPath = evidencePath.replace(/\.\d+$/, '')
  const ownerKeys = new Set()
  const ownersByRoute = new Map()
  const viewportByRoute = new Map()
  let invalidOwner = false
  let mismatchedValue = false
  let mixedViewports = false
  let mismatchedCapture = false
  const pairedBackground = evidencePath.startsWith('colors.') ? item?.pairedSurface?.background : undefined
  for (const owner of owners) {
    if (!auditValidTextStyleSource(owner?.source)) invalidOwner = true
    if (!renderedTextOwnerSupports(groupPath, value, owner, pairedBackground)) mismatchedValue = true
    const page = typeof owner?.page === 'string' ? owner.page : ''
    const routeId = typeof owner?.routeId === 'string' ? owner.routeId : ''
    const viewport = typeof owner?.viewport === 'string' ? owner.viewport : ''
    const ownerId = typeof owner?.ownerId === 'string' ? owner.ownerId : ''
    const key = `${routeId}\u0000${ownerId}`
    if (!page || !/^route-[0-9a-f]{12}$/.test(routeId) || !viewport || !ownerId) {
      hardFailures.push(`duplicate-or-invalid-rendered-text-owner:${evidencePath}`)
      continue
    }
    const canonicalCapture = canonicalCaptureByRoute?.get(routeId)
    if (
      canonicalCaptureByRoute &&
      (!canonicalCapture || canonicalCapture.page !== page || canonicalCapture.viewport !== viewport)
    ) {
      mismatchedCapture = true
    }
    const routeViewport = viewportByRoute.get(routeId)
    if (routeViewport && routeViewport !== viewport) mixedViewports = true
    else viewportByRoute.set(routeId, viewport)
    if (ownerKeys.has(key)) {
      hardFailures.push(`duplicate-or-invalid-rendered-text-owner:${evidencePath}`)
      continue
    }
    ownerKeys.add(key)
    const routeOwners = ownersByRoute.get(routeId) || new Set()
    routeOwners.add(ownerId)
    ownersByRoute.set(routeId, routeOwners)
  }
  if (invalidOwner) hardFailures.push(`invalid-rendered-text-owner-evidence:${evidencePath}`)
  if (mismatchedValue) hardFailures.push(`rendered-text-owner-value-mismatch:${evidencePath}`)
  if (mixedViewports) hardFailures.push(`mixed-rendered-text-owner-viewports:${evidencePath}`)
  if (mismatchedCapture) hardFailures.push(`rendered-text-owner-capture-mismatch:${evidencePath}`)

  const claimedPages = Array.isArray(item?.pages) ? item.pages : []
  const claimedRouteIds = sortedStrings(item?.pageRefs)
  const ownerRouteIds = [...ownersByRoute.keys()].sort()
  const expectedPages = canonicalCaptureByRoute
    ? claimedRouteIds.map((routeId) => canonicalCaptureByRoute.get(routeId)?.page)
    : claimedPages
  if (
    claimedPages.length !== item.pageCount ||
    claimedPages.some((page) => typeof page !== 'string' || !page) ||
    expectedPages.some((page) => typeof page !== 'string' || !page) ||
    stableJson([...claimedPages].sort()) !== stableJson([...expectedPages].sort()) ||
    claimedRouteIds.length !== item.pageCount ||
    stableJson(ownerRouteIds) !== stableJson(claimedRouteIds) ||
    !finite(item.eligiblePageCount) ||
    item.eligiblePageCount < item.pageCount ||
    item.pageCount <= 0 ||
    !finite(item.pageSupportRatio) ||
    Math.abs(item.pageSupportRatio - item.pageCount / item.eligiblePageCount) > 0.001 ||
    !finite(item.captureCount) ||
    item.captureCount < item.pageCount
  ) {
    hardFailures.push(`rendered-text-page-coverage-mismatch:${evidencePath}`)
  }

  const uniqueOwnerCount = ownerKeys.size
  const saturated = [...ownersByRoute.values()].some((routeOwners) => routeOwners.size >= RENDERED_TEXT_OWNER_PAGE_CAP)
  if (
    !finite(item.ownerCount) ||
    item.ownerCount < uniqueOwnerCount ||
    (!saturated && Math.abs(item.ownerCount - uniqueOwnerCount) > 0.001)
  ) {
    hardFailures.push(`rendered-text-owner-count-mismatch:${evidencePath}`)
  }
  if (!finite(item.observationCount) || item.observationCount !== item.ownerCount) {
    hardFailures.push(`rendered-text-observation-count-mismatch:${evidencePath}`)
  }

  const sources = Array.isArray(item.sources) ? item.sources : []
  if (
    evidencePath.startsWith('colors.') &&
    (!sources.includes('rendered:text') || !sources.includes('observed:text-background-pair'))
  ) {
    hardFailures.push(`missing-rendered-text-pair-source:${evidencePath}`)
  }
  if (evidencePath.startsWith('colors.') && Array.isArray(item?.pairedSurface?.routeSupport)) {
    const sampledOwnersByRoute = new Map()
    for (const owner of owners) {
      const routeOwners = sampledOwnersByRoute.get(owner.routeId) || new Map()
      routeOwners.set(owner.ownerId, owner.textRole)
      sampledOwnersByRoute.set(owner.routeId, routeOwners)
    }
    for (const route of item.pairedSurface.routeSupport) {
      if (!route?.supported) continue
      const routeOwners = new Set(Array.isArray(route.ownerIds) ? route.ownerIds : [])
      const mainTextOwners = new Set(Array.isArray(route.mainTextOwnerIds) ? route.mainTextOwnerIds : [])
      const headingOwners = new Set(Array.isArray(route.headingOwnerIds) ? route.headingOwnerIds : [])
      const routeTextRoles = new Set(Array.isArray(route.textRoles) ? route.textRoles : [])
      const sampledOwners = sampledOwnersByRoute.get(route.routeId) || new Map()
      if (
        sampledOwners.size !== Math.min(RENDERED_TEXT_OWNER_PAGE_CAP, routeOwners.size) ||
        [...sampledOwners.keys()].some((ownerId) => !routeOwners.has(ownerId))
      ) {
        hardFailures.push(`rendered-text-pair-sample-mismatch:${evidencePath}`)
        break
      }
      if (
        [...sampledOwners].some(([ownerId, textRole]) => {
          const mainText = textRole === 'body' || textRole === 'heading'
          return (
            !routeTextRoles.has(textRole) ||
            mainTextOwners.has(ownerId) !== mainText ||
            headingOwners.has(ownerId) !== (textRole === 'heading')
          )
        })
      ) {
        hardFailures.push(`rendered-text-pair-role-mismatch:${evidencePath}`)
        break
      }
    }
    if (item.ownerCount !== item.pairedSurface.ownerCount || item.pageCount !== item.pairedSurface.pageCount) {
      hardFailures.push(`rendered-text-pair-count-mismatch:${evidencePath}`)
    }
  }
  if (
    evidencePath.startsWith('colors.') &&
    (item?.pairedSurface !== undefined || sources.includes('observed:text-background-pair'))
  ) {
    if (!isObject(item?.pairedSurface)) {
      hardFailures.push(`missing-rendered-text-pair-evidence:${evidencePath}`)
    } else {
      validatedForegroundPair(
        value,
        item.pairedSurface.background,
        item.pairedSurface,
        item.pageRefs,
        `rendered-text-pair:${evidencePath}`,
        hardFailures,
        canonicalCaptureByRoute,
      )
    }
  }

  return { uniqueOwnerCount, sources }
}

function validateRenderedTextPromotionEvidence(evidencePath, value, item, hardFailures, canonicalCaptureByRoute) {
  const provenance = validateRenderedTextOwnerProvenance(
    evidencePath,
    value,
    item,
    hardFailures,
    canonicalCaptureByRoute,
  )
  if (!provenance) return
  const { uniqueOwnerCount, sources } = provenance
  const declared = sources.some(
    (source) =>
      typeof source === 'string' &&
      (source.startsWith('css-variable:') || source === 'usage:declaredColor' || source === 'usage:brandTokenColor'),
  )
  const onePageMinimum = declared ? 1 : 2
  const pairedForeground =
    ['colors.foreground', 'colors.muted-foreground'].includes(evidencePath) && isObject(item.pairedSurface)
  const meetsFoundationThreshold = pairedForeground
    ? evidencePath === 'colors.foreground'
      ? auditPrimaryForegroundPair(item.pairedSurface)
      : auditFoundationForegroundPair(item.pairedSurface)
    : item.eligiblePageCount === 1
      ? item.pageCount === 1 && uniqueOwnerCount >= onePageMinimum
      : item.pageCount >= 2 && item.pageCount / item.eligiblePageCount >= 0.75 && uniqueOwnerCount >= item.pageCount
  if (!meetsFoundationThreshold) hardFailures.push(`insufficient-rendered-text-promotion-evidence:${evidencePath}`)
}

function tailwindFontWeightName(value, index) {
  const names = {
    100: 'thin',
    200: 'extralight',
    300: 'light',
    400: 'normal',
    500: 'medium',
    600: 'semibold',
    700: 'bold',
    800: 'extrabold',
    900: 'black',
  }
  return names[value] || String(value).replace(/[^\w-]/g, '') || `${index + 1}`
}

const CSS_GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'cursive',
  'fantasy',
  'monospace',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
])

function decodedCssEscapes(value) {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character !== '\\') {
      result += character === '\0' ? '\ufffd' : character
      continue
    }
    const next = value[index + 1]
    if (next === undefined) {
      result += '\ufffd'
      continue
    }
    if (next === '\n' || next === '\f') {
      index += 1
      continue
    }
    if (next === '\r') {
      index += value[index + 2] === '\n' ? 2 : 1
      continue
    }
    const hexMatch = /^[\da-f]{1,6}/i.exec(value.slice(index + 1))
    if (hexMatch) {
      const codePoint = Number.parseInt(hexMatch[0], 16)
      result +=
        codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? '\ufffd'
          : String.fromCodePoint(codePoint)
      index += hexMatch[0].length
      if (/\s/.test(value[index + 1] || '')) {
        if (value[index + 1] === '\r' && value[index + 2] === '\n') index += 2
        else index += 1
      }
      continue
    }
    result += next
    index += 1
  }
  return result
}

function parsedCssFontFamilies(value) {
  const rawFamilies = []
  let current = ''
  let quote = null
  let escaped = false
  for (const character of String(value)) {
    if (escaped) {
      current += character
      escaped = false
    } else if (character === '\\') {
      current += character
      escaped = true
    } else if (quote) {
      current += character
      if (character === quote) quote = null
    } else if (character === '"' || character === "'") {
      current += character
      quote = character
    } else if (character === ',') {
      if (current.trim()) rawFamilies.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }
  if (current.trim()) rawFamilies.push(current.trim())
  return rawFamilies.map((raw) => {
    const first = raw[0]
    const quoted = (first === '"' || first === "'") && raw.at(-1) === first
    const name = decodedCssEscapes(quoted ? raw.slice(1, -1) : raw)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    return { name, generic: !quoted && CSS_GENERIC_FONT_FAMILIES.has(name) }
  })
}

function normalizedFontStack(value) {
  return parsedCssFontFamilies(value)
    .map((family) => `${family.generic ? 'generic' : 'family'}:${family.name}`)
    .join('|')
}

function normalizedPrimaryFontFamily(value) {
  const family = parsedCssFontFamilies(value)[0]
  return family ? `${family.generic ? 'generic' : 'family'}:${family.name}` : ''
}

function validateTypographyFeatureTags(extension, dtcg, hardFailures) {
  const tags = Array.isArray(extension?.featureTags) ? extension.featureTags.map(String) : []
  const hasMonospaceClaim = tags.some((tag) => ['monospace typography', '等宽字体排版'].includes(tag))
  const hasSerifClaim = tags.some((tag) => ['serif editorial style', '衬线编辑风格'].includes(tag))
  if (!hasMonospaceClaim && !hasSerifClaim) return

  const stacks = dtcg?.typography?.fontStacks?.$value
  const families = dtcg?.typography?.fontFamilies?.$value
  const primaryStack =
    Array.isArray(stacks) && stacks.length > 0
      ? String(stacks[0])
      : Array.isArray(families) && families.length > 0
        ? String(families[0])
        : ''
  const primaryGeneric = parsedCssFontFamilies(primaryStack).find((family) => family.generic)?.name
  if (hasMonospaceClaim && !['monospace', 'ui-monospace'].includes(primaryGeneric)) {
    hardFailures.push('unsupported-feature-tag:monospace-typography')
  }
  if (hasSerifClaim && !['serif', 'ui-serif'].includes(primaryGeneric)) {
    hardFailures.push('unsupported-feature-tag:serif-editorial-style')
  }
}

function portableFontEntries(typography, identityTypography = typography) {
  const source = typography?.fontStacks?.length ? typography.fontStacks : typography?.fontFamilies || []
  const identitySource = identityTypography?.fontStacks?.length
    ? identityTypography.fontStacks
    : identityTypography?.fontFamilies || []
  const seen = new Set()
  const counts = new Map()
  const identityNames = []
  for (const rawValue of identitySource) {
    const value = String(rawValue).trim()
    const normalized = normalizedFontStack(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    const primaryGeneric = parsedCssFontFamilies(value).find((family) => family.generic)?.name
    let category = 'family'
    if (['monospace', 'ui-monospace'].includes(primaryGeneric)) category = 'mono'
    else if (['sans-serif', 'ui-sans-serif', 'system-ui'].includes(primaryGeneric)) category = 'sans'
    else if (['serif', 'ui-serif'].includes(primaryGeneric)) category = 'serif'
    else if (primaryGeneric === 'ui-rounded') category = 'rounded'
    else if (['cursive', 'fantasy', 'emoji', 'math', 'fangsong'].includes(primaryGeneric)) category = primaryGeneric
    const count = (counts.get(category) || 0) + 1
    counts.set(category, count)
    const name = category === 'family' ? `family-${count}` : count === 1 ? category : `${category}-${count}`
    identityNames.push(name)
  }
  return source.flatMap((rawValue, index) => {
    const value = String(rawValue).trim()
    const name = identityNames[index]
    return value && name ? [{ name, value }] : []
  })
}

const STANDARD_FONT_SIZE_NAMES = new Map([
  [12, 'xs'],
  [14, 'sm'],
  [16, 'base'],
  [18, 'lg'],
  [20, 'xl'],
  [24, '2xl'],
  [30, '3xl'],
  [36, '4xl'],
  [48, '5xl'],
  [60, '6xl'],
  [72, '7xl'],
  [96, '8xl'],
  [128, '9xl'],
])

function parsedDimension(value) {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i.exec(String(value).trim())
  if (!match) return null
  const amount = Number(match[1])
  return Number.isFinite(amount) ? { amount, unit: match[2].toLowerCase() } : null
}

function auditDimensionPixels(value) {
  const parsed = parsedDimension(value)
  if (!parsed) return null
  if (parsed.unit === 'px' || (parsed.amount === 0 && parsed.unit === '')) return parsed.amount
  if (parsed.unit === 'rem' || parsed.unit === 'em') return parsed.amount * 16
  return null
}

function decimalName(value) {
  return Number(value.toFixed(4)).toString().replace('-', 'neg-').replace('.', 'p')
}

function fontSizeName(value, index) {
  const parsed = parsedDimension(value)
  let pixels = null
  if (parsed && (parsed.unit === 'px' || (parsed.amount === 0 && parsed.unit === ''))) pixels = parsed.amount
  else if (parsed?.unit === 'rem') pixels = parsed.amount * 16
  if (pixels === null) return `custom-${index + 1}`
  const rounded = Number(pixels.toFixed(4))
  return STANDARD_FONT_SIZE_NAMES.get(rounded) || decimalName(rounded)
}

function lineHeightName(value, index) {
  const parsed = parsedDimension(value)
  const ratio = parsed?.unit === '' ? parsed.amount : parsed?.unit === '%' ? parsed.amount / 100 : null
  if (ratio === null) return `custom-${index + 1}`
  const standards = [
    [1.25, 'tight'],
    [1.375, 'snug'],
    [1.5, 'normal'],
    [1.625, 'relaxed'],
    [2, 'loose'],
  ]
  return standards.find(([amount]) => Math.abs(amount - ratio) < 0.0001)?.[1] || decimalName(ratio)
}

function letterSpacingName(value, index) {
  if (String(value).trim().toLowerCase() === 'normal') return 'normal'
  const parsed = parsedDimension(value)
  if (!parsed) return `custom-${index + 1}`
  if (Math.abs(parsed.amount) < 0.000001) return 'normal'
  return parsed.amount < 0 ? 'tight' : 'wide'
}

function portableScaleEntries(values, identityValues, nameFor) {
  const source = Array.isArray(values) ? values : []
  const identities = Array.isArray(identityValues) ? identityValues : source
  const counts = new Map()
  const names = identities.map((value, index) => {
    const base = nameFor(value, index)
    const count = (counts.get(base) || 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
  return source.flatMap((value, index) => (names[index] ? [{ name: names[index], value }] : []))
}

function portableFontSizeEntries(values, identityValues = values) {
  return portableScaleEntries(values, identityValues, fontSizeName)
}

function portableFontWeightEntries(values, identityValues = values) {
  return portableScaleEntries(values, identityValues, tailwindFontWeightName)
}

function portableLineHeightEntries(values, identityValues = values) {
  return portableScaleEntries(values, identityValues, lineHeightName)
}

function portableLetterSpacingEntries(values, identityValues = values) {
  return portableScaleEntries(values, identityValues, letterSpacingName)
}

function implementationCatalog(tokens, format, identityTokens = tokens) {
  const result = new Map()
  const sigil = format === 'scss' ? '$' : '--'
  const add = (name, value) => result.set(`${sigil}${name}`, normalizedCssValue(value))
  for (const [name, value] of Object.entries(tokens?.colors || {})) add(`color-${name}`, value)
  const typography = tokens?.typography || {}
  portableFontEntries(typography, identityTokens?.typography).forEach(({ name, value }) => add(`font-${name}`, value))
  portableFontSizeEntries(typography.fontSizes, identityTokens?.typography?.fontSizes).forEach(({ name, value }) =>
    add(`${format === 'tailwind' ? 'text' : 'font-size'}-${name}`, value),
  )
  portableFontWeightEntries(typography.fontWeights, identityTokens?.typography?.fontWeights).forEach(
    ({ name, value }) => add(`font-weight-${name}`, value),
  )
  portableLineHeightEntries(typography.lineHeights, identityTokens?.typography?.lineHeights).forEach(
    ({ name, value }) => add(`${format === 'tailwind' ? 'leading' : 'line-height'}-${name}`, value),
  )
  portableLetterSpacingEntries(typography.letterSpacings, identityTokens?.typography?.letterSpacings).forEach(
    ({ name, value }) => add(`${format === 'tailwind' ? 'tracking' : 'letter-spacing'}-${name}`, value),
  )
  ;(tokens?.spacing || []).forEach((value, index) => add(`spacing-${index + 1}`, value))
  ;(tokens?.radii || []).forEach((value, index) => add(`radius-${RADIUS_NAMES[index] || index + 1}`, value))
  ;(tokens?.shadows || []).forEach((value, index) => add(`shadow-${SHADOW_NAMES[index] || index + 1}`, value))
  ;(tokens?.borders || []).forEach((value, index) => add(`border-${index + 1}`, value))
  ;(tokens?.zIndices || []).forEach((value, index) => add(`z-${(index + 1) * 10}`, value))
  ;(tokens?.transitions || []).forEach((value, index) => add(`duration-${DURATION_NAMES[index] || index + 1}`, value))
  return result
}

function stylesheetLexicalSources(source, format) {
  const input = String(source || '')
  let effective = ''
  let searchable = ''
  let quote = ''
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    if (quote) {
      effective += char
      searchable += char === quote ? char : char === '\n' ? '\n' : ' '
      if (char === '\\' && index + 1 < input.length) {
        index += 1
        effective += input[index]
        searchable += input[index] === '\n' ? '\n' : ' '
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      effective += char
      searchable += char
      continue
    }
    if (char === '/' && next === '*') {
      effective += '  '
      searchable += '  '
      index += 2
      while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) {
        const replacement = input[index] === '\n' ? '\n' : ' '
        effective += replacement
        searchable += replacement
        index += 1
      }
      if (index < input.length) {
        effective += '  '
        searchable += '  '
        index += 1
      }
      continue
    }
    if (format === 'scss' && char === '/' && next === '/') {
      effective += '  '
      searchable += '  '
      index += 2
      while (index < input.length && input[index] !== '\n') {
        effective += ' '
        searchable += ' '
        index += 1
      }
      if (index < input.length) {
        effective += '\n'
        searchable += '\n'
      }
      continue
    }
    effective += char
    searchable += char
  }
  return { effective, searchable }
}

function parsedCatalogOccurrences(source, format) {
  const result = new Map()
  const { effective, searchable } = stylesheetLexicalSources(source, format)
  const pattern =
    format === 'scss'
      ? /(\$[\w-]+)\s*:\s*([^;{}]+);/g
      : /(--(?:\\(?:[\da-f]{1,6}[ \t\r\n\f]?|[^\r\n\f\da-f])|[\w-])+)\s*:\s*([^;{}]+);/gi
  for (const match of searchable.matchAll(pattern)) {
    const name = format === 'scss' ? match[1] : decodedCssEscapes(match[1])
    const values = result.get(name) || []
    const valueStart = (match.index || 0) + match[0].indexOf(':') + 1
    const valueEnd = (match.index || 0) + match[0].lastIndexOf(';')
    values.push(normalizedCssValue(effective.slice(valueStart, valueEnd)))
    result.set(name, values)
  }
  return result
}

function compareExactImplementationCatalog(expected, occurrences, filename, hardFailures, prefix = '') {
  for (const [name, value] of expected) {
    const actualValues = occurrences.get(name) || []
    if (actualValues.length === 0) hardFailures.push(`missing-${prefix}implementation-token:${filename}:${name}`)
    else if (actualValues.length > 1) hardFailures.push(`duplicate-${prefix}implementation-token:${filename}:${name}`)
    else if (actualValues[0] !== value) {
      hardFailures.push(`${prefix}implementation-token-value-mismatch:${filename}:${name}`)
    }
  }
  for (const [name, values] of occurrences) {
    if (!expected.has(name)) hardFailures.push(`unexpected-${prefix}implementation-token:${filename}:${name}`)
    else if (values.length > 1) hardFailures.push(`duplicate-${prefix}implementation-token:${filename}:${name}`)
  }
}

function designTokensFromDtcgRoot(root) {
  if (!isObject(root)) return null
  const catalog = dtcgTokenCatalog(root)
  const indexedValues = (prefix) =>
    [...catalog]
      .flatMap(([ref, value]) => {
        const match = new RegExp(`^${prefix.replace('.', '\\.')}\\.(\\d+)$`).exec(ref)
        return match ? [{ index: Number(match[1]), value }] : []
      })
      .sort((first, second) => first.index - second.index)
      .map(({ value }) => value)
  return {
    colors: Object.fromEntries(
      Object.entries(root.color || {}).flatMap(([name, token]) =>
        isObject(token) && '$value' in token ? [[name, String(token.$value)]] : [],
      ),
    ),
    typography: {
      fontFamilies: indexedValues('typography.font-family'),
      fontStacks: indexedValues('typography.font-stack'),
      fontSizes: indexedValues('typography.font-size'),
      fontWeights: indexedValues('typography.font-weight'),
      lineHeights: indexedValues('typography.line-height'),
      letterSpacings: indexedValues('typography.letter-spacing'),
    },
    spacing: indexedValues('spacing'),
    radii: indexedValues('radius'),
    shadows: indexedValues('shadow'),
    borders: indexedValues('border'),
    zIndices: indexedValues('z-index'),
    transitions: indexedValues('transition'),
  }
}

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function baseImplementationScopes(source, filename, format, hardFailures) {
  const { effective, searchable } = stylesheetLexicalSources(source, format)
  if (format === 'scss') {
    const declarationPattern = /(\$[\w-]+)\s*:\s*([^;{}]+);/g
    if (/[{}]/.test(searchable) || searchable.replace(declarationPattern, '').trim()) {
      hardFailures.push(`invalid-base-implementation-scope:${filename}`)
      return null
    }
    return { primary: effective, supplemental: '' }
  }
  if (format === 'css') {
    const match = /^\s*:root\s*\{([^{}]*)\}\s*$/d.exec(searchable)
    if (!match?.indices?.[1]) {
      hardFailures.push(`invalid-base-implementation-scope:${filename}`)
      return null
    }
    return { primary: effective.slice(...match.indices[1]), supplemental: '' }
  }
  const match = /^\s*@theme\s*\{([^{}]*)\}\s*(?::root\s*\{([^{}]*)\}\s*)?$/d.exec(searchable)
  if (!match?.indices?.[1]) {
    hardFailures.push(`invalid-base-implementation-scope:${filename}`)
    return null
  }
  return {
    primary: effective.slice(...match.indices[1]),
    supplemental: match.indices[2] ? effective.slice(...match.indices[2]) : '',
  }
}

function scopedDarkImplementationBody(source, filename, method, selector, hardFailures) {
  const { effective, searchable } = stylesheetLexicalSources(source, 'css')
  const searchableSelector = typeof selector === 'string' ? stylesheetLexicalSources(selector, 'css').searchable : ''
  const pattern =
    method === 'media-query'
      ? /^\s*@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^{}]*)\}\s*\}\s*$/d
      : method === 'class-toggle' && typeof selector === 'string'
        ? new RegExp(`^\\s*${escapedRegex(searchableSelector)}\\s*\\{([^{}]*)\\}\\s*$`, 'd')
        : null
  const match = pattern?.exec(searchable)
  if (!match?.indices?.[1]) {
    hardFailures.push(`invalid-dark-implementation-scope:${filename}`)
    return null
  }
  return effective.slice(...match.indices[1])
}

function validateDarkImplementationCatalog(
  source,
  filename,
  darkTokens,
  format,
  hardFailures,
  baseTokens,
  darkModeContract,
) {
  const marker = format === 'scss' ? '// Captured dark mode values' : '/* Dark mode overrides */'
  const markerIndex = String(source || '').indexOf(marker)
  if (!darkTokens) {
    if (markerIndex >= 0) hardFailures.push(`unexpected-dark-implementation-section:${filename}`)
    return
  }
  if (markerIndex < 0) {
    hardFailures.push(`missing-dark-implementation-section:${filename}`)
    return
  }
  const darkSource = String(source || '').slice(markerIndex + marker.length)
  const method = darkModeContract?.method
  const selector = darkModeContract?.selector
  if (format !== 'scss') {
    const body = scopedDarkImplementationBody(darkSource, filename, method, selector, hardFailures)
    if (body === null) return
    const occurrences = parsedCatalogOccurrences(body, format)
    for (const name of occurrences.keys()) {
      if (allowedDerivedImplementationName(name, format)) occurrences.delete(name)
    }
    compareExactImplementationCatalog(
      implementationCatalog(darkTokens, format, baseTokens),
      occurrences,
      filename,
      hardFailures,
      'dark-',
    )
    return
  }

  const expectedVariables = new Map(
    [...implementationCatalog(darkTokens, 'scss', baseTokens)].map(([name, value]) => [
      `$dark-${name.slice(1)}`,
      value,
    ]),
  )
  const { effective: effectiveDarkSource, searchable: searchableDarkSource } = stylesheetLexicalSources(
    darkSource,
    'scss',
  )
  const mixinStart = searchableDarkSource.indexOf('@mixin imprint-dark-theme')
  const variableSource = mixinStart < 0 ? effectiveDarkSource : effectiveDarkSource.slice(0, mixinStart)
  compareExactImplementationCatalog(
    expectedVariables,
    parsedCatalogOccurrences(variableSource, 'scss'),
    filename,
    hardFailures,
    'dark-',
  )
  const mixinMatch = /@mixin\s+imprint-dark-theme\s*\{([^{}]*)\}/d.exec(searchableDarkSource)
  if (!mixinMatch?.indices?.[1] || !mixinMatch.indices[0]) {
    hardFailures.push(`missing-dark-implementation-mixin:${filename}`)
    return
  }
  compareExactImplementationCatalog(
    implementationCatalog(darkTokens, 'css', baseTokens),
    parsedCatalogOccurrences(effectiveDarkSource.slice(...mixinMatch.indices[1]), 'css'),
    `${filename}@mixin`,
    hardFailures,
    'dark-',
  )
  const invocation = effectiveDarkSource.slice(mixinMatch.indices[0][1]).trim()
  const invocationPattern =
    method === 'media-query'
      ? /^@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{\s*@include\s+imprint-dark-theme\s*;\s*\}\s*\}\s*$/
      : method === 'class-toggle' && typeof selector === 'string'
        ? new RegExp(`^${escapedRegex(selector)}\\s*\\{\\s*@include\\s+imprint-dark-theme\\s*;\\s*\\}\\s*$`)
        : null
  if (!invocationPattern?.test(invocation)) hardFailures.push(`invalid-dark-implementation-scope:${filename}`)
}

function allowedDerivedImplementationName(name, format) {
  if (format !== 'scss' && name.startsWith('--breakpoint-')) return true
  return format === 'tailwind' && name === '--default-transition-duration'
}

function validateTypographyAliasSemantics(catalog, filename, hardFailures) {
  const expectedFontPixels = new Map([...STANDARD_FONT_SIZE_NAMES].map(([pixels, name]) => [name, pixels]))
  const expectedLineHeights = new Map([
    ['tight', 1.25],
    ['snug', 1.375],
    ['normal', 1.5],
    ['relaxed', 1.625],
    ['loose', 2],
  ])
  for (const [name, value] of catalog) {
    const fontMatch = /^(?:--|\$)(?:font-size|text)-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)(?:-\d+)?$/.exec(
      name,
    )
    if (fontMatch) {
      const parsed = parsedDimension(value)
      const pixels = parsed?.unit === 'px' ? parsed.amount : parsed?.unit === 'rem' ? parsed.amount * 16 : null
      if (pixels === null || Math.abs(pixels - expectedFontPixels.get(fontMatch[1])) > 0.0001) {
        hardFailures.push(`misleading-font-size-alias:${filename}:${name}:${value}`)
      }
    }

    const trackingMatch = /^(?:--|\$)(?:letter-spacing|tracking)-(tight|normal|wide)(?:-\d+)?$/.exec(name)
    if (trackingMatch) {
      const parsed = parsedDimension(value)
      const sign = parsed ? Math.sign(parsed.amount) : value === 'normal' ? 0 : null
      const expectedSign = trackingMatch[1] === 'tight' ? -1 : trackingMatch[1] === 'wide' ? 1 : 0
      if (sign === null || sign !== expectedSign) {
        hardFailures.push(`misleading-letter-spacing-alias:${filename}:${name}:${value}`)
      }
    }

    const lineHeightMatch = /^(?:--|\$)(?:line-height|leading)-(tight|snug|normal|relaxed|loose)(?:-\d+)?$/.exec(name)
    if (lineHeightMatch) {
      const parsed = parsedDimension(value)
      const ratio = parsed?.unit === '' ? parsed.amount : parsed?.unit === '%' ? parsed.amount / 100 : null
      if (ratio === null || Math.abs(ratio - expectedLineHeights.get(lineHeightMatch[1])) > 0.0001) {
        hardFailures.push(`misleading-line-height-alias:${filename}:${name}:${value}`)
      }
    }
  }
}

function validateImplementationCatalog(
  source,
  filename,
  tokens,
  format,
  hardFailures,
  darkTokens = null,
  darkModeContract = null,
) {
  const expected = implementationCatalog(tokens, format)
  const baseSource =
    format === 'scss'
      ? String(source || '').split('// Captured dark mode values', 1)[0]
      : String(source || '').split('/* Dark mode overrides */', 1)[0]
  const scopes = baseImplementationScopes(baseSource, filename, format, hardFailures)
  if (scopes) {
    const primaryOccurrences = parsedCatalogOccurrences(scopes.primary, format)
    const supplementalOccurrences = parsedCatalogOccurrences(scopes.supplemental, format)
    if (format === 'tailwind') {
      const supplementalName = (name) =>
        name.startsWith('--border-') || name.startsWith('--z-') || name.startsWith('--duration-')
      const primaryExpected = new Map([...expected].filter(([name]) => !supplementalName(name)))
      const supplementalExpected = new Map([...expected].filter(([name]) => supplementalName(name)))
      for (const name of primaryOccurrences.keys()) {
        if (name.startsWith('--breakpoint-')) primaryOccurrences.delete(name)
      }
      supplementalOccurrences.delete('--default-transition-duration')
      compareExactImplementationCatalog(primaryExpected, primaryOccurrences, filename, hardFailures)
      compareExactImplementationCatalog(supplementalExpected, supplementalOccurrences, filename, hardFailures)
    } else {
      for (const name of primaryOccurrences.keys()) {
        if (allowedDerivedImplementationName(name, format)) primaryOccurrences.delete(name)
      }
      compareExactImplementationCatalog(expected, primaryOccurrences, filename, hardFailures)
    }
    validateTypographyAliasSemantics(
      new Map(
        [...primaryOccurrences, ...supplementalOccurrences].flatMap(([name, values]) =>
          values.length === 1 ? [[name, values[0]]] : [],
        ),
      ),
      filename,
      hardFailures,
    )
  }
  validateDarkImplementationCatalog(source, filename, darkTokens, format, hardFailures, tokens, darkModeContract)
}

function dtcgTokenCatalog(dtcg) {
  const result = new Map()
  for (const [name, token] of Object.entries(dtcg?.color || {})) {
    if (isObject(token) && '$value' in token) result.set(`color.${name}`, String(token.$value))
  }
  const arrayGroup = (prefix, group) => {
    const values = Array.isArray(group?.$value) ? group.$value : []
    values.forEach((value, index) => result.set(`${prefix}.${index + 1}`, String(value)))
  }
  arrayGroup('typography.font-family', dtcg?.typography?.fontFamilies)
  arrayGroup('typography.font-stack', dtcg?.typography?.fontStacks)
  arrayGroup('typography.font-size', dtcg?.typography?.fontSizes)
  arrayGroup('typography.font-weight', dtcg?.typography?.fontWeights)
  arrayGroup('typography.line-height', dtcg?.typography?.lineHeights)
  arrayGroup('typography.letter-spacing', dtcg?.typography?.letterSpacing)
  const objectGroup = (prefix, group, indexForName) => {
    for (const [name, token] of Object.entries(group || {})) {
      const index = indexForName(name)
      if (index !== null && isObject(token) && '$value' in token) result.set(`${prefix}.${index}`, String(token.$value))
    }
  }
  objectGroup('spacing', dtcg?.spacing, (name) => (/^[1-9]\d*$/.test(name) ? Number(name) : null))
  objectGroup('radius', dtcg?.borderRadius, (name) => {
    const named = RADIUS_NAMES.indexOf(name)
    if (named >= 0) return named + 1
    return /^\d+$/.test(name) && Number(name) >= RADIUS_NAMES.length ? Number(name) + 1 : null
  })
  objectGroup('shadow', dtcg?.shadow, (name) => {
    const named = SHADOW_NAMES.indexOf(name)
    if (named >= 0) return named + 1
    return /^\d+$/.test(name) && Number(name) >= SHADOW_NAMES.length ? Number(name) + 1 : null
  })
  objectGroup('z-index', dtcg?.zIndex, (name) => (/^[1-9]\d*0$/.test(name) ? Number(name) / 10 : null))
  objectGroup('transition', dtcg?.transition, (name) => {
    const named = DURATION_NAMES.indexOf(name)
    if (named >= 0) return named + 1
    const fallback = /^duration-([1-9]\d*)$/.exec(name)
    return fallback ? Number(fallback[1]) : null
  })
  const borders = dtcg?.$extensions?.['com.imprint.borders']
  if (Array.isArray(borders)) borders.forEach((value, index) => result.set(`border.${index + 1}`, String(value)))
  return result
}

function validateDtcgKeys(dtcg, tokens, hardFailures, allowDark = false) {
  const expectedGroups = {
    color: Object.keys(tokens?.colors || {}),
    typography: [
      'fontFamilies',
      'fontStacks',
      'fontSizes',
      'fontWeights',
      'lineHeights',
      ...((tokens?.typography?.letterSpacings?.length || 0) > 0 ? ['letterSpacing'] : []),
    ],
    spacing: (tokens?.spacing || []).map((_value, index) => `${index + 1}`),
    borderRadius: (tokens?.radii || []).map((_value, index) => RADIUS_NAMES[index] || `${index}`),
    shadow: (tokens?.shadows || []).map((_value, index) => SHADOW_NAMES[index] || `${index}`),
    zIndex: (tokens?.zIndices || []).map((_value, index) => `${(index + 1) * 10}`),
    transition: (tokens?.transitions || []).map((_value, index) => DURATION_NAMES[index] || `duration-${index + 1}`),
  }
  const expectedTypeFor = (group, name) => {
    if (group === 'color') return 'color'
    if (group === 'typography') {
      return {
        fontFamilies: 'fontFamily',
        fontStacks: 'fontFamily',
        fontSizes: 'dimension',
        fontWeights: 'fontWeight',
        lineHeights: 'number',
        letterSpacing: 'dimension',
      }[name]
    }
    return {
      spacing: 'dimension',
      borderRadius: 'dimension',
      shadow: 'shadow',
      zIndex: 'number',
      transition: 'duration',
    }[group]
  }
  for (const [group, expectedNames] of Object.entries(expectedGroups)) {
    const actualGroup = isObject(dtcg?.[group]) ? dtcg[group] : {}
    const actualNames = Object.keys(actualGroup)
    for (const name of expectedNames) {
      if (!actualNames.includes(name)) hardFailures.push(`missing-dtcg-key:${group}.${name}`)
    }
    for (const name of actualNames) {
      if (!expectedNames.includes(name)) hardFailures.push(`unexpected-dtcg-key:${group}.${name}`)
      const token = actualGroup[name]
      const expectedType = expectedTypeFor(group, name)
      const valueShapeValid = (() => {
        if (!isObject(token)) return false
        if (group === 'typography') {
          if (!Array.isArray(token.$value)) return false
          return token.$value.every((value) =>
            name === 'lineHeights' ? finite(value) : typeof value === 'string' && value.length > 0,
          )
        }
        if (group === 'zIndex') return finite(token.$value)
        return typeof token.$value === 'string' && token.$value.length > 0
      })()
      if (
        !expectedType ||
        !isObject(token) ||
        stableJson(Object.keys(token).sort()) !== stableJson(['$type', '$value']) ||
        token.$type !== expectedType ||
        !valueShapeValid
      ) {
        hardFailures.push(`invalid-dtcg-token-shape:${group}.${name}`)
      }
    }
  }
  const allowedRootKeys = new Set([
    '$schema',
    '$extensions',
    ...Object.keys(expectedGroups),
    ...(allowDark ? ['dark'] : []),
  ])
  for (const key of Object.keys(dtcg || {})) {
    if (!allowedRootKeys.has(key)) hardFailures.push(`unexpected-dtcg-root-key:${key}`)
  }
}

function pageRefFailures(evidence, pathLabel, routeIds, canonicalCaptureByRoute) {
  const failures = []
  if (!(routeIds instanceof Set)) return failures
  if (routeIds.size === 0 && finite(evidence?.pageCount) && evidence.pageCount > 0) {
    failures.push(`missing-evidence-route-catalog:${pathLabel}`)
  }
  if (!Array.isArray(evidence?.pageRefs)) {
    failures.push(`missing-evidence-page-refs:${pathLabel}`)
    return failures
  }
  const pageRefs = evidence.pageRefs.filter((value) => typeof value === 'string' && value)
  if (pageRefs.length !== evidence.pageRefs.length || new Set(pageRefs).size !== pageRefs.length) {
    failures.push(`invalid-evidence-page-refs:${pathLabel}`)
  }
  for (const pageRef of pageRefs) {
    if (!routeIds.has(pageRef)) failures.push(`unresolved-evidence-page-ref:${pathLabel}:${pageRef}`)
  }
  if (finite(evidence.pageCount) && new Set(pageRefs).size !== evidence.pageCount) {
    failures.push(`evidence-page-ref-count-mismatch:${pathLabel}`)
  }
  if (canonicalCaptureByRoute instanceof Map) {
    const claimedPages = sortedStrings(evidence?.pages)
    const resolvedPages = pageRefs.map((pageRef) => canonicalCaptureByRoute.get(pageRef)?.page)
    const expectedPages = sortedStrings(resolvedPages)
    if (
      resolvedPages.some((page) => typeof page !== 'string' || !page) ||
      stableJson(claimedPages) !== stableJson(expectedPages)
    ) {
      failures.push(`evidence-page-ref-page-mismatch:${pathLabel}`)
    }
  }
  return failures
}

const DEFERRED_COLOR_CANDIDATE_PROVENANCE_FAILURES = new Set([
  'duplicate-or-invalid-rendered-text-owner',
  'invalid-rendered-text-owner-evidence',
  'missing-rendered-text-owner-evidence',
  'missing-rendered-text-pair-evidence',
  'missing-rendered-text-pair-source',
  'missing-source-implied-paired-surface',
  'missing-source-implied-rendered-text-owner',
  'mixed-rendered-text-owner-viewports',
  'rendered-text-observation-count-mismatch',
  'rendered-text-owner-capture-mismatch',
  'rendered-text-owner-count-mismatch',
  'rendered-text-owner-value-mismatch',
  'rendered-text-page-coverage-mismatch',
  'rendered-text-pair-count-mismatch',
  'rendered-text-pair-role-mismatch',
  'rendered-text-pair-sample-mismatch',
])

function candidateFailures(candidates, label, routeIds, canonicalCaptureByRoute, warnings = []) {
  const failures = []
  const ids = []
  const identities = []
  for (const [index, candidate] of (Array.isArray(candidates) ? candidates : []).entries()) {
    const pathLabel = `${label}.${index}`
    if (!isObject(candidate)) {
      failures.push(`invalid-candidate:${pathLabel}`)
      continue
    }
    if (typeof candidate.id !== 'string' || !candidate.id.startsWith('candidate.')) {
      failures.push(`missing-stable-candidate-id:${pathLabel}`)
    } else {
      ids.push(candidate.id)
    }
    if (typeof candidate.group !== 'string' || typeof candidate.value !== 'string') {
      failures.push(`invalid-candidate-identity:${pathLabel}`)
    } else {
      identities.push(
        [candidate.group, candidate.role || '', candidate.value, candidate.provenance || ''].map(String).join('\u0000'),
      )
    }
    const evidence = candidate.evidence
    if (!isObject(evidence)) {
      failures.push(`missing-candidate-evidence:${pathLabel}`)
      continue
    }
    for (const field of [
      'observationCount',
      'ownerCount',
      'semanticAgreement',
      'pageCount',
      'captureCount',
      'eligiblePageCount',
      'pageSupportRatio',
    ]) {
      if (!finite(evidence[field])) failures.push(`non-finite-candidate-evidence:${pathLabel}.${field}`)
    }
    if (!['low', 'medium', 'high'].includes(evidence.semanticConfidence)) {
      failures.push(`missing-candidate-semantic-confidence:${pathLabel}`)
    }
    if (
      !['foundation', 'component', 'specialized-content', 'local', 'declared-only', 'unknown'].includes(
        evidence.reuseScope,
      )
    ) {
      failures.push(`missing-candidate-reuse-scope:${pathLabel}`)
    }
    if (typeof candidate.value === 'string' && evidence.value !== candidate.value) {
      failures.push(`candidate-evidence-value-mismatch:${pathLabel}`)
    }
    if (finite(evidence.semanticAgreement) && (evidence.semanticAgreement < 0 || evidence.semanticAgreement > 1)) {
      failures.push(`candidate-semantic-agreement-out-of-range:${pathLabel}`)
    }
    if (finite(evidence.pageSupportRatio) && (evidence.pageSupportRatio < 0 || evidence.pageSupportRatio > 1)) {
      failures.push(`candidate-page-support-out-of-range:${pathLabel}`)
    }
    if (
      finite(evidence.pageCount) &&
      finite(evidence.eligiblePageCount) &&
      evidence.pageCount > evidence.eligiblePageCount
    ) {
      failures.push(`candidate-page-count-exceeds-eligible:${pathLabel}`)
    }
    for (const field of ['pages', 'sources', 'reasons']) {
      if (!Array.isArray(evidence[field])) failures.push(`invalid-candidate-evidence-array:${pathLabel}.${field}`)
    }
    failures.push(...pageRefFailures(evidence, `${pathLabel}.pageRefs`, routeIds, canonicalCaptureByRoute))
    const candidateSources = Array.isArray(evidence.sources) ? evidence.sources : []
    const candidateSourceCounts = isObject(evidence.sourceCounts) ? evidence.sourceCounts : {}
    const backgroundSemanticSourceCount = candidateSources
      .filter((source) => String(source).startsWith('semantic:'))
      .reduce((sum, source) => sum + Number(candidateSourceCounts[source] || 0), 0)
    const foundationBackgroundSourceCount = ['semantic:page-canvas', 'semantic:content-surface'].reduce(
      (sum, source) => sum + Number(candidateSourceCounts[source] || 0),
      0,
    )
    if (
      candidate.group === 'colors' &&
      candidate.role === 'background' &&
      evidence.reuseScope === 'foundation' &&
      (foundationBackgroundSourceCount <= 0 ||
        backgroundSemanticSourceCount <= 0 ||
        foundationBackgroundSourceCount / backgroundSemanticSourceCount < 0.6)
    ) {
      failures.push(`foundation-background-candidate-missing-foundation-owner:${pathLabel}`)
    }
    const claimsRenderedText = candidateSources.includes('rendered:text')
    const claimsPairedSurface = candidateSources.includes('observed:text-background-pair')
    const renderedProvenanceFailures = []
    if (
      claimsRenderedText &&
      (!Array.isArray(evidence.renderedTextOwners) || evidence.renderedTextOwners.length === 0)
    ) {
      renderedProvenanceFailures.push(`missing-source-implied-rendered-text-owner:${pathLabel}`)
    }
    if (claimsPairedSurface && !isObject(evidence.pairedSurface)) {
      renderedProvenanceFailures.push(`missing-source-implied-paired-surface:${pathLabel}`)
    }
    if (
      (evidence.renderedTextOwners !== undefined ||
        evidence.pairedSurface !== undefined ||
        claimsRenderedText ||
        claimsPairedSurface) &&
      typeof candidate.group === 'string' &&
      typeof candidate.value === 'string'
    ) {
      const evidencePath = candidate.group === 'colors' ? `colors.${index}` : `${candidate.group}.${index}`
      validateRenderedTextOwnerProvenance(
        evidencePath,
        candidate.value,
        evidence,
        renderedProvenanceFailures,
        canonicalCaptureByRoute,
      )
    }
    for (const failure of renderedProvenanceFailures) {
      const kind = failure.split(':')[0]
      if (candidate.group === 'colors' && DEFERRED_COLOR_CANDIDATE_PROVENANCE_FAILURES.has(kind)) {
        warnings.push(`deferred-color-candidate-provenance:${failure}`)
      } else {
        failures.push(failure)
      }
    }
  }
  for (const id of duplicateValues(ids)) failures.push(`duplicate-candidate-id:${id}`)
  for (const identity of duplicateValues(identities)) failures.push(`duplicate-candidate-identity:${identity}`)
  return failures
}

function meetsPortableFoundationCoverage(evidencePath, item) {
  const permitsPairedCoverage = ['colors.foreground', 'colors.muted-foreground'].includes(evidencePath)
  if (isObject(item.pairedSurface)) return permitsPairedCoverage
  const sources = Array.isArray(item.sources) ? item.sources : []
  const declared = sources.some(
    (source) =>
      String(source).startsWith('css-variable:') ||
      source === 'usage:declaredColor' ||
      source === 'usage:brandTokenColor',
  )
  const rendered = sources.some(
    (source) =>
      source === 'rendered:text' ||
      String(source).startsWith('computed:') ||
      String(source).startsWith('element:') ||
      (String(source).startsWith('usage:') && !['usage:declaredColor', 'usage:brandTokenColor'].includes(source)),
  )
  if (item.eligiblePageCount === 1) {
    return (
      item.pageCount === 1 &&
      ((rendered && item.ownerCount >= 2) ||
        (declared && rendered && item.ownerCount >= 1) ||
        (sources.includes('element:page-background') && item.ownerCount >= 1))
    )
  }
  return (
    item.eligiblePageCount >= 2 &&
    item.pageCount >= 2 &&
    item.pageSupportRatio >= 0.75 &&
    item.ownerCount >= item.pageCount
  )
}

function validateDarkTokenEvidenceEntry(
  evidencePath,
  value,
  item,
  hardFailures,
  routeIds,
  canonicalCaptureByRoute,
  availableCaptureCount,
  requirePortable,
) {
  if (!isObject(item)) {
    hardFailures.push(`invalid-dark-token-evidence:${evidencePath}`)
    return
  }
  for (const field of [
    'observationCount',
    'ownerCount',
    'semanticAgreement',
    'pageCount',
    'captureCount',
    'eligiblePageCount',
    'pageSupportRatio',
  ]) {
    if (!finite(item[field])) hardFailures.push(`non-finite-dark-token-evidence:${evidencePath}.${field}`)
  }
  for (const field of ['observationCount', 'ownerCount', 'pageCount', 'captureCount', 'eligiblePageCount']) {
    if (finite(item[field]) && !Number.isInteger(item[field])) {
      hardFailures.push(`non-integer-dark-token-evidence:${evidencePath}.${field}`)
    }
  }
  for (const field of ['foundationOwnerCount', 'minimumPageFoundationOwnerCount']) {
    if (item[field] !== undefined && (!Number.isInteger(item[field]) || item[field] < 0)) {
      hardFailures.push(`non-integer-dark-token-evidence:${evidencePath}.${field}`)
    }
  }
  for (const [group, counts] of [
    ['sourceCounts', item.sourceCounts],
    ['roleCounts', item.roleCounts],
  ]) {
    for (const [name, count] of Object.entries(isObject(counts) ? counts : {})) {
      if (!Number.isInteger(count) || count < 0) {
        hardFailures.push(`non-integer-dark-token-evidence:${evidencePath}.${group}.${name}`)
      }
    }
  }
  if (finite(item.semanticAgreement) && (item.semanticAgreement < 0 || item.semanticAgreement > 1)) {
    hardFailures.push(`dark-token-semantic-agreement-out-of-range:${evidencePath}`)
  }
  if (finite(item.pageSupportRatio) && (item.pageSupportRatio < 0 || item.pageSupportRatio > 1)) {
    hardFailures.push(`dark-token-page-support-out-of-range:${evidencePath}`)
  }
  if (String(item.value) !== String(value)) hardFailures.push(`dark-token-evidence-value-mismatch:${evidencePath}`)
  if (
    item.ownerCount <= 0 ||
    item.observationCount <= 0 ||
    item.pageCount <= 0 ||
    item.captureCount < item.pageCount ||
    item.captureCount > availableCaptureCount ||
    item.eligiblePageCount < item.pageCount ||
    item.eligiblePageCount !== canonicalCaptureByRoute.size ||
    Math.abs(item.pageSupportRatio - item.pageCount / item.eligiblePageCount) > 0.001
  ) {
    hardFailures.push(`invalid-dark-token-evidence-envelope:${evidencePath}`)
  }
  if (requirePortable && ((item.semanticConfidence || item.confidence) === 'low' || item.reuseScope !== 'foundation')) {
    hardFailures.push(`non-portable-dark-token-evidence:${evidencePath}`)
  }
  if (isObject(item.pairedSurface) && !['colors.foreground', 'colors.muted-foreground'].includes(evidencePath)) {
    hardFailures.push(`unexpected-paired-surface-evidence:${evidencePath}`)
  }
  if (requirePortable && !meetsPortableFoundationCoverage(evidencePath, item)) {
    hardFailures.push(`insufficient-dark-token-foundation-coverage:${evidencePath}`)
  }
  if (
    evidencePath.startsWith('typography.') ||
    ['colors.foreground', 'colors.muted-foreground'].includes(evidencePath)
  ) {
    validateRenderedTextPromotionEvidence(evidencePath, String(value), item, hardFailures, canonicalCaptureByRoute)
  }
  validatePortableGeometryEvidence(evidencePath, String(value), item, hardFailures)
  hardFailures.push(
    ...pageRefFailures(item, `dtcg.dark.tokenEvidence.${evidencePath}.pageRefs`, routeIds, canonicalCaptureByRoute),
  )
}

export function auditDesignDoc(source, file = '<memory>') {
  const parsed = frontMatter(source)
  const hardFailures = [...parsed.errors]
  const limitations = []
  const warnings = []
  const manualReview = [
    'Compare at least one canonical screenshot for palette and typography hierarchy.',
    'Check density, major component semantics, and whether any global claim overstates the observed scope.',
  ]
  const sections = markdownSections(source)
  const sectionLines = Object.fromEntries([...sections].map(([name, lines]) => [name, lines.length]))
  const extension = extensionFor(parsed.value)

  try {
    const lintReport = lint(source)
    for (const finding of lintReport.findings.filter((item) => item.severity === 'error')) {
      hardFailures.push(`design-md-lint:${finding.rule || 'schema'}`)
    }
  } catch {
    hardFailures.push('design-md-lint:unreadable-document')
  }

  if (!extension) hardFailures.push('missing-x-imprint-extension')
  const evidence = extension?.evidence
  if (!evidence || evidence.layer !== 'observed') {
    hardFailures.push('missing-observed-evidence')
  } else {
    if (!finite(evidence.pageCount)) hardFailures.push('non-finite-evidence-page-count')
    else if (!(evidence.pageCount > 0)) hardFailures.push('zero-evidence-page-success')
    if (!finite(evidence.captureCount)) hardFailures.push('non-finite-evidence-capture-count')
    else if (!(evidence.captureCount > 0)) hardFailures.push('zero-evidence-capture-success')
    const coverage = evidence.coverage || {}
    if (coverage.pageCoverage === 'partial') limitations.push('partial-page-coverage')
    if (coverage.captureCoverage?.status === 'partial') limitations.push('partial-capture-coverage')
    if (coverage.assetCoverage?.expected > 0 && coverage.assetCoverage.valid === 0) {
      hardFailures.push('zero-valid-screenshot-assets')
    } else if (coverage.assetCoverage?.status === 'partial') {
      limitations.push('partial-screenshot-asset-coverage')
    }
    if (Array.isArray(coverage.limitations)) limitations.push(...coverage.limitations.map(String))
  }

  const rawLowPortableTokens = extension?.evidence?.tokenConfidence?.low
  if (rawLowPortableTokens !== undefined && !finite(rawLowPortableTokens)) {
    hardFailures.push('non-finite-portable-token-count')
  }
  const lowPortableTokens = finite(rawLowPortableTokens) ? rawLowPortableTokens : 0
  if (lowPortableTokens > 0) hardFailures.push(`low-confidence-portable-tokens:${lowPortableTokens}`)

  const componentSummary = extension?.componentSummary
  const componentDetails = Array.isArray(componentSummary?.details) ? componentSummary.details : []
  for (const detail of componentDetails) {
    if (!finite(detail.reuseConfidence)) {
      hardFailures.push(`non-finite-reuse-component-detail:${detail.name || detail.type || 'unknown'}`)
    } else if (detail.reuseConfidence < COMPONENT_REUSE_THRESHOLD) {
      hardFailures.push(`low-reuse-component-detail:${detail.name || detail.type || 'unknown'}`)
    }
    if (!finite(detail.matchingStyleInstances)) {
      hardFailures.push(`non-finite-component-style-count:${detail.name || detail.type || 'unknown'}`)
    } else if (detail.matchingStyleInstances < 2) {
      hardFailures.push(`singleton-component-detail:${detail.name || detail.type || 'unknown'}`)
    }
  }
  if (componentSummary) {
    for (const field of ['patterns', 'instances', 'reusablePatterns', 'omittedLocalPatterns']) {
      if (!finite(componentSummary[field])) hardFailures.push(`non-finite-component-summary:${field}`)
    }
    const usesBoundedProjection = usesBoundedComponentProjection(extension, componentSummary)
    if (usesBoundedProjection) {
      for (const field of [
        'actionablePatterns',
        'renderedP1Patterns',
        'omittedP1Patterns',
        'yamlComponentContracts',
        'omittedReusablePatterns',
      ]) {
        if (!finite(componentSummary[field])) hardFailures.push(`non-finite-component-summary:${field}`)
      }
      if (componentDetails.length > 0) hardFailures.push('duplicate-component-summary-details')
      if (
        finite(componentSummary.actionablePatterns) &&
        finite(componentSummary.reusablePatterns) &&
        componentSummary.actionablePatterns > componentSummary.reusablePatterns
      ) {
        hardFailures.push('component-actionable-count-invalid')
      }
      if (
        finite(componentSummary.renderedP1Patterns) &&
        finite(componentSummary.omittedP1Patterns) &&
        componentSummary.renderedP1Patterns + componentSummary.omittedP1Patterns !== componentSummary.actionablePatterns
      ) {
        hardFailures.push('component-rendered-count-mismatch')
      }
      if (
        finite(componentSummary.yamlComponentContracts) &&
        finite(componentSummary.renderedP1Patterns) &&
        componentSummary.yamlComponentContracts > componentSummary.renderedP1Patterns
      ) {
        hardFailures.push('component-yaml-contract-count-invalid')
      }
    } else if (
      finite(componentSummary.reusablePatterns) &&
      componentSummary.reusablePatterns !== componentDetails.length
    ) {
      hardFailures.push('component-reusable-count-mismatch')
    }
  }

  const previewItems = candidatePreviewItems(extension)
  if (previewItems.some(({ value }) => value && typeof value === 'object' && Array.isArray(value.sources))) {
    hardFailures.push('candidate-preview-contains-source-arrays')
  }
  for (const [kind, values] of Object.entries(extension?.candidates || {})) {
    if (Array.isArray(values) && values.length > CANDIDATE_PREVIEW_LIMIT) {
      hardFailures.push(`candidate-preview-over-limit:${kind}:${values.length}`)
    }
    if (!Array.isArray(values)) continue
    for (const [index, preview] of values.entries()) {
      if (!isObject(preview) || stableJson(Object.keys(preview).sort()) !== stableJson(['pageCount', 'value'])) {
        hardFailures.push(`candidate-preview-unbounded-fields:${kind}:${index}`)
        continue
      }
      if (typeof preview.value !== 'string' || !finite(preview.pageCount) || preview.pageCount < 0) {
        hardFailures.push(`invalid-candidate-preview:${kind}:${index}`)
      }
    }
    const summary = extension?.candidateSummary?.[kind]
    if (isObject(summary)) {
      if (summary.included !== values.length) hardFailures.push(`candidate-preview-included-count-mismatch:${kind}`)
      if (finite(summary.total) && finite(summary.omitted) && summary.total !== values.length + summary.omitted) {
        hardFailures.push(`candidate-preview-omitted-count-mismatch:${kind}`)
      }
    }
  }

  const componentText = (sections.get('Components') || []).join('\n')
  const componentRecipeHeadings = [...componentText.matchAll(/^#### (.+)$/gm)].map((match) => match[1].trim())
  for (const duplicate of duplicateValues(componentRecipeHeadings)) {
    hardFailures.push(`duplicate-component-recipe:${duplicate}`)
  }
  if (/\| Type \| Instances \|/.test(componentText) && componentRecipeHeadings.length > 0) {
    hardFailures.push('duplicate-component-table-and-recipes')
  }
  if (
    /\| Type \| Instances \| Identity confidence \| Reuse confidence \| Reuse scope \| Representative styles \|/.test(
      componentText,
    ) ||
    /\| 类型 \| 实例数 \| 身份置信度 \| 复用置信度 \| 复用范围 \| 代表样式 \|/.test(componentText)
  ) {
    hardFailures.push('unbounded-component-detail-table')
  }
  if (/^- \*\*[^*\n]*(?:responsive|响应式)[^*\n]*\*\*/im.test(componentText)) {
    hardFailures.push('component-recipe-contains-section-responsive-claim')
  }

  const p1ReuseValues = [...componentText.matchAll(/(?:reuse|复用)\s+([01](?:\.\d+)?)/gi)].map((match) =>
    Number(match[1]),
  )
  if (p1ReuseValues.some((value) => value < COMPONENT_REUSE_THRESHOLD)) {
    hardFailures.push('low-reuse-p1-recipe')
  }
  const p1MatchCounts = [...componentText.matchAll(/(?:^|\n)_([0-9]+)\s+(?:representative-style|个代表样式)/g)].map(
    (match) => Number(match[1]),
  )
  if (p1MatchCounts.some((value) => value < 2)) hardFailures.push('singleton-p1-recipe')

  if (
    componentSummary &&
    finite(componentSummary.patterns) &&
    finite(componentSummary.reusablePatterns) &&
    componentSummary.patterns < componentSummary.reusablePatterns
  ) {
    hardFailures.push('component-pattern-count-invalid')
  }
  if (source.trim().length === 0) hardFailures.push('empty-document')
  if ((sections.get('Components') || []).length === 0) warnings.push('missing-components-section')

  const uniqueHardFailures = [...new Set(hardFailures)]
  const uniqueLimitations = [...new Set(limitations)]
  return {
    file,
    classification:
      uniqueHardFailures.length > 0
        ? 'analyzer-failure'
        : uniqueLimitations.length > 0
          ? 'degraded-but-truthful'
          : 'pass',
    hardFailures: uniqueHardFailures,
    limitations: uniqueLimitations,
    warnings,
    manualReview,
    metrics: {
      totalLines: source.split(/\r?\n/).length,
      sectionLines,
      pageCount: Number(evidence?.pageCount || 0),
      captureCount: Number(evidence?.captureCount || 0),
      lowPortableTokens,
      componentPatterns: Number(componentSummary?.patterns || 0),
      reusableComponentPatterns: Number(componentSummary?.reusablePatterns || 0),
      componentDetails: componentDetails.length,
      p1Recipes: componentRecipeHeadings.length,
      candidatePreviewItems: previewItems.length,
    },
  }
}

async function readBundleFile(directory, filename, hardFailures) {
  const file = path.join(directory, filename)
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile()) throw new Error('not-file')
    return await fs.readFile(file, 'utf8')
  } catch {
    hardFailures.push(`missing-bundle-artifact:${filename}`)
    return null
  }
}

function parseJsonArtifact(source, filename, hardFailures) {
  if (source === null) return null
  try {
    const document = parseDocument(source, { prettyErrors: true, uniqueKeys: true })
    if (document.errors.some((error) => error.code === 'DUPLICATE_KEY')) {
      hardFailures.push(`duplicate-json-key:${filename}`)
      return null
    }
    return JSON.parse(source)
  } catch {
    hardFailures.push(`invalid-json-artifact:${filename}`)
    return null
  }
}

function pngDimensions(buffer) {
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer.toString('ascii', 1, 4) !== 'PNG' ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

async function validateScreenshotAssets(evidence, directory, hardFailures, limitations) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : []
  let validOverviewPages = 0
  let listedImages = 0
  const imageIds = []
  for (const [pageIndex, page] of pages.entries()) {
    const images = Array.isArray(page?.images) ? page.images : []
    let validOverview = false
    let latestImageCapturedAt = Number.NEGATIVE_INFINITY
    for (const [imageIndex, image] of images.entries()) {
      listedImages += 1
      const label = `evidence.pages.${pageIndex}.images.${imageIndex}`
      if (!isObject(image) || typeof image.id !== 'string' || !image.id) {
        hardFailures.push(`invalid-screenshot-record:${label}`)
        continue
      }
      imageIds.push(image.id)
      const imageCapturedAt = Date.parse(String(image.capturedAt || ''))
      if (!Number.isFinite(imageCapturedAt)) {
        hardFailures.push(`missing-screenshot-captured-at:${label}`)
      } else {
        latestImageCapturedAt = Math.max(latestImageCapturedAt, imageCapturedAt)
      }
      if (typeof image.path !== 'string' || !image.path.trim()) {
        hardFailures.push(`missing-screenshot-path:${label}`)
        continue
      }
      if (!finite(image.width) || image.width <= 0 || !finite(image.height) || image.height <= 0) {
        hardFailures.push(`invalid-screenshot-metadata-dimensions:${label}`)
      }
      const file = path.isAbsolute(image.path) ? image.path : path.resolve(directory, image.path)
      let buffer
      try {
        buffer = await fs.readFile(file)
      } catch {
        hardFailures.push(`missing-screenshot-asset:${label}`)
        continue
      }
      const dimensions = pngDimensions(buffer)
      if (!dimensions) {
        hardFailures.push(`unreadable-screenshot-dimensions:${label}`)
        continue
      }
      if (dimensions.width !== image.width || dimensions.height !== image.height) {
        hardFailures.push(`screenshot-dimension-mismatch:${label}`)
        continue
      }
      const hash = createHash('sha256').update(buffer).digest('hex')
      if (typeof image.contentHash !== 'string' || !image.contentHash) {
        hardFailures.push(`missing-screenshot-content-hash:${label}`)
        continue
      }
      if (image.contentHash !== hash) {
        hardFailures.push(`screenshot-content-hash-mismatch:${label}`)
        continue
      }
      if (image.kind === 'overview') validOverview = true
    }
    const finalHealthCheckedAt = Date.parse(String(page?.health?.checkedAt || ''))
    if (!Number.isFinite(finalHealthCheckedAt)) {
      hardFailures.push(`missing-final-capture-health:evidence.pages.${pageIndex}`)
    } else if (latestImageCapturedAt > finalHealthCheckedAt) {
      hardFailures.push(`stale-final-capture-health:evidence.pages.${pageIndex}`)
    }
    if (validOverview) validOverviewPages += 1
  }
  for (const id of duplicateValues(imageIds)) hardFailures.push(`duplicate-screenshot-id:${id}`)

  const recomputed = {
    expected: pages.length,
    valid: validOverviewPages,
    status: validOverviewPages >= pages.length ? 'complete' : 'partial',
    issueCount: Math.max(0, pages.length - validOverviewPages),
  }
  const reported = evidence?.coverage?.assetCoverage
  if (!isObject(reported)) {
    hardFailures.push('missing-evidence-asset-coverage')
  } else {
    for (const field of ['expected', 'valid', 'status', 'issueCount']) {
      if (reported[field] !== recomputed[field]) hardFailures.push(`evidence-asset-coverage-mismatch:${field}`)
    }
  }
  if (pages.length > 0 && validOverviewPages === 0) hardFailures.push('zero-valid-screenshot-assets')
  else if (validOverviewPages < pages.length) limitations.push('partial-screenshot-asset-coverage')
  return { ...recomputed, listedImages }
}

function validateTokenReferences(value, catalog, label, hardFailures) {
  for (const item of collectNamedArrays(value, new Set(['tokenRefs']))) {
    item.values.forEach((ref, index) => {
      if (typeof ref !== 'string' || !catalog.has(ref)) {
        hardFailures.push(`unresolved-token-ref:${label}.${item.path}.${index}:${String(ref)}`)
      }
    })
  }
}

function validateGuidanceScope(source, profile, hardFailures) {
  const grammar = profile?.transferGrammar
  if (!isObject(grammar)) return
  if (!Array.isArray(grammar.coreRules)) hardFailures.push('invalid-transfer-core-rules')
  const coreRules = Array.isArray(grammar.coreRules) ? grammar.coreRules : []
  const coreCategories = new Set(coreRules.map((rule) => rule?.category).filter(Boolean))
  const unscopedPatterns = {
    color: [
      /Use the defined color tokens instead of hardcoded hex values/,
      /Don't (?:introduce|present) new colors/,
      /使用已定义的颜色令牌，不要硬编码色值/,
      /不要引入色板之外的新颜色/,
      /不要把新颜色当成页面观察值/,
    ],
    density: [
      /Follow the spacing scale for consistent rhythm/,
      /Use the spacing scale for recurring rhythm/,
      /Don't mix different spacing systems/,
      /遵循间距刻度保持一致节奏/,
      /重复间距优先使用间距刻度/,
      /不要混用不同的间距体系/,
    ],
    typography: [
      /Use `[^`]+` as the primary font stack/,
      /Don't mix multiple font families/,
      /Don't use font weights outside/,
      /使用 `[^`]+` 作为主字体栈/,
      /不要混用多种字体/,
      /不要使用以下之外的字重/,
    ],
    shape: [
      /Use generous border-radius/,
      /Keep border-radius minimal/,
      /Use compact radii on ordinary surfaces/,
      /使用较大的圆角/,
      /保持小圆角/,
      /普通表面使用小圆角/,
    ],
    surface: [
      /Use elevation \(shadows\) to create visual hierarchy/,
      /No stable shadow scale was observed; prefer observed borders/,
      /用阴影层级建立视觉层次/,
      /未观察到稳定的阴影刻度；优先使用已观察到的边框/,
    ],
    composition: [
      /Preserve the observed responsive behavior across viewports/,
      /Breakpoints were declared, but responsive behavior was not observed/,
      /保留已观察到的响应式行为及其视口差异/,
      /已声明断点，但本次捕获未观察到响应式行为/,
    ],
  }
  for (const [category, patterns] of Object.entries(unscopedPatterns)) {
    if (coreCategories.has(category)) continue
    if (patterns.some((pattern) => pattern.test(source))) {
      hardFailures.push(`unscoped-agent-guidance-without-p0:${category}`)
    }
  }
}

function reportedIndependentOwnerCount(line) {
  const match = /\((\d+) independent owners\)|（(\d+) 个独立元素）/.exec(line)
  return match ? Number(match[1] || match[2]) : null
}

function validateDesignDocOwnerCounts(source, tokens, hardFailures) {
  const lines = String(source || '').split(/\r?\n/)
  for (const line of lines) {
    const match = /^\|\s*`--color-([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*(\d+)×/.exec(line)
    if (!match) continue
    const evidence = tokens?.evidence?.[`colors.${match[1]}`]
    if (evidence && Number(match[3]) !== evidence.ownerCount) {
      hardFailures.push(`design-doc-owner-count-mismatch:colors.${match[1]}`)
    }
  }
  const ownerCountGroups = [
    {
      group: 'spacing',
      values: tokens?.spacing,
      lines: markdownSubsectionLines(
        source,
        new Set(['Reusable Spacing Scale', 'Reusable Spacing Candidates', '可复用间距刻度', '可复用间距候选']),
      ),
      linePattern: (index) => new RegExp(`^(?:- Level ${index + 1}:|- 级别 ${index + 1}:)`),
    },
    {
      group: 'radii',
      values: tokens?.radii,
      lines: markdownSubsectionLines(source, new Set(['Corner Radius Scale', '圆角刻度'])),
      linePattern: (index) => new RegExp(`^- ${RADIUS_NAMES[index] || index}:`),
    },
  ]
  for (const { group, values, lines: groupLines, linePattern } of ownerCountGroups) {
    for (const [index, value] of (Array.isArray(values) ? values : []).entries()) {
      const evidence = tokens?.evidence?.[`${group}.${index}`]
      if (!finite(evidence?.ownerCount) || evidence.ownerCount <= 0) continue
      const matchingLines = groupLines.filter((line) => linePattern(index).test(line) && line.includes(`\`${value}\``))
      const reported = matchingLines.map(reportedIndependentOwnerCount).find((count) => count !== null)
      if (reported !== evidence.ownerCount) hardFailures.push(`design-doc-owner-count-mismatch:${group}.${index}`)
    }
  }
}

function validateTypographyFamilyProjection(source, tokens, evidence, profile, hardFailures) {
  const language =
    profile?.language === 'zh-CN'
      ? 'zh-CN'
      : profile?.language === 'en'
        ? 'en'
        : evidence?.source?.language === 'zh-CN'
          ? 'zh-CN'
          : 'en'
  const typographyLocale = DESIGN_DOC_LOCALES[language]?.typography || {}
  const families = Array.isArray(tokens?.typography?.fontFamilies) ? tokens.typography.fontFamilies : []
  const values = families.join(', ') || typographyLocale.noPortableFamilies
  const expected = interpolateTemplate(typographyLocale.families, { values })
  const lines = String(source || '').split(/\r?\n/)
  const typographyHeadingIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line === '## Typography')
    .map(({ index }) => index)
  const familyPrefixes = ['**Font families:**', '**字体族：**']
  const familyLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => familyPrefixes.some((prefix) => line.startsWith(prefix)))
  const headingIndex = typographyHeadingIndexes[0] ?? -1
  const sectionEnd =
    headingIndex < 0 ? -1 : lines.findIndex((line, index) => index > headingIndex && /^##\s+/.test(line))
  const ownedFamilyLines = familyLines.filter(
    ({ index }) => headingIndex >= 0 && index > headingIndex && (sectionEnd < 0 || index < sectionEnd),
  )
  if (
    typographyHeadingIndexes.length !== 1 ||
    familyLines.length !== 1 ||
    ownedFamilyLines.length !== 1 ||
    ownedFamilyLines[0]?.line !== expected
  ) {
    hardFailures.push('design-doc-typography-family-projection-mismatch')
  }
}

function markdownSubsectionLines(source, headings) {
  const lines = String(source || '').split(/\r?\n/)
  const result = []
  let collecting = false
  for (const line of lines) {
    const heading = /^###\s+(.+)$/.exec(line)
    if (heading) {
      if (collecting) break
      collecting = headings.has(heading[1].trim())
      continue
    }
    if (collecting && /^##\s+/.test(line)) break
    if (collecting) result.push(line)
  }
  return result
}

function canonicalTokenEvidenceCaptureByRoute(evidence) {
  const result = new Map()
  const canonicalPageIds = canonicalEvidencePageIds(evidence)
  for (const page of Array.isArray(evidence?.pages) ? evidence.pages : []) {
    const routeId = typeof page?.routeId === 'string' ? page.routeId : ''
    const pageUrl = typeof page?.url === 'string' ? page.url : ''
    const viewport = typeof page?.viewport === 'string' ? page.viewport : ''
    if (!routeId || !pageUrl || !viewport || !canonicalPageIds.has(page?.id)) continue
    result.set(routeId, { page: pageUrl, viewport })
  }
  return result
}

function canonicalDarkTokenEvidenceCaptureByRoute(evidence) {
  // Dark extraction currently samples the entry route only. Use that real sampling catalog as the denominator;
  // requiring all base routes here would turn unobserved routes into fictitious dark evidence.
  const captures = canonicalTokenEvidenceCaptureByRoute(evidence)
  const entryRouteId = explicitAuditSourceRouteIdentity(evidence)
  const entryCapture = entryRouteId ? captures.get(entryRouteId) : undefined
  return entryRouteId && entryCapture ? new Map([[entryRouteId, entryCapture]]) : new Map()
}

function canonicalEvidencePageIds(evidence) {
  const pagesByRoute = new Map()
  for (const page of Array.isArray(evidence?.pages) ? evidence.pages : []) {
    const route = evidencePageRouteIdentity(page)
    const pages = pagesByRoute.get(route) || []
    pages.push(page)
    pagesByRoute.set(route, pages)
  }
  const viewportRank = (viewport) =>
    viewport === 'desktop' ? 0 : viewport === 'tablet' ? 1 : viewport === 'mobile' ? 2 : 3
  const severeOverflow = (page) =>
    Boolean(
      page?.horizontalOverflow &&
      finite(page?.viewportWidth) &&
      finite(page?.contentWidth) &&
      page.contentWidth - page.viewportWidth >= 64 &&
      page.contentWidth / page.viewportWidth >= 2.5,
    )
  const result = new Set()
  for (const pages of pagesByRoute.values()) {
    const selected = pages
      .filter((page) => page?.health?.evidenceEligible !== false && !severeOverflow(page))
      .sort(
        (first, second) =>
          viewportRank(first?.viewport) - viewportRank(second?.viewport) ||
          (Number(second?.viewportWidth) || 0) - (Number(first?.viewportWidth) || 0) ||
          String(first?.id || '').localeCompare(String(second?.id || '')),
      )[0]
    if (typeof selected?.id === 'string') result.add(selected.id)
  }
  return result
}

function documentUrlIdentity(value) {
  try {
    const url = new URL(String(value || ''))
    url.username = ''
    url.password = ''
    url.hash = ''
    return url.href
  } catch {
    return String(value || '').split('#', 1)[0]
  }
}

function explicitAuditSourceRouteIdentity(evidence) {
  if (typeof evidence?.source?.routeId === 'string' && evidence.source.routeId) return evidence.source.routeId
  const sourceUrl = evidence?.source?.finalUrl || evidence?.source?.requestedUrl
  if (!sourceUrl) return undefined
  const sourceIdentity = documentUrlIdentity(sourceUrl)
  const matchingPages = (Array.isArray(evidence?.pages) ? evidence.pages : []).filter(
    (page) => documentUrlIdentity(page?.url) === sourceIdentity,
  )
  const routeIds = new Set(
    matchingPages.map((page) => page?.routeId).filter((routeId) => typeof routeId === 'string' && routeId),
  )
  if (matchingPages.length === 0 || routeIds.size !== 1 || matchingPages.some((page) => !page?.routeId)) {
    return undefined
  }
  return [...routeIds][0]
}

function canonicalAuditSummaryPage(evidence) {
  const canonicalPages = canonicalEvidencePageIds(evidence)
  const entryRouteId = explicitAuditSourceRouteIdentity(evidence)
  return (Array.isArray(evidence?.pages) ? evidence.pages : [])
    .filter((page) => canonicalPages.has(page?.id))
    .sort(
      (first, second) =>
        Number(evidencePageRouteIdentity(second) === entryRouteId) -
          Number(evidencePageRouteIdentity(first) === entryRouteId) ||
        evidencePageRouteIdentity(first).localeCompare(evidencePageRouteIdentity(second)) ||
        String(first?.id || '').localeCompare(String(second?.id || '')),
    )[0]
}

function compactConsecutiveTopology(values) {
  const compacted = []
  for (let index = 0; index < values.length;) {
    const value = values[index]
    let count = 1
    while (values[index + count] === value) count += 1
    compacted.push(count > 1 ? `${value} ×${count}` : value)
    index += count
  }
  return compacted
}

function auditReconstructionRole(role, chinese) {
  const normalized = !role || role === 'unknown' ? 'content' : role
  if (!chinese) return normalized
  return (
    {
      header: '顶栏',
      navigation: '导航',
      hero: '首屏',
      content: '内容',
      'feature-group': '功能组',
      media: '媒体',
      action: '操作区',
      aside: '侧栏',
      footer: '页脚',
    }[normalized] || normalized
  )
}

function auditPageSectionTopology(evidence, pageId, chinese) {
  const topology = (Array.isArray(evidence?.topology?.pages) ? evidence.topology.pages : []).find(
    (page) => page?.pageId === pageId,
  )
  if (!topology || !Array.isArray(topology.sectionIds)) return ''
  const sections = Array.isArray(evidence?.sections) ? evidence.sections : []
  const orderedSections = topology.sectionIds.flatMap((id) => {
    const section = sections.find((candidate) => candidate?.id === id && candidate?.pageId === pageId)
    return section ? [section] : []
  })
  const sectionById = new Map(orderedSections.map((section) => [section.id, section]))
  const childrenByParent = new Map()
  for (const section of orderedSections) {
    if (!section?.parentSectionId || !sectionById.has(section.parentSectionId)) continue
    const children = childrenByParent.get(section.parentSectionId) || []
    children.push(section)
    childrenByParent.set(section.parentSectionId, children)
  }
  const render = (section, ancestors, parentRole) => {
    if (ancestors.has(section.id)) return []
    const nextAncestors = new Set(ancestors).add(section.id)
    const childParentRole = section.role === 'unknown' ? parentRole : section.role
    const children = compactConsecutiveTopology(
      (childrenByParent.get(section.id) || []).flatMap((child) => render(child, nextAncestors, childParentRole)),
    )
    if (section.role === 'unknown') return children
    if (section.role === parentRole) return children
    const role = auditReconstructionRole(section.role, chinese)
    return [children.length > 0 ? `${role} (${children.join(' → ')})` : role]
  }
  const roots = orderedSections.filter(
    (section) => !section.parentSectionId || !sectionById.has(section.parentSectionId),
  )
  return compactConsecutiveTopology(
    (roots.length > 0 ? roots : orderedSections).flatMap((section) => render(section, new Set())),
  ).join(' → ')
}

function validateReconstructionSummaryHierarchy(source, evidence, hardFailures) {
  const summaryLines = markdownSubsectionLines(source, new Set(['Reconstruction Summary', '重建摘要']))
  const hierarchyLabels = new Set(['Entry-page section hierarchy', 'Section hierarchy', '入口页区块层级', '区块层级'])
  const hierarchyLines = summaryLines.filter((line) => {
    const label = /^-\s+\*\*([^:]+):\*\*/.exec(line)?.[1]
    return label && hierarchyLabels.has(label)
  })
  const summaryPage = canonicalAuditSummaryPage(evidence)
  if (!summaryPage) {
    if (hierarchyLines.length > 0) hardFailures.push('unexpected-reconstruction-summary-hierarchy')
    return
  }
  const chinese = summaryLines.some((line) => line.includes('**入口页区块层级:**') || line.includes('**区块层级:**'))
  const hierarchy = auditPageSectionTopology(evidence, summaryPage.id, chinese)
  if (!hierarchy) {
    if (hierarchyLines.length > 0) hardFailures.push('unexpected-reconstruction-summary-hierarchy')
    return
  }
  const routeCount = new Set((evidence.pages || []).map(evidencePageRouteIdentity)).size
  const label = chinese
    ? routeCount > 1
      ? '入口页区块层级'
      : '区块层级'
    : routeCount > 1
      ? 'Entry-page section hierarchy'
      : 'Section hierarchy'
  const expected = `- **${label}:** ${hierarchy}`
  if (hierarchyLines.length === 0) hardFailures.push('missing-reconstruction-summary-hierarchy')
  else if (hierarchyLines.length !== 1 || hierarchyLines[0] !== expected) {
    hardFailures.push('reconstruction-summary-hierarchy-mismatch')
  }
}

function validateTypographyRoleOwnerCounts(source, evidence, hardFailures) {
  const canonicalPages = canonicalEvidencePageIds(evidence)
  const expected = new Map()
  for (const node of Array.isArray(evidence?.layoutNodes) ? evidence.layoutNodes : []) {
    if (!canonicalPages.has(node?.pageId) || typeof node?.textRole !== 'string') continue
    expected.set(node.textRole, (expected.get(node.textRole) || 0) + 1)
  }
  if (expected.size === 0) return

  const lines = markdownSubsectionLines(source, new Set(['Typography Role Evidence', '排版角色证据']))
  if (lines.length === 0) {
    hardFailures.push('missing-typography-role-evidence')
    return
  }
  if (
    !lines.some(
      (line) =>
        line.includes('one evidence-eligible canonical capture per route without severe horizontal overflow') ||
        line.includes('每个路由只使用一次证据有效且无严重溢出的代表性捕获'),
    )
  ) {
    hardFailures.push('typography-role-count-basis-statement-missing')
  }
  if (!lines.some((line) => /Independent owners|独立元素数/.test(line))) {
    hardFailures.push('typography-role-count-basis-missing')
  }
  const reported = new Map()
  for (const line of lines) {
    const match = /^\|\s*`(display|heading|body|label|metadata)`\s*\|\s*(\d+)\s*\|/.exec(line)
    if (match) reported.set(match[1], Number(match[2]))
  }
  for (const [role, count] of expected) {
    if (reported.get(role) !== count) hardFailures.push(`design-doc-typography-owner-count-mismatch:${role}`)
  }
  for (const role of reported.keys()) {
    if (!expected.has(role)) hardFailures.push(`unexpected-design-doc-typography-role:${role}`)
  }
}

function validateScopedStructuralFacts(source, hardFailures) {
  const lines = markdownSubsectionLines(source, new Set(['Structural Facts', '结构事实']))
  for (const line of lines.filter((candidate) => /^-\s+/.test(candidate))) {
    if (!/(?:\bscope:|范围：)/.test(line)) hardFailures.push('unscoped-structural-fact')
  }
}

function expectedOverflowTopologyLines(evidence, chinese) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : []
  const groups = new Map()
  for (const page of pages) {
    if (!page?.horizontalOverflow || !page.viewportWidth || !page.contentWidth) continue
    const key = `${page.viewport}|${page.contentWidth}|${page.viewportWidth}`
    const group = groups.get(key) || {
      viewport: page.viewport,
      viewportWidth: page.viewportWidth,
      contentWidth: page.contentWidth,
      pagesByRoute: new Map(),
    }
    group.pagesByRoute.set(evidencePageRouteIdentity(page), page)
    groups.set(key, group)
  }
  const publicLabel = (page) => {
    const routes = new Set(
      pages.filter((candidate) => candidate?.url === page.url).map((candidate) => evidencePageRouteIdentity(candidate)),
    )
    return routes.size > 1 ? `${page.url} [${evidencePageRouteIdentity(page)}]` : page.url
  }
  return [...groups.values()].map((group) => {
    const groupedPages = [...group.pagesByRoute.values()]
    const scopes = [...new Set(groupedPages.map(publicLabel))]
    const displayed = scopes.slice(0, 3)
    if (scopes.length > displayed.length) {
      displayed.push(
        chinese ? `另 ${scopes.length - displayed.length} 个范围` : `+${scopes.length - displayed.length} more scopes`,
      )
    }
    const examples = displayed.join('; ')
    const count = groupedPages.length
    const scope = chinese
      ? `\`${group.viewport}\` · ${count} 个路由 · 示例：${examples}`
      : `\`${group.viewport}\` · ${count} ${count === 1 ? 'route · example' : 'routes · examples'}: ${examples}`
    return chinese
      ? `- ${scope}：检测到横向溢出（内容 ${group.contentWidth}px > 视口 ${group.viewportWidth}px）；视口外内容不能视为已隐藏或已重排`
      : `- ${scope}: horizontal overflow observed (content ${group.contentWidth}px > viewport ${group.viewportWidth}px); off-screen content is not evidence of hiding or reflow`
  })
}

function validateGroupedPageTopology(source, evidence, hardFailures) {
  const lines = markdownSubsectionLines(source, new Set(['Page Topology', '页面拓扑']))
  const signatures = []
  for (const line of lines) {
    const viewport = /^-\s+`([^`]+)`/.exec(line)?.[1]
    const separator = line.lastIndexOf(': ')
    if (!viewport || separator < 0) continue
    signatures.push(`${viewport}|${line.slice(separator + 2)}`)
  }
  for (const duplicate of duplicateValues(signatures)) {
    hardFailures.push(`duplicate-page-topology-signature:${duplicate}`)
  }
  if (!isObject(evidence)) return
  const chinese = String(source || '').includes('### 页面拓扑')
  const actualOverflow = lines.filter((line) =>
    chinese ? line.includes('检测到横向溢出') : line.includes('horizontal overflow observed'),
  )
  const expectedOverflow = expectedOverflowTopologyLines(evidence, chinese)
  if (stableJson(actualOverflow) !== stableJson(expectedOverflow)) {
    hardFailures.push('page-topology-overflow-groups-mismatch')
  }
}

function validateEvidenceReferences(value, evidenceIds, label, hardFailures) {
  for (const item of collectEvidenceIdFields(value)) {
    if (!evidenceIds.has(item.value)) {
      hardFailures.push(`unresolved-evidence-ref:${label}.${item.path}:${item.value}`)
    }
  }
}

function componentRecipeKey(value) {
  return `${String(value?.component || '')}\u0000${String(value?.variant || 'default')}`
}

function profileExportLocale(language) {
  return PROFILE_EXPORT_LOCALES[language === 'zh-CN' ? 'zh-CN' : 'en']
}

function interpolateTemplate(template, values) {
  return String(template || '').replace(/{{\s*([\w]+)\s*}}/g, (_match, key) => String(values[key] ?? ''))
}

function translatedProfileTerm(value, language) {
  return profileExportLocale(language)?.terms?.[value] || String(value)
}

function auditResponsiveLocaleText(language, key, values = {}) {
  const locale = DESIGN_EVIDENCE_LOCALES[language === 'zh-CN' ? 'zh-CN' : 'en'] || {}
  const responsive = locale.responsive || {}
  const count = Number(values.count)
  const pluralKey = Number.isFinite(count) ? `${key}_${count === 1 ? 'one' : 'other'}` : key
  return interpolateTemplate(responsive[pluralKey] ?? responsive[key] ?? key, values)
}

function auditBoundedResponsivePixelValue(value, maximum = 240) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i)
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  return amount > 0 && amount <= maximum ? value : null
}

function auditTopLevelGridColumnCount(value) {
  if (typeof value !== 'string') return null
  const repeat = value.match(/^repeat\(\s*(\d+)\s*,/i)
  if (repeat) return Number.parseInt(repeat[1], 10)
  let depth = 0
  let count = 0
  let insideTrack = false
  for (const character of value.trim()) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (/\s/.test(character) && depth === 0) {
      if (insideTrack) count += 1
      insideTrack = false
    } else {
      insideTrack = true
    }
  }
  if (insideTrack) count += 1
  return count > 0 ? count : null
}

function auditUsefulResponsiveChange(property, values, sectionRole) {
  if (property.startsWith('rect.') || property === 'visibility' || values?.from === values?.to) return false
  if (property === 'gridTemplateColumns' || property === 'childGridTemplateColumns') {
    if (
      typeof values?.from !== 'string' ||
      typeof values?.to !== 'string' ||
      !values.from.trim() ||
      !values.to.trim()
    ) {
      return false
    }
    const fromColumns = auditTopLevelGridColumnCount(values.from)
    const toColumns = auditTopLevelGridColumnCount(values.to)
    return fromColumns === null || toColumns === null || fromColumns !== toColumns
  }
  if (['node.heading.fontSize', 'layoutMode', 'position', 'order', 'sequenceIndex'].includes(property)) return true
  if (property === 'node.media.height') {
    return Boolean(
      auditBoundedResponsivePixelValue(values?.from, 2000) && auditBoundedResponsivePixelValue(values?.to, 2000),
    )
  }
  if (property === 'height' || property.endsWith('.height')) {
    return (
      ['header', 'navigation', 'action'].includes(sectionRole || '') &&
      Boolean(auditBoundedResponsivePixelValue(values?.from) && auditBoundedResponsivePixelValue(values?.to))
    )
  }
  if (/^border(?:Top|Right|Bottom|Left)$/.test(property)) {
    return [values?.from, values?.to].some((value) => typeof value === 'string' && auditVisibleBorder(value))
  }
  return property === 'boxShadow'
}

function auditConsistentResponsiveSectionIdentity(observation, evidence) {
  const sectionById = new Map((evidence?.sections || []).map((section) => [section?.id, section]))
  const roles = new Set(
    [observation?.sectionId, ...(Array.isArray(observation?.evidenceRefs) ? observation.evidenceRefs : [])].flatMap(
      (id) => {
        const section = sectionById.get(id)
        return section ? [section.role] : []
      },
    ),
  )
  return roles.size <= 1
}

function auditPublicPageScopeLabel(evidence, page) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : []
  const routeIdentities = new Set(
    pages.filter((candidate) => candidate?.url === page?.url).map(evidencePageRouteIdentity),
  )
  return routeIdentities.size > 1 ? `${page.url} [${evidencePageRouteIdentity(page)}]` : page.url
}

function buildAuditResponsiveGroups(evidence) {
  const sections = Array.isArray(evidence?.sections) ? evidence.sections : []
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : []
  const sectionById = new Map(sections.map((section) => [section?.id, section]))
  const pageById = new Map(pages.map((page) => [page?.id, page]))
  const groups = new Map()
  for (const observation of Array.isArray(evidence?.responsiveObservations) ? evidence.responsiveObservations : []) {
    if (!auditConsistentResponsiveSectionIdentity(observation, evidence)) continue
    const section = sectionById.get(observation?.sectionId)
    const changes = Object.entries(isObject(observation?.changes) ? observation.changes : {})
      .filter(([property, values]) => auditUsefulResponsiveChange(property, values, section?.role))
      .sort(([first], [second]) => first.localeCompare(second))
    if (changes.length === 0) continue
    const role = !section?.role || section.role === 'unknown' ? 'content' : section.role
    const properties = changes.map(([property]) => property)
    const changeType = properties.every((property) => ['order', 'sequenceIndex'].includes(property))
      ? 'reorder'
      : observation.changeType
    const signature = JSON.stringify([observation.fromViewport, observation.toViewport, role, changeType, changes])
    const group = groups.get(signature) || {
      fromViewport: observation.fromViewport,
      toViewport: observation.toViewport,
      role,
      changeType,
      changes,
      instanceCount: 0,
      routes: new Map(),
      signature,
    }
    group.instanceCount += 1
    const page = section ? pageById.get(section.pageId) : undefined
    if (page) group.routes.set(evidencePageRouteIdentity(page), page)
    groups.set(signature, group)
  }
  return [...groups.values()].sort(
    (first, second) =>
      second.routes.size - first.routes.size ||
      second.instanceCount - first.instanceCount ||
      first.fromViewport.localeCompare(second.fromViewport) ||
      first.toViewport.localeCompare(second.toViewport) ||
      first.role.localeCompare(second.role) ||
      first.changeType.localeCompare(second.changeType) ||
      first.signature.localeCompare(second.signature),
  )
}

function expectedResponsiveObservationLines(evidence, language) {
  const profileLocale = profileExportLocale(language)
  const evidenceLocale = DESIGN_EVIDENCE_LOCALES[language === 'zh-CN' ? 'zh-CN' : 'en'] || {}
  return buildAuditResponsiveGroups(evidence)
    .slice(0, 20)
    .flatMap((group) => {
      const properties = group.changes.map(([property]) => property)
      const scopes = [...group.routes.entries()]
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([, page]) => auditPublicPageScopeLabel(evidence, page))
      const examples = scopes.slice(0, 3)
      if (scopes.length > examples.length) {
        examples.push(
          interpolateTemplate(evidenceLocale?.structure?.scopeMore, { count: scopes.length - examples.length }),
        )
      }
      const line = auditResponsiveLocaleText(language, 'groupLine', {
        from: profileLocale?.terms?.[group.fromViewport] || group.fromViewport,
        to: profileLocale?.terms?.[group.toViewport] || group.toViewport,
        role: profileLocale?.terms?.[group.role] || group.role,
        change: profileLocale?.terms?.[group.changeType] || group.changeType,
        properties: properties
          .map(
            (property) =>
              profileLocale?.terms?.[property === 'node.heading.fontSize' ? 'headingFontSize' : property] || property,
          )
          .join(auditResponsiveLocaleText(language, 'propertySeparator')),
        routeSupport: auditResponsiveLocaleText(language, 'routeSupport', { count: group.routes.size }),
        instanceSupport: auditResponsiveLocaleText(language, 'instanceSupport', { count: group.instanceCount }),
        examples: auditResponsiveLocaleText(language, 'examples', { examples: examples.join('; ') }),
      })
      const values = group.changes
        .slice(0, 12)
        .map(([property, value]) => {
          const label =
            profileLocale?.terms?.[property === 'node.heading.fontSize' ? 'headingFontSize' : property] || property
          return `${label}: ${value?.from ?? 'absent'} → ${value?.to ?? 'absent'}`
        })
        .join(auditResponsiveLocaleText(language, 'valueSeparator'))
      return values ? [line, `  - ${values}`] : [line]
    })
}

function validateGroupedResponsiveObservations(source, evidence, profile, hardFailures) {
  const language =
    profile?.language === 'zh-CN'
      ? 'zh-CN'
      : profile?.language === 'en'
        ? 'en'
        : evidence?.source?.language === 'zh-CN'
          ? 'zh-CN'
          : 'en'
  const ownerHeading = language === 'zh-CN' ? '设计证据概览' : 'Design Evidence Overview'
  const responsiveHeading = language === 'zh-CN' ? '响应式结构观察' : 'Responsive Structure Observations'
  const allOwnerHeadings = new Set(['Design Evidence Overview', '设计证据概览'])
  const allResponsiveHeadings = new Set(['Responsive Structure Observations', '响应式结构观察'])
  const lines = String(source || '').split(/\r?\n/)
  const expected = expectedResponsiveObservationLines(evidence, language)
  const expectedSectionCount = expected.length > 0 ? 1 : 0
  const responsiveSectionCount = lines.filter((line) => {
    const heading = /^###\s+(.+)$/.exec(line)
    return heading ? allResponsiveHeadings.has(heading[1].trim()) : false
  }).length
  if (responsiveSectionCount !== expectedSectionCount) {
    hardFailures.push(`responsive-observation-section-count-mismatch:${responsiveSectionCount}:${expectedSectionCount}`)
  }

  let ownerSection = ''
  if (expectedSectionCount > 0) {
    const ownerHeadings = lines.filter((line) => {
      const heading = /^##\s+(.+)$/.exec(line)
      return heading ? allOwnerHeadings.has(heading[1].trim()) : false
    })
    const matchingOwnerHeadings = ownerHeadings.filter((line) => line === `## ${ownerHeading}`)
    if (ownerHeadings.length !== 1 || matchingOwnerHeadings.length !== 1) {
      hardFailures.push(`responsive-observation-owner-section-mismatch:${ownerHeadings.length}`)
    } else {
      const start = lines.findIndex((line) => line === `## ${ownerHeading}`)
      const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line))
      ownerSection = lines.slice(start, end < 0 ? lines.length : end).join('\n')
      const ownedResponsiveCount = ownerSection
        .split(/\r?\n/)
        .filter((line) => line === `### ${responsiveHeading}`).length
      if (ownedResponsiveCount !== 1) {
        hardFailures.push(`responsive-observation-owned-section-count-mismatch:${ownedResponsiveCount}:1`)
      }
    }
  }
  const actual = markdownSubsectionLines(ownerSection, new Set([responsiveHeading])).filter(
    (line) => line.trim() !== '',
  )
  if (stableJson(actual) !== stableJson(expected)) {
    hardFailures.push('responsive-observation-groups-mismatch')
  }

  const responsivePropertyKeys = [
    'gridTemplateColumns',
    'childGridTemplateColumns',
    'node.heading.fontSize',
    'node.media.height',
    'layoutMode',
    'position',
    'order',
    'sequenceIndex',
    'height',
    'borderTop',
    'borderRight',
    'borderBottom',
    'borderLeft',
    'boxShadow',
  ]
  const profileTerms = profileExportLocale(language)?.terms || {}
  const responsivePropertyLabels = new Set(
    responsivePropertyKeys.map(
      (property) => profileTerms[property === 'node.heading.fontSize' ? 'headingFontSize' : property] || property,
    ),
  )
  const isResponsiveGroupLine = (line) =>
    language === 'zh-CN'
      ? /^- .+ → .+ · .+ · .+（.+） · 支持：\d+ 个路由 · \d+ 个观察实例 · 示例：.+$/.test(line)
      : /^- .+ → .+ · .+ · .+ \(.+\) · support: \d+ routes? · \d+ observed instances? · examples: .+$/.test(line)
  const isResponsiveValueLine = (line) =>
    line.startsWith('- ') &&
    line.includes(' → ') &&
    [...responsivePropertyLabels].some((label) => line.startsWith(`- ${label}: `))
  const responsiveHeadingIndex = lines.findIndex((line) => line === `### ${responsiveHeading}`)
  const responsiveSectionEnd =
    responsiveHeadingIndex < 0
      ? -1
      : lines.findIndex((line, index) => index > responsiveHeadingIndex && /^#{1,3}\s+/.test(line))
  const responsiveFactRecords = lines
    .map((line, index) => {
      const normalized = normalizedMarkdownContainerLine(line).trimStart()
      return {
        line: isResponsiveValueLine(normalized) ? `  ${normalized}` : normalized,
        index,
        responsive: isResponsiveGroupLine(normalized) || isResponsiveValueLine(normalized),
      }
    })
    .filter(({ responsive }) => responsive)
  const outsideOwnedSection = responsiveFactRecords.some(
    ({ index }) =>
      responsiveHeadingIndex < 0 ||
      index <= responsiveHeadingIndex ||
      (responsiveSectionEnd >= 0 && index >= responsiveSectionEnd),
  )
  if (outsideOwnedSection) hardFailures.push('responsive-observation-fact-outside-owned-section')
  if (stableJson(responsiveFactRecords.map(({ line }) => line)) !== stableJson(expected)) {
    hardFailures.push('responsive-observation-global-groups-mismatch')
  }
}

function displayedAuditRecipeVariant(recipe) {
  const variant = String(recipe?.variant || 'default')
  if (recipe?.component === 'button' && recipe?.useWhen === 'primary-action' && /^secondary(?:-|$)/.test(variant)) {
    return variant.replace(/^secondary/, 'primary-action-low-emphasis')
  }
  return variant
}

function formattedAuditRecipeVariant(recipe, language) {
  const locale = profileExportLocale(language)
  const terms = locale?.terms || {}
  const separator = locale?.transfer?.variantSeparator || ' · '
  const parts = displayedAuditRecipeVariant(recipe).split('-')
  const labels = []
  for (let start = 0; start < parts.length;) {
    let match = null
    let next = start + 1
    for (let end = parts.length; end > start; end -= 1) {
      const candidate = parts.slice(start, end).join('-')
      if (!terms[candidate]) continue
      match = terms[candidate]
      next = end
      break
    }
    if (match) {
      labels.push(match)
      start = next
      continue
    }
    const radius = /^r(\d+(?:\.\d+)?)$/.exec(parts[start])
    labels.push(
      radius
        ? interpolateTemplate(locale?.transfer?.radiusVariant || '{{value}}px radius', { value: radius[1] })
        : translatedProfileTerm(parts[start], language),
    )
    start += 1
  }
  return labels.join(separator)
}

function expectedRecipeHeading(recipe, language) {
  const locale = profileExportLocale(language)
  const title = interpolateTemplate(locale?.transfer?.componentTitle || '{{component}} · {{variant}}', {
    component: translatedProfileTerm(String(recipe?.component || ''), language),
    variant: formattedAuditRecipeVariant(recipe, language),
  })
  return `#### ${title}`
}

function expectedRecipeMetric(recipe, language) {
  const locale = profileExportLocale(language)
  const scope = locale?.transfer?.reuseScopes?.[recipe?.reuseScope || 'isolated'] || String(recipe?.reuseScope || '')
  return `_${interpolateTemplate(locale?.transfer?.recipeEvidence || '', {
    count: recipe?.matchingStyleInstances ?? recipe?.sourceInstances,
    pages: recipe?.pageCount ?? 1,
    identity: finite(recipe?.identityConfidence) ? recipe.identityConfidence.toFixed(2) : '',
    reuse: finite(recipe?.reuseConfidence) ? recipe.reuseConfidence.toFixed(2) : '',
    scope,
  })}_`
}

function transferGrammarLocale(language) {
  return TRANSFER_GRAMMAR_LOCALES[language === 'zh-CN' ? 'zh-CN' : 'en'] || {}
}

function auditExpectedRecipeUseWhen(pattern) {
  const variant = String(pattern?.canonicalVariant || 'default')
  if (pattern?.type === 'button') {
    const primaryCount = pattern.components.filter((component) => component?.role === 'primary-action').length
    return primaryCount / Math.max(pattern.components.length, 1) >= 0.8 ? 'primary-action' : 'action'
  }
  if (pattern?.type === 'input') {
    return pattern.semanticIdentities?.includes('search') || pattern.usageContexts?.includes('search')
      ? 'search'
      : 'text-entry'
  }
  if (pattern?.type === 'card') return 'content-group'
  if (pattern?.type === 'navigation') return 'navigation'
  if (pattern?.type === 'tab') return 'tab-navigation'
  if (pattern?.type === 'list') return 'content-collection'
  if (pattern?.type === 'table') return 'structured-data'
  if (pattern?.type === 'modal') return 'overlay-dialog'
  if (pattern?.type === 'status') return 'status-feedback'
  return 'specialized'
}

function auditExpectedRecipeConfidence(pattern) {
  return pattern.reuseConfidence >= 0.8 ? 'high' : pattern.reuseConfidence >= 0.55 ? 'medium' : 'low'
}

function auditExpectedRecipeRestrictions(pattern) {
  const restrictions = ['keep-variant-scope']
  if (pattern.components.some((component) => auditPillRadius(component.styles))) {
    restrictions.push('do-not-globalize-special-shape')
  }
  if (pattern.type === 'card' || pattern.type === 'modal') restrictions.push('do-not-promote-overlay-elevation')
  if (pattern.components.every((component) => (component.stateRefs || []).length === 0)) {
    restrictions.push('do-not-invent-unobserved-state')
  }
  if (!AUDIT_COMPONENT_TYPES.has(pattern.type)) restrictions.push('do-not-promote-local-layout')
  return unique(restrictions)
}

function auditStableStrings(values) {
  return unique((Array.isArray(values) ? values : []).filter(Boolean).map(String)).sort()
}

function auditInteractionIdentityConfidence(components, evidence) {
  const pageById = new Map((evidence?.pages || []).map((page) => [page.id, page]))
  const urls = new Set(components.map((component) => pageById.get(component.pageId)?.url).filter(Boolean))
  const average =
    components.length > 0
      ? components.reduce((total, component) => total + Number(component.confidence || 0), 0) / components.length
      : 0
  return (urls.size >= 2 || components.length >= 3) && average >= 0.9 ? 'high' : 'medium'
}

function auditFormatInteractionStatement(statement, language) {
  const aliases = {
    'node.heading.fontSize': 'headingFontSize',
    'rect.height': 'height',
    'rect.width': 'width',
    'rect.x': 'horizontalPosition',
    'rect.y': 'verticalPosition',
  }
  const terms = [
    'rect.height',
    'rect.width',
    'rect.x',
    'rect.y',
    'childGridTemplateColumns',
    'gridTemplateColumns',
    'controlledVisibility',
    'controlledOpacity',
    'controlledDisplay',
    'controlledHidden',
    'backgroundColor',
    'backgroundImage',
    'textColor',
    'borderColor',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomRightRadius',
    'borderBottomLeftRadius',
    'topOffset',
    'maxWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'gap',
    'borderTop',
    'borderRight',
    'borderBottom',
    'borderLeft',
    'boxShadow',
    'overflowX',
    'overflowY',
    'scrollSnapType',
    'scrollSnapAlign',
    'horizontalPosition',
    'verticalPosition',
    'sequenceIndex',
    'ariaExpanded',
    'ariaSelected',
    'node.heading.fontSize',
    'layoutMode',
    'lineHeight',
    'fontSize',
    'heading',
    'body',
    'label',
    'metadata',
    'section',
    'card-group',
    'unknown',
    'primary-action',
    'feature-group',
    'safe-active',
    'decorative',
    'navigation',
    'combobox',
    'secondary',
    'rounded',
    'primary',
    'button',
    'desktop',
    'mobile',
    'header',
    'content',
    'footer',
    'table',
    'input',
    'action',
    'aside',
    'media',
    'hero',
    'sharp',
    'pill',
    'flow',
    'right',
    'full',
    'grid',
    'list',
    'card',
    'text',
    'icon',
    'image',
    'click',
    'tab',
    'modal',
    'status',
    'alert',
    'status-positive',
    'status-warning',
    'status-negative',
    'status-neutral',
    'delta-positive',
    'delta-warning',
    'delta-negative',
    'delta-neutral',
    'default',
    'outlined',
    'elevated',
    'flat',
    'search',
    'visibility',
    'interactionModel',
    'height',
    'width',
    'position',
    'order',
    'display',
  ]
  let formatted = String(statement)
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    formatted = formatted.replace(
      new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g'),
      translatedProfileTerm(aliases[term] || term, language),
    )
  }
  formatted = formatted
    .replaceAll(', ', profileExportLocale(language)?.listSeparator || ', ')
    .replaceAll(' -> ', profileExportLocale(language)?.sequenceArrow || ' → ')
    .replace(/\b(size change|visibility change|interaction change|order change)\s+changes?\b/gi, '$1')
  let compact = formatted
  do {
    formatted = compact
    compact = formatted.replace(/([\p{Script=Han}])\s+([\p{Script=Han}])/gu, '$1$2')
  } while (compact !== formatted)
  return compact
}

function auditExpectedInteractionClaimRecords(pattern, evidence, language) {
  const locale = transferGrammarLocale(language)
  const componentIds = new Set(pattern.components.map((component) => component.id))
  const stateIds = new Set(pattern.components.flatMap((component) => component.stateRefs || []))
  const observations = (evidence?.interactionObservations || []).filter(
    (observation) => stateIds.has(observation.id) && componentIds.has(observation.targetId),
  )
  const groups = new Map()
  for (const observation of observations) {
    const key = JSON.stringify([observation.driver, auditStableStrings(observation.changedProperties)])
    const items = groups.get(key) || []
    items.push(observation)
    groups.set(key, items)
  }
  return [...groups.values()].slice(0, 3).map((items) => {
    const representative = items[0]
    const properties = auditStableStrings(representative.changedProperties)
    const evidenceIds = items.map((item) => item.id)
    const rawStatement = interpolateTemplate(locale.stateStatement, {
      driver: representative.driver,
      properties: properties.join(', '),
    })
    const renderedStatement = auditFormatInteractionStatement(rawStatement, language)
    return {
      claim: {
        statement: rawStatement,
        implementation: locale.stateImplementation,
        confidence: items.some((item) => item.safety === 'safe-active')
          ? auditInteractionIdentityConfidence(pattern.components, evidence)
          : 'medium',
        evidence: evidenceIds.map((evidenceId) => ({ evidenceId, note: locale.evidenceNote })),
        assertions: (representative.changedProperties || []).map((property) => ({
          kind: 'interaction',
          target: representative.driver,
          predicate: 'property-change',
          scope: 'page',
          evidenceIds,
          property,
        })),
        source: 'deterministic-catalog',
      },
      renderedStatement,
    }
  })
}

function auditExpectedObservedClaim(pattern, evidenceIds, language) {
  const locale = transferGrammarLocale(language)
  const count = pattern.sourceInstances
  const single = count === 1
  const statementKey =
    pattern.type === 'status'
      ? single
        ? 'statusRecipeSingleStatement'
        : 'statusRecipeStatement'
      : single
        ? 'recipeSingleStatement'
        : 'recipeStatement'
  return {
    statement: interpolateTemplate(locale[statementKey], {
      count,
      component: pattern.type,
      variant: pattern.canonicalVariant,
    }),
    implementation: locale.recipeImplementation,
    confidence: auditExpectedRecipeConfidence(pattern),
    evidence: evidenceIds.map((evidenceId) => ({ evidenceId, note: locale.evidenceNote })),
    tokenRefs: pattern.sharedTokenRefs.slice(0, 10),
    assertions: evidenceIds.flatMap((evidenceId) => [
      {
        kind: 'component',
        target: pattern.type,
        predicate: 'present',
        scope: 'instance',
        evidenceIds: [evidenceId],
      },
      {
        kind: 'component',
        target: pattern.type,
        predicate: 'variant',
        scope: 'instance',
        evidenceIds: [evidenceId],
        value: pattern.canonicalVariant,
      },
    ]),
    source: 'deterministic-catalog',
  }
}

function auditStableColorValueSlug(value) {
  const normalized = normalizedFrontMatterColor(value)
  if (/^#[\da-f]{6}$/i.test(normalized)) return normalized.slice(1).toLowerCase()
  const rgba = normalized.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/i)
  if (rgba) {
    const rgb = rgba
      .slice(1, 4)
      .map((channel) => Number(channel).toString(16).padStart(2, '0'))
      .join('')
    const alpha = Math.round(Number(rgba[4]) * 255)
      .toString(16)
      .padStart(2, '0')
    return `${rgb}-${alpha}`
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function auditPublicRecipeTokenRef(ref, evidence) {
  const colorName = /^color\.(.+)$/.exec(ref)?.[1]
  if (!colorName || !/^(?:dark-)?palette-\d+$/.test(colorName)) return ref
  const value = evidence?.tokens?.colors?.[colorName]
  return value ? `color.observed-${auditStableColorValueSlug(value)}` : ref
}

function expectedRecipeBlock(pattern, evidence, language) {
  const locale = profileExportLocale(language)
  const transfer = locale?.transfer || {}
  const useWhen = auditExpectedRecipeUseWhen(pattern)
  const recipe = {
    component: pattern.type,
    variant: pattern.canonicalVariant,
    useWhen,
    matchingStyleInstances: pattern.matchingStyleInstances,
    sourceInstances: pattern.sourceInstances,
    pageCount: pattern.pageCount,
    identityConfidence: pattern.identityConfidence,
    reuseConfidence: pattern.reuseConfidence,
    reuseScope: pattern.reuseScope,
  }
  const evidenceIds = routeBalancedComponentEvidenceIds(
    pattern.components.map((component) => component.id),
    new Map((evidence?.components || []).map((component) => [component.id, component])),
    new Map((evidence?.pages || []).map((page) => [page.id, page])),
  ).slice(0, COMPONENT_EVIDENCE_SAMPLE_LIMIT)
  const observed = auditExpectedObservedClaim(pattern, evidenceIds, language)
  const tokenRefs = observed.tokenRefs
    .filter((ref) => tokenCatalog(evidence?.tokens).has(ref))
    .map((ref) => `\`${auditPublicRecipeTokenRef(ref, evidence)}\``)
    .join(locale?.listSeparator || ', ')
  const observedStyles = Object.entries(auditPortableComponentStyles(pattern.styles))
    .sort(([first], [second]) => first.localeCompare(second))
    .map(
      ([property, value]) =>
        `\`${property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}: ${value}\``,
    )
    .join(locale?.listSeparator || ', ')
  const stateRecords = auditExpectedInteractionClaimRecords(pattern, evidence, language)
  const specificRestrictions = auditExpectedRecipeRestrictions(pattern).filter(
    (restriction) => !['keep-variant-scope', 'do-not-invent-unobserved-state'].includes(restriction),
  )
  const lines = [
    expectedRecipeHeading(recipe, language),
    '',
    expectedRecipeMetric(recipe, language),
    '',
    `- **${transfer.useWhen}${locale?.labelSeparator || ':'}** ${transfer.useWhenValues?.[useWhen]}`,
    `- **${transfer.observedRecipe}${locale?.labelSeparator || ':'}** ${observed.statement}`,
    ...(tokenRefs ? [`  - **${locale?.relatedTokens}${locale?.labelSeparator || ':'}** ${tokenRefs}`] : []),
    ...(observedStyles ? [`  - **${transfer.observedStyles}${locale?.labelSeparator || ':'}** ${observedStyles}`] : []),
  ]
  if (stateRecords.length > 0) {
    lines.push(
      `- **${transfer.states}${locale?.labelSeparator || ':'}**`,
      ...stateRecords.map((record) => `  - ${record.renderedStatement}`),
    )
  }
  if (specificRestrictions.length > 0) {
    lines.push(
      `- **${transfer.restrictions}${locale?.labelSeparator || ':'}**`,
      ...specificRestrictions.map((restriction) => `  - ${transfer.restrictionValues?.[restriction]}`),
    )
  }
  return lines
}

function renderedRecipeRecords(componentSection) {
  const lines = String(componentSection || '').split(/\r?\n/)
  const result = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^####\s+/.test(lines[index])) continue
    const nextHeadingOffset = lines.slice(index + 1).findIndex((line) => /^#{1,4}\s+/.test(line))
    const end = nextHeadingOffset < 0 ? lines.length : index + 1 + nextHeadingOffset
    const block = lines.slice(index, end)
    while (block.at(-1)?.trim() === '') block.pop()
    const metric = block.slice(1).find((line) => line.trim() !== '') || ''
    result.push({ heading: lines[index], metric, block })
  }
  return result
}

function normalizedMarkdownContainerLine(line) {
  let normalized = String(line || '')
  while (true) {
    const previous = normalized
    normalized = normalized.replace(/^\s*>\s?/, '')
    normalized = normalized.replace(/^\s*(?:[-+*]|\d+[.)])\s+(?=(?:>\s*)?(?:#{1,6}\s+|(?:[-+*]|\d+[.)])\s+))/, '')
    if (normalized === previous) return normalized
  }
}

function renderedRecipeRecordsWithOwners(source) {
  const lines = String(source || '').split(/\r?\n/)
  const result = []
  let ownerSection = '_frontmatter'
  for (let index = 0; index < lines.length; index += 1) {
    const h2 = /^##\s+(.+)$/.exec(lines[index])
    if (h2) ownerSection = h2[1].trim()
    const normalizedHeading = normalizedMarkdownContainerLine(lines[index])
    const heading = /^(#{3,6})\s+(.+)$/.exec(normalizedHeading)
    if (!heading) continue
    const depth = heading[1].length
    const nextHeadingOffset = lines.slice(index + 1).findIndex((line) => {
      const candidate = /^(#{1,6})\s+/.exec(normalizedMarkdownContainerLine(line))
      return Boolean(candidate && candidate[1].length <= depth)
    })
    const end = nextHeadingOffset < 0 ? lines.length : index + 1 + nextHeadingOffset
    const block = lines.slice(index, end).map(normalizedMarkdownContainerLine)
    while (block.at(-1)?.trim() === '') block.pop()
    const metric = block.slice(1).find((line) => line.trim() !== '') || ''
    result.push({
      heading: normalizedHeading,
      headingText: heading[2].trim(),
      depth,
      metric,
      block,
      ownerSection,
      line: index + 1,
      start: index,
      end,
    })
  }
  return result
}

function renderedComponentContrastNames(source) {
  const headings = new Set(['### Component Contrast Notes', '### 组件对比度注意事项'])
  const names = []
  let active = false
  for (const line of source.split(/\r?\n/)) {
    if (headings.has(line.trim())) {
      active = true
      continue
    }
    if (active && /^#{2,3}\s/.test(line)) break
    if (!active) continue
    const match = /^- `([^`]+)`[:：]/.exec(line)
    if (match) names.push(match[1])
  }
  return names
}

function renderedComponentRecipeProjections(source, expectedHeadings, language) {
  const locale = profileExportLocale(language)
  const transfer = locale?.transfer || {}
  const separator = locale?.labelSeparator || ':'
  const recipeMarkers = [
    `- **${transfer.useWhen}${separator}**`,
    `- **${transfer.observedRecipe}${separator}**`,
  ].filter((marker) => !marker.includes('undefined'))
  const metricPattern =
    language === 'zh-CN'
      ? /^_\d+ 个代表样式匹配，覆盖 \d+ 个页面/
      : /^_\d+ representative-style match(?:\(es\)|es)? across \d+ page(?:\(s\)|s)?/
  const expectedHeadingText = new Set([...expectedHeadings].map((heading) => heading.replace(/^#{1,6}\s+/, '').trim()))
  const projections = renderedRecipeRecordsWithOwners(source).filter(
    (record) =>
      expectedHeadings.has(record.heading) ||
      expectedHeadingText.has(record.headingText) ||
      (record.depth >= 4 &&
        (metricPattern.test(record.metric) ||
          record.block.some((line) => recipeMarkers.some((marker) => line.startsWith(marker))))),
  )
  const coveredLines = new Set(
    projections.flatMap((record) =>
      Array.from({ length: record.end - record.start }, (_value, offset) => record.start + offset),
    ),
  )
  const lines = String(source || '').split(/\r?\n/)
  let ownerSection = '_frontmatter'
  for (let index = 0; index < lines.length; index += 1) {
    const h2 = /^##\s+(.+)$/.exec(lines[index])
    if (h2) ownerSection = h2[1].trim()
    if (coveredLines.has(index)) continue
    const normalized = normalizedMarkdownContainerLine(lines[index])
    if (!recipeMarkers.some((marker) => normalized.startsWith(marker))) continue
    projections.push({
      heading: '',
      headingText: '',
      depth: 0,
      metric: '',
      block: [normalized],
      ownerSection,
      line: index + 1,
      start: index,
      end: index + 1,
    })
  }
  return projections.sort((first, second) => first.start - second.start)
}

function expectedP2SummaryLines(recipes, language) {
  const groups = new Map()
  for (const recipe of recipes) {
    const component = String(recipe?.component || '')
    const group = groups.get(component) || { patterns: 0, instances: 0 }
    group.patterns += 1
    group.instances += Number(recipe?.sourceInstances || 0)
    groups.set(component, group)
  }
  const template = profileExportLocale(language)?.transfer?.localRecipeSummary || ''
  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(
      ([component, summary]) =>
        `- ${interpolateTemplate(template, {
          component: translatedProfileTerm(component, language),
          patterns: summary.patterns,
          instances: summary.instances,
        })}`,
    )
}

function selectComponentDetails(recipes) {
  const scopeRank = { 'cross-page': 2, 'page-repeated': 1, isolated: 0 }
  const ranked = [...recipes].sort(
    (first, second) =>
      scopeRank[second?.reuseScope || 'isolated'] - scopeRank[first?.reuseScope || 'isolated'] ||
      Number(second?.pageCount || 0) - Number(first?.pageCount || 0) ||
      Number(second?.reuseConfidence || 0) - Number(first?.reuseConfidence || 0) ||
      Number(second?.sourceInstances || 0) - Number(first?.sourceInstances || 0) ||
      componentRecipeKey(first).localeCompare(componentRecipeKey(second)),
  )
  const byType = new Map()
  for (const recipe of ranked) {
    const group = byType.get(recipe.component) || []
    group.push(recipe)
    byType.set(recipe.component, group)
  }
  const typeOrder = [...byType.keys()].sort((first, second) => {
    const firstRank = ranked.indexOf(byType.get(first)[0])
    const secondRank = ranked.indexOf(byType.get(second)[0])
    return firstRank - secondRank || String(first).localeCompare(String(second))
  })
  const selected = []
  for (let offset = 0; offset < COMPONENT_DETAIL_LIMIT_PER_TYPE; offset += 1) {
    for (const type of typeOrder) {
      const recipe = byType.get(type)?.[offset]
      if (!recipe) continue
      selected.push(recipe)
      if (selected.length >= COMPONENT_DETAIL_LIMIT) return selected
    }
  }
  return selected
}

function normalizedSpecStyles(styles) {
  if (!isObject(styles)) return {}
  return Object.fromEntries(
    Object.entries(styles)
      .map(([property, values]) => [
        property,
        sortedStrings(values).map((value) => normalizedComparableComponentStyle(property, value)),
      ])
      .sort(([first], [second]) => first.localeCompare(second)),
  )
}

function normalizedComparableComponentStyle(property, value) {
  return /color$/i.test(property) ? normalizedFrontMatterColor(value) : String(value)
}

function normalizedRecipeStyles(styles) {
  if (!isObject(styles)) return {}
  return Object.fromEntries(
    Object.entries(styles)
      .map(([property, value]) => [property, [normalizedComparableComponentStyle(property, value)]])
      .sort(([first], [second]) => first.localeCompare(second)),
  )
}

function normalizedEvidenceComponentStyles(styles) {
  return Object.fromEntries(
    Object.entries(auditPortableComponentStyles(styles))
      .map(([property, value]) => [property, [normalizedComparableComponentStyle(property, value)]])
      .sort(([first], [second]) => first.localeCompare(second)),
  )
}

function routeBalancedComponentEvidenceIds(ids, componentById, pageById) {
  const byRoute = new Map()
  for (const id of ids) {
    const component = componentById.get(id)
    const page = component ? pageById.get(component.pageId) : undefined
    if (!component || !page) continue
    const route = evidencePageRouteIdentity(page)
    const group = byRoute.get(route) || []
    group.push(id)
    byRoute.set(route, group)
  }
  const groups = [...byRoute.entries()]
    .sort(([first], [second]) => String(first).localeCompare(String(second)))
    .map(([, group]) => group.sort((first, second) => first.localeCompare(second)))
  const result = []
  for (let offset = 0; ; offset += 1) {
    let added = false
    for (const group of groups) {
      if (!group[offset]) continue
      result.push(group[offset])
      added = true
    }
    if (!added) return result
  }
}

const AUDIT_COMPONENT_TYPES = new Set([
  'button',
  'card',
  'navigation',
  'input',
  'table',
  'modal',
  'list',
  'tab',
  'status',
])
const AUDIT_COMPONENT_ORDER = ['button', 'tab', 'status', 'card', 'navigation', 'input', 'table', 'modal', 'list']
const AUDIT_COMPONENT_VARIANT_ORDER = ['primary', 'destructive', 'action', 'secondary', 'text', 'icon', undefined]
const AUDIT_MIN_MEANINGFUL_TINT_ALPHA = 0.03
const AUDIT_COMPONENT_BORDER_PROPERTIES = ['border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft']

function auditNumericDimensions(value) {
  if (!value) return []
  return [...String(value).matchAll(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/gi)].map((match) =>
    Number.parseFloat(match[0]),
  )
}

function auditAlphaToken(value) {
  const token = String(value || '')
    .trim()
    .toLowerCase()
  if (token === 'none') return 0
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(%)?$/.exec(token)
  if (!match) return undefined
  const numeric = Number.parseFloat(match[1])
  if (!finite(numeric)) return undefined
  return match[2] ? numeric / 100 : numeric
}

function auditColorComponent(value) {
  return (
    String(value).toLowerCase() === 'none' ||
    /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?:%|deg|grad|rad|turn)?$/i.test(String(value))
  )
}

function auditFunctionalColorAlpha(value) {
  const match = /^(rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color)\((.*)\)$/i.exec(value)
  if (!match || /[()]/.test(match[2])) return undefined
  const name = match[1].toLowerCase()
  const body = match[2].trim()
  if (!body) return undefined
  if (body.includes(',')) {
    if (body.includes('/') || !['rgb', 'rgba', 'hsl', 'hsla'].includes(name)) return undefined
    const parts = body.split(',').map((part) => part.trim())
    if (![3, 4].includes(parts.length) || parts.slice(0, 3).some((part) => !auditColorComponent(part))) {
      return undefined
    }
    return parts.length === 4 ? auditAlphaToken(parts[3]) : 1
  }
  const slash = body.split('/')
  if (slash.length > 2) return undefined
  const parts = slash[0].trim().split(/\s+/).filter(Boolean)
  if (name === 'color') {
    if (parts.length !== 4 || !/^(?:--[\w-]+|[a-z][\w-]*)$/i.test(parts[0])) return undefined
    if (parts.slice(1).some((part) => !auditColorComponent(part))) return undefined
  } else if (parts.length !== 3 || parts.some((part) => !auditColorComponent(part))) {
    return undefined
  }
  return slash.length === 2 ? auditAlphaToken(slash[1]) : 1
}

function auditColorAlpha(value) {
  if (!value) return undefined
  const trimmed = String(value).trim().toLowerCase()
  if (trimmed === 'transparent') return 0
  if (/^#[\da-f]{4}$/.test(trimmed)) return Number.parseInt(trimmed[4], 16) / 15
  if (/^#[\da-f]{8}$/.test(trimmed)) return Number.parseInt(trimmed.slice(7, 9), 16) / 255
  if (/^#[\da-f]{3}$|^#[\da-f]{6}$/.test(trimmed)) return 1
  return auditFunctionalColorAlpha(trimmed)
}

function auditVisibleColor(value) {
  const alpha = auditColorAlpha(value)
  return alpha !== undefined && alpha > 0.001
}

function auditContextDependentColor(value) {
  const alpha = auditColorAlpha(value)
  return alpha !== undefined && alpha < 0.999
}

function auditBorderColor(value) {
  return String(value || '').match(
    /(transparent|(?:rgba?|hsla?|hsl|hwb|oklch|oklab|lab|lch|color)\([^)]+\)|#[\da-f]{3,8})\s*$/i,
  )?.[1]
}

function auditColorsEqual(first, second) {
  if (!first || !second) return false
  return normalizedFrontMatterColor(first) === normalizedFrontMatterColor(second)
}

function auditVisibleBorder(value) {
  if (!value || /\b(?:none|hidden)\b/i.test(value)) return false
  const [width = 0] = auditNumericDimensions(value)
  if (width <= 0) return false
  const color = auditBorderColor(value)
  const alpha = auditColorAlpha(color)
  return alpha !== undefined && alpha > 0.001
}

function auditVisibleComponentBorders(styles) {
  return AUDIT_COMPONENT_BORDER_PROPERTIES.map((property) => styles?.[property]).filter(auditVisibleBorder)
}

function auditNonzeroDimension(value) {
  return auditNumericDimensions(value).some((dimension) => Math.abs(dimension) > 0.01)
}

function auditVisibleShadowLayers(value) {
  if (!value || String(value).trim().toLowerCase() === 'none') return []
  const layers = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1
    else if (value[index] === ')') depth = Math.max(0, depth - 1)
    else if (value[index] === ',' && depth === 0) {
      layers.push(value.slice(start, index))
      start = index + 1
    }
  }
  layers.push(value.slice(start))
  const colorPattern = /transparent|#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^)]*\)/gi
  return layers.flatMap((layer) => {
    const colors = layer.match(colorPattern) || []
    if (!colors.some((color) => (auditColorAlpha(color) || 0) > 0.001)) return []
    const geometry = layer
      .replace(colorPattern, ' ')
      .replace(/\binset\b/gi, ' ')
      .match(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:[a-z%]+)?/gi)
    if (!geometry || geometry.length < 2) return []
    const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = geometry
      .slice(0, 4)
      .map((dimension) => Number.parseFloat(dimension))
    if (Math.abs(offsetX) <= 0.01 && Math.abs(offsetY) <= 0.01 && blur <= 0.01 && spread <= 0.01) return []
    return [{ blur, inset: /\binset\b/i.test(layer), offsetX, offsetY, spread }]
  })
}

function auditCrispShadowLayer(layer) {
  if (layer.blur > 0.01) return false
  if (layer.inset || layer.spread > 0.01) return true
  return Math.max(Math.abs(layer.offsetX), Math.abs(layer.offsetY)) <= 1.01
}

function auditHasDepthShadow(value) {
  return auditVisibleShadowLayers(value).some((layer) => !auditCrispShadowLayer(layer))
}

function auditHasCrispShadow(value) {
  return auditVisibleShadowLayers(value).some(auditCrispShadowLayer)
}

function auditContextDependentRadius(value) {
  if (!value) return false
  if (/[a-z][\w-]*\s*\(/i.test(value)) return true
  return [...String(value).matchAll(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?:px|rem|em)\b/gi)].some(
    ([dimension]) => Math.abs(Number.parseFloat(dimension)) >= 1_000_000,
  )
}

function auditPortableComponentStyles(styles) {
  return Object.fromEntries(
    Object.entries(isObject(styles) ? styles : {}).filter(
      ([property, value]) =>
        String(value).trim() !== '' && !(property === 'borderRadius' && auditContextDependentRadius(value)),
    ),
  )
}

function auditPillRadius(styles, context = {}) {
  const radius = styles?.borderRadius || ''
  if (auditContextDependentRadius(radius)) return false
  const dimensions = auditNumericDimensions(radius)
  const maximum = dimensions.length > 0 ? Math.max(...dimensions) : 0
  if (/%/.test(radius) || maximum >= 999 || maximum >= 64) return true
  return Boolean(context.heightPx && context.heightPx > 0 && maximum >= Math.max(12, context.heightPx / 2 - 1))
}

function auditCardStyle(styles) {
  const radius = Math.max(0, ...auditNumericDimensions(styles?.borderRadius))
  const corner = auditContextDependentRadius(styles?.borderRadius)
    ? 'rounded'
    : radius > 0
      ? `r${Number(radius.toFixed(2))}`
      : 'square'
  const surface = auditHasDepthShadow(styles?.boxShadow)
    ? 'elevated'
    : auditVisibleComponentBorders(styles).length > 0 || auditHasCrispShadow(styles?.boxShadow)
      ? 'outlined'
      : 'flat'
  return `${surface}-${corner}`
}

function auditButtonStyleFamily(candidate) {
  const corner = auditPillRadius(candidate.styles, candidate)
    ? 'pill'
    : auditNonzeroDimension(candidate.styles?.borderRadius)
      ? 'rounded'
      : 'sharp'
  const background = candidate.styles?.backgroundColor
  const alpha = auditColorAlpha(background)
  const visibleBorders = auditVisibleComponentBorders(candidate.styles)
  const visibleBorder = visibleBorders.length > 0
  const observedBorderColor = visibleBorders[0] ? auditBorderColor(visibleBorders[0]) : undefined
  const matchesKnownSurface = candidate.surfaceColors.some((color) => auditColorsEqual(background, color))
  const borderMatchesFill = auditColorsEqual(background, observedBorderColor)
  const surface = !auditVisibleColor(background)
    ? visibleBorder
      ? 'outlined'
      : 'flat'
    : alpha !== undefined && alpha < AUDIT_MIN_MEANINGFUL_TINT_ALPHA
      ? visibleBorder
        ? 'outlined'
        : 'flat'
      : alpha !== undefined && alpha < 0.5
        ? 'tinted'
        : visibleBorder && matchesKnownSurface && !borderMatchesFill
          ? 'outlined'
          : 'filled'
  return `${corner}-${surface}${auditHasDepthShadow(candidate.styles?.boxShadow) ? '-shadowed' : ''}`
}

function auditIconSized(styles, context) {
  const { widthPx, heightPx } = context
  const known = widthPx !== undefined && heightPx !== undefined && widthPx > 0 && heightPx > 0
  const square = known && Math.max(widthPx, heightPx) <= 64 && widthPx / heightPx >= 0.75 && widthPx / heightPx <= 1.33
  const fullyRounded = auditPillRadius(styles, context)
  const padding = auditNumericDimensions(styles?.padding)
  const horizontalPadding =
    padding.length === 0
      ? false
      : padding.length === 1
        ? padding[0] > 0
        : (padding[1] || 0) > 0 || (padding[3] || padding[1] || 0) > 0
  return (square && (fullyRounded || !horizontalPadding)) || (!known && fullyRounded && !horizontalPadding)
}

function auditComponentVariant(candidate) {
  if (candidate.type !== 'button') return undefined
  if (candidate.role === 'destructive-action') return 'destructive'
  const background = candidate.styles?.backgroundColor
  const transparent = !auditVisibleColor(background)
  const alpha = auditColorAlpha(background)
  const referencesPrimary =
    !transparent &&
    alpha !== undefined &&
    alpha >= 0.5 &&
    (candidate.tokenRefs.includes('color.primary') || auditColorsEqual(background, candidate.primaryColor))
  const primaryRole = candidate.role === 'primary-action'
  const icon = auditIconSized(candidate.styles, candidate)
  const hasVisibleText =
    candidate.hasVisibleText ??
    Boolean(
      candidate.textStyleOwner ||
      candidate.styles?.fontFamily ||
      candidate.styles?.fontSize ||
      candidate.styles?.fontWeight ||
      candidate.styles?.lineHeight,
    )
  const compact =
    candidate.widthPx !== undefined &&
    candidate.heightPx !== undefined &&
    Math.max(candidate.widthPx, candidate.heightPx) <= 36
  const squareIconGeometry =
    candidate.widthPx !== undefined &&
    candidate.heightPx !== undefined &&
    Math.max(candidate.widthPx, candidate.heightPx) <= 64 &&
    candidate.widthPx / candidate.heightPx >= 0.75 &&
    candidate.widthPx / candidate.heightPx <= 1.33
  if ((icon || squareIconGeometry) && !hasVisibleText && (!primaryRole || compact)) return 'icon'
  if (primaryRole && (referencesPrimary || (!transparent && alpha !== undefined && alpha >= 0.5))) return 'primary'
  if ((icon || squareIconGeometry) && !hasVisibleText) return 'icon'
  if (referencesPrimary) return 'action'
  if (transparent) return auditVisibleBorder(candidate.styles?.border) ? 'action' : 'text'
  return 'action'
}

function auditCatalogVariant(candidate) {
  return auditComponentVariant({
    ...candidate,
    ...(candidate.role === 'primary-action' ? { role: 'action' } : {}),
  })
}

function auditPromotedVariant(variant, candidates) {
  if (variant !== 'action' || candidates.length === 0) return variant
  const primarySupport =
    candidates.filter((candidate) => candidate.role === 'primary-action').length / candidates.length
  const background = candidates[0].styles?.backgroundColor
  const alpha = auditColorAlpha(background)
  return primarySupport >= 0.8 && background && auditVisibleColor(background) && alpha !== undefined && alpha >= 0.5
    ? 'primary'
    : variant
}

function auditSemanticComponentSubtype(candidate) {
  const role = candidate.role?.trim().toLowerCase()
  if (candidate.type === 'input') {
    if (candidate.semanticIdentity === 'search' || role === 'searchbox' || role === 'search') return 'search'
    if (role === 'combobox' || role === 'listbox') return 'combobox'
    if (role === 'spinbutton') return 'number'
    if (role === 'textbox' || !role) return 'text'
    return role.replace(/[^a-z0-9-]+/g, '-')
  }
  if (candidate.type === 'modal') return role === 'alertdialog' ? 'alert' : 'default'
  return undefined
}

function auditComponentStyleSignature(styles) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(isObject(styles) ? styles : {}).sort(([first], [second]) => first.localeCompare(second)),
    ),
  )
}

const AUDIT_COMPONENT_TEXT_STYLE_PROPERTIES = new Set([
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
])
const AUDIT_TEXT_STYLE_COMPONENT_TYPES = new Set(['button', 'input', 'tab', 'status'])
const AUDIT_CONTENT_SIZED_COMPONENT_TYPES = new Set(['card', 'list', 'table', 'modal', 'status'])

function auditNormalizeComponentStyleRecord(component) {
  const type = String(component?.type || '')
  const textStyleOwner = component?.textStyleOwner
  const ownsRenderedText =
    (textStyleOwner === 'root' || textStyleOwner === 'descendant') && AUDIT_TEXT_STYLE_COMPONENT_TYPES.has(type)
  return Object.fromEntries(
    Object.entries(isObject(component?.styles) ? component.styles : {}).filter(([property, value]) => {
      if (property === 'color' && !auditVisibleColor(value)) return false
      if (AUDIT_COMPONENT_TEXT_STYLE_PROPERTIES.has(property)) return ownsRenderedText
      if (AUDIT_CONTENT_SIZED_COMPONENT_TYPES.has(type) && (property === 'height' || property === 'minHeight')) {
        return false
      }
      return true
    }),
  )
}

const AUDIT_TEXT_STYLE_SOURCE_KINDS = new Set([
  'direct-text',
  'descendant-text',
  'native-value',
  'native-placeholder',
  'native-selection',
])

function auditClipPathMetrics(value, width, height) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!normalized || normalized === 'none') return { left: 0, top: 0, right: width, bottom: height, fillRatio: 1 }
  const length = (token, axis) => {
    if (token.endsWith('%')) return (Number.parseFloat(token) / 100) * axis
    if (token.endsWith('px') || /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return Number.parseFloat(token)
    return undefined
  }
  const bounded = (left, top, right, bottom, fillRatio) => ({
    left: Math.max(0, Math.min(width, left)),
    top: Math.max(0, Math.min(height, top)),
    right: Math.max(0, Math.min(width, right)),
    bottom: Math.max(0, Math.min(height, bottom)),
    fillRatio: Math.max(0, Math.min(1, fillRatio)),
  })
  const inset = /^inset\(([^)]*)\)/.exec(normalized)
  if (inset) {
    if (/\bround\b/.test(inset[1])) return null
    const values = inset[1].trim().split(/\s+/).filter(Boolean)
    if (values.length === 0 || values.length > 4) return null
    const expanded =
      values.length === 1
        ? [values[0], values[0], values[0], values[0]]
        : values.length === 2
          ? [values[0], values[1], values[0], values[1]]
          : values.length === 3
            ? [values[0], values[1], values[2], values[1]]
            : values
    const top = length(expanded[0], height)
    const right = length(expanded[1], width)
    const bottom = length(expanded[2], height)
    const left = length(expanded[3], width)
    if (![top, right, bottom, left].every(finite)) return null
    return bounded(left, top, width - right, height - bottom, 1)
  }
  const circle = /^circle\(([^)]*)\)$/.exec(normalized)
  if (circle) {
    const [radiusValue, positionValue] = circle[1].split(/\s+at\s+/)
    const position = (positionValue || '50% 50%').trim().split(/\s+/)
    if (position.length !== 2) return null
    const centerX = length(position[0], width)
    const centerY = length(position[1], height)
    const radius = radiusValue.trim().endsWith('%')
      ? length(radiusValue.trim(), Math.hypot(width, height) / Math.SQRT2)
      : length(radiusValue.trim(), Math.min(width, height))
    if (![centerX, centerY, radius].every(finite)) return null
    return bounded(centerX - radius, centerY - radius, centerX + radius, centerY + radius, Math.PI / 4)
  }
  const ellipse = /^ellipse\(([^)]*)\)$/.exec(normalized)
  if (ellipse) {
    const [radiiValue, positionValue] = ellipse[1].split(/\s+at\s+/)
    const radii = radiiValue.trim().split(/\s+/)
    const position = (positionValue || '50% 50%').trim().split(/\s+/)
    if (radii.length !== 2 || position.length !== 2) return null
    const radiusX = length(radii[0], width)
    const radiusY = length(radii[1], height)
    const centerX = length(position[0], width)
    const centerY = length(position[1], height)
    if (![radiusX, radiusY, centerX, centerY].every(finite)) return null
    return bounded(centerX - radiusX, centerY - radiusY, centerX + radiusX, centerY + radiusY, Math.PI / 4)
  }
  const polygon = /^polygon\((.*)\)$/.exec(normalized)
  if (!polygon) return null
  const pointValues = polygon[1]
    .replace(/^\s*(?:evenodd|nonzero)\s*,/i, '')
    .split(',')
    .map((point) => point.trim().split(/\s+/))
  if (pointValues.length < 3 || pointValues.some((point) => point.length !== 2)) return null
  const points = pointValues.map(([x, y]) => [length(x, width), length(y, height)])
  if (points.some(([x, y]) => !finite(x) || !finite(y))) return null
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const area = Math.abs(
    points.reduce((sum, [x, y], index) => {
      const [nextX, nextY] = points[(index + 1) % points.length]
      return sum + x * nextY - nextX * y
    }, 0) / 2,
  )
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return bounded(left, top, right, bottom, area / Math.max(1, (right - left) * (bottom - top)))
}

function auditFilterOpacity(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!normalized || normalized === 'none') return 1
  const calls = [...normalized.matchAll(/([a-z-]+)\(([^()]*)\)/g)]
  if (calls.length === 0 || calls.map((match) => match[0]).join(' ') !== normalized.replace(/\s+/g, ' ')) {
    return undefined
  }
  let product = 1
  for (const call of calls) {
    if (call[1] !== 'opacity') return undefined
    const token = call[2].trim()
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(token)) return undefined
    const parsed = Number.parseFloat(token)
    if (!finite(parsed)) return undefined
    product *= Math.max(0, Math.min(1, token.endsWith('%') ? parsed / 100 : parsed))
  }
  return product
}

function auditValidTextStyleSource(source) {
  if (!isObject(source) || !AUDIT_TEXT_STYLE_SOURCE_KINDS.has(source.kind)) return false
  if (
    !finite(source.widthPx) ||
    source.widthPx <= 2 ||
    !finite(source.heightPx) ||
    source.heightPx <= 2 ||
    !finite(source.visibleWidthPx) ||
    source.visibleWidthPx <= 2 ||
    source.visibleWidthPx > source.widthPx + 1 ||
    !finite(source.visibleHeightPx) ||
    source.visibleHeightPx <= 2 ||
    source.visibleHeightPx > source.heightPx + 1 ||
    !finite(source.paintedAreaPx) ||
    source.paintedAreaPx <= 16 ||
    !finite(source.captureIntersectionRatio) ||
    source.captureIntersectionRatio <= 0 ||
    source.captureIntersectionRatio > 1 ||
    !finite(source.effectiveClipPathAreaRatio) ||
    source.effectiveClipPathAreaRatio <= 0 ||
    source.effectiveClipPathAreaRatio > 1 ||
    !Number.isInteger(source.ancestorClipCount) ||
    source.ancestorClipCount < 0 ||
    !finite(source.clientRectCount) ||
    source.clientRectCount < 1 ||
    !finite(source.glyphRectCount) ||
    source.glyphRectCount < 0 ||
    !isObject(source.visibleBounds) ||
    !Array.isArray(source.visibleGlyphRects) ||
    source.visibleGlyphRects.length > 8 ||
    !finite(source.visibleGlyphAreaPx) ||
    source.visibleGlyphAreaPx < 0 ||
    !Array.isArray(source.clipPathChain) ||
    source.clipPathChain.length > 8 ||
    // Persisted ancestor clips do not carry offsets relative to this owner, so their glyph intersection is unauditable.
    source.clipPathChain.some((item) => item?.owner === 'ancestor') ||
    !Number.isInteger(source.nonRectangularClipPathCount) ||
    source.nonRectangularClipPathCount !== 0 ||
    !finite(source.opacity) ||
    source.opacity <= 0.02 ||
    source.opacity > 1 ||
    !finite(source.filterOpacity) ||
    source.filterOpacity <= 0.02 ||
    source.filterOpacity > 1 ||
    !Array.isArray(source.filterChain) ||
    source.filterChain.length > 8 ||
    !Array.isArray(source.maskChain) ||
    source.maskChain.length !== 0 ||
    !Array.isArray(source.blendChain) ||
    source.blendChain.length !== 0 ||
    !finite(source.textIndentPx) ||
    Math.abs(source.textIndentPx) > Math.max(128, source.widthPx * 2) ||
    typeof source.clip !== 'string' ||
    typeof source.clipPath !== 'string' ||
    typeof source.contentVisibility !== 'string' ||
    typeof source.filter !== 'string' ||
    !['solid-color', 'background-clip'].includes(source.glyphPaintKind)
  ) {
    return false
  }
  const visibleBounds = source.visibleBounds
  if (
    !finite(visibleBounds.xPx) ||
    !finite(visibleBounds.yPx) ||
    !finite(visibleBounds.widthPx) ||
    !finite(visibleBounds.heightPx) ||
    visibleBounds.xPx < -1 ||
    visibleBounds.yPx < -1 ||
    visibleBounds.widthPx <= 2 ||
    visibleBounds.heightPx <= 2 ||
    visibleBounds.xPx + visibleBounds.widthPx > source.widthPx + 1 ||
    visibleBounds.yPx + visibleBounds.heightPx > source.heightPx + 1 ||
    Math.abs(visibleBounds.widthPx - source.visibleWidthPx) > 0.01 ||
    Math.abs(visibleBounds.heightPx - source.visibleHeightPx) > 0.01
  ) {
    return false
  }
  let auditedVisibleGlyphArea = 0
  for (const glyphRect of source.visibleGlyphRects) {
    if (
      !isObject(glyphRect) ||
      !finite(glyphRect.xPx) ||
      !finite(glyphRect.yPx) ||
      !finite(glyphRect.widthPx) ||
      !finite(glyphRect.heightPx) ||
      glyphRect.widthPx <= 1 ||
      glyphRect.heightPx <= 1 ||
      glyphRect.widthPx * glyphRect.heightPx <= 4 ||
      glyphRect.xPx < visibleBounds.xPx - 0.01 ||
      glyphRect.yPx < visibleBounds.yPx - 0.01 ||
      glyphRect.xPx + glyphRect.widthPx > visibleBounds.xPx + visibleBounds.widthPx + 0.01 ||
      glyphRect.yPx + glyphRect.heightPx > visibleBounds.yPx + visibleBounds.heightPx + 0.01
    ) {
      return false
    }
    auditedVisibleGlyphArea += glyphRect.widthPx * glyphRect.heightPx
  }
  if (Math.abs(auditedVisibleGlyphArea - source.visibleGlyphAreaPx) > Math.max(0.01, auditedVisibleGlyphArea * 0.001)) {
    return false
  }
  const directGlyphSource = ['direct-text', 'descendant-text'].includes(source.kind)
  const nativeGlyphSource = ['native-value', 'native-placeholder', 'native-selection'].includes(source.kind)
  if (
    (directGlyphSource &&
      (source.glyphRectCount < source.visibleGlyphRects.length ||
        source.visibleGlyphRects.length === 0 ||
        source.visibleGlyphAreaPx <= 4)) ||
    (nativeGlyphSource &&
      (source.glyphRectCount !== 0 || source.visibleGlyphRects.length !== 0 || source.visibleGlyphAreaPx !== 0))
  ) {
    return false
  }
  if (directGlyphSource && (source.nativeTextBounds !== undefined || source.nativeTextOrigin !== undefined))
    return false
  if (nativeGlyphSource) {
    const nativeBounds = source.nativeTextBounds
    if (
      !isObject(nativeBounds) ||
      !finite(nativeBounds.xPx) ||
      !finite(nativeBounds.yPx) ||
      !finite(nativeBounds.widthPx) ||
      !finite(nativeBounds.heightPx) ||
      nativeBounds.xPx < -0.01 ||
      nativeBounds.yPx < -0.01 ||
      nativeBounds.widthPx <= 2 ||
      nativeBounds.heightPx <= 2 ||
      nativeBounds.xPx + nativeBounds.widthPx > source.widthPx + 0.01 ||
      nativeBounds.yPx + nativeBounds.heightPx > source.heightPx + 0.01 ||
      visibleBounds.xPx > nativeBounds.xPx + 1 ||
      visibleBounds.yPx > nativeBounds.yPx + 1 ||
      visibleBounds.xPx + visibleBounds.widthPx < nativeBounds.xPx + nativeBounds.widthPx - 1 ||
      visibleBounds.yPx + visibleBounds.heightPx < nativeBounds.yPx + nativeBounds.heightPx - 1 ||
      Math.abs(source.textIndentPx) > 1 ||
      (source.kind === 'native-placeholder' && source.nativeTextOrigin !== 'placeholder') ||
      (source.kind === 'native-selection' && !['selection', 'user-agent-default'].includes(source.nativeTextOrigin)) ||
      (source.kind === 'native-value' && !['explicit-value', 'user-agent-default'].includes(source.nativeTextOrigin))
    ) {
      return false
    }
  }
  let auditedFilterOpacity = 1
  const selfFilters = []
  let paintFilterCount = 0
  for (const item of source.filterChain) {
    if (
      !isObject(item) ||
      typeof item.value !== 'string' ||
      item.value.length > 512 ||
      !['self', 'ancestor', 'paint'].includes(item.owner)
    ) {
      return false
    }
    const normalizedFilter = item.value.trim().toLowerCase().replace(/\s+/g, ' ')
    const itemOpacity = auditFilterOpacity(normalizedFilter)
    if (!normalizedFilter || normalizedFilter === 'none' || itemOpacity === undefined) return false
    auditedFilterOpacity *= itemOpacity
    if (item.owner === 'self') selfFilters.push(normalizedFilter)
    if (item.owner === 'paint') paintFilterCount += 1
  }
  const sourceFilter = source.filter.trim().toLowerCase().replace(/\s+/g, ' ')
  if (
    paintFilterCount > 1 ||
    (sourceFilter && sourceFilter !== 'none'
      ? selfFilters.length !== 1 || selfFilters[0] !== sourceFilter
      : selfFilters.length !== 0) ||
    Math.abs(auditedFilterOpacity - source.filterOpacity) > Math.max(0.0001, auditedFilterOpacity * 0.001)
  ) {
    return false
  }
  if (
    (source.glyphPaintKind === 'solid-color' &&
      (typeof source.foreground !== 'string' || (auditColorAlpha(source.foreground) || 0) <= 0.001)) ||
    (source.glyphPaintKind === 'background-clip' &&
      (typeof source.backgroundClip !== 'string' ||
        !source.backgroundClip.split(/\s*,\s*/).includes('text') ||
        typeof source.backgroundImage !== 'string' ||
        !source.backgroundImage ||
        source.backgroundImage === 'none' ||
        source.backgroundImage.length > 512 ||
        source.foreground !== undefined))
  ) {
    return false
  }
  const clip = String(source.clip || '')
    .trim()
    .toLowerCase()
  const clipPath = String(source.clipPath || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if ((clip !== '' && clip !== 'auto') || String(source.contentVisibility || '') === 'hidden') return false
  const clipPathMetrics = auditClipPathMetrics(clipPath, source.widthPx, source.heightPx)
  if (!clipPathMetrics) return false
  const selfClipPaths = []
  for (const item of source.clipPathChain) {
    if (
      !isObject(item) ||
      typeof item.value !== 'string' ||
      !finite(item.widthPx) ||
      item.widthPx <= 2 ||
      !finite(item.heightPx) ||
      item.heightPx <= 2 ||
      !['self', 'ancestor'].includes(item.owner)
    ) {
      return false
    }
    const normalizedValue = item.value.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!normalizedValue.startsWith('inset(') || !auditClipPathMetrics(normalizedValue, item.widthPx, item.heightPx)) {
      return false
    }
    if (item.owner === 'self') selfClipPaths.push(item)
  }
  if (clipPath === 'none' || clipPath === '') {
    if (selfClipPaths.length !== 0) return false
  } else if (
    selfClipPaths.length !== 1 ||
    selfClipPaths[0].value.trim().toLowerCase().replace(/\s+/g, ' ') !== clipPath ||
    Math.abs(selfClipPaths[0].widthPx - source.widthPx) > 1 ||
    Math.abs(selfClipPaths[0].heightPx - source.heightPx) > 1
  ) {
    return false
  }
  const clipWidth = Math.max(0, clipPathMetrics.right - clipPathMetrics.left)
  const clipHeight = Math.max(0, clipPathMetrics.bottom - clipPathMetrics.top)
  const effectiveScale = Math.sqrt(source.effectiveClipPathAreaRatio)
  const visibleBoundsRatio =
    (source.visibleWidthPx * source.visibleHeightPx) / Math.max(1, source.widthPx * source.heightPx)
  const expectedPaintedArea = source.visibleWidthPx * source.visibleHeightPx * source.effectiveClipPathAreaRatio
  const paintedAreaTolerance = Math.max(1, expectedPaintedArea * 0.001)
  if (
    source.visibleWidthPx * effectiveScale <= 2 ||
    source.visibleHeightPx * effectiveScale <= 2 ||
    source.visibleWidthPx > clipWidth + 1 ||
    source.visibleHeightPx > clipHeight + 1 ||
    visibleBounds.xPx < clipPathMetrics.left - 1 ||
    visibleBounds.yPx < clipPathMetrics.top - 1 ||
    visibleBounds.xPx + visibleBounds.widthPx > clipPathMetrics.right + 1 ||
    visibleBounds.yPx + visibleBounds.heightPx > clipPathMetrics.bottom + 1 ||
    source.captureIntersectionRatio + 0.001 < visibleBoundsRatio ||
    source.effectiveClipPathAreaRatio > clipPathMetrics.fillRatio + 0.001 ||
    Math.abs(source.paintedAreaPx - expectedPaintedArea) > paintedAreaTolerance ||
    clipPath.startsWith('inset(50%') ||
    clipPath.startsWith('circle(0') ||
    clipPath.startsWith('ellipse(0')
  ) {
    return false
  }
  return !directGlyphSource || source.glyphRectCount > 0
}

function auditActionableStatusBoundary(boundary, styles) {
  if (
    !isObject(boundary) ||
    typeof boundary.strongVisualBoundary !== 'boolean' ||
    typeof boundary.paintedFill !== 'boolean' ||
    typeof boundary.paintedBorder !== 'boolean' ||
    typeof boundary.paintedShadow !== 'boolean' ||
    typeof boundary.directlyOwnedText !== 'boolean' ||
    !finite(boundary.widthPx) ||
    !finite(boundary.heightPx) ||
    !finite(boundary.viewportWidth) ||
    !finite(boundary.viewportHeight)
  ) {
    return false
  }
  const backgroundAlpha = auditColorAlpha(styles?.backgroundColor)
  const independentlyPaintedFill = backgroundAlpha !== undefined && backgroundAlpha > 0.001
  const independentlyPaintedBorder = ['border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft'].some(
    (property) => typeof styles?.[property] === 'string' && auditVisibleBorder(styles[property]),
  )
  const independentlyPaintedShadow = auditVisibleShadowLayers(styles?.boxShadow).length > 0
  if (
    boundary.paintedFill !== independentlyPaintedFill ||
    boundary.paintedBorder !== independentlyPaintedBorder ||
    boundary.paintedShadow !== independentlyPaintedShadow ||
    boundary.strongVisualBoundary !==
      (independentlyPaintedFill || independentlyPaintedBorder || independentlyPaintedShadow)
  ) {
    return false
  }
  const viewportWidth = Math.max(1, boundary.viewportWidth)
  const viewportHeight = Math.max(1, boundary.viewportHeight)
  const width = Math.max(0, boundary.widthPx)
  const height = Math.max(0, boundary.heightPx)
  const areaRatio = (width * height) / (viewportWidth * viewportHeight)
  const bounded = height <= Math.min(240, viewportHeight * 0.45) && areaRatio <= 0.4
  const compact = height <= Math.min(160, viewportHeight * 0.25) && areaRatio <= 0.2
  const compactWidth = width <= Math.min(720, viewportWidth * 0.8)
  return bounded && (boundary.strongVisualBoundary || (boundary.directlyOwnedText && compact && compactWidth))
}

function validateComponentStyleOwnership(evidence, hardFailures) {
  for (const component of Array.isArray(evidence?.components) ? evidence.components : []) {
    const type = String(component?.type || '')
    const styles = isObject(component?.styles) ? component.styles : {}
    const textProperties = Object.keys(styles).filter((property) => AUDIT_COMPONENT_TEXT_STYLE_PROPERTIES.has(property))
    const owner = component?.textStyleOwner
    const source = component?.textStyleSource
    if (owner !== undefined && owner !== 'root' && owner !== 'descendant') {
      hardFailures.push(`invalid-component-text-style-owner:${String(component?.id || 'unknown')}`)
    }
    if (textProperties.length > 0 && !AUDIT_TEXT_STYLE_COMPONENT_TYPES.has(type)) {
      hardFailures.push(`container-component-owns-text-style:${String(component?.id || 'unknown')}`)
    }
    if (textProperties.length > 0 && owner !== 'root' && owner !== 'descendant') {
      hardFailures.push(`unowned-component-text-style:${String(component?.id || 'unknown')}`)
    }
    if ((owner === 'root' || owner === 'descendant') && !auditValidTextStyleSource(source)) {
      hardFailures.push(`invalid-component-text-style-source:${String(component?.id || 'unknown')}`)
    }
    if (source !== undefined && owner !== 'root' && owner !== 'descendant') {
      hardFailures.push(`orphan-component-text-style-source:${String(component?.id || 'unknown')}`)
    }
    if (source?.kind === 'direct-text' && owner !== 'root') {
      hardFailures.push(`component-text-source-owner-mismatch:${String(component?.id || 'unknown')}`)
    }
    if (source?.kind === 'descendant-text' && owner !== 'descendant') {
      hardFailures.push(`component-text-source-owner-mismatch:${String(component?.id || 'unknown')}`)
    }
    if (typeof styles.color === 'string' && source?.foreground && !auditColorsEqual(styles.color, source.foreground)) {
      hardFailures.push(`component-text-source-color-mismatch:${String(component?.id || 'unknown')}`)
    }
    if (typeof styles.color === 'string' && source?.glyphPaintKind === 'background-clip') {
      hardFailures.push(`component-text-source-color-mismatch:${String(component?.id || 'unknown')}`)
    }
    if (
      typeof styles.color === 'string' &&
      (!finite(source?.opacity) ||
        source.opacity < 0.999 ||
        !finite(source?.filterOpacity) ||
        source.filterOpacity < 0.999)
    ) {
      hardFailures.push(`component-text-source-color-mismatch:${String(component?.id || 'unknown')}`)
    }
    if (typeof styles.color === 'string' && !auditVisibleColor(styles.color)) {
      hardFailures.push(`transparent-component-foreground:${String(component?.id || 'unknown')}`)
    }
    if (type === 'status' && owner === 'descendant') {
      hardFailures.push(`status-component-descendant-text-style:${String(component?.id || 'unknown')}`)
    }
    if (type === 'status' && !isObject(component?.statusBoundary)) {
      hardFailures.push(`missing-status-boundary-evidence:${String(component?.id || 'unknown')}`)
    }
    if (AUDIT_CONTENT_SIZED_COMPONENT_TYPES.has(type) && ('height' in styles || 'minHeight' in styles)) {
      hardFailures.push(`content-sized-component-height:${String(component?.id || 'unknown')}`)
    }
  }
}

function validateLayoutTextStyleOwnership(evidence, hardFailures) {
  for (const node of Array.isArray(evidence?.layoutNodes) ? evidence.layoutNodes : []) {
    const id = String(node?.id || 'unknown')
    const typography = isObject(node?.observedTypography) ? node.observedTypography : undefined
    const source = node?.textStyleSource
    const typographyRefs = (Array.isArray(node?.tokenRefs) ? node.tokenRefs : []).filter((ref) =>
      String(ref).startsWith('typography.'),
    )
    const ownsTypography = Boolean(node?.textRole || typography || typographyRefs.length > 0)
    if (ownsTypography && !auditValidTextStyleSource(source)) {
      hardFailures.push(`invalid-layout-text-style-source:${id}`)
      continue
    }
    if (source !== undefined && !ownsTypography) hardFailures.push(`orphan-layout-text-style-source:${id}`)
    if (typography) {
      const observedValues = Object.values(typography).filter((value) => typeof value === 'string' && value)
      if (observedValues.length === 0) hardFailures.push(`empty-layout-observed-typography:${id}`)
      if (
        typeof typography.color === 'string' &&
        (source?.glyphPaintKind !== 'solid-color' ||
          !auditColorsEqual(typography.color, source.foreground) ||
          source.opacity < 0.999 ||
          source.filterOpacity < 0.999)
      ) {
        hardFailures.push(`layout-text-source-color-mismatch:${id}`)
      }
      if (typeof typography.color === 'string' && !auditVisibleColor(typography.color)) {
        hardFailures.push(`transparent-layout-foreground:${id}`)
      }
    }
  }
}

function auditComponentReuse(identityConfidence, totalCount, styleObservationCount, pageCount) {
  const agreement = totalCount > 0 ? styleObservationCount / totalCount : 0
  const support =
    styleObservationCount <= 1
      ? 0.25
      : pageCount >= 2
        ? Math.min(1, 0.75 + pageCount * 0.05)
        : Math.min(0.8, 0.5 + styleObservationCount * 0.1)
  return {
    reuseConfidence: Math.round(Math.min(identityConfidence, agreement * support) * 100) / 100,
    reuseScope: styleObservationCount <= 1 ? 'isolated' : pageCount >= 2 ? 'cross-page' : 'page-repeated',
  }
}

function auditReusableComponentPattern(pattern) {
  return pattern.matchingStyleInstances >= 2 && pattern.reuseConfidence >= COMPONENT_REUSE_THRESHOLD
}

function auditMeaningfulComponentStyleValue(property, value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!normalized || ['none', 'normal', 'auto', 'initial', 'inherit', 'unset'].includes(normalized)) return false
  if (property === 'border') return auditVisibleBorder(value)
  if (property === 'boxShadow') return auditVisibleShadowLayers(value).length > 0
  if (property === 'borderRadius' && auditContextDependentRadius(value)) return false
  if (['padding', 'gap', 'height', 'minHeight', 'borderRadius'].includes(property)) {
    const dimensions = normalized.match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)?/g)
    return dimensions ? dimensions.some((dimension) => Math.abs(Number.parseFloat(dimension)) > 0.001) : true
  }
  if (['backgroundColor', 'color'].includes(property)) return auditVisibleColor(value)
  return true
}

function auditComponentPaddingSides(value) {
  const dimensions = String(value || '')
    .trim()
    .split(/\s+/)
    .map((dimension) => Number.parseFloat(dimension))
  if (dimensions.length < 1 || dimensions.length > 4 || dimensions.some((dimension) => !Number.isFinite(dimension))) {
    return null
  }
  const [top, right = top, bottom = top, left = right] = dimensions
  return [top, right, bottom, left]
}

function auditButtonLikeBoundary(styles) {
  if (auditVisibleColor(styles?.backgroundColor)) return true
  if (auditVisibleComponentBorders(styles).length > 0) return true
  const padding = auditComponentPaddingSides(styles?.padding)
  const height = Number.parseFloat(styles?.height || '')
  return Boolean(
    padding &&
    Number.isFinite(height) &&
    height >= 28 &&
    (padding[1] + padding[3] >= 16 || padding[0] + padding[2] >= 12),
  )
}

function auditActionableComponentPattern(pattern, sharedTokenRefs) {
  if (!AUDIT_COMPONENT_TYPES.has(pattern.type) || !auditReusableComponentPattern(pattern)) return false
  if (['button', 'tab'].includes(pattern.type) && pattern.visualTreatments?.includes('structural')) return false
  if (pattern.visualTreatments?.includes('button-like')) {
    if (!auditButtonLikeBoundary(pattern.styles)) return false
    const hasObservedLabelTypography = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].some(
      (property) => auditMeaningfulComponentStyleValue(property, pattern.styles?.[property]),
    )
    if (!hasObservedLabelTypography) return false
  }
  if (pattern.type === 'status') {
    const components = Array.isArray(pattern.components) ? pattern.components : []
    const support = components.filter((component) =>
      auditActionableStatusBoundary(component.statusBoundary, component.styles),
    ).length
    if (support < Math.max(2, Math.ceil(components.length * 0.8))) return false
  }
  const dimensions = new Set(
    sharedTokenRefs.map((ref) => (ref.startsWith('typography.') ? 'typography' : ref.split('.')[0])),
  )
  for (const [property, value] of Object.entries(pattern.styles || {})) {
    if (!auditMeaningfulComponentStyleValue(property, value)) continue
    if (['backgroundColor', 'color'].includes(property)) dimensions.add('color')
    if (['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].includes(property)) {
      dimensions.add('typography')
    }
    if (['padding', 'gap', 'height', 'minHeight'].includes(property)) dimensions.add('spacing')
    if (property === 'borderRadius') dimensions.add('radius')
    if (property === 'border') dimensions.add('border')
    if (property === 'boxShadow') dimensions.add('shadow')
  }
  const hasAppearance = dimensions.has('color') || dimensions.has('typography')
  const hasStructure = ['spacing', 'radius', 'border', 'shadow'].some((dimension) => dimensions.has(dimension))
  return hasAppearance && hasStructure && dimensions.size >= 2
}

function auditSharedComponentTokenRefs(components) {
  if (components.length === 0) return []
  const support = new Map()
  for (const component of components) {
    const styles = auditNormalizeComponentStyleRecord(component)
    const dimensions = new Set()
    if (styles.backgroundColor || styles.color) dimensions.add('color')
    if (
      Object.keys(styles).some(
        (property) => property === 'border' || /^border(?:Top|Right|Bottom|Left)$/.test(property),
      )
    ) {
      dimensions.add('border')
      dimensions.add('color')
    }
    if (['padding', 'gap', 'height', 'minHeight'].some((property) => styles[property])) dimensions.add('spacing')
    if (styles.borderRadius && !auditContextDependentRadius(styles.borderRadius)) dimensions.add('radius')
    if (styles.boxShadow) dimensions.add('shadow')
    if (['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].some((property) => styles[property])) {
      dimensions.add('typography')
    }
    for (const ref of new Set(Array.isArray(component.tokenRefs) ? component.tokenRefs : [])) {
      const dimension = ref.startsWith('typography.')
        ? 'typography'
        : ref.startsWith('spacing.')
          ? 'spacing'
          : ref.startsWith('color.')
            ? 'color'
            : ref.startsWith('border.')
              ? 'border'
              : ref.startsWith('radius.') || ref.startsWith('rounded.')
                ? 'radius'
                : ref.startsWith('shadow.')
                  ? 'shadow'
                  : undefined
      if (!dimension || dimensions.has(dimension)) support.set(ref, (support.get(ref) || 0) + 1)
    }
  }
  const minimum = components.length <= 1 ? 1 : Math.max(2, Math.ceil(components.length * 0.8))
  return [...support.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .map(([ref]) => ref)
}

function auditConsensusComponentRole(components) {
  const counts = new Map()
  for (const component of components) {
    const role = component.role?.trim()
    if (role) counts.set(role, (counts.get(role) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .find(([, count]) => count / Math.max(components.length, 1) >= 0.8)?.[0]
}

function buildAuditCanonicalComponentPatterns(evidence) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : []
  const pageById = new Map(pages.map((page) => [page?.id, page]))
  const canonicalPages = canonicalEvidencePageIds(evidence)
  const primaryColor = evidence?.tokens?.colors?.primary
  const surfaceColors = [
    evidence?.tokens?.colors?.background,
    evidence?.tokens?.colors?.surface,
    evidence?.tokens?.colors?.secondary,
  ].filter(Boolean)
  const candidates = (Array.isArray(evidence?.components) ? evidence.components : [])
    .filter(
      (component) =>
        canonicalPages.has(component?.pageId) &&
        AUDIT_COMPONENT_TYPES.has(component?.type) &&
        finite(component?.confidence) &&
        component.confidence >= 0.8,
    )
    .map((component) => {
      const page = pageById.get(component.pageId)
      const pageWidth = page?.contentWidth || page?.viewportWidth
      const pageHeight = page?.contentHeight || page?.viewportHeight
      return {
        ...component,
        styles: auditNormalizeComponentStyleRecord(component),
        tokenRefs: Array.isArray(component.tokenRefs) ? component.tokenRefs : [],
        primaryColor,
        surfaceColors,
        ...(pageWidth ? { widthPx: Number(component?.rect?.width) * pageWidth } : {}),
        ...(pageHeight ? { heightPx: Number(component?.rect?.height) * pageHeight } : {}),
      }
    })
    .filter(
      (candidate) =>
        candidate.type !== 'button' ||
        candidate.widthPx === undefined ||
        candidate.heightPx === undefined ||
        (candidate.widthPx >= 12 && candidate.heightPx >= 12),
    )
  const cardStyles = new Set(
    candidates.filter((candidate) => candidate.type === 'card').map((candidate) => auditCardStyle(candidate.styles)),
  )
  const sizesByVariant = new Map()
  const buttonStylesByVariant = new Map()
  for (const candidate of candidates) {
    if (candidate.type !== 'button') continue
    const variant = auditCatalogVariant(candidate)
    const key = `${candidate.type}|${variant || ''}`
    const styles = buttonStylesByVariant.get(key) || new Set()
    styles.add(auditButtonStyleFamily(candidate))
    buttonStylesByVariant.set(key, styles)
    if (candidate.heightPx) {
      const size = candidate.heightPx <= 36 ? 'sm' : candidate.heightPx <= 48 ? 'md' : 'lg'
      const sizes = sizesByVariant.get(key) || new Set()
      sizes.add(size)
      sizesByVariant.set(key, sizes)
    }
  }
  const groups = new Map()
  for (const candidate of candidates) {
    const variant = auditCatalogVariant(candidate)
    const measuredSize =
      candidate.type === 'button' && candidate.heightPx
        ? candidate.heightPx <= 36
          ? 'sm'
          : candidate.heightPx <= 48
            ? 'md'
            : 'lg'
        : undefined
    const variantKey = `${candidate.type}|${variant || ''}`
    const size = (sizesByVariant.get(variantKey)?.size || 0) > 1 ? measuredSize : undefined
    const semanticRole = candidate.type === 'status' ? candidate.role : undefined
    const semanticSubtype = auditSemanticComponentSubtype(candidate)
    const cardStyle = candidate.type === 'card' ? auditCardStyle(candidate.styles) : undefined
    const buttonStyle =
      candidate.type === 'button' && (buttonStylesByVariant.get(variantKey)?.size || 0) > 1
        ? auditButtonStyleFamily(candidate)
        : undefined
    const styleSignature = auditComponentStyleSignature(candidate.styles)
    const key = `${candidate.type}|${variant || ''}|${size || ''}|${semanticRole || ''}|${semanticSubtype || ''}|${cardStyle || ''}|${buttonStyle || ''}|${candidate.semanticIdentity || ''}|${candidate.visualTreatment || ''}|${candidate.usageContext || ''}|${styleSignature}`
    const group = groups.get(key) || {
      type: candidate.type,
      variant,
      size,
      semanticRole,
      semanticSubtype,
      cardStyle,
      buttonStyle,
      semanticIdentity: candidate.semanticIdentity,
      visualTreatment: candidate.visualTreatment,
      usageContext: candidate.usageContext,
      styleSignature,
      candidates: [],
    }
    group.candidates.push(candidate)
    groups.set(key, group)
  }
  const patterns = [...groups.values()].map((group) => {
    const confidence =
      Math.round(
        (group.candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / group.candidates.length) * 100,
      ) / 100
    const variant = auditPromotedVariant(group.variant, group.candidates)
    const pageCount = new Set(group.candidates.map((candidate) => candidate.pageId)).size
    const reuse = auditComponentReuse(confidence, group.candidates.length, group.candidates.length, pageCount)
    const sharedTokenRefs = auditSharedComponentTokenRefs(group.candidates)
    const name =
      group.semanticRole ||
      (group.semanticSubtype
        ? `${group.type}-${group.semanticSubtype}`
        : [
            group.type,
            variant,
            group.size,
            group.buttonStyle,
            group.type === 'card' && cardStyles.size > 1 ? group.cardStyle : undefined,
          ]
            .filter(Boolean)
            .join('-'))
    return {
      type: group.type,
      name,
      variant,
      styleSignature: group.styleSignature,
      styles: group.candidates[0].styles,
      components: [...group.candidates].sort((first, second) => first.id.localeCompare(second.id)),
      sourceInstances: group.candidates.length,
      matchingStyleInstances: group.candidates.length,
      pageCount,
      identityConfidence: confidence,
      ...reuse,
      sharedTokenRefs,
      ...(group.semanticIdentity ? { semanticIdentities: [group.semanticIdentity] } : {}),
      ...(group.visualTreatment ? { visualTreatments: [group.visualTreatment] } : {}),
      ...(group.usageContext ? { usageContexts: [group.usageContext] } : {}),
    }
  })
  const patternsByName = new Map()
  for (const pattern of patterns) {
    const group = patternsByName.get(pattern.name) || []
    group.push(pattern)
    patternsByName.set(pattern.name, group)
  }
  for (const sameName of patternsByName.values()) {
    if (sameName.length <= 1) continue
    sameName
      .sort(
        (first, second) =>
          second.sourceInstances - first.sourceInstances || first.styleSignature.localeCompare(second.styleSignature),
      )
      .forEach((pattern, index) => {
        pattern.name = `${pattern.name}-style-${index + 1}`
      })
  }
  return patterns
    .map((pattern) => {
      const actionable = auditActionableComponentPattern(pattern, pattern.sharedTokenRefs)
      return {
        ...pattern,
        actionable,
        reusable: auditReusableComponentPattern(pattern),
        expectedPriority: actionable ? 'P1' : 'P2',
        canonicalVariant:
          pattern.name === pattern.type
            ? 'default'
            : pattern.name.startsWith(`${pattern.type}-`)
              ? pattern.name.slice(pattern.type.length + 1)
              : pattern.name,
      }
    })
    .sort(
      (first, second) =>
        AUDIT_COMPONENT_ORDER.indexOf(first.type) - AUDIT_COMPONENT_ORDER.indexOf(second.type) ||
        AUDIT_COMPONENT_VARIANT_ORDER.indexOf(first.variant) - AUDIT_COMPONENT_VARIANT_ORDER.indexOf(second.variant) ||
        first.name.localeCompare(second.name),
    )
}

function buildAuditFreeformComponentSummaries(evidence) {
  const canonicalPages = canonicalEvidencePageIds(evidence)
  const allComponents = Array.isArray(evidence?.components) ? evidence.components : []
  const canonicalComponents =
    canonicalPages.size > 0 ? allComponents.filter((component) => canonicalPages.has(component?.pageId)) : allComponents
  const groups = new Map()
  for (const component of canonicalComponents) {
    if (AUDIT_COMPONENT_TYPES.has(component?.type)) continue
    const name = component?.type === 'status' && component?.role ? component.role : component?.type
    const group = groups.get(name) || []
    group.push(component)
    groups.set(name, group)
  }
  return [...groups.values()].map((components) => {
    const styleGroups = new Map()
    for (const component of components) {
      const signature = auditComponentStyleSignature(component?.styles)
      const matches = styleGroups.get(signature) || []
      matches.push(component)
      styleGroups.set(signature, matches)
    }
    const representative =
      [...styleGroups.entries()].sort(
        ([firstSignature, first], [secondSignature, second]) =>
          second.length - first.length || firstSignature.localeCompare(secondSignature),
      )[0]?.[1] || []
    const confidence =
      Math.round(
        (components.reduce((sum, component) => sum + Number(component?.confidence || 0), 0) / components.length) * 100,
      ) / 100
    const pageCount = new Set(representative.map((component) => component?.pageId)).size
    const reuse = auditComponentReuse(confidence, components.length, representative.length, pageCount)
    return {
      sourceInstances: components.length,
      matchingStyleInstances: representative.length,
      ...reuse,
      reusable: representative.length >= 2 && reuse.reuseConfidence >= COMPONENT_REUSE_THRESHOLD,
    }
  })
}

function designMdDimension(value) {
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem)$/i.test(String(value).trim())
}

function designMdScaleValue(value) {
  const trimmed = String(value).trim()
  if (designMdDimension(trimmed)) return trimmed
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : undefined
}

function normalizedFrontMatterColor(value) {
  const trimmed = String(value).trim().toLowerCase()
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(trimmed)
  if (rgb) {
    const [red, green, blue] = rgb.slice(1, 4).map(Number)
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4])
    if ([red, green, blue, alpha].every(Number.isFinite)) {
      if (alpha < 0.999) {
        return `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${Number(alpha.toFixed(3))})`
      }
      return `#${[red, green, blue]
        .map((channel) =>
          Math.max(0, Math.min(255, Math.round(channel)))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`
    }
  }
  const shortHex = /^#([\da-f])([\da-f])([\da-f])$/i.exec(trimmed)
  if (shortHex)
    return `#${shortHex
      .slice(1)
      .map((part) => `${part}${part}`)
      .join('')}`
  return trimmed.replace(/\s+/g, ' ')
}

function auditColorTokenRoleCompatible(property, tokenRef) {
  const role = String(tokenRef || '').match(/^(?:color|colors)\.([\w-]+)$/)?.[1]
  if (!role) return false
  const text = new Set(['foreground', 'muted-foreground', 'accent', 'editorial-accent', 'danger'])
  const surface = new Set(['background', 'surface', 'secondary', 'primary', 'accent', 'danger', 'decorative-accent'])
  const border = new Set(['border', 'border-subtle'])
  const outline = new Set(['border', 'border-subtle', 'primary', 'accent', 'danger'])
  const glyph = new Set([
    'foreground',
    'muted-foreground',
    'primary',
    'accent',
    'editorial-accent',
    'danger',
    'decorative-accent',
  ])
  if (property === 'backgroundColor') return surface.has(role)
  if (/^border(?:Top|Right|Bottom|Left)?Color$/.test(property)) return border.has(role)
  if (property === 'outlineColor') return outline.has(role)
  if (property === 'stroke') return glyph.has(role) || border.has(role)
  if (property === 'fill') return glyph.has(role)
  return (property === 'color' || property === 'textDecorationColor') && text.has(role)
}

function expectedDesignMdColors(tokens) {
  return Object.fromEntries(
    Object.entries(tokens?.colors || {}).flatMap(([name, value]) =>
      /^(?:dark-)?palette-\d+$/.test(name) ? [] : [[name, normalizedFrontMatterColor(value)]],
    ),
  )
}

function designMdDarkColorEntries(tokens) {
  return Object.entries(tokens?.colors || {}).flatMap(([sourceName, rawValue]) => {
    const value = normalizedFrontMatterColor(rawValue)
    if (!/^#[\da-f]{6}$|^rgba\(/i.test(value)) return []
    let publicName = sourceName
    if (/^(?:dark-)?palette-\d+$/.test(sourceName)) {
      const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/i.exec(value)
      const slug = rgba
        ? `${rgba
            .slice(1, 4)
            .map((channel) => Number(channel).toString(16).padStart(2, '0'))
            .join('')}-${Math.round(Number(rgba[4]) * 255)
            .toString(16)
            .padStart(2, '0')}`
        : value.slice(1).toLowerCase()
      publicName = `dark-observed-${slug}`
    }
    return [{ sourceName, publicName, value }]
  })
}

function validateDesignDocDarkColorTable(source, darkTokens, hardFailures) {
  const lines = String(source || '').split(/\r?\n/)
  const normalizedLines = lines.map(normalizedMarkdownContainerLine)
  const headings = new Set(['Dark Mode Colors', '深色模式颜色'])
  const headingIndexes = normalizedLines.flatMap((line, index) => {
    const match = /^###\s+(.+)$/.exec(line)
    return match && headings.has(match[1].trim()) ? [index] : []
  })
  const rowPattern = /^\|\s*`--color-([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$/
  const allRows = normalizedLines.flatMap((line, index) => {
    const match = rowPattern.exec(line)
    return match ? [{ index, name: match[1], value: normalizedFrontMatterColor(match[2]) }] : []
  })
  if (!darkTokens) {
    if (headingIndexes.length > 0 || allRows.length > 0) hardFailures.push('unexpected-design-doc-dark-color-table')
    return
  }
  if (headingIndexes.length !== 1) {
    hardFailures.push('design-doc-dark-color-table-mismatch')
    return
  }
  const headingIndex = headingIndexes[0]
  const sectionEnd = normalizedLines.findIndex((line, index) => index > headingIndex && /^#{2,3}\s+/.test(line))
  const ownedRows = allRows.filter(({ index }) => index > headingIndex && (sectionEnd < 0 || index < sectionEnd))
  if (ownedRows.length !== allRows.length) hardFailures.push('design-doc-dark-color-table-ownership-mismatch')
  const actual = new Map()
  for (const row of ownedRows) {
    if (actual.has(row.name)) hardFailures.push(`duplicate-design-doc-dark-color-row:${row.name}`)
    actual.set(row.name, row.value)
  }
  const expected = new Map(designMdDarkColorEntries(darkTokens).map(({ publicName, value }) => [publicName, value]))
  if (stableJson([...actual].sort()) !== stableJson([...expected].sort())) {
    hardFailures.push('design-doc-dark-color-table-mismatch')
  }
}

function validateDesignDocDarkDetection(source, darkTokens, contract, hardFailures) {
  if (!darkTokens) return
  const lines = String(source || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\*\*(?:Dark Mode:|深色模式：)\*\*/.test(line))
  const selector = contract?.selector
  const englishDetection =
    contract?.method === 'class-toggle'
      ? `toggling ${selector} and reading computed styles`
      : 'emulating prefers-color-scheme: dark and reading computed styles'
  const chineseDetection =
    contract?.method === 'class-toggle'
      ? `切换 ${selector} 后读取计算样式`
      : '模拟 prefers-color-scheme: dark 后读取计算样式'
  const expected = new Set([
    `**Dark Mode:** Supported. Dark tokens were observed by ${englishDetection}; this does not imply the site loads in dark by default.`,
    `**深色模式：** 支持。暗色令牌通过${chineseDetection}主动观察得到；不代表该站点默认以深色加载。`,
  ])
  if (lines.length !== 1 || !expected.has(lines[0])) hardFailures.push('design-doc-dark-detection-projection-mismatch')
}

function expectedDesignMdFontFamilies(tokens, identityTokens = tokens) {
  const result = {}
  portableFontEntries(tokens?.typography || {}, identityTokens?.typography || {}).forEach(({ name, value }) => {
    result[`font-family-${name}`] = { fontFamily: value }
  })
  return result
}

function expectedDesignMdTypography(tokens) {
  const result = expectedDesignMdFontFamilies(tokens)
  const typography = tokens?.typography || {}
  portableFontSizeEntries(typography.fontSizes).forEach(({ name, value: fontSize }) => {
    if (designMdDimension(fontSize)) result[`size-${name}`] = { fontSize }
  })
  ;(typography.fontWeights || []).forEach((fontWeight, index) => {
    const numeric = Number(fontWeight)
    if (Number.isFinite(numeric)) {
      result[`weight-${tailwindFontWeightName(fontWeight, index)}`] = { fontWeight: numeric }
    }
  })
  portableLineHeightEntries(typography.lineHeights).forEach(({ name, value: lineHeight }) => {
    const value = designMdScaleValue(lineHeight)
    if (value !== undefined) result[`line-height-${name}`] = { lineHeight: value }
  })
  portableLetterSpacingEntries(typography.letterSpacings).forEach(({ name, value: letterSpacing }) => {
    if (designMdDimension(letterSpacing)) {
      result[`letter-spacing-${name}`] = { letterSpacing }
    }
  })
  return result
}

function validateDesignDocDarkMode(extension, tokens, darkTokens, dtcg, designSource, hardFailures) {
  const actual = isObject(extension?.darkMode) ? extension.darkMode : null
  validateDesignDocDarkColorTable(designSource, darkTokens, hardFailures)
  validateDesignDocDarkDetection(designSource, darkTokens, dtcg?.$extensions?.['com.imprint.darkMode'], hardFailures)
  if (!darkTokens) {
    if (actual) hardFailures.push('unexpected-design-doc-dark-mode')
    return
  }
  if (!actual) {
    hardFailures.push('missing-design-doc-dark-mode')
    return
  }
  const expectedOverrides = isObject(dtcg?.$extensions?.['com.imprint.darkMode']?.overrides)
    ? dtcg.$extensions['com.imprint.darkMode'].overrides
    : {}
  const actualOverrides = isObject(actual.overrides) ? actual.overrides : {}
  if (stableJson(actualOverrides) !== stableJson(expectedOverrides)) {
    hardFailures.push('design-doc-dark-overrides-mismatch')
  }
  const expectedRefs = Object.keys(expectedOverrides).sort()
  const actualRefs = Array.isArray(actual.overrideRefs) ? [...actual.overrideRefs].sort() : []
  if (stableJson(actualRefs) !== stableJson(expectedRefs)) hardFailures.push('design-doc-dark-override-refs-mismatch')
  const expectedMethod = dtcg?.$extensions?.['com.imprint.darkMode']?.method
  const expectedSelector = dtcg?.$extensions?.['com.imprint.darkMode']?.selector
  if (actual.method !== expectedMethod || actual.selector !== expectedSelector) {
    hardFailures.push('design-doc-dark-detection-mismatch')
  }
  const expectedColors = expectedDesignMdColors(darkTokens)
  const actualColors = isObject(actual.colors) ? actual.colors : {}
  if (stableJson(actualColors) !== stableJson(expectedColors)) {
    hardFailures.push('design-doc-dark-color-catalog-mismatch')
  }
  const expectedFonts = expectedDesignMdFontFamilies(darkTokens, tokens)
  const actualFonts = isObject(actual.fontFamilies) ? actual.fontFamilies : {}
  if (stableJson(actualFonts) !== stableJson(expectedFonts)) {
    hardFailures.push('design-doc-dark-font-catalog-mismatch')
  }
}

function singleDesignMdDimension(value) {
  const dimensions = String(value || '')
    .trim()
    .split(/\s+/)
  if (dimensions.length === 0 || dimensions.some((dimension) => !designMdDimension(dimension))) return null
  return dimensions.every((dimension) => dimension === dimensions[0]) ? dimensions[0] : null
}

function componentSpecName(spec) {
  const variant = String(spec?.variant || 'default')
  return variant === 'default' ? String(spec?.component || '') : `${String(spec?.component || '')}-${variant}`
}

function reusableSpecSupportsPill(spec, value) {
  if (
    spec?.component !== 'button' ||
    !finite(spec?.sourceInstances) ||
    spec.sourceInstances < 2 ||
    !finite(spec?.reuseConfidence) ||
    spec.reuseConfidence < COMPONENT_REUSE_THRESHOLD
  ) {
    return false
  }
  const radii = sortedStrings(spec?.styles?.borderRadius)
  if (!radii.includes(value)) return false
  const radius = Number.parseFloat(value)
  if (!Number.isFinite(radius)) return /%/.test(value)
  if (/%/.test(value) || radius >= 64) return true
  const height = sortedStrings(spec?.styles?.height).map(Number.parseFloat).find(Number.isFinite)
  return height !== undefined && radius >= Math.max(12, height / 2 - 1)
}

function expectedDesignMdComponents(specs, colors, typography, rounded) {
  const result = {}
  const colorEntries = Object.entries(colors)
  const radiusEntries = Object.entries(rounded)
  const typographyEntries = Object.entries(typography).flatMap(([name, value]) =>
    typeof value?.fontSize === 'string' ? [[name, value.fontSize]] : [],
  )
  const referenceFor = (
    group,
    entries,
    value,
    normalize = (candidate) => String(candidate).trim().toLowerCase(),
    compatible = () => true,
  ) => {
    const normalized = normalize(value)
    const match = entries.find(
      ([name, candidate]) => /^[\w-]+$/.test(name) && compatible(name) && normalize(candidate) === normalized,
    )
    return match ? `{${group}.${match[0]}}` : null
  }
  for (const spec of specs) {
    const style = Object.fromEntries(
      Object.entries(spec?.styles || {}).flatMap(([property, values]) =>
        Array.isArray(values) && values.length > 0 ? [[property, String(values[0])]] : [],
      ),
    )
    const properties = {}
    const normalizedBackground = normalizedCandidateColor(style.backgroundColor)
    if (
      normalizedBackground &&
      auditVisibleColor(style.backgroundColor) &&
      (auditColorAlpha(style.backgroundColor) ?? 1) >= 0.999
    ) {
      properties.backgroundColor =
        referenceFor('colors', colorEntries, style.backgroundColor, normalizedCandidateColor, (name) =>
          auditColorTokenRoleCompatible('backgroundColor', `color.${name}`),
        ) || normalizedBackground
    }
    const normalizedText = normalizedCandidateColor(style.color)
    if (normalizedText && auditVisibleColor(style.color)) {
      properties.textColor =
        referenceFor('colors', colorEntries, style.color, normalizedCandidateColor, (name) =>
          auditColorTokenRoleCompatible('color', `color.${name}`),
        ) || normalizedText
    }
    const radius = auditContextDependentRadius(style.borderRadius) ? null : singleDesignMdDimension(style.borderRadius)
    if (radius && Math.abs(Number.parseFloat(radius)) > 0.001) {
      properties.rounded = referenceFor('rounded', radiusEntries, radius) || radius
    }
    const padding = singleDesignMdDimension(style.padding)
    if (padding && Math.abs(Number.parseFloat(padding)) > 0.001) properties.padding = padding
    if (style.fontSize) {
      const typographyRef = referenceFor('typography', typographyEntries, style.fontSize)
      if (typographyRef) properties.typography = typographyRef
    }
    if (Object.keys(properties).length > 0) result[componentSpecName(spec)] = properties
  }
  return result
}

function validateFrontMatterAgreement(frontMatterValue, extension, tokens, componentSpecs, profile, hardFailures) {
  if (!isObject(frontMatterValue) || !isObject(tokens)) return
  const specs = Array.isArray(componentSpecs?.components) ? componentSpecs.components : []
  const p1Recipes = Array.isArray(profile?.transferGrammar?.componentRecipes)
    ? profile.transferGrammar.componentRecipes.filter((recipe) => recipe?.priority === 'P1')
    : []
  const selectedP1Recipes = selectComponentDetails(p1Recipes)
  const selectedP1Keys = new Set(selectedP1Recipes.map(componentRecipeKey))
  const selectedSpecs = specs.filter((spec) => selectedP1Keys.has(componentRecipeKey(spec)))
  const expectedColors = expectedDesignMdColors(tokens)
  const actualColors = Object.fromEntries(
    Object.entries(isObject(frontMatterValue.colors) ? frontMatterValue.colors : {}).map(([name, value]) => [
      name,
      normalizedFrontMatterColor(value),
    ]),
  )
  if (stableJson(actualColors) !== stableJson(expectedColors)) hardFailures.push('design-doc-colors-catalog-mismatch')

  const expectedTypography = expectedDesignMdTypography(tokens)
  const actualTypography = isObject(frontMatterValue.typography) ? frontMatterValue.typography : {}
  if (stableJson(actualTypography) !== stableJson(expectedTypography)) {
    hardFailures.push('design-doc-typography-catalog-mismatch')
  }
  const typographyAliasCatalog = new Map()
  for (const [name, value] of Object.entries(actualTypography)) {
    if (name.startsWith('size-') && typeof value?.fontSize === 'string') {
      typographyAliasCatalog.set(`--text-${name.slice('size-'.length)}`, value.fontSize)
    } else if (name.startsWith('line-height-') && value?.lineHeight !== undefined) {
      typographyAliasCatalog.set(`--leading-${name.slice('line-height-'.length)}`, String(value.lineHeight))
    } else if (name.startsWith('letter-spacing-') && typeof value?.letterSpacing === 'string') {
      typographyAliasCatalog.set(`--tracking-${name.slice('letter-spacing-'.length)}`, value.letterSpacing)
    }
  }
  validateTypographyAliasSemantics(typographyAliasCatalog, 'DESIGN.md', hardFailures)

  const expectedSpacing = Object.fromEntries(
    (tokens.spacing || []).flatMap((value, index) => {
      const scaleValue = designMdScaleValue(value)
      return scaleValue === undefined ? [] : [[`space-${index + 1}`, scaleValue]]
    }),
  )
  const actualSpacing = isObject(frontMatterValue.spacing) ? frontMatterValue.spacing : {}
  if (stableJson(actualSpacing) !== stableJson(expectedSpacing))
    hardFailures.push('design-doc-spacing-catalog-mismatch')

  const expectedRounded = Object.fromEntries(
    (tokens.radii || []).flatMap((value, index) =>
      designMdDimension(value) ? [[RADIUS_NAMES[index] || `${index + 1}`, value]] : [],
    ),
  )
  const actualRounded = isObject(frontMatterValue.rounded) ? frontMatterValue.rounded : {}
  if ('pill' in actualRounded && !Object.values(expectedRounded).includes(actualRounded.pill)) {
    if (selectedSpecs.some((spec) => reusableSpecSupportsPill(spec, actualRounded.pill)))
      expectedRounded.pill = actualRounded.pill
    else hardFailures.push('unsupported-design-doc-pill-radius')
  }
  if (stableJson(actualRounded) !== stableJson(expectedRounded))
    hardFailures.push('design-doc-rounded-catalog-mismatch')

  const expectedNonstandard = {
    ...((tokens.shadows || []).length > 0 ? { shadows: tokens.shadows } : {}),
    ...((tokens.borders || []).length > 0 ? { borders: tokens.borders } : {}),
    ...((tokens.radii || []).some((radius) => !designMdDimension(radius))
      ? { radii: tokens.radii.filter((radius) => !designMdDimension(radius)) }
      : {}),
    ...((tokens.zIndices || []).length > 0 ? { zIndices: tokens.zIndices } : {}),
    ...((tokens.transitions || []).length > 0 ? { transitions: tokens.transitions } : {}),
  }
  const actualNonstandard = isObject(extension?.nonstandardTokens) ? extension.nonstandardTokens : {}
  if (stableJson(actualNonstandard) !== stableJson(expectedNonstandard)) {
    hardFailures.push('design-doc-nonstandard-token-catalog-mismatch')
  }

  const expectedComponents = expectedDesignMdComponents(
    selectedSpecs,
    expectedColors,
    expectedTypography,
    expectedRounded,
  )
  const actualComponents = isObject(frontMatterValue.components) ? frontMatterValue.components : {}
  if (stableJson(actualComponents) !== stableJson(expectedComponents)) {
    hardFailures.push('design-doc-component-token-map-mismatch')
  }

  const summary = extension?.componentSummary
  if (isObject(summary) && usesBoundedComponentProjection(extension, summary)) {
    if (summary.actionablePatterns !== specs.length) hardFailures.push('component-actionable-spec-count-mismatch')
    if (summary.renderedP1Patterns !== selectedP1Recipes.length) {
      hardFailures.push('component-rendered-profile-count-mismatch')
    }
    if (summary.omittedP1Patterns !== Math.max(0, specs.length - selectedP1Recipes.length)) {
      hardFailures.push('component-omitted-p1-count-mismatch')
    }
    if (summary.yamlComponentContracts !== Object.keys(expectedComponents).length) {
      hardFailures.push('component-yaml-contract-count-mismatch')
    }
  }

  const details = Array.isArray(summary?.details) ? summary.details : []
  if (details.length === 0) return
  const detailsByName = new Map(details.map((detail) => [detail?.name, detail]))
  for (const duplicate of duplicateValues(details.map((detail) => detail?.name))) {
    hardFailures.push(`duplicate-component-summary-detail:${String(duplicate)}`)
  }
  for (const spec of specs) {
    const name = componentSpecName(spec)
    const detail = detailsByName.get(name)
    if (!detail) {
      hardFailures.push(`missing-component-summary-detail:${name}`)
      continue
    }
    const expectedFields = {
      type: spec.component,
      count: spec.sourceInstances,
      identityConfidence: spec.identityConfidence,
      reuseConfidence: spec.reuseConfidence,
      reuseScope: spec.reuseScope,
      matchingStyleInstances: spec.sourceInstances,
      pageCount: spec.pageCount,
    }
    for (const [field, value] of Object.entries(expectedFields)) {
      if (detail[field] !== value) hardFailures.push(`component-summary-detail-mismatch:${name}:${field}`)
    }
  }
  const expectedNames = new Set(specs.map(componentSpecName))
  for (const detail of details) {
    if (!expectedNames.has(detail?.name))
      hardFailures.push(`unexpected-component-summary-detail:${String(detail?.name)}`)
  }
}

function validateProfileComponentAgreement(profile, componentSpecs, evidence, designSource, hardFailures) {
  const recipes = profile?.transferGrammar?.componentRecipes
  if (!Array.isArray(recipes)) {
    hardFailures.push('missing-profile-component-recipes')
    return
  }
  const p1Recipes = recipes.filter((recipe) => recipe?.priority === 'P1')
  const specs = Array.isArray(componentSpecs?.components) ? componentSpecs.components : []
  const patterns = buildAuditCanonicalComponentPatterns(evidence)
  const freeformPatterns = buildAuditFreeformComponentSummaries(evidence)
  const designExtension = extensionFor(frontMatter(designSource).value)
  const componentSummary = designExtension?.componentSummary
  const boundedComponentProjection = usesBoundedComponentProjection(designExtension, componentSummary)
  const patternsByKey = new Map()
  for (const pattern of patterns) {
    const key = componentRecipeKey({ component: pattern.type, variant: pattern.canonicalVariant })
    const group = patternsByKey.get(key) || []
    group.push(pattern)
    patternsByKey.set(key, group)
  }
  const recipesByKey = new Map()
  for (const recipe of recipes) {
    const key = componentRecipeKey(recipe)
    const group = recipesByKey.get(key) || []
    group.push(recipe)
    recipesByKey.set(key, group)
  }
  const specsByKey = new Map()
  for (const spec of specs) {
    const key = componentRecipeKey(spec)
    const group = specsByKey.get(key) || []
    group.push(spec)
    specsByKey.set(key, group)
  }
  for (const [key, group] of recipesByKey) {
    if (group.length > 1) hardFailures.push(`duplicate-profile-component-recipe:${key}`)
  }
  for (const [key, group] of patternsByKey) {
    if (group.length > 1) hardFailures.push(`duplicate-audit-canonical-component-pattern:${key}`)
    if ((recipesByKey.get(key) || []).length !== 1) {
      hardFailures.push(`canonical-component-profile-count:${key}:${(recipesByKey.get(key) || []).length}`)
    }
  }
  for (const [key, group] of recipesByKey) {
    if ((patternsByKey.get(key) || []).length !== 1) {
      hardFailures.push(`profile-canonical-component-count:${key}:${(patternsByKey.get(key) || []).length}`)
    }
  }
  for (const [key, group] of specsByKey) {
    if (group.length > 1) hardFailures.push(`duplicate-component-spec:${key}`)
  }
  for (const pattern of patterns) {
    const key = componentRecipeKey({ component: pattern.type, variant: pattern.canonicalVariant })
    const expected = pattern.actionable ? 1 : 0
    const actual = (specsByKey.get(key) || []).length
    if (actual !== expected) hardFailures.push(`canonical-component-spec-count:${key}:${actual}:${expected}`)
  }
  for (const [key, group] of specsByKey) {
    if ((patternsByKey.get(key) || []).length !== 1) {
      hardFailures.push(`component-spec-canonical-pattern-count:${key}:${(patternsByKey.get(key) || []).length}`)
    }
  }
  const p1ByKey = new Map()
  for (const recipe of p1Recipes) {
    const key = componentRecipeKey(recipe)
    const group = p1ByKey.get(key) || []
    group.push(recipe)
    p1ByKey.set(key, group)
  }
  for (const [key, group] of specsByKey) {
    if ((p1ByKey.get(key) || []).length !== 1) {
      hardFailures.push(`component-spec-profile-p1-count:${key}:${(p1ByKey.get(key) || []).length}`)
    }
  }
  const componentById = new Map(
    (Array.isArray(evidence?.components) ? evidence.components : []).map((item) => [item.id, item]),
  )
  const pageById = new Map((Array.isArray(evidence?.pages) ? evidence.pages : []).map((page) => [page.id, page]))
  for (const recipe of recipes) {
    const key = componentRecipeKey(recipe)
    const patternMatches = patternsByKey.get(key) || []
    if (patternMatches.length !== 1) continue
    const pattern = patternMatches[0]
    if (recipe?.priority !== pattern.expectedPriority) {
      hardFailures.push(
        `profile-component-priority-mismatch:${key}:${String(recipe?.priority)}:${pattern.expectedPriority}`,
      )
    }
    const expectedMetrics = {
      sourceInstances: pattern.sourceInstances,
      matchingStyleInstances: pattern.matchingStyleInstances,
      pageCount: pattern.pageCount,
      identityConfidence: pattern.identityConfidence,
      reuseConfidence: pattern.reuseConfidence,
      reuseScope: pattern.reuseScope,
    }
    for (const [field, expected] of Object.entries(expectedMetrics)) {
      if (recipe?.[field] !== expected) {
        hardFailures.push(`profile-component-catalog-metric-mismatch:${key}:${field}`)
      }
    }
    const expectedStyles = normalizedEvidenceComponentStyles(pattern.styles)
    if (stableJson(normalizedRecipeStyles(recipe?.observedStyles)) !== stableJson(expectedStyles)) {
      hardFailures.push(`profile-component-catalog-styles-mismatch:${key}`)
    }
    const expectedTokenRefs = pattern.sharedTokenRefs.slice(0, 10)
    if (stableJson(recipe?.observed?.tokenRefs || []) !== stableJson(expectedTokenRefs)) {
      hardFailures.push(`profile-component-catalog-token-refs-mismatch:${key}`)
    }
    const expectedEvidence = routeBalancedComponentEvidenceIds(
      pattern.components.map((component) => component.id),
      componentById,
      pageById,
    ).slice(0, COMPONENT_EVIDENCE_SAMPLE_LIMIT)
    const recipeEvidence = (Array.isArray(recipe?.observed?.evidence) ? recipe.observed.evidence : []).map(
      (item) => item?.evidenceId,
    )
    if (recipeEvidence.some((id) => typeof id !== 'string' || !id)) {
      hardFailures.push(`invalid-component-evidence-sample-ref:${key}:profile`)
    }
    for (const duplicate of duplicateValues(recipeEvidence.filter((id) => typeof id === 'string'))) {
      hardFailures.push(`duplicate-component-evidence-sample-ref:${key}:profile:${duplicate}`)
    }
    if (recipeEvidence.length !== expectedEvidence.length) {
      hardFailures.push(
        `component-evidence-sample-length-mismatch:${key}:${recipeEvidence.length}:${expectedEvidence.length}`,
      )
    }
    const expectedEvidenceSet = new Set(expectedEvidence)
    for (const id of recipeEvidence) {
      if (!expectedEvidenceSet.has(id)) {
        hardFailures.push(`noncanonical-component-evidence-sample-ref:${key}:${String(id)}`)
      }
    }
    if (
      recipeEvidence.length === expectedEvidence.length &&
      recipeEvidence.every((id) => expectedEvidenceSet.has(id)) &&
      stableJson(recipeEvidence) !== stableJson(expectedEvidence)
    ) {
      hardFailures.push(`component-evidence-sample-order-mismatch:${key}`)
    }
    if (stableJson(recipeEvidence) !== stableJson(expectedEvidence)) {
      hardFailures.push(`component-evidence-sample-catalog-mismatch:${key}`)
    }
    const sampledRoutes = new Set(
      recipeEvidence.flatMap((id) => {
        const component = componentById.get(id)
        const page = component ? pageById.get(component.pageId) : undefined
        return page ? [evidencePageRouteIdentity(page)] : []
      }),
    )
    if (sampledRoutes.size !== Math.min(pattern.pageCount, expectedEvidence.length)) {
      hardFailures.push(`component-evidence-sample-page-coverage-mismatch:${key}`)
    }
    const expectedAssertions = expectedEvidence.flatMap((evidenceId) => [
      {
        kind: 'component',
        target: pattern.type,
        predicate: 'present',
        scope: 'instance',
        evidenceIds: [evidenceId],
      },
      {
        kind: 'component',
        target: pattern.type,
        predicate: 'variant',
        scope: 'instance',
        evidenceIds: [evidenceId],
        value: pattern.canonicalVariant,
      },
    ])
    if (stableJson(recipe?.observed?.assertions || []) !== stableJson(expectedAssertions)) {
      hardFailures.push(`profile-component-catalog-assertions-mismatch:${key}`)
    }
    if (boundedComponentProjection) {
      const language = profile?.language === 'zh-CN' ? 'zh-CN' : 'en'
      const expectedUseWhen = auditExpectedRecipeUseWhen(pattern)
      if (recipe?.useWhen !== expectedUseWhen) {
        hardFailures.push(`profile-component-use-when-mismatch:${key}:${String(recipe?.useWhen)}:${expectedUseWhen}`)
      }
      const exactStyles = Object.fromEntries(
        Object.entries(auditPortableComponentStyles(pattern.styles)).sort(([first], [second]) =>
          first.localeCompare(second),
        ),
      )
      if (stableJson(recipe?.observedStyles || {}) !== stableJson(exactStyles)) {
        hardFailures.push(`profile-component-exact-styles-mismatch:${key}`)
      }
      const expectedObserved = auditExpectedObservedClaim(pattern, expectedEvidence, language)
      if (stableJson(recipe?.observed) !== stableJson(expectedObserved)) {
        hardFailures.push(`profile-component-observed-claim-mismatch:${key}`)
      }
      const expectedStates = auditExpectedInteractionClaimRecords(pattern, evidence, language).map(
        (record) => record.claim,
      )
      if (stableJson(recipe?.states || []) !== stableJson(expectedStates)) {
        hardFailures.push(`profile-component-states-mismatch:${key}`)
      }
      if (stableJson(recipe?.responsive || []) !== stableJson([])) {
        hardFailures.push(`profile-component-responsive-mismatch:${key}`)
      }
      const expectedRestrictions = auditExpectedRecipeRestrictions(pattern)
      if (stableJson(recipe?.restrictions || []) !== stableJson(expectedRestrictions)) {
        hardFailures.push(`profile-component-restrictions-mismatch:${key}`)
      }
      const expectedConfidence = auditExpectedRecipeConfidence(pattern)
      if (recipe?.confidence !== expectedConfidence) {
        hardFailures.push(`profile-component-confidence-mismatch:${key}`)
      }
    }

    if (recipe?.priority !== 'P1') continue
    const matches = specsByKey.get(key) || []
    if (matches.length !== 1) {
      hardFailures.push(`profile-p1-component-spec-count:${key}:${matches.length}`)
      continue
    }
    const spec = matches[0]
    for (const [recipeField, specField] of [
      ['sourceInstances', 'sourceInstances'],
      ['matchingStyleInstances', 'sourceInstances'],
      ['pageCount', 'pageCount'],
      ['identityConfidence', 'identityConfidence'],
      ['reuseConfidence', 'reuseConfidence'],
      ['reuseScope', 'reuseScope'],
    ]) {
      if (recipe?.[recipeField] !== spec?.[specField]) {
        hardFailures.push(`profile-component-metric-mismatch:${key}:${recipeField}`)
      }
    }
    const specEvidence = Array.isArray(spec?.evidenceRefs) ? [...spec.evidenceRefs] : []
    if (stableJson(recipeEvidence) !== stableJson(specEvidence)) {
      hardFailures.push(`profile-component-evidence-refs-mismatch:${key}`)
    }
    if (specEvidence.some((id) => typeof id !== 'string' || !id)) {
      hardFailures.push(`invalid-component-evidence-sample-ref:${key}:spec`)
    }
    for (const duplicate of duplicateValues(specEvidence.filter((id) => typeof id === 'string'))) {
      hardFailures.push(`duplicate-component-evidence-sample-ref:${key}:spec:${duplicate}`)
    }
    if (stableJson(specEvidence) !== stableJson(expectedEvidence)) {
      hardFailures.push(`component-spec-evidence-sample-catalog-mismatch:${key}`)
    }
    if (stableJson(spec?.tokenRefs || []) !== stableJson(expectedTokenRefs)) {
      hardFailures.push(`component-spec-catalog-token-refs-mismatch:${key}`)
    }
    if (stableJson(normalizedSpecStyles(spec?.styles)) !== stableJson(expectedStyles)) {
      hardFailures.push(`component-spec-catalog-styles-mismatch:${key}`)
    }
    const expectedStateRefs = [...new Set(pattern.components.flatMap((component) => component.stateRefs || []))].sort()
    if (stableJson(spec?.stateRefs || []) !== stableJson(expectedStateRefs)) {
      hardFailures.push(`component-spec-catalog-state-refs-mismatch:${key}`)
    }
    const expectedRole = auditConsensusComponentRole(pattern.components)
    if (spec?.role !== expectedRole) {
      hardFailures.push(`component-spec-catalog-role-mismatch:${key}`)
    }
    for (const [field, values] of [
      ['semanticIdentity', pattern.semanticIdentities],
      ['visualTreatment', pattern.visualTreatments],
      ['usageContext', pattern.usageContexts],
    ]) {
      const expected = Array.isArray(values) && values.length === 1 ? values[0] : undefined
      if (spec?.[field] !== expected) hardFailures.push(`component-spec-catalog-${field}-mismatch:${key}`)
    }
    for (const [field, expected] of Object.entries({
      sourceInstances: pattern.sourceInstances,
      pageCount: pattern.pageCount,
      identityConfidence: pattern.identityConfidence,
      reuseConfidence: pattern.reuseConfidence,
      reuseScope: pattern.reuseScope,
    })) {
      if (spec?.[field] !== expected) hardFailures.push(`component-spec-catalog-metric-mismatch:${key}:${field}`)
    }
  }

  const reusablePatternCount =
    patterns.filter((pattern) => pattern.reusable).length +
    freeformPatterns.filter((pattern) => pattern.reusable).length
  const actionablePatterns = patterns.filter((pattern) => pattern.actionable)
  const renderedActionablePatterns = selectComponentDetails(
    actionablePatterns.map((pattern) => ({
      component: pattern.type,
      variant: pattern.canonicalVariant,
      sourceInstances: pattern.sourceInstances,
      pageCount: pattern.pageCount,
      reuseConfidence: pattern.reuseConfidence,
      reuseScope: pattern.reuseScope,
    })),
  ).length
  const expectedSummary = {
    patterns: patterns.length + freeformPatterns.length,
    instances:
      patterns.reduce((total, pattern) => total + pattern.sourceInstances, 0) +
      freeformPatterns.reduce((total, pattern) => total + pattern.sourceInstances, 0),
    reusablePatterns: reusablePatternCount,
    actionablePatterns: actionablePatterns.length,
    renderedP1Patterns: renderedActionablePatterns,
    omittedP1Patterns: Math.max(0, actionablePatterns.length - renderedActionablePatterns),
    yamlComponentContracts: Object.keys(frontMatter(designSource).value?.components || {}).length,
    omittedLocalPatterns: patterns.length + freeformPatterns.length - reusablePatternCount,
    omittedReusablePatterns: Math.max(0, reusablePatternCount - actionablePatterns.length),
  }
  if (expectedSummary.patterns > 0 && !isObject(componentSummary)) {
    hardFailures.push('missing-component-summary')
  } else if (expectedSummary.patterns === 0 && isObject(componentSummary)) {
    hardFailures.push('unexpected-component-summary')
  } else if (isObject(componentSummary)) {
    const boundedSummary = boundedComponentProjection
    const fields = boundedSummary
      ? Object.keys(expectedSummary)
      : ['patterns', 'instances', 'reusablePatterns', 'omittedLocalPatterns']
    for (const field of fields) {
      if (componentSummary[field] !== expectedSummary[field]) {
        hardFailures.push(`component-summary-catalog-mismatch:${field}`)
      }
    }
  }

  const selectedP1 = selectComponentDetails(p1Recipes)
  const selectedP1Patterns = selectComponentDetails(
    patterns
      .filter((pattern) => pattern.actionable)
      .map((pattern) => ({ ...pattern, component: pattern.type, variant: pattern.canonicalVariant })),
  )
  const selectedP1PatternNames = new Set(selectedP1Patterns.map((pattern) => pattern.name))
  for (const name of renderedComponentContrastNames(designSource)) {
    if (!selectedP1PatternNames.has(name)) hardFailures.push(`contrast-note-outside-selected-p1:${name}`)
  }
  const componentSection = (markdownSections(designSource).get('Components') || []).join('\n')
  const language = profile?.language === 'zh-CN' ? 'zh-CN' : 'en'
  const renderedRecipes = renderedRecipeRecords(componentSection)
  if (renderedRecipes.length !== selectedP1.length) hardFailures.push('design-doc-rendered-p1-count-mismatch')
  if (isObject(componentSummary) && boundedComponentProjection) {
    const expectedRecipes = selectedP1Patterns.map((pattern) => ({
      heading: expectedRecipeHeading(
        {
          component: pattern.type,
          variant: pattern.canonicalVariant,
          useWhen: auditExpectedRecipeUseWhen(pattern),
        },
        language,
      ),
      metric: expectedRecipeMetric(
        {
          sourceInstances: pattern.sourceInstances,
          matchingStyleInstances: pattern.matchingStyleInstances,
          pageCount: pattern.pageCount,
          identityConfidence: pattern.identityConfidence,
          reuseConfidence: pattern.reuseConfidence,
          reuseScope: pattern.reuseScope,
        },
        language,
      ),
      block: expectedRecipeBlock(pattern, evidence, language),
      key: componentRecipeKey({ component: pattern.type, variant: pattern.canonicalVariant }),
    }))
    const expectedRecipeHeadings = new Set(expectedRecipes.map((recipe) => recipe.heading))
    const globalRecipeProjections = renderedComponentRecipeProjections(designSource, expectedRecipeHeadings, language)
    if (globalRecipeProjections.some((recipe) => recipe.ownerSection !== 'Components')) {
      hardFailures.push('design-doc-rendered-p1-outside-components')
    }
    if (globalRecipeProjections.length !== expectedRecipes.length) {
      hardFailures.push('design-doc-rendered-p1-global-count-mismatch')
    }
    if (
      stableJson(globalRecipeProjections.map((recipe) => recipe.block)) !==
      stableJson(expectedRecipes.map((recipe) => recipe.block))
    ) {
      hardFailures.push('design-doc-rendered-p1-global-block-mismatch')
    }
    if (
      stableJson(renderedRecipes.map((recipe) => recipe.heading)) !==
      stableJson(expectedRecipes.map((recipe) => recipe.heading))
    ) {
      hardFailures.push('design-doc-rendered-p1-identity-mismatch')
    }
    if (
      stableJson(renderedRecipes.map((recipe) => recipe.metric)) !==
      stableJson(expectedRecipes.map((recipe) => recipe.metric))
    ) {
      hardFailures.push('design-doc-rendered-p1-metric-mismatch')
    }
    for (const [index, expected] of expectedRecipes.entries()) {
      if (stableJson(renderedRecipes[index]?.block) !== stableJson(expected.block)) {
        hardFailures.push(`design-doc-rendered-p1-block-mismatch:${expected.key}`)
      }
    }
    if (renderedRecipes.length > expectedRecipes.length) {
      hardFailures.push('design-doc-rendered-p1-extra-block')
    }
    const allP1ByHeading = new Map(p1Recipes.map((recipe) => [expectedRecipeHeading(recipe, language), recipe]))
    const renderedTypeCounts = new Map()
    for (const rendered of renderedRecipes) {
      const recipe = allP1ByHeading.get(rendered.heading)
      if (!recipe) continue
      const component = String(recipe.component)
      renderedTypeCounts.set(component, (renderedTypeCounts.get(component) || 0) + 1)
    }
    for (const [component, count] of renderedTypeCounts) {
      if (count > COMPONENT_DETAIL_LIMIT_PER_TYPE) {
        hardFailures.push(`design-doc-rendered-p1-type-budget-exceeded:${component}:${count}`)
      }
    }
  }
  if (p1Recipes.length > selectedP1.length && !componentSection.includes('component-specs.json')) {
    hardFailures.push('missing-design-doc-omitted-p1-summary')
  }
  const p2Recipes = recipes.filter((recipe) => recipe?.priority === 'P2')
  const localBlock = /#### (?:Local or specialized component patterns|局部或专用组件模式)([\s\S]*?)(?=\n### |$)/.exec(
    designSource,
  )?.[1]
  if (p2Recipes.length > 0 && (!localBlock || /(?:None recorded\.|^- 无。$)/m.test(localBlock))) {
    hardFailures.push('missing-design-doc-p2-summary')
  }
  if (localBlock) {
    const reportedP2 = localBlock.split(/\r?\n/).filter((line) => /^- \*\*/.test(line))
    const expectedP2 = expectedP2SummaryLines(p2Recipes, language)
    if (stableJson(reportedP2) !== stableJson(expectedP2)) {
      hardFailures.push('design-doc-p2-summary-mismatch')
    }
  }
}

/** Audits the complete CLI artifact bundle instead of trusting DESIGN.md's self-reported summary. */
export async function auditArtifactBundle(directory) {
  const resolved = path.resolve(directory)
  const hardFailures = []
  const bundleLimitations = []
  const sources = Object.fromEntries(
    await Promise.all(
      REQUIRED_BUNDLE_FILES.map(async (filename) => [filename, await readBundleFile(resolved, filename, hardFailures)]),
    ),
  )
  const documentReport = sources['DESIGN.md']
    ? auditDesignDoc(sources['DESIGN.md'], path.join(resolved, 'DESIGN.md'))
    : {
        file: path.join(resolved, 'DESIGN.md'),
        classification: 'analyzer-failure',
        hardFailures: [],
        limitations: [],
        warnings: [],
        manualReview: [],
        metrics: {},
      }
  const bundleWarnings = [...documentReport.warnings]
  hardFailures.push(...documentReport.hardFailures)
  bundleLimitations.push(...documentReport.limitations)

  const evidence = parseJsonArtifact(sources['design-evidence.json'], 'design-evidence.json', hardFailures)
  const dtcg = parseJsonArtifact(sources['design-tokens.json'], 'design-tokens.json', hardFailures)
  const profile = parseJsonArtifact(sources['design-profile.json'], 'design-profile.json', hardFailures)
  const componentSpecs = parseJsonArtifact(sources['component-specs.json'], 'component-specs.json', hardFailures)
  const visualQa = parseJsonArtifact(sources['visual-qa.json'], 'visual-qa.json', hardFailures)
  const parsedFrontMatter = sources['DESIGN.md'] ? frontMatter(sources['DESIGN.md']) : { value: null }
  const extension = extensionFor(parsedFrontMatter.value)

  if (evidence?.semanticOwnerVersion !== undefined) {
    if (evidence.semanticOwnerVersion !== '1') {
      hardFailures.push('unsupported-semantic-owner-version')
    } else {
      const surfaceRoles = {
        background: 'page-canvas',
        surface: 'content-surface',
        secondary: 'content-surface',
      }
      for (const [tokenRole, ownerRole] of Object.entries(surfaceRoles)) {
        if (!evidence.tokens?.colors?.[tokenRole]) continue
        const tokenEvidence = evidence.tokens?.evidence?.[`colors.${tokenRole}`]
        const owners = tokenEvidence?.semanticOwnerRefs
        if (
          !Array.isArray(owners) ||
          owners.length === 0 ||
          owners.some(
            (owner) =>
              owner?.domain !== 'foundation' ||
              owner?.role !== ownerRole ||
              typeof owner?.page !== 'string' ||
              typeof owner?.routeId !== 'string' ||
              typeof owner?.viewport !== 'string' ||
              typeof owner?.ownerId !== 'string',
          )
        ) {
          hardFailures.push(`semantic-surface-owner-envelope-invalid:${tokenRole}`)
        }
      }
      for (const component of Array.isArray(evidence.components) ? evidence.components : []) {
        if (
          typeof component?.semanticIdentity !== 'string' ||
          typeof component?.visualTreatment !== 'string' ||
          typeof component?.usageContext !== 'string' ||
          typeof component?.visualOwnerKey !== 'string' ||
          !component.visualOwnerKey ||
          typeof component?.semanticSourceKey !== 'string' ||
          !component.semanticSourceKey
        ) {
          hardFailures.push(`semantic-component-owner-envelope-invalid:${component?.id || 'unknown'}`)
        }
      }
    }
  }

  const tokens = evidence?.tokens
  const catalog = tokenCatalog(tokens)
  const registry = evidenceRegistry(evidence, hardFailures)
  const evidenceIds = new Set(registry.all.keys())
  const evidenceRouteIds = new Set(
    (Array.isArray(evidence?.pages) ? evidence.pages : [])
      .map((page) => page?.routeId)
      .filter((routeId) => typeof routeId === 'string' && routeId),
  )
  const canonicalTokenEvidenceCaptures = canonicalTokenEvidenceCaptureByRoute(evidence)
  const canonicalDarkTokenEvidenceCaptures = canonicalDarkTokenEvidenceCaptureByRoute(evidence)
  const availableTokenEvidenceCaptureCount = Array.isArray(evidence?.pages) ? evidence.pages.length : 0
  const availableDarkTokenEvidenceCaptureCount = canonicalDarkTokenEvidenceCaptures.size
  const canonicalCandidates = tokens?.candidates?.values || []
  const darkImplementationTokens = designTokensFromDtcgRoot(dtcgDarkRoot(dtcg))
  let screenshotMetrics = { expected: 0, valid: 0, status: 'partial', issueCount: 0, listedImages: 0 }

  if (!isObject(evidence) || !isObject(tokens)) {
    hardFailures.push('missing-evidence-token-catalog')
  } else {
    if (evidence.schemaVersion !== '1') hardFailures.push('unsupported-design-evidence-schema')
    for (const [index, page] of (Array.isArray(evidence.pages) ? evidence.pages : []).entries()) {
      if (typeof page?.routeId !== 'string' || !page.routeId.trim()) {
        hardFailures.push(`missing-or-invalid-evidence-page-route-id:${index}`)
      }
    }
    validateComponentStyleOwnership(evidence, hardFailures)
    validateLayoutTextStyleOwnership(evidence, hardFailures)
    for (const [ownerKind, owners] of [
      ['section', evidence.sections],
      ['component', evidence.components],
      ['layout', evidence.layoutNodes],
    ]) {
      for (const owner of Array.isArray(owners) ? owners : []) {
        for (const ref of Array.isArray(owner.tokenRefs) ? owner.tokenRefs : []) {
          if (!catalog.has(ref)) hardFailures.push(`unresolved-token-ref:evidence.${ownerKind}.${owner.id}:${ref}`)
          if (ownerKind !== 'component' || !ref.startsWith('color.') || !catalog.has(ref)) continue
          const tokenValue = catalog.get(ref)
          const compatibleStyle = Object.entries(isObject(owner.styles) ? owner.styles : {}).some(
            ([property, value]) =>
              typeof value === 'string' &&
              auditColorTokenRoleCompatible(property, ref) &&
              auditColorsEqual(value, tokenValue),
          )
          if (!compatibleStyle) {
            hardFailures.push(`semantic-token-ref-mismatch:evidence.${ownerKind}.${owner.id}:${ref}`)
          }
        }
      }
    }

    const requiredEvidence = tokenEvidencePaths(tokens)
    const actualEvidence = isObject(tokens.evidence) ? tokens.evidence : {}
    for (const [evidencePath, value] of requiredEvidence) {
      const item = actualEvidence[evidencePath]
      if (!isObject(item)) {
        hardFailures.push(`missing-portable-token-evidence:${evidencePath}`)
        continue
      }
      for (const field of [
        'observationCount',
        'ownerCount',
        'semanticAgreement',
        'pageCount',
        'captureCount',
        'eligiblePageCount',
        'pageSupportRatio',
      ]) {
        if (!finite(item[field])) hardFailures.push(`non-finite-portable-token-evidence:${evidencePath}.${field}`)
      }
      for (const field of ['observationCount', 'ownerCount', 'pageCount', 'captureCount', 'eligiblePageCount']) {
        if (finite(item[field]) && !Number.isInteger(item[field])) {
          hardFailures.push(`non-integer-portable-token-evidence:${evidencePath}.${field}`)
        }
      }
      for (const field of ['foundationOwnerCount', 'minimumPageFoundationOwnerCount']) {
        if (item[field] !== undefined && (!Number.isInteger(item[field]) || item[field] < 0)) {
          hardFailures.push(`non-integer-portable-token-evidence:${evidencePath}.${field}`)
        }
      }
      for (const [group, counts] of [
        ['sourceCounts', item.sourceCounts],
        ['roleCounts', item.roleCounts],
      ]) {
        for (const [name, count] of Object.entries(isObject(counts) ? counts : {})) {
          if (!Number.isInteger(count) || count < 0) {
            hardFailures.push(`non-integer-portable-token-evidence:${evidencePath}.${group}.${name}`)
          }
        }
      }
      if (finite(item.semanticAgreement) && (item.semanticAgreement < 0 || item.semanticAgreement > 1)) {
        hardFailures.push(`portable-token-semantic-agreement-out-of-range:${evidencePath}`)
      }
      if (finite(item.pageSupportRatio) && (item.pageSupportRatio < 0 || item.pageSupportRatio > 1)) {
        hardFailures.push(`portable-token-page-support-out-of-range:${evidencePath}`)
      }
      if (
        item.ownerCount <= 0 ||
        item.observationCount <= 0 ||
        item.pageCount <= 0 ||
        item.captureCount < item.pageCount ||
        item.captureCount > availableTokenEvidenceCaptureCount ||
        item.eligiblePageCount < item.pageCount ||
        item.eligiblePageCount !== canonicalTokenEvidenceCaptures.size ||
        Math.abs(item.pageSupportRatio - item.pageCount / item.eligiblePageCount) > 0.001
      ) {
        hardFailures.push(`invalid-portable-token-evidence-envelope:${evidencePath}`)
      }
      if (String(item.value) !== value) hardFailures.push(`portable-token-evidence-value-mismatch:${evidencePath}`)
      const sources = Array.isArray(item.sources) ? item.sources : []
      const requiresRenderedTextOwners =
        evidencePath.startsWith('typography.') ||
        ['colors.foreground', 'colors.muted-foreground'].includes(evidencePath)
      if (requiresRenderedTextOwners) {
        validateRenderedTextPromotionEvidence(evidencePath, value, item, hardFailures, canonicalTokenEvidenceCaptures)
      }
      if ((item.semanticConfidence || item.confidence) === 'low' || item.reuseScope !== 'foundation') {
        hardFailures.push(`non-portable-token-in-catalog:${evidencePath}`)
      }
      if (isObject(item.pairedSurface) && !['colors.foreground', 'colors.muted-foreground'].includes(evidencePath)) {
        hardFailures.push(`unexpected-paired-surface-evidence:${evidencePath}`)
      }
      if (!meetsPortableFoundationCoverage(evidencePath, item)) {
        hardFailures.push(`insufficient-portable-token-foundation-coverage:${evidencePath}`)
      }
      validatePortableGeometryEvidence(evidencePath, value, item, hardFailures)
      hardFailures.push(
        ...pageRefFailures(
          item,
          `evidence.tokens.evidence.${evidencePath}.pageRefs`,
          evidenceRouteIds,
          canonicalTokenEvidenceCaptures,
        ),
      )
    }
    for (const evidencePath of Object.keys(actualEvidence)) {
      if (!requiredEvidence.has(evidencePath)) hardFailures.push(`stale-portable-token-evidence:${evidencePath}`)
    }
    const fontStacks = (tokens.typography?.fontStacks || []).map(normalizedFontStack).filter(Boolean)
    const fontFamilies = (tokens.typography?.fontFamilies || []).map(normalizedPrimaryFontFamily).filter(Boolean)
    for (const duplicate of duplicateValues(fontStacks)) {
      hardFailures.push(`duplicate-semantic-font-stack:${duplicate}`)
    }
    for (const duplicate of duplicateValues(fontFamilies)) {
      hardFailures.push(`duplicate-semantic-font-family:${duplicate}`)
    }
    hardFailures.push(
      ...candidateFailures(
        canonicalCandidates,
        'evidence.tokens.candidates.values',
        evidenceRouteIds,
        canonicalTokenEvidenceCaptures,
        bundleWarnings,
      ),
    )
    validateFoundationForeground(tokens, hardFailures)
    validateFoundationBorderRoles(tokens, hardFailures)
    const canonicalCandidateIds = new Set(
      (Array.isArray(canonicalCandidates) ? canonicalCandidates : [])
        .map((candidate) => candidate?.id)
        .filter((id) => typeof id === 'string'),
    )
    for (const [index, candidate] of (Array.isArray(tokens.candidates?.colors)
      ? tokens.candidates.colors
      : []
    ).entries()) {
      if (typeof candidate?.id !== 'string' || !canonicalCandidateIds.has(candidate.id)) {
        hardFailures.push(`legacy-color-candidate-missing-canonical-entry:${index}`)
      }
    }
    validateEvidenceRelations(evidence, registry, hardFailures)
    validateEvidenceReferences(evidence, evidenceIds, 'evidence', hardFailures)
    screenshotMetrics = await validateScreenshotAssets(evidence, resolved, hardFailures, bundleLimitations)
  }

  if (isObject(dtcg)) {
    if (typeof dtcg.$schema !== 'string' || !dtcg.$schema.includes('design-tokens')) {
      hardFailures.push('missing-dtcg-schema')
    }
    const dtcgCatalog = dtcgTokenCatalog(dtcg)
    validateTypographyFeatureTags(extension, dtcg, hardFailures)
    validateDtcgKeys(dtcg, tokens, hardFailures, true)
    for (const [ref, value] of catalog) {
      if (!dtcgCatalog.has(ref)) hardFailures.push(`missing-dtcg-token:${ref}`)
      else if (dtcgCatalog.get(ref) !== value) hardFailures.push(`dtcg-token-value-mismatch:${ref}`)
    }
    for (const ref of dtcgCatalog.keys()) {
      if (!catalog.has(ref)) hardFailures.push(`unexpected-dtcg-token:${ref}`)
    }

    const dtcgCandidates = dtcg.$extensions?.['com.imprint.candidates']?.values || []
    hardFailures.push(
      ...candidateFailures(
        dtcgCandidates,
        'dtcg.candidates.values',
        evidenceRouteIds,
        canonicalTokenEvidenceCaptures,
        bundleWarnings,
      ),
    )
    if (stableJson(canonicalCandidates) !== stableJson(dtcgCandidates)) {
      hardFailures.push('candidate-catalog-mismatch:evidence-vs-dtcg')
    }

    const dtcgEvidence = dtcg.$extensions?.['com.imprint.tokenEvidence']
    if (JSON.stringify(dtcgEvidence || {}) !== JSON.stringify(tokens?.evidence || {})) {
      hardFailures.push('token-evidence-mismatch:evidence-vs-dtcg')
    }
    const declaredDarkOverrides = dtcg.$extensions?.['com.imprint.darkMode']?.overrides
    if (declaredDarkOverrides !== undefined && !isObject(declaredDarkOverrides)) {
      hardFailures.push('invalid-dark-override-map')
    }
    const rawDarkEvidence = dtcg.dark?.$extensions?.['com.imprint.tokenEvidence']
    const darkEvidence = isObject(rawDarkEvidence) ? rawDarkEvidence : {}
    const darkCatalog = dtcgTokenCatalog(dtcgDarkRoot(dtcg))
    if (isObject(dtcg.dark)) {
      if (!isObject(rawDarkEvidence)) hardFailures.push('invalid-dark-token-evidence-catalog')
      validateDtcgKeys(dtcg.dark, darkImplementationTokens, hardFailures)
      for (const ref of catalog.keys()) {
        if (!darkCatalog.has(ref)) hardFailures.push(`missing-dark-base-token:${ref}`)
      }
    }
    for (const ref of darkCatalog.keys()) {
      if (!catalog.has(ref)) hardFailures.push(`dark-token-outside-base-catalog:${ref}`)
    }
    const expectedDarkOverrides = Object.fromEntries(
      [...darkCatalog].filter(([ref, value]) => catalog.has(ref) && catalog.get(ref) !== value),
    )
    const darkOverrides = isObject(declaredDarkOverrides) ? declaredDarkOverrides : {}
    if (stableJson(darkOverrides) !== stableJson(expectedDarkOverrides)) {
      hardFailures.push('dark-override-catalog-mismatch')
    }
    const changedDarkEvidencePaths = new Set(
      Object.keys(expectedDarkOverrides)
        .map(evidencePathForPublicRef)
        .filter((evidencePath) => typeof evidencePath === 'string'),
    )
    const darkEvidencePaths = tokenEvidencePaths(darkImplementationTokens)
    for (const [evidencePath, item] of Object.entries(darkEvidence)) {
      if (!darkEvidencePaths.has(evidencePath)) {
        hardFailures.push(`stale-dark-token-evidence:${evidencePath}`)
        continue
      }
      validateDarkTokenEvidenceEntry(
        evidencePath,
        darkEvidencePaths.get(evidencePath),
        item,
        hardFailures,
        evidenceRouteIds,
        canonicalDarkTokenEvidenceCaptures,
        availableDarkTokenEvidenceCaptureCount,
        changedDarkEvidencePaths.has(evidencePath),
      )
    }
    for (const [ref, value] of Object.entries(expectedDarkOverrides)) {
      if (!catalog.has(ref)) hardFailures.push(`unresolved-dark-override-ref:${ref}`)
      if (typeof value !== 'string' || !value.trim()) hardFailures.push(`invalid-dark-override-value:${ref}`)
      if (darkCatalog.get(ref) !== value) hardFailures.push(`dark-override-value-mismatch:${ref}`)
      const evidencePath = evidencePathForPublicRef(ref)
      const item = evidencePath ? darkEvidence[evidencePath] : null
      if (!isObject(item) || !evidencePath) {
        hardFailures.push(`ungrounded-dark-override:${ref}`)
        continue
      }
      if (
        String(item.value) !== value ||
        (item.semanticConfidence || item.confidence) === 'low' ||
        item.reuseScope !== 'foundation'
      ) {
        hardFailures.push(`ungrounded-dark-override:${ref}`)
      }
    }
    const darkCandidates = dtcg.dark?.$extensions?.['com.imprint.candidates']?.values || []
    hardFailures.push(
      ...candidateFailures(
        darkCandidates,
        'dtcg.dark.candidates.values',
        evidenceRouteIds,
        canonicalDarkTokenEvidenceCaptures,
        bundleWarnings,
      ),
    )
    validateDarkFoundationForeground(tokens, darkImplementationTokens, darkEvidence, darkCandidates, hardFailures)
  }

  const rawDarkModeContract = dtcg?.$extensions?.['com.imprint.darkMode']
  const darkModeContract = isObject(rawDarkModeContract) ? rawDarkModeContract : null
  if (darkImplementationTokens) {
    const validMethod = ['media-query', 'class-toggle'].includes(darkModeContract?.method)
    const validSelector =
      darkModeContract?.method === 'class-toggle'
        ? darkModeContract.selector === '.dark' ||
          (typeof darkModeContract.selector === 'string' && /^\[data-[\w-]+="dark"\]$/.test(darkModeContract.selector))
        : darkModeContract?.selector === undefined
    if (!validMethod || !validSelector) hardFailures.push('invalid-dark-mode-contract')
  }
  validateDesignDocDarkMode(extension, tokens, darkImplementationTokens, dtcg, sources['DESIGN.md'], hardFailures)
  validateImplementationCatalog(
    sources['variables.css'],
    'variables.css',
    tokens,
    'css',
    hardFailures,
    darkImplementationTokens,
    darkModeContract,
  )
  validateImplementationCatalog(
    sources['variables.scss'],
    'variables.scss',
    tokens,
    'scss',
    hardFailures,
    darkImplementationTokens,
    darkModeContract,
  )
  validateImplementationCatalog(
    sources['theme.css'],
    'theme.css',
    tokens,
    'tailwind',
    hardFailures,
    darkImplementationTokens,
    darkModeContract,
  )

  if (isObject(profile)) {
    if (profile.schemaVersion !== '3' || profile.claimSource !== 'deterministic-catalog') {
      hardFailures.push('unsupported-design-profile-schema')
    }
    validateTokenReferences(profile, catalog, 'profile', hardFailures)
    validateEvidenceReferences(profile, evidenceIds, 'profile', hardFailures)
  }

  const components = Array.isArray(componentSpecs?.components) ? componentSpecs.components : []
  if (componentSpecs && componentSpecs.schemaVersion !== '2') hardFailures.push('unsupported-component-spec-schema')
  for (const [index, component] of components.entries()) {
    for (const field of ['sourceInstances', 'pageCount', 'identityConfidence', 'reuseConfidence']) {
      if (!finite(component?.[field])) hardFailures.push(`non-finite-component-metric:${index}.${field}`)
    }
    if (finite(component?.sourceInstances) && component.sourceInstances < 2) {
      hardFailures.push(`singleton-component-spec:${index}`)
    }
    if (finite(component?.reuseConfidence) && component.reuseConfidence < COMPONENT_REUSE_THRESHOLD) {
      hardFailures.push(`low-reuse-component-spec:${index}`)
    }
    if (['button', 'tab'].includes(component?.component) && component?.visualTreatment === 'structural') {
      hardFailures.push(`structural-control-component-spec:${index}`)
    }
    if (
      component?.visualTreatment === 'button-like' &&
      !['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].some(
        (property) => Array.isArray(component?.styles?.[property]) && component.styles[property].length > 0,
      )
    ) {
      hardFailures.push(`unlabelled-button-like-component-spec:${index}`)
    }
    if (component?.visualTreatment === 'button-like') {
      const styles = Object.fromEntries(
        Object.entries(component?.styles || {}).flatMap(([property, values]) =>
          Array.isArray(values) && values.length > 0 ? [[property, String(values[0])]] : [],
        ),
      )
      if (!auditButtonLikeBoundary(styles)) hardFailures.push(`unbounded-button-like-component-spec:${index}`)
    }
    if (sortedStrings(component?.styles?.borderRadius).some((radius) => auditContextDependentRadius(radius))) {
      hardFailures.push(`context-dependent-radius-component-spec:${index}`)
    }
  }
  validateTokenReferences(componentSpecs, catalog, 'component-specs', hardFailures)
  validateEvidenceReferences(componentSpecs, evidenceIds, 'component-specs', hardFailures)
  if (isObject(profile) && isObject(componentSpecs)) {
    validateProfileComponentAgreement(profile, componentSpecs, evidence, sources['DESIGN.md'] || '', hardFailures)
  }
  validateGuidanceScope(sources['DESIGN.md'] || '', profile, hardFailures)
  validateDesignDocOwnerCounts(sources['DESIGN.md'] || '', tokens, hardFailures)
  validateTypographyFamilyProjection(sources['DESIGN.md'] || '', tokens, evidence, profile, hardFailures)
  validateTypographyRoleOwnerCounts(sources['DESIGN.md'] || '', evidence, hardFailures)
  validateScopedStructuralFacts(sources['DESIGN.md'] || '', hardFailures)
  validateGroupedPageTopology(sources['DESIGN.md'] || '', evidence, hardFailures)
  validateGroupedResponsiveObservations(sources['DESIGN.md'] || '', evidence, profile, hardFailures)
  validateReconstructionSummaryHierarchy(sources['DESIGN.md'] || '', evidence, hardFailures)
  validateFrontMatterAgreement(parsedFrontMatter.value, extension, tokens, componentSpecs, profile, hardFailures)
  validateCandidateProjection(extension, tokens, hardFailures)

  if (!isObject(visualQa) || visualQa.schemaVersion !== '1' || !Array.isArray(visualQa.checks)) {
    hardFailures.push('invalid-visual-qa-artifact')
  } else {
    validateEvidenceReferences(visualQa, evidenceIds, 'visual-qa', hardFailures)
  }

  const componentSummary = extension?.componentSummary
  if (
    isObject(componentSummary) &&
    usesBoundedComponentProjection(extension, componentSummary) &&
    componentSummary.actionablePatterns !== components.length
  ) {
    hardFailures.push('component-summary-spec-count-mismatch')
  }
  if (evidence && extension?.evidence) {
    const pageCount = new Set((evidence.pages || []).map(evidencePageRouteIdentity)).size
    const captureCount = Array.isArray(evidence.pages) ? evidence.pages.length : 0
    if (Number(extension.evidence.pageCount) !== pageCount) hardFailures.push('design-doc-page-count-mismatch')
    if (Number(extension.evidence.captureCount) !== captureCount) hardFailures.push('design-doc-capture-count-mismatch')
    const reportedAssets = extension.evidence.coverage?.assetCoverage
    if (!isObject(reportedAssets)) {
      hardFailures.push('missing-design-doc-asset-coverage')
    } else {
      for (const field of ['expected', 'valid', 'status', 'issueCount']) {
        if (reportedAssets[field] !== screenshotMetrics[field]) {
          hardFailures.push(`design-doc-asset-coverage-mismatch:${field}`)
        }
      }
    }
  }
  const darkCatalog = dtcgTokenCatalog(dtcgDarkRoot(dtcg))
  const portableEntries = [...catalog, ...darkCatalog]
  const implementationEntries = [
    ...declaredImplementationEntries(sources['variables.css'], 'css'),
    ...declaredImplementationEntries(sources['variables.scss'], 'scss'),
    ...declaredImplementationEntries(sources['theme.css'], 'tailwind'),
  ]
  const allCandidates = [
    ...(Array.isArray(canonicalCandidates) ? canonicalCandidates : []),
    ...(Array.isArray(dtcg?.dark?.$extensions?.['com.imprint.candidates']?.values)
      ? dtcg.dark.$extensions['com.imprint.candidates'].values
      : []),
  ]
  for (const candidate of allCandidates) {
    const value = normalizedCssValue(candidate?.value || '')
    const group = candidate?.group
    const portableInSameGroup = portableEntries.some(
      ([ref, portableValue]) =>
        tokenRefMatchesCandidateGroup(ref, group) && normalizedCssValue(portableValue) === value,
    )
    const portableInImplementationNamespace = portableEntries.some(
      ([ref, portableValue]) =>
        tokenRefSharesImplementationNamespace(ref, group) && normalizedCssValue(portableValue) === value,
    )
    const implementedInSameGroup = implementationEntries.some(
      ([name, implementationValue]) =>
        implementationNameMatchesCandidateGroup(name, group) && implementationValue === value,
    )
    if (value && group !== 'colors' && portableInSameGroup) {
      hardFailures.push(`candidate-conflicts-portable-token:${candidate.id || candidate.group || value}`)
    } else if (value && !portableInImplementationNamespace && implementedInSameGroup) {
      hardFailures.push(`candidate-leaked-to-implementation:${candidate.id || candidate.group || value}`)
    }
  }

  const uniqueHardFailures = unique(hardFailures)
  const uniqueLimitations = unique(bundleLimitations)
  return {
    ...documentReport,
    file: resolved,
    classification:
      uniqueHardFailures.length > 0
        ? 'analyzer-failure'
        : uniqueLimitations.length > 0
          ? 'degraded-but-truthful'
          : 'pass',
    hardFailures: uniqueHardFailures,
    limitations: uniqueLimitations,
    warnings: unique(bundleWarnings),
    metrics: {
      ...documentReport.metrics,
      bundleArtifacts: REQUIRED_BUNDLE_FILES.length,
      evidenceIds: evidenceIds.size,
      portableTokens: catalog.size,
      canonicalCandidates: Array.isArray(canonicalCandidates) ? canonicalCandidates.length : 0,
      componentSpecs: components.length,
      screenshotAssets: screenshotMetrics.listedImages,
      validOverviewScreenshots: screenshotMetrics.valid,
    },
  }
}

function dtcgDarkRoot(dtcg) {
  if (!isObject(dtcg?.dark)) return null
  return { ...dtcg.dark, $extensions: dtcg.dark.$extensions || {} }
}

async function collectTargets(input, bundle = false) {
  const resolved = path.resolve(input)
  const stat = await fs.stat(resolved)
  if (stat.isFile()) return [{ file: resolved, bundle }]
  if (!stat.isDirectory()) return []
  const targets = []
  for (const entry of await fs.readdir(resolved, { withFileTypes: true })) {
    const child = path.join(resolved, entry.name)
    if (entry.isDirectory()) targets.push(...(await collectTargets(child, true)))
    else if (entry.isFile() && entry.name.toLowerCase() === 'design.md') targets.push({ file: child, bundle: true })
  }
  return targets
}

async function main() {
  const args = process.argv.slice(2)
  const outputIndex = args.indexOf('--output')
  const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined
  const inputs = args.filter((_value, index) => outputIndex < 0 || (index !== outputIndex && index !== outputIndex + 1))
  if (inputs.length === 0 || (outputIndex >= 0 && !output)) {
    process.stderr.write('Usage: pnpm audit:design-doc <DESIGN.md-or-directory> [...] [--output report.json]\n')
    process.exitCode = 2
    return
  }
  const collectedTargets = (await Promise.all(inputs.map((input) => collectTargets(input)))).flat()
  const targetMap = new Map()
  for (const target of collectedTargets) {
    const existing = targetMap.get(target.file)
    targetMap.set(target.file, { file: target.file, bundle: Boolean(existing?.bundle || target.bundle) })
  }
  const targets = [...targetMap.values()].sort((first, second) => first.file.localeCompare(second.file))
  if (targets.length === 0) {
    process.stderr.write('No DESIGN.md files found.\n')
    process.exitCode = 2
    return
  }
  const reports = await Promise.all(
    targets.map(async ({ file, bundle }) =>
      bundle ? auditArtifactBundle(path.dirname(file)) : auditDesignDoc(await fs.readFile(file, 'utf8'), file),
    ),
  )
  const summary = {
    generatedAt: new Date().toISOString(),
    totals: {
      files: reports.length,
      pass: reports.filter((report) => report.classification === 'pass').length,
      degraded: reports.filter((report) => report.classification === 'degraded-but-truthful').length,
      failures: reports.filter((report) => report.classification === 'analyzer-failure').length,
    },
    reports,
  }
  const json = `${JSON.stringify(summary, null, 2)}\n`
  if (output) await fs.writeFile(path.resolve(output), json)
  process.stdout.write(json)
  if (summary.totals.failures > 0) process.exitCode = 1
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) await main()
