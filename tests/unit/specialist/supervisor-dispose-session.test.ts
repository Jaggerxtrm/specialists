import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Supervisor } from '../../../src/specialist/supervisor.js';

function makeMockRunner() {
  return {
    run: vi.fn().mockResolvedValue({
      output: 'ok',
      model: 'model',
      backend: 'backend',
      durationMs: 1,
      specialistVersion: '1.0.0',
      promptHash: 'hash',
    }),
  } as ConstructorParameters<typeof Supervisor>[0]['runner'];
}

describe('Supervisor dispose session reap', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'supervisor-dispose-session-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('closes active Pi session during dispose', async () => {
    const supervisor = new Supervisor({
      jobsDir: join(tmpDir, 'jobs'),
      runner: makeMockRunner(),
      runOptions: { name: 'executor', prompt: 'work' },
    });
    const session = {
      close: vi.fn().mockResolvedValue(undefined),
      kill: vi.fn(),
    };

    supervisor.setActiveSession(session);
    await supervisor.dispose();

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(session.kill).not.toHaveBeenCalled();
  });

  it('kills active Pi session when graceful close fails', async () => {
    const supervisor = new Supervisor({
      jobsDir: join(tmpDir, 'jobs'),
      runner: makeMockRunner(),
      runOptions: { name: 'executor', prompt: 'work' },
    });
    const error = new Error('close timeout');
    const session = {
      close: vi.fn().mockRejectedValue(error),
      kill: vi.fn(),
    };

    supervisor.setActiveSession(session);
    await supervisor.dispose();

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(session.kill).toHaveBeenCalledWith(error);
  });
});
