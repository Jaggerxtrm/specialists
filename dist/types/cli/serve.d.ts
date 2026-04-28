import { type IncomingMessage, type ServerResponse } from 'node:http';
interface ServeArgs {
    port: number;
    concurrency: number;
    queueTimeoutMs: number;
    shutdownGraceMs: number;
    projectDir: string;
    fallbackModel?: string;
    auditFailureThreshold: number;
    allowSkills: boolean;
    allowSkillsRoots: string[];
    allowLocalScripts: boolean;
    reloadPollMs: number;
}
export type ReadinessReason = 'draining' | 'degraded:audit' | 'pi_config_unreadable' | 'db_not_writable' | 'empty_user_dir' | 'invalid_spec_in_user_dir';
export interface ReadinessState {
    shuttingDown: boolean;
    auditFailures: number[];
    dbWriteFailuresTotal: number;
}
export declare function createReadinessState(): ReadinessState;
export declare function recordAuditFailure(state: ReadinessState, now?: number): void;
export interface ReadinessCheckOptions {
    state: ReadinessState;
    projectDir: string;
    dbPath: string;
    piConfigPath?: string;
    auditFailureThreshold: number;
    now?: number;
}
export declare function evaluateReadiness(opts: ReadinessCheckOptions): Promise<{
    ready: true;
} | {
    ready: false;
    reason: ReadinessReason;
}>;
export declare function startServe(argv?: string[]): Promise<{
    server: import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
    args: ServeArgs;
    db: import("../specialist/observability-sqlite.js").ObservabilitySqliteClient | null;
    readinessState: ReadinessState;
}>;
export declare function run(argv?: string[]): Promise<void>;
export {};
//# sourceMappingURL=serve.d.ts.map