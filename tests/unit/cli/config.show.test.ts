import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SPECIALIST = {
  specialist: {
    metadata: { name: 'executor' },
    execution: { permission_required: 'HIGH' },
    permissions: {
      HIGH: {
        denied_natives_when_extension: ['write'],
        denied_natives_mode: 'soft',
      },
    },
  },
};

const CATALOG_INDEX = {
  precedence_order: ['native', 'gitnexus', 'python-kernel'],
  catalogs: [
    {
      catalog: 'native',
      package: 'specialists',
      version: '3.11.0',
      precedence: 0,
      source_tiers: { READ_ONLY: ['read'], LOW: ['read'], MEDIUM: ['read'], HIGH: ['read', 'write'] },
    },
    {
      catalog: 'gitnexus',
      package: 'pi-gitnexus',
      version: '0.6.1',
      precedence: 1,
      source_tiers: { READ_ONLY: ['gitnexus_list_repos'], LOW: ['gitnexus_list_repos'], MEDIUM: ['gitnexus_list_repos'], HIGH: ['gitnexus_list_repos'] },
    },
    {
      catalog: 'python-kernel',
      package: '@jaggerxtrm/pi-extensions',
      version: '0.11.7',
      precedence: 2,
      source_tiers: { READ_ONLY: [], LOW: [], MEDIUM: ['python'], HIGH: ['python'] },
    },
  ],
};

describe('config CLI resolved output', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-config-resolved-'));
    await mkdir(join(tempDir, 'config', 'specialists'), { recursive: true });
    await mkdir(join(tempDir, '.specialists', 'catalog'), { recursive: true });
    await writeFile(join(tempDir, 'config', 'specialists', 'executor.specialist.json'), JSON.stringify(SPECIALIST), 'utf-8');
    await writeFile(join(tempDir, '.specialists', 'catalog', 'index.json'), JSON.stringify(CATALOG_INDEX), 'utf-8');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('shows resolved manifest and tools', async () => {
    process.argv = ['node', 'specialists', 'config', 'show', 'executor', '--resolved'];

    const { run } = await import('../../../src/cli/config.js');
    await run();

    const output = vi.mocked(console.log).mock.calls.map(call => String(call[0] ?? '')).join('\n');
    expect(output).toContain('specialist: executor');
    expect(output).toContain('layer attribution:');
    expect(output).toContain('extension availability:');
    expect(output).toContain('deny mode: soft');
    expect(output).toContain('preference signals: soft deny prefers extension tools for: write');
    expect(output).toContain('--tools:');
  });
});

// Regression for unitAI-63xi3.2: sp config show --resolved must not ENOENT when
// only the canonical config/catalog/index.json exists (no legacy .specialists/catalog/).
// Precedence matches src/pi/session.ts loadSharedToolCatalogIndex.
describe('config CLI resolved output — canonical catalog fallback', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-config-resolved-canonical-'));
    // Manifest only. NO .specialists/catalog/ directory; loader must fall back
    // to the canonical config/catalog/index.json resolved from the running module.
    await mkdir(join(tempDir, 'config', 'specialists'), { recursive: true });
    await writeFile(join(tempDir, 'config', 'specialists', 'executor.specialist.json'), JSON.stringify(SPECIALIST), 'utf-8');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('falls back to canonical config/catalog/index.json when legacy .specialists/catalog is absent', async () => {
    process.argv = ['node', 'specialists', 'config', 'show', 'executor', '--resolved'];

    const { run } = await import('../../../src/cli/config.js');
    await expect(run()).resolves.toBeUndefined();

    const errorCalls = vi.mocked(console.error).mock.calls.map(call => String(call[0] ?? '')).join('\n');
    expect(errorCalls).not.toContain('ENOENT');
    expect(errorCalls).not.toContain('.specialists/catalog/index.json');

    const output = vi.mocked(console.log).mock.calls.map(call => String(call[0] ?? '')).join('\n');
    expect(output).toContain('specialist: executor');
  });
});
