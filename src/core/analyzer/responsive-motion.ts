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

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSMediaRule) {
            const match = rule.conditionText.match(/(?:min|max)-width:\s*(\d+)px/)
            if (match) {
              breakpoints.add(parseInt(match[1]))
            }
          }
        }
      } catch {
        // Cross-origin
      }
    }

    return [...breakpoints].sort((a, b) => a - b)
  })

  return rawBreakpoints.map((width) => ({
    width,
    label: categorizeBreakpoint(width),
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

/**
 * Detect animations and transitions used on the page.
 */
export interface MotionToken {
  property: string
  duration: string
  easing: string
  count: number
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
