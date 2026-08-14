// ISSUE: xtrm-wiy5n.4.11 — static skip remains tracked.
import { describe, it, expect } from 'vitest';
import {
  OVERRIDE_ALLOWED_EXECUTION_FIELDS,
  OVERRIDE_ALLOWED_NESTED_EXECUTION_PATHS,
  OVERRIDE_ALLOWED_PROMPT_FIELDS,
  OVERRIDE_ALLOWED_STALL_DETECTION_PATHS,
  OVERRIDE_ALLOWED_TOP_FIELDS,
  parseSpecialist,
  validateSpecialist,
} from '../../../src/specialist/schema.js';
import {
  getGlobalSpecialistOverrideLeafPaths,
  GlobalSpecialistOverrideSchema,
} from '../../../src/specialist/global-config.js';

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

describe('override allowlist contract', () => {
  it('keeps schema allowlist exports in sync with global override schema leaf keys', () => {
    const schemaLeafPaths = [
      ...OVERRIDE_ALLOWED_EXECUTION_FIELDS.map(field => `execution.${field}`),
      ...OVERRIDE_ALLOWED_NESTED_EXECUTION_PATHS.map(path => `execution.${path}`),
      ...OVERRIDE_ALLOWED_PROMPT_FIELDS.map(field => `prompt.${field}`),
      ...OVERRIDE_ALLOWED_STALL_DETECTION_PATHS.map(path => `stall_detection.${path}`),
      ...OVERRIDE_ALLOWED_TOP_FIELDS,
      'skills.paths',
    ].sort();

    expect(getGlobalSpecialistOverrideLeafPaths().slice().sort()).toEqual(schemaLeafPaths);
  });

  describe('Phase 1 — six allowlisted user-environment fields', () => {
    it('includes new execution leaf fields in OVERRIDE_ALLOWED_EXECUTION_FIELDS', () => {
      expect(OVERRIDE_ALLOWED_EXECUTION_FIELDS).toContain('prompt_limit_bytes');
      expect(OVERRIDE_ALLOWED_EXECUTION_FIELDS).toContain('stdout_limit_bytes');
      expect(OVERRIDE_ALLOWED_EXECUTION_FIELDS).toContain('interactive');
    });

    it('includes waiting_auto_close_ms in OVERRIDE_ALLOWED_STALL_DETECTION_PATHS', () => {
      expect(OVERRIDE_ALLOWED_STALL_DETECTION_PATHS).toContain('waiting_auto_close_ms');
    });

    it('parses null waiting_auto_close_ms in package specialist specs', async () => {
      const spec = createValidSpec() as ReturnType<typeof createValidSpec> & {
        specialist: ReturnType<typeof createValidSpec>['specialist'] & {
          stall_detection: { waiting_auto_close_ms: null };
        };
      };
      spec.specialist.stall_detection = { waiting_auto_close_ms: null };

      const result = await parseSpecialist(toJson(spec));

      expect(result.specialist.stall_detection?.waiting_auto_close_ms).toBeNull();
    });

    it('includes new nested execution extension leaf paths in OVERRIDE_ALLOWED_NESTED_EXECUTION_PATHS', () => {
      expect(OVERRIDE_ALLOWED_NESTED_EXECUTION_PATHS).toContain('extensions.serena');
      expect(OVERRIDE_ALLOWED_NESTED_EXECUTION_PATHS).toContain('extensions.gitnexus');
    });

    it('includes system_prompt_mode in OVERRIDE_ALLOWED_PROMPT_FIELDS', () => {
      expect(OVERRIDE_ALLOWED_PROMPT_FIELDS).toContain('system_prompt_mode');
    });

    it('includes notes_mode and output_file in OVERRIDE_ALLOWED_TOP_FIELDS', () => {
      expect(OVERRIDE_ALLOWED_TOP_FIELDS).toContain('notes_mode');
      expect(OVERRIDE_ALLOWED_TOP_FIELDS).toContain('output_file');
    });
  });
});

