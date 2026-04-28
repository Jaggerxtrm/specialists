// src/cli/serve-hot-reload.ts
// Hot-reload watcher for sp serve. Watches the user-dir for spec file
// create/modify/delete and invalidates the SpecialistLoader cache after a
// debounce window. Falls back to polling (mtime scan) when --reload-poll-ms
// is set, for environments where fs.watch is unreliable (macOS, VirtioFS).

import { existsSync, readdirSync, statSync, watch as fsWatch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { SpecialistLoader } from '../specialist/loader.js';

const DEFAULT_DEBOUNCE_MS = 300;

export interface HotReloadOptions {
  loader: SpecialistLoader;
  userDir: string;
  debounceMs?: number;
  pollMs?: number;
  onReload?: (changedNames: string[]) => void;
}

export interface HotReloadHandle {
  stop(): void;
}

function specialistNameFromFile(file: string): string | null {
  const match = file.match(/^(.+)\.specialist\.(json|yaml)$/);
  return match ? match[1] : null;
}

function snapshotMtimes(dir: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!existsSync(dir)) return out;
  const entries = readdirSync(dir).filter((name) => specialistNameFromFile(name) !== null);
  for (const name of entries) {
    try {
      out.set(name, statSync(join(dir, name)).mtimeMs);
    } catch {
      // file disappeared between readdir and stat — skip
    }
  }
  return out;
}

function diffMtimes(prev: Map<string, number>, next: Map<string, number>): string[] {
  const changed: string[] = [];
  for (const [file, mtime] of next) {
    const prior = prev.get(file);
    if (prior === undefined || prior !== mtime) changed.push(file);
  }
  for (const file of prev.keys()) {
    if (!next.has(file)) changed.push(file);
  }
  return changed;
}

export function createUserDirWatcher(opts: HotReloadOptions): HotReloadHandle {
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const pendingChanges = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  const flush = () => {
    debounceTimer = null;
    const changedFiles = Array.from(pendingChanges);
    pendingChanges.clear();
    if (changedFiles.length === 0) return;
    const changedNames = changedFiles
      .map((f) => specialistNameFromFile(f))
      .filter((n): n is string => Boolean(n));
    // Conservative: invalidate the touched names only. If nothing identifiable,
    // fall back to a full clear (covers atomic-save renames where the basename
    // we saw via the watcher was a temp file).
    if (changedNames.length === 0) {
      opts.loader.invalidateCache();
    } else {
      for (const name of changedNames) opts.loader.invalidateCache(name);
    }
    opts.onReload?.(changedNames);
  };

  const queue = (file: string | null) => {
    if (file && specialistNameFromFile(file)) pendingChanges.add(file);
    else pendingChanges.add(''); // unknown file → trigger full clear on flush
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, debounceMs);
  };

  let watcher: FSWatcher | null = null;
  let pollHandle: NodeJS.Timeout | null = null;

  if (opts.pollMs && opts.pollMs > 0) {
    let lastSnapshot = snapshotMtimes(opts.userDir);
    pollHandle = setInterval(() => {
      const next = snapshotMtimes(opts.userDir);
      const changed = diffMtimes(lastSnapshot, next);
      lastSnapshot = next;
      for (const file of changed) queue(file);
    }, opts.pollMs);
  } else if (existsSync(opts.userDir)) {
    try {
      watcher = fsWatch(opts.userDir, { persistent: false }, (_eventType, filename) => {
        queue(filename ? String(filename) : null);
      });
    } catch {
      // fs.watch unsupported — caller can opt into --reload-poll-ms
    }
  }

  return {
    stop() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      if (watcher) {
        try { watcher.close(); } catch { /* ignore */ }
        watcher = null;
      }
      if (pollHandle) {
        clearInterval(pollHandle);
        pollHandle = null;
      }
    },
  };
}
