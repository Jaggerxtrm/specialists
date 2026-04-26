import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolveObservabilityDbLocation } from '../../../src/specialist/observability-db.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

function createJob(rootDir: string, jobId: string, eventCount = 0): void {
  const jobDir = join(rootDir, '.specialists', 'jobs', jobId);
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(
    join(jobDir, 'status.json'),
    JSON.stringify({
      id: jobId,
      specialist: 'explorer',
      status: 'running',
      model: 'anthropic/claude-haiku-4-5',
      backend: 'anthropic',
      elapsed_s: 83,
      bead_id: 'unitAI-tv3',
      started_at_ms: Date.now() - 83_000,
      session_file: '/tmp/session.jsonl',
      metrics: {
        turns: 4,
        tool_calls: 7,
        finish_reason: 'stop',
        exit_reason: 'agent_end',
        token_usage: {
          total_tokens: 1234,
          cost_usd: 0.042,
        },
      },
    }),
    'utf-8',
  );

  if (eventCount > 0) {
    const lines = Array.from({ length: eventCount }, (_, idx) => JSON.stringify({ t: idx, type: 'tool_start' }));
    writeFileSync(join(jobDir, 'events.jsonl'), `${lines.join('\n')}\n`, 'utf-8');
  }
}

async function seedSqliteStatus(rootDir: string, jobId: string, status: Record<string, unknown>, events: any[] = []): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require('bun:sqlite');
    const location = resolveObservabilityDbLocation(rootDir);
    mkdirSync(location.dbDirectory, { recursive: true });
    const db = new Database(location.dbPath);
    const { initSchema } = await import('../../../src/specialist/observability-sqlite.js');
    initSchema(db);

    db.run(
      `INSERT INTO specialist_jobs (job_id, specialist, status, status_json, updated_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [jobId, String(status.specialist ?? 'unknown'), String(status.status ?? 'running'), JSON.stringify(status), Date.now()]
    );

    for (let index = 0; index < events.length; index += 1) {
      const event = { ...events[index], seq: index + 1 };
      db.run(
        `INSERT INTO specialist_events (job_id, seq, specialist, bead_id, t, type, event_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [jobId, event.seq, String(status.specialist ?? 'unknown'), status.bead_id ?? null, Number(event.t ?? Date.now()), String(event.type ?? 'tool_start'), JSON.stringify(event)]
      );
    }

    db.close();
    return true;
  } catch {
    return false;
  }
}

describe('status CLI — run()', () => {
  const TEST_TIMEOUT_MS = 20000;
  const originalArgv = process.argv;
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specialists-status-'));
    process.chdir(tempDir);
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    vi.doUnmock('../../../src/specialist/observability-sqlite.js');
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
  });

  it('completes without throwing', async () => {
    process.argv = ['node', 'specialists', 'status'];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { run } = await import('../../../src/cli/status.js');
    await expect(run()).resolves.toBeUndefined();
  }, TEST_TIMEOUT_MS);

  it('prints Specialists section header', async () => {
    process.argv = ['node', 'specialists', 'status'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('Specialists');
  }, TEST_TIMEOUT_MS);

  it('prints pi section header', async () => {
    process.argv = ['node', 'specialists', 'status'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('pi');
  }, TEST_TIMEOUT_MS);

  it('prints beads section header', async () => {
    process.argv = ['node', 'specialists', 'status'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('beads');
  }, TEST_TIMEOUT_MS);

  it('prints MCP section header', async () => {
    process.argv = ['node', 'specialists', 'status'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    const { run } = await import('../../../src/cli/status.js');
    await run();
    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('MCP');
  }, TEST_TIMEOUT_MS);

  it('shows single-job detail view with event count when --job is provided', async () => {
    createJob(tempDir, 'job-123', 3);
    process.argv = ['node', 'specialists', 'status', '--job', 'job-123'];

    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });

    const { run } = await import('../../../src/cli/status.js');
    await run();

    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('Job job-123');
    expect(clean).toContain('model        anthropic/claude-haiku-4-5');
    expect(clean).toContain('elapsed      1m23s');
    expect(clean).toContain('bead_id      unitAI-tv3');
    expect(clean).toContain('events       3');
    expect(clean).toContain('turns        4');
    expect(clean).toContain('tool_calls   7');
    expect(clean).toContain('finish       stop');
    expect(clean).toContain('exit_reason  agent_end');
    expect(clean).toContain('tokens       1234');
    expect(clean).toContain('cost_usd     $0.042000');
    expect(clean).not.toContain('Active Jobs');
  }, TEST_TIMEOUT_MS);

  it('returns single-job JSON payload when --json --job is provided', async () => {
    createJob(tempDir, 'job-abc', 2);
    process.argv = ['node', 'specialists', 'status', '--json', '--job', 'job-abc'];

    const writes: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      writes.push(String(msg ?? ''));
    });

    const { run } = await import('../../../src/cli/status.js');
    await run();

    const payload = JSON.parse(writes.join('\n')) as { job: { id: string; event_count: number; metrics?: { turns?: number } } };
    expect(payload.job.id).toBe('job-abc');
    expect(payload.job.event_count).toBe(2);
    expect(payload.job.metrics?.turns).toBe(4);
  }, TEST_TIMEOUT_MS);

  it('reads job status from SQLite when DB exists', async () => {
    createJob(tempDir, 'job-sqlite', 0);
    const seeded = await seedSqliteStatus(tempDir, 'job-sqlite', {
      id: 'job-sqlite',
      specialist: 'explorer',
      status: 'waiting',
      model: 'sqlite-model',
      backend: 'sqlite-backend',
      started_at_ms: Date.now() - 2000,
    }, [{ t: Date.now(), type: 'turn_summary', context_pct: 55.5 }]);
    if (!seeded) return;

    process.argv = ['node', 'specialists', 'status', '--job', 'job-sqlite'];
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });

    const { run } = await import('../../../src/cli/status.js');
    await run();

    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('status       waiting');
    expect(clean).toContain('model        sqlite-model');
    expect(clean).toContain('events       1');
  }, TEST_TIMEOUT_MS);

  it('falls back to status.json when SQLite is unavailable', async () => {
    createJob(tempDir, 'job-file-only', 1);
    process.argv = ['node', 'specialists', 'status', '--job', 'job-file-only'];

    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });

    const { run } = await import('../../../src/cli/status.js');
    await run();

    const clean = stripAnsi(output.join('\n'));
    expect(clean).toContain('status       running');
    expect(clean).toContain('events       1');
  }, TEST_TIMEOUT_MS);

  it('falls back to files when SQLite event query fails', async () => {
    createJob(tempDir, 'job-fallback', 2);

    vi.resetModules();
    vi.doMock('../../../src/specialist/observability-sqlite.js', async () => {
      const actual = await vi.importActual<typeof import('../../../src/specialist/observability-sqlite.js')>('../../../src/specialist/observability-sqlite.js');
      return {
        ...actual,
        createObservabilitySqliteClient: () => ({
          readEvents: () => {
            throw new Error('sqlite read failed');
          },
          close: () => {},
        }),
      };
    });

    process.argv = ['node', 'specialists', 'status', '--json', '--job', 'job-fallback'];

    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      output.push(String(msg ?? ''));
    });

    const { run } = await import('../../../src/cli/status.js');
    await run();

    const payload = JSON.parse(output.join('\n')) as { job: { event_count: number } };
    expect(payload.job.event_count).toBe(2);
  }, TEST_TIMEOUT_MS);
});
