import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { auditArtifactBundle } from './audit-design-doc.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultManifestPath = path.join(repositoryRoot, 'tests/live-corpus/mainstream-20.json')
const terminalResumeStatuses = new Set(['pass', 'degraded-but-truthful', 'external-refusal'])
export const LIVE_CORPUS_SITE_TIMEOUT_MS = 15 * 60 * 1000
const artifactFiles = {
  'DESIGN.md': 'designDoc',
  'design-evidence.json': 'evidenceJson',
  'design-tokens.json': 'dtcgJson',
  'design-profile.json': 'profileJson',
  'component-specs.json': 'componentSpecsJson',
  'visual-qa.json': 'visualQaJson',
  'variables.css': 'cssVariables',
  'variables.scss': 'scssVariables',
  'theme.css': 'tailwindTheme',
  'style-guide.html': 'pdfHtml',
}

export function scheduleLiveCorpusSiteTimeout(controller, siteId, timeoutMs = LIVE_CORPUS_SITE_TIMEOUT_MS) {
  const timer = setTimeout(() => {
    controller.abort(new Error(`Live corpus site ${siteId} exceeded the ${Math.round(timeoutMs / 60000)} minute limit`))
  }, timeoutMs)
  timer.unref?.()
  return () => clearTimeout(timer)
}

function readOption(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

export function parseLiveCorpusArguments(args) {
  const known = new Set([
    '--manifest',
    '--output',
    '--batch',
    '--concurrency',
    '--browser-path',
    '--no-resume',
    '--help',
  ])
  for (const argument of args) {
    if (argument.startsWith('--') && !known.has(argument)) throw new Error(`Unknown option ${argument}`)
  }
  const concurrency = Number(readOption(args, '--concurrency') || 10)
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
    throw new Error('--concurrency must be an integer between 1 and 10')
  }
  const batch = readOption(args, '--batch') || 'all'
  if (!['1', '2', 'all'].includes(batch)) throw new Error('--batch must be 1, 2, or all')
  return {
    manifestPath: path.resolve(repositoryRoot, readOption(args, '--manifest') || defaultManifestPath),
    outputPath: readOption(args, '--output') ? path.resolve(repositoryRoot, readOption(args, '--output')) : undefined,
    browserPath: readOption(args, '--browser-path'),
    concurrency,
    batch,
    resume: !args.includes('--no-resume'),
    help: args.includes('--help'),
  }
}

export function validateLiveCorpusManifest(manifest) {
  if (manifest?.schemaVersion !== '1') throw new Error('Manifest schemaVersion must be "1"')
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(manifest.id || '')) throw new Error('Manifest id is invalid')
  const request = manifest.request
  if (!Number.isInteger(request?.maxPages) || request.maxPages < 1 || request.maxPages > 20) {
    throw new Error('Manifest maxPages must be an integer between 1 and 20')
  }
  if (!Array.isArray(request.viewports) || request.viewports.length === 0) {
    throw new Error('Manifest viewports must be a non-empty array')
  }
  if (request.viewportStrategy !== 'adaptive') throw new Error('Manifest viewportStrategy must be adaptive')
  if (!['auto', 'links', 'sitemap'].includes(request.pageDiscovery))
    throw new Error('Manifest pageDiscovery is invalid')
  if (!['standard', 'deep'].includes(request.depth)) throw new Error('Manifest depth is invalid')
  if (!Array.isArray(manifest.sites) || manifest.sites.length !== 20) {
    throw new Error('Manifest must contain exactly 20 sites')
  }
  const ids = new Set()
  const batchCounts = new Map()
  for (const site of manifest.sites) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(site.id || '')) throw new Error(`Invalid site id ${site.id || ''}`)
    if (ids.has(site.id)) throw new Error(`Duplicate site id ${site.id}`)
    ids.add(site.id)
    let parsed
    try {
      parsed = new URL(site.url)
    } catch {
      throw new Error(`Site ${site.id} URL is invalid`)
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Site ${site.id} must use HTTP(S)`)
    if (![1, 2].includes(site.batch)) throw new Error(`Site ${site.id} batch must be 1 or 2`)
    if (site.expectation !== 'observe') throw new Error(`Site ${site.id} expectation must be observe`)
    batchCounts.set(site.batch, (batchCounts.get(site.batch) || 0) + 1)
  }
  if (batchCounts.get(1) !== 10 || batchCounts.get(2) !== 10) {
    throw new Error('Manifest must contain two batches of exactly 10 sites')
  }
  return manifest
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return fallback
  }
}

function browserVersion(browserPath) {
  try {
    return execFileSync(browserPath, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function safePathSegment(value) {
  return value.replace(/[^a-z0-9._-]/gi, '-').replace(/^-+|-+$/g, '') || 'site'
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporary, file)
}

function writeTextAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}`
  fs.writeFileSync(temporary, value)
  fs.renameSync(temporary, file)
}

