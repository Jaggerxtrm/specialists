import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveManifestTools, type ToolCatalog, type ToolTier } from '../../../src/specialist/manifest-resolver.js';

const SPECIALISTS = ['explorer', 'overthinker', 'seconder', 'reviewer', 'obligations-scanner', 'executor', 'bare'] as const;

const TIERS: readonly ToolTier[] = ['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH'];
async function loadCatalogs(): Promise<readonly ToolCatalog[]> {
  const index = JSON.parse(await readFile(join(process.cwd(), 'config/catalog/index.json'), 'utf8')) as { catalogs: ToolCatalog[] };
  return index.catalogs;
}

async function loadCatalogDefaults(): Promise<Record<string, { denied_natives_when_extension?: readonly string[]; denied_natives_mode?: 'soft' | 'hard' }>> {
  const index = JSON.parse(await readFile(join(process.cwd(), 'config/catalog/index.json'), 'utf8')) as { default_overrides?: Record<string, { denied_natives_when_extension?: readonly string[]; denied_natives_mode?: 'soft' | 'hard' }> };
  return index.default_overrides ?? {};
}

async function loadSpecialist(name: string): Promise<{
  execution: { permission_required: ToolTier; extensions?: { gitnexus?: boolean | null } };
  permissions?: Record<string, { denied_natives_when_extension?: readonly string[]; denied_natives_mode?: 'soft' | 'hard' }>;
}> {
  return JSON.parse(await readFile(join(process.cwd(), 'config', 'specialists', `${name}.specialist.json`), 'utf8')).specialist;
}

function makeHealthyState() {
  return {
    gitnexus: { health: 'loaded_healthy' as const, catalogCompatible: true },
  };
}

