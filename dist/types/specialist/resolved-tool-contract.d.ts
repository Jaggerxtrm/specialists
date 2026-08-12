import { type EffectiveExtensionStatus, type ResolverInput, type ToolCatalogName, type ToolTier } from './manifest-resolver.js';
export interface ExtensionPackageRuntime {
    packageName?: string;
    packagePath?: string;
}
export interface ResolvedExtensionContract {
    status: EffectiveExtensionStatus;
    packageName?: string;
    packagePath?: string;
    activeTools: readonly string[];
}
export interface ResolvedToolContract {
    effectiveTier: ToolTier;
    toolsFlag: string;
    toolsList: readonly string[];
    nativeTools: readonly string[];
    extensionTools: readonly string[];
    deniedNativeTools: readonly string[];
    deniedNativesMode: ResolverInput['specialistOverride'] extends infer _ ? 'soft' | 'hard' : never;
    preferenceSignals: readonly string[];
    downgradeReasons: readonly string[];
    warnings: readonly string[];
    extensions: Partial<Record<Exclude<ToolCatalogName, 'native'>, ResolvedExtensionContract>>;
}
interface BuildResolvedToolContractInput extends ResolverInput {
    extensionPackages?: Partial<Record<ToolCatalogName, ExtensionPackageRuntime>>;
}
export declare function buildResolvedToolContract(input: BuildResolvedToolContractInput): ResolvedToolContract;
export declare function formatResolvedToolContract(contract: ResolvedToolContract): string;
export {};
//# sourceMappingURL=resolved-tool-contract.d.ts.map