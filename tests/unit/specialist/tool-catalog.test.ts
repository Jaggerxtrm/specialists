import { describe, it, expect } from 'vitest';
import { loadToolCatalogIndex, SPECIALIST_TOOL_PRECEDENCE } from '../../../src/specialist/tool-catalog.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const EXPECTED_CONFLICT_SEMANTICS = '(1) most restrictive wins for tool inclusion\n * (2) exception: runtime health degradation or catalog incompatibility restores native fallbacks\n * (3) hard-deny in specialist override does not override runtime health downgrade';

const EXPECTED_NATIVE = {
  READ_ONLY: ['read', 'grep', 'find', 'ls'],
  LOW: ['read', 'grep', 'find', 'ls', 'bash'],
  MEDIUM: ['read', 'grep', 'find', 'ls', 'bash', 'edit'],
  HIGH: ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'],
};

const EXPECTED_GITNEXUS = {
  READ_ONLY: ['gitnexus_list_repos', 'gitnexus_query', 'gitnexus_context', 'gitnexus_impact', 'gitnexus_detect_changes'],
  LOW: ['gitnexus_list_repos', 'gitnexus_query', 'gitnexus_context', 'gitnexus_impact', 'gitnexus_detect_changes'],
  MEDIUM: ['gitnexus_list_repos', 'gitnexus_query', 'gitnexus_context', 'gitnexus_impact', 'gitnexus_detect_changes', 'gitnexus_rename', 'gitnexus_cypher'],
  HIGH: ['gitnexus_list_repos', 'gitnexus_query', 'gitnexus_context', 'gitnexus_impact', 'gitnexus_detect_changes', 'gitnexus_rename', 'gitnexus_cypher'],
};

function readCatalog(path: string) {
  return readFile(join(process.cwd(), path), 'utf8').then(loadToolCatalogIndex);
}

describe('tool catalog foundation', () => {
  it('encodes precedence order', async () => {
    const index = await readCatalog('config/catalog/index.json');
    expect(index.precedence_order).toEqual(SPECIALIST_TOOL_PRECEDENCE);
    // Serena catalog retired (unitAI-e67up.8): native + gitnexus + python-kernel layers ship.
    expect(index.catalogs.map(c => c.catalog)).toEqual(['native', 'gitnexus', 'python-kernel']);
  });

  it('documents conflict resolution semantics', async () => {
    const content = await readFile(join(process.cwd(), 'src/specialist/tool-catalog.ts'), 'utf8');
    expect(content).toContain(EXPECTED_CONFLICT_SEMANTICS);
  });

  it('validates native catalog content', async () => {
    const index = await readCatalog('config/catalog/index.json');
    const native = index.catalogs.find(c => c.catalog === 'native');
    expect(native?.package).toBe('specialists');
    expect(native?.version).toBe('3.11.0');
    expect(native?.source_tiers).toEqual(EXPECTED_NATIVE);
  });

  it('validates gitnexus catalog content', async () => {
    const index = await readCatalog('config/catalog/index.json');
    const gitnexus = index.catalogs.find(c => c.catalog === 'gitnexus');
    expect(gitnexus?.package).toBe('pi-gitnexus');
    expect(gitnexus?.version).toBe('0.6.1');
    expect(gitnexus?.source_tiers).toEqual(EXPECTED_GITNEXUS);
  });
});
