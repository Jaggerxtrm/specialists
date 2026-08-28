import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  GLOBAL_USER_CONFIG_DOC,
  buildGlobalUserConfigTemplate,
  buildSpecialistOverrideTemplate,
  mergeGlobalUserConfig,
  validateGlobalUserConfig,
  writeGlobalUserConfig,
  type GlobalUserConfigPath,
} from '../../../src/specialist/global-config.js';

describe('global specialist override config', () => {
  it('buildGlobalUserConfigTemplate includes upgrade-note doc sentinel', () => {
    expect(buildGlobalUserConfigTemplate(['demo'])._doc).toBe(GLOBAL_USER_CONFIG_DOC);
  });

  it('buildSpecialistOverrideTemplate includes nested execution and prompt defaults', () => {
    expect(buildSpecialistOverrideTemplate()).toEqual({
      execution: {
        model: null,
        fallback_model: null,
        fallback_models: null,
        timeout_ms: null,
        stall_timeout_ms: null,
        interactive: null,
        thinking_level: null,
        max_retries: null,
        prompt_limit_bytes: null,
        stdout_limit_bytes: null,
        extensions: {
          gitnexus: null,
        },
      },
      prompt: {
        system_prompt_mode: null,
      },
      stall_detection: {
        waiting_auto_close_ms: null,
      },
      beads_write_notes: null,
      notes_mode: null,
      output_file: null,
      skills: { paths: [] },
    });
  });

  it('validates pre-extension user.json without nested execution or prompt keys', () => {
    const existing = {
      demo: {
        execution: {
          model: 'global/glm-5.1',
          fallback_model: null,
          timeout_ms: null,
          stall_timeout_ms: null,
          thinking_level: null,
          max_retries: null,
        },
        beads_write_notes: false,
        skills: { paths: [] },
      },
    };

    expect(validateGlobalUserConfig(JSON.stringify(existing))).toEqual({ valid: true, errors: [] });
  });

  it('mergeGlobalUserConfig extends pre-extension user.json without clobbering values', () => {
    const existing = {
      demo: {
        execution: {
          model: 'global/glm-5.1',
          fallback_model: null,
          timeout_ms: null,
          stall_timeout_ms: null,
          thinking_level: null,
          max_retries: null,
          extensions: {
            'npm:@jaggerxtrm/pi-service-knowledge': true,
          },
        },
        beads_write_notes: false,
        skills: { paths: ['/custom'] },
      },
    };
    const template = { demo: buildSpecialistOverrideTemplate() };

    const result = mergeGlobalUserConfig(existing, template);

    expect(result.config.demo).toEqual({
      execution: {
        model: 'global/glm-5.1',
        fallback_model: null,
        fallback_models: null,
        timeout_ms: null,
        stall_timeout_ms: null,
        interactive: null,
        thinking_level: null,
        max_retries: null,
        prompt_limit_bytes: null,
        stdout_limit_bytes: null,
        extensions: {
          'npm:@jaggerxtrm/pi-service-knowledge': true,
          gitnexus: null,
        },
      },
      prompt: {
        system_prompt_mode: null,
      },
      stall_detection: {
        waiting_auto_close_ms: null,
      },
      beads_write_notes: false,
      notes_mode: null,
      output_file: null,
      skills: { paths: ['/custom'] },
    });
    expect(result.extended).toEqual(['demo']);
  });

  it('validateGlobalUserConfig accepts _doc plus normal specialist entries', () => {
    const valid = {
      _doc: GLOBAL_USER_CONFIG_DOC,
      executor: buildSpecialistOverrideTemplate(),
    };

    expect(validateGlobalUserConfig(JSON.stringify(valid))).toEqual({ valid: true, errors: [] });
  });

  it('validateGlobalUserConfig accepts arbitrary underscore-prefixed metadata keys', () => {
    const valid = {
      _doc: GLOBAL_USER_CONFIG_DOC,
      _comment: 'operator note',
      _phase4: { owner: 'unitAI-gp7nq.5' },
      executor: buildSpecialistOverrideTemplate(),
    };

    expect(validateGlobalUserConfig(JSON.stringify(valid))).toEqual({ valid: true, errors: [] });
  });

  it('mergeGlobalUserConfig ignores underscore-prefixed metadata when computing removed specialists', () => {
    const result = mergeGlobalUserConfig(
      {
        _doc: GLOBAL_USER_CONFIG_DOC,
        _comment: 'operator note',
        executor: buildSpecialistOverrideTemplate(),
      },
      { executor: buildSpecialistOverrideTemplate() },
    );

    expect(result.config._doc).toBe(GLOBAL_USER_CONFIG_DOC);
    expect((result.config as Record<string, unknown>)._comment).toBeUndefined();
    expect(result.removed).toEqual([]);
  });

  it('mergeGlobalUserConfig preserves _doc and excludes it from removed specialists', () => {
    const result = mergeGlobalUserConfig(
      {
        _doc: GLOBAL_USER_CONFIG_DOC,
        executor: buildSpecialistOverrideTemplate(),
      },
      { executor: buildSpecialistOverrideTemplate() },
    );

    expect(result.config._doc).toBe(GLOBAL_USER_CONFIG_DOC);
    expect(result.removed).toEqual([]);
  });

  it('mergeGlobalUserConfig adds _doc to existing configs without clobbering values', () => {
    const result = mergeGlobalUserConfig(
      { executor: buildSpecialistOverrideTemplate() },
      { executor: buildSpecialistOverrideTemplate() },
    );

    expect(result.config._doc).toBe(GLOBAL_USER_CONFIG_DOC);
    expect(result.removed).toEqual([]);
  });

  it('validateGlobalUserConfig accepts top-level notes_mode and output_file', () => {
    const valid = {
      demo: {
        execution: {
          model: 'global/glm-5.1',
          fallback_model: null,
          timeout_ms: null,
          stall_timeout_ms: null,
          thinking_level: null,
          max_retries: null,
        },
        beads_write_notes: false,
        skills: { paths: [] },
        notes_mode: 'final-only',
        output_file: '/tmp/x.md',
      },
    };

    expect(validateGlobalUserConfig(JSON.stringify(valid))).toEqual({ valid: true, errors: [] });
  });

  it('validateGlobalUserConfig accepts execution.interactive and stall_detection.waiting_auto_close_ms', () => {
    const valid = {
      demo: {
        execution: {
          model: 'global/glm-5.1',
          fallback_model: null,
          timeout_ms: null,
          stall_timeout_ms: null,
          interactive: true,
          thinking_level: null,
          max_retries: null,
        },
        stall_detection: {
          waiting_auto_close_ms: 3600000,
        },
        beads_write_notes: false,
        skills: { paths: [] },
      },
    };

    expect(validateGlobalUserConfig(JSON.stringify(valid))).toEqual({ valid: true, errors: [] });
  });

  it('validateGlobalUserConfig rejects unknown prompt sub-keys with path', () => {
    const invalid = {
      demo: {
        ...buildSpecialistOverrideTemplate(),
        prompt: { system_prompt_mode: null, bogus: 'nope' },
      },
    };

    const result = validateGlobalUserConfig(JSON.stringify(invalid));

    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.path === 'demo.prompt.bogus')).toBe(true);
  });

  it('validateGlobalUserConfig accepts arbitrary execution.extensions source keys', () => {
    const valid = {
      demo: {
        ...buildSpecialistOverrideTemplate(),
        execution: {
          ...buildSpecialistOverrideTemplate().execution,
          extensions: {
            serena: null,
            gitnexus: null,
            'npm:@jaggerxtrm/pi-service-knowledge': true,
            './local-extension': false,
          },
        },
      },
    };

    expect(validateGlobalUserConfig(JSON.stringify(valid))).toEqual({ valid: true, errors: [] });
  });

  it('validates the complete global overrides guide example', () => {
    const markdown = readFileSync('docs/overrides-guide.md', 'utf8');
    const match = markdown.match(
      /## Complete example \(validates against `GlobalUserConfigSchema`\)[\s\S]*?```json\n([\s\S]*?)\n```/,
    );

    expect(match).not.toBeNull();

    const example = match?.[1] ?? '';
    expect(validateGlobalUserConfig(example)).toEqual({ valid: true, errors: [] });
  });
});

