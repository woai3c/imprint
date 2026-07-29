import { v4 as uuidv4 } from 'uuid'

import type { BrowserWindow } from 'electron'

import type { LoginDecision, LoginRequest } from '../core/analyzer/types.js'

interface PendingLoginDecision {
  requestId: string
  senderId: number
  settle: (decision: LoginDecision) => void
}

let pendingLoginDecision: PendingLoginDecision | null = null

export function waitForLoginDecision(
  win: BrowserWindow | null,
  request: LoginRequest,
  signal: AbortSignal,
): Promise<LoginDecision> {
  if (!win || win.isDestroyed()) return Promise.resolve('cancel')

  pendingLoginDecision?.settle('cancel')

  return new Promise((resolve) => {
    const requestId = uuidv4()
    let settled = false

    const settle = (decision: LoginDecision) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', handleAbort)
      win.webContents.removeListener('destroyed', handleDestroyed)
      if (pendingLoginDecision?.requestId === requestId) pendingLoginDecision = null
      resolve(decision)
    }
    const handleAbort = () => settle('cancel')
    const handleDestroyed = () => settle('cancel')

    pendingLoginDecision = {
      requestId,
      senderId: win.webContents.id,
      settle,
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    win.webContents.once('destroyed', handleDestroyed)
    win.webContents.send('analysis:loginRequired', {
      requestId,
      detection: request.detection,
      retry: request.retry,
    })
  })
}

export function submitLoginDecision(senderId: number, requestId: string, decision: LoginDecision): boolean {
  const pending = pendingLoginDecision
  if (
    !pending ||
    pending.requestId !== requestId ||
    pending.senderId !== senderId ||
    (decision !== 'continue' && decision !== 'anonymous' && decision !== 'cancel')
  ) {
    return false
  }

  pending.settle(decision)
  return true
}
