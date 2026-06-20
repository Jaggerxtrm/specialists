// Wave B of the multi-repo discovery feature (unitAI-hneld). Covers the
// view-model reducer for the new repoConfig actions, the visibleRows
// helper's showInactive filter, the renderer's 80/120/160 width parity,
// and the help+keybar drift guard for the new keys.

import { describe, expect, it } from 'vitest';
import {
  initialConsoleState,
  initialRepoConfigState,
  reduceConsoleState,
  visibleRepoConfigRows,
} from '../../../src/cli/console/view-model.js';
import { renderRepoConfigRow } from '../../../src/cli/console/theme.js';
import type { RepoConfigSnapshot } from '../../../src/cli/console/types.js';
import { consoleHelpText } from '../../../src/cli/console/help.js';

const SGR_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(SGR_RE, '');

function snapshot(rows: RepoConfigSnapshot['rows']): RepoConfigSnapshot {
  return {
    rows,
    baseDirs: ['~/dev', '~/projects'],
    autoDiscoveredAt: '2026-06-19T22:00:00.000Z',
    configPath: '~/.config/specialists/console.json',
    configExists: true,
  };
}

const NOW = Date.now();
const FRESH = NOW - 60_000; // 1 min ago — active
const STALE = NOW - 45 * 24 * 60 * 60 * 1000; // 45 days — inactive

describe('repoConfig reducer', () => {
  it('loaded action populates snapshot and clears loading', () => {
    const initial = initialConsoleState();
    const state = reduceConsoleState(initial, { type: 'repoConfigLoading' });
    expect(state.repoConfig.loading).toBe(true);
    const next = reduceConsoleState(state, {
      type: 'repoConfigLoaded',
      snapshot: snapshot([
        { name: 'a', path: '/r/a', exists: true, dbExists: true, dbSizeBytes: 1024, lastActivityMs: FRESH, runningJobs: 1, waitingJobs: 0, current: true },
      ]),
    });
    expect(next.repoConfig.loading).toBe(false);
    expect(next.repoConfig.snapshot?.rows).toHaveLength(1);
  });

  it('loaded action clamps selectedIndex when rows shrink', () => {
    const initial = { ...initialConsoleState(), repoConfig: { ...initialRepoConfigState(), selectedIndex: 5 } };
    const state = reduceConsoleState(initial, {
      type: 'repoConfigLoaded',
      snapshot: snapshot([
        { name: 'a', path: '/r/a', exists: true, dbExists: true, dbSizeBytes: 0, runningJobs: 0, waitingJobs: 0, current: true },
        { name: 'b', path: '/r/b', exists: true, dbExists: true, dbSizeBytes: 0, runningJobs: 0, waitingJobs: 0, current: false },
      ]),
    });
    expect(state.repoConfig.selectedIndex).toBe(1);
  });

  it('move action respects bounds and skips when no rows', () => {
    const state = reduceConsoleState(initialConsoleState(), {
      type: 'repoConfigLoaded',
      snapshot: snapshot([
        { name: 'a', path: '/r/a', exists: true, dbExists: true, dbSizeBytes: 0, lastActivityMs: FRESH, runningJobs: 0, waitingJobs: 0, current: true },
        { name: 'b', path: '/r/b', exists: true, dbExists: true, dbSizeBytes: 0, lastActivityMs: FRESH, runningJobs: 0, waitingJobs: 0, current: false },
      ]),
    });
    const down = reduceConsoleState(state, { type: 'repoConfigMove', delta: 1 });
    expect(down.repoConfig.selectedIndex).toBe(1);
    const past = reduceConsoleState(down, { type: 'repoConfigMove', delta: 5 });
    expect(past.repoConfig.selectedIndex).toBe(1);
    const back = reduceConsoleState(past, { type: 'repoConfigMove', delta: -10 });
    expect(back.repoConfig.selectedIndex).toBe(0);
    const empty = reduceConsoleState(initialConsoleState(), { type: 'repoConfigMove', delta: 1 });
    expect(empty.repoConfig.selectedIndex).toBe(0);
  });

  it('toggleInactive flips the flag and resets selection', () => {
    const seed = reduceConsoleState(initialConsoleState(), {
      type: 'repoConfigLoaded',
      snapshot: snapshot([
        { name: 'a', path: '/r/a', exists: true, dbExists: true, dbSizeBytes: 0, lastActivityMs: FRESH, runningJobs: 0, waitingJobs: 0, current: false },
      ]),
    });
    const after = reduceConsoleState({ ...seed, repoConfig: { ...seed.repoConfig, selectedIndex: 7 } }, { type: 'repoConfigToggleInactive' });
    expect(after.repoConfig.showInactive).toBe(true);
    expect(after.repoConfig.selectedIndex).toBe(0);
  });

  it('startAdd transitions to add-path mode with fresh buffer', () => {
    const state = reduceConsoleState(initialConsoleState(), { type: 'repoConfigStartAdd' });
    expect(state.repoConfig.edit.mode).toBe('add-path');
    expect(state.repoConfig.edit.buffer).toBe('');
  });

  it('add flow: editChar → editAdvance carries pendingPath to add-name', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'repoConfigStartAdd' });
    for (const ch of '/r/x') state = reduceConsoleState(state, { type: 'repoConfigEditChar', char: ch });
    expect(state.repoConfig.edit.buffer).toBe('/r/x');
    state = reduceConsoleState(state, { type: 'repoConfigEditAdvance' });
    expect(state.repoConfig.edit.mode).toBe('add-name');
    expect(state.repoConfig.edit.pendingPath).toBe('/r/x');
    expect(state.repoConfig.edit.buffer).toBe('');
  });

  it('editAdvance is a no-op outside add-path', () => {
    const seed = reduceConsoleState(initialConsoleState(), { type: 'repoConfigStartEdit', field: 'name', targetName: 'a' });
    const after = reduceConsoleState(seed, { type: 'repoConfigEditAdvance' });
    expect(after.repoConfig.edit.mode).toBe('edit-name');
  });

  it('editBackspace pops one character without crossing into other state', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'repoConfigStartAdd' });
    state = reduceConsoleState(state, { type: 'repoConfigEditChar', char: 'x' });
    state = reduceConsoleState(state, { type: 'repoConfigEditChar', char: 'y' });
    state = reduceConsoleState(state, { type: 'repoConfigEditBackspace' });
    expect(state.repoConfig.edit.buffer).toBe('x');
  });

  it('editError sets error without leaving edit mode', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'repoConfigStartEdit', field: 'path', targetName: 'a' });
    state = reduceConsoleState(state, { type: 'repoConfigEditError', error: 'bad' });
    expect(state.repoConfig.edit.mode).toBe('edit-path');
    expect(state.repoConfig.edit.error).toBe('bad');
  });

  it('editCancel resets to none mode + empty buffer', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'repoConfigStartAdd' });
    state = reduceConsoleState(state, { type: 'repoConfigEditChar', char: 'a' });
    state = reduceConsoleState(state, { type: 'repoConfigEditCancel' });
    expect(state.repoConfig.edit.mode).toBe('none');
    expect(state.repoConfig.edit.buffer).toBe('');
  });

  it('editCommit installs new snapshot and clears edit', () => {
    let state = reduceConsoleState(initialConsoleState(), { type: 'repoConfigStartAdd' });
    state = reduceConsoleState(state, { type: 'repoConfigEditChar', char: 'z' });
    const next = snapshot([
      { name: 'z', path: '/r/z', exists: true, dbExists: true, dbSizeBytes: 0, runningJobs: 0, waitingJobs: 0, current: false },
    ]);
    state = reduceConsoleState(state, { type: 'repoConfigEditCommit', snapshot: next, message: 'added z' });
    expect(state.repoConfig.edit.mode).toBe('none');
    expect(state.repoConfig.snapshot?.rows[0]?.name).toBe('z');
    expect(state.repoConfig.message).toBe('added z');
  });

  it('repoConfigMessage sets standalone message slot', () => {
    const state = reduceConsoleState(initialConsoleState(), { type: 'repoConfigMessage', message: 'ok' });
    expect(state.repoConfig.message).toBe('ok');
  });
});

