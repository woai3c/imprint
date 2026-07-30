#!/usr/bin/env node

/**
 * Imprint MCP Server — local stdio mode.
 * Allows AI agents (Cursor, Claude Desktop) to call Imprint via MCP protocol.
 *
 * Protocol: JSON-RPC over stdin/stdout
 *
 * Tools provided:
 * - imprint_extract: Extract design tokens from a URL
 * - imprint_compare: Compare design systems of two URLs
 */
import fs from 'node:fs'
import * as readline from 'node:readline'

import { getDefaultModel, resolveAiModelCapabilities } from '../core/ai/capabilities.js'
import { PROVIDER_KEY_ENV, providerApiKeyFromEnv } from '../core/ai/provider-env.js'
import type { AiImageInput } from '../core/ai/provider.js'
import { compareDesigns } from '../core/analyzer/design-compare.js'
import { analyze } from '../core/analyzer/index.js'
import { getDefaultDataDir } from '../core/data-dir.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import { selectEvidencePackage } from '../core/design-intelligence/evidence-selector.js'
import { compareDesignProfiles } from '../core/design-intelligence/profile-compare.js'
import { generateDesignProfileJson } from '../core/design-intelligence/profile-export.js'
import type { DesignProfile, IntelligenceInputMode } from '../core/design-intelligence/types.js'
import {
  generateCssVariables,
  generateDesignDoc,
  generateDesignEvidenceJson,
  generateDtcgJson,
  generateTailwindTheme,
} from '../core/export/index.js'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string }
}

const SERVER_INFO = {
  name: 'imprint',
  version: '0.1.0',
  capabilities: {
    tools: {},
  },
}

const TOOLS = [
  {
    name: 'imprint_extract',
    description: 'Extract design system tokens from a website URL. Returns colors, typography, spacing, and more.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to analyze' },
        format: {
          type: 'string',
          enum: ['tokens', 'evidence', 'css', 'tailwind', 'markdown', 'all'],
          description: 'Output format (default: tokens)',
        },
        viewport: {
          type: 'string',
          enum: ['desktop', 'tablet', 'mobile'],
          description: 'Viewport size (default: desktop)',
        },
        useSession: { type: 'boolean', description: "Reuse Imprint's saved browser session (default: true)" },
      },
      required: ['url'],
    },
  },
  {
    name: 'imprint_interpret',
    description:
      'Explicitly send a bounded Design Evidence package to a configured AI provider and return a validated DesignProfile. Structural mode sends no screenshots; vision mode requires allowScreenshots=true and rejects signed-in evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Public URL to analyze' },
        evidence: {
          type: 'object',
          description: 'Existing DesignEvidence v1 object (structural mode only; image paths are never read)',
        },
        mode: { type: 'string', enum: ['structural', 'vision'], description: 'Explicit AI input mode' },
        provider: { type: 'string', description: 'AI provider ID; key is read from the environment' },
        model: { type: 'string', description: 'Optional exact model ID' },
        baseUrl: { type: 'string', description: 'Optional OpenAI-compatible base URL' },
        allowScreenshots: { type: 'boolean', description: 'Required explicit consent for vision mode' },
        modelSupportsVision: {
          type: 'boolean',
          description: 'Explicit custom-provider capability declaration for the selected model',
        },
        language: { type: 'string', enum: ['en', 'zh-CN'] },
      },
      required: ['mode', 'provider'],
      anyOf: [{ required: ['url'] }, { required: ['evidence'] }],
    },
  },
  {
    name: 'imprint_compare',
    description:
      'Compare two websites at token depth by default, or explicitly interpret and compare validated design-language profiles.',
    inputSchema: {
      type: 'object',
      properties: {
        urlA: { type: 'string', description: 'First URL to compare' },
        urlB: { type: 'string', description: 'Second URL to compare' },
        profileA: { type: 'object', description: 'First previously validated DesignProfile' },
        profileB: { type: 'object', description: 'Second previously validated DesignProfile' },
        depth: { type: 'string', enum: ['tokens', 'language'], description: 'Comparison depth (default: tokens)' },
        provider: { type: 'string', description: 'Required for language depth; key is read from the environment' },
        model: { type: 'string', description: 'Optional exact model ID for language depth' },
        baseUrl: { type: 'string', description: 'Optional OpenAI-compatible base URL' },
      },
      anyOf: [{ required: ['urlA', 'urlB'] }, { required: ['profileA', 'profileB'] }],
    },
  },
]

