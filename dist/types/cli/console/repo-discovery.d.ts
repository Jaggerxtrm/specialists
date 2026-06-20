import type { ConsoleConfigRepoEntry } from './repo-config.js';
export declare const DEFAULT_BASE_DIR_CANDIDATES: readonly ["~/dev", "~/projects", "~/work", "~/repos", "~/code"];
export declare function expandHomePath(p: string): string;
export interface DiscoveryResult {
    /** Repos discovered. Sorted alphabetically by name. */
    repos: ConsoleConfigRepoEntry[];
    /** Base dirs we actually scanned (existed at scan time). */
    scannedBaseDirs: string[];
}
export declare function discoverRepos(baseDirCandidates?: readonly string[]): DiscoveryResult;
//# sourceMappingURL=repo-discovery.d.ts.map