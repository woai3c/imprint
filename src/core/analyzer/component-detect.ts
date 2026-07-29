import type { Page } from 'playwright-core'

export type ComponentType = 'button' | 'card' | 'navigation' | 'input' | 'table' | 'modal' | 'list'

export interface ComponentCandidate {
  type: ComponentType
  confidence: number
  evidence: string[]
  styles: Record<string, string>
}

export interface ComponentPattern {
  type: ComponentType
  count: number
  selectors: string[]
  styles: Record<string, string>
  confidence: number
  evidence: string[]
}

const COMPONENT_ORDER: ComponentType[] = ['button', 'card', 'navigation', 'input', 'table', 'modal', 'list']

const COMPONENT_SELECTORS: Record<ComponentType, string[]> = {
  button: ['button', 'input[type="submit"]', '[role="button"]'],
  card: [],
  navigation: ['nav', '[role="navigation"]'],
  input: ['input', 'textarea', 'select', '[role="textbox"]', '[role="combobox"]'],
  table: ['table', '[role="table"]', '[role="grid"]'],
  modal: ['dialog', '[role="dialog"]', '[role="alertdialog"]'],
  list: ['ul', 'ol', '[role="list"]'],
}

function selectRepresentativeStyles(candidates: ComponentCandidate[]): Record<string, string> {
  const groups = new Map<string, { count: number; candidate: ComponentCandidate }>()

  for (const candidate of candidates) {
    const key = JSON.stringify(candidate.styles)
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      if (candidate.confidence > existing.candidate.confidence) existing.candidate = candidate
    } else {
      groups.set(key, { count: 1, candidate })
    }
  }

  const representative = [...groups.values()].sort(
    (a, b) => b.count - a.count || b.candidate.confidence - a.candidate.confidence,
  )[0]
  return representative?.candidate.styles || {}
}

export function summarizeComponentCandidates(candidates: ComponentCandidate[]): ComponentPattern[] {
  const patterns: ComponentPattern[] = []

  for (const type of COMPONENT_ORDER) {
    const matches = candidates.filter((candidate) => candidate.type === type)
    if (matches.length === 0) continue

    const confidence = matches.reduce((sum, candidate) => sum + candidate.confidence, 0) / matches.length
    patterns.push({
      type,
      count: matches.length,
      selectors: COMPONENT_SELECTORS[type],
      styles: selectRepresentativeStyles(matches),
      confidence: Math.round(confidence * 100) / 100,
      evidence: [...new Set(matches.flatMap((candidate) => candidate.evidence))].sort(),
    })
  }

  return patterns
}

/**
 * Detect common UI component patterns from visible DOM semantics and visual evidence.
 * Native HTML and ARIA candidates carry stronger confidence than class-name or card heuristics.
 */
