import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertEpicRunMock = vi.fn();
const sqliteClientMock = {
  close: vi.fn(),
  readEpicRun: vi.fn(() => ({ epic_id: 'unitAI-gc2a', status: 'resolving', status_json: '{}', updated_at_ms: Date.now() })),
  listEpicChains: vi.fn(() => []),
  listStatuses: vi.fn(() => []),
  upsertEpicRun: upsertEpicRunMock,
};

vi.mock('../../../src/specialist/observability-sqlite.js', () => ({
  createObservabilitySqliteClient: vi.fn(() => sqliteClientMock),
}));

import { handleEpicAbandonCommand } from '../../../src/cli/epic.js';

describe('epic CLI abandon parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertEpicRunMock.mockReset();
  });

  it('accepts --reason value without treating it as second epic id', async () => {
    const outSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await handleEpicAbandonCommand(['unitAI-gc2a', '--reason', 'deferred_cleanup', '--json']);

    expect(upsertEpicRunMock).toHaveBeenCalledWith(expect.objectContaining({
      epic_id: 'unitAI-gc2a',
      status: 'abandoned',
    }));
    expect(outSpy).toHaveBeenCalled();
  });
});
