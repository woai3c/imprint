import { execFile } from 'node:child_process'

import type { AgentCliInfo } from '../shared/ipc-contract.js'
import { log } from './logger.js'

const AGENT_CLIS = [
  { name: 'X-Code CLI', command: 'xc', versionFlag: '--version' },
  { name: 'Claude Code', command: 'claude', versionFlag: '--version' },
  { name: 'Codex', command: 'codex', versionFlag: '--version' },
  { name: 'OpenCode', command: 'opencode', versionFlag: '--version' },
  { name: 'Gemini CLI', command: 'gemini', versionFlag: '--version' },
  { name: 'Kimi CLI', command: 'kimi', versionFlag: '--version' },
]

const DETECTION_TIMEOUT_MS = 5000

let cachedResult: AgentCliInfo[] | null = null
let activeDetection: Promise<AgentCliInfo[]> | null = null

function checkCommand(name: string, command: string, versionFlag: string): Promise<string | null> {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    execFile(
      command,
      [versionFlag],
      {
        encoding: 'utf-8',
        shell: process.platform === 'win32',
        timeout: DETECTION_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        const durationMs = Date.now() - startedAt
        if (error) {
          const timedOut = 'killed' in error && error.killed
          log.info(
            'agent-cli',
            `checked: name=${name} command=${command} available=false durationMs=${durationMs} reason=${
              timedOut ? 'timeout' : 'unavailable'
            }`,
          )
          resolve(null)
          return
        }

        const version = stdout.trim().split(/\r?\n/)[0] || 'installed'
        log.info(
          'agent-cli',
          `checked: name=${name} command=${command} available=true durationMs=${durationMs} version=${version}`,
        )
        resolve(version)
      },
    )
  })
}

async function runDetection(): Promise<AgentCliInfo[]> {
  const startedAt = Date.now()
  log.info('agent-cli', `detection started: commands=${AGENT_CLIS.length}`)

  const result = await Promise.all(
    AGENT_CLIS.map(async ({ name, command, versionFlag }) => {
      const version = await checkCommand(name, command, versionFlag)
      return {
        name,
        command,
        version,
        available: version !== null,
      }
    }),
  )

  cachedResult = result
  const availableCommands = result.filter((cli) => cli.available).map((cli) => cli.command)
  log.info(
    'agent-cli',
    `detection completed: available=${availableCommands.length}/${result.length} commands=${
      availableCommands.join(',') || 'none'
    } durationMs=${Date.now() - startedAt}`,
  )

  return result
}

export async function detectAgentClis(force = false): Promise<AgentCliInfo[]> {
  if (activeDetection) {
    log.info('agent-cli', 'detection request joined the active scan')
    return activeDetection
  }

  if (!force && cachedResult) {
    log.info('agent-cli', 'detection request served from the current app-session cache')
    return cachedResult
  }

  if (force) {
    log.info('agent-cli', 'manual re-detection requested')
  }

  const detection = runDetection()
  activeDetection = detection

  try {
    return await detection
  } catch (error: unknown) {
    log.error('agent-cli', `detection failed: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  } finally {
    if (activeDetection === detection) activeDetection = null
  }
}
