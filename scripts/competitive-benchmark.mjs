import { DtcgEmitterHandler, lint } from '@google/design.md/linter'

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = path.join(rootDir, 'tests', 'benchmark', 'fixtures')
const benchmarkDir = path.join(rootDir, 'tests', 'competitive-benchmark')
const defaultResultsDir = path.join(rootDir, 'tests', 'benchmark', 'results', 'competitive')
const groundTruth = JSON.parse(fs.readFileSync(path.join(benchmarkDir, 'ground-truth.json'), 'utf8'))
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const canonicalSections = [
  'Overview',
  'Colors',
  'Typography',
  'Layout',
  'Elevation & Depth',
  'Shapes',
  'Components',
  "Do's and Don'ts",
]

const adapters = {
  imprint: {
    version: 'workspace',
    setup: null,
    command(url, outputDir) {
      return {
        command: process.execPath,
        args: [
          path.join(rootDir, 'dist', 'cli', 'index.js'),
          'extract',
          url,
          '--format',
          'design.md',
          '--output',
          outputDir,
          '--viewport',
          'desktop',
          '--pages',
          '1',
          '--no-session',
          '--quiet',
        ],
        cwd: rootDir,
      }
    },
  },
  brandmd: {
    version: '0.16.1',
    setup: { command: pnpmCommand, args: ['dlx', 'brandmd@0.16.1', '--version'] },
    command(url, outputDir) {
      return {
        command: pnpmCommand,
        args: ['dlx', 'brandmd@0.16.1', url, '--output', path.join(outputDir, 'DESIGN.md'), '--viewport', '1440x900'],
        cwd: outputDir,
      }
    },
  },
  dembrandt: {
    version: '0.27.1',
    setup: { command: pnpmCommand, args: ['dlx', 'dembrandt@0.27.1', '--version'] },
    command(url, outputDir) {
      return {
        command: pnpmCommand,
        args: ['dlx', 'dembrandt@0.27.1', url, '--design-md', '--screen-size', '1440x900'],
        cwd: outputDir,
      }
    },
  },
  designlang: {
    version: '12.21.0',
    setup: {
      command: pnpmCommand,
      args: ['dlx', 'designlang@12.21.0', '--version'],
      env: { npm_config_ignore_scripts: 'true' },
    },
    command(url, outputDir, fixture) {
      return {
        command: pnpmCommand,
        args: [
          'dlx',
          'designlang@12.21.0',
          url,
          '--out',
          outputDir,
          '--name',
          fixture,
          '--width',
          '1440',
          '--height',
          '900',
          '--system-chrome',
          '--no-history',
          '--no-prompts',
          '--quiet',
        ],
        cwd: outputDir,
        env: { npm_config_ignore_scripts: 'true' },
      }
    },
  },
}

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function selectedNames(flag, available, fallback) {
  const value = argValue(flag) || fallback
  const names = value === 'all' ? available : value.split(',').map((item) => item.trim())
  const invalid = names.filter((name) => !available.includes(name))
  if (invalid.length > 0) throw new Error(`Unknown ${flag} value: ${invalid.join(', ')}`)
  return [...new Set(names)]
}

function appendTail(current, chunk, limit = 50_000) {
  const combined = current + chunk.toString()
  return combined.length > limit ? combined.slice(-limit) : combined
}

function stopChild(child, signal) {
  if (!child.pid) return
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // The process already exited.
    }
  }
}

function runCommand(spec, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let forceKillTimer
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd || rootDir,
      env: { ...process.env, ...spec.env },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk) => {
      stdout = appendTail(stdout, chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr = appendTail(stderr, chunk)
    })
    const timeout = setTimeout(() => {
      timedOut = true
      stopChild(child, 'SIGTERM')
      forceKillTimer = setTimeout(() => stopChild(child, 'SIGKILL'), 2_000)
    }, timeoutMs)
    const finish = (exitCode, error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(forceKillTimer)
      resolve({
        exitCode,
        timedOut,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr: error ? appendTail(stderr, error.message) : stderr,
      })
    }
    child.once('error', (error) => finish(null, error))
    child.once('close', (code) => finish(code, null))
  })
}

