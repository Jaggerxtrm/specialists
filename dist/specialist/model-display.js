// src/specialist/model-display.ts
export function extractModelId(model) {
    if (!model)
        return undefined;
    const trimmed = model.trim();
    if (!trimmed)
        return undefined;
    return trimmed.includes('/') ? trimmed.split('/').pop() : trimmed;
}
export function toModelAlias(model) {
    const modelId = extractModelId(model);
    if (!modelId)
        return undefined;
    if (modelId.startsWith('claude-')) {
        return modelId.slice('claude-'.length);
    }
    return modelId;
}
export function formatSpecialistModel(specialist, model) {
    const alias = toModelAlias(model);
    return alias ? `${specialist}/${alias}` : specialist;
}
//# sourceMappingURL=model-display.js.map