#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { analyze } from '../core/analyzer/index.js'
import {
  generateCssVariables,
  generateDesignDoc,
  generateDtcgJson,
  generatePdfHtml,
  generateScssVariables,
  generateTailwindTheme,
} from '../core/export/index.js'

interface CliOptions {
  format: string
  output: string
  viewport: string
  useSession: boolean
  darkMode: boolean
  quiet: boolean
  jsonStdout: boolean
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

  const { url, options } = parseArgs(args)

  if (!url || !url.startsWith('http')) {
    process.stderr.write('Error: Please provide a valid URL (starting with http/https)\n')
    process.exit(1)
  }

  const dataDir = path.join(os.homedir(), '.imprint')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const viewports = options.viewport === 'all' ? ['desktop', 'tablet', 'mobile'] : [options.viewport]

  log(`\n  Imprint — Analyzing ${url}\n`, options.quiet)

  const result = await analyze(
    url,
    {
      viewports,
      useSession: options.useSession,
      extractDarkMode: options.darkMode,
      dataDir,
    },
    (step, percent) => {
      log(`  [${percent}%] ${step}`, options.quiet)
    },
  )

  const cssVars = generateCssVariables(result.tokens)
  const tailwind = generateTailwindTheme(result.tokens)
  const designDoc = generateDesignDoc(result.tokens, url, result.featureTags)
  const dtcgJson = generateDtcgJson(result.tokens)

  // JSON stdout mode — pipe-friendly
  if (options.jsonStdout) {
    process.stdout.write(JSON.stringify(result.tokens, null, 2))
    process.exit(0)
  }

  // Determine output directory
  const outputDir = path.resolve(options.output)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const formats = options.format === 'all' ? ['design.md', 'tailwind', 'css', 'scss', 'json', 'pdf'] : [options.format]

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
        content = generateScssVariables(result.tokens)
        break
      case 'json':
        filename = 'design-tokens.json'
        content = dtcgJson
        break
      case 'pdf':
        filename = 'style-guide.html'
        content = generatePdfHtml(result.tokens, url, result.featureTags)
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
}

function printUsage() {
  process.stdout.write(`
  Imprint — Extract design systems from websites

  Usage:
    imprint extract <url> [options]

  Options:
    --format <type>     Output format: design.md | tailwind | css | json | all (default: all)
    --output <path>     Output directory (default: current directory)
    --viewport <size>   Viewport: desktop | tablet | mobile | all (default: desktop)
    --dark-mode         Also extract dark mode theme
    --no-session        Don't reuse browser login state
    --json-stdout       Output token JSON to stdout (pipe-friendly)
    --quiet             Suppress progress output

  Examples:
    imprint extract https://vercel.com
    imprint extract https://github.com --format design.md --output ./design/
    imprint extract https://stripe.com --format json --json-stdout | jq .colors

`)
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`)
  process.exit(1)
})
