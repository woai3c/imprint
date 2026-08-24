import { normalizeColorValue } from '../analyzer/color-cluster.js'
import type { DesignToken } from '../analyzer/types.js'
import { sanitizeDesignTokensForPersistence, sanitizeUrlForPersistence } from '../analyzer/url-privacy.js'
import type { DarkModeExportData } from './dark-mode.js'
import { RADIUS_NAMES, SHADOW_NAMES } from './token-names.js'

export function generatePdfHtml(
  tokens: DesignToken,
  url?: string,
  featureTags?: string[],
  darkMode?: DarkModeExportData,
): string {
  const escapeHtml = (value: unknown): string =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  const safeSwatchColor = (value: string): string => normalizeColorValue(value) || 'transparent'
  const publicTokens = sanitizeDesignTokensForPersistence(tokens)
  const publicDarkTokens = darkMode?.darkTokens ? sanitizeDesignTokensForPersistence(darkMode.darkTokens) : undefined
  const publicUrl = url ? sanitizeUrlForPersistence(url) : undefined
  const sourceLink = (() => {
    if (!publicUrl) return ''
    try {
      const parsed = new URL(publicUrl)
      const label = escapeHtml(publicUrl)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        ? `<p>Source: <a href="${escapeHtml(publicUrl)}">${label}</a></p>`
        : `<p>Source: ${label}</p>`
    } catch {
      return `<p>Source: ${escapeHtml(publicUrl)}</p>`
    }
  })()
  const colorSwatches = Object.entries(publicTokens.colors)
    .map(
      ([name, value]) =>
        `<div style="display:inline-flex;align-items:center;gap:8px;margin:4px 0;">
      <div style="width:24px;height:24px;border-radius:4px;background:${safeSwatchColor(value)};border:1px solid #ddd;"></div>
      <code>--color-${escapeHtml(name)}</code>: <code>${escapeHtml(value)}</code>
    </div>`,
    )
    .join('<br>')
  const darkColorSwatches = publicDarkTokens
    ? Object.entries(publicDarkTokens.colors)
        .map(
          ([name, value]) =>
            `<div style="display:inline-flex;align-items:center;gap:8px;margin:4px 0;">
      <div style="width:24px;height:24px;border-radius:4px;background:${safeSwatchColor(value)};border:1px solid #555;"></div>
      <code>--color-${escapeHtml(name)}</code>: <code>${escapeHtml(value)}</code>
    </div>`,
        )
        .join('<br>')
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Design Style Guide</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; }
  h1 { font-size: 28px; border-bottom: 2px solid #e5e5e5; padding-bottom: 12px; }
  h2 { font-size: 20px; margin-top: 32px; color: #333; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  .tag { display: inline-block; background: #e8f0fe; color: #1967d2; padding: 3px 10px; border-radius: 12px; font-size: 12px; margin: 2px; }
  .section { margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
  th { background: #f9f9f9; font-weight: 600; }
</style>
</head>
<body>
<h1>Design Style Guide</h1>
${sourceLink}
${featureTags?.length ? `<p>${featureTags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(' ')}</p>` : ''}

<h2>Colors</h2>
<div class="section">${colorSwatches}</div>
${darkColorSwatches ? `<h2>Dark Mode Colors</h2><div class="section">${darkColorSwatches}</div>` : ''}

<h2>Typography</h2>
<div class="section">
  <p><strong>Font families:</strong> ${escapeHtml(publicTokens.typography.fontFamilies.join(', ') || 'System default')}</p>
  ${publicTokens.typography.fontStacks?.length ? `<p><strong>Full stacks:</strong></p><ul>${publicTokens.typography.fontStacks.map((stack) => `<li><code>${escapeHtml(stack)}</code></li>`).join('')}</ul>` : ''}
  <p><strong>Font sizes:</strong> ${escapeHtml(publicTokens.typography.fontSizes.join(', '))}</p>
  <p><strong>Font weights:</strong> ${escapeHtml(publicTokens.typography.fontWeights.join(', '))}</p>
  ${publicTokens.typography.letterSpacings?.length ? `<p><strong>Letter spacing:</strong> ${escapeHtml(publicTokens.typography.letterSpacings.join(', '))}</p>` : ''}
</div>

<h2>Spacing</h2>
<div class="section">
  <table>
    <tr><th>Level</th><th>Value</th></tr>
    ${publicTokens.spacing.map((spacing, index) => `<tr><td>${index + 1}</td><td><code>${escapeHtml(spacing)}</code></td></tr>`).join('\n    ')}
  </table>
</div>

<h2>Border Radius</h2>
<div class="section">
  <table>
    <tr><th>Size</th><th>Value</th></tr>
    ${publicTokens.radii.map((radius, index) => `<tr><td>${escapeHtml(RADIUS_NAMES[index] || index)}</td><td><code>${escapeHtml(radius)}</code></td></tr>`).join('\n    ')}
  </table>
</div>

${
  publicTokens.shadows.length > 0
    ? `<h2>Shadows</h2>
<div class="section">
  ${publicTokens.shadows.map((shadow, index) => `<p>${escapeHtml(SHADOW_NAMES[index] || index)}: <code>${escapeHtml(shadow)}</code></p>`).join('\n  ')}
</div>`
    : ''
}
${
  publicTokens.zIndices?.length
    ? `<h2>Z-Index Layers</h2>
<div class="section"><code>${escapeHtml(publicTokens.zIndices.join(' | '))}</code></div>`
    : ''
}
${
  publicTokens.transitions?.length
    ? `<h2>Transitions</h2>
<div class="section"><code>${escapeHtml(publicTokens.transitions.join(' | '))}</code></div>`
    : ''
}
</body>
</html>`
}
