// NOTE: Live --probe-only validation deferred to Phase C (unitAI-oeysi probe suite live smoke).
// Contract validation requires upstream pi model API access not available in unit/CI scope.

import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SpawnCall = { command: string; args: string[] };

const state = vi.hoisted(() => ({
  specialists: [
    { name: 'executor', model: 'openai/gpt-4.1-mini', permission_required: 'MEDIUM', source: 'user' },
  ],
  warnings: [
    { specialist: 'executor', field: 'metadata.name', source: 'global', severity: 'strip' },
  ],
  benchmark: {
    source: 'artificialanalysis',
    source_url: 'https://example.test/benchmarks',
    fetched_at: '2026-06-16T12:00:00.000Z',
    models: new Map([
      ['openai/gpt-4.1-mini', { id: 'openai/gpt-4.1-mini', provider: 'openai', quality_score: 80, cost_input: 1 }],
      ['anthropic/claude-sonnet-4-6', { id: 'anthropic/claude-sonnet-4-6', provider: 'anthropic', quality_score: 95, cost_input: 2 }],
    ]),
  },
  probeResult: {
    verdict: 'PASS',
    metrics: { turns_used: 6, tools_used: 4, output_length: 900, files_outside_scope_touched: 0, premature_agent_end: false },
    sample_output: 'done',
    transcript_path: '/tmp/probe/events.jsonl',
  },
  spawnCalls: [] as SpawnCall[],
  spawnImpl: ((command: string, args: string[]) => ({ status: 0, stdout: '', stderr: '', error: undefined }) as any),
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawnSync: vi.fn((command: string, args: string[]) => {
      state.spawnCalls.push({ command, args });
      return state.spawnImpl(command, args);
    }),
  };
});

vi.mock('../../../src/specialist/loader.js', () => ({
  SpecialistLoader: class {
    async list() {
      return state.specialists;
    }
    getBlockedFieldWarnings() {
      return state.warnings;
    }
  },
}));

vi.mock('../../../src/specialist/benchmarks.js', () => ({
  BENCHMARK_TTL_MS: 86_400_000,
  loadBenchmarkSnapshot: vi.fn(async () => state.benchmark),
}));

vi.mock('../../../src/specialist/model-probes.js', () => ({
  runAgenticFollowthroughProbe: vi.fn(async () => state.probeResult),
}));

