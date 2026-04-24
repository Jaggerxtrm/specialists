import { afterEach, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

async function setupXtrmStructure(cwd: string) {
  await mkdir(join(cwd, '.xtrm', 'skills', 'active'), { recursive: true });
  await mkdir(join(cwd, '.xtrm', 'skills', 'default'), { recursive: true });
  await mkdir(join(cwd, '.xtrm', 'hooks'), { recursive: true });
  await mkdir(join(cwd, '.claude'), { recursive: true });
  await mkdir(join(cwd, '.pi'), { recursive: true });
}

async function seedCanonicalMirrorSources(cwd: string) {
  await mkdir(join(cwd, 'config', 'specialists'), { recursive: true });
  await mkdir(join(cwd, 'config', 'mandatory-rules'), { recursive: true });
  await mkdir(join(cwd, 'config', 'nodes'), { recursive: true });

  await copyFile(
    join(repoRoot, 'config', 'specialists', 'executor.specialist.json'),
    join(cwd, 'config', 'specialists', 'executor.specialist.json'),
  );
  await copyFile(
    join(repoRoot, 'config', 'mandatory-rules', 'index.json'),
    join(cwd, 'config', 'mandatory-rules', 'index.json'),
  );
  await copyFile(
    join(repoRoot, 'config', 'nodes', 'research.node.json'),
    join(cwd, 'config', 'nodes', 'research.node.json'),
  );
}

describe('integration: specialists doctor managed mirrors', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('reports missing managed mirrors with sync-defaults fix hint', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-doctor-'));

    const result = runCli(tempDir, ['doctor']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Managed mirrors');
    expect(result.stdout).toContain('specialists source missing: config/specialists');
    expect(result.stdout).toContain('mandatory-rules source missing: config/mandatory-rules');
    expect(result.stdout).toContain('nodes source missing: config/nodes');
    expect(result.stdout).toContain('specialists init --sync-defaults');
  });

  it('reports managed-mirror mismatch details and sync hint', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-doctor-'));
    await setupXtrmStructure(tempDir);
    await seedCanonicalMirrorSources(tempDir);

    const initResult = runCli(tempDir, ['init', '--sync-defaults', '--no-xtrm-check']);
    expect(initResult.status).toBe(0);

    const mirrorFile = join(tempDir, '.specialists', 'default', 'executor.specialist.json');
    const mirrorContent = await readFile(mirrorFile, 'utf-8');
    const drifted = mirrorContent.replace('"description": "Handles direct code edits and implementation tasks."', '"description": "DRIFTED DESCRIPTION"');
    await writeFile(mirrorFile, drifted, 'utf-8');

    const doctorResult = runCli(tempDir, ['doctor']);

    expect(doctorResult.status).toBe(0);
    expect(doctorResult.stdout).toContain('Managed mirrors');
    expect(doctorResult.stdout).toContain('specialists:');
    expect(doctorResult.stdout).toContain('extra mirror file');
    expect(doctorResult.stdout).toContain('specialists init --sync-defaults');
  });
});
