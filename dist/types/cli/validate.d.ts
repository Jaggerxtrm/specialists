export interface ParsedArgs {
    value: string;
    json?: boolean;
    target?: 'script';
}
export declare class ArgParseError extends Error {
    constructor(message: string);
}
export declare function parseArgs(argv: string[]): ParsedArgs;
export declare function run(): Promise<void>;
//# sourceMappingURL=validate.d.ts.map