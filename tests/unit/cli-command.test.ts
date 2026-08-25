import { describe, expect, it } from 'vitest'

import {
  CLI_EXIT_CODES,
  CliCancellationError,
  CliUsageError,
  isCancellationError,
  parseCliCommand,
} from '../../src/cli/command.js'

describe('CLI command contract', () => {
  it('normalizes extraction through the shared request schema', () => {
    expect(
      parseCliCommand([
        'extract',
        'https://example.test/catalog',
        '--viewport',
        'all',
        '--pages',
        '2',
        '--discovery',
        'links',
        '--no-session',
        '--browser-path',
        '/opt/chrome',
      ]),
    ).toEqual({
      kind: 'extract',
      url: 'https://example.test/catalog',
      options: {
        format: 'design.md',
        output: '.',
        viewports: ['desktop', 'tablet', 'mobile'],
        useSession: false,
        darkMode: false,
        quiet: false,
        jsonStdout: false,
        maxPages: 2,
        pageDiscovery: 'links',
        browserPath: '/opt/chrome',
      },
    })
  })

  it('parses doctor separately from extraction', () => {
    expect(parseCliCommand(['doctor', '--browser-path', '/opt/chrome', '--json'])).toEqual({
      kind: 'doctor',
      browserPath: '/opt/chrome',
      json: true,
    })
  })

  it('uses the default eight-page bound when --pages is omitted', () => {
    const command = parseCliCommand(['extract', 'https://example.test'])
    expect(command).toMatchObject({ kind: 'extract', options: { pageDiscovery: 'auto' } })
    if (command.kind === 'extract') expect(command.options.maxPages).toBe(8)
  })

  it('accepts the maximum supported page bound', () => {
    const command = parseCliCommand(['extract', 'https://example.test', '--pages', '20'])
    expect(command).toMatchObject({ kind: 'extract', options: { maxPages: 20 } })
  })

  it.each([
    { args: ['extract', 'https://example.test', '--pages', '2x'], code: 'invalid-page-count' },
    { args: ['extract', 'https://example.test', '--pages', '21'], code: 'invalid-page-count' },
    { args: ['extract', 'file:///tmp/page.html'], code: 'invalid-url' },
    { args: ['extract', 'https://example.test', '--format', 'reconstruction'], code: 'invalid-format' },
    { args: ['extract', 'https://example.test', '--viewport', 'wide'], code: 'invalid-viewports' },
    { args: ['doctor', 'https://example.test'], code: 'unexpected-argument' },
    { args: ['doctor', '--quiet'], code: 'unknown-option' },
  ])('rejects invalid input with stable usage reason $code', ({ args, code }) => {
    expect(() => parseCliCommand(args)).toThrowError(expect.objectContaining({ code }))
  })

  it('defines distinct stable exit codes and cancellation detection', () => {
    expect(CLI_EXIT_CODES).toEqual({ success: 0, usage: 2, environment: 3, runtime: 4, cancelled: 130 })
    expect(isCancellationError(new CliCancellationError())).toBe(true)
    expect(isCancellationError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isCancellationError(new CliUsageError('invalid-url'))).toBe(false)
  })
})
