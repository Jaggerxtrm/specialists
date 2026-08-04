export type ToolTier = 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
export type ToolCatalogName = 'native' | 'gitnexus';
export type ExtensionHealth = 'not_installed' | 'disabled' | 'loaded_healthy' | 'loaded_unhealthy' | 'unknown';
export type DeniedNativesMode = 'soft' | 'hard';
export interface ToolCatalog {
    catalog: ToolCatalogName;
    precedence: number;
    source_tiers: Record<ToolTier, readonly string[]>;
}
export interface CatalogDefaultOverrides {
    default_overrides?: Partial<Record<ToolTier, ManifestPolicyTier>>;
}
export interface ManifestPolicyTier {
    denied_natives_when_extension?: readonly string[];
    denied_natives_mode?: DeniedNativesMode;
}
export interface ManifestPolicy {
    permissions: Partial<Record<ToolTier, ManifestPolicyTier>>;
    specialists?: Record<string, ManifestPolicyTier>;
}
export interface ExtensionState {
    health: ExtensionHealth;
    enabled?: boolean;
    catalogCompatible?: boolean;
}
export interface ResolverInput {
    tier: ToolTier;
    catalogs: readonly ToolCatalog[];
    catalogDefaultOverrides?: Partial<Record<ToolTier, ManifestPolicyTier>>;
    manifestPolicy?: ManifestPolicy;
    specialistOverride?: ManifestPolicyTier;
    specialistExclusions?: {
        disabledExtensions?: readonly ToolCatalogName[];
        deniedNatives?: readonly string[];
    };
    extensionState?: Partial<Record<ToolCatalogName, ExtensionState>>;
}
export interface ToolLayerAttribution {
    layer: 'catalog_default' | 'tier_policy' | 'specialist_override' | 'specialist_exclusion' | 'runtime_health' | 'catalog';
    source?: string;
    tools: readonly string[];
}
export interface ResolverResult {
    tools: string;
    toolsList: readonly string[];
    deniedNatives: readonly string[];
    deniedNativesMode: DeniedNativesMode;
    preferenceSignals: readonly string[];
    downgradeReasons: readonly string[];
    warnings: readonly string[];
    attribution: readonly ToolLayerAttribution[];
}
export declare function resolveManifestTools(input: ResolverInput): ResolverResult;
export declare const LEGACY_PERMISSION_TOOL_STRINGS: Record<ToolTier, string>;
//# sourceMappingURL=manifest-resolver.d.ts.map