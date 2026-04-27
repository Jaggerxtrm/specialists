/** Returns true if tmux is available on PATH */
export declare function isTmuxAvailable(): boolean;
/** Build canonical session name: sp-<specialist>-<suffix> */
export declare function buildSessionName(specialist: string, suffix: string): string;
/**
 * Create a detached tmux session running cmd.
 * - Sets SPECIALISTS_TMUX_SESSION=name as env var inside the session
 * - Unsets CLAUDECODE, CLAUDE_CODE_SSE_PORT, CLAUDE_CODE_ENTRYPOINT (Claude Code nesting guard)
 * - Wraps command in /bin/bash -c '...' for cross-shell compatibility
 * - extraEnv: additional key=value pairs to export in the session
 * @throws if tmux exits non-zero
 */
export declare function createTmuxSession(name: string, cwd: string, cmd: string, extraEnv?: Record<string, string>): void;
/**
 * Check whether a tmux session currently exists.
 * Returns false when tmux exits non-zero or the check times out.
 */
export declare function isTmuxSessionAlive(sessionName: string): boolean;
/**
 * Kill a tmux session. Idempotent — does not throw if session is already dead.
 */
export declare function killTmuxSession(name: string): void;
//# sourceMappingURL=tmux-utils.d.ts.map