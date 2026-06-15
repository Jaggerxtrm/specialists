import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  GLOBAL_USER_CONFIG_DOC,
  buildGlobalUserConfigTemplate,
  buildSpecialistOverrideTemplate,
  mergeGlobalUserConfig,
  validateGlobalUserConfig,
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
        thinking_level: null,
        max_retries: null,
        prompt_limit_bytes: null,
        stdout_limit_bytes: null,
        extensions: {
          serena: null,
          gitnexus: null,
        },
      },
      prompt: {
        system_prompt_mode: null,
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
        thinking_level: null,
        max_retries: null,
        prompt_limit_bytes: null,
        stdout_limit_bytes: null,
        extensions: {
          serena: null,
          gitnexus: null,
        },
      },
      prompt: {
        system_prompt_mode: null,
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

  it('mergeGlobalUserConfig preserves _doc and excludes it from removed specialists', () => {
    const result = mergeGlobalUserConfig(
      { _doc: GLOBAL_USER_CONFIG_DOC, executor: buildSpecialistOverrideTemplate() },
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

  it('validateGlobalUserConfig rejects unknown nested execution sub-keys with leaf path', () => {
    const invalid = {
      demo: {
        ...buildSpecialistOverrideTemplate(),
        execution: {
          ...buildSpecialistOverrideTemplate().execution,
          extensions: { serena: null, gitnexus: null, bogus: true },
        },
      },
    };

    const result = validateGlobalUserConfig(JSON.stringify(invalid));

    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.path === 'demo.execution.extensions.bogus')).toBe(true);
  });

  it('validates the complete KAN-91 upgrade-note example', () => {
    const markdown = readFileSync('docs/upgrade-notes/kan-91-expanded-overrides.md', 'utf8');
    const match = markdown.match(
      /## Complete example \(validates against `GlobalUserConfigSchema`\)[\s\S]*?```json\n([\s\S]*?)\n```/,
    );

    expect(match).not.toBeNull();

    const example = match?.[1] ?? '';
    expect(validateGlobalUserConfig(example)).toEqual({ valid: true, errors: [] });
  });
});
