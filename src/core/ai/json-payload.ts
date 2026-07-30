import { isRecord } from '../../shared/type-guards.js'

export function parseJsonObjects(value: string): unknown[] {
  const objects: unknown[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (character !== '}' || depth === 0) continue
    depth -= 1
    if (depth !== 0 || start < 0) continue
    try {
      objects.push(JSON.parse(value.slice(start, index + 1)))
    } catch {
      // Ignore non-JSON braces emitted by a CLI and keep scanning.
    }
    start = -1
  }
  return objects
}

export function findJsonPayload(
  value: unknown,
  matches: (candidate: Record<string, unknown>) => boolean,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 6) return null
  if (isRecord(value) && matches(value)) return value

  if (typeof value === 'string') {
    const candidates = parseJsonObjects(value)
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const payload = findJsonPayload(candidates[index], matches, depth + 1)
      if (payload) return payload
    }
    return null
  }

  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const payload = findJsonPayload(value[index], matches, depth + 1)
      if (payload) return payload
    }
    return null
  }

  if (isRecord(value)) {
    for (const nested of Object.values(value)) {
      const payload = findJsonPayload(nested, matches, depth + 1)
      if (payload) return payload
    }
  }

  return null
}
