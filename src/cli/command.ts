import { chromium } from 'playwright-core'

import {
  AnalysisRequestError,
  type AnalysisViewport,
  createAnalysisRequest,
  findBrowser,
  validateBrowserExecutablePath,
} from '../core/analyzer/index.js'

export const CLI_EXIT_CODES = {
  success: 0,
  usage: 2,
  environment: 3,
  runtime: 4,
  cancelled: 130,
} as const

export type CliExitCode = (typeof CLI_EXIT_CODES)[keyof typeof CLI_EXIT_CODES]
export type CliUsageErrorCode =
  | 'invalid-url'
  | 'invalid-viewports'
  | 'invalid-page-count'
  | 'invalid-auth-mode'
  | 'invalid-dark-mode'
  | 'invalid-depth'
  | 'invalid-page-discovery'
  | 'missing-option-value'
  | 'unknown-option'
  | 'unexpected-argument'

export class CliUsageError extends Error {
  constructor(
    readonly code: CliUsageErrorCode,
    readonly detail?: string,
  ) {
    super(code)
    this.name = 'CliUsageError'
  }
}

export class CliCancellationError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'CliCancellationError'
  }
}

export interface CliExtractOptions {
  format: string
  output: string
  viewports: AnalysisViewport[]
  useSession: boolean
  darkMode: boolean
  quiet: boolean
  jsonStdout: boolean
  maxPages: number
  pageDiscovery: 'auto' | 'links' | 'sitemap'
  browserPath?: string
}

export type CliCommand =
  | { kind: 'help' }
  | { kind: 'doctor'; browserPath?: string; json: boolean }
  | { kind: 'extract'; url: string; options: CliExtractOptions }

interface ScannedArgs {
  values: Map<string, string>
  switches: Set<string>
  positionals: string[]
}

const extractValueOptions = new Set(['--format', '--output', '--viewport', '--pages', '--discovery', '--browser-path'])
const extractSwitchOptions = new Set(['--no-session', '--dark-mode', '--quiet', '--json-stdout'])
const doctorValueOptions = new Set(['--browser-path'])
const doctorSwitchOptions = new Set(['--json'])

function scanArgs(args: string[], valueOptions: Set<string>, switchOptions: Set<string>): ScannedArgs {
  const values = new Map<string, string>()
  const switches = new Set<string>()
  const positionals: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (valueOptions.has(argument)) {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) throw new CliUsageError('missing-option-value', argument)
      values.set(argument, value)
      index += 1
      continue
    }
    if (switchOptions.has(argument)) {
      switches.add(argument)
      continue
    }
    if (argument.startsWith('-')) throw new CliUsageError('unknown-option', argument)
    positionals.push(argument)
  }

  return { values, switches, positionals }
}

function analysisRequestError(error: unknown): never {
  if (error instanceof AnalysisRequestError) throw new CliUsageError(error.code)
  throw error
}

export function parseCliCommand(args: string[]): CliCommand {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) return { kind: 'help' }

  if (args[0] === 'doctor') {
    const scanned = scanArgs(args.slice(1), doctorValueOptions, doctorSwitchOptions)
    if (scanned.positionals.length > 0) {
      throw new CliUsageError('unexpected-argument', scanned.positionals[0])
    }
    return {
      kind: 'doctor',
      browserPath: scanned.values.get('--browser-path'),
      json: scanned.switches.has('--json'),
    }
  }

  const extractArgs = args[0] === 'extract' ? args.slice(1) : args
  const scanned = scanArgs(extractArgs, extractValueOptions, extractSwitchOptions)
  if (scanned.positionals.length !== 1) {
    throw new CliUsageError(
      scanned.positionals.length === 0 ? 'invalid-url' : 'unexpected-argument',
      scanned.positionals[1],
    )
  }

  const viewport = scanned.values.get('--viewport') || 'desktop'
  if (!['desktop', 'tablet', 'mobile', 'all'].includes(viewport)) {
    throw new CliUsageError('invalid-viewports', viewport)
  }
  const viewports = (viewport === 'all' ? ['desktop', 'tablet', 'mobile'] : [viewport]) as AnalysisViewport[]

  const pagesText = scanned.values.get('--pages')
  if (pagesText !== undefined && !/^\d+$/.test(pagesText)) throw new CliUsageError('invalid-page-count', pagesText)
  const maxPages = pagesText === undefined ? undefined : Number(pagesText)
  const pageDiscovery = scanned.values.get('--discovery') || 'auto'
  if (!['auto', 'links', 'sitemap'].includes(pageDiscovery)) {
    throw new CliUsageError('invalid-page-discovery', pageDiscovery)
  }

  try {
    const request = createAnalysisRequest({
      url: scanned.positionals[0],
      viewports,
      maxPages,
      useSession: !scanned.switches.has('--no-session'),
      extractDarkMode: scanned.switches.has('--dark-mode'),
      pageDiscovery: pageDiscovery as CliExtractOptions['pageDiscovery'],
    })
    return {
      kind: 'extract',
      url: request.url,
      options: {
        format: scanned.values.get('--format') || 'all',
        output: scanned.values.get('--output') || '.',
        viewports: request.viewports,
        useSession: request.authMode !== 'anonymous',
        darkMode: request.extractDarkMode,
        quiet: scanned.switches.has('--quiet'),
        jsonStdout: scanned.switches.has('--json-stdout'),
        maxPages: request.maxPages,
        pageDiscovery: request.pageDiscovery,
        browserPath: scanned.values.get('--browser-path'),
      },
    }
  } catch (error) {
    analysisRequestError(error)
  }
}

export interface DoctorCheck {
  id: 'node-runtime' | 'platform' | 'browser-path' | 'browser-launch'
  ok: boolean
  actual: string | null
  expected?: string
  reason?: string
}

export interface DoctorResult {
  schemaVersion: '1'
  ok: boolean
  checks: DoctorCheck[]
  browserPath: string | null
}

function nodeVersionSupported(version: string): boolean {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  return major > 20 || (major === 20 && minor >= 19)
}

export async function runDoctor(explicitBrowserPath?: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [
    {
      id: 'node-runtime',
      ok: nodeVersionSupported(process.version),
      actual: process.version,
      expected: '>=20.19.0',
    },
    {
      id: 'platform',
      ok: ['darwin', 'win32', 'linux'].includes(process.platform),
      actual: `${process.platform}/${process.arch}`,
      expected: 'darwin|win32|linux',
    },
  ]

  const browserPath =
    explicitBrowserPath === undefined ? findBrowser() : validateBrowserExecutablePath(explicitBrowserPath)
  checks.push({
    id: 'browser-path',
    ok: Boolean(browserPath),
    actual: browserPath || explicitBrowserPath || null,
    expected: 'accessible executable file',
  })

  if (browserPath) {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    try {
      browser = await chromium.launch({ executablePath: browserPath, headless: true })
      checks.push({ id: 'browser-launch', ok: true, actual: browser.version() })
    } catch (error) {
      checks.push({
        id: 'browser-launch',
        ok: false,
        actual: null,
        reason: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await browser?.close().catch(() => {})
    }
  } else {
    checks.push({ id: 'browser-launch', ok: false, actual: null, reason: 'browser-path-unavailable' })
  }

  return {
    schemaVersion: '1',
    ok: checks.every((check) => check.ok),
    checks,
    browserPath: browserPath || null,
  }
}

export function isCancellationError(error: unknown): boolean {
  return error instanceof CliCancellationError || (error instanceof Error && error.name === 'AbortError')
}
