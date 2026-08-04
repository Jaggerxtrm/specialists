import { classifyExtensionProbe, formatResolvedConfigReport } from '../../../src/specialist/resolution-diagnostics.js';

const CATALOG = {
  catalog: 'gitnexus',
  package: 'pi-gitnexus',
  version: '0.6.1',
  precedence: 1,
  source_tiers: {
    READ_ONLY: ['gitnexus_query'],
    LOW: ['gitnexus_query'],
    MEDIUM: ['gitnexus_query'],
    HIGH: ['gitnexus_query'],
  },
} as const;

describe('resolution diagnostics', () => {
  it('classifies missing package, mismatch, degraded, and healthy probes', () => {
    expect(classifyExtensionProbe(CATALOG, {})).toMatchObject({ health: 'not_installed', drift: 'none' });
    expect(classifyExtensionProbe(CATALOG, { installedVersion: '9.9.9', entrypointExists: true })).toMatchObject({ health: 'loaded_unhealthy', drift: 'catalog_mismatch' });
    expect(classifyExtensionProbe(CATALOG, { installedVersion: '0.6.1', entrypointExists: false })).toMatchObject({ health: 'loaded_unhealthy', drift: 'degraded' });
    expect(classifyExtensionProbe(CATALOG, { installedVersion: '0.6.1', entrypointExists: true })).toMatchObject({ health: 'loaded_healthy', drift: 'none' });
  });

  it('formats resolved report with attribution and tools', () => {
    const output = formatResolvedConfigReport({
      specialist: 'executor',
      manifest: { specialist: { metadata: { name: 'executor' } } },
      catalogs: [CATALOG],
      extensionAvailability: [classifyExtensionProbe(CATALOG, { installedVersion: '0.6.1', entrypointExists: true })],
      catalogCompatibility: [],
      resolver: {
        tools: 'read,ls,gitnexus_query',
        toolsList: ['read', 'ls', 'gitnexus_query'],
        deniedNatives: [],
        deniedNativesMode: 'soft',
        preferenceSignals: [],
        downgradeReasons: ['restored native fallback for read due to loaded_unhealthy'],
        warnings: [],
        attribution: [{ layer: 'tier_policy', source: 'manifest policy', tools: ['read', 'ls'] }],
      },
    });

    expect(output).toContain('specialist: executor');
    expect(output).toContain('layer attribution:');
    expect(output).toContain('downgrade reasons: restored native fallback for read due to loaded_unhealthy');
    expect(output).toContain('--tools: read,ls,gitnexus_query');
  });
});
