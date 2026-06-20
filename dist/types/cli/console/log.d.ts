export type ConsoleErrorOp = 'bd_show' | 'git_diff' | 'git_numstat' | 'git_show' | 'git_status' | 'merge_base' | 'subscribe_feed' | 'list_processes' | 'read_global_config' | 'write_global_config' | 'editor_spawn' | 'render';
export type ConsoleView = 'ps' | 'feed' | 'job' | 'bead' | 'diff' | 'config' | 'result';
export interface LogErrorExtras {
    exitCode?: number | null;
    durationMs?: number;
    errorClass?: string;
    beadId?: string;
    step?: string;
}
export declare function logError(view: ConsoleView, op: ConsoleErrorOp, extras?: LogErrorExtras): void;
export declare function resetLogErrorMemo(): void;
export declare function errorClassOf(error: unknown): string;
//# sourceMappingURL=log.d.ts.map