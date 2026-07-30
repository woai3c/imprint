import { createHash } from 'node:crypto'

export function createEvidenceId(kind: string, ...parts: Array<string | number>): string {
  const digest = createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 12)
  return `${kind}-${digest}`
}
