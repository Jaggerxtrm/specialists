// tests/unit/tools/specialist/start_specialist.tool.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
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
    expect(result.warning).toContain('[DEPRECATED]');
    expect(result.warning).toContain('--background');

    const statusPath = join(tempDir, '.specialists', 'jobs', result.job_id, 'status.json');
    const eventsPath = join(tempDir, '.specialists', 'jobs', result.job_id, 'events.jsonl');

    expect(existsSync(statusPath)).toBe(true);
    expect(existsSync(eventsPath)).toBe(true);

    const status = JSON.parse(readFileSync(statusPath, 'utf-8'));
    expect(status.id).toBe(result.job_id);
    expect(status.specialist).toBe('code-review');
  });

  it('applies execution.interactive default as keepAlive=true', async () => {
    mkdirSync(join(tempDir, '.specialists', 'default', 'specialists'), { recursive: true });
    writeFileSync(
      join(tempDir, '.specialists', 'default', 'specialists', 'architect.specialist.yaml'),
      `specialist:\n  metadata:\n    name: architect\n    version: 1.0.0\n    description: test\n    category: test\n  execution:\n    model: anthropic/claude-sonnet-4-6\n    interactive: true\n  prompt:\n    task_template: \"$prompt\"\n`,
      'utf-8',
    );

    const runner = makeMockRunner();
    const tool = createStartSpecialistTool(runner);

    await tool.execute({ name: 'architect', prompt: 'design system' });

    expect(runner.run).toHaveBeenCalledTimes(1);
    const [runOptions] = runner.run.mock.calls[0];
    expect(runOptions.keepAlive).toBe(true);
  });

  it('allows no_keep_alive override for interactive specialists', async () => {
    mkdirSync(join(tempDir, '.specialists', 'default', 'specialists'), { recursive: true });
    writeFileSync(
      join(tempDir, '.specialists', 'default', 'specialists', 'architect.specialist.yaml'),
      `specialist:\n  metadata:\n    name: architect\n    version: 1.0.0\n    description: test\n    category: test\n  execution:\n    model: anthropic/claude-sonnet-4-6\n    interactive: true\n  prompt:\n    task_template: "$prompt"\n`,
      'utf-8',
    );

    const runner = makeMockRunner();
    const tool = createStartSpecialistTool(runner);

    await tool.execute({
      name: 'architect',
      prompt: 'design system',
      no_keep_alive: true,
    });

    expect(runner.run).toHaveBeenCalledTimes(1);
    const [runOptions] = runner.run.mock.calls[0];
    expect(runOptions.keepAlive).toBe(false);
    expect(runOptions.noKeepAlive).toBe(true);
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

  it('writes READ_ONLY --bead output back to bead notes when beads client is provided', async () => {
    const runner = {
      run: vi.fn(async (_options, _onProgress, _onEvent, onMeta) => {
        onMeta?.({ backend: 'anthropic', model: 'claude-haiku-4-5' });
        return {
          output: 'readonly finding',
          backend: 'anthropic',
          model: 'claude-haiku-4-5',
          durationMs: 10,
          specialistVersion: '1.0.0',
          promptHash: 'hash',
          beadId: undefined,
          permissionRequired: 'READ_ONLY',
        };
      }),
    } as any;
    const beadsClient = { updateBeadNotes: vi.fn(), closeBead: vi.fn() } as any;
    const tool = createStartSpecialistTool(runner, beadsClient);

    await tool.execute({ name: 'explorer', prompt: 'inspect', bead_id: 'unitAI-ro-1' });

    expect(beadsClient.updateBeadNotes).toHaveBeenCalledWith(
      'unitAI-ro-1',
      expect.stringContaining('readonly finding'),
    );
    expect(beadsClient.closeBead).not.toHaveBeenCalled();
  });
});
