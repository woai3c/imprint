import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

// Live benchmark runner: discovers configured AI providers from .env and the environment,
// lets the user pick one interactively (or via --provider), then runs the benchmark's live
// interpretation block through vitest.
//
// Usage:
//   node scripts/benchmark-live.mjs                    interactive picker (falls back to first when not a TTY)
//   node scripts/benchmark-live.mjs --provider first   skip the picker, use the first configured provider
//   node scripts/benchmark-live.mjs --provider deepseek --vision
//   node scripts/benchmark-live.mjs --provider deepseek --rounds 5 --reasoning low --thinking

// Names match the CLI/MCP convention in src/cli/index.ts and src/mcp/server.ts exactly,
// so one .env serves the benchmark, the CLI, and the MCP server.
const PROVIDER_ENV = [
  { provider: 'openai', keys: ['OPENAI_API_KEY'] },
  { provider: 'anthropic', keys: ['ANTHROPIC_API_KEY'] },
  { provider: 'google', keys: ['GOOGLE_GENERATIVE_AI_API_KEY'] },
  { provider: 'deepseek', keys: ['DEEPSEEK_API_KEY'] },
  { provider: 'moonshotai', keys: ['MOONSHOT_API_KEY'] },
  { provider: 'alibaba', keys: ['ALIBABA_API_KEY'] },
  { provider: 'zhipu', keys: ['ZHIPU_API_KEY'] },
  { provider: 'xai', keys: ['XAI_API_KEY'] },
  { provider: 'custom', keys: ['IMPRINT_AI_API_KEY'] },
]

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const values = {}
  for (const line of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || line.trimStart().startsWith('#')) continue
    values[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return values
}

const env = { ...loadEnvFile(path.resolve('.env')), ...process.env }

const options = PROVIDER_ENV.flatMap(({ provider, keys }) => {
  const key = keys.find((candidate) => env[candidate])
  if (!key) return []
  const prefix = key.replace(/_API_KEY$/, '')
  return [
    {
      provider,
      apiKey: env[key],
      keyName: key,
      model: env[`${prefix}_MODEL`] || '',
      baseUrl: env[`${prefix}_BASE_URL`] || '',
    },
  ]
})

if (options.length === 0) {
  console.error(
    'No AI provider keys found. Add e.g. OPENAI_API_KEY / DEEPSEEK_API_KEY / MOONSHOTAI_API_KEY to .env or the environment.',
  )
  process.exit(1)
}

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function chooseProvider() {
  const requested = argValue('--provider')
  if (requested && requested !== 'first') {
    const match = options.find((option) => option.provider === requested)
    if (!match) {
      console.error(
        `Provider "${requested}" has no configured key. Configured: ${options.map((o) => o.provider).join(', ')}`,
      )
      process.exit(1)
    }
    return match
  }
  if (requested === 'first' || options.length === 1 || !process.stdin.isTTY) {
    return options[0]
  }
  console.log('Configured AI providers (from .env / environment):')
  options.forEach((option, index) => {
    console.log(`  ${index + 1}. ${option.provider} (${option.keyName})${option.model ? ` model=${option.model}` : ''}`)
  })
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`Select provider [1-${options.length}] (default 1): `, resolve),
  )
  rl.close()
  const choice = Number.parseInt(answer.trim() || '1', 10)
  if (!Number.isInteger(choice) || choice < 1 || choice > options.length) {
    console.error('Invalid selection.')
    process.exit(1)
  }
  return options[choice - 1]
}

const selected = await chooseProvider()
const rounds = argValue('--rounds')
const reasoningEffort = argValue('--reasoning')
console.log(
  `Running paired live benchmark with provider=${selected.provider}${selected.model ? ` model=${selected.model}` : ''}${rounds ? ` rounds=${rounds}` : ''}${reasoningEffort ? ` reasoning=${reasoningEffort}` : ''}${process.argv.includes('--thinking') ? ' thinking=on' : ''}`,
)

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', '-c', 'vitest.benchmark.config.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      IMPRINT_BENCHMARK_PROVIDER: selected.provider,
      IMPRINT_BENCHMARK_API_KEY: selected.apiKey,
      ...(selected.model ? { IMPRINT_BENCHMARK_MODEL: selected.model } : {}),
      ...(selected.baseUrl ? { IMPRINT_BENCHMARK_BASE_URL: selected.baseUrl } : {}),
      ...(process.argv.includes('--vision') ? { IMPRINT_BENCHMARK_VISION: '1' } : {}),
      ...(rounds ? { IMPRINT_BENCHMARK_ROUNDS: rounds } : {}),
      ...(reasoningEffort ? { IMPRINT_BENCHMARK_REASONING_EFFORT: reasoningEffort } : {}),
      ...(process.argv.includes('--thinking') ? { IMPRINT_BENCHMARK_THINKING: '1' } : {}),
    },
  },
)
child.on('exit', (code) => process.exit(code ?? 1))
