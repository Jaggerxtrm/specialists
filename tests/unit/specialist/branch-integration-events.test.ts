import { describe, expect, it } from 'vitest';
import {
  BRANCH_INTEGRATION_SCHEMA_VERSION,
  createBranchIntegrationEvent,
} from '../../../src/specialist/branch-integration-events.js';

describe('createBranchIntegrationEvent', () => {
  const base = {
    source: { job_id: 'job-executor', branch: 'sp/executor-123', worktree: '/repo/.xtrm/worktrees/sp-executor-123' },
    target: { branch: 'xt/coordinator-epic', worktree: '/repo/.xtrm/worktrees/coordinator-epic' },
    commit: 'abc123',
  };

  it('builds the audit-shaped xtrm.branch.integration.v1 result record', () => {
    const event = createBranchIntegrationEvent({ ...base, t_unix_ms: 1_700_000_000_000 });
    expect(event).toMatchObject({
      schema_version: BRANCH_INTEGRATION_SCHEMA_VERSION,
      source: base.source,
      target: base.target,
      status: 'merged',
      commit: 'abc123',
      t_unix_ms: 1_700_000_000_000,
      timestamp: new Date(1_700_000_000_000).toISOString(),
    });
  });

  it('defaults status to merged and derives timestamp from t_unix_ms', () => {
    const event = createBranchIntegrationEvent(base);
    expect(event.status).toBe('merged');
    expect(event.timestamp).toBe(new Date(event.t_unix_ms).toISOString());
  });

  it('carries an optional coordinator role only when provided', () => {
    const withRole = createBranchIntegrationEvent({
      ...base,
      target: { ...base.target, role: 'chain-coordinator' },
    });
    expect(withRole.target.role).toBe('chain-coordinator');
    expect('role' in createBranchIntegrationEvent(base).target).toBe(false);
  });
});
