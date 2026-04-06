import { describe, it, expect } from 'vitest';
import { parseSpecialist } from '../../../src/specialist/schema.js';

function createValidSpec() {
  return {
    specialist: {
      metadata: {
        name: 'codebase-explorer',
        version: '1.0.0',
        description: 'Analyzes project structure',
        category: 'analysis/code',
        author: 'jagger',
        tags: ['analysis'],
      },
      execution: {
        mode: 'auto',
        model: 'gemini',
        fallback_model: 'qwen',
        timeout_ms: 120000,
        response_format: 'json',
        permission_required: 'READ_ONLY',
      },
      prompt: {
        system: 'You are a senior architect.',
        task_template: 'Analyze $project_name. Request: $prompt',
      },
    },
  };
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe('parseSpecialist', () => {
  it('parses a valid specialist JSON', async () => {
    const result = await parseSpecialist(toJson(createValidSpec()));
    expect(result.specialist.metadata.name).toBe('codebase-explorer');
    expect(result.specialist.execution.model).toBe('gemini');
  });

  it('applies defaults for optional execution fields', async () => {
    const minimal = {
      specialist: {
        metadata: {
          name: 'minimal-spec',
          version: '1.0.0',
          description: 'Minimal',
          category: 'test',
        },
        execution: {
          model: 'gemini',
        },
        prompt: {
          task_template: '$prompt',
        },
      },
    };

    const result = await parseSpecialist(toJson(minimal));
    expect(result.specialist.execution.timeout_ms).toBe(120_000);
    expect(result.specialist.execution.mode).toBe('auto');
    expect(result.specialist.execution.max_retries).toBe(0);
    expect(result.specialist.execution.interactive).toBe(false);
    expect(result.specialist.execution.output_type).toBe('custom');
  });

  it('accepts execution.interactive', async () => {
    const spec = createValidSpec();
    spec.specialist.execution.interactive = true;
    const result = await parseSpecialist(toJson(spec));
    expect(result.specialist.execution.interactive).toBe(true);
  });

  it('accepts execution.output_type', async () => {
    const spec = createValidSpec();
    spec.specialist.execution.output_type = 'analysis';
    const result = await parseSpecialist(toJson(spec));
    expect(result.specialist.execution.output_type).toBe('analysis');
  });

  it('rejects invalid execution.output_type', async () => {
    const spec = createValidSpec();
    (spec.specialist.execution as Record<string, unknown>).output_type = 'invalid-kind';
    await expect(parseSpecialist(toJson(spec))).rejects.toThrow();
  });

  it('rejects invalid name (not kebab-case)', async () => {
    const spec = createValidSpec();
    spec.specialist.metadata.name = 'CodebaseExplorer';
    await expect(parseSpecialist(toJson(spec))).rejects.toThrow();
  });

  it('rejects invalid version (not semver)', async () => {
    const spec = createValidSpec();
    spec.specialist.metadata.version = 'v1';
    await expect(parseSpecialist(toJson(spec))).rejects.toThrow();
  });

  it('accepts unknown fields (superset tolerance — Agent Forge / Mercury fields)', async () => {
    const spec = createValidSpec();
    (spec.specialist as Record<string, unknown>).heartbeat = { enabled: true, interval: '15m' };
    await expect(parseSpecialist(toJson(spec))).resolves.toBeDefined();
  });

  it('rejects missing required task_template', async () => {
    const spec = createValidSpec();
    delete (spec.specialist.prompt as Record<string, unknown>).task_template;
    await expect(parseSpecialist(toJson(spec))).rejects.toThrow();
  });

  it('accepts execution.max_retries', async () => {
    const spec = createValidSpec();
    spec.specialist.execution.max_retries = 2;
    const result = await parseSpecialist(toJson(spec));
    expect(result.specialist.execution.max_retries).toBe(2);
  });

  describe('beads_integration field', () => {
    it('defaults to auto when not specified', async () => {
      const result = await parseSpecialist(toJson(createValidSpec()));
      expect(result.specialist.beads_integration).toBe('auto');
    });

    it('accepts always', async () => {
      const spec = createValidSpec();
      spec.specialist.beads_integration = 'always';
      const result = await parseSpecialist(toJson(spec));
      expect(result.specialist.beads_integration).toBe('always');
    });

    it('accepts never', async () => {
      const spec = createValidSpec();
      spec.specialist.beads_integration = 'never';
      const result = await parseSpecialist(toJson(spec));
      expect(result.specialist.beads_integration).toBe('never');
    });

    it('rejects invalid value', async () => {
      const spec = createValidSpec();
      (spec.specialist as Record<string, unknown>).beads_integration = 'maybe';
      await expect(parseSpecialist(toJson(spec))).rejects.toThrow();
    });
  });

  describe('beads_write_notes field', () => {
    it('defaults to true when not specified', async () => {
      const result = await parseSpecialist(toJson(createValidSpec()));
      expect(result.specialist.beads_write_notes).toBe(true);
    });

    it('accepts false', async () => {
      const spec = createValidSpec();
      spec.specialist.beads_write_notes = false;
      const result = await parseSpecialist(toJson(spec));
      expect(result.specialist.beads_write_notes).toBe(false);
    });
  });
});
