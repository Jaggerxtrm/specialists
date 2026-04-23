import { PiAgentSession, type PiSessionOptions, type SessionMetricEvent, type SessionRunMetrics } from '../pi/session.js';
import type { SpecialistLoader } from './loader.js';
import type { HookEmitter } from './hooks.js';
import { type CircuitBreaker } from '../utils/circuitBreaker.js';
export interface RunOptions {
    name: string;
    prompt: string;
    variables?: Record<string, string>;
    backendOverride?: string;
    autonomyLevel?: string;
    /** Working directory for local scripts and the pi session. */
    workingDirectory?: string;
    /** Absolute write-boundary for write-side tools inside pi session. */
    worktreeBoundary?: string;
    /** Existing bead whose content should be used as the task prompt. */
    inputBeadId?: string;
    /** Owning epic id for wave-bound chains, when bead belongs to an epic. */
    epicId?: string;
    /** Lineage: set when --job <id> is used to reuse another job's worktree. */
    reusedFromJobId?: string;
    /** Bead dependency context depth (0 disables completed blocker injection). */
    contextDepth?: number;
    /** Lineage: root job id that originally created the reused worktree. */
    worktreeOwnerJobId?: string;
    /** Path to an existing pi session file for continuation (Phase 2+) */
    sessionPath?: string;
    /**
     * Keep the Pi session alive after agent_end.
     * Enables multi-turn: callers receive resumeFn/closeFn via onResumeReady callback.
     */
    keepAlive?: boolean;
    /** Explicitly disable keepAlive even when specialist.execution.interactive=true. */
    noKeepAlive?: boolean;
    /** Additional retries after the initial attempt (default: 0). */
    maxRetries?: number;
    /** Whether external (input) bead notes should be written by Supervisor. */
    beadsWriteNotes?: boolean;
}
export interface RunResult {
    output: string;
    backend: string;
    model: string;
    durationMs: number;
    specialistVersion: string;
    promptHash: string;
    beadId?: string;
    metrics?: SessionRunMetrics;
    permissionRequired?: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
    autoCommit?: 'never' | 'checkpoint_on_waiting' | 'checkpoint_on_terminal';
}
type SessionLike = Pick<PiAgentSession, 'start' | 'prompt' | 'waitForDone' | 'getLastOutput' | 'getState' | 'close' | 'kill' | 'meta' | 'steer' | 'resume'> & {
    getMetrics?: () => SessionRunMetrics;
};
export type SessionFactory = (opts: PiSessionOptions) => Promise<SessionLike>;
import { type BeadsClient as BeadsClientType } from './beads.js';
interface RunnerDeps {
    loader: SpecialistLoader;
    hooks: HookEmitter;
    circuitBreaker: CircuitBreaker;
    /** Overridable for testing; defaults to PiAgentSession.create */
    sessionFactory?: SessionFactory;
    /** Optional beads client for specialist run tracking */
    beadsClient?: BeadsClientType;
}
export declare class SpecialistRunner {
    private deps;
    private sessionFactory;
    constructor(deps: RunnerDeps);
    private resolvePromptWithBeadContext;
    run(options: RunOptions, onProgress?: (msg: string) => void, onEvent?: (type: string, details?: {
        charCount?: number;
        toolCallId?: string;
        model?: string;
        previousModel?: string;
        action?: 'set_model' | 'cycle_model';
        extension?: string;
        errorMessage?: string;
        tokensBefore?: number;
        summary?: string;
        source?: string;
        data?: Record<string, unknown>;
        firstKeptEntryId?: string;
        attempt?: number;
        maxAttempts?: number;
        delayMs?: number;
    }) => void, onMetric?: (event: SessionMetricEvent) => void, onMeta?: (meta: {
        backend: string;
        model: string;
    }) => void, onKillRegistered?: (killFn: () => void) => void, onBeadCreated?: (beadId: string) => void, onSteerRegistered?: (steerFn: (msg: string) => Promise<void>) => void, onResumeReady?: (resumeFn: (msg: string) => Promise<string>, closeFn: () => Promise<void>) => void, onToolStartCallback?: (tool: string, args?: Record<string, unknown>, toolCallId?: string) => void, onToolEndCallback?: (tool: string, isError: boolean, toolCallId?: string, resultContent?: string, resultRaw?: Record<string, unknown>) => void): Promise<RunResult>;
    /**
     * @deprecated Legacy in-memory async path.
     * Now uses Supervisor-backed jobs under .specialists/jobs.
     */
    startAsync(options: RunOptions, registry: import('./jobRegistry.js').JobRegistry): Promise<string>;
}
export {};
//# sourceMappingURL=runner.d.ts.map