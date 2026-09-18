import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { type AnalysisArtifactBundle, buildAnalysisArtifacts } from './analysis-artifacts.js'
import { analyze } from './analyzer/index.js'
import type { AnalysisProgress, AnalysisResult } from './analyzer/types.js'
import { formatExtractionIssueDiagnosticsForDisplay } from './analyzer/url-privacy.js'
import { getDefaultDataDir } from './data-dir.js'
import {
  type ArtifactFormat,
  EXTRACTION_FORMATS,
  type ExtractionRequest,
  selectedFormats,
} from './extraction-request.js'
import { coreT } from './i18n/index.js'

export interface TextArtifact {
  format: ArtifactFormat
  filename: string
  mimeType: string
  content: string
}

export interface SaveManifest {
  saved: true
  artifacts: Array<Omit<TextArtifact, 'content'> & { path: string }>
  assets: Array<{ path: string; mimeType: string }>
}

export interface ExtractionDelivery {
  text: string
  structuredContent: Record<string, unknown>
  saved?: SaveManifest
  warnings: string[]
}

interface DeliveryHooks {
  signal?: AbortSignal
  onProgress?: (progress: AnalysisProgress) => void
  onDiagnostic?: (message: string) => void
}

export function selectTextArtifacts(bundle: AnalysisArtifactBundle, formats: ArtifactFormat[]): TextArtifact[] {
  return formats.map((format) => {
    const { filename, mimeType, field } = EXTRACTION_FORMATS[format]
    return { format, filename, mimeType, content: `${bundle[field].replace(/\n*$/, '')}\n` }
  })
}

