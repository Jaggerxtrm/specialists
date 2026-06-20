type SetupMode = 'discovery' | 'fetch-benchmarks' | 'plan' | 'apply' | 'probe-only' | 'interactive';
interface ParsedArgs {
    mode: SetupMode;
    json: boolean;
    offline: boolean;
    dryRun: boolean;
    planPreset?: string;
    planPath?: string;
    probeModel?: string;
    probeSpec?: string;
}
export declare function run(argv?: string[]): Promise<void>;
export declare function runDiscovery(args: ParsedArgs): Promise<void>;
export declare function runFetchBenchmarks(args: ParsedArgs): Promise<void>;
export declare function runPlan(args: ParsedArgs): Promise<void>;
export declare function runApply(args: ParsedArgs): Promise<void>;
export declare function runProbeOnly(args: ParsedArgs): Promise<void>;
export declare function runInteractive(args: ParsedArgs): Promise<void>;
export {};
//# sourceMappingURL=setup.d.ts.map