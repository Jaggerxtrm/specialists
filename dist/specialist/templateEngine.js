// src/specialist/templateEngine.ts
export function renderTemplate(template, variables) {
    return template.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, key) => {
        return variables[key] !== undefined ? variables[key] : match;
    });
}
//# sourceMappingURL=templateEngine.js.map