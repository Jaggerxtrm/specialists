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
    /** Extension sources enabled via `execution.extensions[source] === true`.
     *  When non-empty the spawn loads the Specialists tool-policy extension
     *  LAST and gates the session on `--no-builtin-tools`: the policy extension
     *  re-activates the tier's native tools (bounded env channel) plus every
     *  tool registered by these sources. Native restrictions stay fail-closed. */
    exposedExtensionSources: readonly string[];
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
    /** Enabled extension sources (execution.extensions[source] === true) that
     *  switch the session to the tool-policy gate: --no-builtin-tools plus the
     *  Specialists-owned policy extension selecting the granted natives and
     *  all extension-registered tools at session start. */
    extensionSources?: readonly string[];
}
export declare function buildResolvedToolContract(input: BuildResolvedToolContractInput): ResolvedToolContract;
export declare function formatResolvedToolContract(contract: ResolvedToolContract): string;
export {};
//# sourceMappingURL=resolved-tool-contract.d.ts.map