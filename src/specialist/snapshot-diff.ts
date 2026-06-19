// Verbatim port from gitboard's materializer:
//   gitboard:packages/core/src/materializer/snapshot-diff.ts (~56 LoC)
//
// Adopted per unitAI-ctb4u.19 (Phase 1 of materializer adoption) so sp
// console can replace its ad-hoc snapshotSignature with a stable
// key-ordered SHA-256 hash AND surface per-row upsert/tombstone deltas
// for future ProcessView consumption (unitAI-ctb4u.21).
//
// Pure: no IO, no Date.now(), no state. Identical semantics to the
// gitboard original — modulo import path (node:crypto) and this header.
// Keep this file byte-identical to upstream so future cross-syncs stay
// trivial. If upstream gains features we need, port them; do NOT diverge.

import { createHash } from 'node:crypto';

export interface SnapshotDiffResult<T> {
  upserts: T[];
  tombstones: T[];
  unchanged_count: number;
}

export function snapshotDiff<T>(prev: readonly T[], next: readonly T[], keyFn: (row: T) => string): SnapshotDiffResult<T> {
  const prevByKey = new Map(prev.map((row) => [keyFn(row), row] as const));
  const nextByKey = new Map(next.map((row) => [keyFn(row), row] as const));
  const upserts: T[] = [];
  const tombstones: T[] = [];
  let unchangedCount = 0;

  for (const [key, row] of nextByKey) {
    const prevRow = prevByKey.get(key);
    if (!prevRow) {
      upserts.push(row);
      continue;
    }
    if (snapshotValue(prevRow) === snapshotValue(row)) {
      unchangedCount += 1;
      continue;
    }
    upserts.push(row);
  }

  for (const [key, row] of prevByKey) {
    if (!nextByKey.has(key)) tombstones.push(row);
  }

  return { upserts, tombstones, unchanged_count: unchangedCount };
}

export function snapshotHash<T>(rows: readonly T[], keyFn: (row: T) => string): string {
  const digest = createHash('sha256');
  const ordered = [...rows].sort((left, right) => keyFn(left).localeCompare(keyFn(right)));
  digest.update(stableStringify(ordered));
  return digest.digest('hex');
}

function snapshotValue(value: unknown): string {
  return stableStringify(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries.map(([key, entry]) => [key, sortValue(entry)]));
}
