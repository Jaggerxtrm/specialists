import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getProbeCanonicalPath, getProbeRunDir, runAgenticFollowthroughProbe } from '../../../src/specialist/model-probes.js';
import type { ScriptGenerateResult } from '../../../src/specialist/script-runner.js';

async function tempCache(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'specialists-probes-'));
}

function success(output: string): ScriptGenerateResult {
  return { success: true, output, meta: { specialist: 'executor', model: 'stub', duration_ms: 1, trace_id: 'trace' } };
}

function writeEvents(projectDir: string, turns: number, tools: number): void {
  mkdirSync(projectDir, { recursive: true });
  for (let index = 0; index < turns; index += 1) appendFileSync(join(projectDir, 'events.jsonl'), `${JSON.stringify({ type: 'assistant_turn', index })}\n`);
  for (let index = 0; index < tools; index += 1) appendFileSync(join(projectDir, 'events.jsonl'), `${JSON.stringify({ type: 'tool_use', index })}\n`);
}

describe('runAgenticFollowthroughProbe', () => {
  it('classifies pass from stable metrics', async () => {
    const cacheDir = await tempCache();
    const output = 'evidence '.repeat(80);

    const result = await runAgenticFollowthroughProbe('provider/model', 'executor', {
      cacheDir,
      runSpecialist: async (_input, options) => {
        writeEvents(options.projectDir ?? cacheDir, 5, 3);
        return success(output);
      },
    });

    expect(result.verdict).toBe('PASS');
    expect(result.metrics).toMatchObject({ turns_used: 5, tools_used: 3, files_outside_scope_touched: 0, premature_agent_end: false });
    expect(result.transcript_path).toContain(cacheDir);
  });

  it.skipIf(process.platform === 'win32')('creates probe artifacts with user-only permissions', async () => {
    const cacheDir = await tempCache();

    const result = await runAgenticFollowthroughProbe('secure-model', 'executor', {
      cacheDir,
      runSpecialist: async (_input, options) => {
        writeEvents(options.projectDir ?? cacheDir, 5, 3);
        return success('evidence '.repeat(80));
      },
    });
    const probeDir = dirname(result.transcript_path);

    expect(statSync(probeDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(probeDir, 'probe-notes.md')).mode & 0o777).toBe(0o600);
  });

  it.skipIf(process.platform === 'win32')('writes canonical probe summary with user-only permissions', async () => {
    const cacheDir = await tempCache();
    const canonicalPath = getProbeCanonicalPath('provider/model', 'executor spec', cacheDir);

    await runAgenticFollowthroughProbe('provider/model', 'executor spec', {
      cacheDir,
      runSpecialist: async (_input, options) => {
        writeEvents(options.projectDir ?? cacheDir, 5, 3);
        return success('evidence '.repeat(80));
      },
    });

    expect(canonicalPath).toMatch(/provider-model-executor-spec-[a-f0-9]{12}\.json$/u);
    expect(existsSync(canonicalPath)).toBe(true);
    expect(statSync(canonicalPath).mode & 0o777).toBe(0o600);
  });

  it('classifies fail on premature agent_end or tiny output', async () => {
    const cacheDir = await tempCache();

    const result = await runAgenticFollowthroughProbe('minimax-m3', 'executor', {
      cacheDir,
      runSpecialist: async (_input, options) => {
        const projectDir = options.projectDir ?? cacheDir;
        writeEvents(projectDir, 5, 3);
        appendFileSync(join(projectDir, 'events.jsonl'), `${JSON.stringify({ type: 'agent_end' })}\n`);
        return success('pivot announced without final evidence');
      },
    });

    expect(result.verdict).toBe('FAIL');
    expect(result.metrics.premature_agent_end).toBe(true);
  });

  it('classifies partial when only pass thresholds miss', async () => {
    const cacheDir = await tempCache();

    const result = await runAgenticFollowthroughProbe('model', 'executor', {
      cacheDir,
      runSpecialist: async (_input, options) => {
        writeEvents(options.projectDir ?? cacheDir, 4, 2);
        return success('x'.repeat(300));
      },
    });

    expect(result.verdict).toBe('PARTIAL');
  });

  it('counts nested files outside scope and prevents pass verdict', async () => {
    const cacheDir = await tempCache();

    const result = await runAgenticFollowthroughProbe('scope-leaker', 'executor', {
      cacheDir,
      runSpecialist: async (_input, options) => {
        const projectDir = options.projectDir ?? cacheDir;
        writeEvents(projectDir, 5, 3);
        mkdirSync(join(projectDir, 'nested', 'deeper'), { recursive: true });
        writeFileSync(join(projectDir, 'nested', 'deeper', 'outside-scope.md'), 'leaked');
        return success('evidence '.repeat(80));
      },
    });

    expect(result.metrics.files_outside_scope_touched).toBe(1);
    expect(result.verdict).toBe('PARTIAL');
  });

  it('classifies exact threshold boundaries', async () => {
    const cacheDir = await tempCache();
    const cases = [
      { model: 'pass-boundary', turns: 5, tools: 3, output: 'x'.repeat(500), verdict: 'PASS' },
      { model: 'partial-boundary', turns: 3, tools: 2, output: 'x'.repeat(200), verdict: 'PARTIAL' },
      { model: 'fail-boundary', turns: 2, tools: 2, output: 'x'.repeat(500), verdict: 'FAIL' },
    ] as const;

    for (const testCase of cases) {
      const result = await runAgenticFollowthroughProbe(testCase.model, 'executor', {
        cacheDir,
        runSpecialist: async (_input, options) => {
          writeEvents(options.projectDir ?? cacheDir, testCase.turns, testCase.tools);
          return success(testCase.output);
        },
      });

      expect(result.verdict).toBe(testCase.verdict);
    }
  });

  it('fails on premature_agent_end event type', async () => {
    const cacheDir = await tempCache();

    const result = await runAgenticFollowthroughProbe('premature-end', 'executor', {
      cacheDir,
      runSpecialist: async (_input, options) => {
        const projectDir = options.projectDir ?? cacheDir;
        writeEvents(projectDir, 5, 3);
        appendFileSync(join(projectDir, 'events.jsonl'), `${JSON.stringify({ type: 'premature_agent_end' })}\n`);
        return success('evidence '.repeat(80));
      },
    });

    expect(result.metrics.premature_agent_end).toBe(true);
    expect(result.verdict).toBe('FAIL');
  });

  it('rejects when specialist run exceeds hard timeout window', async () => {
    vi.useFakeTimers();
    try {
      const cacheDir = await tempCache();
      const probePromise = runAgenticFollowthroughProbe('slow-model', 'executor', {
        cacheDir,
        timeoutMs: 1_000,
        runSpecialist: async () => await new Promise<ScriptGenerateResult>(() => undefined),
      });
      const rejection = expect(probePromise).rejects.toThrow('probe timed out after 1000ms');

      await vi.advanceTimersByTimeAsync(1_000);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses deterministic probe parent id for same model and spec', () => {
    const cacheDir = '/tmp/probe-cache';
    const first = getProbeRunDir('a/b', 'executor', cacheDir).split('/').slice(0, -1).join('/');
    const second = getProbeRunDir('a/b', 'executor', cacheDir).split('/').slice(0, -1).join('/');

    expect(first).toBe(second);
  });
});
