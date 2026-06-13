// tests/unit/cli/edit-global.test.ts
// Covers `sp edit --global` (src/cli/edit.ts runGlobalEdit): --get, --set,
// $EDITOR flow, mutual exclusion with --scope.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { getGlobalUserConfigPath } from '../../../src/specialist/global-config.js';

async function importEdit() {
  return import('../../../src/cli/edit.js');
}

async function seedGlobalConfig(home: string, overrides: Record<string, unknown> = {}): Promise<string> {
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
  const location = getGlobalUserConfigPath();
  const base = {
    executor: {
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
    },
  };
  await mkdir(dirname(location.path), { recursive: true });
  await writeFile(location.path, JSON.stringify({ ...base, ...overrides }, null, 2), 'utf-8');
  return location.path;
}

describe('edit CLI — --global --get / --set', () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'sp-edit-global-'));
    originalHome = process.env.HOME;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    delete process.env.XDG_CONFIG_HOME;
    vi.restoreAllMocks();
    vi.resetModules();
    await rm(tempHome, { recursive: true, force: true });
  });

  it('--get reads a string override', async () => {
    const cfgPath = await seedGlobalConfig(tempHome, {
      executor: {
        execution: {
          model: 'anthropic/claude-opus-4-6',
          fallback_model: null,
          timeout_ms: null,
          stall_timeout_ms: null,
          thinking_level: null,
          max_retries: null,
        },
        beads_write_notes: null,
        skills: { paths: [] },
      },
    });
    process.argv = ['node', 'sp', 'edit', '--global', '--get', 'executor.execution.model'];
    const { run } = await importEdit();
    await run();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('anthropic/claude-opus-4-6'));
  });

  it('--get reports null (inherit) for unset fields', async () => {
    await seedGlobalConfig(tempHome);
    process.argv = ['node', 'sp', 'edit', '--global', '--get', 'executor.execution.model'];
    const { run } = await importEdit();
    await run();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('null'));
  });

  it('--set writes a string value', async () => {
    await seedGlobalConfig(tempHome);
    process.argv = ['node', 'sp', 'edit', '--global', '--set', 'executor.execution.model', 'anthropic/claude-opus-4-6'];
    const { run } = await importEdit();
    await run();

    const parsed = JSON.parse(await readFile(getGlobalUserConfigPath().path, 'utf-8'));
    expect(parsed.executor.execution.model).toBe('anthropic/claude-opus-4-6');
  });

  it('--set coerces numeric values', async () => {
    await seedGlobalConfig(tempHome);
    process.argv = ['node', 'sp', 'edit', '--global', '--set', 'executor.execution.timeout_ms', '30000'];
    const { run } = await importEdit();
    await run();

    const parsed = JSON.parse(await readFile(getGlobalUserConfigPath().path, 'utf-8'));
    expect(parsed.executor.execution.timeout_ms).toBe(30000);
  });

  it('--set coerces boolean values', async () => {
    await seedGlobalConfig(tempHome);
    process.argv = ['node', 'sp', 'edit', '--global', '--set', 'executor.beads_write_notes', 'false'];
    const { run } = await importEdit();
    await run();

    const parsed = JSON.parse(await readFile(getGlobalUserConfigPath().path, 'utf-8'));
    expect(parsed.executor.beads_write_notes).toBe(false);
  });

  it('--set null clears a field back to inherit', async () => {
    const cfgPath = await seedGlobalConfig(tempHome, {
      executor: {
        execution: {
          model: 'anthropic/claude-opus-4-6',
          fallback_model: null,
          timeout_ms: null,
          stall_timeout_ms: null,
          thinking_level: null,
          max_retries: null,
        },
        beads_write_notes: null,
        skills: { paths: [] },
      },
    });
    process.argv = ['node', 'sp', 'edit', '--global', '--set', 'executor.execution.model', 'null'];
    const { run } = await importEdit();
    await run();

    const parsed = JSON.parse(await readFile(getGlobalUserConfigPath().path, 'utf-8'));
    expect(parsed.executor.execution.model).toBeNull();
  });

  it('--set validates enum fields', async () => {
    await seedGlobalConfig(tempHome);
    process.argv = ['node', 'sp', 'edit', '--global', '--set', 'executor.execution.thinking_level', 'banana'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
      throw new Error(`exit:${code}`);
    });
    const { run } = await importEdit();
    await expect(run()).rejects.toThrow('exit:1');
    exitSpy.mockRestore();
  });

  it('--set appends to skills.paths via JSON array', async () => {
    await seedGlobalConfig(tempHome);
    process.argv = ['node', 'sp', 'edit', '--global', '--set', 'executor.skills.paths', '["a","b"]'];
    const { run } = await importEdit();
    await run();

    const parsed = JSON.parse(await readFile(getGlobalUserConfigPath().path, 'utf-8'));
    expect(parsed.executor.skills.paths).toEqual(['a', 'b']);
  });

  it('--get on unknown specialist fails', async () => {
    await seedGlobalConfig(tempHome);
    process.argv = ['node', 'sp', 'edit', '--global', '--get', 'nope.execution.model'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
      throw new Error(`exit:${code}`);
    });
    const { run } = await importEdit();
    await expect(run()).rejects.toThrow('exit:1');
    exitSpy.mockRestore();
  });

  it('--get on invalid field path fails', async () => {
    await seedGlobalConfig(tempHome);
    process.argv = ['node', 'sp', 'edit', '--global', '--get', 'executor.bogus.field'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
      throw new Error(`exit:${code}`);
    });
    const { run } = await importEdit();
    await expect(run()).rejects.toThrow('exit:1');
    exitSpy.mockRestore();
  });

  it('fails when global config does not exist', async () => {
    process.env.HOME = tempHome;
    delete process.env.XDG_CONFIG_HOME;
    process.argv = ['node', 'sp', 'edit', '--global', '--get', 'executor.execution.model'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
      throw new Error(`exit:${code}`);
    });
    const { run } = await importEdit();
    await expect(run()).rejects.toThrow('exit:1');
    exitSpy.mockRestore();
  });
});

describe('edit CLI — --global + --scope rejection (run path)', () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'sp-edit-global-mutex-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
    delete process.env.XDG_CONFIG_HOME;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    delete process.env.XDG_CONFIG_HOME;
    vi.restoreAllMocks();
    vi.resetModules();
    await rm(tempHome, { recursive: true, force: true });
  });

  it('parseArgs rejects --global before --scope (order: global first)', async () => {
    process.argv = ['node', 'sp', 'edit', '--global', '--scope', 'user'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
      throw new Error(`exit:${code}`);
    });
    const { run } = await importEdit();
    await expect(run()).rejects.toThrow('exit:1');
    exitSpy.mockRestore();
  });

  it('parseArgs rejects --scope before --global (order: scope first)', async () => {
    process.argv = ['node', 'sp', 'edit', '--scope', 'user', '--global'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
      throw new Error(`exit:${code}`);
    });
    const { run } = await importEdit();
    await expect(run()).rejects.toThrow('exit:1');
    exitSpy.mockRestore();
  });
});
