import { describe, it, expect } from 'vitest';
import {
  buildSpecialistOverrideTemplate,
  mergeGlobalUserConfig,
  validateGlobalUserConfig,
} from '../../../src/specialist/global-config.js';

describe('global specialist override config', () => {
  it('buildSpecialistOverrideTemplate includes nested execution and prompt defaults', () => {
    expect(buildSpecialistOverrideTemplate()).toEqual({
      execution: {
        model: null,
        fallback_model: null,
        timeout_ms: null,
        stall_timeout_ms: null,
        thinking_level: null,
        max_retries: null,
        extensions: {
          serena: null,
          gitnexus: null,
        },
      },
      prompt: {
        system_prompt_mode: null,
      },
      beads_write_notes: null,
      skills: { paths: [] },
    });
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
        timeout_ms: null,
        stall_timeout_ms: null,
        thinking_level: null,
        max_retries: null,
        extensions: {
          serena: null,
          gitnexus: null,
        },
      },
      prompt: {
        system_prompt_mode: null,
      },
      beads_write_notes: false,
      skills: { paths: ['/custom'] },
    });
    expect(result.extended).toEqual(['demo']);
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
    expect(result.errors.some(error => error.path === 'demo.prompt')).toBe(true);
  });
});
