import * as z from 'zod';

export const PHASE_KINDS = ['explore', 'design', 'impl', 'review', 'fix', 're_review', 'custom'] as const;
export const BARRIER_TYPES = ['all_members_terminal'] as const;
export const NODE_COMPLETION_STRATEGIES = ['pr', 'manual'] as const;
export const NODE_BASE_BRANCH_DEFAULT = 'master';
export const NODE_SUPERVISOR_MAX_RETRIES_DEFAULT = 3;

export const phaseKindSchema = z.enum(PHASE_KINDS);
export const completionStrategySchema = z.enum(NODE_COMPLETION_STRATEGIES);

const memberScopeSchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
  mutates: z.boolean(),
});

export const memberSpawnSchema = z.object({
  member_key: z.string().min(1),
  role: z.string().min(1),
  bead_id: z.string().min(1),
  scope: memberScopeSchema,
  depends_on: z.array(z.string().min(1)).default([]),
  failure_policy: z.enum(['blocking', 'non_blocking']),
  isolated: z.boolean().default(false),
  retry_of: z.string().min(1).nullable().default(null),
});

export const phaseSchema = z.object({
  phase_id: z.string().min(1),
  phase_kind: phaseKindSchema,
  barrier: z.literal('all_members_terminal'),
  members: z.array(memberSpawnSchema).default([]),
});

export const createBeadActionSchema = z.object({
  type: z.literal('create_bead'),
  title: z.string().min(1),
  description: z.string().min(1),
  bead_type: z.enum(['task', 'bug', 'feature', 'epic', 'chore', 'decision']),
  priority: z.number().int().min(0).max(4),
  parent_bead_id: z.string().min(1).optional(),
  depends_on: z.array(z.string().min(1)).default([]),
});

export const completeNodeActionSchema = z.object({
  type: z.literal('complete_node'),
  gate_results: z.array(
    z.object({
      gate: z.string().min(1),
      status: z.enum(['pass', 'fail', 'skip']),
      details: z.string().optional(),
    }),
  ).default([]),
  report_payload_ref: z.string().min(1),
  force_draft_pr: z.boolean().optional(),
});

export const coordinatorActionSchema = z.discriminatedUnion('type', [
  createBeadActionSchema,
  completeNodeActionSchema,
]);

