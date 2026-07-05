import type { SupervisorStatus } from './supervisor.js';
export type ProcessHealthThresholds = {
    warnPct: number;
    refusePct: number;
};
export type ProcessHealthProcessKind = 'specialist' | 'dolt' | 'serena-lsp' | 'orphan';
export interface ProcessHealthProcess {
    pid: number;
    ppid: number;
    kind: ProcessHealthProcessKind;
    role: string;
    cmdline: string;
    cwd: string | null;
    rssBytes: number;
    cpuPct: number;
    ageSeconds: number;
    worktree: string | null;
    reason?: 'dolt-worktree-local' | 'gitnexus-orphan' | 'pi-orphan' | 'deleted-worktree-process';
}
export interface ProcessHealthWorkspaceGroup {
    workspace: string;
    count: number;
    rssBytes: number;
    processes: ProcessHealthProcess[];
}
export interface StaleSpecialistJobCandidate {
    jobId: string;
    pid: number;
    beadId: string | null;
    specialist: string;
    cwd: string | null;
    ageMs: number;
    /**
     * - dead-pid: registry active, PID gone (existing container-restart-orphan class).
     * - orphaned-keep-alive: registry waiting, ppid==1, edit-capable keep-alive reparented after wrapper died.
     * - dead-toolchain: registry active, PID alive but no tool/think activity in the window.
     * - terminal-alive: registry done/error/cancelled but PID (and its detached pi child) still running.
     *   Class introduced for unitAI-yme9q — pi keep-alive sessions dispatched via bare `sp run ... &`
     *   (no console/daemon driving the FIFO, waiting_auto_close_ms unset) never receive a close signal;
     *   the job's SQLite row is marked terminal for chain bookkeeping while the OS process leaks indefinitely.
     */
    reason: 'dead-pid' | 'orphaned-keep-alive' | 'dead-toolchain' | 'terminal-alive';
}
export type ProcessHealthStatus = 'OK' | 'WARN' | 'REFUSE';
export interface ProcessHealthReport {
    status: ProcessHealthStatus;
    statusReasons: string[];
    memAvailableBytes: number;
    totalRssBytes: number;
    totalCpuPct: number;
    specialistCount: number;
    doltCount: number;
    serenaLspCount: number;
    orphanCount: number;
    thresholdPct: number;
    warnPct: number;
    refusePct: number;
    warnLimitBytes: number;
    refuseLimitBytes: number;
    specialistProcesses: ProcessHealthProcess[];
    doltProcesses: ProcessHealthProcess[];
    serenaWorkspaces: ProcessHealthWorkspaceGroup[];
    orphanProcesses: ProcessHealthProcess[];
}
interface StaleSpecialistJobSource {
    listStatuses(): SupervisorStatus[];
    getLastActivityTimestampMs?(jobId: string): number | null;
}
export declare function getProcessHealthThresholds(env?: NodeJS.ProcessEnv): ProcessHealthThresholds;
export declare function collectProcessHealth(options?: {
    procRoot?: string;
    meminfoPath?: string;
    nowMs?: number;
}): ProcessHealthReport;
export declare function collectOrphanProcesses(options?: {
    procRoot?: string;
    nowMs?: number;
}): ProcessHealthProcess[];
export declare function collectStaleSpecialistJobs(options?: {
    procRoot?: string;
    nowMs?: number;
    minKeepAliveAgeMs?: number;
    /**
     * Minimum ms since the last update on a terminal-status job before its still-alive PID
     * is treated as a leak. pi's session close-path has an 8s group-SIGKILL backstop, so any
     * process still alive well past that has failed to receive a close signal. Default 60s.
     */
    minTerminalAliveAgeMs?: number;
    observabilityClient?: StaleSpecialistJobSource;
}): StaleSpecialistJobCandidate[];
export {};
//# sourceMappingURL=process-health.d.ts.map