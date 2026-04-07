import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveObservabilityDbLocation } from '../../../src/specialist/observability-db.js';

let tempRoot: string;
let specialistsDir: string;
let jobsDir: string;

function createJob(jobId: string, status: 'starting' | 'running' | 'waiting' | 'done' | 'error', withResult = false): void {
  const jobDir = join(jobsDir, jobId);
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(
    join(jobDir, 'status.json'),
    JSON.stringify({
      id: jobId,
      specialist: 'bug-hunt',
      status,
      started_at_ms: Date.now() - 1000,
      metrics: {
        turns: 2,
        tool_calls: 3,
        finish_reason: 'stop',
        exit_reason: status === 'done' ? 'agent_end' : undefined,
        token_usage: {
          total_tokens: 99,
          cost_usd: 0.00123,
        },
      },
    }),
    'utf-8',
  );

  if (withResult) {
    writeFileSync(join(jobDir, 'result.txt'), 'last completed output', 'utf-8');
  }
}

async function seedSqliteResult(jobId: string, status: Record<string, unknown>, output: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require('bun:sqlite');
    const location = resolveObservabilityDbLocation(tempRoot);
    mkdirSync(location.dbDirectory, { recursive: true });
    const db = new Database(location.dbPath);
    const { initSchema } = await import('../../../src/specialist/observability-sqlite.js');
    initSchema(db);

    db.run(
      `INSERT INTO specialist_jobs (job_id, specialist, status, status_json, updated_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [jobId, String(status.specialist ?? 'bug-hunt'), String(status.status ?? 'done'), JSON.stringify(status), Date.now()]
    );

    db.run(
      `INSERT INTO specialist_results (job_id, output, updated_at_ms)
       VALUES (?, ?, ?)`,
      [jobId, output, Date.now()]
    );

    db.close();
    return true;
  } catch {
    return false;
  }
}

describe('result CLI', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'sp-result-test-'));
    specialistsDir = join(tempRoot, '.specialists');
    jobsDir = join(specialistsDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
    vi.doUnmock('../../../src/specialist/observability-sqlite.js');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('prints last completed output when job is running but result.txt exists', async () => {
    createJob('job1', 'running', true);
    process.argv = ['node', 'specialists', 'result', 'job1'];

    const stderrWrites: string[] = [];
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderrWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/result.js');
    await run();

    expect(stdoutWrites.join('')).toContain('last completed output');
    expect(stderrWrites.join('')).toContain('Showing last completed output');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('prints JSON payload with metrics when --json is set', async () => {
    createJob('job-json', 'done', true);
    process.argv = ['node', 'specialists', 'result', 'job-json', '--json'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });

    const { run } = await import('../../../src/cli/result.js');
    await run();

    const payload = JSON.parse(logs.join('\n')) as {
      job: { id: string; metrics: { turns: number; tool_calls: number; token_usage: { total_tokens: number } } };
      output: string;
      error: string | null;
    };

    expect(payload.job.id).toBe('job-json');
    expect(payload.job.metrics.turns).toBe(2);
    expect(payload.job.metrics.tool_calls).toBe(3);
    expect(payload.job.metrics.token_usage.total_tokens).toBe(99);
    expect(payload.output).toContain('last completed output');
    expect(payload.error).toBeNull();
  });

  it('reads result from SQLite when DB exists', async () => {
    createJob('job-sqlite', 'done', false);
    const seeded = await seedSqliteResult(
      'job-sqlite',
      { id: 'job-sqlite', specialist: 'bug-hunt', status: 'done', started_at_ms: Date.now() - 1000 },
      'sqlite output'
    );
    if (!seeded) return;

    process.argv = ['node', 'specialists', 'result', 'job-sqlite'];

    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });

    const { run } = await import('../../../src/cli/result.js');
    await run();

    expect(stdoutWrites.join('')).toContain('sqlite output');
  });

  it('returns SQLite-backed output in --json mode', async () => {
    createJob('job-sqlite-json', 'done', true);
    const seeded = await seedSqliteResult(
      'job-sqlite-json',
      { id: 'job-sqlite-json', specialist: 'bug-hunt', status: 'done', started_at_ms: Date.now() - 1000 },
      'sqlite json output'
    );
    if (!seeded) return;

    process.argv = ['node', 'specialists', 'result', 'job-sqlite-json', '--json'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });

    const { run } = await import('../../../src/cli/result.js');
    await run();

    const payload = JSON.parse(logs.join('\n')) as { output: string };
    expect(payload.output).toContain('sqlite json output');
  });

  it('falls back to result.txt when SQLite read fails', async () => {
    createJob('job-fallback', 'done', true);

    vi.resetModules();
    vi.doMock('../../../src/specialist/observability-sqlite.js', () => ({
      createObservabilitySqliteClient: () => ({
        readResult: () => {
          throw new Error('sqlite read failed');
        },
        close: () => {},
      }),
    }));

    process.argv = ['node', 'specialists', 'result', 'job-fallback'];

    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    });

    const { run } = await import('../../../src/cli/result.js');
    await run();

    expect(stdoutWrites.join('')).toContain('last completed output');
  });

  it('exits with code 1 when job is running and result.txt does not exist', async () => {
    createJob('job2', 'running', false);
    process.argv = ['node', 'specialists', 'result', 'job2'];

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { run } = await import('../../../src/cli/result.js');
    await expect(run()).rejects.toThrow('exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
