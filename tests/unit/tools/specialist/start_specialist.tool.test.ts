// tests/unit/tools/specialist/start_specialist.tool.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStartSpecialistTool } from '../../../../src/tools/specialist/start_specialist.tool.js';

function makeMockRunner() {
  return {
    run: vi.fn(async (_options, _onProgress, _onEvent, onMeta) => {
      onMeta?.({ backend: 'anthropic', model: 'claude-sonnet-4-6' });
      return {
        output: 'done',
        backend: 'anthropic',
        model: 'claude-sonnet-4-6',
        durationMs: 10,
        specialistVersion: '1.0.0',
        promptHash: 'hash',
      };
    }),
  } as any;
}

describe('start_specialist tool', () => {
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specialists-start-tool-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns a Supervisor-backed job_id and persists status/events artifacts', async () => {
    const runner = makeMockRunner();
    const tool = createStartSpecialistTool(runner);

    const result = await tool.execute({ name: 'code-review', prompt: 'review this' }) as any;

    expect(result.job_id).toMatch(/^[a-f0-9]{6}$/);

    const statusPath = join(tempDir, '.specialists', 'jobs', result.job_id, 'status.json');
    const eventsPath = join(tempDir, '.specialists', 'jobs', result.job_id, 'events.jsonl');

    expect(existsSync(statusPath)).toBe(true);
    expect(existsSync(eventsPath)).toBe(true);

    const status = JSON.parse(readFileSync(statusPath, 'utf-8'));
    expect(status.id).toBe(result.job_id);
    expect(status.specialist).toBe('code-review');
  });

  it('forwards run options to Supervisor (name, prompt, variables, backend_override, bead_id)', async () => {
    const runner = makeMockRunner();
    const tool = createStartSpecialistTool(runner);

    await tool.execute({
      name: 'architect',
      prompt: 'design system',
      variables: { context: 'microservices' },
      backend_override: 'anthropic',
      bead_id: 'unitAI-ext-42',
    });

    expect(runner.run).toHaveBeenCalledTimes(1);
    const [runOptions] = runner.run.mock.calls[0];
    expect(runOptions).toEqual(expect.objectContaining({
      name: 'architect',
      prompt: 'design system',
      variables: { context: 'microservices' },
      backendOverride: 'anthropic',
      inputBeadId: 'unitAI-ext-42',
    }));
  });
});
