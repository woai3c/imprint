import type { DesignIntelligenceMeta } from './types.js'

function diagnosticPath(diagnostic: string): string {
  return diagnostic.split(':', 1)[0]
}

function claimPath(path: string): string {
  return path.replace(/\.assertions\.\d+(?:\..*)?$/, '')
}

export function summarizeInterpretationDiagnostics(
  rejected: readonly string[] = [],
  repaired: readonly string[] = [],
): NonNullable<DesignIntelligenceMeta['diagnosticCounts']> {
  const selectionDiagnostics = rejected.filter((diagnostic) => diagnostic.startsWith('selection'))
  const profileDiagnostics = rejected.filter((diagnostic) => !diagnostic.startsWith('selection'))
  const assertionDiagnostics = profileDiagnostics.filter((diagnostic) =>
    /\.assertions\.\d+/.test(diagnosticPath(diagnostic)),
  )
  const claimDiagnostics = profileDiagnostics.filter(
    (diagnostic) => !/\.assertions\.\d+/.test(diagnosticPath(diagnostic)),
  )
  const affected = new Set(
    profileDiagnostics.map((diagnostic) => claimPath(diagnosticPath(diagnostic))).filter(Boolean),
  )
  return {
    rejectedClaims: claimDiagnostics.length,
    rejectedAssertions: assertionDiagnostics.length,
    affectedClaimPaths: affected.size,
    repairEvents: repaired.length,
    selectionDiagnostics: selectionDiagnostics.length,
  }
}
