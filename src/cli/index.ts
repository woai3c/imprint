#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

import { analyze } from '../core/analyzer/index.js'
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
import { resolveCliExportFormats } from './export-formats.js'

interface CliOptions {
  format: string
  output: string
  viewport: string
  useSession: boolean
  darkMode: boolean
  quiet: boolean
  jsonStdout: boolean
  maxPages: number
  pageDiscovery: 'auto' | 'links' | 'sitemap'
}

const cliT = coreTranslator('en', 'cli.errors')
const valueOptions = new Set(['--format', '--output', '--viewport', '--pages', '--discovery'])
const switchOptions = new Set(['--no-session', '--dark-mode', '--quiet', '--json-stdout'])

function validateOptions(args: string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (valueOptions.has(argument)) {
      if (!args[index + 1] || args[index + 1].startsWith('-')) {
        throw new Error(cliT('missingOptionValue', { option: argument }))
      }
      index += 1
      continue
    }
    if (switchOptions.has(argument) || argument.startsWith('http')) continue
    if (argument.startsWith('-')) throw new Error(cliT('unknownOption', { option: argument }))
  }
}

function parseArgs(args: string[]): { url: string; options: CliOptions } {
  const url = args.find((a) => a.startsWith('http')) || args[0] || ''
  const options: CliOptions = {
    format: getFlag(args, '--format') || 'all',
    output: getFlag(args, '--output') || '.',
    viewport: getFlag(args, '--viewport') || 'desktop',
    useSession: !args.includes('--no-session'),
    darkMode: args.includes('--dark-mode'),
    quiet: args.includes('--quiet'),
    jsonStdout: args.includes('--json-stdout'),
    maxPages: Number.parseInt(getFlag(args, '--pages') || '3', 10),
    pageDiscovery: (getFlag(args, '--discovery') || 'auto') as CliOptions['pageDiscovery'],
  }
  return { url, options }
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

function log(msg: string, quiet: boolean) {
  if (!quiet) process.stderr.write(`${msg}\n`)
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage()
    process.exit(0)
  }

  if (args[0] === 'extract') {
    args.shift()
  }

  validateOptions(args)
  const { url, options } = parseArgs(args)

  if (!url || !url.startsWith('http')) {
    process.stderr.write('Error: Please provide a valid URL (starting with http/https)\n')
    process.exit(1)
  }
  if (!Number.isFinite(options.maxPages) || options.maxPages < 1 || options.maxPages > 5) {
    throw new Error('--pages must be an integer from 1 to 5')
  }
  if (!['auto', 'links', 'sitemap'].includes(options.pageDiscovery)) {
    throw new Error('--discovery must be auto, links, or sitemap')
  }
  const dataDir = getDefaultDataDir()

  const viewports = options.viewport === 'all' ? ['desktop', 'tablet', 'mobile'] : [options.viewport]

  log(`\n  Imprint — Analyzing ${url}\n`, options.quiet)

  const result = await analyze(
    url,
    {
      viewports,
      useSession: options.useSession,
      extractDarkMode: options.darkMode,
      maxPages: options.maxPages,
      pageDiscovery: options.pageDiscovery,
      dataDir,
    },
    (step, percent) => {
      log(`  [${percent}%] ${step}`, options.quiet)
    },
  )
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
    process.exit(0)
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
  log(
    `  Timing: total=${finalTiming.totalMs}ms browser=${finalTiming.browserMs || 0}ms preparation=${finalTiming.preparationMs || 0}ms health=${finalTiming.healthGateMs || 0}ms extraction=${finalTiming.extractionMs || 0}ms images=${finalTiming.imageCount}`,
    options.quiet,
  )
}

function printUsage() {
  process.stdout.write(`
  Imprint — Extract design systems from websites

  Usage:
    imprint extract <url> [options]

  Options:
    --format <type>     Output: design.md | reconstruction | tailwind | css | scss | json | evidence | profile | components | visual-qa | pdf | all (default: all)
    --output <path>     Output directory (default: current directory)
    --viewport <size>   Viewport: desktop | tablet | mobile | all (default: desktop)
    --dark-mode         Also extract dark mode theme
    --pages <count>     Analyze 1–5 pages (default: 3)
    --discovery <mode>  Page discovery: auto | links | sitemap (default: auto)
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

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`)
  process.exit(1)
})
