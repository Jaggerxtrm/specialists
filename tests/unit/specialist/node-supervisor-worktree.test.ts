import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilitySqliteClient } from '../../../src/specialist/observability-sqlite.js';

const provisionWorktreeMock = vi.fn();
vi.mock('../../../src/specialist/worktree.js', () => ({
  provisionWorktree: (...args: unknown[]) => provisionWorktreeMock(...args),
}));

vi.mock('../../../src/specialist/job-control.js', () => {
  class MockJobControl {
    async startJob(): Promise<string> { return 'job-1'; }
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
  readNodeMemory: vi.fn().mockReturnValue([]),
  queryMemberContextHealth: vi.fn().mockReturnValue(null),
  readResult: vi.fn().mockReturnValue(null),
} satisfies Partial<ObservabilitySqliteClient>;

describe('NodeSupervisor Wave 3 worktree lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    provisionWorktreeMock.mockReset();
    provisionWorktreeMock.mockReturnValue({
      branch: 'feature/node-1-member-a',
      worktreePath: '/tmp/wt/member-a',
      reused: false,
    });
  });

  it('provisions static worktree for members[].worktree=true', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = new mod.NodeSupervisor({
      nodeId: 'node-1',
      nodeName: 'node',
      coordinatorSpecialist: 'node-coordinator',
      members: [{ memberId: 'member-a', specialist: 'explorer', worktree: true }],
      sqliteClient: sqliteClient as ObservabilitySqliteClient,
      runOptions: { name: 'node-coordinator', prompt: 'x', keepAlive: true },
      runner: { run: vi.fn() },
    });

    await (supervisor as any).spawnMembers();

    expect(provisionWorktreeMock).toHaveBeenCalled();
    expect(sqliteClient.appendNodeEvent).toHaveBeenCalledWith(
      'node-1',
      expect.any(Number),
      'worktree_provisioned',
      expect.objectContaining({ member_key: 'member-a', worktree_path: '/tmp/wt/member-a' }),
    );
  });

  it('uses worktree_from workspace when spawning dynamic members', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = new mod.NodeSupervisor({
      nodeId: 'node-1',
      nodeName: 'node',
      coordinatorSpecialist: 'node-coordinator',
      members: [{ memberId: 'member-a', specialist: 'explorer', worktreePath: '/tmp/wt/source' }],
      sqliteClient: sqliteClient as ObservabilitySqliteClient,
      runOptions: { name: 'node-coordinator', prompt: 'x', keepAlive: true },
      runner: { run: vi.fn() },
      availableSpecialists: ['explorer'],
    });

    await (supervisor as any).spawnDynamicMember('phase-1', {
      member_key: 'fixer-1',
      role: 'explorer',
      bead_id: 'bd-1',
      scope: { paths: ['src'], mutates: true },
      depends_on: [],
      failure_policy: 'blocking',
      isolated: false,
      retry_of: null,
    }, { worktreeFrom: 'member-a' });

    expect(sqliteClient.upsertNodeMember).toHaveBeenCalledWith(expect.objectContaining({
      member_id: 'fixer-1',
      worktree_path: '/tmp/wt/source',
    }));
  });

  it('fails when worktree_from target has no worktree', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = new mod.NodeSupervisor({
      nodeId: 'node-1',
      nodeName: 'node',
      coordinatorSpecialist: 'node-coordinator',
      members: [{ memberId: 'member-a', specialist: 'explorer' }],
      sqliteClient: sqliteClient as ObservabilitySqliteClient,
      runOptions: { name: 'node-coordinator', prompt: 'x', keepAlive: true },
      runner: { run: vi.fn() },
      availableSpecialists: ['explorer'],
    });

    await expect((supervisor as any).spawnDynamicMember('phase-1', {
      member_key: 'fixer-2',
      role: 'explorer',
      bead_id: 'bd-2',
      scope: { paths: ['src'], mutates: true },
      depends_on: [],
      failure_policy: 'blocking',
      isolated: false,
      retry_of: null,
    }, { worktreeFrom: 'member-a' })).rejects.toThrow("has no worktree_path");
  });
});
