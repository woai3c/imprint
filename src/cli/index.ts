#!/usr/bin/env node

import { BrowserExecutableError, NoUsableCapturesError } from '../core/analyzer/index.js'
import {
  formatExtractionIssueDiagnosticsForDisplay,
  sanitizeDiagnosticTextForDisplay,
  sanitizeUrlForPersistence,
} from '../core/analyzer/url-privacy.js'
import { runExtraction } from '../core/extraction-delivery.js'
import { ExtractionRequestError } from '../core/extraction-request.js'
import { coreT, coreTranslator } from '../core/i18n/index.js'
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

const cliT = coreTranslator('en', 'cli')
const diagnosticInputUrls = process.argv.slice(2).filter((value) => /^[a-z][a-z\d+.-]*:\/\//i.test(value))

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
  const analysisController = new AbortController()
  let cancellationHold: ReturnType<typeof setInterval> | undefined
  const cancelAnalysis = () => {
    cancellationHold ??= setInterval(() => undefined, 1_000)
    analysisController.abort(new CliCancellationError())
  }
  process.once('SIGINT', cancelAnalysis)
  try {
    log(cliT('analyzing', { url: sanitizeUrlForPersistence(url) }), options.quiet)
    const delivery = await runExtraction(
      { url, options },
      {
        signal: analysisController.signal,
        onProgress: (progress) => log('[' + progress.percent + '%] ' + progress.step, options.quiet),
        onDiagnostic: (message) => process.stderr.write(message + '\n'),
      },
    )
    for (const warning of delivery.warnings) process.stderr.write(warning + '\n')
    if (delivery.saved) {
      for (const artifact of [...delivery.saved.artifacts, ...delivery.saved.assets]) {
        log(cliT('saved', { path: artifact.path }), options.quiet)
      }
    } else {
      process.stdout.write(delivery.text)
    }
    log(cliT('done'), options.quiet)
    return CLI_EXIT_CODES.success
  } finally {
    process.removeListener('SIGINT', cancelAnalysis)
    if (cancellationHold) clearInterval(cancellationHold)
  }
}

function printUsage() {
  process.stdout.write(cliT('usage.full') + '\n')
}

const usageErrorKeys: Record<CliUsageErrorCode, string> = {
  'invalid-url': 'errors.invalidUrl',
  'invalid-format': 'errors.invalidFormat',
  'invalid-viewports': 'errors.invalidViewport',
  'invalid-page-count': 'errors.invalidPageCount',
  'invalid-auth-mode': 'errors.invalidAuthMode',
  'invalid-dark-mode': 'errors.invalidDarkMode',
  'invalid-depth': 'errors.invalidDepth',
  'invalid-page-discovery': 'errors.invalidPageDiscovery',
  'missing-option-value': 'errors.missingOptionValue',
  'unknown-option': 'errors.unknownOption',
  'unexpected-argument': 'errors.unexpectedArgument',
  'conflicting-options': 'errors.conflictingOptions',
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
    } else if (error instanceof ExtractionRequestError) {
      exitCode = CLI_EXIT_CODES.usage
      message = error.message
    } else if (error instanceof BrowserExecutableError) {
      exitCode = CLI_EXIT_CODES.environment
      message = cliT(error.code === 'browser-not-found' ? 'errors.browserNotFound' : 'errors.invalidBrowserPath', {
        path: error.browserPath,
      })
    } else if (isCancellationError(error)) {
      exitCode = CLI_EXIT_CODES.cancelled
      message = cliT('errors.cancelled')
    } else if (error instanceof NoUsableCapturesError) {
      const baseMessage = cliT('errors.noUsableCaptures')
      const details = formatExtractionIssueDiagnosticsForDisplay(error.extractionIssues, diagnosticInputUrls)
      message = details ? coreT('en', 'common.captureDiagnostics', { message: baseMessage, details }) : baseMessage
    } else {
      message = cliT('errors.runtime', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
    if (message) {
      process.stderr.write(
        `${cliT('errors.prefix')}: ${sanitizeDiagnosticTextForDisplay(message, diagnosticInputUrls)}\n`,
      )
    }
    process.exitCode = exitCode
  })
