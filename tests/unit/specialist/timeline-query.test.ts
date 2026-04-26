import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

let mockSqliteClient: { listStatuses: () => any[]; readEvents: (jobId: string) => any[] } | null = null;
vi.mock('../../../src/specialist/observability-sqlite.js', () => ({
  createObservabilitySqliteClient: () => mockSqliteClient,
}));

import { type TimelineEvent } from '../../../src/specialist/timeline-events.js';

const tempDir = join(process.cwd(), '.temp-timeline-test');
const jobsDir = join(tempDir, 'jobs');

async function loadModule() {
  return import('../../../src/specialist/timeline-query.js');
}

describe('timeline-query', () => {
  beforeEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(jobsDir, { recursive: true });
    mockSqliteClient = null;
    delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    mockSqliteClient = null;
    delete process.env.SPECIALISTS_JOB_FILE_OUTPUT;
    vi.resetModules();
  });

  function createJobDir(jobId: string, specialist: string, events: TimelineEvent[], status?: Record<string, unknown>) {
    const jobDir = join(jobsDir, jobId);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, 'events.jsonl'), events.map((event) => JSON.stringify(event)).join('\n'), 'utf-8');
    writeFileSync(join(jobDir, 'status.json'), JSON.stringify({ id: jobId, specialist, status: 'done', started_at_ms: Date.now() - 10_000, ...status }), 'utf-8');
  }

  it('reads events from DB first', async () => {
    mockSqliteClient = {
      listStatuses: () => [{ id: 'job1', specialist: 'test', status: 'done', updated_at_ms: Date.now() }],
      readEvents: () => [{ t: 1000, type: 'text' }, { t: 2000, type: 'thinking' }],
    };

    const { readJobEvents } = await loadModule();
    const result = readJobEvents(join(jobsDir, 'job1'));

    expect(result).toHaveLength(2);
    expect(result[0].t).toBe(1000);
  });

  it('returns empty array if DB empty and file fallback disabled', async () => {
    mockSqliteClient = { listStatuses: () => [], readEvents: () => [] };
    createJobDir('empty-job', 'test', [{ t: 1, type: 'thinking' }]);

    const { readJobEvents } = await loadModule();
    expect(readJobEvents(join(jobsDir, 'empty-job'))).toEqual([]);
  });

  it('uses file fallback only when env enabled and DB empty', async () => {
    mockSqliteClient = { listStatuses: () => [], readEvents: () => [] };
    process.env.SPECIALISTS_JOB_FILE_OUTPUT = 'on';
    createJobDir('job1', 'code-review', [{ t: 1000, type: 'thinking' }], { bead_id: 'unitAI-123' });

    const { readJobEvents, readAllJobEvents } = await loadModule();
    expect(readJobEvents(join(jobsDir, 'job1'))).toHaveLength(1);
    expect(readAllJobEvents(jobsDir)).toHaveLength(1);
  });

  it('reads all events from DB when present', async () => {
    mockSqliteClient = {
      listStatuses: () => [
        { id: 'job1', specialist: 'code-review', bead_id: 'b1', status: 'done' },
        { id: 'job2', specialist: 'bug-hunt', bead_id: 'b2', status: 'done' },
      ],
      readEvents: (jobId: string) => jobId === 'job1'
        ? [{ t: 1000, type: 'thinking' }]
        : [{ t: 2000, type: 'text' }],
    };

    const { readAllJobEvents } = await loadModule();
    const batches = readAllJobEvents(jobsDir);
    expect(batches).toHaveLength(2);
    expect(batches[0].specialist).toBe('code-review');
  });

  it('merges, filters, and tool helpers still work', async () => {
    const mod = await loadModule();
    const batches = [
      { jobId: 'job1', specialist: 'test', events: [{ t: 3000, type: 'thinking' }, { t: 1000, type: 'text' }] as TimelineEvent[] },
      { jobId: 'job2', specialist: 'test', events: [{ t: 2000, type: 'thinking' }] as TimelineEvent[] },
    ];

    const merged = mod.mergeTimelineEvents(batches);
    expect(merged).toHaveLength(3);
    expect(mod.filterTimelineEvents(merged, { limit: 2 })).toHaveLength(2);
    expect(mod.isJobComplete([{ t: 1, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1 }])).toBe(true);
  });
});
