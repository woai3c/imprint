import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { DesignToken } from '../core/analyzer/index.js'
import {
  type EnhancementContext,
  type LlmEnhancement,
  buildEnhancementPrompt,
  parseEnhancementResponse,
} from '../core/analyzer/llm-enhancer.js'
import { log } from './logger.js'

const AGENT_TIMEOUT_MS = 120_000
const AGENT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024

type PromptMode = 'argument' | 'stdin'

interface AgentInvocation {
  args: string[]
  promptMode: PromptMode
}

const AGENT_INVOCATIONS: Record<string, AgentInvocation> = {
  xc: {
    args: ['--print', '--plan', '--max-turns', '1', '--no-plugins', '--no-hooks'],
    promptMode: 'stdin',
  },
  claude: {
    args: [
      '--print',
      '--output-format',
      'text',
      '--tools',
      '',
      '--max-turns',
      '1',
      '--permission-mode',
      'plan',
      '--no-session-persistence',
      '--safe-mode',
      '--disable-slash-commands',
      '--no-chrome',
    ],
    promptMode: 'stdin',
  },
  codex: {
    args: ['exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', '-'],
    promptMode: 'stdin',
  },
  opencode: {
    args: ['run', '--format', 'json'],
    promptMode: 'argument',
  },
  gemini: {
    args: ['--output-format', 'json'],
    promptMode: 'stdin',
  },
  kimi: {
    args: ['--prompt'],
    promptMode: 'argument',
  },
}

function executionEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CI: '1',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    KIMI_CODE_NO_AUTO_UPDATE: '1',
    KIMI_CLI_NO_AUTO_UPDATE: '1',
  }
}

function executeFile(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  input?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      executable,
      args,
      {
        cwd,
        encoding: 'utf-8',
        env,
        maxBuffer: AGENT_MAX_OUTPUT_BYTES,
        timeout: AGENT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        resolve(stdout)
      },
    )

    if (input !== undefined) child.stdin?.end(input)
  })
}

async function resolveWindowsExecutable(command: string): Promise<string> {
  const output = await executeFile('where.exe', [command], process.cwd(), executionEnvironment())
  const candidates = output
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .filter(Boolean)
  const executable = candidates.find((candidate) => /\.(?:exe|cmd|bat)$/i.test(candidate))
  if (!executable) throw new Error(`No Windows executable found for ${command}`)
  return executable
}

async function executeWindowsCommand(
  executable: string,
  invocation: AgentInvocation,
  prompt: string,
  runtimeDir: string,
): Promise<string> {
  if (!/\.(?:cmd|bat)$/i.test(executable)) {
    const args = invocation.promptMode === 'argument' ? [...invocation.args, prompt] : invocation.args
    return executeFile(
      executable,
      args,
      runtimeDir,
      executionEnvironment(),
      invocation.promptMode === 'stdin' ? prompt : undefined,
    )
  }

  const promptPath = path.join(runtimeDir, 'prompt.txt')
  await fs.writeFile(promptPath, prompt, 'utf-8')
  const script = [
    '$agentArgs = @(ConvertFrom-Json $env:IMPRINT_AGENT_ARGS)',
    '$agentPrompt = [IO.File]::ReadAllText($env:IMPRINT_AGENT_PROMPT_PATH)',
    'if ($env:IMPRINT_AGENT_PROMPT_MODE -eq "argument") {',
    '  & $env:IMPRINT_AGENT_EXECUTABLE @agentArgs $agentPrompt',
    '} else {',
    '  $agentPrompt | & $env:IMPRINT_AGENT_EXECUTABLE @agentArgs',
    '}',
    'exit $LASTEXITCODE',
  ].join('\n')
  const env = {
    ...executionEnvironment(),
    IMPRINT_AGENT_ARGS: JSON.stringify(invocation.args),
    IMPRINT_AGENT_EXECUTABLE: executable,
    IMPRINT_AGENT_PROMPT_MODE: invocation.promptMode,
    IMPRINT_AGENT_PROMPT_PATH: promptPath,
  }

  return executeFile(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    runtimeDir,
    env,
  )
}

async function executeAgent(command: string, invocation: AgentInvocation, prompt: string): Promise<string> {
  const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-agent-'))

  try {
    if (process.platform === 'win32') {
      const executable = await resolveWindowsExecutable(command)
      return await executeWindowsCommand(executable, invocation, prompt, runtimeDir)
    }

    const args = invocation.promptMode === 'argument' ? [...invocation.args, prompt] : invocation.args
    return await executeFile(
      command,
      args,
      runtimeDir,
      executionEnvironment(),
      invocation.promptMode === 'stdin' ? prompt : undefined,
    )
  } finally {
    await fs.rm(runtimeDir, { force: true, recursive: true })
  }
}

export async function enhanceWithAgentCli(
  tokens: DesignToken,
  url: string,
  command: string,
  context: EnhancementContext = {},
): Promise<LlmEnhancement | null> {
  const invocation = AGENT_INVOCATIONS[command]
  if (!invocation) {
    log.error('agent-cli', `enhancement skipped: unsupported command=${command}`)
    return null
  }

  const startedAt = Date.now()
  try {
    const response = await executeAgent(command, invocation, buildEnhancementPrompt(tokens, url, context))
    const enhancement = parseEnhancementResponse(response)
    if (!enhancement) {
      log.error(
        'agent-cli',
        `enhancement failed: command=${command} durationMs=${Date.now() - startedAt} reason=invalid-output`,
      )
      return null
    }

    log.info('agent-cli', `enhancement completed: command=${command} durationMs=${Date.now() - startedAt}`)
    return enhancement
  } catch (error: unknown) {
    const reason =
      error instanceof Error && 'killed' in error && error.killed
        ? 'timeout'
        : error instanceof Error && 'code' in error
          ? `exit-${String(error.code)}`
          : 'execution-error'
    log.error(
      'agent-cli',
      `enhancement failed: command=${command} durationMs=${Date.now() - startedAt} reason=${reason}`,
    )
    return null
  }
}
