import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import {
  SpecialistPresetConfigError,
  SpecialistPresetCycleError,
  SpecialistPresetFieldMissingError,
  SpecialistPresetNotFoundError,
  SpecialistPresetTypeError,
  loadPresets,
  resolvePresetReference,
} from '../../../src/specialist/preset-resolver.js';

describe('preset resolver', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), 'preset-resolver-'));
    process.chdir(tempDir);
    await mkdir('config', { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
    loadPresets({ force: true });
  });

  it('resolves a known preset field', async () => {
    await writePresets({
      cheap: { description: 'cheap', fields: { 'specialist.execution.model': 'nano-gpt/moonshotai/kimi-k2.5' } },
    });

    const result = resolvePresetReference('@preset/cheap', 'specialist.execution.model', loadPresets({ force: true }));

    expect(result.value).toBe('nano-gpt/moonshotai/kimi-k2.5');
    expect(result.depth).toBe(1);
  });

  it('throws for unknown preset', async () => {
    await writePresets({
      cheap: { description: 'cheap', fields: { 'specialist.execution.model': 'cheap/model' } },
    });

    expect(() => resolvePresetReference('@preset/fast', 'specialist.execution.model', loadPresets({ force: true }), new Set(), { specialist: 'demo' }))
      .toThrow('preset "fast" referenced by demo.specialist.execution.model not found in config/presets.json. Known presets: cheap');
  });

  it('throws for preset cycles with visited list', async () => {
    await writePresets({
      A: { description: 'A', fields: { 'specialist.execution.model': '@preset/B' } },
      B: { description: 'B', fields: { 'specialist.execution.model': '@preset/A' } },
    });

    expect(() => resolvePresetReference('@preset/A', 'specialist.execution.model', loadPresets({ force: true })))
      .toThrow(SpecialistPresetCycleError);
    try {
      resolvePresetReference('@preset/A', 'specialist.execution.model', loadPresets());
    } catch (error) {
      expect(error).toBeInstanceOf(SpecialistPresetCycleError);
      expect((error as SpecialistPresetCycleError).visited).toEqual(['A', 'B', 'A']);
    }
  });

  it('throws when depth cap is exceeded', async () => {
    await writePresets({
      A: { description: 'A', fields: { 'specialist.execution.model': '@preset/B' } },
      B: { description: 'B', fields: { 'specialist.execution.model': '@preset/C' } },
      C: { description: 'C', fields: { 'specialist.execution.model': '@preset/D' } },
      D: { description: 'D', fields: { 'specialist.execution.model': '@preset/E' } },
      E: { description: 'E', fields: { 'specialist.execution.model': 'too/deep' } },
    });

    expect(() => resolvePresetReference('@preset/A', 'specialist.execution.model', loadPresets({ force: true })))
      .toThrow(SpecialistPresetCycleError);
  });

  it('throws for invalid preset JSON', async () => {
    await writeFile(join('config', 'presets.json'), '{ nope');

    expect(() => loadPresets({ force: true })).toThrow(SpecialistPresetConfigError);
    expect(() => loadPresets({ force: true })).toThrow('failed to load presets from');
  });

  it('throws when preset field is missing', async () => {
    await writePresets({
      cheap: { description: 'cheap', fields: { 'specialist.execution.fallback_model': 'cheap/fallback' } },
    });

    expect(() => resolvePresetReference('@preset/cheap', 'specialist.execution.model', loadPresets({ force: true }), new Set(), { specialist: 'demo' }))
      .toThrow(SpecialistPresetFieldMissingError);
    expect(() => resolvePresetReference('@preset/cheap', 'specialist.execution.model', loadPresets(), new Set(), { specialist: 'demo' }))
      .toThrow('preset "cheap" referenced by demo.specialist.execution.model does not define specialist.execution.model. Defined keys: specialist.execution.fallback_model');
  });

  it('throws when a preset resolves an object for a string field', async () => {
    await writePresets({
      cheap: { description: 'cheap', fields: { 'specialist.execution.model': { nested: 'model' } } },
    });

    expect(() => resolvePresetReference('@preset/cheap', 'specialist.execution.model', loadPresets({ force: true }), new Set(), { specialist: 'demo' }))
      .toThrow(SpecialistPresetTypeError);
    expect(() => resolvePresetReference('@preset/cheap', 'specialist.execution.model', loadPresets(), new Set(), { specialist: 'demo' }))
      .toThrow('preset "cheap" referenced by demo.specialist.execution.model resolved invalid value type: expected string or null, got object');
  });

  it('throws when a preset resolves an array for a string field', async () => {
    await writePresets({
      cheap: { description: 'cheap', fields: { 'specialist.execution.fallback_model': ['cheap/fallback'] } },
    });

    expect(() => resolvePresetReference('@preset/cheap', 'specialist.execution.fallback_model', loadPresets({ force: true })))
      .toThrow(SpecialistPresetTypeError);
  });

  it('throws when a preset resolves a number for a string field', async () => {
    await writePresets({
      cheap: { description: 'cheap', fields: { 'specialist.execution.thinking_level': 1 } },
    });

    expect(() => resolvePresetReference('@preset/cheap', 'specialist.execution.thinking_level', loadPresets({ force: true })))
      .toThrow('expected string or null, got number');
  });

  it('throws when a preset resolves a non-number for a number field', async () => {
    await writePresets({
      cheap: { description: 'cheap', fields: { 'specialist.execution.stall_timeout_ms': '60000' } },
    });

    expect(() => resolvePresetReference('@preset/cheap', 'specialist.execution.stall_timeout_ms', loadPresets({ force: true })))
      .toThrow('expected number, got string');
  });

  it('throws when fallback_models contains non-string entries', async () => {
    await writePresets({
      cheap: { description: 'cheap', fields: { 'specialist.execution.fallback_models': ['cheap/fallback', 1] } },
    });

    expect(() => resolvePresetReference('@preset/cheap', 'specialist.execution.fallback_models', loadPresets({ force: true })))
      .toThrow('expected string[] or null, got array(string, number)');
  });

  it('passes non-preset strings through unchanged', () => {
    const result = resolvePresetReference('openai-codex/gpt-5.4', 'specialist.execution.model', {});

    expect(result.value).toBe('openai-codex/gpt-5.4');
    expect(result.depth).toBe(0);
  });
});

async function writePresets(presets: Record<string, unknown>): Promise<void> {
  await writeFile(join('config', 'presets.json'), JSON.stringify(presets));
}
