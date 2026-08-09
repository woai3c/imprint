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
    const breakpoints = new Set<number>()
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

    const visitRules = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule || rule.constructor.name === 'CSSContainerRule') {
          const conditionText = 'conditionText' in rule ? String(rule.conditionText) : ''
          const patterns = [
            /(?:min|max)-width\s*:\s*(\d*\.?\d+)(px|r?em)/gi,
            /\bwidth\s*[<>]=?\s*(\d*\.?\d+)(px|r?em)/gi,
            /(\d*\.?\d+)(px|r?em)\s*[<>]=?\s*width\b/gi,
          ]
          for (const pattern of patterns) {
            for (const match of conditionText.matchAll(pattern)) {
              const value = Number.parseFloat(match[1])
              const pixels = match[2].toLowerCase() === 'px' ? value : value * rootFontSize
              if (Number.isFinite(pixels) && pixels > 0) breakpoints.add(Math.round(pixels))
            }
          }
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

    for (const element of [...document.querySelectorAll('main, section, article, [class*="grid" i]')].slice(0, 200)) {
      const minimumWidth = getComputedStyle(element).minWidth
      const match = minimumWidth.match(/^(\d*\.?\d+)(px|r?em)$/i)
      if (!match) continue
      const value = Number.parseFloat(match[1])
      const pixels = match[2].toLowerCase() === 'px' ? value : value * rootFontSize
      if (Number.isFinite(pixels) && pixels >= 320 && pixels <= 1920) breakpoints.add(Math.round(pixels))
    }

    return [...breakpoints].sort((a, b) => a - b)
  })

  return labelBreakpointWidths(rawBreakpoints).map(({ width, label }) => ({
    width,
    label,
    layoutChanges: [],
  }))
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
  for (const breakpoint of breakpointGroups.flat()) {
    const changes = changesByWidth.get(breakpoint.width) || new Set<string>()
    breakpoint.layoutChanges.forEach((change) => changes.add(change))
    changesByWidth.set(breakpoint.width, changes)
  }
  return labelBreakpointWidths([...changesByWidth.keys()].sort((first, second) => first - second)).map(
    ({ width, label }) => ({ width, label, layoutChanges: [...(changesByWidth.get(width) || [])] }),
  )
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
