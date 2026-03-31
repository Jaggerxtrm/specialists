import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { appendFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Use a temp directory — never the real .specialists/ which contains live job state
let tempRoot: string;
let specialistsDir: string;
let jobsDir: string;

describe('feed CLI', () => {
  const originalArgv = process.argv;

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  beforeEach(() => {
    // Use a fresh temp directory per test — never touch the real .specialists/
    tempRoot = mkdtempSync(join(tmpdir(), 'sp-feed-test-'));
    specialistsDir = join(tempRoot, '.specialists');
    jobsDir = join(specialistsDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
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
    expect(combined).toContain('job1');
    expect(combined).toContain('test');
    expect(combined).toContain('DONE');
    expect(combined).toContain('COMPLETE');
  });

  it('shows bead id in human-readable output when present', async () => {
    createJobDir('job1', 'test', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 5, bead_id: 'unitAI-123' },
    ], { bead_id: 'unitAI-123' });

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const combined = logs.join('\n');
    expect(combined).toContain('unitAI-123');
    expect(combined).not.toContain('[bead:');
    expect(combined).toContain('[unitAI-123]');
  });

  it('shows specialist/model alias in human output when model is known', async () => {
    createJobDir('job1', 'explorer', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 5 },
    ], {
      model: 'anthropic/claude-sonnet-4-6',
    });

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const combined = stripAnsi(logs.join('\n'));
    expect(combined).toContain('explorer/sonnet-4-6');
  });

  it('orders fixed segments and highlights tool details', async () => {
    const now = Date.now();
    createJobDir('job1', 'test', [
      { t: now - 2000, type: 'tool', tool: 'bash', phase: 'start', args: { command: 'echo hi' } },
      { t: now, type: 'run_complete', status: 'COMPLETE', elapsed_s: 5 },
    ], { bead_id: 'unitAI-777' });

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const toolLine = logs.find((line) => line.includes('TOOL')) ?? '';
    const plain = stripAnsi(toolLine);

    expect(plain).toMatch(/\[job1\]\s+\[unitAI-777\]\s+TOOL\s+test\s+bash: echo hi/);
    expect(toolLine).toContain('\x1b[36mbash\x1b[0m');
    expect(toolLine).toContain('\x1b[33mecho hi\x1b[0m');

    const combined = stripAnsi(logs.join('\n'));
    expect(combined).toContain('status=COMPLETE');
    expect(combined).toContain('elapsed=5s');
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

  it('--json envelope includes model, backend, beadId, elapsed_ms from status.json', async () => {
    createJobDir('job1', 'my-spec', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 5 },
    ], {
      model: 'claude-haiku',
      backend: 'anthropic',
      bead_id: 'unitAI-abc',
      started_at_ms: Date.now() - 5000,
    });

    process.argv = ['node', 'specialists', 'feed', '--json'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const line = logs.find((l) => l.trim());
    expect(line).toBeDefined();
    const parsed = JSON.parse(line!);
    expect(parsed.jobId).toBe('job1');
    expect(parsed.specialist).toBe('my-spec');
    expect(parsed.specialist_model).toBe('my-spec/haiku');
    expect(parsed.model).toBe('claude-haiku');
    expect(parsed.backend).toBe('anthropic');
    expect(parsed.beadId).toBe('unitAI-abc');
    expect(parsed.elapsed_ms).toBeGreaterThanOrEqual(0);
    // Event fields still present
    expect(parsed.type).toBe('run_complete');
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

  it('exits immediately in follow mode for completed jobs without run_complete', async () => {
    const now = Date.now();
    createJobDir('job1', 'test', [
      { t: now - 1000, type: 'text' },
    ], { status: 'done' });

    process.argv = ['node', 'specialists', 'feed', '-f'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(logs.join('\n')).toContain('TEXT');
  });

  it('does not exit early in global follow when done jobs exist but an active job has no events yet', async () => {
    const now = Date.now();

    createJobDir('job-done', 'test', [
      { t: now - 2000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 },
    ], { status: 'done' });

    const activeJobDir = join(jobsDir, 'job-active');
    mkdirSync(activeJobDir, { recursive: true });
    writeFileSync(join(activeJobDir, 'events.jsonl'), '', 'utf-8');
    writeFileSync(
      join(activeJobDir, 'status.json'),
      JSON.stringify({
        id: 'job-active',
        specialist: 'test',
        status: 'running',
        started_at_ms: now,
      }),
      'utf-8'
    );

    process.argv = ['node', 'specialists', 'feed', '-f'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    const runPromise = run();

    await new Promise((resolve) => setTimeout(resolve, 50));

    appendFileSync(
      join(activeJobDir, 'events.jsonl'),
      `\n${JSON.stringify({ t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 2 })}`,
      'utf-8'
    );
    writeFileSync(
      join(activeJobDir, 'status.json'),
      JSON.stringify({
        id: 'job-active',
        specialist: 'test',
        status: 'done',
        started_at_ms: now,
      }),
      'utf-8'
    );

    await Promise.race([
      runPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('follow mode did not terminate')), 5000)),
    ]);

    const combined = logs.join('\n');
    expect(combined).toContain('job-active');
    expect(combined).toContain('DONE');
  });

  it('refreshes job metadata in follow mode when status.json is updated mid-run', async () => {
    const now = Date.now();
    createJobDir('job-meta', 'explorer', [
      { t: now - 1000, type: 'run_start', specialist: 'explorer' },
    ], {
      status: 'running',
      model: undefined,
      backend: undefined,
    });

    process.argv = ['node', 'specialists', 'feed', '--job', 'job-meta', '-f', '--json'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const jobMetaDir = join(jobsDir, 'job-meta');

    const { run } = await import('../../../src/cli/feed.js');
    const runPromise = run();

    writeFileSync(
      join(jobMetaDir, 'status.json'),
      JSON.stringify({
        id: 'job-meta',
        specialist: 'explorer',
        status: 'running',
        model: 'claude-haiku',
        backend: 'anthropic',
        started_at_ms: now,
      }),
      'utf-8'
    );

    appendFileSync(
      join(jobMetaDir, 'events.jsonl'),
      `\n${JSON.stringify({ t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 })}`,
      'utf-8'
    );

    writeFileSync(
      join(jobMetaDir, 'status.json'),
      JSON.stringify({
        id: 'job-meta',
        specialist: 'explorer',
        status: 'done',
        model: 'claude-haiku',
        backend: 'anthropic',
        started_at_ms: now,
      }),
      'utf-8'
    );

    await Promise.race([
      runPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('follow mode did not terminate')), 5000)),
    ]);

    const jsonLines = logs
      .map((line) => line.trim())
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line));

    const completionEvent = jsonLines.find((line) => line.type === 'run_complete');
    expect(completionEvent).toBeDefined();
    expect(completionEvent.model).toBe('claude-haiku');
    expect(completionEvent.backend).toBe('anthropic');
  });

  // ── Regression tests for merged chronology ─────────────────────────────────

  it('merges events from multiple jobs in chronological order', async () => {
    const now = Date.now();
    createJobDir('job1', 'test1', [
      { t: now - 2000, type: 'run_start', specialist: 'test1' },
      { t: now - 1000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 },
    ]);
    createJobDir('job2', 'test2', [
      { t: now - 1500, type: 'run_start', specialist: 'test2' },
      { t: now - 500, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 },
    ]);

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    // Should have 4 events total, in chronological order
    expect(logs.length).toBe(4);
    
    // First event should be job1 start (earliest)
    expect(logs[0]).toContain('START');
    
    // Last event should be job2 complete (latest)
    expect(logs[3]).toContain('DONE');
  });

  it('filters by --specialist name', async () => {
    createJobDir('job1', 'code-review', [
      { t: Date.now() - 1000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 },
    ]);
    createJobDir('job2', 'bug-hunt', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 2 },
    ]);

    process.argv = ['node', 'specialists', 'feed', '--specialist', 'bug-hunt'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    // Should only have bug-hunt job
    expect(logs.length).toBe(1);
  });

  it('keeps detailed tool start events while still deduping repetitive meta/text', async () => {
    const now = Date.now();
    createJobDir('job1', 'test', [
      { t: now - 6000, type: 'meta', model: 'claude-haiku-4-5', backend: 'anthropic' },
      { t: now - 5000, type: 'meta', model: 'claude-haiku-4-5', backend: 'anthropic' },
      { t: now - 4000, type: 'text' },
      { t: now - 3000, type: 'text' },
      { t: now - 2000, type: 'tool', tool: 'bash', phase: 'start', args: { command: 'bd recall one' } },
      { t: now - 1000, type: 'tool', tool: 'bash', phase: 'start', args: { command: 'bd recall two' } },
      { t: now, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 },
    ]);

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(logs.filter((line) => line.includes('META')).length).toBe(1);
    expect(logs.filter((line) => line.includes('TEXT')).length).toBe(1);
    expect(logs.filter((line) => line.includes('TOOL') && line.includes('bd recall')).length).toBe(2);
  });

  it('filters by --since relative time', async () => {
    const now = Date.now();
    createJobDir('job1', 'test', [
      { t: now - 600000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 }, // 10 min ago
      { t: now - 1000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 2 },   // 1 sec ago
    ]);

    process.argv = ['node', 'specialists', 'feed', '--since', '5m'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    // Should only have recent event
    expect(logs.length).toBe(1);
  });

  it('respects --limit flag', async () => {
    createJobDir('job1', 'test', [
      { t: Date.now() - 3000, type: 'run_start', specialist: 'test' },
      { t: Date.now() - 2000, type: 'meta', model: 'claude-3', backend: 'anthropic' },
      { t: Date.now() - 1000, type: 'tool', tool: 'Read', phase: 'start' },
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 3 },
    ]);

    process.argv = ['node', 'specialists', 'feed', '--limit', '2'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(logs.length).toBe(2);
  });

  it('suppresses turn/message noise and successful tool end events', async () => {
    const now = Date.now();
    createJobDir('job1', 'test', [
      { t: now - 5000, type: 'turn', phase: 'start' },
      { t: now - 4500, type: 'message', phase: 'start', role: 'assistant' },
      { t: now - 4000, type: 'tool', tool: 'bash', phase: 'start', args: { command: 'echo hi' } },
      { t: now - 3000, type: 'tool', tool: 'bash', phase: 'end', is_error: false },
      { t: now - 2000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 2 },
    ]);

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const joined = logs.join('\n');
    expect(joined).not.toContain('TURN');
    expect(joined).not.toContain('MSG');
    expect(joined).toContain('TOOL');
    expect(joined).toContain('echo hi');
    expect(joined).not.toContain('bash: end');
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('handles malformed event lines gracefully', async () => {
    const jobDir = join(jobsDir, 'job1');
    mkdirSync(jobDir, { recursive: true });

    // Write malformed events.jsonl
    writeFileSync(
      join(jobDir, 'events.jsonl'),
      `{"t": ${Date.now()}, "type": "run_start", "specialist": "test"}
invalid json line here
{"t": ${Date.now() + 1000}, "type": "run_complete", "status": "COMPLETE", "elapsed_s": 1}`,
      'utf-8'
    );

    writeFileSync(
      join(jobDir, 'status.json'),
      JSON.stringify({ id: 'job1', specialist: 'test', status: 'done' }),
      'utf-8'
    );

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    // Should still show valid events
    expect(logs.length).toBe(2);
  });

  it('handles jobs with no events.jsonl', async () => {
    const jobDir = join(jobsDir, 'job1');
    mkdirSync(jobDir, { recursive: true });
    // Only status.json, no events
    writeFileSync(
      join(jobDir, 'status.json'),
      JSON.stringify({ id: 'job1', specialist: 'test', status: 'done' }),
      'utf-8'
    );

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    // Should show no events found
    expect(logs.join('\n')).toContain('No events found');
  });
});