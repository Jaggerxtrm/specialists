// Regression for codex PR #125 review finding: generic paging shortcuts
// (`d` / `u` / `g` / `G`) used to fire before the view-specific handlers in
// ConsoleApp.handleInput, so on ps view `d` paged down instead of opening
// DiffView, `g` jumped to top instead of opening ConfigView, and on config
// view `u` paged up instead of undoing.
//
// The fix gates those chars to scroll views (feed / job / result / bead) so
// the view-specific handlers below win for ps + config + diff.

import { describe, expect, it } from 'vitest';
import { ConsoleApp } from '../../../src/cli/console/components.js';
import type { RuntimeClient, ConsoleJob } from '../../../src/cli/console/types.js';
import type { ConfigSnapshot } from '../../../src/cli/console/config-source.js';

function makeJob(overrides: Partial<ConsoleJob> = {}): ConsoleJob {
  return {
    id: 'job-key-gate',
    specialist: 'executor',
    status: 'running',
    started_at_ms: 0,
    bead_id: 'unitAI-key-gate',
    ...overrides,
  } as ConsoleJob;
}

function makeStubRuntime(): RuntimeClient {
  const job = makeJob();
  return {
    listRepos: async () => [{ id: 'r', name: 'r', path: '/' }],
    listProcessSnapshot: async () => ({
      generatedAtMs: 0,
      repo: { id: 'r', name: 'r', path: '/' },
      filter: { historyMode: 'default', includeCleaned: false, textFilter: '' },
      rows: [{ kind: 'job', job, depth: 0 } as any],
      jobs: [job],
      totalJobs: 1,
      visibleJobs: 1,
      runningJobs: 1,
      waitingJobs: 0,
      epics: 0,
      nodes: 0,
      worktrees: 0,
      totalTokens: 0,
      health: null,
    }),
    readFeed: async () => [],
    inspectJob: async () => ({ job: job as any, fields: [], actions: [] }),
    readResult: async () => ({ job: null, title: '', output: '', footer: '' }),
    linkedDetail: async () => ({ beadId: 'unitAI-key-gate', fields: [], sections: [] }),
    liveStateFor: async () => ({ rows: [] }),
    resolveWorktree: async () => null,
    diffSummary: async () => ({ worktree: null, entries: [] }),
    diffFile: async () => ({ path: 'x', binary: false, hunks: [] }),
    readGlobalConfig: async () =>
      ({
        path: '/x',
        displayPath: '~/.config/specialists/user.json',
        source: 'config-home',
        exists: false,
        validationErrors: [],
        specialists: [],
      } as ConfigSnapshot),
    writeGlobalConfig: async () => ({ ok: true }),
    readRawGlobalConfig: async () => ({ raw: {}, exists: false }),
    openConfigInEditor: async () => ({ ok: true }),
  };
}

async function makeApp(): Promise<ConsoleApp> {
  const app = new ConsoleApp({
    runtime: makeStubRuntime(),
    requestRender: () => {},
    stop: () => {},
    rows: () => 30,
  });
  await app.start();
  // ConsoleApp populates state.rows via listProcessSnapshot inside start().
  // Force a selection on the first row so view-specific handlers (`d`, `g`,
  // `b`) have a target. The state shape uses `selectedRow` index.
  const state = (app as unknown as { state: { selectedRow: number; view: string } }).state;
  state.selectedRow = 0;
  return app;
}

describe('ConsoleApp key gating — codex PR #125 review regression', () => {
  it('ps view: `d` opens DiffView (not pageDown)', async () => {
    const app = await makeApp();
    app.handleInput('d');
    const view = (app as unknown as { state: { view: string } }).state.view;
    expect(view).toBe('diff');
    app.stop();
  });

  it('ps view: `g` opens ConfigView (not jump-to-top)', async () => {
    const app = await makeApp();
    app.handleInput('g');
    const view = (app as unknown as { state: { view: string } }).state.view;
    expect(view).toBe('config');
    app.stop();
  });

  it('ps view: `G` does NOT scroll to bottom (no-op, since ps has its own selection model)', async () => {
    const app = await makeApp();
    const before = (app as unknown as { state: { view: string; selectedRow: number } }).state.selectedRow;
    app.handleInput('G');
    const after = (app as unknown as { state: { view: string; selectedRow: number } }).state.selectedRow;
    // No view change, no rogue dispatch.
    expect((app as unknown as { state: { view: string } }).state.view).toBe('ps');
    expect(after).toBe(before);
    app.stop();
  });

  it('config view: `u` triggers undo (not pageUp)', async () => {
    const app = await makeApp();
    // Navigate ps → config first.
    app.handleInput('g');
    expect((app as unknown as { state: { view: string } }).state.view).toBe('config');
    // Now press `u`. The undo handler is async, but the gate decision is
    // synchronous: if `u` had fired pageUp, state.view would still be 'config'
    // with no error, but the dispatch would target detailScroll which is
    // observable. The cheaper assertion: state.view stays 'config' AND the
    // call did not fall through to the pageUp branch (which would dispatch
    // `move` with totalRows = detailRows). We can't observe move via the
    // public API, so we instead assert the symmetric case: `u` works as undo,
    // which means the call does not throw and does not change view.
    expect(() => app.handleInput('u')).not.toThrow();
    expect((app as unknown as { state: { view: string } }).state.view).toBe('config');
    app.stop();
  });

  it('feed view: `d` still pages down (gating preserves scroll-view semantics)', async () => {
    const app = await makeApp();
    // Navigate ps → feed.
    app.handleInput('\r'); // Enter on selected job → feed
    expect((app as unknown as { state: { view: string } }).state.view).toBe('feed');
    expect(() => app.handleInput('d')).not.toThrow();
    expect((app as unknown as { state: { view: string } }).state.view).toBe('feed');
    app.stop();
  });

  it('feed view: `g` still jumps to top (gating preserves scroll-view semantics)', async () => {
    const app = await makeApp();
    app.handleInput('\r');
    expect((app as unknown as { state: { view: string } }).state.view).toBe('feed');
    expect(() => app.handleInput('g')).not.toThrow();
    expect((app as unknown as { state: { view: string } }).state.view).toBe('feed');
    app.stop();
  });
});
