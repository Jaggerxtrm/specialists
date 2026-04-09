import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilitySqliteClient } from '../../src/specialist/observability-sqlite.js';

const spawnSyncMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

vi.mock('../../src/specialist/job-control.js', () => {
  let counter = 0;
  class MockJobControl {
    async startJob(): Promise<string> {
      counter += 1;
      return `job-${counter}`;
    }
    async stopJob(): Promise<void> {}
    async waitForTerminal(): Promise<{ status: string }> { return { status: 'done' }; }
    readStatus(): { status: string } { return { status: 'done' }; }
    readResult(): string | null { return null; }
    async resumeJob(): Promise<void> {}
    async steerJob(): Promise<void> {}
  }
  return { JobControl: MockJobControl };
});

function createSqliteStub() {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    client: {
      bootstrapNode: vi.fn(),
      upsertNodeRun: vi.fn(),
      upsertNodeMember: vi.fn(),
      appendNodeEvent: vi.fn((_nodeId: string, _t: number, type: string, payload: Record<string, unknown>) => {
        events.push({ type, payload });
      }),
      readNodeRun: vi.fn().mockReturnValue(null),
      readNodeMembers: vi.fn().mockReturnValue([]),
      readNodeEvents: vi.fn().mockReturnValue([]),
      readStatus: vi.fn().mockReturnValue({ status: 'waiting' }),
      queryMemberContextHealth: vi.fn().mockReturnValue(null),
      readNodeMemory: vi.fn().mockReturnValue([]),
    } satisfies Partial<ObservabilitySqliteClient> as ObservabilitySqliteClient,
  };
}

describe('node actions integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnSyncMock.mockReset();
  });

  it('executes create_bead + spawn_member + complete_node(manual) flow', async () => {
    const { client, events } = createSqliteStub();
    const { NodeSupervisor } = await import('../../src/specialist/node-supervisor.js');

    const supervisor = new NodeSupervisor({
      nodeId: 'node-int-1',
      nodeName: 'integration-node',
      coordinatorSpecialist: 'node-coordinator',
      members: [],
      sqliteClient: client,
      runOptions: { name: 'node-coordinator', prompt: 'run', keepAlive: true, contextDepth: 1 },
      runner: { run: vi.fn() },
      availableSpecialists: ['explorer'],
      completionStrategy: 'manual',
    });

    (supervisor as any).status = 'running';

    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '{"id":"bd-child-1"}', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });

    const payload = JSON.stringify({
      summary: 'run phase and complete',
      node_status: 'complete',
      phases: [{
        phase_id: 'phase-impl-1',
        phase_kind: 'impl',
        barrier: 'all_members_terminal',
        members: [{
          member_key: 'worker-1',
          role: 'explorer',
          bead_id: 'bd-child-1',
          scope: { paths: ['src'], mutates: true },
          depends_on: [],
          failure_policy: 'blocking',
          isolated: false,
          retry_of: null,
        }],
      }],
      memory_patch: [],
      actions: [{
        type: 'create_bead',
        title: 'child task',
        description: 'desc',
        bead_type: 'task',
        priority: 2,
        parent_bead_id: 'bd-parent-1',
        depends_on: [],
      }, {
        type: 'complete_node',
        gate_results: [],
        report_payload_ref: 'report-final',
      }],
      validation: { ok: true },
    });

    await (supervisor as any).handleCoordinatorOutput(payload);

    expect((supervisor as any).status).toBe('done');
    expect(events.some((event) => event.type === 'bead_created')).toBe(true);
    expect(events.some((event) => event.type === 'member_spawned_dynamic')).toBe(true);
    expect(events.some((event) => event.type === 'node_completed')).toBe(true);
  });
});
