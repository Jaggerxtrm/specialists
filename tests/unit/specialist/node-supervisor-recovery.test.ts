import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilitySqliteClient } from '../../../src/specialist/observability-sqlite.js';

vi.mock('../../../src/specialist/job-control.js', () => {
  let counter = 0;
  class MockJobControl {
    async startJob(): Promise<string> { counter += 1; return `coord-${counter}`; }
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
  readNodeMemory: vi.fn().mockReturnValue([{ entry_id: 'm1', summary: 'x' }]),
  queryMemberContextHealth: vi.fn().mockReturnValue(null),
  readResult: vi.fn().mockReturnValue(null),
} satisfies Partial<ObservabilitySqliteClient>;

describe('NodeSupervisor Wave 3 coordinator recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restarts coordinator once and emits coordinator_restarted', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = new mod.NodeSupervisor({
      nodeId: 'node-rec-1',
      nodeName: 'node',
      coordinatorSpecialist: 'node-coordinator',
      members: [],
      sqliteClient: sqliteClient as ObservabilitySqliteClient,
      runOptions: { name: 'node-coordinator', prompt: 'x', keepAlive: true },
      runner: { run: vi.fn() },
    });

    const ok = await (supervisor as any).restartCoordinator('watchdog_no_progress');

    expect(ok).toBe(true);
    expect(sqliteClient.appendNodeEvent).toHaveBeenCalledWith(
      'node-rec-1',
      expect.any(Number),
      'coordinator_restarted',
      expect.objectContaining({ reason: 'watchdog_no_progress', generation: 1 }),
    );
  });

  it('fails cleanly after second restart attempt', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = new mod.NodeSupervisor({
      nodeId: 'node-rec-2',
      nodeName: 'node',
      coordinatorSpecialist: 'node-coordinator',
      members: [],
      sqliteClient: sqliteClient as ObservabilitySqliteClient,
      runOptions: { name: 'node-coordinator', prompt: 'x', keepAlive: true },
      runner: { run: vi.fn() },
    });

    await (supervisor as any).restartCoordinator('empty-output');
    const second = await (supervisor as any).restartCoordinator('empty-output-again');

    expect(second).toBe(false);
    expect(supervisor.getStatus()).toBe('failed');
  });

  it('recovery prompt includes member registry and action ledger context', async () => {
    const mod = await import('../../../src/specialist/node-supervisor.js');
    const supervisor = new mod.NodeSupervisor({
      nodeId: 'node-rec-3',
      nodeName: 'node',
      coordinatorSpecialist: 'node-coordinator',
      members: [{ memberId: 'member-a', specialist: 'explorer' }],
      sqliteClient: sqliteClient as ObservabilitySqliteClient,
      runOptions: { name: 'node-coordinator', prompt: 'x', keepAlive: true },
      runner: { run: vi.fn() },
    });

    const prompt = (supervisor as any).buildCoordinatorRecoveryPrompt('coordinator_crash');
    expect(prompt).toContain('member_registry');
    expect(prompt).toContain('action_ledger');
    expect(prompt).toContain('state_digest');
  });
});
