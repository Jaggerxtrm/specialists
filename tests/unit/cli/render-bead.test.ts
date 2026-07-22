import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeadRecord } from '../../../src/specialist/beads.js';

const BEAD: BeadRecord = {
  id: 'unitAI-6639v',
  title: 'Redesign using-specialists',
  description: 'PROBLEM: the skill is a monolith.',
  status: 'open',
} as BeadRecord;

let readBead: (id: string) => BeadRecord | null;

// Only the bd-shelling client is faked; buildBeadContext (used by the renderer)
// stays real so the assembled prompt is the production one.
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

const originalArgv = [...process.argv];
let stdout: string[] = [];

function argv(...args: string[]): void {
  process.argv = ['node', 'specialists', 'render-bead', ...args];
}

async function render(...args: string[]): Promise<Record<string, any>> {
  argv(...args);
  const { run } = await import('../../../src/cli/render-bead.js');
  run();
  return JSON.parse(stdout.join(''));
}

beforeEach(() => {
  readBead = (id) => (id === BEAD.id ? BEAD : null);
  stdout = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number | string) => {
    throw new Error(`exit:${code}`);
  }) as never);
});

afterEach(() => {
  process.argv = [...originalArgv];
  vi.restoreAllMocks();
});

describe('rolelessSpecialist', () => {
  it('declares no skills, is not bare, and renders the bead body verbatim', async () => {
    const { rolelessSpecialist } = await import('../../../src/cli/render-bead.js');
    const spec = rolelessSpecialist();
    expect(spec.skills?.paths ?? []).toEqual([]);
    expect(spec.execution.bare).toBe(false);
    expect(spec.prompt.task_template).toBe('$prompt');
    // No system prompt exists to leak into the task side.
    expect(spec.prompt.system).toBeUndefined();
  });
});

describe('sp render-bead', () => {
  it('renders a bead with no specialist and reports specialist: null', async () => {
    const out = await render(BEAD.id);
    expect(out.ok).toBe(true);
    expect(out.specialist).toBeNull();
    expect(out.bead_id).toBe(BEAD.id);
    expect(out.skills).toEqual([]);
  });

  it('carries the bead body and the runtime boundary rules into the prompt', async () => {
    const out = await render(BEAD.id, '--cwd', '/repo');
    expect(out.initial_prompt).toContain(BEAD.title);
    expect(out.initial_prompt).toContain('PROBLEM: the skill is a monolith.');
    expect(out.initial_prompt).toContain('## Runtime Boundary Rules');
    expect(out.initial_prompt).toContain('Current cwd: /repo');
    expect(out.prompt_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('injects MANDATORY_RULES like every other surface', async () => {
    const out = await render(BEAD.id);
    expect(out.mandatory_rules).not.toBeNull();
    expect(out.mandatory_rules.rules_count).toBeGreaterThan(0);
    expect(out.components.some((c: { kind: string }) => c.kind === 'mandatory_rule')).toBe(true);
  });

  it('emits an empty skill_prefix so position 0 is never a slash command', async () => {
    for (const surface of ['pi', 'claude']) {
      stdout = [];
      const out = await render(BEAD.id, '--surface', surface);
      expect(out.skill_prefix).toBe('');
      expect(out.surface).toBe(surface);
      expect(out.initial_prompt.startsWith('/')).toBe(false);
    }
  });

  it('accepts the bead id positionally or via --bead', async () => {
    const positional = await render(BEAD.id);
    stdout = [];
    const flagged = await render('--bead', BEAD.id);
    expect(flagged.initial_prompt).toBe(positional.initial_prompt);
    expect(flagged.prompt_hash).toBe(positional.prompt_hash);
  });

  it('fails with `usage` when no bead id is given', async () => {
    argv('--surface', 'claude');
    const { run } = await import('../../../src/cli/render-bead.js');
    expect(() => run()).toThrow('exit:1');
    const out = JSON.parse(stdout.join(''));
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe('usage');
    expect(out.error.message).toContain('Usage: specialists render-bead <id>');
  });

  it('fails with `bead_not_found` for an unknown bead', async () => {
    argv('unitAI-nope');
    const { run } = await import('../../../src/cli/render-bead.js');
    expect(() => run()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.code).toBe('bead_not_found');
  });

  it('rejects an unsupported --surface through the shared parser', async () => {
    argv(BEAD.id, '--surface', 'codex');
    const { run } = await import('../../../src/cli/render-bead.js');
    expect(() => run()).toThrow('exit:1');
    expect(JSON.parse(stdout.join('')).error.code).toBe('usage');
  });
});

describe('render-task / render-bead share one assembly path', () => {
  it('roleless output matches renderTaskPrompt driven by the same synthetic spec', async () => {
    const { rolelessSpecialist } = await import('../../../src/cli/render-bead.js');
    const { renderTaskPrompt } = await import('../../../src/specialist/task-prompt.js');

    const direct = renderTaskPrompt({
      specialist: rolelessSpecialist(),
      cwd: '/repo',
      beadId: BEAD.id,
      bead: BEAD,
      completedBlockers: [],
      surface: 'claude',
    });

    const out = await render(BEAD.id, '--cwd', '/repo', '--surface', 'claude');
    expect(out.initial_prompt).toBe(direct.initial_prompt);
    expect(out.prompt_hash).toBe(direct.prompt_hash);
  });
});
