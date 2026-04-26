// tests/unit/specialist/feed_specialist.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createFeedSpecialistTool } from '../../../src/tools/specialist/feed_specialist.tool.js';
import type { TimelineEvent } from '../../../src/specialist/timeline-events.js';

function makeEvents(count: number): TimelineEvent[] {
  const base = Date.now();
  const events: TimelineEvent[] = [
    { t: base, type: 'run_start', specialist: 'test-spec' },
  ];
  for (let i = 0; i < count - 2; i++) {
    events.push({ t: base + i + 1, type: 'text' });
  }
  if (count >= 2) {
    events.push({ t: base + count, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 });
  }
  return events;
}

describe('feed_specialist tool', () => {
  let tmpDir: string;
  let jobsDir: string;
  let tool: ReturnType<typeof createFeedSpecialistTool>;
  let originalFileOutputMode: string | undefined;

  beforeEach(() => {
    originalFileOutputMode = process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    tmpDir = join(process.cwd(), `.feed-specialist-test-${Date.now()}`);
    jobsDir = join(tmpDir, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    tool = createFeedSpecialistTool(jobsDir);
  });

  afterEach(() => {
    if (originalFileOutputMode === undefined) {
      delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    } else {
      process.env.SPECIALISTS_JOB_FILE_OUTPUT = originalFileOutputMode;
    }
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function createJob(
    jobId: string,
    events: TimelineEvent[],
    statusOverrides: Record<string, unknown> = {},
  ) {
    const jobDir = join(jobsDir, jobId);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(
      join(jobDir, 'events.jsonl'),
      events.map(e => JSON.stringify(e)).join('\n'),
      'utf-8',
    );
    writeFileSync(
      join(jobDir, 'status.json'),
      JSON.stringify({
        id: jobId,
        specialist: 'test-spec',
        status: 'done',
        started_at_ms: Date.now(),
        ...statusOverrides,
      }),
      'utf-8',
    );
  }

  it('returns error when job_id does not exist', async () => {
    const result = await tool.execute({ job_id: 'nonexistent', cursor: 0, limit: 50 }) as any;
    expect(result.error).toMatch(/Job not found/);
    expect(result.job_id).toBe('nonexistent');
  });

  it('returns defaults with empty events when file fallback is disabled', async () => {
    const events = makeEvents(3);
    createJob('job1', events);
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'off';

    const result = await tool.execute({ job_id: 'job1', cursor: 0, limit: 50 }) as any;

    expect(result.job_id).toBe('job1');
    expect(result.specialist).toBe('unknown');
    expect(result.status).toBe('unknown');
    expect(result.events).toHaveLength(0);
    expect(result.cursor).toBe(0);
    expect(result.next_cursor).toBe(0);
    expect(result.has_more).toBe(false);
    expect(result.is_complete).toBe(false);
  });

  it('cursor pagination: slices events and reports has_more correctly when file fallback enabled', async () => {
    const events = makeEvents(10);
    createJob('job2', events);

    const page1 = await tool.execute({ job_id: 'job2', cursor: 0, limit: 4 }) as any;
    expect(page1.events).toHaveLength(4);
    expect(page1.cursor).toBe(0);
    expect(page1.next_cursor).toBe(4);
    expect(page1.has_more).toBe(true);

    const page2 = await tool.execute({ job_id: 'job2', cursor: 4, limit: 4 }) as any;
    expect(page2.events).toHaveLength(4);
    expect(page2.cursor).toBe(4);
    expect(page2.next_cursor).toBe(8);
    expect(page2.has_more).toBe(true);

    const page3 = await tool.execute({ job_id: 'job2', cursor: 8, limit: 4 }) as any;
    expect(page3.events).toHaveLength(2);
    expect(page3.cursor).toBe(8);
    expect(page3.next_cursor).toBe(10);
    expect(page3.has_more).toBe(false);
  });

  it('includes model, specialist_model, and bead_id from status.json when present', async () => {
    const events = makeEvents(2);
    createJob('job3', events, {
      model: 'dashscope/glm-5',
      bead_id: 'unitAI-abc123',
      specialist: 'executor',
    });

    const result = await tool.execute({ job_id: 'job3', cursor: 0, limit: 50 }) as any;
    expect(result.model).toBe('dashscope/glm-5');
    expect(result.specialist_model).toBe('executor/glm-5');
    expect(result.bead_id).toBe('unitAI-abc123');
  });

  it('omits model/bead_id keys but still includes specialist_model base when model is absent', async () => {
    const events = makeEvents(2);
    createJob('job4', events);

    const result = await tool.execute({ job_id: 'job4', cursor: 0, limit: 50 }) as any;
    expect(result).not.toHaveProperty('model');
    expect(result).not.toHaveProperty('bead_id');
    expect(result.specialist_model).toBe('test-spec');
  });

  it('is_complete=false when no run_complete event', async () => {
    const runningEvents: TimelineEvent[] = [
      { t: Date.now(), type: 'run_start', specialist: 'test-spec' },
      { t: Date.now() + 1, type: 'text' },
    ];
    createJob('job5', runningEvents, { status: 'running' });

    const result = await tool.execute({ job_id: 'job5', cursor: 0, limit: 50 }) as any;
    expect(result.is_complete).toBe(false);
    expect(result.status).toBe('running');
  });

  it('cursor beyond total returns empty events, has_more=false', async () => {
    const events = makeEvents(3);
    createJob('job6', events);

    const result = await tool.execute({ job_id: 'job6', cursor: 10, limit: 50 }) as any;
    expect(result.events).toHaveLength(0);
    expect(result.cursor).toBe(10);
    expect(result.next_cursor).toBe(10);
    expect(result.has_more).toBe(false);
  });

  it('handles empty events.jsonl gracefully', async () => {
    createJob('job7', []);

    const result = await tool.execute({ job_id: 'job7', cursor: 0, limit: 50 }) as any;
    expect(result.events).toHaveLength(0);
    expect(result.has_more).toBe(false);
    expect(result.is_complete).toBe(false);
  });

  it('bead_id with hyphens and dots (e.g. unitAI-z0mq.11) is preserved correctly', async () => {
    const events = makeEvents(2);
    createJob('job8', events, { bead_id: 'unitAI-z0mq.11' });

    const result = await tool.execute({ job_id: 'job8', cursor: 0, limit: 50 }) as any;
    expect(result.bead_id).toBe('unitAI-z0mq.11');
  });

  it('skips malformed lines in events.jsonl and returns only valid events', async () => {
    const jobDir = join(jobsDir, 'job9');
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(
      join(jobDir, 'events.jsonl'),
      [
        JSON.stringify({ t: 1000, type: 'run_start', specialist: 'test-spec' }),
        'not valid json',
        JSON.stringify({ t: 2000, type: 'text' }),
        '{broken',
        JSON.stringify({ t: 3000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 }),
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(
      join(jobDir, 'status.json'),
      JSON.stringify({ id: 'job9', specialist: 'test-spec', status: 'done', started_at_ms: Date.now() }),
      'utf-8',
    );

    const result = await tool.execute({ job_id: 'job9', cursor: 0, limit: 50 }) as any;
    expect(result.events).toHaveLength(3);
    expect(result.is_complete).toBe(true);
  });

  it('pagination works correctly for a large event set (cursor into last page)', async () => {
    const manyEvents: TimelineEvent[] = [
      { t: 1, type: 'run_start', specialist: 'test-spec' },
      ...Array.from({ length: 1000 }, (_, i) => ({ t: i + 2, type: 'text' } as TimelineEvent)),
      { t: 1002, type: 'run_complete', status: 'COMPLETE' as const, elapsed_s: 10 },
    ];
    createJob('job10', manyEvents);

    const result = await tool.execute({ job_id: 'job10', cursor: 1001, limit: 50 }) as any;
    expect(result.cursor).toBe(1001);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('run_complete');
    expect(result.has_more).toBe(false);
    expect(result.is_complete).toBe(true);
  });
});
