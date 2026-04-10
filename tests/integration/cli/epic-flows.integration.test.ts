import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execSync, spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
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
    timeout: 30_000,
  });
}

async function initRepo(cwd: string): Promise<void> {
  execSync('git init', { cwd, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd });
  execSync('git config user.name "Test User"', { cwd });
  await writeFile(join(cwd, 'README.md'), '# test\n', 'utf-8');
  execSync('git add .', { cwd, stdio: 'ignore' });
  execSync('git commit -m "initial"', { cwd, stdio: 'ignore' });
}

async function writeSpecialist(cwd: string, name: string, model = 'invalid/model'): Promise<void> {
  await mkdir(join(cwd, 'specialists'), { recursive: true });
  await writeFile(
    join(cwd, 'specialists', `${name}.specialist.json`),
    [
      'specialist:',
      '  metadata:',
      `    name: ${name}`,
      '    version: 1.0.0',
      '    description: epic flow integration specialist',
      '    category: test',
      '  execution:',
      `    model: ${model}`,
      '    timeout_ms: 1000',
      '    permission_required: READ_ONLY',
      '  prompt:',
      '    task_template: "Do $prompt"',
    ].join('\n'),
    'utf-8',
  );
}

function createStatus(input: {
  id: string;
  beadId: string;
  epicId: string;
  status: SupervisorStatus['status'];
  startedAtMs: number;
  chainKind: 'prep' | 'chain';
  chainId?: string;
  chainRootJobId?: string;
  chainRootBeadId?: string;
  branch?: string;
}): SupervisorStatus {
  return {
    id: input.id,
    specialist: 'executor',
    status: input.status,
    started_at_ms: input.startedAtMs,
    bead_id: input.beadId,
    epic_id: input.epicId,
    chain_kind: input.chainKind,
    chain_id: input.chainId,
    chain_root_job_id: input.chainRootJobId,
    chain_root_bead_id: input.chainRootBeadId,
    branch: input.branch,
    worktree_owner_job_id: input.chainRootJobId,
    worktree_path: `/tmp/${input.id}`,
  };
}

async function waitForStatus(cwd: string, jobId: string): Promise<SupervisorStatus> {
  const statusPath = join(cwd, '.specialists', 'jobs', jobId, 'status.json');
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const raw = await readFile(statusPath, 'utf-8');
      const status = JSON.parse(raw) as SupervisorStatus;
      if (status.status === 'done' || status.status === 'error' || status.status === 'waiting' || status.status === 'running') {
        return status;
      }
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const raw = await readFile(statusPath, 'utf-8');
  return JSON.parse(raw) as SupervisorStatus;
}

