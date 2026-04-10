import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createObservabilitySqliteClient } from '../../../src/specialist/observability-sqlite.js';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const entry = join(repoRoot, 'src/index.ts');

function runCli(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync('bun', [entry, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
}

async function initRepo(cwd: string): Promise<void> {
  execSync('git init', { cwd, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd });
  execSync('git config user.name "Test User"', { cwd });
  await writeFile(join(cwd, 'shared.txt'), 'base\n', 'utf-8');
  execSync('git add .', { cwd, stdio: 'ignore' });
  execSync('git commit -m "base"', { cwd, stdio: 'ignore' });
}

async function createBranchCommit(cwd: string, baseBranch: string, branch: string, fileName: string): Promise<void> {
  execSync(`git checkout -b ${branch}`, { cwd, stdio: 'ignore' });
  await writeFile(join(cwd, fileName), `${branch}\n`, 'utf-8');
  execSync('git add .', { cwd, stdio: 'ignore' });
  execSync(`git commit -m "${branch}"`, { cwd, stdio: 'ignore' });
  execSync(`git checkout ${baseBranch}`, { cwd, stdio: 'ignore' });
}

async function writeMockBd(binDir: string): Promise<void> {
  const script = `#!/usr/bin/env bash
set -e
if [[ "$1" == "show" ]]; then
  id="$2"
  if [[ "$id" == "unitAI-epic1" ]]; then
    echo '[{"id":"unitAI-epic1","title":"Epic 1","issue_type":"epic"}]'
    exit 0
  fi
  if [[ "$id" == "unitAI-chain-a" ]]; then
    echo '[{"id":"unitAI-chain-a","title":"Chain A","parent":"unitAI-epic1","dependencies":[{"id":"unitAI-chain-b"}]}]'
    exit 0
  fi
  if [[ "$id" == "unitAI-chain-b" ]]; then
    echo '[{"id":"unitAI-chain-b","title":"Chain B","parent":"unitAI-epic1","dependencies":[]}]'
    exit 0
  fi
fi
if [[ "$1" == "children" ]]; then
  echo '[{"id":"unitAI-chain-a"},{"id":"unitAI-chain-b"}]'
  exit 0
fi
if [[ "$1" == "--version" ]]; then
  echo 'bd-test'
  exit 0
fi
exit 1
`;

  const path = join(binDir, 'bd');
  await writeFile(path, script, 'utf-8');
  await chmod(path, 0o755);
}

async function writeMockBunx(binDir: string): Promise<void> {
  const script = `#!/usr/bin/env bash
set -e
if [[ "$1" == "tsc" ]]; then
  exit 0
fi
exit 1
`;

  const path = join(binDir, 'bunx');
  await writeFile(path, script, 'utf-8');
  await chmod(path, 0o755);
}

function createStatus(options: {
  id: string;
  beadId: string;
  branch: string;
  status: SupervisorStatus['status'];
  startedAtMs: number;
  chainId: string;
  chainRootJobId: string;
  chainRootBeadId: string;
  epicId: string;
}): SupervisorStatus {
  return {
    id: options.id,
    specialist: 'executor',
    status: options.status,
    started_at_ms: options.startedAtMs,
    bead_id: options.beadId,
    branch: options.branch,
    worktree_path: `/tmp/${options.id}`,
    chain_id: options.chainId,
    chain_root_job_id: options.chainRootJobId,
    chain_root_bead_id: options.chainRootBeadId,
    epic_id: options.epicId,
  };
}

describe('integration: epic and merge CLI', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sp-epic-integration-'));
    await initRepo(tempDir);

    const baseBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
    await createBranchCommit(tempDir, baseBranch, 'feature/chain-b', 'b.txt');
    await createBranchCommit(tempDir, baseBranch, 'feature/chain-a', 'a.txt');

    await mkdir(join(tempDir, '.specialists', 'jobs', 'job-chain-a'), { recursive: true });
    await mkdir(join(tempDir, '.specialists', 'jobs', 'job-chain-b'), { recursive: true });

    await writeFile(
      join(tempDir, '.specialists', 'jobs', 'job-chain-a', 'status.json'),
      JSON.stringify({
        id: 'job-chain-a',
        bead_id: 'unitAI-chain-a',
        status: 'done',
        branch: 'feature/chain-a',
        worktree_path: '/tmp/chain-a',
        started_at_ms: 2,
      }),
      'utf-8',
    );

    await writeFile(
      join(tempDir, '.specialists', 'jobs', 'job-chain-b', 'status.json'),
      JSON.stringify({
        id: 'job-chain-b',
        bead_id: 'unitAI-chain-b',
        status: 'done',
        branch: 'feature/chain-b',
        worktree_path: '/tmp/chain-b',
        started_at_ms: 1,
      }),
      'utf-8',
    );

    const sqlite = createObservabilitySqliteClient(tempDir);
    if (!sqlite) {
      throw new Error('failed to initialize observability sqlite in temp repo');
    }

    const now = Date.now();
    sqlite.upsertEpicRun({
      epic_id: 'unitAI-epic1',
      status: 'open',
      updated_at_ms: now,
      status_json: JSON.stringify({ epic_id: 'unitAI-epic1', status: 'open' }),
    });

    sqlite.upsertEpicChainMembership({
      chain_id: 'chain-a',
      epic_id: 'unitAI-epic1',
      chain_root_bead_id: 'unitAI-chain-a',
      chain_root_job_id: 'job-chain-a',
      updated_at_ms: now,
    });

    sqlite.upsertEpicChainMembership({
      chain_id: 'chain-b',
      epic_id: 'unitAI-epic1',
      chain_root_bead_id: 'unitAI-chain-b',
      chain_root_job_id: 'job-chain-b',
      updated_at_ms: now,
    });

    sqlite.upsertStatus(createStatus({
      id: 'job-chain-a',
      beadId: 'unitAI-chain-a',
      branch: 'feature/chain-a',
      status: 'done',
      startedAtMs: now,
      chainId: 'chain-a',
      chainRootJobId: 'job-chain-a',
      chainRootBeadId: 'unitAI-chain-a',
      epicId: 'unitAI-epic1',
    }));

    sqlite.upsertStatus(createStatus({
      id: 'job-chain-b',
      beadId: 'unitAI-chain-b',
      branch: 'feature/chain-b',
      status: 'done',
      startedAtMs: now,
      chainId: 'chain-b',
      chainRootJobId: 'job-chain-b',
      chainRootBeadId: 'unitAI-chain-b',
      epicId: 'unitAI-epic1',
    }));

    sqlite.close();

    const binDir = join(tempDir, 'bin');
    await mkdir(binDir, { recursive: true });
    await writeMockBd(binDir);
    await writeMockBunx(binDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('epic list/status/resolve produce operator-readable and JSON output', () => {
    const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

    const listJson = runCli(tempDir, ['epic', 'list', '--json'], { PATH: pathPrefix });
    expect(listJson.status).toBe(0);

    const listPayload = JSON.parse(listJson.stdout) as Array<{ epic_id: string; status: string }>;
    expect(listPayload.some((row) => row.epic_id === 'unitAI-epic1')).toBe(true);

    const resolveJson = runCli(tempDir, ['epic', 'resolve', 'unitAI-epic1', '--json'], { PATH: pathPrefix });
    expect(resolveJson.status).toBe(0);

    const resolvePayload = JSON.parse(resolveJson.stdout) as { epic_id: string; from: string; to: string; changed: boolean };
    expect(resolvePayload.epic_id).toBe('unitAI-epic1');
    expect(resolvePayload.from).toBe('open');
    expect(resolvePayload.to).toBe('resolving');
    expect(resolvePayload.changed).toBe(true);

    const statusHuman = runCli(tempDir, ['epic', 'status', 'unitAI-epic1'], { PATH: pathPrefix });
    expect(statusHuman.status).toBe(0);
    expect(statusHuman.stdout).toContain('Epic: unitAI-epic1');
    expect(statusHuman.stdout).toContain('State: resolving');
    expect(statusHuman.stdout).toContain('chain-a');
    expect(statusHuman.stdout).toContain('chain-b');

    const statusJson = runCli(tempDir, ['epic', 'status', 'unitAI-epic1', '--json'], { PATH: pathPrefix });
    expect(statusJson.status).toBe(0);
    const statusPayload = JSON.parse(statusJson.stdout) as { epic_id: string; status: string; chains: Array<{ chain_id: string }> };
    expect(statusPayload.epic_id).toBe('unitAI-epic1');
    expect(statusPayload.status).toBe('resolving');
    expect(statusPayload.chains.map((chain) => chain.chain_id)).toEqual(expect.arrayContaining(['chain-a', 'chain-b']));
  });

  it('sp merge <chain> refuses bypass when chain belongs to unresolved epic', () => {
    const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

    const result = runCli(tempDir, ['merge', 'unitAI-chain-a'], { PATH: pathPrefix });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unresolved epic unitAI-epic1');
    expect(result.stderr).toContain('sp epic merge unitAI-epic1');
    expect(result.stderr).toContain('sp epic status unitAI-epic1');
  });

  it('sp epic merge publishes chains in dependency order and persists merged lifecycle state', async () => {
    const pathPrefix = `${join(tempDir, 'bin')}:${process.env.PATH ?? ''}`;

    const resolve = runCli(tempDir, ['epic', 'resolve', 'unitAI-epic1'], { PATH: pathPrefix });
    expect(resolve.status).toBe(0);

    const merge = runCli(tempDir, ['epic', 'merge', 'unitAI-epic1'], { PATH: pathPrefix });
    expect(merge.status).toBe(0);
    expect(merge.stdout).toContain('Publication successful.');

    const bIndex = merge.stdout.indexOf('feature/chain-b (unitAI-chain-b)');
    const aIndex = merge.stdout.indexOf('feature/chain-a (unitAI-chain-a)');
    expect(bIndex).toBeGreaterThanOrEqual(0);
    expect(aIndex).toBeGreaterThanOrEqual(0);
    expect(bIndex).toBeLessThan(aIndex);

    const status = runCli(tempDir, ['epic', 'status', 'unitAI-epic1'], { PATH: pathPrefix });
    expect(status.status).toBe(0);
    expect(status.stdout).toContain('State: merged');

    const aFile = await readFile(join(tempDir, 'a.txt'), 'utf-8');
    const bFile = await readFile(join(tempDir, 'b.txt'), 'utf-8');
    expect(aFile).toContain('feature/chain-a');
    expect(bFile).toContain('feature/chain-b');
  });
});
