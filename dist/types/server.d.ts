import { type ObservabilitySqliteClient } from './specialist/observability-sqlite.js';
type McpCallContext = {
    mcpSessionId: string;
    jsonrpcRequestId?: string;
    traceId: string;
    spanId: string;
};
export declare function createMcpCallContext(sessionId: string, request?: {
    id?: unknown;
}): McpCallContext;
export declare function toMcpMeta(context: McpCallContext): Record<string, string>;
export declare function emitMcpForensicEvent(observability: ObservabilitySqliteClient | null, eventName: string, context: McpCallContext, body: Record<string, unknown>, durationMs?: number, errorType?: string): void;
export declare class SpecialistsServer {
    private server;
    private tools;
    private observability;
    private mcpSessionId;
    constructor();
    private toolSchemas;
    private setupHandlers;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export {};
//# sourceMappingURL=server.d.ts.map