// tests/unit/specialist/timeline-query.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  readJobEvents,
  readAllJobEvents,
  mergeTimelineEvents,
  filterTimelineEvents,
  queryTimeline,
  getRecentEvents,
  isJobComplete,
  getJobCompletionStatus,
  getToolActivity,
} from '../../../src/specialist/timeline-query.js';
import { type TimelineEvent, TIMELINE_EVENT_TYPES } from '../../../src/specialist/timeline-events.js';

describe('timeline-query', () => {
  const tempDir = join(process.cwd(), '.temp-timeline-test');
  const jobsDir = join(tempDir, 'jobs');

  beforeEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(jobsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  function createJobDir(jobId: string, specialist: string, events: TimelineEvent[], status?: any) {
    const jobDir = join(jobsDir, jobId);
    mkdirSync(jobDir, { recursive: true });

    // Write events.jsonl
    const eventsPath = join(jobDir, 'events.jsonl');
    const lines = events.map((e) => JSON.stringify(e)).join('\n');
    writeFileSync(eventsPath, lines, 'utf-8');

    // Write status.json
    const statusPath = join(jobDir, 'status.json');
    writeFileSync(
      statusPath,
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

  describe('readJobEvents', () => {
    it('reads events from a job directory', () => {
      const events: TimelineEvent[] = [
        { t: 1000, type: 'thinking' },
        { t: 2000, type: 'text' },
      ];
      createJobDir('job1', 'test', events);

      const result = readJobEvents(join(jobsDir, 'job1'));
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('thinking');
      expect(result[1].type).toBe('text');
    });

    it('returns empty array if events.jsonl does not exist', () => {
      mkdirSync(join(jobsDir, 'empty-job'), { recursive: true });
      const result = readJobEvents(join(jobsDir, 'empty-job'));
      expect(result).toEqual([]);
    });

    it('skips malformed lines', () => {
      const jobDir = join(jobsDir, 'bad-job');
      mkdirSync(jobDir, { recursive: true });
      writeFileSync(join(jobDir, 'events.jsonl'), '{"t":1,"type":"thinking"}\nbad line\n{"t":2,"type":"text"}', 'utf-8');

      const result = readJobEvents(jobDir);
      expect(result).toHaveLength(2);
    });
  });

  describe('readAllJobEvents', () => {
    it('reads events from all jobs', () => {
      createJobDir('job1', 'code-review', [{ t: 1000, type: 'thinking' }]);
      createJobDir('job2', 'bug-hunt', [{ t: 2000, type: 'text' }]);

      const batches = readAllJobEvents(jobsDir);
      expect(batches).toHaveLength(2);
      expect(batches.find((b) => b.jobId === 'job1')?.specialist).toBe('code-review');
      expect(batches.find((b) => b.jobId === 'job2')?.specialist).toBe('bug-hunt');
    });

    it('includes bead_id from status.json', () => {
      createJobDir('job1', 'test', [{ t: 1000, type: 'thinking' }], { bead_id: 'unitAI-123' });

      const batches = readAllJobEvents(jobsDir);
      expect(batches[0].beadId).toBe('unitAI-123');
    });
  });

  describe('mergeTimelineEvents', () => {
    it('merges events chronologically', () => {
      const batches = [
        {
          jobId: 'job1',
          specialist: 'test',
          events: [
            { t: 3000, type: 'thinking' },
            { t: 1000, type: 'text' },
          ] as TimelineEvent[],
        },
        {
          jobId: 'job2',
          specialist: 'test',
          events: [{ t: 2000, type: 'thinking' }] as TimelineEvent[],
        },
      ];

      const merged = mergeTimelineEvents(batches);
      expect(merged).toHaveLength(3);
      expect(merged[0].event.t).toBe(1000);
      expect(merged[1].event.t).toBe(2000);
      expect(merged[2].event.t).toBe(3000);
    });
  });

  describe('filterTimelineEvents', () => {
    it('filters by since timestamp', () => {
      const merged = [
        { jobId: 'j1', specialist: 's1', event: { t: 1000, type: 'text' } as TimelineEvent },
        { jobId: 'j1', specialist: 's1', event: { t: 2000, type: 'text' } as TimelineEvent },
        { jobId: 'j1', specialist: 's1', event: { t: 3000, type: 'text' } as TimelineEvent },
      ];

      const filtered = filterTimelineEvents(merged, { since: 1500 });
      expect(filtered).toHaveLength(2);
    });

    it('filters by limit using the most recent events', () => {
      const merged = Array.from({ length: 10 }, (_, i) => ({
        jobId: 'j1',
        specialist: 's1',
        event: { t: i * 1000, type: 'text' } as TimelineEvent,
      }));

      const filtered = filterTimelineEvents(merged, { limit: 3 });
      expect(filtered).toHaveLength(3);
      expect(filtered.map((item) => item.event.t)).toEqual([7000, 8000, 9000]);
    });

    it('filters by jobId', () => {
      const merged = [
        { jobId: 'job1', specialist: 's1', event: { t: 1000, type: 'text' } as TimelineEvent },
        { jobId: 'job2', specialist: 's2', event: { t: 2000, type: 'text' } as TimelineEvent },
      ];

      const filtered = filterTimelineEvents(merged, { jobId: 'job1' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].jobId).toBe('job1');
    });

    it('filters by specialist', () => {
      const merged = [
        { jobId: 'j1', specialist: 'code-review', event: { t: 1000, type: 'text' } as TimelineEvent },
        { jobId: 'j2', specialist: 'bug-hunt', event: { t: 2000, type: 'text' } as TimelineEvent },
      ];

      const filtered = filterTimelineEvents(merged, { specialist: 'bug-hunt' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].specialist).toBe('bug-hunt');
    });
  });

  describe('isJobComplete', () => {
    it('returns true if run_complete event exists', () => {
      const events: TimelineEvent[] = [
        { t: 1000, type: 'thinking' },
        { t: 2000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 10 },
      ];
      expect(isJobComplete(events)).toBe(true);
    });

    it('returns false if no run_complete event', () => {
      const events: TimelineEvent[] = [{ t: 1000, type: 'thinking' }];
      expect(isJobComplete(events)).toBe(false);
    });
  });

  describe('getJobCompletionStatus', () => {
    it('returns completion status from run_complete event', () => {
      const events: TimelineEvent[] = [
        { t: 1000, type: 'thinking' },
        { t: 2000, type: 'run_complete', status: 'COMPLETE', elapsed_s: 42 },
      ];

      const status = getJobCompletionStatus(events);
      expect(status).not.toBeNull();
      expect(status!.status).toBe('COMPLETE');
      expect(status!.elapsed_s).toBe(42);
    });

    it('returns error status', () => {
      const events: TimelineEvent[] = [
        { t: 1000, type: 'thinking' },
        { t: 2000, type: 'run_complete', status: 'ERROR', elapsed_s: 5, error: 'Failed' },
      ];

      const status = getJobCompletionStatus(events);
      expect(status!.status).toBe('ERROR');
      expect(status!.error).toBe('Failed');
    });

    it('returns null if not complete', () => {
      const events: TimelineEvent[] = [{ t: 1000, type: 'thinking' }];
      expect(getJobCompletionStatus(events)).toBeNull();
    });
  });

  describe('getToolActivity', () => {
    it('extracts tool activity from events', () => {
      const events: TimelineEvent[] = [
        { t: 1000, type: 'tool', tool: 'bash', phase: 'start' },
        { t: 2000, type: 'tool', tool: 'bash', phase: 'end' },
        { t: 3000, type: 'tool', tool: 'read', phase: 'start' },
        { t: 4000, type: 'tool', tool: 'read', phase: 'end' },
      ];

      const activity = getToolActivity(events);
      expect(activity).toHaveLength(2);
      expect(activity[0].tool).toBe('bash');
      expect(activity[0].start_t).toBe(1000);
      expect(activity[0].end_t).toBe(2000);
    });

    it('correlates start/end by tool_call_id when present', () => {
      const events: TimelineEvent[] = [
        { t: 1000, type: 'tool', tool: 'bash', phase: 'start', tool_call_id: 'call-1' },
        { t: 1500, type: 'tool', tool: 'bash', phase: 'start', tool_call_id: 'call-2' },
        { t: 2000, type: 'tool', tool: 'bash', phase: 'end', tool_call_id: 'call-1' },
        { t: 2500, type: 'tool', tool: 'bash', phase: 'end', tool_call_id: 'call-2' },
      ];

      const activity = getToolActivity(events);
      expect(activity).toHaveLength(2);
      expect(activity[0]).toMatchObject({ tool: 'bash', start_t: 1000, end_t: 2000 });
      expect(activity[1]).toMatchObject({ tool: 'bash', start_t: 1500, end_t: 2500 });
    });

    it('incomplete tools (no end event) show tool name not correlation key', () => {
      const events: TimelineEvent[] = [
        { t: 1000, type: 'tool', tool: 'bash', phase: 'start', tool_call_id: 'call-uuid-xyz' },
      ];

      const activity = getToolActivity(events);
      expect(activity).toHaveLength(1);
      expect(activity[0].tool).toBe('bash');
      expect(activity[0].end_t).toBeUndefined();
    });

    it('tool:end without matching start — uses end event t as start_t fallback', () => {
      const events: TimelineEvent[] = [
        { t: 5000, type: 'tool', tool: 'bash', phase: 'end', tool_call_id: 'call-orphan' },
      ];

      const activity = getToolActivity(events);
      expect(activity).toHaveLength(1);
      expect(activity[0].tool).toBe('bash');
      expect(activity[0].start_t).toBe(5000);
      expect(activity[0].end_t).toBe(5000);
    });
  });
});