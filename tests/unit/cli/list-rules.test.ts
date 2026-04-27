import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(__dirname, '../../../dist/index.js');
const BUN = process.env.BUN_BIN ?? 'bun';

function runListRules(cwd: string, args: string[] = []): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(BUN, [CLI, 'list-rules', ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, status: 0 };
  } catch (err: any) {
    return { stdout: err.stdout?.toString() ?? '', status: err.status ?? 1 };
  }
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

  // config/specialists/
  mkdirSync(join(root, 'config/specialists'), { recursive: true });
  writeFileSync(join(root, 'config/specialists/alpha.specialist.json'), JSON.stringify({
    specialist: {
      metadata: { name: 'alpha', version: '1.0.0', description: '', category: 'audit' },
      execution: { mode: 'tool', model: 'a/b', permission_required: 'LOW' },
      mandatory_rules: { template_sets: ['role-rule'] },
    },
  }));
  writeFileSync(join(root, 'config/specialists/beta.specialist.json'), JSON.stringify({
    specialist: {
      metadata: { name: 'beta', version: '1.0.0', description: '', category: 'audit' },
      execution: { mode: 'tool', model: 'a/b', permission_required: 'LOW' },
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
    expect(stdout).toMatch(/4 sets, 2 specialists/);
    expect(stdout).toMatch(/alpha\s+.*\s+R\s+/); // alpha gets required
    expect(stdout).toMatch(/beta\s+.*\s+R\s+/);  // beta still gets required
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

  it('--specialist on disable_default_globals omits defaults', () => {
    const { stdout, status } = runListRules(fixture, ['--specialist', 'beta']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/globals_disabled=true/);
    expect(stdout).toMatch(/core-rule\s+required/);
    expect(stdout).not.toMatch(/git-rule\s+default/);
  });

  it('--json emits structured output', () => {
    const { stdout, status } = runListRules(fixture, ['--json']);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.rules).toHaveLength(4);
    expect(parsed.specialists).toHaveLength(2);
    const alpha = parsed.specialists.find((s: any) => s.name === 'alpha');
    expect(alpha.applied_rules.map((r: any) => r.id)).toContain('core-rule');
    expect(alpha.applied_rules.map((r: any) => r.id)).toContain('role-rule');
    expect(alpha.globals_disabled).toBe(false);
  });
});
