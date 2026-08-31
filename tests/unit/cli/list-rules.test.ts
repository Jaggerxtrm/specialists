// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSpecialistOverrideTemplate } from '../../../src/specialist/global-config.js';

const CLI = join(__dirname, '../../../dist/index.js');
const BUN = process.env.BUN_BIN ?? 'bun';

function runListRules(cwd: string, args: string[] = [], env: NodeJS.ProcessEnv = process.env): { stdout: string; stderr: string; status: number } {
  // spawnSync (not execFileSync): the child can exit 0 WHILE writing a
  // warning to stderr, and execFileSync only surfaces stderr on failure.
  const result = spawnSync(BUN, [CLI, 'list-rules', ...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  return {
    stdout: (result.stdout ?? '').toString(),
    stderr: (result.stderr ?? '').toString(),
    status: result.status ?? 1,
  };
}

function overlayConfig(name: string, template_sets: unknown): string {
  // Full generated-entry shape (as `sp init --global` writes it) plus a
  // mandatory-rules selection — the only global-config shape that passes
  // GlobalUserConfigSchema whole-file validation.
  return JSON.stringify({
    [name]: {
      ...buildSpecialistOverrideTemplate(),
      mandatory_rules: { template_sets },
    },
  });
}

function setupFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'list-rules-'));

  // config/mandatory-rules/
  mkdirSync(join(root, 'config/mandatory-rules'), { recursive: true });
  writeFileSync(join(root, 'config/mandatory-rules/index.json'), JSON.stringify({
    required_template_sets: ['core-rule'],
    default_template_sets: ['git-rule'],
  }));
  writeFileSync(join(root, 'config/mandatory-rules/core-rule.md'), '---\nname: core-rule\nkind: mandatory-rule\n---\nCore.\n');
  writeFileSync(join(root, 'config/mandatory-rules/git-rule.md'), '---\nname: git-rule\nkind: mandatory-rule\n---\nGit.\n');
  writeFileSync(join(root, 'config/mandatory-rules/role-rule.md'), '---\nname: role-rule\nkind: mandatory-rule\n---\nRole.\n');
  writeFileSync(join(root, 'config/mandatory-rules/orphan-rule.md'), '---\nname: orphan-rule\nkind: mandatory-rule\n---\nOrphan.\n');
  writeFileSync(join(root, 'config/mandatory-rules/extra-rule.md'), '---\nname: extra-rule\nkind: mandatory-rule\n---\nExtra.\n');

  // user overlay mandatory-rules/
  mkdirSync(join(root, '.specialists/user/mandatory-rules'), { recursive: true });
  writeFileSync(join(root, '.specialists/user/mandatory-rules/index.json'), JSON.stringify({
    required_template_sets: ['user-rule'],
    default_template_sets: [],
  }));
  writeFileSync(join(root, '.specialists/user/mandatory-rules/user-rule.md'), '---\nname: user-rule\nkind: mandatory-rule\n---\nUser.\n');

  // config/specialists/
  mkdirSync(join(root, 'config/specialists'), { recursive: true });
  writeFileSync(join(root, 'config/specialists/alpha.specialist.json'), JSON.stringify({
    specialist: {
      metadata: { name: 'alpha', version: '1.0.0', description: '', category: 'audit' },
      execution: { mode: 'tool', model: 'a/b', permission_required: 'LOW' },
      prompt: { task_template: 'Do $prompt' },
      mandatory_rules: { template_sets: ['role-rule'] },
    },
  }));
  writeFileSync(join(root, 'config/specialists/beta.specialist.json'), JSON.stringify({
    specialist: {
      metadata: { name: 'beta', version: '1.0.0', description: '', category: 'audit' },
      execution: { mode: 'tool', model: 'a/b', permission_required: 'LOW' },
      prompt: { task_template: 'Do $prompt' },
      mandatory_rules: { template_sets: [], disable_default_globals: true },
    },
  }));

  return root;
}

