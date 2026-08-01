import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  type ExampleGenerationContext,
  buildExamplePrompt,
  parseExampleResponse,
} from '../core/analyzer/example-generator.js'
import type { DesignToken } from '../core/analyzer/index.js'
import { buildSemanticNamingPrompt, parseSemanticNamingResponse } from '../core/analyzer/semantic-enhancer.js'
import type { ColorRenameProposal } from '../core/analyzer/token-renamer.js'
import type { GeneratedExampleComponent } from '../core/analyzer/types.js'
import { normalizeAgentCliCommand } from '../shared/agent-clis.js'
import { log } from './logger.js'

const AGENT_TIMEOUT_MS = 180_000
const AGENT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024

type PromptMode = 'argument' | 'stdin'

interface AgentInvocation {
  args: string[]
  promptMode: PromptMode
  vision?: {
    args?: string[]
  }
}

export interface AgentCliImageInput {
  name: string
  sourcePath: string
}

const AGENT_INVOCATIONS: Record<string, AgentInvocation> = {
  xc: {
    args: ['--print', '--plan', '--max-turns', '1', '--no-plugins', '--no-hooks'],
    promptMode: 'stdin',
    vision: {},
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
    vision: {
      // Image attachments are read from the whitelisted runtime directory, so vision runs must keep the Read tool.
      args: [
        '--print',
        '--output-format',
        'text',
        '--allowedTools',
        'Read',
        '--max-turns',
        '1',
        '--permission-mode',
        'plan',
        '--no-session-persistence',
        '--safe-mode',
        '--disable-slash-commands',
        '--no-chrome',
      ],
    },
  },
  codex: {
    args: ['exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', '-'],
    promptMode: 'stdin',
    vision: {},
  },
  opencode: {
    args: ['run', '--format', 'json'],
    promptMode: 'argument',
    vision: {},
  },
  gemini: {
    args: ['--output-format', 'json'],
    promptMode: 'stdin',
    vision: {},
  },
  kimi: {
    args: ['--prompt'],
    promptMode: 'argument',
    vision: {},
  },
}

export function resolveAgentCliCapabilities(command: string): { vision: boolean } {
  return { vision: Boolean(AGENT_INVOCATIONS[normalizeAgentCliCommand(command)]?.vision) }
}

