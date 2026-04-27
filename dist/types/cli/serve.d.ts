import { type IncomingMessage, type ServerResponse } from 'node:http';
interface ServeArgs {
    port: number;
    concurrency: number;
    queueTimeoutMs: number;
    shutdownGraceMs: number;
    projectDir: string;
    fallbackModel?: string;
}
export declare function startServe(argv?: string[]): Promise<{
    server: import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
    args: ServeArgs;
    db: import("../specialist/observability-sqlite.js").ObservabilitySqliteClient | null;
}>;
export declare function run(argv?: string[]): Promise<void>;
export {};
//# sourceMappingURL=serve.d.ts.map