describe('visibleRepoConfigRows', () => {
  it('hides ≥30d quiet rows when showInactive is false', () => {
    const seed = reduceConsoleState(initialConsoleState(), {
      type: 'repoConfigLoaded',
      snapshot: snapshot([
        { name: 'fresh', path: '/r/fresh', exists: true, dbExists: true, dbSizeBytes: 0, lastActivityMs: FRESH, runningJobs: 0, waitingJobs: 0, current: false },
        { name: 'stale', path: '/r/stale', exists: true, dbExists: true, dbSizeBytes: 0, lastActivityMs: STALE, runningJobs: 0, waitingJobs: 0, current: false },
        { name: 'never', path: '/r/never', exists: true, dbExists: false, dbSizeBytes: 0, runningJobs: 0, waitingJobs: 0, current: false },
      ]),
    });
    expect(visibleRepoConfigRows(seed.repoConfig).map((r) => r.name)).toEqual(['fresh']);
    const toggled = reduceConsoleState(seed, { type: 'repoConfigToggleInactive' });
    expect(visibleRepoConfigRows(toggled.repoConfig).map((r) => r.name)).toEqual(['fresh', 'stale', 'never']);
  });
});

describe('renderRepoConfigRow', () => {
  const row = {
    name: 'specialists',
    path: '/home/dawid/dev/specialists',
    exists: true,
    dbExists: true,
    dbSizeBytes: 32 * 1024,
    lastActivityMs: NOW - 60_000,
    runningJobs: 2,
    waitingJobs: 1,
    current: true,
  };

  for (const width of [80, 120, 160]) {
    it(`fits within width=${width}`, () => {
      const rendered = renderRepoConfigRow(row, width, true);
      // Strip ANSI for length check.
      const visible = strip(rendered);
      expect(visible.length).toBeLessThanOrEqual(width);
      expect(visible).toContain('specialists');
      expect(visible).toMatch(/R2/);
      expect(visible).toMatch(/W1/);
      expect(visible).toMatch(/1m ago|60s ago/);
    });
  }

  it('renders never for rows without activity', () => {
    const visible = strip(renderRepoConfigRow({ ...row, lastActivityMs: undefined, runningJobs: 0, waitingJobs: 0, dbExists: false }, 80, false));
    expect(visible).toContain('never');
  });

  it('marks missing-path rows distinctly', () => {
    const visible = strip(renderRepoConfigRow({ ...row, exists: false, dbExists: false }, 80, false));
    expect(visible).toContain('✗');
  });
});

describe('help.ts parity', () => {
  const help = consoleHelpText().join('\n');

  it('documents R keybind from ps view', () => {
    expect(help).toMatch(/^\s+R\s+Open repo config view/m);
  });

  it('documents repo config view keys', () => {
    for (const key of ['+', 'd', 'e', 'n', 'r', 's', '⌫']) {
      expect(help).toContain(`  ${key}`);
    }
    expect(help).toContain('repo config view');
  });
});
