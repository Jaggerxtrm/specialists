export type ToolTier = 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
export type ToolCatalogName = 'native' | 'gitnexus' | 'python-kernel';
export type ExtensionHealth = 'not_installed' | 'disabled' | 'loaded_healthy' | 'loaded_unhealthy' | 'unknown';
export type DeniedNativesMode = 'soft' | 'hard';
export type EffectiveExtensionStatus = 'available' | 'disabled' | 'not_installed' | 'loaded_unhealthy' | 'unknown' | 'catalog_incompatible';

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

export interface EffectiveExtensionState {
  status: EffectiveExtensionStatus;
  includeTools: boolean;
  canEnforceHardDeny: boolean;
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

const GITNEXUS_HARD_DENY_TOOLS = new Set(['grep', 'find', 'ls']);
const GITNEXUS_BASE_TIER: ToolTier = 'READ_ONLY';

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
  return catalogs.find(catalog => catalog.catalog === name);
}

function hasPolicyFields(policy: ManifestPolicyTier | undefined): boolean {
  return Boolean(policy?.denied_natives_mode || (policy?.denied_natives_when_extension?.length ?? 0) > 0);
}

function mergeTierPolicy(input: ResolverInput): ManifestPolicyTier {
  const catalogPolicy = input.catalogDefaultOverrides?.[input.tier];
  const tierPolicy = input.manifestPolicy?.permissions?.[input.tier];
  const overridePolicy = input.specialistOverride;
  const specialistDenied = input.specialistExclusions?.deniedNatives ?? [];
  return {
    denied_natives_when_extension: uniqueOrdered([
      ...(catalogPolicy?.denied_natives_when_extension ?? []),
      ...(tierPolicy?.denied_natives_when_extension ?? []),
      ...(overridePolicy?.denied_natives_when_extension ?? []),
      ...specialistDenied,
    ]),
    denied_natives_mode: overridePolicy?.denied_natives_mode ?? tierPolicy?.denied_natives_mode ?? catalogPolicy?.denied_natives_mode ?? 'soft',
  };
}

function getTierTools(catalogs: readonly ToolCatalog[], name: ToolCatalogName, tier: ToolTier): readonly string[] {
  const catalog = getCatalog(catalogs, name);
  return catalog?.source_tiers[tier] ?? [];
}

function getEffectiveDeniedTools(tools: readonly string[]): string[] {
  return tools.filter(tool => tool !== 'read');
}

export function resolveEffectiveExtensionState(state: ExtensionState | undefined): EffectiveExtensionState {
  if (!state) {
    return { status: 'available', includeTools: true, canEnforceHardDeny: true };
  }
  if (state.enabled === false || state.health === 'disabled') {
    return { status: 'disabled', includeTools: false, canEnforceHardDeny: false };
  }
  if (state.health === 'not_installed') {
    return { status: 'not_installed', includeTools: false, canEnforceHardDeny: false };
  }
  if (state.health === 'loaded_unhealthy') {
    return { status: 'loaded_unhealthy', includeTools: false, canEnforceHardDeny: false };
  }
  if (state.health === 'unknown') {
    return { status: 'unknown', includeTools: false, canEnforceHardDeny: false };
  }
  if (state.catalogCompatible === false) {
    return { status: 'catalog_incompatible', includeTools: false, canEnforceHardDeny: false };
  }
  return { status: 'available', includeTools: true, canEnforceHardDeny: true };
}

