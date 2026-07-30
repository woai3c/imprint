import type { Page } from 'playwright-core'

import type { LayoutMode, NormalizedRect, PageRole, SectionRole } from './types.js'

export interface PageSectionSnapshot {
  key: string
  parentKey?: string
  order: number
  role: SectionRole
  rect: NormalizedRect
  layoutMode: LayoutMode
  styles: Record<string, string>
}

export interface PageComponentSnapshot {
  key: string
  sectionKey: string
  type: string
  role?: string
  rect: NormalizedRect
  styles: Record<string, string>
  confidence: number
}

export interface PageLayoutNodeSnapshot {
  key: string
  sectionKey: string
  role:
    | 'header'
    | 'navigation'
    | 'hero'
    | 'section'
    | 'heading'
    | 'body'
    | 'media'
    | 'action'
    | 'card-group'
    | 'footer'
    | 'unknown'
  rect: NormalizedRect
  textRole?: 'display' | 'heading' | 'body' | 'label' | 'metadata'
  styles: Record<string, string>
  traits: string[]
}

export interface PageMediaLayerSnapshot {
  key: string
  sectionKey: string
  kind: 'image' | 'video' | 'svg' | 'canvas' | 'css-background'
  role: 'ambient' | 'narrative' | 'product' | 'decorative' | 'icon' | 'unknown'
  rect: NormalizedRect
  zIndex?: string
  objectFit?: string
  objectPosition?: string
  opacity?: string
  filter?: string
  blendMode?: string
}

export interface PageInteractionCandidateSnapshot {
  key: string
  sectionKey: string
  locator: string
  restoreLocator?: string
  componentKey?: string
  kind: 'tab' | 'disclosure' | 'dialog'
  driver: 'click'
}

export interface PageAriaStateSnapshot {
  key: string
  sectionKey: string
  attribute: 'aria-expanded' | 'aria-selected' | 'aria-checked'
  value: string
}

export interface PageEvidenceSnapshot {
  url: string
  viewport: string
  language?: string
  role: PageRole
  width: number
  height: number
  sections: PageSectionSnapshot[]
  components: PageComponentSnapshot[]
  layoutNodes: PageLayoutNodeSnapshot[]
  mediaLayers: PageMediaLayerSnapshot[]
  interactionCandidates: PageInteractionCandidateSnapshot[]
  ariaStates: PageAriaStateSnapshot[]
}

