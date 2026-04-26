import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let mockSqliteClient: { listStatuses: () => any[] } | null = null;
vi.mock('../../../src/specialist/observability-sqlite.js', () => ({
  createObservabilitySqliteClient: () => mockSqliteClient,
}));

async function loadModule() {
  return import('../../../src/specialist/worktree-gc.js');
}

describe('collectWorktreeGcCandidates', () => {
  let jobsDir: string;
  let worktreePath: string;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gc-test-'));
    jobsDir = join(tempDir, '.specialists', 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    worktreePath = join(tempDir, 'worktrees', 'test-wt');
    mkdirSync(worktreePath, { recursive: true });
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    mockSqliteClient = null;
    delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    mockSqliteClient = null;
    delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    vi.resetModules();
  });

  function createJobStatus(jobId: string, status: any): void {
    const jobDir = join(jobsDir, jobId);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, 'status.json'), JSON.stringify(status, null, 2));
  }

  it('returns terminal jobs with worktree_path as candidates from DB', async () => {
    mockSqliteClient = {
      listStatuses: () => [{ id: 'job1', specialist: 'test', status: 'done', worktree_path: worktreePath, branch: 'feature/test' }],
    };
    const { collectWorktreeGcCandidates } = await loadModule();
    const candidates = collectWorktreeGcCandidates(jobsDir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].jobId).toBe('job1');
  });

  it('returns empty array if DB empty and file fallback disabled', async () => {
    mockSqliteClient = { listStatuses: () => [] };
    createJobStatus('job1', { id: 'job1', specialist: 'test', status: 'done', started_at_ms: Date.now(), worktree_path: worktreePath, branch: 'feature/test' });
    const { collectWorktreeGcCandidates } = await loadModule();
    expect(collectWorktreeGcCandidates(jobsDir)).toHaveLength(0);
  });

  it('uses file fallback only when env enabled and DB empty', async () => {
    mockSqliteClient = { listStatuses: () => [] };
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    createJobStatus('job1', { id: 'job1', specialist: 'test', status: 'done', started_at_ms: Date.now(), worktree_path: worktreePath, branch: 'feature/test' });
    const { collectWorktreeGcCandidates } = await loadModule();
    expect(collectWorktreeGcCandidates(jobsDir)).toHaveLength(1);
  });

  it('skips active jobs from DB', async () => {
    mockSqliteClient = { listStatuses: () => [{ id: 'active1', specialist: 'test', status: 'running', worktree_path: worktreePath }] };
    const { collectWorktreeGcCandidates } = await loadModule();
    expect(collectWorktreeGcCandidates(jobsDir)).toHaveLength(0);
  });
});

describe('pruneWorktrees', () => {
  let tempDir: string;
  let worktreePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'prune-test-'));
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
    worktreePath = join(tempDir, 'worktrees', 'prune-wt');
    spawnSync('git', ['worktree', 'add', worktreePath, '-b', 'feature/prune-test'], { cwd: tempDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes worktrees for terminal candidates', async () => {
    const { pruneWorktrees } = await loadModule();
    const result = pruneWorktrees([{ jobId: 'test-job', worktreePath, branch: 'feature/prune-test', jobStatus: 'done' }]);
    expect(result.removed.length + result.skipped.length).toBe(1);
  });
});
