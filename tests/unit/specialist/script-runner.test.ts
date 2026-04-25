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
    expect(() => compatGuard({ name: 'x', description: '', category: '', version: '', model: '', permission_required: 'READ_ONLY', interactive: true, skills: [], scripts: [], scope: 'user', source: 'user', filePath: '' }, { ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, interactive: true } } } as never)).toThrow('interactive');
  });

  it('rejects worktree specialist', () => {
    expect(() => compatGuard({ name: 'x', description: '', category: '', version: '', model: '', permission_required: 'READ_ONLY', interactive: false, skills: [], scripts: [], scope: 'user', source: 'user', filePath: '' }, { ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, requires_worktree: true } } } as never)).toThrow('worktree');
  });
});

describe('template render', () => {
  it('throws on missing variable', () => {
    expect(() => renderTaskTemplate('hello $name', {})).toThrow('Missing template variable: name');
  });
});
