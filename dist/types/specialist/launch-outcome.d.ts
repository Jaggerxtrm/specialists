/** The only schema version this consumer accepts. Core owns the name. */
export declare const LAUNCH_OUTCOME_SCHEMA_VERSION = "xtrm.command-outcome.v1";
export type LaunchOutcomeErrorCode = 'invalid_json' | 'unsupported_schema' | 'invalid_outcome';
export declare class LaunchOutcomeError extends Error {
    readonly code: LaunchOutcomeErrorCode;
    constructor(code: LaunchOutcomeErrorCode, message: string);
}
export interface LaunchOutcomeRuntime {
    name: 'pi' | 'claude' | 'codex';
    version: string | null;
}
export interface LaunchOutcomeIdentity {
    thread_id: string | null;
    session_name: string | null;
    tmux_session_id: string | null;
    pane_id: string | null;
}
export interface LaunchOutcomeWorktree {
    path: string;
    branch: string;
    owner: 'core';
}
export interface LaunchOutcomeReadiness {
    status: 'ready' | 'unverified' | 'not_ready';
    source: 'agent.ready' | 'tmux-pane' | 'none';
}
export interface LaunchOutcomeSafetyProfile {
    name: string;
    sandbox: string;
    approvals: string;
    hook_trust: 'preserved';
}
export interface LaunchOutcomeMutationRecord {
    completed: boolean;
    kind: string;
}
export interface LaunchOutcomeSideEffect {
    kind: string;
    status: 'ok' | 'degraded' | 'failed' | 'skipped';
    id?: string | null;
}
export interface LaunchOutcomeAction {
    kind: 'attach' | 'resume' | 'repair' | 'end' | 'wait' | 'inspect';
    required: boolean;
    argv: string[];
    display: string;
    why: string;
    cwd?: string;
}
export interface LaunchOutcome {
    schema_version: string;
    status: 'ok' | 'degraded' | 'noop' | 'rejected' | 'failed';
    reason_code: string;
    summary: string;
    runtime: LaunchOutcomeRuntime | null;
    identity: LaunchOutcomeIdentity | null;
    worktree: LaunchOutcomeWorktree | null;
    readiness: LaunchOutcomeReadiness | null;
    safety_profile: LaunchOutcomeSafetyProfile | null;
    persistence: LaunchOutcomeMutationRecord | null;
    authoritative_mutation: LaunchOutcomeMutationRecord;
    side_effects: LaunchOutcomeSideEffect[];
    next_actions: LaunchOutcomeAction[];
}
/** The whitelist projection emitted to consumers. Key order is stable. */
export type LaunchOutcomeProjection = LaunchOutcome;
export declare function parseLaunchOutcome(raw: string): unknown;
/**
 * Validate an outcome against the Core contract boundary.
 *
 * Required fields and enums follow `xtrm.command-outcome.v1` at the gate
 * commit. Unknown top-level and nested fields are tolerated (forward
 * compatibility) but never projected.
 */
export declare function validateLaunchOutcome(value: unknown): LaunchOutcome;
/**
 * Whitelist projection of a validated outcome.
 *
 * Rebuilds the object key-by-key from the typed validation result, so any
 * unrecognized input field is dropped here rather than echoed. This is the
 * consumer-side redaction guarantee.
 */
export declare function projectLaunchOutcome(outcome: LaunchOutcome): LaunchOutcomeProjection;
//# sourceMappingURL=launch-outcome.d.ts.map