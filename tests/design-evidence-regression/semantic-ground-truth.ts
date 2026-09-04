import type { FixtureAnnotation } from './annotation-types.js'

export interface SemanticGroundTruthArtifacts {
  colors: Record<string, string>
  componentRoles: string[]
  componentSemantics: Array<{
    elementKind?: string
    semanticIdentity?: string
    visualTreatment?: string
  }>
  componentPatternNames: string[]
  componentPatternStyles?: Record<string, Record<string, string[]>>
  responsiveChanges: Array<{ role: string; properties: string[] }>
}

function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (hex) {
    const body = hex[1].length === 3 ? [...hex[1]].map((part) => part + part).join('') : hex[1]
    return `#${body.toLowerCase()}`
  }
  const rgb = value.trim().match(/^rgba?\(\s*(\d+)\s*[, ]+\s*(\d+)\s*[, ]+\s*(\d+)(?:\s*[,/]\s*[\d.]+)?\s*\)$/i)
  if (!rgb) return value.trim().toLowerCase()
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

/** Independent fixture oracle: it reads only hand-authored annotations and public analyzer artifacts. */
export function evaluateSemanticGroundTruth(
  annotation: FixtureAnnotation,
  artifacts: SemanticGroundTruthArtifacts,
): string[] {
  const truth = annotation.semanticGroundTruth
  if (!truth) return []
  const issues: string[] = []
  for (const [role, expected] of Object.entries(truth.foundationColors || {})) {
    const actual = artifacts.colors[role]
    if (expected === null) {
      if (actual !== undefined) issues.push(`foundation color ${role} must be omitted, received ${actual}`)
      continue
    }
    if (normalizeColor(actual) !== normalizeColor(expected)) {
      issues.push(`foundation color ${role} expected ${expected}, received ${actual || 'omitted'}`)
    }
  }
  const foundationValues = ['background', 'surface', 'secondary']
    .map((role) => normalizeColor(artifacts.colors[role]))
    .filter(Boolean)
  for (const forbidden of truth.forbiddenFoundationColors || []) {
    if (foundationValues.includes(normalizeColor(forbidden))) {
      issues.push(`specialized color ${forbidden} was promoted to the foundation palette`)
    }
  }
  for (const role of truth.expectedComponentRoles || []) {
    if (!artifacts.componentRoles.includes(role)) issues.push(`component role ${role} was not preserved`)
  }
  for (const expected of truth.expectedComponentSemantics || []) {
    if (
      !artifacts.componentSemantics.some(
        (component) =>
          component.elementKind === expected.elementKind &&
          component.semanticIdentity === expected.semanticIdentity &&
          component.visualTreatment === expected.visualTreatment,
      )
    ) {
      issues.push(
        `component semantic tuple ${expected.elementKind}/${expected.semanticIdentity}/${expected.visualTreatment} was not preserved`,
      )
    }
  }
  for (const name of truth.expectedComponentPatternNames || []) {
    if (!artifacts.componentPatternNames.includes(name)) issues.push(`component pattern ${name} was not preserved`)
  }
  for (const expected of truth.expectedComponentStyles || []) {
    const values = artifacts.componentPatternStyles?.[expected.pattern]?.[expected.property] || []
    if (!values.includes(expected.value)) {
      issues.push(
        `component pattern ${expected.pattern} expected ${expected.property}=${expected.value}, received ${values.join(', ') || 'omitted'}`,
      )
    }
  }
  for (const forbidden of truth.forbiddenComponentStyles || []) {
    const values = artifacts.componentPatternStyles?.[forbidden.pattern]?.[forbidden.property] || []
    if (values.includes(forbidden.value)) {
      issues.push(`component pattern ${forbidden.pattern} must not use ${forbidden.property}=${forbidden.value}`)
    }
  }
  const relativeRoles = artifacts.responsiveChanges
    .filter((change) => change.properties.includes('sequenceIndex'))
    .map((change) => change.role)
  if (truth.forbidRelativeReorder && relativeRoles.length > 0) {
    issues.push(`false relative reorder reported for ${[...new Set(relativeRoles)].sort().join(', ')}`)
  }
  for (const role of truth.expectedRelativeReorderRoles || []) {
    if (!relativeRoles.includes(role)) issues.push(`relative reorder for ${role} was not reported`)
  }
  return issues
}
