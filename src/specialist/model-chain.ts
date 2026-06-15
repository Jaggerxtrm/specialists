export interface ModelChainExecution {
  model: string | null;
  fallback_model?: string | null;
  fallback_models?: readonly string[] | null;
}

export function resolveModelChain(execution: ModelChainExecution): string[] {
  const primary = normalizeModel(execution.model);
  const fallbacks = resolveFallbackModels(execution);
  return dedupeModels([primary, ...fallbacks].filter((model): model is string => model !== null));
}

function resolveFallbackModels(execution: ModelChainExecution): string[] {
  if (execution.fallback_models && execution.fallback_models.length > 0) {
    return execution.fallback_models.map(normalizeModel).filter((model): model is string => model !== null);
  }

  const fallback = normalizeModel(execution.fallback_model ?? null);
  return fallback ? [fallback] : [];
}

function normalizeModel(model: string | null | undefined): string | null {
  const trimmed = model?.trim();
  return trimmed ? trimmed : null;
}

function dedupeModels(models: readonly string[]): string[] {
  return [...new Set(models)];
}
