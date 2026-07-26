import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

function probeStatus(command: string, args: string[], expected: number): boolean {
  return spawnSync(command, args, { stdio: 'ignore', timeout: 15_000 }).status === expected;
}

/**
 * Probe the pty tooling's *interface*, not just its presence: a host can carry GNU
 * `timeout` on PATH next to a BSD `script` that rejects `-c`/`-e` (macOS with a
 * coreutils gnubin dir). Existence checks would pass there and the suite would fail
 * instead of skipping. This runs the exact flag set the harness uses and requires the
 * child's exit status to come back through `-e`.
 */
const canPty = probeStatus(
  'timeout',
  ['--kill-after=2', '5', 'script', '-q', '-e', '-c', 'exit 7', '/dev/null'],
  7,
);

/** pgrep's documented no-match status is 1; anything else means the orphan check is untrustworthy. */
const canPgrep = probeStatus('pgrep', ['-xf', 'specialists-attach-probe-no-such-process'], 1);

/** Upper bound for any single pty-backed attach run, in seconds. */
const PTY_LIMIT_S = 15;

function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
}

/**
 * Run `command` on a pty with a hard termination contract.
 *
 * `attach` requires a TTY and, for live jobs, hands off to a TUI that only exits
 * on Ctrl+C or `/quit` — so an unbounded `script` here hangs the whole vitest
 * worker (spawnSync is synchronous, vitest's testTimeout can never fire) and
 * leaves the pty child reparented to init. ISSUE: xtrm-wiy5n.4.10.
 *
 * `timeout` runs `script` in its own process group and signals the *group*, so
 * the pty child dies with it. spawnSync's own timeout is the outer backstop that
 * unblocks the worker even if the inner bound is defeated.
 */
function runInPty(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv = {},
  input = '',
  limitSeconds = PTY_LIMIT_S,
) {
  return spawnSync(
    'timeout',
    ['--kill-after=2', String(limitSeconds), 'script', '-q', '-e', '-c', command, '/dev/null'],
    {
      cwd,
      input,
      encoding: 'utf-8',
      timeout: (limitSeconds + 5) * 1000,
      killSignal: 'SIGKILL',
      env: { ...process.env, NO_COLOR: '1', TERM: 'dumb', ...env },
    },
  );
}

/** `script -c` runs its argument through a shell, so every word must be quoted. */
function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function attachCommand(args: string[]): string {
  return ['bun', 'run', join(repoRoot, 'src/index.ts'), ...args].map(shQuote).join(' ');
}

/** `script` folds stderr into the pty, so all CLI output lands on stdout. */
function attachInPty(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}, input = '') {
  return runInPty(attachCommand(args), cwd, env, input);
}

function attachInPtyBounded(args: string[], cwd: string, limitSeconds: number) {
  return runInPty(attachCommand(args), cwd, { SPECIALISTS_JOB_FILE_OUTPUT: 'on' }, '', limitSeconds);
}

async function writeStatus(
  tempDir: string,
  jobId: string,
  status: Partial<SupervisorStatus> & { status: SupervisorStatus['status'] },
): Promise<void> {
  const jobDir = join(tempDir, '.specialists', 'jobs', jobId);
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, 'status.json'), JSON.stringify({
    id: jobId,
    specialist: 'test-specialist',
    started_at_ms: Date.now(),
    ...status,
  }), 'utf-8');
}

async function writeSpecialist(tempDir: string, name: string): Promise<void> {
  const specialistDir = join(tempDir, '.specialists', 'user', 'specialists');
  await mkdir(specialistDir, { recursive: true });
  await writeFile(join(specialistDir, `${name}.specialist.yaml`), [
    'specialist:',
    '  metadata:',
    `    name: ${name}`,
    '    version: 1.0.0',
    '    description: test specialist',
    '    category: test',
    '  execution:',
    '    model: anthropic/claude-sonnet-4-6',
    '    timeout_ms: 1000',
    '    permission_required: READ_ONLY',
    '  prompt:',
    '    task_template: "Do $prompt"',
  ].join('\n'));
}

