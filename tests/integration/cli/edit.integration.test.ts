import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

function specialistJson(name: string, model = 'anthropic/claude-sonnet-4-6') {
  return JSON.stringify({
    specialist: {
      metadata: {
        name,
        version: '1.0.0',
        description: `${name} description`,
        category: 'integration',
      },
      execution: {
        model,
        permission_required: 'LOW',
        interactive: false,
      },
      prompt: {
        task_template: 'Do $prompt',
      },
    },
  }, null, 2);
}

describe('integration: specialists edit ownership flow', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('forks default specialist into .specialists/user and edits only user layer', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-edit-'));
    await mkdir(join(tempDir, '.specialists', 'default'), { recursive: true });
    await mkdir(join(tempDir, '.specialists', 'user'), { recursive: true });

    const defaultPath = join(tempDir, '.specialists', 'default', 'base.specialist.json');
    await writeFile(defaultPath, specialistJson('base'), 'utf-8');

    const result = runCli(tempDir, [
      'edit',
      'child',
      '--fork-from',
      'base',
      'specialist.execution.model',
      'anthropic/claude-haiku-4-5-20251001',
    ]);

    expect(result.status).toBe(0);

    const userPath = join(tempDir, '.specialists', 'user', 'child.specialist.json');
    const userContent = await readFile(userPath, 'utf-8');
    const defaultContent = await readFile(defaultPath, 'utf-8');

    expect(userContent).toContain('"name": "child"');
    expect(userContent).toContain('claude-haiku-4-5-20251001');
    expect(defaultContent).toContain('"name": "base"');
    expect(defaultContent).toContain('claude-sonnet-4-6');
  });

  it('returns clear error when specialist name missing from ownership layers', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-edit-'));
    await mkdir(join(tempDir, '.specialists', 'default'), { recursive: true });
    await mkdir(join(tempDir, '.specialists', 'user'), { recursive: true });

    const result = runCli(tempDir, ['edit', 'missing', '--get', 'specialist.execution.model']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('specialist "missing" not found');
    expect(result.stderr).toContain('Run');
    expect(result.stderr).toContain('specialists list');
  });
});
