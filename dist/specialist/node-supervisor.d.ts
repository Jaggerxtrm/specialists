import type { RunOptions, SpecialistRunner } from './runner.js';
import { type ObservabilitySqliteClient } from './observability-sqlite.js';
import { type NodeCompletionStrategy, type NodeState } from './node-contract.js';
export type NodeRunStatus = NodeState;
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
    worktreePath?: string;
    parentMemberId?: string;
    replacedMemberId?: string;
    phaseId?: string;
}
export interface NodeSupervisorOptions {
    nodeId: string;
    nodeName: string;
    coordinatorSpecialist: string;
    members: Array<{
        memberId: string;
        specialist: string;
        model?: string;
        role?: string;
        worktree?: boolean | string;
        worktreePath?: string;
        parentMemberId?: string;
        replacedMemberId?: string;
        phaseId?: string;
    }>;
    memoryNamespace?: string;
    sourceBeadId?: string;
    sqliteClient: ObservabilitySqliteClient;
    jobsDir?: string;
    runner?: SpecialistRunner;
    runOptions?: Omit<RunOptions, 'name' | 'prompt'>;
    availableSpecialists?: string[];
    qualityGates?: string[];
    nodeConfigSnapshot?: Record<string, unknown>;
    completionStrategy?: NodeCompletionStrategy;
    maxRetries?: number;
    baseBranch?: string;
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
export interface NodeRunResult {
    nodeId: string;
    status: NodeRunStatus;
    coordinatorJobId: string | null;
    members: NodeMemberEntry[];
}
export interface SpawnDynamicMemberActionInput {
    nodeId: string;
    memberKey: string;
    specialist: string;
    beadId?: string;
    phaseId?: string;
    scopePaths?: string[];
    jobsDir?: string;
    runner: SpecialistRunner;
    runOptions: Omit<RunOptions, 'name' | 'prompt'>;
}
export interface SpawnDynamicMemberActionResult {
    memberKey: string;
    jobId: string;
    specialist: string;
}
export interface CreateBeadActionInput {
    nodeId: string;
    title: string;
    description: string;
    beadType: 'task' | 'bug' | 'feature' | 'epic' | 'chore' | 'decision';
    priority: number;
    dependsOn?: string[];
}
export interface CreateBeadActionResult {
    beadId: string;
    title: string;
}
export interface CompleteNodeActionInput {
    nodeId: string;
    strategy: 'pr' | 'manual';
    forceDraftPr?: boolean;
}
export interface CompleteNodeActionResult {
    strategy: 'pr' | 'manual';
    prUrl?: string;
}
export declare function spawnDynamicMember(input: SpawnDynamicMemberActionInput): Promise<SpawnDynamicMemberActionResult>;
export declare function executeCreateBeadAction(input: CreateBeadActionInput): CreateBeadActionResult;
export declare function executeCompleteNodeAction(input: CompleteNodeActionInput): Promise<CompleteNodeActionResult>;
export declare class NodeSupervisor {
    private status;
    private members;
    private coordinatorJobId;
    private dispatchQueue;
    private readonly opts;
    private readonly memberControllers;
    private coordinatorController;
    private readonly queuedActionKeys;
    private readonly actionLifecycle;
    private readonly completedActionIds;
    private readonly memberPendingAction;
    private readonly actionById;
    private nextActionSequence;
    private isDrainingDispatchQueue;
    private resumePending;
    private recoveredCoordinatorOutputHash;
    private pollSequence;
    private lastActivityAtMs;
    private coordinatorResumesInFlight;
    private degradedResumeCount;
    private lastCoordinatorOutputAtMs;
    private lastCompletedActionAtMs;
    private lastMemberTransitionAtMs;
    private coordinatorRestartCount;
    constructor(opts: NodeSupervisorOptions);
    private restoreActionFromEvent;
    private restoreCoordinatorOutputHashFromEvent;
    private restoreResumePendingFromEvent;
    private getMemberPendingActionKey;
    private getMemberPendingActionForGeneration;
    private setMemberPendingActionForGeneration;
    private clearMemberPendingActionForGeneration;
    private clearMemberPendingActions;
    private resetResumePendingFromLiveCoordinatorStatus;
    private bootstrap;
    private validateTransition;
    private logPersistenceWarning;
    private persistNodeEvent;
    private transition;
    private createBaseRunOptions;
    private buildMemberIdleBootstrapPrompt;
    private buildReplacementBootstrapPrompt;
    private getBeadGoalSummary;
    private buildCoordinatorFirstTurnContext;
    private spawnMembers;
    private spawnCoordinator;
    private pollMemberStatuses;
    private recomputeNodeHealth;
    private maybeAcknowledgeMemberAction;
    private buildStateDigest;
    private buildActionLedgerSummary;
    private buildResumePayload;
    private getActionKey;
    private nextActionId;
    private appendActionLifecycleEvent;
    private dispatchAction;
    private drainDispatchQueue;
    private appendNodeEvent;
    private isRecoveryResumeAllowed;
    private buildCompletionSummary;
    private appendCompletionSummaryToBead;
    private runCommand;
    private extractCreatedBeadId;
    private executeCreateBeadAction;
    private spawnDynamicMember;
    private runFinalQualityGates;
    private executeCompleteNodeAction;
    private getNextPollIntervalMs;
    private getLastProgressAtMs;
    private isCoordinatorInBlockingWaitPhase;
    private maybeTriggerNoProgressWatchdog;
    private buildCoordinatorRecoveryPrompt;
    private restartCoordinator;
    private cleanupJobs;
    run(initialPrompt: string): Promise<NodeRunResult>;
    getStatus(): NodeRunStatus;
    getMembers(): NodeMemberEntry[];
    getCoordinatorJobId(): string | null;
    /**
     * Enqueue a dispatch action (resume/steer/stop) for a member.
     * Returns action ID on success, null on failure.
     */
    enqueueAction(action: NodeDispatchAction): Promise<string | null>;
    /**
     * Gracefully stop the node: stop coordinator and all members.
     */
    gracefulStop(): Promise<void>;
}
//# sourceMappingURL=node-supervisor.d.ts.map