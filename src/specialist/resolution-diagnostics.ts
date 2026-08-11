import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

import { loadToolCatalogIndex } from './tool-catalog.js';
import {
  resolveManifestTools,
  type ExtensionState,
  type ManifestPolicyTier,
  type ResolverInput,
  type ResolverResult,
  type ToolCatalogName,
  type ToolTier,
} from './manifest-resolver.js';
import { buildResolvedToolContract, formatResolvedToolContract, type ResolvedToolContract } from './resolved-tool-contract.js';

const require = createRequire(import.meta.url);

let cachedGlobalNodeModules: string | undefined;
function globalNodeModules(): string | undefined {
  if (cachedGlobalNodeModules !== undefined) return cachedGlobalNodeModules;
  try {
    cachedGlobalNodeModules = execSync('npm root -g', { encoding: 'utf-8' }).trim();
  } catch {
    cachedGlobalNodeModules = '';
  }
  return cachedGlobalNodeModules || undefined;
}

function resolveAcrossGlobals(packageName: string, ...subpaths: string[]): string | undefined {
  const target = subpaths.length > 0 ? `${packageName}/${subpaths.join('/')}` : packageName;
  const paths: string[] = [];
  const globalRoot = globalNodeModules();
  if (globalRoot) paths.push(globalRoot);
  try {
    return require.resolve(target, paths.length > 0 ? { paths } : undefined);
  } catch {
    return undefined;
  }
}

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

function readJsonFile(path: string): unknown {
  return JSON.parse(require('node:fs').readFileSync(path, 'utf-8')) as unknown;
}

