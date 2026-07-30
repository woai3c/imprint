#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

import { getDefaultModel, resolveAiModelCapabilities } from '../core/ai/capabilities.js'
import type { AiImageInput } from '../core/ai/provider.js'
import { analyze } from '../core/analyzer/index.js'
import { getDefaultDataDir } from '../core/data-dir.js'
import { selectEvidencePackage } from '../core/design-intelligence/evidence-selector.js'
import { generateDesignProfileJson } from '../core/design-intelligence/profile-export.js'
import { generateReconstructionBrief } from '../core/design-intelligence/reconstruction-brief.js'
import type { DesignProfile, IntelligenceInputMode } from '../core/design-intelligence/types.js'
import {
  generateCssVariables,
  generateDesignDoc,
  generateDesignEvidenceJson,
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
  intelligence: 'none' | 'structural' | 'vision'
  provider: string
  model: string
  baseUrl: string
  allowScreenshots: boolean
  modelSupportsVision: boolean
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
    intelligence: (getFlag(args, '--intelligence') || 'none') as CliOptions['intelligence'],
    provider: getFlag(args, '--provider') || '',
    model: getFlag(args, '--model') || '',
    baseUrl: getFlag(args, '--base-url') || '',
    allowScreenshots: args.includes('--allow-screenshots'),
    modelSupportsVision: args.includes('--model-supports-vision'),
  }
  return { url, options }
}

function providerApiKey(provider: string): string {
  const names: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    moonshotai: 'MOONSHOT_API_KEY',
    alibaba: 'ALIBABA_API_KEY',
    zhipu: 'ZHIPU_API_KEY',
    xai: 'XAI_API_KEY',
    custom: 'IMPRINT_AI_API_KEY',
  }
  return process.env.IMPRINT_AI_API_KEY || process.env[names[provider] || 'IMPRINT_AI_API_KEY'] || ''
}

function mimeTypeForPath(filePath: string): AiImageInput['mimeType'] {
  if (/\.jpe?g$/i.test(filePath)) return 'image/jpeg'
  if (/\.webp$/i.test(filePath)) return 'image/webp'
  return 'image/png'
}

function loadEvidenceImages(
  evidence: Parameters<typeof selectEvidencePackage>[0],
  mode: IntelligenceInputMode,
): AiImageInput[] {
  if (mode !== 'multimodal') return []
  const selected = new Set(selectEvidencePackage(evidence, mode).imageIds)
  let totalBytes = 0
  return evidence.pages
    .flatMap((page) => page.images)
    .filter((image) => selected.has(image.id) && fs.existsSync(image.path))
    .flatMap((image) => {
      const size = fs.statSync(image.path).size
      if (size > 8 * 1024 * 1024 || totalBytes + size > 24 * 1024 * 1024) return []
      totalBytes += size
      const mimeType = mimeTypeForPath(image.path)
      return [
        {
          name: `${image.id}.${mimeType.split('/')[1]}`,
          mimeType,
          base64: fs.readFileSync(image.path).toString('base64'),
        },
      ]
    })
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
  if (!['none', 'structural', 'vision'].includes(options.intelligence)) {
    throw new Error('--intelligence must be none, structural, or vision')
  }
  if (options.intelligence !== 'none' && !options.provider) {
    throw new Error('--provider is required when design intelligence is enabled')
  }
  if (options.intelligence === 'vision' && !options.allowScreenshots) {
    throw new Error('Vision mode requires the explicit --allow-screenshots consent flag')
  }
  if (
    options.intelligence === 'vision' &&
    !resolveAiModelCapabilities(
      options.provider,
      options.model || getDefaultModel(options.provider),
      options.provider === 'custom' && options.modelSupportsVision,
    ).vision
  ) {
    throw new Error('The selected model is not declared vision-capable')
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
      dataDir,
    },
    (step, percent) => {
      log(`  [${percent}%] ${step}`, options.quiet)
    },
  )

  let profile: DesignProfile | null = null
  let reconstructionBrief: string | undefined
  if (options.intelligence !== 'none') {
    const apiKey = providerApiKey(options.provider)
    if (!apiKey) {
      throw new Error(
        `Missing API key. Set IMPRINT_AI_API_KEY or the standard environment variable for ${options.provider}.`,
      )
    }
    const mode: IntelligenceInputMode = options.intelligence === 'vision' ? 'multimodal' : 'structural-only'
    log(`  Interpreting design language (${mode})...`, options.quiet)
    const { interpretDesignEvidence } = await import('../core/design-intelligence/interpreter.js')
    const interpreted = await interpretDesignEvidence(result.designEvidence, {
      mode,
      language: 'en',
      provider: {
        provider: options.provider,
        apiKey,
        baseUrl: options.baseUrl || undefined,
        model: options.model || undefined,
      },
      images: loadEvidenceImages(result.designEvidence, mode),
    })
    profile = interpreted.profile
    reconstructionBrief = generateReconstructionBrief(profile, result.designEvidence, result.tokens)
  }

  const cssVars = generateCssVariables(result.tokens)
  const tailwind = generateTailwindTheme(result.tokens)
  const designDoc = generateDesignDoc(
    result.tokens,
    url,
    result.featureTags,
    undefined,
    undefined,
    result.components,
    'en',
    [],
    result.designEvidence,
    profile || undefined,
    reconstructionBrief,
  )
  const dtcgJson = generateDtcgJson(result.tokens)
  const evidenceJson = generateDesignEvidenceJson(result.designEvidence)

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

  const formats =
    options.format === 'all'
      ? ['design.md', 'tailwind', 'css', 'scss', 'json', 'evidence', ...(profile ? ['profile'] : []), 'pdf']
      : [options.format]

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
      case 'evidence':
        filename = 'design-evidence.json'
        content = evidenceJson
        break
      case 'profile':
        if (!profile) throw new Error('Profile export requires --intelligence structural or vision')
        filename = 'design-profile.json'
        content = generateDesignProfileJson(profile)
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
    --format <type>     Output: design.md | tailwind | css | json | evidence | profile | all (default: all)
    --output <path>     Output directory (default: current directory)
    --viewport <size>   Viewport: desktop | tablet | mobile | all (default: desktop)
    --dark-mode         Also extract dark mode theme
    --no-session        Don't reuse Imprint's saved browser session
    --json-stdout       Output token JSON to stdout (pipe-friendly)
    --quiet             Suppress progress output
    --intelligence <m>  Design interpretation: none | structural | vision (default: none)
    --provider <id>     AI provider for explicit interpretation
    --model <id>        Optional exact model ID
    --base-url <url>    Optional custom OpenAI-compatible API base URL
    --allow-screenshots Required consent for vision mode; signed-in evidence is still excluded
    --model-supports-vision Declare image support for a custom OpenAI-compatible model

  Examples:
    imprint extract https://vercel.com
    imprint extract https://github.com --format design.md --output ./design/
    imprint extract https://stripe.com --format json --json-stdout | jq .colors
    imprint extract https://example.com --viewport all --intelligence structural --provider openai --format profile

`)
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`)
  process.exit(1)
})
