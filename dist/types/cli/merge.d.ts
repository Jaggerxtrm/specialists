import { type EpicState } from '../specialist/epic-lifecycle.js';
interface JobStatusRecord {
    id: string;
    bead_id?: string;
    status?: string;
    branch?: string;
    worktree_path?: string;
    started_at_ms?: number;
}
export interface ChainMergeTarget {
    beadId: string;
    branch: string;
    worktreePath: string;
    jobId: string;
    jobStatus: string;
    startedAtMs: number;
}
export interface MergeStepResult {
    beadId: string;
    branch: string;
    changedFiles: string[];
}
export interface MergeExecutionOptions {
    rebuild: boolean;
}
export type PublicationMode = 'direct' | 'pr';
export interface PublicationExecutionOptions extends MergeExecutionOptions {
    mode: PublicationMode;
    publicationLabel: string;
}
export interface PublicationResult {
    steps: MergeStepResult[];
    pullRequestUrl?: string;
}
export declare function parseChildBeadIds(childrenOutput: string): string[];
export declare function resolveChainEpicMembership(chainRootBeadId: string): {
    epicId?: string;
    source: 'sqlite' | 'bead-parent' | 'none';
};
export interface EpicGuardResult {
    blocked: boolean;
    epicId?: string;
    epicStatus?: EpicState;
    message?: string;
}
export declare function checkEpicUnresolvedGuard(chainRootBeadId: string): EpicGuardResult;
export declare function readAllJobStatuses(): JobStatusRecord[];
export declare function selectNewestChainRootJob(beadId: string, statuses: readonly JobStatusRecord[]): ChainMergeTarget | null;
export declare function ensureTerminalJobs(chains: readonly ChainMergeTarget[]): void;
export declare function topologicallySortChains(chains: readonly ChainMergeTarget[], dependenciesByBeadId: ReadonlyMap<string, readonly string[]>): ChainMergeTarget[];
export declare function resolveMergeTargetsForBeadIds(beadIds: readonly string[]): ChainMergeTarget[];
export declare function resolveMergeTargets(target: string): ChainMergeTarget[];
interface MergePreviewFileDelta {
    status: string;
    path: string;
}
interface MergePreviewDelta {
    branch: string;
    files: MergePreviewFileDelta[];
    substantiveFiles: MergePreviewFileDelta[];
    noiseFiles: MergePreviewFileDelta[];
}
interface MergeWorthinessDecision {
    shouldMerge: boolean;
    reason: 'ok' | 'empty-delta' | 'noise-only-delta';
}
export declare function assertMainRepoCleanForMerge(cwd: string): void;
export declare function previewBranchMergeDelta(branch: string, cwd?: string): MergePreviewDelta;
export declare function evaluateMergeWorthiness(preview: MergePreviewDelta): MergeWorthinessDecision;
export declare function rebaseBranchOntoMaster(branch: string, worktreePath: string): void;
export declare function mergeBranch(branch: string, cwd?: string): void;
export declare function runTypecheckGate(cwd?: string): void;
export declare function runRebuild(cwd?: string): void;
export declare function printSummary(steps: readonly MergeStepResult[], rebuild: boolean): void;
export declare function runMergePlan(targets: readonly ChainMergeTarget[], options: MergeExecutionOptions): MergeStepResult[];
export declare function executePublicationPlan(targets: readonly ChainMergeTarget[], options: PublicationExecutionOptions): PublicationResult;
export declare function run(): Promise<void>;
export {};
//# sourceMappingURL=merge.d.ts.map