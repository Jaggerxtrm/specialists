import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../../..');
const runLive = process.env.SPECIALISTS_LIVE_SMOKE === '1';
const liveModel = process.env.SPECIALISTS_LIVE_SMOKE_MODEL;

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    env: { ...env, NO_COLOR: '1' },
  });
}

describe('live smoke: notes_mode final-only bead notes', () => {
  let tempHome = '';
  let beadId = '';

  afterEach(async () => {
    if (beadId) run('bd', ['close', beadId, '--reason=phase-1 smoke complete'], repoRoot, { ...process.env, HOME: tempHome });
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
  });

  it.skipIf(!runLive)('writes exactly one FINAL handoff block with global notes_mode override', async () => {
    expect(liveModel).toBeTruthy();
    tempHome = await mkdtemp(join(tmpdir(), 'specialists-live-notes-'));
    await mkdir(join(tempHome, '.config', 'specialists'), { recursive: true });
    await writeFile(
      join(tempHome, '.config', 'specialists', 'user.json'),
      JSON.stringify({
        executor: {
          execution: {
            model: liveModel,
            fallback_model: null,
            fallback_models: null,
            timeout_ms: null,
            stall_timeout_ms: null,
            thinking_level: null,
            max_retries: null,
            prompt_limit_bytes: null,
            stdout_limit_bytes: null,
            extensions: { serena: null, gitnexus: null },
          },
          prompt: { system_prompt_mode: null },
          beads_write_notes: null,
          notes_mode: 'final-only',
          output_file: null,
          skills: { paths: [] },
        },
      }),
    );

    const create = run('bd', ['create', '--title=phase-1 smoke', '--type=task'], repoRoot, { ...process.env, HOME: tempHome });
    expect(create.status).toBe(0);
    beadId = create.stdout.trim().split(/\s+/).at(-1) ?? '';
    expect(beadId).toMatch(/^unitAI-/);

    expect(run('bd', ['update', beadId, '--claim'], repoRoot, { ...process.env, HOME: tempHome }).status).toBe(0);

    const smoke = run('bun', ['run', join(repoRoot, 'src/index.ts'), 'run', 'executor', '--bead', beadId], repoRoot, { ...process.env, HOME: tempHome });
    expect(smoke.status).toBe(0);

    const show = run('bd', ['show', beadId], repoRoot, { ...process.env, HOME: tempHome });
    expect(show.status).toBe(0);
    expect((show.stdout.match(/^### /gm) ?? []).length).toBe(1);
    expect(show.stdout).toContain('### FINAL');
  }, 180_000);
});
