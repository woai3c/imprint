import { createHash } from 'node:crypto'

import type { DesignEvidence } from '../design-evidence/types.js'

export interface InterpretationCacheKeyInput {
  fingerprint: string
  provider: string
  model: string
  reasoningEffort: string
  thinkingEnabled: boolean
  language: 'en' | 'zh-CN'
  promptVersion: string
  schemaVersion: string
  accessMode: DesignEvidence['source']['accessMode']
}

export function createInterpretationCacheKey(input: InterpretationCacheKeyInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}