export async function detectComponents(page: Page): Promise<ComponentPattern[]> {
  const candidates = await page.evaluate(() => {
    type BrowserComponentType = 'button' | 'card' | 'navigation' | 'input' | 'table' | 'modal' | 'list'

    interface BrowserCandidate {
      type: BrowserComponentType
      confidence: number
      evidence: string[]
      styles: Record<string, string>
    }

    const candidatesByType = new Map<BrowserComponentType, Map<Element, BrowserCandidate>>()
    const computedStyleCache = new WeakMap<Element, CSSStyleDeclaration>()
    const visibilityCache = new WeakMap<Element, boolean>()
    const signatureCache = new WeakMap<Element, string>()
    const siblingSignatureCountCache = new WeakMap<Element, Map<string, number>>()

    const computedStyleFor = (element: Element): CSSStyleDeclaration => {
      const cached = computedStyleCache.get(element)
      if (cached) return cached

      const computed = getComputedStyle(element)
      computedStyleCache.set(element, computed)
      return computed
    }

    const isVisible = (element: Element): boolean => {
      const cached = visibilityCache.get(element)
      if (cached !== undefined) return cached

      const computed = computedStyleFor(element)
      const hiddenByAttribute = Boolean(element.closest('[hidden], [aria-hidden="true"], [inert]'))
      const rect = element.getBoundingClientRect()
      const visible =
        !hiddenByAttribute &&
        computed.display !== 'none' &&
        computed.visibility !== 'hidden' &&
        computed.visibility !== 'collapse' &&
        parseFloat(computed.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        element.getClientRects().length > 0

      visibilityCache.set(element, visible)
      return visible
    }

    const stylesFor = (type: BrowserComponentType, element: Element): Record<string, string> => {
      const computed = computedStyleFor(element)

      if (type === 'button') {
        return {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          borderRadius: computed.borderRadius,
          padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
        }
      }
      if (type === 'card') {
        return {
          backgroundColor: computed.backgroundColor,
          borderRadius: computed.borderRadius,
          boxShadow: computed.boxShadow,
          border: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
          padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
        }
      }
      if (type === 'navigation') {
        return {
          backgroundColor: computed.backgroundColor,
          display: computed.display,
          gap: computed.gap,
        }
      }
      if (type === 'input') {
        return {
          backgroundColor: computed.backgroundColor,
          border: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
          borderRadius: computed.borderRadius,
          padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
          fontSize: computed.fontSize,
        }
      }
      return {}
    }

    const addCandidate = (
      type: BrowserComponentType,
      element: Element,
      confidence: number,
      evidence: string[],
    ): void => {
      if (!isVisible(element)) return

      let candidates = candidatesByType.get(type)
      if (!candidates) {
        candidates = new Map()
        candidatesByType.set(type, candidates)
      }

      const existing = candidates.get(element)
      if (existing) {
        existing.confidence = Math.max(existing.confidence, confidence)
        existing.evidence = [...new Set([...existing.evidence, ...evidence])]
        return
      }

      candidates.set(element, {
        type,
        confidence,
        evidence,
        styles: stylesFor(type, element),
      })
    }

    const collect = (
      type: BrowserComponentType,
      selector: string,
      confidence: number,
      evidence: string[],
      predicate: (element: Element) => boolean = () => true,
    ): void => {
      for (const element of document.querySelectorAll(selector)) {
        if (predicate(element)) addCandidate(type, element, confidence, evidence)
      }
    }

    collect('button', 'button, input[type="button"], input[type="submit"], input[type="reset"]', 0.98, [
      'native-element',
    ])
    collect('button', '[role="button"]', 0.9, ['aria-role'])
    collect(
      'button',
      'a.btn, a.button, .btn, .button',
      0.65,
      ['class-name', 'interactive-behavior'],
      (element) =>
        element.matches('a[href], button, input') ||
        element.hasAttribute('onclick') ||
        element.getAttribute('tabindex') === '0',
    )

    collect('navigation', 'nav', 0.98, ['native-element'])
    collect('navigation', '[role="navigation"]', 0.9, ['aria-role'])

    collect(
      'input',
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select',
      0.98,
      ['native-element'],
    )
    collect('input', '[role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]', 0.88, [
      'aria-role',
    ])

    collect('table', 'table', 0.98, ['native-element'])
    collect('table', '[role="table"]', 0.9, ['aria-role'])
    collect('table', '[role="grid"], [role="treegrid"]', 0.82, ['aria-grid-role'])

    collect('modal', 'dialog', 0.98, ['native-element'])
    collect('modal', '[role="dialog"], [role="alertdialog"]', 0.9, ['aria-role'])
    collect(
      'modal',
      '.modal, [class*="modal"], [class*="Modal"]',
      0.65,
      ['class-name', 'overlay-position'],
      (element) => {
        const computed = computedStyleFor(element)
        return (
          element.getAttribute('aria-modal') === 'true' ||
          ((computed.position === 'fixed' || computed.position === 'absolute') && computed.zIndex !== 'auto')
        )
      },
    )

    collect('list', 'ul, ol', 0.98, ['native-element'])
    collect('list', '[role="list"]', 0.9, ['aria-role'])

    const isTransparent = (color: string): boolean =>
      color === 'transparent' || color === 'rgba(0, 0, 0, 0)' || color.endsWith(', 0)')

    const structuralSignature = (element: Element): string => {
      const cached = signatureCache.get(element)
      if (cached) return cached

      const classNames = [...element.classList]
        .filter((className) => className.length <= 48)
        .sort()
        .slice(0, 3)
        .join('.')
      const childTags = [...element.children]
        .slice(0, 5)
        .map((child) => child.tagName)
        .join(',')
      const signature = `${element.tagName}|${classNames}|${childTags}`
      signatureCache.set(element, signature)
      return signature
    }

    const repeatedSiblingCount = (element: Element): number => {
      const parent = element.parentElement
      if (!parent) return 1

      let signatureCounts = siblingSignatureCountCache.get(parent)
      if (!signatureCounts) {
        signatureCounts = new Map()
        for (const sibling of parent.children) {
          if (!isVisible(sibling)) continue
          const signature = structuralSignature(sibling)
          signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1)
        }
        siblingSignatureCountCache.set(parent, signatureCounts)
      }

      return signatureCounts.get(structuralSignature(element)) || 0
    }

    const excludedCardTags = new Set([
      'HTML',
      'BODY',
      'MAIN',
      'NAV',
      'HEADER',
      'FOOTER',
      'FORM',
      'UL',
      'OL',
      'TABLE',
      'DIALOG',
      'BUTTON',
      'INPUT',
      'TEXTAREA',
      'SELECT',
    ])
    const allElements = [...document.querySelectorAll('body *')].slice(0, 10_000)

    for (const element of allElements) {
      if (excludedCardTags.has(element.tagName) || !isVisible(element)) continue

      const computed = computedStyleFor(element)
      const rect = element.getBoundingClientRect()
      if (rect.width < 120 || rect.height < 72) continue

      const radii = [
        computed.borderTopLeftRadius,
        computed.borderTopRightRadius,
        computed.borderBottomRightRadius,
        computed.borderBottomLeftRadius,
      ].map((value) => parseFloat(value) || 0)
      const hasRadius = Math.max(...radii) > 4
      const hasShadow = computed.boxShadow !== 'none'
      const hasBorder =
        [computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth]
          .map((value) => parseFloat(value) || 0)
          .some((width) => width > 0) && computed.borderStyle !== 'none'
      const paddings = [computed.paddingTop, computed.paddingRight, computed.paddingBottom, computed.paddingLeft].map(
        (value) => parseFloat(value) || 0,
      )
      const hasPadding = Math.min(...paddings) >= 12
      if (!hasPadding || (!hasRadius && !hasShadow && !hasBorder)) continue

      const parentBackground = element.parentElement ? computedStyleFor(element.parentElement).backgroundColor : ''
      const hasDistinctSurface =
        !isTransparent(computed.backgroundColor) && computed.backgroundColor !== parentBackground
      const textLength = (element.textContent || '').replace(/\s+/g, ' ').trim().length
      const hasContent = textLength >= 12
      const hasStructure = element.children.length >= 2
      const hasMediaOrAction = Boolean(
        element.querySelector('img, picture, svg, button, a[href], [role="button"], input, textarea, select'),
      )
      const siblings = repeatedSiblingCount(element)
      const isRepeated = siblings >= 2
      const isLargeLayout = rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.5

      let confidence = 0
      const evidence: string[] = []
      if (hasRadius) {
        confidence += 0.16
        evidence.push('rounded-container')
      }
      if (hasShadow || hasBorder) {
        confidence += 0.22
        if (hasShadow) evidence.push('shadow-boundary')
        if (hasBorder) evidence.push('border-boundary')
      }
      if (hasPadding) {
        confidence += 0.16
        evidence.push('contained-spacing')
      }
      if (hasDistinctSurface) {
        confidence += 0.1
        evidence.push('distinct-surface')
      }
      if (hasContent) {
        confidence += 0.12
        evidence.push('content-region')
      }
      if (hasStructure) {
        confidence += 0.08
        evidence.push('structured-children')
      }
      if (isRepeated) {
        confidence += 0.12
        evidence.push('repeated-sibling-structure')
      }
      if (hasMediaOrAction) {
        confidence += 0.08
        evidence.push('media-or-action')
      }
      if (isLargeLayout) {
        confidence -= 0.2
        evidence.push('large-layout-penalty')
      }

      if (confidence >= 0.62) {
        addCandidate('card', element, Math.min(0.94, confidence), evidence)
      }
    }

    return [...candidatesByType.values()].flatMap((candidates) => [...candidates.values()])
  })

  return summarizeComponentCandidates(candidates)
}
