import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const packageCanonicalDirs = new Map<string, string | null>();

vi.mock('../../../src/specialist/canonical-asset-resolver.js', () => ({
  resolveCanonicalAssetDir: (kind: string) => packageCanonicalDirs.get(kind) ?? null,
}));

import {
  MandatoryRulesBudgetError,
  buildMandatoryRulesInjection,
  compileMandatoryRulesBudget,
  type MandatoryRulesSection,
} from '../../../src/specialist/mandatory-rules.js';

function captureWarnings<T>(fn: () => T): { result: T; warnings: string[] } {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };

  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

const inlineRule = {
  id: 'inline-1',
  level: 'warn',
  text: 'Keep changes focused.',
};

function setPackageCanonicalDir(dirPath: string | null): void {
  if (dirPath === null) {
    packageCanonicalDirs.delete('mandatory-rules');
    return;
  }

  packageCanonicalDirs.set('mandatory-rules', dirPath);
}

describe('mandatory rules resolution', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mandatory-rules-test-'));
    packageCanonicalDirs.clear();
  });

  afterEach(async () => {
    packageCanonicalDirs.clear();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves precedence required sets, default sets, specialist sets, then inline rules', async () => {
    await mkdir(join(tempDir, 'config', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, 'config', 'mandatory-rules', 'index.json'),
      JSON.stringify({
        required_template_sets: ['core-session-boundary'],
        default_template_sets: ['git-workflow-safe'],
      }),
    );
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'core-session-boundary.md'), '---\nrules:\n  - id: boundary-1\n    level: error\n    text: stay inside boundary\n---\n');
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'git-workflow-safe.md'), '---\nrules:\n  - id: git-1\n    level: error\n    text: keep history linear\n---\n');
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'specialist-extra.md'), '---\nrules:\n  - id: extra-1\n    level: info\n    text: specialist extra\n---\n');
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'duplicate-set.md'), '---\nrules:\n  - id: dup-1\n    level: info\n    text: duplicate set\n---\n');

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          template_sets: ['specialist-extra'],
          inline_rules: [inlineRule],
        },
      },
    }));

    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'core-session-boundary', 'git-workflow-safe', 'specialist-extra']);
    expect(result.inlineRulesCount).toBe(1);
    expect(result.ruleCount).toBe(5);
    expect(result.block).toContain('### workflow-quick-rules');
    expect(result.block).toContain('### core-session-boundary');
    expect(result.block).toContain('### git-workflow-safe');
    expect(result.block).toContain('### specialist-extra');
    expect(result.block).toContain('### specialist-inline-rules');
    expect((result.block.match(/^### /gm) ?? []).length).toBe(5);
    expect(result.sections.map(section => section.setId)).toEqual([
      'workflow-quick-rules',
      'core-session-boundary',
      'git-workflow-safe',
      'specialist-extra',
      'specialist-inline-rules',
    ]);
    expect(result.sections.map(section => section.priority)).toEqual([
      'must_keep',
      'must_keep',
      'important',
      'optional',
      'must_keep',
    ]);
    expect(result.sections.every(section => section.block.length > 0)).toBe(true);
  });

  it('warns when requested set file missing', () => {
    const { result, warnings } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          template_sets: ['missing-set'],
        },
      },
    }));

    expect(result.setsLoaded).toEqual(['workflow-quick-rules']);
    expect(warnings.join('\n')).toContain('Missing mandatory-rules set: missing-set');
  });

  it('dedupes duplicate template_sets by first occurrence', async () => {
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'duplicate-set.md'), '---\nrules:\n  - id: dup-1\n    level: info\n    text: duplicate set\n---\n');

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          template_sets: ['duplicate-set', 'duplicate-set'],
        },
      },
    }));

    expect(result.setsLoaded.filter((set) => set === 'duplicate-set')).toHaveLength(1);
    expect(result.block).toContain('### duplicate-set');
  });

  it('replacing specialist-specific template_sets drops removed sets while index policy stays (unitAI-klo6k)', async () => {
    await mkdir(join(tempDir, 'config', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, 'config', 'mandatory-rules', 'index.json'),
      JSON.stringify({
        required_template_sets: ['core-session-boundary'],
        default_template_sets: ['git-workflow-safe'],
      }),
    );
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    for (const id of ['core-session-boundary', 'git-workflow-safe', 'old-set', 'specialist-extra']) {
      await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', `${id}.md`), `---\nrules:\n  - id: ${id}-1\n    level: required\n    text: ${id} rule\n---\n`);
    }

    // Mirrors the loader result after a global `template_sets` replacement:
    // the old package-specific set is gone from the merged spec.
    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          template_sets: ['specialist-extra'],
        },
      },
    }));

    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'core-session-boundary', 'git-workflow-safe', 'specialist-extra']);
    expect(result.block).toContain('### specialist-extra');
    expect(result.block).not.toContain('### old-set');
    // Required and default index policy untouched by the replacement.
    expect(result.block).toContain('### core-session-boundary');
    expect(result.block).toContain('### git-workflow-safe');
  });

  it('explicit empty template_sets selects no specialist-specific sets while index policy always loads (unitAI-klo6k)', async () => {
    await mkdir(join(tempDir, 'config', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, 'config', 'mandatory-rules', 'index.json'),
      JSON.stringify({
        required_template_sets: ['core-session-boundary'],
        default_template_sets: ['git-workflow-safe'],
      }),
    );
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    for (const id of ['core-session-boundary', 'git-workflow-safe', 'stale-set']) {
      await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', `${id}.md`), `---\nrules:\n  - id: ${id}-1\n    level: required\n    text: ${id} rule\n---\n`);
    }

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          template_sets: [],
        },
      },
    }));

    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'core-session-boundary', 'git-workflow-safe']);
    expect(result.block).not.toContain('### stale-set');
    expect(result.block).toContain('### core-session-boundary');
    expect(result.block).toContain('### git-workflow-safe');
  });

  it('disables default globals when specialist opts out', () => {
    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          disable_default_globals: true,
          inline_rules: [inlineRule],
        },
      },
    }));

    expect(result.globalsDisabled).toBe(true);
    expect(result.setsLoaded).toEqual([]);
    expect(result.block).not.toContain('workflow-quick-rules');
    expect(result.block).toContain('### specialist-inline-rules');
    expect((result.block.match(/^### /gm) ?? []).length).toBe(1);
  });

  it('keeps inline rules in metadata and block', () => {
    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          inline_rules: [inlineRule],
        },
      },
    }));

    expect(result.inlineRulesCount).toBe(1);
    expect(result.ruleCount).toBe(2);
    expect(result.block).toContain('id: inline-1');
    expect(result.block).toContain('Keep changes focused.');
    expect((result.block.match(/^- \[/gm) ?? []).length).toBe(2);
  });

  it('merges repo-specific .specialists/mandatory-rules/index.json with canonical config', async () => {
    await mkdir(join(tempDir, 'config', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, 'config', 'mandatory-rules', 'index.json'),
      JSON.stringify({
        required_template_sets: ['core-session-boundary'],
        default_template_sets: ['git-workflow-safe'],
      }),
    );
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'default', 'mandatory-rules', 'index.json'),
      JSON.stringify({
        default_template_sets: ['bun-native-tooling', 'git-workflow-safe'],
      }),
    );
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'core-session-boundary.md'), '---\nrules:\n  - id: boundary-1\n    level: error\n    text: stay inside boundary\n---\n');
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'git-workflow-safe.md'), '---\nrules:\n  - id: git-1\n    level: error\n    text: keep history linear\n---\n');
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'bun-native-tooling.md'), '---\nrules:\n  - id: bun-1\n    level: required\n    text: use bunx not npx\n---\n');

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {},
    }));

    expect(result.setsLoaded).toEqual(expect.arrayContaining(['workflow-quick-rules', 'core-session-boundary', 'git-workflow-safe', 'bun-native-tooling']));
    expect(result.block).toContain('### bun-native-tooling');
    expect(result.block).toContain('use bunx not npx');
  });


  it('loads repo-local .specialists/mandatory-rules set files referenced by repo-local index', async () => {
    await mkdir(join(tempDir, '.specialists', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'mandatory-rules', 'index.json'),
      JSON.stringify({ default_template_sets: ['bun-native-tooling'] }),
    );
    await writeFile(
      join(tempDir, '.specialists', 'mandatory-rules', 'bun-native-tooling.md'),
      '---\nrules:\n  - id: bun-1\n    level: required\n    text: use bunx not npx\n---\n',
    );

    const { result, warnings } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {},
    }));

    expect(warnings).toHaveLength(0);
    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'bun-native-tooling']);
    expect(result.block).toContain('### bun-native-tooling');
    expect(result.block).toContain('use bunx not npx');
  });

  it('loads repo-specific index alone when canonical config absent', async () => {
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'default', 'mandatory-rules', 'index.json'),
      JSON.stringify({
        default_template_sets: ['bun-native-tooling'],
      }),
    );
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'bun-native-tooling.md'), '---\nrules:\n  - id: bun-1\n    level: required\n    text: use bunx not npx\n---\n');

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {},
    }));

    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'bun-native-tooling']);
    expect(result.block).toContain('### bun-native-tooling');
  });

  it('reads canonical index from .specialists/default/ when config/ absent (downstream repo)', async () => {
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'default', 'mandatory-rules', 'index.json'),
      JSON.stringify({ default_template_sets: ['git-workflow-safe'] }),
    );
    await writeFile(
      join(tempDir, '.specialists', 'default', 'mandatory-rules', 'git-workflow-safe.md'),
      '---\nrules:\n  - id: git-1\n    level: error\n    text: keep history linear\n---\n',
    );

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {},
    }));

    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'git-workflow-safe']);
    expect(result.block).toContain('### git-workflow-safe');
  });

  it('resolves canonical mandatory rule by name from package', async () => {
    const packageDir = await mkdtemp(join(tmpdir(), 'mandatory-rules-package-'));
    await mkdir(join(packageDir, 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(packageDir, 'mandatory-rules', 'index.json'),
      JSON.stringify({ default_template_sets: ['serena-cheatsheet'] }),
    );
    await writeFile(
      join(packageDir, 'mandatory-rules', 'serena-cheatsheet.md'),
      '---\nrules:\n  - id: serena-1\n    level: required\n    text: canonical serena rule\n---\n',
    );
    setPackageCanonicalDir(join(packageDir, 'mandatory-rules'));

    const { result, warnings } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          template_sets: ['serena-cheatsheet'],
        },
      },
    }));

    expect(warnings).toHaveLength(0);
    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'serena-cheatsheet']);
    expect(result.block).toContain('canonical serena rule');
  });

  it('prefers user-tier override over package canonical rule', async () => {
    const packageDir = await mkdtemp(join(tmpdir(), 'mandatory-rules-package-'));
    await mkdir(join(packageDir, 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(packageDir, 'mandatory-rules', 'index.json'),
      JSON.stringify({ default_template_sets: ['serena-cheatsheet'] }),
    );
    await writeFile(
      join(packageDir, 'mandatory-rules', 'serena-cheatsheet.md'),
      '---\nrules:\n  - id: serena-1\n    level: required\n    text: canonical serena rule\n---\n',
    );
    setPackageCanonicalDir(join(packageDir, 'mandatory-rules'));
    await mkdir(join(tempDir, '.specialists', 'user', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'user', 'mandatory-rules', 'serena-cheatsheet.md'),
      '---\nrules:\n  - id: serena-override\n    level: required\n    text: user override rule\n---\n',
    );

    const { result, warnings } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          template_sets: ['serena-cheatsheet'],
        },
      },
    }));

    expect(warnings).toHaveLength(0);
    expect(result.block).toContain('user override rule');
    expect(result.block).not.toContain('canonical serena rule');
  });

  it('merges all three tiers: config/, .specialists/default/, .specialists/', async () => {
    await mkdir(join(tempDir, 'config', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, 'config', 'mandatory-rules', 'index.json'),
      JSON.stringify({ required_template_sets: ['core-session-boundary'] }),
    );
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'default', 'mandatory-rules', 'index.json'),
      JSON.stringify({ default_template_sets: ['git-workflow-safe'] }),
    );
    await mkdir(join(tempDir, '.specialists', 'user', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'user', 'mandatory-rules', 'index.json'),
      JSON.stringify({ default_template_sets: ['bun-native-tooling'] }),
    );
    await writeFile(join(tempDir, 'config', 'mandatory-rules', 'core-session-boundary.md'), '---\nrules:\n  - id: b-1\n    level: error\n    text: boundary\n---\n');
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'git-workflow-safe.md'), '---\nrules:\n  - id: g-1\n    level: error\n    text: linear\n---\n');
    await writeFile(join(tempDir, '.specialists', 'user', 'mandatory-rules', 'bun-native-tooling.md'), '---\nrules:\n  - id: bun-1\n    level: required\n    text: use bunx\n---\n');

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {},
    }));

    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'core-session-boundary', 'bun-native-tooling', 'git-workflow-safe']);
    expect(result.block).toContain('### core-session-boundary');
    expect(result.block).toContain('### git-workflow-safe');
    expect(result.block).toContain('### bun-native-tooling');
  });

  it('user override set wins over default set with same id', async () => {
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'default', 'mandatory-rules', 'git-workflow-safe.md'),
      '---\nrules:\n  - id: canonical\n    level: info\n    text: canonical version\n---\n',
    );
    await mkdir(join(tempDir, '.specialists', 'user', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'user', 'mandatory-rules', 'git-workflow-safe.md'),
      '---\nrules:\n  - id: overlay\n    level: error\n    text: overlay version\n---\n',
    );

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: { template_sets: ['git-workflow-safe'] },
      },
    }));

    expect(result.block).toContain('overlay version');
    expect(result.block).not.toContain('canonical version');
  });

  it('falls back gracefully when index missing', () => {
    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {
        mandatory_rules: {
          inline_rules: [inlineRule],
        },
      },
    }));

    expect(result.block).toContain('### specialist-inline-rules');
    expect(result.setsLoaded).toEqual(['workflow-quick-rules']);
    expect(result.ruleCount).toBe(2);
  });
});