describe('integration: epic run/ps/recovery flows', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sp-epic-flows-'));
    await initRepo(tempDir);
    await writeSpecialist(tempDir, 'epic-runner');
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('sp run --epic persists epic_id on the spawned job status', async () => {
    const bunDir = dirname(process.execPath);
    const runResult = runCli(
      tempDir,
      ['run', 'epic-runner', '--prompt', 'hello', '--epic', 'unitAI-epic-run', '--background', '--no-beads', '--no-bead-notes'],
      { PATH: bunDir },
    );

    expect(runResult.status).toBe(0);
    const jobId = runResult.stdout.trim();
    expect(jobId).toMatch(/^[a-f0-9]{6}$/);

    const status = await waitForStatus(tempDir, jobId);
    expect(status.id).toBe(jobId);
    expect(status.epic_id).toBe('unitAI-epic-run');
  }, 30_000);

  it('sp run rejects invalid epic/worktree flag combinations with clear guidance', () => {
    const result = runCli(tempDir, ['run', 'epic-runner', '--prompt', 'hello', '--epic', 'unitAI-e1', '--worktree']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error: --worktree requires --bead <id>');
  });

  it('sp ps and sp ps <job-id> render epic/chain identity from persisted sqlite state', () => {
    const sqlite = createObservabilitySqliteClient(tempDir);
    if (!sqlite) throw new Error('failed to initialize sqlite for ps test');

    const now = Date.now();
    sqlite.upsertEpicRun({
      epic_id: 'unitAI-epic-ps',
      status: 'resolving',
      updated_at_ms: now,
      status_json: JSON.stringify({ epic_id: 'unitAI-epic-ps', status: 'resolving' }),
    });

    sqlite.upsertEpicChainMembership({
      chain_id: 'chain-alpha',
      epic_id: 'unitAI-epic-ps',
      chain_root_bead_id: 'unitAI-chain-alpha',
      chain_root_job_id: 'job-chain-alpha',
      updated_at_ms: now,
    });

    sqlite.upsertStatus(createStatus({
      id: 'job-prep-01',
      beadId: 'unitAI-prep-01',
      epicId: 'unitAI-epic-ps',
      status: 'done',
      startedAtMs: now - 1_000,
      chainKind: 'prep',
      branch: 'feature/prep',
    }));

    sqlite.upsertStatus(createStatus({
      id: 'job-chain-alpha',
      beadId: 'unitAI-chain-alpha',
      epicId: 'unitAI-epic-ps',
      status: 'running',
      startedAtMs: now,
      chainKind: 'chain',
      chainId: 'chain-alpha',
      chainRootJobId: 'job-chain-alpha',
      chainRootBeadId: 'unitAI-chain-alpha',
      branch: 'feature/chain-alpha',
    }));
    sqlite.close();

    const psJson = runCli(tempDir, ['ps', '--json']);
    expect(psJson.status).toBe(0);

    const psPayload = JSON.parse(psJson.stdout) as {
      epics: Array<{ epic_id: string; prep_jobs: Array<{ id: string }>; chains: Array<{ chain_id: string }> }>;
      flat: Array<{ id: string; epic_id?: string; chain_kind?: string }>;
    };

    expect(psPayload.epics.map((epic) => epic.epic_id)).toContain('unitAI-epic-ps');
    const epic = psPayload.epics.find((entry) => entry.epic_id === 'unitAI-epic-ps');
    expect(epic?.prep_jobs.map((job) => job.id)).toContain('job-prep-01');
    expect(epic?.chains.map((chain) => chain.chain_id)).toContain('chain-alpha');
    expect(psPayload.flat.find((job) => job.id === 'job-prep-01')?.chain_kind).toBe('prep');
    expect(psPayload.flat.find((job) => job.id === 'job-chain-alpha')?.epic_id).toBe('unitAI-epic-ps');

    const inspect = runCli(tempDir, ['ps', 'job-chain-alpha']);
    expect(inspect.status).toBe(0);
    expect(inspect.stdout).toContain('epic      unitAI-epic-ps');
    expect(inspect.stdout).toContain('role      chain');
    expect(inspect.stdout).toContain('chain_id  chain-alpha');
  });

  it('epic recovery list/status reads persisted state and merge rejects unresolved epics', () => {
    const sqlite = createObservabilitySqliteClient(tempDir);
    if (!sqlite) throw new Error('failed to initialize sqlite for recovery test');

    const now = Date.now();
    sqlite.upsertEpicRun({
      epic_id: 'unitAI-epic-recovery',
      status: 'open',
      updated_at_ms: now,
      status_json: JSON.stringify({ epic_id: 'unitAI-epic-recovery', status: 'open' }),
    });
    sqlite.upsertEpicChainMembership({
      chain_id: 'chain-recovery',
      epic_id: 'unitAI-epic-recovery',
      chain_root_bead_id: 'unitAI-chain-recovery',
      chain_root_job_id: 'job-chain-recovery',
      updated_at_ms: now,
    });
    sqlite.upsertStatus(createStatus({
      id: 'job-chain-recovery',
      beadId: 'unitAI-chain-recovery',
      epicId: 'unitAI-epic-recovery',
      status: 'running',
      startedAtMs: now,
      chainKind: 'chain',
      chainId: 'chain-recovery',
      chainRootJobId: 'job-chain-recovery',
      chainRootBeadId: 'unitAI-chain-recovery',
      branch: 'feature/chain-recovery',
    }));
    sqlite.close();

    const list = runCli(tempDir, ['epic', 'list', '--json']);
    expect(list.status).toBe(0);
    const listPayload = JSON.parse(list.stdout) as {
      epics: Array<{ epic_id: string; state: string; readiness: { isReady: boolean; summary: string } }>;
    };
    const listed = listPayload.epics.find((epic) => epic.epic_id === 'unitAI-epic-recovery');
    expect(listed?.state).toBe('open');
    expect(listed?.readiness.isReady).toBe(false);

    const status = runCli(tempDir, ['epic', 'status', 'unitAI-epic-recovery', '--json']);
    expect(status.status).toBe(0);
    const statusPayload = JSON.parse(status.stdout) as {
      epic_id: string;
      state: string;
      readiness: { isReady: boolean };
      chains: Array<{ chain_id: string; running_jobs: string[] }>;
    };
    expect(statusPayload.epic_id).toBe('unitAI-epic-recovery');
    expect(statusPayload.state).toBe('open');
    expect(statusPayload.readiness.isReady).toBe(false);
    expect(statusPayload.chains[0]?.running_jobs).toContain('job-chain-recovery');

    const merge = runCli(tempDir, ['epic', 'merge', 'unitAI-epic-recovery']);
    expect(merge.status).not.toBe(0);
    expect(merge.stderr).toContain("Merge blocked: Epic unitAI-epic-recovery is in state 'open'");
    expect(merge.stderr).toContain("Must be 'resolving' or 'merge_ready' before publication");
  });
});