export async function extractPageEvidence(page: Page, viewport: string): Promise<PageEvidenceSnapshot> {
  return page.evaluate((viewportName) => {
    type BrowserSectionRole =
      'header' | 'navigation' | 'hero' | 'content' | 'feature-group' | 'media' | 'action' | 'footer' | 'unknown'
    type BrowserLayoutMode = 'flow' | 'sticky' | 'fixed' | 'overlay'
    type BrowserLayoutNodeRole =
      | 'header'
      | 'navigation'
      | 'hero'
      | 'section'
      | 'heading'
      | 'body'
      | 'media'
      | 'action'
      | 'card-group'
      | 'footer'
      | 'unknown'
    type BrowserTextRole = 'display' | 'heading' | 'body' | 'label' | 'metadata'
    type BrowserMediaKind = 'image' | 'video' | 'svg' | 'canvas' | 'css-background'
    type BrowserMediaRole = 'ambient' | 'narrative' | 'product' | 'decorative' | 'icon' | 'unknown'

    const computedCache = new WeakMap<Element, CSSStyleDeclaration>()
    const computedFor = (element: Element): CSSStyleDeclaration => {
      const cached = computedCache.get(element)
      if (cached) return cached
      const computed = getComputedStyle(element)
      computedCache.set(element, computed)
      return computed
    }

    const isVisible = (element: Element): boolean => {
      const computed = computedFor(element)
      const rect = element.getBoundingClientRect()
      return (
        !element.closest('[hidden], [aria-hidden="true"], [inert]') &&
        computed.display !== 'none' &&
        computed.visibility !== 'hidden' &&
        parseFloat(computed.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        element.getClientRects().length > 0
      )
    }

    const documentElement = document.documentElement
    const body = document.body
    const width = Math.max(documentElement.scrollWidth, body?.scrollWidth || 0, window.innerWidth, 1)
    const height = Math.max(documentElement.scrollHeight, body?.scrollHeight || 0, window.innerHeight, 1)
    const normalizedRect = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const x = Math.max(0, Math.min(width, rect.left + window.scrollX))
      const y = Math.max(0, Math.min(height, rect.top + window.scrollY))
      return {
        x: x / width,
        y: y / height,
        width: Math.max(0, Math.min(width - x, rect.width)) / width,
        height: Math.max(0, Math.min(height - y, rect.height)) / height,
      }
    }

    const layoutModeFor = (element: Element): BrowserLayoutMode => {
      const computed = computedFor(element)
      if (computed.position === 'sticky') return 'sticky'
      if (computed.position === 'fixed') return 'fixed'
      if (computed.position === 'absolute' && computed.zIndex !== 'auto') return 'overlay'
      return 'flow'
    }

    const roleForSection = (element: Element): BrowserSectionRole => {
      const tag = element.tagName
      const ariaRole = element.getAttribute('role')
      if (tag === 'HEADER' || ariaRole === 'banner') return 'header'
      if (tag === 'NAV' || ariaRole === 'navigation') return 'navigation'
      if (tag === 'FOOTER' || ariaRole === 'contentinfo') return 'footer'

      const rect = element.getBoundingClientRect()
      const hasHeadingOne = Boolean(element.querySelector('h1'))
      if (hasHeadingOne && rect.top + window.scrollY < window.innerHeight * 1.5) return 'hero'

      const media = element.querySelector('img, picture, video, svg, canvas')
      if (media) {
        const mediaRect = media.getBoundingClientRect()
        if (mediaRect.width * mediaRect.height >= rect.width * rect.height * 0.45) return 'media'
      }

      const visibleChildren = [...element.children].filter(isVisible)
      if (visibleChildren.length >= 3) {
        const signatures = visibleChildren.map((child) => `${child.tagName}:${child.className}`)
        const repeated = signatures.some((signature) => signatures.filter((value) => value === signature).length >= 2)
        if (repeated) return 'feature-group'
      }

      const actionCount = element.querySelectorAll('button, [role="button"], a[href]').length
      const textLength = (element.textContent || '').replace(/\s+/g, ' ').trim().length
      if (actionCount > 0 && textLength > 0 && textLength <= 480) return 'action'
      return tag === 'MAIN' || tag === 'ARTICLE' || tag === 'SECTION' ? 'content' : 'unknown'
    }

    const pageRole = (): 'landing' | 'content' | 'product' | 'pricing' | 'account' | 'unknown' => {
      const path = location.pathname.toLowerCase()
      if (/\/(pricing|plans|billing)(\/|$)/.test(path)) return 'pricing'
      if (/\/(account|profile|settings|dashboard)(\/|$)/.test(path)) return 'account'
      if (/\/(product|products|features)(\/|$)/.test(path)) return 'product'
      if (/\/(article|blog|docs|guide|about)(\/|$)/.test(path)) return 'content'
      if (path === '/' || path === '') return 'landing'
      return 'unknown'
    }

    const locatorFor = (element: Element): string => {
      if (element === document.body) return 'body'
      const parts: string[] = []
      let current: Element | null = element
      while (current && current !== document.body && parts.length < 8) {
        const parent: Element | null = current.parentElement
        if (!parent) break
        const tag = current.tagName.toLowerCase()
        const sameTagSiblings = [...parent.children].filter((sibling) => sibling.tagName === current?.tagName)
        const index = Math.max(1, sameTagSiblings.indexOf(current) + 1)
        parts.unshift(`${tag}:nth-of-type(${index})`)
        current = parent
      }
      return parts.length > 0 ? `body > ${parts.join(' > ')}` : element.tagName.toLowerCase()
    }

    const rawSectionCandidates = [
      ...document.querySelectorAll(
        'body > header, body > nav, body > main, body > section, body > article, body > footer, main > header, main > nav, main > section, main > article, main > div, [role="banner"], [role="main"], [role="region"], [role="contentinfo"]',
      ),
    ].filter(isVisible)
    const uniqueCandidates = [...new Set(rawSectionCandidates)]
    const sectionCandidates = uniqueCandidates.filter((element) => {
      const rect = element.getBoundingClientRect()
      if (rect.width < 32 || rect.height < 32) return false
      if (element.tagName !== 'MAIN' && element.getAttribute('role') !== 'main') return true
      return uniqueCandidates.filter((candidate) => candidate !== element && element.contains(candidate)).length < 2
    })
    if (sectionCandidates.length === 0) {
      const fallback = document.querySelector('main') || document.body
      if (fallback && isVisible(fallback)) sectionCandidates.push(fallback)
    }
    sectionCandidates.sort((a, b) => {
      const rectA = a.getBoundingClientRect()
      const rectB = b.getBoundingClientRect()
      return rectA.top + window.scrollY - (rectB.top + window.scrollY) || rectA.left - rectB.left
    })

    const sectionEntries = sectionCandidates.slice(0, 80).map((element, order) => {
      const role = roleForSection(element)
      const key = locatorFor(element)
      const computed = computedFor(element)
      return {
        element,
        key,
        snapshot: {
          key,
          parentKey: undefined as string | undefined,
          order,
          role,
          rect: normalizedRect(element),
          layoutMode: layoutModeFor(element),
          styles: {
            backgroundColor: computed.backgroundColor,
            color: computed.color,
            display: computed.display,
            position: computed.position,
            maxWidth: computed.maxWidth,
            paddingTop: computed.paddingTop,
            paddingRight: computed.paddingRight,
            paddingBottom: computed.paddingBottom,
            paddingLeft: computed.paddingLeft,
            gap: computed.gap,
            gridTemplateColumns: computed.gridTemplateColumns,
            overflowX: computed.overflowX,
            overflowY: computed.overflowY,
            scrollSnapType: computed.scrollSnapType,
            scrollSnapAlign: computed.scrollSnapAlign,
          },
        },
      }
    })
    const sectionEntryByElement = new Map(sectionEntries.map((entry) => [entry.element, entry]))
    for (const entry of sectionEntries) {
      let parent = entry.element.parentElement
      while (parent) {
        const parentEntry = sectionEntryByElement.get(parent)
        if (parentEntry) {
          entry.snapshot.parentKey = parentEntry.key
          break
        }
        parent = parent.parentElement
      }
    }

    const sectionFor = (element: Element) => {
      return (
        [...sectionEntries].reverse().find((entry) => entry.element === element || entry.element.contains(element)) ||
        sectionEntries[0]
      )
    }

    const stylesForComponent = (element: Element) => {
      const computed = computedFor(element)
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        border: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
        borderRadius: computed.borderRadius,
        boxShadow: computed.boxShadow,
        padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        display: computed.display,
        gap: computed.gap,
      }
    }

    const componentCandidates: Array<{
      element: Element
      type: string
      role?: string
      confidence: number
    }> = []
    const addComponents = (selector: string, type: string, confidence: number) => {
      for (const element of document.querySelectorAll(selector)) {
        if (!isVisible(element) || componentCandidates.some((candidate) => candidate.element === element)) continue
        componentCandidates.push({
          element,
          type,
          role: element.getAttribute('role') || undefined,
          confidence,
        })
      }
    }
    addComponents('button, input[type="button"], input[type="submit"], [role="button"]', 'button', 0.98)
    addComponents('nav, [role="navigation"]', 'navigation', 0.98)
    addComponents(
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select, [role="textbox"], [role="combobox"]',
      'input',
      0.96,
    )
    addComponents('table, [role="table"], [role="grid"]', 'table', 0.96)
    addComponents('dialog, [role="dialog"], [role="alertdialog"]', 'modal', 0.96)
    addComponents('ul, ol, [role="list"]', 'list', 0.9)
    addComponents('article', 'card', 0.78)

    for (const element of document.querySelectorAll('main > * > *, [role="main"] > * > *')) {
      if (!isVisible(element) || componentCandidates.some((candidate) => candidate.element === element)) continue
      const computed = computedFor(element)
      const rect = element.getBoundingClientRect()
      const boundary =
        computed.boxShadow !== 'none' ||
        parseFloat(computed.borderTopWidth || '0') > 0 ||
        parseFloat(computed.borderTopLeftRadius || '0') > 4
      const padding = Math.min(
        parseFloat(computed.paddingTop || '0'),
        parseFloat(computed.paddingRight || '0'),
        parseFloat(computed.paddingBottom || '0'),
        parseFloat(computed.paddingLeft || '0'),
      )
      if (boundary && padding >= 8 && rect.width >= 120 && rect.height >= 64) {
        componentCandidates.push({ element, type: 'card', confidence: 0.68 })
      }
    }

    const components = componentCandidates.slice(0, 250).flatMap((candidate) => {
      const section = sectionFor(candidate.element)
      if (!section) return []
      return [
        {
          key: `${candidate.type}:${locatorFor(candidate.element)}`,
          sectionKey: section.key,
          type: candidate.type,
          role: candidate.role,
          rect: normalizedRect(candidate.element),
          styles: stylesForComponent(candidate.element),
          confidence: candidate.confidence,
        },
      ]
    })

    const layoutCandidates = [
      ...document.querySelectorAll(
        'h1, h2, h3, h4, p, blockquote, button, [role="button"], a[href], img, picture, video, svg, canvas',
      ),
    ].filter(
      (element) =>
        isVisible(element) &&
        !(element.closest('form') && element instanceof HTMLButtonElement && element.getAttribute('type') !== 'button'),
    )
    const maximumTypeSize = layoutCandidates.reduce((maximum, element) => {
      const fontSize = Number.parseFloat(computedFor(element).fontSize || '0')
      return Math.max(maximum, Number.isFinite(fontSize) ? fontSize : 0)
    }, 0)
    const layoutNodes = layoutCandidates.slice(0, 300).flatMap((element) => {
      const section = sectionFor(element)
      if (!section) return []
      const tag = element.tagName
      const role: BrowserLayoutNodeRole = /^H[1-4]$/.test(tag)
        ? 'heading'
        : tag === 'P' || tag === 'BLOCKQUOTE'
          ? 'body'
          : tag === 'A' || tag === 'BUTTON' || element.getAttribute('role') === 'button'
            ? 'action'
            : 'media'
      const textRole: BrowserTextRole | undefined =
        tag === 'H1'
          ? 'display'
          : /^H[2-4]$/.test(tag)
            ? 'heading'
            : tag === 'P' || tag === 'BLOCKQUOTE'
              ? 'body'
              : role === 'action'
                ? 'label'
                : undefined
      const computed = computedFor(element)
      const traits = [`display:${computed.display}`, `position:${computed.position}`, `align:${computed.textAlign}`]
      const rect = element.getBoundingClientRect()
      const fontSize = Number.parseFloat(computed.fontSize || '0')
      if (rect.top < window.innerHeight && rect.bottom > 0) traits.push('salience:above-fold')
      if (maximumTypeSize >= 24 && fontSize >= maximumTypeSize * 0.9) traits.push('salience:max-type')
      if (role === 'action' && rect.top < window.innerHeight) traits.push('salience:primary-action-candidate')
      if ((rect.width * rect.height) / Math.max(1, window.innerWidth * window.innerHeight) >= 0.2) {
        traits.push('salience:large-region')
      }
      if ((element.textContent || '').trim()) {
        const length = (element.textContent || '').replace(/\s+/g, ' ').trim().length
        traits.push(`text-length:${length <= 24 ? 'short' : length <= 120 ? 'medium' : 'long'}`)
      }
      return [
        {
          key: `${role}:${locatorFor(element)}`,
          sectionKey: section.key,
          role,
          rect: normalizedRect(element),
          textRole,
          styles: {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            fontFamily: computed.fontFamily,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
            lineHeight: computed.lineHeight,
            letterSpacing: computed.letterSpacing,
            borderRadius: computed.borderRadius,
          },
          traits,
        },
      ]
    })

    const explicitMediaCandidates = [
      ...document.querySelectorAll('img, picture, video, svg, canvas, [style*="background-image"]'),
    ].filter(isVisible)
    const cssBackgroundCandidates: Element[] = []
    for (const element of document.querySelectorAll('body *')) {
      if (cssBackgroundCandidates.length >= 80) break
      if (
        explicitMediaCandidates.includes(element) ||
        !isVisible(element) ||
        computedFor(element).backgroundImage === 'none'
      ) {
        continue
      }
      const rect = element.getBoundingClientRect()
      if (rect.width >= 32 && rect.height >= 32) cssBackgroundCandidates.push(element)
    }
    const mediaCandidates = [...new Set([...explicitMediaCandidates, ...cssBackgroundCandidates])]
    const mediaLayers = mediaCandidates.slice(0, 150).flatMap((element) => {
      const section = sectionFor(element)
      if (!section) return []
      const computed = computedFor(element)
      const tag = element.tagName
      const kind: BrowserMediaKind =
        tag === 'VIDEO'
          ? 'video'
          : tag === 'SVG'
            ? 'svg'
            : tag === 'CANVAS'
              ? 'canvas'
              : tag === 'IMG' || tag === 'PICTURE'
                ? 'image'
                : 'css-background'
      const rect = element.getBoundingClientRect()
      const areaRatio = (rect.width * rect.height) / Math.max(1, window.innerWidth * window.innerHeight)
      const semanticHint =
        `${element.id} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase()
      const role: BrowserMediaRole =
        rect.width <= 48 && rect.height <= 48
          ? 'icon'
          : kind === 'css-background' && areaRatio >= 0.5
            ? 'ambient'
            : /(?:product|device|mockup|screenshot|dashboard|preview)/.test(semanticHint)
              ? 'product'
              : areaRatio >= 0.5
                ? 'narrative'
                : computed.position === 'absolute' || computed.position === 'fixed'
                  ? 'decorative'
                  : 'unknown'
      return [
        {
          key: `${kind}:${locatorFor(element)}`,
          sectionKey: section.key,
          kind,
          role,
          rect: normalizedRect(element),
          zIndex: computed.zIndex,
          objectFit: computed.objectFit,
          objectPosition: computed.objectPosition,
          opacity: computed.opacity,
          filter: computed.filter,
          blendMode: computed.mixBlendMode,
        },
      ]
    })

    const interactionElements = [
      ...document.querySelectorAll(
        '[role="tab"]:not(a), button[type="button"][aria-expanded][aria-controls], button:not([type])[aria-expanded][aria-controls], button[type="button"][aria-haspopup="dialog"][aria-controls]',
      ),
    ].filter((element) => isVisible(element) && !element.closest('form'))
    const interactionCandidates = interactionElements.slice(0, 24).flatMap((element) => {
      const section = sectionFor(element)
      if (!section) return []
      const role = element.getAttribute('role')
      const kind =
        role === 'tab'
          ? ('tab' as const)
          : element.getAttribute('aria-haspopup') === 'dialog'
            ? ('dialog' as const)
            : ('disclosure' as const)
      const activeTab =
        kind === 'tab'
          ? [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].find(
              (candidate) => candidate !== element && isVisible(candidate),
            )
          : undefined
      const component = componentCandidates.find((candidate) => candidate.element === element)
      return [
        {
          key: `${kind}:${locatorFor(element)}`,
          sectionKey: section.key,
          locator: locatorFor(element),
          restoreLocator: activeTab ? locatorFor(activeTab) : undefined,
          componentKey: component ? `${component.type}:${locatorFor(element)}` : undefined,
          kind,
          driver: 'click' as const,
        },
      ]
    })

    const ariaStateAttributes = ['aria-expanded', 'aria-selected', 'aria-checked'] as const
    const ariaStates = [...document.querySelectorAll('[aria-expanded], [aria-selected], [aria-checked]')]
      .filter((element) => isVisible(element))
      .slice(0, 40)
      .flatMap((element) => {
        const section = sectionFor(element)
        if (!section) return []
        const attribute = ariaStateAttributes.find((name) => element.hasAttribute(name))
        if (!attribute) return []
        return [
          {
            key: `${attribute}:${locatorFor(element)}`,
            sectionKey: section.key,
            attribute,
            value: element.getAttribute(attribute) || '',
          },
        ]
      })

    return {
      url: location.href,
      viewport: viewportName,
      language: document.documentElement.lang || undefined,
      role: pageRole(),
      width,
      height,
      sections: sectionEntries.map((entry) => entry.snapshot),
      components,
      layoutNodes,
      mediaLayers,
      interactionCandidates,
      ariaStates,
    }
  }, viewport)
}
