import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ResolvedToolContract } from '../../../src/specialist/resolved-tool-contract.js';

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

async function loadDiagnostics(globalNodeModulesDir?: string) {
  vi.resetModules();
  if (globalNodeModulesDir) {
    vi.doMock('node:child_process', () => ({
      execSync: vi.fn(() => `${globalNodeModulesDir}\n`),
    }));
  }
  return import('../../../src/specialist/resolution-diagnostics.js');
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('node:child_process');
});

describe('resolution diagnostics', () => {
  it('classifies missing package, mismatch, degraded, and healthy probes', async () => {
    const { classifyExtensionProbe } = await loadDiagnostics();
    expect(classifyExtensionProbe(CATALOG, {})).toMatchObject({ health: 'not_installed', drift: 'none' });
    expect(classifyExtensionProbe(CATALOG, { installedVersion: '9.9.9', entrypointExists: true })).toMatchObject({ health: 'loaded_unhealthy', drift: 'catalog_mismatch' });
    expect(classifyExtensionProbe(CATALOG, { installedVersion: '0.6.1', entrypointExists: false })).toMatchObject({ health: 'loaded_unhealthy', drift: 'degraded' });
    expect(classifyExtensionProbe(CATALOG, { installedVersion: '0.6.1', entrypointExists: true })).toMatchObject({ health: 'loaded_healthy', drift: 'none' });
  });

  it('formats resolved report with attribution and tools', async () => {
    const { classifyExtensionProbe, formatResolvedConfigReport } = await loadDiagnostics();
    const toolContract: ResolvedToolContract = {
      effectiveTier: 'LOW',
      toolsFlag: 'read,ls,gitnexus_query',
      exposedExtensionSources: [],
      toolsList: ['read', 'ls', 'gitnexus_query'],
      nativeTools: ['read', 'ls'],
      extensionTools: ['gitnexus_query'],
      deniedNativeTools: [],
      deniedNativesMode: 'soft',
      preferenceSignals: [],
      downgradeReasons: ['restored native fallback for read due to loaded_unhealthy'],
      warnings: [],
      extensions: {
        gitnexus: { status: 'available', packageName: 'pi-gitnexus', activeTools: ['gitnexus_query'] },
      },
    };
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
      toolContract,
    });

    expect(output).toContain('specialist: executor');
    expect(output).toContain('layer attribution:');
    expect(output).toContain('downgrade reasons: restored native fallback for read due to loaded_unhealthy');
    expect(output).toContain('--tools: read,ls,gitnexus_query');
    expect(output).toContain('resolved tool contract:');
    expect(output).toContain('actual native tools: read, ls');
  });

  it('loadResolvedConfigReport suppresses disabled GitNexus tools for bare', async () => {
    const npmGlobalDir = mkdtempSync(join(tmpdir(), 'diag-npm-global-'));
    try {
      mkdirSync(join(npmGlobalDir, 'pi-gitnexus'), { recursive: true });
      mkdirSync(join(npmGlobalDir, 'node_modules', 'pi-gitnexus'), { recursive: true });
      const healthyPackageJson = JSON.stringify({ name: 'pi-gitnexus', version: '0.6.1' });
      writeFileSync(join(npmGlobalDir, 'pi-gitnexus', 'package.json'), healthyPackageJson);
      writeFileSync(join(npmGlobalDir, 'node_modules', 'pi-gitnexus', 'package.json'), healthyPackageJson);
      const { loadResolvedConfigReport } = await loadDiagnostics(npmGlobalDir);
      const report = await loadResolvedConfigReport({
        specialistName: 'bare',
        projectDir: process.cwd(),
        catalogsPath: join(process.cwd(), 'config', 'catalog', 'index.json'),
      });

      expect(report.toolContract.toolsList).toEqual(['read', 'grep', 'find', 'ls']);
      expect(report.toolContract.toolsList).not.toContain('gitnexus_query');
    } finally {
      rmSync(npmGlobalDir, { recursive: true, force: true });
    }
  });

  it('loadResolvedConfigReport restores native fallbacks for catalog mismatch without advertising GitNexus tools', async () => {
    const npmGlobalDir = mkdtempSync(join(tmpdir(), 'diag-npm-global-'));
    try {
      mkdirSync(join(npmGlobalDir, 'pi-gitnexus'), { recursive: true });
      mkdirSync(join(npmGlobalDir, 'node_modules', 'pi-gitnexus'), { recursive: true });
      const mismatchedPackageJson = JSON.stringify({ name: 'pi-gitnexus', version: '9.9.9' });
      writeFileSync(join(npmGlobalDir, 'pi-gitnexus', 'package.json'), mismatchedPackageJson);
      writeFileSync(join(npmGlobalDir, 'node_modules', 'pi-gitnexus', 'package.json'), mismatchedPackageJson);
      const { loadResolvedConfigReport } = await loadDiagnostics(npmGlobalDir);
      const report = await loadResolvedConfigReport({
        specialistName: 'executor',
        projectDir: process.cwd(),
        catalogsPath: join(process.cwd(), 'config', 'catalog', 'index.json'),
      });

      expect(report.catalogCompatibility.join(' | ')).toContain('version mismatch: installed 9.9.9 != catalog 0.6.1');
      expect(report.toolContract.toolsList).toEqual(['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write']);
      expect(report.toolContract.toolsList).not.toContain('gitnexus_query');
    } finally {
      rmSync(npmGlobalDir, { recursive: true, force: true });
    }
  });
});
