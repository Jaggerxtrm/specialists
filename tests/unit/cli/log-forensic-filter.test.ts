import { describe, expect, it } from 'vitest';
import { isForensicAgentInternal } from '../../../src/cli/log.js';
import type { ForensicEvent } from '../../../src/specialist/forensic-events.js';

function ev(event_family: string, event_name: string): ForensicEvent {
  return {
    schema_version: 'xtrm.forensic.v1',
    timestamp: '2026-01-01T00:00:00Z',
    t_unix_ms: 0,
    severity: 'info',
    event_family,
    event_name,
    event_version: 1,
    resource: {} as never,
    correlation: {},
    body: {},
    redaction: { level: 'clean' as never },
  } as unknown as ForensicEvent;
}

describe('isForensicAgentInternal', () => {
  it.each([
    ['turn', 'turn.thinking'],
    ['turn', 'turn.message'],
    ['turn', 'turn.summarized'],
    ['tool', 'tool.call.started'],
    ['tool', 'tool.call.completed'],
    ['tool', 'tool.call.failed'],
    ['model', 'model.token_usage.recorded'],
    ['model', 'model.finish_reason.recorded'],
    ['model', 'model.meta'],
    ['mcp', 'mcp.call.started'],
    ['mcp', 'mcp.call.completed'],
    ['mcp', 'mcp.latency.observed'],
  ])('hides agent-internal %s/%s', (family, name) => {
    expect(isForensicAgentInternal(ev(family, name))).toBe(true);
  });

  it.each([
    ['job', 'job.started'],
    ['job', 'job.completed'],
    ['job', 'job.failed'],
    ['job', 'job.cancelled'],
    ['control', 'control.stop.recorded'],
    ['error', 'error.rpc'],
    ['error', 'error.extension'],
    ['git', 'git.auto_commit.succeeded'],
    ['review', 'review.verdict.pass'],
    ['chain', 'chain.ready_for_review'],
    ['worktree', 'worktree.merged'],
    ['process_health', 'process_health.stale_detected'],
    ['model', 'model.changed'],
    ['mcp', 'mcp.connected'],
    ['mcp', 'mcp.auth.failed'],
    ['mcp', 'mcp.rate_limited'],
  ])('surfaces runtime %s/%s', (family, name) => {
    expect(isForensicAgentInternal(ev(family, name))).toBe(false);
  });
});
