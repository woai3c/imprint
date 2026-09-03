import type { Page } from 'playwright-core'

import type { ComponentStatusBoundary } from '../analyzer/component-detect.js'
import { resetPageScroll } from '../analyzer/page-preparer.js'
import { ROLE_CANDIDATE_RULES } from '../analyzer/role-candidates.js'
import type {
  ComponentTextStyleSource,
  LayoutMode,
  MediaRoleEvidence,
  NormalizedRect,
  PageRole,
  PseudoElementPaintEvidence,
  SectionRole,
} from './types.js'

export interface PageSectionSnapshot {
  key: string
  /** Cross-viewport identity derived only from standard semantics and accessible text. Capture-local locators are unsafe here. */
  identityKey?: string
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
  /** The rendered owner used for foreground and typography instead of assuming the semantic wrapper owns text. */
  textStyleOwner?: 'root' | 'descendant'
  textStyleSource?: ComponentTextStyleSource
  statusBoundary?: ComponentStatusBoundary
  rect: NormalizedRect
  styles: Record<string, string>
  confidence: number
}

export interface PageLayoutNodeSnapshot {
  key: string
  /** Cross-viewport identity derived from the node's semantic role and accessible text. */
  identityKey?: string
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
  /** Observable facts proving that the layout node's typography was visibly painted. */
  textStyleSource?: ComponentTextStyleSource
  styles: Record<string, string>
  traits: string[]
}

export interface PagePseudoElementSnapshot {
  key: string
  sectionKey: string
  target: string
  kind: 'before' | 'after' | 'first-letter'
  styles: Record<string, string>
  paint?: PseudoElementPaintEvidence
}

export interface PageMediaLayerSnapshot {
  key: string
  sectionKey: string
  kind: 'image' | 'video' | 'svg' | 'canvas' | 'css-background'
  role: 'ambient' | 'narrative' | 'product' | 'decorative' | 'icon' | 'unknown'
  roleEvidence?: MediaRoleEvidence
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
    type BrowserMediaRoleEvidence = MediaRoleEvidence
    type BrowserMediaImportance = 'major' | 'supporting' | 'icon'

    const computedCache = new WeakMap<Element, CSSStyleDeclaration>()
    const computedFor = (element: Element): CSSStyleDeclaration => {
      const cached = computedCache.get(element)
      if (cached) return cached
      const computed = getComputedStyle(element)
      computedCache.set(element, computed)
      return computed
    }

    const filterOpacityFor = (value: string): number | undefined => {
      const normalized = value.trim().toLowerCase()
      if (!normalized || normalized === 'none') return 1
      const calls = [...normalized.matchAll(/([a-z-]+)\(([^()]*)\)/g)]
      if (calls.length === 0 || calls.map((match) => match[0]).join(' ') !== normalized.replace(/\s+/g, ' ')) {
        return undefined
      }
      return calls.reduce<number | undefined>((product, match) => {
        if (product === undefined) return undefined
        if (match[1] !== 'opacity') return undefined
        const token = match[2].trim()
        const parsed = Number.parseFloat(token)
        if (!Number.isFinite(parsed) || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(token)) return undefined
        const opacity = token.endsWith('%') ? parsed / 100 : parsed
        return product * Math.max(0, Math.min(1, opacity))
      }, 1)
    }

    const maskValuesFor = (computed: CSSStyleDeclaration): string[] =>
      ['mask-image', '-webkit-mask-image', 'mask-border-source', '-webkit-mask-box-image-source']
        .map((property) => computed.getPropertyValue(property).trim().toLowerCase().replace(/\s+/g, ' '))
        .filter((value, index, values) => Boolean(value && value !== 'none') && values.indexOf(value) === index)
    const hasUnsupportedMask = (computed: CSSStyleDeclaration): boolean => maskValuesFor(computed).length > 0
    const hasContextDependentBlend = (computed: CSSStyleDeclaration): boolean => {
      const value = computed.mixBlendMode.trim().toLowerCase()
      return Boolean(value && value !== 'normal')
    }

