// tests/unit/specialist/timeline-events.test.ts
import { describe, expect, it } from 'vitest';
import {
  type TimelineEvent,
  TIMELINE_EVENT_TYPES,
  createRunStartEvent,
  createMetaEvent,
  createRunCompleteEvent,
  mapCallbackEventToTimelineEvent,
  parseTimelineEvent,
  isRunCompleteEvent,
  isToolEvent,
  compareTimelineEvents,
  mergeTimelineEvents,
} from '../../../src/specialist/timeline-events.js';

describe('timeline-events', () => {
  describe('createRunStartEvent', () => {
    it('creates a run_start event with required fields', () => {
      const event = createRunStartEvent('code-review');
      expect(event.type).toBe('run_start');
      expect(event.specialist).toBe('code-review');
      expect(event.t).toBeTypeOf('number');
    });

    it('includes optional bead_id', () => {
      const event = createRunStartEvent('bug-hunt', 'unitAI-123');
      expect(event.bead_id).toBe('unitAI-123');
    });
  });

  describe('createMetaEvent', () => {
    it('creates a meta event with model and backend', () => {
      const event = createMetaEvent('claude-sonnet-4-6', 'anthropic');
      expect(event.type).toBe('meta');
      expect(event.model).toBe('claude-sonnet-4-6');
      expect(event.backend).toBe('anthropic');
    });
  });

  describe('createRunCompleteEvent', () => {
    it('creates a COMPLETE run_complete event', () => {
      const event = createRunCompleteEvent('COMPLETE', 42);
      expect(event.type).toBe('run_complete');
      expect(event.status).toBe('COMPLETE');
      expect(event.elapsed_s).toBe(42);
    });

    it('creates an ERROR run_complete event with error message', () => {
      const event = createRunCompleteEvent('ERROR', 10, { error: 'Something failed' });
      expect(event.status).toBe('ERROR');
      expect(event.error).toBe('Something failed');
    });

    it('includes optional metadata', () => {
      const event = createRunCompleteEvent('COMPLETE', 30, {
        model: 'claude-sonnet-4-6',
        backend: 'anthropic',
        bead_id: 'unitAI-456',
      });
      expect(event.model).toBe('claude-sonnet-4-6');
      expect(event.backend).toBe('anthropic');
      expect(event.bead_id).toBe('unitAI-456');
    });
  });

  describe('mapCallbackEventToTimelineEvent', () => {
    it('maps thinking to thinking event', () => {
      const event = mapCallbackEventToTimelineEvent('thinking', {});
      expect(event).not.toBeNull();
      expect(event!.type).toBe('thinking');
    });

    it('maps toolcall to tool event with phase start', () => {
      const event = mapCallbackEventToTimelineEvent('toolcall', { tool: 'bash' });
      expect(event).not.toBeNull();
      expect(event!.type).toBe('tool');
      if (event!.type === 'tool') {
        expect(event.phase).toBe('start');
        expect(event.tool).toBe('bash');
      }
    });

    it('maps tool_execution_end to tool event with phase end', () => {
      const event = mapCallbackEventToTimelineEvent('tool_execution_end', {
        tool: 'read',
        isError: false,
      });
      expect(event).not.toBeNull();
      expect(event!.type).toBe('tool');
      if (event!.type === 'tool') {
        expect(event.phase).toBe('end');
        expect(event.tool).toBe('read');
        expect(event.is_error).toBe(false);
      }
    });

    it('maps text to text event', () => {
      const event = mapCallbackEventToTimelineEvent('text', {});
      expect(event).not.toBeNull();
      expect(event!.type).toBe('text');
    });

    it('ignores done (legacy)', () => {
      const event = mapCallbackEventToTimelineEvent('done', {});
      expect(event).toBeNull();
    });

    it('returns null for unknown events', () => {
      const event = mapCallbackEventToTimelineEvent('unknown_event', {});
      expect(event).toBeNull();
    });
  });

  describe('parseTimelineEvent', () => {
    it('parses valid run_complete event', () => {
      const line = JSON.stringify({
        t: 1710000000000,
        type: 'run_complete',
        status: 'COMPLETE',
        elapsed_s: 42,
      });
      const event = parseTimelineEvent(line);
      expect(event).not.toBeNull();
      expect(event!.type).toBe('run_complete');
    });

    it('returns null for malformed JSON', () => {
      const event = parseTimelineEvent('not json');
      expect(event).toBeNull();
    });

    it('returns null for missing t field', () => {
      const event = parseTimelineEvent('{"type":"run_complete"}');
      expect(event).toBeNull();
    });

    it('returns null for missing type field', () => {
      const event = parseTimelineEvent('{"t":1710000000000}');
      expect(event).toBeNull();
    });

    it('returns null for unknown type', () => {
      const event = parseTimelineEvent('{"t":1710000000000,"type":"unknown"}');
      expect(event).toBeNull();
    });
  });

  describe('isRunCompleteEvent', () => {
    it('returns true for run_complete event', () => {
      const event: TimelineEvent = {
        t: Date.now(),
        type: 'run_complete',
        status: 'COMPLETE',
        elapsed_s: 10,
      };
      expect(isRunCompleteEvent(event)).toBe(true);
    });

    it('returns false for other events', () => {
      const event: TimelineEvent = {
        t: Date.now(),
        type: 'tool',
        tool: 'bash',
        phase: 'start',
      };
      expect(isRunCompleteEvent(event)).toBe(false);
    });
  });

  describe('isToolEvent', () => {
    it('returns true for tool event', () => {
      const event: TimelineEvent = {
        t: Date.now(),
        type: 'tool',
        tool: 'bash',
        phase: 'end',
      };
      expect(isToolEvent(event)).toBe(true);
    });

    it('returns false for other events', () => {
      const event: TimelineEvent = {
        t: Date.now(),
        type: 'thinking',
      };
      expect(isToolEvent(event)).toBe(false);
    });
  });

  describe('compareTimelineEvents', () => {
    it('sorts by timestamp ascending', () => {
      const a: TimelineEvent = { t: 1000, type: 'thinking' };
      const b: TimelineEvent = { t: 2000, type: 'text' };
      expect(compareTimelineEvents(a, b)).toBe(-1000);
      expect(compareTimelineEvents(b, a)).toBe(1000);
    });
  });

  describe('mergeTimelineEvents', () => {
    it('merges multiple batches chronologically', () => {
      const batch1 = {
        jobId: 'job1',
        specialist: 'code-review',
        events: [
          { t: 3000, type: 'thinking' } as TimelineEvent,
          { t: 1000, type: 'text' } as TimelineEvent,
        ],
      };
      const batch2 = {
        jobId: 'job2',
        specialist: 'bug-hunt',
        events: [{ t: 2000, type: 'thinking' } as TimelineEvent],
      };

      const merged = mergeTimelineEvents([batch1, batch2]);

      expect(merged).toHaveLength(3);
      expect(merged[0].event.t).toBe(1000);
      expect(merged[1].event.t).toBe(2000);
      expect(merged[2].event.t).toBe(3000);
    });

    it('preserves job attribution', () => {
      const batch = {
        jobId: 'abc123',
        specialist: 'planner',
        events: [{ t: 1000, type: 'thinking' } as TimelineEvent],
      };

      const merged = mergeTimelineEvents([batch]);

      expect(merged[0].jobId).toBe('abc123');
      expect(merged[0].specialist).toBe('planner');
    });
  });
});