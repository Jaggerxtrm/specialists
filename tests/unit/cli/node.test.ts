import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sqliteClientMock = {
  close: vi.fn(),
  readNodeEvents: vi.fn().mockReturnValue([]),
  readNodeRun: vi.fn().mockReturnValue({ status: 'done', coordinator_job_id: 'job-coordinator' }),
};

const nodeSupervisorState: {
  ctorArgs: Array<Record<string, unknown>>;
  run: ReturnType<typeof vi.fn>;
} = {
  ctorArgs: [],
  run: vi.fn().mockResolvedValue({ status: 'done' }),
};

vi.mock('../../../src/specialist/observability-sqlite.js', () => ({
  createObservabilitySqliteClient: vi.fn(() => sqliteClientMock),
}));

vi.mock('../../../src/specialist/loader.js', () => ({
  SpecialistLoader: class SpecialistLoader {},
}));

vi.mock('../../../src/specialist/runner.js', () => ({
  SpecialistRunner: class SpecialistRunner {
    constructor() {}
  },
}));

vi.mock('../../../src/specialist/node-supervisor.js', () => ({
  NodeSupervisor: class NodeSupervisor {
    constructor(args: Record<string, unknown>) {
      nodeSupervisorState.ctorArgs.push(args);
    }

    run(initialPrompt: string) {
      return nodeSupervisorState.run(initialPrompt);
    }
  },
}));

import { BeadsClient } from '../../../src/specialist/beads.js';
import { handleNodeCommand } from '../../../src/cli/node.js';

describe('node CLI run wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nodeSupervisorState.ctorArgs.length = 0;
    nodeSupervisorState.run.mockResolvedValue({ status: 'done' });
    sqliteClientMock.readNodeEvents.mockReturnValue([]);
    sqliteClientMock.readNodeRun.mockReturnValue({ status: 'done', coordinator_job_id: 'job-coordinator' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards bead context and contextDepth to NodeSupervisor run options', async () => {
    vi.spyOn(BeadsClient.prototype, 'readBead').mockReturnValue({
      id: 'unitAI-3f7b.2',
      title: 'Wave 1 bootstrap parity',
      description: 'Inject true bead context into coordinator first turn',
      notes: 'Use real context and member registry',
    } as any);
    vi.spyOn(BeadsClient.prototype, 'getCompletedBlockers').mockReturnValue([
      { id: 'unitAI-parent', title: 'Parent context', status: 'closed' },
    ] as any);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await handleNodeCommand(['run', '--inline', JSON.stringify({
      name: 'research',
      coordinator: 'node-coordinator',
      members: [{ memberId: 'member-a', specialist: 'explorer', role: 'explorer' }],
      initialPrompt: 'Start routing.',
    }), '--bead', 'unitAI-3f7b.2', '--context-depth', '2', '--json']);

    expect(nodeSupervisorState.run).toHaveBeenCalledWith('Start routing.');
    const ctor = nodeSupervisorState.ctorArgs[0];
    const runOptions = ctor.runOptions as Record<string, unknown>;
    const variables = runOptions.variables as Record<string, string>;

    expect(runOptions.inputBeadId).toBe('unitAI-3f7b.2');
    expect(runOptions.contextDepth).toBe(2);
    expect(variables.bead_id).toBe('unitAI-3f7b.2');
    expect(variables.bead_context).toContain('# Task: Wave 1 bootstrap parity');
    expect(variables.bead_context).toContain('Inject true bead context into coordinator first turn');
  });

  it('treats invalid --context-depth values deterministically as 0', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await handleNodeCommand(['run', '--inline', JSON.stringify({
      name: 'research',
      coordinator: 'node-coordinator',
      members: [{ memberId: 'member-a', specialist: 'explorer' }],
      initialPrompt: 'Start routing.',
    }), '--context-depth', 'not-a-number', '--json']);

    const ctor = nodeSupervisorState.ctorArgs[0];
    const runOptions = ctor.runOptions as Record<string, unknown>;
    expect(runOptions.contextDepth).toBe(0);
  });

  it('exits with code 1 when --context-depth value is missing', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(handleNodeCommand(['run', '--inline', '{"name":"r"}', '--context-depth'])).rejects.toThrow('exit:1');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith('--context-depth requires a numeric value');
  });
});
