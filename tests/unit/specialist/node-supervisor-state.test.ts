import { describe, expect, it } from 'vitest';
import { NodeSupervisor, type NodeRunStatus } from '../../../src/specialist/node-supervisor.js';

const ALL_STATUSES: ReadonlyArray<NodeRunStatus> = [
  'created',
  'starting',
  'running',
  'waiting',
  'degraded',
  'error',
  'done',
  'stopped',
];

const VALID_TRANSITIONS: Readonly<Record<NodeRunStatus, ReadonlyArray<NodeRunStatus>>> = {
  created: ['starting', 'stopped'],
  starting: ['running', 'error', 'stopped'],
  running: ['waiting', 'degraded', 'done', 'error', 'stopped'],
  waiting: ['running', 'degraded', 'done', 'error', 'stopped'],
  degraded: ['running', 'error', 'stopped'],
  error: [],
  done: [],
  stopped: [],
};

function createSupervisor(): NodeSupervisor {
  return new NodeSupervisor({
    nodeId: 'node-1',
    nodeName: 'test-node',
    coordinatorSpecialist: 'node-coordinator',
    members: [],
    sqliteClient: {
      bootstrapNode: () => undefined,
      upsertNodeMember: () => undefined,
      upsertNodeRun: () => undefined,
      appendNodeEvent: () => undefined,
      readNodeRun: () => null,
      readNodeMembers: () => [],
      readNodeEvents: () => [],
      readStatus: () => null,
      queryMemberContextHealth: () => null,
      readNodeMemory: () => [],
    } as any,
  });
}

function setStatus(supervisor: NodeSupervisor, status: NodeRunStatus): void {
  (supervisor as any).status = status;
}

function validateTransition(supervisor: NodeSupervisor, to: NodeRunStatus): () => void {
  return () => (supervisor as any).validateTransition(to);
}

describe('NodeSupervisor state machine', () => {
  describe('valid transitions', () => {
    for (const [from, targets] of Object.entries(VALID_TRANSITIONS) as Array<
      [NodeRunStatus, ReadonlyArray<NodeRunStatus>]
    >) {
      for (const to of targets) {
        it(`${from} -> ${to} is allowed`, () => {
          const supervisor = createSupervisor();
          setStatus(supervisor, from);

          expect(validateTransition(supervisor, to)).not.toThrow();
        });
      }
    }
  });

  describe('invalid transitions (must throw)', () => {
    it('created -> running throws (cannot skip starting)', () => {
      const supervisor = createSupervisor();
      setStatus(supervisor, 'created');

      expect(validateTransition(supervisor, 'running')).toThrow(
        'Invalid NodeSupervisor transition: created -> running',
      );
    });

    it('degraded -> done throws (not in transition table)', () => {
      const supervisor = createSupervisor();
      setStatus(supervisor, 'degraded');

      expect(validateTransition(supervisor, 'done')).toThrow(
        'Invalid NodeSupervisor transition: degraded -> done',
      );
    });

    for (const from of ALL_STATUSES) {
      const allowed = new Set(VALID_TRANSITIONS[from]);
      const invalidTargets = ALL_STATUSES.filter((to) => !allowed.has(to));

      for (const to of invalidTargets) {
        it(`${from} -> ${to} throws`, () => {
          const supervisor = createSupervisor();
          setStatus(supervisor, from);

          expect(validateTransition(supervisor, to)).toThrow(
            `Invalid NodeSupervisor transition: ${from} -> ${to}`,
          );
        });
      }
    }
  });

  describe('terminal states', () => {
    const TERMINAL_STATES: ReadonlyArray<NodeRunStatus> = ['error', 'done', 'stopped'];

    for (const terminalState of TERMINAL_STATES) {
      for (const to of ALL_STATUSES) {
        it(`${terminalState} is terminal; transition to ${to} throws`, () => {
          const supervisor = createSupervisor();
          setStatus(supervisor, terminalState);

          expect(validateTransition(supervisor, to)).toThrow(
            `Invalid NodeSupervisor transition: ${terminalState} -> ${to}`,
          );
        });
      }
    }
  });
});
