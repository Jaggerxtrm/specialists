// tests/unit/specialist/schema.test.ts
import { describe, it, expect } from 'vitest';
import { parseSpecialist } from '../../../src/specialist/schema.js';

const VALID_YAML = `
specialist:
  metadata:
    name: codebase-explorer
    version: 1.0.0
    description: Analyzes project structure
    category: analysis/code
    author: jagger
    tags: [analysis]
  execution:
    mode: auto
    model: gemini
    fallback_model: qwen
    timeout_ms: 120000
    response_format: json
    permission_required: READ_ONLY
  prompt:
    system: You are a senior architect.
    task_template: "Analyze $project_name. Request: $prompt"
`;

describe('parseSpecialist', () => {
  it('parses a valid specialist YAML', async () => {
    const result = await parseSpecialist(VALID_YAML);
    expect(result.specialist.metadata.name).toBe('codebase-explorer');
    expect(result.specialist.execution.model).toBe('gemini');
  });

  it('applies defaults for optional execution fields', async () => {
    const minimal = `
specialist:
  metadata:
    name: minimal-spec
    version: 1.0.0
    description: Minimal
    category: test
  execution:
    model: gemini
  prompt:
    task_template: $prompt`;
    const result = await parseSpecialist(minimal);
    expect(result.specialist.execution.timeout_ms).toBe(120_000);
    expect(result.specialist.execution.mode).toBe('auto');
  });

  it('rejects invalid name (not kebab-case)', async () => {
    const bad = VALID_YAML.replace('codebase-explorer', 'CodebaseExplorer');
    await expect(parseSpecialist(bad)).rejects.toThrow();
  });

  it('rejects invalid version (not semver)', async () => {
    const bad = VALID_YAML.replace('1.0.0', 'v1');
    await expect(parseSpecialist(bad)).rejects.toThrow();
  });

  it('accepts unknown fields (superset tolerance — Agent Forge / Mercury fields)', async () => {
    const withExtra = VALID_YAML + `
  heartbeat:
    enabled: true
    interval: 15m`;
    await expect(parseSpecialist(withExtra)).resolves.toBeDefined();
  });

  it('rejects missing required task_template', async () => {
    const bad = VALID_YAML.replace('task_template: "Analyze $project_name. Request: $prompt"', '');
    await expect(parseSpecialist(bad)).rejects.toThrow();
  });
});
