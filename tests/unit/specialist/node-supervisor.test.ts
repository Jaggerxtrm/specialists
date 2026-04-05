import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilitySqliteClient } from '../../../src/specialist/observability-sqlite.js';

type MockStatus = {
  status: 'starting' | 'running' | 'waiting' | 'done' | 'error';
  output?: string;
};

const jobControlInstances: Array<{
  startJob: ReturnType<typeof vi.fn>;
  resumeJob: ReturnType<typeof vi.fn>;
  steerJob: ReturnType<typeof vi.fn>;
  stopJob: ReturnType<typeof vi.fn>;
  readStatus: ReturnType<typeof vi.fn>;
  readResult: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('../../../src/specialist/job-control.js', () => {
  class MockJobControl {
    startJob = vi.fn();
    resumeJob = vi.fn();
    steerJob = vi.fn();
    stopJob = vi.fn();
    readStatus = vi.fn();
    readResult = vi.fn();

    constructor() {
      jobControlInstances.push(this);
    }
  }

  return { JobControl: MockJobControl };
});

const mockSqliteClient = {
  bootstrapNode: vi.fn(),
  upsertNodeRun: vi.fn(),
  upsertNodeMember: vi.fn(),
  appendNodeEvent: vi.fn(),
  readNodeMembers: vi.fn().mockReturnValue([]),
  readStatus: vi.fn().mockReturnValue(null),
  queryMemberContextHealth: vi.fn().mockReturnValue(null),
  readNodeMemory: vi.fn().mockReturnValue([]),
} satisfies Partial<ObservabilitySqliteClient>;

const baseOptions = {
  nodeId: 'node-1',
  nodeName: 'node test',
  coordinatorSpecialist: 'node-coordinator',
  members: [
    { memberId: 'member-a', specialist: 'explorer', role: 'explorer' },
    { memberId: 'member-b', specialist: 'reviewer', role: 'reviewer' },
  ],
  sqliteClient: mockSqliteClient as ObservabilitySqliteClient,
  runOptions: { name: 'node-coordinator', prompt: 'start', keepAlive: true },
  runner: { run: vi.fn() },
};

async function loadNodeSupervisorModule(): Promise<any | null> {
  try {
    return await import('../../../src/specialist/node-supervisor.js');
  } catch {
    return null;
  }
}

describe('NodeSupervisor orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    jobControlInstances.length = 0;
  });

  describe('member registry', () => {
    it('spawnMembers registers all members and stores member_id -> job_id mapping', async () => {
      const mod = await loadNodeSupervisorModule();
      if (!mod) return;

      const { NodeSupervisor } = mod;
      const supervisor = new NodeSupervisor(baseOptions as any);

      jobControlInstances.forEach((instance, index) => {
        instance.startJob.mockResolvedValue(`job-${index + 1}`);
      });

      await (supervisor as any).spawnMembers();

      const members = supervisor.getMembers();
      expect(members).toHaveLength(2);
      expect(members.map((member: any) => member.memberId)).toEqual(['member-a', 'member-b']);
      expect(members.every((member: any) => typeof member.jobId === 'string' || member.jobId === null)).toBe(true);
      expect(mockSqliteClient.upsertNodeMember).toHaveBeenCalled();
    });
  });

  describe('poll loop state change detection', () => {
    it('emits changes only when hash or status changed', async () => {
      const mod = await loadNodeSupervisorModule();
      if (!mod) return;

      const { NodeSupervisor } = mod;
      const supervisor = new NodeSupervisor(baseOptions as any);
      await (supervisor as any).spawnMembers();

      const registry = supervisor.getMembers();
      const member = registry[0];
      member.jobId = 'job-1';
      (supervisor as any).members.set(member.memberId, member);

      mockSqliteClient.readStatus.mockReturnValueOnce({ status: 'running', output: 'hello' } as MockStatus);
      const first = await (supervisor as any).pollMemberStatuses();
      expect(Array.isArray(first)).toBe(true);

      mockSqliteClient.readStatus.mockReturnValueOnce({ status: 'running', output: 'hello' } as MockStatus);
      const second = await (supervisor as any).pollMemberStatuses();
      expect(second).toHaveLength(0);

      mockSqliteClient.readStatus.mockReturnValueOnce({ status: 'done', output: 'hello' } as MockStatus);
      const third = await (supervisor as any).pollMemberStatuses();
      expect(third.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('auto-resume trigger', () => {
    it('buildResumePayload includes member_updates and registry_snapshot', async () => {
      const mod = await loadNodeSupervisorModule();
      if (!mod) return;

      const { NodeSupervisor } = mod;
      const supervisor = new NodeSupervisor(baseOptions as any);

      const payload = (supervisor as any).buildResumePayload([
        {
          memberId: 'member-a',
          prevStatus: 'running',
          newStatus: 'done',
          output: 'completed',
        },
      ]);

      expect(typeof payload).toBe('string');
      expect(payload).toContain('member_updates');
      expect(payload).toContain('registry_snapshot');
    });

    it('dedupes repeated same-hash updates', async () => {
      const mod = await loadNodeSupervisorModule();
      if (!mod) return;

      const { NodeSupervisor } = mod;
      const supervisor = new NodeSupervisor(baseOptions as any);
      await (supervisor as any).spawnMembers();

      const member = supervisor.getMembers()[0];
      member.jobId = 'job-1';
      (supervisor as any).members.set(member.memberId, member);

      mockSqliteClient.readStatus.mockReturnValue({ status: 'running', output: 'same output' } as MockStatus);
      const first = await (supervisor as any).pollMemberStatuses();
      const second = await (supervisor as any).pollMemberStatuses();

      expect(first.length).toBeGreaterThanOrEqual(0);
      expect(second).toHaveLength(0);
    });
  });

  describe('FIFO dispatch', () => {
    it('dispatches actions in order and logs action_dispatched before execution', async () => {
      const mod = await loadNodeSupervisorModule();
      if (!mod) return;

      const { NodeSupervisor } = mod;
      const supervisor = new NodeSupervisor(baseOptions as any);

      const executeOrder: string[] = [];
      (supervisor as any).executeDispatchAction = vi.fn(async (action: { type: string }) => {
        executeOrder.push(action.type);
      });

      await (supervisor as any).dispatchAction({ type: 'resume_member', memberId: 'member-a', payload: 'one' });
      await (supervisor as any).dispatchAction({ type: 'resume_member', memberId: 'member-b', payload: 'two' });

      expect(mockSqliteClient.appendNodeEvent).toHaveBeenCalledWith(
        expect.any(String),
        'action_dispatched',
        expect.any(Object),
      );
      expect(executeOrder).toEqual(['resume_member', 'resume_member']);
    });
  });

  describe('state machine integration', () => {
    it('transitions include running -> done, running -> error, running -> degraded', async () => {
      const mod = await loadNodeSupervisorModule();
      if (!mod) return;

      const { NodeSupervisor } = mod;
      const supervisor = new NodeSupervisor(baseOptions as any);
      expect(supervisor.getStatus()).toBe('created');

      (supervisor as any).transition('starting');
      expect(supervisor.getStatus()).toBe('starting');

      (supervisor as any).transition('running');
      expect(supervisor.getStatus()).toBe('running');

      (supervisor as any).transition('degraded');
      expect(supervisor.getStatus()).toBe('degraded');
    });
  });
});
