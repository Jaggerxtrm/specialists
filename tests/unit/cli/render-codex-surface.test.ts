// K3 (unitAI-e67up.2) — native Codex role/render surface.
//
// Proves the distinct `codex` interactive surface on the shared read-only render
// verbs: $skill-name invocation, codex-specific model resolution, stable error
// codes, byte-ceiling parity with Pi/Claude, and the negative proof that an
// `openai-codex/...` provider/model spelling never becomes a runtime alias.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeadRecord } from '../../../src/specialist/beads.js';
import type { Specialist } from '../../../src/specialist/schema.js';

const BEAD: BeadRecord = {
  id: 'unitAI-e67up.2',
  title: 'K3 native Codex surface',
  description: 'PROBLEM: Specialists cannot render for a native Codex harness.',
  status: 'open',
} as BeadRecord;

/** Provider/model spelling that Pi executes; it must never select a surface. */
const PROVIDER_MODEL = 'openai-codex/gpt-5.4';

let readBead: (id: string) => BeadRecord | null;
let specs: Record<string, Specialist>;

// Only the bd-shelling client is faked; buildBeadContext stays real so the
// assembled prompt is the production one.
vi.mock('../../../src/specialist/beads.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/specialist/beads.js')>();
  return {
    ...actual,
    BeadsClient: class {
      readBead(id: string) { return readBead(id); }
      getCompletedBlockers() { return []; }
    },
  };
});

// Loader fake mirrors the real gate: get() hard-fails on a null/empty
// execution.model (the pi/claude runtime path); getEffective() skips that gate
// (the inspection path). The codex surface routes through getEffective() plus
// its own surface-model validation in render-task.
vi.mock('../../../src/specialist/loader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/specialist/loader.js')>();
  return {
    ...actual,
    SpecialistLoader: class {
      async get(name: string) {
        const spec = specs[name];
        if (!spec) throw new Error(`Specialist not found: ${name}`);
        const model = spec.specialist.execution.model;
        if (model === null || model === undefined || model === '') {
          throw new actual.SpecialistMissingModelError(name);
        }
        return spec;
      }
      async getEffective(name: string) {
        return specs[name] ?? null;
      }
    },
  };
});

async function makeSpecialist(execution: Record<string, unknown>, withSkill: boolean): Promise<Specialist> {
  const { SpecialistSchema } = await import('../../../src/specialist/schema.js');
  return SpecialistSchema.parse({
    specialist: {
      metadata: { name: 'codex-probe', version: '1.0.0', description: 'K3 probe specialist.', category: 'internal' },
      execution,
      prompt: { system: 'SYSTEM — MUST NOT LEAK', task_template: '$prompt' },
      ...(withSkill ? { skills: { paths: ['config/skills/using-specialists/SKILL.md'] } } : {}),
    },
  });
}

const originalArgv = [...process.argv];
let stdout: string[] = [];

function argv(verb: string, ...args: string[]): void {
  process.argv = ['node', 'specialists', verb, ...args];
}

function captureStdout(): void {
  stdout = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number | string) => {
    throw new Error(`exit:${code}`);
  }) as never);
}

async function renderTask(name: string, ...args: string[]): Promise<Record<string, any>> {
  argv('render-task', name, '--bead', BEAD.id, ...args);
  const { run } = await import('../../../src/cli/render-task.js');
  await run();
  return JSON.parse(stdout.join(''));
}

async function renderTaskFailing(name: string, ...args: string[]): Promise<Record<string, any>> {
  argv('render-task', name, '--bead', BEAD.id, ...args);
  const { run } = await import('../../../src/cli/render-task.js');
  await expect(run()).rejects.toThrow('exit:1');
  return JSON.parse(stdout.join(''));
}

beforeEach(async () => {
  readBead = (id) => (id === BEAD.id ? BEAD : null);
  specs = {
    // Provider-model specialist: `openai-codex/...` executed BY PI.
    'codex-probe': await makeSpecialist({ model: PROVIDER_MODEL, bare: true, interactive: true }, true),
    // Codex-only model: execution.model null, surface_models.codex set.
    'codex-only': await makeSpecialist({
      model: null, bare: true, interactive: true, surface_models: { codex: 'gpt-5.4-codex' },
    }, true),
    // No model anywhere.
    'no-model': await makeSpecialist({ model: null, bare: true, interactive: true }, true),
    // Model set, no declared skills.
    'no-skills': await makeSpecialist({ model: PROVIDER_MODEL, bare: true, interactive: true }, false),
  };
  captureStdout();
});

afterEach(() => {
  process.argv = [...originalArgv];
  vi.restoreAllMocks();
});

