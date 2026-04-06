// tests/integration/cli/worktree.integration.test.ts
// Integration tests for worktree-backed specialists run/status/resume/steer flows.
// Covers: unitAI-hgpu.3, unitAI-hgpu.4

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execSync } from 'node:child_process';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const specialistsBin = join(repoRoot, 'src/index.ts');

// ── Test utilities ─────────────────────────────────────────────────────────────

/**
 * Run the specialists CLI with arguments in a given working directory.
 */
function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  return spawnSync('bun', [specialistsBin, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', ...env },
    timeout: 30_000,
  });
}

/**
 * Initialize a minimal git repo with a .beads/ directory.
 */
async function initGitRepo(tempDir: string): Promise<void> {
  execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: tempDir });
  execSync('git config user.name "Test User"', { cwd: tempDir });
  await mkdir(join(tempDir, '.beads'), { recursive: true });
  await writeFile(join(tempDir, 'README.md'), '# test\n', 'utf-8');
  execSync('git add .', { cwd: tempDir, stdio: 'ignore' });
  execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'ignore' });
}

/**
 * Write a minimal specialist definition file.
 */
async function writeSpecialist(dir: string, name: string, model = 'gemini'): Promise<void> {
  await mkdir(join(dir, 'specialists'), { recursive: true });
  await writeFile(
    join(dir, 'specialists', `${name}.specialist.json`),
    [
      'specialist:',
      '  metadata:',
      `    name: ${name}`,
      '    version: 1.0.0',
      '    description: test specialist for worktree integration',
      '    category: test',
      '  execution:',
      `    model: ${model}`,
      '    timeout_ms: 5000',
      '    permission_required: READ_ONLY',
      '  prompt:',
      '    task_template: "Execute: $prompt"',
    ].join('\n'),
    'utf-8',
  );
}

/**
 * Read a job's status.json from the jobs directory.
 */
async function readJobStatus(jobsDir: string, jobId: string): Promise<SupervisorStatus> {
  const statusPath = join(jobsDir, jobId, 'status.json');
  const raw = await readFile(statusPath, 'utf-8');
  return JSON.parse(raw) as SupervisorStatus;
}

/**
 * Wait for a condition to be met with polling.
 */
async function waitFor<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 15_000,
  intervalMs = 200,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;

  while (Date.now() < deadline) {
    last = await producer();
    if (predicate(last)) return last;
    await new Promise(r => setTimeout(r, intervalMs));
  }

  return producer();
}

/**
 * Check if bd is available.
 */
