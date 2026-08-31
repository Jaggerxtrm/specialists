import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SpecialistLoader } from '../../../src/specialist/loader.js';
import { buildMandatoryRulesInjection } from '../../../src/specialist/mandatory-rules.js';

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

  it('global empty template_sets selection clears specialist-specific sets end-to-end but required/default index sets still load (unitAI-klo6k)', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'specialists-loader-global-'));
    originalHome = process.env.HOME;
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = tempHome;
    delete process.env.XDG_CONFIG_HOME;

    // Global layer: explicit empty selection for the shipped executor specialist.
    await writeUserConfig({
      executor: {
        execution: { model: 'openai-codex/gpt-5.4' },
        mandatory_rules: { template_sets: [] },
      },
    });

    const loader = new SpecialistLoader({ projectDir: process.cwd() });
    const merged = await loader.get('executor');

    // Merge contract: package specialist-specific sets are replaced with [].
    expect(merged.specialist.mandatory_rules?.template_sets).toEqual([]);
    expect(loader.getBlockedFieldWarnings('executor').map(w => w.field)).not.toContain('mandatory_rules.template_sets');

    // Injection contract: shipped specialist-specific sets no longer load;
    // index required/default policy still does.
    const result = buildMandatoryRulesInjection({ cwd: process.cwd(), specialist: merged.specialist });
    expect(result.block).not.toContain('### executor-delivery');
    expect(result.block).not.toContain('### bead-id-verbatim');
    expect(result.block).toContain('### core-session-boundary');
    expect(result.block).toContain('### git-workflow-safe');
  });

  it('global replaced template_sets selection swaps specialist-specific sets end-to-end while index sets stay (unitAI-klo6k)', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'specialists-loader-global-'));
    originalHome = process.env.HOME;
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = tempHome;
    delete process.env.XDG_CONFIG_HOME;

    await writeUserConfig({
      reviewer: {
        execution: { model: 'openai-codex/gpt-5.4' },
        mandatory_rules: { template_sets: ['explorer-readonly'] },
      },
    });

    const loader = new SpecialistLoader({ projectDir: process.cwd() });
    const merged = await loader.get('reviewer');

    expect(merged.specialist.mandatory_rules?.template_sets).toEqual(['explorer-readonly']);

    const result = buildMandatoryRulesInjection({ cwd: process.cwd(), specialist: merged.specialist });
    expect(result.block).toContain('### explorer-readonly');
    // Removed reviewer-specific sets no longer load.
    expect(result.block).not.toContain('### reviewer-verdict-format');
    // Index required/default policy untouched.
    expect(result.block).toContain('### core-session-boundary');
    expect(result.block).toContain('### git-workflow-safe');
  });
});
