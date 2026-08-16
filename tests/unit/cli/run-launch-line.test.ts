import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { BACKGROUND_LAUNCH_SCHEMA, extractLaunchError, formatBackgroundLaunchLine } from '../../../src/cli/run.js';

// `sp run --background` exits before the NDJSON projector starts. Help advertises
// --background and --json in the same options list, so the combination must still
// produce parseable NDJSON on stdout — a bare job id does not.
describe('formatBackgroundLaunchLine', () => {
  it('prints a bare job id in human mode', () => {
    expect(formatBackgroundLaunchLine({
      jobId: 'd9663f', specialist: 'explorer', outputMode: 'human',
    })).toBe('d9663f\n');
  });

  it('emits one parseable NDJSON launch event under --json', () => {
    const line = formatBackgroundLaunchLine({
      jobId: 'd9663f', specialist: 'explorer', outputMode: 'json', tmuxSession: 'sp-explorer-a1b2c3',
    });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd().includes('\n')).toBe(false);
    expect(JSON.parse(line)).toEqual({
      schema: BACKGROUND_LAUNCH_SCHEMA,
      type: 'job_started',
      jobId: 'd9663f',
      specialist: 'explorer',
      detached: true,
      tmuxSession: 'sp-explorer-a1b2c3',
    });
  });

  it('reports a null jobId with the pid when the id never landed', () => {
    expect(JSON.parse(formatBackgroundLaunchLine({
      jobId: null, specialist: 'explorer', outputMode: 'json', pid: 4242,
    }))).toMatchObject({ type: 'job_started', jobId: null, pid: 4242 });

    // Human mode keeps the historical pid-fallback line.
    expect(formatBackgroundLaunchLine({
      jobId: null, specialist: 'explorer', outputMode: 'human', pid: 4242,
    })).toBe('4242\n');
  });

  // A pi consumer must be able to tell a launch event from the run stream it would
  // get in the foreground, rather than mis-parsing one as the other.
  it('tags the event with a schema distinct from the pi run stream', () => {
    const event = JSON.parse(formatBackgroundLaunchLine({
      jobId: 'd9663f', specialist: 'explorer', outputMode: 'json',
    }));
    expect(event.schema).toBe('specialists.background_launch.v1');
    expect(event.type).not.toBe('session');
    expect(event.type).not.toBe('agent_start');
  });

  // xtrm-5kwk2 Layer 1: a failed background launch (e.g. stale_base refusal)
  // must surface an actionable error in the envelope instead of a silent
  // jobId:null success. The error field is additive and only present when the
  // job id never landed, so the schema stays backward compatible.
  it('carries the launch error when the job id never lands', () => {
    const event = JSON.parse(formatBackgroundLaunchLine({
      jobId: null, specialist: 'debugger', outputMode: 'json', pid: 4242,
      error: { error_code: 'stale_base', message: 'Fatal error: Error: {"ok":false,"error_code":"stale_base"}' },
    }));
    expect(event.jobId).toBe(null);
    expect(event.pid).toBe(4242);
    expect(event.error).toEqual({
      error_code: 'stale_base',
      message: 'Fatal error: Error: {"ok":false,"error_code":"stale_base"}',
    });
  });

  it('omits the error field from a healthy launch envelope', () => {
    const event = JSON.parse(formatBackgroundLaunchLine({
      jobId: 'd9663f', specialist: 'explorer', outputMode: 'json', tmuxSession: 'sp-explorer-a1b2c3',
    }));
    expect(event).not.toHaveProperty('error');
  });
});

describe('extractLaunchError', () => {
  // Exact stderr shape from the xtrm-5kwk2 repro: the foreground run prints
  // '[specialists] [ERROR] Fatal error: ...' with the refusal JSON embedded.
  it('parses error_code and message from a stale_base fatal stderr line', () => {
    const stderr = [
      '[specialists] [ERROR] Fatal error: Error: {"ok":false,"error_code":"stale_base","blocked_by":["worktree_base_mismatch"],"commits_behind":1}',
      'next_safe_action: "Fetch/recreate worktree from declared base"',
    ].join('\n');
    const parsed = extractLaunchError(stderr);
    expect(parsed?.error_code).toBe('stale_base');
    expect(parsed?.message).toContain('error_code');
  });

  it('returns undefined for empty or whitespace-only stderr', () => {
    expect(extractLaunchError('')).toBeUndefined();
    expect(extractLaunchError('   \n  ')).toBeUndefined();
  });
});

describe('sp run --background --raw', () => {
  // --raw promises LLM text deltas; a detached run has none to hand back, so the
  // caller would read a 6-char job id as model output. Reject instead.
  it('is rejected before any job starts', () => {
    const entry = join(process.cwd(), 'dist', 'index.js');
    let stderr = '';
    let status = 0;
    try {
      execFileSync('bun', [entry, 'run', 'explorer', '--prompt', 'hi', '--background', '--raw'], {
        encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      status = err.status;
      stderr = String(err.stderr ?? '');
    }
    expect(status).toBe(1);
    expect(stderr).toContain('--background and --raw are mutually exclusive');
  });
});
