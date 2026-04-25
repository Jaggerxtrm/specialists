import { describe, expect, it } from 'vitest';
import { compatGuard, renderTaskTemplate } from '../../../src/specialist/script-runner.js';

const baseSpec = {
  specialist: {
    execution: {
      interactive: false,
      requires_worktree: false,
      permission_required: 'READ_ONLY',
    },
    skills: { scripts: [] },
  },
} as const;

describe('script-runner compat guard', () => {
  it('rejects interactive specialist', () => {
    expect(() => compatGuard({ ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, interactive: true } } } as never)).toThrow('interactive');
  });

  it('rejects worktree specialist', () => {
    expect(() => compatGuard({ ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, requires_worktree: true } } } as never)).toThrow('worktree');
  });

  it('rejects non read only specialist', () => {
    expect(() => compatGuard({ ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, permission_required: 'LOW' } } } as never)).toThrow('permission_required');
  });

  it('rejects scripted specialist', () => {
    expect(() => compatGuard({ ...baseSpec, specialist: { ...baseSpec.specialist, skills: { scripts: [{ run: 'echo hi', phase: 'pre', inject_output: false }] } } } as never)).toThrow('scripts not allowed');
  });
});

describe('template render', () => {
  it('throws on missing variable', () => {
    expect(() => renderTaskTemplate('hello $name', {})).toThrow('Missing template variable: name');
  });
});
