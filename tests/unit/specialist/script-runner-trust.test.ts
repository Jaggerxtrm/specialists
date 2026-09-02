import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpecialistLoader } from '../../../src/specialist/loader.js';
import { compatGuard, computeSkillSources, runScriptSpecialist, type TrustOptions } from '../../../src/specialist/script-runner.js';
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
  let tempRoot: string;
  beforeEach(() => { tempRoot = mkdtempSync(join(tmpdir(), 'skill-trust-')); });
  afterEach(() => { rmSync(tempRoot, { recursive: true, force: true }); });

  it('rejects skills.scripts by default', () => {
    expect(() => compatGuard(makeSpec({ scripts: [{ name: 'pre', on: 'pre', command: 'echo' }] })))
      .toThrow(/local scripts are not supported/);
  });

  it('allows skills.scripts when allowLocalScripts is set', () => {
    const trust: TrustOptions = { allowLocalScripts: true };
    expect(() => compatGuard(makeSpec({ scripts: [{ name: 'pre', on: 'pre', command: 'echo' }] }), trust))
      .not.toThrow();
  });

  it('rejects skills.paths by default', () => {
    expect(() => compatGuard(makeSpec({ paths: ['/etc/skill.md'] })))
      .toThrow(/skills not allowed/);
  });

  it('allows skills.paths when --allow-skills', () => {
    const path = join(tempRoot, 'skill.md');
    writeFileSync(path, '# skill');
    const trust: TrustOptions = { allowSkills: true };
    expect(() => compatGuard(makeSpec({ paths: [path] }), trust))
      .not.toThrow();
  });

  it('rejects prompt.skill_inherit by default', () => {
    expect(() => compatGuard(makeSpec({ skill_inherit: 'some-skill' })))
      .toThrow(/skills not allowed/);
  });

  it('allows prompt.skill_inherit when --allow-skills', () => {
    const inherited = join(tempRoot, 'inherited.md');
    writeFileSync(inherited, '# inherited');
    const trust: TrustOptions = { allowSkills: true };
    expect(() => compatGuard(makeSpec({ skill_inherit: inherited }), trust))
      .not.toThrow();
  });

  it('rejects skill paths outside allowSkillsRoots', () => {
    const root = join(tempRoot, 'skills');
    const outside = join(tempRoot, 'outside.md');
    mkdirSync(root);
    writeFileSync(outside, '# outside');
    const trust: TrustOptions = { allowSkills: true, allowSkillsRoots: [root] };
    expect(() => compatGuard(makeSpec({ paths: [outside] }), trust))
      .toThrow(/not under any --allow-skills-roots/);
  });

  it('accepts safe explicit skill files and directories inside canonical roots', () => {
    const root = join(tempRoot, 'skills');
    const file = join(root, 'foo.md');
    const directory = join(root, 'bar');
    mkdirSync(directory, { recursive: true });
    writeFileSync(file, '# foo');
    writeFileSync(join(directory, 'SKILL.md'), '# bar');
    const spec = makeSpec({ paths: [file, directory] });

    expect(() => compatGuard(spec, { allowSkills: true, allowSkillsRoots: [root] })).not.toThrow();
    expect(spec.specialist.skills?.paths).toEqual([file, directory]);
  });

  it('rejects sibling prefixes outside allowSkillsRoots', () => {
    const root = join(tempRoot, 'skills');
    const sibling = join(tempRoot, 'skills-evil');
    mkdirSync(root);
    mkdirSync(sibling);
    const outside = join(sibling, 'foo.md');
    writeFileSync(outside, '# outside');
    const trust: TrustOptions = { allowSkills: true, allowSkillsRoots: [root] };
    expect(() => compatGuard(makeSpec({ paths: [outside] }), trust))
      .toThrow(/not under any --allow-skills-roots/);
  });

  it('rejects relative traversal outside allowSkillsRoots', () => {
    const root = join(tempRoot, 'skills');
    mkdirSync(root);
    const outsideViaTraversal = join(root, '..', 'evil.md');
    writeFileSync(outsideViaTraversal, '# outside');
    const trust: TrustOptions = { allowSkills: true, allowSkillsRoots: [root] };
    expect(() => compatGuard(makeSpec({ paths: [outsideViaTraversal] }), trust))
      .toThrow(/not under any --allow-skills-roots/);
  });

  it('canonicalizes a safe in-root symlink before forwarding', () => {
    const root = join(tempRoot, 'skills');
    const target = join(root, 'target');
    const linked = join(root, 'linked');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'SKILL.md'), '# target');
    symlinkSync(target, linked);
    const spec = makeSpec({ paths: [linked] });

    expect(() => compatGuard(spec, { allowSkills: true, allowSkillsRoots: [root] })).not.toThrow();
    expect(spec.specialist.skills?.paths).toEqual([target]);
  });

  it('rejects a symlink that escapes an allowed root', () => {
    const root = join(tempRoot, 'skills');
    const outside = join(tempRoot, 'outside');
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(outside, 'SKILL.md'), '# outside');
    symlinkSync(outside, join(root, 'escaped'));

    expect(() => compatGuard(
      makeSpec({ paths: [join(root, 'escaped')] }),
      { allowSkills: true, allowSkillsRoots: [root] },
    )).toThrow(/not under any --allow-skills-roots/);
  });

  it('fails closed when an allowed root cannot be canonicalized', () => {
    const file = join(tempRoot, 'skill.md');
    writeFileSync(file, '# skill');
    expect(() => compatGuard(
      makeSpec({ paths: [file] }),
      { allowSkills: true, allowSkillsRoots: [join(tempRoot, 'missing-root')] },
    )).toThrow(/allow-skills-roots entry is not usable/);
  });

  it('fails closed when a directory-form skill has no regular SKILL.md', () => {
    const root = join(tempRoot, 'skills');
    const missing = join(root, 'missing');
    const nonfile = join(root, 'nonfile');
    mkdirSync(missing, { recursive: true });
    mkdirSync(join(nonfile, 'SKILL.md'), { recursive: true });

    for (const path of [missing, nonfile]) {
      expect(() => compatGuard(
        makeSpec({ paths: [path] }),
        { allowSkills: true, allowSkillsRoots: [root] },
      )).toThrow(/skill path is not usable; rejected/);
    }
  });

  it('fails closed when directory-form SKILL.md is a symlink', () => {
    const root = join(tempRoot, 'skills');
    const directory = join(root, 'linked-file');
    const target = join(root, 'target.md');
    mkdirSync(directory, { recursive: true });
    writeFileSync(target, '# target');
    symlinkSync(target, join(directory, 'SKILL.md'));

    expect(() => compatGuard(
      makeSpec({ paths: [directory] }),
      { allowSkills: true, allowSkillsRoots: [root] },
    )).toThrow(/skill path is not usable; rejected/);
  });

  it('fails closed when directory-form SKILL.md is unreadable', () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return;
    const root = join(tempRoot, 'skills');
    const directory = join(root, 'unreadable');
    const skillFile = join(directory, 'SKILL.md');
    mkdirSync(directory, { recursive: true });
    writeFileSync(skillFile, '# unreadable');
    chmodSync(skillFile, 0o000);
    try {
      expect(() => compatGuard(
        makeSpec({ paths: [directory] }),
        { allowSkills: true, allowSkillsRoots: [root] },
      )).toThrow(/skill path is not usable; rejected/);
    } finally {
      chmodSync(skillFile, 0o600);
    }
  });

  it('applies allowSkillsRoots to prompt.skill_inherit', () => {
    const root = join(tempRoot, 'skills');
    const outsideRoot = join(tempRoot, 'outside');
    mkdirSync(root);
    mkdirSync(outsideRoot);
    const inherited = join(root, 'review.md');
    const outside = join(outsideRoot, 'review.md');
    writeFileSync(inherited, '# inherited');
    writeFileSync(outside, '# outside');
    expect(() => compatGuard(makeSpec({ skill_inherit: inherited }), { allowSkills: true, allowSkillsRoots: [root] }))
      .not.toThrow();
    expect(() => compatGuard(makeSpec({ skill_inherit: outside }), { allowSkills: true, allowSkillsRoots: [root] }))
      .toThrow(/not under any --allow-skills-roots/);
  });

  it('does not disclose HOME when a missing bare-skill fallback is rejected with the project root absent', async () => {
    const projectRoot = join(tempRoot, 'consumer');
    const manifestDir = join(projectRoot, '.specialists', 'user');
    const allowedRoot = join(projectRoot, 'allowed-skills');
    const skillName = `missing-${tempRoot.split('/').at(-1)}`;
    mkdirSync(manifestDir, { recursive: true });
    mkdirSync(allowedRoot);
    writeFileSync(join(manifestDir, 'missing-skill.specialist.json'), JSON.stringify({
      specialist: {
        metadata: { name: 'missing-skill', version: '1.0.0', description: 'test', category: 'test' },
        execution: {
          model: 'mock/model',
          permission_required: 'READ_ONLY',
          interactive: false,
          requires_worktree: false,
        },
        prompt: { task_template: 'hi' },
        skills: { paths: [skillName] },
      },
    }));

    expect(existsSync(join(projectRoot, '.xtrm', 'skills'))).toBe(false);

    const result = await runScriptSpecialist(
      { specialist: 'missing-skill' },
      {
        loader: new SpecialistLoader({ projectDir: projectRoot }),
        projectDir: projectRoot,
        trust: { allowSkills: true, allowSkillsRoots: [allowedRoot] },
      },
    );

    expect(result).toMatchObject({ success: false, error: 'skill path is not usable; rejected' });
    expect(result.success ? '' : result.error).not.toContain(homedir());
    expect(result.success ? '' : result.error).not.toContain(projectRoot);
  });

  it('mixed allow flags: scripts remain blocked when skills are trusted', () => {
    const trust: TrustOptions = { allowSkills: true };
    expect(() => compatGuard(makeSpec({ scripts: [{ name: 'pre', on: 'pre', command: 'echo' }] }), trust))
      .toThrow(/local scripts are not supported/);
  });

  it('still enforces interactive/worktree/permission rules even with trust flags', () => {
    const trust: TrustOptions = { allowSkills: true };
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

  it('hashes each regular explicit file and preserves its path', () => {
    const path1 = join(tempRoot, 'a.md');
    const path2 = join(tempRoot, 'b.md');
    writeFileSync(path1, 'content-a');
    writeFileSync(path2, 'content-b');
    const sources = computeSkillSources(makeSpec({ paths: [path1, path2] }));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ path: path1, source: 'skills.paths', attestation: 'observation_time_only' });
    expect(sources[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sources[1]).toMatchObject({ path: path2, source: 'skills.paths', attestation: 'observation_time_only' });
    expect(sources[1].sha256).not.toBe(sources[0].sha256);
  });

  it('hashes prompt.skill_inherit alongside skills.paths', () => {
    const path1 = join(tempRoot, 'a.md');
    const inherited = join(tempRoot, 'inherited.md');
    writeFileSync(path1, 'content-a');
    writeFileSync(inherited, 'content-inherited');
    const sources = computeSkillSources(makeSpec({ paths: [path1], skill_inherit: inherited }));
    expect(sources.map((source) => [source.path, source.source])).toEqual([
      [path1, 'skills.paths'],
      [inherited, 'prompt.skill_inherit'],
    ]);
    expect(sources.every((source) => source.attestation === 'observation_time_only')).toBe(true);
    expect(sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
  });

  it('hashes the exact SKILL.md bytes for directory-form skills', () => {
    const directory = join(tempRoot, 'directory-skill');
    const skillFile = join(directory, 'SKILL.md');
    mkdirSync(directory);
    writeFileSync(skillFile, '# directory skill\nexact bytes\n');

    const [source] = computeSkillSources(makeSpec({ paths: [directory] }));

    expect(source).toEqual({
      path: directory,
      sha256: createHash('sha256').update(readFileSync(skillFile)).digest('hex'),
      source: 'skills.paths',
      attestation: 'observation_time_only',
    });
  });

  it('emits unreadable for a directory with missing SKILL.md', () => {
    const directory = join(tempRoot, 'missing-skill-file');
    mkdirSync(directory);
    expect(computeSkillSources(makeSpec({ paths: [directory] })))
      .toEqual([{ path: directory, sha256: 'unreadable', source: 'skills.paths', attestation: 'observation_time_only' }]);
  });

  it('emits unreadable for unreadable SKILL.md', () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return;
    const directory = join(tempRoot, 'unreadable-skill');
    const skillFile = join(directory, 'SKILL.md');
    mkdirSync(directory);
    writeFileSync(skillFile, '# unreadable');
    chmodSync(skillFile, 0o000);
    try {
      expect(computeSkillSources(makeSpec({ paths: [directory] })))
        .toEqual([{ path: directory, sha256: 'unreadable', source: 'skills.paths', attestation: 'observation_time_only' }]);
    } finally {
      chmodSync(skillFile, 0o600);
    }
  });

  it('emits unreadable for non-file SKILL.md', () => {
    const directory = join(tempRoot, 'nonfile-skill');
    mkdirSync(join(directory, 'SKILL.md'), { recursive: true });
    expect(computeSkillSources(makeSpec({ paths: [directory] })))
      .toEqual([{ path: directory, sha256: 'unreadable', source: 'skills.paths', attestation: 'observation_time_only' }]);
  });

  it('emits unreadable for symlinked skill directories and SKILL.md files', () => {
    const targetDirectory = join(tempRoot, 'target-skill');
    const linkedDirectory = join(tempRoot, 'linked-skill');
    const directoryWithLinkedFile = join(tempRoot, 'linked-file-skill');
    const targetFile = join(tempRoot, 'target-SKILL.md');
    mkdirSync(targetDirectory);
    mkdirSync(directoryWithLinkedFile);
    writeFileSync(join(targetDirectory, 'SKILL.md'), '# target');
    writeFileSync(targetFile, '# target file');
    symlinkSync(targetDirectory, linkedDirectory);
    symlinkSync(targetFile, join(directoryWithLinkedFile, 'SKILL.md'));

    expect(computeSkillSources(makeSpec({ paths: [linkedDirectory, directoryWithLinkedFile] })))
      .toEqual([
        { path: linkedDirectory, sha256: 'unreadable', source: 'skills.paths', attestation: 'observation_time_only' },
        { path: directoryWithLinkedFile, sha256: 'unreadable', source: 'skills.paths', attestation: 'observation_time_only' },
      ]);
  });

  it('emits unreadable for missing files', () => {
    const missing = join(tempRoot, 'missing.md');
    const sources = computeSkillSources(makeSpec({ paths: [missing] }));
    expect(sources).toEqual([{ path: missing, sha256: 'unreadable', source: 'skills.paths', attestation: 'observation_time_only' }]);
  });
});
