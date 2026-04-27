import type { RunResult } from './runner.js';
export interface JobSnapshot {
    job_id: string;
    status: 'running' | 'done' | 'error' | 'cancelled' | 'waiting';
    /** Full output — populated only when status === 'done'. Empty string while running or on error/cancel. */
    output: string;
    /** New content since the provided cursor (for incremental mid-run polling). */
    delta: string;
    /** Pass as cursor on next poll to receive only new content. */
    next_cursor: number;
    /** Last pi event type seen: starting | thinking | toolcall | tool_execution | text | done | error | cancelled */
    current_event: string;
    backend: string;
    model: string;
    specialist_version: string;
    duration_ms: number;
    error?: string;
    /** Beads issue ID linked to this job, if beads tracking is enabled. */
    beadId?: string;
}
export declare class JobRegistry {
    private jobs;
    register(id: string, meta: {
        backend: string;
        model: string;
        specialistVersion?: string;
    }): void;
    appendOutput(id: string, text: string): void;
    setCurrentEvent(id: string, eventType: string): void;
    /** Update backend/model from the first assistant message_start event. */
    setMeta(id: string, meta: {
        backend: string;
        model: string;
    }): void;
    /** Store the beads issue ID for this job. */
    setBeadId(id: string, beadId: string): void;
    /** Register the kill function for this job. If job was already cancelled, invokes immediately. */
    setKillFn(id: string, killFn: () => void): void;
    /** Register the steer function for this job. */
    setSteerFn(id: string, steerFn: (msg: string) => Promise<void>): void;
    /** Register resume/close functions for a keep-alive job. Sets status to 'waiting'. */
    setResumeFn(id: string, resumeFn: (msg: string) => Promise<string>, closeFn: () => Promise<void>): void;
    /** Send a follow-up prompt to a waiting keep-alive job. */
    followUp(id: string, message: string): Promise<{
        ok: boolean;
        output?: string;
        error?: string;
    }>;
    /** Close a keep-alive session and mark the job done. */
    closeSession(id: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Send a mid-run steering message to the Pi agent for this job. */
    steer(id: string, message: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    complete(id: string, result: RunResult): void;
    fail(id: string, err: Error): void;
    /** Kill the pi process and mark the job as cancelled. */
    cancel(id: string): {
        status: 'cancelled';
        duration_ms: number;
    } | undefined;
    snapshot(id: string, cursor?: number): JobSnapshot | undefined;
    delete(id: string): void;
}
//# sourceMappingURL=jobRegistry.d.ts.map