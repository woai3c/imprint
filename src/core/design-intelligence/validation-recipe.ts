import type { DesignToken } from '../analyzer/types.js'
import type {
  AnalysisCapabilityLevel,
  DesignProfile,
  ValidationCheck,
  ValidationRecipe,
  ValidationReport,
} from './types.js'

function first<T>(values: T[], fallback: T): T {
  return values[0] ?? fallback
}

export function createValidationRecipe(
  scenario: ValidationRecipe['scenario'],
  profile: DesignProfile,
  tokens: DesignToken,
): ValidationRecipe {
  const gap = first(tokens.spacing, '8px')
  const ruleRefs = [
    profile.signatureMoves[0]?.id,
    ...profile.transferRules.preserve
      .slice(0, 3)
      .flatMap((claim) => claim.evidence.map((evidence) => evidence.evidenceId)),
  ].filter(Boolean)
  const stateChildren = [
    { type: 'button' as const, variant: 'primary' as const, labelKey: 'confirm' },
    { type: 'button' as const, variant: 'secondary' as const, labelKey: 'cancel' },
    { type: 'field' as const, state: 'focus' as const },
    { type: 'field' as const, state: 'error' as const },
  ]
  return {
    title:
      scenario === 'workflow'
        ? 'Create and confirm'
        : scenario === 'content'
          ? 'Content summary'
          : 'Interaction states',
    scenario,
    ruleRefs,
    root:
      scenario === 'states'
        ? { type: 'grid', columns: 2, gap, children: stateChildren }
        : {
            type: 'stack',
            gap,
            children: [
              { type: 'text', role: 'heading', contentKey: 'title' },
              { type: 'text', role: 'body', contentKey: 'description' },
              {
                type: 'surface',
                variant: 'primary',
                children:
                  scenario === 'workflow'
                    ? stateChildren.slice(0, 2)
                    : [{ type: 'text', role: 'body', contentKey: 'summary' }],
              },
            ],
          },
  }
}

function collectRecipeValues(recipe: ValidationRecipe): {
  gaps: string[]
  ruleRefs: string[]
  maxColumns: number
  fieldStates: string[]
} {
  const gaps: string[] = []
  let maxColumns = 1
  const fieldStates: string[] = []
  const visit = (node: ValidationRecipe['root']) => {
    if (node.type === 'stack' || node.type === 'grid') {
      gaps.push(node.gap)
      if (node.type === 'grid') maxColumns = Math.max(maxColumns, node.columns)
      node.children.forEach(visit)
    } else if (node.type === 'surface') {
      node.children.forEach(visit)
    } else if (node.type === 'field') {
      fieldStates.push(node.state || 'default')
    }
  }
  visit(recipe.root)
  return { gaps, ruleRefs: recipe.ruleRefs, maxColumns, fieldStates }
}

function parseHex(value: string): [number, number, number] | null {
  const match = value.trim().match(/^#([\da-f]{6})$/i)
  if (!match) return null
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ]
}

