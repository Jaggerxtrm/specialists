import { describe, expect, it } from 'vitest';
import { formatBackgroundLaunchLine } from '../../../src/cli/run.js';

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

  it('leaves --raw on the plain id path', () => {
    expect(formatBackgroundLaunchLine({
      jobId: 'd9663f', specialist: 'explorer', outputMode: 'raw',
    })).toBe('d9663f\n');
  });
});
