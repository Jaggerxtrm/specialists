import { describe, expect, it } from 'vitest';
import { derivePersistedChainIdentity } from '../../../src/specialist/chain-identity.js';

describe('chain-identity', () => {
  it('resolves chain root and reused jobs to one canonical chain identity', () => {
    const chainRoot = derivePersistedChainIdentity({
      id: 'job-root',
      bead_id: 'unitAI-chain-root',
      worktree_path: '/tmp/worktree-a',
      worktree_owner_job_id: 'job-root',
    });

    const reusedJob = derivePersistedChainIdentity(
      {
        id: 'job-review',
        bead_id: 'unitAI-review',
        worktree_path: '/tmp/worktree-a',
        worktree_owner_job_id: 'job-root',
      },
      { bead_id: 'unitAI-chain-root' },
    );

    expect(chainRoot).toEqual({
      chain_kind: 'chain',
      chain_id: 'job-root',
      chain_root_job_id: 'job-root',
      chain_root_bead_id: 'unitAI-chain-root',
    });

    expect(reusedJob).toEqual({
      chain_kind: 'chain',
      chain_id: 'job-root',
      chain_root_job_id: 'job-root',
      chain_root_bead_id: 'unitAI-chain-root',
    });
  });

  it('keeps existing chain_id as canonical for reused jobs attached to existing chain', () => {
    const identity = derivePersistedChainIdentity({
      id: 'job-fix-loop',
      bead_id: 'unitAI-fix-loop',
      worktree_path: '/tmp/worktree-b',
      worktree_owner_job_id: 'job-owner',
      chain_id: 'chain-existing',
      chain_root_job_id: 'job-root',
      chain_root_bead_id: 'unitAI-chain-root',
    });

    expect(identity).toEqual({
      chain_kind: 'chain',
      chain_id: 'chain-existing',
      chain_root_job_id: 'job-root',
      chain_root_bead_id: 'unitAI-chain-root',
    });
  });

  it('handles historical rows with missing new columns deterministically', () => {
    const historical = derivePersistedChainIdentity({
      id: 'job-historical',
      worktree_path: '/tmp/worktree-legacy',
    });

    expect(historical).toEqual({
      chain_kind: 'chain',
      chain_id: 'job-historical',
      chain_root_job_id: 'job-historical',
      chain_root_bead_id: undefined,
    });
  });

  it('never misclassifies standalone non-worktree jobs as chain members', () => {
    const prepJob = derivePersistedChainIdentity({
      id: 'job-prep',
      bead_id: 'unitAI-prep',
    });

    expect(prepJob).toEqual({ chain_kind: 'prep' });
  });
});
