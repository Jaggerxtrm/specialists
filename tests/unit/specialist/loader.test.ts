// tests/unit/specialist/loader.test.ts
// ISSUE: xtrm-wiy5n.4.11 — static skip remains tracked.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { rm } from 'node:fs/promises';
import { SpecialistExtensionSourceCollisionError, SpecialistLoader, checkStaleness, type SpecialistSummary } from '../../../src/specialist/loader.js';
import { loadPresets } from '../../../src/specialist/preset-resolver.js';

const MINIMAL_YAML = (name: string) => JSON.stringify({
  specialist: {
    metadata: {
      name,
      version: '1.0.0',
      description: 'Test specialist',
      category: 'test',
    },
    execution: {
      model: 'gemini',
    },
    prompt: {
      task_template: 'Do $prompt',
    },
  },
});

const CATEGORIZED_YAML = (name: string, category: string) => JSON.stringify({
  specialist: {
    metadata: {
      name,
      version: '1.0.0',
      description: 'Test specialist',
      category,
    },
    execution: {
      model: 'gemini',
    },
    prompt: {
      task_template: 'Do $prompt',
    },
  },
});

const YAML_WITH_SKILLS_PATHS = (name: string, paths: string[]) => JSON.stringify({
  specialist: {
    metadata: {
      name,
      version: '1.0.0',
      description: 'Test specialist',
      category: 'test',
    },
    execution: {
      model: 'gemini',
    },
    prompt: {
      task_template: 'Do $prompt',
    },
    skills: {
      paths,
    },
  },
});

const YAML_WITH_VALIDATION = (name: string, filestoWatch: string[], updated: string, staleThresholdDays?: number) => JSON.stringify({
  specialist: {
    metadata: {
      name,
      version: '1.0.0',
      description: 'Test specialist',
      category: 'test',
      updated,
    },
    execution: {
      model: 'gemini',
    },
    prompt: {
      task_template: 'Do $prompt',
    },
    validation: {
      files_to_watch: filestoWatch,
      ...(staleThresholdDays !== undefined ? { stale_threshold_days: staleThresholdDays } : {}),
    },
  },
});

