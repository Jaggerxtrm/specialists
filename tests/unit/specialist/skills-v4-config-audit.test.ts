import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildMandatoryRulesInjection } from '../../../src/specialist/mandatory-rules.js';

const repoRoot = process.cwd();
const specialistsDir = join(repoRoot, 'config', 'specialists');

const retiredSkillPathTokens = [
  'test-planning',
  'using-nodes',
  'specialists-creator',
  'xt-merge',
  'xt-debugging',
  'clean-code',
  'gitnexus-exploring',
  'gitnexus-impact-analysis',
  'find-docs',
  'deepwiki',
  'github-search',
  'last30days',
  'using-quality-gates',
  'verified-audit',
];

const read = (name: string) => JSON.parse(
  readFileSync(join(specialistsDir, `${name}.specialist.json`), 'utf8'),
);

describe('skills-v4 default specialist wiring', () => {
  it('contains no retired v3 entries in specialist skills.paths', () => {
    const files = readdirSync(specialistsDir)
      .filter((name) => name.endsWith('.specialist.json'))
      .sort();

    const violations: string[] = [];
    for (const file of files) {
      const spec = JSON.parse(readFileSync(join(specialistsDir, file), 'utf8'));
      const paths = spec?.specialist?.skills?.paths ?? [];
      for (const path of paths) {
        for (const token of retiredSkillPathTokens) {
          if (String(path).includes(token)) violations.push(`${file}: ${path}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('wires consolidated skills to specialists that materially depend on them', () => {
    expect(read('planner').specialist.skills.paths).toEqual(['planning']);
    expect(read('chain-coordinator').specialist.skills.paths).toEqual(['using-specialists']);
    expect(read('node-coordinator').specialist.skills.paths).toEqual(['using-specialists']);
    expect(read('specialists-creator').specialist.skills.paths).toEqual(['using-specialists']);
    expect(read('debugger').specialist.skills.paths).toEqual(['engineering-quality', 'gitnexus']);
    expect(read('explorer').specialist.skills.paths).toEqual(['gitnexus']);
    expect(read('seconder').specialist.skills.paths).toEqual(['engineering-quality', 'gitnexus']);
    expect(read('test-engineer').specialist.skills.paths).toEqual(['planning', 'engineering-quality']);
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

  it('keeps the coordinated-system contract in the required core boundary when quick rules are disabled', () => {
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
    expect(injection.setsLoaded).toContain('core-session-boundary');
    expect(injection.block).toContain('one worker in XTRM');
    expect(injection.block).toContain('PROBLEM/SUCCESS/SCOPE/NON_GOALS/CONSTRAINTS/VALIDATION/OUTPUT');
    expect(injection.block).toContain('service-knowledge');
    expect(injection.block).toContain('bd memories');
    expect(injection.block).toContain('ask the coordinator');
  });
});
