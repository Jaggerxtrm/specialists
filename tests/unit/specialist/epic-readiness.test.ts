import { describe, expect, it } from 'vitest';
import { evaluateEpicReadinessSummary } from '../../../src/specialist/epic-readiness.js';

describe('epic-readiness', () => {
  it('moves open epics into resolving while prep or chain jobs are active', () => {
    const summary = evaluateEpicReadinessSummary({
      epicId: 'unitAI-epic',
      persistedState: 'open',
      prepJobs: [
        {
          id: 'prep-1',
          specialist: 'explorer',
          status: 'running',
          started_at_ms: 1,
        },
      ],
      chainInputs: [
        {
          chain_id: 'chain-a',
          jobs: [
            {
              id: 'chain-a-1',
              specialist: 'executor',
              status: 'running',
              started_at_ms: 2,
            },
          ],
        },
      ],
    });

    expect(summary.readiness_state).toBe('unresolved');
    expect(summary.next_state).toBe('resolving');
    expect(summary.can_transition).toBe(true);
  });

  it('marks epics merge_ready only when prep is terminal and every chain has reviewer PASS', () => {
    const summary = evaluateEpicReadinessSummary({
      epicId: 'unitAI-epic',
      persistedState: 'resolving',
      prepJobs: [
        {
          id: 'prep-1',
          specialist: 'explorer',
          status: 'done',
          started_at_ms: 1,
        },
      ],
      chainInputs: [
        {
          chain_id: 'chain-a',
          jobs: [
            {
              id: 'exec-1',
              specialist: 'executor',
              status: 'done',
              started_at_ms: 1,
            },
            {
              id: 'review-1',
              specialist: 'reviewer',
              status: 'done',
              started_at_ms: 2,
              result_text: '## Compliance Verdict\n- Verdict: PASS',
            },
          ],
        },
      ],
    });

    expect(summary.readiness_state).toBe('merge_ready');
    expect(summary.next_state).toBe('merge_ready');
    expect(summary.chains[0]?.reviewer_verdict).toBe('pass');
  });

  it('keeps chains blocked when fix-loop work finished but reviewer PASS is missing', () => {
    const summary = evaluateEpicReadinessSummary({
      epicId: 'unitAI-epic',
      persistedState: 'resolving',
      prepJobs: [],
      chainInputs: [
        {
          chain_id: 'chain-a',
          jobs: [
            {
              id: 'review-1',
              specialist: 'reviewer',
              status: 'done',
              started_at_ms: 1,
              result_text: '## Compliance Verdict\n- Verdict: PARTIAL',
            },
            {
              id: 'fix-1',
              specialist: 'executor',
              status: 'done',
              started_at_ms: 2,
            },
          ],
        },
      ],
    });

    expect(summary.readiness_state).toBe('resolving');
    expect(summary.chains[0]?.state).toBe('blocked');
    expect(summary.chains[0]?.blocking_reason).toContain('rerun reviewer');
  });

  it('marks epic failed on errored prep jobs or failed reviewer verdict', () => {
    const prepFailed = evaluateEpicReadinessSummary({
      epicId: 'unitAI-prep-failed',
      persistedState: 'resolving',
      prepJobs: [
        {
          id: 'prep-1',
          specialist: 'explorer',
          status: 'error',
          started_at_ms: 1,
        },
      ],
      chainInputs: [],
    });

    const chainFailed = evaluateEpicReadinessSummary({
      epicId: 'unitAI-chain-failed',
      persistedState: 'resolving',
      prepJobs: [],
      chainInputs: [
        {
          chain_id: 'chain-a',
          jobs: [
            {
              id: 'review-1',
              specialist: 'reviewer',
              status: 'done',
              started_at_ms: 1,
              result_text: '## Compliance Verdict\n- Verdict: FAIL',
            },
          ],
        },
      ],
    });

    expect(prepFailed.readiness_state).toBe('failed');
    expect(chainFailed.readiness_state).toBe('failed');
    expect(chainFailed.next_state).toBe('failed');
  });

  it('supports prep-only epics and chain migration gaps explicitly', () => {
    const prepOnly = evaluateEpicReadinessSummary({
      epicId: 'unitAI-prep-only',
      persistedState: 'resolving',
      prepJobs: [
        {
          id: 'prep-1',
          specialist: 'explorer',
          status: 'done',
          started_at_ms: 1,
        },
      ],
      chainInputs: [],
    });

    const migrationGap = evaluateEpicReadinessSummary({
      epicId: 'unitAI-migration-gap',
      persistedState: 'resolving',
      prepJobs: [],
      chainInputs: [
        {
          chain_id: 'chain-missing',
          jobs: [],
        },
      ],
    });

    expect(prepOnly.readiness_state).toBe('merge_ready');
    expect(migrationGap.readiness_state).toBe('resolving');
    expect(migrationGap.chains[0]?.blocking_reason).toContain('No persisted chain jobs');
  });
});