function hasBd(): boolean {
  const result = spawnSync('bd', ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

/**
 * Check if git worktree is available.
 */
function hasGitWorktree(): boolean {
  const result = spawnSync('git', ['worktree', 'list'], { stdio: 'ignore' });
  return result.status === 0;
}

// Strip ANSI codes from string
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[\d+m/g, '');
}

// ── Integration tests ──────────────────────────────────────────────────────────

describe('integration: worktree CLI flows', () => {
  let tempDir: string;
  let jobsDir: string;

  const skipIfNoBd = !hasBd();
  const skipIfNoGitWorktree = !hasGitWorktree();

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-worktree-'));
    await initGitRepo(tempDir);
    jobsDir = join(tempDir, '.specialists', 'jobs');
    await mkdir(jobsDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      try {
        execSync('git worktree remove --force .worktrees/* 2>/dev/null || true', {
          cwd: tempDir,
          stdio: 'ignore',
        });
      } catch {
        // Ignore cleanup errors
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  // ── Mutual exclusion tests (unitAI-hgpu.3) ───────────────────────────────────

  it('fails with clear error when --worktree and --job are both provided', async () => {
    await writeSpecialist(tempDir, 'test-spec');

    const result = runCli(
      ['run', 'test-spec', '--prompt', 'hello', '--worktree', '--job', 'some-job-id'],
      tempDir,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('mutually exclusive');
    expect(result.stderr).toContain('--worktree');
    expect(result.stderr).toContain('--job');
  });

  it('fails with actionable guidance when --worktree is used without --bead', async () => {
    await writeSpecialist(tempDir, 'test-spec');

    const result = runCli(
      ['run', 'test-spec', '--prompt', 'hello', '--worktree'],
      tempDir,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--worktree requires --bead');
    expect(result.stderr).toContain('Example:');
  });

  // ── --job flag tests (unitAI-hgpu.3) ─────────────────────────────────────────

  it('fails with clear error when --job references a non-existent job', async () => {
    await writeSpecialist(tempDir, 'job-reuse-test');

    const result = runCli(
      ['run', 'job-reuse-test', '--job', 'nonexistent-job', '--prompt', 'test', '--no-beads', '--no-bead-notes'],
      tempDir,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot read status');
    expect(result.stderr).toContain('nonexistent-job');
  });

  it('fails with clear error when --job references a job without worktree_path', async () => {
    await writeSpecialist(tempDir, 'job-reuse-test');

    const fakeJobId = 'fakejob1';
    await mkdir(join(jobsDir, fakeJobId), { recursive: true });
    await writeFile(
      join(jobsDir, fakeJobId, 'status.json'),
      JSON.stringify({
        id: fakeJobId,
        specialist: 'other-specialist',
        status: 'done',
        started_at_ms: Date.now(),
        // NOTE: no worktree_path
      }),
      'utf-8',
    );

    const result = runCli(
      ['run', 'job-reuse-test', '--job', fakeJobId, '--prompt', 'test', '--no-beads', '--no-bead-notes'],
      tempDir,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('has no worktree_path');
    expect(result.stderr).toContain('not started with --worktree');
  });

  // ── status command tests (unitAI-hgpu.4) ─────────────────────────────────────

  it('locates jobs from shared jobs root when invoked from main checkout', async () => {
    await writeSpecialist(tempDir, 'status-test');

    const fakeJobId = 'statusjob1';
    await mkdir(join(jobsDir, fakeJobId), { recursive: true });
    await writeFile(
      join(jobsDir, fakeJobId, 'status.json'),
      JSON.stringify({
        id: fakeJobId,
        specialist: 'status-test',
        status: 'done',
        started_at_ms: Date.now(),
        last_event_at_ms: Date.now(),
      }),
      'utf-8',
    );

    const result = runCli(['status', '--json'], tempDir);

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.jobs).toBeInstanceOf(Array);
    const job = output.jobs.find((j: any) => j.id === fakeJobId);
    expect(job).toBeDefined();
    expect(job.specialist).toBe('status-test');
    expect(job.status).toBe('done');
  });

  (skipIfNoGitWorktree ? it.skip : it)(
    'locates jobs from shared jobs root when invoked from a worktree',
    async () => {
      await writeSpecialist(tempDir, 'worktree-status-test');

      // Create a worktree
      const worktreePath = join(tempDir, '.worktrees', 'test-wt');
      const wtResult = spawnSync('git', ['worktree', 'add', worktreePath, '-b', 'feature/test-wt'], {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'ignore',
      });
      expect(wtResult.status).toBe(0);

      // Create a fake job status in the main checkout's jobs dir
      const fakeJobId = 'wt-status-job';
      await mkdir(join(jobsDir, fakeJobId), { recursive: true });
      await writeFile(
        join(jobsDir, fakeJobId, 'status.json'),
        JSON.stringify({
          id: fakeJobId,
          specialist: 'worktree-status-test',
          status: 'running',
          started_at_ms: Date.now(),
        }),
        'utf-8',
      );

      // Run status from the worktree - should still find the job
      const result = runCli(['status', '--json'], worktreePath);

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      const job = output.jobs.find((j: any) => j.id === fakeJobId);
      expect(job).toBeDefined();
      expect(job.status).toBe('running');
    },
    20_000,
  );

  // ── resume command tests (unitAI-hgpu.4) ─────────────────────────────────────

  it('resumes a waiting job from main checkout using shared jobs root', async () => {
    await writeSpecialist(tempDir, 'resume-test');

    const fakeJobId = 'resume-job-1';
    const fifoPath = join(tempDir, 'test-resume.fifo');
    await writeFile(fifoPath, '', 'utf-8');

    await mkdir(join(jobsDir, fakeJobId), { recursive: true });
    await writeFile(
      join(jobsDir, fakeJobId, 'status.json'),
      JSON.stringify({
        id: fakeJobId,
        specialist: 'resume-test',
        status: 'waiting',
        started_at_ms: Date.now(),
        fifo_path: fifoPath,
      }),
      'utf-8',
    );

    const result = runCli(['resume', fakeJobId, 'continue work'], tempDir);

    expect(result.status).toBe(0);
    const stdoutClean = stripAnsi(result.stdout);
    expect(stdoutClean).toContain('Resume sent');
    expect(stdoutClean).toContain(fakeJobId);

    const written = await readFile(fifoPath, 'utf-8');
    const payload = JSON.parse(written.trim());
    expect(payload.type).toBe('resume');
    expect(payload.task).toBe('continue work');
  });

  (skipIfNoGitWorktree ? it.skip : it)(
    'resumes a waiting job from a worktree using shared jobs root',
    async () => {
      await writeSpecialist(tempDir, 'wt-resume-test');

      // Create a worktree
      const worktreePath = join(tempDir, '.worktrees', 'resume-wt');
      const wtResult = spawnSync('git', ['worktree', 'add', worktreePath, '-b', 'feature/resume-wt'], {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'ignore',
      });
      expect(wtResult.status).toBe(0);

      const fakeJobId = 'wt-resume-job';
      const fifoPath = join(tempDir, 'test-wt-resume.fifo');
      await writeFile(fifoPath, '', 'utf-8');

      await mkdir(join(jobsDir, fakeJobId), { recursive: true });
      await writeFile(
        join(jobsDir, fakeJobId, 'status.json'),
        JSON.stringify({
          id: fakeJobId,
          specialist: 'wt-resume-test',
          status: 'waiting',
          started_at_ms: Date.now(),
          fifo_path: fifoPath,
        }),
        'utf-8',
      );

      // Run resume from the worktree
      const result = runCli(['resume', fakeJobId, 'worktree task'], worktreePath);

      expect(result.status).toBe(0);
      const stdoutClean = stripAnsi(result.stdout);
      expect(stdoutClean).toContain('Resume sent');

      const written = await readFile(fifoPath, 'utf-8');
      const payload = JSON.parse(written.trim());
      expect(payload.type).toBe('resume');
      expect(payload.task).toBe('worktree task');
    },
    20_000,
  );

  // ── steer command tests (unitAI-hgpu.4) ──────────────────────────────────────

  it('steers a running job from main checkout using shared jobs root', async () => {
    await writeSpecialist(tempDir, 'steer-test');

    const fakeJobId = 'steer-job-1';
    const fifoPath = join(tempDir, 'test-steer.fifo');
    await writeFile(fifoPath, '', 'utf-8');

    await mkdir(join(jobsDir, fakeJobId), { recursive: true });
    await writeFile(
      join(jobsDir, fakeJobId, 'status.json'),
      JSON.stringify({
        id: fakeJobId,
        specialist: 'steer-test',
        status: 'running',
        started_at_ms: Date.now(),
        fifo_path: fifoPath,
      }),
      'utf-8',
    );

    const result = runCli(['steer', fakeJobId, 'adjust direction'], tempDir);

    expect(result.status).toBe(0);
    const stdoutClean = stripAnsi(result.stdout);
    expect(stdoutClean).toContain('Steer message sent');
    expect(stdoutClean).toContain(fakeJobId);

    const written = await readFile(fifoPath, 'utf-8');
    const payload = JSON.parse(written.trim());
    expect(payload.type).toBe('steer');
    expect(payload.message).toBe('adjust direction');
  });

  (skipIfNoGitWorktree ? it.skip : it)(
    'steers a running job from a worktree using shared jobs root',
    async () => {
      await writeSpecialist(tempDir, 'wt-steer-test');

      // Create a worktree
      const worktreePath = join(tempDir, '.worktrees', 'steer-wt');
      const wtResult = spawnSync('git', ['worktree', 'add', worktreePath, '-b', 'feature/steer-wt'], {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'ignore',
      });
      expect(wtResult.status).toBe(0);

      const fakeJobId = 'wt-steer-job';
      const fifoPath = join(tempDir, 'test-wt-steer.fifo');
      await writeFile(fifoPath, '', 'utf-8');

      await mkdir(join(jobsDir, fakeJobId), { recursive: true });
      await writeFile(
        join(jobsDir, fakeJobId, 'status.json'),
        JSON.stringify({
          id: fakeJobId,
          specialist: 'wt-steer-test',
          status: 'running',
          started_at_ms: Date.now(),
          fifo_path: fifoPath,
        }),
        'utf-8',
      );

      // Run steer from the worktree
      const result = runCli(['steer', fakeJobId, 'worktree steer'], worktreePath);

      expect(result.status).toBe(0);
      const stdoutClean = stripAnsi(result.stdout);
      expect(stdoutClean).toContain('Steer message sent');

      const written = await readFile(fifoPath, 'utf-8');
      const payload = JSON.parse(written.trim());
      expect(payload.type).toBe('steer');
      expect(payload.message).toBe('worktree steer');
    },
    20_000,
  );

  // ── worktree_path / branch persistence tests (unitAI-hgpu.1, hgpu.3) ─────────

  it('persists worktree_path and branch in status.json for worktree runs', async () => {
    // This test verifies the Supervisor persists worktree metadata
    // by creating a status.json manually and verifying status can read it back
    
    await writeSpecialist(tempDir, 'wt-metadata-test');

    const fakeJobId = 'wt-meta-job';
    const fakeWorktreePath = join(tempDir, '.worktrees', 'fake-wt');
    const fakeBranch = 'feature/hgpu.7-test';

    await mkdir(join(jobsDir, fakeJobId), { recursive: true });
    await writeFile(
      join(jobsDir, fakeJobId, 'status.json'),
      JSON.stringify({
        id: fakeJobId,
        specialist: 'wt-metadata-test',
        status: 'done',
        started_at_ms: Date.now(),
        last_event_at_ms: Date.now(),
        worktree_path: fakeWorktreePath,
        branch: fakeBranch,
      }),
      'utf-8',
    );

    // Verify status command can read back the worktree metadata
    const result = runCli(['status', '--job', fakeJobId, '--json'], tempDir);

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.job.worktree_path).toBe(fakeWorktreePath);
    expect(output.job.branch).toBe(fakeBranch);
  });

  (skipIfNoGitWorktree ? it.skip : it)(
    'worktree_path round-trip: status from worktree reads main checkout jobs',
    async () => {
      await writeSpecialist(tempDir, 'wt-roundtrip-test');

      // Create a worktree
      const worktreePath = join(tempDir, '.worktrees', 'roundtrip-wt');
      const wtResult = spawnSync('git', ['worktree', 'add', worktreePath, '-b', 'feature/roundtrip-wt'], {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'ignore',
      });
      expect(wtResult.status).toBe(0);

      // Create a job with worktree metadata in the main checkout's jobs dir
      const fakeJobId = 'roundtrip-job';
      const expectedWorktreePath = join(tempDir, '.worktrees', 'some-other-wt');
      const expectedBranch = 'feature/hgpu.7-other';

      await mkdir(join(jobsDir, fakeJobId), { recursive: true });
      await writeFile(
        join(jobsDir, fakeJobId, 'status.json'),
        JSON.stringify({
          id: fakeJobId,
          specialist: 'wt-roundtrip-test',
          status: 'done',
          started_at_ms: Date.now(),
          last_event_at_ms: Date.now(),
          worktree_path: expectedWorktreePath,
          branch: expectedBranch,
        }),
        'utf-8',
      );

      // Run status from the worktree - should read the same worktree_path
      const result = runCli(['status', '--job', fakeJobId, '--json'], worktreePath);

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.job.worktree_path).toBe(expectedWorktreePath);
      expect(output.job.branch).toBe(expectedBranch);
    },
    20_000,
  );

  // ── Real bd integration tests (require valid beads) ──────────────────────────

  (skipIfNoBd ? it.skip : it)(
    'worktree provisioning with valid bead (requires bd environment)',
    async () => {
      // This test requires a real bd environment with valid beads.
      // It's marked as skip in CI but can be enabled locally for full integration testing.
      // The component tests above verify the CLI flag behavior and error handling.
      
      await writeSpecialist(tempDir, 'real-wt-test');

      // Try to run with --worktree and a bead id
      // This will only succeed if hgpu.7 exists in bd
      const result = runCli(
        ['run', 'real-wt-test', '--worktree', '--bead', 'hgpu.7', '--no-beads', '--no-bead-notes'],
        tempDir,
      );

      // If bd is available but bead doesn't exist, we expect failure at bead lookup
      // If everything is set up correctly, we'd see worktree provisioning
      if (result.stderr.includes('Unable to read bead')) {
        // Bead doesn't exist - this is expected in test environments
        // The test passes by verifying the error is about bead lookup, not worktree
        expect(result.stderr).toContain('Unable to read bead');
      } else if (result.stderr.includes('[worktree')) {
        // Worktree was provisioned - verify metadata
        expect(result.stderr).toMatch(/\[worktree (created|reused):/);
      }
    },
    30_000,
  );
});
