import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TODAY = '2026-09-06';
const read = (path) => readFileSync(path, 'utf8');
const write = (path, content) => writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`);

function replaceRequired(path, from, to) {
  const current = read(path);
  if (!current.includes(from)) throw new Error(`${path}: expected text not found: ${from.slice(0, 120)}`);
  write(path, current.replace(from, to));
}

function replaceAll(path, from, to) {
  const current = read(path);
  if (!current.includes(from)) return false;
  write(path, current.split(from).join(to));
  return true;
}

function editJson(path, mutate) {
  const value = JSON.parse(read(path));
  mutate(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fromMasterJson(path) {
  return JSON.parse(execFileSync('git', ['show', `origin/master:${path}`], { encoding: 'utf8' }));
}

function replaceStringDeep(value, replacements) {
  if (typeof value === 'string') {
    let out = value;
    for (const [from, to] of replacements) out = out.split(from).join(to);
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => replaceStringDeep(item, replacements));
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) value[key] = replaceStringDeep(item, replacements);
  }
  return value;
}

// --- Config rewiring -------------------------------------------------------
editJson('config/specialists/planner.specialist.json', (cfg) => {
  replaceStringDeep(cfg, [['test-planning', 'planning']]);
});

editJson('config/specialists/node-coordinator.specialist.json', (cfg) => {
  replaceStringDeep(cfg, [['using-nodes', 'using-specialists']]);
  cfg.specialist.skills.paths = ['using-specialists'];
});

// Restore the full test-engineer behavioral contract from master, then rewire
// only its skill ownership to v4 umbrellas.
{
  const path = 'config/specialists/test-engineer.specialist.json';
  const cfg = fromMasterJson(path);
  cfg.specialist.metadata.version = '1.1.0';
  cfg.specialist.metadata.updated = TODAY;
  cfg.specialist.skills.paths = ['planning', 'engineering-quality'];
  replaceStringDeep(cfg, [
    ['~/.xtrm/skills/default/test-planning', 'planning'],
    ['config/skills/specialists-creator/scripts/scaffold-specialist.ts', 'config/skills/using-specialists/scripts/specialist-definitions/scaffold-specialist.ts'],
    ['test-planning', 'planning'],
  ]);
  write(path, `${JSON.stringify(cfg, null, 2)}\n`);
}

editJson('config/specialists/service-knowledge-sync.specialist.json', (cfg) => {
  cfg.specialist.metadata.version = '1.11.0';
  cfg.specialist.metadata.updated = TODAY;
  cfg.specialist.skills.paths = ['service-knowledge', 'gitnexus'];
});

editJson('config/specialists/reviewer.specialist.json', (cfg) => {
  cfg.specialist.metadata.version = '2.2.0';
  cfg.specialist.metadata.updated = TODAY;
  cfg.specialist.skills.paths = ['engineering-quality', 'gitnexus'];
  const keep = (cfg.specialist.validation?.files_to_watch ?? []).filter((path) =>
    !path.includes('verified-audit') &&
    !path.includes('using-quality-gates') &&
    !path.includes('.agents/skills/clean-code'),
  );
  cfg.specialist.validation.files_to_watch = [
    ...keep,
    '~/.xtrm/skills/default/engineering-quality/SKILL.md',
    '~/.xtrm/skills/default/gitnexus/SKILL.md',
  ];
});

for (const name of ['quant-methodologist', 'quant-researcher']) {
  editJson(`config/specialists/${name}.specialist.json`, (cfg) => {
    cfg.specialist.metadata.version = '1.0.1';
    cfg.specialist.metadata.updated = TODAY;
    cfg.specialist.validation.files_to_watch = (cfg.specialist.validation?.files_to_watch ?? [])
      .filter((path) => !path.includes('specialists-creator/SKILL.md'));
  });
}

// The v4 skill-path pass accidentally compressed security-auditor's proven
// methodology. Restore the current master methodology and change only skill
// ownership/version metadata.
{
  const path = 'config/specialists/security-auditor.specialist.json';
  const cfg = fromMasterJson(path);
  cfg.specialist.metadata.version = '1.2.0';
  cfg.specialist.metadata.updated = TODAY;
  cfg.specialist.skills.paths = [
    '~/.xtrm/skills/optional/security-ops/security-ops/SKILL.md',
    '~/.xtrm/skills/optional/research-methods/research/SKILL.md',
  ];
  cfg.specialist.validation.files_to_watch = [
    'src/specialist/schema.ts',
    'src/specialist/runner.ts',
    '~/.xtrm/skills/optional/security-ops/security-ops/SKILL.md',
    '~/.xtrm/skills/optional/research-methods/research/SKILL.md',
  ];
  write(path, `${JSON.stringify(cfg, null, 2)}\n`);
}

// --- Bare specialists: required platform rule only ------------------------
write('src/specialist/required-platform-rules.ts', `import {
  buildMandatoryRulesInjection,
  compileMandatoryRulesBudget,
  type MandatoryRulesInjection,
} from './mandatory-rules.js';

