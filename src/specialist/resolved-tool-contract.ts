import {
  resolveEffectiveExtensionState,
  resolveManifestTools,
  type EffectiveExtensionStatus,
  type ResolverInput,
  type ToolCatalog,
  type ToolCatalogName,
  type ToolTier,
} from './manifest-resolver.js';

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

function uniqueOrdered(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

function getCatalog(catalogs: readonly ToolCatalog[], name: ToolCatalogName): ToolCatalog | undefined {
  return catalogs.find((catalog) => catalog.catalog === name);
}

function getRequestedExtensionTools(catalogs: readonly ToolCatalog[], name: Exclude<ToolCatalogName, 'native'>, tier: ToolTier): readonly string[] {
  const catalog = getCatalog(catalogs, name);
  if (!catalog) return [];
  return uniqueOrdered([
    ...(catalog.source_tiers.READ_ONLY ?? []),
    ...(catalog.source_tiers[tier] ?? []),
  ]);
}

function getEffectiveExtensionStatus(input: ResolverInput, name: Exclude<ToolCatalogName, 'native'>): EffectiveExtensionStatus {
  const state = input.specialistExclusions?.disabledExtensions?.includes(name)
    ? { ...input.extensionState?.[name], enabled: false, health: 'disabled' as const }
    : input.extensionState?.[name];
  return resolveEffectiveExtensionState(state).status;
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : '(none)';
}

export function buildResolvedToolContract(input: BuildResolvedToolContractInput): ResolvedToolContract {
  const resolver = resolveManifestTools(input);
  const nativeCatalog = getCatalog(input.catalogs, 'native');
  const tierNativeTools = new Set(nativeCatalog?.source_tiers[input.tier] ?? []);
  const nativeTools = resolver.toolsList.filter((tool) => tierNativeTools.has(tool));
  const extensionTools = resolver.toolsList.filter((tool) => !tierNativeTools.has(tool));
  const exposedExtensionSources = uniqueOrdered(input.extensionSources ?? []);
  const extensions = Object.fromEntries(
    input.catalogs
      .filter((catalog): catalog is ToolCatalog & { catalog: Exclude<ToolCatalogName, 'native'> } => catalog.catalog !== 'native')
      .map((catalog) => {
        const activeTools = resolver.toolsList.filter((tool) => getRequestedExtensionTools(input.catalogs, catalog.catalog, input.tier).includes(tool));
        return [
          catalog.catalog,
          {
            status: getEffectiveExtensionStatus(input, catalog.catalog),
            packageName: input.extensionPackages?.[catalog.catalog]?.packageName,
            packagePath: input.extensionPackages?.[catalog.catalog]?.packagePath,
            activeTools,
          } satisfies ResolvedExtensionContract,
        ];
      }),
  ) as ResolvedToolContract['extensions'];

  return {
    effectiveTier: input.tier,
    toolsFlag: resolver.tools,
    exposedExtensionSources,
    toolsList: resolver.toolsList,
    nativeTools,
    extensionTools,
    deniedNativeTools: resolver.deniedNatives,
    deniedNativesMode: resolver.deniedNativesMode,
    preferenceSignals: resolver.preferenceSignals,
    downgradeReasons: resolver.downgradeReasons,
    warnings: resolver.warnings,
    extensions,
  };
}

export function formatResolvedToolContract(contract: ResolvedToolContract): string {
  const lines = [
    '## Resolved Tool Contract',
    `- effective tier: ${contract.effectiveTier}`,
    `- --tools: ${contract.toolsFlag || '(none)'}`,
    ...(contract.exposedExtensionSources.length > 0
      ? [`- exposed extension sources (all registered tools available via tool-policy gate): ${formatList(contract.exposedExtensionSources)}`]
      : []),
    `- actual native tools: ${formatList(contract.nativeTools)}`,
    `- active extension tools: ${formatList(contract.extensionTools)}`,
    `- denied native tools: ${formatList(contract.deniedNativeTools)}`,
    `- deny mode: ${contract.deniedNativesMode}`,
    '- extension state:',
  ];

  const extensionEntries = Object.entries(contract.extensions);
  if (extensionEntries.length === 0) {
    lines.push('  - (none)');
  } else {
    for (const [name, extension] of extensionEntries) {
      lines.push(`  - ${name}: ${extension.status}; active tools: ${formatList(extension.activeTools)}`);
    }
  }

  lines.push(`- preference signals: ${formatList(contract.preferenceSignals)}`);
  lines.push(`- downgrade reasons: ${formatList(contract.downgradeReasons)}`);
  lines.push(`- warnings: ${formatList(contract.warnings)}`);

  return lines.join('\n');
}
