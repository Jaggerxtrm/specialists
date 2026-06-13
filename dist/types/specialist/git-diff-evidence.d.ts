export interface GitChangedFileEvidence {
    path: string;
    added_lines: number;
    removed_lines: number;
}
export interface GitDiffEvidence {
    base_ref?: string;
    base_sha?: string;
    head_sha?: string;
    changed_files: GitChangedFileEvidence[];
    hunks?: string;
    hunks_artifact_ref?: string;
    hunks_inline?: boolean;
    hunks_truncated?: boolean;
}
export declare function redactGitDiffHunks(hunks: string): string;
export declare function willHunksBeInline(hunks: string): boolean;
export declare function writeGitDiffHunksArtifact(jobDir: string, artifactName: string, hunks: string): string;
export declare function parseGitNumstat(output: string): GitChangedFileEvidence[];
export declare function buildGitDiffEvidence(options: {
    base_ref?: string;
    base_sha?: string;
    head_sha?: string;
    numstat_output: string;
    hunks_output?: string;
    artifact_ref?: string;
}): GitDiffEvidence;
//# sourceMappingURL=git-diff-evidence.d.ts.map