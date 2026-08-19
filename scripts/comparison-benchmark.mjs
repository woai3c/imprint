import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import {
  aggregateEvaluations,
  comparisonCategories,
  evaluateComparison,
  evaluateExecutionFailure,
} from '../tests/comparison-benchmark/evaluate.mjs'
import { evaluateQualityPolicy, validateQualityPolicy } from '../tests/comparison-benchmark/policy.mjs'
import { renderBenchmarkMarkdown } from '../tests/comparison-benchmark/report.mjs'
import { createComparisonSiteServer } from '../tests/comparison-site/server.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const defaultCorpusPath = path.join(repositoryRoot, 'tests/comparison-benchmark/corpus/controlled.json')
const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))

function usage() {
  return `Usage: pnpm benchmark:comparison -- [options]

Options:
  --corpus <path>       Corpus JSON (default: tests/comparison-benchmark/corpus/controlled.json)
  --policy <path>       Optional versioned quality policy JSON
  --output <directory>  Report directory (default: tmp/comparison-benchmark/<timestamp>-<commit>)
  --browser-path <path> Explicit Chrome/Edge/Chromium executable
  --repetitions <count> Override each scenario's declared repetition count
  --allow-network       Allow explicitly confirmed non-loopback URL pairs
  --keep-artifacts      Keep analyzer data and screenshots inside the output directory
  --help                Show this help
`
}

