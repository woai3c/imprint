#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

import { BrowserExecutableError, analyze } from '../core/analyzer/index.js'
import { sanitizeUrlForPersistence } from '../core/analyzer/url-privacy.js'
import { getDefaultDataDir } from '../core/data-dir.js'
import { createDeterministicDesignContext } from '../core/design-context/deterministic-context.js'
import { generateDesignProfileJson } from '../core/design-context/profile-export.js'
import {
  getReconstructionBriefEligibility,
  reconstructionBriefUnavailableMessage,
} from '../core/design-context/reconstruction-brief.js'
import {
  buildDarkModeExportData,
  generateComponentSpecsJson,
  generateCssVariables,
  generateDesignDoc,
  generateDesignEvidenceJson,
  generateDtcgJson,
  generateLocalVisualQa,
  generatePdfHtml,
  generateScssVariables,
  generateTailwindTheme,
} from '../core/export/index.js'
import { coreTranslator } from '../core/i18n/index.js'
import {
  CLI_EXIT_CODES,
  CliCancellationError,
  CliUsageError,
  type CliUsageErrorCode,
  type DoctorResult,
  isCancellationError,
  parseCliCommand,
  runDoctor,
} from './command.js'
import { resolveCliExportFormats } from './export-formats.js'

const cliT = coreTranslator('en', 'cli')

function log(msg: string, quiet: boolean) {
  if (!quiet) process.stderr.write(`${msg}\n`)
}

function printDoctor(result: DoctorResult): void {
  process.stdout.write(`${cliT('doctor.heading')}\n`)
  for (const check of result.checks) {
    const status = cliT(check.ok ? 'doctor.pass' : 'doctor.fail')
    const label = cliT(`doctor.checks.${check.id}`)
    const detail = check.actual || check.reason || cliT('doctor.unavailable')
    process.stdout.write(`${status} ${label}: ${detail}\n`)
  }
  process.stdout.write(`${cliT(result.ok ? 'doctor.ready' : 'doctor.notReady')}\n`)
}

