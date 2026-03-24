// tests/unit/specialist/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { rm } from 'node:fs/promises';
import { SpecialistLoader, checkStaleness, type SpecialistSummary } from '../../../src/specialist/loader.js';

const MINIMAL_YAML = (name: string) => `
specialist:
  metadata:
    name: ${name}
    version: 1.0.0
    description: Test specialist
    category: test
  execution:
    model: gemini
  prompt:
    task_template: Do $prompt`;

const CATEGORIZED_YAML = (name: string, category: string) => `
specialist:
  metadata:
    name: ${name}
    version: 1.0.0
    description: Test specialist
    category: ${category}
  execution:
    model: gemini
  prompt:
    task_template: Do $prompt`;

const YAML_WITH_SKILLS_PATHS = (name: string, paths: string[]) => `
specialist:
  metadata:
    name: ${name}
    version: 1.0.0
    description: Test specialist
    category: test
  execution:
    model: gemini
  prompt:
    task_template: Do $prompt
  skills:
    paths:
${paths.map(p => `      - ${p}`).join('\n')}`;

const YAML_WITH_VALIDATION = (name: string, filestoWatch: string[], updated: string, staleThresholdDays?: number) => `
specialist:
  metadata:
    name: ${name}
    version: 1.0.0
    description: Test specialist
    category: test
    updated: "${updated}"
  execution:
    model: gemini
  prompt:
    task_template: Do $prompt
  validation:
    files_to_watch:
${filestoWatch.map(f => `      - ${f}`).join('\n')}${staleThresholdDays !== undefined ? `\n    stale_threshold_days: ${staleThresholdDays}` : ''}`;

