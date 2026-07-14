import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { renderTaskPrompt } from '../../src/specialist/task-prompt.js';
import { buildBeadContext, type BeadRecord } from '../../src/specialist/beads.js';
import type { Specialist } from '../../src/specialist/schema.js';

const BEAD: BeadRecord = {
  id: 'unitAI-6639v',
  title: 'Redesign using-specialists',
  description: 'PROBLEM: the skill is too large.',
  status: 'open',
} as BeadRecord;

function spec(taskTemplate: string, overrides: Record<string, unknown> = {}): Specialist['specialist'] {
  return {
    metadata: { name: 'chain-coordinator', version: '1.0.0' },
    // `bare` skips MANDATORY_RULES injection, keeping these assertions about the
    // task template itself rather than the repo's rule files.
    execution: { bare: true, interactive: true },
    prompt: { system: 'SYSTEM PROMPT — MUST NOT LEAK', task_template: taskTemplate },
    ...overrides,
  } as unknown as Specialist['specialist'];
}

const base = { cwd: '/repo', beadId: BEAD.id, bead: BEAD, completedBlockers: [] };

describe('renderTaskPrompt', () => {
  it('renders bead context exactly once for the deduplicated coordinator template', () => {
    const out = renderTaskPrompt({ ...base, specialist: spec('$prompt') });
    const occurrences = out.initial_prompt.split(BEAD.title).length - 1;
    expect(occurrences).toBe(1);
    expect(out.initial_prompt).toContain('## Runtime Boundary Rules');
  });

  it('proves the pre-fix coordinator template duplicated the bead context', () => {
    // Regression guard: this is exactly what `$prompt\n\nEpic bead: $bead_context`
    // did on every tracked run (unitAI-6639v.1 finding D). If a future edit
    // reintroduces $bead_context alongside $prompt, the count goes back to 2.
    const out = renderTaskPrompt({ ...base, specialist: spec('$prompt\n\nEpic bead: $bead_context') });
    expect(out.initial_prompt.split(BEAD.title).length - 1).toBe(2);
  });

  it('never emits prompt.system', () => {
    const out = renderTaskPrompt({ ...base, specialist: spec('$prompt') });
    expect(out.initial_prompt).not.toContain('MUST NOT LEAK');
  });

  it('hashes the rendered task with sha256/16 — the sp run contract', () => {
    const out = renderTaskPrompt({ ...base, specialist: spec('$prompt') });
    const expected = createHash('sha256').update(out.initial_prompt).digest('hex').slice(0, 16);
    expect(out.prompt_hash).toBe(expected);
  });

  it('composes bead context + boundary instruction in the sp run order', () => {
    const out = renderTaskPrompt({ ...base, specialist: spec('$prompt') });
    const beadText = buildBeadContext(BEAD, []);
    expect(out.initial_prompt.indexOf(beadText)).toBe(0);
    expect(out.beadContextOwn?.kind).toBe('bead_context');
    expect(out.taskTemplateComponent.kind).toBe('task_template');
  });

  it('substitutes $bead_id and $cwd, leaving unknown variables verbatim', () => {
    const out = renderTaskPrompt({ ...base, specialist: spec('bead=$bead_id cwd=$cwd unknown=$nope') });
    expect(out.initial_prompt).toContain('bead=unitAI-6639v');
    expect(out.initial_prompt).toContain('cwd=/repo');
    expect(out.initial_prompt).toContain('unknown=$nope');
  });

  it('applies the execution-only hook after the task body, before the hash', () => {
    // `bare` specialists skip both MANDATORY_RULES and the execution hook, so this
    // case must use a non-bare spec. cwd has no rules index, so no rules are added.
    const out = renderTaskPrompt({
      ...base,
      specialist: spec('$prompt', { execution: { bare: false, interactive: true } }),
      appendExecutionContext: (task) => `${task}\n\nDIFF CONTEXT`,
    });
    expect(out.initial_prompt.endsWith('DIFF CONTEXT')).toBe(true);
    expect(out.prompt_hash).toBe(createHash('sha256').update(out.initial_prompt).digest('hex').slice(0, 16));
  });

  it('omits the execution-only hook when the renderer does not pass one', () => {
    const out = renderTaskPrompt({ ...base, specialist: spec('$prompt') });
    expect(out.initial_prompt).not.toContain('DIFF CONTEXT');
  });

  it('falls back to the caller-supplied prompt when there is no bead', () => {
    const out = renderTaskPrompt({
      cwd: '/repo',
      specialist: spec('$prompt'),
      fallbackPrompt: () => 'ad-hoc task',
    });
    expect(out.initial_prompt).toBe('ad-hoc task');
    expect(out.beadContextOwn).toBeNull();
  });

  it('falls back to the caller prompt when a bead id is given but the bead is unreadable', () => {
    // sp run behavior: `--bead X` whose bead cannot be read still uses --prompt.
    // Regression guard — the first extraction dropped this path.
    const out = renderTaskPrompt({
      cwd: '/repo',
      specialist: spec('$prompt'),
      beadId: 'missing-bead',
      bead: null,
      fallbackPrompt: () => 'ad-hoc task',
    });
    expect(out.initial_prompt).toBe('ad-hoc task');
  });
});