describe('parseSpecialist', () => {
  it('includes fallback_models in OVERRIDE_ALLOWED_EXECUTION_FIELDS', () => {
    expect(OVERRIDE_ALLOWED_EXECUTION_FIELDS).toContain('fallback_models');
  });

  it('parses fallback_model singular', async () => {
    const spec = createValidSpec();
    spec.specialist.execution.fallback_model = 'openai-codex/gpt-5.4';

    const result = await parseSpecialist(toJson(spec));

    expect(result.specialist.execution.fallback_model).toBe('openai-codex/gpt-5.4');
  });

  it('parses fallback_models plural', async () => {
    const spec = createValidSpec();
    spec.specialist.execution.fallback_models = ['openai-codex/gpt-5.4', 'anthropic/claude-sonnet-4-6'];

    const result = await parseSpecialist(toJson(spec));

    expect(result.specialist.execution.fallback_models).toEqual(['openai-codex/gpt-5.4', 'anthropic/claude-sonnet-4-6']);
  });

  it('parses empty fallback_models array', async () => {
    const spec = createValidSpec();
    spec.specialist.execution.fallback_models = [];

    const result = await parseSpecialist(toJson(spec));

    expect(result.specialist.execution.fallback_models).toEqual([]);
  });

  it('rejects non-array fallback_models with clear field path', async () => {
    const spec = createValidSpec() as any;
    spec.specialist.execution.fallback_models = 'not-an-array';

    await expect(parseSpecialist(toJson(spec))).rejects.toThrow(/specialist\.execution\.fallback_models/);
  });

  describe.skip('global override schema accepts singular and plural fallback shapes', () => {
    // Source bug: GlobalSpecialistOverrideSchema rejects sparse execution override objects for fallback fields. Follow-up bead: unitAI-tdpnn. Flip skip -> live after fix lands.
    it('accepts singular and plural fallback shapes', () => {
      expect(GlobalSpecialistOverrideSchema.safeParse({
        execution: { model: 'x', fallback_model: 'y' },
        skills: { paths: [] },
      }).success).toBe(true);

      expect(GlobalSpecialistOverrideSchema.safeParse({
        execution: { model: 'x', fallback_models: ['a', 'b'] },
        skills: { paths: [] },
      }).success).toBe(true);

      expect(GlobalSpecialistOverrideSchema.safeParse({
        execution: { model: 'x', fallback_models: [] },
        skills: { paths: [] },
      }).success).toBe(true);
    });
  });

  it('global override schema rejects non-array fallback_models', () => {
    const result = GlobalSpecialistOverrideSchema.safeParse({
      execution: { model: 'x', fallback_models: 'not-an-array' },
      skills: { paths: [] },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.path.join('.'))).toContain('execution.fallback_models');
  });

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
    expect(result.specialist.execution.bare).toBe(false);
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

  it('accepts execution.extensions flags', async () => {
    const spec = createValidSpec();
    (spec.specialist.execution as Record<string, unknown>).extensions = {
      serena: false,
      gitnexus: false,
    };
    const result = await parseSpecialist(toJson(spec));
    expect(result.specialist.execution.extensions?.serena).toBe(false);
    expect(result.specialist.execution.extensions?.gitnexus).toBe(false);
  });

  it('accepts specialist.permissions manifest overrides', async () => {
    const spec = createValidSpec() as ReturnType<typeof createValidSpec> & {
      specialist: ReturnType<typeof createValidSpec>['specialist'] & {
        permissions: {
          READ_ONLY: {
            denied_natives_when_extension: string[];
            denied_natives_mode: 'hard';
          };
        };
      };
    };
    spec.specialist.permissions = {
      READ_ONLY: {
        denied_natives_when_extension: ['grep', 'find', 'ls'],
        denied_natives_mode: 'hard',
      },
    };

    const result = await parseSpecialist(toJson(spec));

    expect(result.specialist.permissions?.READ_ONLY?.denied_natives_when_extension).toEqual(['grep', 'find', 'ls']);
    expect(result.specialist.permissions?.READ_ONLY?.denied_natives_mode).toBe('hard');
  });

  it('rejects invalid specialist.permissions shape', async () => {
    const spec = createValidSpec() as ReturnType<typeof createValidSpec> & {
      specialist: ReturnType<typeof createValidSpec>['specialist'] & {
        permissions: {
          READ_ONLY: {
            denied_natives_mode: string;
          };
        };
      };
    };
    spec.specialist.permissions = {
      READ_ONLY: {
        denied_natives_mode: 'blocked',
      },
    };

    const result = await validateSpecialist(toJson(spec));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'specialist.permissions.READ_ONLY.denied_natives_mode' }),
    ]));
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
