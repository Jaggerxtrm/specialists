import { createHash } from 'node:crypto';
import * as z from 'zod';
import { spawnSync } from 'node:child_process';
import type { RunOptions, SpecialistRunner } from './runner.js';
import type { ObservabilitySqliteClient } from './observability-sqlite.js';
import { JobControl } from './job-control.js';
import { stripJsonFences } from './json-output.js';

const BASE_POLL_INTERVAL_MS = 5_000;
const MIN_POLL_INTERVAL_MS = 1_000;
const MAX_POLL_INTERVAL_MS = 15_000;
const MAX_MEMORY_ENTRIES_IN_RESUME = 5;
const MAX_ACTION_LEDGER_ENTRIES = 20;
const MAX_QUEUED_ACTIONS_PER_MEMBER = 5;
const MAX_IN_FLIGHT_COORDINATOR_RESUMES = 2;
const MAX_DEGRADED_RECOVERY_RESUMES_PER_CYCLE = 1;
const NO_PROGRESS_WATCHDOG_MS = 120_000;

const VALID_TRANSITIONS: Record<NodeRunStatus, NodeRunStatus[]> = {
  created: ['starting', 'stopped'],
  starting: ['running', 'error', 'stopped'],
  running: ['waiting', 'degraded', 'done', 'error', 'stopped'],
  waiting: ['running', 'degraded', 'done', 'error', 'stopped'],
  degraded: ['running', 'done', 'error', 'stopped'],
  error: [],
  done: [],
  stopped: [],
};

const TERMINAL_NODE_STATUSES: ReadonlySet<NodeRunStatus> = new Set(['error', 'done', 'stopped']);
const TERMINAL_MEMBER_STATUSES: ReadonlySet<string> = new Set(['done', 'error', 'stopped']);
const TERMINAL_JOB_STATUSES: ReadonlySet<string> = new Set(['done', 'error', 'stopped']);

export type NodeRunStatus = 'created' | 'starting' | 'running' | 'waiting' | 'degraded' | 'error' | 'done' | 'stopped';

export interface NodeMemberEntry {
  memberId: string;
  jobId: string | null;
  specialist: string;
  model?: string;
  role?: string;
  status: string;
  enabled: boolean;
  lastSeenOutputHash: string | null;
  generation: number;
}

export interface NodeSupervisorOptions {
  nodeId: string;
  nodeName: string;
  coordinatorSpecialist: string;
  members: Array<{ memberId: string; specialist: string; model?: string; role?: string }>;
  memoryNamespace?: string;
  sourceBeadId?: string;
  sqliteClient: ObservabilitySqliteClient;
  jobsDir?: string;
  runner?: SpecialistRunner;
  runOptions?: Omit<RunOptions, 'name' | 'prompt'>;
}

export interface MemberStateChange {
  memberId: string;
  prevStatus: string;
  newStatus: string;
  output?: string;
}

export interface NodeDispatchAction {
  type: 'resume' | 'steer' | 'stop';
  memberId: string;
  task?: string;
  message?: string;
  actionId?: string;
  targetGeneration?: number;
  dependsOnActionId?: string;
}

type ActionLifecycleState = 'queued' | 'written' | 'observed' | 'superseded' | 'completed' | 'failed';

interface DispatchActionEnvelope {
  actionId: string;
  targetGeneration: number;
  dependsOnActionId?: string;
  action: NodeDispatchAction;
}

export interface NodeRunResult {
  nodeId: string;
  status: NodeRunStatus;
  coordinatorJobId: string | null;
  members: NodeMemberEntry[];
}

const coordinatorActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('resume'),
    memberId: z.string().min(1),
    task: z.string().min(1),
    dependsOnActionId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('steer'),
    memberId: z.string().min(1),
    message: z.string().min(1),
    dependsOnActionId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('stop'),
    memberId: z.string().min(1),
    dependsOnActionId: z.string().min(1).optional(),
  }),
]);

