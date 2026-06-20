export interface SnapshotDiffResult<T> {
    upserts: T[];
    tombstones: T[];
    unchanged_count: number;
}
export declare function snapshotDiff<T>(prev: readonly T[], next: readonly T[], keyFn: (row: T) => string): SnapshotDiffResult<T>;
export declare function snapshotHash<T>(rows: readonly T[], keyFn: (row: T) => string): string;
//# sourceMappingURL=snapshot-diff.d.ts.map