import { readFileSync } from 'node:fs';
import {
  coordinatorOutputSchema,
  renderForDocs,
  renderForFirstTurnContext,
  renderForSystemPrompt,
  PHASE_KINDS,
  buildCoordinatorOutputJsonSchema,
} from '../../../src/specialist/node-contract.js';

describe('node contract consistency', () => {
  it('config embeds exact system prompt contract block', () => {
    const raw = readFileSync('config/specialists/node-coordinator.specialist.json', 'utf8');
    const config = JSON.parse(raw);
    const system = String(config.specialist.prompt.system);

    expect(system).toContain(renderForSystemPrompt());
    const schema = config.specialist.prompt.output_schema;
    const { ['x-schema-source']: _schemaSource, ...runtimeSchema } = schema;
    expect(runtimeSchema).toEqual(buildCoordinatorOutputJsonSchema());
  });

  it('first-turn context includes required sections', () => {
    const context = renderForFirstTurnContext({
      nodeId: 'node-1',
      nodeName: 'test',
      sourceBeadId: 'bd-1',
      beadGoal: 'Goal',
      memberRegistry: [],
      availableSpecialists: ['explorer'],
      qualityGates: ['npm run lint', 'npx tsc --noEmit'],
      nodeConfigSnapshot: { completion_strategy: 'pr' },
      completionStrategy: 'pr',
      maxRetries: 2,
      baseBranch: 'master',
      coordinatorGoal: 'Route work',
    });

    expect(context).toContain('action_vocabulary');
    expect(context).toContain('state_machine');
    expect(context).toContain('available_specialists');
    expect(context).toContain('quality_gates');
    expect(context).toContain('node_config_snapshot');
  });

  it('using-nodes skill contains generated contract section unchanged', () => {
    const skill = readFileSync('config/skills/using-nodes/SKILL.md', 'utf8');
    const expected = renderForDocs();
    expect(skill).toContain(expected);
  });

  it('every phase kind has documentation and schema coverage', () => {
    const docs = renderForDocs();
    const phaseKinds = Object.values(PHASE_KINDS);
    for (const phaseKind of phaseKinds) {
      expect(docs).toContain(`\`${phaseKind}\``);
    }

    const sample = {
      summary: 'ok',
      node_status: 'in_progress',
      phases: phaseKinds.map((kind, idx) => ({
        phase_id: `p-${idx}`,
        phase_kind: kind,
        barrier: 'all_members_terminal',
        members: [],
      })),
      memory_patch: [],
      actions: [],
      validation: {},
    };
    expect(() => coordinatorOutputSchema.parse(sample)).not.toThrow();
  });

  it('wave 2b events are registered in NodeEventType', () => {
    const observabilitySource = readFileSync('src/specialist/observability-sqlite.ts', 'utf8');
    const expectedEvents = [
      'bead_created',
      'worktree_provisioned',
      'member_spawned_dynamic',
      'member_replaced',
      'coordinator_restarted',
      'phase_started',
      'phase_completed',
      'pr_created',
      'pr_updated',
      'node_completed',
    ];

    for (const eventName of expectedEvents) {
      expect(observabilitySource).toContain(`'${eventName}'`);
    }
  });

  it('validator rules are represented by schema or explicit rejection paths', () => {
    const supervisorSource = readFileSync('src/specialist/node-supervisor.ts', 'utf8');
    const expectedRuntimeChecks = [
      'Nested nodes are forbidden',
      'overlapping mutating scopes',
      'Unknown specialist role',
      'exceeded max_retries',
      'quality gates failing',
      'State transition blocked',
    ];

    for (const snippet of expectedRuntimeChecks) {
      expect(supervisorSource).toContain(snippet);
    }

    const schemaJson = JSON.stringify(buildCoordinatorOutputJsonSchema());
    expect(schemaJson).toContain('all_members_terminal');
    expect(schemaJson).toContain('create_bead');
    expect(schemaJson).toContain('complete_node');
  });
});
