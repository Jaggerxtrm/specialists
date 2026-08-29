/** The unique `$name` tokens referenced by a template, in first-occurrence order. */
export declare function extractTemplateTokens(template: string): string[];
/**
 * Substitutes `$name` placeholders from `variables`. A token absent from
 * `variables` is left verbatim — that is intentional for generic templates
 * (`prompt.system` / agent.md mangling). Model-facing task prompts must never
 * rely on it: `renderTaskPrompt` resolves or refuses unresolved tokens instead.
 */
export declare function renderTemplate(template: string, variables: Record<string, string>): string;
//# sourceMappingURL=templateEngine.d.ts.map