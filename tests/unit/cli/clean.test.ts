import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mockSqliteClient: { listStatuses: () => any[] } | null = null;
vi.mock('../../../src/specialist/observability-sqlite.js', () => ({
  createObservabilitySqliteClient: () => mockSqliteClient,
}));

function createCompletedJob(jobsDirectory: string, id: string, startedAtMs: number, completedAtMs: number): void {
  const directoryPath = join(jobsDirectory, id);
  mkdirSync(directoryPath, { recursive: true });
  writeFileSync(join(directoryPath, 'status.json'), JSON.stringify({ id, specialist: 'tester', status: 'done', started_at_ms: startedAtMs, completed_at_ms: completedAtMs }), 'utf-8');
  writeFileSync(join(directoryPath, 'result.txt'), 'output', 'utf-8');
  const time = new Date(completedAtMs);
  utimesSync(directoryPath, time, time);
  utimesSync(join(directoryPath, 'status.json'), time, time);
  utimesSync(join(directoryPath, 'result.txt'), time, time);
}

describe('clean CLI — run()', () => {
  const originalCwd = process.cwd();
  const originalArgv = [...process.argv];
  const originalTtl = process.env.SPECIALISTS_JOB_TTL_DAYS;
  let testRoot: string;
  let jobsDirectory: string;

  function syncMockDbFromJobsDirectory(): void {
    mockSqliteClient = {
      listStatuses: () => readdirSync(jobsDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => JSON.parse(readFileSync(join(jobsDirectory, entry.name, 'status.json'), 'utf-8'))),
    };
  }

  beforeEach(() => {
    testRoot = join(tmpdir(), `clean-cli-${crypto.randomUUID()}`);
    jobsDirectory = join(testRoot, '.specialists', 'jobs');
    mkdirSync(jobsDirectory, { recursive: true });
    process.chdir(testRoot);
    delete process.env.SPECIALISTS_JOB_TTL_DAYS;
    delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    syncMockDbFromJobsDirectory();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.argv = [...originalArgv];
    if (originalTtl === undefined) delete process.env.SPECIALISTS_JOB_TTL_DAYS;
    else process.env.SPECIALISTS_JOB_TTL_DAYS = originalTtl;
    delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    rmSync(testRoot, { recursive: true, force: true });
    mockSqliteClient = null;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function invokeClean(args: string[]): Promise<string[]> {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message: string) => { logs.push(String(message)); });
    process.argv = ['node', 'specialists', 'clean', ...args];
    const { run } = await import('../../../src/cli/clean.js');
    await run();
    return logs;
  }

  it('removes completed job directories older than TTL by default', async () => {
    const now = Date.now();
    createCompletedJob(jobsDirectory, 'old-job', now - 8 * 86_400_000, now - 8 * 86_400_000);
    createCompletedJob(jobsDirectory, 'fresh-job', now, now);
    syncMockDbFromJobsDirectory();

    await invokeClean([]);

    expect(existsSync(join(jobsDirectory, 'old-job'))).toBe(false);
    expect(existsSync(join(jobsDirectory, 'fresh-job'))).toBe(true);
  });

  it('--all removes every completed job directory regardless of age', async () => {
    const now = Date.now();
    createCompletedJob(jobsDirectory, 'one', now, now);
    createCompletedJob(jobsDirectory, 'two', now - 1_000, now - 1_000);
    syncMockDbFromJobsDirectory();

    await invokeClean(['--all']);

    expect(existsSync(join(jobsDirectory, 'one'))).toBe(false);
    expect(existsSync(join(jobsDirectory, 'two'))).toBe(false);
  });

  it('--keep keeps only the N most recent completed jobs', async () => {
    const now = Date.now();
    createCompletedJob(jobsDirectory, 'job-1', now - 3_000, now - 3_000);
    createCompletedJob(jobsDirectory, 'job-2', now - 2_000, now - 2_000);
    createCompletedJob(jobsDirectory, 'job-3', now - 1_000, now - 1_000);
    syncMockDbFromJobsDirectory();

    await invokeClean(['--keep', '1']);

    expect(existsSync(join(jobsDirectory, 'job-3'))).toBe(true);
    expect(existsSync(join(jobsDirectory, 'job-2'))).toBe(false);
    expect(existsSync(join(jobsDirectory, 'job-1'))).toBe(false);
  });

  it('--dry-run prints plan and does not delete directories', async () => {
    const now = Date.now();
    createCompletedJob(jobsDirectory, 'old-job', now - 8 * 86_400_000, now - 8 * 86_400_000);
    syncMockDbFromJobsDirectory();

    const logs = await invokeClean(['--dry-run']);

    expect(existsSync(join(jobsDirectory, 'old-job'))).toBe(true);
    expect(logs.join('\n')).toContain('Would remove:');
    expect(logs.join('\n')).toContain('old-job');
  });

  it('prints a freed size summary after deletion', async () => {
    const now = Date.now();
    createCompletedJob(jobsDirectory, 'old-job', now - 8 * 86_400_000, now - 8 * 86_400_000);
    syncMockDbFromJobsDirectory();
    const sizeBefore = statSync(join(jobsDirectory, 'old-job', 'result.txt')).size;

    const logs = await invokeClean([]);
    expect(logs.join('\n')).toContain('Removed 1 job directory');
    expect(logs.join('\n')).toContain('freed');
    expect(sizeBefore).toBeGreaterThan(0);
  });

  it('ignores running jobs even with --all', async () => {
    const runningDir = join(jobsDirectory, 'running-job');
    mkdirSync(runningDir, { recursive: true });
    writeFileSync(join(runningDir, 'status.json'), JSON.stringify({ id: 'running-job', specialist: 'tester', status: 'running', started_at_ms: Date.now() }), 'utf-8');
    syncMockDbFromJobsDirectory();

    await invokeClean(['--all']);

    expect(existsSync(runningDir)).toBe(true);
    expect(readFileSync(join(runningDir, 'status.json'), 'utf-8')).toContain('running');
  });

  it('never removes directories that contain sqlite database artifacts', async () => {
    const now = Date.now();
    createCompletedJob(jobsDirectory, 'protected-db', now - 8 * 86_400_000, now - 8 * 86_400_000);
    syncMockDbFromJobsDirectory();
    writeFileSync(join(jobsDirectory, 'protected-db', 'observability.db'), 'sqlite', 'utf-8');
    writeFileSync(join(jobsDirectory, 'protected-db', 'observability.db-wal'), 'wal', 'utf-8');
    writeFileSync(join(jobsDirectory, 'protected-db', 'observability.db-shm'), 'shm', 'utf-8');

    await invokeClean(['--all']);

    expect(existsSync(join(jobsDirectory, 'protected-db'))).toBe(true);
  });

  it('uses file fallback only when env enabled and DB empty', async () => {
    mockSqliteClient = { listStatuses: () => [] };
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    const now = Date.now();
    createCompletedJob(jobsDirectory, 'fallback-job', now - 8 * 86_400_000, now - 8 * 86_400_000);

    await invokeClean(['--all']);

    expect(existsSync(join(jobsDirectory, 'fallback-job'))).toBe(false);
  });
});
