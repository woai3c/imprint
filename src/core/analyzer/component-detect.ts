import type { Page } from 'playwright-core'

export interface ComponentPattern {
  type: string
  count: number
  selectors: string[]
  styles: Record<string, string>
}

/**
 * Detect common UI component patterns from the DOM structure.
 * Identifies Cards, Buttons, Navigation, Forms, Modals, Tables, etc.
 */
export async function detectComponents(page: Page): Promise<ComponentPattern[]> {
  return await page.evaluate(() => {
    const patterns: Array<{
      type: string
      count: number
      selectors: string[]
      styles: Record<string, string>
    }> = []

    // Detect Buttons
    const buttons = document.querySelectorAll('button, [role="button"], a.btn, .button, input[type="submit"]')
    if (buttons.length > 0) {
      const firstBtn = buttons[0] as HTMLElement
      const computed = getComputedStyle(firstBtn)
      patterns.push({
        type: 'button',
        count: buttons.length,
        selectors: ['button', '[role="button"]'],
        styles: {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          borderRadius: computed.borderRadius,
          padding: `${computed.paddingTop} ${computed.paddingRight}`,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
        },
      })
    }

    // Detect Cards (elements with border-radius + shadow or border + padding)
    const allElements = document.querySelectorAll('*')
    let cardCount = 0
    let cardStyles: Record<string, string> = {}
    for (const el of allElements) {
      const computed = getComputedStyle(el)
      const hasRadius = parseFloat(computed.borderRadius) > 4
      const hasShadow = computed.boxShadow !== 'none'
      const hasBorder = computed.borderWidth !== '0px' && computed.borderStyle !== 'none'
      const hasPadding = parseFloat(computed.padding) > 12

      if (hasRadius && (hasShadow || hasBorder) && hasPadding) {
        cardCount++
        if (cardCount === 1) {
          cardStyles = {
            backgroundColor: computed.backgroundColor,
            borderRadius: computed.borderRadius,
            boxShadow: computed.boxShadow,
            border: `${computed.borderWidth} ${computed.borderStyle} ${computed.borderColor}`,
            padding: computed.padding,
          }
        }
      }
      if (cardCount > 50) break
    }
    if (cardCount > 2) {
      patterns.push({
        type: 'card',
        count: cardCount,
        selectors: ['[class*="card"]', '[class*="Card"]'],
        styles: cardStyles,
      })
    }

    // Detect Navigation
    const navs = document.querySelectorAll('nav, [role="navigation"], header nav')
    if (navs.length > 0) {
      const firstNav = navs[0] as HTMLElement
      const computed = getComputedStyle(firstNav)
      patterns.push({
        type: 'navigation',
        count: navs.length,
        selectors: ['nav', '[role="navigation"]'],
        styles: {
          backgroundColor: computed.backgroundColor,
          display: computed.display,
          gap: computed.gap,
        },
      })
    }

    // Detect Input fields
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="password"], textarea, select',
    )
    if (inputs.length > 0) {
      const firstInput = inputs[0] as HTMLElement
      const computed = getComputedStyle(firstInput)
      patterns.push({
        type: 'input',
        count: inputs.length,
        selectors: ['input', 'textarea', 'select'],
        styles: {
          backgroundColor: computed.backgroundColor,
          border: `${computed.borderWidth} ${computed.borderStyle} ${computed.borderColor}`,
          borderRadius: computed.borderRadius,
          padding: `${computed.paddingTop} ${computed.paddingLeft}`,
          fontSize: computed.fontSize,
        },
      })
    }

    // Detect Tables
    const tables = document.querySelectorAll('table, [role="table"]')
    if (tables.length > 0) {
      patterns.push({
        type: 'table',
        count: tables.length,
        selectors: ['table'],
        styles: {},
      })
    }

    // Detect Modals/Dialogs
    const dialogs = document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"], .modal, [class*="modal"]')
    if (dialogs.length > 0) {
      patterns.push({
        type: 'modal',
        count: dialogs.length,
        selectors: ['dialog', '[role="dialog"]'],
        styles: {},
      })
    }

    // Detect Lists
    const lists = document.querySelectorAll('ul, ol, [role="list"]')
    if (lists.length > 0) {
      patterns.push({
        type: 'list',
        count: lists.length,
        selectors: ['ul', 'ol'],
        styles: {},
      })
    }

    return patterns
  })
}
