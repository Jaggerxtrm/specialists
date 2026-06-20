export type DiffStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
export interface DiffSummaryEntry {
    path: string;
    status: DiffStatus;
    added: number;
    deleted: number;
    binary: boolean;
}
export interface DiffHunk {
    header: string;
    lines: DiffLine[];
}
export interface DiffLine {
    kind: 'context' | 'add' | 'del' | 'meta';
    text: string;
}
export declare function isValidGitRef(ref: string): boolean;
export declare function parseNumstat(input: string): Array<{
    path: string;
    added: number;
    deleted: number;
    binary: boolean;
}>;
export declare function parsePorcelainStatus(input: string): Map<string, DiffStatus>;
export declare function buildDiffSummary(numstat: ReturnType<typeof parseNumstat>, porcelain: Map<string, DiffStatus>): DiffSummaryEntry[];
export declare function parseUnifiedDiff(input: string): DiffHunk[];
export declare const HUNK_DISPLAY_CEILING = 5000;
//# sourceMappingURL=git.d.ts.map