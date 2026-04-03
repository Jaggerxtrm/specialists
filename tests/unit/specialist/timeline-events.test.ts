// tests/unit/specialist/timeline-events.test.ts
import { describe, expect, it } from 'vitest';
import {
  type TimelineEvent,
  TIMELINE_EVENT_TYPES,
  createRunStartEvent,
  createMetaEvent,
  createRunCompleteEvent,
  createTokenUsageEvent,
  createFinishReasonEvent,
  createTurnSummaryEvent,
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

    it('includes output field when provided', () => {
      const event = createRunCompleteEvent('COMPLETE', 15, {
        output: 'Final assistant output text',
      });
      expect(event.output).toBe('Final assistant output text');
    });

    it('includes metrics when provided', () => {
      const event = createRunCompleteEvent('COMPLETE', 15, {
        metrics: {
          finish_reason: 'stop',
          token_usage: { total_tokens: 120 },
        },
      });
      expect(event.metrics?.finish_reason).toBe('stop');
      expect(event.metrics?.token_usage?.total_tokens).toBe(120);
    });

    it('does not include output when not provided', () => {
      const event = createRunCompleteEvent('COMPLETE', 5);
      expect(event.output).toBeUndefined();
    });
  });

  describe('mapCallbackEventToTimelineEvent', () => {
    it('maps thinking to thinking event with char_count', () => {
      const event = mapCallbackEventToTimelineEvent('thinking', { charCount: 12 });
      expect(event).not.toBeNull();
      expect(event!.type).toBe('thinking');
      if (event?.type === 'thinking') {
        expect(event.char_count).toBe(12);
      }
    });

    it('toolcall returns null (removed — tool_execution_start is authoritative)', () => {
      const event = mapCallbackEventToTimelineEvent('toolcall', { tool: 'bash' });
      expect(event).toBeNull();
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

    it('maps tool_execution_end with result content to truncated result_summary', () => {
      const event = mapCallbackEventToTimelineEvent('tool_execution_end', {
        tool: 'bash',
        resultContent: 'a'.repeat(700),
      });
      expect(event).not.toBeNull();
      if (event?.type === 'tool') {
        expect(event.result_summary).toBeDefined();
        expect(event.result_summary?.length).toBe(501);
        expect(event.result_summary?.endsWith('…')).toBe(true);
      }
    });

    it('maps tool_execution_end with isError=true to tool event with is_error=true', () => {
      const event = mapCallbackEventToTimelineEvent('tool_execution_end', {
        tool: 'bash',
        isError: true,
      });
      expect(event).not.toBeNull();
      if (event!.type === 'tool') {
        expect(event.phase).toBe('end');
        expect(event.is_error).toBe(true);
      }
    });

    it('maps tool_execution_start with args to tool event with args field', () => {
      const args = { command: 'ls -la', timeout: 5000 };
      const event = mapCallbackEventToTimelineEvent('tool_execution_start', {
        tool: 'bash',
        args,
      });
      expect(event).not.toBeNull();
      if (event!.type === 'tool') {
        expect(event.phase).toBe('start');
        expect(event.tool).toBe('bash');
        expect(event.args).toEqual(args);
      }
    });

    it('maps tool_execution_start without args — args field is undefined', () => {
      const event = mapCallbackEventToTimelineEvent('tool_execution_start', {
        tool: 'read',
      });
      expect(event).not.toBeNull();
      if (event!.type === 'tool') {
        expect(event.args).toBeUndefined();
      }
    });

    it('maps tool_execution_start with empty args {} — args field is {}', () => {
      const event = mapCallbackEventToTimelineEvent('tool_execution_start', {
        tool: 'bash',
        args: {},
      });
      expect(event).not.toBeNull();
      if (event!.type === 'tool') {
        expect(event.args).toEqual({});
      }
    });

    it('maps tool_execution_start with toolCallId — populates tool_call_id', () => {
      const event = mapCallbackEventToTimelineEvent('tool_execution_start', {
        tool: 'bash',
        toolCallId: 'call-abc-123',
      });
      expect(event).not.toBeNull();
      if (event!.type === 'tool') {
        expect(event.tool_call_id).toBe('call-abc-123');
      }
    });

    it('maps tool_execution_start — includes started_at ISO timestamp', () => {
      const before = new Date().toISOString();
      const event = mapCallbackEventToTimelineEvent('tool_execution_start', { tool: 'read' });
      const after = new Date().toISOString();
      expect(event).not.toBeNull();
      if (event!.type === 'tool') {
        expect(event.started_at).toBeDefined();
        expect(event.started_at! >= before).toBe(true);
        expect(event.started_at! <= after).toBe(true);
      }
    });

    it('maps tool_execution_update to tool event with phase update', () => {
      const event = mapCallbackEventToTimelineEvent('tool_execution_update', {
        tool: 'bash',
      });
      expect(event).not.toBeNull();
      expect(event!.type).toBe('tool');
      if (event!.type === 'tool') {
        expect(event.phase).toBe('update');
      }
    });

    it('maps assistant message boundaries', () => {
      const start = mapCallbackEventToTimelineEvent('message_start_assistant', {});
      const end = mapCallbackEventToTimelineEvent('message_end_assistant', {});
      expect(start).not.toBeNull();
      expect(end).not.toBeNull();
      expect(start!.type).toBe('message');
      expect(end!.type).toBe('message');
      if (start!.type === 'message') {
        expect(start.role).toBe('assistant');
        expect(start.phase).toBe('start');
      }
      if (end!.type === 'message') {
        expect(end.role).toBe('assistant');
        expect(end.phase).toBe('end');
      }
    });

    it('maps turn boundaries', () => {
      const start = mapCallbackEventToTimelineEvent('turn_start', {});
      const end = mapCallbackEventToTimelineEvent('turn_end', {});
      expect(start).not.toBeNull();
      expect(end).not.toBeNull();
      expect(start!.type).toBe('turn');
      expect(end!.type).toBe('turn');
    });

    it('maps text to text event with char_count', () => {
      const event = mapCallbackEventToTimelineEvent('text', { charCount: 21 });
      expect(event).not.toBeNull();
      expect(event!.type).toBe('text');
      if (event?.type === 'text') {
        expect(event.char_count).toBe(21);
      }
    });

    it('maps auto_compaction_start to compaction start event', () => {
      const event = mapCallbackEventToTimelineEvent('auto_compaction_start', {});
      expect(event).not.toBeNull();
      expect(event!.type).toBe('compaction');
      if (event?.type === 'compaction') {
        expect(event.phase).toBe('start');
      }
    });

    it('maps auto_compaction_end to compaction end event', () => {
      const event = mapCallbackEventToTimelineEvent('auto_compaction_end', {});
      expect(event).not.toBeNull();
      expect(event!.type).toBe('compaction');
      if (event?.type === 'compaction') {
        expect(event.phase).toBe('end');
      }
    });

    it('maps auto_retry to retry event', () => {
      const event = mapCallbackEventToTimelineEvent('auto_retry', {});
      expect(event).not.toBeNull();
      expect(event!.type).toBe('retry');
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

  describe('metric constructors', () => {
    it('creates token_usage event', () => {
      const event = createTokenUsageEvent({ total_tokens: 10 }, 'agent_end');
      expect(event.type).toBe('token_usage');
      expect(event.token_usage.total_tokens).toBe(10);
    });

    it('creates finish_reason event', () => {
      const event = createFinishReasonEvent('stop', 'agent_end');
      expect(event.type).toBe('finish_reason');
      expect(event.finish_reason).toBe('stop');
    });

    it('creates turn_summary event', () => {
      const event = createTurnSummaryEvent(2, { total_tokens: 9 }, 'toolUse');
      expect(event.type).toBe('turn_summary');
      expect(event.turn_index).toBe(2);
      expect(event.token_usage?.total_tokens).toBe(9);
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