function validateTargets(targets: string[], overwrite: boolean): void {
  for (const target of targets) {
    let stat: fs.Stats
    try {
      stat = fs.lstatSync(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (!overwrite || !stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(coreT('en', 'extraction.errors.output-conflict', { value: target }))
    }
  }
}

/** Project capture availability without changing observations or the analyzer's raw dark-mode provenance. */
function portableArtifacts(result: AnalysisResult, request: ExtractionRequest) {
  const evidence = structuredClone(result.designEvidence)
  const assets = new Map<string, string>()
  for (const page of evidence.pages) {
    for (const image of page.images) {
      if (request.options.output && image.path) {
        const relative = `assets/${path.basename(image.path)}`
        assets.set(relative, image.path)
        image.path = relative
      } else {
        image.path = ''
        image.fileAvailability = 'not-retained'
      }
    }
  }
  const bundle = buildAnalysisArtifacts(result, { sourceUrl: request.url, language: 'en', contextEvidence: evidence })
  const artifacts = selectTextArtifacts(bundle, selectedFormats(request.options.format))
  // Only the selected exports determine which captures must remain accessible.
  const referencedAssets = [...assets].filter(([relative]) =>
    artifacts.some((artifact) => artifact.content.includes(relative)),
  )
  return { bundle, artifacts, referencedAssets }
}

function saveArtifacts(
  output: string,
  overwrite: boolean,
  artifacts: TextArtifact[],
  assets: Array<[string, string]>,
): SaveManifest {
  const manifest: SaveManifest = {
    saved: true,
    artifacts: artifacts.map(({ content: _content, ...artifact }) => ({
      ...artifact,
      path: path.join(output, artifact.filename),
    })),
    assets: assets.map(([relative]) => ({ path: path.join(output, relative), mimeType: 'image/png' })),
  }
  validateTargets(
    [...manifest.artifacts, ...manifest.assets].map((artifact) => artifact.path),
    overwrite,
  )
  const attempted: string[] = []
  try {
    fs.mkdirSync(output, { recursive: true })
    for (const [relative, source] of assets) {
      const target = path.join(output, relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      attempted.push(target)
      fs.copyFileSync(source, target, overwrite ? 0 : fs.constants.COPYFILE_EXCL)
    }
    for (const artifact of artifacts) {
      const target = path.join(output, artifact.filename)
      attempted.push(target)
      fs.writeFileSync(target, artifact.content, { encoding: 'utf8', flag: overwrite ? 'w' : 'wx' })
    }
  } catch (error) {
    throw new Error(
      coreT('en', 'extraction.errors.write-failed', {
        value: error instanceof Error ? error.message : String(error),
        files: attempted.join(', '),
      }),
      { cause: error },
    )
  }
  return manifest
}

/** Both automation adapters use this lifetime; Desktop continues to own its persistent storage. */
export async function runExtraction(
  request: ExtractionRequest,
  hooks: DeliveryHooks = {},
): Promise<ExtractionDelivery> {
  const { url, options } = request
  hooks.signal?.throwIfAborted()
  if (options.output) {
    validateTargets(
      selectedFormats(options.format).map((format) => path.join(options.output!, EXTRACTION_FORMATS[format].filename)),
      options.overwrite,
    )
  }
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-extract-'))
  const removeWorkspace = () => fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  const cleanupAbortedWorkspace = () => {
    try {
      // Cancellation has no response acknowledgement, so remove request-owned files as soon as the signal arrives.
      removeWorkspace()
    } catch {
      hooks.onDiagnostic?.(coreT('en', 'extraction.errors.cleanup-failed', { value: workspace }))
    }
  }
  hooks.signal?.addEventListener('abort', cleanupAbortedWorkspace, { once: true })
  let delivery: ExtractionDelivery | undefined
  let failure: unknown
  try {
    const result = await analyze(
      url,
      {
        dataDir: workspace,
        ...(options.useSession ? { sessionDataDir: getDefaultDataDir() } : {}),
        viewports: options.viewports,
        useSession: options.useSession,
        extractDarkMode: options.darkMode,
        maxPages: options.maxPages,
        pageDiscovery: options.pageDiscovery,
        browserPath: options.browserPath,
        signal: hooks.signal,
      },
      hooks.onProgress,
    )
    hooks.signal?.throwIfAborted()
    const { bundle, artifacts, referencedAssets } = portableArtifacts(result, request)
    const metadata = {
      pageCoverage: bundle.pageCoverage,
      completion: result.completion,
      extractionIssues: bundle.extractionIssues,
      analysisTiming: result.timing,
    }
    const warnings: string[] = []
    if (options.deprecatedPdf) warnings.push(coreT('en', 'extraction.pdf-alias'))
    if (options.useSession) warnings.push(coreT('en', 'extraction.session-persistence'))
    if (result.completion.reason === 'user-finished')
      warnings.push(coreT('en', 'cli.completion.userFinished', { pages: result.pageCoverage.analyzed }))
    const diagnostics = formatExtractionIssueDiagnosticsForDisplay(bundle.extractionIssues, [url])
    if (diagnostics) warnings.push(diagnostics)
    if (options.output) {
      const saved = saveArtifacts(options.output, options.overwrite, artifacts, referencedAssets)
      const manifest = { ...saved, warnings }
      delivery = { text: JSON.stringify(manifest, null, 2), structuredContent: manifest, saved, warnings }
    } else if (options.jsonStdout || options.format === 'tokens') {
      const legacy = options.jsonStdout
        ? bundle.darkMode?.darkTokens
          ? { ...bundle.tokens, darkMode: { method: bundle.darkMode.method, tokens: bundle.darkMode.darkTokens } }
          : bundle.tokens
        : { tokens: bundle.tokens, darkMode: bundle.darkMode, featureTags: result.featureTags, ...metadata }
      delivery = { text: `${JSON.stringify(legacy, null, 2)}\n`, structuredContent: { ...legacy }, warnings }
    } else if (options.format === 'all') {
      const all = { artifacts, ...(warnings.length ? { warnings } : {}) }
      delivery = { text: `${JSON.stringify(all, null, 2)}\n`, structuredContent: all, warnings }
    } else {
      delivery = { text: artifacts[0].content, structuredContent: { ...metadata, warnings }, warnings }
    }
  } catch (error) {
    failure = error
  } finally {
    hooks.signal?.removeEventListener('abort', cleanupAbortedWorkspace)
    try {
      // This exact mkdtemp result is owned by this invocation, never a caller-provided path.
      removeWorkspace()
    } catch (error) {
      const message = coreT('en', 'extraction.errors.cleanup-failed', { value: workspace })
      hooks.onDiagnostic?.(message)
      if (!hooks.signal?.aborted) failure = new Error(message, { cause: error })
    }
  }
  hooks.signal?.throwIfAborted()
  if (failure) throw failure
  return delivery!
}