export function buildVisionPromptSuffix(images: Array<{ name: string }>, language: 'en' | 'zh-CN'): string {
  const list = images.map((image) => `- ./${image.name}`).join('\n')
  if (language === 'zh-CN') {
    return [
      '',
      '证据截图已作为文件放入当前工作目录：',
      list,
      '解读之前逐张查看这些图片，并在 JSON 输出顶层增加 "imageObservations" 数组，每张图片一项：',
      '{"imageId": "图片文件名（不含扩展名）", "description": "一句话描述你实际看到的内容"}。',
      '如果某张图片你实际无法看到，就不要为它生成条目。',
    ].join('\n')
  }
  return [
    '',
    'Evidence screenshots are attached as files in the current working directory:',
    list,
    'Look at every attached image before interpreting, and add a top-level "imageObservations" array to the JSON output with one entry per image:',
    '{"imageId": "image file name without extension", "description": "one sentence describing what you actually see"}.',
    'If you cannot actually see an image, omit its entry.',
  ].join('\n')
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
  signal?: AbortSignal,
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
        signal,
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
  signal?: AbortSignal,
): Promise<string> {
  if (!/\.(?:cmd|bat)$/i.test(executable)) {
    const args = invocation.promptMode === 'argument' ? [...invocation.args, prompt] : invocation.args
    return executeFile(
      executable,
      args,
      runtimeDir,
      executionEnvironment(),
      invocation.promptMode === 'stdin' ? prompt : undefined,
      signal,
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
    undefined,
    signal,
  )
}

async function executeAgent(
  command: string,
  invocation: AgentInvocation,
  prompt: string,
  signal?: AbortSignal,
  images: AgentCliImageInput[] = [],
  language: 'en' | 'zh-CN' = 'en',
): Promise<string> {
  const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-agent-'))

  try {
    let effectivePrompt = prompt
    let effectiveInvocation = invocation
    if (images.length > 0 && invocation.vision) {
      const attached: Array<{ name: string }> = []
      for (const image of images) {
        const safeName = image.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        await fs.copyFile(image.sourcePath, path.join(runtimeDir, safeName))
        attached.push({ name: safeName })
      }
      await fs.writeFile(
        path.join(runtimeDir, 'manifest.json'),
        JSON.stringify(
          {
            task: 'design-interpretation',
            images: attached.map((image) => image.name),
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf-8',
      )
      effectivePrompt = prompt + buildVisionPromptSuffix(attached, language)
      effectiveInvocation = invocation.vision.args ? { ...invocation, args: invocation.vision.args } : invocation
    }
    if (process.platform === 'win32') {
      const executable = await resolveWindowsExecutable(command)
      return await executeWindowsCommand(executable, effectiveInvocation, effectivePrompt, runtimeDir, signal)
    }

    const args =
      effectiveInvocation.promptMode === 'argument'
        ? [...effectiveInvocation.args, effectivePrompt]
        : effectiveInvocation.args
    return await executeFile(
      command,
      args,
      runtimeDir,
      executionEnvironment(),
      effectiveInvocation.promptMode === 'stdin' ? effectivePrompt : undefined,
      signal,
    )
  } finally {
    await fs.rm(runtimeDir, { force: true, recursive: true })
  }
}

export async function executeAgentPrompt(
  command: string,
  prompt: string,
  signal?: AbortSignal,
  images: AgentCliImageInput[] = [],
  language: 'en' | 'zh-CN' = 'en',
): Promise<string | null> {
  const invocation = AGENT_INVOCATIONS[command]
  if (!invocation) {
    log.error('agent-cli', `task skipped: unsupported command=${command}`)
    return null
  }
  try {
    return await executeAgent(command, invocation, prompt, signal, images, language)
  } catch (error: unknown) {
    if (signal?.aborted) throw new DOMException('Agent task cancelled', 'AbortError')
    const reason =
      error instanceof Error && 'killed' in error && error.killed
        ? 'timeout'
        : error instanceof Error && 'code' in error
          ? `exit-${String(error.code)}`
          : 'execution-error'
    log.error('agent-cli', `task failed: command=${command} reason=${reason}`)
    return null
  }
}

export interface AgentCliEnhancement {
  renames: ColorRenameProposal[] | null
  examples: GeneratedExampleComponent[] | null
}

export async function enhanceWithAgentCli(
  tokens: DesignToken,
  url: string,
  command: string,
  context: ExampleGenerationContext = {},
  signal?: AbortSignal,
): Promise<AgentCliEnhancement> {
  const invocation = AGENT_INVOCATIONS[command]
  if (!invocation) {
    log.error('agent-cli', `enhancement skipped: unsupported command=${command}`)
    return { renames: null, examples: null }
  }

  const runTask = async <T>(
    kind: 'naming' | 'examples',
    prompt: string,
    parse: (text: string) => T,
  ): Promise<T | null> => {
    const startedAt = Date.now()
    try {
      const response = await executeAgentPrompt(command, prompt, signal)
      if (!response) return null
      const parsed = parse(response)
      log.info('agent-cli', `${kind} completed: command=${command} durationMs=${Date.now() - startedAt}`)
      return parsed
    } catch (error: unknown) {
      if (signal?.aborted) throw new DOMException('Agent enhancement cancelled', 'AbortError')
      const reason =
        error instanceof Error && 'killed' in error && error.killed
          ? 'timeout'
          : error instanceof Error && 'code' in error
            ? `exit-${String(error.code)}`
            : 'execution-error'
      log.error('agent-cli', `${kind} failed: command=${command} durationMs=${Date.now() - startedAt} reason=${reason}`)
      return null
    }
  }

  const [renames, examples] = await Promise.all([
    runTask('naming', buildSemanticNamingPrompt(tokens, url, context), parseSemanticNamingResponse),
    runTask('examples', buildExamplePrompt(tokens, url, context), parseExampleResponse),
  ])
  return { renames, examples }
}
