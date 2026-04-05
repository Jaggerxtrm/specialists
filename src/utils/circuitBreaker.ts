// src/utils/circuitBreaker.ts
type State = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

interface Entry {
  state: State;
  failures: number;
  openedAt?: number;
}

interface CircuitBreakerOptions {
  failureThreshold?: number;  // failures before OPEN (default: 3)
  cooldownMs?: number;         // OPEN → HALF_OPEN wait (default: 60_000)
}

const TRANSIENT_ERROR_PATTERNS = [
  /\b5\d{2}\b/,           // HTTP 5xx
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
] as const;

const AUTH_ERROR_PATTERNS = [
  /\b401\b/,
  /\b403\b/,
  /unauthorized/i,
  /forbidden/i,
  /authentication/i,
  /\bauth\b/i,
  /invalid api key/i,
  /api key/i,
] as const;

export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  const status = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode;
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

export function isAuthError(error: unknown): boolean {
  if (!error) return false;

  const status = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode;
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
  private states = new Map<string, Entry>();
  private threshold: number;
  private cooldownMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 60_000;
  }

  getState(backend: string): State {
    const entry = this.states.get(backend);
    if (!entry) return 'CLOSED';
    if (entry.state === 'OPEN' && Date.now() - entry.openedAt! > this.cooldownMs) {
      entry.state = 'HALF_OPEN';
    }
    return entry.state;
  }

  isAvailable(backend: string): boolean {
    return this.getState(backend) !== 'OPEN';
  }

  recordSuccess(backend: string): void {
    this.states.set(backend, { state: 'CLOSED', failures: 0 });
  }

  recordFailure(backend: string): void {
    const entry = this.states.get(backend) ?? { state: 'CLOSED', failures: 0 };
    entry.failures++;
    if (entry.failures >= this.threshold) {
      entry.state = 'OPEN';
      entry.openedAt = Date.now();
    }
    this.states.set(backend, entry);
  }
}
