import { describe, expect, it } from 'vitest';
import { createPiJsonProjector } from '../../../src/cli/pi-json-output.js';
import type { TimelineEvent } from '../../../src/specialist/timeline-events.js';

describe('pi-compatible JSON projection', () => {
  it('projects a specialist timeline into the pi --mode json event shape', () => {
    const project = createPiJsonProjector({
      jobId: 'job-1',
      cwd: '/repo',
      startedAtMs: 1_700_000_000_000,
      model: 'kimi-k2.6',
      backend: 'nano-gpt',
    });
    const events: TimelineEvent[] = [
      { t: 1_700_000_000_000, type: 'run_start', specialist: 'explorer' },
      { t: 1_700_000_000_010, type: 'payload_breakdown', payload_breakdown: { components: [], totals: { tokens: 0, bytes: 0 } } },
      { t: 1_700_000_000_020, type: 'turn', phase: 'start' },
      { t: 1_700_000_000_030, type: 'message', phase: 'start', role: 'assistant' },
      { t: 1_700_000_000_040, type: 'text', content: 'ok', char_count: 2 },
      { t: 1_700_000_000_050, type: 'message', phase: 'end', role: 'assistant' },
      { t: 1_700_000_000_060, type: 'turn', phase: 'end' },
      {
        t: 1_700_000_000_070,
        type: 'run_complete',
        status: 'COMPLETE',
        elapsed_s: 1,
        output: 'ok',
        token_usage: { input_tokens: 10, output_tokens: 2, cache_read_tokens: 3, total_tokens: 15 },
      },
      {
        t: 1_700_000_000_080,
        type: 'run_complete',
        status: 'COMPLETE',
        elapsed_s: 1,
        output: 'ok',
      },
    ];

    const output = events.flatMap(project);
    expect(output.map((event) => event.type)).toEqual([
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
    expect(output[0]).toEqual({
      type: 'session',
      version: 3,
      id: 'job-1',
      timestamp: '2023-11-14T22:13:20.000Z',
      cwd: '/repo',
    });
    expect(output.find((event) => event.type === 'message_update')).toMatchObject({
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        provider: 'nano-gpt',
        model: 'kimi-k2.6',
      },
    });
    expect(output.find((event) => event.type === 'turn_end')).toMatchObject({
      message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      toolResults: [],
    });
    expect(output.find((event) => event.type === 'agent_end')).toMatchObject({
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'ok' }] }],
      willRetry: false,
    });
  });

  it('starts a new agent cycle after a keep-alive turn and still deduplicates completion', () => {
    const project = createPiJsonProjector({ jobId: 'job-keepalive', cwd: '/repo' });
    const firstTurn: TimelineEvent[] = [
      { t: 1, type: 'run_start', specialist: 'reviewer' },
      { t: 2, type: 'turn', phase: 'start' },
      { t: 3, type: 'message', phase: 'start', role: 'assistant' },
      { t: 4, type: 'text', content: 'first' },
      { t: 5, type: 'message', phase: 'end', role: 'assistant' },
      { t: 6, type: 'turn', phase: 'end' },
      { t: 7, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1, output: 'first' },
      { t: 8, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1, output: 'first' },
    ];
    const secondTurn: TimelineEvent[] = [
      { t: 9, type: 'turn', phase: 'start' },
      { t: 10, type: 'message', phase: 'start', role: 'assistant' },
      { t: 11, type: 'text', content: 'second' },
      { t: 12, type: 'message', phase: 'end', role: 'assistant' },
      { t: 13, type: 'turn', phase: 'end' },
      { t: 14, type: 'run_complete', status: 'COMPLETE', elapsed_s: 1, output: 'second' },
    ];

    const output = [...firstTurn, ...secondTurn].flatMap(project);
    expect(output.filter((event) => event.type === 'session')).toHaveLength(1);
    expect(output.filter((event) => event.type === 'agent_start')).toHaveLength(2);
    expect(output.filter((event) => event.type === 'agent_end')).toHaveLength(2);
    expect(output.filter((event) => event.type === 'agent_settled')).toHaveLength(2);
    expect(output.filter((event) => event.type === 'agent_end')[1]).toMatchObject({
      messages: [{ content: [{ type: 'text', text: 'second' }] }],
    });
  });

  it('maps tool lifecycle events and omits specialist-only telemetry', () => {
    const project = createPiJsonProjector({ jobId: 'job-2', cwd: '/repo' });
    const output = ([
      { t: 1, type: 'meta', model: 'claude', backend: 'anthropic' },
      { t: 2, type: 'auto_commit_skipped', reason: 'no_worktree' },
      { t: 3, type: 'tool', phase: 'start', tool: 'read', tool_call_id: 'call-1', args: { path: 'a.ts' } },
      { t: 4, type: 'tool', phase: 'update', tool: 'read', tool_call_id: 'call-1' },
      { t: 5, type: 'tool', phase: 'end', tool: 'read', tool_call_id: 'call-1', result_summary: 'done', is_error: false },
    ] as TimelineEvent[]).flatMap(project);

    expect(output).toEqual([
      { type: 'session', version: 3, id: 'job-2', timestamp: '1970-01-01T00:00:00.003Z', cwd: '/repo' },
      { type: 'agent_start' },
      { type: 'tool_execution_start', toolCallId: 'call-1', toolName: 'read', args: { path: 'a.ts' } },
      { type: 'tool_execution_update', toolCallId: 'call-1', toolName: 'read', args: { path: 'a.ts' }, partialResult: undefined },
      { type: 'tool_execution_end', toolCallId: 'call-1', toolName: 'read', result: 'done', isError: false },
    ]);
  });
});
