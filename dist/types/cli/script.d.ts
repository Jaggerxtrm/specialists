import { type ScriptGenerateResult } from '../specialist/script-runner.js';
interface ScriptArgs {
    specialist: string;
    variables: Record<string, string>;
    template?: string;
    modelOverride?: string;
    thinking?: string;
    projectDir: string;
    dbPath?: string;
    timeoutMs?: number;
    json: boolean;
    singleInstance?: string;
    trace: boolean;
}
export declare function parseArgs(argv: string[]): ScriptArgs;
export declare function mapExitCode(result: ScriptGenerateResult): number;
export declare function run(argv?: string[]): Promise<void>;
export declare const scriptCli: {
    parseArgs: typeof parseArgs;
    mapExitCode: typeof mapExitCode;
};
export {};
//# sourceMappingURL=script.d.ts.map