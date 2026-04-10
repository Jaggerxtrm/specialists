import { describe, expect, it } from 'vitest';
import {
  EPIC_STATES,
  canTransitionEpicState,
  evaluateEpicMergeReadiness,
  isEpicTerminalState,
  isEpicUnresolvedState,
  resolveChainId,
  transitionEpicState,
} from '../../../src/specialist/epic-lifecycle.js';

describe('epic-lifecycle', () => {
  it('supports canonical positive transition paths', () => {
    const mergedPath = ['open', 'resolving', 'merge_ready', 'merged'] as const;
    const failedPath = ['open', 'resolving', 'failed'] as const;
    const abandonedPath = ['open', 'abandoned'] as const;

    for (const path of [mergedPath, failedPath, abandonedPath]) {
      let current = path[0];
      for (const next of path.slice(1)) {
        current = transitionEpicState(current, next);
      }
      expect(current).toBe(path[path.length - 1]);
    }
  });

  it('rejects deterministic invalid transitions', () => {
    expect(canTransitionEpicState('open', 'merged')).toBe(false);
    expect(canTransitionEpicState('failed', 'resolving')).toBe(false);
    expect(canTransitionEpicState('abandoned', 'merge_ready')).toBe(false);

    expect(() => transitionEpicState('open', 'merged')).toThrow('Invalid epic transition: open -> merged');
    expect(() => transitionEpicState('failed', 'open')).toThrow('Invalid epic transition: failed -> open');
  });

  it('keeps terminal states terminal and unresolved states non-terminal', () => {
    for (const state of EPIC_STATES) {
      const terminal = isEpicTerminalState(state);
      expect(isEpicUnresolvedState(state)).toBe(!terminal);

      if (!terminal) continue;
      for (const next of EPIC_STATES) {
        expect(canTransitionEpicState(state, next)).toBe(false);
      }
    }
  });

  it('resolves one canonical chain identifier with deterministic priority', () => {
    expect(resolveChainId({ id: 'job-1', chain_id: 'chain-1' })).toBe('chain-1');
    expect(resolveChainId({ id: 'job-2', worktree_owner_job_id: 'owner-2' })).toBe('owner-2');
    expect(resolveChainId({ id: 'job-3', worktree_path: '/tmp/wt' })).toBe('job-3');
    expect(resolveChainId({ id: 'job-4' })).toBeUndefined();
  });

  it('requires merge_ready and all chains terminal before publication readiness', () => {
    const blocked = evaluateEpicMergeReadiness({
      epicId: 'unitAI-epic',
      epicStatus: 'merge_ready',
      chainStatuses: [
        { chainId: 'chain-a', hasRunningJob: false },
        { chainId: 'chain-b', hasRunningJob: true },
      ],
    });

    expect(blocked.isReady).toBe(false);
    expect(blocked.blockingChains).toEqual(['chain-b']);
    expect(blocked.summary).toContain('blocked by active chains');

    const degraded = evaluateEpicMergeReadiness({
      epicId: 'unitAI-epic',
      epicStatus: 'resolving',
      chainStatuses: [
        { chainId: 'chain-a', hasRunningJob: false },
      ],
    });

    expect(degraded.isReady).toBe(false);
    expect(degraded.blockingChains).toEqual([]);
    expect(degraded.summary).toContain('expected merge_ready before publication');

    const standaloneReady = evaluateEpicMergeReadiness({
      epicId: 'unitAI-standalone',
      epicStatus: 'merge_ready',
      chainStatuses: [],
    });

    expect(standaloneReady.isReady).toBe(true);
    expect(standaloneReady.blockingChains).toEqual([]);
    expect(standaloneReady.summary).toContain('merge-ready and all chains are terminal');
  });
});
