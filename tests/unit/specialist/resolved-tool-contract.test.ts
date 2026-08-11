import { describe, expect, it } from 'vitest';
import { buildResolvedToolContract, formatResolvedToolContract } from '../../../src/specialist/resolved-tool-contract.js';
import type { ToolCatalog } from '../../../src/specialist/manifest-resolver.js';

const catalogs: readonly ToolCatalog[] = [
  {
    catalog: 'native',
    precedence: 0,
    source_tiers: {
      READ_ONLY: ['read', 'grep', 'find', 'ls'],
      LOW: ['read', 'grep', 'find', 'ls', 'bash'],
      MEDIUM: ['read', 'grep', 'find', 'ls', 'bash', 'edit'],
      HIGH: ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'],
    },
  },
  {
    catalog: 'gitnexus',
    precedence: 1,
    source_tiers: {
      READ_ONLY: ['gitnexus_query', 'gitnexus_context'],
      LOW: ['gitnexus_query', 'gitnexus_context'],
      MEDIUM: ['gitnexus_query', 'gitnexus_context', 'gitnexus_rename'],
      HIGH: ['gitnexus_query', 'gitnexus_context', 'gitnexus_rename', 'gitnexus_cypher'],
    },
  },
];

describe('resolved tool contract', () => {
  it('matches healthy hard-deny runtime without pretending native search exists', () => {
    const contract = buildResolvedToolContract({
      tier: 'READ_ONLY',
      catalogs,
      manifestPolicy: {
        permissions: {
          READ_ONLY: {
            denied_natives_when_extension: ['grep', 'find', 'ls'],
            denied_natives_mode: 'hard',
          },
        },
      },
      extensionState: {
        gitnexus: { health: 'loaded_healthy', catalogCompatible: true },
      },
      extensionPackages: {
        gitnexus: { packageName: 'pi-gitnexus', packagePath: '/tmp/pi-gitnexus' },
      },
    });

    expect(contract.toolsFlag).toBe('read,gitnexus_query,gitnexus_context');
    expect(contract.nativeTools).toEqual(['read']);
    expect(contract.extensionTools).toEqual(['gitnexus_query', 'gitnexus_context']);
    expect(contract.deniedNativeTools).toEqual(['grep', 'find', 'ls']);
    expect(contract.extensions.gitnexus.status).toBe('available');
    expect(contract.extensions.gitnexus.packageName).toBe('pi-gitnexus');
    expect(contract.extensions.gitnexus.packagePath).toBe('/tmp/pi-gitnexus');
    expect(formatResolvedToolContract(contract)).toContain('actual native tools: read');
    expect(formatResolvedToolContract(contract)).toContain('active extension tools: gitnexus_query, gitnexus_context');
  });

  it('surfaces fallback restore when extension disabled', () => {
    const contract = buildResolvedToolContract({
      tier: 'READ_ONLY',
      catalogs,
      manifestPolicy: {
        permissions: {
          READ_ONLY: {
            denied_natives_when_extension: ['grep', 'find', 'ls'],
            denied_natives_mode: 'hard',
          },
        },
      },
      specialistExclusions: { disabledExtensions: ['gitnexus'] },
      extensionState: {
        gitnexus: { health: 'loaded_healthy', catalogCompatible: true },
      },
      extensionPackages: {
        gitnexus: { packageName: 'pi-gitnexus' },
      },
    });

    expect(contract.toolsFlag).toBe('read,grep,find,ls');
    expect(contract.nativeTools).toEqual(['read', 'grep', 'find', 'ls']);
    expect(contract.extensionTools).toEqual([]);
    expect(contract.deniedNativeTools).toEqual([]);
    expect(contract.extensions.gitnexus.status).toBe('disabled');
    expect(contract.downgradeReasons).toEqual(['restored native fallback for grep,find,ls due to disabled']);
    expect(formatResolvedToolContract(contract)).toContain('gitnexus: disabled');
    expect(formatResolvedToolContract(contract)).toContain('downgrade reasons: restored native fallback for grep,find,ls due to disabled');
  });

  it('keeps soft-deny tools visible and reports preference signal', () => {
    const contract = buildResolvedToolContract({
      tier: 'LOW',
      catalogs,
      manifestPolicy: {
        permissions: {
          LOW: {
            denied_natives_when_extension: ['grep', 'find', 'ls'],
            denied_natives_mode: 'soft',
          },
        },
      },
      extensionState: {
        gitnexus: { health: 'loaded_healthy', catalogCompatible: true },
      },
      extensionPackages: {
        gitnexus: { packageName: 'pi-gitnexus' },
      },
    });

    expect(contract.toolsFlag).toBe('read,grep,find,ls,bash,gitnexus_query,gitnexus_context');
    expect(contract.nativeTools).toEqual(['read', 'grep', 'find', 'ls', 'bash']);
    expect(contract.deniedNativeTools).toEqual([]);
    expect(contract.preferenceSignals).toEqual(['soft deny prefers extension tools for: grep,find,ls']);
    expect(formatResolvedToolContract(contract)).toContain('preference signals: soft deny prefers extension tools for: grep,find,ls');
  });
});
