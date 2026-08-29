// src/specialist/templateEngine.ts
const PLACEHOLDER_RE = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;

/** The unique `$name` tokens referenced by a template, in first-occurrence order. */
export function extractTemplateTokens(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER_RE)].map((match) => match[1]);
}

/**
 * Substitutes `$name` placeholders from `variables`. A token absent from
 * `variables` is left verbatim — that is intentional for generic templates
 * (`prompt.system` / agent.md mangling). Model-facing task prompts must never
 * rely on it: `renderTaskPrompt` resolves or refuses unresolved tokens instead.
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(PLACEHOLDER_RE, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}
