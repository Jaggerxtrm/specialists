import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildMandatoryRulesInjection } from '../../../src/specialist/mandatory-rules.js';

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

describe('mandatory rules resolution', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mandatory-rules-test-'));
  });

  afterEach(async () => {
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
    await mkdir(join(tempDir, '.specialists', 'mandatory-rules'), { recursive: true });
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'core-session-boundary.md'), '---\nrules:\n  - id: boundary-1\n    level: error\n    text: stay inside boundary\n---\n');
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'git-workflow-safe.md'), '---\nrules:\n  - id: git-1\n    level: error\n    text: keep history linear\n---\n');
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'specialist-extra.md'), '---\nrules:\n  - id: extra-1\n    level: info\n    text: specialist extra\n---\n');
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'duplicate-set.md'), '---\nrules:\n  - id: dup-1\n    level: info\n    text: duplicate set\n---\n');

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
    await mkdir(join(tempDir, '.specialists', 'mandatory-rules'), { recursive: true });
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'duplicate-set.md'), '---\nrules:\n  - id: dup-1\n    level: info\n    text: duplicate set\n---\n');

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
    await mkdir(join(tempDir, '.specialists', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'mandatory-rules', 'index.json'),
      JSON.stringify({
        default_template_sets: ['bun-native-tooling', 'git-workflow-safe'],
      }),
    );
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'core-session-boundary.md'), '---\nrules:\n  - id: boundary-1\n    level: error\n    text: stay inside boundary\n---\n');
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'git-workflow-safe.md'), '---\nrules:\n  - id: git-1\n    level: error\n    text: keep history linear\n---\n');
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'bun-native-tooling.md'), '---\nrules:\n  - id: bun-1\n    level: required\n    text: use bunx not npx\n---\n');

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {},
    }));

    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'core-session-boundary', 'git-workflow-safe', 'bun-native-tooling']);
    expect(result.block).toContain('### bun-native-tooling');
    expect(result.block).toContain('use bunx not npx');
  });

  it('loads repo-specific index alone when canonical config absent', async () => {
    await mkdir(join(tempDir, '.specialists', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'mandatory-rules', 'index.json'),
      JSON.stringify({
        default_template_sets: ['bun-native-tooling'],
      }),
    );
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'bun-native-tooling.md'), '---\nrules:\n  - id: bun-1\n    level: required\n    text: use bunx not npx\n---\n');

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
    await mkdir(join(tempDir, '.specialists', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'mandatory-rules', 'index.json'),
      JSON.stringify({ default_template_sets: ['bun-native-tooling'] }),
    );
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'core-session-boundary.md'), '---\nrules:\n  - id: b-1\n    level: error\n    text: boundary\n---\n');
    await writeFile(join(tempDir, '.specialists', 'default', 'mandatory-rules', 'git-workflow-safe.md'), '---\nrules:\n  - id: g-1\n    level: error\n    text: linear\n---\n');
    await writeFile(join(tempDir, '.specialists', 'mandatory-rules', 'bun-native-tooling.md'), '---\nrules:\n  - id: bun-1\n    level: required\n    text: use bunx\n---\n');

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {},
    }));

    expect(result.setsLoaded).toEqual(['workflow-quick-rules', 'core-session-boundary', 'git-workflow-safe', 'bun-native-tooling']);
    expect(result.block).toContain('### core-session-boundary');
    expect(result.block).toContain('### git-workflow-safe');
    expect(result.block).toContain('### bun-native-tooling');
  });

  it('overlay set overrides canonical copy with same id', async () => {
    await mkdir(join(tempDir, '.specialists', 'default', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'default', 'mandatory-rules', 'git-workflow-safe.md'),
      '---\nrules:\n  - id: canonical\n    level: info\n    text: canonical version\n---\n',
    );
    await mkdir(join(tempDir, '.specialists', 'mandatory-rules'), { recursive: true });
    await writeFile(
      join(tempDir, '.specialists', 'mandatory-rules', 'index.json'),
      JSON.stringify({ default_template_sets: ['git-workflow-safe'] }),
    );
    await writeFile(
      join(tempDir, '.specialists', 'mandatory-rules', 'git-workflow-safe.md'),
      '---\nrules:\n  - id: overlay\n    level: error\n    text: overlay version\n---\n',
    );

    const { result } = captureWarnings(() => buildMandatoryRulesInjection({
      cwd: tempDir,
      specialist: {},
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
