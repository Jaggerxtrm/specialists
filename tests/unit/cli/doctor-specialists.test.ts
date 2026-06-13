// tests/unit/cli/doctor-specialists.test.ts
// KAN-90 / unitAI-1gtou.14: sp doctor --specialists override-layer reporting.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';

// Force the loader to ignore the installed package's canonical-asset dir so each
// test sees ONLY the fixtures we write into tmpProject/config/specialists/.
vi.mock('../../../src/specialist/canonical-asset-resolver.js', () => ({
  resolveCanonicalAssetDir: () => null,
}));

const BASE_SPEC = (name: string, model: string | null) => JSON.stringify({
  specialist: {
    metadata: { name, version: '1.0.0', description: 'demo', category: 'test' },
    execution: { model, permission_required: 'READ_ONLY' },
    prompt: { task_template: 'Do $prompt' },
  },
});

describe('doctor --specialists  (KAN-90 override layer)', () => {
  let tmpProject: string;
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalXdg: string | undefined;
  let originalCwd: string;

  beforeEach(async () => {
    tmpProject = await mkdtemp(join(tmpdir(), 'doctor-overrides-proj-'));
    tmpHome = await mkdtemp(join(tmpdir(), 'doctor-overrides-home-'));
    mkdirSync(join(tmpProject, 'config', 'specialists'), { recursive: true });
    originalHome = process.env.HOME;
    originalXdg = process.env.XDG_CONFIG_HOME;
    originalCwd = process.cwd();
    process.env.HOME = tmpHome;
    delete process.env.XDG_CONFIG_HOME;
    process.chdir(tmpProject);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
    vi.restoreAllMocks();
    vi.resetModules();
    rmSync(tmpProject, { recursive: true, force: true });
    rmSync(tmpHome, { recursive: true, force: true });
  });

  async function runDoctorSpecialists(): Promise<string> {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => output.push(String(msg ?? '')));
    const { run } = await import('../../../src/cli/doctor.js');
    await run(['--specialists']);
    return output.join('\n');
  }

  function writeGlobalUserJson(content: Record<string, unknown>): void {
    const dir = join(tmpHome, '.config', 'specialists');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'user.json'), JSON.stringify(content));
  }

  it('reports "NOT present" when no global file exists', async () => {
    writeFileSync(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC('demo', 'pkg/m'));
    const out = await runDoctorSpecialists();
    expect(out).toMatch(/global user config NOT present/);
    expect(out).toContain('sp init --global');
  });

  it('reports clean coverage when all specialists have a model post-merge', async () => {
    writeFileSync(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC('demo', 'pkg/m'));
    writeGlobalUserJson({ demo: { execution: { model: 'glm/glm-5.1' } } });
    const out = await runDoctorSpecialists();
    expect(out).toMatch(/1\/1 specialists have a model configured/);
    expect(out).toContain('no blocked-field overrides detected');
  });

  it('fails when global file exists but a model is still null after merge', async () => {
    writeFileSync(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC('demo', null));
    // global file exists but doesn't supply demo's model
    writeGlobalUserJson({});
    const out = await runDoctorSpecialists();
    expect(out).toMatch(/0\/1 specialists have a model configured/);
    expect(out).toContain('missing: demo');
    expect(out).toContain('sp edit --global');
  });

  it('treats fresh install (no file + null models) as a notice, not a fail', async () => {
    writeFileSync(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC('demo', null));
    const out = await runDoctorSpecialists();
    expect(out).toMatch(/0\/1 specialists have a model configured/);
    expect(out).toContain('global override file not created yet');
  });

  it('reports strip-severity warnings when global config has a blocked field', async () => {
    writeFileSync(join(tmpProject, 'config', 'specialists', 'demo.specialist.json'), BASE_SPEC('demo', 'pkg/m'));
    writeGlobalUserJson({
      demo: { execution: { model: 'glm/glm-5.1', permission_required: 'HIGH' } },
    });
    const out = await runDoctorSpecialists();
    expect(out).toMatch(/blocked-field overrides STRIPPED/);
    expect(out).toContain('execution.permission_required');
  });
});
