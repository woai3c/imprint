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
import * as readline from 'node:readline'

import { compareDesigns } from '../core/analyzer/design-compare.js'
import { analyze } from '../core/analyzer/index.js'
import { getDefaultDataDir } from '../core/data-dir.js'
import { createDeterministicDesignContext } from '../core/design-context/deterministic-context.js'
import { compareDesignProfiles } from '../core/design-context/profile-compare.js'
import type { DesignProfile } from '../core/design-context/types.js'
import {
  buildDarkModeExportData,
  generateComponentSpecsJson,
  generateCssVariables,
  generateDesignDoc,
  generateDesignEvidenceJson,
  generateDtcgJson,
  generateLocalVisualQa,
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
          enum: ['tokens', 'evidence', 'component-specs', 'visual-qa', 'css', 'tailwind', 'markdown', 'all'],
          description: 'Output format (default: tokens)',
        },
        viewport: {
          type: 'string',
          enum: ['desktop', 'tablet', 'mobile'],
          description: 'Viewport size (default: desktop)',
        },
        useSession: { type: 'boolean', description: "Reuse Imprint's saved browser session (default: true)" },
        maxPages: { type: 'integer', minimum: 1, maximum: 5, description: 'Pages to analyze (default: 3)' },
        discovery: {
          type: 'string',
          enum: ['auto', 'links', 'sitemap'],
          description: 'Sub-page discovery strategy (default: auto)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'imprint_compare',
    description: 'Compare two websites at token depth or deterministic design-language depth.',
    inputSchema: {
      type: 'object',
      properties: {
        urlA: { type: 'string', description: 'First URL to compare' },
        urlB: { type: 'string', description: 'Second URL to compare' },
        profileA: { type: 'object', description: 'First previously validated DesignProfile' },
        profileB: { type: 'object', description: 'Second previously validated DesignProfile' },
        depth: { type: 'string', enum: ['tokens', 'language'], description: 'Comparison depth (default: tokens)' },
      },
      anyOf: [{ required: ['urlA', 'urlB'] }, { required: ['profileA', 'profileB'] }],
    },
  },
]

async function handleToolCall(name: string, params: Record<string, unknown>): Promise<unknown> {
  const dataDir = getDefaultDataDir()

  if (name === 'imprint_extract') {
    const url = params.url as string
    const format = (params.format as string) || 'tokens'
    const viewport = (params.viewport as string) || 'desktop'
    const useSession = params.useSession !== false
    const maxPages = Math.min(5, Math.max(1, Number(params.maxPages) || 3))
    const pageDiscovery = ['links', 'sitemap'].includes(String(params.discovery))
      ? (String(params.discovery) as 'links' | 'sitemap')
      : 'auto'

    const result = await analyze(url, {
      viewports: [viewport],
      useSession,
      extractDarkMode: true,
      dataDir,
      maxPages,
      pageDiscovery,
    })

    const tokens = result.tokens
    const featureTags = result.featureTags
    const darkMode = buildDarkModeExportData(result.darkMode)
    const designContext = createDeterministicDesignContext(result.designEvidence, tokens, 'en')

    switch (format) {
      case 'css':
        return { content: [{ type: 'text', text: generateCssVariables(tokens, darkMode, result.breakpoints) }] }
      case 'tailwind':
        return { content: [{ type: 'text', text: generateTailwindTheme(tokens, darkMode, result.breakpoints) }] }
      case 'markdown':
        return {
          content: [
            {
              type: 'text',
              text: generateDesignDoc(
                tokens,
                url,
                featureTags,
                darkMode,
                result.breakpoints,
                result.components,
                'en',
                result.designEvidence,
                designContext.profile,
              ),
            },
          ],
        }
      case 'evidence':
        return { content: [{ type: 'text', text: generateDesignEvidenceJson(result.designEvidence) }] }
      case 'component-specs':
        return { content: [{ type: 'text', text: generateComponentSpecsJson(result.designEvidence) }] }
      case 'visual-qa':
        return {
          content: [{ type: 'text', text: JSON.stringify(generateLocalVisualQa(result.designEvidence), null, 2) }],
        }
      case 'all':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  tokens,
                  darkMode,
                  featureTags,
                  pageCoverage: result.pageCoverage,
                  extractionIssues: result.extractionIssues,
                  analysisTiming: result.timing,
                  designProfile: designContext.profile,
                  reconstructionBrief: designContext.reconstructionBrief,
                  agentContext: designContext.agentContext,
                  validationReport: designContext.validationReport,
                  css: generateCssVariables(tokens, darkMode, result.breakpoints),
                  tailwind: generateTailwindTheme(tokens, darkMode, result.breakpoints),
                  evidence: result.designEvidence,
                  markdown: generateDesignDoc(
                    tokens,
                    url,
                    featureTags,
                    darkMode,
                    result.breakpoints,
                    result.components,
                    'en',
                    result.designEvidence,
                    designContext.profile,
                  ),
                  dtcg: generateDtcgJson(tokens, darkMode),
                },
                null,
                2,
              ),
            },
          ],
        }
      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  tokens,
                  darkMode,
                  featureTags,
                  pageCoverage: result.pageCoverage,
                  extractionIssues: result.extractionIssues,
                  analysisTiming: result.timing,
                },
                null,
                2,
              ),
            },
          ],
        }
    }
  }

  if (name === 'imprint_compare') {
    if (params.profileA && params.profileB) {
      const profileA = params.profileA as DesignProfile
      const profileB = params.profileB as DesignProfile
      if (
        profileA.schemaVersion !== '2' ||
        profileB.schemaVersion !== '2' ||
        profileA.claimSource !== 'deterministic-catalog' ||
        profileB.claimSource !== 'deterministic-catalog' ||
        !profileA.thesis ||
        !profileB.thesis
      ) {
        throw new Error('Both profile inputs must be deterministic DesignProfile v2 objects')
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
      const contextA = createDeterministicDesignContext(resultA.designEvidence, resultA.tokens, 'en')
      const contextB = createDeterministicDesignContext(resultB.designEvidence, resultB.tokens, 'en')
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                comparison: compareDesignProfiles(contextA.profile, contextB.profile),
                timing: {
                  first: resultA.timing,
                  second: resultB.timing,
                },
              },
              null,
              2,
            ),
          },
        ],
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
