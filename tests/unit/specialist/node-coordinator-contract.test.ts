import { readFileSync } from 'node:fs';
import { NodeSupervisor } from '../../../src/specialist/node-supervisor.js';

describe('node coordinator contract', () => {
  it('config action and memory schemas match NodeSupervisor runtime contract', () => {
    const raw = readFileSync('config/specialists/node-coordinator.specialist.json', 'utf8');
    const config = JSON.parse(raw);
    const props = config.specialist.prompt.output_schema.properties;

    const actionTypes = (props.actions.items.oneOf as Array<any>)
      .flatMap((variant) => variant.properties.type.enum)
      .sort();
    expect(actionTypes).toEqual(['resume', 'steer', 'stop']);

    expect(props.memory_patch.type).toBe('array');
    expect(props.memory_patch.items.required).toEqual(['entry_type', 'summary', 'source_member_id', 'confidence']);
    expect(props.memory_patch.items.properties.entry_type.enum.sort()).toEqual(['decision', 'fact', 'question']);

    const scripts = config.specialist.skills?.scripts ?? [];
    expect(Array.isArray(scripts)).toBe(true);
    expect(scripts).toEqual([]);
  });

  it('runtime accepts payload shape defined by coordinator config', async () => {
    const sqliteClient = {
      bootstrapNode: vi.fn(),
      upsertNodeMember: vi.fn(),
      upsertNodeRun: vi.fn(),
      appendNodeEvent: vi.fn(),
      readNodeMembers: vi.fn().mockReturnValue([]),
      readStatus: vi.fn().mockReturnValue(null),
      queryMemberContextHealth: vi.fn().mockReturnValue(null),
      readNodeMemory: vi.fn().mockReturnValue([]),
      upsertNodeMemory: vi.fn(),
    } as any;

    const supervisor = new NodeSupervisor({
      nodeId: 'node-1',
      nodeName: 'test-node',
      coordinatorSpecialist: 'node-coordinator',
      members: [{ memberId: 'member-a', specialist: 'explorer' }],
      sqliteClient,
    });

    (supervisor as any).status = 'running';

    const resumeJob = vi.fn();
    (supervisor as any).memberControllers.set('member-a', { resumeJob, steerJob: vi.fn(), stopJob: vi.fn() });
    (supervisor as any).members.set('member-a', {
      memberId: 'member-a',
      jobId: 'job-1',
      specialist: 'explorer',
      status: 'waiting',
      enabled: true,
      lastSeenOutputHash: null,
      generation: 0,
    });

    await (supervisor as any).handleCoordinatorOutput(
      JSON.stringify({
        summary: 'next step',
        memory_patch: [{ entry_type: 'fact', summary: 'fact-a', source_member_id: 'member-a', confidence: 0.7 }],
        actions: [{ type: 'resume', memberId: 'member-a', task: 'continue' }],
        validation: {},
      }),
    );

    expect(resumeJob).toHaveBeenCalledWith('job-1', 'continue');
    expect(sqliteClient.upsertNodeMemory).toHaveBeenCalledWith(
      expect.objectContaining({ entry_type: 'fact', summary: 'fact-a' }),
    );
  });
});
