export interface AgentCliDefinition {
  name: string
  command: string
  versionFlag: string
  aliases?: string[]
}

export const AGENT_CLI_DEFINITIONS: AgentCliDefinition[] = [
  { name: 'X-Code CLI', command: 'xc', versionFlag: '--version', aliases: ['x-code-cli'] },
  { name: 'Claude Code', command: 'claude', versionFlag: '--version' },
  { name: 'Codex', command: 'codex', versionFlag: '--version' },
  { name: 'OpenCode', command: 'opencode', versionFlag: '--version' },
  { name: 'Gemini CLI', command: 'gemini', versionFlag: '--version' },
  { name: 'Kimi CLI', command: 'kimi', versionFlag: '--version' },
]

export function normalizeAgentCliCommand(command: string): string {
  const match = AGENT_CLI_DEFINITIONS.find(
    (definition) => definition.command === command || definition.aliases?.includes(command),
  )
  return match?.command || command
}

export function getAgentCliDisplayName(command: string): string {
  const normalized = normalizeAgentCliCommand(command)
  return AGENT_CLI_DEFINITIONS.find((definition) => definition.command === normalized)?.name || command
}
