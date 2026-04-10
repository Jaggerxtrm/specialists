import * as z from 'zod';

const PHASE_KIND_VALUES = ['explore', 'design', 'impl', 'review', 'fix', 're_review', 'custom'] as const;
export const BARRIER_TYPES = ['all_members_terminal'] as const;
export const NODE_COMPLETION_STRATEGIES = ['pr', 'manual'] as const;
export const NODE_BASE_BRANCH_DEFAULT = 'master';
export const NODE_SUPERVISOR_MAX_RETRIES_DEFAULT = 3;

export const phaseKindSchema = z.enum(PHASE_KIND_VALUES);
export const PHASE_KINDS = phaseKindSchema.enum;
export const actionTypeSchema = z.enum(['spawn_member', 'create_bead', 'complete_node']);
export const ACTION_TYPES = {
  SPAWN_MEMBER: actionTypeSchema.enum.spawn_member,
  CREATE_BEAD: actionTypeSchema.enum.create_bead,
  COMPLETE_NODE: actionTypeSchema.enum.complete_node,
} as const;
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
  type: actionTypeSchema.extract([ACTION_TYPES.CREATE_BEAD]),
  title: z.string().min(1),
  description: z.string().min(1),
  bead_type: z.enum(['task', 'bug', 'feature', 'epic', 'chore', 'decision']),
  priority: z.number().int().min(0).max(4),
  parent_bead_id: z.string().min(1).optional(),
  depends_on: z.array(z.string().min(1)).default([]),
});

export const completeNodeActionSchema = z.object({
  type: actionTypeSchema.extract([ACTION_TYPES.COMPLETE_NODE]),
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

export interface CoordinatorOutputContract {
  summary: string;
  node_status: 'in_progress' | 'complete' | 'blocked' | 'aborted';
  phases: z.infer<typeof phaseSchema>[];
  memory_patch: z.infer<typeof coordinatorMemoryPatchEntrySchema>[];
  actions: z.infer<typeof coordinatorActionSchema>[];
  validation: {
    ok?: boolean;
    issues?: string[];
    notes?: string;
    [key: string]: unknown;
  };
}

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

const PHASE_KIND_DOCS: Record<z.infer<typeof phaseKindSchema>, string> = {
  explore: 'Discovery and evidence gathering.',
  design: 'Design options and decision framing.',
  impl: 'Code/config implementation and edits.',
  review: 'Structured quality or correctness review.',
  fix: 'Apply corrections for review findings.',
  re_review: 'Verification pass after fixes.',
  custom: 'Project-specific phase with explicit intent.',
};


function renderJsonSnippet(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function renderForSystemPrompt(): string {
  return [
    '## Node Coordinator Contract (SSoT: src/specialist/node-contract.ts)',
    '- Coordinator is CLI-native: reason in natural language, then call sp node commands.',
    '- Never emit contract JSON objects as final coordinator output.',
    '- Use only these orchestration commands:',
    '- `sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--json]`',
    '- `sp node create-bead --node $SPECIALISTS_NODE_ID --title "..." [--type task] [--priority 2] [--depends-on <id>] [--json]`',
    '- `sp node wait-phase --node $SPECIALISTS_NODE_ID --phase <id> --members <k1,k2,...> [--json]`',
    '- `sp node result --node $SPECIALISTS_NODE_ID --member <key> --full --json`',
    '- `sp node status --node $SPECIALISTS_NODE_ID [--json]`',
    '- Every command should be called with `--json` when the result is used for decisions.',
    '- Wait-phase is a hard barrier: do not advance to next phase until it reports completion.',
    '- After each wait-phase barrier, read participating member results with `sp node result ... --full --json`, synthesize the evidence, then decide the next phase or remain in waiting.',
    '- DO NOT call sp node complete — operator closes the node via sp node stop after reviewing synthesis.',
    '- On command errors, inspect JSON error payload, adjust plan, and retry with corrected inputs.',
    '- Nested nodes are forbidden (do not spawn node-coordinator as a member).',
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
      member_registry: ctx.memberRegistry,
      available_specialists: ctx.availableSpecialists,
      quality_gates: ctx.qualityGates,
      completion_strategy: ctx.completionStrategy,
      max_retries: ctx.maxRetries,
      base_branch: ctx.baseBranch,
      node_config_snapshot: ctx.nodeConfigSnapshot,
      coordinator_goal: ctx.coordinatorGoal,
      command_examples: [
        `sp node status --node ${ctx.nodeId} --json`,
        `sp node spawn-member --node ${ctx.nodeId} --member-key explore-1 --specialist explorer --phase explore-1 --json`,
        `sp node wait-phase --node ${ctx.nodeId} --phase explore-1 --members explore-1 --json`,
        `sp node result --node ${ctx.nodeId} --member explore-1 --full --json`,
        'Synthesize the explore-1 evidence, then decide whether to launch a new phase or remain in waiting.',
        '// After synthesis, enter waiting. Operator closes node via sp node stop.',
      ],
      first_routing_instruction: 'Create a phase plan, execute it via sp node commands, gate phase progression with wait-phase, then read member results before deciding the next action. Do NOT call sp node complete — operator owns node closure.',
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
      resume_instruction: 'Continue with CLI orchestration only: query status, spawn/coordinate members, enforce wait-phase barriers, read member results, synthesize, and remain in waiting when goals are satisfied. Operator closes the node.',
    }),
  ].join('\n');
}

export function renderForDocs(): string {
  const phaseDocs = Object.entries(PHASE_KIND_DOCS)
    .map(([name, description]) => `- \`${name}\`: ${description}`)
    .join('\n');

  return [
    '<!-- node-contract:generated:start -->',
    '## Generated node coordinator reference',
    '',
    '### Coordinator command set',
    '- `sp node spawn-member --node $SPECIALISTS_NODE_ID --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--json]`',
    '- `sp node create-bead --node $SPECIALISTS_NODE_ID --title "..." [--type task] [--priority 2] [--depends-on <id>] [--json]`',
    '- `sp node wait-phase --node $SPECIALISTS_NODE_ID --phase <id> --members <k1,k2,...> [--json]`',
    '- `sp node result --node $SPECIALISTS_NODE_ID --member <key> --full --json`',
    '- `sp node status --node $SPECIALISTS_NODE_ID [--json]`',
    '- **`sp node complete` is OPERATOR-ONLY** — coordinator must never call this.',
    '',
    '### Phase-boundary synthesis rule',
    '- After `wait-phase` completes, read every participating member result with `sp node result ... --full --json`, synthesize the evidence, then decide the next phase or remain in waiting for operator closure.',
    '',
    '### Phase kinds',
    phaseDocs,
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

