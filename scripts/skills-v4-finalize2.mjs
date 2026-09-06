import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const write = (path, content) => writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`);
const fromMasterJson = (path) => JSON.parse(execFileSync('git', ['show', `origin/master:${path}`], { encoding: 'utf8' }));

// Restore seconder's proven bounded tree/inversion/direct-caller procedure, then
// apply only the v4 contract and skill-ownership changes.
{
  const path = 'config/specialists/seconder.specialist.json';
  const cfg = fromMasterJson(path);
  cfg.specialist.metadata.version = '1.2.0';
  cfg.specialist.metadata.updated = '2026-09-06';

  let system = cfg.specialist.prompt.system;
  system = system.replace(
    'You are a READ_ONLY seconder specialist. You answer ONE question — did the writer diff satisfy the bead contract sections enough to justify expensive QA? No style review. No release blessing. No broad audit. You do not edit files.',
    'You are a READ_ONLY seconder specialist. You answer ONE question — did the writer diff satisfy the durable Bead contract enough to justify expensive QA? No style review. No release blessing. No broad audit. You do not edit files. The consolidated `engineering-quality` and `gitnexus` skills are loaded; route through their relevant references for review/reduction and impact-analysis procedure.',
  );
  system = system.split('PROBLEM, SUCCESS, SCOPE, NON_GOALS, and VALIDATION').join('PROBLEM, SUCCESS, SCOPE, NON_GOALS, CONSTRAINTS, VALIDATION, and OUTPUT');
  system = system.replace(
    '- PASS: PROBLEM/SUCCESS/SCOPE/VALIDATION are covered and NON_GOALS are respected.',
    '- PASS: PROBLEM/SUCCESS/SCOPE/CONSTRAINTS/VALIDATION/OUTPUT are covered as applicable and NON_GOALS are respected.',
  );
  system = system.replace(
    '- FAIL: clear unmet requirement, out-of-scope change, violated NON_GOALS, missing required validation evidence that the bead demanded, or a sibling caller leaves the stated success condition incomplete.',
    '- FAIL: clear unmet requirement, out-of-scope change, violated NON_GOALS/CONSTRAINTS, missing required validation/output evidence, or a sibling caller leaves the stated success condition incomplete.',
  );
  system = system.split('PROBLEM|SUCCESS|SCOPE|NON_GOALS|VALIDATION').join('PROBLEM|SUCCESS|SCOPE|NON_GOALS|CONSTRAINTS|VALIDATION|OUTPUT');
  system = system.split('clean-code guidance').join('engineering-quality guidance');
  cfg.specialist.prompt.system = system;

  let task = cfg.specialist.prompt.task_template;
  task = task.split('PROBLEM/SUCCESS/SCOPE/NON_GOALS/VALIDATION').join('PROBLEM/SUCCESS/SCOPE/NON_GOALS/CONSTRAINTS/VALIDATION/OUTPUT');
  task = task.split('PROBLEM, SUCCESS, SCOPE, NON_GOALS, VALIDATION').join('PROBLEM, SUCCESS, SCOPE, NON_GOALS, CONSTRAINTS, VALIDATION, OUTPUT');
  cfg.specialist.prompt.task_template = task;

  const sectionEnum = cfg.specialist.prompt.output_schema.properties.scope_findings.items.properties.section.enum;
  for (const section of ['CONSTRAINTS', 'OUTPUT']) if (!sectionEnum.includes(section)) sectionEnum.push(section);

  cfg.specialist.skills.paths = ['engineering-quality', 'gitnexus'];
  cfg.specialist.validation.files_to_watch = [
    'src/specialist/schema.ts',
    'src/specialist/runner.ts',
    'docs/design/chain-templates.md',
    '~/.xtrm/skills/default/engineering-quality/SKILL.md',
    '~/.xtrm/skills/default/gitnexus/SKILL.md',
  ];
  write(path, `${JSON.stringify(cfg, null, 2)}\n`);
}

// Reviewer version changed because its skill ownership changed; retain all
// semantic assertions and update only the version expectation.
{
  const path = 'tests/unit/specialist/review-chain-hardening-config.test.ts';
  let text = read(path);
  text = text.replace("expect(spec.specialist.metadata.version).toBe('2.1.0');", "expect(spec.specialist.metadata.version).toBe('2.2.0');");
  write(path, text);
}

// The production mandatory-rule ceiling deliberately moved from 2000 to 2400
// to keep the expanded non-bypassable fleet contract without evicting existing
// governance. Keep the synthetic eviction/impossible tests above that ceiling.
{
  const path = 'tests/unit/specialist/runner.test.ts';
  let text = read(path);
  text = text.split("'x'.repeat(9000)").join("'x'.repeat(11000)");
  text = text.split('budget_limit: 2000').join('budget_limit: 2400');
  text = text.split('budgetLimit: 2000').join('budgetLimit: 2400');
  write(path, text);
}
{
  const path = 'tests/unit/cli/render-bead.test.ts';
  let text = read(path);
  text = text.replace('budget_limit: 2000', 'budget_limit: 2400');
  write(path, text);
}

console.log('skills-v4 final test reconciler applied');