describe('sp list-rules', () => {
  let fixture: string;

  beforeEach(() => { fixture = setupFixture(); });
  afterEach(() => { rmSync(fixture, { recursive: true, force: true }); });

  it('renders rule × specialist matrix with R/D/x marks', () => {
    const { stdout, status } = runListRules(fixture);
    expect(status).toBe(0);
    expect(stdout).toMatch(/5 sets, 2 specialists/);
    expect(stdout).toMatch(/alpha\s+.*\s+R\s+/); // alpha gets required
    expect(stdout).toMatch(/beta\s+.*\s+R\s+/);  // beta still gets required
    expect(stdout).toMatch(/user-rule/);
    expect(stdout).toMatch(/Orphan rules/);
    expect(stdout).toMatch(/orphan-rule/);
  });

  it('--rule filters to one rule and lists matching specialists', () => {
    const { stdout, status } = runListRules(fixture, ['--rule', 'role-rule']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Rule: role-rule/);
    expect(stdout).toMatch(/alpha\s+\(role-specific/);
    expect(stdout).not.toMatch(/beta/);
  });

  it('--specialist filters to one spec and shows applied rules', () => {
    const { stdout, status } = runListRules(fixture, ['--specialist', 'alpha']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Specialist: alpha/);
    expect(stdout).toMatch(/core-rule\s+required/);
    expect(stdout).toMatch(/git-rule\s+default/);
    expect(stdout).toMatch(/role-rule\s+role-specific/);
  });

  it('default index sets load even with disable_default_globals (runtime parity, unitAI-klo6k F2)', () => {
    const { stdout, status } = runListRules(fixture, ['--specialist', 'beta']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/globals_disabled=true/);
    expect(stdout).toMatch(/core-rule\s+required/);
    // Runtime always loads index default_template_sets; disable_default_globals
    // only suppresses the inline workflow-quick-rules block.
    expect(stdout).toMatch(/git-rule\s+default/);
  });

  it('--json emits structured output', () => {
    const { stdout, status } = runListRules(fixture, ['--json']);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.rules).toHaveLength(5);
    expect(parsed.specialists).toHaveLength(2);
    expect(parsed.rules.find((r: any) => r.id === 'user-rule').source_tier).toBe('user');
    const alpha = parsed.specialists.find((s: any) => s.name === 'alpha');
    expect(alpha.applied_rules.map((r: any) => r.id)).toContain('core-rule');
    expect(alpha.applied_rules.map((r: any) => r.id)).toContain('role-rule');
    expect(alpha.globals_disabled).toBe(false);
    expect(alpha.effective_template_sets).toEqual(['role-rule']);
  });

  it('global user.json template_sets selection overlays the manifest (unitAI-klo6k)', () => {
    const home = mkdtempSync(join(tmpdir(), 'list-rules-home-'));
    try {
      // Global layer replaces alpha's shipped selection with a different set.
      mkdirSync(join(home, '.config', 'specialists'), { recursive: true });
      writeFileSync(join(home, '.config', 'specialists', 'user.json'), overlayConfig('alpha', ['extra-rule']));
      // Bun's execFileSync ignores process.env mutations, so pass env explicitly.
      const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: '' };

      const { stdout, status } = runListRules(fixture, ['--specialist', 'alpha', '--json'], env);
      expect(status).toBe(0);
      const parsed = JSON.parse(stdout);
      const alpha = parsed.name === 'alpha' ? parsed : parsed.specialists.find((s: any) => s.name === 'alpha');
      expect(alpha.effective_template_sets).toEqual(['extra-rule']);
      expect(alpha.applied_rules.map((r: any) => r.id)).toContain('extra-rule');
      // The manifest-level role-rule no longer applies: replaced by the global selection.
      expect(alpha.applied_rules.map((r: any) => r.id)).not.toContain('role-rule');
      // Index required/default policy still applies.
      expect(alpha.applied_rules.map((r: any) => r.id)).toContain('core-rule');
      expect(alpha.applied_rules.map((r: any) => r.id)).toContain('git-rule');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('global empty selection clears role-specific sets while index policy stays (unitAI-klo6k)', () => {
    const home = mkdtempSync(join(tmpdir(), 'list-rules-home-'));
    try {
      mkdirSync(join(home, '.config', 'specialists'), { recursive: true });
      writeFileSync(join(home, '.config', 'specialists', 'user.json'), overlayConfig('alpha', []));
      const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: '' };

      const { stdout, status } = runListRules(fixture, ['--specialist', 'alpha', '--json'], env);
      expect(status).toBe(0);
      const parsed = JSON.parse(stdout);
      const alpha = parsed.name === 'alpha' ? parsed : parsed.specialists.find((s: any) => s.name === 'alpha');
      expect(alpha.effective_template_sets).toEqual([]);
      expect(alpha.applied_rules.map((r: any) => r.id)).not.toContain('role-rule');
      expect(alpha.applied_rules.map((r: any) => r.id)).toContain('core-rule');
      expect(alpha.applied_rules.map((r: any) => r.id)).toContain('git-rule');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('malformed global template_sets shape fails validation with a warning; effective state falls back to merged/package (unitAI-klo6k)', () => {
    const home = mkdtempSync(join(tmpdir(), 'list-rules-home-'));
    try {
      mkdirSync(join(home, '.config', 'specialists'), { recursive: true });
      writeFileSync(join(home, '.config', 'specialists', 'user.json'), overlayConfig('alpha', 'not-an-array'));
      const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: '' };

      const { stdout, stderr, status } = runListRules(fixture, ['--specialist', 'alpha', '--json'], env);
      // Fail-safe: command still succeeds, alerting on stderr.
      expect(status).toBe(0);
      expect(stderr).toContain('global user config failed validation');
      expect(stderr).toContain('template_sets');
      // Non-array value is never applied: the manifest selection stays authoritative.
      const parsed = JSON.parse(stdout);
      const alpha = parsed.name === 'alpha' ? parsed : parsed.specialists.find((s: any) => s.name === 'alpha');
      expect(alpha.effective_template_sets).toEqual(['role-rule']);
      expect(alpha.applied_rules.map((r: any) => r.id)).toContain('role-rule');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('non-kebab template_sets ids trigger a validation warning; the merge keeps only kebab siblings (unitAI-klo6k)', () => {
    const home = mkdtempSync(join(tmpdir(), 'list-rules-home-'));
    try {
      mkdirSync(join(home, '.config', 'specialists'), { recursive: true });
      writeFileSync(join(home, '.config', 'specialists', 'user.json'), overlayConfig('alpha', ['Bad_Id', 'extra-rule']));
      const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: '' };

      const { stdout, stderr, status } = runListRules(fixture, ['--specialist', 'alpha', '--json'], env);
      expect(status).toBe(0);
      expect(stderr).toContain('global user config failed validation');
      const parsed = JSON.parse(stdout);
      const alpha = parsed.name === 'alpha' ? parsed : parsed.specialists.find((s: any) => s.name === 'alpha');
      // Kebab sibling survives the merge hardening; the invalid element never propagates.
      expect(alpha.effective_template_sets).toEqual(['extra-rule']);
      expect(alpha.applied_rules.map((r: any) => r.id)).toContain('extra-rule');
      expect(alpha.applied_rules.map((r: any) => r.id)).not.toContain('role-rule');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('invalid JSON in the global config is ignored with a warning, not a crash (unitAI-klo6k)', () => {
    const home = mkdtempSync(join(tmpdir(), 'list-rules-home-'));
    try {
      mkdirSync(join(home, '.config', 'specialists'), { recursive: true });
      writeFileSync(join(home, '.config', 'specialists', 'user.json'), '{ broken json');
      const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: '' };

      const { stdout, stderr, status } = runListRules(fixture, ['--specialist', 'alpha', '--json'], env);
      expect(status).toBe(0);
      expect(stderr).toContain('global user config failed validation');
      const parsed = JSON.parse(stdout);
      const alpha = parsed.name === 'alpha' ? parsed : parsed.specialists.find((s: any) => s.name === 'alpha');
      expect(alpha.effective_template_sets).toEqual(['role-rule']);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('repo overlay beats global beats package for template_sets (true merge, unitAI-klo6k F4)', () => {
    const home = mkdtempSync(join(tmpdir(), 'list-rules-home-'));
    try {
      // Global layer selects extra-rule...
      mkdirSync(join(home, '.config', 'specialists'), { recursive: true });
      writeFileSync(join(home, '.config', 'specialists', 'user.json'), overlayConfig('alpha', ['extra-rule']));
      // ...but the repo overlay selects user-rule -> repo wins at runtime.
      mkdirSync(join(fixture, '.specialists', 'user'), { recursive: true });
      writeFileSync(join(fixture, '.specialists', 'user', 'alpha.specialist.json'), JSON.stringify({
        specialist: { mandatory_rules: { template_sets: ['user-rule'] } },
      }));
      const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: '' };

      const { stdout, stderr, status } = runListRules(fixture, ['--specialist', 'alpha', '--json'], env);
      expect(status).toBe(0);
      expect(stderr).toBe('');
      const parsed = JSON.parse(stdout);
      expect(parsed.source_tier).toBe('user');
      expect(parsed.effective_template_sets).toEqual(['user-rule']);
      const ids = parsed.applied_rules.map((r: any) => r.id);
      expect(ids).toContain('user-rule');
      expect(ids).not.toContain('role-rule'); // package replaced
      expect(ids).not.toContain('extra-rule'); // global shadowed by repo
      expect(ids).toContain('core-rule');      // index required still loads
      expect(ids).toContain('git-rule');       // index default still loads
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
