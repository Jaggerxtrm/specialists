// NOTE: Probe live validation stays out of scope here.
// Phase C already covers live probe behavior; probe-only needs upstream pi model access
// and authenticated runtime that should not be required for discovery smoke.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const liveDescribe = process.env.SPECIALISTS_LIVE_SMOKE === '1' ? describe : describe.skip;
const repoRoot = resolve(import.meta.dirname, '../../..');
const entry = join(repoRoot, 'src/index.ts');

liveDescribe('integration: specialists setup live smoke', () => {
  let tempDir = '';
  let tempHome = '';

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
  });

  it('runs discovery JSON against isolated fixture repo', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-setup-live-'));
    tempHome = await mkdtemp(join(tmpdir(), 'specialists-setup-home-'));

    await mkdir(join(tempDir, '.specialists', 'user'), { recursive: true });
    await mkdir(join(tempHome, '.config', 'specialists'), { recursive: true });
    await writeFile(
      join(tempHome, '.config', 'specialists', 'user.json'),
      `${JSON.stringify({
        executor: {
          execution: {
            model: 'openai/gpt-4.1-mini',
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
          notes_mode: null,
          output_file: null,
          skills: { paths: [] },
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const result = spawnSync('bun', [entry, 'setup', '--discovery', '--json'], {
      cwd: tempDir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: tempHome,
        XDG_CONFIG_HOME: join(tempHome, '.config'),
        NO_COLOR: '1',
      },
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(Array.isArray(payload.models)).toBe(true);
    expect(payload.missing_configs).toEqual(expect.objectContaining({ global_user_config: false }));
    expect(Array.isArray(payload.registry)).toBe(true);
    expect(Array.isArray(payload.blocked_field_warnings)).toBe(true);
  }, 20_000);
});
