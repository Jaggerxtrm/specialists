// src/specialist/model-display.ts

export function extractModelId(model?: string): string | undefined {
  if (!model) return undefined;
  const trimmed = model.trim();
  if (!trimmed) return undefined;
  return trimmed.includes('/') ? trimmed.split('/').pop() : trimmed;
}

export function toModelAlias(model?: string): string | undefined {
  const modelId = extractModelId(model);
  if (!modelId) return undefined;

  if (modelId.startsWith('claude-')) {
    return modelId.slice('claude-'.length);
  }

  return modelId;
}

export function formatSpecialistModel(specialist: string, model?: string): string {
  const alias = toModelAlias(model);
  return alias ? `${specialist}/${alias}` : specialist;
}