function commandText(spec) {
  return [spec.command, ...spec.args]
    .map((part) => (/^[\w./:@=-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(' ')
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walkFiles(entryPath)
    return entry.isFile() ? [entryPath] : []
  })
}

function tokenCount(designSystem) {
  return (
    designSystem.colors.size +
    designSystem.typography.size +
    designSystem.spacing.size +
    designSystem.rounded.size +
    designSystem.components.size
  )
}

function canonicalSectionCount(sections) {
  return canonicalSections.filter((section) => sections.includes(section)).length
}

function findBestDesignDocument(outputDir) {
  const candidates = walkFiles(outputDir)
    .filter((file) => file.toLowerCase().endsWith('.md'))
    .flatMap((file) => {
      try {
        const content = fs.readFileSync(file, 'utf8')
        if (content.length > 5_000_000) return []
        const report = lint(content)
        const count = tokenCount(report.designSystem)
        const sectionCount = canonicalSectionCount(report.sections)
        if (count === 0 || sectionCount < 3) return []
        return [{ file, report, count, sectionCount }]
      } catch {
        return []
      }
    })
    .sort(
      (first, second) =>
        first.report.summary.errors - second.report.summary.errors ||
        second.sectionCount - first.sectionCount ||
        second.count - first.count ||
        first.report.summary.warnings - second.report.summary.warnings,
    )
  return candidates[0]
}

function normalizeHex(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  const short = trimmed.match(/^#([0-9a-f]{3})$/)
  if (short) return `#${[...short[1]].map((digit) => digit + digit).join('')}`
  const full = trimmed.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/)
  if (full) return `#${full[1]}`
  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!rgb) return null
  const channels = rgb.slice(1, 4).map(Number)
  if (channels.some((channel) => channel < 0 || channel > 255)) return null
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function dimensionKey(value) {
  if (typeof value !== 'string') return null
  const match = value
    .trim()
    .toLowerCase()
    .match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em)$/)
  if (!match) return null
  const numeric = Number(match[1]) * (match[2] === 'px' ? 1 : 16)
  return `${Math.round(numeric * 1_000) / 1_000}px`
}

function dimensionFromResolved(value) {
  if (!value) return null
  return dimensionKey(`${value.value}${value.unit}`)
}

function fontFamilyParts(value) {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((part) =>
      part
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase(),
    )
    .filter(Boolean)
}

function observationsFromDesignDocument(candidate) {
  const { designSystem } = candidate.report
  const colors = new Set([...designSystem.colors.values()].map((color) => normalizeHex(color.hex)).filter(Boolean))
  const fontFamilies = new Set(
    [...designSystem.typography.values()].flatMap((typography) => fontFamilyParts(typography.fontFamily)),
  )
  const fontSizes = new Set(
    [...designSystem.typography.values()]
      .map((typography) => dimensionFromResolved(typography.fontSize))
      .filter(Boolean),
  )
  const radii = new Set([...designSystem.rounded.values()].map(dimensionFromResolved).filter(Boolean))
  const dtcg = new DtcgEmitterHandler().execute(designSystem)
  return {
    artifact: candidate.file,
    artifactKind: 'design-md',
    colors,
    fontFamilies,
    fontSizes,
    radii,
    interoperability: {
      designMd: true,
      lintErrors: candidate.report.summary.errors,
      lintWarnings: candidate.report.summary.warnings,
      canonicalSections: candidate.sectionCount,
      dtcgExport: dtcg.success && countDtcgValues(dtcg.data) > 0,
    },
  }
}

function countDtcgValues(value) {
  if (!value || typeof value !== 'object') return 0
  if ('$value' in value) return 1
  return Object.values(value).reduce((total, child) => total + countDtcgValues(child), 0)
}

