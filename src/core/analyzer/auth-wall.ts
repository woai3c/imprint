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
      const loginPattern =
        /登录|登入|登錄|登陆|扫码|掃碼|sign\s*in|log\s*in|authenticate|authentication|connexion|anmelden/i

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
      const headingText = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
        .filter(isVisible)
        .map((element) => element.textContent || '')
        .join(' ')

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
          const text = element.textContent || ''
          const coversEnoughSpace = (rect.width * rect.height) / viewportArea >= 0.2
          const overlaysContent =
            style.position === 'fixed' || style.position === 'sticky' || element.tagName === 'DIALOG'
          return loginPattern.test(text) && coversEnoughSpace && overlaysContent
        })

      const hasLoginHeading = loginPattern.test(headingText)
      const hasLoginForm = Array.from(document.querySelectorAll('form'))
        .filter(isVisible)
        .some((form) => loginPattern.test(form.textContent || '') || form.querySelector('input[type="password"]'))
      const loginOnlyPage =
        hasLoginHeading &&
        (hasLoginForm || (bodyText.length > 0 && bodyText.length < 3000 && visibleInputs.length <= 20))

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
