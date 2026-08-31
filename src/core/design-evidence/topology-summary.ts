import type { DesignEvidence, SectionEvidence } from './types.js'

function compactConsecutive(values: readonly string[]): string[] {
  const compacted: string[] = []
  for (let index = 0; index < values.length;) {
    const value = values[index]
    let count = 1
    while (values[index + count] === value) count++
    compacted.push(count > 1 ? `${value} ×${count}` : value)
    index += count
  }
  return compacted
}

/** Render sibling order while preserving observed parent/child section relationships. */
export function formatPageSectionTopology(
  evidence: Pick<DesignEvidence, 'topology' | 'sections'>,
  pageId: string,
  formatRole: (role: SectionEvidence['role']) => string = (role) => role,
): string {
  const topology = evidence.topology.pages.find((page) => page.pageId === pageId)
  if (!topology) return ''
  const orderedSections = topology.sectionIds.flatMap((id) => {
    const section = evidence.sections.find((candidate) => candidate.id === id && candidate.pageId === pageId)
    return section ? [section] : []
  })
  const sectionById = new Map(orderedSections.map((section) => [section.id, section]))
  const childrenByParent = new Map<string, SectionEvidence[]>()
  for (const section of orderedSections) {
    if (!section.parentSectionId || !sectionById.has(section.parentSectionId)) continue
    const children = childrenByParent.get(section.parentSectionId) || []
    children.push(section)
    childrenByParent.set(section.parentSectionId, children)
  }

  const render = (
    section: SectionEvidence,
    ancestors: ReadonlySet<string>,
    parentRole?: SectionEvidence['role'],
  ): string[] => {
    if (ancestors.has(section.id)) return []
    const nextAncestors = new Set(ancestors).add(section.id)
    const childParentRole = section.role === 'unknown' ? parentRole : section.role
    const children = compactConsecutive(
      (childrenByParent.get(section.id) || []).flatMap((child) => render(child, nextAncestors, childParentRole)),
    )

    // Unknown nodes are classification gaps, not observed content sections.
    // Collapse wrappers so known descendants keep their order, and omit leaves.
    if (section.role === 'unknown') return children
    // Nested landmarks and wrappers can independently receive the same role.
    // Collapse the duplicate label while retaining more specific descendants.
    if (section.role === parentRole) return children

    const role = formatRole(section.role)
    return [children.length > 0 ? `${role} (${children.join(' → ')})` : role]
  }

  const roots = orderedSections.filter(
    (section) => !section.parentSectionId || !sectionById.has(section.parentSectionId),
  )
  const renderableRoots = roots.length > 0 ? roots : orderedSections
  return compactConsecutive(renderableRoots.flatMap((section) => render(section, new Set()))).join(' → ')
}
