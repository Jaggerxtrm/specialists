import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
}));

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

  beforeEach(() => {
    vi.resetModules();
    tempDir = mkdtempSync(join(tmpdir(), 'setup-cli-'));
    stdout = [];
    process.env = { ...originalEnv, HOME: tempDir, XDG_CONFIG_HOME: join(tempDir, '.config') };
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      stdout.push(String(value ?? ''));
    });
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      return {
        ...actual,
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: [
            'provider model context maxOut thinking images',
            'openai gpt-4.1-mini 128k 8k yes no',
            'anthropic claude-sonnet-4-6 200k 8k yes no',
          ].join('\n'),
        })),
      };
    });
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

  it('apply dry-run prints planned writes without touching user.json', async () => {
    const userConfigDir = join(tempDir, '.config', 'specialists');
    mkdirSync(userConfigDir, { recursive: true });
    const userConfigPath = join(userConfigDir, 'user.json');
    const initial = '{\n  "executor": {\n    "execution": {\n      "model": "openai/gpt-4.1-mini",\n      "fallback_model": null,\n      "fallback_models": null,\n      "timeout_ms": null,\n      "stall_timeout_ms": null,\n      "thinking_level": null,\n      "max_retries": null,\n      "prompt_limit_bytes": null,\n      "stdout_limit_bytes": null,\n      "extensions": {\n        "serena": null,\n        "gitnexus": null\n      }\n    },\n    "prompt": {\n      "system_prompt_mode": null\n    },\n    "beads_write_notes": null,\n    "notes_mode": null,\n    "output_file": null,\n    "skills": {\n      "paths": []\n    }\n  }\n}\n';
    writeFileSync(userConfigPath, initial, 'utf8');
    const before = statSync(userConfigPath);

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

    const { run } = await import('../../../src/cli/setup.js');
    await run(['--apply', planPath, '--dry-run']);

    expect(stdout.join('\n')).toContain('anthropic/claude-sonnet-4-6');
    expect(readFileSync(userConfigPath, 'utf8')).toBe(initial);
    expect(statSync(userConfigPath).mtimeMs).toBe(before.mtimeMs);
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
