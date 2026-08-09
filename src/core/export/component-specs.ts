import type { DesignEvidence } from '../design-evidence/types.js'

export interface ComponentSpec {
  component: string
  role?: string
  sourceInstances: number
  pageCount: number
  styles: Record<string, string[]>
  tokenRefs: string[]
  stateRefs: string[]
  evidenceRefs: string[]
}

export function buildComponentSpecs(evidence: DesignEvidence): ComponentSpec[] {
  const pageUrls = new Map(evidence.pages.map((page) => [page.id, page.url]))
  const groups = new Map<
    string,
    {
      component: string
      role?: string
      pages: Set<string>
      styles: Map<string, Set<string>>
      tokenRefs: Set<string>
      stateRefs: Set<string>
      evidenceRefs: Set<string>
      count: number
    }
  >()
  for (const component of evidence.components) {
    const key = `${component.type}|${component.role || ''}`
    const group = groups.get(key) || {
      component: component.type,
      role: component.role,
      pages: new Set<string>(),
      styles: new Map<string, Set<string>>(),
      tokenRefs: new Set<string>(),
      stateRefs: new Set<string>(),
      evidenceRefs: new Set<string>(),
      count: 0,
    }
    group.count += 1
    const pageUrl = pageUrls.get(component.pageId)
    if (pageUrl) group.pages.add(pageUrl)
    Object.entries(component.styles).forEach(([property, value]) => {
      const values = group.styles.get(property) || new Set<string>()
      values.add(value)
      group.styles.set(property, values)
    })
    component.tokenRefs.forEach((tokenRef) => group.tokenRefs.add(tokenRef))
    component.stateRefs.forEach((stateRef) => group.stateRefs.add(stateRef))
    ;[component.id, ...component.evidenceRefs].forEach((evidenceRef) => group.evidenceRefs.add(evidenceRef))
    groups.set(key, group)
  }
  return [...groups.values()]
    .map((group) => ({
      component: group.component,
      ...(group.role ? { role: group.role } : {}),
      sourceInstances: group.count,
      pageCount: group.pages.size,
      styles: Object.fromEntries(
        [...group.styles].map(([property, values]) => [property, [...values].sort().slice(0, 8)]),
      ),
      tokenRefs: [...group.tokenRefs].sort(),
      stateRefs: [...group.stateRefs].sort(),
      evidenceRefs: [...group.evidenceRefs].sort().slice(0, 24),
    }))
    .sort(
      (first, second) =>
        second.sourceInstances - first.sourceInstances || first.component.localeCompare(second.component),
    )
}

export function generateComponentSpecsJson(evidence: DesignEvidence): string {
  return JSON.stringify({ schemaVersion: '1', components: buildComponentSpecs(evidence) }, null, 2)
}
