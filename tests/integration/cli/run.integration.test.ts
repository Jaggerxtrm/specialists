import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../../..');

function runCli(args: string[], cwd: string) {
  return spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('integration: specialists run', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('rejects using --prompt and --bead together through the real CLI boundary', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-'));

    const result = runCli(['run', 'code-review', '--prompt', 'hello', '--bead', 'unitAI-55d'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error: use either --prompt or --bead, not both.');
  });

  it('rejects missing prompt, stdin, and bead through the real CLI boundary', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-'));

    const result = runCli(['run', 'code-review'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error: provide --prompt, pipe stdin, or use --bead <id>.');
  });

  it('fails early when bead lookup cannot be resolved before any pi session starts', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-'));
    await mkdir(join(tempDir, '.specialists'), { recursive: true });
    await mkdir(join(tempDir, 'specialists'), { recursive: true });
    await writeFile(join(tempDir, 'specialists', 'code-review.yaml'), [
      'specialist:',
      '  metadata:',
      '    name: code-review',
      '    version: 1.0.0',
      '    description: test specialist',
      '  execution:',
      '    model: gemini',
      '    timeout_ms: 1000',
      '    permission_required: READ_ONLY',
      '  prompt:',
      '    task_template: "Do $prompt"',
    ].join('\n'));

    const result = runCli(['run', 'code-review', '--bead', 'unitAI-missing'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unable to read bead 'unitAI-missing' via bd show --json");
  });
});
