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

const HEALTHY: ExtensionHealth[] = ['loaded_healthy'];
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

function shouldIncludeExtensionTools(name: ToolCatalogName, input: ResolverInput): boolean {
  if (input.specialistExclusions?.disabledExtensions?.includes(name)) return false;
  const state = input.extensionState?.[name];
  if (!state) return true;
  if (state.enabled === false) return false;
  return state.health !== 'not_installed' && state.health !== 'disabled';
}

function getTierTools(catalogs: readonly ToolCatalog[], name: ToolCatalogName, tier: ToolTier): readonly string[] {
  const catalog = getCatalog(catalogs, name);
  return catalog?.source_tiers[tier] ?? [];
}

function canEnforceHardDeny(state: ExtensionState | undefined): boolean {
  if (!state) return true;
  if (!HEALTHY.includes(state.health)) return false;
  return state.catalogCompatible !== false;
}

export function resolveManifestTools(input: ResolverInput): ResolverResult {
  const policy = mergeTierPolicy(input);
  const warnings: string[] = [];
  const attribution: ToolLayerAttribution[] = [];
  const downgradeReasons: string[] = [];
  const effectiveDenied = new Set(policy.denied_natives_when_extension ?? []);
  const deniedNatives: string[] = [];

  const nativeTools = getTierTools(input.catalogs, 'native', input.tier);
  const gitnexusBase = getTierTools(input.catalogs, 'gitnexus', GITNEXUS_BASE_TIER);
  const gitnexusExtras = input.tier === 'MEDIUM' || input.tier === 'HIGH'
    ? getTierTools(input.catalogs, 'gitnexus', input.tier).filter(tool => !gitnexusBase.includes(tool))
    : [];

  const gitnexusState = input.extensionState?.gitnexus;
  const healthyGitnexus = canEnforceHardDeny(gitnexusState);
  const hardDenyAllowed = policy.denied_natives_mode === 'hard' && healthyGitnexus;

  const finalNativeTools = nativeTools.filter(tool => {
    if (!effectiveDenied.has(tool)) return true;
    if (!hardDenyAllowed) return true;
    deniedNatives.push(tool);
    return false;
  });

  const toolsList = uniqueOrdered([
    ...finalNativeTools,
    ...((input.specialistExclusions?.disabledExtensions?.includes('gitnexus') ? [] : gitnexusBase)),
    ...((input.specialistExclusions?.disabledExtensions?.includes('gitnexus') ? [] : gitnexusExtras)),
  ]);

  if (!shouldIncludeExtensionTools('gitnexus', input)) warnings.push('gitnexus tools excluded by extension state');
  if ((input.specialistExclusions?.disabledExtensions ?? []).length > 0) {
    warnings.push(`specialist exclusions: ${(input.specialistExclusions?.disabledExtensions ?? []).join(', ')}`);
    attribution.push({ layer: 'specialist_exclusion', source: 'specialist.json', tools: [] });
  }

  attribution.push({ layer: 'catalog', source: 'tool catalogs', tools: nativeTools });
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
  if (!hardDenyAllowed && policy.denied_natives_mode === 'hard' && effectiveDenied.size > 0) {
    const restoredNatives = nativeTools.filter(tool => effectiveDenied.has(tool));
    const reasonParts = [gitnexusState]
      .filter((state): state is ExtensionState => Boolean(state))
      .flatMap(state => {
        if (!HEALTHY.includes(state.health)) return [state.health];
        if (state.catalogCompatible === false) return ['catalog_incompatible'];
        return [];
      });
    const reason = reasonParts.length > 0 ? reasonParts.join(',') : 'unknown';
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
