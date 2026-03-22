// tests/unit/specialist/jobRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { JobRegistry } from '../../../src/specialist/jobRegistry.js';

function makeResult(overrides = {}) {
  return {
    output: 'done output',
    backend: 'anthropic',
    model: 'claude-haiku-4-5',
    durationMs: 1234,
    specialistVersion: '1.0.0',
    promptHash: 'abc123def4567890',
    ...overrides,
  };
}

describe('JobRegistry', () => {
  it('registers a job and returns running snapshot', () => {
    const reg = new JobRegistry();
    reg.register('job-1', { backend: 'anthropic', model: 'haiku' });
    const snap = reg.snapshot('job-1');
    expect(snap?.status).toBe('running');
    expect(snap?.job_id).toBe('job-1');
    expect(snap?.beadId).toBeUndefined();
  });

  it('snapshot includes beadId when set via setBeadId', () => {
    const reg = new JobRegistry();
    reg.register('job-1', { backend: 'anthropic', model: 'haiku' });
    reg.setBeadId('job-1', 'specialists-42');
    const snap = reg.snapshot('job-1');
    expect(snap?.beadId).toBe('specialists-42');
  });

  it('complete propagates beadId from RunResult', () => {
    const reg = new JobRegistry();
    reg.register('job-1', { backend: 'anthropic', model: 'haiku' });
    reg.complete('job-1', makeResult({ beadId: 'specialists-99' }));
    const snap = reg.snapshot('job-1');
    expect(snap?.status).toBe('done');
    expect(snap?.beadId).toBe('specialists-99');
  });

  it('complete without beadId leaves beadId undefined', () => {
    const reg = new JobRegistry();
    reg.register('job-1', { backend: 'anthropic', model: 'haiku' });
    reg.complete('job-1', makeResult());
    const snap = reg.snapshot('job-1');
    expect(snap?.beadId).toBeUndefined();
  });

  it('setBeadId is no-op on unknown job', () => {
    const reg = new JobRegistry();
    expect(() => reg.setBeadId('no-such', 'specialists-1')).not.toThrow();
  });
});
