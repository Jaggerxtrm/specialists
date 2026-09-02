// tests/unit/specialist/project-pack-skill-resolver.test.ts
// unitAI-jndsb.11 — bare logical skills resolve into the consumer project-pack
// tree <consumerRoot>/.xtrm/skills/<pack>/<skill>/ (repo skills layout v2).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm, chmod, symlink } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  isBareLogicalSkillName,
  resolveSkillPath,
  resolveBareLogicalSkill,
  ProjectPackSkillAmbiguityError,
  RESERVED_SKILL_ROOTS,
} from '../../../src/specialist/project-pack-skill-resolver.js';
import { SpecialistLoader } from '../../../src/specialist/loader.js';

const MANIFEST = (name: string, paths: string[]): string => JSON.stringify({
  specialist: {
    metadata: { name, version: '1.0.0', description: 'Test specialist', category: 'test' },
    execution: { model: 'gemini' },
    prompt: { task_template: 'Do $prompt' },
    skills: { paths },
  },
});

let sandbox: string;
beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'pp-resolver-'));
});
afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/** Create <root>/.xtrm/skills/<pack>/<skill>/SKILL.md */
async function seedPack(root: string, pack: string, skill: string): Promise<void> {
  const dir = join(root, '.xtrm', 'skills', pack, skill);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), `# ${skill}\n`);
}

async function seedReserved(root: string, reservedRoot: string, skill: string): Promise<void> {
  const dir = join(root, '.xtrm', 'skills', reservedRoot, skill);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), `# ${skill} (reserved)\n`);
}

/** Resolve and return the error message, or null on success. */
function attemptResolve(skill: string, root: string): string | null {
  try {
    resolveBareLogicalSkill(skill, root);
    return null;
  } catch (error: unknown) {
    return (error as Error).message;
  }
}

describe('isBareLogicalSkillName', () => {
  it('treats single-segment names as bare logical skills', () => {
    expect(isBareLogicalSkillName('service-knowledge')).toBe(true);
    expect(isBareLogicalSkillName('test-planning')).toBe(true);
  });

  it('rejects path-prefixed forms, tildes, dots, separators, and empty strings', () => {
    expect(isBareLogicalSkillName('~/.xtrm/skills/default/service-knowledge')).toBe(false);
    expect(isBareLogicalSkillName('./service-knowledge')).toBe(false);
    expect(isBareLogicalSkillName('/abs/service-knowledge')).toBe(false);
    expect(isBareLogicalSkillName('config/skills/service-knowledge')).toBe(false);
    expect(isBareLogicalSkillName('.xtrm/skills/active/service-knowledge')).toBe(false);
    expect(isBareLogicalSkillName('foo\\bar')).toBe(false);
    expect(isBareLogicalSkillName('\\leading')).toBe(false);
    expect(isBareLogicalSkillName('trailing\\')).toBe(false);
    expect(isBareLogicalSkillName('')).toBe(false);
    expect(isBareLogicalSkillName('~')).toBe(false);
  });
});

