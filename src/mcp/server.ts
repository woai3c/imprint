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
import {
  generateCssVariables,
  generateDesignDoc,
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
          enum: ['tokens', 'css', 'tailwind', 'markdown', 'all'],
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
    name: 'imprint_compare',
    description: 'Compare design systems of two websites and return the differences.',
    inputSchema: {
      type: 'object',
      properties: {
        urlA: { type: 'string', description: 'First URL to compare' },
        urlB: { type: 'string', description: 'Second URL to compare' },
      },
      required: ['urlA', 'urlB'],
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
              text: generateDesignDoc(tokens, url, featureTags, undefined, undefined, result.components),
            },
          ],
        }
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
                  markdown: generateDesignDoc(tokens, url, featureTags, undefined, undefined, result.components),
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

  if (name === 'imprint_compare') {
    const urlA = params.urlA as string
    const urlB = params.urlB as string

    const [resultA, resultB] = await Promise.all([
      analyze(urlA, { viewports: ['desktop'], dataDir }),
      analyze(urlB, { viewports: ['desktop'], dataDir }),
    ])

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
