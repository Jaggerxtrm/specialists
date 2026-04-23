type State = 'CLOSED' | 'HALF_OPEN' | 'OPEN';
interface CircuitBreakerOptions {
    failureThreshold?: number;
    cooldownMs?: number;
}
export declare function isTransientError(error: unknown): boolean;
export declare function isAuthError(error: unknown): boolean;
export declare class CircuitBreaker {
    private states;
    private threshold;
    private cooldownMs;
    constructor(options?: CircuitBreakerOptions);
    getState(backend: string): State;
    isAvailable(backend: string): boolean;
    recordSuccess(backend: string): void;
    recordFailure(backend: string): void;
}
export {};
//# sourceMappingURL=circuitBreaker.d.ts.map