/** Output mode for foreground runs.
 *  - 'human'  (default) formatted event summaries to stdout + final output
 *  - 'json'   NDJSON event stream to stdout, one event per line
 *  - 'raw'    legacy: stream raw onProgress deltas to stdout (backward compat)
 */
type OutputMode = 'human' | 'json' | 'raw';
export interface RunArgs {
    name: string;
    prompt: string;
    beadId?: string;
    model?: string;
    noBeads: boolean;
    noBeadNotes: boolean;
    keepAlive?: boolean;
    noKeepAlive: boolean;
    background: boolean;
    contextDepth: number;
    outputMode: OutputMode;
    /** Provision (or reuse) an isolated bd-managed worktree for this run. */
    worktree: boolean;
    /** Reuse the workspace from a prior job. Mutually exclusive with --worktree. */
    reuseJobId?: string;
    /** Bypass reuse guard for active/unknown target job statuses. */
    forceJob: boolean;
    /** Owning epic for wave-bound chains. If --bead is set, defaults to bead.parent. */
    epicId?: string;
    /** Allow provisioning from a potentially stale base branch. */
    forceStaleBase: boolean;
    acceptStaleBase: boolean;
    staleBaseReason?: string;
    baseSha?: string;
    baseRef?: string;
}
interface BasePinResult {
    baseShaPinned: string;
    baseShaObserved: string;
    currentSha: string;
    branch: string;
    commitsBehind: number;
    override: boolean;
}
export declare function resolveBasePin(args: RunArgs, worktreePath?: string): BasePinResult | undefined;
export declare function buildInjectedReviewerDiffVariables(cwd: string, maxFiles?: number): Record<string, string>;
export declare function buildInjectedWriterDiffVariables(cwd: string, maxFiles?: number): Record<string, string>;
export declare function run(): Promise<void>;
export {};
//# sourceMappingURL=run.d.ts.map