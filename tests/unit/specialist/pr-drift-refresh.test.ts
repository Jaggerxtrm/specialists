import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockUpdatePrDriftState = vi.fn(() => true);
const mockClient = {
  updatePrDriftState: mockUpdatePrDriftState,
};

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { refreshPrDriftForJob } from '../../../src/specialist/pr-drift-refresh.js';

describe('pr-drift-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdatePrDriftState.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gh success → row updated with all fields', async () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      state: 'OPEN',
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      baseRefName: 'main',
      baseRefOid: 'baseabc',
      headRefOid: 'headabc',
      url: 'https://github.com/owner/repo/pull/42',
    }));

    const result = await refreshPrDriftForJob({
      jobId: 'job-1',
      prUrl: 'https://github.com/owner/repo/pull/42',
      headSha: 'headabc',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    });

    expect(result.ok).toBe(true);
    expect(result.classification).toBe('clean');
    expect(mockUpdatePrDriftState).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePrDriftState.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch.pr_state).toBe('OPEN');
    expect(patch.pr_merge_state).toBe('CLEAN');
    expect(patch.pr_classification).toBe('clean');
    expect(patch.pr_base_ref).toBe('main');
    expect(patch.pr_base_sha).toBe('baseabc');
    expect(patch.pr_head_sha).toBe('headabc');
    expect(patch.pr_url).toBe('https://github.com/owner/repo/pull/42');
    expect(typeof patch.pr_drift_checked_at_ms).toBe('number');
  });

  it('gh ENOENT → classification=unknown, error_kind=gh_unavailable', async () => {
    const err = new Error('spawnSync gh ENOENT');
    vi.mocked(execSync).mockImplementation(() => { throw err; });

    const result = await refreshPrDriftForJob({
      jobId: 'job-2',
      prUrl: 'https://github.com/owner/repo/pull/42',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    });

    expect(result.ok).toBe(false);
    expect(result.classification).toBe('unknown');
    expect(result.error_kind).toBe('gh_unavailable');
    expect(mockUpdatePrDriftState).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePrDriftState.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch.pr_classification).toBe('unknown');
  });

  it('gh JSON parse fail → unknown, error_kind=parse_error', async () => {
    vi.mocked(execSync).mockReturnValue('not-valid-json');

    const result = await refreshPrDriftForJob({
      jobId: 'job-3',
      prUrl: 'https://github.com/owner/repo/pull/42',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    });

    expect(result.ok).toBe(false);
    expect(result.classification).toBe('unknown');
    expect(result.error_kind).toBe('parse_error');
  });

  it('mergeStateStatus=BEHIND → classification=needs-rebase', async () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      state: 'OPEN',
      mergeStateStatus: 'BEHIND',
      url: 'https://github.com/owner/repo/pull/42',
    }));

    const result = await refreshPrDriftForJob({
      jobId: 'job-4',
      prUrl: 'https://github.com/owner/repo/pull/42',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    });

    expect(result.ok).toBe(true);
    expect(result.classification).toBe('needs-rebase');
    const patch = mockUpdatePrDriftState.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch.pr_classification).toBe('needs-rebase');
  });

  it('mergeStateStatus=DIRTY → classification=conflicted', async () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      state: 'OPEN',
      mergeStateStatus: 'DIRTY',
      url: 'https://github.com/owner/repo/pull/42',
    }));

    const result = await refreshPrDriftForJob({
      jobId: 'job-5',
      prUrl: 'https://github.com/owner/repo/pull/42',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    });

    expect(result.ok).toBe(true);
    expect(result.classification).toBe('conflicted');
    const patch = mockUpdatePrDriftState.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch.pr_classification).toBe('conflicted');
  });

  it('mergeStateStatus=BLOCKED → classification=blocked', async () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      state: 'OPEN',
      mergeStateStatus: 'BLOCKED',
      url: 'https://github.com/owner/repo/pull/42',
    }));

    const result = await refreshPrDriftForJob({
      jobId: 'job-blocked',
      prUrl: 'https://github.com/owner/repo/pull/42',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    });

    expect(result.ok).toBe(true);
    expect(result.classification).toBe('blocked');
    const patch = mockUpdatePrDriftState.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch.pr_classification).toBe('blocked');
  });

  it('state=MERGED → classification=stale', async () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      state: 'MERGED',
      mergeStateStatus: 'CLEAN',
      url: 'https://github.com/owner/repo/pull/42',
    }));

    const result = await refreshPrDriftForJob({
      jobId: 'job-6',
      prUrl: 'https://github.com/owner/repo/pull/42',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    });

    expect(result.ok).toBe(true);
    expect(result.classification).toBe('stale');
  });

  it('state=CLOSED → classification=stale', async () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({
      state: 'CLOSED',
      mergeStateStatus: 'CLEAN',
      url: 'https://github.com/owner/repo/pull/42',
    }));

    const result = await refreshPrDriftForJob({
      jobId: 'job-closed',
      prUrl: 'https://github.com/owner/repo/pull/42',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    });

    expect(result.ok).toBe(true);
    expect(result.classification).toBe('stale');
  });

  it('unparseable prUrl → parse_error with hashed summary', async () => {
    const result = await refreshPrDriftForJob({
      jobId: 'job-7',
      prUrl: 'not-a-url-or-number',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    });

    expect(result.ok).toBe(false);
    expect(result.classification).toBe('unknown');
    expect(result.error_kind).toBe('parse_error');
    expect(mockUpdatePrDriftState).toHaveBeenCalledTimes(1);
  });

  it('never throws; always resolves', async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('anything'); });

    await expect(refreshPrDriftForJob({
      jobId: 'job-8',
      prUrl: 'https://github.com/owner/repo/pull/42',
      client: mockClient as unknown as import('../../../src/specialist/observability-sqlite.js').ObservabilitySqliteClient,
    })).resolves.toBeDefined();
  });
});
