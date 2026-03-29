import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
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

  it('--background exits 1 when specialist does not exist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-bg-'));

    const result = runCli(['run', 'nonexistent-specialist', '--prompt', 'hello', '--background'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Error:/);
  });

  it('--background exits 1 before detaching when specialist YAML is invalid', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-int-run-bg-invalid-'));
    await mkdir(join(tempDir, '.specialists'), { recursive: true });
    await mkdir(join(tempDir, 'specialists'), { recursive: true });
    // Write an invalid YAML (missing required fields)
    await writeFile(join(tempDir, 'specialists', 'bad-spec.yaml'), 'not: valid: specialist: yaml\n');

    const result = runCli(['run', 'bad-spec', '--prompt', 'hello', '--background'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Error:/i);
    // stdout must be empty — no partial job id printed
    expect(result.stdout.trim()).toBe('');
  });
});

// ── poll_specialist removal (z0mq.8) ─────────────────────────────────────────
describe('z0mq.8: poll_specialist removal', () => {
  const repoSrc = resolve(import.meta.dirname, '../../..', 'src');

  it('poll_specialist is not referenced in any source file', async () => {
    const result = spawnSync('grep', ['-r', 'poll_specialist', repoSrc], { encoding: 'utf-8' });
    // grep exits 1 when no matches found — that is the expected outcome
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('start_specialist tool description mentions feed_specialist not poll_specialist', async () => {
    const toolSrc = await readFile(
      resolve(repoSrc, 'tools/specialist/start_specialist.tool.ts'),
      'utf-8',
    );
    expect(toolSrc).toContain('feed_specialist');
    expect(toolSrc).not.toContain('poll_specialist');
  });
});
