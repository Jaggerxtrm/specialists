/** Output mode for foreground runs.
 *  - 'human'  (default) formatted event summaries to stdout + final output
 *  - 'json'   pi-compatible NDJSON event stream to stdout, one event per line
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
/**
 * Stdout line a `--background` launch prints before the parent exits.
 *
 * The background branch returns before the NDJSON projector is initialised, so
 * under `--json` this emits a single `job_started` event rather than a bare id —
 * otherwise a caller parsing stdout as NDJSON chokes on the first line.
 */
export declare function formatBackgroundLaunchLine(opts: {
    jobId: string | null;
    specialist: string;
    outputMode: OutputMode;
    tmuxSession?: string;
    pid?: number;
}): string;
/**
 * Tail events.jsonl for a job and emit formatted output to stdout.
 * Polls every 100ms; safe for same-process use (no partial-line risk).
 * Returns a stop() function that does a final drain before returning.
 */
export declare function startEventTailer(jobId: string, jobsDir: string, mode: 'json' | 'human', _specialist: string, _beadId?: string): () => void;
export declare function buildTmuxLiveFeedCommand(options: {
    cwd: string;
    runCommand: string;
    handoffPath: string;
    feedCommandPrefix: string;
}): string;
interface BasePinResult {
    baseShaPinned: string;
    baseShaObserved: string;
    currentSha: string;
    branch: string;
    commitsBehind: number;
    override: boolean;
}
/**
 * @param coordinatorBase When the worktree's branch was based on a dispatching
 *   coordinator's integration branch (see provisionWorktree), that branch — not
 *   `origin/HEAD` — is this job's declared base. Pinning against `origin/HEAD`
 *   instead would report every coordinator-dispatched job as `stale_base` and
 *   refuse the dispatch. Explicit `--base-sha` / `--base-ref` still win: they
 *   are direct operator intent. Whether the coordinator branch is itself
 *   current with origin is coordinator judgement (the P1-04 ladder), not this
 *   guard's call.
 */
export declare function resolveBasePin(args: RunArgs, worktreePath?: string, coordinatorBase?: string): BasePinResult | undefined;
export declare function buildInjectedReviewerDiffVariables(cwd: string, maxFiles?: number): Record<string, string>;
export declare function buildInjectedWriterDiffVariables(cwd: string, maxFiles?: number): Record<string, string>;
export declare function run(): Promise<void>;
export {};
//# sourceMappingURL=run.d.ts.map