async function main(): Promise<number> {
  const command = parseCliCommand(process.argv.slice(2))

  if (command.kind === 'help') {
    printUsage()
    return CLI_EXIT_CODES.success
  }

  if (command.kind === 'doctor') {
    const result = await runDoctor(command.browserPath)
    if (command.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    else printDoctor(result)
    return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.environment
  }

  const { url, options } = command
  const dataDir = getDefaultDataDir()
  const analysisController = new AbortController()
  let cancellationDeadline: ReturnType<typeof setTimeout> | undefined
  const cancelAnalysis = () => {
    process.exitCode = CLI_EXIT_CODES.cancelled
    process.stderr.write(`${cliT('errors.prefix')}: ${cliT('errors.cancelled')}\n`)
    cancellationDeadline = setTimeout(() => {}, 10_000)
    analysisController.abort(new CliCancellationError())
  }
  process.once('SIGINT', cancelAnalysis)

  log(`\n  Imprint — Analyzing ${sanitizeUrlForPersistence(url)}\n`, options.quiet)

  let result: Awaited<ReturnType<typeof analyze>>
  try {
    result = await analyze(
      url,
      {
        viewports: options.viewports,
        useSession: options.useSession,
        extractDarkMode: options.darkMode,
        maxPages: options.maxPages,
        pageDiscovery: options.pageDiscovery,
        browserPath: options.browserPath,
        dataDir,
        signal: analysisController.signal,
      },
      (progress) => {
        log(`  [${progress.percent}%] ${progress.step}`, options.quiet)
      },
    )
  } finally {
    process.removeListener('SIGINT', cancelAnalysis)
    if (cancellationDeadline) clearTimeout(cancellationDeadline)
  }
  const darkModeExport = buildDarkModeExportData(result.darkMode)

  const designContext = createDeterministicDesignContext(result.designEvidence, result.tokens, 'en')
  const profile = designContext.profile
  const reconstructionBrief = designContext.reconstructionBrief
  const finalTiming = result.timing

  const exportTokens = result.tokens
  const exportDarkMode = darkModeExport
  const cssVars = generateCssVariables(exportTokens, exportDarkMode, result.breakpoints)
  const tailwind = generateTailwindTheme(exportTokens, exportDarkMode, result.breakpoints)
  const designDoc = generateDesignDoc(
    exportTokens,
    url,
    result.featureTags,
    exportDarkMode,
    result.breakpoints,
    result.components,
    'en',
    result.designEvidence,
    profile || undefined,
  )
  const dtcgJson = generateDtcgJson(exportTokens, exportDarkMode)
  const evidenceJson = generateDesignEvidenceJson(result.designEvidence)

  // JSON stdout mode — pipe-friendly
  if (options.jsonStdout) {
    process.stdout.write(
      JSON.stringify(
        darkModeExport?.darkTokens
          ? {
              ...result.tokens,
              darkMode: {
                method: darkModeExport.method,
                tokens: darkModeExport.darkTokens,
              },
            }
          : result.tokens,
        null,
        2,
      ),
    )
    return CLI_EXIT_CODES.success
  }

  // Determine output directory
  const outputDir = path.resolve(options.output)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const formats = resolveCliExportFormats(options.format, {
    hasProfile: true,
    hasReconstructionBrief: reconstructionBrief !== null,
  })

  for (const format of formats) {
    let filename: string
    let content: string

    switch (format) {
      case 'design.md':
      case 'markdown':
        filename = 'DESIGN.md'
        content = designDoc
        break
      case 'tailwind':
        filename = 'theme.css'
        content = tailwind
        break
      case 'css':
        filename = 'variables.css'
        content = cssVars
        break
      case 'scss':
        filename = 'variables.scss'
        content = generateScssVariables(exportTokens, exportDarkMode)
        break
      case 'json':
        filename = 'design-tokens.json'
        content = dtcgJson
        break
      case 'evidence':
        filename = 'design-evidence.json'
        content = evidenceJson
        break
      case 'profile':
        filename = 'design-profile.json'
        content = generateDesignProfileJson(profile)
        break
      case 'reconstruction': {
        if (!reconstructionBrief) {
          const eligibility = getReconstructionBriefEligibility(profile)
          throw new Error(
            reconstructionBriefUnavailableMessage(eligibility.eligible ? 'no-profile' : eligibility.reason),
          )
        }
        filename = 'RECONSTRUCTION.md'
        content = reconstructionBrief
        break
      }
      case 'components':
        filename = 'component-specs.json'
        content = generateComponentSpecsJson(result.designEvidence)
        break
      case 'visual-qa':
        filename = 'visual-qa.json'
        content = JSON.stringify(generateLocalVisualQa(result.designEvidence), null, 2)
        break
      case 'pdf':
        filename = 'style-guide.html'
        content = generatePdfHtml(result.tokens, url, result.featureTags, darkModeExport)
        break
      default:
        log(`  Unknown format: ${format}`, options.quiet)
        continue
    }

    const filepath = path.join(outputDir, filename)
    fs.writeFileSync(filepath, content, 'utf-8')
    log(`  ✓ ${filepath}`, options.quiet)
  }

  log(`\n  Done in ${(result.duration / 1000).toFixed(1)}s\n`, options.quiet)
  if (result.completion.reason === 'user-finished') {
    log(`  ${cliT('completion.userFinished', { pages: result.pageCoverage.analyzed })}`, options.quiet)
  }
  log(
    `  Timing: total=${finalTiming.totalMs}ms browser=${finalTiming.browserMs || 0}ms preparation=${finalTiming.preparationMs || 0}ms health=${finalTiming.healthGateMs || 0}ms extraction=${finalTiming.extractionMs || 0}ms images=${finalTiming.imageCount}`,
    options.quiet,
  )
  return CLI_EXIT_CODES.success
}

function printUsage() {
  process.stdout.write(`
  Imprint — Extract design systems from websites

  Usage:
    imprint extract <url> [options]
    ${cliT('usage.doctor')}

  Options:
    --format <type>     Output: design.md | reconstruction | tailwind | css | scss | json | evidence | profile | components | visual-qa | pdf | all (default: all)
    --output <path>     Output directory (default: current directory)
    --viewport <size>   Viewport: desktop | tablet | mobile | all (default: desktop)
    --dark-mode         Also extract dark mode theme
    --pages <count>     Stop after this many pages; any positive integer (default: 8)
    --discovery <mode>  Page discovery: auto | links | sitemap (default: auto)
    ${cliT('usage.browserPath')}
    --no-session        Don't reuse Imprint's saved browser session
    --json-stdout       Output token JSON to stdout (pipe-friendly)
    --quiet             Suppress progress output
  Examples:
    imprint extract https://vercel.com
    imprint extract https://github.com --format design.md --output ./design/
    imprint extract https://stripe.com --format json --json-stdout | jq .colors
    imprint extract https://example.com --viewport all --format profile
    imprint extract https://example.com --format reconstruction

`)
}

const usageErrorKeys: Record<CliUsageErrorCode, string> = {
  'invalid-url': 'errors.invalidUrl',
  'invalid-viewports': 'errors.invalidViewport',
  'invalid-page-count': 'errors.invalidPageCount',
  'invalid-auth-mode': 'errors.invalidAuthMode',
  'invalid-dark-mode': 'errors.invalidDarkMode',
  'invalid-depth': 'errors.invalidDepth',
  'invalid-page-discovery': 'errors.invalidPageDiscovery',
  'missing-option-value': 'errors.missingOptionValue',
  'unknown-option': 'errors.unknownOption',
  'unexpected-argument': 'errors.unexpectedArgument',
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error: unknown) => {
    let exitCode: number = CLI_EXIT_CODES.runtime
    let message: string
    if (error instanceof CliUsageError) {
      exitCode = CLI_EXIT_CODES.usage
      message = cliT(usageErrorKeys[error.code], { option: error.detail, value: error.detail })
    } else if (error instanceof BrowserExecutableError) {
      exitCode = CLI_EXIT_CODES.environment
      message = cliT(error.code === 'browser-not-found' ? 'errors.browserNotFound' : 'errors.invalidBrowserPath', {
        path: error.browserPath,
      })
    } else if (isCancellationError(error)) {
      exitCode = CLI_EXIT_CODES.cancelled
      message = process.exitCode === CLI_EXIT_CODES.cancelled ? '' : cliT('errors.cancelled')
    } else {
      message = cliT('errors.runtime', { message: error instanceof Error ? error.message : String(error) })
    }
    if (message) process.stderr.write(`${cliT('errors.prefix')}: ${message}\n`)
    process.exitCode = exitCode
  })
