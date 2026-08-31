import type { AuthWallDetection } from './auth-wall.js'
import type { ExtractionIssue } from './types.js'

export class AuthenticationRequiredError extends Error {
  readonly code = 'AUTH_REQUIRED'

  constructor(readonly detection: AuthWallDetection) {
    super('Authentication is required to access the target page')
    this.name = 'AuthenticationRequiredError'
  }
}

export class AuthenticationCancelledError extends Error {
  readonly code = 'AUTH_CANCELLED'

  constructor() {
    super('Authentication was cancelled')
    this.name = 'AuthenticationCancelledError'
  }
}

export class AuthenticationBrowserClosedError extends Error {
  readonly code = 'AUTH_BROWSER_CLOSED'

  constructor() {
    super('The sign-in browser was closed before analysis could continue. Your saved sign-in may still be available.')
    this.name = 'AuthenticationBrowserClosedError'
  }
}

export class NoUsableCapturesError extends Error {
  readonly code = 'NO_USABLE_CAPTURES'

  constructor(readonly extractionIssues: readonly ExtractionIssue[] = []) {
    super('No usable page captures were produced')
    this.name = 'NoUsableCapturesError'
  }
}