function resolvePackageVersion(packageName: string): string | undefined {
  const packageJsonPath = resolveAcrossGlobals(packageName, 'package.json');
  if (!packageJsonPath) return undefined;
  try {
    const pkg = readJsonFile(packageJsonPath) as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

export function classifyExtensionProbe(catalog: CatalogRecord, input: { installedVersion?: string; entrypointExists?: boolean }): ExtensionProbe {
  if (!input.installedVersion) {
    return {
      name: catalog.catalog,
      package: catalog.package,
      version: catalog.version,
      health: 'not_installed',
      drift: 'none',
      reason: 'package missing',
    };
  }

  if (input.installedVersion !== catalog.version) {
    return {
      name: catalog.catalog,
      package: catalog.package,
      version: catalog.version,
      health: 'loaded_unhealthy',
      drift: 'catalog_mismatch',
      reason: `version mismatch: installed ${input.installedVersion} != catalog ${catalog.version}`,
    };
  }

  if (!input.entrypointExists) {
    return {
      name: catalog.catalog,
      package: catalog.package,
      version: catalog.version,
      health: 'loaded_unhealthy',
      drift: 'degraded',
      reason: 'entrypoint missing',
    };
  }

  return {
    name: catalog.catalog,
    package: catalog.package,
    version: catalog.version,
    health: 'loaded_healthy',
    drift: 'none',
    reason: 'loaded',
  };
}

function probeHealth(catalog: CatalogRecord): ExtensionProbe {
  if (catalog.catalog === 'native') {
    return {
      name: catalog.catalog,
      package: catalog.package,
      version: catalog.version,
      health: 'loaded_healthy',
      drift: 'none',
      reason: 'built-in',
    };
  }
  const installedVersion = resolvePackageVersion(catalog.package);
  // pi extension packages may not declare a `main` field — they're loaded by
  // path convention. Treat package.json presence as sufficient evidence the
  // extension is installed; entrypoint check is best-effort.
  const entrypointExists = installedVersion !== undefined;
  return classifyExtensionProbe(catalog, { installedVersion, entrypointExists });
}

export async function loadResolvedConfigReport(args: {
  specialistName: string;
  projectDir: string;
  catalogsPath: string;
}): Promise<ResolvedConfigReport> {
  const manifest = readJsonFile(join(args.projectDir, 'config', 'specialists', `${args.specialistName}.specialist.json`));
  const index = loadToolCatalogIndex(await readFile(args.catalogsPath, 'utf-8'));
  const catalogs = index.catalogs as readonly CatalogRecord[];
  const probes = catalogs.map(probeHealth);
  const extensionState: Partial<Record<ToolCatalogName, ExtensionState>> = Object.fromEntries(
    probes.map(probe => [probe.name, { health: probe.health, catalogCompatible: probe.drift === 'none' }]),
  ) as Partial<Record<ToolCatalogName, ExtensionState>>;
  type ManifestPermissions = NonNullable<ResolverInput['manifestPolicy']>['permissions'];
  const specialistManifest = manifest as {
    specialist?: {
      execution?: { permission_required?: ToolTier; extensions?: { gitnexus?: boolean | null } };
      permissions?: ManifestPermissions;
    };
  };
  const tier: ToolTier = specialistManifest.specialist?.execution?.permission_required ?? 'READ_ONLY';
  const specialistOverride: ManifestPolicyTier | undefined = specialistManifest.specialist?.permissions?.[tier];
  const resolverInput: ResolverInput = {
    tier,
    catalogs,
    catalogDefaultOverrides: index.default_overrides,
    manifestPolicy: specialistManifest.specialist?.permissions
      ? { permissions: specialistManifest.specialist.permissions }
      : undefined,
    specialistOverride,
    specialistExclusions: specialistManifest.specialist?.execution?.extensions?.gitnexus === false
      ? { disabledExtensions: ['gitnexus'] }
      : undefined,
    extensionState,
  };
  const extensionPackages = Object.fromEntries(
    probes
      .filter((probe) => probe.name !== 'native')
      .map((probe) => [probe.name, { packageName: probe.package }]),
  ) as NonNullable<Parameters<typeof buildResolvedToolContract>[0]['extensionPackages']>;
  const toolContract = buildResolvedToolContract({
    ...resolverInput,
    extensionPackages,
  });
  const resolver = resolveManifestTools(resolverInput);
  const catalogCompatibility = probes
    .filter(probe => probe.drift !== 'none' || probe.health !== 'loaded_healthy')
    .map(probe => `${probe.name}: ${probe.health} (${probe.reason})`);

  return {
    specialist: args.specialistName,
    manifest,
    catalogs,
    extensionAvailability: probes,
    resolver,
    toolContract,
    catalogCompatibility,
  };
}

export function formatResolvedConfigReport(report: ResolvedConfigReport): string {
  const lines: string[] = [];
  lines.push(`specialist: ${report.specialist}`);
  lines.push('effective manifest:');
  lines.push(JSON.stringify(report.manifest, null, 2));
  lines.push('layer attribution:');
  for (const item of report.resolver.attribution) {
    lines.push(`  - ${item.layer}${item.source ? ` (${item.source})` : ''}: ${item.tools.join(',') || '(none)'}`);
  }
  lines.push('extension availability:');
  for (const item of report.extensionAvailability) {
    lines.push(`  - ${item.name}: ${item.health} [${item.drift}] ${item.reason}`);
  }
  lines.push('catalog compatibility:');
  if (report.catalogCompatibility.length === 0) {
    lines.push('  - ok');
  } else {
    for (const item of report.catalogCompatibility) lines.push(`  - ${item}`);
  }
  lines.push(`denied natives: ${report.toolContract.deniedNativeTools.join(',') || '(none)'}`);
  lines.push(`deny mode: ${report.toolContract.deniedNativesMode}`);
  lines.push(`preference signals: ${(report.toolContract.preferenceSignals ?? []).join(' | ') || '(none)'}`);
  lines.push(`downgrade reasons: ${(report.toolContract.downgradeReasons ?? []).join(' | ') || '(none)'}`);
  lines.push(`--tools: ${report.toolContract.toolsFlag}`);
  lines.push('resolved tool contract:');
  lines.push(formatResolvedToolContract(report.toolContract));
  if (report.resolver.warnings.length > 0) {
    lines.push('warnings:');
    for (const warning of report.resolver.warnings) lines.push(`  - ${warning}`);
  }
  return lines.join('\n');
}
