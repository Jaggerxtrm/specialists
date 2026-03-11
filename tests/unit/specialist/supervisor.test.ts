// tests/unit/specialist/supervisor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  utimesSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../../../src/specialist/supervisor.js';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

function makeMockRunner(output = 'test output', model = 'haiku', backend = 'anthropic') {
  return {
    run: vi.fn().mockResolvedValue({
      output,
      model,
      backend,
      durationMs: 100,
      specialistVersion: '1.0.0',
      beadId: undefined,
    }),
  } as any;
}

function makeRunOptions(name = 'test-specialist') {
  return { name, prompt: 'do something' };
}

describe('Supervisor', () => {
  let tmpDir: string;
  let jobsDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'supervisor-test-'));
    jobsDir = join(tmpDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('run() creates job directory with status.json, events.jsonl, result.txt', async () => {
    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    const id = await sup.run();

    const jobDir = join(jobsDir, id);
    expect(existsSync(join(jobDir, 'status.json'))).toBe(true);
    expect(existsSync(join(jobDir, 'events.jsonl'))).toBe(true);
    expect(existsSync(join(jobDir, 'result.txt'))).toBe(true);
  });

  it('status.json has all expected fields after successful run', async () => {
    const sup = new Supervisor({
      jobsDir,
      runner: makeMockRunner('output text', 'claude-haiku', 'anthropic'),
      runOptions: makeRunOptions('my-specialist'),
    });
    const id = await sup.run();

    const status: SupervisorStatus = JSON.parse(
      readFileSync(join(jobsDir, id, 'status.json'), 'utf-8'),
    );
    expect(status.id).toBe(id);
    expect(status.specialist).toBe('my-specialist');
    expect(status.status).toBe('done');
    expect(status.pid).toBe(process.pid);
    expect(status.started_at_ms).toBeGreaterThan(0);
    expect(status.elapsed_s).toBeGreaterThanOrEqual(0);
    expect(status.model).toBe('claude-haiku');
    expect(status.backend).toBe('anthropic');
    expect(status.bead_id).toBeUndefined();
  });

  it('result.txt contains the runner output string', async () => {
    const sup = new Supervisor({
      jobsDir,
      runner: makeMockRunner('hello world output'),
      runOptions: makeRunOptions(),
    });
    const id = await sup.run();

    expect(readFileSync(join(jobsDir, id, 'result.txt'), 'utf-8')).toBe('hello world output');
  });

  it('events.jsonl contains at least one valid JSON line', async () => {
    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    const id = await sup.run();

    const content = readFileSync(join(jobsDir, id, 'events.jsonl'), 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('.specialists/ready/<id> marker is created on success', async () => {
    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    const id = await sup.run();

    const readyMarker = join(jobsDir, '..', 'ready', id);
    expect(existsSync(readyMarker)).toBe(true);
  });

  it('on runner error: status=error, error field set, no result.txt written', async () => {
    const runner = {
      run: vi.fn().mockRejectedValue(new Error('backend exploded')),
    } as any;
    const sup = new Supervisor({ jobsDir, runner, runOptions: makeRunOptions() });

    await expect(sup.run()).rejects.toThrow('backend exploded');

    // Find the single job directory that was created
    const entries = readdirSync(jobsDir);
    expect(entries).toHaveLength(1);
    const id = entries[0];

    const status: SupervisorStatus = JSON.parse(
      readFileSync(join(jobsDir, id, 'status.json'), 'utf-8'),
    );
    expect(status.status).toBe('error');
    expect(status.error).toBe('backend exploded');
    expect(existsSync(join(jobsDir, id, 'result.txt'))).toBe(false);
  });

  it('GC: job dirs older than TTL are deleted on next run', async () => {
    // Create an "old" job directory with mtime 8 days ago (> default 7-day TTL)
    const oldId = 'oldabc';
    const oldJobDir = join(jobsDir, oldId);
    mkdirSync(oldJobDir, { recursive: true });
    const oldStatus: SupervisorStatus = {
      id: oldId,
      specialist: 'x',
      status: 'done',
      started_at_ms: 0,
    };
    writeFileSync(join(oldJobDir, 'status.json'), JSON.stringify(oldStatus));

    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    utimesSync(oldJobDir, eightDaysAgo, eightDaysAgo);

    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    await sup.run();

    expect(existsSync(oldJobDir)).toBe(false);
  });

  it('crash recovery: status=running with dead PID gets marked error', async () => {
    const crashedId = 'crash1';
    const crashedDir = join(jobsDir, crashedId);
    mkdirSync(crashedDir, { recursive: true });

    const crashStatus: SupervisorStatus = {
      id: crashedId,
      specialist: 'test',
      status: 'running',
      started_at_ms: Date.now() - 10_000,
      pid: 999_999_999, // Impossibly large PID — always dead
    };
    writeFileSync(join(crashedDir, 'status.json'), JSON.stringify(crashStatus));

    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    await sup.run();

    const recovered: SupervisorStatus = JSON.parse(
      readFileSync(join(crashedDir, 'status.json'), 'utf-8'),
    );
    expect(recovered.status).toBe('error');
    expect(recovered.error).toBe('Process crashed or was killed');
  });

  it('listJobs() returns all jobs sorted newest-first', () => {
    const olderStatus: SupervisorStatus = {
      id: 'older1',
      specialist: 'x',
      status: 'done',
      started_at_ms: 1000,
    };
    const newerStatus: SupervisorStatus = {
      id: 'newer2',
      specialist: 'x',
      status: 'done',
      started_at_ms: 2000,
    };

    mkdirSync(join(jobsDir, 'older1'), { recursive: true });
    writeFileSync(join(jobsDir, 'older1', 'status.json'), JSON.stringify(olderStatus));
    mkdirSync(join(jobsDir, 'newer2'), { recursive: true });
    writeFileSync(join(jobsDir, 'newer2', 'status.json'), JSON.stringify(newerStatus));

    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    const jobs = sup.listJobs();

    expect(jobs).toHaveLength(2);
    expect(jobs[0].id).toBe('newer2');
    expect(jobs[1].id).toBe('older1');
  });

  it('readStatus() returns null for unknown id', () => {
    const sup = new Supervisor({ jobsDir, runner: makeMockRunner(), runOptions: makeRunOptions() });
    expect(sup.readStatus('nonexistent')).toBeNull();
  });
});
