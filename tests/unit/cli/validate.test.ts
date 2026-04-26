import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const specialist = (
  name: string,
  overrides: {
    execution?: Record<string, unknown>;
    prompt?: Record<string, unknown>;
    skills?: unknown;
  } = {},
) => ({
  specialist: {
    metadata: { name, version: '1.0.0', description: `${name} desc`, category: 'test' },
    execution: { model: 'anthropic/model', permission_required: 'READ_ONLY', interactive: false, requires_worktree: false, ...overrides.execution },
    prompt: { task_template: 'Do $prompt', ...overrides.prompt },
    skills: overrides.skills,
  },
});

describe('validate CLI', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = join(tmpdir(), `validate-cli-${crypto.randomUUID()}`);
    mkdirSync(join(rootDir, 'config', 'specialists'), { recursive: true });
    mkdirSync(join(rootDir, '.specialists', 'default'), { recursive: true });
    mkdirSync(join(rootDir, '.specialists', 'user'), { recursive: true });
    writeFileSync(join(rootDir, '.specialists', 'default', 'alpha.specialist.json'), JSON.stringify(specialist('alpha'), null, 2));
    writeFileSync(join(rootDir, '.specialists', 'user', 'beta.specialist.json'), JSON.stringify(specialist('beta'), null, 2));
    writeFileSync(join(rootDir, 'config', 'specialists', 'gamma.specialist.json'), JSON.stringify(specialist('gamma'), null, 2));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('reports path and source for user/default/package resolution', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => { logs.push(String(msg)); });
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => { throw new Error(`exit:${code}`); });

    process.argv = ['node', 'specialists', 'validate', 'beta', '--json'];
    const { run } = await import('../../../src/cli/validate.js');
    await expect(run()).rejects.toThrow('exit:0');
    expect(logs.join('\n')).toContain('"source": "user/user"');
    expect(logs.join('\n')).toContain('.specialists/user/beta.specialist.json');
  });

  it('passes script target on compat-safe spec', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    const outputs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => { outputs.push(String(msg)); });
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => { throw new Error(`exit:${code}`); });
    const specPath = join(rootDir, 'script.specialist.json');
    writeFileSync(specPath, JSON.stringify(specialist('script-ok'), null, 2));

    process.argv = ['node', 'specialists', 'validate', specPath, '--target=script'];
    const { run } = await import('../../../src/cli/validate.js');
    await expect(run()).rejects.toThrow('exit:0');
    expect(outputs.join('\n')).toContain(`PASS ${specPath} script`);
  });

  it('fails script target on compatGuard violation', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((msg: string) => { errors.push(String(msg)); });
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => { throw new Error(`exit:${code}`); });
    const specPath = join(rootDir, 'script-bad.specialist.json');
    writeFileSync(specPath, JSON.stringify(specialist('script-bad', { execution: { interactive: true } }), null, 2));

    process.argv = ['node', 'specialists', 'validate', specPath, '--target', 'script'];
    const { run } = await import('../../../src/cli/validate.js');
    await expect(run()).rejects.toThrow('exit:1');
    expect(errors.join('\n')).toContain('compatGuard: interactive');
  });

  it('preserves schema-only behavior without target', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => { logs.push(String(msg)); });
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => { throw new Error(`exit:${code}`); });

    process.argv = ['node', 'specialists', 'validate', 'beta', '--json'];
    const { run } = await import('../../../src/cli/validate.js');
    await expect(run()).rejects.toThrow('exit:0');
    expect(logs.join('\n')).toContain('"valid": true');
    expect(logs.join('\n')).not.toContain('compatGuard');
  });
});
