import { execSync } from 'node:child_process'

export interface AgentCliInfo {
  name: string
  command: string
  version: string | null
  available: boolean
}

const AGENT_CLIS = [
  { name: 'X-Code CLI', command: 'xc', versionFlag: '--version' },
  { name: 'Claude Code', command: 'claude', versionFlag: '--version' },
  { name: 'Codex', command: 'codex', versionFlag: '--version' },
  { name: 'OpenCode', command: 'opencode', versionFlag: '--version' },
  { name: 'Gemini CLI', command: 'gemini', versionFlag: '--version' },
  { name: 'Kimi CLI', command: 'kimi', versionFlag: '--version' },
]

function checkCommand(command: string, versionFlag: string): string | null {
  try {
    const result = execSync(`${command} ${versionFlag}`, {
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const version = result.trim().split('\n')[0]
    return version || 'installed'
  } catch {
    return null
  }
}

export function detectAgentClis(): AgentCliInfo[] {
  return AGENT_CLIS.map(({ name, command, versionFlag }) => {
    const version = checkCommand(command, versionFlag)
    return {
      name,
      command,
      version,
      available: version !== null,
    }
  })
}
