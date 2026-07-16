import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { renderTaskPrompt, buildSkillPrefix, deriveSkillName } from '../../src/specialist/task-prompt.js';
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

  it('never re-expands variables that appear inside bead content', () => {
    // unitAI-6639v.5: the old two-pass render substituted $prompt with the bead body and
    // then re-scanned the RESULT, so a bead whose text contained a literal $cwd had it
    // replaced with the real path. Bead-authored content is data, not template source.
    const bead = {
      ...BEAD,
      description: 'The literal tokens $cwd and $bead_id must survive verbatim.',
    } as BeadRecord;
    const out = renderTaskPrompt({ ...base, bead, specialist: spec('$prompt'), cwd: '/SECRET/PATH' });

    expect(out.initial_prompt).toContain('The literal tokens $cwd and $bead_id must survive verbatim.');
    // ...while template-origin tokens still resolve (the boundary block renders the real cwd).
    expect(out.initial_prompt).toContain('Current cwd: /SECRET/PATH');
  });

  it('still resolves every template-origin variable in one pass', () => {
    const out = renderTaskPrompt({ ...base, specialist: spec('bead=$bead_id cwd=$cwd ctx=$bead_context') });
    expect(out.initial_prompt.startsWith('bead=unitAI-6639v cwd=/repo ctx=')).toBe(true);
    expect(out.initial_prompt).toContain(BEAD.title); // $bead_context expanded
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

// unitAI-qeguh — turn-1 skill-command composition, sp/xt parity (unitAI-6639v.1).
describe('buildSkillPrefix', () => {
  it('derives folder name for /SKILL.md and stem for bare .md', () => {
    expect(deriveSkillName('config/skills/using-specialists/SKILL.md')).toBe('using-specialists');
    expect(deriveSkillName('config/skills/pi-quick.md')).toBe('pi-quick');
  });

  it('emits empty string when specialist declares no skills', () => {
    const s = spec('$prompt');
    expect(buildSkillPrefix(s, 'pi')).toBe('');
    expect(buildSkillPrefix(s, 'claude')).toBe('');
  });

  it('emits Pi commands space-separated and byte-identically', () => {
    const s = spec('$prompt', { skills: { paths: ['a/b/using-specialists/SKILL.md', 'a/b/pi-quick.md'] } });
    expect(buildSkillPrefix(s, 'pi')).toBe('/skill:using-specialists /skill:pi-quick\n\n');
  });

  it('emits one Claude command followed by one blank line', () => {
    const s = spec('$prompt', { skills: { paths: ['a/b/using-specialists/SKILL.md'] } });
    expect(buildSkillPrefix(s, 'claude')).toBe('/using-specialists\n\n');
  });

  it('emits each Claude command on its own line followed by one blank line', () => {
    const s = spec('$prompt', { skills: { paths: ['a/b/using-specialists/SKILL.md', 'a/b/pi-quick.md'] } });
    expect(buildSkillPrefix(s, 'claude')).toBe('/using-specialists\n/pi-quick\n\n');
  });

  it('accepts skill-creator on both surfaces', () => {
    const s = spec('$prompt', { skills: { paths: ['a/skill-creator/SKILL.md'] } });
    expect(buildSkillPrefix(s, 'claude')).toBe('/skill-creator\n\n');
    expect(buildSkillPrefix(s, 'pi')).toBe('/skill:skill-creator\n\n');
  });

  it('rejects newline, control, and leading-punctuation skill names without reflecting them', () => {
    const paths = [
      'a/evil\nname/SKILL.md',
      'a/evil\nname.md',
      'a/evil\u0000name.md',
      'a/-bad.md',
      'a/.bad.md',
      'a/_bad.md',
    ];
    for (const path of paths) {
      for (const surface of ['claude', 'pi'] as const) {
        expect(() => buildSkillPrefix(spec('$prompt', { skills: { paths: [path] } }), surface))
          .toThrow('Invalid skill name derived from skills.paths');
      }
    }
  });

  it('preserves skills.paths declaration order and dedups by derived name', () => {
    const s = spec('$prompt', {
      skills: { paths: ['x/foo/SKILL.md', 'y/bar.md', 'z/foo/SKILL.md'] },
    });
    expect(buildSkillPrefix(s, 'pi')).toBe('/skill:foo /skill:bar\n\n');
  });
});

describe('renderTaskPrompt — surface-specific skill prefix baked into initial_prompt', () => {
  it('bakes the Pi prefix at position 0, then the prior task body', () => {
    const s = spec('$prompt', { skills: { paths: ['x/using-specialists/SKILL.md'] } });
    const out = renderTaskPrompt({ ...base, specialist: s, surface: 'pi' });
    expect(out.skillPrefix).toBe('/skill:using-specialists\n\n');
    expect(out.initial_prompt.startsWith('/skill:using-specialists\n\n')).toBe(true);
    expect(out.initial_prompt).toContain(BEAD.title);
  });

  it('bakes the exact Claude prefix at position 0, then the prior task body', () => {
    const s = spec('$prompt', { skills: { paths: ['x/using-specialists/SKILL.md', 'x/pi-quick.md'] } });
    const out = renderTaskPrompt({ ...base, specialist: s, surface: 'claude' });
    expect(out.skillPrefix).toBe('/using-specialists\n/pi-quick\n\n');
    expect(out.initial_prompt.startsWith('/using-specialists\n/pi-quick\n\n')).toBe(true);
    expect(out.initial_prompt).toContain(BEAD.title);
  });

  it('emits no prefix (position-0 fallback surface) when no declared skills', () => {
    const out = renderTaskPrompt({ ...base, specialist: spec('$prompt'), surface: 'pi' });
    expect(out.skillPrefix).toBe('');
    // Position 0 is the bead body, as before qeguh — core's position-0 fallback owns it.
    expect(out.initial_prompt.indexOf(BEAD.title)).toBeGreaterThanOrEqual(0);
    expect(out.initial_prompt.startsWith('/skill')).toBe(false);
  });

  it('is idempotent: repeated renders produce byte-identical output', () => {
    const s = spec('$prompt', { skills: { paths: ['x/foo/SKILL.md', 'y/bar.md'] } });
    const a = renderTaskPrompt({ ...base, specialist: s, surface: 'claude' });
    const b = renderTaskPrompt({ ...base, specialist: s, surface: 'claude' });
    expect(a.initial_prompt).toBe(b.initial_prompt);
    expect(a.prompt_hash).toBe(b.prompt_hash);
    expect(a.skillPrefix).toBe(b.skillPrefix);
  });

  it('parity: buildSkillPrefix output === prefix baked into initial_prompt', () => {
    const s = spec('$prompt', { skills: { paths: ['x/foo/SKILL.md', 'y/bar.md'] } });
    for (const surface of ['pi', 'claude'] as const) {
      const out = renderTaskPrompt({ ...base, specialist: s, surface });
      const helper = buildSkillPrefix(s, surface);
      expect(out.skillPrefix).toBe(helper);
      expect(out.initial_prompt.startsWith(helper)).toBe(true);
    }
  });

  it('reviewer path: prefix wraps task body, execution hook still appended before hash', () => {
    // Reviewer sets appendExecutionContext (diff context) AND has declared skills.
    // Order must be: [skill_prefix][task_body][exec_context] — hash covers all three.
    const s = spec('$prompt', {
      execution: { bare: false, interactive: true },
      skills: { paths: ['x/using-specialists/SKILL.md'] },
    });
    const out = renderTaskPrompt({
      ...base,
      specialist: s,
      surface: 'pi',
      appendExecutionContext: (task) => `${task}\n\nDIFF CONTEXT`,
    });
    expect(out.initial_prompt.startsWith('/skill:using-specialists\n\n')).toBe(true);
    expect(out.initial_prompt.endsWith('DIFF CONTEXT')).toBe(true);
    expect(out.prompt_hash).toBe(createHash('sha256').update(out.initial_prompt).digest('hex').slice(0, 16));
  });
});