function collectJsonObservations(value, pathParts, inheritedType, observations) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonObservations(item, pathParts, inheritedType, observations))
    return
  }
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return
    const joinedPath = pathParts.join('.').toLowerCase()
    const color = normalizeHex(value)
    if (color && (inheritedType === 'color' || /color|palette|background|foreground|surface|accent/.test(joinedPath))) {
      observations.colors.add(color)
    }
    const dimension = dimensionKey(value)
    if (dimension && (inheritedType === 'dimension' || /font.*size|typography.*size|text.*size/.test(joinedPath))) {
      observations.fontSizes.add(dimension)
    }
    if (dimension && /radius|rounded/.test(joinedPath)) observations.radii.add(dimension)
    if (/font.*family|fontfamily|typeface/.test(joinedPath)) {
      fontFamilyParts(value).forEach((family) => observations.fontFamilies.add(family))
    }
    return
  }

  const type = typeof value.$type === 'string' ? value.$type.toLowerCase() : inheritedType
  if ('$value' in value) collectJsonObservations(value.$value, pathParts, type, observations)
  Object.entries(value).forEach(([key, child]) => {
    if (key === '$value' || key === '$type') return
    collectJsonObservations(child, [...pathParts, key], type, observations)
  })
}

function observationsFromJsonFallback(outputDir) {
  const candidates = walkFiles(outputDir)
    .filter((file) => /(?:design[-_.]?tokens|tokens)\.json$/i.test(file))
    .sort((first, second) => fs.statSync(second).size - fs.statSync(first).size)
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      const observations = {
        colors: new Set(),
        fontFamilies: new Set(),
        fontSizes: new Set(),
        radii: new Set(),
      }
      collectJsonObservations(parsed, [], '', observations)
      if ([...Object.values(observations)].some((values) => values.size > 0)) {
        return {
          artifact: file,
          artifactKind: 'token-json-fallback',
          ...observations,
          interoperability: {
            designMd: false,
            lintErrors: null,
            lintWarnings: null,
            canonicalSections: 0,
            dtcgExport: countDtcgValues(parsed) > 0,
          },
        }
      }
    } catch {
      // Try the next token-looking JSON artifact.
    }
  }
  return null
}

function inspectArtifacts(outputDir) {
  const designDocument = findBestDesignDocument(outputDir)
  if (designDocument) return observationsFromDesignDocument(designDocument)
  return observationsFromJsonFallback(outputDir)
}

function recall(expected, actual, normalize = (value) => value) {
  const normalizedActual = new Set([...actual].map(normalize).filter(Boolean))
  const matched = expected.filter((value) => normalizedActual.has(normalize(value))).length
  return {
    matched,
    total: expected.length,
    recall: expected.length > 0 ? matched / expected.length : null,
    missing: expected.filter((value) => !normalizedActual.has(normalize(value))),
  }
}

function fontRecall(expectedGroups, actual) {
  const matched = expectedGroups.filter((aliases) =>
    aliases.some((alias) => actual.has(alias.trim().toLowerCase())),
  ).length
  return {
    matched,
    total: expectedGroups.length,
    recall: expectedGroups.length > 0 ? matched / expectedGroups.length : null,
    missing: expectedGroups.filter((aliases) => !aliases.some((alias) => actual.has(alias.trim().toLowerCase()))),
  }
}

function scoreObservations(required, observations) {
  const categories = {
    colors: recall(required.colors, observations.colors, normalizeHex),
    fontFamilies: fontRecall(required.fontFamilies, observations.fontFamilies),
    fontSizes: recall(required.fontSizes, observations.fontSizes, dimensionKey),
    radii: recall(required.radii, observations.radii, dimensionKey),
  }
  const populated = Object.values(categories).filter((category) => category.recall !== null)
  return {
    macroRecall: populated.reduce((total, category) => total + category.recall, 0) / populated.length,
    categories,
  }
}

