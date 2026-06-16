import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getProbeRunDir, runAgenticFollowthroughProbe } from '../../../src/specialist/model-probes.js';
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

  it('counts files outside scope and prevents pass verdict', async () => {
    const cacheDir = await tempCache();

    const result = await runAgenticFollowthroughProbe('scope-leaker', 'executor', {
      cacheDir,
      runSpecialist: async (_input, options) => {
        const projectDir = options.projectDir ?? cacheDir;
        writeEvents(projectDir, 5, 3);
        writeFileSync(join(projectDir, 'outside-scope.md'), 'leaked');
        return success('evidence '.repeat(80));
      },
    });

    expect(result.metrics.files_outside_scope_touched).toBeGreaterThan(0);
    expect(result.verdict).toBe('PARTIAL');
  });

  it('uses deterministic probe parent id for same model and spec', () => {
    const cacheDir = '/tmp/probe-cache';
    const first = getProbeRunDir('a/b', 'executor', cacheDir).split('/').slice(0, -1).join('/');
    const second = getProbeRunDir('a/b', 'executor', cacheDir).split('/').slice(0, -1).join('/');

    expect(first).toBe(second);
  });
});
