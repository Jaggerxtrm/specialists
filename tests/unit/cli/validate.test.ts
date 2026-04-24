import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('validate CLI', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = join(tmpdir(), `validate-cli-${crypto.randomUUID()}`);
    mkdirSync(join(rootDir, 'config', 'specialists'), { recursive: true });
    mkdirSync(join(rootDir, '.specialists', 'default'), { recursive: true });
    mkdirSync(join(rootDir, '.specialists', 'user'), { recursive: true });
    const specialist = (name: string) => ({
      specialist: {
        metadata: { name, version: '1.0.0', description: `${name} desc`, category: 'test' },
        execution: { model: 'm', permission_required: 'LOW', interactive: false },
        prompt: { task_template: 'Do $prompt' },
      },
    });
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
});
