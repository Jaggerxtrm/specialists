import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createUserDirWatcher } from '../../../src/cli/serve-hot-reload.js';

class FakeLoader {
  invalidations: Array<string | undefined> = [];
  invalidateCache(name?: string): void { this.invalidations.push(name); }
}

const VALID_SPEC = JSON.stringify({
  specialist: {
    metadata: { name: 'echo', version: '1.0.0', description: 'echo', category: 'test' },
    execution: { mode: 'auto', model: 'm', timeout_ms: 1000, interactive: false, response_format: 'json', output_type: 'custom', permission_required: 'READ_ONLY', requires_worktree: false, max_retries: 0 },
    prompt: { task_template: 'hi', output_schema: { type: 'object' }, examples: [] },
    skills: {},
  },
});

describe('serve hot-reload', () => {
  let tempRoot: string;
  let userDir: string;
  let loader: FakeLoader;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'serve-reload-'));
    userDir = join(tempRoot, '.specialists', 'user');
    mkdirSync(userDir, { recursive: true });
    loader = new FakeLoader();
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('stop() releases watcher cleanly when no events fired', () => {
    const handle = createUserDirWatcher({ loader: loader as any, userDir });
    expect(() => handle.stop()).not.toThrow();
  });

  it('polling mode invalidates cache when file is modified', async () => {
    writeFileSync(join(userDir, 'echo.specialist.json'), VALID_SPEC);
    const handle = createUserDirWatcher({
      loader: loader as any,
      userDir,
      pollMs: 30,
      debounceMs: 30,
      onReload: () => {},
    });
    await new Promise((r) => setTimeout(r, 80));
    // Simulate edit
    writeFileSync(join(userDir, 'echo.specialist.json'), VALID_SPEC + ' ');
    await new Promise((r) => setTimeout(r, 200));
    handle.stop();
    expect(loader.invalidations.some((n) => n === 'echo')).toBe(true);
  });

  it('polling mode invalidates on file delete', async () => {
    writeFileSync(join(userDir, 'echo.specialist.json'), VALID_SPEC);
    const handle = createUserDirWatcher({
      loader: loader as any,
      userDir,
      pollMs: 30,
      debounceMs: 30,
    });
    await new Promise((r) => setTimeout(r, 80));
    rmSync(join(userDir, 'echo.specialist.json'));
    await new Promise((r) => setTimeout(r, 200));
    handle.stop();
    expect(loader.invalidations.some((n) => n === 'echo')).toBe(true);
  });

  it('polling mode collapses rapid edits within debounce window', async () => {
    writeFileSync(join(userDir, 'echo.specialist.json'), VALID_SPEC);
    const reloadCalls: string[][] = [];
    const handle = createUserDirWatcher({
      loader: loader as any,
      userDir,
      pollMs: 20,
      debounceMs: 100,
      onReload: (names) => reloadCalls.push(names),
    });
    await new Promise((r) => setTimeout(r, 50));
    // Burst of edits within debounce window
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(userDir, 'echo.specialist.json'), VALID_SPEC + ' '.repeat(i + 1));
      await new Promise((r) => setTimeout(r, 25));
    }
    await new Promise((r) => setTimeout(r, 250));
    handle.stop();
    // Multiple polls captured changes; debounce collapses them into ≤2 onReload firings.
    // Loose assertion: at most one invalidation call per name is what we want;
    // overall count should be small relative to 5 edits.
    expect(reloadCalls.length).toBeLessThanOrEqual(2);
    expect(reloadCalls.flat().every((n) => n === 'echo')).toBe(true);
  });

  it('polling mode handles missing user-dir gracefully', () => {
    const missing = join(tempRoot, 'no-such-dir');
    const handle = createUserDirWatcher({ loader: loader as any, userDir: missing, pollMs: 30 });
    expect(() => handle.stop()).not.toThrow();
  });

  it('handle is idempotent for stop()', () => {
    const handle = createUserDirWatcher({ loader: loader as any, userDir, pollMs: 30 });
    handle.stop();
    expect(() => handle.stop()).not.toThrow();
  });
});
