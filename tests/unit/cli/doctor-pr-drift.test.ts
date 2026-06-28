import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdatePrDriftState = vi.fn(() => true);
const mockListJobsNeedingPrDriftRefresh = vi.fn(() => []);
const mockClose = vi.fn();

const mockSqlite = {
  listJobsNeedingPrDriftRefresh: mockListJobsNeedingPrDriftRefresh,
  updatePrDriftState: mockUpdatePrDriftState,
  close: mockClose,
};

vi.mock('../../../src/specialist/observability-sqlite.js', () => ({
  createObservabilitySqliteClient: () => mockSqlite,
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import type { PrDriftRefreshResult } from '../../../src/specialist/pr-drift-refresh.js';

describe('doctor --pr-drift', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('emits JSON array when --json', async () => {
    mockListJobsNeedingPrDriftRefresh.mockReturnValue([
      { job_id: 'job-a', pr_url: 'https://github.com/o/r/pull/1', pr_head_sha: 'abc', pr_drift_checked_at_ms: null, branch: 'main' },
    ]);
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      state: 'OPEN',
      mergeStateStatus: 'CLEAN',
      url: 'https://github.com/o/r/pull/1',
    }));

    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => output.push(msg ?? ''));
    const { run } = await import('../../../src/cli/doctor.js');
    await run(['--pr-drift', '--json']);

    const parsed = JSON.parse(output.join('\n')) as { jobs: Array<{ job_id: string; classification: string }> };
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.jobs[0]!.job_id).toBe('job-a');
    expect(parsed.jobs[0]!.classification).toBe('clean');
  });

  it('reports gh_unavailable when gh not found', async () => {
    mockListJobsNeedingPrDriftRefresh.mockReturnValue([
      { job_id: 'job-b', pr_url: 'https://github.com/o/r/pull/2', pr_head_sha: null, pr_drift_checked_at_ms: null, branch: 'main' },
    ]);
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('spawnSync gh ENOENT');
    });

    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => output.push(msg ?? ''));
    const { run } = await import('../../../src/cli/doctor.js');
    await run(['--pr-drift', '--json']);

    const parsed = JSON.parse(output.join('\n')) as { jobs: Array<{ job_id: string; classification: string; error_kind?: string }> };
    expect(parsed.jobs[0]!.classification).toBe('unknown');
    expect(parsed.jobs[0]!.error_kind).toBe('gh_unavailable');
  });

  it('reports no jobs when list is empty', async () => {
    mockListJobsNeedingPrDriftRefresh.mockReturnValue([]);

    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => output.push(msg ?? ''));
    const { run } = await import('../../../src/cli/doctor.js');
    await run(['--pr-drift', '--json']);

    const parsed = JSON.parse(output.join('\n')) as { jobs: unknown[] };
    expect(parsed.jobs).toHaveLength(0);
  });
});
