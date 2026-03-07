// src/pi/backendMap.ts
// Maps specialist model names → pi --provider values
// Run `pi --list-models` to see all supported providers.
const BACKEND_MAP: Record<string, string> = {
  gemini: 'google',
  google: 'google',
  qwen: 'openai',      // via DashScope OpenAI-compat endpoint
  claude: 'anthropic',
  anthropic: 'anthropic',
  openai: 'openai',
  openrouter: 'openrouter',
  groq: 'groq',
};

export function mapSpecialistBackend(model: string): string {
  const provider = BACKEND_MAP[model.toLowerCase()];
  if (!provider) {
    // Pass through unknown values as-is (pi accepts arbitrary provider names)
    return model.toLowerCase();
  }
  return provider;
}

export function getProviderArgs(model: string): string[] {
  const m = model.toLowerCase();
  if (m === 'qwen') {
    // DashScope: OpenAI-compatible Qwen endpoint requires explicit API key
    return ['--api-key', process.env.DASHSCOPE_API_KEY ?? process.env.OPENAI_API_KEY ?? ''];
  }
  // All other providers: pi inherits env vars (GEMINI_API_KEY, ANTHROPIC_OAUTH_TOKEN, etc.)
  // and handles auth natively. No --api-key needed.
  return [];
}
