export function extractComparableTerms(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  const terms = normalized.split(/\s+/).filter((word) => word.length >= 3 && !/^[\u3400-\u9fff]+$/u.test(word))
  for (const run of normalized.match(/[\u3400-\u9fff]+/gu) || []) {
    for (let index = 0; index < run.length - 1; index += 1) terms.push(run.slice(index, index + 2))
  }
  return new Set(terms)
}
