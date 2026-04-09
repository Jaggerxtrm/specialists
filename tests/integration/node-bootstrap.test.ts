import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BeadsClient, buildBeadContext } from '../../src/specialist/beads.js';

type NodeMemberRow = {
  node_run_id: string;
  member_id: string;
  job_id?: string;
  specialist: string;
  model?: string;
  role?: string;
  status: string;
  enabled: boolean;
  generation: number;
};

type NodeRunRow = {
  id: string;
  node_name: string;
  status: string;
  coordinator_job_id?: string;
  started_at_ms?: number;
  updated_at_ms?: number;
  status_json?: string;
};

type NodeEventRow = {
  id: number;
  t: number;
  type: string;
  event_json: string;
};

const BEAD_ID = 'unitAI-3f7b.2';
const CONTEXT_DEPTH = 2;

const seamCapture = {
  jobControls: [] as Array<{ runOptions: Record<string, unknown>; startMeta: { nodeId: string; memberId: string } | null }>,
};

const sqliteState = {
  nodeRun: null as NodeRunRow | null,
  members: new Map<string, NodeMemberRow>(),
  events: [] as NodeEventRow[],
  eventId: 0,
};

function createInMemorySqliteStub() {
  return {
    close: vi.fn(),
    bootstrapNode: vi.fn(),
    readNodeRun: vi.fn((nodeId: string) => (sqliteState.nodeRun?.id === nodeId ? sqliteState.nodeRun : null)),
    upsertNodeRun: vi.fn((row: NodeRunRow) => {
      sqliteState.nodeRun = { ...sqliteState.nodeRun, ...row } as NodeRunRow;
    }),
    upsertNodeMember: vi.fn((row: NodeMemberRow) => {
      sqliteState.members.set(row.member_id, { ...row });
    }),
    readNodeMembers: vi.fn(() => [...sqliteState.members.values()]),
    appendNodeEvent: vi.fn((_: string, t: number, type: string, event: Record<string, unknown>) => {
      sqliteState.eventId += 1;
      sqliteState.events.push({
        id: sqliteState.eventId,
        t,
        type,
        event_json: JSON.stringify(event),
      });
    }),
    readNodeEvents: vi.fn((_: string, options?: { type?: string; limit?: number }) => {
      const filtered = options?.type
        ? sqliteState.events.filter((event) => event.type === options.type)
        : sqliteState.events;
      if (options?.limit) {
        return filtered.slice(-options.limit);
      }
      return filtered;
    }),
    readStatus: vi.fn((jobId: string) => {
      const coordinatorJobId = sqliteState.nodeRun?.coordinator_job_id;
      if (jobId === coordinatorJobId) {
        return { status: 'done' };
      }
      return { status: 'done' };
    }),
    queryMemberContextHealth: vi.fn(() => null),
    readNodeMemory: vi.fn(() => []),
    readResult: vi.fn(() => null),
  };
}

vi.mock('../../src/specialist/job-control.js', () => {
  let counter = 0;

  class MockJobControl {
    runOptions: Record<string, unknown>;
    startMeta: { nodeId: string; memberId: string } | null = null;

    constructor(args: { runOptions: Record<string, unknown> }) {
      this.runOptions = args.runOptions;
      seamCapture.jobControls.push(this);
    }

    async startJob(meta: { nodeId: string; memberId: string }): Promise<string> {
      this.startMeta = meta;
      counter += 1;
      return `job-${counter}`;
    }

    readStatus(): { status: string } {
      return { status: 'done' };
    }

    readResult(): string | null {
      return null;
    }

    async resumeJob(): Promise<void> {}

    async steerJob(): Promise<void> {}

    async stopJob(): Promise<void> {}

    async waitForTerminal(): Promise<{ status: string }> {
      return { status: 'done' };
    }
  }

  return { JobControl: MockJobControl };
});

const sqliteClient = createInMemorySqliteStub();

vi.mock('../../src/specialist/observability-sqlite.js', () => ({
  createObservabilitySqliteClient: vi.fn(() => sqliteClient),
}));

describe('node bootstrap single-flow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seamCapture.jobControls.length = 0;
    sqliteState.nodeRun = null;
    sqliteState.members.clear();
    sqliteState.events.length = 0;
    sqliteState.eventId = 0;
  });

  it('flows CLI bead/context-depth into coordinator bootstrap context and member run options', async () => {
    const beadClient = new BeadsClient();
    const bead = beadClient.readBead(BEAD_ID);
    expect(bead).toBeTruthy();

    const blockers = beadClient.getCompletedBlockers(BEAD_ID, CONTEXT_DEPTH);
    const expectedBeadContext = buildBeadContext(bead!, blockers);
    const expectedBeadGoalLine = expectedBeadContext.split('\n').find((line) => line.startsWith('# Task:'));

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { handleNodeCommand } = await import('../../src/cli/node.js');

    await handleNodeCommand([
      'run',
      '--inline',
      JSON.stringify({
        name: 'wave1-bootstrap',
        coordinator: 'node-coordinator',
        members: [
          { memberId: 'member-a', specialist: 'explorer', role: 'explorer' },
          { memberId: 'member-b', specialist: 'reviewer', role: 'reviewer' },
        ],
        initialPrompt: 'Coordinate and assign first task.',
      }),
      '--bead',
      BEAD_ID,
      '--context-depth',
      String(CONTEXT_DEPTH),
      '--json',
    ]);

    stdoutSpy.mockRestore();

    const coordinatorControl = seamCapture.jobControls.find((entry) => entry.startMeta?.memberId === 'coordinator');
    expect(coordinatorControl).toBeTruthy();

    const coordinatorPrompt = String(coordinatorControl!.runOptions.prompt ?? '');
    expect(coordinatorPrompt.startsWith('node_bootstrap_context:\n')).toBe(true);

    const promptPayload = JSON.parse(coordinatorPrompt.replace('node_bootstrap_context:\n', '')) as {
      node_id: string;
      source_bead_id: string;
      bead_goal: string;
      member_registry: Array<{ memberId: string }>;
    };

    expect(promptPayload.source_bead_id).toBe(BEAD_ID);
    expect(promptPayload.node_id).toMatch(/^wave1-bootstrap-/);
    expect(promptPayload.member_registry.map((member) => member.memberId)).toEqual(['member-a', 'member-b']);
    expect(promptPayload.bead_goal).toBe(expectedBeadGoalLine);

    const memberControls = seamCapture.jobControls.filter((entry) => entry.startMeta?.memberId?.startsWith('member-'));
    expect(memberControls).toHaveLength(2);
    for (const memberControl of memberControls) {
      expect(memberControl.runOptions.contextDepth).toBe(CONTEXT_DEPTH);
      const variables = memberControl.runOptions.variables as Record<string, string>;
      expect(variables.bead_id).toBe(BEAD_ID);
      expect(variables.node_id).toMatch(/^wave1-bootstrap-/);
    }
  });
});