function loadEvidenceImages(evidence: DesignEvidence, mode: IntelligenceInputMode): AiImageInput[] {
  if (mode !== 'multimodal') return []
  const imageIds = new Set(selectEvidencePackage(evidence, mode).imageIds)
  let totalBytes = 0
  return evidence.pages.flatMap((page) =>
    page.images.flatMap((image) => {
      if (!imageIds.has(image.id) || !fs.existsSync(image.path)) return []
      const size = fs.statSync(image.path).size
      if (size > 8 * 1024 * 1024 || totalBytes + size > 24 * 1024 * 1024) return []
      totalBytes += size
      const mimeType: AiImageInput['mimeType'] = /\.jpe?g$/i.test(image.path)
        ? 'image/jpeg'
        : /\.webp$/i.test(image.path)
          ? 'image/webp'
          : 'image/png'
      return [
        {
          name: `${image.id}.${mimeType.split('/')[1]}`,
          mimeType,
          base64: fs.readFileSync(image.path).toString('base64'),
        },
      ]
    }),
  )
}

async function interpretResult(
  evidence: DesignEvidence,
  params: Record<string, unknown>,
  mode: IntelligenceInputMode,
): Promise<DesignProfile> {
  const provider = String(params.provider || '')
  const apiKey = providerApiKeyFromEnv(provider)
  if (!provider || !apiKey) {
    throw new Error(
      `Explicit interpretation requires a provider and its API key. Set ${PROVIDER_KEY_ENV[provider] || 'IMPRINT_AI_API_KEY'} (or the generic IMPRINT_AI_API_KEY) in the MCP server's environment.`,
    )
  }
  const { interpretDesignEvidence } = await import('../core/design-intelligence/interpreter.js')
  const result = await interpretDesignEvidence(evidence, {
    mode,
    language: params.language === 'zh-CN' ? 'zh-CN' : 'en',
    provider: {
      provider,
      apiKey,
      model: params.model ? String(params.model) : undefined,
      baseUrl: params.baseUrl ? String(params.baseUrl) : undefined,
    },
    images: loadEvidenceImages(evidence, mode),
  })
  return result.profile
}

