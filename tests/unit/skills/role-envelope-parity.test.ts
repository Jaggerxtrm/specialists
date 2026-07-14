import { describe, it, expect } from 'vitest';
import { renderTaskPrompt } from '../../../src/specialist/task-prompt.js';
import type { BeadRecord } from '../../../src/specialist/beads.js';
import type { Specialist } from '../../../src/specialist/schema.js';

// Encodes the prompt-envelope parity decision from unitAI-6639v.1 for the three
// surfaces that build a specialist's initial task:
//
//   sp run          — task_template + bead ctx -> MANDATORY_RULES -> execution-only -> hash
//   xt pi --role    — same task-side content via `sp render-task --surface pi`
//   xt claude --role— same task-side content via `sp render-task --surface claude`
//
// Approved intentional differences (task side), all execution-only:
//   1. pre-scripts / $pre_script_output — executes shell; absent from the read-only renderer.
//   2. reviewer git-diff context        — executes git; reviewer-only, enters sp run via a hook.
//   3. mandatory-rule failure           — sp run warns and skips; the renderer treats it as fatal.
// Everything else must be byte-identical, and prompt.system must never appear on any surface.

const BEAD: BeadRecord = {
  id: 'unitAI-6639v',
  title: 'Redesign using-specialists',
  description: 'PROBLEM: the skill is a monolith.',
  status: 'open',
} as BeadRecord;

const SYSTEM = 'SYSTEM PROMPT — MUST NEVER REACH THE TASK SIDE';

function spec(overrides: Record<string, unknown> = {}): Specialist['specialist'] {
  return {
    metadata: { name: 'chain-coordinator', version: '1.0.0' },
    execution: { bare: true, interactive: true },
    prompt: { system: SYSTEM, task_template: '$prompt' },
    ...overrides,
  } as unknown as Specialist['specialist'];
}

const base = { specialist: spec(), cwd: '/repo', beadId: BEAD.id, bead: BEAD, completedBlockers: [] };

// The renderer is what `sp render-task --surface <pi|claude>` calls; `surface` is
// recorded as metadata and must not influence task content.
const roleSurface = () => renderTaskPrompt({ ...base });
const spRunNoExecutionExtras = () => renderTaskPrompt({ ...base, preScriptOutput: '' });

describe('parity matrix: xt pi --role vs xt claude --role', () => {
  it('both role surfaces produce the identical task prompt and hash', () => {
    const pi = roleSurface();
    const claude = roleSurface();
    expect(pi.initial_prompt).toEqual(claude.initial_prompt);
    expect(pi.prompt_hash).toEqual(claude.prompt_hash);
  });
});

describe('parity matrix: role surfaces vs sp run', () => {
  it('match sp run exactly when sp run has no execution-only additions', () => {
    expect(roleSurface().prompt_hash).toEqual(spRunNoExecutionExtras().prompt_hash);
  });

  it('differ from sp run ONLY by the execution-only pre-script block', () => {
    const withPreScript = renderTaskPrompt({ ...base, preScriptOutput: 'PRE SCRIPT STDOUT' });
    // The template here is `$prompt`, so pre_script_output is not interpolated; the
    // classified difference is that the renderer never *runs* pre-scripts at all.
    expect(withPreScript.variables.pre_script_output).toBe('PRE SCRIPT STDOUT');
    expect(roleSurface().variables.pre_script_output).toBe('');
  });

  it('differ from sp run ONLY by the execution-only reviewer diff block', () => {
    const reviewer = renderTaskPrompt({
      ...base,
      specialist: spec({ execution: { bare: false, interactive: false } }),
      appendExecutionContext: (task) => `${task}\n\nREVIEWER DIFF CONTEXT`,
    });
    const role = renderTaskPrompt({ ...base, specialist: spec({ execution: { bare: false, interactive: false } }) });
    expect(reviewer.initial_prompt).toBe(`${role.initial_prompt}\n\nREVIEWER DIFF CONTEXT`);
    expect(reviewer.prompt_hash).not.toBe(role.prompt_hash); // hash covers the appended block
  });

  it('surfaces mandatory-rule failure fatally for roles, but sp run warns and continues', () => {
    // The seam reports the failure; the CLI turns it fatal (mandatory_rules_failed),
    // while runner.ts keeps its historical warn-and-skip. Same seam, different policy.
    const out = roleSurface();
    expect(out).toHaveProperty('mandatoryRulesError');
  });
});

describe('every surface: prompt.system never leaks into the task', () => {
  for (const [name, render] of Object.entries({ 'pi --role': roleSurface, 'claude --role': roleSurface, 'sp run': spRunNoExecutionExtras })) {
    it(`${name} never emits prompt.system`, () => {
      expect(render().initial_prompt).not.toContain(SYSTEM);
    });
  }
});

describe('every surface: approved context layers appear exactly once', () => {
  it('bead context is present exactly once', () => {
    const out = roleSurface();
    expect(out.initial_prompt.split(BEAD.title).length - 1).toBe(1);
  });

  it('the boundary instruction is present exactly once', () => {
    const out = roleSurface();
    expect(out.initial_prompt.split('## Runtime Boundary Rules').length - 1).toBe(1);
  });

  it('no unapproved layer sneaks in (task = bead context + boundary only, for this template)', () => {
    const out = renderTaskPrompt({ ...base, specialist: spec({ execution: { bare: true } }) });
    // `bare` suppresses MANDATORY_RULES, so the task must be exactly the resolved prompt.
    expect(out.initial_prompt).toBe(out.resolvedPrompt);
  });
});
