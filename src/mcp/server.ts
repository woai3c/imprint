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
import { AnalysisActiveTimeoutError, analyze } from '../core/analyzer/index.js'
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
import { coreTranslator } from '../core/i18n/index.js'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

const SERVER_INFO = {
  name: 'imprint',
  version: '0.0.3',
}

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const
const mcpT = coreTranslator('en', 'mcp')

class ProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'ProtocolError'
  }
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

async function handleToolCall(name: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
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
      signal,
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
      analyze(urlA, { viewports: ['desktop'], dataDir, signal }),
      analyze(urlB, { viewports: ['desktop'], dataDir, signal }),
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

  throw new ProtocolError(-32602, mcpT('errors.unknownTool', { name }))
}

function sendResponse(response: JsonRpcResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

function sendError(id: JsonRpcResponse['id'], code: number, message: string): void {
  sendResponse({ jsonrpc: '2.0', id, error: { code, message } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requestKey(id: string | number): string {
  return `${typeof id}:${String(id)}`
}

const activeRequests = new Map<string, AbortController>()
let initializeResponded = false
let initialized = false

async function handleRequest(request: JsonRpcRequest & { id: string | number }) {
  try {
    let result: unknown

    switch (request.method) {
      case 'initialize': {
        if (initializeResponded) throw new ProtocolError(-32600, mcpT('errors.alreadyInitialized'))
        const requestedVersion =
          typeof request.params?.protocolVersion === 'string' ? request.params.protocolVersion : null
        const clientInfo = request.params?.clientInfo
        if (
          !requestedVersion ||
          !isRecord(request.params?.capabilities) ||
          !isRecord(clientInfo) ||
          typeof clientInfo.name !== 'string' ||
          typeof clientInfo.version !== 'string'
        ) {
          throw new ProtocolError(-32602, mcpT('errors.invalidInitialize'))
        }
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(
          requestedVersion as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number],
        )
          ? requestedVersion
          : SUPPORTED_PROTOCOL_VERSIONS[0]
        result = { protocolVersion, serverInfo: SERVER_INFO, capabilities: { tools: {} } }
        initializeResponded = true
        break
      }

      case 'ping':
        result = {}
        break

      case 'tools/list':
        if (!initialized) throw new ProtocolError(-32600, mcpT('errors.notInitialized'))
        result = { tools: TOOLS }
        break

      case 'tools/call': {
        if (!initialized) throw new ProtocolError(-32600, mcpT('errors.notInitialized'))
        const toolName = request.params?.name
        const args = request.params?.arguments
        if (typeof toolName !== 'string' || (args !== undefined && !isRecord(args))) {
          throw new ProtocolError(-32602, mcpT('errors.invalidToolCall'))
        }
        const controller = new AbortController()
        const key = requestKey(request.id)
        activeRequests.set(key, controller)
        try {
          result = await handleToolCall(toolName, args || {}, controller.signal)
        } catch (error) {
          if (controller.signal.aborted) return
          if (error instanceof ProtocolError) throw error
          const message =
            error instanceof AnalysisActiveTimeoutError
              ? mcpT('errors.activeTimeout', { seconds: Math.round(error.timeoutMs / 1000) })
              : error instanceof Error
                ? error.message
                : String(error)
          result = {
            content: [
              {
                type: 'text',
                text: mcpT('errors.toolExecution', {
                  message,
                }),
              },
            ],
            isError: true,
          }
        } finally {
          activeRequests.delete(key)
        }
        break
      }

      default:
        throw new ProtocolError(-32601, mcpT('errors.methodNotFound', { method: request.method }))
    }

    sendResponse({ jsonrpc: '2.0', id: request.id, result })
  } catch (error) {
    if (error instanceof ProtocolError) {
      sendError(request.id, error.code, error.message)
      return
    }
    sendError(request.id, -32603, mcpT('errors.internal'))
  }
}

function handleNotification(notification: JsonRpcRequest): void {
  if (notification.method === 'notifications/initialized') {
    if (initializeResponded) initialized = true
    return
  }
  if (notification.method === 'notifications/cancelled') {
    const requestId = notification.params?.requestId
    if (typeof requestId === 'string' || typeof requestId === 'number') {
      activeRequests.get(requestKey(requestId))?.abort(new DOMException('MCP request cancelled', 'AbortError'))
    }
  }
}

async function handleLine(line: string): Promise<void> {
  if (!line.trim()) return

  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    sendError(null, -32700, mcpT('errors.parse'))
    return
  }

  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    sendError(null, -32600, mcpT('errors.invalidRequest'))
    return
  }

  const request = message as unknown as JsonRpcRequest
  if (request.id === undefined) {
    handleNotification(request)
    return
  }
  if (typeof request.id !== 'string' && typeof request.id !== 'number') {
    sendError(null, -32600, mcpT('errors.invalidRequest'))
    return
  }
  if (request.params !== undefined && !isRecord(request.params)) {
    sendError(request.id, -32602, mcpT('errors.invalidParams'))
    return
  }

  await handleRequest(request as JsonRpcRequest & { id: string | number })
}

function startStdioServer() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('line', (line) => {
    void handleLine(line)
  })
  rl.on('close', () => {
    for (const controller of activeRequests.values()) {
      controller.abort(new DOMException('MCP transport closed', 'AbortError'))
    }
    activeRequests.clear()
  })

  process.stderr.write(`${mcpT('started')}\n`)
}

startStdioServer()