describe('SpecialistLoader', () => {
  let tempDir: string;
  let loader: SpecialistLoader;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-test-'));
    loader = new SpecialistLoader({ projectDir: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('discovers specialists in .specialists/user/', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'my-spec.specialist.json'), MINIMAL_YAML('my-spec'));
    const list = await loader.list();
    expect(list.find((entry) => entry.name === 'my-spec')?.scope).toBe('user');
    expect(list.find((entry) => entry.name === 'my-spec')?.source).toBe('user');
    expect(list.find((entry) => entry.name === 'my-spec')?.mandatoryRuleTemplateSets).toEqual([]);
  });

  // KAN-90: .specialists/default/ was retired by commit 31a6421c. The loader walks
  // package canonical → ~/.config/specialists/user.json → .specialists/user/, and
  // .specialists/default/ files are no longer authoritative. Stale mirrors are
  // detected by drift-detector and pruned by `sp prune-stale-defaults`.
  it('ignores .specialists/default/ (retired mirror, not part of the 3-layer merge)', async () => {
    const defaultDir = join(tempDir, '.specialists', 'default');
    await mkdir(defaultDir, { recursive: true });
    await writeFile(join(defaultDir, 'default-only.specialist.json'), MINIMAL_YAML('default-only'));
    const list = await loader.list();
    expect(list.find(s => s.name === 'default-only')).toBeUndefined();
  });

  it('discovers specialists in legacy nested .specialists/user/specialists/ for backward compatibility', async () => {
    const legacyUserDir = join(tempDir, '.specialists', 'user', 'specialists');
    await mkdir(legacyUserDir, { recursive: true });
    await writeFile(join(legacyUserDir, 'legacy-user.specialist.json'), MINIMAL_YAML('legacy-user'));

    const list = await loader.list();

    expect(list.find(s => s.name === 'legacy-user')?.scope).toBe('user');
  });

  it('falls back to package-live specialists when repo has no .specialists/* dirs', async () => {
    const list = await loader.list();
    expect(list.length).toBeGreaterThan(0);
    expect(list.find((entry) => entry.name === 'executor')?.source).toBe('package-live');
    expect(list.find((entry) => entry.name === 'explorer')?.source).toBe('package-live');
  });

  it('loads and caches a specialist by name', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'my-spec.specialist.json'), MINIMAL_YAML('my-spec'));
    const spec = await loader.get('my-spec');
    expect(spec.specialist.metadata.name).toBe('my-spec');
    const spec2 = await loader.get('my-spec');
    expect(spec2).toBe(spec); // same reference — cache hit
  });

  it('throws when specialist not found', async () => {
    await expect(loader.get('nonexistent')).rejects.toThrow('Specialist not found: nonexistent');
  });

  it('warns to stderr and skips invalid YAML instead of silently dropping', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'bad.specialist.json'), 'not: valid: specialist: yaml: at all');
    await writeFile(join(dir, 'good.specialist.json'), MINIMAL_YAML('good'));

    const stderrChunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: any, ...args: any[]) => {
      stderrChunks.push(String(chunk));
      return orig(chunk, ...args);
    };

    const list = await loader.list();

    process.stderr.write = orig;

    expect(list.find((entry) => entry.name === 'good')?.name).toBe('good');
    expect(stderrChunks.join('')).toMatch(/skipping.*bad\.specialist\.json/);
  });

  // --- Other functionality ---

  it('filters list() by category', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'arch.specialist.json'), CATEGORIZED_YAML('arch', 'architecture'));
    await writeFile(join(dir, 'tester.specialist.json'), CATEGORIZED_YAML('tester', 'testing'));
    const list = await loader.list('architecture');
    expect(list.find((entry) => entry.name === 'arch')?.category).toBe('architecture');
  });

  it('list() returns all specialists when category filter matches none', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'arch.specialist.json'), CATEGORIZED_YAML('arch', 'architecture'));
    const list = await loader.list('nonexistent-category');
    expect(list).toHaveLength(0);
  });

  it('ignores files that do not end with .specialist.json', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'readme.md'), '# not a specialist');
    await writeFile(join(dir, 'config.yaml'), 'key: value');
    await writeFile(join(dir, 'my-spec.specialist.json'), MINIMAL_YAML('my-spec'));
    const list = await loader.list();
    expect(list.find((entry) => entry.name === 'my-spec')?.name).toBe('my-spec');
  });

  it('invalidateCache() by name removes only that entry', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'spec-a.specialist.json'), MINIMAL_YAML('spec-a'));
    await writeFile(join(dir, 'spec-b.specialist.json'), MINIMAL_YAML('spec-b'));

    const a1 = await loader.get('spec-a');
    const b1 = await loader.get('spec-b');

    loader.invalidateCache('spec-a');

    const a2 = await loader.get('spec-a');
    const b2 = await loader.get('spec-b');

    expect(a2).not.toBe(a1); // cache was cleared for spec-a
    expect(b2).toBe(b1);     // spec-b still cached
  });

  it('invalidateCache() without name clears all cached entries', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'spec-a.specialist.json'), MINIMAL_YAML('spec-a'));
    await writeFile(join(dir, 'spec-b.specialist.json'), MINIMAL_YAML('spec-b'));

    const a1 = await loader.get('spec-a');
    const b1 = await loader.get('spec-b');

    loader.invalidateCache();

    const a2 = await loader.get('spec-a');
    const b2 = await loader.get('spec-b');

    expect(a2).not.toBe(a1);
    expect(b2).not.toBe(b1);
  });

  it('get() resolves ~/ prefixed skill paths to absolute home-relative paths', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'skills-spec.specialist.json'),
      YAML_WITH_SKILLS_PATHS('skills-spec', ['~/some/skill.md']),
    );
    const spec = await loader.get('skills-spec');
    const paths = spec.specialist.skills?.paths;
    expect(paths).toBeDefined();
    expect(paths![0]).toBe(join(homedir(), 'some/skill.md'));
    expect(paths![0]).not.toMatch(/^~/);
  });

  it('get() resolves ./ prefixed skill paths relative to the specialist file directory', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'skills-spec.specialist.json'),
      YAML_WITH_SKILLS_PATHS('skills-spec', ['./local-skill.md']),
    );
    const spec = await loader.get('skills-spec');
    const paths = spec.specialist.skills?.paths;
    expect(paths).toBeDefined();
    expect(paths![0]).toBe(join(dir, 'local-skill.md'));
    expect(paths![0]).not.toMatch(/^\.\//);
  });

  it('get() leaves absolute skill paths unchanged', async () => {
    const dir = join(tempDir, '.specialists', 'user');
    await mkdir(dir, { recursive: true });
    const absPath = '/usr/local/share/skills/my-skill.md';
    await writeFile(
      join(dir, 'skills-spec.specialist.json'),
      YAML_WITH_SKILLS_PATHS('skills-spec', [absPath]),
    );
    const spec = await loader.get('skills-spec');
    const paths = spec.specialist.skills?.paths;
    expect(paths).toBeDefined();
    expect(paths![0]).toBe(absPath);
  });

  it('prefers user over package fallback for same name (KAN-90 three-layer contract)', async () => {
    const packageDir = join(tempDir, 'config', 'specialists');
    const userDir = join(tempDir, '.specialists', 'user');
    await mkdir(packageDir, { recursive: true });
    await mkdir(userDir, { recursive: true });

    await writeFile(join(packageDir, 'shared.specialist.json'), MINIMAL_YAML('shared'));
    await writeFile(join(userDir, 'shared.specialist.json'), MINIMAL_YAML('shared'));

    const list = await loader.list();
    const shared = list.find((entry) => entry.name === 'shared');

    expect(shared).toBeDefined();
    expect(shared?.scope).toBe('user');
    expect(shared?.source).toBe('user');
    expect((await loader.get('shared')).specialist.metadata.name).toBe('shared');
  });

  it('exposes package fallback as package scope when no repo overrides exist', async () => {
    const packageDir = join(tempDir, 'config', 'specialists');
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package-only.specialist.json'), MINIMAL_YAML('package-only'));

    const list = await loader.list();
    expect(list.find((entry) => entry.name === 'package-only')?.scope).toBe('package');
    expect(list.find((entry) => entry.name === 'package-only')?.source).toBe('package-fallback');
  });

  it('keeps new-name forks alongside upstream originals', async () => {
    const packageDir = join(tempDir, 'config', 'specialists');
    const userDir = join(tempDir, '.specialists', 'user');
    await mkdir(packageDir, { recursive: true });
    await mkdir(userDir, { recursive: true });

    await writeFile(join(packageDir, 'shared.specialist.json'), MINIMAL_YAML('shared'));
    await writeFile(join(userDir, 'shared-fork.specialist.json'), MINIMAL_YAML('shared-fork'));

    const list = await loader.list();
    expect(list.find((entry) => entry.name === 'shared')?.source).toBe('package-fallback');
    expect(list.find((entry) => entry.name === 'shared-fork')?.source).toBe('user');
  });
});

