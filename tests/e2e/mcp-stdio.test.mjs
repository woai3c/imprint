import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import test from 'node:test'

const serverPath = path.resolve('dist/mcp/server.js')

test('official MCP client initializes the stdio server and lists tools', { timeout: 15_000 }, async (t) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: process.cwd(),
    stderr: 'pipe',
  })
  const client = new Client({ name: 'imprint-contract-test', version: '1.0.0' })
  t.after(async () => {
    await client.close().catch(() => {})
  })

  await client.connect(transport)
  assert.deepEqual(client.getServerVersion(), { name: 'imprint', version: '0.0.3' })
  assert.deepEqual(client.getServerCapabilities(), { tools: {} })
  await client.ping()

  const result = await client.listTools()
  assert.deepEqual(
    result.tools.map((tool) => tool.name),
    ['imprint_extract', 'imprint_compare'],
  )
  const extractTool = result.tools.find((tool) => tool.name === 'imprint_extract')
  const maxPagesSchema = extractTool?.inputSchema?.properties?.maxPages
  const formatSchema = extractTool?.inputSchema?.properties?.format
  assert.equal(maxPagesSchema?.minimum, 1)
  assert.equal(maxPagesSchema?.maximum, 20)
  assert.ok(formatSchema?.enum?.includes('json'))
})

test(
  'MCP extraction reports operational completion outside the generated design artifact',
  { timeout: 90_000 },
  async (t) => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      if (request.url === '/blocked') {
        response.end(`<!doctype html><style>
          body{margin:0;font-family:system-ui;background:#f8fafc;color:#172033}main{max-width:900px;margin:auto;padding:64px}
          .campaign{position:fixed;inset:0;z-index:99;background:#ff00ff;display:grid;place-items:center}
        </style><main><h1>Underlying product page</h1><p>Stable design content.</p></main>
        <div class="campaign" role="dialog" aria-modal="true"><h2>Blocking promotion</h2></div>`)
        return
      }
      response.end(`<!doctype html><style>
      body{margin:0;background:#f8fafc;color:#172033;font:16px/1.5 system-ui}main{max-width:720px;margin:48px auto;padding:24px}
    </style><main><h1>MCP fixture</h1><p>Deterministic local content.</p></main>`)
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    t.after(() => new Promise((resolve) => server.close(resolve)))
    const address = server.address()
    assert.ok(address && typeof address === 'object')

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      cwd: process.cwd(),
      stderr: 'pipe',
    })
    const client = new Client({ name: 'imprint-extraction-test', version: '1.0.0' })
    t.after(async () => {
      await client.close().catch(() => {})
    })

    await client.connect(transport)
    const result = await client.callTool({
      name: 'imprint_extract',
      arguments: { url: `http://127.0.0.1:${address.port}`, format: 'tokens', useSession: false, maxPages: 1 },
    })
    const content = result.content
    assert.ok(Array.isArray(content) && content[0]?.type === 'text')
    const payload = JSON.parse(content[0].text)
    assert.deepEqual(payload.completion, { reason: 'complete' })

    const failure = await client.callTool({
      name: 'imprint_extract',
      arguments: {
        url: `http://127.0.0.1:${address.port}/blocked`,
        format: 'tokens',
        useSession: false,
        maxPages: 1,
      },
    })
    assert.equal(failure.isError, true)
    assert.ok(Array.isArray(failure.content) && failure.content[0]?.type === 'text')
    assert.match(failure.content[0].text, /Capture diagnostics:/)
    assert.match(failure.content[0].text, /health:large-overlay/)
  },
)

test(
  'stdio uses one JSON-RPC message per line and returns standard protocol errors',
  { timeout: 15_000 },
  async (t) => {
    const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    t.after(() => {
      if (!child.killed) child.kill('SIGTERM')
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    let stdoutBuffer = ''
    let stderrBuffer = ''
    const lines = []
    const waiters = []
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk
      const parts = stdoutBuffer.split('\n')
      stdoutBuffer = parts.pop() || ''
      for (const line of parts) {
        if (!line) continue
        const waiter = waiters.shift()
        if (waiter) waiter.resolve(line)
        else lines.push(line)
      }
    })
    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk
    })

    const nextLine = () => {
      const existing = lines.shift()
      if (existing) return Promise.resolve(existing)
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for MCP stdout')), 5000)
        waiters.push({
          resolve: (line) => {
            clearTimeout(timeout)
            resolve(line)
          },
        })
      })
    }
    const send = (message) => child.stdin.write(`${message}\n`)
    const waitForStderr = async (text) => {
      const deadline = Date.now() + 5000
      while (!stderrBuffer.includes(text)) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for MCP stderr: ${text}`)
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    }

    send('{bad json')
    const parseErrorLine = await nextLine()
    assert.doesNotMatch(parseErrorLine, /Content-Length/i)
    assert.deepEqual(JSON.parse(parseErrorLine), {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    })

    send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/unknown' }))
    send(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }))
    assert.deepEqual(JSON.parse(await nextLine()), { jsonrpc: '2.0', id: 7, result: {} })

    send(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'unknown/method' }))
    assert.deepEqual(JSON.parse(await nextLine()), {
      jsonrpc: '2.0',
      id: 8,
      error: { code: -32601, message: 'Method not found: unknown/method' },
    })

    send(JSON.stringify({ jsonrpc: '2.0', id: 81, method: 'initialize', params: { protocolVersion: '2025-11-25' } }))
    assert.deepEqual(JSON.parse(await nextLine()), {
      jsonrpc: '2.0',
      id: 81,
      error: {
        code: -32602,
        message: 'Initialize requires a protocolVersion, capabilities, and clientInfo',
      },
    })

    send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-test', version: '1' } },
      }),
    )
    assert.deepEqual(JSON.parse(await nextLine()), {
      jsonrpc: '2.0',
      id: 9,
      result: {
        protocolVersion: '2025-11-25',
        serverInfo: { name: 'imprint', version: '0.0.3' },
        capabilities: { tools: {} },
      },
    })
    send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))
    send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'imprint_extract',
          arguments: { url: 'http://127.0.0.1:9', useSession: false, maxPages: 1 },
        },
      }),
    )
    await waitForStderr('[imprint] headless browser resolved:')
    send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 10 } }))
    send(JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'ping' }))
    assert.deepEqual(JSON.parse(await nextLine()), { jsonrpc: '2.0', id: 11, result: {} })

    child.stdin.end()
    const exit = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    assert.deepEqual(exit, { code: 0, signal: null })
  },
)
