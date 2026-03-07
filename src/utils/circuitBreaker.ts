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
