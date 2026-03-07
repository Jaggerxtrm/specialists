// src/specialist/templateEngine.ts
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}
