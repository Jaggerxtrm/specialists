import { type ExtensionState, type ResolverResult, type ToolCatalogName } from './manifest-resolver.js';
import { type ResolvedToolContract } from './resolved-tool-contract.js';
export interface ExtensionProbe {
    name: ToolCatalogName;
    package: string;
    version: string;
    health: ExtensionState['health'];
    drift: 'none' | 'degraded' | 'catalog_mismatch';
    reason: string;
}
type CatalogRecord = {
    catalog: ToolCatalogName;
    package: string;
    version: string;
    precedence: number;
    source_tiers: Record<string, readonly string[]>;
};
export interface ResolvedConfigReport {
    specialist: string;
    manifest: unknown;
    catalogs: readonly CatalogRecord[];
    extensionAvailability: readonly ExtensionProbe[];
    resolver: ResolverResult;
    toolContract: ResolvedToolContract;
    catalogCompatibility: readonly string[];
}
export declare function classifyExtensionProbe(catalog: CatalogRecord, input: {
    installedVersion?: string;
    entrypointExists?: boolean;
}): ExtensionProbe;
export declare function loadResolvedConfigReport(args: {
    specialistName: string;
    projectDir: string;
    catalogsPath: string;
}): Promise<ResolvedConfigReport>;
export declare function formatResolvedConfigReport(report: ResolvedConfigReport): string;
export {};
//# sourceMappingURL=resolution-diagnostics.d.ts.map