describe('SpecialistLoader', () => {
  let tempDir: string;
  let loader: SpecialistLoader;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-test-'));
    loader = new SpecialistLoader({ projectDir: tempDir, userDir: tempDir, systemDir: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('discovers specialists in project specialists/ dir', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'my-spec.specialist.yaml'), MINIMAL_YAML('my-spec'));
    const list = await loader.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('my-spec');
    expect(list[0].scope).toBe('project');
  });

  it('returns empty list when no specialists', async () => {
    const list = await loader.list();
    expect(list).toHaveLength(0);
  });

  it('loads and caches a specialist by name', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'my-spec.specialist.yaml'), MINIMAL_YAML('my-spec'));
    const spec = await loader.get('my-spec');
    expect(spec.specialist.metadata.name).toBe('my-spec');
    const spec2 = await loader.get('my-spec');
    expect(spec2).toBe(spec); // same reference — cache hit
  });

  it('throws when specialist not found', async () => {
    await expect(loader.get('nonexistent')).rejects.toThrow('Specialist not found: nonexistent');
  });

  it('warns to stderr and skips invalid YAML instead of silently dropping', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'bad.specialist.yaml'), 'not: valid: specialist: yaml: at all');
    await writeFile(join(dir, 'good.specialist.yaml'), MINIMAL_YAML('good'));

    const stderrChunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: any, ...args: any[]) => {
      stderrChunks.push(String(chunk));
      return orig(chunk, ...args);
    };

    const list = await loader.list();

    process.stderr.write = orig;

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('good');
    expect(stderrChunks.join('')).toMatch(/skipping.*bad\.specialist\.yaml/);
  });

  it('project-level specialist overrides user-level (same name)', async () => {
    const projectDir = join(tempDir, 'specialists');
    const userDir = join(tempDir, 'user-specialists');
    await mkdir(projectDir, { recursive: true });
    await mkdir(userDir, { recursive: true });
    await writeFile(join(projectDir, 'shared.specialist.yaml'), MINIMAL_YAML('shared'));
    await writeFile(join(userDir, 'shared.specialist.yaml'), MINIMAL_YAML('shared'));
    loader = new SpecialistLoader({ projectDir: tempDir, userDir });
    const list = await loader.list();
    expect(list.filter(s => s.name === 'shared')).toHaveLength(1); // deduped
    expect(list.find(s => s.name === 'shared')!.scope).toBe('project'); // project wins
  });

  // --- Coverage gaps ---

  it('discovers specialists in .claude/specialists/ dir with project scope', async () => {
    const dir = join(tempDir, '.claude', 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'claude-spec.specialist.yaml'), MINIMAL_YAML('claude-spec'));
    const list = await loader.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('claude-spec');
    expect(list[0].scope).toBe('project');
  });

  it('discovers specialists in .agent-forge/specialists/ dir with project scope', async () => {
    const dir = join(tempDir, '.agent-forge', 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'forge-spec.specialist.yaml'), MINIMAL_YAML('forge-spec'));
    const list = await loader.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('forge-spec');
    expect(list[0].scope).toBe('project');
  });

  it('discovers specialists in user dir with user scope', async () => {
    const userDir = join(tempDir, 'user-scope');
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, 'user-spec.specialist.yaml'), MINIMAL_YAML('user-spec'));
    loader = new SpecialistLoader({ projectDir: join(tempDir, 'nonexistent'), userDir });
    const list = await loader.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('user-spec');
    expect(list[0].scope).toBe('user');
  });

  it('filters list() by category', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'arch.specialist.yaml'), CATEGORIZED_YAML('arch', 'architecture'));
    await writeFile(join(dir, 'tester.specialist.yaml'), CATEGORIZED_YAML('tester', 'testing'));
    const list = await loader.list('architecture');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('arch');
    expect(list[0].category).toBe('architecture');
  });

  it('list() returns all specialists when category filter matches none', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'arch.specialist.yaml'), CATEGORIZED_YAML('arch', 'architecture'));
    const list = await loader.list('nonexistent-category');
    expect(list).toHaveLength(0);
  });

  it('ignores files that do not end with .specialist.yaml', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'readme.md'), '# not a specialist');
    await writeFile(join(dir, 'config.yaml'), 'key: value');
    await writeFile(join(dir, 'my-spec.specialist.yaml'), MINIMAL_YAML('my-spec'));
    const list = await loader.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('my-spec');
  });

  it('invalidateCache() by name removes only that entry', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'spec-a.specialist.yaml'), MINIMAL_YAML('spec-a'));
    await writeFile(join(dir, 'spec-b.specialist.yaml'), MINIMAL_YAML('spec-b'));

    const a1 = await loader.get('spec-a');
    const b1 = await loader.get('spec-b');

    loader.invalidateCache('spec-a');

    const a2 = await loader.get('spec-a');
    const b2 = await loader.get('spec-b');

    expect(a2).not.toBe(a1); // cache was cleared for spec-a
    expect(b2).toBe(b1);     // spec-b still cached
  });

  it('invalidateCache() without name clears all cached entries', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'spec-a.specialist.yaml'), MINIMAL_YAML('spec-a'));
    await writeFile(join(dir, 'spec-b.specialist.yaml'), MINIMAL_YAML('spec-b'));

    const a1 = await loader.get('spec-a');
    const b1 = await loader.get('spec-b');

    loader.invalidateCache();

    const a2 = await loader.get('spec-a');
    const b2 = await loader.get('spec-b');

    expect(a2).not.toBe(a1);
    expect(b2).not.toBe(b1);
  });

  it('get() resolves ~/ prefixed skill paths to absolute home-relative paths', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'skills-spec.specialist.yaml'),
      YAML_WITH_SKILLS_PATHS('skills-spec', ['~/some/skill.md']),
    );
    const spec = await loader.get('skills-spec');
    const paths = spec.specialist.skills?.paths;
    expect(paths).toBeDefined();
    expect(paths![0]).toBe(join(homedir(), 'some/skill.md'));
    expect(paths![0]).not.toMatch(/^~/);
  });

  it('get() resolves ./ prefixed skill paths relative to the specialist file directory', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'skills-spec.specialist.yaml'),
      YAML_WITH_SKILLS_PATHS('skills-spec', ['./local-skill.md']),
    );
    const spec = await loader.get('skills-spec');
    const paths = spec.specialist.skills?.paths;
    expect(paths).toBeDefined();
    expect(paths![0]).toBe(join(dir, 'local-skill.md'));
    expect(paths![0]).not.toMatch(/^\.\//);
  });

  it('get() leaves absolute skill paths unchanged', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    const absPath = '/usr/local/share/skills/my-skill.md';
    await writeFile(
      join(dir, 'skills-spec.specialist.yaml'),
      YAML_WITH_SKILLS_PATHS('skills-spec', [absPath]),
    );
    const spec = await loader.get('skills-spec');
    const paths = spec.specialist.skills?.paths;
    expect(paths).toBeDefined();
    expect(paths![0]).toBe(absPath);
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
    scope: 'project',
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