function createFixtureServer(fixtures) {
  const allowed = new Map(fixtures.map((fixture) => [`/${fixture}.html`, path.join(fixturesDir, `${fixture}.html`)]))
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
    const file = allowed.get(pathname)
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('not found')
      return
    }
    const body = fs.readFileSync(file)
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': body.length,
      'content-type': 'text/html; charset=utf-8',
    })
    response.end(body)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` })
    })
  })
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

function percent(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value * 1000) / 10}%`
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function aggregateRuns(tool, version, fixtures, runs) {
  const toolRuns = runs.filter((run) => run.tool === tool)
  const successful = toolRuns.filter((run) => run.success)
  const scores = successful.map((run) => run.score.macroRecall)
  return {
    tool,
    version,
    completed: successful.length,
    expected: fixtures.length,
    macroRecall: scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : null,
    designMdCompatible: successful.filter(
      (run) => run.interoperability.designMd && run.interoperability.lintErrors === 0,
    ).length,
    dtcgExportable: successful.filter((run) => run.interoperability.dtcgExport).length,
    medianDurationMs:
      successful.length > 0
        ? [...successful].sort((first, second) => first.durationMs - second.durationMs)[
            Math.floor(successful.length / 2)
          ].durationMs
        : null,
  }
}

function markdownReport(summary) {
  const lines = [
    '# Competitive CLI Benchmark',
    '',
    `Generated: ${summary.generatedAt}`,
    '',
    '## Aggregate',
    '',
    '| Tool | Version | Completed | Macro recall | Valid DESIGN.md | DTCG exportable | Median extraction |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  summary.aggregate.forEach((row) => {
    lines.push(
      `| ${row.tool} | ${row.version} | ${row.completed}/${row.expected} | ${percent(row.macroRecall)} | ${row.designMdCompatible}/${row.expected} | ${row.dtcgExportable}/${row.expected} | ${row.medianDurationMs === null ? '—' : `${row.medianDurationMs}ms`} |`,
    )
  })
  lines.push(
    '',
    '## Runs',
    '',
    '| Fixture | Tool | Status | Macro | Colors | Fonts | Sizes | Radii | Lint E/W | Time |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  )
  summary.runs.forEach((run) => {
    const categories = run.score?.categories
    const lintResult = run.interoperability?.designMd
      ? `${run.interoperability.lintErrors}/${run.interoperability.lintWarnings}`
      : '—'
    lines.push(
      `| ${escapeCell(run.fixture)} | ${escapeCell(run.tool)} | ${run.success ? 'ok' : run.timedOut ? 'timeout' : 'failed'} | ${percent(run.score?.macroRecall)} | ${percent(categories?.colors.recall)} | ${percent(categories?.fontFamilies.recall)} | ${percent(categories?.fontSizes.recall)} | ${percent(categories?.radii.recall)} | ${lintResult} | ${run.durationMs}ms |`,
    )
  })
  const failures = summary.runs.filter((run) => !run.success)
  if (failures.length > 0) {
    lines.push('', '## Incomplete runs', '')
    failures.forEach((run) => {
      const detail = run.stderr.trim().split(/\r?\n/).slice(-1)[0] || `exit ${run.exitCode}`
      lines.push(`- ${run.tool} / ${run.fixture}: ${escapeCell(detail)}`)
    })
  }
  lines.push(
    '',
    '## Interpretation boundary',
    '',
    'This baseline measures deterministic token recall and format interoperability on synthetic local pages. It does not measure false-positive precision, real-site access, multi-page synthesis, responsive reconstruction, evidence quality, AI interpretation, or downstream visual fidelity.',
    '',
  )
  return lines.join('\n')
}

