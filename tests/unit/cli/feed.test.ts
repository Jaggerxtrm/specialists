import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Use the actual .specialists/jobs path that feed.ts expects
const specialistsDir = join(process.cwd(), '.specialists');
const jobsDir = join(specialistsDir, 'jobs');

describe('feed CLI', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    // Clean and recreate the jobs directory
    if (existsSync(jobsDir)) rmSync(jobsDir, { recursive: true, force: true });
    mkdirSync(jobsDir, { recursive: true });
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (existsSync(jobsDir)) rmSync(jobsDir, { recursive: true, force: true });
    if (existsSync(specialistsDir)) rmSync(specialistsDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function createJobDir(jobId: string, specialist: string, events: any[], status?: any) {
    const jobDir = join(jobsDir, jobId);
    mkdirSync(jobDir, { recursive: true });

    writeFileSync(
      join(jobDir, 'events.jsonl'),
      events.map((e) => JSON.stringify(e)).join('\n'),
      'utf-8'
    );

    writeFileSync(
      join(jobDir, 'status.json'),
      JSON.stringify({
        id: jobId,
        specialist,
        status: 'done',
        started_at_ms: Date.now() - 10000,
        ...(status || {}),
      }),
      'utf-8'
    );
  }

  it('prints snapshot when no jobs directory exists', async () => {
    // Remove the jobs dir
    rmSync(jobsDir, { recursive: true, force: true });
    rmSync(specialistsDir, { recursive: true, force: true });
    
    process.argv = ['node', 'specialists', 'feed'];
    
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(logs.join('\n')).toContain('No jobs directory');
  });

  it('shows appropriate message when jobs directory is empty', async () => {
    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(logs.join('\n')).toContain('No events found');
  });

  it('outputs events in snapshot mode', async () => {
    createJobDir('job1', 'test', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 42 },
    ]);

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const combined = logs.join('\n');
    expect(combined).toContain('DONE');
    expect(combined).toContain('COMPLETE');
  });

  it('outputs JSON with --json flag', async () => {
    createJobDir('job1', 'test', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 5 },
    ]);

    process.argv = ['node', 'specialists', 'feed', '--json'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    // Output should be valid JSON
    for (const line of logs) {
      if (line.trim()) {
        expect(() => JSON.parse(line)).not.toThrow();
        const parsed = JSON.parse(line);
        expect(parsed.type).toBe('run_complete');
      }
    }
  });

  it('filters by --job id', async () => {
    createJobDir('job1', 'test1', [
      { t: Date.now() - 1000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 },
    ]);
    createJobDir('job2', 'test2', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 2 },
    ]);

    process.argv = ['node', 'specialists', 'feed', '--job', 'job1'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const combined = logs.join('\n');
    // Should show the job1 event
    expect(combined).toContain('DONE');
    expect(combined).toContain('COMPLETE');
    // Should NOT contain job2 (only 1 event shown)
    expect(logs.length).toBe(1);
  });

  it('exits immediately in follow mode when all jobs are complete', async () => {
    createJobDir('job1', 'test', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 },
    ]);

    process.argv = ['node', 'specialists', 'feed', '-f'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    // Should exit immediately and show DONE event
    const combined = logs.join('\n');
    expect(combined).toContain('DONE');
    expect(combined).toContain('COMPLETE');
  });
});