/**
 * Bare specialists skip ordinary/default/specialist rule stacks, but they do
 * not leave the XTRM work system. Resolve the canonical index with globals and
 * specialist-local rules disabled, then retain only required MUST_KEEP sets.
 */
export function buildRequiredPlatformRulesInjection(
  cwd: string,
  budgetLimit = Number.POSITIVE_INFINITY,
): MandatoryRulesInjection {
  const resolved = buildMandatoryRulesInjection({
    cwd,
    specialist: {
      mandatory_rules: {
        disable_default_globals: true,
        template_sets: [],
        inline_rules: [],
      },
    },
  });

  const requiredCandidates = resolved.sections.filter((section) => section.priority === 'must_keep');
  const compiled = compileMandatoryRulesBudget(requiredCandidates, budgetLimit);
  const injectedIds = new Set(compiled.injectedSectionIds);
  const retainedRequired = requiredCandidates.filter((section) => injectedIds.has(section.setId));

  return {
    ...resolved,
    ...compiled,
    setsLoaded: retainedRequired.map((section) => section.setId),
    ruleCount: retainedRequired.reduce((count, section) => count + section.ruleCount, 0),
    inlineRulesCount: 0,
    globalsDisabled: true,
  };
}

export function buildRequiredPlatformRulesBlock(
  cwd: string,
  budgetLimit = Number.POSITIVE_INFINITY,
): string {
  return buildRequiredPlatformRulesInjection(cwd, budgetLimit).block;
}
`);

replaceRequired(
  'src/specialist/runner.ts',
  "import { MandatoryRulesBudgetError } from './mandatory-rules.js';",
  "import { MandatoryRulesBudgetError } from './mandatory-rules.js';\nimport { buildRequiredPlatformRulesBlock } from './required-platform-rules.js';",
);
replaceRequired(
  'src/specialist/runner.ts',
  "    let agentsMd = renderTemplate(prompt.system ?? '', beadTemplateVariables);\n\n    // Always inject a Specialist Run Context block",
  "    let agentsMd = renderTemplate(prompt.system ?? '', beadTemplateVariables);\n\n    // Bare mode remains a fresh specialist canvas, but required platform rules\n    // are non-bypassable because the worker still participates in XTRM.\n    if (execution.bare) {\n      const requiredPlatformRulesBlock = buildRequiredPlatformRulesBlock(runCwd);\n      if (requiredPlatformRulesBlock.trim()) agentsMd += `\\n\\n${requiredPlatformRulesBlock}`;\n    }\n\n    // Always inject a Specialist Run Context block",
);

replaceRequired(
  'src/specialist/script-runner.ts',
  "import { buildMandatoryRulesInjection } from './mandatory-rules.js';",
  "import { buildMandatoryRulesInjection } from './mandatory-rules.js';\nimport { buildRequiredPlatformRulesBlock } from './required-platform-rules.js';",
);
replaceRequired(
  'src/specialist/script-runner.ts',
  `    let prompt = applyOutputContract(renderTaskTemplate(template, variables), spec);\n    if (!spec.specialist.execution.bare) {\n      try {\n        const mandatoryRulesBlock = buildMandatoryRulesInjection({ cwd: baseDir, specialist: spec.specialist }).block;\n        if (mandatoryRulesBlock.trim()) prompt = \`${'${prompt}'}\\n\\n${'${mandatoryRulesBlock}'}\`;\n      } catch (error) {\n        console.warn(\`[script-runner] Skipping MANDATORY_RULES injection: ${'${String(error)}'}\`);\n      }\n    }`,
  `    let prompt = applyOutputContract(renderTaskTemplate(template, variables), spec);\n    try {\n      const mandatoryRulesBlock = spec.specialist.execution.bare\n        ? buildRequiredPlatformRulesBlock(baseDir)\n        : buildMandatoryRulesInjection({ cwd: baseDir, specialist: spec.specialist }).block;\n      if (mandatoryRulesBlock.trim()) prompt = \`${'${prompt}'}\\n\\n${'${mandatoryRulesBlock}'}\`;\n    } catch (error) {\n      console.warn(\`[script-runner] Skipping MANDATORY_RULES injection: ${'${String(error)}'}\`);\n    }`,
);

// The expanded non-bypassable platform doctrine is deliberate. Keep all
// existing production governance sections instead of silently evicting one.
replaceRequired('src/specialist/task-prompt.ts', 'export const MANDATORY_RULES_TOKEN_LIMIT = 2000;', 'export const MANDATORY_RULES_TOKEN_LIMIT = 2400;');
replaceRequired(
  'tests/unit/specialist/mandatory-rules.test.ts',
  "const result = buildMandatoryRulesInjection({ cwd: process.cwd(), specialist: config.specialist }, 2000);",
  "const result = buildMandatoryRulesInjection({ cwd: process.cwd(), specialist: config.specialist }, 2400);",
);

// --- Bare-mode docs --------------------------------------------------------
{
  const path = 'docs/bare-specialists.md';
  let doc = read(path);
  doc = doc.replace('version: 1.0.0', 'version: 1.1.0').replace('updated: 2026-05-23', `updated: ${TODAY}`);
  doc = doc.replace('  - "config/skills/specialists-creator/SKILL.md"', '  - "config/skills/using-specialists/references/specialist-definitions.md"');
  doc = doc.replace(
    'Bare mode runs specialist prompt with runtime injections stripped away, so output starts from only `prompt.system` plus `prompt.task_template` and does not pick up package-class specialist framing.',
    'Bare mode strips ordinary Specialist runtime framing while retaining XTRM required platform rules. The agent still receives `prompt.system` plus `prompt.task_template`, but it cannot opt out of the fleet work-system boundary.',
  );
  doc = doc.replace('| task-side mandatory rules | yes |', '| default/specialist mandatory rules | yes |\n| required platform mandatory rules | **no — always retained** |');
  doc = doc.replace('| `true` | `append` | bare runtime; only `prompt.system` plus `prompt.task_template` matter |', '| `true` | `append` | bare runtime; prompt content plus required XTRM platform rules |');
  doc = doc.replace('| `true` | `replace` | bare runtime; same stripped surface, with base prompt removed too |', '| `true` | `replace` | bare runtime; base prompt removed, required XTRM platform rules still retained |');
  doc = doc.replace('bun config/skills/specialists-creator/scripts/validate-specialist.ts <path>', 'bun config/skills/using-specialists/scripts/specialist-definitions/validate-specialist.ts <path>');
  doc = doc.replace('- Bare mode bypasses `mandatory_rules` entirely; put needed rules directly in `prompt.system` text instead.', '- Bare mode bypasses default and Specialist-selected `mandatory_rules`, but package `required_template_sets` remain non-bypassable. Put role-specific behavior in `prompt.system`; do not duplicate platform rules there.');
  write(path, doc);
}

{
  const path = 'config/skills/using-specialists/references/specialist-definitions.md';
  let doc = read(path);
  if (!doc.includes('Bare-mode invariant')) {
    doc += `\n## Bare-mode invariant\n\n\`execution.bare: true\` removes ordinary Specialist framing, default rules, and specialist-selected rules, but it does **not** remove package \`required_template_sets\`. Bare workers are still XTRM system participants and always receive the fleet boundary.\n`;
  }
  write(path, doc);
}

// --- Tests: v4 ownership, not retired path spelling -----------------------
replaceAll(
  'tests/unit/skills/using-specialists-layout.test.ts',
  "~/.xtrm/skills/default/using-specialists/SKILL.md",
  'using-specialists',
);
replaceAll('tests/unit/specialist/review-chain-hardening-config.test.ts', "metadata.version).toBe('1.1.0')", "metadata.version).toBe('1.2.0')");

{
  const path = 'tests/unit/specialist/service-knowledge-sync-config.test.ts';
  let test = read(path);
  test = test.replace("{ version: '1.10.0', updated: '2026-09-02' }", "{ version: '1.11.0', updated: '2026-09-06' }");
  test = test.replace(
`    expect(SPECIALIST.skills?.paths).toEqual([\n      'service-knowledge',\n      '~/.xtrm/skills/default/gitnexus-impact-analysis',\n      '~/.xtrm/skills/default/gitnexus-exploring',\n    ]);`,
`    expect(SPECIALIST.skills?.paths).toEqual(['service-knowledge', 'gitnexus']);`,
  );
  test = test.replace(
`    expect(paths.map((path) => path.split('/').at(-1))).toEqual([\n      'service-knowledge',\n      'gitnexus-impact-analysis',\n      'gitnexus-exploring',\n    ]);`,
`    expect(paths.map((path) => path.split('/').at(-1))).toEqual(['service-knowledge', 'gitnexus']);`,
  );
  test = test.replace("expect(pi).toBe('/skill:service-knowledge /skill:gitnexus-impact-analysis /skill:gitnexus-exploring\\n\\n');", "expect(pi).toBe('/skill:service-knowledge /skill:gitnexus\\n\\n');");
  test = test.replace("expect(claude).toBe('/service-knowledge\\n/gitnexus-impact-analysis\\n/gitnexus-exploring\\n\\n');", "expect(claude).toBe('/service-knowledge\\n/gitnexus\\n\\n');");
  write(path, test);
}

write('tests/unit/specialist/skills-v4-config-audit.test.ts', `import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildMandatoryRulesInjection } from '../../../src/specialist/mandatory-rules.js';
import { buildRequiredPlatformRulesInjection } from '../../../src/specialist/required-platform-rules.js';

const repoRoot = process.cwd();
const specialistsDir = join(repoRoot, 'config', 'specialists');

const retiredSkillTokens = [
  'test-planning',
  'using-nodes',
  'specialists-creator/SKILL.md',
  'default/xt-merge',
  'default/xt-debugging',
  'default/clean-code',
  'gitnexus-exploring',
  'gitnexus-impact-analysis',
  'default/find-docs',
  'default/deepwiki',
  'default/github-search',
  'default/last30days',
  'verified-audit',
  '.agents/skills/using-quality-gates',
  '.agents/skills/clean-code',
];

const readSpec = (name: string) => JSON.parse(readFileSync(join(specialistsDir, \`${'${name}'}.specialist.json\`), 'utf8'));

describe('skills-v4 default specialist wiring', () => {
  it('contains no retired v3 skill references in package specialist configs', () => {
    const files = readdirSync(specialistsDir).filter((name) => name.endsWith('.specialist.json')).sort();
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(specialistsDir, file), 'utf8');
      for (const token of retiredSkillTokens) if (text.includes(token)) violations.push(\`${'${file}'}: ${'${token}'}\`);
    }
    expect(violations).toEqual([]);
  });

  it('wires v4 umbrellas to specialists that materially depend on them', () => {
    expect(readSpec('planner').specialist.skills.paths).toEqual(['planning']);
    expect(readSpec('chain-coordinator').specialist.skills.paths).toEqual(['using-specialists']);
    expect(readSpec('node-coordinator').specialist.skills.paths).toEqual(['using-specialists']);
    expect(readSpec('specialists-creator').specialist.skills.paths).toEqual(['using-specialists']);
    expect(readSpec('debugger').specialist.skills.paths).toEqual(['engineering-quality', 'gitnexus']);
    expect(readSpec('explorer').specialist.skills.paths).toEqual(['gitnexus']);
    expect(readSpec('seconder').specialist.skills.paths).toEqual(['engineering-quality', 'gitnexus']);
    expect(readSpec('test-engineer').specialist.skills.paths).toEqual(['planning', 'engineering-quality']);
    expect(readSpec('researcher').specialist.skills.paths).toEqual(['~/.xtrm/skills/optional/research-methods/research/SKILL.md']);
    expect(readSpec('security-auditor').specialist.skills.paths).toEqual([
      '~/.xtrm/skills/optional/security-ops/security-ops/SKILL.md',
      '~/.xtrm/skills/optional/research-methods/research/SKILL.md',
    ]);
    expect(readSpec('sync-docs').specialist.skills.paths).toEqual(['~/.xtrm/skills/optional/xtrm-maintenance/sync-docs/']);
    expect(readSpec('service-knowledge-sync').specialist.skills.paths).toEqual(['service-knowledge', 'gitnexus']);
    expect(readSpec('reviewer').specialist.skills.paths).toEqual(['engineering-quality', 'gitnexus']);
    expect(readSpec('xt-merge').specialist.skills.paths).toEqual([]);
  });

  it('keeps the fleet boundary required even when ordinary global quick rules are disabled', () => {
    const injection = buildMandatoryRulesInjection({
      cwd: repoRoot,
      specialist: { mandatory_rules: { disable_default_globals: true, template_sets: [] } },
    });
    expect(injection.globalsDisabled).toBe(true);
    expect(injection.setsLoaded).toContain('core-session-boundary');
    expect(injection.block).toContain('one worker in XTRM');
    expect(injection.block).toContain('PROBLEM/SUCCESS/SCOPE/NON_GOALS/CONSTRAINTS/VALIDATION/OUTPUT');
    expect(injection.block).toContain('service-knowledge');
    expect(injection.block).toContain('bd memories');
    expect(injection.block).toContain('ast-grep');
    expect(injection.block).toContain('python-kernel');
    expect(injection.block).toContain('route through its references');
  });

  it('reduces bare mode to required platform rules only across both runners', () => {
    const injection = buildRequiredPlatformRulesInjection(repoRoot, 2400);
    expect(injection.setsLoaded).toEqual(['core-session-boundary']);
    expect(injection.block).toContain('core-session-boundary');
    expect(injection.block).not.toContain('git-workflow-safe');
    expect(injection.block).not.toContain('workflow-quick-rules');
    for (const path of ['src/specialist/runner.ts', 'src/specialist/script-runner.ts']) {
      expect(readFileSync(join(repoRoot, path), 'utf8')).toContain('buildRequiredPlatformRulesBlock');
    }
  });
});
`);

// Preserve existing test-engineer semantic assertions by restoring the complete
// role contract above; only ownership/path assertions are v4-specific.

// --- Final hard audit ------------------------------------------------------
const retired = [
  'test-planning',
  'using-nodes',
  'specialists-creator/SKILL.md',
  'default/xt-merge',
  'default/xt-debugging',
  'default/clean-code',
  'gitnexus-exploring',
  'gitnexus-impact-analysis',
  'default/find-docs',
  'default/deepwiki',
  'default/github-search',
  'default/last30days',
  'verified-audit',
  '.agents/skills/using-quality-gates',
  '.agents/skills/clean-code',
];
const violations = [];
for (const file of readdirSync('config/specialists').filter((name) => name.endsWith('.specialist.json'))) {
  const text = read(join('config/specialists', file));
  for (const token of retired) if (text.includes(token)) violations.push(`${file}: ${token}`);
}
if (violations.length) throw new Error(`retired v3 references remain:\n${violations.join('\n')}`);

if (!existsSync('src/specialist/required-platform-rules.ts')) throw new Error('required platform rules helper missing');
console.log('skills-v4 finalizer applied');
