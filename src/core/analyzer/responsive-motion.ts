import type { Page } from 'playwright-core'

export interface ResponsiveBreakpoint {
  width: number
  label: string
  layoutChanges: string[]
}

/**
 * Detect responsive breakpoints by analyzing CSS media queries.
 */
export async function detectBreakpoints(page: Page): Promise<ResponsiveBreakpoint[]> {
  const rawBreakpoints = await page.evaluate(() => {
    const breakpoints = new Map<number, number>()
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

    const visitRules = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule || rule.constructor.name === 'CSSContainerRule') {
          const conditionText = 'conditionText' in rule ? String(rule.conditionText) : ''
          const ruleBreakpoints = new Set<number>()
          const patterns = [
            /(?:min|max)-width\s*:\s*(\d*\.?\d+)(px|r?em)/gi,
            /\bwidth\s*[<>]=?\s*(\d*\.?\d+)(px|r?em)/gi,
            /(\d*\.?\d+)(px|r?em)\s*[<>]=?\s*width\b/gi,
          ]
          for (const pattern of patterns) {
            for (const match of conditionText.matchAll(pattern)) {
              const value = Number.parseFloat(match[1])
              const pixels = match[2].toLowerCase() === 'px' ? value : value * rootFontSize
              if (Number.isFinite(pixels) && pixels > 0) ruleBreakpoints.add(Math.round(pixels))
            }
          }
          for (const width of ruleBreakpoints) breakpoints.set(width, (breakpoints.get(width) || 0) + 1)
        }
        const nestedRules = 'cssRules' in rule ? (rule as CSSGroupingRule).cssRules : null
        if (nestedRules) visitRules(nestedRules)
      }
    }

    for (const sheet of document.styleSheets) {
      try {
        visitRules(sheet.cssRules)
      } catch {
        // Cross-origin
      }
    }

    return [...breakpoints].map(([width, count]) => ({ width, count })).sort((a, b) => a.width - b.width)
  })

  return labelBreakpointWidths(selectRepresentativeBreakpointWidths(rawBreakpoints)).map(({ width, label }) => ({
    width,
    label,
    layoutChanges: [],
  }))
}

function breakpointCanonicality(width: number): number {
  if (width % 16 === 0) return 3
  if (width % 8 === 0) return 2
  if (width % 4 === 0) return 1
  return 0
}

function isCategoryBoundary(width: number, category: string): boolean {
  const boundaryByCategory: Record<string, number> = {
    mobile: 480,
    'tablet-sm': 768,
    tablet: 1024,
    desktop: 1280,
  }
  return boundaryByCategory[category] === width
}

export function selectRepresentativeBreakpointWidths(
  breakpoints: readonly { width: number; count: number }[],
  maximum = 10,
): number[] {
  if (maximum <= 0) return []
  const clusters: Array<Array<{ width: number; count: number }>> = []
  for (const breakpoint of [...breakpoints].sort((first, second) => first.width - second.width)) {
    const cluster = clusters[clusters.length - 1]
    if (cluster && breakpoint.width - cluster[cluster.length - 1].width <= 2) cluster.push(breakpoint)
    else clusters.push([breakpoint])
  }
  const representatives = clusters.map((cluster) => {
    const representative = [...cluster].sort(
      (first, second) =>
        second.count - first.count ||
        breakpointCanonicality(second.width) - breakpointCanonicality(first.width) ||
        first.width - second.width,
    )[0]
    return {
      width: representative.width,
      count: cluster.reduce((total, item) => total + item.count, 0),
      category: categorizeBreakpoint(representative.width),
    }
  })
  const byCategory = new Map<string, typeof representatives>()
  for (const breakpoint of representatives) {
    const group = byCategory.get(breakpoint.category) || []
    group.push(breakpoint)
    byCategory.set(breakpoint.category, group)
  }
  const selected = [...byCategory.values()].flatMap((group) => {
    const ranked = [...group].sort(
      (first, second) =>
        second.count - first.count ||
        breakpointCanonicality(second.width) - breakpointCanonicality(first.width) ||
        first.width - second.width,
    )
    const primary = ranked[0]
    if (!primary || ranked.length === 1) return ranked
    const secondary = ranked
      .slice(1)
      .sort(
        (first, second) =>
          Number(isCategoryBoundary(second.width, second.category)) -
            Number(isCategoryBoundary(first.width, first.category)) ||
          breakpointCanonicality(second.width) - breakpointCanonicality(first.width) ||
          second.count - first.count ||
          Math.abs(second.width - primary.width) - Math.abs(first.width - primary.width) ||
          first.width - second.width,
      )[0]
    return [primary, secondary]
  })
  return selected
    .sort((first, second) => first.width - second.width)
    .slice(0, maximum)
    .map((breakpoint) => breakpoint.width)
}

