import type { Page } from 'playwright-core'

export type AuthWallReason =
  'login-redirect' | 'unauthorized-response' | 'password-form' | 'blocking-login-dialog' | 'login-only-page'

export interface AuthWallDetection {
  detected: boolean
  confidence: 'low' | 'medium' | 'high'
  reasons: AuthWallReason[]
  finalUrl: string
}

export async function detectAuthWall(page: Page, responseStatus?: number): Promise<AuthWallDetection> {
  const reasons = new Set<AuthWallReason>()
  const finalUrl = page.url()

  if (responseStatus === 401 || responseStatus === 403) reasons.add('unauthorized-response')

  const signals = await page
    .evaluate(() => {
      const isVisible = (element: Element): boolean => {
        const htmlElement = element as HTMLElement
        const style = window.getComputedStyle(htmlElement)
        const rect = htmlElement.getBoundingClientRect()
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 &&
          rect.width > 1 &&
          rect.height > 1
        )
      }

      const visibleInputElements = Array.from(document.querySelectorAll('input')).filter(
        isVisible,
      ) as HTMLInputElement[]
      const autocompleteFor = (input: HTMLInputElement): string => input.autocomplete.toLowerCase()
      const isIdentityInput = (input: HTMLInputElement): boolean =>
        ['email', 'tel'].includes(input.type.toLowerCase()) ||
        ['username', 'email', 'tel'].includes(autocompleteFor(input))
      const isOneTimeCodeInput = (input: HTMLInputElement): boolean => autocompleteFor(input) === 'one-time-code'
      const isCurrentPasswordInput = (input: HTMLInputElement): boolean => autocompleteFor(input) === 'current-password'
      const isNewPasswordInput = (input: HTMLInputElement): boolean => autocompleteFor(input) === 'new-password'
      const isPasswordLikeInput = (input: HTMLInputElement): boolean =>
        input.type.toLowerCase() === 'password' || isCurrentPasswordInput(input) || isNewPasswordInput(input)
      const credentialInputs = visibleInputElements.filter(
        (input) => isPasswordLikeInput(input) || ['username', 'one-time-code'].includes(autocompleteFor(input)),
      )
      const hasActionControl = (container: Element): boolean =>
        Array.from(
          container.querySelectorAll(
            'button[type="submit"], input[type="submit"], input[type="image"], button[type="button"], button:not([type]), [role="button"]',
          ),
        ).some(isVisible)
      const credentialSurface = (input: Element): Element | null => {
        const explicit = input.closest(
          'form, dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], aside',
        )
        if (explicit) return explicit
        let ancestor = input.parentElement
        while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
          if (hasActionControl(ancestor)) return ancestor
          ancestor = ancestor.parentElement
        }
        return input.closest('main, section, article') || document.body
      }
      const candidateSurfaces = new Set(
        credentialInputs
          .map(credentialSurface)
          .filter((surface): surface is Element => Boolean(surface && isVisible(surface) && hasActionControl(surface))),
      )
      const inputsWithin = (surface: Element): HTMLInputElement[] =>
        visibleInputElements.filter((input) => surface === input || surface.contains(input))
      const authCompositionFor = (surface: Element) => {
        const inputs = inputsWithin(surface)
        const hasIdentity = inputs.some(isIdentityInput)
        const hasOneTimeCode = inputs.some(isOneTimeCodeInput)
        const hasCurrentPassword = inputs.some(isCurrentPasswordInput)
        const hasNewPassword = inputs.some(isNewPasswordInput)
        const hasPasswordCredential = inputs.some(
          (input) => input.type.toLowerCase() === 'password' && !isNewPasswordInput(input),
        )
        const passwordFlow = hasPasswordCredential && !hasNewPassword
        return {
          // Username fields also occur in profile editors. A password-change form can likewise contain identity,
          // current-password, and new-password fields. Only a standards-backed sign-in composition is page-level
          // access evidence; ambiguous account forms must remain analyzable.
          loginFlow: (hasOneTimeCode && hasIdentity) || passwordFlow,
          passwordFlow,
          blockingCredential:
            (hasOneTimeCode && hasIdentity) || (hasCurrentPassword && !hasNewPassword) || passwordFlow,
        }
      }

      const renderedText = (element: Element): string =>
        ((element as HTMLElement).innerText || element.textContent || '').replace(/\s+/g, ' ').trim()
      const accessibleName = (element: Element): string => {
        const directName = element.getAttribute('aria-label')?.trim() || element.getAttribute('title')?.trim()
        if (directName) return directName
        const labelledBy = element.getAttribute('aria-labelledby')
        if (labelledBy) {
          const referencedName = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id))
            .filter((label): label is HTMLElement => Boolean(label))
            .map(renderedText)
            .filter(Boolean)
            .join(' ')
          if (referencedName) return referencedName
        }
        if (element.tagName === 'IMG') return element.getAttribute('alt')?.trim() || ''
        if (element.tagName === 'SVG') {
          const title = Array.from(element.children).find((child) => child.tagName.toLowerCase() === 'title')
          return title ? renderedText(title) : ''
        }
        if (element.tagName === 'CANVAS') return renderedText(element)
        return ''
      }
      const hasMeaningfulPublicContentOutside = (
        surface: Element,
        isAvailable: (element: Element) => boolean = () => true,
      ): boolean => {
        const explicitlyBounded = surface.matches(
          'form, dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], aside',
        )
        const containsCredential = (element: Element): boolean =>
          credentialInputs.some((input) => element === input || element.contains(input))
        const isIndependentOutsideNode = (element: Element): boolean =>
          isVisible(element) &&
          isAvailable(element) &&
          element !== surface &&
          !surface.contains(element) &&
          !element.contains(surface) &&
          !containsCredential(element)
        const isMeaningfulMedia = (element: Element): boolean => {
          if (!isIndependentOutsideNode(element)) return false
          if (element.tagName === 'FIGURE') {
            const caption = Array.from(element.children).find((child) => child.tagName === 'FIGCAPTION')
            if (caption && isVisible(caption) && isAvailable(caption) && Boolean(renderedText(caption))) return true
            return Array.from(element.querySelectorAll('img, picture, video, svg, canvas, [role="img"]')).some(
              (media) => media !== element && isMeaningfulMedia(media),
            )
          }
          if (element.tagName === 'PICTURE') {
            return Array.from(element.querySelectorAll('img')).some(isMeaningfulMedia)
          }
          if (element.tagName === 'VIDEO') {
            return Boolean(
              accessibleName(element) ||
              element.hasAttribute('controls') ||
              element.getAttribute('src') ||
              element.querySelector('source[src]'),
            )
          }
          if (element.tagName === 'IMG') return Boolean(accessibleName(element))
          if (element.tagName === 'SVG' || element.tagName === 'CANVAS' || element.getAttribute('role') === 'img') {
            return Boolean(accessibleName(element))
          }
          return false
        }
        const hasSemanticContent = (region: Element): boolean => {
          const visibleTextBlock = Array.from(
            region.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, dt, dd, table, pre, blockquote'),
          ).some(
            (element) =>
              isVisible(element) &&
              isAvailable(element) &&
              !containsCredential(element) &&
              Boolean(renderedText(element)),
          )
          if (visibleTextBlock) return true
          return Array.from(region.querySelectorAll('figure, img, picture, video, svg, canvas, [role="img"]')).some(
            isMeaningfulMedia,
          )
        }
        const semanticRegions = Array.from(
          document.querySelectorAll('main, article, [role="main"], [role="article"], section'),
        ).filter(isIndependentOutsideNode)
        if (semanticRegions.some(hasSemanticContent)) return true

        const publicMedia = Array.from(
          document.querySelectorAll('figure, img, picture, video, svg, canvas, [role="img"]'),
        ).some(isMeaningfulMedia)
        if (publicMedia) return true

        // An inferred credential widget has explicit DOM ownership even without a form. Preserve a sibling narrative
        // made from native document structures; unlike a form's surrounding heading/copy, it is not owned by the
        // credential surface. This is structural evidence and does not depend on copy length or viewport coverage.
        if (!explicitlyBounded) {
          const outsideTextBlocks = Array.from(
            document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, table, pre, blockquote'),
          ).filter((element) => isIndependentOutsideNode(element) && Boolean(renderedText(element)))
          const hasHeading = outsideTextBlocks.some((element) => /^H[1-6]$/.test(element.tagName))
          const hasNarrativeBody = outsideTextBlocks.some((element) => element.matches('p, li, table, pre, blockquote'))
          return hasHeading && hasNarrativeBody
        }
        return false
      }

      const blockingLoginDialog = Array.from(
        document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'),
      )
        .filter(isVisible)
        .some((element) => {
          const standardsModal =
            element.tagName === 'DIALOG' &&
            (() => {
              try {
                return element.matches(':modal')
              } catch {
                return false
              }
            })()
          const declaredModal = element.getAttribute('aria-modal')?.toLowerCase() === 'true'
          const outsideContentIsInert =
            !element.closest('[inert]') &&
            hasMeaningfulPublicContentOutside(element) &&
            !hasMeaningfulPublicContentOutside(element, (outside) => !outside.closest('[inert]'))
          const composition = authCompositionFor(element)
          return (
            composition.blockingCredential &&
            hasActionControl(element) &&
            (standardsModal || declaredModal || outsideContentIsInert)
          )
        })

      const loginOnlyPage = [...candidateSurfaces].some(
        (surface) => authCompositionFor(surface).loginFlow && !hasMeaningfulPublicContentOutside(surface),
      )
      const passwordForm = [...candidateSurfaces].some(
        (surface) =>
          surface.tagName === 'FORM' &&
          authCompositionFor(surface).passwordFlow &&
          !hasMeaningfulPublicContentOutside(surface),
      )

      return {
        blockingLoginDialog,
        loginOnlyPage,
        passwordForm,
      }
    })
    .catch(() => ({
      blockingLoginDialog: false,
      loginOnlyPage: false,
      passwordForm: false,
    }))

  if (signals.passwordForm) reasons.add('password-form')
  if (signals.blockingLoginDialog) reasons.add('blocking-login-dialog')
  if (signals.loginOnlyPage) reasons.add('login-only-page')

  const highConfidence = [...reasons].some(
    (reason) => reason === 'unauthorized-response' || reason === 'password-form' || reason === 'blocking-login-dialog',
  )
  const hasPageEvidence = highConfidence || reasons.has('login-only-page')
  const confidence = highConfidence ? 'high' : hasPageEvidence ? 'medium' : 'low'

  return {
    detected: hasPageEvidence,
    confidence,
    reasons: [...reasons],
    finalUrl,
  }
}
