import { type ListBranchIntegrationFilters } from '../specialist/observability-sqlite.js';
export declare function runRecord(): void;
export interface IntegrationListOptions extends ListBranchIntegrationFilters {
    json: boolean;
}
export declare function parseIntegrationListArgs(argv: readonly string[]): IntegrationListOptions;
interface IntegrationRowView {
    source: {
        job_id: string;
        branch: string;
    };
    target: {
        branch: string;
        role?: string;
    };
    status: string;
    commit: string;
}
/** Pure rendering seam: `--json` emits the stored event verbatim, so the output IS
 *  the recorded xtrm.branch.integration.v1 payload rather than a re-projection. */
export declare function renderIntegrationRows(rows: ReadonlyArray<{
    t: number;
    event: IntegrationRowView;
}>, options: {
    json: boolean;
}): string[];
export declare function runList(): Promise<void>;
export {};
//# sourceMappingURL=integration.d.ts.map