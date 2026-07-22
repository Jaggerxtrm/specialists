import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { mock } from 'bun:test';
import { appendFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolveObservabilityDbLocation } from '../../../src/specialist/observability-db.js';
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
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
  });

  afterEach(() => {
    process.argv = originalArgv;
    delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
    mock.restore();
    vi.restoreAllMocks();
  });

  async function seedSqliteJob(jobId: string, events: any[], status: Record<string, unknown>): Promise<boolean> {
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
        [jobId, String(status.specialist ?? 'unknown'), String(status.status ?? 'done'), JSON.stringify(status), Date.now()]
      );

      for (let index = 0; index < events.length; index += 1) {
        const event = { ...events[index], seq: events[index].seq ?? index + 1 };
        db.run(
          `INSERT INTO specialist_events (job_id, seq, specialist, bead_id, t, type, event_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [jobId, event.seq, String(status.specialist ?? 'unknown'), status.bead_id ?? null, Number(event.t ?? Date.now()), String(event.type ?? 'text'), JSON.stringify(event)]
        );
      }

      db.close();
      return true;
    } catch {
      return false;
    }
  }

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

  it('prints DB-backed job not found message when jobId missing from observability.db', async () => {
    await seedSqliteJob('existing-job', [{ t: Date.now(), type: 'text' }], { specialist: 'test', status: 'done' });
    process.argv = ['node', 'specialists', 'feed', 'missing-job'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(stripAnsi(logs.join('\n'))).toContain('job missing-job not found in .specialists/db/observability.db');
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

  it('renders persisted assistant text content in snapshot mode', async () => {
    await seedSqliteJob('job-text', [
      { t: Date.now(), type: 'run_start', specialist: 'explorer' },
      { t: Date.now() + 1, type: 'text', char_count: 29, content: 'Visible assistant answer\nline 2' },
      { t: Date.now() + 2, type: 'thinking', char_count: 99 },
    ], { specialist: 'explorer', status: 'done', started_at_ms: Date.now() - 1000 });

    process.argv = ['node', 'specialists', 'feed', 'job-text'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const combined = stripAnsi(logs.join('\n'));
    expect(combined).toContain('Visible assistant answer\nline 2');
    expect(combined).toContain('kind=assistant');
    expect(combined).toContain('THINK');
    expect(combined).not.toContain('reasoning');
  });

  it('keeps legacy text events without content renderable', async () => {
    await seedSqliteJob('job-legacy-text', [
      { t: Date.now(), type: 'text', char_count: 12 },
    ], { specialist: 'explorer', status: 'done', started_at_ms: Date.now() - 1000 });

    process.argv = ['node', 'specialists', 'feed', 'job-legacy-text'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const combined = stripAnsi(logs.join('\n'));
    expect(combined).toContain('kind=assistant chars=12');
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
      {
        t: now,
        type: 'run_complete',
        status: 'COMPLETE',
        elapsed_s: 5,
        finish_reason: 'stop',
        exit_reason: 'agent_end',
        token_usage: { total_tokens: 321, input_tokens: 200, output_tokens: 100, reasoning_tokens: 21 },
        metrics: { turns: 2 },
        tool_calls: ['bash'],
      },
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
    expect(combined).toContain('tokens=321');
    expect(combined).toContain('in=200');
    expect(combined).toContain('out=100');
    expect(combined).toContain('reasoning=21');
    expect(combined).not.toContain('cost=');
    expect(combined).toContain('turns=2');
    expect(combined).toContain('tools=1');
    expect(combined).toContain('finish=stop');
    expect(combined).toContain('exit=agent_end');
  });

  it('surfaces api error event in human feed output', async () => {
    createJobDir('job-error', 'test', [
      { t: Date.now(), type: 'error', source: 'stderr', error_message: 'You have hit your ChatGPT usage limit' },
      { t: Date.now(), type: 'run_complete', status: 'ERROR', elapsed_s: 2, error: 'You have hit your ChatGPT usage limit' },
    ], { bead_id: 'unitAI-err' });

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const combined = stripAnsi(logs.join('\n'));
    expect(combined).toContain('ERROR');
    expect(combined).toContain('usage limit');
  });

  it('surfaces auto-commit and GitNexus evidence in human feed output', async () => {
    createJobDir('job-autocommit', 'executor', [
      {
        t: Date.now(),
        type: 'auto_commit_success',
        commit_sha: '54e2fa6c83323b8c50cf203ce59e13af0d922e10',
        committed_files: ['src/cli/feed.ts'],
      },
      { t: Date.now(), type: 'meta', model: 'gitnexus_analyze_started', backend: 'checkpoint' },
      { t: Date.now(), type: 'auto_commit_skipped', reason: 'policy_never' },
    ], { bead_id: 'unitAI-auto' });

    process.argv = ['node', 'specialists', 'feed'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const combined = stripAnsi(logs.join('\n'));
    expect(combined).toContain('AUTO+');
    expect(combined).toContain('commit=54e2fa6c8332');
    expect(combined).toContain('files=1');
    expect(combined).toContain('gitnexus=analyze_started');
    expect(combined).toContain('source=checkpoint');
    expect(combined).toContain('AUTO-');
    expect(combined).toContain('reason=policy_never');
  });

  it('outputs pi-compatible NDJSON with --json', async () => {
    const now = Date.now();
    createJobDir('job1', 'test', [
      { t: now, seq: 1, type: 'run_start', startup_snapshot: { job_id: 'job1' } },
      { t: now + 1, seq: 2, type: 'payload_breakdown', payload_breakdown: { components: [{ name: 'skill', tokens: 1200, bytes: 2048 }], totals: { tokens: 1200, bytes: 2048 } } },
      { t: now + 2, seq: 3, type: 'turn', phase: 'start' },
      { t: now + 3, seq: 4, type: 'message', phase: 'start', role: 'assistant' },
      { t: now + 5, seq: 5, type: 'text', content: 'ok', char_count: 2 },
      { t: now + 4, seq: 6, type: 'message', phase: 'end', role: 'assistant' },
      { t: now + 6, seq: 7, type: 'turn', phase: 'end' },
      { t: now + 7, seq: 8, type: 'run_complete', status: 'COMPLETE', elapsed_s: 5, output: 'ok' },
      { t: now + 8, seq: 9, type: 'run_complete', status: 'COMPLETE', elapsed_s: 5, output: 'ok' },
    ], { model: 'nano-gpt/kimi-k2.6', backend: 'nano-gpt', started_at_ms: now });

    process.argv = ['node', 'specialists', 'feed', '--json'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const parsedLines = logs.filter((line) => line.trim()).map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
    expect(parsedLines.map((event) => event.type)).toEqual([
      'session',
      'agent_start',
      'turn_start',
      'message_start',
      'message_update',
      'message_update',
      'message_update',
      'message_end',
      'turn_end',
      'agent_end',
      'agent_settled',
    ]);
    expect(parsedLines[0]).toMatchObject({ type: 'session', version: 3, id: 'job1', cwd: tempRoot });
    expect(parsedLines.some((event) => 'forensic_event' in event || 'jobId' in event || event.type === 'payload_breakdown')).toBe(false);
  });

  it('omits specialist-only telemetry from pi-compatible JSON mode', async () => {
    createJobDir('job-json-auto', 'executor', [
      {
        t: Date.now(),
        type: 'auto_commit_success',
        commit_sha: '54e2fa6c83323b8c50cf203ce59e13af0d922e10',
        committed_files: ['src/cli/feed.ts'],
      },
      { t: Date.now(), type: 'meta', model: 'gitnexus_analyze_started', backend: 'checkpoint' },
    ]);

    process.argv = ['node', 'specialists', 'feed', '--json'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(logs.filter((line) => line.trim())).toEqual([]);
  });

  it('--json uses status model metadata in pi assistant messages', async () => {
    createJobDir('job1', 'my-spec', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 5, output: 'done' },
    ], {
      model: 'anthropic/claude-haiku',
      backend: 'anthropic',
      bead_id: 'unitAI-abc',
      worktree_path: '/tmp/job-worktree',
      started_at_ms: Date.now() - 5000,
    });

    process.argv = ['node', 'specialists', 'feed', '--json'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const parsed = logs.filter((line) => line.trim()).map((line) => JSON.parse(line));
    expect(parsed.map((event) => event.type)).toEqual(['session', 'agent_start', 'agent_end', 'agent_settled']);
    expect(parsed[0]).toMatchObject({ type: 'session', cwd: '/tmp/job-worktree' });
    expect(parsed[2]).toMatchObject({
      type: 'agent_end',
      messages: [{ provider: 'anthropic', model: 'claude-haiku', content: [{ type: 'text', text: 'done' }] }],
    });
    expect(parsed.some((event) => 'beadId' in event || 'elapsed_ms' in event || 'forensic_event' in event)).toBe(false);
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

  it('prints "No jobs found." in follow mode when jobs directory is empty', async () => {
    process.argv = ['node', 'specialists', 'feed', '-f'];

    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(stripAnsi(stderrWrites.join(''))).toContain('No jobs found.');
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

  it('exits global follow with keep-alive waiting jobs', async () => {
    const now = Date.now();
    createJobDir('job-keepalive', 'test', [
      { t: now - 1000, type: 'run_start' },
    ], {
      status: 'waiting',
      keep_alive: true,
      started_at_ms: now,
    });

    process.argv = ['node', 'specialists', 'feed', '-f'];

    const stderrWrites: string[] = [];
    const logs: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderrWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(stripAnsi(stderrWrites.join(''))).toContain('All jobs complete.');
    expect(logs.join('\n')).toContain('job-keepalive');
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
      `\n${JSON.stringify({ t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 1, output: 'done' })}`,
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

    const completionEvent = jsonLines.find((line) => line.type === 'agent_end');
    expect(completionEvent).toBeDefined();
    expect(completionEvent.messages[0].model).toBe('claude-haiku');
    expect(completionEvent.messages[0].provider).toBe('anthropic');
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

  it('respects --limit flag using the most recent events', async () => {
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
    const combined = logs.join('\n');
    expect(combined).toContain('TOOL');
    expect(combined).toContain('DONE');
    expect(combined).not.toContain('START');
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

  it('reads events from SQLite when DB exists', async () => {
    createJobDir('sqlite-job', 'test', [], { status: 'done' });
    const seeded = await seedSqliteJob(
      'sqlite-job',
      [{ t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 4 }],
      { id: 'sqlite-job', specialist: 'test', status: 'done', started_at_ms: Date.now() - 4000 }
    );
    if (!seeded) return;

    process.argv = ['node', 'specialists', 'feed', '--job', 'sqlite-job'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(logs.join('\n')).toContain('COMPLETE');
  });

  it('uses SQLite metadata in --json mode when available', async () => {
    createJobDir('sqlite-json', 'test', [{ t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 1, output: 'done' }], {
      id: 'sqlite-json',
      specialist: 'test',
      status: 'done',
      model: 'file-model',
      backend: 'file-backend',
      started_at_ms: Date.now() - 1000,
    });

    const seeded = await seedSqliteJob(
      'sqlite-json',
      [{ t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 1, output: 'done' }],
      {
        id: 'sqlite-json',
        specialist: 'test',
        status: 'done',
        model: 'sqlite-model',
        backend: 'sqlite-backend',
        started_at_ms: Date.now() - 1000,
      }
    );
    if (!seeded) return;

    process.argv = ['node', 'specialists', 'feed', '--job', 'sqlite-json', '--json'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    const payloads = logs.filter((line) => line.trim().startsWith('{')).map((line) => JSON.parse(line));
    const agentEnd = payloads.find((payload) => payload.type === 'agent_end');
    expect(agentEnd.messages[0].model).toBe('sqlite-model');
    expect(agentEnd.messages[0].provider).toBe('sqlite-backend');
  });

  it('falls back to events.jsonl when SQLite read fails', async () => {
    createJobDir('fallback-job', 'test', [
      { t: Date.now(), type: 'run_complete', status: 'COMPLETE', elapsed_s: 2 },
    ]);

    mock.module('../../../src/specialist/observability-sqlite.js', () => ({
      createObservabilitySqliteClient: () => ({
        readEvents: () => {
          throw new Error('sqlite unavailable');
        },
        readStatus: () => {
          throw new Error('sqlite unavailable');
        },
        close: () => {},
      }),
    }));

    process.argv = ['node', 'specialists', 'feed', '--job', 'fallback-job'];

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg ?? '');
    });

    const { run } = await import('../../../src/cli/feed.js');
    await run();

    expect(logs.join('\n')).toContain('COMPLETE');
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