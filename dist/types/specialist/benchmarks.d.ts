export declare const PRIMARY_BENCHMARK_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";
export declare const SECONDARY_BENCHMARK_URL = "https://lmarena.ai/leaderboard/json";
export declare const BENCHMARK_TTL_MS = 86400000;
export declare const DEFAULT_MAX_SNAPSHOT_AGE_MS: number;
export type BenchmarkSource = 'artificialanalysis' | 'lmarena';
export interface BenchmarkRow {
    id: string;
    provider: string;
    quality_score?: number;
    elo?: number;
    cost_input?: number;
    cost_output?: number;
    context_window?: number;
    tools_supported?: boolean;
}
export interface BenchmarkSnapshot {
    source: BenchmarkSource;
    source_url: string;
    fetched_at: string;
    models: Map<string, BenchmarkRow>;
}
export interface BenchmarkWarning {
    source?: BenchmarkSource;
    message: string;
}
export interface LoadBenchmarkOptions {
    cacheDir?: string;
    now?: Date;
    ttlMs?: number;
    maxSnapshotAgeMs?: number;
    offline?: boolean;
    fetchImpl?: typeof fetch;
    warn?: (warning: BenchmarkWarning) => void;
}
export declare function loadBenchmarkSnapshot(options?: LoadBenchmarkOptions): Promise<BenchmarkSnapshot | null>;
export declare function getBenchmarkCachePath(source: BenchmarkSource, cacheDir?: string): string;
//# sourceMappingURL=benchmarks.d.ts.map