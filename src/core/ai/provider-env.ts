// Provider API keys come from process environment variables only (never from files or app
// settings). Shared by the CLI and the MCP server so both honor the same names.
export const PROVIDER_KEY_ENV: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  moonshotai: 'MOONSHOT_API_KEY',
  alibaba: 'ALIBABA_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  xai: 'XAI_API_KEY',
  custom: 'IMPRINT_AI_API_KEY',
}

export function providerApiKeyFromEnv(provider: string): string {
  return process.env.IMPRINT_AI_API_KEY || process.env[PROVIDER_KEY_ENV[provider] || 'IMPRINT_AI_API_KEY'] || ''
}