    const hasVisiblePaintChain = (element: Element): boolean => {
      let effectiveOpacity = 1
      let effectiveFilterOpacity = 1
      for (let current: Element | null = element; current; current = current.parentElement) {
        const computed = computedFor(current)
        const opacity = Number.parseFloat(computed.opacity || '1')
        const filterOpacity = filterOpacityFor(computed.filter)
        if (
          !Number.isFinite(opacity) ||
          filterOpacity === undefined ||
          hasUnsupportedMask(computed) ||
          hasContextDependentBlend(computed)
        ) {
          return false
        }
        effectiveOpacity *= opacity
        effectiveFilterOpacity *= filterOpacity
        if (effectiveOpacity < 0.999 || effectiveFilterOpacity < 0.999) {
          return false
        }
      }
      return true
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
        const signatures = visibleChildren.map((child) =>
          [
            child.tagName,
            child.getAttribute('role') || '',
            [...child.children].slice(0, 4).map((item) => item.tagName),
          ].join(':'),
        )
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
      if (
        document.querySelector(
          'main [itemscope][itemtype="https://schema.org/Person"], main [itemscope][itemtype="http://schema.org/Person"], main [itemprop~="additionalName"]',
        )
      ) {
        return 'profile'
      }
      if (
        document.querySelector(
          'main [itemscope][itemtype="https://schema.org/Product"], main [itemscope][itemtype="http://schema.org/Product"]',
        )
      ) {
        return 'product'
      }
      const article = document.querySelector('article')
      if (article && (article.textContent || '').replace(/\s+/g, ' ').trim().length >= 500) return 'content'
      const main = document.querySelector('main, [role="main"]')
      if (main && !main.querySelector('h1') && (main.textContent || '').replace(/\s+/g, ' ').trim().length >= 500) {
        return 'content'
      }
      const hasApplicationControls = Boolean(
        document.querySelector('[role="tablist"], [role="toolbar"], [role="menubar"]'),
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

    const normalizedIdentityText = (value: string | null | undefined): string =>
      (value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 512)
    const identityHash = (value: string): string => {
      let hash = 0x811c9dc5
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
      }
      return `${value.length.toString(36)}-${(hash >>> 0).toString(36)}`
    }
    const ariaLabelText = (element: Element): string => {
      const labelledBy = (element.getAttribute('aria-labelledby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
      return normalizedIdentityText(labelledBy || element.getAttribute('aria-label'))
    }
    const sectionIdentityFor = (element: Element, role: BrowserSectionRole): string | undefined => {
      let heading = element.matches('h1, h2, h3, h4, h5, h6, [role="heading"]')
        ? element
        : element.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]')
      if (heading && heading !== element) {
        let owner = heading.parentElement
        while (owner && owner !== element) {
          if (
            owner.matches(
              'header, nav, main, section, article, aside, footer, [role="banner"], [role="navigation"], [role="main"], [role="region"], [role="article"], [role="complementary"], [role="contentinfo"]',
            )
          ) {
            heading = null
            break
          }
          owner = owner.parentElement
        }
      }
      const label = ariaLabelText(element) || normalizedIdentityText(heading?.textContent)
      return label ? `section:${role}:${identityHash(label)}` : undefined
    }
    const nodeIdentityFor = (
      element: Element,
      role: BrowserLayoutNodeRole,
      textRole?: BrowserTextRole,
    ): string | undefined => {
      const nestedImage = element.matches('img') ? element : element.querySelector('img')
      const label =
        ariaLabelText(element) ||
        normalizedIdentityText(nestedImage?.getAttribute('alt')) ||
        normalizedIdentityText(element.textContent)
      return label ? `node:${role}:${textRole || 'none'}:${identityHash(label)}` : undefined
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
        const signature = [
          child.tagName,
          child.getAttribute('role') || '',
          [...child.children]
            .slice(0, 4)
            .map((item) => item.tagName)
            .join(','),
        ].join(':')
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
          identityKey: undefined as string | undefined,
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
    for (const entry of sectionEntries) {
      entry.snapshot.identityKey = sectionIdentityFor(entry.element, entry.snapshot.role)
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

    interface BrowserTextStyleOwner {
      element: Element
      computed: CSSStyleDeclaration
      source: ComponentTextStyleSource
    }

    const paintCanvas = document.createElement('canvas')
    paintCanvas.width = paintCanvas.height = 1
    const paintContext = paintCanvas.getContext('2d', { willReadFrequently: true })
    const normalizedPaintColor = (value: string): string | undefined => {
      const input = value.trim()
      if (!input || input.toLowerCase() === 'transparent' || !paintContext) return undefined
      try {
        paintContext.clearRect(0, 0, 1, 1)
        paintContext.fillStyle = '#010203'
        paintContext.fillStyle = input
        const firstParse = paintContext.fillStyle
        paintContext.fillStyle = '#040506'
        paintContext.fillStyle = input
        if (firstParse !== paintContext.fillStyle) return undefined
        paintContext.fillStyle = firstParse
        paintContext.fillRect(0, 0, 1, 1)
        const [red, green, blue, alphaByte] = paintContext.getImageData(0, 0, 1, 1).data
        if (alphaByte === 0) return undefined
        const alpha = Number((alphaByte / 255).toFixed(3))
        return alpha >= 0.999 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha})`
      } catch {
        return undefined
      }
    }
    const hasVisibleBoxShadow = (value: string): boolean =>
      value !== 'none' &&
      value.split(/,(?![^()]*\))/).some((layer) => {
        const colorPattern = /transparent|#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^)]*\)/gi
        const colors = layer.match(colorPattern) || []
        if (!colors.some((color) => Boolean(normalizedPaintColor(color)))) return false
        const dimensions = layer
          .replace(colorPattern, ' ')
          .replace(/\binset\b/gi, ' ')
          .match(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:[a-z%]+)?/gi)
        return Boolean(
          dimensions &&
          dimensions.length >= 2 &&
          dimensions.slice(0, 4).some((dimension) => Math.abs(Number.parseFloat(dimension)) > 0.01),
        )
      })
    const glyphPaintFor = (
      computed: CSSStyleDeclaration,
    ):
      | { kind: 'solid-color'; foreground: string }
      | { kind: 'background-clip'; backgroundClip: string; backgroundImage: string }
      | undefined => {
      const textFill = computed.getPropertyValue('-webkit-text-fill-color').trim()
      const fill = textFill && textFill.toLowerCase() !== 'currentcolor' ? textFill : computed.color
      const foreground = normalizedPaintColor(fill)
      if (foreground) return { kind: 'solid-color', foreground }
      const backgroundClip = [computed.backgroundClip, computed.getPropertyValue('-webkit-background-clip')]
        .map((value) => value.trim().toLowerCase())
        .find((value) => value.split(/\s*,\s*/).includes('text'))
      const backgroundImage = computed.backgroundImage.trim()
      if (backgroundClip && backgroundImage && backgroundImage !== 'none' && backgroundImage.length <= 512) {
        return { kind: 'background-clip', backgroundClip, backgroundImage }
      }
      return undefined
    }
    const clipPathMetrics = (
      value: string,
      width: number,
      height: number,
    ): { left: number; top: number; right: number; bottom: number; fillRatio: number } | undefined => {
      const normalized = value.trim().toLowerCase()
      if (!normalized || normalized === 'none') return { left: 0, top: 0, right: width, bottom: height, fillRatio: 1 }
      const length = (token: string, axis: number): number | undefined => {
        if (token.endsWith('%')) return (Number.parseFloat(token) / 100) * axis
        if (token.endsWith('px') || /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return Number.parseFloat(token)
        return undefined
      }
      const boundedMetrics = (left: number, top: number, right: number, bottom: number, fillRatio: number) => ({
        left: Math.max(0, Math.min(width, left)),
        top: Math.max(0, Math.min(height, top)),
        right: Math.max(0, Math.min(width, right)),
        bottom: Math.max(0, Math.min(height, bottom)),
        fillRatio: Math.max(0, Math.min(1, fillRatio)),
      })
      const inset = /^inset\(([^)]*)\)/.exec(normalized)
      if (inset) {
        if (/\bround\b/.test(inset[1])) return undefined
        const values = inset[1].trim().split(/\s+/).filter(Boolean)
        if (values.length === 0 || values.length > 4) return undefined
        const expanded =
          values.length === 1
            ? [values[0], values[0], values[0], values[0]]
            : values.length === 2
              ? [values[0], values[1], values[0], values[1]]
              : values.length === 3
                ? [values[0], values[1], values[2], values[1]]
                : values
        const top = length(expanded[0], height)
        const right = length(expanded[1], width)
        const bottom = length(expanded[2], height)
        const left = length(expanded[3], width)
        if ([top, right, bottom, left].some((item) => item === undefined || !Number.isFinite(item))) return undefined
        return boundedMetrics(left!, top!, width - right!, height - bottom!, 1)
      }
      const circle = /^circle\(([^)]*)\)$/.exec(normalized)
      if (circle) {
        const [radiusValue, positionValue] = circle[1].split(/\s+at\s+/)
        const position = (positionValue || '50% 50%').trim().split(/\s+/)
        if (position.length !== 2) return undefined
        const centerX = length(position[0], width)
        const centerY = length(position[1], height)
        const radius = radiusValue.trim().endsWith('%')
          ? length(radiusValue.trim(), Math.hypot(width, height) / Math.SQRT2)
          : length(radiusValue.trim(), Math.min(width, height))
        if (![centerX, centerY, radius].every((item) => item !== undefined && Number.isFinite(item))) return undefined
        return boundedMetrics(
          centerX! - radius!,
          centerY! - radius!,
          centerX! + radius!,
          centerY! + radius!,
          Math.PI / 4,
        )
      }
      const ellipse = /^ellipse\(([^)]*)\)$/.exec(normalized)
      if (ellipse) {
        const [radiiValue, positionValue] = ellipse[1].split(/\s+at\s+/)
        const radii = radiiValue.trim().split(/\s+/)
        const position = (positionValue || '50% 50%').trim().split(/\s+/)
        if (radii.length !== 2 || position.length !== 2) return undefined
        const radiusX = length(radii[0], width)
        const radiusY = length(radii[1], height)
        const centerX = length(position[0], width)
        const centerY = length(position[1], height)
        if (![radiusX, radiusY, centerX, centerY].every((item) => item !== undefined && Number.isFinite(item))) {
          return undefined
        }
        return boundedMetrics(
          centerX! - radiusX!,
          centerY! - radiusY!,
          centerX! + radiusX!,
          centerY! + radiusY!,
          Math.PI / 4,
        )
      }
      const polygon = /^polygon\((.*)\)$/.exec(normalized)
      if (polygon) {
        const pointValues = polygon[1]
          .replace(/^\s*(?:evenodd|nonzero)\s*,/i, '')
          .split(',')
          .map((point) => point.trim().split(/\s+/))
        if (pointValues.length < 3 || pointValues.some((point) => point.length !== 2)) return undefined
        const points = pointValues.map(([x, y]) => [length(x, width), length(y, height)] as const)
        if (points.some(([x, y]) => x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y))) {
          return undefined
        }
        const numericPoints = points as Array<readonly [number, number]>
        const xs = numericPoints.map(([x]) => x)
        const ys = numericPoints.map(([, y]) => y)
        const area = Math.abs(
          numericPoints.reduce((sum, [x, y], index) => {
            const [nextX, nextY] = numericPoints[(index + 1) % numericPoints.length]
            return sum + x * nextY - nextX * y
          }, 0) / 2,
        )
        const left = Math.min(...xs)
        const top = Math.min(...ys)
        const right = Math.max(...xs)
        const bottom = Math.max(...ys)
        return boundedMetrics(left, top, right, bottom, area / Math.max(1, (right - left) * (bottom - top)))
      }
      return undefined
    }
    const effectiveTextVisibility = (
      element: Element,
      paintedComputed: CSSStyleDeclaration,
    ):
      | {
          visibleWidthPx: number
          visibleHeightPx: number
          visibleBounds: { xPx: number; yPx: number; widthPx: number; heightPx: number }
          paintedAreaPx: number
          captureIntersectionRatio: number
          effectiveClipPathAreaRatio: number
          ancestorClipCount: number
          opacity: number
          filterOpacity: number
          filterChain: Array<{ value: string; owner: 'self' | 'ancestor' | 'paint' }>
          maskChain: Array<{ value: string; owner: 'self' | 'ancestor' | 'paint' }>
          blendChain: Array<{ value: string; owner: 'self' | 'ancestor' | 'paint' }>
          clipPathChain: Array<{
            value: string
            widthPx: number
            heightPx: number
            owner: 'self' | 'ancestor'
          }>
          nonRectangularClipPathCount: number
        }
      | undefined => {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 2 || rect.height <= 2 || element.getClientRects().length === 0) return undefined
      const scrollingElement = document.scrollingElement || document.documentElement
      const captureHeight = Math.max(
        window.innerHeight,
        scrollingElement.scrollHeight,
        document.body?.scrollHeight || 0,
      )
      let left = Math.max(0, rect.left)
      let top = Math.max(0, rect.top)
      let right = Math.min(window.innerWidth, rect.right)
      let bottom = Math.min(captureHeight, rect.bottom)
      const captureArea = Math.max(0, right - left) * Math.max(0, bottom - top)
      const captureIntersectionRatio = captureArea / Math.max(1, rect.width * rect.height)
      let effectiveOpacity = 1
      let filterOpacity = 1
      let effectiveClipPathAreaRatio = 1
      let ancestorClipCount = 0
      const clipPathChain: Array<{
        value: string
        widthPx: number
        heightPx: number
        owner: 'self' | 'ancestor'
      }> = []
      const filterChain: Array<{ value: string; owner: 'self' | 'ancestor' | 'paint' }> = []
      for (let current: Element | null = element; current; current = current.parentElement) {
        const currentComputed = computedFor(current)
        if (
          currentComputed.display === 'none' ||
          currentComputed.visibility === 'hidden' ||
          currentComputed.visibility === 'collapse' ||
          currentComputed.getPropertyValue('content-visibility') === 'hidden' ||
          hasUnsupportedMask(currentComputed) ||
          hasContextDependentBlend(currentComputed)
        ) {
          return undefined
        }
        const currentOpacity = Number.parseFloat(currentComputed.opacity || '1')
        effectiveOpacity *= Number.isFinite(currentOpacity) ? currentOpacity : 1
        const filter = currentComputed.filter.trim().toLowerCase().replace(/\s+/g, ' ')
        if (filter && filter !== 'none') {
          const currentFilterOpacity = filterOpacityFor(filter)
          if (currentFilterOpacity === undefined || filter.length > 512 || filterChain.length >= 8) return undefined
          filterOpacity *= currentFilterOpacity
          filterChain.push({ value: filter, owner: current === element ? 'self' : 'ancestor' })
        }
        const currentRect = current.getBoundingClientRect()
        const clipPath = clipPathMetrics(currentComputed.clipPath, currentRect.width, currentRect.height)
        if (!clipPath) return undefined
        if (currentComputed.clipPath !== 'none' && currentComputed.clipPath !== '') {
          const normalizedClipPath = currentComputed.clipPath.trim().toLowerCase().replace(/\s+/g, ' ')
          // A box plus a scalar fill ratio cannot prove that glyphs intersect a curved/concave shape. Component text
          // under these clips is therefore omitted rather than promoted from unprovable paint.
          if (/^(?:circle|ellipse|polygon)\(/.test(normalizedClipPath) || clipPathChain.length >= 8) return undefined
          clipPathChain.push({
            value: normalizedClipPath,
            widthPx: currentRect.width,
            heightPx: currentRect.height,
            owner: current === element ? 'self' : 'ancestor',
          })
          left = Math.max(left, currentRect.left + clipPath.left)
          top = Math.max(top, currentRect.top + clipPath.top)
          right = Math.min(right, currentRect.left + clipPath.right)
          bottom = Math.min(bottom, currentRect.top + clipPath.bottom)
          effectiveClipPathAreaRatio *= clipPath.fillRatio
          if (current !== element) ancestorClipCount += 1
        }
        if (currentComputed.clip !== 'auto' && currentComputed.clip !== '') return undefined
        if (current !== element) {
          const clipsX = ['auto', 'scroll', 'hidden', 'clip'].includes(currentComputed.overflowX)
          const clipsY = ['auto', 'scroll', 'hidden', 'clip'].includes(currentComputed.overflowY)
          const containsPaint = currentComputed.contain.split(/\s+/).includes('paint')
          if (clipsX || containsPaint) {
            left = Math.max(left, currentRect.left)
            right = Math.min(right, currentRect.right)
            ancestorClipCount += 1
          }
          if (clipsY || containsPaint) {
            top = Math.max(top, currentRect.top)
            bottom = Math.min(bottom, currentRect.bottom)
            if (!clipsX && !containsPaint) ancestorClipCount += 1
          }
        }
      }
      const hostComputed = computedFor(element)
      const hostOpacity = Number.parseFloat(hostComputed.opacity || '1')
      const paintOpacity = Number.parseFloat(paintedComputed.opacity || '1')
      const ancestorOpacity = effectiveOpacity / Math.max(Number.isFinite(hostOpacity) ? hostOpacity : 1, 0.000001)
      effectiveOpacity =
        paintedComputed === hostComputed
          ? effectiveOpacity
          : ancestorOpacity *
            (Number.isFinite(hostOpacity) ? hostOpacity : 1) *
            (Number.isFinite(paintOpacity) ? paintOpacity : 1)
      if (paintedComputed !== hostComputed) {
        if (hasUnsupportedMask(paintedComputed) || hasContextDependentBlend(paintedComputed)) return undefined
        const paintFilter = paintedComputed.filter.trim().toLowerCase().replace(/\s+/g, ' ')
        if (paintFilter && paintFilter !== 'none') {
          const paintFilterOpacity = filterOpacityFor(paintFilter)
          if (paintFilterOpacity === undefined || paintFilter.length > 512 || filterChain.length >= 8) return undefined
          filterOpacity *= paintFilterOpacity
          filterChain.push({ value: paintFilter, owner: 'paint' })
        }
      }
      const visibleWidthPx = Math.max(0, right - left)
      const visibleHeightPx = Math.max(0, bottom - top)
      const effectiveScale = Math.sqrt(Math.max(0, Math.min(1, effectiveClipPathAreaRatio)))
      const paintedAreaPx = visibleWidthPx * visibleHeightPx * effectiveClipPathAreaRatio
      if (
        visibleWidthPx <= 2 ||
        visibleHeightPx <= 2 ||
        visibleWidthPx * effectiveScale <= 2 ||
        visibleHeightPx * effectiveScale <= 2 ||
        paintedAreaPx <= 16 ||
        effectiveOpacity <= 0.02 ||
        filterOpacity <= 0.02
      ) {
        return undefined
      }
      return {
        visibleWidthPx,
        visibleHeightPx,
        visibleBounds: {
          xPx: left - rect.left,
          yPx: top - rect.top,
          widthPx: visibleWidthPx,
          heightPx: visibleHeightPx,
        },
        paintedAreaPx,
        captureIntersectionRatio,
        effectiveClipPathAreaRatio,
        ancestorClipCount,
        opacity: effectiveOpacity,
        filterOpacity,
        filterChain,
        maskChain: [],
        blendChain: [],
        clipPathChain,
        nonRectangularClipPathCount: 0,
      }
    }
    const renderedTextSource = (
      element: Element,
      paintedComputed: CSSStyleDeclaration,
      kind: ComponentTextStyleSource['kind'],
      glyphRects: readonly DOMRect[],
      nativeTextOrigin?: ComponentTextStyleSource['nativeTextOrigin'],
    ): ComponentTextStyleSource | undefined => {
      if (!isVisible(element)) return undefined
      const computed = computedFor(element)
      const rect = element.getBoundingClientRect()
      const clip = computed.clip.trim().toLowerCase()
      const clipPath = computed.clipPath.trim().toLowerCase().replace(/\s+/g, ' ')
      const textIndent = Number.parseFloat(computed.textIndent || '0')
      const glyphPaint = glyphPaintFor(paintedComputed)
      const visibility = effectiveTextVisibility(element, paintedComputed)
      const nativeTextSource = ['native-value', 'native-placeholder', 'native-selection'].includes(kind)
      if (
        !glyphPaint ||
        !visibility ||
        nativeTextSource !== Boolean(nativeTextOrigin) ||
        (nativeTextSource
          ? Number.isFinite(textIndent) && Math.abs(textIndent) > 1
          : Number.isFinite(textIndent) && Math.abs(textIndent) > Math.max(128, rect.width * 2))
      ) {
        return undefined
      }
      const dimension = (value: string): number => {
        const parsed = Number.parseFloat(value || '0')
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      }
      const nativeTextBounds = nativeTextSource
        ? (() => {
            const left = dimension(computed.borderLeftWidth) + dimension(computed.paddingLeft)
            const top = dimension(computed.borderTopWidth) + dimension(computed.paddingTop)
            const right = dimension(computed.borderRightWidth) + dimension(computed.paddingRight)
            const bottom = dimension(computed.borderBottomWidth) + dimension(computed.paddingBottom)
            return { xPx: left, yPx: top, widthPx: rect.width - left - right, heightPx: rect.height - top - bottom }
          })()
        : undefined
      if (
        nativeTextBounds &&
        (nativeTextBounds.widthPx <= 2 ||
          nativeTextBounds.heightPx <= 2 ||
          visibility.visibleBounds.xPx > nativeTextBounds.xPx + 1 ||
          visibility.visibleBounds.yPx > nativeTextBounds.yPx + 1 ||
          visibility.visibleBounds.xPx + visibility.visibleBounds.widthPx <
            nativeTextBounds.xPx + nativeTextBounds.widthPx - 1 ||
          visibility.visibleBounds.yPx + visibility.visibleBounds.heightPx <
            nativeTextBounds.yPx + nativeTextBounds.heightPx - 1)
      ) {
        return undefined
      }
      const visibleLeft = rect.left + visibility.visibleBounds.xPx
      const visibleTop = rect.top + visibility.visibleBounds.yPx
      const visibleGlyphRects = glyphRects
        .flatMap((glyphRect) => {
          const left = Math.max(glyphRect.left, visibleLeft)
          const top = Math.max(glyphRect.top, visibleTop)
          const right = Math.min(glyphRect.right, visibleLeft + visibility.visibleBounds.widthPx)
          const bottom = Math.min(glyphRect.bottom, visibleTop + visibility.visibleBounds.heightPx)
          const width = Math.max(0, right - left)
          const height = Math.max(0, bottom - top)
          return width > 1 && height > 1 && width * height > 4
            ? [{ xPx: left - rect.left, yPx: top - rect.top, widthPx: width, heightPx: height }]
            : []
        })
        .slice(0, 8)
      if (['direct-text', 'descendant-text'].includes(kind) && visibleGlyphRects.length === 0) return undefined
      return {
        kind,
        widthPx: rect.width,
        heightPx: rect.height,
        ...visibility,
        clientRectCount: element.getClientRects().length,
        glyphRectCount: glyphRects.length,
        visibleGlyphRects,
        visibleGlyphAreaPx: visibleGlyphRects.reduce(
          (area, glyphRect) => area + glyphRect.widthPx * glyphRect.heightPx,
          0,
        ),
        ...(nativeTextBounds ? { nativeTextBounds } : {}),
        ...(nativeTextOrigin ? { nativeTextOrigin } : {}),
        clip,
        clipPath,
        contentVisibility: computed.getPropertyValue('content-visibility'),
        textIndentPx: Number.isFinite(textIndent) ? textIndent : 0,
        filter: computed.filter.trim().toLowerCase().replace(/\s+/g, ' '),
        glyphPaintKind: glyphPaint.kind,
        ...(glyphPaint.kind === 'solid-color'
          ? { foreground: glyphPaint.foreground }
          : { backgroundClip: glyphPaint.backgroundClip, backgroundImage: glyphPaint.backgroundImage }),
      }
    }
    const visibleTextStyleOwner = (element: Element): BrowserTextStyleOwner | undefined => {
      const textNodes = [...element.childNodes].filter(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.replace(/\s+/g, ' ').trim()),
      )
      if (textNodes.length === 0) return undefined
      const computed = computedFor(element)
      const glyphRects = textNodes.flatMap((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        return [...range.getClientRects()].filter((glyphRect) => glyphRect.width > 0 && glyphRect.height > 0)
      })
      if (glyphRects.length === 0) return undefined
      const source = renderedTextSource(element, computed, 'direct-text', glyphRects)
      return source ? { element, computed, source } : undefined
    }
    const directlyOwnsRenderedText = (element: Element): boolean => Boolean(visibleTextStyleOwner(element))
    const inputTextStyleOwner = (element: Element): BrowserTextStyleOwner | undefined => {
      if (element instanceof HTMLInputElement) {
        const type = element.type.toLowerCase()
        if (['hidden', 'image', 'checkbox', 'radio', 'range', 'color'].includes(type)) return undefined
        const computed = computedFor(element)
        const nativeEmptyText = ['date', 'datetime-local', 'file', 'month', 'time', 'week'].includes(type)
        if (Boolean(element.value.trim()) || nativeEmptyText) {
          const source = renderedTextSource(
            element,
            computed,
            nativeEmptyText ? 'native-selection' : 'native-value',
            [],
            nativeEmptyText ? (element.value.trim() ? 'selection' : 'user-agent-default') : 'explicit-value',
          )
          if (source) return { element, computed, source }
        }
        if (element.placeholder.trim()) {
          const placeholder = getComputedStyle(element, '::placeholder')
          const source = renderedTextSource(element, placeholder, 'native-placeholder', [], 'placeholder')
          if (source) return { element, computed: placeholder, source }
        }
        return undefined
      }
      if (element instanceof HTMLTextAreaElement) {
        const computed = computedFor(element)
        if (element.value.trim()) {
          const source = renderedTextSource(element, computed, 'native-value', [], 'explicit-value')
          if (source) return { element, computed, source }
        }
        if (element.placeholder.trim()) {
          const placeholder = getComputedStyle(element, '::placeholder')
          const source = renderedTextSource(element, placeholder, 'native-placeholder', [], 'placeholder')
          if (source) return { element, computed: placeholder, source }
        }
        return undefined
      }
      if (element instanceof HTMLSelectElement) {
        const computed = computedFor(element)
        if (!element.selectedOptions[0]?.textContent?.trim()) return undefined
        const source = renderedTextSource(element, computed, 'native-selection', [], 'selection')
        return source ? { element, computed, source } : undefined
      }
      return (
        visibleTextStyleOwner(element) || [...element.querySelectorAll('*')].map(visibleTextStyleOwner).find(Boolean)
      )
    }
    const renderedTextOwner = (type: string, element: Element): BrowserTextStyleOwner | undefined => {
      if (type === 'input') {
        const inputSelector =
          'input:not([type="hidden"]), textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]'
        const source = element.matches(inputSelector) ? element : element.querySelector(inputSelector)
        const sourceStyle = source ? inputTextStyleOwner(source) : undefined
        if (sourceStyle) return sourceStyle
        return [...element.querySelectorAll('*')]
          .filter((candidate) => candidate !== source && !source?.contains(candidate))
          .map(visibleTextStyleOwner)
          .find(Boolean)
      }
      if (type === 'button' && element instanceof HTMLInputElement) {
        const inputType = element.type.toLowerCase()
        if (inputType === 'image') return undefined
        const computed = computedFor(element)
        const explicitValue = Boolean(element.value.trim())
        const userAgentDefault = ['reset', 'submit'].includes(inputType) && !element.hasAttribute('value')
        if (!explicitValue && !userAgentDefault) return undefined
        const source = renderedTextSource(
          element,
          computed,
          'native-value',
          [],
          explicitValue ? 'explicit-value' : 'user-agent-default',
        )
        return source ? { element, computed, source } : undefined
      }
      if (!['button', 'tab', 'status'].includes(type)) return undefined
      const directOwner = visibleTextStyleOwner(element)
      if (directOwner || type === 'status') return directOwner
      return [...element.querySelectorAll('*')].map(visibleTextStyleOwner).find(Boolean)
    }
    const stylesForComponent = (type: string, element: Element) => {
      const computed = computedFor(element)
      const textOwner = renderedTextOwner(type, element)
      const textComputed = textOwner?.computed
      const textColor =
        textOwner?.source.glyphPaintKind === 'solid-color' &&
        textOwner.source.opacity >= 0.999 &&
        textOwner.source.filterOpacity >= 0.999
          ? textOwner.source.foreground
          : undefined
      const borders = {
        borderTop: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
        borderRight: `${computed.borderRightWidth} ${computed.borderRightStyle} ${computed.borderRightColor}`,
        borderBottom: `${computed.borderBottomWidth} ${computed.borderBottomStyle} ${computed.borderBottomColor}`,
        borderLeft: `${computed.borderLeftWidth} ${computed.borderLeftStyle} ${computed.borderLeftColor}`,
      }
      const borderValues = Object.values(borders)
      const equalBorders = borderValues.every((border) => border === borderValues[0])
      const contentSized = ['card', 'list', 'table', 'modal', 'status'].includes(type)
      return {
        styles: {
          backgroundColor: computed.backgroundColor,
          ...(textComputed
            ? {
                ...(textColor ? { color: textColor } : {}),
                fontFamily: textComputed.fontFamily,
                fontSize: textComputed.fontSize,
                fontWeight: textComputed.fontWeight,
                lineHeight: textComputed.lineHeight,
                letterSpacing: textComputed.letterSpacing,
              }
            : {}),
          ...(equalBorders ? { border: borderValues[0] } : borders),
          borderRadius: computed.borderRadius,
          boxShadow: computed.boxShadow,
          padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
          ...(!contentSized ? { height: computed.height, minHeight: computed.minHeight } : {}),
          display: computed.display,
          gap: computed.gap,
        },
        ...(textOwner
          ? {
              textStyleOwner: textOwner.element === element ? ('root' as const) : ('descendant' as const),
              textStyleSource: {
                ...textOwner.source,
                ...(textOwner.source.kind === 'direct-text' && textOwner.element !== element
                  ? { kind: 'descendant-text' as const }
                  : {}),
              },
            }
          : {}),
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

    const statusCandidateKind = (element: Element): 'native' | null => {
      const role = element.getAttribute('role') || ''
      const ariaLive = element.getAttribute('aria-live')
      if (element.matches(candidateRules.broadActionSelector)) return null
      const nativeStatus = ['status', 'alert'].includes(role) || Boolean(ariaLive && ariaLive !== 'off')
      if (nativeStatus) return 'native'
      return null
    }
    const isStyledActionAnchor = (element: Element): boolean => {
      if (element.tagName !== 'A' || !element.hasAttribute('href')) return false
      const computed = computedFor(element)
      const rect = element.getBoundingClientRect()
      const paintedFill = Boolean(normalizedPaintColor(computed.backgroundColor))
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
      statusBoundary?: ComponentStatusBoundary
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
    const inputSemanticRole = (element: Element): string | undefined => {
      const explicitRole = element.getAttribute('role')?.trim().toLowerCase()
      if (explicitRole) return explicitRole
      const tagName = element.tagName.toLowerCase()
      if (tagName === 'select') return element.hasAttribute('multiple') ? 'listbox' : 'combobox'
      if (tagName === 'textarea') return 'textbox'
      if (tagName !== 'input') return undefined
      const type = (element.getAttribute('type') || 'text').toLowerCase()
      if (type === 'search') return 'searchbox'
      if (type === 'number') return 'spinbutton'
      if (['text', 'email', 'tel', 'url'].includes(type)) return 'textbox'
      return type
    }
    const statusCandidateKinds = new Map<Element, 'native'>()
    for (const element of document.querySelectorAll('body *')) {
      if (!isVisible(element)) continue
      const kind = statusCandidateKind(element)
      if (kind) statusCandidateKinds.set(element, kind)
    }
    const statusCandidates = [...statusCandidateKinds.keys()]
    const statusCandidateSet = new Set(statusCandidates)
    const statusBoundaryPaint = (element: Element) => {
      const computed = computedFor(element)
      if (!effectiveTextVisibility(element, computed)) {
        return { paintedFill: false, paintedBorder: false, paintedShadow: false }
      }
      const paintedFill = Boolean(normalizedPaintColor(computed.backgroundColor))
      const paintedBorder = [
        [computed.borderTopWidth, computed.borderTopStyle, computed.borderTopColor],
        [computed.borderRightWidth, computed.borderRightStyle, computed.borderRightColor],
        [computed.borderBottomWidth, computed.borderBottomStyle, computed.borderBottomColor],
        [computed.borderLeftWidth, computed.borderLeftStyle, computed.borderLeftColor],
      ].some(
        ([width, style, color]) =>
          Number.parseFloat(width) > 0 && !['none', 'hidden'].includes(style) && Boolean(normalizedPaintColor(color)),
      )
      const paintedShadow = hasVisibleBoxShadow(computed.boxShadow)
      return { paintedFill, paintedBorder, paintedShadow }
    }
    const statusBoundaryFor = (element: Element): ComponentStatusBoundary => {
      const rect = element.getBoundingClientRect()
      const paint = statusBoundaryPaint(element)
      return {
        strongVisualBoundary: paint.paintedFill || paint.paintedBorder || paint.paintedShadow,
        ...paint,
        directlyOwnedText: directlyOwnsRenderedText(element),
        widthPx: rect.width,
        heightPx: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }
    }
    const isActionableStatusBoundary = (boundary: ComponentStatusBoundary): boolean => {
      const viewportWidth = Math.max(1, boundary.viewportWidth)
      const viewportHeight = Math.max(1, boundary.viewportHeight)
      const width = Math.max(0, boundary.widthPx)
      const height = Math.max(0, boundary.heightPx)
      const areaRatio = (width * height) / (viewportWidth * viewportHeight)
      const bounded = height <= Math.min(240, viewportHeight * 0.45) && areaRatio <= 0.4
      const compact = height <= Math.min(160, viewportHeight * 0.25) && areaRatio <= 0.2
      const compactWidth = width <= Math.min(720, viewportWidth * 0.8)
      return bounded && (boundary.strongVisualBoundary || (boundary.directlyOwnedText && compact && compactWidth))
    }
    const hasStatusEvidenceGeometry = (element: Element): boolean => {
      const rect = element.getBoundingClientRect()
      const computed = computedFor(element)
      return (
        rect.width >= 4 &&
        rect.height >= 4 &&
        Boolean(effectiveTextVisibility(element, computed)) &&
        (computed.clip === 'auto' || computed.clip === '') &&
        (computed.clipPath === 'none' || computed.clipPath === '')
      )
    }
    const preferredStatusCandidates = new Set(statusCandidates.filter(hasStatusEvidenceGeometry))
    const statusBoundaries = new Map(
      [...preferredStatusCandidates].map((element) => [element, statusBoundaryFor(element)] as const),
    )
    const actionableStatusCandidates = new Set(
      [...preferredStatusCandidates].filter((element) => isActionableStatusBoundary(statusBoundaries.get(element)!)),
    )
    const actionableDescendantCounts = new Map<Element, number>()
    for (const element of actionableStatusCandidates) {
      let ancestor = element.parentElement
      while (ancestor) {
        if (preferredStatusCandidates.has(ancestor)) {
          actionableDescendantCounts.set(ancestor, (actionableDescendantCounts.get(ancestor) || 0) + 1)
          if (actionableStatusCandidates.has(ancestor)) break
        }
        ancestor = ancestor.parentElement
      }
    }
    const statusRoots = statusCandidates.filter((element) => {
      if (!preferredStatusCandidates.has(element)) return false
      const actionable = actionableStatusCandidates.has(element)
      if (!actionable && (actionableDescendantCounts.get(element) || 0) > 0) return false
      let ancestor = element.parentElement
      while (ancestor) {
        if (preferredStatusCandidates.has(ancestor)) {
          if (actionable && !actionableStatusCandidates.has(ancestor)) {
            ancestor = ancestor.parentElement
            continue
          }
          return false
        }
        ancestor = ancestor.parentElement
      }
      return true
    })
    for (const element of statusRoots) {
      componentCandidates.push({
        element,
        type: 'status',
        role: 'status-neutral',
        elementKind: 'status',
        confidence: 0.94,
        statusBoundary: statusBoundaries.get(element) || statusBoundaryFor(element),
      })
    }
    addComponents('[role="tab"]', 'tab', 0.98, 'button')
    const formSubmitterCounts = new WeakMap<HTMLFormElement, number>()
    const enabledVisibleSubmitterCount = (form: HTMLFormElement): number => {
      const cached = formSubmitterCounts.get(form)
      if (cached !== undefined) return cached
      const count = [...document.querySelectorAll<HTMLElement>(candidateRules.formSubmitterSelector)].filter(
        (candidate) => {
          const control = candidate as HTMLButtonElement | HTMLInputElement
          return (
            control.form === form &&
            !control.disabled &&
            !candidate.matches(':disabled, [aria-disabled="true"]') &&
            isVisible(candidate) &&
            Boolean(effectiveTextVisibility(candidate, computedFor(candidate))) &&
            computedFor(candidate).pointerEvents !== 'none'
          )
        },
      ).length
      formSubmitterCounts.set(form, count)
      return count
    }
    for (const element of document.querySelectorAll(candidateRules.nativeActionSelector)) {
      if (
        !isVisible(element) ||
        statusCandidateSet.has(element) ||
        componentCandidates.some((candidate) => candidate.element === element)
      ) {
        continue
      }
      const tagName = element.tagName.toLowerCase()
      const nativeButton = tagName === 'button'
      const inputButton = tagName === 'input'
      const formControl = nativeButton
        ? (element as HTMLButtonElement)
        : inputButton
          ? (element as HTMLInputElement)
          : null
      const form = formControl?.form || null
      const submitCapable = Boolean(form && ['submit', 'image'].includes(formControl?.type.toLowerCase() || ''))
      componentCandidates.push({
        element,
        type: 'button',
        role: submitCapable && form && enabledVisibleSubmitterCount(form) === 1 ? 'primary-action' : 'action',
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
        role: 'action',
        elementKind: 'anchor',
        confidence: 0.9,
      })
    }
    addComponents('nav, [role="navigation"]', 'navigation', 0.98)
    for (const source of document.querySelectorAll(
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="image"]), textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]',
    )) {
      if (!isVisible(source)) continue
      const element = visualInputRoot(source)
      if (componentCandidates.some((candidate) => candidate.element === element && candidate.type === 'input')) continue
      componentCandidates.push({
        element,
        type: 'input',
        role: inputSemanticRole(source),
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

    const components = componentCandidates
      .filter((candidate) => hasVisiblePaintChain(candidate.element))
      .slice(0, 250)
      .flatMap((candidate) => {
        const section = sectionFor(candidate.element)
        if (!section) return []
        const componentStyle = stylesForComponent(candidate.type, candidate.element)
        return [
          {
            key: `${candidate.type}:${locatorFor(candidate.element)}`,
            sectionKey: section.key,
            type: candidate.type,
            elementKind: candidate.elementKind,
            role: candidate.role,
            textStyleOwner: componentStyle.textStyleOwner,
            textStyleSource: componentStyle.textStyleSource,
            statusBoundary: candidate.statusBoundary,
            rect: normalizedRect(candidate.element),
            styles: componentStyle.styles,
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
        hasVisiblePaintChain(element) &&
        !(element.closest('form') && element instanceof HTMLButtonElement && element.getAttribute('type') !== 'button'),
    )
    const layoutTextOwnerCache = new WeakMap<Element, BrowserTextStyleOwner | null>()
    const layoutTextOwnerFor = (element: Element): BrowserTextStyleOwner | undefined => {
      const cached = layoutTextOwnerCache.get(element)
      if (cached !== undefined) return cached || undefined
      const owner =
        visibleTextStyleOwner(element) || [...element.querySelectorAll('*')].map(visibleTextStyleOwner).find(Boolean)
      layoutTextOwnerCache.set(element, owner || null)
      return owner
    }
    const maximumTypeSize = layoutCandidates.reduce((maximum, element) => {
      const fontSize = Number.parseFloat(layoutTextOwnerFor(element)?.computed.fontSize || '0')
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
      const candidateTextRole: BrowserTextRole | undefined =
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
      const textOwner = candidateTextRole ? layoutTextOwnerFor(element) : undefined
      const textComputed = textOwner?.computed
      const textColor =
        textOwner?.source.glyphPaintKind === 'solid-color' &&
        textOwner.source.opacity >= 0.999 &&
        textOwner.source.filterOpacity >= 0.999
          ? textOwner.source.foreground
          : undefined
      const textRole = textOwner ? candidateTextRole : undefined
      const traits = [`display:${computed.display}`, `position:${computed.position}`, `align:${computed.textAlign}`]
      const rect = element.getBoundingClientRect()
      const fontSize = Number.parseFloat(textComputed?.fontSize || '0')
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
          identityKey: nodeIdentityFor(element, role, textRole),
          sectionKey: section.key,
          role,
          rect: normalizedRect(element),
          textRole,
          textStyleSource: textOwner?.source,
          styles: {
            ...(textColor ? { color: textColor } : {}),
            backgroundColor: computed.backgroundColor,
            ...(textComputed
              ? {
                  fontFamily: textComputed.fontFamily,
                  fontSize: textComputed.fontSize,
                  fontWeight: textComputed.fontWeight,
                  lineHeight: textComputed.lineHeight,
                  letterSpacing: textComputed.letterSpacing,
                }
              : {}),
            ...(role === 'media' ? { width: computed.width, height: computed.height } : {}),
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

    const pseudoPaintEvidenceFor = (
      element: Element,
      pseudo: CSSStyleDeclaration,
      requireExplicitBox: boolean,
    ): PseudoElementPaintEvidence | undefined => {
      if (
        hasUnsupportedMask(pseudo) ||
        hasContextDependentBlend(pseudo) ||
        (pseudo.transform && pseudo.transform !== 'none')
      ) {
        return undefined
      }
      const hostRect = element.getBoundingClientRect()
      const parsedWidth = Number.parseFloat(pseudo.width)
      const parsedHeight = Number.parseFloat(pseudo.height)
      const fallbackHeight = Number.parseFloat(pseudo.lineHeight)
      const widthPx = Number.isFinite(parsedWidth) ? parsedWidth : requireExplicitBox ? 0 : hostRect.width
      const heightPx = Number.isFinite(parsedHeight)
        ? parsedHeight
        : requireExplicitBox
          ? 0
          : Number.isFinite(fallbackHeight)
            ? fallbackHeight
            : hostRect.height
      if (widthPx <= 2 || heightPx <= 2) return undefined

      const finiteOffset = (value: string): number | undefined => {
        if (!value || value === 'auto') return undefined
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) ? parsed : undefined
      }
      const fixed = pseudo.position === 'fixed'
      const positioned = fixed || pseudo.position === 'absolute' || pseudo.position === 'relative'
      const leftOffset = finiteOffset(pseudo.left)
      const rightOffset = finiteOffset(pseudo.right)
      const topOffset = finiteOffset(pseudo.top)
      const bottomOffset = finiteOffset(pseudo.bottom)
      const baseLeft = fixed ? 0 : hostRect.left
      const baseTop = fixed ? 0 : hostRect.top
      const containingWidth = fixed ? window.innerWidth : hostRect.width
      const containingHeight = fixed ? window.innerHeight : hostRect.height
      const xPx = positioned
        ? leftOffset !== undefined
          ? baseLeft + leftOffset
          : rightOffset !== undefined
            ? baseLeft + containingWidth - rightOffset - widthPx
            : baseLeft
        : hostRect.left
      const yPx = positioned
        ? topOffset !== undefined
          ? baseTop + topOffset
          : bottomOffset !== undefined
            ? baseTop + containingHeight - bottomOffset - heightPx
            : baseTop
        : hostRect.top

      let opacity = Number.parseFloat(pseudo.opacity || '1')
      if (!Number.isFinite(opacity)) opacity = 1
      let filterOpacity = 1
      const filterChain: PseudoElementPaintEvidence['filterChain'] = []
      const pseudoFilter = pseudo.filter.trim().toLowerCase().replace(/\s+/g, ' ')
      if (pseudoFilter && pseudoFilter !== 'none') {
        const parsed = filterOpacityFor(pseudoFilter)
        if (parsed === undefined || pseudoFilter.length > 512) return undefined
        filterOpacity *= parsed
        filterChain.push({ value: pseudoFilter, owner: 'paint' })
      }
      for (let current: Element | null = element; current; current = current.parentElement) {
        const computed = computedFor(current)
        if (hasUnsupportedMask(computed) || hasContextDependentBlend(computed)) return undefined
        const currentOpacity = Number.parseFloat(computed.opacity || '1')
        opacity *= Number.isFinite(currentOpacity) ? currentOpacity : 1
        const filter = computed.filter.trim().toLowerCase().replace(/\s+/g, ' ')
        if (filter && filter !== 'none') {
          const parsed = filterOpacityFor(filter)
          if (parsed === undefined || filter.length > 512 || filterChain.length >= 8) return undefined
          filterOpacity *= parsed
          filterChain.push({ value: filter, owner: current === element ? 'self' : 'ancestor' })
        }
      }
      if (opacity <= 0.02 || filterOpacity <= 0.02) return undefined

      const scrollingElement = document.scrollingElement || document.documentElement
      const captureHeight = Math.max(
        window.innerHeight,
        scrollingElement.scrollHeight,
        document.body?.scrollHeight || 0,
      )
      const visibleLeft = Math.max(0, xPx)
      const visibleTop = Math.max(0, yPx)
      const visibleRight = Math.min(window.innerWidth, xPx + widthPx)
      const visibleBottom = Math.min(captureHeight, yPx + heightPx)
      const visibleWidthPx = Math.max(0, visibleRight - visibleLeft)
      const visibleHeightPx = Math.max(0, visibleBottom - visibleTop)
      const paintedAreaPx = visibleWidthPx * visibleHeightPx
      const captureIntersectionRatio = paintedAreaPx / Math.max(1, widthPx * heightPx)
      if (visibleWidthPx <= 2 || visibleHeightPx <= 2 || paintedAreaPx <= 16 || captureIntersectionRatio <= 0.02) {
        return undefined
      }
      return {
        widthPx,
        heightPx,
        xPx,
        yPx,
        captureWidthPx: window.innerWidth,
        captureHeightPx: captureHeight,
        visibleWidthPx,
        visibleHeightPx,
        paintedAreaPx,
        captureIntersectionRatio,
        opacity,
        filterOpacity,
        filterChain,
        maskChain: [],
        blendChain: [],
      }
    }

    const pseudoElements: PagePseudoElementSnapshot[] = []
    const pseudoCandidates = [...document.querySelectorAll('body *')]
      .filter((element) => isVisible(element) && hasVisiblePaintChain(element))
      .slice(0, 1_500)
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
        if (!content || ['none', 'normal'].includes(content)) continue
        const unquotedContent = content.replace(/^(['"])([\s\S]*)\1$/, '$2').trim()
        const nonTextContent = /^(?:url|image-set|linear-gradient|radial-gradient|conic-gradient)\(/i.test(
          unquotedContent,
        )
        const hasVisibleContent = Boolean(unquotedContent && (nonTextContent || glyphPaintFor(pseudo)))
        const hasVisibleShadow = hasVisibleBoxShadow(pseudo.boxShadow)
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
            Boolean(normalizedPaintColor(colorParts.join(' ')))
          )
        })
        const hasMaterial =
          Boolean(normalizedPaintColor(pseudo.backgroundColor)) || hasVisibleShadow || hasVisibleBorder
        if (!hasVisibleContent && !hasMaterial) continue
        const paint = pseudoPaintEvidenceFor(element, pseudo, !hasVisibleContent)
        if (!paint) continue
        pseudoElements.push({
          key: `${kind}:${locatorFor(element)}`,
          sectionKey: section.key,
          target: locatorFor(element),
          kind,
          paint,
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
            filter: pseudo.filter,
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
    const roleForMedia = (
      element: Element,
      kind: BrowserMediaKind,
      importance: BrowserMediaImportance,
      areaRatio: number,
      computed: CSSStyleDeclaration,
    ): { role: BrowserMediaRole; evidence: BrowserMediaRoleEvidence } => {
      if (importance === 'icon') return { role: 'icon', evidence: 'importance-icon' }
      if (kind === 'css-background' && areaRatio >= 0.5) {
        return { role: 'ambient', evidence: 'css-background-area' }
      }

      const tag = element.tagName.toUpperCase()
      const image = tag === 'IMG' ? (element as HTMLImageElement) : element.querySelector('img')
      const alt = image?.getAttribute('alt')
      const accessibleDescription = [alt, element.getAttribute('aria-label')]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' ')
        .trim()
      const presentation =
        ['none', 'presentation'].includes(element.getAttribute('role') || '') ||
        (typeof alt === 'string' && alt.trim() === '')
      if (presentation) return { role: 'decorative', evidence: 'presentation-semantics' }
      const structuredOwner = element.closest('[itemscope][itemtype]')
      const structuredProduct = (structuredOwner?.getAttribute('itemtype') || '')
        .split(/\s+/)
        .filter(Boolean)
        .some((value) => {
          try {
            const type = new URL(value, document.baseURI)
            return type.pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() === 'product'
          } catch {
            return false
          }
        })
      if (structuredProduct) {
        return { role: 'product', evidence: 'structured-product-semantics' }
      }
      if (element.closest('figure')) return { role: 'narrative', evidence: 'figure-semantics' }
      if (accessibleDescription) {
        return { role: 'unknown', evidence: 'accessible-non-decorative' }
      }
      if (kind === 'video') return { role: 'unknown', evidence: 'media-element' }
      if (areaRatio >= 0.5) return { role: 'unknown', evidence: 'large-visual' }
      if (computed.position === 'absolute' || computed.position === 'fixed') {
        return { role: 'unknown', evidence: 'positioned-visual' }
      }
      return { role: 'unknown', evidence: 'unknown' }
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
      const classifiedRole = roleForMedia(element, kind, entry.importance, areaRatio, computed)
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
          role: classifiedRole.role,
          roleEvidence: classifiedRole.evidence,
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
