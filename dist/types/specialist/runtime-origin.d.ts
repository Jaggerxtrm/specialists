export declare const SPECIALISTS_RUNTIME_ORIGIN_V1 = "SPECIALISTS_RUNTIME_ORIGIN_V1";
export declare const MAX_ORIGIN_JSON_BYTES: number;
export declare const DEFAULT_CAPTURE_TIMEOUT_MS = 500;
declare const SCHEMA_VERSION: "xtrm.runtime-origin.v1";
declare const KIND_AGENT_INSTANCE: "xtmux.agent_instance";
type CaptureSource = 'xtmux-context' | 'propagated';
export interface RuntimeOriginV1 {
    schema_version: typeof SCHEMA_VERSION;
    kind: typeof KIND_AGENT_INSTANCE;
    host_id: string;
    tmux_server_id?: string;
    tmux_session_id: string;
    tmux_window_id: string;
    tmux_pane_id: string;
    agent_instance_id?: string;
    bead_id?: string;
    parent_session_id?: string;
    captured_at_ms: number;
    capture_source: CaptureSource;
    verified: boolean;
}
export type SpecialistSpawnOriginV1 = {
    kind: 'xtmux.agent_instance';
    runtime_origin: RuntimeOriginV1;
} | {
    kind: 'specialist.job';
    parent_job_id: string;
} | {
    kind: 'unknown';
};
type SubprocessRunner = (cmd: string, args: string[], opts: {
    timeoutMs: number;
    env: NodeJS.ProcessEnv;
}) => {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: NodeJS.ErrnoException;
};
export declare function validateRuntimeOrigin(input: unknown): RuntimeOriginV1 | {
    error: string;
};
export interface CaptureRuntimeOriginOptions {
    subprocess?: SubprocessRunner;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
}
export declare function captureRuntimeOrigin(opts?: CaptureRuntimeOriginOptions): Promise<RuntimeOriginV1 | undefined>;
export declare function decodePropagatedOrigin(env: NodeJS.ProcessEnv): RuntimeOriginV1 | undefined;
export declare function encodePropagatedOrigin(origin: RuntimeOriginV1): string;
export declare function resolveSpawnOrigin(input: {
    explicitParentJobId?: string;
    ambientRuntimeOrigin?: RuntimeOriginV1;
    inheritedRootRuntimeOrigin?: RuntimeOriginV1;
}): {
    spawn_origin: SpecialistSpawnOriginV1;
    parent_job_id?: string;
    root_runtime_origin?: RuntimeOriginV1;
};
export {};
//# sourceMappingURL=runtime-origin.d.ts.map