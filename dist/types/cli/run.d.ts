import { constants as fsConstants, fstatSync, openSync, readSync, realpathSync, closeSync } from 'node:fs';
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
 * Schema tag on the single event a `--background --json` launch prints.
 *
 * A detached launch is NOT the pi-compatible run stream that `--json` produces in
 * the foreground (`session` → `agent_start` → message/turn/tool events): that
 * stream belongs to the detached child, which the parent never sees. Rather than
 * fake a `session` event for a run it has no output for, the parent emits one
 * launch event carrying this discriminator, so a strict pi consumer can tell the
 * two apart instead of silently mis-parsing one as the other.
 */
export declare const BACKGROUND_LAUNCH_SCHEMA = "specialists.background_launch.v1";
/**
 * Stdout line a `--background` launch prints before the parent exits.
 *
 * The background branch returns before the JSON projector is initialised, so
 * under `--json` this emits a single launch event rather than a bare id —
 * otherwise a caller parsing stdout as NDJSON chokes on the first line.
 */
export declare function formatBackgroundLaunchLine(opts: {
    jobId: string | null;
    specialist: string;
    outputMode: OutputMode;
    tmuxSession?: string;
    pid?: number;
    error?: {
        error_code?: string;
        message?: string;
    };
}): string;
/** Extract an actionable error from a failed background child's stderr/log text. */
export declare function extractLaunchError(text: string): {
    error_code?: string;
    message?: string;
} | undefined;
interface BdBeadSummary {
    id?: string;
    parent?: string;
    issue_type?: string;
}
export declare const BEAD_ID_PATTERN: RegExp;
export declare function readBeadSummary(beadId: string): BdBeadSummary | null;
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
export declare function resolveBasePin(args: RunArgs, worktreePath?: string, coordinatorBase?: string): BasePinResult | undefined;
type SnapshotReaderFs = {
    openSync: typeof openSync;
    fstatSync: typeof fstatSync;
    readSync: typeof readSync;
    closeSync: typeof closeSync;
    realpathSync: typeof realpathSync;
    constants: Pick<typeof fsConstants, 'O_RDONLY' | 'O_NOFOLLOW'>;
};
export declare function readSafeSnapshotFile(cwd: string, file: string, maxBytes: number, fsApi?: SnapshotReaderFs): {
    ok: boolean;
    output: string;
};
export declare function buildInjectedReviewerDiffVariables(cwd: string, maxFiles?: number, explicitBaseSha?: string): Record<string, string>;
export declare function buildInjectedWriterDiffVariables(cwd: string, maxFiles?: number, explicitBaseSha?: string): Record<string, string>;
export declare function buildInjectedObligationsDiffVariables(cwd: string, maxFiles?: number, explicitBaseSha?: string): Record<string, string>;
export declare function run(): Promise<void>;
export {};
//# sourceMappingURL=run.d.ts.map