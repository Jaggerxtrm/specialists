// tests/unit/circuitBreaker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../src/utils/circuitBreaker.js';

describe('CircuitBreaker (3-state)', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
  });

  it('starts CLOSED', () => {
    expect(cb.getState('gemini')).toBe('CLOSED');
    expect(cb.isAvailable('gemini')).toBe(true);
  });

  it('transitions CLOSED → OPEN after threshold failures', () => {
    cb.recordFailure('gemini');
    cb.recordFailure('gemini');
    expect(cb.getState('gemini')).toBe('CLOSED'); // not yet
    cb.recordFailure('gemini');
    expect(cb.getState('gemini')).toBe('OPEN');
    expect(cb.isAvailable('gemini')).toBe(false);
  });

  it('transitions OPEN → HALF_OPEN after cooldown', async () => {
    cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
    cb.recordFailure('gemini');
    expect(cb.getState('gemini')).toBe('OPEN');
    await new Promise(r => setTimeout(r, 60));
    expect(cb.getState('gemini')).toBe('HALF_OPEN');
    expect(cb.isAvailable('gemini')).toBe(true); // allow probe
  });

  it('transitions HALF_OPEN → CLOSED on success', async () => {
    cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
    cb.recordFailure('gemini');
    await new Promise(r => setTimeout(r, 60));
    cb.recordSuccess('gemini');
    expect(cb.getState('gemini')).toBe('CLOSED');
  });

  it('transitions HALF_OPEN → OPEN on failure', async () => {
    cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
    cb.recordFailure('gemini');
    await new Promise(r => setTimeout(r, 60));
    expect(cb.getState('gemini')).toBe('HALF_OPEN');
    cb.recordFailure('gemini');
    expect(cb.getState('gemini')).toBe('OPEN');
  });
});
