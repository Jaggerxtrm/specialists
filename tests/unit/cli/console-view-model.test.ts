import { describe, expect, it } from 'vitest';
import { initialConsoleState, reduceConsoleState, selectedJobRow } from '../../../src/cli/console/view-model.js';
import type { ProcessSnapshot } from '../../../src/cli/console/types.js';

function snapshot(): ProcessSnapshot {
  return {
    generatedAtMs: 1,
    repo: { id: 'repo', name: 'repo', path: '/repo' },
    filter: { historyMode: 'default', includeCleaned: false, textFilter: '' },
    rows: [
      { kind: 'group', id: 'standalone', label: 'Standalone', depth: 0 },
      { kind: 'job', id: 'run1', depth: 1, job: { id: 'run1', specialist: 'executor', status: 'running', started_at_ms: 3 } },
      { kind: 'group', id: 'done', label: 'Done', depth: 0 },
      { kind: 'job', id: 'done1', depth: 1, job: { id: 'done1', specialist: 'reviewer', status: 'done', started_at_ms: 2 } },
    ],
    jobs: [],
    totalJobs: 2,
    visibleJobs: 2,
    runningJobs: 1,
    waitingJobs: 0,
    epics: 0,
    nodes: 0,
    worktrees: 0,
    totalTokens: 0,
    health: null,
  };
}

describe('console view model', () => {
  it('selects the first job row instead of group headers', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'snapshotLoaded', snapshot: snapshot() });

    expect(state.selectedRow).toBe(1);
    expect(selectedJobRow(state)?.id).toBe('run1');
  });

  it('navigation skips group rows', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'snapshotLoaded', snapshot: snapshot() });
    state = reduceConsoleState(state, { type: 'move', delta: 1, viewportRows: 3 });

    expect(state.selectedRow).toBe(3);
    expect(selectedJobRow(state)?.id).toBe('done1');
  });

  it('cycles ps history modes in the same order as the console keybar', () => {
    let state = initialConsoleState();

    state = reduceConsoleState(state, { type: 'cycleHistory' });
    expect(state.historyMode).toBe('history');
    state = reduceConsoleState(state, { type: 'cycleHistory' });
    expect(state.historyMode).toBe('all');
    state = reduceConsoleState(state, { type: 'cycleHistory' });
    expect(state.historyMode).toBe('default');
  });



  it('opens feed at the end and keeps replay pinned while following', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'open', view: 'feed', jobId: 'run1' });

    expect(state.follow).toBe(true);

    state = reduceConsoleState(state, {
      type: 'feedLoaded',
      rows: Array.from({ length: 5 }, (_, index) => ({ seq: index + 1, type: 'event', line: `line ${index + 1}` })),
      totalRows: 10,
      viewportRows: 3,
    });

    expect(state.scroll).toBe(7);
  });

  it('manual feed scrolling disables follow and uses rendered row counts', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'open', view: 'feed', jobId: 'run1' });
    state = reduceConsoleState(state, {
      type: 'feedLoaded',
      rows: Array.from({ length: 5 }, (_, index) => ({ seq: index + 1, type: 'event', line: `line ${index + 1}` })),
      totalRows: 10,
      viewportRows: 3,
    });
    state = reduceConsoleState(state, { type: 'move', delta: -1, viewportRows: 3, totalRows: 10 });

    expect(state.follow).toBe(false);
    expect(state.scroll).toBe(6);
  });

  it('manual feed refresh preserves the current scroll offset instead of repinning', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'open', view: 'feed', jobId: 'run1' });
    state = reduceConsoleState(state, {
      type: 'feedLoaded',
      rows: Array.from({ length: 5 }, (_, index) => ({ seq: index + 1, type: 'event', line: `line ${index + 1}` })),
      totalRows: 10,
      viewportRows: 3,
    });
    state = reduceConsoleState(state, { type: 'move', delta: -4, viewportRows: 3, totalRows: 10 });
    state = reduceConsoleState(state, {
      type: 'feedLoaded',
      rows: Array.from({ length: 6 }, (_, index) => ({ seq: index + 1, type: 'event', line: `line ${index + 1}` })),
      totalRows: 12,
      viewportRows: 3,
    });

    expect(state.follow).toBe(false);
    expect(state.scroll).toBe(3);
  });

  it('detail refresh does not reset feed scroll from the process snapshot', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'open', view: 'feed', jobId: 'run1' });
    state = reduceConsoleState(state, {
      type: 'feedLoaded',
      rows: Array.from({ length: 5 }, (_, index) => ({ seq: index + 1, type: 'event', line: `line ${index + 1}` })),
      totalRows: 10,
      viewportRows: 3,
    });
    state = reduceConsoleState(state, { type: 'snapshotLoaded', snapshot: snapshot() });

    expect(state.scroll).toBe(7);
  });

  it('back from feed with high scroll resets scroll and selectedRow to ps (unitAI-kz1ud)', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'snapshotLoaded', snapshot: snapshot() });
    state = reduceConsoleState(state, { type: 'open', view: 'feed', jobId: 'run1' });
    state = reduceConsoleState(state, {
      type: 'feedLoaded',
      rows: Array.from({ length: 20 }, (_, index) => ({ seq: index + 1, type: 'event', line: `line ${index + 1}` })),
      totalRows: 500,
      viewportRows: 20,
    });

    expect(state.scroll).toBe(480);

    state = reduceConsoleState(state, { type: 'back' });

    expect(state.view).toBe('ps');
    expect(state.scroll).toBe(0);
    expect(state.selectedRow).toBe(1);
    expect(state.follow).toBe(false);
    expect(state.selectedJobId).toBeUndefined();
  });

  it('switching repos resets detail state back to ps', () => {
    let state = initialConsoleState();
    state = reduceConsoleState(state, { type: 'reposLoaded', repos: [
      { id: 'a', name: 'a', path: '/a' },
      { id: 'b', name: 'b', path: '/b' },
    ] });
    state = reduceConsoleState(state, { type: 'open', view: 'result', jobId: 'run1' });
    state = reduceConsoleState(state, { type: 'nextRepo' });

    expect(state.repoIndex).toBe(1);
    expect(state.view).toBe('ps');
    expect(state.selectedJobId).toBeUndefined();
  });
});
