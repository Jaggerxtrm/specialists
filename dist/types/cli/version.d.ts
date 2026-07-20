export interface VersionInfo {
    package: string;
    version: string;
    commit: string | null;
    dirty: boolean | null;
    source: 'npm' | 'local';
    built_at: string | null;
    runtime: {
        bun: string | null;
    };
}
export declare function collectVersionInfo(): VersionInfo;
export declare function run(): Promise<void>;
//# sourceMappingURL=version.d.ts.map