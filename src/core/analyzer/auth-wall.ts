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
      const verificationPattern =
        /验证码|驗證碼|短信|簡訊|手机|手機|手机号|手機號|verification\s*code|one[-\s]*time|phone|mobile/i
      const credentialFieldPattern =
        /账号|帳號|用户名|使用者名稱|邮箱|郵箱|手机|手機|手机号|手機號|验证码|驗證碼|account|username|e-?mail|phone|mobile|verification/i
      const credentialInputs = Array.from(document.querySelectorAll('input'))
        .filter(isVisible)
        .filter((element) => {
          const input = element as HTMLInputElement
          const type = input.type.toLowerCase()
          const autocomplete = input.autocomplete.toLowerCase()
          const fieldText = [input.name, input.placeholder, input.getAttribute('aria-label') || ''].join(' ')
          return (
            type === 'password' ||
            type === 'email' ||
            type === 'tel' ||
            /username|current-password|one-time-code|email|tel/.test(autocomplete) ||
            credentialFieldPattern.test(fieldText)
          )
        })
      const actionText = Array.from(
        document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'),
      )
        .filter(isVisible)
        .map((element) => (element instanceof HTMLInputElement ? element.value : element.textContent || ''))
        .join(' ')
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
      const hasLoginAction = loginPattern.test(actionText)
      const hasVerificationEvidence = verificationPattern.test(bodyText)
      const compactAuthSurface = bodyText.length > 0 && bodyText.length < 5000 && visibleInputs.length <= 30
      const loginOnlyPage =
        compactAuthSurface &&
        ((hasLoginHeading && (hasLoginForm || credentialInputs.length > 0)) ||
          (hasLoginForm && hasLoginAction) ||
          (hasLoginAction && credentialInputs.length > 0 && (hasVerificationEvidence || credentialInputs.length >= 2)))

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
