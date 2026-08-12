export interface CitationLine {
    line: number;
    text: string;
}
export interface VerifiedCitationWindow {
    source: 'deterministic_file_read';
    path: string;
    offset: number;
    totalLines: number;
    lines: CitationLine[];
    complete: boolean;
    truncated: boolean;
    nextOffset?: number;
}
export interface RawPiReadEvidence {
    source: 'raw_pi_read';
    path: string;
    content: string;
    offset?: number;
    limit?: number;
    truncated?: boolean;
}
export interface ExactLineClaim {
    line: number;
    text: string;
}
export type ExactLineCitationResult = {
    ok: true;
    citation: string;
    line: number;
    text: string;
} | {
    ok: false;
    reason: 'raw_pi_read_unverified' | 'line_outside_verified_window' | 'line_mismatch' | 'stale_snapshot';
};
export interface VerifiedCitationWindowOptions {
    offset?: number;
    limit?: number;
    maxLines?: number;
    maxBytes?: number;
}
export declare function readVerifiedCitationWindow(path: string, options?: VerifiedCitationWindowOptions): Promise<VerifiedCitationWindow>;
export declare function verifyExactLineCitation(evidence: VerifiedCitationWindow | RawPiReadEvidence, claim: ExactLineClaim): Promise<ExactLineCitationResult>;
//# sourceMappingURL=citation-evidence.d.ts.map