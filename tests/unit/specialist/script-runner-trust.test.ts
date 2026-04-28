import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compatGuard, computeSkillSources, type TrustOptions } from '../../../src/specialist/script-runner.js';
import type { Specialist } from '../../../src/specialist/schema.js';

function makeSpec(overrides: {
  paths?: string[];
  scripts?: Array<{ name: string; on: 'pre' | 'post'; command: string }>;
  skill_inherit?: string;
  permission_required?: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
  interactive?: boolean;
  requires_worktree?: boolean;
} = {}): Specialist {
  return {
    specialist: {
      metadata: { name: 'echo', version: '1.0.0', description: 'echo', category: 'test' },
      execution: {
        mode: 'auto',
        model: 'mock/model',
        timeout_ms: 1000,
        interactive: overrides.interactive ?? false,
        response_format: 'json',
        output_type: 'custom',
        permission_required: overrides.permission_required ?? 'READ_ONLY',
        requires_worktree: overrides.requires_worktree ?? false,
        max_retries: 0,
      },
      prompt: {
        task_template: 'hi',
        ...(overrides.skill_inherit ? { skill_inherit: overrides.skill_inherit } : {}),
        output_schema: { type: 'object' },
        examples: [],
      },
      skills: {
        ...(overrides.paths ? { paths: overrides.paths } : {}),
        ...(overrides.scripts ? { scripts: overrides.scripts } : {}),
      },
    },
  } as unknown as Specialist;
}

describe('compatGuard trust options', () => {
  it('rejects skills.scripts by default', () => {
    expect(() => compatGuard(makeSpec({ scripts: [{ name: 'pre', on: 'pre', command: 'echo' }] })))
      .toThrow(/scripts not allowed/);
  });

  it('allows skills.scripts when --allow-local-scripts', () => {
    const trust: TrustOptions = { allowLocalScripts: true };
    expect(() => compatGuard(makeSpec({ scripts: [{ name: 'pre', on: 'pre', command: 'echo' }] }), trust))
      .not.toThrow();
  });

  it('rejects skills.paths by default', () => {
    expect(() => compatGuard(makeSpec({ paths: ['/etc/skill.md'] })))
      .toThrow(/skills not allowed/);
  });

  it('allows skills.paths when --allow-skills', () => {
    const trust: TrustOptions = { allowSkills: true };
    expect(() => compatGuard(makeSpec({ paths: ['/etc/skill.md'] }), trust))
      .not.toThrow();
  });

  it('rejects prompt.skill_inherit by default', () => {
    expect(() => compatGuard(makeSpec({ skill_inherit: 'some-skill' })))
      .toThrow(/skills not allowed/);
  });

  it('allows prompt.skill_inherit when --allow-skills', () => {
    const trust: TrustOptions = { allowSkills: true };
    expect(() => compatGuard(makeSpec({ skill_inherit: 'some-skill' }), trust))
      .not.toThrow();
  });

  it('rejects skill paths outside allowSkillsRoots', () => {
    const trust: TrustOptions = { allowSkills: true, allowSkillsRoots: ['/opt/skills'] };
    expect(() => compatGuard(makeSpec({ paths: ['/etc/skill.md'] }), trust))
      .toThrow(/not under any --allow-skills-roots/);
  });

  it('accepts skill paths inside allowSkillsRoots', () => {
    const trust: TrustOptions = { allowSkills: true, allowSkillsRoots: ['/opt/skills', '/srv/extra'] };
    expect(() => compatGuard(makeSpec({ paths: ['/opt/skills/foo.md', '/srv/extra/bar.md'] }), trust))
      .not.toThrow();
  });

  it('mixed allow flags: scripts blocked when only --allow-skills', () => {
    const trust: TrustOptions = { allowSkills: true };
    expect(() => compatGuard(makeSpec({ scripts: [{ name: 'pre', on: 'pre', command: 'echo' }] }), trust))
      .toThrow(/scripts not allowed/);
  });

  it('still enforces interactive/worktree/permission rules even with trust flags', () => {
    const trust: TrustOptions = { allowSkills: true, allowLocalScripts: true };
    expect(() => compatGuard(makeSpec({ interactive: true }), trust)).toThrow(/interactive/);
    expect(() => compatGuard(makeSpec({ requires_worktree: true }), trust)).toThrow(/worktree/);
    expect(() => compatGuard(makeSpec({ permission_required: 'LOW' }), trust)).toThrow(/READ_ONLY/);
  });
});

describe('computeSkillSources', () => {
  let tempRoot: string;
  beforeEach(() => { tempRoot = mkdtempSync(join(tmpdir(), 'skill-sources-')); mkdirSync(tempRoot, { recursive: true }); });
  afterEach(() => { rmSync(tempRoot, { recursive: true, force: true }); });

  it('returns empty array when no skill paths', () => {
    expect(computeSkillSources(makeSpec({}))).toEqual([]);
  });

  it('hashes each path and returns sha256 hex', () => {
    const path1 = join(tempRoot, 'a.md');
    const path2 = join(tempRoot, 'b.md');
    writeFileSync(path1, 'content-a');
    writeFileSync(path2, 'content-b');
    const sources = computeSkillSources(makeSpec({ paths: [path1, path2] }));
    expect(sources).toHaveLength(2);
    expect(sources[0].path).toBe(path1);
    expect(sources[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sources[1].path).toBe(path2);
    expect(sources[1].sha256).not.toBe(sources[0].sha256);
  });

  it('emits unreadable for missing files', () => {
    const sources = computeSkillSources(makeSpec({ paths: ['/nonexistent/path.md'] }));
    expect(sources).toEqual([{ path: '/nonexistent/path.md', sha256: 'unreadable' }]);
  });
});