describe('integration: specialists attach', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('exits 1 and prints usage when no job id is provided', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-'));

    const result = runCli(['attach'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: specialists attach <job-id>');
  });

  it('exits 1 and prints usage without a TTY even when a job id is given', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-'));
    await writeStatus(tempDir, 'running-job', { status: 'running' });

    const result = runCli(['attach', 'running-job'], tempDir, { SPECIALISTS_JOB_FILE_OUTPUT: 'on' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: specialists attach <job-id>');
  });

  (canPty ? it : it.skip)('exits 1 with not found message for missing job', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-'));

    const result = attachInPty(['attach', 'nonexistent-job'], tempDir, { SPECIALISTS_JOB_FILE_OUTPUT: 'on' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Job `nonexistent-job` not found.');
  }, 30_000);

  (canPty ? it : it.skip)('exits 1 with terminal message for done jobs', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-'));
    await writeStatus(tempDir, 'done-job', { status: 'done' });

    const result = attachInPty(['attach', 'done-job'], tempDir, { SPECIALISTS_JOB_FILE_OUTPUT: 'on' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Job `done-job` is terminal.');
  }, 30_000);

  (canPty ? it : it.skip)('attaches a running job and exits 0 when the operator quits', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-live-'));
    await writeStatus(tempDir, 'running-job', { status: 'running' });

    const startedAt = Date.now();
    const result = attachInPty(['attach', 'running-job'], tempDir, { SPECIALISTS_JOB_FILE_OUTPUT: 'on' }, '/quit\n');
    const elapsedMs = Date.now() - startedAt;

    expect(result.status).toBe(0);
    // Emitted by the TUI feed only after handoff, so this fails if attach never got there.
    expect(result.stdout).toContain('chat: job=running-job state=running');
    expect(elapsedMs).toBeLessThan(PTY_LIMIT_S * 1000);
  }, 30_000);

  ((canPty && canPgrep) ? it : it.skip)('bounds a stuck attach and leaves no orphan process', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-stuck-'));
    await writeStatus(tempDir, 'stuck-attach-job', { status: 'running' });
    // No input: the TUI waits forever. This is the regression the bound exists for.
    const stuckLimitSeconds = 5;

    const startedAt = Date.now();
    const result = attachInPtyBounded(['attach', 'stuck-attach-job'], tempDir, stuckLimitSeconds);
    const elapsedMs = Date.now() - startedAt;

    expect(result.status).not.toBe(0);
    expect(elapsedMs).toBeLessThan((stuckLimitSeconds + 5) * 1000);
    // Require pgrep's no-match status exactly: a missing or erroring pgrep returns null/2, and
    // accepting those would let the test claim "no orphan" without having looked.
    expect(spawnSync('pgrep', ['-f', 'attach stuck-attach-job'], { stdio: 'ignore' }).status).toBe(1);
  }, 30_000);
});

describe('integration: specialists list --live', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('prints no sessions message and exits 0 when no running tmux jobs exist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-list-live-'));
    await mkdir(join(tempDir, '.specialists', 'jobs'), { recursive: true });

    const result = runCli(['list', '--live'], tempDir, { SPECIALISTS_JOB_FILE_OUTPUT: 'on' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No running tmux sessions found.');
  });

  it('prints plain-text job list in non-interactive mode', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-list-live-'));
    await writeStatus(tempDir, 'job-a', {
      status: 'running',
      tmux_session: 'sp-job-a-111111',
      specialist: 'alpha',
    });
    await writeStatus(tempDir, 'job-b', {
      status: 'waiting',
      tmux_session: 'sp-job-b-222222',
      specialist: 'beta',
    });

    const result = runCli(['list', '--live', '--show-dead'], tempDir, { SPECIALISTS_JOB_FILE_OUTPUT: 'on' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('job-a  sp-job-a-111111  dead');
    expect(result.stdout).toContain('job-b  sp-job-b-222222  dead');
  });

  it('keeps specialists list output unchanged when --live is not used', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-list-live-'));
    await writeSpecialist(tempDir, 'alpha-specialist');

    const result = runCli(['list'], tempDir);

    expect(result.status).toBe(0);
    // Count is env-dependent — package-tier specialists are listed alongside the temp user tier.
    expect(result.stdout).toMatch(/Specialists \(\d+\)/);
    expect(result.stdout).toContain('alpha-specialist');
    expect(result.stdout).not.toContain('No running tmux sessions found.');
  });
});
