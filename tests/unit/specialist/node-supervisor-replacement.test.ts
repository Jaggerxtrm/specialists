import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilitySqliteClient } from '../../../src/specialist/observability-sqlite.js';

vi.mock('../../../src/specialist/job-control.js', () => {
  let n = 0;
  class MockJobControl {
    async startJob(): Promise<string> { n += 1; return `job-${n}`; }
    async stopJob(): Promise<void> {}
    async waitForTerminal(): Promise<{ status: string }> { return { status: 'done' }; }
    readStatus(): { status: string } { return { status: 'waiting' }; }
    readResult(): string | null { return 'previous output'; }
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
  readNodeMemory: vi.fn().mockReturnValue([]),
  queryMemberContextHealth: vi.fn().mockReturnValue(null),
  readResult: vi.fn().mockReturnValue('previous output'),
} satisfies Partial<ObservabilitySqliteClient>;

describe('NodeSupervisor Wave 3 replacements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments generation and emits member_replaced', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = new mod.NodeSupervisor({
      nodeId: 'node-r1',
      nodeName: 'node',
      coordinatorSpecialist: 'node-coordinator',
      members: [{ memberId: 'member-a', specialist: 'explorer', worktreePath: '/tmp/wt/a' }],
      sqliteClient: sqliteClient as ObservabilitySqliteClient,
      runOptions: { name: 'node-coordinator', prompt: 'x', keepAlive: true },
      runner: { run: vi.fn() },
      availableSpecialists: ['explorer'],
    });

    await (supervisor as any).spawnMembers();
    const member = (supervisor as any).members.get('member-a');
    member.status = 'done';

    await (supervisor as any).spawnDynamicMember('fix-1', {
      member_key: 'member-a',
      role: 'explorer',
      bead_id: 'bd-fix',
      scope: { paths: ['src'], mutates: true },
      depends_on: [],
      failure_policy: 'blocking',
      isolated: false,
      retry_of: 'member-a',
    });

    expect((supervisor as any).members.get('member-a').generation).toBe(2);
    expect(sqliteClient.appendNodeEvent).toHaveBeenCalledWith(
      'node-r1',
      expect.any(Number),
      'member_replaced',
      expect.objectContaining({ member_key: 'member-a', previous_generation: 1, new_generation: 2 }),
    );
  });

  it('rejects replacement when previous member is still running', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = new mod.NodeSupervisor({
      nodeId: 'node-r2',
      nodeName: 'node',
      coordinatorSpecialist: 'node-coordinator',
      members: [{ memberId: 'member-a', specialist: 'explorer' }],
      sqliteClient: sqliteClient as ObservabilitySqliteClient,
      runOptions: { name: 'node-coordinator', prompt: 'x', keepAlive: true },
      runner: { run: vi.fn() },
      availableSpecialists: ['explorer'],
    });

    await (supervisor as any).spawnMembers();
    const member = (supervisor as any).members.get('member-a');
    member.status = 'running';

    await expect((supervisor as any).spawnDynamicMember('fix-2', {
      member_key: 'member-a',
      role: 'explorer',
      bead_id: 'bd-fix',
      scope: { paths: ['src'], mutates: true },
      depends_on: [],
      failure_policy: 'blocking',
      isolated: false,
      retry_of: 'member-a',
    })).rejects.toThrow('not terminal');
  });
});