describe('mandatory rules budget compiler', () => {
  const section = (
    setId: string,
    priority: MandatoryRulesSection['priority'],
    text: string,
  ): MandatoryRulesSection => ({ setId, priority, ruleCount: 1, block: `### ${setId}\n${text}` });

  it('injects every section at the exact token limit', () => {
    const sections = [section('floor', 'must_keep', 'safe'), section('extra', 'optional', 'useful')];
    const candidate = `## MANDATORY_RULES\n${sections.map((item) => item.block).join('\n\n')}`;
    const result = compileMandatoryRulesBudget(sections, Math.ceil(candidate.length / 4));

    expect(result.outcome).toBe('full');
    expect(result.block).toBe(candidate);
    expect(result.injectedTokens).toBe(result.budgetLimit);
    expect(result.injectedSectionIds).toEqual(['floor', 'extra']);
    expect(result.evictedSectionIds).toEqual([]);
  });

  it('evicts one-token-over optional content and preserves candidate order', () => {
    const sections = [
      section('floor-a', 'must_keep', 'a'),
      section('optional-large', 'optional', 'x'.repeat(80)),
      section('floor-b', 'must_keep', 'b'),
      section('important', 'important', 'c'),
    ];
    const retained = [sections[0], sections[2], sections[3]];
    const retainedBlock = `## MANDATORY_RULES\n${retained.map((item) => item.block).join('\n\n')}`;
    const result = compileMandatoryRulesBudget(sections, Math.ceil(retainedBlock.length / 4));

    expect(result.outcome).toBe('degraded');
    expect(result.injectedSectionIds).toEqual(['floor-a', 'floor-b', 'important']);
    expect(result.evictedSectionIds).toEqual(['optional-large']);
    expect(result.block).toBe(retainedBlock);
    expect(result.injectedTokens).toBe(result.budgetLimit);
  });

  it('skips an oversized optional section and retains a later fitting section deterministically', () => {
    const sections = [
      section('floor', 'must_keep', 'safe'),
      section('oversized', 'optional', 'x'.repeat(400)),
      section('small', 'optional', 'ok'),
    ];
    const first = compileMandatoryRulesBudget(sections, 30);
    const second = compileMandatoryRulesBudget(sections, 30);

    expect(first).toEqual(second);
    expect(first.injectedSectionIds).toEqual(['floor', 'small']);
    expect(first.evictedSectionIds).toEqual(['oversized']);
  });

  it('ignores empty sections without reporting them as injected or evicted', () => {
    const result = compileMandatoryRulesBudget([
      section('floor', 'must_keep', 'safe'),
      { setId: 'empty', priority: 'optional', ruleCount: 0, block: '   ' },
    ], 30);

    expect(result.injectedSectionIds).toEqual(['floor']);
    expect(result.evictedSectionIds).toEqual([]);
  });

  it('fails closed with impossible metadata when the MUST_KEEP floor is one token over budget', () => {
    const sections = [section('floor', 'must_keep', 'x'.repeat(40))];
    const candidate = `## MANDATORY_RULES\n${sections[0].block}`;
    const floorTokens = Math.ceil(candidate.length / 4);

    expect(() => compileMandatoryRulesBudget(sections, floorTokens - 1)).toThrow(MandatoryRulesBudgetError);
    try {
      compileMandatoryRulesBudget(sections, floorTokens - 1);
    } catch (error) {
      expect(error).toMatchObject({
        outcome: 'impossible',
        budgetLimit: floorTokens - 1,
        candidateTokens: floorTokens,
        mustKeepTokens: floorTokens,
        injectedTokens: 0,
        injectedSectionIds: [],
        evictedSectionIds: ['floor'],
      });
      expect((error as Error).message).toContain(`MUST_KEEP floor requires ${floorTokens} tokens`);
    }
  });

  it.each([
    ['executor', [
      'workflow-quick-rules',
      'core-session-boundary',
      'git-workflow-safe',
      'executor-delivery',
      'code-quality-defaults',
      'gitnexus-required',
      'exact-citation-contract',
      'per-turn-handoff-schema',
      'bead-id-verbatim',
    ]],
    ['reviewer', [
      'workflow-quick-rules',
      'core-session-boundary',
      'git-workflow-safe',
      'reviewer-verdict-format',
      'code-quality-defaults',
      'gitnexus-required',
      'exact-citation-contract',
      'per-turn-handoff-schema',
      'bead-id-verbatim',
    ]],
  ] as const)('retains the complete %s governance set under the production budget', async (name, expectedIds) => {
    const config = JSON.parse(await readFile(join(process.cwd(), 'config', 'specialists', `${name}.specialist.json`), 'utf-8'));
    const result = buildMandatoryRulesInjection({ cwd: process.cwd(), specialist: config.specialist }, 2000);

    expect(result.outcome).toBe('full');
    expect(result.injectedTokens).toBeLessThanOrEqual(result.budgetLimit);
    expect(result.injectedSectionIds).toEqual(expectedIds);
    expect(result.evictedSectionIds).toEqual([]);
  });
});
