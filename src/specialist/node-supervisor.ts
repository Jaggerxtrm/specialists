import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { RunOptions, SpecialistRunner } from './runner.js';
import type { ObservabilitySqliteClient } from './observability-sqlite.js';
import { JobControl } from './job-control.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_MEMORY_ENTRIES_IN_RESUME = 5;

const VALID_TRANSITIONS: Record<NodeRunStatus, NodeRunStatus[]> = {
  created: ['starting', 'stopped'],
  starting: ['running', 'error', 'stopped'],
  running: ['waiting', 'degraded', 'done', 'error', 'stopped'],
  waiting: ['running', 'degraded', 'done', 'error', 'stopped'],
  degraded: ['running', 'error', 'stopped'],
  error: [],
  done: [],
  stopped: [],
};

const TERMINAL_NODE_STATUSES: ReadonlySet<NodeRunStatus> = new Set(['error', 'done', 'stopped']);
const TERMINAL_MEMBER_STATUSES: ReadonlySet<string> = new Set(['done', 'error', 'stopped']);

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
}

export interface NodeRunResult {
  nodeId: string;
  status: NodeRunStatus;
  coordinatorJobId: string | null;
  members: NodeMemberEntry[];
}

function hashOutput(output: string | null): string | null {
  if (!output) return null;
  return createHash('sha256').update(output).digest('hex');
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

export class NodeSupervisor {
  private status: NodeRunStatus = 'created';
  private members: Map<string, NodeMemberEntry>;
  private coordinatorJobId: string | null = null;
  private dispatchQueue: NodeDispatchAction[] = [];

  private readonly opts: NodeSupervisorOptions;
  private readonly memberControllers = new Map<string, JobControl>();
  private coordinatorController: JobControl | null = null;
  private readonly queuedActionKeys = new Set<string>();
  private resumePending = false;

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

  private async bootstrap(): Promise<void> {
    try {
      this.opts.sqliteClient.bootstrapNode(this.opts.nodeId, this.opts.nodeName, this.opts.memoryNamespace);
    } catch {
      // best-effort persistence; orchestration remains live
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
    } catch {
      // best-effort persistence; orchestration remains live
    }

    try {
      const now = Date.now();
      this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, now, 'node_state_changed', {
        node_id: this.opts.nodeId,
        previous_status: previousStatus,
        status: to,
        reason,
      });

      if (to === 'done') {
        this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, now + 1, 'node_done', { node_id: this.opts.nodeId, reason });
      }
      if (to === 'error') {
        this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, now + 1, 'node_error', { node_id: this.opts.nodeId, reason });
      }
      if (to === 'stopped') {
        this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, now + 1, 'node_stopped', { node_id: this.opts.nodeId, reason });
      }
    } catch {
      // best-effort persistence; orchestration remains live
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
      keepAlive: true,
      noKeepAlive: false,
      variables: {
        ...(runOptions.variables ?? {}),
        node_id: this.opts.nodeId,
        SPECIALISTS_NODE_ID: this.opts.nodeId,
      },
    };
  }

  private async spawnMembers(): Promise<void> {
    for (const member of this.members.values()) {
      const prompt = member.role ?? `You are node member ${member.memberId}. Execute delegated tasks from coordinator.`;
      const runOptions = this.createBaseRunOptions(member.specialist, prompt);
      const controller = new JobControl({
        runner: this.opts.runner!,
        runOptions,
        jobsDir: this.opts.jobsDir,
      });

      const jobId = await controller.startJob({ nodeId: this.opts.nodeId, memberId: member.memberId });
      member.jobId = jobId;
      member.status = 'starting';
      member.generation += 1;
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
        });
      } catch {
        // best-effort persistence; orchestration remains live
      }
    }
  }

  private async spawnCoordinator(initialPrompt: string): Promise<void> {
    const runOptions = this.createBaseRunOptions(this.opts.coordinatorSpecialist, initialPrompt);
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

    try {
      this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, Date.now(), 'node_started', {
        node_id: this.opts.nodeId,
        coordinator_job_id: this.coordinatorJobId,
      });
    } catch {
      // best-effort persistence; orchestration remains live
    }
  }

  private async pollMemberStatuses(): Promise<MemberStateChange[]> {
    const changes: MemberStateChange[] = [];
    const persistedRows = this.opts.sqliteClient.readNodeMembers(this.opts.nodeId);

    for (const row of persistedRows) {
      const member = this.members.get(row.member_id);
      if (!member || !member.enabled) continue;

      if (row.job_id && !member.jobId) {
        member.jobId = row.job_id;
      }

      if (!member.jobId) continue;

      const status = this.opts.sqliteClient.readStatus(member.jobId);
      if (!status) continue;

      const output = this.memberControllers.get(member.memberId)?.readResult(member.jobId) ?? null;
      const outputHash = hashOutput(output);
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
    }

    return changes;
  }

  private buildResumePayload(changes: MemberStateChange[]): string {
    const memberUpdates = changes.map((change) => {
      const member = this.members.get(change.memberId);
      const contextPct = member?.jobId ? this.opts.sqliteClient.queryMemberContextHealth(member.jobId) : null;
      const contextHealth = toContextHealth(contextPct);
      return {
        memberId: change.memberId,
        status: change.newStatus,
        context_pct: contextPct,
        context_health: contextHealth,
        output_summary: change.output ? change.output.slice(0, 500) : null,
      };
    });

    const registrySnapshot = this.getMembers().map((member) => ({
      memberId: member.memberId,
      status: member.status,
      enabled: member.enabled,
      specialist: member.specialist,
      role: member.role,
      jobId: member.jobId,
    }));

    const memoryPatchSummary = this.opts.sqliteClient
      .readNodeMemory(this.opts.nodeId, this.opts.memoryNamespace ? { namespace: this.opts.memoryNamespace } : undefined)
      .slice(-MAX_MEMORY_ENTRIES_IN_RESUME)
      .map((entry) => ({
        entry_id: entry.entry_id ?? null,
        entry_type: entry.entry_type ?? null,
        summary: entry.summary ?? null,
        source_member_id: entry.source_member_id ?? null,
        confidence: entry.confidence ?? null,
      }));

    return [
      'node_resume_payload:',
      JSON.stringify({
        node_id: this.opts.nodeId,
        member_updates: memberUpdates,
        registry_snapshot: registrySnapshot,
        memory_patch_summary: memoryPatchSummary,
      }, null, 2),
    ].join('\n');
  }

  private getActionKey(action: NodeDispatchAction): string {
    return JSON.stringify(action);
  }

  private async dispatchAction(action: NodeDispatchAction): Promise<void> {
    const actionKey = this.getActionKey(action);
    if (this.queuedActionKeys.has(actionKey)) return;

    this.dispatchQueue.push(action);
    this.queuedActionKeys.add(actionKey);

    while (this.dispatchQueue.length > 0) {
      const nextAction = this.dispatchQueue.shift();
      if (!nextAction) continue;
      const nextActionKey = this.getActionKey(nextAction);

      try {
        this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, Date.now(), 'action_dispatched', {
          node_id: this.opts.nodeId,
          action: nextAction,
        });
      } catch {
        // best-effort persistence; orchestration remains live
      }

      const controller = this.memberControllers.get(nextAction.memberId);
      const member = this.members.get(nextAction.memberId);
      if (!controller || !member?.jobId) {
        this.queuedActionKeys.delete(nextActionKey);
        continue;
      }

      if (nextAction.type === 'resume') {
        await controller.resumeJob(member.jobId, nextAction.task ?? 'Continue.');
      } else if (nextAction.type === 'steer') {
        await controller.steerJob(member.jobId, nextAction.message ?? '');
      } else {
        await controller.stopJob(member.jobId);
      }

      this.queuedActionKeys.delete(nextActionKey);
    }
  }

  private async handleCoordinatorOutput(output: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== 'object') return;
    const parsedObject = parsed as { actions?: unknown };
    if (!Array.isArray(parsedObject.actions)) return;

    for (const rawAction of parsedObject.actions) {
      if (!rawAction || typeof rawAction !== 'object') continue;
      const action = rawAction as NodeDispatchAction;
      if (!action.memberId || !action.type) continue;
      await this.dispatchAction(action);
    }
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

  async run(initialPrompt: string): Promise<NodeRunResult> {
    await this.bootstrap();
    this.transition('starting', 'node_supervisor_run_started');

    try {
      await this.spawnMembers();
      await this.spawnCoordinator(initialPrompt);
      this.transition('running', 'members_and_coordinator_spawned');

      let coordinatorOutputHash: string | null = null;

      while (!TERMINAL_NODE_STATUSES.has(this.status)) {
        const changes = await this.pollMemberStatuses();

        for (const change of changes) {
          const member = this.members.get(change.memberId);
          if (!member) continue;

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
            });
          } catch {
            // best-effort persistence; orchestration remains live
          }

          try {
            this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, Date.now(), 'member_state_changed', {
              node_id: this.opts.nodeId,
              member_id: member.memberId,
              prev_status: change.prevStatus,
              status: change.newStatus,
              output_present: Boolean(change.output),
            });
          } catch {
            // best-effort persistence; orchestration remains live
          }

          const contextPct = member.jobId ? this.opts.sqliteClient.queryMemberContextHealth(member.jobId) : null;
          if (change.newStatus === 'error' || toContextHealth(contextPct) === 'CRITICAL') {
            if (this.status === 'running' || this.status === 'waiting') {
              this.transition('degraded', 'member_error_or_critical_context');
            }
          } else if (this.status === 'degraded') {
            this.transition('running', 'member_recovered_or_context_normalized');
          }
        }

        const coordinatorStatus = this.coordinatorJobId
          ? this.opts.sqliteClient.readStatus(this.coordinatorJobId)
          : null;

        if (coordinatorStatus?.status === 'error') {
          this.transition('error', 'coordinator_crash');
          break;
        }

        const coordinatorOutput = this.coordinatorJobId
          ? this.coordinatorController?.readResult(this.coordinatorJobId) ?? null
          : null;
        const nextCoordinatorOutputHash = hashOutput(coordinatorOutput);
        if (coordinatorOutput && nextCoordinatorOutputHash !== coordinatorOutputHash) {
          coordinatorOutputHash = nextCoordinatorOutputHash;
          await this.handleCoordinatorOutput(coordinatorOutput);
        }

        if (changes.length > 0 && coordinatorStatus?.status === 'waiting' && !this.resumePending && this.coordinatorJobId && this.coordinatorController) {
          this.resumePending = true;
          const payload = this.buildResumePayload(changes);
          await this.coordinatorController.resumeJob(this.coordinatorJobId, payload);
          this.resumePending = false;

          try {
            this.opts.sqliteClient.appendNodeEvent(this.opts.nodeId, Date.now(), 'coordinator_resumed', {
              node_id: this.opts.nodeId,
              coordinator_job_id: this.coordinatorJobId,
              member_update_count: changes.length,
            });
          } catch {
            // best-effort persistence; orchestration remains live
          }

          if (this.status === 'running') {
            this.transition('waiting', 'coordinator_resumed_waiting_for_actions');
          }
        }

        const allTerminal = this.getMembers().every((member) => TERMINAL_MEMBER_STATUSES.has(member.status));
        if (allTerminal) {
          this.transition('done', 'all_members_terminal');
          this.appendCompletionSummaryToBead();
          break;
        }

        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      this.transition('error', error instanceof Error ? error.message : String(error));
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
