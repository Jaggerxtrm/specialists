import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../../..');
const entry = join(repoRoot, 'src/index.ts');

function runCli(cwd: string, args: string[]) {
  return spawnSync('bun', [entry, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', SPECIALISTS_INIT_FORCE: '1' },
  });
}

function specialistJson(name: string) {
  return JSON.stringify({
    specialist: {
      metadata: {
        name,
        version: '1.0.0',
        description: `${name} description`,
        category: 'integration',
      },
      execution: {
        model: 'anthropic/claude-sonnet-4-6',
        permission_required: 'LOW',
        interactive: false,
      },
      prompt: {
        task_template: 'Do $prompt',
      },
    },
  }, null, 2);
}

describe('integration: specialists validate ownership resolution', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('reports default-mirror source for mirrored specialist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-validate-'));
    await mkdir(join(tempDir, '.specialists', 'default'), { recursive: true });

    await writeFile(
      join(tempDir, '.specialists', 'default', 'alpha.specialist.json'),
      specialistJson('alpha'),
      'utf-8',
    );

    const result = runCli(tempDir, ['validate', 'alpha', '--json']);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.valid).toBe(true);
    expect(payload.source).toBe('default/default-mirror');
    expect(payload.file).toContain('.specialists/default/alpha.specialist.json');
  });

  it('prefers user override source over default mirror', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-validate-'));
    await mkdir(join(tempDir, '.specialists', 'default'), { recursive: true });
    await mkdir(join(tempDir, '.specialists', 'user'), { recursive: true });

    await writeFile(join(tempDir, '.specialists', 'default', 'alpha.specialist.json'), specialistJson('alpha'), 'utf-8');
    await writeFile(join(tempDir, '.specialists', 'user', 'alpha.specialist.json'), specialistJson('alpha'), 'utf-8');

    const result = runCli(tempDir, ['validate', 'alpha', '--json']);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.valid).toBe(true);
    expect(payload.source).toBe('user/user');
    expect(payload.file).toContain('.specialists/user/alpha.specialist.json');
  });

  it('returns clear not-found message for missing specialist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-validate-'));
    const result = runCli(tempDir, ['validate', 'missing']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Specialist not found:');
    expect(result.stderr).toContain('missing');
  });
});
