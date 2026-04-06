import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const hasTmux = spawnSync('which', ['tmux'], { stdio: 'ignore' }).status === 0;

function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...env, NO_COLOR: '1' },
  });
}

async function writeSpecialist(tempDir: string, name: string, model = 'invalid/model') {
  await mkdir(join(tempDir, 'specialists'), { recursive: true });
  await writeFile(join(tempDir, 'specialists', `${name}.specialist.json`), [
    'specialist:',
    '  metadata:',
    `    name: ${name}`,
    '    version: 1.0.0',
    '    description: test specialist',
    '    category: test',
    '  execution:',
    `    model: ${model}`,
    '    timeout_ms: 1000',
    '    permission_required: READ_ONLY',
    '  prompt:',
    '    task_template: "Do $prompt"',
  ].join('\n'));
}

async function readStatus(cwd: string, jobId: string): Promise<SupervisorStatus> {
  const raw = await readFile(join(cwd, '.specialists', 'jobs', jobId, 'status.json'), 'utf-8');
  return JSON.parse(raw) as SupervisorStatus;
}

async function waitFor<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 20_000,
  intervalMs = 200,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;

  while (Date.now() < deadline) {
    last = await producer();
    if (predicate(last)) return last;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return producer();
}

function tmuxHasSession(sessionName: string): boolean {
  return spawnSync('tmux', ['has-session', '-t', sessionName], { stdio: 'ignore' }).status === 0;
}

describe('integration: specialists run', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('rejects using --prompt and --bead together through the real CLI boundary', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-'));

    const result = runCli(['run', 'code-review', '--prompt', 'hello', '--bead', 'unitAI-55d'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error: use either --prompt or --bead, not both.');
  });

  it('rejects missing prompt, stdin, and bead through the real CLI boundary', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-'));

    const result = runCli(['run', 'code-review'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error: provide --prompt, pipe stdin, or use --bead <id>.');
  });

  it('fails early when bead lookup cannot be resolved before any pi session starts', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-'));
    await mkdir(join(tempDir, '.specialists'), { recursive: true });
    await mkdir(join(tempDir, 'specialists'), { recursive: true });
    await writeFile(join(tempDir, 'specialists', 'code-review.specialist.json'), [
      'specialist:',
      '  metadata:',
      '    name: code-review',
      '    version: 1.0.0',
      '    description: test specialist',
      '    category: test',
      '  execution:',
      '    model: gemini',
      '    timeout_ms: 1000',
      '    permission_required: READ_ONLY',
      '  prompt:',
      '    task_template: "Do $prompt"',
    ].join('\n'));

    const result = runCli(['run', 'code-review', '--bead', 'unitAI-missing'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unable to read bead 'unitAI-missing' via bd show --json");
  });

  (hasTmux ? it : it.skip)('uses tmux for --background, prints job id, and cleans the tmux session after exit', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-bg-tmux-'));
    await mkdir(join(tempDir, '.specialists', 'jobs'), { recursive: true });
    await writeSpecialist(tempDir, 'nonexistent');

    const result = runCli(['run', 'nonexistent', '--prompt', 'hello', '--background', '--no-beads', '--no-bead-notes'], tempDir);

    expect(result.status).toBe(0);
    const jobId = result.stdout.trim();
    expect(jobId).toMatch(/^[a-f0-9]{6}$/);

    const statusWithTmux = await waitFor(
      () => readStatus(tempDir, jobId),
      status => typeof status.tmux_session === 'string' && status.tmux_session.length > 0,
      10_000,
    );

    expect(statusWithTmux.tmux_session).toMatch(/^sp-nonexistent-/);
    const tmuxSession = statusWithTmux.tmux_session as string;

    expect(await waitFor(
      async () => tmuxHasSession(tmuxSession),
      exists => exists,
      5_000,
    )).toBe(true);

    await waitFor(
      () => readStatus(tempDir, jobId),
      status => status.status === 'done' || status.status === 'error',
      30_000,
    );

    expect(await waitFor(
      async () => tmuxHasSession(tmuxSession),
      exists => !exists,
      10_000,
    )).toBe(false);
  }, 45_000);

  it('falls back to detached spawn when tmux is unavailable, prints job id, and does not set tmux session', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-bg-fallback-'));
    await mkdir(join(tempDir, '.specialists', 'jobs'), { recursive: true });
    await writeSpecialist(tempDir, 'fallback-no-tmux');

    const bunDir = dirname(process.execPath);
    const beforeFallbackTmuxSessions = hasTmux
      ? spawnSync('tmux', ['ls'], { encoding: 'utf-8' }).stdout
      : '';

    const result = runCli(
      ['run', 'fallback-no-tmux', '--prompt', 'hello', '--background', '--no-beads', '--no-bead-notes'],
      tempDir,
      { ...process.env, PATH: bunDir },
    );

    expect(result.status).toBe(0);
    const jobId = result.stdout.trim();
    expect(jobId).toMatch(/^[a-f0-9]{6}$/);

    const status = await waitFor(
      () => readStatus(tempDir, jobId),
      s => s.status === 'starting' || s.status === 'running' || s.status === 'error' || s.status === 'done',
      5_000,
    );

    expect(status.tmux_session).toBeUndefined();

    if (hasTmux) {
      const afterFallbackTmuxSessions = spawnSync('tmux', ['ls'], { encoding: 'utf-8' }).stdout;
      expect(afterFallbackTmuxSessions).not.toContain('sp-fallback-no-tmux-');
      expect(beforeFallbackTmuxSessions).not.toContain('sp-fallback-no-tmux-');
    }
  }, 20_000);
});

// ── poll_specialist removal (z0mq.8) ─────────────────────────────────────────
describe('z0mq.8: poll_specialist removal', () => {
  const repoSrc = resolve(import.meta.dirname, '../../..', 'src');

  it('poll_specialist is not referenced in any source file', async () => {
    const result = spawnSync('grep', ['-r', 'poll_specialist', repoSrc], { encoding: 'utf-8' });
    // grep exits 1 when no matches found — that is the expected outcome
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('start_specialist tool description mentions feed_specialist not poll_specialist', async () => {
    const toolSrc = await readFile(
      resolve(repoSrc, 'tools/specialist/start_specialist.tool.ts'),
      'utf-8',
    );
    expect(toolSrc).toContain('feed_specialist');
    expect(toolSrc).not.toContain('poll_specialist');
  });
});