export function resolveManifestTools(input: ResolverInput): ResolverResult {
  const policy = mergeTierPolicy(input);
  const warnings: string[] = [];
  const attribution: ToolLayerAttribution[] = [];
  const downgradeReasons: string[] = [];
  const effectiveDenied = new Set(getEffectiveDeniedTools(policy.denied_natives_when_extension ?? []));
  const hardDeniedTools = new Set(Array.from(effectiveDenied).filter(tool => GITNEXUS_HARD_DENY_TOOLS.has(tool)));
  const deniedNatives: string[] = [];

  const nativeTools = getTierTools(input.catalogs, 'native', input.tier);
  const gitnexusBase = getTierTools(input.catalogs, 'gitnexus', GITNEXUS_BASE_TIER);
  const gitnexusExtras = input.tier === 'MEDIUM' || input.tier === 'HIGH'
    ? getTierTools(input.catalogs, 'gitnexus', input.tier).filter(tool => !gitnexusBase.includes(tool))
    : [];
  const requestedGitnexusTools = uniqueOrdered([...gitnexusBase, ...gitnexusExtras]);

  // python-kernel: optional extension tool (persistent `python` REPL). Its
  // tools join the list only when the extension state is available (package
  // installed and catalog-compatible), mirroring the gitnexus gate below.
  const pythonKernelTools = getTierTools(input.catalogs, 'python-kernel', input.tier);
  const pythonKernelState = input.extensionState?.['python-kernel'];
  const effectivePythonKernelState = resolveEffectiveExtensionState(pythonKernelState);

  const gitnexusState = input.specialistExclusions?.disabledExtensions?.includes('gitnexus')
    ? { ...input.extensionState?.gitnexus, enabled: false, health: 'disabled' as const }
    : input.extensionState?.gitnexus;
  const effectiveGitnexusState = resolveEffectiveExtensionState(gitnexusState);
  const hardDenyAllowed = policy.denied_natives_mode === 'hard' && effectiveGitnexusState.canEnforceHardDeny;

  const finalNativeTools = nativeTools.filter(tool => {
    if (!hardDeniedTools.has(tool)) return true;
    if (!hardDenyAllowed) return true;
    deniedNatives.push(tool);
    return false;
  });

  const toolsList = uniqueOrdered([
    ...finalNativeTools,
    ...(effectiveGitnexusState.includeTools ? requestedGitnexusTools : []),
    ...(effectivePythonKernelState.includeTools ? pythonKernelTools : []),
  ]);

  if (!effectiveGitnexusState.includeTools && requestedGitnexusTools.length > 0) {
    warnings.push(`gitnexus tools excluded by extension state: ${effectiveGitnexusState.status}`);
  }
  if (!effectivePythonKernelState.includeTools && pythonKernelTools.length > 0) {
    warnings.push(`python-kernel tools excluded by extension state: ${effectivePythonKernelState.status}`);
  }
  if ((input.specialistExclusions?.disabledExtensions ?? []).length > 0) {
    warnings.push(`specialist exclusions: ${(input.specialistExclusions?.disabledExtensions ?? []).join(', ')}`);
    attribution.push({ layer: 'specialist_exclusion', source: 'specialist.json', tools: [] });
  }

  attribution.push({ layer: 'catalog', source: 'tool catalogs', tools: uniqueOrdered([...nativeTools, ...requestedGitnexusTools, ...pythonKernelTools]) });
  if (input.catalogDefaultOverrides?.[input.tier]) {
    attribution.push({
      layer: 'catalog_default',
      source: 'tool catalog defaults',
      tools: input.catalogDefaultOverrides[input.tier]?.denied_natives_when_extension ?? [],
    });
  }
  if (input.manifestPolicy?.permissions?.[input.tier]) {
    attribution.push({
      layer: 'tier_policy',
      source: 'manifest policy',
      tools: input.manifestPolicy.permissions[input.tier]?.denied_natives_when_extension ?? [],
    });
  }
  if (input.specialistOverride) {
    attribution.push({
      layer: 'specialist_override',
      source: 'specialist YAML',
      tools: input.specialistOverride.denied_natives_when_extension ?? [],
    });
  }
  if (!hardDenyAllowed && policy.denied_natives_mode === 'hard' && hardDeniedTools.size > 0) {
    const restoredNatives = nativeTools.filter(tool => hardDeniedTools.has(tool));
    const reason = effectiveGitnexusState.status;
    warnings.push(`hard deny restored native fallback: ${reason}`);
    downgradeReasons.push(`restored native fallback for ${restoredNatives.join(',') || '(none)'} due to ${reason}`);
    attribution.push({ layer: 'runtime_health', source: 'fallback', tools: restoredNatives });
  }

  const preferenceSignals = policy.denied_natives_mode === 'soft' && effectiveDenied.size > 0
    ? [`soft deny prefers extension tools for: ${Array.from(effectiveDenied).join(',')}`]
    : [];

  return {
    tools: toolsList.join(','),
    toolsList,
    deniedNatives,
    deniedNativesMode: policy.denied_natives_mode ?? 'soft',
    preferenceSignals,
    downgradeReasons,
    warnings,
    attribution,
  };
}

// Legacy fallback tool strings: native tools + GitNexus per tier. Serena tool
// names were retired with the K4 Serena retirement (unitAI-e67up.8).
export const LEGACY_PERMISSION_TOOL_STRINGS: Record<ToolTier, string> = {
  READ_ONLY: 'read,grep,find,ls,gitnexus_list_repos,gitnexus_query,gitnexus_context,gitnexus_impact,gitnexus_detect_changes',
  LOW: 'read,grep,find,ls,bash,gitnexus_list_repos,gitnexus_query,gitnexus_context,gitnexus_impact,gitnexus_detect_changes',
  MEDIUM: 'read,grep,find,ls,bash,edit,gitnexus_list_repos,gitnexus_query,gitnexus_context,gitnexus_impact,gitnexus_detect_changes,gitnexus_rename,gitnexus_cypher',
  HIGH: 'read,grep,find,ls,bash,edit,write,gitnexus_list_repos,gitnexus_query,gitnexus_context,gitnexus_impact,gitnexus_detect_changes,gitnexus_rename,gitnexus_cypher',
};
