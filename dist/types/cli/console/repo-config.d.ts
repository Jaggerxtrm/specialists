export declare const CONSOLE_CONFIG_SCHEMA_VERSION = 1;
export declare const CONSOLE_CONFIG_DOC = "./console-config-guide.md";
export type ConsoleConfigSource = 'xdg' | 'config-home' | 'legacy';
export interface ConsoleConfigPath {
    path: string;
    exists: boolean;
    source: ConsoleConfigSource;
}
export interface ConsoleConfigRepoEntry {
    name: string;
    path: string;
}
export interface ConsoleConfig {
    _doc?: string;
    schema_version: number;
    base_dirs: string[];
    repos: ConsoleConfigRepoEntry[];
    auto_discovered_at?: string;
}
export declare function getConsoleConfigPath(): ConsoleConfigPath;
export declare function readConsoleConfig(): ConsoleConfig | null;
export declare function writeConsoleConfig(config: ConsoleConfig, cookie?: string): void;
export declare function buildConsoleConfigTemplate(repos: ConsoleConfigRepoEntry[], baseDirs: string[], nowIso: string): ConsoleConfig;
export declare function isConsoleConfigStale(config: ConsoleConfig, maxAgeMs?: number): boolean;
export declare function pruneMissingRepos(repos: ConsoleConfigRepoEntry[]): ConsoleConfigRepoEntry[];
//# sourceMappingURL=repo-config.d.ts.map