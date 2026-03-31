import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const hasTmux = spawnSync('which', ['tmux'], { stdio: 'ignore' }).status === 0;
const hasScript = spawnSync('which', ['script'], { stdio: 'ignore' }).status === 0;

function runCli(args: string[], cwd: string) {
  return spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  });
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
  await mkdir(join(tempDir, 'specialists'), { recursive: true });
  await writeFile(join(tempDir, 'specialists', `${name}.specialist.yaml`), [
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
  const tmuxSessionsToCleanup: string[] = [];

  afterEach(async () => {
    for (const sessionName of tmuxSessionsToCleanup) {
      spawnSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore' });
    }
    tmuxSessionsToCleanup.length = 0;

    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('exits 1 and prints usage when no job id is provided', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-'));

    const result = runCli(['attach'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: specialists attach <job-id>');
  });

  it('exits 1 with not found message for missing job', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-'));

    const result = runCli(['attach', 'nonexistent-job'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Job `nonexistent-job` not found.');
  });

  it('exits 1 with already completed message for done jobs', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-'));
    await writeStatus(tempDir, 'done-job', { status: 'done' });

    const result = runCli(['attach', 'done-job'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Job `done-job` has already completed (status: done).');
    expect(result.stderr).toContain('Use `specialists result done-job` to read output.');
  });

  it('exits 1 when running job has no tmux session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-'));
    await writeStatus(tempDir, 'running-no-tmux', { status: 'running' });

    const result = runCli(['attach', 'running-no-tmux'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Job `running-no-tmux` has no tmux session.');
  });

  ((hasTmux && hasScript) ? it : it.skip)('attaches to a live tmux-backed job and exits 0 when session ends', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-attach-live-'));

    const tmuxSession = `sp-attach-int-${Date.now()}`;
    tmuxSessionsToCleanup.push(tmuxSession);

    const sessionStart = spawnSync('tmux', ['new-session', '-d', '-s', tmuxSession, 'sleep 1'], {
      encoding: 'utf-8',
    });
    expect(sessionStart.status).toBe(0);

    await writeStatus(tempDir, 'running-job', { status: 'running', tmux_session: tmuxSession });

    const attachResult = spawnSync(
      'script',
      ['-q', '-c', `bun run ${join(repoRoot, 'src/index.ts')} attach running-job`, '/dev/null'],
      {
        cwd: tempDir,
        encoding: 'utf-8',
        env: { ...process.env, NO_COLOR: '1' },
      },
    );

    expect(attachResult.status).toBe(0);
  }, 20_000);
});

describe('integration: specialists list --live', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('prints no sessions message and exits 0 when no running tmux jobs exist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-list-live-'));
    await mkdir(join(tempDir, '.specialists', 'jobs'), { recursive: true });

    const result = runCli(['list', '--live'], tempDir);

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

    const result = runCli(['list', '--live'], tempDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('job-a  sp-job-a-111111  running');
    expect(result.stdout).toContain('job-b  sp-job-b-222222  waiting');
  });

  it('keeps specialists list output unchanged when --live is not used', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-list-live-'));
    await writeSpecialist(tempDir, 'alpha-specialist');

    const result = runCli(['list'], tempDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Specialists (1)');
    expect(result.stdout).toContain('alpha-specialist');
    expect(result.stdout).not.toContain('No running tmux sessions found.');
  });
});
