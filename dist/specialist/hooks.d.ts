type HookType = 'pre_render' | 'post_render' | 'pre_execute' | 'post_execute';
type CBState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';
interface HookPayloads {
    pre_render: {
        variables_keys: string[];
        backend_resolved: string;
        fallback_used: boolean;
        circuit_breaker_state: CBState;
        scope: string;
    };
    post_render: {
        prompt_hash: string;
        prompt_length_chars: number;
        estimated_tokens: number;
        system_prompt_present: boolean;
    };
    pre_execute: {
        backend: string;
        model: string;
        timeout_ms: number;
        permission_level: string;
    };
    post_execute: {
        status: 'COMPLETE' | 'IN_PROGRESS' | 'BLOCKED' | 'ERROR' | 'CANCELLED';
        duration_ms: number;
        output_valid: boolean;
        error?: {
            type: string;
            message: string;
        };
    };
}
export declare class HookEmitter {
    private tracePath;
    private customHandlers;
    private ready;
    constructor(options: {
        tracePath: string;
    });
    emit<T extends HookType>(hook: T, invocationId: string, specialistName: string, specialistVersion: string, payload: HookPayloads[T]): Promise<void>;
    onHook(hook: HookType, handler: (event: unknown) => void): void;
}
export {};
//# sourceMappingURL=hooks.d.ts.map