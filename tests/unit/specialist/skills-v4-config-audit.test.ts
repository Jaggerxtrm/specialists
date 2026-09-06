import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildMandatoryRulesInjection } from '../../../src/specialist/mandatory-rules.js';

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
];

describe('skills-v4 default specialist wiring', () => {
  it('contains no retired v3 skill references in package specialist configs', () => {
    const files = readdirSync(specialistsDir)
      .filter((name) => name.endsWith('.specialist.json'))
      .sort();

    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(specialistsDir, file), 'utf8');
      for (const token of retiredSkillTokens) {
        if (text.includes(token)) violations.push(`${file}: ${token}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('wires consolidated skills to the specialists that materially depend on them', () => {
    const read = (name: string) => JSON.parse(readFileSync(join(specialistsDir, `${name}.specialist.json`), 'utf8'));

    expect(read('planner').specialist.skills.paths).toEqual(['planning']);
    expect(read('chain-coordinator').specialist.skills.paths).toEqual(['using-specialists']);
    expect(read('node-coordinator').specialist.skills.paths).toEqual(['using-specialists']);
    expect(read('specialists-creator').specialist.skills.paths).toEqual(['using-specialists']);
    expect(read('debugger').specialist.skills.paths).toEqual(['engineering-quality', 'gitnexus']);
    expect(read('explorer').specialist.skills.paths).toEqual(['gitnexus']);
    expect(read('seconder').specialist.skills.paths).toEqual(['engineering-quality', 'gitnexus']);
    expect(read('researcher').specialist.skills.paths).toEqual([
      '~/.xtrm/skills/optional/research-methods/research/SKILL.md',
    ]);
    expect(read('security-auditor').specialist.skills.paths).toEqual([
      '~/.xtrm/skills/optional/security-ops/security-ops/SKILL.md',
      '~/.xtrm/skills/optional/research-methods/research/SKILL.md',
    ]);
    expect(read('sync-docs').specialist.skills.paths).toEqual([
      '~/.xtrm/skills/optional/xtrm-maintenance/sync-docs/',
    ]);
    expect(read('xt-merge').specialist.skills.paths).toEqual([]);
  });

  it('loads the system-participant invariant even when ordinary global quick rules are disabled', () => {
    const injection = buildMandatoryRulesInjection({
      cwd: repoRoot,
      specialist: {
        mandatory_rules: {
          disable_default_globals: true,
          template_sets: [],
        },
      },
    });

    expect(injection.globalsDisabled).toBe(true);
    expect(injection.setsLoaded).toContain('system-participant');
    expect(injection.block).toContain('one worker in a coordinated XTRM system');
    expect(injection.block).toContain('PROBLEM, SUCCESS, SCOPE, NON_GOALS, CONSTRAINTS, VALIDATION, or OUTPUT');
    expect(injection.block).toContain('service-knowledge');
    expect(injection.block).toContain('bd memories');
  });
});
