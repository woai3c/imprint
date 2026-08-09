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
  importance: 'major' | 'supporting' | 'icon'
  rect: NormalizedRect
  zIndex?: string
  objectFit?: string
  objectPosition?: string
  opacity?: string
  filter?: string
  blendMode?: string
  naturalSize?: { width: number; height: number }
  hasResponsiveSources?: boolean
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
  viewportWidth: number
  viewportHeight: number
  width: number
  height: number
  horizontalOverflow: boolean
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
      | 'header'
      | 'navigation'
      | 'hero'
      | 'content'
      | 'feature-group'
      | 'media'
      | 'action'
      | 'aside'
      | 'footer'
      | 'unknown'
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
    type BrowserMediaImportance = 'major' | 'supporting' | 'icon'

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
    const viewportWidth = Math.max(window.innerWidth, 1)
    const viewportHeight = Math.max(window.innerHeight, 1)
    const width = Math.max(documentElement.scrollWidth, body?.scrollWidth || 0, viewportWidth)
    const height = Math.max(documentElement.scrollHeight, body?.scrollHeight || 0, viewportHeight)
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
    const areaOf = (element: Element): number => {
      const rect = element.getBoundingClientRect()
      return rect.width * rect.height
    }
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

    // Pure wrapper chains (single child covering nearly the whole parent) hide the
    // real visual region; evaluate heuristics on the innermost meaningful descendant.
    const pierceSingleChildWrapper = (element: Element): Element => {
      let current = element
      for (let depth = 0; depth < 4; depth += 1) {
        if (!/^(DIV|MAIN|ARTICLE|SECTION)$/.test(current.tagName)) return current
        const visibleChildren = [...current.children].filter(isVisible)
        if (visibleChildren.length !== 1) return current
        const child = visibleChildren[0]
        if (!/^(DIV|ARTICLE|SECTION)$/.test(child.tagName)) return current
        if (areaOf(child) < areaOf(current) * 0.85) return current
        current = child
      }
      return current
    }

    const roleForSection = (element: Element): BrowserSectionRole => {
      const tag = element.tagName
      const ariaRole = element.getAttribute('role')
      if (tag === 'HEADER' || ariaRole === 'banner') return 'header'
      if (tag === 'NAV' || ariaRole === 'navigation') return 'navigation'
      if (tag === 'FOOTER' || ariaRole === 'contentinfo') return 'footer'
      if (tag === 'ASIDE' || ariaRole === 'complementary') return 'aside'

      const target = pierceSingleChildWrapper(element)
      const rect = target.getBoundingClientRect()
      const hasHeadingOne = Boolean(target.querySelector('h1'))
      if (hasHeadingOne && rect.top + window.scrollY < window.innerHeight * 1.5) return 'hero'

      const media = target.querySelector('img, picture, video, svg, canvas')
      if (media) {
        const mediaRect = media.getBoundingClientRect()
        if (mediaRect.width * mediaRect.height >= rect.width * rect.height * 0.45) return 'media'
      }

      const visibleChildren = [...target.children].filter(isVisible)
      if (visibleChildren.length >= 3) {
        const signatures = visibleChildren.map((child) => `${child.tagName}:${child.className}`)
        const repeated = signatures.some((signature) => signatures.filter((value) => value === signature).length >= 2)
        if (repeated) return 'feature-group'
      }

      const textLength = (target.textContent || '').replace(/\s+/g, ' ').trim().length
      const linkTextLength = [...target.querySelectorAll('a[href]')].reduce(
        (sum, link) => sum + (link.textContent || '').replace(/\s+/g, ' ').trim().length,
        0,
      )
      if (textLength > 0 && linkTextLength >= textLength * 0.6) return 'navigation'

      const actionCount = target.querySelectorAll('button, [role="button"], a[href]').length
      const areaRatio = (rect.width * rect.height) / viewportArea
      if (actionCount > 0 && textLength > 0 && textLength <= 480 && areaRatio <= 0.35) return 'action'
      return tag === 'MAIN' || tag === 'ARTICLE' || tag === 'SECTION' ? 'content' : 'unknown'
    }

    const pageRole = (): 'landing' | 'content' | 'product' | 'pricing' | 'account' | 'workspace' | 'unknown' => {
      const path = location.pathname.toLowerCase()
      if (/\/(pricing|plans|billing)(\/|$)/.test(path)) return 'pricing'
      if (/\/(workspace|editor|studio|console)(\/|$)/.test(path)) return 'workspace'
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

    // Strong semantic baseline: landmarks at any depth (modern app shells nest them
    // inside several wrapper divs). Card-level headers/footers inside articles or
    // list items are not page sections.
    const semanticSectionCandidates = [
      ...document.querySelectorAll(
        'header, nav, main, footer, aside, main > section, main > article, [role="banner"], [role="main"], [role="navigation"], [role="contentinfo"], [role="complementary"], [role="region"]',
      ),
    ].filter((element) => {
      if (!isVisible(element)) return false
      const tag = element.tagName
      if ((tag === 'HEADER' || tag === 'FOOTER') && element.parentElement?.closest('article, li')) return false
      return true
    })
    const landmarkSet = new Set<Element>(semanticSectionCandidates)

    // Deterministic visual segmentation: modern app shells bury the real feed/content
    // under layers of wrappers, so score deep containers and keep the ones that form
    // genuine visual regions.
    const regionScore = (element: Element): number => {
      const visibleChildren = [...element.children].filter(isVisible)
      if (visibleChildren.length < 2) return 0
      const area = areaOf(element)
      const textLength = (element.textContent || '').replace(/\s+/g, ' ').trim().length
      const mediaCount = element.querySelectorAll('img, picture, video, canvas').length
      const actionCount = element.querySelectorAll('button, [role="button"], a[href]').length
      const frequencies = new Map<string, number>()
      for (const child of visibleChildren) {
        const signature = `${child.tagName}:${typeof child.className === 'string' ? child.className : ''}`
        frequencies.set(signature, (frequencies.get(signature) || 0) + 1)
      }
      const maxRepeat = Math.max(0, ...frequencies.values())
      let score = 0
      if (area >= viewportArea * 0.3) score += 2
      else if (area >= viewportArea * 0.08) score += 1
      if (maxRepeat >= 3) score += 2
      else if (maxRepeat >= 2) score += 1
      if (textLength >= 600) score += 1
      if (mediaCount >= 2) score += 1
      if (actionCount >= 3) score += 1
      return score
    }
    const mainRoots = semanticSectionCandidates.filter(
      (element) => element.tagName === 'MAIN' || element.getAttribute('role') === 'main',
    )
    const searchRoots = mainRoots.length > 0 ? mainRoots : ([document.body].filter(Boolean) as Element[])
    const discoveredRegions: Element[] = []
    for (const root of searchRoots) {
      for (const element of [...root.querySelectorAll('div, section, article, ul, ol')].slice(0, 400)) {
        if (!isVisible(element)) continue
        if (
          element.closest(
            'header, footer, nav, aside, [role="banner"], [role="contentinfo"], [role="navigation"], [role="complementary"]',
          )
        ) {
          continue
        }
        if (areaOf(element) < viewportArea * 0.04) continue
        if (regionScore(element) >= 4) discoveredRegions.push(element)
      }
    }

    const combinedCandidates = [...new Set([...semanticSectionCandidates, ...discoveredRegions])].filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width >= 32 && rect.height >= 32
    })
    // Containment suppression: layered wrappers around the same visual region must
    // not produce several nested sections. Landmarks win over anonymous wrappers.
    const suppressed = new Set<Element>()
    for (const ancestor of combinedCandidates) {
      for (const descendant of combinedCandidates) {
        if (ancestor === descendant || !ancestor.contains(descendant)) continue
        const ancestorArea = areaOf(ancestor)
        const descendantArea = areaOf(descendant)
        if (descendantArea >= ancestorArea * 0.85) {
          if (landmarkSet.has(ancestor) && !landmarkSet.has(descendant)) suppressed.add(descendant)
          else suppressed.add(ancestor)
          continue
        }
        if (!landmarkSet.has(ancestor) && landmarkSet.has(descendant) && descendantArea >= ancestorArea * 0.5) {
          suppressed.add(ancestor)
        }
      }
    }
    const sectionCandidates = combinedCandidates.filter((element) => !suppressed.has(element))
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

    const MAX_MEDIA_LAYERS = 150
    const MAX_ICON_MEDIA = 48
    const MAX_ICON_MEDIA_PER_SECTION = 12

    const explicitMediaCandidates = [
      ...document.querySelectorAll('img, picture, video, svg, canvas, [style*="background-image"]'),
    ].filter((element) => {
      if (!isVisible(element)) return false
      // A picture element is represented by its inner img; counting both double-counts it.
      if (element.tagName === 'PICTURE' && element.querySelector('img')) return false
      return true
    })
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

    const kindForMedia = (element: Element): BrowserMediaKind => {
      // SVG elements keep their lowercase tagName; normalize before comparing.
      const tag = element.tagName.toUpperCase()
      return tag === 'VIDEO'
        ? 'video'
        : tag === 'SVG'
          ? 'svg'
          : tag === 'CANVAS'
            ? 'canvas'
            : tag === 'IMG' || tag === 'PICTURE'
              ? 'image'
              : 'css-background'
    }
    const mediaSignatureFor = (element: Element, kind: BrowserMediaKind): string | null => {
      if (kind === 'image') {
        const source = element.getAttribute('src') || element.getAttribute('data-src')
        return source ? `img:${source.slice(0, 160)}` : null
      }
      if (kind === 'svg') {
        const markup = element.innerHTML
        let hash = 0
        for (let index = 0; index < markup.length; index += 1) hash = (hash * 31 + markup.charCodeAt(index)) | 0
        return `svg:${hash}`
      }
      return null
    }
    const importanceForMedia = (element: Element, kind: BrowserMediaKind): BrowserMediaImportance => {
      const rect = element.getBoundingClientRect()
      const areaRatio = (rect.width * rect.height) / viewportArea
      const inChrome = Boolean(element.closest('button, a, nav, header, [role="button"], [role="navigation"]'))
      if ((rect.width <= 64 && rect.height <= 64) || (kind === 'svg' && inChrome)) return 'icon'
      if (areaRatio >= 0.06) return 'major'
      if (kind !== 'svg' && kind !== 'canvas' && !inChrome && areaRatio >= 0.015) return 'major'
      if (areaRatio >= 0.004) return 'supporting'
      return 'icon'
    }

    // Dedupe repeated avatars (same src) and identical SVG shapes, then prioritize
    // major media so DOM order cannot crowd out hero/cover imagery with icons.
    const seenMediaSignatures = new Set<string>()
    const mediaEntries = mediaCandidates.flatMap((element, domIndex) => {
      const kind = kindForMedia(element)
      const signature = mediaSignatureFor(element, kind)
      if (signature) {
        if (seenMediaSignatures.has(signature)) return []
        seenMediaSignatures.add(signature)
      }
      return [{ element, domIndex, kind, importance: importanceForMedia(element, kind), area: areaOf(element) }]
    })
    const importanceRank: Record<BrowserMediaImportance, number> = { major: 0, supporting: 1, icon: 2 }
    mediaEntries.sort(
      (a, b) =>
        importanceRank[a.importance] - importanceRank[b.importance] || b.area - a.area || a.domIndex - b.domIndex,
    )
    let iconCount = 0
    const iconCountBySection = new Map<string, number>()
    const mediaLayers = mediaEntries.slice(0, MAX_MEDIA_LAYERS).flatMap((entry) => {
      const element = entry.element
      const section = sectionFor(element)
      if (!section) return []
      if (entry.importance === 'icon') {
        const sectionIconCount = iconCountBySection.get(section.key) || 0
        if (iconCount >= MAX_ICON_MEDIA || sectionIconCount >= MAX_ICON_MEDIA_PER_SECTION) return []
        iconCount += 1
        iconCountBySection.set(section.key, sectionIconCount + 1)
      }
      const computed = computedFor(element)
      const tag = element.tagName.toUpperCase()
      const kind = entry.kind
      const rect = element.getBoundingClientRect()
      const areaRatio = (rect.width * rect.height) / viewportArea
      const semanticHint =
        `${element.id} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase()
      const role: BrowserMediaRole =
        entry.importance === 'icon'
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
      const imageElement = tag === 'IMG' ? (element as HTMLImageElement) : null
      const sourceElement = tag === 'PICTURE' ? element.querySelector('img') : null
      const responsiveImage = imageElement || sourceElement
      const hasResponsiveSources = Boolean(
        responsiveImage &&
        (responsiveImage.srcset ||
          responsiveImage.sizes ||
          (tag === 'PICTURE' && element.querySelectorAll('source').length > 0)),
      )
      const naturalSize =
        responsiveImage && responsiveImage.naturalWidth > 0
          ? { width: responsiveImage.naturalWidth, height: responsiveImage.naturalHeight }
          : undefined
      return [
        {
          key: `${kind}:${locatorFor(element)}`,
          sectionKey: section.key,
          kind,
          role,
          importance: entry.importance,
          rect: normalizedRect(element),
          zIndex: computed.zIndex,
          objectFit: computed.objectFit,
          objectPosition: computed.objectPosition,
          opacity: computed.opacity,
          filter: computed.filter,
          blendMode: computed.mixBlendMode,
          naturalSize,
          hasResponsiveSources,
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
      viewportWidth,
      viewportHeight,
      width,
      height,
      horizontalOverflow: width > viewportWidth + 4,
      sections: sectionEntries.map((entry) => entry.snapshot),
      components,
      layoutNodes,
      mediaLayers,
      interactionCandidates,
      ariaStates,
    }
  }, viewport)
}