describe('writeGlobalUserConfig — atomic-write semantics (unitAI-ctb4u.17)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp-global-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function locationFor(name: string): GlobalUserConfigPath {
    return { path: join(dir, name), source: 'xdg', exists: false };
  }

  it('persists the JSON payload with trailing newline (default success path)', () => {
    const location = locationFor('user.json');
    writeGlobalUserConfig(location, { demo: buildSpecialistOverrideTemplate() });
    const raw = readFileSync(location.path, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(parsed)).toContain('demo');
  });

  it('overwrites an existing file atomically with no .tmp file left behind', () => {
    const location = locationFor('user.json');
    writeFileSync(location.path, '{"demo":{"execution":{"model":"old/model"}}}\n', 'utf-8');
    writeGlobalUserConfig(location, { demo: buildSpecialistOverrideTemplate() });
    const after = JSON.parse(readFileSync(location.path, 'utf-8')) as Record<string, { execution: { model: unknown } }>;
    expect(after.demo!.execution.model).toBeNull();
    const leakedTmps = readdirSync(dir).filter((name) => name.startsWith('user.json.tmp.'));
    expect(leakedTmps).toEqual([]);
  });

  it('preserves prior dest if rename fails after successful tmp-write (regression: no partial overwrite)', () => {
    // Place a directory at location.path so renameSync(tmpFile, location.path)
    // throws EISDIR — exercises the post-tmp-success / pre-dest-replaced
    // failure window. The pre-fix path would have left dest in an
    // indeterminate state; the atomic path preserves dest + cleans up tmp.
    const dirLocation = locationFor('dir-as-dest');
    mkdirSync(dirLocation.path);
    writeFileSync(join(dirLocation.path, 'sentinel.txt'), 'preserved\n', 'utf-8');
    expect(() => writeGlobalUserConfig(dirLocation, { demo: buildSpecialistOverrideTemplate() })).toThrow();
    // Sentinel file inside the dir survived: rename never clobbered it.
    expect(readFileSync(join(dirLocation.path, 'sentinel.txt'), 'utf-8')).toBe('preserved\n');
    // No leaked tmp file in the parent dir (cleanup ran in catch).
    const leakedTmps = readdirSync(dir).filter((name) => name.startsWith('dir-as-dest.tmp.'));
    expect(leakedTmps).toEqual([]);
  });
});
