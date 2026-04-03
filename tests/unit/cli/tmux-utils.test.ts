import { describe, it, expect, vi, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual };
});
import {
  buildSessionName,
  createTmuxSession,
  isTmuxAvailable,
  killTmuxSession,
} from '../../../src/cli/tmux-utils.js';

describe('tmux-utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('buildSessionName returns canonical format', () => {
    expect(buildSessionName('executor', 'a1b2c3')).toBe('sp-executor-a1b2c3');
  });

  it('buildSessionName keeps hyphenated specialist names without double hyphens', () => {
    const sessionName = buildSessionName('code-review', 'a1b2c3');
    expect(sessionName).toBe('sp-code-review-a1b2c3');
    expect(sessionName).not.toContain('--');
  });

  it('isTmuxAvailable returns a boolean', () => {
    expect(typeof isTmuxAvailable()).toBe('boolean');
  });

  it('createTmuxSession throws when tmux exits non-zero', () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({
      pid: 0,
      output: [],
      stdout: '',
      stderr: 'tmux failed',
      status: 1,
      signal: null,
    } as any);

    expect(() =>
      createTmuxSession('sp-executor-a1b2c3', '/tmp', 'echo hello'),
    ).toThrow(/Failed to create tmux session/);
  });

  it.skipIf(!isTmuxAvailable())('killTmuxSession does not throw for a non-existent session', () => {
    expect(() => killTmuxSession(`sp-missing-${Date.now()}`)).not.toThrow();
  });

});