function readValue(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function parseArguments(args) {
  const known = new Set([
    '--corpus',
    '--policy',
    '--output',
    '--browser-path',
    '--repetitions',
    '--allow-network',
    '--keep-artifacts',
    '--help',
  ])
  for (const argument of args) {
    if (argument.startsWith('--') && !known.has(argument)) throw new Error(`Unknown option ${argument}`)
  }
  const repetitionsText = readValue(args, '--repetitions')
  const repetitions = repetitionsText === undefined ? undefined : Number(repetitionsText)
  if (repetitions !== undefined && (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100)) {
    throw new Error('--repetitions must be an integer between 1 and 100')
  }
  return {
    corpusPath: path.resolve(repositoryRoot, readValue(args, '--corpus') || defaultCorpusPath),
    policyPath: readValue(args, '--policy') ? path.resolve(repositoryRoot, readValue(args, '--policy')) : undefined,
    outputPath: readValue(args, '--output'),
    browserPath: readValue(args, '--browser-path'),
    repetitions,
    allowNetwork: args.includes('--allow-network'),
    keepArtifacts: args.includes('--keep-artifacts'),
    help: args.includes('--help'),
  }
}

function git(args, fallback) {
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function fixtureSha256(corpus) {
  const comparisonSiteScenarios = corpus.scenarios.filter((scenario) => scenario.source.kind === 'comparison-site')
  if (comparisonSiteScenarios.length === 0) return sha256('no-local-fixtures')
  const variantNames = new Set(
    comparisonSiteScenarios.flatMap((scenario) => [scenario.source.referenceVariant, scenario.source.targetVariant]),
  )
  const files = [
    'tests/comparison-site/index.html',
    'tests/comparison-site/base.css',
    'tests/comparison-site/server.mjs',
    ...[...variantNames].sort().map((variant) => `tests/comparison-site/variants/${variant}.css`),
  ]
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file)
    hash.update('\0')
    hash.update(fs.readFileSync(path.join(repositoryRoot, file)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function assertFrozenImplementation(policy) {
  const paths = policy.requirements.implementationPaths
  const changed = git(['diff', '--name-only', policy.frozenAgainstCommit, '--', ...paths], '__git-error__')
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...paths], '__git-error__')
  if (changed === '__git-error__' || untracked === '__git-error__') {
    throw new Error('Unable to verify the quality policy implementation baseline')
  }
  const files = [...new Set([...changed.split('\n'), ...untracked.split('\n')].filter(Boolean))].sort()
  if (files.length > 0) {
    throw new Error(`Quality policy implementation differs from its frozen baseline: ${files.join(', ')}`)
  }
}

function timestampForPath(value) {
  return value.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function isLoopbackUrl(value) {
  const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '')
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function validateRequest(request, context) {
  if (!request || typeof request !== 'object') throw new Error(`${context}.request must be an object`)
  if (!Array.isArray(request.viewports) || request.viewports.length === 0) {
    throw new Error(`${context}.request.viewports must be a non-empty array`)
  }
  if (!Number.isInteger(request.maxPages) || request.maxPages < 1 || request.maxPages > 5) {
    throw new Error(`${context}.request.maxPages must be an integer between 1 and 5`)
  }
  if (request.depth && !['standard', 'deep'].includes(request.depth)) {
    throw new Error(`${context}.request.depth must be standard or deep`)
  }
  if (request.pageDiscovery && !['auto', 'links', 'sitemap'].includes(request.pageDiscovery)) {
    throw new Error(`${context}.request.pageDiscovery is invalid`)
  }
}

function validateCorpus(corpus) {
  if (corpus?.schemaVersion !== '1') throw new Error('Corpus schemaVersion must be "1"')
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(corpus.id || '')) throw new Error('Corpus id is invalid')
  validateRequest(corpus.request, 'corpus')
  if (!Array.isArray(corpus.scenarios) || corpus.scenarios.length === 0) {
    throw new Error('Corpus must contain at least one scenario')
  }
  const ids = new Set()
  for (const scenario of corpus.scenarios) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(scenario.id || '')) throw new Error('Scenario id is invalid')
    if (ids.has(scenario.id)) throw new Error(`Duplicate scenario id ${scenario.id}`)
    ids.add(scenario.id)
    if (!['calibration', 'regression-holdout', 'prospective-holdout'].includes(scenario.role)) {
      throw new Error(`Scenario ${scenario.id} has an invalid role`)
    }
    if (!Number.isInteger(scenario.repetitions) || scenario.repetitions < 1 || scenario.repetitions > 100) {
      throw new Error(`Scenario ${scenario.id} repetitions must be an integer between 1 and 100`)
    }
    validateRequest({ ...corpus.request, ...(scenario.request || {}) }, `scenario ${scenario.id}`)
    validateRequest(
      { ...corpus.request, ...(scenario.request || {}), ...(scenario.referenceRequest || {}) },
      `scenario ${scenario.id} reference`,
    )
    validateRequest(
      { ...corpus.request, ...(scenario.request || {}), ...(scenario.targetRequest || {}) },
      `scenario ${scenario.id} target`,
    )
    if (
      !scenario.expectation ||
      !['changed', 'unchanged', 'inconclusive', 'observe'].includes(scenario.expectation.status)
    ) {
      throw new Error(`Scenario ${scenario.id} has an invalid expectation status`)
    }
    const changed = scenario.expectation.changedCategories || []
    if (!Array.isArray(changed) || changed.some((category) => !comparisonCategories.includes(category))) {
      throw new Error(`Scenario ${scenario.id} has invalid changedCategories`)
    }
    if (['inconclusive', 'observe'].includes(scenario.expectation.status) && changed.length > 0) {
      throw new Error(`Scenario ${scenario.id} cannot expect changed categories when ${scenario.expectation.status}`)
    }
    if (scenario.expectation.status === 'changed' && changed.length === 0) {
      throw new Error(`Scenario ${scenario.id} must declare at least one changed category`)
    }
    if (!['comparison-site', 'url-pair'].includes(scenario.source?.kind)) {
      throw new Error(`Scenario ${scenario.id} has an invalid source kind`)
    }
    if (scenario.source.kind === 'comparison-site') {
      if (!scenario.source.referenceVariant || !scenario.source.targetVariant) {
        throw new Error(`Scenario ${scenario.id} must declare comparison-site variants`)
      }
    } else {
      for (const field of ['referenceUrl', 'targetUrl']) {
        try {
          new URL(scenario.source[field])
        } catch {
          throw new Error(`Scenario ${scenario.id} ${field} must be an absolute URL`)
        }
      }
    }
  }
}

async function listen(server, port = 0) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Benchmark server did not expose a TCP port')
  return address.port
}

