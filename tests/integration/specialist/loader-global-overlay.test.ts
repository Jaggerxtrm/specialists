import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SpecialistLoader } from '../../../src/specialist/loader.js';

describe('integration: SpecialistLoader global Phase 1 overlay', () => {
  let tempHome = '';
  let originalHome: string | undefined;
  let originalXdg: string | undefined;

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
  });

  async function writeUserConfig(content: Record<string, unknown>) {
    await mkdir(join(tempHome, '.config', 'specialists'), { recursive: true });
    await writeFile(join(tempHome, '.config', 'specialists', 'user.json'), JSON.stringify(content), 'utf-8');
  }

  it('merges all six Phase 1 global user overlay fields into executor runtime spec', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'specialists-loader-global-'));
    originalHome = process.env.HOME;
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = tempHome;
    delete process.env.XDG_CONFIG_HOME;

    await writeUserConfig({
      executor: {
        execution: {
          model: 'openai-codex/gpt-5.4',
          prompt_limit_bytes: 65536,
          stdout_limit_bytes: 16384,
          extensions: { serena: false, gitnexus: false },
        },
        prompt: { system_prompt_mode: 'replace' },
        notes_mode: 'final-only',
        output_file: './executor-out.md',
      },
    });

    const loader = new SpecialistLoader({ projectDir: process.cwd() });
    const spec = await loader.get('executor');

    expect(spec.specialist.prompt.system_prompt_mode).toBe('replace');
    expect(spec.specialist.execution.extensions?.serena).toBe(false);
    expect(spec.specialist.execution.extensions?.gitnexus).toBe(false);
    expect(spec.specialist.notes_mode).toBe('final-only');
    expect(spec.specialist.output_file).toBe('./executor-out.md');
    expect(spec.specialist.execution.prompt_limit_bytes).toBe(65536);
    expect(spec.specialist.execution.stdout_limit_bytes).toBe(16384);
  });

  it('strips blocked global field override and records warning', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'specialists-loader-global-'));
    originalHome = process.env.HOME;
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = tempHome;
    delete process.env.XDG_CONFIG_HOME;

    const blockedPrompt = 'global blocked prompt must not land';
    await writeUserConfig({
      executor: {
        execution: {
          model: 'openai-codex/gpt-5.4',
        },
        prompt: {
          system: blockedPrompt,
        },
      },
    });

    const loader = new SpecialistLoader({ projectDir: process.cwd() });
    const spec = await loader.get('executor');
    const warnings = loader.getBlockedFieldWarnings('executor');

    expect(spec.specialist.prompt.system).not.toBe(blockedPrompt);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'prompt.system',
          source: 'global',
          severity: 'strip',
        }),
      ]),
    );
  });
});
