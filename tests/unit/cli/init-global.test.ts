// tests/unit/cli/init-global.test.ts
// Covers `sp init --global` (src/cli/init.ts runGlobal) and the shared
// global-config helpers (src/specialist/global-config.ts) that C1/C3 import.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, mkdtempSync } from 'node:fs';
import { dirname } from 'node:path';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildGlobalUserConfigTemplate,
  buildSpecialistOverrideTemplate,
  getGlobalUserConfigPath,
  mergeGlobalUserConfig,
  validateGlobalUserConfig,
  GlobalSpecialistOverrideSchema,
} from '../../../src/specialist/global-config.js';

async function importInit() {
  return import('../../../src/cli/init.js');
}

function withHome(home: string) {
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
}

describe('getGlobalUserConfigPath — resolution order', () => {
  let tempHome: string;
  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'sp-global-path-'));
    withHome(tempHome);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses XDG_CONFIG_HOME when set (source: xdg)', () => {
    const xdg = join(tempHome, 'xdg');
    process.env.XDG_CONFIG_HOME = xdg;
    const result = getGlobalUserConfigPath();
    expect(result.source).toBe('xdg');
    expect(result.path).toBe(join(xdg, 'specialists', 'user.json'));
    expect(result.exists).toBe(false);
  });

  it('defaults to ~/.config/specialists/user.json (source: config-home) when absent', () => {
    const result = getGlobalUserConfigPath();
    expect(result.source).toBe('config-home');
    expect(result.path).toBe(join(tempHome, '.config', 'specialists', 'user.json'));
    expect(result.exists).toBe(false);
  });

  it('reports exists=true when config-home file is present', async () => {
    const cfgPath = join(tempHome, '.config', 'specialists', 'user.json');
    await mkdir(dirname(cfgPath), { recursive: true });
    await writeFile(cfgPath, JSON.stringify({}, null, 2), 'utf-8');
    const result = getGlobalUserConfigPath();
    expect(result.source).toBe('config-home');
    expect(result.exists).toBe(true);
  });

  it('falls back to legacy ~/.specialists/user.json (read-only) when only that exists', async () => {
    const legacyPath = join(tempHome, '.specialists', 'user.json');
    await mkdir(dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, JSON.stringify({}, null, 2), 'utf-8');
    const result = getGlobalUserConfigPath();
    expect(result.source).toBe('legacy');
    expect(result.path).toBe(legacyPath);
    expect(result.exists).toBe(true);
  });
});

