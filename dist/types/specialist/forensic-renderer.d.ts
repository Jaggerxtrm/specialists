import { type ForensicCorrelation, type ForensicEvent, type ForensicSeverity } from './forensic-events.js';
export interface RenderedRow {
    ts: number;
    seq?: number;
    type: string;
    actor: string;
    severity: ForensicSeverity;
    payload: string;
    jobId: string;
    beadId?: string;
    schemaWarning?: string;
    correlation?: Pick<ForensicCorrelation, 'chain_id' | 'chain_root_job_id' | 'participant_id'>;
}
export interface RenderOpts {
    includeJobPrefix?: boolean;
    includeBeadPrefix?: boolean;
    maxPayloadFields?: number;
    maxFieldValueChars?: number;
}
export declare function forensicEventToRow(ev: ForensicEvent, opts?: RenderOpts): RenderedRow;
export interface ColumnLayout {
    seqW: number;
    typeW: number;
    actorW: number;
}
export declare const SPEC_72_LAYOUT: ColumnLayout;
export interface ColumnStrings {
    seq: string;
    type: string;
    actor: string;
    payload: string;
}
export declare function formatRenderedRowColumns(row: RenderedRow, layout?: ColumnLayout): ColumnStrings;
//# sourceMappingURL=forensic-renderer.d.ts.map