describe('resolveBareLogicalSkill — project-pack tree', () => {
  it('resolves a bare logical skill to the single matching pack (arbitrary pack names)', async () => {
    await seedPack(sandbox, 'infra', 'service-knowledge');
    await seedPack(sandbox, 'market-data', 'service-knowledge');

    // Two consumer repos, one pack each: both must resolve to their own pack.
    const infra = join(sandbox, 'consumer-infra');
    const market = join(sandbox, 'consumer-market');
    await seedPack(infra, 'infra', 'service-knowledge');
    await seedPack(market, 'market-data', 'service-knowledge');

    expect(resolveBareLogicalSkill('service-knowledge', infra)).toBe(
      join(infra, '.xtrm', 'skills', 'infra', 'service-knowledge'),
    );
    expect(resolveBareLogicalSkill('service-knowledge', market)).toBe(
      join(market, '.xtrm', 'skills', 'market-data', 'service-knowledge'),
    );
  });

  it('fails deterministically on multiple project-pack matches (never first filesystem order)', async () => {
    await seedPack(sandbox, 'infra', 'service-knowledge');
    await seedPack(sandbox, 'market-data', 'service-knowledge');

    expect(() => resolveBareLogicalSkill('service-knowledge', sandbox)).toThrow(ProjectPackSkillAmbiguityError);
    expect(() => resolveBareLogicalSkill('service-knowledge', sandbox)).toThrow(/service-knowledge/);
    // Error names both matches, repo-relative, so the operator can disambiguate.
    expect(() => resolveBareLogicalSkill('service-knowledge', sandbox)).toThrow(
      /\.xtrm\/skills\/infra\/service-knowledge/,
    );
    expect(() => resolveBareLogicalSkill('service-knowledge', sandbox)).toThrow(
      /\.xtrm\/skills\/market-data\/service-knowledge/,
    );
    // Remediation recommends the supported consumer-relative explicit form,
    // not `./<rel>` (which would resolve against a package/config manifest dir).
    expect(() => resolveBareLogicalSkill('service-knowledge', sandbox)).toThrow(
      /\.xtrm\/skills\/<pack>\/<skill>/,
    );
  });

  it('never treats reserved layout roots as project packs', async () => {
    // Every reserved root claims the skill; the single real pack must still win.
    for (const reserved of RESERVED_SKILL_ROOTS) await seedReserved(sandbox, reserved, 'service-knowledge');
    await seedPack(sandbox, 'infra', 'service-knowledge');

    expect(resolveBareLogicalSkill('service-knowledge', sandbox)).toBe(
      join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge'),
    );
  });

  it('falls back to the global default candidate when only reserved roots claim the skill', async () => {
    for (const reserved of RESERVED_SKILL_ROOTS) await seedReserved(sandbox, reserved, 'service-knowledge');

    expect(resolveBareLogicalSkill('service-knowledge', sandbox)).toBe(
      join(homedir(), '.xtrm', 'skills', 'default', 'service-knowledge'),
    );
  });

  it('fails closed when a discovered pack skill directory lacks SKILL.md', async () => {
    // A real <pack>/<skill> dir without SKILL.md must not silently fall back
    // to a same-named global after a partial/broken project install.
    await mkdir(join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge'), { recursive: true });
    await seedPack(sandbox, 'infra', 'other-skill');

    const err = attemptResolve('service-knowledge', sandbox);
    expect(err).not.toBeNull();
    expect(err!).toMatch(/missing SKILL\.md|ENOENT/);
    expect(err!).not.toMatch(/xtrm\/skills\/default\/service-knowledge/);
    expect(err!).not.toContain(sandbox); // no absolute host path in .message
    expect(err!).not.toContain('\u001b'); // diagnostics stay control-escaped
  });

  it('falls back to the global default candidate when the candidate skill directory is absent', async () => {
    // The pack exists but has no <skill> subdir at all: a genuinely absent
    // candidate directory -> no match -> global fallback (contract preserved).
    await seedPack(sandbox, 'infra', 'other-skill');

    expect(resolveBareLogicalSkill('service-knowledge', sandbox)).toBe(
      join(homedir(), '.xtrm', 'skills', 'default', 'service-knowledge'),
    );
  });

  it('reports ambiguous matches in stable sorted order (never filesystem order)', async () => {
    // Seed in reverse-alphabetical order; seeding order must not leak into the report.
    await seedPack(sandbox, 'zulu', 'service-knowledge');
    await seedPack(sandbox, 'alpha', 'service-knowledge');

    const first = (): string => {
      try {
        resolveBareLogicalSkill('service-knowledge', sandbox);
      } catch (error: unknown) {
        return (error as Error).message;
      }
      throw new Error('expected ambiguity');
    };

    const message = first();
    expect(message).toContain('.xtrm/skills/alpha/service-knowledge');
    expect(message).toContain('.xtrm/skills/zulu/service-knowledge');
    expect(message.indexOf('.xtrm/skills/alpha/service-knowledge'))
      .toBeLessThan(message.indexOf('.xtrm/skills/zulu/service-knowledge'));
  });

  it('fails closed on a broken consumer tree instead of silently falling back', async () => {
    // `.xtrm/skills` exists as a FILE: realpath fails with ENOTDIR, not
    // ENOENT. A non-ENOENT read error must propagate, never become a global
    // fallback, and must not leak the absolute consumer path.
    await mkdir(join(sandbox, '.xtrm'), { recursive: true });
    await writeFile(join(sandbox, '.xtrm', 'skills'), 'not a directory');

    expect(() => resolveBareLogicalSkill('service-knowledge', sandbox)).toThrow(/ENOTDIR/);
    expect(() => resolveBareLogicalSkill('service-knowledge', sandbox)).not.toThrow(
      /xtrm\/skills\/default\/service-knowledge/,
    );
    expect(() => resolveBareLogicalSkill('service-knowledge', sandbox)).not.toThrow(sandbox);
  });

  it('fails closed when a discovered pack skill entry is a file (ENOTDIR)', async () => {
    // `<pack>/<skill>` exists as a FILE: probing `<skill>/SKILL.md` traverses
    // through a file and must throw ENOTDIR, never fall back to global.
    await mkdir(join(sandbox, '.xtrm', 'skills', 'infra'), { recursive: true });
    await writeFile(join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge'), 'file-not-dir');

    const err = (() => {
      try {
        resolveBareLogicalSkill('service-knowledge', sandbox);
        return null;
      } catch (error: unknown) {
        return (error as Error).message;
      }
    })();
    expect(err).not.toBeNull();
    expect(err!).toMatch(/ENOTDIR/);
    expect(err!).not.toMatch(/xtrm\/skills\/default\/service-knowledge/);
  });

  it('fails closed when SKILL.md is not a regular file', async () => {
    // A directory named SKILL.md must be rejected explicitly, not treated as
    // a match or silently skipped into the global fallback.
    await mkdir(join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge', 'SKILL.md'), { recursive: true });

    const err = (() => {
      try {
        resolveBareLogicalSkill('service-knowledge', sandbox);
        return null;
      } catch (error: unknown) {
        return (error as Error).message;
      }
    })();
    expect(err).not.toBeNull();
    expect(err!).toMatch(/not a regular file/);
    expect(err!).not.toMatch(/xtrm\/skills\/default\/service-knowledge/);
  });

  it('fails closed on an unreadable pack dir (EACCES) instead of silently falling back', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return; // root ignores chmod — runtime-gated skip
    await seedPack(sandbox, 'infra', 'service-knowledge');
    const packDir = join(sandbox, '.xtrm', 'skills', 'infra');
    await chmod(packDir, 0o000);
    try {
      const err = (() => {
        try {
          resolveBareLogicalSkill('service-knowledge', sandbox);
          return null;
        } catch (error: unknown) {
          return (error as Error).message;
        }
      })();
      expect(err).not.toBeNull();
      expect(err!).toMatch(/EACCES|EPERM/);
      expect(err!).not.toMatch(/xtrm\/skills\/default\/service-knowledge/);
      expect(err!).not.toContain(sandbox); // no absolute host path in .message
    } finally {
      await chmod(packDir, 0o755);
    }
  });

  it('falls back to the global default candidate when the consumer has no .xtrm/skills tree', async () => {
    expect(resolveBareLogicalSkill('service-knowledge', sandbox)).toBe(
      join(homedir(), '.xtrm', 'skills', 'default', 'service-knowledge'),
    );
  });

  it('falls back to the global default candidate when the consumer root is missing', async () => {
    expect(resolveBareLogicalSkill('service-knowledge', join(sandbox, 'does-not-exist'))).toBe(
      join(homedir(), '.xtrm', 'skills', 'default', 'service-knowledge'),
    );
  });
});

describe('resolveBareLogicalSkill — symlink and readability hardening', () => {
  it('rejects a symlinked candidate skill directory pointing outside the tree', async () => {
    const outside = join(sandbox, 'outside');
    await mkdir(join(outside, 'service-knowledge'), { recursive: true });
    await writeFile(join(outside, 'service-knowledge', 'SKILL.md'), '# external\n');
    await mkdir(join(sandbox, '.xtrm', 'skills', 'infra'), { recursive: true });
    await symlink(join(outside, 'service-knowledge'), join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge'), 'dir');

    const err = attemptResolve('service-knowledge', sandbox);
    expect(err).not.toBeNull();
    expect(err!).toMatch(/symlink/i);
    expect(err!).not.toMatch(/xtrm\/skills\/default\/service-knowledge/);
  });

  it('rejects a symlinked SKILL.md pointing to an external regular file', async () => {
    const external = join(sandbox, 'external.md');
    await writeFile(external, '# external\n');
    await mkdir(join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge'), { recursive: true });
    await symlink(external, join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge', 'SKILL.md'), 'file');

    const err = attemptResolve('service-knowledge', sandbox);
    expect(err).not.toBeNull();
    expect(err!).toMatch(/symlink/i);
    expect(err!).not.toMatch(/xtrm\/skills\/default\/service-knowledge/);
  });

  it('rejects a top-level symlinked pack directory that could masquerade as a pack', async () => {
    const outside = join(sandbox, 'outside');
    await mkdir(join(outside, 'service-knowledge'), { recursive: true });
    await writeFile(join(outside, 'service-knowledge', 'SKILL.md'), '# external\n');
    await mkdir(join(sandbox, '.xtrm', 'skills'), { recursive: true });
    await symlink(outside, join(sandbox, '.xtrm', 'skills', 'infra'), 'dir');

    const err = attemptResolve('service-knowledge', sandbox);
    expect(err).not.toBeNull();
    expect(err!).toMatch(/symlink/i);
    expect(err!).not.toMatch(/xtrm\/skills\/default\/service-knowledge/);
  });

  it('rejects a .xtrm/skills root symlinked outside the consumer root', async () => {
    // The symlink target must genuinely sit outside the consumer root for the
    // containment assertion to be meaningful.
    const external = await mkdtemp(join(tmpdir(), 'pp-ext-'));
    try {
      await mkdir(join(external, 'infra', 'service-knowledge'), { recursive: true });
      await writeFile(join(external, 'infra', 'service-knowledge', 'SKILL.md'), '# external\n');
      await mkdir(join(sandbox, '.xtrm'), { recursive: true });
      await symlink(external, join(sandbox, '.xtrm', 'skills'), 'dir');

      const err = attemptResolve('service-knowledge', sandbox);
      expect(err).not.toBeNull();
      expect(err!).toMatch(/outside the consumer root/i);
      expect(err!).not.toMatch(/xtrm\/skills\/default\/service-knowledge/);
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it('fails closed when SKILL.md is a real file but unreadable (chmod 000)', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return; // root ignores chmod — runtime-gated skip
    await seedPack(sandbox, 'infra', 'service-knowledge');
    const skillFile = join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge', 'SKILL.md');
    await chmod(skillFile, 0o000);
    try {
      const err = attemptResolve('service-knowledge', sandbox);
      expect(err).not.toBeNull();
      expect(err!).toMatch(/EACCES|EPERM/);
      expect(err!).not.toMatch(/xtrm\/skills\/default\/service-knowledge/);
      expect(err!).not.toContain(sandbox); // no absolute host path in .message
    } finally {
      await chmod(skillFile, 0o644);
    }
  });

  it('ignores ordinary metadata files in the skills root (state.json, INVARIANTS.md)', async () => {
    await mkdir(join(sandbox, '.xtrm', 'skills'), { recursive: true });
    await writeFile(join(sandbox, '.xtrm', 'skills', 'state.json'), '{}');
    await writeFile(join(sandbox, '.xtrm', 'skills', 'INVARIANTS.md'), '# invariants\n');

    expect(resolveBareLogicalSkill('service-knowledge', sandbox)).toBe(
      join(homedir(), '.xtrm', 'skills', 'default', 'service-knowledge'),
    );
  });

  it('still resolves an internal safe regular skill dir alongside metadata files', async () => {
    await mkdir(join(sandbox, '.xtrm', 'skills'), { recursive: true });
    await writeFile(join(sandbox, '.xtrm', 'skills', 'state.json'), '{}');
    await seedPack(sandbox, 'infra', 'service-knowledge');

    expect(resolveBareLogicalSkill('service-knowledge', sandbox)).toBe(
      join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge'),
    );
  });
});

describe('resolveBareLogicalSkill — diagnostic control escaping', () => {
  it('escapes C0/C1/ESC controls in ambiguity messages from malicious pack names', async () => {
    const evilPack = 'evil\u001b[31m-red';
    await seedPack(sandbox, evilPack, 'service-knowledge');
    await seedPack(sandbox, 'zulu', 'service-knowledge');

    const err = attemptResolve('service-knowledge', sandbox);
    expect(err).not.toBeNull();
    // No raw ESC byte (0x1b) nor any C0/C1 control besides tab/newline/CR may
    // reach the propagated message (line breaks are structural, not injected).
    expect(err!).not.toContain('\u001b');
    expect(err!).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/);
    // The pack is still identified via the deterministic visible escape form.
    expect(err!).toContain('evil\\u001b[31m-red');
  });

  it('escapes controls in security messages from a direct control-bearing skillName', async () => {
    const evilSkill = '\u001b[31mred';
    // Force a SecurityError path that interpolates skillName (broken skills root).
    await mkdir(join(sandbox, '.xtrm'), { recursive: true });
    await writeFile(join(sandbox, '.xtrm', 'skills'), 'not a directory');

    const err = attemptResolve(evilSkill, sandbox);
    expect(err).not.toBeNull();
    expect(err!).not.toContain('\u001b');
    expect(err!).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/);
    expect(err!).toContain('\\u001b[31mred');
  });
});

describe('file hygiene', () => {
  it('both new files end with a final newline', () => {
    const files = [
      fileURLToPath(new URL('../../../src/specialist/project-pack-skill-resolver.ts', import.meta.url)),
      fileURLToPath(import.meta.url),
    ];
    for (const file of files) {
      expect(readFileSync(file, 'utf8').endsWith('\n')).toBe(true);
    }
  });
});

describe('resolveSkillPath — preserved forms', () => {
  it('keeps ~/ home-relative behavior', () => {
    expect(resolveSkillPath('~/.xtrm/skills/default/gitnexus-exploring', { consumerRoot: sandbox, fileDir: sandbox }))
      .toBe(join(homedir(), '.xtrm/skills/default/gitnexus-exploring'));
  });

  it('keeps ./ spec-file-relative behavior', () => {
    const fileDir = join(sandbox, '.specialists', 'user');
    expect(resolveSkillPath('./local-skill.md', { consumerRoot: sandbox, fileDir }))
      .toBe(join(fileDir, 'local-skill.md'));
  });

  it('keeps explicit absolute paths verbatim', () => {
    const abs = '/usr/local/share/skills/my-skill.md';
    expect(resolveSkillPath(abs, { consumerRoot: sandbox, fileDir: sandbox })).toBe(abs);
  });

  it('keeps literal relative paths verbatim', () => {
    expect(resolveSkillPath('config/skills/using-specialists', { consumerRoot: sandbox, fileDir: sandbox }))
      .toBe('config/skills/using-specialists');
    expect(resolveSkillPath('.xtrm/skills/active/sync-docs', { consumerRoot: sandbox, fileDir: sandbox }))
      .toBe('.xtrm/skills/active/sync-docs');
  });

  it('routes bare logical names through the project-pack resolver', async () => {
    await seedPack(sandbox, 'infra', 'service-knowledge');
    expect(resolveSkillPath('service-knowledge', { consumerRoot: sandbox, fileDir: sandbox }))
      .toBe(join(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge'));
  });
});

describe('loader integration — bare logical skills in specialist manifests', () => {
  it('get() resolves a bare logical skill to exactly one consumer project pack', async () => {
    const dir = join(sandbox, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'pack-skill.specialist.json'), MANIFEST('pack-skill', ['service-knowledge']));
    await seedPack(sandbox, 'infra', 'service-knowledge');

    const loader = new SpecialistLoader({ projectDir: sandbox });
    const spec = await loader.get('pack-skill');
    const paths = spec.specialist.skills?.paths ?? [];
    expect(paths).toEqual([resolve(sandbox, '.xtrm', 'skills', 'infra', 'service-knowledge')]);
  });

  it('loader.get() fails before model invocation on ambiguous project packs', async () => {
    const dir = join(sandbox, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'pack-skill.specialist.json'), MANIFEST('pack-skill', ['service-knowledge']));
    await seedPack(sandbox, 'infra', 'service-knowledge');
    await seedPack(sandbox, 'market-data', 'service-knowledge');

    const loader = new SpecialistLoader({ projectDir: sandbox });
    await expect(loader.get('pack-skill')).rejects.toThrow(ProjectPackSkillAmbiguityError);
  });

  it('loader.get() falls back to the global default candidate when no project pack matches', async () => {
    const dir = join(sandbox, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'pack-skill.specialist.json'), MANIFEST('pack-skill', ['service-knowledge']));

    const loader = new SpecialistLoader({ projectDir: sandbox });
    const spec = await loader.get('pack-skill');
    const paths = spec.specialist.skills?.paths ?? [];
    expect(paths).toEqual([join(homedir(), '.xtrm', 'skills', 'default', 'service-knowledge')]);
  });
});
