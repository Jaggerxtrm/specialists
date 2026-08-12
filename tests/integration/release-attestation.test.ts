import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = path.resolve('scripts/generate-release-attestation.mjs');
const dirs: string[] = [];

afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'release-attestation-'));
  dirs.push(dir);
  const tarball = path.join(dir, 'package.tgz');
  const attestation = path.join(dir, 'attestation.json');
  await writeFile(tarball, 'deterministic tarball');
  await run('node', [script, tarball, attestation], { env: { ...process.env, PI_VERSION: 'pi 0.84.1' } });
  return { dir, tarball, attestation };
}

async function validate(tarball: string, attestation: string, env: Record<string, string | undefined> = {}) {
  try {
    await run('node', [script, '--validate', tarball, attestation], { env: { ...process.env, PI_VERSION: 'pi 0.84.1', ...env } });
    return { ok: true, error: '' };
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string };
    return { ok: false, error: `${e.stderr ?? ''}${e.stdout ?? ''}` };
  }
}

async function mutate(attestation: string, change: (value: any) => void) {
  const value = JSON.parse(await readFile(attestation, 'utf8'));
  change(value);
  await writeFile(attestation, JSON.stringify(value));
}

describe('release attestation validation refusals', () => {
  it.each([
    ['package name/version', (a: any) => { a.package.name = 'tampered'; }, 'package name/version mismatch'],
    ['source commit', (a: any) => { a.package.source_commit = 'wrong'; }, 'source commit mismatch'],
    ['git head', (a: any) => { a.package.git_head = 'wrong'; }, 'source commit mismatch'],
    ['fingerprints', (a: any) => { a.fingerprints.catalog_sha256 = 'wrong'; }, 'fingerprint mismatch'],
    ['Pi identity', (a: any) => { a.pi_runtime.version_or_range = 'pi other'; }, 'Pi identity mismatch'],
  ])('refuses %s', async (_name, change, message) => {
    const { tarball, attestation } = await fixture();
    await mutate(attestation, change);
    const result = await validate(tarball, attestation);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(message);
  });

  it('refuses tampered tarball hash', async () => {
    const { tarball, attestation } = await fixture();
    await writeFile(tarball, 'tampered');
    const result = await validate(tarball, attestation);
    expect(result.error).toContain('tarball SHA-256 mismatch');
  });

  it.each([
    ['missing', undefined, 'PI_VERSION unavailable'],
    ['unavailable', 'unavailable', 'PI_VERSION unavailable'],
  ])('refuses %s Pi identity', async (_name, piVersion, message) => {
    const { tarball, attestation } = await fixture();
    const result = await validate(tarball, attestation, { PI_VERSION: piVersion });
    expect(result.error).toContain(message);
  });

  it.each([[], ['--validate'], ['--validate', 'only-tarball']])('refuses malformed args: %j', async (...args) => {
    const result = await run('node', [script, ...args], { env: { ...process.env, PI_VERSION: 'pi 0.84.1' } }).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: String(e.stderr) }));
    expect(result.ok).toBe(false);
    if ('error' in result) expect(result.error).toContain('usage');
  });
});

describe('package-payload artifact contract', () => {
  it('validates attestation before upload and pins artifact refusal/configuration', async () => {
    const workflow = await readFile('.github/workflows/package-payload.yml', 'utf8');
    const validation = workflow.indexOf('EXPECTED_SOURCE_COMMIT=');
    const upload = workflow.indexOf('uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
    expect(validation).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(validation);
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toContain('actions: write');
    expect(workflow).toContain('path: /tmp/release-attestation.json');
    expect(workflow).toContain('if-no-files-found: error');
    expect(workflow).toContain('retention-days: 90');
    expect(workflow).toContain('overwrite: false');
  });
});