function luminance(rgb: [number, number, number]): number {
  const channels = rgb.map((value) => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(first: string | undefined, second: string | undefined): number | null {
  if (!first || !second) return null
  const firstRgb = parseHex(first)
  const secondRgb = parseHex(second)
  if (!firstRgb || !secondRgb) return null
  const values = [luminance(firstRgb), luminance(secondRgb)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

function likelyContrastPair(colors: Record<string, string>): [string | undefined, string | undefined] {
  const entries = Object.entries(colors)
  const background =
    entries.find(([name]) => /^(background|surface|canvas|bg)$/i.test(name))?.[1] ||
    entries.find(([name]) => /background|surface|canvas/i.test(name))?.[1]
  const foreground =
    entries.find(([name]) => /^(foreground|text|ink)$/i.test(name))?.[1] ||
    entries.find(([name]) => /foreground|text|ink/i.test(name))?.[1]
  return [background, foreground]
}

export function validateRecipe(
  recipe: ValidationRecipe,
  profile: DesignProfile,
  tokens: DesignToken,
  capabilityLevel: AnalysisCapabilityLevel,
): ValidationReport {
  const values = collectRecipeValues(recipe)
  const [background, foreground] = likelyContrastPair(tokens.colors)
  const contrast = contrastRatio(background, foreground)
  const validRuleRefs = new Set([
    ...profile.signatureMoves.map((move) => move.id),
    ...profile.signatureMoves.flatMap((move) => move.evidence.map((evidence) => evidence.evidenceId)),
    ...profile.transferRules.preserve.flatMap((claim) => claim.evidence.map((evidence) => evidence.evidenceId)),
  ])
  const checks: ValidationCheck[] = [
    {
      id: 'profile-grounding',
      rule: 'Transferred rules retain evidence citations',
      status: profile.transferRules.preserve.every((claim) => claim.evidence.length > 0) ? 'passed' : 'failed',
      deterministicResult: profile.transferRules.preserve.every((claim) => claim.evidence.length > 0)
        ? 'Every preserve rule retains at least one validated evidence citation.'
        : 'At least one preserve rule has no evidence citation.',
      ...(profile.transferRules.preserve.every((claim) => claim.evidence.length > 0)
        ? {}
        : {
            failureLayer: 'interpretation' as const,
            suggestion: 'Remove the unsupported rule or reinterpret it from additional evidence.',
          }),
    },
    {
      id: 'token-spacing',
      rule: 'Use only observed spacing values',
      previewRef: 'root.layout',
      status: values.gaps.every((gap) => tokens.spacing.includes(gap)) ? 'passed' : 'failed',
      deterministicResult: values.gaps.every((gap) => tokens.spacing.includes(gap))
        ? 'All recipe gaps use extracted spacing tokens.'
        : 'The recipe contains an off-scale gap.',
      ...(values.gaps.every((gap) => tokens.spacing.includes(gap))
        ? {}
        : { failureLayer: 'generation' as const, suggestion: 'Replace off-scale gaps with extracted spacing values.' }),
    },
    {
      id: 'rule-references',
      rule: 'Reference only validated DesignProfile rules',
      previewRef: 'root',
      status: values.ruleRefs.every((ruleRef) => validRuleRefs.has(ruleRef)) ? 'passed' : 'failed',
      deterministicResult: values.ruleRefs.every((ruleRef) => validRuleRefs.has(ruleRef))
        ? 'Every rule reference exists.'
        : 'At least one rule reference does not exist.',
      ...(values.ruleRefs.every((ruleRef) => validRuleRefs.has(ruleRef))
        ? {}
        : {
            failureLayer: 'generation' as const,
            suggestion: 'Remove references that are not present in the validated profile.',
          }),
    },
    {
      id: 'state-coverage',
      rule: 'State scenarios include focus and error surfaces',
      previewRef: 'root.states',
      status:
        recipe.scenario === 'states' && values.fieldStates.includes('focus') && values.fieldStates.includes('error')
          ? 'passed'
          : recipe.scenario === 'states'
            ? 'failed'
            : 'unknown',
      deterministicResult:
        recipe.scenario === 'states'
          ? values.fieldStates.includes('focus') && values.fieldStates.includes('error')
            ? 'The state recipe includes focus and error fields.'
            : 'The state recipe is missing focus or error coverage.'
          : 'This scenario does not attempt full state validation.',
      ...(recipe.scenario === 'states' &&
      (!values.fieldStates.includes('focus') || !values.fieldStates.includes('error'))
        ? {
            failureLayer: 'generation' as const,
            suggestion: 'Add allowlisted focus and error field states to the state recipe.',
          }
        : {}),
    },
    {
      id: 'text-contrast',
      rule: 'Primary text and surface colors meet WCAG AA contrast',
      previewRef: 'root.surface',
      status: contrast === null ? 'unknown' : contrast >= 4.5 ? 'passed' : 'failed',
      deterministicResult:
        contrast === null
          ? 'A reliable primary text/surface token pair could not be identified.'
          : `The inferred primary pair has a ${contrast.toFixed(2)}:1 contrast ratio.`,
      ...(contrast !== null && contrast < 4.5
        ? {
            failureLayer: 'evidence' as const,
            suggestion: 'Choose a higher-contrast extracted foreground/surface pair.',
          }
        : {}),
    },
    {
      id: 'horizontal-overflow',
      rule: 'Neutral validation recipes avoid fixed-width horizontal overflow',
      previewRef: 'root.layout',
      status: values.maxColumns <= 4 ? 'passed' : 'failed',
      deterministicResult:
        values.maxColumns <= 4
          ? 'The allowlisted layout uses bounded responsive columns and no fixed width.'
          : 'The recipe requests more than four columns.',
      ...(values.maxColumns <= 4
        ? {}
        : {
            failureLayer: 'generation' as const,
            suggestion: 'Reduce the validation grid to four or fewer responsive columns.',
          }),
    },
    {
      id: 'reduced-motion',
      rule: 'The neutral validation recipe remains usable with reduced motion',
      previewRef: 'root',
      status: 'passed',
      deterministicResult: 'The allowlisted recipe contains no required animation or time-dependent interaction.',
    },
  ]
  return {
    schemaVersion: '1',
    generatedAt: new Date().toISOString(),
    capabilityLevel,
    recipe,
    checks,
  }
}
