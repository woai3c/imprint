import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const siteDirectory = path.dirname(fileURLToPath(import.meta.url))
const variantsDirectory = path.join(siteDirectory, 'variants')

export const availableVariants = fs
  .readdirSync(variantsDirectory)
  .filter((name) => name.endsWith('.css'))
  .map((name) => name.slice(0, -4))
  .sort()

function readArgument(args, name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}

function send(response, status, contentType, body) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'content-type': contentType,
  })
  response.end(body)
}

export function createComparisonSiteServer(variant = 'reference') {
  if (!availableVariants.includes(variant)) {
    throw new Error(`Unknown comparison-site variant "${variant}". Available: ${availableVariants.join(', ')}`)
  }

  const routes = new Map([
    ['/', ['text/html; charset=utf-8', path.join(siteDirectory, 'index.html')]],
    ['/index.html', ['text/html; charset=utf-8', path.join(siteDirectory, 'index.html')]],
    ['/base.css', ['text/css; charset=utf-8', path.join(siteDirectory, 'base.css')]],
    ['/variant.css', ['text/css; charset=utf-8', path.join(variantsDirectory, `${variant}.css`)]],
  ])

  return http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
    if (pathname === '/favicon.ico') {
      response.writeHead(204, { 'cache-control': 'no-store' })
      response.end()
      return
    }

    const route = routes.get(pathname)
    if (!route) {
      send(response, 404, 'text/plain; charset=utf-8', 'not found')
      return
    }

    const [contentType, filePath] = route
    send(response, 200, contentType, fs.readFileSync(filePath))
  })
}

function startFromCommandLine() {
  const variant = readArgument(process.argv.slice(2), 'variant', 'reference')
  const portValue = readArgument(process.argv.slice(2), 'port', '4173')
  const port = Number(portValue)
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port "${portValue}"`)
  }

  const server = createComparisonSiteServer(variant)
  server.listen(port, '127.0.0.1', () => {
    const address = server.address()
    const actualPort = typeof address === 'object' && address ? address.port : port
    process.stdout.write(`Imprint comparison site\nVariant: ${variant}\nURL: http://127.0.0.1:${actualPort}/\n`)
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    startFromCommandLine()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
