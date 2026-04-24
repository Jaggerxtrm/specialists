import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_ENV = { ...process.env };

describe('db CLI — setup', () => {
  let sandboxRoot: string;
  let dbPath: string;

  beforeEach(() => {
    sandboxRoot = join(tmpdir(), `specialists-db-${crypto.randomUUID()}`);
    mkdirSync(sandboxRoot, { recursive: true });
    execFileSync('git', ['init'], { cwd: sandboxRoot, stdio: 'ignore' });
    process.chdir(sandboxRoot);

    process.env.SPECIALISTS_DB_SETUP_FORCE = '1';
    delete process.env.XDG_DATA_HOME;
    dbPath = join(sandboxRoot, '.specialists', 'db', 'observability.db');
  });

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    process.env = { ...ORIGINAL_ENV };
    rmSync(sandboxRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('creates a shared git-root db at .specialists/db/observability.db', async () => {
    const nestedDir = join(sandboxRoot, 'worktrees', 'feature-a');
    mkdirSync(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(String(line));
    });

    const { run } = await import('../../../src/cli/db.js');
    await run(['setup']);

    const dbPath = join(sandboxRoot, '.specialists', 'db', 'observability.db');
    expect(existsSync(dbPath)).toBe(true);
    expect(logs.join('\n')).toContain(dbPath);

    const mode = statSync(dbPath).mode & 0o777;
    expect(mode).toBe(0o644);

    const gitignore = readFileSync(join(sandboxRoot, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.specialists/db/*.db');
    expect(gitignore).toContain('.specialists/db/*.db-wal');
    expect(gitignore).toContain('.specialists/db/*.db-shm');
  });

  it('uses XDG_DATA_HOME when provided', async () => {
    const xdgHome = join(sandboxRoot, '.xdg-data');
    mkdirSync(xdgHome, { recursive: true });
    process.env.XDG_DATA_HOME = xdgHome;

    const { run } = await import('../../../src/cli/db.js');
    await run(['setup']);

    const xdgDbPath = join(xdgHome, 'specialists', 'observability.db');
    expect(existsSync(xdgDbPath)).toBe(true);
    const mode = statSync(xdgDbPath).mode & 0o777;
    expect(mode).toBe(0o644);
  });

  it('prints stats from aggregated metrics table', async () => {
    const { run } = await import('../../../src/cli/db.js');
    await run(['setup']);

    const db = new Database(dbPath);
    db.run(
      `INSERT INTO specialist_jobs (job_id, specialist, status, status_json, updated_at_ms) VALUES (?, ?, ?, ?, ?)`,
      ['job-stats', 'executor', 'done', JSON.stringify({ id: 'job-stats', specialist: 'executor', status: 'done' }), 100],
    );
    const now = Date.now();
    db.run(
      `INSERT INTO specialist_job_metrics (job_id, specialist, model, status, chain_kind, chain_id, bead_id, node_id, epic_id, started_at_ms, completed_at_ms, elapsed_ms, total_turns, total_tools, tool_call_counts_json, token_trajectory_json, context_trajectory_json, stall_gaps_json, run_complete_json, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['job-stats', 'executor', 'gpt-5', 'done', 'chain', 'chain-1', 'bead-1', null, null, now - 20, now - 10, 10, 1, 2, '{}', '[]', '[]', '[]', null, now],
    );

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => { logs.push(String(line)); });
    await run(['stats', '--spec', 'executor', '--model', 'gpt-*', '--since', '1d', '--format', 'json']);

    const parsed = JSON.parse(logs.at(-1) ?? '{}') as { rows?: Array<{ job_id: string }>; count?: number };
    expect(parsed.count).toBe(1);
    expect(parsed.rows?.[0]?.job_id).toBe('job-stats');
    db.close();
  });
});