async function handleToolCall(name: string, params: Record<string, unknown>): Promise<unknown> {
  const dataDir = getDefaultDataDir()

  if (name === 'imprint_extract') {
    const url = params.url as string
    const format = (params.format as string) || 'tokens'
    const viewport = (params.viewport as string) || 'desktop'
    const useSession = params.useSession !== false

    const result = await analyze(url, {
      viewports: [viewport],
      useSession,
      extractDarkMode: true,
      dataDir,
    })

    const tokens = result.tokens
    const featureTags = result.featureTags

    switch (format) {
      case 'css':
        return { content: [{ type: 'text', text: generateCssVariables(tokens) }] }
      case 'tailwind':
        return { content: [{ type: 'text', text: generateTailwindTheme(tokens) }] }
      case 'markdown':
        return {
          content: [
            {
              type: 'text',
              text: generateDesignDoc(
                tokens,
                url,
                featureTags,
                undefined,
                undefined,
                result.components,
                'en',
                [],
                result.designEvidence,
              ),
            },
          ],
        }
      case 'evidence':
        return { content: [{ type: 'text', text: generateDesignEvidenceJson(result.designEvidence) }] }
      case 'all':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  tokens,
                  featureTags,
                  css: generateCssVariables(tokens),
                  tailwind: generateTailwindTheme(tokens),
                  evidence: result.designEvidence,
                  markdown: generateDesignDoc(
                    tokens,
                    url,
                    featureTags,
                    undefined,
                    undefined,
                    result.components,
                    'en',
                    [],
                    result.designEvidence,
                  ),
                  dtcg: generateDtcgJson(tokens),
                },
                null,
                2,
              ),
            },
          ],
        }
      default:
        return { content: [{ type: 'text', text: JSON.stringify({ tokens, featureTags }, null, 2) }] }
    }
  }

  if (name === 'imprint_interpret') {
    const url = String(params.url || '')
    const requestedMode = params.mode === 'vision' ? 'multimodal' : 'structural-only'
    if (requestedMode === 'multimodal' && params.allowScreenshots !== true) {
      throw new Error('Vision mode requires allowScreenshots=true')
    }
    if (
      requestedMode === 'multimodal' &&
      !resolveAiModelCapabilities(
        String(params.provider || ''),
        String(params.model || getDefaultModel(String(params.provider || ''))),
        params.provider === 'custom' && params.modelSupportsVision === true,
      ).vision
    ) {
      throw new Error('The selected model is not declared vision-capable')
    }
    let designEvidence: DesignEvidence
    if (params.evidence) {
      if (requestedMode === 'multimodal') {
        throw new Error('Existing evidence objects are structural-only because MCP-supplied file paths are not trusted')
      }
      designEvidence = params.evidence as DesignEvidence
      if (designEvidence.schemaVersion !== '1' || !designEvidence.analysisId || !designEvidence.source) {
        throw new Error('The evidence input must be a DesignEvidence v1 object')
      }
    } else {
      const result = await analyze(url, {
        viewports: ['desktop', 'mobile'],
        useSession: false,
        extractDarkMode: true,
        dataDir,
      })
      designEvidence = result.designEvidence
    }
    const profile = await interpretResult(designEvidence, params, requestedMode)
    return { content: [{ type: 'text', text: generateDesignProfileJson(profile) }] }
  }

  if (name === 'imprint_compare') {
    if (params.profileA && params.profileB) {
      const profileA = params.profileA as DesignProfile
      const profileB = params.profileB as DesignProfile
      if (profileA.schemaVersion !== '1' || profileB.schemaVersion !== '1' || !profileA.thesis || !profileB.thesis) {
        throw new Error('Both profile inputs must be validated DesignProfile v1 objects')
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(compareDesignProfiles(profileA, profileB), null, 2) }],
      }
    }
    const urlA = params.urlA as string
    const urlB = params.urlB as string

    const [resultA, resultB] = await Promise.all([
      analyze(urlA, { viewports: ['desktop'], dataDir }),
      analyze(urlB, { viewports: ['desktop'], dataDir }),
    ])

    if (params.depth === 'language') {
      if (!params.provider) throw new Error('Language comparison requires an explicit provider')
      const [profileA, profileB] = await Promise.all([
        interpretResult(resultA.designEvidence, params, 'structural-only'),
        interpretResult(resultB.designEvidence, params, 'structural-only'),
      ])
      return {
        content: [{ type: 'text', text: JSON.stringify(compareDesignProfiles(profileA, profileB), null, 2) }],
      }
    }
    const diff = compareDesigns(resultA.tokens, resultB.tokens, urlA, urlB)
    return { content: [{ type: 'text', text: JSON.stringify(diff, null, 2) }] }
  }

  throw new Error(`Unknown tool: ${name}`)
}

function sendResponse(response: JsonRpcResponse) {
  const json = JSON.stringify(response)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`)
}

async function handleRequest(request: JsonRpcRequest) {
  try {
    let result: unknown

    switch (request.method) {
      case 'initialize':
        result = { protocolVersion: '2024-11-05', serverInfo: SERVER_INFO, capabilities: { tools: {} } }
        break

      case 'tools/list':
        result = { tools: TOOLS }
        break

      case 'tools/call': {
        const toolName = (request.params as { name: string }).name
        const args = (request.params as { arguments?: Record<string, unknown> }).arguments || {}
        result = await handleToolCall(toolName, args)
        break
      }

      case 'notifications/initialized':
        return

      default:
        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        })
        return
    }

    sendResponse({ jsonrpc: '2.0', id: request.id, result })
  } catch (err) {
    sendResponse({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
    })
  }
}

function startStdioServer() {
  const rl = readline.createInterface({ input: process.stdin })
  let buffer = ''

  rl.on('line', (line) => {
    buffer += line

    if (line.trim() === '' && buffer.trim()) {
      // Check for Content-Length header pattern
      const contentMatch = buffer.match(/Content-Length:\s*(\d+)/)
      if (contentMatch) {
        buffer = ''
        return
      }
    }

    try {
      const request = JSON.parse(buffer.trim()) as JsonRpcRequest
      buffer = ''
      handleRequest(request)
    } catch {
      // Not a complete JSON yet, keep buffering
    }
  })

  process.stderr.write('Imprint MCP Server started (stdio mode)\n')
}

startStdioServer()
