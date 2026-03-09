// tests/unit/specialist/beads.test.ts
import { describe, it, expect } from 'vitest';
import { shouldCreateBead } from '../../../src/specialist/beads.js';

describe('shouldCreateBead', () => {
  it('returns false when never', () => {
    expect(shouldCreateBead('never', 'READ_ONLY')).toBe(false);
    expect(shouldCreateBead('never', 'HIGH')).toBe(false);
  });

  it('returns true when always, regardless of permission', () => {
    expect(shouldCreateBead('always', 'READ_ONLY')).toBe(true);
    expect(shouldCreateBead('always', 'HIGH')).toBe(true);
  });

  it('returns false when auto and READ_ONLY', () => {
    expect(shouldCreateBead('auto', 'READ_ONLY')).toBe(false);
  });

  it('returns true when auto and LOW', () => {
    expect(shouldCreateBead('auto', 'LOW')).toBe(true);
  });

  it('returns true when auto and MEDIUM', () => {
    expect(shouldCreateBead('auto', 'MEDIUM')).toBe(true);
  });

  it('returns true when auto and HIGH', () => {
    expect(shouldCreateBead('auto', 'HIGH')).toBe(true);
  });
});
