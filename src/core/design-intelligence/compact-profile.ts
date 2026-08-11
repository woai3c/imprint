import { isRecord } from '../../shared/type-guards.js'
import { parseJsonObjects } from '../ai/json-payload.js'
import type { ColorRenameProposal } from '../analyzer/token-renamer.js'
import type { AnalysisDigestPackage } from './analysis-digest.js'
import type { IntelligenceInputMode } from './types.js'

interface ExpandedCompactCandidate {
  profile: unknown
  aliases: ColorRenameProposal[]
}

function compactPayload(value: unknown): Record<string, unknown> | null {
  if (isRecord(value) && Array.isArray(value.claims) && typeof value.thesis === 'string') return value
  if (isRecord(value) && isRecord(value.profile)) return compactPayload(value.profile)
  return null
}

export function extractCompactProfileCandidate(response: string): Record<string, unknown> | null {
  const objects = parseJsonObjects(response)
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const candidate = compactPayload(objects[index])
    if (candidate) return candidate
  }
  return null
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function stringList(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, max) : []
}

function objectList(value: unknown, max: number): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord).slice(0, max) : []
}

function claimRefs(value: unknown, max: number): string[] {
  if (typeof value === 'string') return [value]
  return stringList(value, max)
}

export function expandCompactProfileCandidate(
  candidate: Record<string, unknown>,
  digestPackage: AnalysisDigestPackage,
  language: 'en' | 'zh-CN',
  inputMode: IntelligenceInputMode,
): ExpandedCompactCandidate {
  const claimPool = new Map<string, Record<string, unknown>>()
  for (const claim of objectList(candidate.claims, 48)) {
    const id = safeString(claim.id)
    if (id && !claimPool.has(id)) claimPool.set(id, claim)
  }

  const expandClaim = (claimId: unknown): unknown => {
    if (typeof claimId !== 'string') return null
    const source = claimPool.get(claimId)
    if (!source) return null
    const evidence = stringList(source.e, 3).flatMap((shortId) => {
      const evidenceId = digestPackage.evidenceIdMap.get(shortId)
      return evidenceId
        ? [{ evidenceId, note: language === 'zh-CN' ? `摘要证据 ${shortId}` : `Digest evidence ${shortId}` }]
        : []
    })
    const tokenRefs = stringList(source.t, 8).flatMap((shortId) => {
      const tokenRef = digestPackage.tokenRefMap.get(shortId)
      return tokenRef ? [tokenRef] : []
    })
    return {
      statement: safeString(source.s),
      implementation: safeString(source.i),
      confidence: safeString(source.c),
      evidence,
      ...(tokenRefs.length > 0 ? { tokenRefs } : {}),
    }
  }

  const singletonClaimIds = new Set<string>()
  const expandUniqueClaim = (claimId: unknown): unknown => {
    if (typeof claimId !== 'string' || singletonClaimIds.has(claimId)) return null
    const expanded = expandClaim(claimId)
    if (expanded) singletonClaimIds.add(claimId)
    return expanded
  }

  const expandClaims = (value: unknown, max: number) => claimRefs(value, max).map(expandClaim).filter(Boolean)
  const composition = isRecord(candidate.composition) ? candidate.composition : {}
  const attention = isRecord(candidate.attention) ? candidate.attention : {}
  const visual = isRecord(candidate.visual) ? candidate.visual : {}
  const interaction = isRecord(candidate.interaction) ? candidate.interaction : {}
  const transfer = isRecord(candidate.transfer) ? candidate.transfer : {}

  const signatureMoves = objectList(candidate.signatureMoves, 2).flatMap((move, index) => {
    const claim = expandClaim(move.q)
    if (!isRecord(claim)) return []
    return [
      {
        ...claim,
        id: `move-${index + 1}`,
        name: safeString(move.n, safeString(claim.statement).slice(0, 80)),
        distinctiveness: safeString(move.d, safeString(claim.statement)),
      },
    ]
  })

  const sectionGrammar = objectList(candidate.sections, 8).flatMap((section) => {
    const role = safeString(section.role)
    if (!role) return []
    return [
      {
        role,
        composition: expandClaims(section.composition, 3),
        contentRhythm: expandClaims(section.rhythm, 3),
        transitionToNext: expandClaims(section.transition, 3),
      },
    ]
  })
  const componentGrammar = objectList(candidate.components, 8).flatMap((component) => {
    const name = safeString(component.component)
    if (!name) return []
    return [
      {
        component: name,
        role: safeString(component.role, 'observed component'),
        rules: expandClaims(component.rules, 3),
      },
    ]
  })
  const uncertainties = objectList(candidate.uncertainties, 6).flatMap((item) => {
    const topic = safeString(item.topic)
    const reason = safeString(item.reason)
    if (!topic || !reason) return []
    const neededEvidence = safeString(item.needed)
    return [{ topic, reason, ...(neededEvidence ? { neededEvidence } : {}) }]
  })
  const imageObservations = objectList(candidate.imageObservations, 3).flatMap((item) => {
    const imageId = digestPackage.evidenceIdMap.get(safeString(item.image))
    const description = safeString(item.description)
    return imageId && description ? [{ imageId, description }] : []
  })

  const aliases = objectList(candidate.aliases, 8).flatMap((item) => {
    const tokenRef = digestPackage.tokenRefMap.get(safeString(item.token))
    const name = safeString(item.name)
    if (!tokenRef?.startsWith('color.') || !name) return []
    const tokenId = tokenRef.slice('color.'.length)
    if (!/^(?:dark-)?palette-\d+$/.test(tokenId)) return []
    return [{ tokenId, name }]
  })

  return {
    profile: {
      schemaVersion: '1',
      language,
      inputMode,
      thesis: expandUniqueClaim(candidate.thesis),
      signatureMoves,
      composition: {
        containerStrategy: expandUniqueClaim(composition.container),
        alignmentStrategy: expandUniqueClaim(composition.alignment),
        densityAndWhitespace: expandUniqueClaim(composition.density),
        rhythm: expandUniqueClaim(composition.rhythm),
      },
      attention: {
        entryPoint: expandUniqueClaim(attention.entry),
        visualSequence: expandClaims(attention.sequence, 4),
        actionHierarchy: expandUniqueClaim(attention.action),
        contrastStrategy: expandUniqueClaim(attention.contrast),
      },
      visualLanguage: {
        color: expandUniqueClaim(visual.color),
        typography: expandUniqueClaim(visual.typography),
        shape: expandUniqueClaim(visual.shape),
        surfaces: expandUniqueClaim(visual.surfaces),
        ...(typeof visual.imagery === 'string' ? { imagery: expandUniqueClaim(visual.imagery) } : {}),
        ...(typeof visual.motion === 'string' ? { motion: expandUniqueClaim(visual.motion) } : {}),
      },
      sectionGrammar,
      interactionLanguage: {
        primaryDrivers: expandClaims(interaction.drivers, 3),
        feedbackStyle: expandUniqueClaim(interaction.feedback),
        stateChangeAmplitude: expandUniqueClaim(interaction.amplitude),
        ...(typeof interaction.scroll === 'string' ? { scrollNarrative: expandUniqueClaim(interaction.scroll) } : {}),
        continuityRules: expandClaims(interaction.continuity, 4),
      },
      componentGrammar,
      transferRules: {
        preserve: expandClaims(transfer.preserve, 4),
        adapt: expandClaims(transfer.adapt, 4),
        avoid: expandClaims(transfer.avoid, 4),
      },
      uncertainties,
      ...(imageObservations.length > 0 ? { imageObservations } : {}),
    },
    aliases,
  }
}
