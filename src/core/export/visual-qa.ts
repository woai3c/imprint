import { evidencePageRouteIdentity } from '../analyzer/url-identity.js'
import type { DesignEvidence } from '../design-evidence/types.js'

export type VisualQaStatus = 'pass' | 'warning' | 'fail'

export interface VisualQaCheck {
  id: string
  status: VisualQaStatus
  message: string
  evidenceRefs: string[]
}

export interface VisualQaReport {
  schemaVersion: '1'
  summary: { pass: number; warning: number; fail: number }
  checks: VisualQaCheck[]
}

export function generateLocalVisualQa(evidence: DesignEvidence): VisualQaReport {
  const checks: VisualQaCheck[] = []
  for (const page of evidence.pages) {
    const health = page.health
    checks.push({
      id: `page-health:${page.id}`,
      status: health?.status === 'unusable' ? 'fail' : health?.status === 'degraded' ? 'warning' : 'pass',
      message: health
        ? `Page health is ${health.status}; ${health.issues.map((issue) => issue.code).join(', ') || 'no issues'}.`
        : 'Page health predates health-gate instrumentation.',
      evidenceRefs: [page.id, ...page.images.slice(0, 1).map((image) => image.id)],
    })
    checks.push({
      id: `overflow:${page.id}`,
      status: page.horizontalOverflow ? 'warning' : 'pass',
      message: page.horizontalOverflow
        ? `Content width ${page.contentWidth || 0}px exceeds viewport width ${page.viewportWidth || 0}px.`
        : 'No horizontal overflow was measured.',
      evidenceRefs: [page.id],
    })
    const invalidImages = page.images.filter((image) => image.width <= 0 || image.height <= 0)
    checks.push({
      id: `screenshot-dimensions:${page.id}`,
      status: invalidImages.length > 0 ? 'fail' : page.images.length === 0 ? 'warning' : 'pass',
      message:
        invalidImages.length > 0
          ? 'One or more screenshots have invalid dimensions.'
          : page.images.length === 0
            ? 'No screenshot evidence is available.'
            : 'Screenshot dimensions are valid.',
      evidenceRefs: invalidImages.map((image) => image.id),
    })
  }

  const byUrl = new Map<string, Set<string>>()
  evidence.pages.forEach((page) => {
    const routeIdentity = evidencePageRouteIdentity(page)
    const viewports = byUrl.get(routeIdentity) || new Set<string>()
    viewports.add(page.viewport)
    byUrl.set(routeIdentity, viewports)
  })
  for (const [routeIdentity, viewports] of byUrl) {
    const pages = evidence.pages.filter((page) => evidencePageRouteIdentity(page) === routeIdentity)
    checks.push({
      id: `responsive:${pages[0]?.id || routeIdentity}`,
      status: viewports.size >= 2 ? 'pass' : 'warning',
      message:
        viewports.size >= 2
          ? `Responsive evidence covers ${[...viewports].join(', ')}.`
          : 'Only one viewport was captured; responsive behavior remains partially unknown.',
      evidenceRefs: pages.map((page) => page.id),
    })
  }

  const summary = checks.reduce((result, check) => ({ ...result, [check.status]: result[check.status] + 1 }), {
    pass: 0,
    warning: 0,
    fail: 0,
  })
  return { schemaVersion: '1', summary, checks }
}

export function comparePixelBuffers(
  baseline: Uint8Array,
  candidate: Uint8Array,
  channels = 4,
  threshold = 16,
): { sampledPixels: number; changedPixels: number; changedRatio: number; meanChannelDelta: number } {
  const length = Math.min(baseline.length, candidate.length)
  const pixelCount = Math.floor(length / channels)
  const stride = Math.max(1, Math.floor(pixelCount / 250_000))
  let sampledPixels = 0
  let changedPixels = 0
  let deltaTotal = 0
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    sampledPixels += 1
    let pixelDelta = 0
    for (let channel = 0; channel < Math.min(channels, 3); channel += 1) {
      pixelDelta += Math.abs(baseline[pixel * channels + channel] - candidate[pixel * channels + channel])
    }
    const meanDelta = pixelDelta / Math.min(channels, 3)
    deltaTotal += meanDelta
    if (meanDelta > threshold) changedPixels += 1
  }
  return {
    sampledPixels,
    changedPixels,
    changedRatio: sampledPixels > 0 ? changedPixels / sampledPixels : 0,
    meanChannelDelta: sampledPixels > 0 ? deltaTotal / sampledPixels : 0,
  }
}
