const TRANSIENT_ERROR_PATTERNS = [
    /\b5\d{2}\b/, // HTTP 5xx
    /timeout/i,
    /timed out/i,
    /econnreset/i,
    /econnrefused/i,
    /eai_again/i,
    /etimedout/i,
    /network error/i,
    /service unavailable/i,
    /bad gateway/i,
    /gateway timeout/i,
];
const AUTH_ERROR_PATTERNS = [
    /\b401\b/,
    /\b403\b/,
    /unauthorized/i,
    /forbidden/i,
    /authentication/i,
    /\bauth\b/i,
    /invalid api key/i,
    /api key/i,
];
export function isTransientError(error) {
    if (!error)
        return false;
    const status = error.status
        ?? error.statusCode;
    if (typeof status === 'number' && status >= 500 && status < 600) {
        return true;
    }
    const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : JSON.stringify(error);
    return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
export function isAuthError(error) {
    if (!error)
        return false;
    const status = error.status
        ?? error.statusCode;
    if (status === 401 || status === 403) {
        return true;
    }
    const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : JSON.stringify(error);
    return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
export class CircuitBreaker {
    states = new Map();
    threshold;
    cooldownMs;
    constructor(options = {}) {
        this.threshold = options.failureThreshold ?? 3;
        this.cooldownMs = options.cooldownMs ?? 60_000;
    }
    getState(backend) {
        const entry = this.states.get(backend);
        if (!entry)
            return 'CLOSED';
        if (entry.state === 'OPEN' && Date.now() - entry.openedAt > this.cooldownMs) {
            entry.state = 'HALF_OPEN';
        }
        return entry.state;
    }
    isAvailable(backend) {
        return this.getState(backend) !== 'OPEN';
    }
    recordSuccess(backend) {
        this.states.set(backend, { state: 'CLOSED', failures: 0 });
    }
    recordFailure(backend) {
        const entry = this.states.get(backend) ?? { state: 'CLOSED', failures: 0 };
        entry.failures++;
        if (entry.failures >= this.threshold) {
            entry.state = 'OPEN';
            entry.openedAt = Date.now();
        }
        this.states.set(backend, entry);
    }
}
//# sourceMappingURL=circuitBreaker.js.map