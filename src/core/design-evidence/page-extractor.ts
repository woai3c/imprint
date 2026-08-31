import type { Page } from 'playwright-core'

import { resetPageScroll } from '../analyzer/page-preparer.js'
import { ROLE_CANDIDATE_RULES } from '../analyzer/role-candidates.js'
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
  elementKind?: 'button' | 'anchor' | 'input' | 'role-button' | 'status'
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

export interface PagePseudoElementSnapshot {
  key: string
  sectionKey: string
  target: string
  kind: 'before' | 'after' | 'first-letter'
  styles: Record<string, string>
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

export interface PageHorizontalOverflowSource {
  locator: string
  overflowPx: number
  width: number
  position: string
  sectionKey?: string
  sectionRole?: SectionRole
}

export interface PageEvidenceSnapshot {
  url: string
  viewport: string
  language?: string
  applicationName?: string
  openGraphSiteName?: string
  title?: string
  role: PageRole
  viewportWidth: number
  viewportHeight: number
  width: number
  height: number
  contentWidth: number
  horizontalOverflow: boolean
  horizontalOverflowSources: PageHorizontalOverflowSource[]
  sections: PageSectionSnapshot[]
  components: PageComponentSnapshot[]
  layoutNodes: PageLayoutNodeSnapshot[]
  pseudoElements?: PagePseudoElementSnapshot[]
  mediaLayers: PageMediaLayerSnapshot[]
  interactionCandidates: PageInteractionCandidateSnapshot[]
  ariaStates: PageAriaStateSnapshot[]
}

export async function extractPageEvidence(page: Page, viewport: string): Promise<PageEvidenceSnapshot> {
  await resetPageScroll(page)
  const evaluationArgs = { viewportName: viewport, candidateRules: ROLE_CANDIDATE_RULES }
  return page.evaluate((args) => {
    const { viewportName, candidateRules } = args
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
    const viewportWidth = Math.max(window.visualViewport?.width || window.innerWidth, 1)
    const viewportHeight = Math.max(window.visualViewport?.height || window.innerHeight, 1)
    const documentStyle = computedFor(body)
    const horizontalScrollableSide = ['vertical-rl', 'sideways-rl'].includes(documentStyle.writingMode)
      ? 'left'
      : ['vertical-lr', 'sideways-lr'].includes(documentStyle.writingMode)
        ? 'right'
        : documentStyle.direction === 'rtl'
          ? 'left'
          : 'right'
    // Finalized from visible page-level overflow candidates below. Raw scrollWidth can be
    // inflated by off-screen fixed helpers or the contents of intentional scrollers.
    let width = viewportWidth
    const height = Math.max(documentElement.scrollHeight, body?.scrollHeight || 0, viewportHeight)
    const viewportArea = Math.max(1, viewportWidth * viewportHeight)
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

    const pageRole = (): PageRole => {
      const path = location.pathname.toLowerCase()
      if (/\/(pricing|plans|billing)(\/|$)/.test(path)) return 'pricing'
      if (/\/(workspace|editor|studio|console|creator)(\/|$)/.test(path)) return 'workspace'
      if (/\/(profile)(\/|$)/.test(path)) return 'profile'
      if (/\/(account|settings|dashboard)(\/|$)/.test(path)) return 'account'
      if (/\/(product|products|features)(\/|$)/.test(path)) return 'product'
      if (/\/(article|blog|docs|guide|about|explore|discover)(\/|$)/.test(path)) return 'content'
      if (
        document.querySelector(
          'main [itemscope][itemtype="https://schema.org/Person"], main [itemscope][itemtype="http://schema.org/Person"], main [itemprop~="additionalName"]',
        )
      ) {
        return 'profile'
      }
      const article = document.querySelector('article')
      if (article && (article.textContent || '').replace(/\s+/g, ' ').trim().length >= 500) return 'content'
      const main = document.querySelector('main, [role="main"]')
      if (main && !main.querySelector('h1') && (main.textContent || '').replace(/\s+/g, ' ').trim().length >= 500) {
        return 'content'
      }
      const hasApplicationControls = Boolean(
        document.querySelector('[role="tablist"], .toolbar, [class*="workspace" i], [data-testid*="workspace" i]'),
      )
      if (
        hasApplicationControls &&
        document.querySelector('table, [role="grid"], [role="treegrid"]') &&
        document.querySelector('header, nav, [role="navigation"]')
      ) {
        return 'workspace'
      }
      if (document.querySelector('h1') && document.querySelectorAll('main > section, main section').length >= 2) {
        return 'landing'
      }
      // A root path is not necessarily a marketing landing page (signed-in feeds commonly use `/`).
      // Keep it unknown unless the DOM provides positive landing/content evidence.
      return 'unknown'
    }

    const locatorFor = (element: Element): string => {
      if (element === document.body) return 'body'
      const parts: string[] = []
      let current: Element | null = element
      // Keep the complete ancestry. Truncating deep paths made repeated card/list
      // subtrees share the same key, so distinct evidence instances received the
      // same stable ID and citations could resolve to multiple components.
      while (current && current !== document.body) {
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

    // scrollWidth alone treats the contents of an intentional horizontal scroller as
    // page-level overflow. Attribute overflow only to visible elements that escape the
    // viewport without a clipping/scrolling ancestor so responsive conclusions are not
    // polluted by carousels, code blocks, or wide virtualized rows.
    const isInsideHorizontalContainer = (element: Element): boolean => {
      let ancestor = element.parentElement
      while (ancestor && ancestor !== body && ancestor !== documentElement) {
        const style = computedFor(ancestor)
        if (
          ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) &&
          (['hidden', 'clip'].includes(style.overflowX) || ancestor.scrollWidth > ancestor.clientWidth + 4)
        ) {
          return true
        }
        ancestor = ancestor.parentElement
      }
      return false
    }
    const fixedLayerCache = new WeakMap<Element, boolean>()
    fixedLayerCache.set(documentElement, computedFor(documentElement).position === 'fixed')
    const isInsideFixedLayer = (element: Element): boolean => {
      const fixed =
        computedFor(element).position === 'fixed' ||
        Boolean(element.parentElement && fixedLayerCache.get(element.parentElement))
      fixedLayerCache.set(element, fixed)
      return fixed
    }
    const overflowCandidates = ([body, ...[...body.querySelectorAll('*')].slice(0, 5_000)] as Element[])
      .filter((element) => !isInsideFixedLayer(element) && isVisible(element) && !isInsideHorizontalContainer(element))
      .flatMap((element) => {
        const rect = element.getBoundingClientRect()
        const style = computedFor(element)
        // Screen-reader helpers are commonly rendered as a 1px clipped box far outside
        // the viewport. They do not create meaningful visual or scrollable overflow.
        const isClippedOffscreenHelper =
          rect.width <= 2 &&
          rect.height <= 2 &&
          style.position === 'absolute' &&
          (horizontalScrollableSide === 'left' ? rect.left >= viewportWidth : rect.right <= 0) &&
          ['hidden', 'clip'].includes(style.overflowX) &&
          ['hidden', 'clip'].includes(style.overflowY)
        if (isClippedOffscreenHelper) return []
        const leftOverflow = Math.max(0, -rect.left)
        const rightOverflow = Math.max(0, rect.right - viewportWidth)
        const overflowPx = leftOverflow + rightOverflow
        if (overflowPx <= 4) return []
        return [{ element, rect, overflowPx }]
      })
      .sort(
        (first, second) =>
          Number(first.element === body) - Number(second.element === body) || second.overflowPx - first.overflowPx,
      )
    const sourceCandidates: typeof overflowCandidates = []
    for (const candidate of overflowCandidates) {
      if (
        sourceCandidates.some(
          (selected) => selected.element.contains(candidate.element) || candidate.element.contains(selected.element),
        )
      ) {
        continue
      }
      sourceCandidates.push(candidate)
      if (sourceCandidates.length >= 3) break
    }
    const contentWidth = Math.ceil(
      Math.max(viewportWidth, ...overflowCandidates.flatMap(({ rect }) => [rect.right, viewportWidth - rect.left])),
    )
    width = contentWidth
    const horizontalOverflow = sourceCandidates.length > 0 && contentWidth > viewportWidth + 4

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
      const role = element.getAttribute('role')
      const pageEdgeLandmark = tag === 'HEADER' || tag === 'FOOTER' || role === 'banner' || role === 'contentinfo'
      const containingLandmark = element.parentElement?.closest(
        'article, li, main, section, aside, nav, header, footer, [role="main"], [role="region"], [role="complementary"], [role="navigation"], [role="banner"], [role="contentinfo"]',
      )
      if (pageEdgeLandmark && containingLandmark) return false
      const repeatedLandmarkSelector =
        tag === 'NAV' || role === 'navigation'
          ? 'nav, [role="navigation"]'
          : tag === 'ASIDE' || role === 'complementary'
            ? 'aside, [role="complementary"]'
            : tag === 'MAIN' || role === 'main'
              ? 'main, [role="main"]'
              : null
      if (repeatedLandmarkSelector && element.parentElement?.closest(repeatedLandmarkSelector)) return false
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
      const childGrid = [...element.querySelectorAll(':scope > *, :scope > * > *')].find(
        (child) => isVisible(child) && computedFor(child).display === 'grid' && child.children.length >= 2,
      )
      const childGridComputed = childGrid ? computedFor(childGrid) : undefined
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
            backgroundImage: computed.backgroundImage,
            color: computed.color,
            borderTopLeftRadius: computed.borderTopLeftRadius,
            borderTopRightRadius: computed.borderTopRightRadius,
            borderBottomRightRadius: computed.borderBottomRightRadius,
            borderBottomLeftRadius: computed.borderBottomLeftRadius,
            display: computed.display,
            position: computed.position,
            top: computed.top,
            height: computed.height,
            maxWidth: computed.maxWidth,
            paddingTop: computed.paddingTop,
            paddingRight: computed.paddingRight,
            paddingBottom: computed.paddingBottom,
            paddingLeft: computed.paddingLeft,
            gap: computed.gap,
            gridTemplateColumns: computed.gridTemplateColumns,
            childGridTemplateColumns: childGridComputed?.gridTemplateColumns || '',
            borderTop: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
            borderRight: `${computed.borderRightWidth} ${computed.borderRightStyle} ${computed.borderRightColor}`,
            borderBottom: `${computed.borderBottomWidth} ${computed.borderBottomStyle} ${computed.borderBottomColor}`,
            borderLeft: `${computed.borderLeftWidth} ${computed.borderLeftStyle} ${computed.borderLeftColor}`,
            boxShadow: computed.boxShadow,
            overflowX: computed.overflowX,
            overflowY: computed.overflowY,
            scrollSnapType: computed.scrollSnapType,
            scrollSnapAlign: computed.scrollSnapAlign,
          },
        },
      }
    })
    // Nested section candidates can all contain the same h1 and would otherwise become
    // duplicate heroes. Keep the most specific visual region for each heading and retain
    // its ancestors as ordinary content evidence.
    const heroEntryByHeading = new Map<Element, (typeof sectionEntries)[number]>()
    for (const entry of sectionEntries) {
      if (entry.snapshot.role !== 'hero') continue
      const heading = entry.element.querySelector('h1')
      if (!heading) continue
      const existing = heroEntryByHeading.get(heading)
      if (!existing) {
        heroEntryByHeading.set(heading, entry)
        continue
      }
      if (areaOf(entry.element) < areaOf(existing.element)) {
        existing.snapshot.role = 'content'
        heroEntryByHeading.set(heading, entry)
      } else {
        entry.snapshot.role = 'content'
      }
    }
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

    const horizontalOverflowSources: PageHorizontalOverflowSource[] = sourceCandidates.map(
      ({ element, rect, overflowPx }) => {
        const section = sectionEntries
          .filter((entry) => entry.element === element || entry.element.contains(element))
          .sort((first, second) => areaOf(first.element) - areaOf(second.element))[0]
        return {
          locator: locatorFor(element),
          overflowPx: Math.round(overflowPx),
          width: Math.round(rect.width),
          position: computedFor(element).position,
          ...(section ? { sectionKey: section.key, sectionRole: section.snapshot.role } : {}),
        }
      },
    )

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

    const visualInputRoot = (source: Element): Element => {
      const sourceRect = source.getBoundingClientRect()
      const sourceStyle = computedFor(source)
      const transparent = (color: string) =>
        color === 'transparent' || /^rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?\s*\)$/i.test(color.trim())
      let ancestor = source.parentElement
      for (let depth = 0; ancestor && depth < 3; depth += 1, ancestor = ancestor.parentElement) {
        if (!isVisible(ancestor)) continue
        const rect = ancestor.getBoundingClientRect()
        const computed = computedFor(ancestor)
        const reasonableBounds =
          rect.width >= sourceRect.width &&
          rect.height >= sourceRect.height &&
          rect.width <= Math.max(sourceRect.width * 1.8, sourceRect.width + 160) &&
          rect.height <= Math.max(sourceRect.height * 3, 72)
        const paintedBorder =
          Number.parseFloat(computed.borderTopWidth || '0') > 0 && !['none', 'hidden'].includes(computed.borderTopStyle)
        const rounded = Number.parseFloat(computed.borderTopLeftRadius || '0') > 0
        const shadowed = computed.boxShadow !== 'none'
        const distinctBackground =
          !transparent(computed.backgroundColor) && computed.backgroundColor !== sourceStyle.backgroundColor
        const addsVisibleBounds = rect.width > sourceRect.width + 2 || rect.height > sourceRect.height + 2
        if (reasonableBounds && addsVisibleBounds && (paintedBorder || rounded || shadowed || distinctBackground)) {
          return ancestor
        }
      }
      return source
    }

    const actionTokenPattern = new RegExp(candidateRules.actionTokenPattern, 'i')
    const primaryActionPattern = new RegExp(candidateRules.primaryActionPattern, 'i')
    const destructiveActionPattern = new RegExp(candidateRules.destructiveActionPattern, 'i')
    const directStatusPattern = new RegExp(candidateRules.directStatusPattern, 'i')
    const statusSubjectPattern = new RegExp(candidateRules.statusSubjectPattern, 'i')
    const statusDirectionPattern = new RegExp(candidateRules.statusDirectionPattern, 'i')
    const positiveStatusPattern = new RegExp(candidateRules.positiveStatusPattern, 'i')
    const warningStatusPattern = new RegExp(candidateRules.warningStatusPattern, 'i')
    const negativeStatusPattern = new RegExp(candidateRules.negativeStatusPattern, 'i')
    const statusIntentFor = (context: string): 'positive' | 'warning' | 'negative' | 'neutral' => {
      if (positiveStatusPattern.test(context)) return 'positive'
      if (warningStatusPattern.test(context)) return 'warning'
      if (negativeStatusPattern.test(context)) return 'negative'
      return 'neutral'
    }
    const roleCandidateContext = (element: Element): string =>
      [
        typeof element.className === 'string' ? element.className : '',
        element.id,
        element.getAttribute('role'),
        element.getAttribute('data-variant'),
        element.getAttribute('data-intent'),
        element.getAttribute('data-state'),
        element.getAttribute('data-status'),
        element.getAttribute('type'),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    const statusCandidateKind = (element: Element): 'native' | 'heuristic' | null => {
      const role = element.getAttribute('role') || ''
      const ariaLive = element.getAttribute('aria-live')
      if (element.matches(candidateRules.broadActionSelector)) return null
      const nativeStatus = ['status', 'alert'].includes(role) || Boolean(ariaLive && ariaLive !== 'off')
      if (nativeStatus) {
        if (element.parentElement?.closest(candidateRules.nativeStatusSelector)) return null
        return 'native'
      }
      if (
        element.parentElement?.closest(`${candidateRules.broadActionSelector}, ${candidateRules.nativeStatusSelector}`)
      ) {
        return null
      }
      const context = roleCandidateContext(element)
      return directStatusPattern.test(context) ||
        (statusSubjectPattern.test(context) && statusDirectionPattern.test(context))
        ? 'heuristic'
        : null
    }
    const isStyledActionAnchor = (element: Element): boolean => {
      if (element.tagName !== 'A' || !element.hasAttribute('href')) return false
      const context = roleCandidateContext(element)
      if (!actionTokenPattern.test(context)) return false
      const computed = computedFor(element)
      const rect = element.getBoundingClientRect()
      const background = computed.backgroundColor.trim().toLowerCase()
      const paintedFill = background !== 'transparent' && !/^rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?\s*\)$/i.test(background)
      const paintedBorder = [
        [computed.borderTopWidth, computed.borderTopStyle],
        [computed.borderRightWidth, computed.borderRightStyle],
        [computed.borderBottomWidth, computed.borderBottomStyle],
        [computed.borderLeftWidth, computed.borderLeftStyle],
      ].some(([width, style]) => Number.parseFloat(width) > 0 && !['none', 'hidden'].includes(style))
      const controlGeometry =
        rect.width >= 44 &&
        rect.height >= 28 &&
        (Number.parseFloat(computed.paddingLeft) + Number.parseFloat(computed.paddingRight) >= 16 ||
          Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom) >= 12)
      return paintedFill || paintedBorder || controlGeometry
    }

    const componentCandidates: Array<{
      element: Element
      type: string
      role?: string
      elementKind?: 'button' | 'anchor' | 'input' | 'role-button' | 'status'
      confidence: number
    }> = []
    const addComponents = (
      selector: string,
      type: string,
      confidence: number,
      elementKind?: 'button' | 'anchor' | 'input' | 'role-button' | 'status',
    ) => {
      for (const element of document.querySelectorAll(selector)) {
        if (!isVisible(element) || componentCandidates.some((candidate) => candidate.element === element)) continue
        componentCandidates.push({
          element,
          type,
          role: element.getAttribute('role') || undefined,
          elementKind,
          confidence,
        })
      }
    }
    const statusCandidateKinds = new Map<Element, 'native' | 'heuristic'>()
    for (const element of document.querySelectorAll('body *')) {
      if (!isVisible(element)) continue
      const kind = statusCandidateKind(element)
      if (kind) statusCandidateKinds.set(element, kind)
    }
    const statusCandidates = [...statusCandidateKinds.keys()]
    const statusCandidateSet = new Set(statusCandidates)
    const candidatesWithNativeDescendants = new Set<Element>()
    for (const [element, kind] of statusCandidateKinds) {
      let ancestor = element.parentElement
      while (ancestor) {
        if (statusCandidateSet.has(ancestor)) {
          if (kind === 'native') candidatesWithNativeDescendants.add(ancestor)
        }
        ancestor = ancestor.parentElement
      }
    }
    const hasStrongStatusVisualBoundary = (element: Element): boolean => {
      const computed = computedFor(element)
      const background = computed.backgroundColor.trim().toLowerCase()
      const paintedFill = background !== 'transparent' && !/^rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?\s*\)$/i.test(background)
      const paintedBorder = [
        [computed.borderTopWidth, computed.borderTopStyle],
        [computed.borderRightWidth, computed.borderRightStyle],
        [computed.borderBottomWidth, computed.borderBottomStyle],
        [computed.borderLeftWidth, computed.borderLeftStyle],
      ].some(([width, style]) => Number.parseFloat(width) > 0 && !['none', 'hidden'].includes(style))
      return paintedFill || paintedBorder
    }
    const hasStatusEvidenceGeometry = (element: Element): boolean => {
      const rect = element.getBoundingClientRect()
      const computed = computedFor(element)
      return (
        rect.width >= 4 &&
        rect.height >= 4 &&
        (computed.clip === 'auto' || computed.clip === '') &&
        (computed.clipPath === 'none' || computed.clipPath === '')
      )
    }
    const stronglyBoundedCandidates = new Set(statusCandidates.filter(hasStrongStatusVisualBoundary))
    const independentStrongDescendantCounts = new Map<Element, number>()
    for (const element of stronglyBoundedCandidates) {
      let ancestor = element.parentElement
      while (ancestor) {
        if (statusCandidateSet.has(ancestor)) {
          independentStrongDescendantCounts.set(ancestor, (independentStrongDescendantCounts.get(ancestor) || 0) + 1)
          if (stronglyBoundedCandidates.has(ancestor)) break
        }
        ancestor = ancestor.parentElement
      }
    }
    const preferredStatusCandidates = new Set(
      statusCandidates.filter((element) => {
        if (!hasStatusEvidenceGeometry(element)) return false
        if (statusCandidateKinds.get(element) === 'native') return true
        if (candidatesWithNativeDescendants.has(element)) return false
        return stronglyBoundedCandidates.has(element) || (independentStrongDescendantCounts.get(element) || 0) < 2
      }),
    )
    const statusRoots = statusCandidates.filter((element) => {
      if (!preferredStatusCandidates.has(element)) return false
      let ancestor = element.parentElement
      while (ancestor) {
        if (preferredStatusCandidates.has(ancestor)) return false
        ancestor = ancestor.parentElement
      }
      return true
    })
    for (const element of statusRoots) {
      const context = roleCandidateContext(element)
      const kind = statusSubjectPattern.test(context) && statusDirectionPattern.test(context) ? 'delta' : 'status'
      componentCandidates.push({
        element,
        type: 'status',
        role: `${kind}-${statusIntentFor(context)}`,
        elementKind: 'status',
        confidence: 0.94,
      })
    }
    addComponents('[role="tab"]', 'tab', 0.98, 'button')
    for (const element of document.querySelectorAll(candidateRules.nativeActionSelector)) {
      if (
        !isVisible(element) ||
        statusCandidateSet.has(element) ||
        componentCandidates.some((candidate) => candidate.element === element)
      ) {
        continue
      }
      const tagName = element.tagName.toLowerCase()
      componentCandidates.push({
        element,
        type: 'button',
        role: primaryActionPattern.test(roleCandidateContext(element))
          ? 'primary-action'
          : destructiveActionPattern.test(roleCandidateContext(element))
            ? 'destructive-action'
            : 'action',
        elementKind:
          tagName === 'input'
            ? 'input'
            : element.getAttribute('role') === 'button' && tagName !== 'button'
              ? 'role-button'
              : 'button',
        confidence: 0.98,
      })
    }
    for (const element of document.querySelectorAll('a[href]')) {
      if (
        !isVisible(element) ||
        statusCandidateSet.has(element) ||
        !isStyledActionAnchor(element) ||
        componentCandidates.some((candidate) => candidate.element === element)
      ) {
        continue
      }
      componentCandidates.push({
        element,
        type: 'button',
        role: primaryActionPattern.test(roleCandidateContext(element))
          ? 'primary-action'
          : destructiveActionPattern.test(roleCandidateContext(element))
            ? 'destructive-action'
            : 'action',
        elementKind: 'anchor',
        confidence: 0.9,
      })
    }
    addComponents('nav, [role="navigation"]', 'navigation', 0.98)
    for (const source of document.querySelectorAll(
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select, [role="textbox"], [role="combobox"]',
    )) {
      if (!isVisible(source)) continue
      const element = visualInputRoot(source)
      if (componentCandidates.some((candidate) => candidate.element === element && candidate.type === 'input')) continue
      componentCandidates.push({
        element,
        type: 'input',
        role: source.getAttribute('role') || undefined,
        elementKind: 'input',
        confidence: 0.96,
      })
    }
    addComponents('table, [role="table"], [role="grid"]', 'table', 0.96)
    addComponents('dialog, [role="dialog"], [role="alertdialog"]', 'modal', 0.96)
    addComponents('ul, ol, [role="list"]', 'list', 0.9)
    const existingComponentElements = new Set(componentCandidates.map((candidate) => candidate.element))
    const deepCardElements = [...new Set(document.querySelectorAll('main *, [role="main"] *'))]
    const deepCardGroups = new Map<Element, Map<string, number>>()
    const excludedCardTags = new Set([
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
    const deepCardCandidates: Array<{
      element: Element
      parent: Element
      signature: string
      baseConfidence: number
    }> = []
    for (const element of deepCardElements) {
      if (
        excludedCardTags.has(element.tagName) ||
        !isVisible(element) ||
        existingComponentElements.has(element) ||
        !element.parentElement
      ) {
        continue
      }
      const computed = computedFor(element)
      const rect = element.getBoundingClientRect()
      const isFullWidthPageSection =
        rect.width >= window.innerWidth * 0.9 &&
        Boolean(element.matches('main > section, main > article, [role="region"]'))
      if (isFullWidthPageSection) continue
      const hasShadow = computed.boxShadow !== 'none'
      const hasBorder =
        Number.parseFloat(computed.borderTopWidth || '0') > 0 && !['none', 'hidden'].includes(computed.borderTopStyle)
      const hasRadius = Number.parseFloat(computed.borderTopLeftRadius || '0') > 4
      const padding = Math.max(
        Number.parseFloat(computed.paddingTop || '0'),
        Number.parseFloat(computed.paddingRight || '0'),
        Number.parseFloat(computed.paddingBottom || '0'),
        Number.parseFloat(computed.paddingLeft || '0'),
      )
      if ((!hasShadow && !hasBorder && !hasRadius) || padding < 8 || rect.width < 120 || rect.height < 64) continue
      if (deepCardCandidates.length >= candidateRules.deepCardScanLimit) break
      const parentBackground = computedFor(element.parentElement).backgroundColor
      const background = computed.backgroundColor.trim().toLowerCase()
      const hasDistinctSurface =
        background !== 'transparent' &&
        !/^rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?\s*\)$/i.test(background) &&
        computed.backgroundColor !== parentBackground
      const hasContent = (element.textContent || '').replace(/\s+/g, ' ').trim().length >= 12
      const hasStructure = element.children.length >= 2
      const hasMediaOrAction = Boolean(
        element.querySelector('img, picture, svg, button, a[href], [role="button"], input, textarea, select'),
      )
      const isLargeLayout = rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.5
      const baseConfidence =
        (hasRadius ? 0.16 : 0) +
        (hasShadow || hasBorder ? 0.22 : 0) +
        0.16 +
        (hasDistinctSurface ? 0.1 : 0) +
        (hasContent ? 0.12 : 0) +
        (hasStructure ? 0.08 : 0) +
        (hasMediaOrAction ? 0.08 : 0) -
        (isLargeLayout ? 0.2 : 0)
      const signature = [
        element.tagName,
        computed.backgroundColor,
        computed.borderRadius,
        computed.borderTopWidth,
      ].join('|')
      const parentGroups = deepCardGroups.get(element.parentElement) || new Map<string, number>()
      parentGroups.set(signature, (parentGroups.get(signature) || 0) + 1)
      deepCardGroups.set(element.parentElement, parentGroups)
      deepCardCandidates.push({ element, parent: element.parentElement, signature, baseConfidence })
    }
    for (const candidate of deepCardCandidates) {
      const repeated = (deepCardGroups.get(candidate.parent)?.get(candidate.signature) || 0) >= 2
      const confidence = candidate.baseConfidence + (repeated ? 0.12 : 0)
      if (confidence < 0.62) continue
      componentCandidates.push({ element: candidate.element, type: 'card', confidence: Math.min(0.94, confidence) })
    }

    const components = componentCandidates.slice(0, 250).flatMap((candidate) => {
      const section = sectionFor(candidate.element)
      if (!section) return []
      return [
        {
          key: `${candidate.type}:${locatorFor(candidate.element)}`,
          sectionKey: section.key,
          type: candidate.type,
          elementKind: candidate.elementKind,
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
            borderTop: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
            borderRight: `${computed.borderRightWidth} ${computed.borderRightStyle} ${computed.borderRightColor}`,
            borderBottom: `${computed.borderBottomWidth} ${computed.borderBottomStyle} ${computed.borderBottomColor}`,
            borderLeft: `${computed.borderLeftWidth} ${computed.borderLeftStyle} ${computed.borderLeftColor}`,
            boxShadow: computed.boxShadow,
          },
          traits,
        },
      ]
    })

    const pseudoElements: PagePseudoElementSnapshot[] = []
    const pseudoCandidates = [...document.querySelectorAll('body *')].filter(isVisible).slice(0, 1_500)
    for (const element of pseudoCandidates) {
      const section = sectionFor(element)
      if (!section || pseudoElements.length >= 80) break
      const base = computedFor(element)
      for (const [kind, selector] of [
        ['before', '::before'],
        ['after', '::after'],
      ] as const) {
        const pseudo = getComputedStyle(element, selector)
        const content = pseudo.content
        const opacity = Number.parseFloat(pseudo.opacity)
        if (
          pseudo.display === 'none' ||
          ['hidden', 'collapse'].includes(pseudo.visibility) ||
          (Number.isFinite(opacity) && opacity <= 0)
        ) {
          continue
        }
        if (!content || ['none', 'normal', '""', "''"].includes(content)) continue
        const unquotedContent = content.replace(/^(['"])([\s\S]*)\1$/, '$2').trim()
        const isTransparentMaterial = (value: string) =>
          /^(?:transparent|rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?%?\s*\)|(?:hsla?|oklch|oklab|lab|lch)\([^)]*\/\s*0(?:\.0+)?%?\s*\))$/i.test(
            value.trim(),
          )
        const shadowColors =
          pseudo.boxShadow.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]+\)|#[\da-f]{3,8}/gi) || []
        const hasVisibleShadow =
          pseudo.boxShadow !== 'none' &&
          (shadowColors.length === 0 || shadowColors.some((color) => !isTransparentMaterial(color)))
        const borders = {
          borderTop: `${pseudo.borderTopWidth} ${pseudo.borderTopStyle} ${pseudo.borderTopColor}`,
          borderRight: `${pseudo.borderRightWidth} ${pseudo.borderRightStyle} ${pseudo.borderRightColor}`,
          borderBottom: `${pseudo.borderBottomWidth} ${pseudo.borderBottomStyle} ${pseudo.borderBottomColor}`,
          borderLeft: `${pseudo.borderLeftWidth} ${pseudo.borderLeftStyle} ${pseudo.borderLeftColor}`,
        }
        const hasVisibleBorder = Object.values(borders).some((border) => {
          const [width, style, ...colorParts] = border.split(/\s+/)
          return (
            Number.parseFloat(width) > 0 &&
            !['none', 'hidden'].includes(style) &&
            !isTransparentMaterial(colorParts.join(' '))
          )
        })
        const hasMaterial = !isTransparentMaterial(pseudo.backgroundColor) || hasVisibleShadow || hasVisibleBorder
        if (!unquotedContent && !hasMaterial) continue
        pseudoElements.push({
          key: `${kind}:${locatorFor(element)}`,
          sectionKey: section.key,
          target: locatorFor(element),
          kind,
          styles: {
            content: content.slice(0, 120),
            color: pseudo.color,
            backgroundColor: pseudo.backgroundColor,
            width: pseudo.width,
            height: pseudo.height,
            borderRadius: pseudo.borderRadius,
            ...borders,
            boxShadow: pseudo.boxShadow,
            transform: pseudo.transform,
          },
        })
      }
      const hasDirectText = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean((node.textContent || '').trim()),
      )
      if (!hasDirectText) continue
      const firstLetter = getComputedStyle(element, '::first-letter')
      const firstLetterStyles = {
        color: firstLetter.color,
        fontFamily: firstLetter.fontFamily,
        fontSize: firstLetter.fontSize,
        fontWeight: firstLetter.fontWeight,
        lineHeight: firstLetter.lineHeight,
        float: firstLetter.cssFloat,
      }
      const normalizedFamily = (value: string) => value.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
      const numericDifference = (first: string, second: string) =>
        Math.abs(Number.parseFloat(first) - Number.parseFloat(second))
      const meaningfulDifference =
        (firstLetter.cssFloat && firstLetter.cssFloat !== 'none' && firstLetter.cssFloat !== base.cssFloat) ||
        firstLetter.color !== base.color ||
        numericDifference(firstLetter.fontSize, base.fontSize) >= 1 ||
        numericDifference(firstLetter.fontWeight, base.fontWeight) >= 100 ||
        normalizedFamily(firstLetter.fontFamily) !== normalizedFamily(base.fontFamily)
      if (meaningfulDifference) {
        pseudoElements.push({
          key: `first-letter:${locatorFor(element)}`,
          sectionKey: section.key,
          target: locatorFor(element),
          kind: 'first-letter',
          styles: firstLetterStyles,
        })
      }
    }

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
      applicationName: document.querySelector<HTMLMetaElement>('meta[name="application-name" i]')?.content || undefined,
      openGraphSiteName:
        document.querySelector<HTMLMetaElement>('meta[property="og:site_name" i]')?.content || undefined,
      title: document.title || undefined,
      role: pageRole(),
      viewportWidth,
      viewportHeight,
      width,
      height,
      contentWidth,
      horizontalOverflow,
      horizontalOverflowSources,
      sections: sectionEntries.map((entry) => entry.snapshot),
      components,
      layoutNodes,
      pseudoElements,
      mediaLayers,
      interactionCandidates,
      ariaStates,
    }
  }, evaluationArgs)
}
