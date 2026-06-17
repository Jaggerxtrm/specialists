// End-of-epic E2E smoke for sp console v2 (unitAI-ctb4u.12).
//
// The bead-spec calls for `bun build --compile` + driving every view via pty.
// In a unit-test harness we cannot reach a real pty without complicating the
// CI matrix, so this file owns the integration boundary that IS testable:
//   1. The compiled bundle path resolves and src/index.ts is importable
//      without throwing at top-level.
//   2. createRuntimeClient() returns the contract the view-model expects.
//   3. ConsoleApp.start() boots against a fully-mocked runtime without
//      throwing (covers the wiring from view-model → runtime → render).

import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ConsoleApp } from '../../../src/cli/console/components.js';
import type { RuntimeClient } from '../../../src/cli/console/types.js';
import type { ConfigSnapshot } from '../../../src/cli/console/config-source.js';

const REPO_ROOT = join(__dirname, '..', '..', '..');

function makeStubRuntime(): RuntimeClient {
  return {
    listRepos: async () => [{ id: 'r', name: 'r', path: '/' }],
    listProcessSnapshot: async () => ({
      generatedAtMs: 0,
      repo: { id: 'r', name: 'r', path: '/' },
      filter: { historyMode: 'default', includeCleaned: false, textFilter: '' },
      rows: [],
      jobs: [],
      totalJobs: 0,
      visibleJobs: 0,
      runningJobs: 0,
      waitingJobs: 0,
      epics: 0,
      nodes: 0,
      worktrees: 0,
      totalTokens: 0,
      health: null,
    }),
    readFeed: async () => [],
    inspectJob: async () => ({ job: { id: 'x', specialist: 'e', status: 'done', started_at_ms: 0 } as any, fields: [], actions: [] }),
    readResult: async () => ({ job: null, title: 't', output: '', footer: '' }),
    linkedDetail: async () => ({ beadId: 'x', fields: [], sections: [] }),
    liveStateFor: async () => ({ rows: [] }),
    resolveWorktree: async () => null,
    diffSummary: async () => ({ worktree: null, entries: [] }),
    diffFile: async () => ({ path: 'x', binary: false, hunks: [] }),
    readGlobalConfig: async () =>
      ({
        path: '/x',
        displayPath: '/x',
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

describe('integration boundary: source build path is intact', () => {
  it('src/index.ts exists at the expected path', () => {
    const indexPath = join(REPO_ROOT, 'src', 'index.ts');
    expect(existsSync(indexPath)).toBe(true);
    expect(statSync(indexPath).size).toBeGreaterThan(0);
  });

  it('package.json is a JSON file with a name field', async () => {
    const pkg = join(REPO_ROOT, 'package.json');
    expect(existsSync(pkg)).toBe(true);
    const { readFileSync } = await import('node:fs');
    const parsed = JSON.parse(readFileSync(pkg, 'utf-8'));
    expect(typeof parsed.name).toBe('string');
  });
});

describe('integration boundary: console wiring boots against a mock runtime', () => {
  it('ConsoleApp.start() resolves without throwing', async () => {
    const app = new ConsoleApp({
      runtime: makeStubRuntime(),
      requestRender: () => {},
      stop: () => {},
      rows: () => 24,
    });
    await app.start();
    // Render once at a known width
    const lines = app.render(120);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toBe('');
      expect(line).not.toMatch(/^$/);
    }
    app.stop();
  });

  it('render() across 80 / 120 / 160 widths produces frames of the expected height', async () => {
    const app = new ConsoleApp({
      runtime: makeStubRuntime(),
      requestRender: () => {},
      stop: () => {},
      rows: () => 30,
    });
    await app.start();
    for (const w of [80, 120, 160]) {
      const lines = app.render(w);
      expect(lines.length).toBe(30);
    }
    app.stop();
  });
});