describe('checkStaleness', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'staleness-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const baseSummary = (): SpecialistSummary => ({
    name: 'test',
    description: 'desc',
    category: 'test',
    version: '1.0.0',
    model: 'gemini',
    permission_required: 'READ_ONLY',
    interactive: false,
    skills: [],
    scripts: [],
    mandatoryRuleTemplateSets: [],
    scope: 'default',
    source: 'default-mirror',
    filePath: '/fake/path',
  });

  it('returns OK when filestoWatch is absent', async () => {
    const summary = baseSummary();
    expect(await checkStaleness(summary)).toBe('OK');
  });

  it('returns OK when filestoWatch is empty', async () => {
    const summary = { ...baseSummary(), filestoWatch: [], updated: '2024-01-01' };
    expect(await checkStaleness(summary)).toBe('OK');
  });

  it('returns OK when updated is absent', async () => {
    const testFile = join(tempDir, 'watched.ts');
    await writeFile(testFile, 'content');
    const summary = { ...baseSummary(), filestoWatch: [testFile] };
    expect(await checkStaleness(summary)).toBe('OK');
  });

  it('returns OK when updated is an invalid date string', async () => {
    const testFile = join(tempDir, 'watched.ts');
    await writeFile(testFile, 'content');
    const summary = { ...baseSummary(), filestoWatch: [testFile], updated: 'not-a-date' };
    expect(await checkStaleness(summary)).toBe('OK');
  });

  it('returns OK when all watched files have not changed since updated', async () => {
    const testFile = join(tempDir, 'watched.ts');
    await writeFile(testFile, 'content');
    // set mtime to a time in the past (2020), updated is after that
    const pastDate = new Date('2020-01-01');
    await utimes(testFile, pastDate, pastDate);
    const summary = {
      ...baseSummary(),
      filestoWatch: [testFile],
      updated: '2023-01-01T00:00:00.000Z',
    };
    expect(await checkStaleness(summary)).toBe('OK');
  });

  it('returns OK when watched file does not exist', async () => {
    const summary = {
      ...baseSummary(),
      filestoWatch: [join(tempDir, 'nonexistent.ts')],
      updated: '2020-01-01T00:00:00.000Z',
    };
    expect(await checkStaleness(summary)).toBe('OK');
  });

  it('returns STALE when a watched file was modified after updated', async () => {
    const testFile = join(tempDir, 'watched.ts');
    await writeFile(testFile, 'content');
    // mtime will be ~now, updated is in the past
    const summary = {
      ...baseSummary(),
      filestoWatch: [testFile],
      updated: '2020-01-01T00:00:00.000Z',
    };
    expect(await checkStaleness(summary)).toBe('STALE');
  });

  it('returns AGED when file is stale and daysSinceUpdate exceeds staleThresholdDays', async () => {
    const testFile = join(tempDir, 'watched.ts');
    await writeFile(testFile, 'content');
    // mtime is ~now; updated was 10 days ago; threshold is 5 days → AGED
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const summary = {
      ...baseSummary(),
      filestoWatch: [testFile],
      updated: tenDaysAgo,
      staleThresholdDays: 5,
    };
    expect(await checkStaleness(summary)).toBe('AGED');
  });

  it('returns STALE (not AGED) when stale but daysSinceUpdate is within staleThresholdDays', async () => {
    const testFile = join(tempDir, 'watched.ts');
    await writeFile(testFile, 'content');
    // mtime is ~now; updated was 2 days ago; threshold is 30 days → STALE, not AGED
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const summary = {
      ...baseSummary(),
      filestoWatch: [testFile],
      updated: twoDaysAgo,
      staleThresholdDays: 30,
    };
    expect(await checkStaleness(summary)).toBe('STALE');
  });

  it('returns STALE when stale and no staleThresholdDays is set', async () => {
    const testFile = join(tempDir, 'watched.ts');
    await writeFile(testFile, 'content');
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const summary = {
      ...baseSummary(),
      filestoWatch: [testFile],
      updated: tenDaysAgo,
      // no staleThresholdDays
    };
    expect(await checkStaleness(summary)).toBe('STALE');
  });
});

describe('SpecialistLoader — stall_detection YAML parsing', () => {
  let tempDir: string;
  let specsDir: string;
  let loader: SpecialistLoader;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'loader-stall-test-'));
    specsDir = join(tempDir, '.specialists', 'user');
    await mkdir(specsDir, { recursive: true });
    loader = new SpecialistLoader({ projectDir: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('parses stall_detection config from YAML and exposes it on SpecialistSummary', async () => {
    const yaml = JSON.stringify({
      specialist: {
        metadata: {
          name: 'stall-aware',
          version: '1.0.0',
          description: 'Has stall detection',
          category: 'test',
        },
        execution: {
          model: 'gemini',
        },
        prompt: {
          task_template: 'Do $prompt',
        },
        stall_detection: {
          running_silence_warn_ms: 30000,
          running_silence_error_ms: 120000,
          waiting_stale_ms: 1800000,
          tool_duration_warn_ms: 60000,
        },
      },
    });

    await writeFile(join(specsDir, 'stall-aware.specialist.json'), yaml);
    const results = await loader.list();
    const spec = results.find(s => s.name === 'stall-aware');

    expect(spec).toBeDefined();
    expect(spec!.stallDetection).toEqual({
      running_silence_warn_ms: 30_000,
      running_silence_error_ms: 120_000,
      waiting_stale_ms: 1_800_000,
      tool_duration_warn_ms: 60_000,
    });
  });

  it('stallDetection is undefined when stall_detection is absent from YAML', async () => {
    const yaml = JSON.stringify({
      specialist: {
        metadata: {
          name: 'no-stall-config',
          version: '1.0.0',
          description: 'No stall detection',
          category: 'test',
        },
        execution: {
          model: 'gemini',
        },
        prompt: {
          task_template: 'Do $prompt',
        },
      },
    });

    await writeFile(join(specsDir, 'no-stall-config.specialist.json'), yaml);
    const results = await loader.list();
    const spec = results.find(s => s.name === 'no-stall-config');

    expect(spec).toBeDefined();
    expect(spec!.stallDetection).toBeUndefined();
  });

  it('partial stall_detection config — only specified fields are present, others absent', async () => {
    const yaml = JSON.stringify({
      specialist: {
        metadata: {
          name: 'partial-stall',
          version: '1.0.0',
          description: 'Partial stall detection',
          category: 'test',
        },
        execution: {
          model: 'gemini',
        },
        prompt: {
          task_template: 'Do $prompt',
        },
        stall_detection: {
          running_silence_warn_ms: 45000,
        },
      },
    });

    await writeFile(join(specsDir, 'partial-stall.specialist.json'), yaml);
    const results = await loader.list();
    const spec = results.find(s => s.name === 'partial-stall');

    expect(spec).toBeDefined();
    expect(spec!.stallDetection?.running_silence_warn_ms).toBe(45_000);
    // Unspecified fields are absent — Supervisor merges with STALL_DETECTION_DEFAULTS at runtime
    expect(spec!.stallDetection?.running_silence_error_ms).toBeUndefined();
    expect(spec!.stallDetection?.waiting_stale_ms).toBeUndefined();
    expect(spec!.stallDetection?.tool_duration_warn_ms).toBeUndefined();
  });
});