function categorizeBreakpoint(width: number): string {
  if (width <= 480) return 'mobile'
  if (width <= 768) return 'tablet-sm'
  if (width <= 1024) return 'tablet'
  if (width <= 1280) return 'desktop'
  return 'wide'
}

export function labelBreakpointWidths(widths: readonly number[]): Array<{ width: number; label: string }> {
  const categorized = widths.map((width) => ({ width, baseLabel: categorizeBreakpoint(width) }))
  const totals = new Map<string, number>()
  categorized.forEach(({ baseLabel }) => totals.set(baseLabel, (totals.get(baseLabel) || 0) + 1))
  return categorized.map(({ width, baseLabel }) => ({
    width,
    label: (totals.get(baseLabel) || 0) > 1 ? `${baseLabel}-${width}` : baseLabel,
  }))
}

export function mergeResponsiveBreakpoints(breakpointGroups: ResponsiveBreakpoint[][]): ResponsiveBreakpoint[] {
  const changesByWidth = new Map<number, Set<string>>()
  const countsByWidth = new Map<number, number>()
  for (const breakpoint of breakpointGroups.flat()) {
    const changes = changesByWidth.get(breakpoint.width) || new Set<string>()
    breakpoint.layoutChanges.forEach((change) => changes.add(change))
    changesByWidth.set(breakpoint.width, changes)
    countsByWidth.set(breakpoint.width, (countsByWidth.get(breakpoint.width) || 0) + 1)
  }
  const representativeWidths = selectRepresentativeBreakpointWidths(
    [...countsByWidth].map(([width, count]) => ({ width, count })),
  )
  return labelBreakpointWidths(representativeWidths).map(({ width, label }) => ({
    width,
    label,
    layoutChanges: [...(changesByWidth.get(width) || [])],
  }))
}

/**
 * Detect animations and transitions used on the page.
 */
export interface MotionToken {
  property: string
  duration: string
  easing: string
  count: number
}

export function mergeMotionTokens(tokenGroups: MotionToken[][]): MotionToken[] {
  const merged = new Map<string, MotionToken>()
  for (const token of tokenGroups.flat()) {
    const key = `${token.property}|${token.duration}|${token.easing}`
    const existing = merged.get(key)
    if (existing) existing.count += token.count
    else merged.set(key, { ...token })
  }
  return [...merged.values()].sort((first, second) => second.count - first.count).slice(0, 10)
}

export async function detectMotion(page: Page): Promise<MotionToken[]> {
  return await page.evaluate(() => {
    const motionMap = new Map<string, { property: string; duration: string; easing: string; count: number }>()

    const elements = document.querySelectorAll('*')
    for (const el of elements) {
      const computed = getComputedStyle(el)

      // Transitions
      const transitionProp = computed.transitionProperty
      const transitionDur = computed.transitionDuration
      const transitionTiming = computed.transitionTimingFunction

      if (transitionProp && transitionProp !== 'none' && transitionDur !== '0s') {
        const key = `${transitionProp}|${transitionDur}|${transitionTiming}`
        const existing = motionMap.get(key)
        if (existing) {
          existing.count++
        } else {
          motionMap.set(key, {
            property: transitionProp,
            duration: transitionDur,
            easing: transitionTiming,
            count: 1,
          })
        }
      }

      // Animations
      const animName = computed.animationName
      const animDur = computed.animationDuration
      const animTiming = computed.animationTimingFunction

      if (animName && animName !== 'none' && animDur !== '0s') {
        const key = `anim:${animName}|${animDur}|${animTiming}`
        const existing = motionMap.get(key)
        if (existing) {
          existing.count++
        } else {
          motionMap.set(key, {
            property: `animation:${animName}`,
            duration: animDur,
            easing: animTiming,
            count: 1,
          })
        }
      }
    }

    return [...motionMap.values()].sort((a, b) => b.count - a.count).slice(0, 10)
  })
}
