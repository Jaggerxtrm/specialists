export function stripJsonFences(text) {
    return text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}
//# sourceMappingURL=json-output.js.map