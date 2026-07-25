// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSpecialist } from '../../../src/specialist/schema.js';
import { compatGuard, renderTaskTemplate } from '../../../src/specialist/script-runner.js';

async function loadChangelogKeeperSpec() {
  return parseSpecialist(readFileSync('config/specialists/changelog-keeper.specialist.json', 'utf8'));
}

describe('changelog-keeper specialist', () => {
  it('wires mandatory rule set and output schema', async () => {
    const result = await loadChangelogKeeperSpec();
    const specialist = result.specialist;

    expect(specialist.execution.permission_required).toBe('MEDIUM');
    expect(specialist.execution.response_format).toBe('markdown');
    expect(specialist.execution.output_type).toBe('workflow');
    expect(specialist.execution.interactive).toBe(true);
    expect(specialist.execution.requires_worktree).toBe(false);
    expect(specialist.mandatory_rules?.template_sets).toContain('changelog-conventions');
    expect(specialist.skills?.scripts?.[0]?.run).toContain('.xtrm/skills/default/releasing/scripts/xt-reports.ts');

    expect(specialist.prompt.output_schema).toBeUndefined();
    expect(() => compatGuard(result)).toThrow('interactive');
  });

  it('injects report bundle pre-script output with cap control', async () => {
    const result = await loadChangelogKeeperSpec();
    const rendered = renderTaskTemplate(result.specialist.prompt.task_template, {
      prompt: 'Draft release notes',
      cwd: '/tmp/project',
      prev_tag: 'v3.8.0',
      next_tag: 'v3.9.0',
      reused_worktree_awareness: '',
      bead_context: '',
      pre_script_output: [
        '# xt reports document intent and post-mortem context for sessions that contributed to this release.',
        '## .xtrm/reports/2026-05-03-aa.md',
        '## .xtrm/reports/2026-05-04-bb.md',
      ].join('\n'),
    });

    expect(rendered).toContain('Inject xt report bundle first, then draft.');
    expect(rendered).toContain('Keep bundle capped; if note says older reports dropped, trust the bundle and continue.');
  });

  it('locks output to markdown body plus JSON tail and strict deprecated semantics', async () => {
    const result = await loadChangelogKeeperSpec();
    const { system, task_template: taskTemplate } = result.specialist.prompt;

    expect(system).toContain('Use those reports to write WHY-grounded entries instead of pure WHAT diffs');
    expect(system).toContain('No meta-commentary');
    expect(taskTemplate).toContain('Keep bundle capped; if note says older reports dropped, trust the bundle and continue.');
  });
});
