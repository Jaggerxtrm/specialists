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
  /** When set, the spawn must pass `--exclude-tools <this>` (deny-list gate)
   *  instead of `--tools <toolsFlag>`: native tools stay tier-restricted while
   *  tools registered by enabled extension sources remain available. */
  excludeToolsFlag?: string;
  /** Extension sources enabled via `execution.extensions[source] === true`.
   *  Each loads (-e) and its REGISTERED tools are all exposed to the model
   *  (operator trust signal; enabling an extension authorizes its code). */
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
   *  switch the tool gate to deny-list mode so their registered tools are not
   *  suppressed by the native allowlist. */
  extensionSources?: readonly string[];
}

/** Builtin native tool names Pi can register (read/write/edit/bash + search
 *  family). Used to build the deny-list gate: everything not granted at the
 *  effective tier is excluded, while extension-registered tools pass through.
 *  Names that Pi does not register are ignored harmlessly. */
export const ALL_PI_NATIVE_TOOL_NAMES = ['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls'] as const;

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
  // Deny-list gate: builtin natives NOT granted after deny resolution are
  // excluded; extension-registered tools pass through by Pi design.
  const excludeToolsFlag = exposedExtensionSources.length > 0
    ? ALL_PI_NATIVE_TOOL_NAMES.filter((name) => !nativeTools.includes(name)).join(',')
    : undefined;
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
    excludeToolsFlag,
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
    ...(contract.excludeToolsFlag ? [`- --exclude-tools (extension expose-all gate): ${contract.excludeToolsFlag}`] : []),
    ...(contract.exposedExtensionSources.length > 0
      ? [`- exposed extension sources (all registered tools available): ${formatList(contract.exposedExtensionSources)}`]
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