const coordinatorMemoryPatchEntrySchema = z.object({
  entry_type: z.enum(['fact', 'question', 'decision']),
  entry_id: z.string().min(1).optional(),
  summary: z.string().min(1),
  source_member_id: z.string().min(1),
  confidence: z.number().min(0).max(1),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

const coordinatorOutputSchema = z.object({
  summary: z.string().min(1),
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

type CoordinatorOutputContract = z.infer<typeof coordinatorOutputSchema>;

function hashOutput(output: string | null, salt?: string): string | null {
  if (!output) return null;
  const value = salt ? `${salt}:${output}` : output;
  return createHash('sha256').update(value).digest('hex');
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}

function normalizeCoordinatorJsonPayload(output: string): { normalized: string; excerpt: string } {
  const trimmed = output.trim();
  const noFence = stripJsonFences(trimmed);

  const extracted = extractFirstJsonObject(noFence) ?? noFence;
  return {
    normalized: extracted,
    excerpt: trimmed.slice(0, 500),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toContextHealth(contextPct: number | null): 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL' | 'UNKNOWN' {
  if (contextPct === null) return 'UNKNOWN';
  if (contextPct < 60) return 'OK';
  if (contextPct <= 75) return 'MONITOR';
  if (contextPct <= 90) return 'WARN';
  return 'CRITICAL';
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class NodeSupervisor {
  private status: NodeRunStatus = 'created';
  private members: Map<string, NodeMemberEntry>;
  private coordinatorJobId: string | null = null;
  private dispatchQueue: DispatchActionEnvelope[] = [];

  private readonly opts: NodeSupervisorOptions;
  private readonly memberControllers = new Map<string, JobControl>();
  private coordinatorController: JobControl | null = null;
  private readonly queuedActionKeys = new Set<string>();
  private readonly actionLifecycle = new Map<string, ActionLifecycleState>();
  private readonly completedActionIds = new Set<string>();
  private readonly memberPendingAction = new Map<string, string>();
  private readonly actionById = new Map<string, DispatchActionEnvelope>();
  private nextActionSequence = 0;
  private isDrainingDispatchQueue = false;
  private resumePending = false;
  private recoveredCoordinatorOutputHash: string | null = null;
  private pollSequence = 0;
  private lastActivityAtMs = Date.now();
  private coordinatorResumesInFlight = 0;
  private degradedResumeCount = 0;
  private lastCoordinatorOutputAtMs = Date.now();
  private lastCompletedActionAtMs = Date.now();
  private lastMemberTransitionAtMs = Date.now();

  constructor(opts: NodeSupervisorOptions) {
    this.opts = opts;
    this.members = new Map(
      opts.members.map((member) => [
        member.memberId,
        {
          memberId: member.memberId,
          jobId: null,
          specialist: member.specialist,
          model: member.model,
          role: member.role,
          status: 'created',
          enabled: true,
          lastSeenOutputHash: null,
          generation: 0,
        } satisfies NodeMemberEntry,
      ]),
    );
  }

  private restoreActionFromEvent(eventJson: string): DispatchActionEnvelope | null {
    try {
      const payload = JSON.parse(eventJson) as Record<string, unknown>;
      const nestedAction = payload.action;

      if (nestedAction && typeof nestedAction === 'object' && !Array.isArray(nestedAction)) {
        const action = nestedAction as Partial<NodeDispatchAction>;
        if (!action.memberId || !action.type) return null;
        const actionId = typeof action.actionId === 'string' ? action.actionId : (typeof payload.action_id === 'string' ? payload.action_id : null);
        if (!actionId) return null;

        const targetGeneration = typeof action.targetGeneration === 'number'
          ? action.targetGeneration
          : (typeof payload.target_generation === 'number' ? payload.target_generation : 0);

        const dependsOnActionId = typeof action.dependsOnActionId === 'string'
          ? action.dependsOnActionId
          : (typeof payload.depends_on_action_id === 'string' ? payload.depends_on_action_id : undefined);

        return {
          actionId,
          targetGeneration,
          dependsOnActionId,
          action: {
            type: action.type,
            memberId: action.memberId,
            task: typeof action.task === 'string' ? action.task : undefined,
            message: typeof action.message === 'string' ? action.message : undefined,
            actionId,
            targetGeneration,
            dependsOnActionId,
          },
        };
      }

      const actionId = typeof payload.action_id === 'string' ? payload.action_id : null;
      const memberId = typeof payload.member_id === 'string' ? payload.member_id : null;
      const actionType = payload.action_type;
      if (!actionId || !memberId || (actionType !== 'resume' && actionType !== 'steer' && actionType !== 'stop')) return null;

      const targetGeneration = typeof payload.target_generation === 'number' ? payload.target_generation : 0;
      const dependsOnActionId = typeof payload.depends_on_action_id === 'string' ? payload.depends_on_action_id : undefined;

      return {
        actionId,
        targetGeneration,
        dependsOnActionId,
        action: {
          type: actionType,
          memberId,
          task: typeof payload.task === 'string' ? payload.task : undefined,
          message: typeof payload.message === 'string' ? payload.message : undefined,
          actionId,
          targetGeneration,
          dependsOnActionId,
        },
      };
    } catch {
      return null;
    }
  }

  private restoreCoordinatorOutputHashFromEvent(eventJson: string): string | null {
    try {
      const payload = JSON.parse(eventJson) as { output_hash?: string };
      return payload.output_hash ?? null;
    } catch {
      return null;
    }
  }

  private restoreResumePendingFromEvent(eventJson: string): boolean | null {
    try {
      const payload = JSON.parse(eventJson) as { resume_pending?: boolean };
      return typeof payload.resume_pending === 'boolean' ? payload.resume_pending : null;
    } catch {
      return null;
    }
  }

  private getMemberPendingActionKey(memberId: string, generation: number): string {
    return `${memberId}:${generation}`;
  }

  private getMemberPendingActionForGeneration(memberId: string, generation: number): string | null {
    return this.memberPendingAction.get(this.getMemberPendingActionKey(memberId, generation)) ?? null;
  }

  private setMemberPendingActionForGeneration(memberId: string, generation: number, actionId: string): void {
    this.memberPendingAction.set(this.getMemberPendingActionKey(memberId, generation), actionId);
  }

  private clearMemberPendingActionForGeneration(memberId: string, generation: number): void {
    this.memberPendingAction.delete(this.getMemberPendingActionKey(memberId, generation));
  }

  private clearMemberPendingActions(memberId: string): void {
    for (const key of this.memberPendingAction.keys()) {
      if (key.startsWith(`${memberId}:`)) {
        this.memberPendingAction.delete(key);
      }
    }
  }

  private resetResumePendingFromLiveCoordinatorStatus(): void {
    const coordinatorStatus = this.coordinatorJobId
      ? this.opts.sqliteClient.readStatus(this.coordinatorJobId)?.status
      : null;

    const recoveredPending = this.resumePending;
    this.resumePending = false;

    if (!recoveredPending) return;

    try {
      this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, Date.now(), 'coordinator_resume_state', {
        node_id: this.opts.nodeId,
        resume_pending: false,
        recovery_reset: true,
        coordinator_status: coordinatorStatus,
      });
    } catch {
      // best-effort persistence; orchestration remains live
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      this.opts.sqliteClient.bootstrapNode(this.opts.nodeId, this.opts.nodeName, this.opts.memoryNamespace);
    } catch {
      // best-effort persistence; orchestration remains live
    }

    const nodeRun = this.opts.sqliteClient.readNodeRun(this.opts.nodeId);
    const recovering = Boolean(nodeRun && nodeRun.status !== 'created');

    if (recovering) {
      this.status = nodeRun?.status ?? this.status;
      this.coordinatorJobId = nodeRun?.coordinator_job_id ?? null;

      const persistedMembers = this.opts.sqliteClient.readNodeMembers(this.opts.nodeId);
      for (const row of persistedMembers) {
        const member = this.members.get(row.member_id);
        if (!member) continue;
        member.jobId = row.job_id ?? null;
        member.status = row.status;
        member.enabled = row.enabled ?? true;
        member.generation = row.generation ?? member.generation;
      }

      const lifecycleByActionId = new Map<string, DispatchActionEnvelope>();
      const events = this.opts.sqliteClient.readNodeEvents(this.opts.nodeId);
      for (const event of events) {
        if (event.type === 'coordinator_output_received') {
          this.recoveredCoordinatorOutputHash = this.restoreCoordinatorOutputHashFromEvent(event.event_json);
          this.lastCoordinatorOutputAtMs = Math.max(this.lastCoordinatorOutputAtMs, event.t);
          continue;
        }

        if (event.type === 'member_state_changed') {
          this.lastMemberTransitionAtMs = Math.max(this.lastMemberTransitionAtMs, event.t);
          continue;
        }

        if (event.type === 'coordinator_resume_state') {
          const restoredResumePending = this.restoreResumePendingFromEvent(event.event_json);
          if (restoredResumePending !== null) {
            this.resumePending = restoredResumePending;
          }
          continue;
        }

        if (!event.type.startsWith('action_')) continue;
        const envelope = this.restoreActionFromEvent(event.event_json);
        if (!envelope) continue;

        lifecycleByActionId.set(envelope.actionId, envelope);
        this.actionById.set(envelope.actionId, envelope);

        if (event.type === 'action_completed') {
          this.completedActionIds.add(envelope.actionId);
          this.clearMemberPendingActionForGeneration(envelope.action.memberId, envelope.targetGeneration);
          this.lastCompletedActionAtMs = Math.max(this.lastCompletedActionAtMs, event.t);
        } else if (event.type === 'action_written') {
          this.setMemberPendingActionForGeneration(envelope.action.memberId, envelope.targetGeneration, envelope.actionId);
        }

        this.actionLifecycle.set(envelope.actionId, event.type.replace('action_', '') as ActionLifecycleState);
      }

      const terminalStates = new Set<ActionLifecycleState>(['completed', 'failed', 'superseded']);
      for (const envelope of lifecycleByActionId.values()) {
        const state = this.actionLifecycle.get(envelope.actionId);
        if (!state || terminalStates.has(state)) continue;

        if (state === 'queued') {
          this.dispatchQueue.push(envelope);
          this.queuedActionKeys.add(this.getActionKey(envelope.action));
          continue;
        }

        if (state === 'written' || state === 'observed') {
          this.setMemberPendingActionForGeneration(envelope.action.memberId, envelope.targetGeneration, envelope.actionId);
        }
      }

      this.resetResumePendingFromLiveCoordinatorStatus();

      try {
        this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, Date.now(), 'node_recovered', {
          node_id: this.opts.nodeId,
          status: this.status,
          coordinator_job_id: this.coordinatorJobId,
          recovered_action_count: this.dispatchQueue.length,
          resume_pending: this.resumePending,
        });
      } catch {
        // best-effort persistence; orchestration remains live
      }
    }

    for (const member of this.members.values()) {
      try {
        this.opts.sqliteClient.upsertNodeMember({
          node_run_id: this.opts.nodeId,
          member_id: member.memberId,
          job_id: member.jobId ?? undefined,
          specialist: member.specialist,
          model: member.model,
          role: member.role,
          status: member.status,
          enabled: member.enabled,
          generation: member.generation,
        });
      } catch {
        // best-effort persistence; orchestration remains live
      }
    }
  }

  private validateTransition(to: NodeRunStatus): void {
    const validTargets = VALID_TRANSITIONS[this.status];
    if (!validTargets.includes(to)) {
      throw new Error(`Invalid NodeSupervisor transition: ${this.status} -> ${to}`);
    }
  }

  private logPersistenceWarning(operation: string, error: unknown): void {
    console.warn('node supervisor sqlite write failed', {
      nodeId: this.opts.nodeId,
      operation,
      error: toErrorMessage(error),
    });
  }

  private persistNodeEvent(operation: string, type: Parameters<ObservabilitySqliteClient['appendNodeEvent']>[2], event: Record<string, unknown>, t = Date.now()): void {
    try {
      this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, t, type, event);
    } catch (error) {
      this.logPersistenceWarning(operation, error);
    }
  }

  private transition(to: NodeRunStatus, reason?: string): void {
    this.validateTransition(to);
    const previousStatus = this.status;
    this.status = to;

    try {
      const now = Date.now();
      this.opts.sqliteClient.upsertNodeRun({
        id: this.opts.nodeId,
        node_name: this.opts.nodeName,
        status: to,
        coordinator_job_id: this.coordinatorJobId ?? undefined,
        started_at_ms: now,
        updated_at_ms: now,
        error: to === 'error' ? reason : undefined,
        memory_namespace: this.opts.memoryNamespace,
        status_json: JSON.stringify({
          node_id: this.opts.nodeId,
          previous_status: previousStatus,
          status: to,
          reason,
          coordinator_job_id: this.coordinatorJobId,
        }),
      });
    } catch (error) {
      this.logPersistenceWarning('transition.upsertNodeRun', error);
    }

    const now = Date.now();
    this.persistNodeEvent('transition.node_state_changed', 'node_state_changed', {
      node_id: this.opts.nodeId,
      previous_status: previousStatus,
      status: to,
      reason,
    }, now);

    if (to === 'waiting') {
      this.persistNodeEvent('transition.node_waiting', 'node_waiting', { node_id: this.opts.nodeId, reason }, now + 1);
    }
    if (to === 'done') {
      this.persistNodeEvent('transition.node_done', 'node_done', { node_id: this.opts.nodeId, reason }, now + 1);
    }
    if (to === 'error') {
      this.persistNodeEvent('transition.node_error', 'node_error', { node_id: this.opts.nodeId, reason }, now + 1);
    }
    if (to === 'stopped') {
      this.persistNodeEvent('transition.node_stopped', 'node_stopped', { node_id: this.opts.nodeId, reason }, now + 1);
    }
  }

  private createBaseRunOptions(specialist: string, prompt: string): RunOptions {
    const runOptions = this.opts.runOptions;
    if (!this.opts.runner || !runOptions) {
      throw new Error('NodeSupervisor requires opts.runner and opts.runOptions to spawn jobs');
    }

    return {
      ...runOptions,
      name: specialist,
      prompt,
      contextDepth: runOptions.contextDepth,
      keepAlive: true,
      noKeepAlive: false,
      variables: {
        ...(runOptions.variables ?? {}),
        node_id: this.opts.nodeId,
        SPECIALISTS_NODE_ID: this.opts.nodeId,
      },
    };
  }

  private buildMemberIdleBootstrapPrompt(member: NodeMemberEntry): string {
    const roleText = member.role?.trim()
      ? `\n- Assigned role: ${member.role.trim()}`
      : '';

    return [
      `You are node member ${member.memberId}.`,
      'Bootstrap state: idle_wait.',
      'Acknowledge readiness briefly, then wait for coordinator resume/steer instructions.',
      'Do not start investigation or produce substantive work until explicitly resumed.',
      roleText,
    ].join('\n').trim();
  }

  private getBeadGoalSummary(): string {
    const beadContext = this.opts.runOptions?.variables?.bead_context;
    if (!beadContext || typeof beadContext !== 'string') {
      return this.opts.sourceBeadId ?? 'none';
    }

    const firstLine = beadContext
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    return firstLine ?? (this.opts.sourceBeadId ?? 'none');
  }

  private buildCoordinatorFirstTurnContext(initialPrompt: string): string {
    const memberRegistry = this.getMembers().map((member) => ({
      memberId: member.memberId,
      specialist: member.specialist,
      role: member.role ?? null,
      generation: member.generation,
      status: member.status,
      enabled: member.enabled,
    }));

    return [
      'node_bootstrap_context:',
      JSON.stringify({
        node_id: this.opts.nodeId,
        node_name: this.opts.nodeName,
        source_bead_id: this.opts.sourceBeadId ?? null,
        bead_goal: this.getBeadGoalSummary(),
        member_registry: memberRegistry,
        first_routing_instruction: 'Choose exactly one member to resume first with a concrete task. Keep all other members idle.',
        coordinator_goal: initialPrompt,
      }, null, 2),
    ].join('\n');
  }

  private async spawnMembers(): Promise<void> {
    for (const member of this.members.values()) {
      const prompt = this.buildMemberIdleBootstrapPrompt(member);
      const runOptions = this.createBaseRunOptions(member.specialist, prompt);
      const controller = new JobControl({
        runner: this.opts.runner!,
        runOptions,
        jobsDir: this.opts.jobsDir,
      });

      const previousGeneration = member.generation;
      const previousJobId = member.jobId;
      const jobId = await controller.startJob({ nodeId: this.opts.nodeId, memberId: member.memberId });
      member.jobId = jobId;
      member.status = 'starting';
      member.generation += 1;
      this.clearMemberPendingActions(member.memberId);
      this.memberControllers.set(member.memberId, controller);

      try {
        this.opts.sqliteClient.upsertNodeMember({
          node_run_id: this.opts.nodeId,
          member_id: member.memberId,
          job_id: member.jobId,
          specialist: member.specialist,
          model: member.model,
          role: member.role,
          status: member.status,
          enabled: member.enabled,
          generation: member.generation,
        });
      } catch {
        // best-effort persistence; orchestration remains live
      }

      try {
        this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, Date.now(), 'member_started', {
          node_id: this.opts.nodeId,
          member_id: member.memberId,
          job_id: jobId,
          specialist: member.specialist,
          generation: member.generation,
        });
      } catch {
        // best-effort persistence; orchestration remains live
      }

      if (previousGeneration > 0 || previousJobId) {
        try {
          this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, Date.now(), 'member_respawned', {
            node_id: this.opts.nodeId,
            member_id: member.memberId,
            previous_job_id: previousJobId,
            job_id: member.jobId,
            previous_generation: previousGeneration,
            generation: member.generation,
          });
        } catch {
          // best-effort persistence; orchestration remains live
        }
      }
    }
  }

  private async spawnCoordinator(initialPrompt: string): Promise<void> {
    const firstTurnContext = this.buildCoordinatorFirstTurnContext(initialPrompt);
    this.persistNodeEvent('spawnCoordinator.coordinator_first_turn_context_built', 'coordinator_first_turn_context_built', {
      node_id: this.opts.nodeId,
      source_bead_id: this.opts.sourceBeadId ?? null,
      context_length_chars: firstTurnContext.length,
      member_count: this.members.size,
      bead_goal: this.getBeadGoalSummary(),
    });

    const runOptions = this.createBaseRunOptions(this.opts.coordinatorSpecialist, firstTurnContext);
    const controller = new JobControl({
      runner: this.opts.runner!,
      runOptions,
      jobsDir: this.opts.jobsDir,
    });

    this.coordinatorJobId = await controller.startJob({
      nodeId: this.opts.nodeId,
      memberId: 'coordinator',
    });
    this.coordinatorController = controller;

    try {
      this.opts.sqliteClient.upsertNodeRun({
        id: this.opts.nodeId,
        node_name: this.opts.nodeName,
        status: this.status,
        coordinator_job_id: this.coordinatorJobId,
        started_at_ms: Date.now(),
        updated_at_ms: Date.now(),
        memory_namespace: this.opts.memoryNamespace,
        status_json: JSON.stringify({ status: this.status, coordinator_job_id: this.coordinatorJobId }),
      });
    } catch {
      // best-effort persistence; orchestration remains live
    }

  }

  private async pollMemberStatuses(): Promise<MemberStateChange[]> {
    const changes: MemberStateChange[] = [];
    this.pollSequence += 1;
    const persistedRows = this.opts.sqliteClient.readNodeMembers(this.opts.nodeId);

    for (const row of persistedRows) {
      const member = this.members.get(row.member_id);
      if (!member || !member.enabled) continue;

      const rowGeneration = row.generation ?? 0;
      if (rowGeneration < member.generation) {
        continue;
      }

      if (rowGeneration !== member.generation) {
        member.generation = rowGeneration;
      }

      if (row.job_id && row.job_id !== member.jobId) {
        const previousJobId = member.jobId;
        member.jobId = row.job_id;
        try {
          this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, Date.now(), 'member_job_rebound', {
            node_id: this.opts.nodeId,
            member_id: member.memberId,
            previous_job_id: previousJobId,
            job_id: member.jobId,
            generation: member.generation,
          });
        } catch {
          // best-effort persistence; orchestration remains live
        }
      }

      if (!member.jobId) continue;

      const status = this.opts.sqliteClient.readStatus(member.jobId);
      if (!status) continue;

      const output = this.memberControllers.get(member.memberId)?.readResult(member.jobId) ?? null;
      const outputHash = hashOutput(output, `${member.generation}`);
      const statusChanged = member.status !== status.status;
      const outputChanged = member.lastSeenOutputHash !== outputHash;

      if (!statusChanged && !outputChanged) continue;

      changes.push({
        memberId: member.memberId,
        prevStatus: member.status,
        newStatus: status.status,
        output: output ?? undefined,
      });

      member.status = status.status;
      member.lastSeenOutputHash = outputHash;
      this.maybeAcknowledgeMemberAction(member.memberId);
    }

    return changes;
  }

  private recomputeNodeHealth(): NodeRunStatus {
    for (const member of this.members.values()) {
      if (!member.enabled) continue;
      if (member.status === 'error') return 'degraded';
      const contextPct = member.jobId ? this.opts.sqliteClient.queryMemberContextHealth(member.jobId) : null;
      if (toContextHealth(contextPct) === 'CRITICAL') return 'degraded';
    }

    return 'running';
  }

  private maybeAcknowledgeMemberAction(memberId: string): void {
    const member = this.members.get(memberId);
    if (!member) return;

    const pendingActionId = this.getMemberPendingActionForGeneration(memberId, member.generation);
    if (!pendingActionId) return;

    const lifecycle = this.actionLifecycle.get(pendingActionId);
    const envelope = this.actionById.get(pendingActionId);
    if (lifecycle === 'written' && envelope) {
      this.appendActionLifecycleEvent(envelope, 'observed');
      this.appendActionLifecycleEvent(envelope, 'completed');
      this.completedActionIds.add(pendingActionId);
      this.clearMemberPendingActionForGeneration(memberId, member.generation);
    }
  }

  private buildStateDigest(memoryEntries: ReturnType<ObservabilitySqliteClient['readNodeMemory']>): Record<string, unknown> {
    let completed = 0;
    let failed = 0;
    let superseded = 0;
    for (const state of this.actionLifecycle.values()) {
      if (state === 'completed') completed += 1;
      if (state === 'failed') failed += 1;
      if (state === 'superseded') superseded += 1;
    }

    return {
      node_status: this.status,
      poll_sequence: this.pollSequence,
      members_total: this.members.size,
      members_enabled: [...this.members.values()].filter((member) => member.enabled).length,
      actions_total: this.actionLifecycle.size,
      actions_completed: completed,
      actions_failed: failed,
      actions_superseded: superseded,
      memory_entries_total: memoryEntries.length,
    };
  }

  private buildActionLedgerSummary(): Array<Record<string, unknown>> {
    const actionEvents = this.opts.sqliteClient
      .readNodeEvents(this.opts.nodeId)
      .filter((event) => event.type === 'action_completed' || event.type === 'action_failed' || event.type === 'action_superseded')
      .slice(-MAX_ACTION_LEDGER_ENTRIES);

    return actionEvents.map((event) => {
      const envelope = this.restoreActionFromEvent(event.event_json);
      return {
        action_id: envelope?.actionId ?? null,
        member_id: envelope?.action.memberId ?? null,
        action_type: envelope?.action.type ?? null,
        lifecycle_state: event.type.replace('action_', ''),
        observed_at_ms: event.t,
      };
    });
  }

  private buildResumePayload(changes: MemberStateChange[]): string {
    const memberUpdates = changes.map((change) => {
      const member = this.members.get(change.memberId);
      const contextPct = member?.jobId ? this.opts.sqliteClient.queryMemberContextHealth(member.jobId) : null;
      const contextHealth = toContextHealth(contextPct);
      return {
        memberId: change.memberId,
        generation: member?.generation ?? 0,
        status: change.newStatus,
        context_pct: contextPct,
        context_health: contextHealth,
        output_summary: change.output ? change.output.slice(0, 500) : null,
      };
    });

    const registrySnapshot = this.getMembers().map((member) => ({
      memberId: member.memberId,
      generation: member.generation,
      status: member.status,
      enabled: member.enabled,
      specialist: member.specialist,
      role: member.role,
      jobId: member.jobId,
    }));

    const memoryEntries = this.opts.sqliteClient
      .readNodeMemory(this.opts.nodeId, this.opts.memoryNamespace ? { namespace: this.opts.memoryNamespace } : undefined);

    const memoryPatchSummary = memoryEntries
      .slice(-MAX_MEMORY_ENTRIES_IN_RESUME)
      .map((entry) => ({
        entry_id: entry.entry_id ?? null,
        entry_type: entry.entry_type ?? null,
        summary: entry.summary ?? null,
        source_member_id: entry.source_member_id ?? null,
        confidence: entry.confidence ?? null,
      }));

    const unresolvedDecisions = memoryEntries
      .filter((entry) => entry.entry_type === 'decision')
      .slice(-MAX_MEMORY_ENTRIES_IN_RESUME)
      .map((entry) => ({
        entry_id: entry.entry_id ?? null,
        summary: entry.summary ?? null,
        source_member_id: entry.source_member_id ?? null,
        created_at_ms: entry.created_at_ms ?? null,
      }));

    return [
      'node_resume_payload:',
      JSON.stringify({
        node_id: this.opts.nodeId,
        member_updates: memberUpdates,
        registry_snapshot: registrySnapshot,
        memory_patch_summary: memoryPatchSummary,
        state_digest: this.buildStateDigest(memoryEntries),
        unresolved_decisions: unresolvedDecisions,
        action_ledger_summary: this.buildActionLedgerSummary(),
      }, null, 2),
    ].join('\n');
  }

  private getActionKey(action: NodeDispatchAction): string {
    const stableAction = {
      ...action,
      actionId: undefined,
      targetGeneration: action.targetGeneration ?? undefined,
      dependsOnActionId: action.dependsOnActionId ?? undefined,
    };
    return JSON.stringify(stableAction);
  }

  private nextActionId(): string {
    this.nextActionSequence += 1;
    return `${this.opts.nodeId}:${Date.now()}:${this.nextActionSequence}`;
  }

  private appendActionLifecycleEvent(envelope: DispatchActionEnvelope, state: ActionLifecycleState, extra?: Record<string, unknown>): void {
    this.actionLifecycle.set(envelope.actionId, state);
    if (state === 'completed') {
      this.lastCompletedActionAtMs = Date.now();
    }

    this.persistNodeEvent(`appendActionLifecycleEvent.action_${state}`, `action_${state}` as never, {
      node_id: this.opts.nodeId,
      action_id: envelope.actionId,
      member_id: envelope.action.memberId,
      action_type: envelope.action.type,
      target_generation: envelope.targetGeneration,
      depends_on_action_id: envelope.dependsOnActionId ?? null,
      ...extra,
    });
  }

  private async dispatchAction(action: NodeDispatchAction): Promise<string | null> {
    if (action.type === 'resume') {
      const member = this.members.get(action.memberId);
      if (!member || !this.isRecoveryResumeAllowed(member)) {
        this.appendNodeEvent('action_dropped', {
          node_id: this.opts.nodeId,
          member_id: action.memberId,
          action_type: action.type,
          reason: 'resume_not_allowed',
          member_status: member?.status ?? null,
          member_enabled: member?.enabled ?? null,
          target_generation: action.targetGeneration ?? null,
        });
        return null;
      }
    }

    const queuedForMember = this.dispatchQueue.filter((queued) => queued.action.memberId === action.memberId).length;
    if (queuedForMember >= MAX_QUEUED_ACTIONS_PER_MEMBER) {
      this.appendNodeEvent('action_dropped', {
        node_id: this.opts.nodeId,
        member_id: action.memberId,
        action_type: action.type,
        reason: 'member_queue_full',
        queued_for_member: queuedForMember,
        queue_limit: MAX_QUEUED_ACTIONS_PER_MEMBER,
        target_generation: action.targetGeneration ?? null,
      });
      return null;
    }

    const envelope: DispatchActionEnvelope = {
      action: {
        ...action,
      },
      actionId: action.actionId ?? this.nextActionId(),
      targetGeneration: action.targetGeneration ?? (this.members.get(action.memberId)?.generation ?? 0),
      dependsOnActionId: action.dependsOnActionId,
    };
    envelope.action.actionId = envelope.actionId;
    envelope.action.targetGeneration = envelope.targetGeneration;

    const actionKey = this.getActionKey(envelope.action);
    if (this.queuedActionKeys.has(actionKey)) {
      this.appendNodeEvent('action_dropped', {
        node_id: this.opts.nodeId,
        member_id: action.memberId,
        action_type: action.type,
        reason: 'duplicate_action',
        target_generation: envelope.targetGeneration,
      });
      return null;
    }

    this.dispatchQueue.push(envelope);
    this.actionById.set(envelope.actionId, envelope);
    this.queuedActionKeys.add(actionKey);
    this.appendActionLifecycleEvent(envelope, 'queued', { action: envelope.action });

    try {
      await this.drainDispatchQueue();
      return envelope.actionId;
    } finally {
      const lifecycle = this.actionLifecycle.get(envelope.actionId);
      if (lifecycle === 'failed' || lifecycle === 'completed' || lifecycle === 'superseded') {
        this.queuedActionKeys.delete(actionKey);
      }
    }
  }

  private async drainDispatchQueue(): Promise<void> {
    if (this.isDrainingDispatchQueue) return;
    this.isDrainingDispatchQueue = true;

    try {
      while (this.dispatchQueue.length > 0) {
        const nextEnvelope = this.dispatchQueue.shift();
        if (!nextEnvelope) continue;
        const nextAction = nextEnvelope.action;
        const nextActionKey = this.getActionKey(nextAction);

        const controller = this.memberControllers.get(nextAction.memberId);
        const member = this.members.get(nextAction.memberId);
        if (!controller || !member?.jobId) {
          this.appendActionLifecycleEvent(nextEnvelope, 'failed', { reason: 'missing_controller_or_job' });
          this.queuedActionKeys.delete(nextActionKey);
          continue;
        }

        if (member.generation !== nextEnvelope.targetGeneration) {
          this.appendActionLifecycleEvent(nextEnvelope, 'superseded', {
            reason: 'member_generation_mismatch',
            observed_generation: member.generation,
          });
          this.queuedActionKeys.delete(nextActionKey);
          continue;
        }

        if (nextEnvelope.dependsOnActionId && !this.completedActionIds.has(nextEnvelope.dependsOnActionId)) {
          this.appendActionLifecycleEvent(nextEnvelope, 'failed', {
            reason: 'dependency_not_completed',
            dependency_action_id: nextEnvelope.dependsOnActionId,
          });
          this.queuedActionKeys.delete(nextActionKey);
          continue;
        }

        const pendingActionId = this.getMemberPendingActionForGeneration(nextAction.memberId, member.generation);
        if (pendingActionId && !this.completedActionIds.has(pendingActionId)) {
          this.appendActionLifecycleEvent(nextEnvelope, 'failed', {
            reason: 'member_has_pending_action',
            pending_action_id: pendingActionId,
          });
          this.queuedActionKeys.delete(nextActionKey);
          continue;
        }

        try {
          if (nextAction.type === 'resume') {
            await controller.resumeJob(member.jobId, nextAction.task ?? 'Continue.');
          } else if (nextAction.type === 'steer') {
            await controller.steerJob(member.jobId, nextAction.message ?? '');
          } else {
            await controller.stopJob(member.jobId);
          }
          this.setMemberPendingActionForGeneration(nextAction.memberId, nextEnvelope.targetGeneration, nextEnvelope.actionId);
          this.appendActionLifecycleEvent(nextEnvelope, 'written');
        } catch (error) {
          this.appendActionLifecycleEvent(nextEnvelope, 'failed', {
            reason: error instanceof Error ? error.message : String(error),
          });
        } finally {
          this.queuedActionKeys.delete(nextActionKey);
        }
      }
    } finally {
      this.isDrainingDispatchQueue = false;
    }
  }

  private appendNodeEvent(
    type:
      | 'coordinator_output_invalid'
      | 'memory_updated'
      | 'memory_patch_rejected'
      | 'memory_patch_deduplicated'
      | 'coordinator_output_received'
      | 'coordinator_resume_skipped'
      | 'action_dropped'
      | 'member_disabled'
      | 'coordinator_repair_requested',
    event: Record<string, unknown>,
  ): void {
    this.persistNodeEvent(`appendNodeEvent.${type}`, type, event);
  }

  private buildCoordinatorRepairPrompt(args: {
    failureClass: 'invalid_json' | 'schema_validation_failure' | 'runtime_state_mismatch';
    details: string;
    attempt: number;
  }): string {
    const remainingAttempts = 3 - args.attempt;
    return [
      'coordinator_output_repair_required:',
      `attempt=${args.attempt}`,
      `failure_class=${args.failureClass}`,
      `details=${args.details}`,
      'Return ONLY strict JSON matching this contract:',
      '{"summary": string, "memory_patch": array, "actions": array, "validation": object}',
      'actions allowed:',
      '- {"type":"resume","memberId":string,"task":string,"dependsOnActionId"?:string}',
      '- {"type":"steer","memberId":string,"message":string,"dependsOnActionId"?:string}',
      '- {"type":"stop","memberId":string,"dependsOnActionId"?:string}',
      'memory_patch entries:',
      '- {"entry_type":"fact|question|decision","summary":string,"source_member_id":string,"confidence":number,"entry_id"?:string,"provenance"?:object}',
      `remaining_attempts=${remainingAttempts}`,
    ].join('\n');
  }

  private isRecoveryResumeAllowed(member: NodeMemberEntry): boolean {
    if (this.status !== 'degraded') return true;
    if (!member.enabled || member.status !== 'waiting') return false;
    if (!member.jobId) return false;
    const contextPct = this.opts.sqliteClient.queryMemberContextHealth(member.jobId);
    return toContextHealth(contextPct) !== 'CRITICAL';
  }

  private validateActionRuntimeState(actions: NodeDispatchAction[]): string | null {
    let degradedRecoveryResumeCount = 0;

    for (const action of actions) {
      const member = this.members.get(action.memberId);
      if (!member) {
        return `Unknown memberId '${action.memberId}'.`;
      }

      if (!member.enabled) {
        return `Member '${action.memberId}' is disabled.`;
      }

      if (!member.jobId) {
        return `Member '${action.memberId}' has no active jobId.`;
      }

      if (!this.memberControllers.has(action.memberId)) {
        return `Member '${action.memberId}' has no active controller.`;
      }

      if (action.type === 'resume' && member.status !== 'waiting') {
        return `Member '${action.memberId}' must be waiting before resume (current=${member.status}).`;
      }

      if (action.type === 'resume' && !this.isRecoveryResumeAllowed(member)) {
        return `Member '${action.memberId}' is not eligible for degraded recovery resume.`;
      }

      if (action.type === 'resume' && this.status === 'degraded') {
        degradedRecoveryResumeCount += 1;
        if (degradedRecoveryResumeCount > MAX_DEGRADED_RECOVERY_RESUMES_PER_CYCLE) {
          return `Degraded mode permits at most ${MAX_DEGRADED_RECOVERY_RESUMES_PER_CYCLE} recovery resume action per coordinator cycle.`;
        }
      }

      if (action.type === 'steer' && member.status !== 'running' && member.status !== 'waiting') {
        return `Member '${action.memberId}' must be running/waiting before steer (current=${member.status}).`;
      }

      if (action.type === 'stop' && TERMINAL_MEMBER_STATUSES.has(member.status)) {
        return `Member '${action.memberId}' is already terminal (current=${member.status}).`;
      }
    }

    return null;
  }

  private applyMemoryPatch(memoryPatch: CoordinatorOutputContract['memory_patch']): {
    acceptedCount: number;
    rejectedCount: number;
    dedupedCount: number;
  } {
    let acceptedCount = 0;
    let rejectedCount = 0;
    let dedupedCount = 0;

    const existingEntryIds = new Set(
      this.opts.sqliteClient
        .readNodeMemory(this.opts.nodeId, this.opts.memoryNamespace ? { namespace: this.opts.memoryNamespace } : undefined)
        .map((row) => row.entry_id)
        .filter((entryId): entryId is string => typeof entryId === 'string' && entryId.length > 0),
    );

    for (const entry of memoryPatch) {
      if (!entry.source_member_id) {
        rejectedCount += 1;
        this.appendNodeEvent('memory_patch_rejected', {
          node_id: this.opts.nodeId,
          entry_type: entry.entry_type,
          entry_id: entry.entry_id ?? null,
          reason: 'missing_source_member_id',
        });
        continue;
      }

      if (typeof entry.confidence !== 'number' || Number.isNaN(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) {
        rejectedCount += 1;
        this.appendNodeEvent('memory_patch_rejected', {
          node_id: this.opts.nodeId,
          entry_type: entry.entry_type,
          entry_id: entry.entry_id ?? null,
          reason: 'invalid_confidence',
          confidence: entry.confidence ?? null,
        });
        continue;
      }

      const isDeduped = Boolean(entry.entry_id && existingEntryIds.has(entry.entry_id));

      try {
        this.opts.sqliteClient.upsertNodeMemory({
          node_run_id: this.opts.nodeId,
          namespace: this.opts.memoryNamespace,
          entry_type: entry.entry_type,
          entry_id: entry.entry_id,
          summary: entry.summary,
          source_member_id: entry.source_member_id,
          confidence: entry.confidence,
          provenance_json: entry.provenance ? JSON.stringify(entry.provenance) : undefined,
          updated_at_ms: Date.now(),
        });
      } catch (error) {
        this.logPersistenceWarning('applyMemoryPatch.upsertNodeMemory', error);
        continue;
      }

      acceptedCount += 1;
      if (entry.entry_id) {
        existingEntryIds.add(entry.entry_id);
      }

      if (isDeduped) {
        dedupedCount += 1;
        this.appendNodeEvent('memory_patch_deduplicated', {
          node_id: this.opts.nodeId,
          entry_type: entry.entry_type,
          entry_id: entry.entry_id,
          namespace: this.opts.memoryNamespace ?? null,
        });
      }

      this.appendNodeEvent('memory_updated', {
        node_id: this.opts.nodeId,
        entry_type: entry.entry_type,
        entry_id: entry.entry_id ?? null,
        source_member_id: entry.source_member_id,
        confidence: entry.confidence,
      });
    }

    return {
      acceptedCount,
      rejectedCount,
      dedupedCount,
    };
  }

  private waitForCoordinatorOutput(previousOutputHash: string | null): Promise<string | null> {
    const maxWaitMs = 15_000;
    const pollEveryMs = 500;
    const startedAt = Date.now();

    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const latestOutput = this.coordinatorJobId
          ? this.coordinatorController?.readResult(this.coordinatorJobId) ?? null
          : null;

        if (latestOutput && hashOutput(latestOutput) !== previousOutputHash) {
          clearInterval(timer);
          resolve(latestOutput);
          return;
        }

        if (Date.now() - startedAt >= maxWaitMs) {
          clearInterval(timer);
          resolve(null);
        }
      }, pollEveryMs);
    });
  }

  private async handleCoordinatorOutput(output: string): Promise<void> {
    let currentOutput: string | null = output;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (!currentOutput) {
        this.appendNodeEvent('coordinator_output_invalid', {
          node_id: this.opts.nodeId,
          attempt,
          failure_class: 'runtime_state_mismatch',
          details: 'No coordinator output available for validation.',
        });

        if (attempt === 3) {
          this.transition('error', 'coordinator_output_invalid_after_3_attempts');
          return;
        }

        if (!this.coordinatorJobId || !this.coordinatorController) {
          this.transition('error', 'coordinator_controller_missing_for_repair');
          return;
        }

        this.appendNodeEvent('coordinator_repair_requested', {
          node_id: this.opts.nodeId,
          attempt,
          failure_class: 'runtime_state_mismatch',
          details: 'No coordinator output available for validation.',
        });
        await this.coordinatorController.resumeJob(
          this.coordinatorJobId,
          this.buildCoordinatorRepairPrompt({
            failureClass: 'runtime_state_mismatch',
            details: 'No coordinator output available for validation.',
            attempt,
          }),
        );
        currentOutput = await this.waitForCoordinatorOutput(hashOutput(currentOutput));
        continue;
      }

      const normalizedPayload = normalizeCoordinatorJsonPayload(currentOutput);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(normalizedPayload.normalized);
      } catch (error) {
        const details = error instanceof Error ? error.message : 'Unable to parse coordinator output as JSON.';
        this.appendNodeEvent('coordinator_output_invalid', {
          node_id: this.opts.nodeId,
          attempt,
          failure_class: 'invalid_json',
          details,
          payload_excerpt: normalizedPayload.excerpt,
        });

        if (attempt === 3) {
          this.transition('error', 'coordinator_output_invalid_after_3_attempts');
          return;
        }

        if (!this.coordinatorJobId || !this.coordinatorController) {
          this.transition('error', 'coordinator_controller_missing_for_repair');
          return;
        }

        this.appendNodeEvent('coordinator_repair_requested', {
          node_id: this.opts.nodeId,
          attempt,
          failure_class: 'invalid_json',
          details,
        });
        await this.coordinatorController.resumeJob(
          this.coordinatorJobId,
          this.buildCoordinatorRepairPrompt({
            failureClass: 'invalid_json',
            details,
            attempt,
          }),
        );
        currentOutput = await this.waitForCoordinatorOutput(hashOutput(currentOutput));
        continue;
      }

      const parseResult = coordinatorOutputSchema.safeParse(parsedJson);
      if (!parseResult.success) {
        const details = parseResult.error.issues
          .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
          .join('; ');

        this.appendNodeEvent('coordinator_output_invalid', {
          node_id: this.opts.nodeId,
          attempt,
          failure_class: 'schema_validation_failure',
          details,
          payload_excerpt: normalizedPayload.excerpt,
        });

        if (attempt === 3) {
          this.transition('error', 'coordinator_output_invalid_after_3_attempts');
          return;
        }

        if (!this.coordinatorJobId || !this.coordinatorController) {
          this.transition('error', 'coordinator_controller_missing_for_repair');
          return;
        }

        this.appendNodeEvent('coordinator_repair_requested', {
          node_id: this.opts.nodeId,
          attempt,
          failure_class: 'schema_validation_failure',
          details,
        });
        await this.coordinatorController.resumeJob(
          this.coordinatorJobId,
          this.buildCoordinatorRepairPrompt({
            failureClass: 'schema_validation_failure',
            details,
            attempt,
          }),
        );
        currentOutput = await this.waitForCoordinatorOutput(hashOutput(currentOutput));
        continue;
      }

      const coordinatorOutput = parseResult.data;
      const runtimeMismatch = this.validateActionRuntimeState(coordinatorOutput.actions as NodeDispatchAction[]);
      if (runtimeMismatch) {
        this.appendNodeEvent('coordinator_output_invalid', {
          node_id: this.opts.nodeId,
          attempt,
          failure_class: 'runtime_state_mismatch',
          details: runtimeMismatch,
          payload_excerpt: normalizedPayload.excerpt,
        });

        if (attempt === 3) {
          this.transition('error', 'coordinator_output_invalid_after_3_attempts');
          return;
        }

        if (!this.coordinatorJobId || !this.coordinatorController) {
          this.transition('error', 'coordinator_controller_missing_for_repair');
          return;
        }

        this.appendNodeEvent('coordinator_repair_requested', {
          node_id: this.opts.nodeId,
          attempt,
          failure_class: 'runtime_state_mismatch',
          details: runtimeMismatch,
        });
        await this.coordinatorController.resumeJob(
          this.coordinatorJobId,
          this.buildCoordinatorRepairPrompt({
            failureClass: 'runtime_state_mismatch',
            details: runtimeMismatch,
            attempt,
          }),
        );
        currentOutput = await this.waitForCoordinatorOutput(hashOutput(currentOutput));
        continue;
      }

      const memoryPatchStats = this.applyMemoryPatch(coordinatorOutput.memory_patch);

      this.appendNodeEvent('coordinator_output_received', {
        node_id: this.opts.nodeId,
        summary: coordinatorOutput.summary,
        action_count: coordinatorOutput.actions.length,
        memory_patch_count: coordinatorOutput.memory_patch.length,
        accepted_count: memoryPatchStats.acceptedCount,
        rejected_count: memoryPatchStats.rejectedCount,
        deduped_count: memoryPatchStats.dedupedCount,
        output_hash: hashOutput(currentOutput),
      });
      this.lastCoordinatorOutputAtMs = Date.now();
      const predecessorByMemberId = new Map<string, string>();
      for (const action of coordinatorOutput.actions as NodeDispatchAction[]) {
        const inferredDependsOnActionId = action.dependsOnActionId ?? predecessorByMemberId.get(action.memberId);
        const actionId = await this.dispatchAction({
          ...action,
          dependsOnActionId: inferredDependsOnActionId,
        });
        if (actionId) {
          predecessorByMemberId.set(action.memberId, actionId);
        }
      }

      return;
    }

    this.transition('error', 'coordinator_output_invalid_after_3_attempts');
  }

  private buildCompletionSummary(): string {
    const coordinatorOutput = this.coordinatorJobId
      ? this.coordinatorController?.readResult(this.coordinatorJobId) ?? ''
      : '';
    const memberSummary = this.getMembers()
      .map((member) => `- ${member.memberId}: ${member.status}`)
      .join('\n');

    return [
      'Node run completed',
      `node_id: ${this.opts.nodeId}`,
      `node_name: ${this.opts.nodeName}`,
      `status: ${this.status}`,
      this.coordinatorJobId ? `coordinator_job_id: ${this.coordinatorJobId}` : 'coordinator_job_id: -',
      '',
      'Member status:',
      memberSummary || '- none',
      '',
      'Final coordinator summary:',
      coordinatorOutput.trim() || '(empty)',
    ].join('\n');
  }

  private appendCompletionSummaryToBead(): void {
    if (!this.opts.sourceBeadId) return;

    const notes = this.buildCompletionSummary();
    const result = spawnSync('bd', ['update', this.opts.sourceBeadId, '--notes', notes], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const errorMessage = result.stderr?.trim() || result.stdout?.trim() || `bd update exited with status ${result.status}`;
      throw new Error(errorMessage);
    }
  }

  private getNextPollIntervalMs(changesCount: number): number {
    if (changesCount > 0 || this.dispatchQueue.length > 0) {
      this.lastActivityAtMs = Date.now();
    }

    if (this.status === 'degraded') {
      return Math.max(MIN_POLL_INTERVAL_MS, Math.floor(BASE_POLL_INTERVAL_MS / 2));
    }

    const idleForMs = Date.now() - this.lastActivityAtMs;
    if (idleForMs > 30_000) {
      return MAX_POLL_INTERVAL_MS;
    }

    if (idleForMs > 10_000) {
      return Math.min(MAX_POLL_INTERVAL_MS, BASE_POLL_INTERVAL_MS * 2);
    }

    return BASE_POLL_INTERVAL_MS;
  }

  private getLastProgressAtMs(): number {
    return Math.max(this.lastCoordinatorOutputAtMs, this.lastCompletedActionAtMs, this.lastMemberTransitionAtMs);
  }

  private maybeTriggerNoProgressWatchdog(): boolean {
    if (TERMINAL_NODE_STATUSES.has(this.status)) return false;

    const stalledForMs = Date.now() - this.getLastProgressAtMs();
    if (stalledForMs < NO_PROGRESS_WATCHDOG_MS) {
      return false;
    }

    this.appendNodeEvent('coordinator_output_invalid', {
      node_id: this.opts.nodeId,
      failure_class: 'watchdog_no_progress',
      details: `No progress observed for ${stalledForMs}ms.`,
      stalled_for_ms: stalledForMs,
      threshold_ms: NO_PROGRESS_WATCHDOG_MS,
      last_coordinator_output_at_ms: this.lastCoordinatorOutputAtMs,
      last_completed_action_at_ms: this.lastCompletedActionAtMs,
      last_member_transition_at_ms: this.lastMemberTransitionAtMs,
    });
    this.transition('error', 'no_progress_watchdog_triggered');
    return true;
  }

  private async cleanupJobs(): Promise<string[]> {
    const cleanupErrors: string[] = [];

    if (this.coordinatorJobId && this.coordinatorController) {
      try {
        const status = this.coordinatorController.readStatus(this.coordinatorJobId)?.status;
        if (status && !TERMINAL_JOB_STATUSES.has(status)) {
          await this.coordinatorController.stopJob(this.coordinatorJobId);
          await this.coordinatorController.waitForTerminal(this.coordinatorJobId, 5_000);
        }
      } catch (error) {
        cleanupErrors.push(`coordinator: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const member of this.members.values()) {
      if (!member.jobId) continue;
      const controller = this.memberControllers.get(member.memberId);
      if (!controller) continue;

      try {
        const status = controller.readStatus(member.jobId)?.status ?? member.status;
        if (TERMINAL_JOB_STATUSES.has(status)) continue;

        await controller.stopJob(member.jobId);
        await controller.waitForTerminal(member.jobId, 3_000);
      } catch (error) {
        cleanupErrors.push(`member:${member.memberId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.memberControllers.clear();
    this.coordinatorController = null;
    this.dispatchQueue = [];
    this.queuedActionKeys.clear();
    this.resumePending = false;
    this.recoveredCoordinatorOutputHash = null;

    return cleanupErrors;
  }

  async run(initialPrompt: string): Promise<NodeRunResult> {
    await this.bootstrap();

    const recovering = this.coordinatorJobId !== null || [...this.members.values()].some((member) => member.jobId !== null);
    if (!recovering) {
      this.transition('starting', 'node_supervisor_run_started');
    }

    try {
      if (!recovering) {
        await this.spawnMembers();
        await this.spawnCoordinator(initialPrompt);
        this.transition('running', 'members_and_coordinator_spawned');
      } else {
        const coordinatorPrompt = this.createBaseRunOptions(this.opts.coordinatorSpecialist, initialPrompt);
        this.coordinatorController = new JobControl({
          runner: this.opts.runner!,
          runOptions: coordinatorPrompt,
          jobsDir: this.opts.jobsDir,
        });

        for (const member of this.members.values()) {
          const memberPrompt = this.buildMemberIdleBootstrapPrompt(member);
          this.memberControllers.set(
            member.memberId,
            new JobControl({
              runner: this.opts.runner!,
              runOptions: this.createBaseRunOptions(member.specialist, memberPrompt),
              jobsDir: this.opts.jobsDir,
            }),
          );
        }

        await this.drainDispatchQueue();

        if (this.status === 'created' || this.status === 'starting') {
          this.transition('running', 'node_supervisor_recovered');
        }
      }

      let coordinatorOutputHash: string | null = this.recoveredCoordinatorOutputHash;
      if (!coordinatorOutputHash) {
        const lastCoordinatorOutput = this.opts.sqliteClient
          .readNodeEvents(this.opts.nodeId, { type: 'coordinator_output_received', limit: 1 })
          .at(0);
        if (lastCoordinatorOutput) {
          coordinatorOutputHash = this.restoreCoordinatorOutputHashFromEvent(lastCoordinatorOutput.event_json);
        }
      }

      while (!TERMINAL_NODE_STATUSES.has(this.status)) {
        const changes = await this.pollMemberStatuses();

        for (const change of changes) {
          const member = this.members.get(change.memberId);
          if (!member) continue;

          const contextPct = member.jobId ? this.opts.sqliteClient.queryMemberContextHealth(member.jobId) : null;
          const contextHealth = toContextHealth(contextPct);
          const trigger = change.prevStatus !== change.newStatus
            ? 'status_changed'
            : (change.output ? 'output_changed' : 'poll_observed');

          if (change.newStatus === 'error') {
            member.enabled = false;
            this.appendNodeEvent('member_disabled', {
              node_id: this.opts.nodeId,
              member_id: member.memberId,
              job_id: member.jobId ?? null,
              generation: member.generation,
              reason: 'member_error',
              trigger,
              context_health: contextHealth,
            });
          }

          try {
            this.opts.sqliteClient.upsertNodeMember({
              node_run_id: this.opts.nodeId,
              member_id: member.memberId,
              job_id: member.jobId ?? undefined,
              specialist: member.specialist,
              model: member.model,
              role: member.role,
              status: member.status,
              enabled: member.enabled,
              generation: member.generation,
            });
          } catch (error) {
            this.logPersistenceWarning('run.upsertNodeMember', error);
          }

          this.persistNodeEvent('run.member_state_changed', 'member_state_changed', {
            node_id: this.opts.nodeId,
            member_id: member.memberId,
            job_id: member.jobId ?? null,
            prev_status: change.prevStatus,
            status: change.newStatus,
            generation: member.generation,
            trigger,
            context_pct: contextPct,
            context_health: contextHealth,
            output_present: Boolean(change.output),
            output_excerpt: change.output ? change.output.slice(0, 500) : null,
          });

          if (change.output) {
            this.persistNodeEvent('run.member_output_received', 'member_output_received', {
              node_id: this.opts.nodeId,
              member_id: member.memberId,
              job_id: member.jobId ?? null,
              generation: member.generation,
              trigger,
              context_health: contextHealth,
              output_excerpt: change.output.slice(0, 500),
            });
          }

          if (change.newStatus === 'error') {
            this.persistNodeEvent('run.member_failed', 'member_failed', {
              node_id: this.opts.nodeId,
              member_id: member.memberId,
              job_id: member.jobId ?? null,
              generation: member.generation,
              trigger,
              context_health: contextHealth,
            });
          }

          this.lastMemberTransitionAtMs = Date.now();

          if (change.newStatus === 'error' || contextHealth === 'CRITICAL') {
            if (this.status === 'running' || this.status === 'waiting') {
              this.transition('degraded', 'member_error_or_critical_context');
              this.degradedResumeCount = 0;
            }
          } else if (this.status === 'degraded' && this.recomputeNodeHealth() === 'running') {
            this.persistNodeEvent('run.member_recovered', 'member_recovered', {
              node_id: this.opts.nodeId,
              member_id: member.memberId,
              job_id: member.jobId ?? null,
              generation: member.generation,
              context_health: contextHealth,
            });
            this.transition('running', 'all_members_healthy');
            this.degradedResumeCount = 0;
          }
        }

        const coordinatorStatus = this.coordinatorJobId
          ? this.opts.sqliteClient.readStatus(this.coordinatorJobId)
          : null;
        const coordinatorStatusValue = coordinatorStatus?.status as string | undefined;

        if (coordinatorStatusValue === 'error') {
          this.transition('error', 'coordinator_crash');
          break;
        }

        if (coordinatorStatusValue === 'stopped') {
          this.transition('stopped', 'coordinator_stopped');
          break;
        }

        if (coordinatorStatusValue === 'done') {
          this.transition('done', 'coordinator_done');
          break;
        }

        const coordinatorOutput = this.coordinatorJobId
          ? this.coordinatorController?.readResult(this.coordinatorJobId) ?? null
          : null;
        const nextCoordinatorOutputHash = hashOutput(coordinatorOutput);
        if (coordinatorOutput && nextCoordinatorOutputHash !== coordinatorOutputHash) {
          coordinatorOutputHash = nextCoordinatorOutputHash;
          await this.handleCoordinatorOutput(coordinatorOutput);
          if (this.status === 'waiting') {
            this.transition('running', 'coordinator_output_processed');
          }
        }

        const canResumeCoordinator = this.coordinatorResumesInFlight < MAX_IN_FLIGHT_COORDINATOR_RESUMES;
        const shouldResumeCoordinator = changes.length > 0
          && coordinatorStatus?.status === 'waiting'
          && !this.resumePending
          && canResumeCoordinator
          && Boolean(this.coordinatorJobId)
          && Boolean(this.coordinatorController);

        if (changes.length > 0 && !shouldResumeCoordinator) {
          const skipReasons: string[] = [];
          if (coordinatorStatus?.status !== 'waiting') skipReasons.push(`coordinator_status:${coordinatorStatus?.status ?? 'unknown'}`);
          if (this.resumePending) skipReasons.push('resume_pending');
          if (!canResumeCoordinator) skipReasons.push('resume_in_flight_limit');
          if (!this.coordinatorJobId) skipReasons.push('missing_coordinator_job');
          if (!this.coordinatorController) skipReasons.push('missing_coordinator_controller');

          this.appendNodeEvent('coordinator_resume_skipped', {
            node_id: this.opts.nodeId,
            coordinator_job_id: this.coordinatorJobId,
            member_update_count: changes.length,
            reasons: skipReasons,
          });
        }

        if (shouldResumeCoordinator && this.coordinatorJobId && this.coordinatorController) {
          this.resumePending = true;
          this.coordinatorResumesInFlight += 1;
          this.persistNodeEvent('run.coordinator_resume_state.pending', 'coordinator_resume_state', {
            node_id: this.opts.nodeId,
            resume_pending: true,
          });

          try {
            const payload = this.buildResumePayload(changes);
            await this.coordinatorController.resumeJob(this.coordinatorJobId, payload);
            if (this.status === 'degraded') {
              this.degradedResumeCount += 1;
            }
          } finally {
            this.resumePending = false;
            this.coordinatorResumesInFlight = Math.max(0, this.coordinatorResumesInFlight - 1);
          }

          this.persistNodeEvent('run.coordinator_resume_state.cleared', 'coordinator_resume_state', {
            node_id: this.opts.nodeId,
            resume_pending: false,
          });

          this.persistNodeEvent('run.coordinator_resumed', 'coordinator_resumed', {
            node_id: this.opts.nodeId,
            coordinator_job_id: this.coordinatorJobId,
            member_update_count: changes.length,
            degraded_resume_count: this.degradedResumeCount,
          });

          if (this.status === 'running') {
            this.transition('waiting', 'coordinator_resumed_waiting_for_actions');
          }
        }

        const memberSnapshot = this.getMembers();
        const allTerminal = memberSnapshot.every((member) => TERMINAL_MEMBER_STATUSES.has(member.status));
        const allStopped = memberSnapshot.length > 0 && memberSnapshot.every((member) => member.status === 'stopped');

        if (allStopped) {
          this.transition('stopped', 'all_members_stopped');
          break;
        }

        if (allTerminal) {
          this.transition('done', 'all_members_terminal');
          try {
            this.appendCompletionSummaryToBead();
          } catch {
            console.warn('failed to append completion summary to bead; node already done', {
              nodeId: this.opts.nodeId,
            });
          }
          break;
        }

        if (this.maybeTriggerNoProgressWatchdog()) {
          break;
        }

        await sleep(this.getNextPollIntervalMs(changes.length));
      }
    } catch (error) {
      if (!TERMINAL_NODE_STATUSES.has(this.status)) {
        this.transition('error', error instanceof Error ? error.message : String(error));
      } else {
        console.warn('non-fatal error after terminal node state', {
          nodeId: this.opts.nodeId,
          status: this.status,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      const cleanupErrors = await this.cleanupJobs();
      if (cleanupErrors.length > 0) {
        console.warn('node supervisor cleanup completed with errors', {
          nodeId: this.opts.nodeId,
          errors: cleanupErrors,
        });
      }
    }

    return {
      nodeId: this.opts.nodeId,
      status: this.status,
      coordinatorJobId: this.coordinatorJobId,
      members: this.getMembers(),
    };
  }

  getStatus(): NodeRunStatus {
    return this.status;
  }

  getMembers(): NodeMemberEntry[] {
    return [...this.members.values()].map((member) => ({ ...member }));
  }
}