export const coordinatorMemoryPatchEntrySchema = z.object({
  entry_type: z.enum(['fact', 'question', 'decision']),
  entry_id: z.string().min(1).optional(),
  summary: z.string().min(1),
  source_member_id: z.string().min(1),
  confidence: z.number().min(0).max(1),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

export const coordinatorOutputSchema = z.object({
  summary: z.string().min(1),
  node_status: z.enum(['in_progress', 'complete', 'blocked', 'aborted']),
  phases: z.array(phaseSchema).default([]),
  memory_patch: z.array(coordinatorMemoryPatchEntrySchema).default([]),
  actions: z.array(coordinatorActionSchema).default([]),
  validation: z
    .object({
      ok: z.boolean().optional(),
      issues: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })
    .passthrough(),
});

export type CoordinatorOutputContract = z.infer<typeof coordinatorOutputSchema>;
export type CoordinatorAction = z.infer<typeof coordinatorActionSchema>;
export type MemberSpawn = z.infer<typeof memberSpawnSchema>;
export type NodeCompletionStrategy = z.infer<typeof completionStrategySchema>;

export const NODE_STATES = [
  'created',
  'starting',
  'running',
  'waiting',
  'degraded',
  'awaiting_merge',
  'fixing_after_review',
  'failed',
  'error',
  'done',
  'stopped',
] as const;

export type NodeState = (typeof NODE_STATES)[number];

export const VALID_STATE_TRANSITIONS: Record<NodeState, NodeState[]> = {
  created: ['starting', 'stopped'],
  starting: ['running', 'error', 'stopped'],
  running: ['waiting', 'degraded', 'awaiting_merge', 'done', 'error', 'stopped', 'failed'],
  waiting: ['running', 'degraded', 'awaiting_merge', 'done', 'error', 'stopped', 'failed'],
  degraded: ['running', 'fixing_after_review', 'failed', 'error', 'stopped'],
  awaiting_merge: ['done', 'fixing_after_review', 'failed', 'error', 'stopped'],
  fixing_after_review: ['awaiting_merge', 'running', 'failed', 'error', 'stopped'],
  failed: [],
  error: [],
  done: [],
  stopped: [],
};

export interface FirstTurnContext {
  nodeId: string;
  nodeName: string;
  sourceBeadId: string | null;
  beadGoal: string;
  memberRegistry: Array<{
    memberId: string;
    specialist: string;
    role: string | null;
    generation: number;
    status: string;
    enabled: boolean;
    member_key?: string;
    retry_of?: string | null;
    worktree?: string | null;
  }>;
  availableSpecialists: string[];
  qualityGates: string[];
  nodeConfigSnapshot: Record<string, unknown>;
  completionStrategy: NodeCompletionStrategy;
  maxRetries: number;
  baseBranch: string;
  coordinatorGoal: string;
}

export interface ResumePayloadContext {
  nodeId: string;
  stateMachine: {
    state: string;
    allowed_next: string[];
  };
  memberUpdates: unknown[];
  registrySnapshot: unknown[];
  memoryPatchSummary: unknown[];
  unresolvedDecisions: unknown[];
  actionLedgerSummary: unknown[];
  stateDigest: Record<string, unknown>;
}

const PHASE_KIND_DOCS: Record<(typeof PHASE_KINDS)[number], string> = {
  explore: 'Discovery and evidence gathering.',
  design: 'Design options and decision framing.',
  impl: 'Code/config implementation and edits.',
  review: 'Structured quality or correctness review.',
  fix: 'Apply corrections for review findings.',
  re_review: 'Verification pass after fixes.',
  custom: 'Project-specific phase with explicit intent.',
};

const ACTION_DOCS = {
  create_bead: {
    type: 'Literal action discriminator.',
    title: 'Bead title for created work item.',
    description: 'Detailed bead description.',
    bead_type: 'One of task|bug|feature|epic|chore|decision.',
    priority: 'Integer priority 0..4.',
    parent_bead_id: 'Optional parent bead link.',
    depends_on: 'Optional dependency bead ids.',
  },
  complete_node: {
    type: 'Literal action discriminator.',
    gate_results: 'Quality gate statuses to attach to completion report.',
    report_payload_ref: 'Reference to external report payload.',
    force_draft_pr: 'Allow completion while gates fail by forcing draft PR intent.',
  },
} as const;

function renderJsonSnippet(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function renderForSystemPrompt(): string {
  return [
    '## Node Coordinator Contract (SSoT: src/specialist/node-contract.ts)',
    '- READ_ONLY model: emit declarative JSON intent only.',
    '- Runtime side effects are executed by NodeSupervisor.',
    '- Top-level response keys: summary, node_status, phases, memory_patch, actions, validation.',
    '- phase_kind enum: explore | design | impl | review | fix | re_review | custom',
    '- barrier enum (Wave 2A): all_members_terminal',
    '- actions enum: create_bead | complete_node',
    '- completion_strategy enum: pr | manual',
    '- Nested nodes are forbidden (do not route work to node-coordinator or node configs).',
    '- spawn_member is declared through phases[].members entries.',
    '- isolated and retry_of are schema-reserved for Wave 3 and must not assume runtime isolation/replacement behavior.',
    '- complete_node may be emitted only when gate_results pass, unless force_draft_pr=true.',
    '- Keep output strict JSON only; no markdown, comments, or prose outside JSON.',
  ].join('\n');
}

export function renderForFirstTurnContext(ctx: FirstTurnContext): string {
  return [
    'node_bootstrap_context:',
    renderJsonSnippet({
      node_id: ctx.nodeId,
      node_name: ctx.nodeName,
      source_bead_id: ctx.sourceBeadId,
      bead_goal: ctx.beadGoal,
      action_vocabulary: {
        spawn_member: 'Declare via phases[].members',
        create_bead: ACTION_DOCS.create_bead,
        complete_node: ACTION_DOCS.complete_node,
      },
      state_machine: {
        states: NODE_STATES,
        transitions: VALID_STATE_TRANSITIONS,
      },
      member_registry: ctx.memberRegistry,
      available_specialists: ctx.availableSpecialists,
      quality_gates: ctx.qualityGates,
      completion_strategy: ctx.completionStrategy,
      max_retries: ctx.maxRetries,
      base_branch: ctx.baseBranch,
      node_config_snapshot: ctx.nodeConfigSnapshot,
      coordinator_goal: ctx.coordinatorGoal,
      first_routing_instruction: 'Construct phases and actions declaratively. Do not perform side effects directly.',
    }),
  ].join('\n');
}

export function renderForResumePayload(update: ResumePayloadContext): string {
  return [
    'node_resume_payload:',
    renderJsonSnippet({
      node_id: update.nodeId,
      state_machine: update.stateMachine,
      member_updates: update.memberUpdates,
      registry_snapshot: update.registrySnapshot,
      memory_patch_summary: update.memoryPatchSummary,
      unresolved_decisions: update.unresolvedDecisions,
      action_ledger_summary: update.actionLedgerSummary,
      state_digest: update.stateDigest,
    }),
  ].join('\n');
}

export function renderForDocs(): string {
  const phaseDocs = Object.entries(PHASE_KIND_DOCS)
    .map(([name, description]) => `- \`${name}\`: ${description}`)
    .join('\n');

  const actionDocs = Object.entries(ACTION_DOCS)
    .map(([action, fields]) => {
      const fieldLines = Object.entries(fields)
        .map(([field, description]) => `  - \`${field}\`: ${description}`)
        .join('\n');
      return `- \`${action}\`\n${fieldLines}`;
    })
    .join('\n');

  return [
    '<!-- node-contract:generated:start -->',
    '## Generated node contract reference',
    '',
    '### Phase kinds',
    phaseDocs,
    '',
    '### Actions',
    actionDocs,
    '',
    '### Completion strategies',
    '- `pr`',
    '- `manual`',
    '',
    '### State machine',
    '```json',
    renderJsonSnippet({
      states: NODE_STATES,
      transitions: VALID_STATE_TRANSITIONS,
    }),
    '```',
    '<!-- node-contract:generated:end -->',
  ].join('\n');
}

export function buildCoordinatorOutputJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['summary', 'node_status', 'phases', 'memory_patch', 'actions', 'validation'],
    properties: {
      summary: { type: 'string' },
      node_status: { type: 'string', enum: ['in_progress', 'complete', 'blocked', 'aborted'] },
      phases: {
        type: 'array',
        items: {
          type: 'object',
          required: ['phase_id', 'phase_kind', 'barrier', 'members'],
          properties: {
            phase_id: { type: 'string' },
            phase_kind: { type: 'string', enum: [...PHASE_KINDS] },
            barrier: { type: 'string', enum: ['all_members_terminal'] },
            members: {
              type: 'array',
              items: {
                type: 'object',
                required: ['member_key', 'role', 'bead_id', 'scope', 'failure_policy', 'isolated', 'retry_of'],
                properties: {
                  member_key: { type: 'string' },
                  role: { type: 'string' },
                  bead_id: { type: 'string' },
                  scope: {
                    type: 'object',
                    required: ['paths', 'mutates'],
                    properties: {
                      paths: { type: 'array', items: { type: 'string' } },
                      mutates: { type: 'boolean' },
                    },
                  },
                  depends_on: { type: 'array', items: { type: 'string' } },
                  failure_policy: { type: 'string', enum: ['blocking', 'non_blocking'] },
                  isolated: { type: 'boolean' },
                  retry_of: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
      memory_patch: {
        type: 'array',
        items: {
          type: 'object',
          required: ['entry_type', 'summary', 'source_member_id', 'confidence'],
          properties: {
            entry_type: { type: 'string', enum: ['fact', 'question', 'decision'] },
            entry_id: { type: 'string' },
            summary: { type: 'string' },
            source_member_id: { type: 'string' },
            confidence: { type: 'number' },
            provenance: { type: 'object' },
          },
        },
      },
      actions: {
        type: 'array',
        items: {
          oneOf: [
            {
              type: 'object',
              required: ['type', 'title', 'description', 'bead_type', 'priority'],
              properties: {
                type: { type: 'string', enum: ['create_bead'] },
                title: { type: 'string' },
                description: { type: 'string' },
                bead_type: { type: 'string', enum: ['task', 'bug', 'feature', 'epic', 'chore', 'decision'] },
                priority: { type: 'integer', minimum: 0, maximum: 4 },
                parent_bead_id: { type: 'string' },
                depends_on: { type: 'array', items: { type: 'string' } },
              },
            },
            {
              type: 'object',
              required: ['type', 'gate_results', 'report_payload_ref'],
              properties: {
                type: { type: 'string', enum: ['complete_node'] },
                gate_results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['gate', 'status'],
                    properties: {
                      gate: { type: 'string' },
                      status: { type: 'string', enum: ['pass', 'fail', 'skip'] },
                      details: { type: 'string' },
                    },
                  },
                },
                report_payload_ref: { type: 'string' },
                force_draft_pr: { type: 'boolean' },
              },
            },
          ],
        },
      },
      validation: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          issues: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
    additionalProperties: false,
  };
}
