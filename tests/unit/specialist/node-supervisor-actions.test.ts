import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilitySqliteClient } from '../../../src/specialist/observability-sqlite.js';

const spawnSyncMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

vi.mock('../../../src/specialist/job-control.js', () => {
  class MockJobControl {
    async startJob(): Promise<string> { return 'job-dynamic-1'; }
    async stopJob(): Promise<void> {}
    async waitForTerminal(): Promise<{ status: string }> { return { status: 'done' }; }
    readStatus(): { status: string } { return { status: 'waiting' }; }
    readResult(): string | null { return null; }
    async resumeJob(): Promise<void> {}
    async steerJob(): Promise<void> {}
  }
  return { JobControl: MockJobControl };
});

const sqliteClient = {
  bootstrapNode: vi.fn(),
  upsertNodeRun: vi.fn(),
  upsertNodeMember: vi.fn(),
  appendNodeEvent: vi.fn(),
  readNodeRun: vi.fn().mockReturnValue(null),
  readNodeMembers: vi.fn().mockReturnValue([]),
  readNodeEvents: vi.fn().mockReturnValue([]),
  readStatus: vi.fn().mockReturnValue({ status: 'waiting' }),
  queryMemberContextHealth: vi.fn().mockReturnValue(null),
  readNodeMemory: vi.fn().mockReturnValue([]),
} satisfies Partial<ObservabilitySqliteClient>;

function createSupervisor(mod: any): any {
  return new mod.NodeSupervisor({
    nodeId: 'node-actions-1',
    nodeName: 'node-actions',
    coordinatorSpecialist: 'node-coordinator',
    members: [],
    sqliteClient: sqliteClient as ObservabilitySqliteClient,
    availableSpecialists: ['explorer', 'reviewer'],
    runOptions: { name: 'node-coordinator', prompt: 'x', keepAlive: true, contextDepth: 1 },
    runner: { run: vi.fn() },
    completionStrategy: 'manual',
  });
}

describe('NodeSupervisor Wave 2B action handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnSyncMock.mockReset();
  });

  it('create_bead executes bd create/dep and emits bead_created', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = createSupervisor(mod);

    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '{"id":"bd-101"}', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });

    (supervisor as any).executeCreateBeadAction({
      type: 'create_bead',
      title: 'Fix item',
      description: 'desc',
      bead_type: 'task',
      priority: 2,
      parent_bead_id: 'bd-parent',
      depends_on: ['bd-dep-1'],
    }, 'action-1');

    expect(spawnSyncMock).toHaveBeenCalled();
    expect(sqliteClient.appendNodeEvent).toHaveBeenCalledWith(
      'node-actions-1',
      expect.any(Number),
      'bead_created',
      expect.objectContaining({
        created_bead_id: 'bd-101',
        parent_bead_id: 'bd-parent',
      }),
    );
  });

  it('spawn_member dynamic persists member lineage and event', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = createSupervisor(mod);

    await (supervisor as any).spawnDynamicMember('phase-1', {
      member_key: 'fixer-1',
      role: 'explorer',
      bead_id: 'bd-201',
      scope: { paths: ['src'], mutates: true },
      depends_on: [],
      failure_policy: 'blocking',
      isolated: false,
      retry_of: null,
    });

    expect(sqliteClient.upsertNodeMember).toHaveBeenCalledWith(expect.objectContaining({
      member_id: 'fixer-1',
      generation: 1,
      phase_id: 'phase-1',
    }));
    expect(sqliteClient.appendNodeEvent).toHaveBeenCalledWith(
      'node-actions-1',
      expect.any(Number),
      'member_spawned_dynamic',
      expect.objectContaining({ member_key: 'fixer-1', phase_id: 'phase-1' }),
    );
  });

  it('complete_node manual transitions to done and emits node_completed', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = createSupervisor(mod);
    (supervisor as any).status = 'running';

    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });

    await (supervisor as any).executeCompleteNodeAction({
      type: 'complete_node',
      gate_results: [],
      report_payload_ref: 'report-1',
    });

    expect((supervisor as any).status).toBe('done');
    expect(sqliteClient.appendNodeEvent).toHaveBeenCalledWith(
      'node-actions-1',
      expect.any(Number),
      'node_completed',
      expect.objectContaining({ final_state: 'done' }),
    );
  });
});