describe('manifest resolver', () => {
  it.each(TIERS)('applies catalog default hard deny for %s without stripping read', async tier => {
    const catalogs = await loadCatalogs();
    const defaults = await loadCatalogDefaults();
    const resolved = resolveManifestTools({ tier, catalogs, catalogDefaultOverrides: defaults, extensionState: makeHealthyState() });
    const tools = resolved.toolsList;
    expect(tools).toContain('read');
    expect(tools).not.toContain('grep');
    expect(tools).not.toContain('find');
    expect(tools).not.toContain('ls');
    expect(resolved.deniedNatives).toEqual(['grep', 'find', 'ls']);
    expect(resolved.attribution.some(entry => entry.layer === 'catalog_default')).toBe(true);
  });

  it('specialist override keeps catalog default attribution distinct while native read survives', async () => {
    const catalogs = await loadCatalogs();
    const defaults = await loadCatalogDefaults();
    const resolved = resolveManifestTools({
      tier: 'READ_ONLY',
      catalogs,
      catalogDefaultOverrides: defaults,
      specialistOverride: {
        denied_natives_when_extension: ['read'],
        denied_natives_mode: 'hard',
      },
      extensionState: makeHealthyState(),
    });

    expect(resolved.deniedNatives).toEqual(['grep', 'find', 'ls']);
    expect(resolved.attribution.some(entry => entry.layer === 'catalog_default')).toBe(true);
    expect(resolved.attribution.some(entry => entry.layer === 'specialist_override')).toBe(true);
    expect(resolved.toolsList).toContain('read');
    expect(resolved.toolsList).not.toContain('grep');
    expect(resolved.toolsList).not.toContain('find');
    expect(resolved.toolsList).not.toContain('ls');
  });

  it('keeps soft deny from changing --tools', async () => {
    const catalogs = await loadCatalogs();
    const defaults = await loadCatalogDefaults();
    const resolved = resolveManifestTools({
      tier: 'READ_ONLY',
      catalogs,
      catalogDefaultOverrides: defaults,
      manifestPolicy: {
        permissions: {
          READ_ONLY: {
            denied_natives_when_extension: ['grep', 'find', 'ls'],
            denied_natives_mode: 'soft',
          },
        },
      },
      extensionState: makeHealthyState(),
    });

    expect(resolved.toolsList).toContain('read');
    expect(resolved.toolsList).toContain('grep');
    expect(resolved.toolsList).toContain('find');
    expect(resolved.toolsList).toContain('ls');
    expect(resolved.deniedNatives).toEqual([]);
    expect(resolved.deniedNativesMode).toBe('soft');
    expect(resolved.preferenceSignals).toEqual(['soft deny prefers extension tools for: grep,find,ls']);
    expect(resolved.downgradeReasons).toEqual([]);
  });

  it('hard deny strips natives only when replacement extensions are healthy', async () => {
    const catalogs = await loadCatalogs();
    const policy = {
      permissions: {
        READ_ONLY: {
          denied_natives_when_extension: ['grep', 'find', 'ls'],
          denied_natives_mode: 'hard' as const,
        },
      },
    };

    const defaults = await loadCatalogDefaults();
    const healthy = resolveManifestTools({
      tier: 'READ_ONLY',
      catalogs,
      catalogDefaultOverrides: defaults,
      manifestPolicy: policy,
      extensionState: makeHealthyState(),
    });

    expect(healthy.tools).toContain('read');
    expect(healthy.tools).not.toContain('grep');
    expect(healthy.deniedNatives).toEqual(['grep', 'find', 'ls']);
    expect(healthy.downgradeReasons).toEqual([]);

    const restoreStates = [
      { extensionState: { gitnexus: { health: 'not_installed' as const } }, reason: 'not_installed' },
      { extensionState: { gitnexus: { health: 'loaded_unhealthy' as const } }, reason: 'loaded_unhealthy' },
      { extensionState: { gitnexus: { health: 'loaded_healthy' as const, catalogCompatible: false } }, reason: 'catalog_incompatible' },
      { extensionState: { gitnexus: { health: 'unknown' as const } }, reason: 'unknown' },
      { extensionState: { gitnexus: { health: 'disabled' as const } }, reason: 'disabled' },
    ] as const;

    for (const { extensionState, reason } of restoreStates) {
      const restored = resolveManifestTools({
        tier: 'READ_ONLY',
        catalogs,
        manifestPolicy: policy,
        extensionState,
      });

      expect(restored.toolsList).toEqual(['read', 'grep', 'find', 'ls']);
      expect(restored.tools).not.toContain('gitnexus_query');
      expect(restored.deniedNatives).toEqual([]);
      expect(restored.downgradeReasons).toContain(`restored native fallback for grep,find,ls due to ${reason}`);
      expect(restored.warnings).toContain(`hard deny restored native fallback: ${reason}`);
    }
  });

  it('enables explorer hard deny for grep, find, and ls only when replacement extensions are healthy', async () => {
    const catalogs = await loadCatalogs();
    const defaults = await loadCatalogDefaults();
    const explorer = JSON.parse(await readFile(join(process.cwd(), 'config', 'specialists', 'explorer.specialist.json'), 'utf8')) as {
      specialist?: { permissions?: { READ_ONLY?: { denied_natives_when_extension?: readonly string[]; denied_natives_mode?: 'soft' | 'hard' } } };
    };
    const policy = explorer.specialist?.permissions;
    expect(policy?.READ_ONLY?.denied_natives_when_extension).toEqual(['grep', 'find', 'ls']);
    expect(policy?.READ_ONLY?.denied_natives_mode).toBe('hard');

    const healthy = resolveManifestTools({
      tier: 'READ_ONLY',
      catalogs,
      catalogDefaultOverrides: defaults,
      manifestPolicy: policy ? { permissions: policy } : undefined,
      specialistOverride: policy?.READ_ONLY,
      extensionState: makeHealthyState(),
    });

    expect(healthy.toolsList).toContain('read');
    expect(healthy.toolsList).not.toContain('grep');
    expect(healthy.toolsList).not.toContain('find');
    expect(healthy.toolsList).not.toContain('ls');
    expect(healthy.deniedNatives).toEqual(['grep', 'find', 'ls']);

    const restored = resolveManifestTools({
      tier: 'READ_ONLY',
      catalogs,
      manifestPolicy: policy ? { permissions: policy } : undefined,
      extensionState: {
        gitnexus: { health: 'loaded_unhealthy' as const },
      },
    });

    expect(restored.tools).toContain('grep');
    expect(restored.tools).toContain('find');
    expect(restored.tools).toContain('ls');
    expect(restored.tools).toContain('read');
    expect(restored.tools).not.toContain('gitnexus_query');
    expect(restored.deniedNatives).toEqual([]);
    expect(restored.downgradeReasons.join(' ')).toContain('restored native fallback');
  });

  it('resolved tool output matches affected specialist contracts', async () => {
    const catalogs = await loadCatalogs();
    const defaults = await loadCatalogDefaults();
    const expectations: Record<(typeof SPECIALISTS)[number], { native: readonly string[]; denied: readonly string[]; hasGitnexus: boolean }> = {
      explorer: { native: ['read'], denied: ['grep', 'find', 'ls'], hasGitnexus: true },
      overthinker: { native: ['read'], denied: ['grep', 'find', 'ls'], hasGitnexus: true },
      seconder: { native: ['read'], denied: ['grep', 'find', 'ls'], hasGitnexus: true },
      reviewer: { native: ['read', 'bash', 'edit'], denied: ['grep', 'find', 'ls'], hasGitnexus: true },
      'obligations-scanner': { native: ['read', 'grep', 'find', 'ls'], denied: [], hasGitnexus: true },
      executor: { native: ['read', 'bash', 'edit', 'write'], denied: ['grep', 'find', 'ls'], hasGitnexus: true },
      bare: { native: ['read', 'grep', 'find', 'ls'], denied: [], hasGitnexus: false },
    };

    for (const name of SPECIALISTS) {
      const specialist = await loadSpecialist(name);
      const tier = specialist.execution.permission_required;
      const resolved = resolveManifestTools({
        tier,
        catalogs,
        catalogDefaultOverrides: defaults,
        manifestPolicy: specialist.permissions ? { permissions: specialist.permissions } : undefined,
        specialistOverride: specialist.permissions?.[tier],
        specialistExclusions: specialist.execution.extensions?.gitnexus === false ? { disabledExtensions: ['gitnexus'] } : undefined,
        extensionState: makeHealthyState(),
      });

      for (const tool of expectations[name].native) expect(resolved.toolsList).toContain(tool);
      for (const tool of expectations[name].denied) expect(resolved.toolsList).not.toContain(tool);
      if (expectations[name].hasGitnexus) expect(resolved.toolsList).toContain('gitnexus_query');
      else expect(resolved.toolsList).not.toContain('gitnexus_query');
    }
  });

  it('tracks extension state, specialist override, and specialist exclusions in resolved output', async () => {
    const catalogs = await loadCatalogs();
    const resolved = resolveManifestTools({
      tier: 'READ_ONLY',
      catalogs,
      manifestPolicy: {
        permissions: {
          READ_ONLY: {
            denied_natives_when_extension: ['grep'],
            denied_natives_mode: 'soft',
          },
        },
      },
      specialistOverride: {
        denied_natives_when_extension: ['find'],
        denied_natives_mode: 'hard',
      },
      specialistExclusions: {
        disabledExtensions: ['gitnexus'],
        deniedNatives: ['ls'],
      },
      extensionState: {
        gitnexus: { health: 'disabled' },
      },
    });

    expect(resolved.warnings.some(w => w.includes('specialist exclusions'))).toBe(true);
    expect(resolved.warnings.some(w => w.includes('gitnexus tools excluded by extension state'))).toBe(true);
    expect(resolved.attribution.some(entry => entry.layer === 'specialist_exclusion')).toBe(true);
    // GitNexus disabled: no gitnexus tools, hard deny degrades, natives restored.
    expect(resolved.tools).not.toContain('gitnexus_query');
    expect(resolved.tools).toContain('read');
    expect(resolved.tools).toContain('find');
  });
});
