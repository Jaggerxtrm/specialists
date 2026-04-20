import { describe, expect, it } from 'vitest';

import { syncEpicState } from '../../../src/specialist/epic-reconciler.js';

describe('syncEpicState stale chain cleanup', () => {
  it('prunes stale chain refs during --apply and unblocks readiness state', () => {
    const epicRun = {
      epic_id: 'unitAI-gc2a',
      status: 'resolving',
      status_json: '{}',
      updated_at_ms: 1,
    };

    const chainMembership = [{ chain_id: 'chain-stale', epic_id: 'unitAI-gc2a' }];

    const sqlite = {
      readEpicRun: () => epicRun,
      listEpicChains: () => chainMembership,
      listStatuses: () => [],
      listChainJobIds: (_chainId: string) => [],
      readResult: (_jobId: string) => null,
      upsertStatus: () => undefined,
      deleteEpicChainMembership: (_epicId: string, chainIds: readonly string[]) => {
        const deleted = [...chainIds];
        chainMembership.splice(0, chainMembership.length);
        return deleted;
      },
      upsertEpicRun: (next: any) => {
        epicRun.status = next.status;
        epicRun.status_json = next.status_json;
        epicRun.updated_at_ms = next.updated_at_ms;
      },
    } as any;

    const result = syncEpicState(sqlite, 'unitAI-gc2a', true);

    expect(result.drift.stale_chain_refs).toEqual(['chain-stale']);
    expect(result.repairs.stale_chain_refs_pruned).toEqual(['chain-stale']);
    expect(result.readiness_before.readiness_state).toBe('resolving');
    expect(result.readiness_after.readiness_state).toBe('merge_ready');
    expect(epicRun.status).toBe('merge_ready');
  });
});