describe('override template + schema', () => {
  it('buildSpecialistOverrideTemplate produces all override fields defaulted to inherit', () => {
    const template = buildSpecialistOverrideTemplate();
    expect(template).toEqual({
      execution: {
        model: null,
        fallback_model: null,
        timeout_ms: null,
        stall_timeout_ms: null,
        thinking_level: null,
        max_retries: null,
      },
      beads_write_notes: null,
      skills: { paths: [] },
    });
  });

  it('template validates against GlobalSpecialistOverrideSchema', () => {
    const template = buildSpecialistOverrideTemplate();
    const result = GlobalSpecialistOverrideSchema.safeParse(template);
    expect(result.success).toBe(true);
  });

  it('buildGlobalUserConfigTemplate keys every name', () => {
    const template = buildGlobalUserConfigTemplate(['executor', 'debugger', 'explorer']);
    expect(Object.keys(template).sort()).toEqual(['debugger', 'executor', 'explorer']);
    expect(template.executor.execution.model).toBeNull();
  });

  it('schema rejects unknown override fields (strict)', () => {
    const result = GlobalSpecialistOverrideSchema.safeParse({
      execution: buildSpecialistOverrideTemplate().execution,
      beads_write_notes: null,
      skills: { paths: [] },
      rogue_field: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('mergeGlobalUserConfig — idempotent merge', () => {
  const template = () => buildGlobalUserConfigTemplate(['executor', 'debugger']);

  it('seeds all specialists on first run (empty existing)', () => {
    const result = mergeGlobalUserConfig({}, template());
    expect(result.added.sort()).toEqual(['debugger', 'executor']);
    expect(result.extended).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(Object.keys(result.config).sort()).toEqual(['debugger', 'executor']);
  });

  it('preserves user-filled values on re-run', () => {
    const first = mergeGlobalUserConfig({}, template()).config;
    first.executor.execution.model = 'anthropic/claude-opus-4-6';
    first.executor.beads_write_notes = false;

    const second = mergeGlobalUserConfig(first, template());
    expect(second.extended.sort()).toEqual(['debugger', 'executor']);
    expect(second.added).toEqual([]);
    expect(second.config.executor.execution.model).toBe('anthropic/claude-opus-4-6');
    expect(second.config.executor.beads_write_notes).toBe(false);
  });

  it('fills missing override fields without clobbering existing ones', () => {
    const partial = {
      executor: {
        execution: { model: 'anthropic/claude-opus-4-6' }, // missing most fields
      },
    };
    const result = mergeGlobalUserConfig(partial, template());
    expect(result.config.executor.execution.model).toBe('anthropic/claude-opus-4-6');
    expect(result.config.executor.execution.fallback_model).toBeNull();
    expect(result.config.executor.execution.timeout_ms).toBeNull();
    expect(result.config.executor.beads_write_notes).toBeNull();
    expect(result.config.executor.skills.paths).toEqual([]);
  });

  it('keeps removed specialists in the file and flags them', () => {
    const first = mergeGlobalUserConfig({}, template()).config;
    const shrunkenTemplate = buildGlobalUserConfigTemplate(['executor']); // debugger removed
    const result = mergeGlobalUserConfig(first, shrunkenTemplate);
    expect(result.removed).toEqual(['debugger']);
    expect(result.config.debugger).toBeDefined();
  });

  it('appends newly-shipped specialists to an existing file', () => {
    const first = mergeGlobalUserConfig({}, buildGlobalUserConfigTemplate(['executor'])).config;
    const grownTemplate = buildGlobalUserConfigTemplate(['executor', 'debugger', 'explorer']);
    const result = mergeGlobalUserConfig(first, grownTemplate);
    expect(result.added.sort()).toEqual(['debugger', 'explorer']);
    expect(result.config.executor.execution.model).toBeNull();
  });
});

describe('validateGlobalUserConfig', () => {
  it('accepts a valid full config', () => {
    const valid = JSON.stringify(buildGlobalUserConfigTemplate(['executor']));
    const result = validateGlobalUserConfig(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    const result = validateGlobalUserConfig('{ not json');
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.path).toBe('json');
  });

  it('rejects wrong-typed override values', () => {
    const bad = JSON.stringify({
      executor: {
        execution: { model: 123 }, // number instead of string|null
        beads_write_notes: null,
        skills: { paths: [] },
      },
    });
    const result = validateGlobalUserConfig(bad);
    expect(result.valid).toBe(false);
  });
});

describe('init CLI — runGlobal() end-to-end', () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'sp-init-global-'));
    originalHome = process.env.HOME;
    withHome(tempHome);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    delete process.env.XDG_CONFIG_HOME;
    vi.restoreAllMocks();
    vi.resetModules();
    await rm(tempHome, { recursive: true, force: true });
  });

  it('generates ~/.config/specialists/user.json on a clean HOME', async () => {
    const { run } = await importInit();
    await run({ global: true });

    const location = getGlobalUserConfigPath();
    expect(existsSync(location.path)).toBe(true);
    expect(location.source).toBe('config-home');

    const content = await readFile(location.path, 'utf-8');
    const parsed = JSON.parse(content);
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
    expect(parsed.executor).toBeDefined();
    expect(parsed.debugger).toBeDefined();
  });

  it('seeds every specialist with the full override template', async () => {
    const { run } = await importInit();
    await run({ global: true });

    const location = getGlobalUserConfigPath();
    const parsed = JSON.parse(await readFile(location.path, 'utf-8'));
    expect(parsed.executor).toEqual(buildSpecialistOverrideTemplate());
  });

  it('produces a file that validates against the global schema', async () => {
    const { run } = await importInit();
    await run({ global: true });

    const location = getGlobalUserConfigPath();
    const content = await readFile(location.path, 'utf-8');
    expect(validateGlobalUserConfig(content).valid).toBe(true);
  });

  it('is idempotent: re-run preserves user-filled values', async () => {
    const { run } = await importInit();
    await run({ global: true });

    const location = getGlobalUserConfigPath();
    let parsed = JSON.parse(await readFile(location.path, 'utf-8'));
    parsed.executor.execution.model = 'anthropic/claude-opus-4-6';
    parsed.executor.beads_write_notes = false;
    await writeFile(location.path, JSON.stringify(parsed, null, 2), 'utf-8');

    await run({ global: true });

    parsed = JSON.parse(await readFile(location.path, 'utf-8'));
    expect(parsed.executor.execution.model).toBe('anthropic/claude-opus-4-6');
    expect(parsed.executor.beads_write_notes).toBe(false);
    // other fields still defaulted
    expect(parsed.executor.execution.timeout_ms).toBeNull();
  });
});