async function close(server) {
  if (!server.listening) return
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

async function captureComparisonSite(analyze, variant, port, options) {
  const server = createComparisonSiteServer(variant)
  const actualPort = await listen(server, port)
  try {
    const result = await analyze(`http://127.0.0.1:${actualPort}/`, options)
    return { result, port: actualPort }
  } finally {
    await close(server)
  }
}

function comparisonInput(result) {
  return {
    analysisId: result.analysisId,
    url: result.finalUrl,
    tokens: result.tokens,
    evidence: result.designEvidence,
    manifest: result.captureManifest,
  }
}

function captureSummary(result) {
  const health = { healthy: 0, degraded: 0, unusable: 0, missing: 0, issueCodes: {} }
  for (const page of result.designEvidence.pages) {
    if (!page.health) {
      health.missing += 1
      continue
    }
    health[page.health.status] += 1
    for (const issue of page.health.issues) {
      health.issueCodes[issue.code] = (health.issueCodes[issue.code] || 0) + 1
    }
  }
  const extractionIssueStages = {}
  for (const issue of result.extractionIssues) {
    extractionIssueStages[issue.stage] = (extractionIssueStages[issue.stage] || 0) + 1
  }
  return {
    durationMs: result.duration,
    manifestSchemaVersion: result.captureManifest.schemaVersion,
    requestSchemaVersion: result.captureManifest.request.schemaVersion || null,
    captureStatus: result.captureManifest.capture.status,
    capturedPageViewports: result.captureManifest.capture.captured,
    pageKeyCount: result.captureManifest.capture.pageKeys.length,
    coverageLimitations: result.captureManifest.capture.coverageLimitations,
    health,
    extractionIssueStages,
  }
}

function browserSummary(manifest) {
  const browser = manifest.environment.browser
  return `${browser.product} ${browser.version || 'unknown'}${browser.headless ? ' (headless)' : ''}`
}

function routeHashForScenario(scenario, routeIdentityFromUrl, comparison) {
  const identity =
    scenario.source.kind === 'comparison-site'
      ? 'comparison-site:/'
      : comparison?.reference.routeIdentity || routeIdentityFromUrl(scenario.source.referenceUrl)
  return sha256(identity).slice(0, 16)
}

function analysisOptions(request, options, dataDir) {
  return {
    viewports: request.viewports,
    maxPages: request.maxPages,
    useSession: false,
    authMode: 'anonymous',
    extractDarkMode: request.extractDarkMode ?? false,
    depth: request.depth || 'standard',
    pageDiscovery: request.pageDiscovery || 'auto',
    dataDir,
    toolVersion: packageJson.version,
    ...(options.browserPath ? { browserPath: path.resolve(options.browserPath) } : {}),
    signal: options.signal,
  }
}

async function capturePair({ scenario, request, analyze, routeIdentityFromUrl, options, dataDir }) {
  const referenceOptions = analysisOptions({ ...request, ...(scenario.referenceRequest || {}) }, options, dataDir)
  const targetOptions = analysisOptions({ ...request, ...(scenario.targetRequest || {}) }, options, dataDir)

  if (scenario.source.kind === 'comparison-site') {
    const referenceCapture = await captureComparisonSite(analyze, scenario.source.referenceVariant, 0, referenceOptions)
    const targetCapture = await captureComparisonSite(
      analyze,
      scenario.source.targetVariant,
      referenceCapture.port,
      targetOptions,
    )
    return { reference: referenceCapture.result, target: targetCapture.result }
  }

  const { referenceUrl, targetUrl } = scenario.source
  const external = !isLoopbackUrl(referenceUrl) || !isLoopbackUrl(targetUrl)
  if (external && (!options.allowNetwork || scenario.source.networkAccessConfirmed !== true)) {
    throw new Error(
      `Scenario ${scenario.id} requires --allow-network and source.networkAccessConfirmed=true for non-loopback URLs`,
    )
  }
  if (routeIdentityFromUrl(referenceUrl) !== routeIdentityFromUrl(targetUrl)) {
    throw new Error(`Scenario ${scenario.id} URL pair must use the same normalized route`)
  }
  return {
    reference: await analyze(referenceUrl, referenceOptions),
    target: await analyze(targetUrl, targetOptions),
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }

  const corpusText = fs.readFileSync(options.corpusPath, 'utf8')
  const corpus = JSON.parse(corpusText)
  validateCorpus(corpus)
  const corpusHash = sha256(corpusText)
  const fixtureHash = fixtureSha256(corpus)
  const policyText = options.policyPath ? fs.readFileSync(options.policyPath, 'utf8') : null
  const policy = policyText ? JSON.parse(policyText) : null
  if (policy) {
    validateQualityPolicy(policy)
    assertFrozenImplementation(policy)
  }

  const analyzerModule = await import('../dist/core/analyzer/index.js')
  const comparisonModule = await import('../dist/core/analyzer/reference-compare.js')
  const resolvedBrowsers = analyzerModule.resolveBrowserExecutables(options.browserPath)

  const startedAt = new Date().toISOString()
  const commit = git(['rev-parse', 'HEAD'], 'unknown')
  const shortCommit = commit === 'unknown' ? 'unknown' : commit.slice(0, 8)
  const outputPath = options.outputPath
    ? path.resolve(repositoryRoot, options.outputPath)
    : path.join(repositoryRoot, 'tmp/comparison-benchmark', `${timestampForPath(startedAt)}-${shortCommit}`)
  const jsonPath = path.join(outputPath, 'report.json')
  const markdownPath = path.join(outputPath, 'report.md')
  if (fs.existsSync(jsonPath) || fs.existsSync(markdownPath)) {
    throw new Error(`Output directory already contains a benchmark report: ${outputPath}`)
  }
  fs.mkdirSync(outputPath, { recursive: true })

  const controller = new AbortController()
  let cancelled = false
  const cancel = () => {
    cancelled = true
    controller.abort()
  }
  process.once('SIGINT', cancel)

  const results = []
  let observedBrowser = null
  try {
    for (const scenario of corpus.scenarios) {
      const repetitions = options.repetitions || scenario.repetitions
      const request = { ...corpus.request, ...(scenario.request || {}) }
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        if (controller.signal.aborted) throw new Error('Benchmark cancelled')
        process.stdout.write(`[benchmark] ${scenario.id} pair ${repetition}/${repetitions}\n`)
        const artifactDirectory = options.keepArtifacts
          ? path.join(outputPath, 'artifacts', `${scenario.id}-${repetition}`)
          : fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-comparison-benchmark-'))
        if (options.keepArtifacts) fs.mkdirSync(artifactDirectory, { recursive: true })
        const pairStartedAt = Date.now()
        try {
          const pair = await capturePair({
            scenario,
            request,
            analyze: analyzerModule.analyze,
            routeIdentityFromUrl: comparisonModule.routeIdentityFromUrl,
            options: { ...options, signal: controller.signal },
            dataDir: artifactDirectory,
          })
          const comparison = comparisonModule.compareReferenceCaptures(
            comparisonInput(pair.reference),
            comparisonInput(pair.target),
          )
          const evaluation = evaluateComparison({
            scenario,
            comparison,
            referenceEvidence: pair.reference.designEvidence,
            targetEvidence: pair.target.designEvidence,
          })
          observedBrowser ||= browserSummary(pair.reference.captureManifest)
          results.push({
            scenarioId: scenario.id,
            role: scenario.role,
            repetition,
            routeHash: routeHashForScenario(scenario, comparisonModule.routeIdentityFromUrl, comparison),
            durationMs: Date.now() - pairStartedAt,
            evaluation,
            entityMatching: comparison.entityMatching?.summary || null,
            captures: {
              reference: captureSummary(pair.reference),
              target: captureSummary(pair.target),
            },
          })
        } catch (error) {
          if (controller.signal.aborted) throw error
          results.push({
            scenarioId: scenario.id,
            role: scenario.role,
            repetition,
            routeHash: routeHashForScenario(scenario, comparisonModule.routeIdentityFromUrl),
            durationMs: Date.now() - pairStartedAt,
            evaluation: evaluateExecutionFailure(scenario, error),
            entityMatching: null,
            captures: null,
          })
        } finally {
          if (!options.keepArtifacts && artifactDirectory.startsWith(os.tmpdir())) {
            fs.rmSync(artifactDirectory, { recursive: true, force: true })
          }
        }
      }
    }
  } finally {
    process.removeListener('SIGINT', cancel)
  }

  const completedAt = new Date().toISOString()
  const summary = aggregateEvaluations(results)
  const qualityPolicy = policy
    ? evaluateQualityPolicy({
        policy,
        corpus,
        corpusSha256: corpusHash,
        fixtureSha256: fixtureHash,
        summary,
        policySha256: sha256(policyText),
      })
    : {
        status: 'not-defined',
        note: 'Scenario ground truth is evaluated without a versioned quality policy.',
      }
  const report = {
    schemaVersion: '1',
    run: {
      commit,
      dirty: git(['status', '--porcelain'], '').length > 0,
      toolVersion: packageJson.version,
      browser: observedBrowser,
      browserExecutableKind: path.basename(resolvedBrowsers.headless),
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      startedAt,
      completedAt,
    },
    corpus: {
      id: corpus.id,
      schemaVersion: corpus.schemaVersion,
      sha256: corpusHash,
      fixtureSha256: fixtureHash,
      scenarioCount: corpus.scenarios.length,
    },
    qualityPolicy,
    summary,
    scenarios: results,
  }

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(markdownPath, renderBenchmarkMarkdown(report))
  process.stdout.write(`[benchmark] JSON: ${path.relative(repositoryRoot, jsonPath)}\n`)
  process.stdout.write(`[benchmark] Markdown: ${path.relative(repositoryRoot, markdownPath)}\n`)
  process.stdout.write(
    `[benchmark] ${report.summary.totals.passedPairs}/${report.summary.totals.evaluatedPairs} evaluated capture pairs matched ground truth; ${report.summary.totals.observationOnlyPairs} observation-only\n`,
  )
  if (report.summary.totals.failedPairs > 0) process.exitCode = 1
  if (report.qualityPolicy.status === 'failed') process.exitCode = 1
  if (cancelled) process.exitCode = 130
}

main().catch((error) => {
  const cancelled = error instanceof Error && /cancelled|aborted/i.test(error.message)
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = cancelled ? 130 : 2
})
