import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeSkillSources } from '../../../src/specialist/script-runner.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    constants: { ...actual.constants, O_NOFOLLOW: undefined },
  };
});

let tempRoot = '';
afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

describe('computeSkillSources secure open support', () => {
  it('fails closed when O_NOFOLLOW is unavailable', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skill-no-follow-'));
    const skillFile = join(tempRoot, 'SKILL.md');
    writeFileSync(skillFile, '# skill');
    const spec = {
      specialist: {
        prompt: { task_template: 'test' },
        execution: {},
        skills: { paths: [skillFile] },
      },
    };

    expect(() => computeSkillSources(spec as never)).toThrow('secure no-follow skill source opening is unavailable; rejected');
  });
});
