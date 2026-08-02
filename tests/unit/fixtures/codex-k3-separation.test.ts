import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// K3 (unitAI-e67up.2) provenance for the provider/surface separation fixture.
// The fixture records the negative proof that `openai-codex/...` stays a Pi
// provider/model spelling and never aliases the native Codex surface, plus the
// Core K2 outcome boundary. This test checks the fixture's internal consistency
// and re-runs the load-bearing probes live against the current seams.

const fixture = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/codex-k3/provider-surface-separation.json'),
    'utf8',
  ),
) as any;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('K3 separation fixture provenance', () => {
  it('stores an internally consistent negative-proof record', () => {
    expect(fixture.schema).toBe('specialists.k3.separation.v1');
    expect(fixture.mode).toBe('negative_proof_provider_model_vs_native_codex_surface');
    expect(fixture.bead).toMatchObject({ id: 'unitAI-e67up.2', parent: 'unitAI-e67up' });
    expect(fixture.provider_spelling).toBe('openai-codex/gpt-5.4');

    expect(fixture.probes.default_surface_is_pi.surface).toBe('pi');
    expect(fixture.probes.explicit_pi_stays_pi.surface).toBe('pi');
    expect(fixture.probes.codex_requires_explicit_flag.surface).toBe('codex');
    expect(fixture.probes.provider_spelling_rejected_as_surface).toMatchObject({
      exit: 1,
      ok: false,
      error_code: 'usage',
    });
    for (const probe of Object.values<any>(fixture.probes)) {
      if (typeof probe.command !== 'string') continue; // rule-only probe
      expect(probe.command).toContain('unitAI-e67up.2');
      expect(probe.command).not.toContain('|');
    }
  });

  it('records the Core K2 boundary as data, with no prose parsing', () => {
    expect(fixture.k2_boundary).toMatchObject({
      owner: 'xtrm-dev/core',
      core_commit: '1ed512a49efaf75f3e84c128f9d82958ece09d3a',
      schema_version: 'xtrm.command-outcome.v1',
      prose_parsing: false,
    });
    expect(fixture.experimental).toMatchObject({ status: 'experimental', promotion_gate: 'GATE-IFACE (K5)' });
  });
});

describe('K3 separation fixture live reproduction', () => {
  it('reproduces the surface selection probes through the shared parser', async () => {
    const { parseRenderArgs } = await import('../../../src/cli/render-task.js');
    expect(parseRenderArgs(['codex-probe', '--bead', fixture.bead.id]).surface)
      .toBe(fixture.probes.default_surface_is_pi.surface);
    expect(parseRenderArgs(['codex-probe', '--bead', fixture.bead.id, '--surface', 'pi']).surface)
      .toBe(fixture.probes.explicit_pi_stays_pi.surface);
    expect(parseRenderArgs(['codex-probe', '--bead', fixture.bead.id, '--surface', 'codex']).surface)
      .toBe(fixture.probes.codex_requires_explicit_flag.surface);
  });

  it('reproduces the exact usage error for the provider spelling used as a surface', async () => {
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number | string) => {
      throw new Error(`exit:${code}`);
    }) as never);

    const { parseRenderArgs } = await import('../../../src/cli/render-task.js');
    expect(() => parseRenderArgs(['codex-probe', '--bead', fixture.bead.id, '--surface', fixture.provider_spelling]))
      .toThrow('exit:1');
    const emitted = JSON.parse(output.join(''));
    expect(emitted.ok).toBe(false);
    expect(emitted.error.code).toBe(fixture.probes.provider_spelling_rejected_as_surface.error_code);
    expect(emitted.error.message).toBe(fixture.probes.provider_spelling_rejected_as_surface.error_message);
  });

  it('reproduces the $skill-name prefix byte-for-byte', async () => {
    const { buildSkillPrefix } = await import('../../../src/specialist/task-prompt.js');
    const { SpecialistSchema } = await import('../../../src/specialist/schema.js');
    const spec = SpecialistSchema.parse({
      specialist: {
        metadata: { name: 'codex-probe', version: '1.0.0', description: 'K3 probe specialist.', category: 'internal' },
        execution: { model: fixture.provider_spelling },
        prompt: { task_template: '$prompt' },
        skills: { paths: ['config/skills/using-specialists/SKILL.md'] },
      },
    });
    expect(buildSkillPrefix(spec.specialist, 'codex'))
      .toBe(fixture.probes.codex_requires_explicit_flag.skill_prefix);
  });
});