async function main() {
  const toolNames = selectedNames('--tools', Object.keys(adapters), 'imprint')
  const truthByFixture = new Map(groundTruth.fixtures.map((fixture) => [fixture.fixture, fixture]))
  const fixtureNames = selectedNames('--fixtures', [...truthByFixture.keys()], 'all')
  const timeoutMs = Number(argValue('--timeout-ms') || 240_000)
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) throw new Error('--timeout-ms must be at least 1000')
  const resultsDir = path.resolve(argValue('--output') || defaultResultsDir)
  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const runDir = path.join(resultsDir, runId)
  fs.mkdirSync(runDir, { recursive: true })

  if (toolNames.includes('imprint') && !fs.existsSync(path.join(rootDir, 'dist', 'cli', 'index.js'))) {
    throw new Error('Imprint CLI is not built. Run pnpm build:cli first or use pnpm test:competitive.')
  }

  const setup = {}
  for (const tool of toolNames) {
    const spec = adapters[tool].setup
    if (!spec) {
      setup[tool] = { exitCode: 0, durationMs: 0, stdout: '', stderr: '', timedOut: false }
      continue
    }
    process.stdout.write(`Preparing ${tool}@${adapters[tool].version}...\n`)
    setup[tool] = await runCommand({ ...spec, cwd: rootDir }, Math.max(timeoutMs, 600_000))
  }

  const unavailable = new Set(toolNames.filter((tool) => setup[tool].exitCode !== 0 || setup[tool].timedOut))
  const runs = []
  const fixtureServer = await createFixtureServer(fixtureNames)
  try {
    for (const fixture of fixtureNames) {
      const truth = truthByFixture.get(fixture)
      for (const tool of toolNames) {
        const outputDir = path.join(runDir, 'artifacts', tool, fixture)
        fs.mkdirSync(outputDir, { recursive: true })
        if (unavailable.has(tool)) {
          runs.push({
            fixture,
            tool,
            version: adapters[tool].version,
            command: '',
            exitCode: setup[tool].exitCode,
            timedOut: setup[tool].timedOut,
            durationMs: 0,
            stdout: setup[tool].stdout,
            stderr: `Adapter setup failed. ${setup[tool].stderr}`,
            success: false,
            artifact: null,
            artifactKind: null,
            observations: null,
            interoperability: null,
            score: null,
          })
          continue
        }
        const url = `${fixtureServer.baseUrl}/${fixture}.html`
        const command = adapters[tool].command(url, outputDir, fixture)
        process.stdout.write(`Running ${tool} on ${fixture}...\n`)
        const execution = await runCommand(command, timeoutMs)
        const observations = inspectArtifacts(outputDir)
        const score = observations ? scoreObservations(truth.required, observations) : null
        runs.push({
          fixture,
          tool,
          version: adapters[tool].version,
          command: commandText(command),
          ...execution,
          success: execution.exitCode === 0 && !execution.timedOut && observations !== null,
          artifact: observations ? path.relative(rootDir, observations.artifact) : null,
          artifactKind: observations?.artifactKind || null,
          observations: observations
            ? {
                colors: [...observations.colors].sort(),
                fontFamilies: [...observations.fontFamilies].sort(),
                fontSizes: [...observations.fontSizes].sort(),
                radii: [...observations.radii].sort(),
              }
            : null,
          interoperability: observations?.interoperability || null,
          score,
        })
      }
    }
  } finally {
    await closeServer(fixtureServer.server)
  }

  const aggregate = toolNames.map((tool) => aggregateRuns(tool, adapters[tool].version, fixtureNames, runs))
  const summary = {
    schemaVersion: '1',
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      viewport: 'nominal 1440x900 desktop',
    },
    methodology: groundTruth.methodology,
    tools: Object.fromEntries(toolNames.map((tool) => [tool, { version: adapters[tool].version, setup: setup[tool] }])),
    fixtures: fixtureNames,
    aggregate,
    runs,
  }
  const json = `${JSON.stringify(summary, null, 2)}\n`
  const markdown = markdownReport(summary)
  fs.writeFileSync(path.join(runDir, 'result.json'), json)
  fs.writeFileSync(path.join(runDir, 'result.md'), markdown)
  fs.writeFileSync(path.join(resultsDir, 'latest.json'), json)
  fs.writeFileSync(path.join(resultsDir, 'latest.md'), markdown)
  process.stdout.write(`\n${markdown}\nResults: ${path.relative(rootDir, runDir)}\n`)
  if (runs.some((run) => !run.success)) process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`Competitive benchmark failed: ${error.message}\n`)
  process.exitCode = 1
})