describe('setup CLI', () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    vi.resetModules();
    tempDir = mkdtempSync(join(tmpdir(), 'setup-cli-'));
    stdout = [];
    stderr = [];
    state.spawnCalls = [];
    process.env = { ...originalEnv, HOME: tempDir, XDG_CONFIG_HOME: join(tempDir, '.config') };
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      stdout.push(String(value ?? ''));
    });
    vi.spyOn(console, 'error').mockImplementation((value?: unknown) => {
      stderr.push(String(value ?? ''));
    });
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    state.spawnImpl = (command: string, args: string[]) => {
      if (command === 'pi' && args[0] === '--list-models') {
        return {
          status: 0,
          stdout: [
            'provider model context maxOut thinking images',
            'openai gpt-4.1-mini 128k 8k yes no',
            'anthropic claude-sonnet-4-6 200k 8k yes no',
          ].join('\n'),
          stderr: '',
          error: undefined,
        };
      }
      return { status: 0, stdout: '', stderr: '', error: undefined };
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('emits discovery JSON state', async () => {
    const { run } = await import('../../../src/cli/setup.js');
    await run(['--discovery', '--json']);

    const payload = JSON.parse(stdout.join('\n'));
    expect(payload.models).toHaveLength(2);
    expect(payload.registry).toEqual([
      {
        name: 'executor',
        model: 'openai/gpt-4.1-mini',
        permission_required: 'MEDIUM',
        source: 'user',
      },
    ]);
    expect(payload.missing_configs.global_user_config).toBe(true);
    expect(payload.blocked_field_warnings[0]).toMatchObject({ specialist: 'executor', field: 'metadata.name' });
  });

  it('apply dry-run does get pre-checks, skips set calls, emits JSON summary, leaves user.json untouched', async () => {
    const userConfigDir = join(tempDir, '.config', 'specialists');
    mkdirSync(userConfigDir, { recursive: true });
    const userConfigPath = join(userConfigDir, 'user.json');
    const initialUserConfig = '{\n  "executor": {\n    "execution": {\n      "model": "openai/gpt-4.1-mini"\n    }\n  }\n}\n';
    writeFileSync(userConfigPath, initialUserConfig, 'utf8');
    const beforeContent = readFileSync(userConfigPath, 'utf8');
    const beforeMtimeMs = statSync(userConfigPath).mtimeMs;

    const planPath = join(tempDir, 'plan.json');
    writeFileSync(planPath, JSON.stringify({
      version: '3.0',
      generated_at: '2026-06-16T12:00:00.000Z',
      preset: 'balanced',
      inputs: {},
      writes: [{
        specialist: 'executor',
        path: 'execution.model',
        value: 'anthropic/claude-sonnet-4-6',
        reason: 'upgrade',
      }],
      benchmark: {
        source: state.benchmark.source,
        source_url: state.benchmark.source_url,
        fetched_at: state.benchmark.fetched_at,
      },
    }, null, 2));

    state.spawnImpl = (command: string, args: string[]) => {
      if (command === 'sp' && args[0] === 'edit' && args[2] === '--get') {
        return { status: 0, stdout: 'openai/gpt-4.1-mini\n', stderr: '', error: undefined };
      }
      if (command === 'pi' && args[0] === '--list-models') {
        return {
          status: 0,
          stdout: 'provider model context maxOut thinking images',
          stderr: '',
          error: undefined,
        };
      }
      return { status: 0, stdout: '', stderr: '', error: undefined };
    };

    const { run } = await import('../../../src/cli/setup.js');
    await run(['--apply', planPath, '--dry-run', '--json']);

    const afterContent = readFileSync(userConfigPath, 'utf8');
    const afterMtimeMs = statSync(userConfigPath).mtimeMs;
    const payload = JSON.parse(stdout.join('\n'));
    expect(payload).toMatchObject({
      dry_run: true,
      applied: 0,
      skipped_idempotent: 0,
    });
    expect(state.spawnCalls.filter((call) => call.command === 'sp' && call.args[2] === '--get')).toHaveLength(1);
    expect(state.spawnCalls.filter((call) => call.command === 'sp' && call.args[2] === '--set')).toHaveLength(0);
    expect(afterContent).toBe(beforeContent);
    expect(afterContent).toBe(initialUserConfig);
    expect(afterMtimeMs).toBe(beforeMtimeMs);
  });

  it('applies plan idempotently when current values already match', async () => {
    const planPath = join(tempDir, 'plan.json');
    writeFileSync(planPath, JSON.stringify({
      version: '3.0',
      generated_at: '2026-06-16T12:00:00.000Z',
      preset: 'balanced',
      inputs: {},
      writes: [
        { specialist: 'alpha', path: 'execution.model', value: 'same-model-1', reason: 'upgrade' },
        { specialist: 'beta', path: 'execution.model', value: 'same-model-2', reason: 'upgrade' },
      ],
      benchmark: {
        source: state.benchmark.source,
        source_url: state.benchmark.source_url,
        fetched_at: state.benchmark.fetched_at,
      },
    }, null, 2));

    state.spawnImpl = (command: string, args: string[]) => {
      if (command === 'sp' && args[0] === 'edit' && args[2] === '--get') {
        const key = args[3] ?? '';
        return { status: 0, stdout: `${key === 'alpha.execution.model' ? 'same-model-1' : 'same-model-2'}\n`, stderr: '', error: undefined };
      }
      return { status: 0, stdout: '', stderr: '', error: undefined };
    };

    const { run } = await import('../../../src/cli/setup.js');
    await run(['--apply', planPath, '--json']);

    const payload = JSON.parse(stdout.join('\n'));
    expect(payload).toMatchObject({
      dry_run: false,
      applied: 0,
      skipped_idempotent: 2,
    });
    expect(state.spawnCalls.filter((call) => call.command === 'sp' && call.args[2] === '--set')).toHaveLength(0);
  });

  it('apply rolls back earlier writes when second set fails', async () => {
    const planPath = join(tempDir, 'plan.json');
    writeFileSync(planPath, JSON.stringify({
      version: '3.0',
      generated_at: '2026-06-16T12:00:00.000Z',
      preset: 'balanced',
      inputs: {},
      writes: [
        { specialist: 'alpha', path: 'execution.model', value: 'model-new-1', reason: 'upgrade' },
        { specialist: 'beta', path: 'execution.model', value: 'model-new-2', reason: 'upgrade' },
        { specialist: 'gamma', path: 'execution.model', value: 'model-new-3', reason: 'upgrade' },
      ],
      benchmark: {
        source: state.benchmark.source,
        source_url: state.benchmark.source_url,
        fetched_at: state.benchmark.fetched_at,
      },
    }, null, 2));

    const previousValues = new Map([
      ['alpha.execution.model', 'model-old-1'],
      ['beta.execution.model', 'model-old-2'],
      ['gamma.execution.model', 'model-old-3'],
    ]);

    state.spawnImpl = (command: string, args: string[]) => {
      if (command === 'sp' && args[0] === 'edit' && args[2] === '--get') {
        return { status: 0, stdout: `${previousValues.get(args[3]!) ?? ''}\n`, stderr: '', error: undefined };
      }
      if (command === 'sp' && args[0] === 'edit' && args[2] === '--set') {
        if (args[3] === 'alpha.execution.model' && args[4] === 'model-new-1') {
          return { status: 0, stdout: '', stderr: '', error: undefined };
        }
        if (args[3] === 'beta.execution.model' && args[4] === 'model-new-2') {
          return { status: 1, stdout: '', stderr: 'set failed', error: undefined };
        }
        if (args[3] === 'alpha.execution.model' && args[4] === 'model-old-1') {
          return { status: 0, stdout: '', stderr: '', error: undefined };
        }
        return { status: 0, stdout: '', stderr: '', error: undefined };
      }
      return { status: 0, stdout: '', stderr: '', error: undefined };
    };

    const { run } = await import('../../../src/cli/setup.js');
    await expect(run(['--apply', planPath, '--json'])).rejects.toThrow('Failed to apply beta.execution.model');

    expect(state.spawnCalls.filter((call) => call.command === 'sp' && call.args[2] === '--get')).toHaveLength(3);
    expect(state.spawnCalls.filter((call) => call.command === 'sp' && call.args[2] === '--set')).toEqual([
      { command: 'sp', args: ['edit', '--global', '--set', 'alpha.execution.model', 'model-new-1'] },
      { command: 'sp', args: ['edit', '--global', '--set', 'beta.execution.model', 'model-new-2'] },
      { command: 'sp', args: ['edit', '--global', '--set', 'alpha.execution.model', 'model-old-1'] },
    ]);
  });

  it('probe-only emits probe contract result', async () => {
    const { run } = await import('../../../src/cli/setup.js');
    await run(['--probe-only', 'nano-gpt/moonshotai/kimi-k2.5', 'service-skills-sync', '--json']);

    const payload = JSON.parse(stdout.join('\n'));
    expect(payload).toMatchObject({
      verdict: 'PASS',
      metrics: { turns_used: 6, tools_used: 4, output_length: 900 },
      transcript_path: '/tmp/probe/events.jsonl',
    });
  });
});
