import type { Page } from 'playwright-core'

export type AuthWallReason =
  'login-redirect' | 'unauthorized-response' | 'password-form' | 'blocking-login-dialog' | 'login-only-page'

export interface AuthWallDetection {
  detected: boolean
  confidence: 'low' | 'medium' | 'high'
  reasons: AuthWallReason[]
  finalUrl: string
}

const AUTH_PATH_PATTERN = /(?:^|\/)(?:auth|login|log-in|signin|sign-in|passport|sso|account\/login)(?:\/|$)/i

export async function detectAuthWall(page: Page, responseStatus?: number): Promise<AuthWallDetection> {
  const reasons = new Set<AuthWallReason>()
  const finalUrl = page.url()

  try {
    const pathWithHash = `${new URL(finalUrl).pathname}${new URL(finalUrl).hash}`
    if (AUTH_PATH_PATTERN.test(pathWithHash)) reasons.add('login-redirect')
  } catch {
    // The page URL may be a transient browser-internal URL.
  }

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

      const visiblePasswordInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(isVisible)
      const visibleInputs = Array.from(document.querySelectorAll('input, button, select, textarea')).filter(isVisible)
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim()
      const credentialInputs = Array.from(document.querySelectorAll('input'))
        .filter(isVisible)
        .filter((element) => {
          const input = element as HTMLInputElement
          const type = input.type.toLowerCase()
          const autocomplete = input.autocomplete.toLowerCase()
          return (
            type === 'password' ||
            type === 'email' ||
            type === 'tel' ||
            ['username', 'current-password', 'new-password', 'one-time-code', 'email', 'tel'].includes(autocomplete)
          )
        })
      const strongCredentialInputs = credentialInputs.filter((element) => {
        const input = element as HTMLInputElement
        return (
          input.type.toLowerCase() === 'password' ||
          ['username', 'current-password', 'new-password', 'one-time-code'].includes(input.autocomplete.toLowerCase())
        )
      })
      const machineAuthPattern = /(?:^|[\s_-])(?:auth|login|signin|sign-in|sso|passport)(?:$|[\s_-])/i
      const isAuthForm = (form: HTMLFormElement): boolean => {
        const identity = [
          form.id,
          typeof form.className === 'string' ? form.className : '',
          form.getAttribute('data-testid') || '',
          form.getAttribute('data-purpose') || '',
          form.getAttribute('action') || '',
        ].join(' ')
        return machineAuthPattern.test(identity) || Boolean(form.querySelector('input[type="password"]'))
      }
      const visibleForms = Array.from(document.querySelectorAll('form')).filter(isVisible)
      const visibleAuthForms = visibleForms.filter(isAuthForm)
      const hasSubmitControl = Array.from(
        document.querySelectorAll('button[type="submit"], input[type="submit"], form button:not([type])'),
      ).some(isVisible)
      const hasActionControl = Array.from(
        document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'),
      ).some(isVisible)

      const dialogSelectors = [
        'dialog[open]',
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[class*="login"][class*="modal"]',
        '[class*="signin"][class*="modal"]',
        '[class*="Login"][class*="Modal"]',
        '[class*="SignIn"][class*="Modal"]',
      ]
      const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
      const blockingLoginDialog = Array.from(document.querySelectorAll(dialogSelectors.join(',')))
        .filter(isVisible)
        .some((element) => {
          const rect = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)
          const coversEnoughSpace = (rect.width * rect.height) / viewportArea >= 0.2
          const overlaysContent =
            style.position === 'fixed' || style.position === 'sticky' || element.tagName === 'DIALOG'
          const containsCredential = Boolean(
            element.querySelector(
              'input[type="password"], input[autocomplete="username"], input[autocomplete="current-password"], input[autocomplete="one-time-code"]',
            ),
          )
          const containsAuthForm = Array.from(element.querySelectorAll('form')).some((form) =>
            isAuthForm(form as HTMLFormElement),
          )
          return (containsCredential || containsAuthForm) && coversEnoughSpace && overlaysContent
        })

      const compactAuthSurface = bodyText.length > 0 && bodyText.length < 5000 && visibleInputs.length <= 30
      const hasCredentialFlow =
        strongCredentialInputs.length > 0 &&
        ((credentialInputs.length > 0 && hasSubmitControl) || (credentialInputs.length >= 2 && hasActionControl))
      const loginOnlyPage = compactAuthSurface && (visibleAuthForms.length > 0 || hasCredentialFlow)

      return {
        blockingLoginDialog,
        loginOnlyPage,
        passwordForm: visiblePasswordInputs.length > 0,
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