function defaultOutputPath(manifestId, commit, dirty) {
  return path.join(
    repositoryRoot,
    'tmp/live-corpus',
    `${safePathSegment(manifestId)}-${commit.slice(0, 12)}${dirty ? '-dirty' : ''}`,
  )
}

function externalRefusal(error) {
  const issues = Array.isArray(error?.extractionIssues) ? error.extractionIssues : []
  const text = [error?.message, ...issues.flatMap((issue) => [issue?.stage, issue?.reason])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return /(?:auth|access.denied|forbidden|unauthori[sz]ed|captcha|challenge|consent|http.response|response.status|robots|blocked|overlay)/.test(
    text,
  )
}

function renderSummary(run) {
  const sites = Object.values(run.sites).sort((first, second) => first.id.localeCompare(second.id))
  const counts = new Map()
  for (const site of sites) counts.set(site.status, (counts.get(site.status) || 0) + 1)
  const lines = [
    `# Live corpus ${run.manifestId}`,
    '',
    `- Commit: \`${run.commit}\`${run.dirty ? ' (dirty)' : ''}`,
    `- Browser: ${run.browser.version || run.browser.path || 'unavailable'}`,
    `- Request: ${run.request.maxPages} pages, ${run.request.viewports.join(', ')}, ${run.request.viewportStrategy}`,
    `- Results: ${[...counts.entries()].map(([status, count]) => `${status}=${count}`).join(', ') || 'none'}`,
    '',
    '| Site | Batch | Status | Pages | Captures | Duration | Audit failures |',
    '| --- | ---: | --- | ---: | ---: | ---: | --- |',
  ]
  for (const site of sites) {
    lines.push(
      `| ${site.id} | ${site.batch} | ${site.status} | ${site.pageCount ?? '-'} | ${site.captureCount ?? '-'} | ${site.durationMs ? `${Math.round(site.durationMs / 1000)}s` : '-'} | ${(site.audit?.hardFailures || []).join('; ') || '-'} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

async function runPool(items, concurrency, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      await worker(item)
    }
  })
  await Promise.all(runners)
}

function usage() {
  return `Usage: pnpm test:live-corpus -- [options]

Options:
  --manifest <path>     Corpus manifest (default: tests/live-corpus/mainstream-20.json)
  --output <directory> Output directory below tmp/ by default
  --batch <1|2|all>    Run one fixed ten-site batch or both sequentially
  --concurrency <1-10> Maximum concurrent analyses inside a batch (default: 10)
  --browser-path <path> Explicit Chrome/Edge/Chromium executable
  --no-resume          Re-run completed sites
  --help               Show this help
`
}

async function main() {
  const options = parseLiveCorpusArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }
  const manifest = validateLiveCorpusManifest(JSON.parse(fs.readFileSync(options.manifestPath, 'utf8')))
  const commit = git(['rev-parse', 'HEAD'], 'unknown')
  const dirty = Boolean(git(['status', '--porcelain'], 'unknown'))
  const outputPath = options.outputPath || defaultOutputPath(manifest.id, commit, dirty)
  fs.mkdirSync(outputPath, { recursive: true })

  const [{ analyze, findBrowser }, { buildAnalysisArtifacts }] = await Promise.all([
    import('../dist/core/analyzer/index.js'),
    import('../dist/core/analysis-artifacts.js'),
  ])
  const resolvedBrowserPath = options.browserPath || findBrowser()
  if (!resolvedBrowserPath) throw new Error('Chrome or Edge is required for the live corpus')
  const statePath = path.join(outputPath, 'run.json')
  const previous = options.resume && fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null
  const run = {
    schemaVersion: '1',
    manifestId: manifest.id,
    manifestPath: path.relative(repositoryRoot, options.manifestPath),
    commit,
    dirty,
    startedAt: previous?.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    platform: { platform: process.platform, architecture: process.arch, node: process.version },
    browser: { path: resolvedBrowserPath, version: browserVersion(resolvedBrowserPath) },
    request: manifest.request,
    concurrency: options.concurrency,
    sites: previous?.manifestId === manifest.id && previous?.commit === commit ? previous.sites || {} : {},
  }
  const persist = () => {
    run.updatedAt = new Date().toISOString()
    writeJsonAtomic(statePath, run)
    writeTextAtomic(path.join(outputPath, 'SUMMARY.md'), renderSummary(run))
  }
  persist()

  let stopping = false
  const controllers = new Set()
  const stop = () => {
    stopping = true
    for (const controller of controllers) controller.abort(new Error('Live corpus interrupted'))
  }
  process.once('SIGINT', stop)

  const executeSite = async (site) => {
    if (stopping) return
    if (options.resume && terminalResumeStatuses.has(run.sites[site.id]?.status)) {
      process.stderr.write(`[live-corpus] resume ${site.id}: ${run.sites[site.id].status}\n`)
      return
    }
    const sitePath = path.join(outputPath, `batch-${site.batch}`, safePathSegment(site.id))
    const bundlePath = path.join(sitePath, 'bundle')
    const dataDir = path.join(sitePath, 'browser-data')
    fs.mkdirSync(bundlePath, { recursive: true })
    fs.mkdirSync(dataDir, { recursive: true })
    const controller = new AbortController()
    controllers.add(controller)
    const cancelSiteTimeout = scheduleLiveCorpusSiteTimeout(controller, site.id)
    const startedAt = new Date().toISOString()
    const startedMs = Date.now()
    run.sites[site.id] = { id: site.id, url: site.url, batch: site.batch, status: 'running', startedAt }
    persist()
    process.stderr.write(`[live-corpus] start ${site.id}\n`)
    try {
      const progress = []
      const result = await analyze(
        site.url,
        {
          viewports: manifest.request.viewports,
          maxPages: manifest.request.maxPages,
          pageDiscovery: manifest.request.pageDiscovery,
          depth: manifest.request.depth,
          useSession: false,
          extractDarkMode: false,
          browserPath: resolvedBrowserPath,
          dataDir,
          signal: controller.signal,
        },
        (entry) => {
          progress.push({ at: new Date().toISOString(), ...entry })
          if (progress.length > 200) progress.shift()
        },
      )
      const artifacts = buildAnalysisArtifacts(result, { sourceUrl: site.url, language: 'en' })
      for (const [filename, field] of Object.entries(artifactFiles)) {
        writeTextAtomic(path.join(bundlePath, filename), artifacts[field])
      }
      writeJsonAtomic(path.join(sitePath, 'progress.json'), progress)
      const audit = await auditArtifactBundle(bundlePath)
      writeJsonAtomic(path.join(sitePath, 'audit.json'), audit)
      const status = audit.classification === 'analyzer-failure' ? 'analyzer-failure' : audit.classification
      run.sites[site.id] = {
        id: site.id,
        url: site.url,
        finalUrl: result.finalUrl,
        batch: site.batch,
        status,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        pageCount: new Set(result.designEvidence.pages.map((page) => page.routeId || page.url)).size,
        captureCount: result.designEvidence.pages.length,
        completion: result.completion,
        coverage: result.designEvidence.coverage,
        audit: {
          classification: audit.classification,
          hardFailures: audit.hardFailures,
          limitations: audit.limitations,
          warnings: audit.warnings,
          metrics: audit.metrics,
        },
      }
    } catch (error) {
      const status = externalRefusal(error) ? 'external-refusal' : 'analyzer-failure'
      run.sites[site.id] = {
        id: site.id,
        url: site.url,
        batch: site.batch,
        status,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        error: error instanceof Error ? error.message : String(error),
        extractionIssues: Array.isArray(error?.extractionIssues) ? error.extractionIssues : [],
      }
      writeJsonAtomic(path.join(sitePath, 'error.json'), run.sites[site.id])
    } finally {
      cancelSiteTimeout()
      controllers.delete(controller)
      persist()
      process.stderr.write(`[live-corpus] finish ${site.id}: ${run.sites[site.id].status}\n`)
    }
  }

  try {
    const batches = options.batch === 'all' ? [1, 2] : [Number(options.batch)]
    for (const batch of batches) {
      if (stopping) break
      const sites = manifest.sites.filter((site) => site.batch === batch)
      await runPool(sites, options.concurrency, executeSite)
    }
  } finally {
    process.removeListener('SIGINT', stop)
    persist()
  }
  const selectedSites = manifest.sites.filter((site) => options.batch === 'all' || site.batch === Number(options.batch))
  const failures = selectedSites.filter((site) => run.sites[site.id]?.status === 'analyzer-failure')
  const unfinished = selectedSites.filter((site) => !terminalResumeStatuses.has(run.sites[site.id]?.status))
  process.stdout.write(`${renderSummary(run)}\nArtifacts: ${path.relative(repositoryRoot, outputPath)}\n`)
  if (failures.length > 0 || unfinished.length > 0) process.exitCode = 1
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((error) => {
    process.stderr.write(`[live-corpus] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
