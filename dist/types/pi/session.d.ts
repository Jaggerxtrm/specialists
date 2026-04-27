export declare class SessionKilledError extends Error {
    constructor();
}
export declare class StallTimeoutError extends Error {
    constructor(timeoutMs: number);
}
export interface AgentSessionMeta {
    backend: string;
    model: string;
    sessionId: string;
    startedAt: Date;
}
export interface SessionTokenUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
}
export interface SessionRunMetrics {
    token_usage?: SessionTokenUsage;
    finish_reason?: string;
    exit_reason?: string;
    turns?: number;
    tool_calls?: number;
    tool_call_names?: string[];
    auto_compactions?: number;
    auto_retries?: number;
    api_error?: string;
}
export type SessionMetricEvent = {
    type: 'token_usage';
    token_usage: SessionTokenUsage;
    source: 'message_done' | 'turn_end' | 'agent_end';
} | {
    type: 'finish_reason';
    finish_reason: string;
    source: 'message_done' | 'turn_end' | 'agent_end';
} | {
    type: 'turn_summary';
    turn_index: number;
    token_usage?: SessionTokenUsage;
    finish_reason?: string;
} | {
    type: 'compaction';
    phase: 'start' | 'end';
    tokensBefore?: number;
    summary?: string;
    firstKeptEntryId?: string;
} | {
    type: 'retry';
    phase: 'start' | 'end';
    attempt?: number;
    maxAttempts?: number;
    delayMs?: number;
    errorMessage?: string;
} | {
    type: 'model_change';
    action: 'set_model' | 'cycle_model';
    model?: string;
    previousModel?: string;
} | {
    type: 'extension_error';
    extension?: string;
    errorMessage?: string;
} | {
    type: 'api_error';
    source: 'rpc' | 'stderr';
    errorMessage: string;
};
export interface PiSessionOptions {
    model: string;
    systemPrompt?: string;
    /** Absolute path boundary for write-side tools; undefined disables enforcement */
    worktreeBoundary?: string;
    /** Permission level from specialist YAML — controls which pi tools are enabled */
    permissionLevel?: string;
    /** Skill files loaded via pi --skill (injected into system prompt natively) */
    skillPaths?: string[];
    /** Thinking level passed as pi --thinking <level> */
    thinkingLevel?: string;
    /** Working directory for the pi process — defaults to process.cwd() if not set */
    cwd?: string;
    /** Extra environment variables injected into the pi process */
    env?: Record<string, string>;
    /** npm extension package names to skip when assembling pi -e args */
    excludeExtensions?: string[];
    /** Called with each text token as it arrives */
    onToken?: (delta: string) => void;
    /** Called with each thinking token */
    onThinking?: (delta: string) => void;
    /** Called with tool name, optional args payload, and optional tool call ID when a tool starts executing */
    onToolStart?: (tool: string, args?: Record<string, unknown>, toolCallId?: string) => void;
    /** Called with tool name, error flag, optional tool call ID, summarized result content, and optional raw result payload */
    onToolEnd?: (tool: string, isError: boolean, toolCallId?: string, resultContent?: string, resultRaw?: Record<string, unknown>) => void;
    /** Called with the raw pi event type (for job status tracking) */
    onEvent?: (type: string, details?: {
        charCount?: number;
        toolCallId?: string;
        model?: string;
        previousModel?: string;
        action?: 'set_model' | 'cycle_model';
        extension?: string;
        errorMessage?: string;
        tokensBefore?: number;
        summary?: string;
        firstKeptEntryId?: string;
        attempt?: number;
        maxAttempts?: number;
        delayMs?: number;
    }) => void;
    /** Called with additive observability metrics derived from RPC events */
    onMetric?: (event: SessionMetricEvent) => void;
    /** Called once with actual backend/model from the first assistant message_start */
    onMeta?: (meta: {
        backend: string;
        model: string;
    }) => void;
    /** Kill and fail if no streaming/protocol activity occurs within this window */
    stallTimeoutMs?: number;
    /** Extended stall timeout used while known test commands run via bash tool */
    testCommandStallTimeoutMs?: number;
}
export declare function validateWriteToolPathAgainstBoundary(toolName: string, toolArgs: Record<string, unknown> | undefined, worktreeBoundary: string | undefined): string | undefined;
export declare class PiAgentSession {
    private options;
    private proc?;
    private _lastOutput;
    private _donePromise?;
    private _doneResolve?;
    private _doneReject?;
    private _agentEndReceived;
    private _killed;
    private _lineBuffer;
    private _pendingRequests;
    private _nextRequestId;
    private _stderrBuffer;
    private _apiError?;
    private _stallTimer?;
    private _stallError?;
    private _testWindowToolCallIds;
    private _testWindowWithoutIdCount;
    private _metrics;
    readonly meta: AgentSessionMeta;
    private constructor();
    static create(options: PiSessionOptions): Promise<PiAgentSession>;
    start(): Promise<void>;
    private _clearStallTimer;
    private _isTestWindowActive;
    private _resolveStallTimeoutMs;
    private _activateTestWindow;
    private _deactivateTestWindow;
    private _markActivity;
    private _updateTokenUsage;
    private _updateFinishReason;
    private _handleEvent;
    /**
     * Send a JSON command to pi's stdin and return a promise for the response.
     * Each call is assigned a unique ID; concurrent calls are supported.
     */
    private sendCommand;
    /**
     * Write the prompt to pi's stdin and await the RPC ack.
     * Stdin is kept open for subsequent RPC commands.
     * Call waitForDone() to block until agent_end, then close() to terminate.
     */
    prompt(task: string): Promise<void>;
    /**
     * Wait for the agent to finish. Optionally times out (throws Error on timeout).
     */
    waitForDone(timeout?: number): Promise<void>;
    /**
     * Get the last assistant output text. Tries RPC first, falls back to in-memory capture.
     */
    getLastOutput(): Promise<string>;
    /**
     * Get current session state via RPC.
     */
    getState(): Promise<any>;
    getMetrics(): SessionRunMetrics;
    /**
     * Close the pi process cleanly by ending stdin (EOF) and waiting for exit.
     */
    close(): Promise<void>;
    kill(reason?: Error): void;
    /** Returns accumulated stderr output from the pi process. */
    getStderr(): string;
    /**
     * Send a mid-run steering message to the Pi agent and await the RPC ack.
     * Pi delivers it after the current assistant turn finishes tool calls.
     */
    steer(message: string): Promise<void>;
    /**
     * Queue a follow_up on the Pi session using pi's native follow_up RPC command.
     * This is distinct from resume(): follow_up queues work during a still-running turn,
     * while resume() sends a next-turn prompt to a waiting (idle) session.
     *
     * Not yet implemented — reserved to prevent semantic drift with pi's native follow_up.
     */
    followUp(_task: string): never;
    /**
     * Start a new turn on the same Pi session (keep-alive multi-turn).
     * Resets done state and sends a new prompt — Pi retains full conversation history.
     * Only valid after waitForDone() has resolved for the previous turn.
     */
    resume(task: string, timeout?: number): Promise<void>;
}
//# sourceMappingURL=session.d.ts.map