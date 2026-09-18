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

import { compareDesigns } from '../core/analyzer/design-compare.js'
import { NoUsableCapturesError, analyze } from '../core/analyzer/index.js'
import {
  formatExtractionIssueDiagnosticsForDisplay,
  sanitizeDiagnosticTextForDisplay,
  sanitizeUrlForPersistence,
} from '../core/analyzer/url-privacy.js'
import { getDefaultDataDir } from '../core/data-dir.js'
import { createDeterministicDesignContext } from '../core/design-context/deterministic-context.js'
import { compareDesignProfiles } from '../core/design-context/profile-compare.js'
import { isCurrentDesignProfile } from '../core/design-context/types.js'
import type { DesignProfile } from '../core/design-context/types.js'
import { runExtraction } from '../core/extraction-delivery.js'
import { EXTRACTION_FORMAT_NAMES, createExtractionRequest } from '../core/extraction-request.js'
import { coreT, coreTranslator } from '../core/i18n/index.js'

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

const packageMetadata = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version?: unknown
}
if (typeof packageMetadata.version !== 'string') throw new Error('package.json does not contain a valid version')

const SERVER_INFO = {
  name: 'imprint',
  version: packageMetadata.version,
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
    description: mcpT('extract.description'),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: { type: 'string', description: mcpT('extract.url') },
        format: {
          type: 'string',
          enum: EXTRACTION_FORMAT_NAMES,
          default: 'design.md',
          description: mcpT('extract.format'),
        },
        outputDir: { type: 'string', description: mcpT('extract.outputDir') },
        overwrite: { type: 'boolean', default: false, description: mcpT('extract.overwrite') },
        viewport: {
          type: 'string',
          enum: ['desktop', 'tablet', 'mobile', 'all'],
          default: 'desktop',
          description: mcpT('extract.viewport'),
        },
        useSession: { type: 'boolean', default: false, description: mcpT('extract.useSession') },
        darkMode: { type: 'boolean', default: false, description: mcpT('extract.darkMode') },
        browserPath: { type: 'string', description: mcpT('extract.browserPath') },
        maxPages: { type: 'integer', minimum: 1, maximum: 20, default: 8, description: mcpT('extract.maxPages') },
        discovery: {
          type: 'string',
          enum: ['auto', 'links', 'sitemap'],
          default: 'auto',
          description: mcpT('extract.discovery'),
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
  if (name === 'imprint_extract') {
    const request = createExtractionRequest(params, 'mcp')
    const delivery = await runExtraction(request, {
      signal,
      onDiagnostic: (message) => process.stderr.write(message + '\n'),
    })
    return { content: [{ type: 'text', text: delivery.text }], structuredContent: delivery.structuredContent }
  }

  if (name === 'imprint_compare') {
    if (params.profileA && params.profileB) {
      const profileA = params.profileA as DesignProfile
      const profileB = params.profileB as DesignProfile
      if (!isCurrentDesignProfile(profileA) || !isCurrentDesignProfile(profileB)) {
        throw new Error('Both profile inputs must be current deterministic DesignProfile v3 objects')
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(compareDesignProfiles(profileA, profileB), null, 2) }],
      }
    }
    const dataDir = getDefaultDataDir()
    const urlA = params.urlA as string
    const urlB = params.urlB as string

    const [resultA, resultB] = await Promise.all([
      analyze(urlA, { viewports: ['desktop'], dataDir, signal }),
      analyze(urlB, { viewports: ['desktop'], dataDir, signal }),
    ])

    if (params.depth === 'language') {
      const contextA = createDeterministicDesignContext(resultA.designEvidence, 'en')
      const contextB = createDeterministicDesignContext(resultB.designEvidence, 'en')
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
    const diff = compareDesigns(
      resultA.tokens,
      resultB.tokens,
      sanitizeUrlForPersistence(urlA),
      sanitizeUrlForPersistence(urlB),
    )
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

function diagnosticUrlsFromParams(params: Record<string, unknown> | undefined): string[] {
  if (!params) return []
  return ['url', 'urlA', 'urlB'].map((key) => params[key]).filter((value): value is string => typeof value === 'string')
}

const activeRequests = new Map<string, AbortController>()
const activeHandlers = new Set<Promise<void>>()
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
          const diagnosticUrls = diagnosticUrlsFromParams(args)
          let message: string
          if (error instanceof NoUsableCapturesError) {
            const baseMessage = mcpT('errors.noUsableCaptures')
            const details = formatExtractionIssueDiagnosticsForDisplay(error.extractionIssues, diagnosticUrls)
            message = details
              ? coreT('en', 'common.captureDiagnostics', { message: baseMessage, details })
              : baseMessage
          } else {
            message = sanitizeDiagnosticTextForDisplay(
              error instanceof Error ? error.message : String(error),
              diagnosticUrls,
            )
          }
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
    const handler = handleLine(line)
    activeHandlers.add(handler)
    void handler.then(
      () => activeHandlers.delete(handler),
      () => activeHandlers.delete(handler),
    )
  })
  rl.on('close', () => {
    for (const controller of activeRequests.values()) {
      controller.abort(new DOMException('MCP transport closed', 'AbortError'))
    }
    activeRequests.clear()
    const closingHandlers = [...activeHandlers]
    if (closingHandlers.length > 0) {
      const cleanupHold = setInterval(() => undefined, 1_000)
      void Promise.allSettled(closingHandlers).finally(() => clearInterval(cleanupHold))
    }
  })

  process.stderr.write(`${mcpT('started')}\n`)
}

startStdioServer()
