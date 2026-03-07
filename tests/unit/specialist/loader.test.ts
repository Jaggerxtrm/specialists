// tests/unit/specialist/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { SpecialistLoader } from '../../../src/specialist/loader.js';

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

describe('SpecialistLoader', () => {
  let tempDir: string;
  let loader: SpecialistLoader;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'unitai-test-'));
    loader = new SpecialistLoader({ projectDir: tempDir });
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
});
