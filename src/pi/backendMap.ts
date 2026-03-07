// src/pi/backendMap.ts
const BACKEND_MAP: Record<string, string> = {
  gemini: 'google-gemini-cli',
  qwen: 'openai',
  claude: 'anthropic',
  anthropic: 'anthropic',
  openai: 'openai',
};

export function mapSpecialistBackend(model: string): string {
  const provider = BACKEND_MAP[model.toLowerCase()];
  if (!provider) {
    throw new Error(
      `Unsupported backend: ${model}. Supported: ${Object.keys(BACKEND_MAP).join(', ')}`
    );
  }
  return provider;
}

// Qwen requires pointing the openai provider at DashScope
export function getProviderArgs(model: string): string[] {
  if (model.toLowerCase() === 'qwen') {
    return ['--baseURL', 'https://dashscope.aliyuncs.com/compatible-mode/v1'];
  }
  return [];
}
