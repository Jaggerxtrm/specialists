import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('doctor CLI — run()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function runDoctor(): Promise<{ combined: string }> {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => output.push(msg ?? ''));
    const { run } = await import('../../../src/cli/doctor.js');
    await run();
    return { combined: output.join('\n') };
  }

  it('prints specialists doctor header', async () => {
    const { combined } = await runDoctor();
    expect(combined).toContain('specialists doctor');
  });

  it('prints all section headers', async () => {
    const { combined } = await runDoctor();
    expect(combined).toContain('pi');
    expect(combined).toContain('beads');
    expect(combined).toContain('xtrm-tools');
    expect(combined).toContain('Claude Code hooks');
    expect(combined).toContain('MCP');
    expect(combined).toContain('Skill drift');
    expect(combined).toContain('Managed mirrors');
    expect(combined).toContain('Background jobs');
  });

  it('prints a summary result line', async () => {
    const { combined } = await runDoctor();
    const hasSummary =
      combined.includes('All checks passed') ||
      combined.includes('Some checks failed');
    expect(hasSummary).toBe(true);
  });

  it('checks for both expected hooks', async () => {
    const { combined } = await runDoctor();
    const hooks = [
      'specialists-complete.mjs',
      'specialists-session-start.mjs',
    ];
    for (const hook of hooks) {
      expect(combined, `missing hook check: ${hook}`).toContain(hook);
    }
  });

  it('mentions managed mirror fixes', async () => {
    const { combined } = await runDoctor();
    expect(combined).toContain('specialists init --sync-defaults');
  });

  it('mentions fix hints for failures', async () => {
    const { combined } = await runDoctor();
    const hasHintOrPass =
      combined.includes('→ fix:') ||
      combined.includes('All checks passed');
    expect(hasHintOrPass).toBe(true);
  });
});

describe('doctor process cleanup helpers', () => {
  let rootDir: string;
  let jobsDir: string;

  beforeEach(() => {
    rootDir = join(tmpdir(), `doctor-process-${crypto.randomUUID()}`);
    jobsDir = join(rootDir, '.specialists', 'jobs');
    mkdirSync(jobsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function writeStatus(jobId: string, status: { status: string; pid?: number }): string {
    const jobDir = join(jobsDir, jobId);
    mkdirSync(jobDir, { recursive: true });
    const statusPath = join(jobDir, 'status.json');
    writeFileSync(statusPath, JSON.stringify(status), 'utf8');
    return statusPath;
  }

  it('cleanupProcesses marks only zombie jobs when not dry-run', async () => {
    writeStatus('alive-job', { status: 'running', pid: 101 });
    writeStatus('zombie-job', { status: 'running', pid: 202 });

    vi.spyOn(process, 'kill').mockImplementation((pid: number | bigint) => {
      if (pid === 202) throw new Error('ESRCH');
      return true;
    });

    const { cleanupProcesses } = await import('../../../src/cli/doctor.js');
    const result = cleanupProcesses(jobsDir, false);

    expect(result).toMatchObject({ total: 2, running: 1, zombies: 1, updated: 1 });

    const zombieStatus = JSON.parse(readFileSync(join(jobsDir, 'zombie-job', 'status.json'), 'utf8')) as { status: string };
    const aliveStatus = JSON.parse(readFileSync(join(jobsDir, 'alive-job', 'status.json'), 'utf8')) as { status: string };
    expect(zombieStatus.status).toBe('error');
    expect(aliveStatus.status).toBe('running');
  });

  it('cleanupProcesses dry-run does not rewrite status files', async () => {
    const statusPath = writeStatus('zombie-job', { status: 'running', pid: 303 });
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    const { cleanupProcesses } = await import('../../../src/cli/doctor.js');
    const result = cleanupProcesses(jobsDir, true);

    expect(result).toMatchObject({ zombies: 1, updated: 0 });
    const raw = readFileSync(statusPath, 'utf8');
    expect(raw).toContain('"status":"running"');
  });

  it('setStatusError writes JSON status=error', async () => {
    const statusPath = writeStatus('job', { status: 'running', pid: 1 });
    const { setStatusError } = await import('../../../src/cli/doctor.js');

    setStatusError(statusPath);

    const status = JSON.parse(readFileSync(statusPath, 'utf8')) as { status: string };
    expect(status.status).toBe('error');
  });

  it('renderProcessSummary returns deterministic summary text', async () => {
    const { renderProcessSummary } = await import('../../../src/cli/doctor.js');

    expect(renderProcessSummary({ total: 3, running: 2, zombies: 0, updated: 0, zombieJobIds: [] }, false))
      .toContain('3 jobs checked, 2 currently running');

    expect(renderProcessSummary({ total: 3, running: 1, zombies: 2, updated: 0, zombieJobIds: ['a', 'b'] }, true))
      .toContain('2 zombie jobs found (0 would be marked error)');
  });

  it('parseVersionTuple and compareVersions handle edge cases', async () => {
    const { parseVersionTuple, compareVersions } = await import('../../../src/cli/doctor.js');

    expect(parseVersionTuple('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersionTuple('1.2.3-beta.1')).toEqual([1, 2, 3]);
    expect(parseVersionTuple('1.2')).toBeNull();
    expect(parseVersionTuple('foo')).toBeNull();

    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
    expect(compareVersions('1.1.9', '1.2.0')).toBe(-1);
    expect(compareVersions('invalid', '1.2.0')).toBe(0);
  });
});