describe('sp render-task --surface codex', () => {
  it('renders the codex envelope with the $skill-name prefix at position 0', async () => {
    const out = await renderTask('codex-probe', '--surface', 'codex');
    expect(out.ok).toBe(true);
    expect(out.surface).toBe('codex');
    expect(out.specialist).toBe('codex-probe');
    expect(out.skill_prefix).toBe('$using-specialists\n\n');
    expect(out.initial_prompt.startsWith('$using-specialists\n\n')).toBe(true);
    expect(out.initial_prompt).toContain(BEAD.title);
    expect(out.initial_prompt).not.toContain('MUST NOT LEAK');
    expect(out.prompt_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('resolves execution.surface_models.codex when execution.model is null', async () => {
    // Codex-only configuration is renderable on the codex surface...
    const out = await renderTask('codex-only', '--surface', 'codex');
    expect(out.ok).toBe(true);
    expect(out.surface).toBe('codex');
  });

  it('keeps the pi/claude runtime gate unchanged for codex-only configs', async () => {
    // ...while pi and claude still hard-fail on the null execution.model,
    // exactly as K1 pinned: the codex surface does not leak into their paths.
    for (const surface of ['pi', 'claude']) {
      stdout = [];
      const out = await renderTaskFailing('codex-only', '--surface', surface);
      expect(out.ok).toBe(false);
      expect(out.error.code).toBe('specialist_not_found');
      expect(out.error.message).toContain('has no model configured');
    }
  });

  it('fails with the canonical missing-model error when no codex model resolves', async () => {
    const out = await renderTaskFailing('no-model', '--surface', 'codex');
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe('specialist_not_found');
    expect(out.error.message).toContain(`specialist 'no-model' has no model configured`);
  });

  it('fails with specialist_not_found for an unknown name', async () => {
    const out = await renderTaskFailing('ghost', '--surface', 'codex');
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe('specialist_not_found');
    expect(out.error.message).toContain('Specialist not found: ghost');
  });

  it('keeps the envelope shape byte-ceiling components identical to pi', async () => {
    // The skill prefix differs at position 0; every bounded component
    // measurement (task template, bead context, mandatory rules) is shared.
    const codex = await renderTask('codex-probe', '--surface', 'codex');
    stdout = [];
    const pi = await renderTask('codex-probe', '--surface', 'pi');
    expect(codex.components).toEqual(pi.components);
    expect(codex.initial_prompt.slice(codex.skill_prefix.length))
      .toBe(pi.initial_prompt.slice(pi.skill_prefix.length));
  });
});

describe('negative proof: provider IDs never become runtime aliases', () => {
  it('rejects provider spellings and unknown surfaces with a usage error', async () => {
    for (const bad of ['openai-codex', 'openai-codex/gpt-5.4', 'codex-exec', 'gpt-5.4']) {
      stdout = [];
      const out = await renderTaskFailing('codex-probe', '--surface', bad);
      expect(out.ok).toBe(false);
      expect(out.error.code).toBe('usage');
      expect(out.error.message).toBe(`--surface must be 'pi', 'claude' or 'codex' (got '${bad}')`);
    }
  });

  it('never derives the surface from an openai-codex/... model spelling', async () => {
    // Default stays pi; explicit pi stays pi; codex requires the explicit flag.
    const def = await renderTask('codex-probe');
    expect(def.surface).toBe('pi');
    stdout = [];
    const pi = await renderTask('codex-probe', '--surface', 'pi');
    expect(pi.surface).toBe('pi');
    // The provider model renders as data: identical task body on both surfaces.
    expect(def.initial_prompt).toBe(pi.initial_prompt);
    stdout = [];
    const codex = await renderTask('codex-probe', '--surface', 'codex');
    expect(codex.surface).toBe('codex');
    expect(codex.initial_prompt.slice(codex.skill_prefix.length))
      .toBe(pi.initial_prompt.slice(pi.skill_prefix.length));
  });
});

describe('sp render-bead / sp render-skill-prefix on the codex surface', () => {
  it('renders a roleless codex bead with an empty skill_prefix', async () => {
    argv('render-bead', BEAD.id, '--surface', 'codex');
    const { run } = await import('../../../src/cli/render-bead.js');
    run();
    const out = JSON.parse(stdout.join(''));
    expect(out.ok).toBe(true);
    expect(out.specialist).toBeNull();
    expect(out.surface).toBe('codex');
    expect(out.skill_prefix).toBe('');
    expect(out.initial_prompt.startsWith('$')).toBe(false);
  });

  it('emits the $skill-name block byte-identical to render-task metadata', async () => {
    argv('render-skill-prefix', 'codex-probe', '--surface', 'codex');
    const { run } = await import('../../../src/cli/render-skill-prefix.js');
    await run();
    const out = JSON.parse(stdout.join(''));
    expect(out).toEqual({
      ok: true,
      specialist: 'codex-probe',
      surface: 'codex',
      skill_prefix: '$using-specialists\n\n',
    });
  });

  it('emits an empty codex prefix for a specialist without skills', async () => {
    argv('render-skill-prefix', 'no-skills', '--surface', 'codex');
    const { run } = await import('../../../src/cli/render-skill-prefix.js');
    await run();
    const out = JSON.parse(stdout.join(''));
    expect(out.ok).toBe(true);
    expect(out.skill_prefix).toBe('');
  });

  it('rejects provider spellings on render-skill-prefix too', async () => {
    argv('render-skill-prefix', 'codex-probe', '--surface', 'openai-codex');
    const { run } = await import('../../../src/cli/render-skill-prefix.js');
    await expect(run()).rejects.toThrow('exit:1');
    const out = JSON.parse(stdout.join(''));
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe('usage');
  });
});