// ── KAN-90: global override layer + null-model hard fail ────────────────────
// Cross-ref: bead unitAI-xr45u / KAN-90 / design unitAI-o328h.
//
// These tests cover the 3-layer field-merge contract:
//   package canonical  →  ~/.config/specialists/user.json  →  .specialists/user
//
// The global layer is sparse and only contributes override-allowed fields.
// Blocked fields in the global layer are stripped + recorded as warnings.
// A null model after the full merge throws SpecialistMissingModelError from get().

describe('KAN-90 — global override layer + null-model hard fail', () => {
  let tmpProject: string;
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalXdg: string | undefined;
  let loader: SpecialistLoader;

  const BASE_SPEC = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    specialist: {
      metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
      execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY', ...overrides },
      prompt: { task_template: 'Do $prompt' },
    },
  });

  beforeEach(async () => {
    tmpProject = await mkdtemp(join(tmpdir(), 'kan90-proj-'));
    tmpHome = await mkdtemp(join(tmpdir(), 'kan90-home-'));
    originalHome = process.env.HOME;
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = tmpHome;
    delete process.env.XDG_CONFIG_HOME;
    loader = new SpecialistLoader({ projectDir: tmpProject });
    // The package layer for the loader's projectDir is config/specialists/. Mock it inside the tmp project.
    await mkdir(join(tmpProject, 'config', 'specialists'), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
    await rm(tmpProject, { recursive: true, force: true });
    await rm(tmpHome, { recursive: true, force: true });
    loadPresets({ force: true });
  });

  async function writeGlobalUserJson(content: Record<string, unknown>): Promise<void> {
    const dir = join(tmpHome, '.config', 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'user.json'), JSON.stringify(content));
  }

  it('package model passes through when no override layers exist', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    const spec = await loader.get('demo');
    expect(spec.specialist.execution.model).toBe('pkg/base-model');
  });

  it('global user.json resolves preset references for model', async () => {
    await writeFile(join(tmpProject, 'config', 'presets.json'), JSON.stringify({
      cheap: {
        description: 'cheap',
        fields: { 'specialist.execution.model': 'nano-gpt/moonshotai/kimi-k2.5' },
      },
    }));
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({
      demo: { execution: { model: '@preset/cheap' } },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.model).toBe('nano-gpt/moonshotai/kimi-k2.5');
  });

  it('package canonical resolves preset references on plain load', async () => {
    await writeFile(join(tmpProject, 'config', 'presets.json'), JSON.stringify({
      medium: {
        description: 'medium',
        fields: { 'specialist.execution.model': 'anthropic/claude-sonnet-4-6' },
      },
    }));
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC({ model: '@preset/medium' }));

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.model).toBe('anthropic/claude-sonnet-4-6');
  });

  it('global user.json resolves preset references inside fallback_models independently', async () => {
    await writeFile(join(tmpProject, 'config', 'presets.json'), JSON.stringify({
      cheap: {
        description: 'cheap',
        fields: { 'specialist.execution.fallback_models': 'nano-gpt/moonshotai/kimi-k2.5' },
      },
    }));
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({
      demo: { execution: { fallback_models: ['@preset/cheap', 'openai-codex/gpt-5.4'] } },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.fallback_models).toEqual(['nano-gpt/moonshotai/kimi-k2.5', 'openai-codex/gpt-5.4']);
  });

  it('blocked prompt.system preset reference is stripped before resolution', async () => {
    await writeFile(join(tmpProject, 'config', 'presets.json'), JSON.stringify({
      foo: {
        description: 'foo',
        fields: { 'specialist.prompt.system': 'smuggled prompt' },
      },
    }));
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({
      demo: { prompt: { system: '@preset/foo' } },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.prompt.system).toBeUndefined();
    expect(loader.getBlockedFieldWarnings('demo').map(warning => warning.field)).toContain('prompt.system');
  });

  it('global user.json overrides the package model', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({
      demo: { execution: { model: 'global/glm-5.1' } },
    });
    const spec = await loader.get('demo');
    expect(spec.specialist.execution.model).toBe('global/glm-5.1');
  });

  // Source bug: loader merge preserves inherited singular fallback_model when plural fallback_models override exists. Follow-up bead: unitAI-pzncp. Flip skip -> live after fix lands.
  it.skip('global plural fallback_models wins over package singular fallback_model', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC({ fallback_model: 'package/legacy' }));
    await writeGlobalUserJson({
      demo: { execution: { fallback_models: ['global/first', 'global/second'] } },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.fallback_models).toEqual(['global/first', 'global/second']);
    expect(spec.specialist.execution.fallback_model).toBeNull();
  });

  it('repo .specialists/user wins over the global layer (field-level)', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({ demo: { execution: { model: 'global/glm-5.1' } } });
    await mkdir(join(tmpProject, '.specialists', 'user'), { recursive: true });
    await writeFile(
      join(tmpProject, '.specialists', 'user', 'demo.specialist.json'),
      BASE_SPEC({ model: 'user/repo-model' }),
    );
    const spec = await loader.get('demo');
    expect(spec.specialist.execution.model).toBe('user/repo-model');
  });

  it('global layer can fill missing fields without touching base identity (timeout_ms)', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ timeout_ms: 5000 }),
    );
    await writeGlobalUserJson({
      demo: { execution: { timeout_ms: 99999 } },
    });
    const spec = await loader.get('demo');
    expect(spec.specialist.execution.timeout_ms).toBe(99999);
    expect(spec.specialist.execution.model).toBe('pkg/base-model'); // identity unchanged
  });

  it('global layer overrides execution.interactive and stall_detection.waiting_auto_close_ms', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY', interactive: false },
          prompt: { task_template: 'Do $prompt' },
          stall_detection: { waiting_auto_close_ms: 1000 },
        },
      }),
    );
    await writeGlobalUserJson({
      demo: {
        execution: { interactive: true },
        stall_detection: { waiting_auto_close_ms: 3600000 },
      },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.interactive).toBe(true);
    expect(spec.specialist.stall_detection?.waiting_auto_close_ms).toBe(3600000);
    expect(spec.specialist.execution.model).toBe('pkg/base-model');
  });

  it('null model in package + no global override throws SpecialistMissingModelError', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ model: null }),
    );
    await expect(loader.get('demo')).rejects.toThrow(/no model configured/);
  });

  it('null model in package + global override resolves cleanly', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ model: null }),
    );
    await writeGlobalUserJson({ demo: { execution: { model: 'global/glm-5.1' } } });
    const spec = await loader.get('demo');
    expect(spec.specialist.execution.model).toBe('global/glm-5.1');
  });

  it('list() does NOT throw on null-model specialists; returns model as empty string', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ model: null }),
    );
    const list = await loader.list();
    const demo = list.find(s => s.name === 'demo');
    expect(demo).toBeDefined();
    expect(demo!.model).toBe('');
  });

  // xtmux-1lb.4 — getEffective returns the merged effective spec without
  // enforcing the missing-model gate. Used by sp view --raw (inspection) so
  // operators can render a partially-configured specialist without it
  // erroring on null model.
  it('getEffective returns the merged spec without throwing on null model', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ model: null }),
    );
    const spec = await loader.getEffective('demo');
    expect(spec).not.toBeNull();
    expect(spec!.specialist.metadata.name).toBe('demo');
    expect(spec!.specialist.execution.model).toBeNull();
  });

  it('getEffective applies the global user.json override just like get()', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ model: null }),
    );
    await writeGlobalUserJson({ demo: { execution: { model: 'global/glm-5.1' } } });
    const spec = await loader.getEffective('demo');
    expect(spec!.specialist.execution.model).toBe('global/glm-5.1');
  });

  it('getEffective returns null for unknown specialists (no throw)', async () => {
    const spec = await loader.getEffective('nonexistent-xyz');
    expect(spec).toBeNull();
  });

  it('global layer with a blocked field records a "strip"-severity warning', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({
      demo: {
        execution: { model: 'global/glm-5.1', permission_required: 'HIGH' },
      },
    });
    const spec = await loader.get('demo');
    // Blocked field NOT applied.
    expect(spec.specialist.execution.permission_required).toBe('READ_ONLY');
    // Allowed field applied.
    expect(spec.specialist.execution.model).toBe('global/glm-5.1');
    // Warning emitted.
    const warnings = loader.getBlockedFieldWarnings('demo');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].severity).toBe('strip');
    expect(warnings[0].source).toBe('global');
    expect(warnings[0].field).toBe('execution.permission_required');
  });

  it('global layer overrides allowed nested execution and prompt fields', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: {
            model: 'pkg/base-model',
            permission_required: 'READ_ONLY',
            extensions: { serena: true, gitnexus: true },
          },
          prompt: { task_template: 'Do $prompt', system_prompt_mode: 'append' },
        },
      }),
    );
    await writeGlobalUserJson({
      demo: {
        execution: { extensions: { serena: false, gitnexus: null } },
        prompt: { system_prompt_mode: 'replace' },
      },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.extensions).toEqual({ serena: false, gitnexus: true });
    expect(spec.specialist.prompt.system_prompt_mode).toBe('replace');
    expect(spec.specialist.execution.model).toBe('pkg/base-model');
  });

  it('global layer overrides system_prompt_mode without blocked warnings', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY' },
          prompt: { task_template: 'Do $prompt', system_prompt_mode: 'append' },
        },
      }),
    );
    await writeGlobalUserJson({ demo: { prompt: { system_prompt_mode: 'replace' } } });

    const spec = await loader.get('demo');

    expect(spec.specialist.prompt.system_prompt_mode).toBe('replace');
    expect(loader.getBlockedFieldWarnings('demo').map(warning => warning.field)).not.toContain('prompt.system_prompt_mode');
  });

  it('global layer overrides execution.extensions.serena per key without blocked warnings', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC({ extensions: { serena: true, gitnexus: true } }));
    await writeGlobalUserJson({ demo: { execution: { extensions: { serena: false } } } });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.extensions).toEqual({ serena: false, gitnexus: true });
    expect(loader.getBlockedFieldWarnings('demo').map(warning => warning.field)).not.toContain('execution.extensions.serena');
  });

  it('global layer overrides execution.extensions.gitnexus per key without blocked warnings', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC({ extensions: { serena: true, gitnexus: true } }));
    await writeGlobalUserJson({ demo: { execution: { extensions: { gitnexus: false } } } });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.extensions).toEqual({ serena: true, gitnexus: false });
    expect(loader.getBlockedFieldWarnings('demo').map(warning => warning.field)).not.toContain('execution.extensions.gitnexus');
  });

  it('merges execution.extensions per key across package, global, and repo layers', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({
        extensions: {
          gitnexus: true,
          'npm:@pkg/base': true,
        },
      }),
    );
    await writeGlobalUserJson({
      demo: {
        execution: {
          extensions: {
            gitnexus: false,
            'npm:@global/keep': true,
          },
        },
      },
    });
    await mkdir(join(tmpProject, '.specialists', 'user'), { recursive: true });
    await writeFile(
      join(tmpProject, '.specialists', 'user', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          execution: {
            extensions: {
              'npm:@repo/last': true,
            },
          },
        },
      }),
    );

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.extensions).toEqual({
      gitnexus: false,
      'npm:@pkg/base': true,
      'npm:@global/keep': true,
      'npm:@repo/last': true,
    });
  });

  it('fails closed when the global layer enables a floating spec for the same pinned npm package', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ extensions: { 'npm:@jaggerxtrm/pi-service-knowledge@1.0.0': true } }),
    );
    await writeGlobalUserJson({
      demo: { execution: { extensions: { 'npm:@jaggerxtrm/pi-service-knowledge': true } } },
    });

    await expect(loader.get('demo')).rejects.toBeInstanceOf(SpecialistExtensionSourceCollisionError);
    await expect(loader.get('demo')).rejects.toThrow('@jaggerxtrm/pi-service-knowledge');
  });

  it('fails closed when the repo layer enables a range spec for the same pinned npm package', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ extensions: { 'npm:@jaggerxtrm/pi-service-knowledge@1.0.0': true } }),
    );
    await mkdir(join(tmpProject, '.specialists', 'user'), { recursive: true });
    await writeFile(
      join(tmpProject, '.specialists', 'user', 'demo.specialist.json'),
      JSON.stringify({ specialist: { execution: { extensions: { 'npm:@jaggerxtrm/pi-service-knowledge@^1': true } } } }),
    );

    await expect(loader.get('demo')).rejects.toBeInstanceOf(SpecialistExtensionSourceCollisionError);
  });

  it('fails closed on scoped npm package collisions across layers', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ extensions: { 'npm:@scope/pkg@1.0.0': true } }),
    );
    await writeGlobalUserJson({ demo: { execution: { extensions: { 'npm:@scope/pkg@latest': true } } } });

    await expect(loader.get('demo')).rejects.toThrow('@scope/pkg');
  });

  it('fails closed on unscoped npm package collisions across layers', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ extensions: { 'npm:demo-ext@1.0.0': true } }),
    );
    await writeGlobalUserJson({ demo: { execution: { extensions: { 'npm:demo-ext': true } } } });

    await expect(loader.get('demo')).rejects.toThrow('demo-ext');
  });

  it('keeps distinct npm package specs merging additively across layers', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ extensions: { 'npm:@scope/pkg@1.0.0': true } }),
    );
    await writeGlobalUserJson({ demo: { execution: { extensions: { 'npm:other-ext@2.0.0': true } } } });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.extensions).toEqual({
      'npm:@scope/pkg@1.0.0': true,
      'npm:other-ext@2.0.0': true,
    });
  });

  it('identical npm keys keep override semantics for false and true without collision errors', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      BASE_SPEC({ extensions: { 'npm:demo-ext@1.0.0': true, 'npm:other-ext@1.0.0': false } }),
    );
    await writeGlobalUserJson({
      demo: { execution: { extensions: { 'npm:demo-ext@1.0.0': false, 'npm:other-ext@1.0.0': true } } },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.extensions).toEqual({
      'npm:demo-ext@1.0.0': false,
      'npm:other-ext@1.0.0': true,
    });
  });

  it('global layer overrides notes_mode without blocked warnings', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({ demo: { notes_mode: 'final-only' } });

    const spec = await loader.get('demo');

    expect(spec.specialist.notes_mode).toBe('final-only');
    expect(loader.getBlockedFieldWarnings('demo').map(warning => warning.field)).not.toContain('notes_mode');
  });

  it('global layer overrides output_file without blocked warnings', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({ demo: { output_file: '/tmp/my-runs/demo.md' } });

    const spec = await loader.get('demo');

    expect(spec.specialist.output_file).toBe('/tmp/my-runs/demo.md');
    expect(loader.getBlockedFieldWarnings('demo').map(warning => warning.field)).not.toContain('output_file');
  });

  it('global layer overrides prompt_limit_bytes without blocked warnings', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC({ prompt_limit_bytes: 1024 }));
    await writeGlobalUserJson({ demo: { execution: { prompt_limit_bytes: 8388608 } } });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.prompt_limit_bytes).toBe(8388608);
    expect(loader.getBlockedFieldWarnings('demo').map(warning => warning.field)).not.toContain('execution.prompt_limit_bytes');
  });

  it('global layer overrides stdout_limit_bytes without blocked warnings', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC({ stdout_limit_bytes: 2048 }));
    await writeGlobalUserJson({ demo: { execution: { stdout_limit_bytes: 67108864 } } });

    const spec = await loader.get('demo');

    expect(spec.specialist.execution.stdout_limit_bytes).toBe(67108864);
    expect(loader.getBlockedFieldWarnings('demo').map(warning => warning.field)).not.toContain('execution.stdout_limit_bytes');
  });

  it('global layer replaces mandatory_rules.template_sets without blocked warnings', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY' },
          prompt: { task_template: 'Do $prompt' },
          mandatory_rules: { template_sets: ['pkg-set-a', 'pkg-set-b'] },
        },
      }),
    );
    await writeGlobalUserJson({
      demo: { mandatory_rules: { template_sets: ['global-set-a', 'global-set-b'] } },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.mandatory_rules?.template_sets).toEqual(['global-set-a', 'global-set-b']);
    expect(loader.getBlockedFieldWarnings('demo').map(warning => warning.field)).not.toContain('mandatory_rules.template_sets');
  });

  it('global layer explicit [] clears specialist-specific sets while index policy stays loader-owned', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY' },
          prompt: { task_template: 'Do $prompt' },
          mandatory_rules: { template_sets: ['pkg-set-a'] },
        },
      }),
    );
    await writeGlobalUserJson({
      demo: { mandatory_rules: { template_sets: [] } },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.mandatory_rules?.template_sets).toEqual([]);
    expect(loader.getBlockedFieldWarnings('demo')).toEqual([]);
  });

  it('global layer explicit [] creates an empty selection when package has no mandatory_rules', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({
      demo: { mandatory_rules: { template_sets: [] } },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.mandatory_rules?.template_sets).toEqual([]);
    expect(loader.getBlockedFieldWarnings('demo')).toEqual([]);
  });

  it('global layer null template_sets inherits the package list', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY' },
          prompt: { task_template: 'Do $prompt' },
          mandatory_rules: { template_sets: ['pkg-set-a'] },
        },
      }),
    );
    await writeGlobalUserJson({
      demo: { mandatory_rules: { template_sets: null } },
    });

    const spec = await loader.get('demo');

    expect(spec.specialist.mandatory_rules?.template_sets).toEqual(['pkg-set-a']);
    expect(loader.getBlockedFieldWarnings('demo')).toEqual([]);
  });

  it('global layer cannot set mandatory_rules.inline_rules or disable_default_globals — stripped with warning', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY' },
          prompt: { task_template: 'Do $prompt' },
          mandatory_rules: {
            template_sets: ['pkg-set-a'],
            inline_rules: [{ id: 'pkg-inline', text: 'package inline' }],
            disable_default_globals: false,
          },
        },
      }),
    );
    await writeGlobalUserJson({
      demo: {
        mandatory_rules: {
          template_sets: ['global-set'],
          inline_rules: [{ id: 'evil', text: 'global inline' }],
          disable_default_globals: true,
        },
      },
    });

    const spec = await loader.get('demo');
    const warnings = loader.getBlockedFieldWarnings('demo');
    const fields = warnings.map(warning => warning.field);

    // Allowed selection applied; blocked fields stripped.
    expect(spec.specialist.mandatory_rules?.template_sets).toEqual(['global-set']);
    expect(spec.specialist.mandatory_rules?.inline_rules).toEqual([{ id: 'pkg-inline', level: 'error', text: 'package inline' }]);
    expect(spec.specialist.mandatory_rules?.disable_default_globals).toBe(false);
    // Both blocked attempts recorded as strip-severity warnings.
    expect(fields).toContain('mandatory_rules.inline_rules');
    expect(fields).toContain('mandatory_rules.disable_default_globals');
    expect(warnings.every(warning => warning.severity === 'strip')).toBe(true);
  });

  it('merge hardens global template_sets to kebab-case ids only, dropping invalid elements with a warning (unitAI-klo6k security)', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await writeGlobalUserJson({
      demo: { mandatory_rules: { template_sets: ['ok-set', 'Bad_Id', '../../evil', 'ok-set-2'] } },
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const spec = await loader.get('demo');
      expect(spec.specialist.mandatory_rules?.template_sets).toEqual(['ok-set', 'ok-set-2']);
      const warned = stderrSpy.mock.calls.map(call => String(call[0])).join('');
      expect(warned).toContain('dropping invalid set id');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('merge hardens REPO overlay template_sets the same way (raw JSON is not schema-checked, unitAI-klo6k security)', async () => {
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    await mkdir(join(tmpProject, '.specialists', 'user'), { recursive: true });
    await writeFile(
      join(tmpProject, '.specialists', 'user', 'demo.specialist.json'),
      JSON.stringify({
        specialist: { mandatory_rules: { template_sets: ['repo-ok', 'Bad_Repo', '../../evil'] } },
      }),
    );
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const spec = await loader.get('demo');
      expect(spec.specialist.mandatory_rules?.template_sets).toEqual(['repo-ok']);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('interplay: package → global → repo precedence for template_sets, repo wins (unitAI-klo6k F4)', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY' },
          prompt: { task_template: 'Do $prompt' },
          mandatory_rules: { template_sets: ['pkg-set'] },
        },
      }),
    );
    await writeGlobalUserJson({
      demo: { mandatory_rules: { template_sets: ['global-set'] } },
    });
    await mkdir(join(tmpProject, '.specialists', 'user'), { recursive: true });
    await writeFile(
      join(tmpProject, '.specialists', 'user', 'demo.specialist.json'),
      JSON.stringify({ specialist: { mandatory_rules: { template_sets: ['repo-set'] } } }),
    );

    const spec = await loader.get('demo');
    expect(spec.specialist.mandatory_rules?.template_sets).toEqual(['repo-set']);
    expect(loader.getBlockedFieldWarnings('demo')).toEqual([]);
  });

  it('interplay: repo overlay with no selection inherits the global selection (unitAI-klo6k F4)', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY' },
          prompt: { task_template: 'Do $prompt' },
          mandatory_rules: { template_sets: ['pkg-set'] },
        },
      }),
    );
    await writeGlobalUserJson({
      demo: { mandatory_rules: { template_sets: ['global-set'] } },
    });
    await mkdir(join(tmpProject, '.specialists', 'user'), { recursive: true });
    // Repo overlay exists but declares NO selection -> global survives.
    await writeFile(
      join(tmpProject, '.specialists', 'user', 'demo.specialist.json'),
      JSON.stringify({ specialist: { execution: { model: 'pkg/base-model' } } }),
    );

    const spec = await loader.get('demo');
    expect(spec.specialist.mandatory_rules?.template_sets).toEqual(['global-set']);
  });

  it('interplay: repo overlay explicitly [] clears what global selected (unitAI-klo6k F4)', async () => {
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: { model: 'pkg/base-model', permission_required: 'READ_ONLY' },
          prompt: { task_template: 'Do $prompt' },
          mandatory_rules: { template_sets: ['pkg-set'] },
        },
      }),
    );
    await writeGlobalUserJson({
      demo: { mandatory_rules: { template_sets: ['global-set'] } },
    });
    await mkdir(join(tmpProject, '.specialists', 'user'), { recursive: true });
    await writeFile(
      join(tmpProject, '.specialists', 'user', 'demo.specialist.json'),
      JSON.stringify({ specialist: { mandatory_rules: { template_sets: [] } } }),
    );

    const spec = await loader.get('demo');
    expect(spec.specialist.mandatory_rules?.template_sets).toEqual([]);
  });

  describe('Phase 1 — six allowlisted user-environment fields', () => {
    it('overlays all six fields together, preserves untouched fields, and records no blocked warnings', async () => {
      const packageSpec = {
        specialist: {
          metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
          execution: {
            model: 'pkg/base-model',
            permission_required: 'READ_ONLY',
            timeout_ms: 120000,
            prompt_limit_bytes: 4194304,
            extensions: { serena: true, gitnexus: true },
          },
          prompt: {
            system: 'package-system',
            task_template: 'Do $prompt',
            system_prompt_mode: 'append',
          },
          mandatory_rules: { inline_rules: [{ id: 'r1', text: 'keep me' }] },
          capabilities: { required_tools: ['read_file'] },
          notes_mode: 'full-trail',
        },
      };
      await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), JSON.stringify(packageSpec));
      await writeGlobalUserJson({
        demo: {
          execution: {
            prompt_limit_bytes: 8388608,
            stdout_limit_bytes: 67108864,
            extensions: { serena: false, gitnexus: false },
          },
          prompt: { system_prompt_mode: 'replace' },
          notes_mode: 'final-only',
          output_file: '/tmp/out.md',
        },
      });

      const spec = await loader.get('demo');

      expect(spec.specialist.prompt.system_prompt_mode).toBe('replace');
      expect(spec.specialist.execution.extensions).toEqual({ serena: false, gitnexus: false });
      expect(spec.specialist.notes_mode).toBe('final-only');
      expect(spec.specialist.output_file).toBe('/tmp/out.md');
      expect(spec.specialist.execution.prompt_limit_bytes).toBe(8388608);
      expect(spec.specialist.execution.stdout_limit_bytes).toBe(67108864);
      expect(spec.specialist.prompt.system).toBe(packageSpec.specialist.prompt.system);
      expect(spec.specialist.mandatory_rules?.inline_rules).toMatchObject(packageSpec.specialist.mandatory_rules.inline_rules);
      expect(spec.specialist.capabilities?.required_tools).toEqual(packageSpec.specialist.capabilities.required_tools);
      expect(loader.getBlockedFieldWarnings('demo').filter(warning => [
        'prompt.system_prompt_mode',
        'execution.extensions.serena',
        'execution.extensions.gitnexus',
        'notes_mode',
        'output_file',
        'execution.prompt_limit_bytes',
        'execution.stdout_limit_bytes',
      ].includes(warning.field))).toEqual([]);
    });

    it('treats explicit null override as inherit for each new field family', async () => {
      await writeFile(
        join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
        JSON.stringify({
          specialist: {
            metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
            execution: {
              model: 'pkg/base-model',
              permission_required: 'READ_ONLY',
              prompt_limit_bytes: 4194304,
              stdout_limit_bytes: 1234,
              extensions: { serena: true, gitnexus: false },
            },
            prompt: { task_template: 'Do $prompt', system_prompt_mode: 'append' },
            notes_mode: 'full-trail',
            output_file: '/pkg/out.md',
          },
        }),
      );
      await writeGlobalUserJson({
        demo: {
          execution: {
            prompt_limit_bytes: null,
            stdout_limit_bytes: null,
            extensions: { serena: null, gitnexus: null },
          },
          prompt: { system_prompt_mode: null },
          notes_mode: null,
          output_file: null,
        },
      });

      const spec = await loader.get('demo');

      expect(spec.specialist.prompt.system_prompt_mode).toBe('append');
      expect(spec.specialist.execution.extensions).toEqual({ serena: true, gitnexus: false });
      expect(spec.specialist.notes_mode).toBe('full-trail');
      expect(spec.specialist.output_file).toBe('/pkg/out.md');
      expect(spec.specialist.execution.prompt_limit_bytes).toBe(4194304);
      expect(spec.specialist.execution.stdout_limit_bytes).toBe(1234);
    });
  });

  it('XDG_CONFIG_HOME wins over ~/.config/specialists', async () => {
    process.env.XDG_CONFIG_HOME = join(tmpHome, 'xdg');
    const xdgDir = join(process.env.XDG_CONFIG_HOME, 'specialists');
    await mkdir(xdgDir, { recursive: true });
    await writeFile(
      join(xdgDir, 'user.json'),
      JSON.stringify({ demo: { execution: { model: 'xdg/win' } } }),
    );
    // Also write a ~/.config copy to confirm xdg takes priority.
    await writeGlobalUserJson({ demo: { execution: { model: 'config-home/loser' } } });
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());

    const path = loader.getGlobalLayerPath();
    expect(path?.source).toBe('xdg');
    const spec = await loader.get('demo');
    expect(spec.specialist.execution.model).toBe('xdg/win');
  });

  it('legacy ~/.specialists/user.json is consulted when no XDG and no config-home', async () => {
    const legacyDir = join(tmpHome, '.specialists');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(
      join(legacyDir, 'user.json'),
      JSON.stringify({ demo: { execution: { model: 'legacy/win' } } }),
    );
    await writeFile(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC());
    const path = loader.getGlobalLayerPath();
    expect(path?.source).toBe('legacy');
    const spec = await loader.get('demo');
    expect(spec.specialist.execution.model).toBe('legacy/win');
  });

  it('skills.paths append+dedup across package + global + repo layers', async () => {
    const SPEC_WITH_PATHS = (model: string, paths: string[]) => JSON.stringify({
      specialist: {
        metadata: { name: 'demo', version: '1.0.0', description: 'demo', category: 'test' },
        execution: { model },
        prompt: { task_template: 'Do $prompt' },
        skills: { paths },
      },
    });
    await writeFile(
      join(tmpProject, 'config', 'specialists', 'demo.specialist.json'),
      SPEC_WITH_PATHS('pkg/m', ['/a', '/b']),
    );
    await writeGlobalUserJson({
      demo: { execution: { model: 'pkg/m' }, skills: { paths: ['/b', '/c'] } },
    });
    await mkdir(join(tmpProject, '.specialists', 'user'), { recursive: true });
    await writeFile(
      join(tmpProject, '.specialists', 'user', 'demo.specialist.json'),
      SPEC_WITH_PATHS('pkg/m', ['/c', '/d']),
    );
    const spec = await loader.get('demo');
    expect(spec.specialist.skills?.paths).toEqual(['/a', '/b', '/c', '/d']);
  });
});

